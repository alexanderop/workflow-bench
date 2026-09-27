import { spawn } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { Effect, Option, Schema } from 'effect'
import { Argument, Command, Flag } from 'effect/unstable/cli'
import { defaultProfile } from '../../packages/codex/auth.js'
import {
  taskIds,
  experimentIds,
  loadTask,
  loadExperiment,
} from '../../packages/core/catalog.js'
import {
  exists,
  readJson,
  readUnknownJson,
  root,
  writeJson,
} from '../../packages/core/io.js'
import {
  decode,
  Experiment,
  Id,
  normalizePlan,
} from '../../packages/core/model.js'
import { execute } from '../../packages/docker/process.js'
import { judgePlan } from '../../packages/judge/run.js'
import { localDoctor } from '../../packages/local/workspace.js'
import { benchmark } from '../../packages/runner/benchmark.js'
import {
  inventoryLocalCache,
  pruneLocalCache,
  withCacheMaintenanceLock,
} from '../../packages/runner/cache.js'
import {
  cancelPlan,
  planStatus,
  retryPlan,
  type ExperimentOverrides,
} from '../../packages/runner/control.js'
import {
  authConfig,
  createPlan,
  operation,
  plans,
  report,
  runPlan,
} from '../../packages/runner/experiment.js'
import { qualify } from '../../packages/runner/grade.js'
import { prepare } from '../../packages/runner/prepare.js'
import { installWorkflow } from '../../packages/runner/workflows.js'

const option = <A>(value: Option.Option<A>) => Option.getOrUndefined(value)
const optional = <A>(flag: Flag.Flag<A>) => flag.pipe(Flag.optional)
const mapped = <A>(name: string, parse: (value: string) => A) =>
  Flag.String(name).pipe(Flag.mapTryCatch(parse, String))
const id = (name: string) => mapped(name, (value) => decode(Id, value))
const ids = (name: string) =>
  optional(
    mapped(name, (value) => value.split(',').map((part) => decode(Id, part))),
  )
const positive = (name: string) =>
  optional(
    Flag.Int(name).pipe(
      Flag.mapTryCatch((value) => {
        if (value < 1) throw new Error(`${name} must be positive`)
        return value
      }, String),
    ),
  )
const repetitions = optional(
  Flag.Int('repetitions').pipe(
    Flag.mapTryCatch((value) => {
      if (value < 1 || value > 100)
        throw new Error('repetitions must be between 1 and 100')
      return value
    }, String),
  ),
)
const suite = optional(id('suite'))
const backend = Flag.Literals('backend', ['local', 'docker']).pipe(
  Flag.withDefault('local'),
)
const suiteSchema = Schema.Struct({
  tasks: Schema.Array(Id),
  experiments: Schema.Array(Id),
  repetitions: Schema.Number,
})

const workPath = (path: string) => resolve(path)
const print = (value: unknown) => console.log(JSON.stringify(value, null, 2))
const planAt = async (path: string) =>
  normalizePlan(await readUnknownJson(resolve(path)))

async function selection(config: {
  readonly task: Option.Option<ReadonlyArray<string>>
  readonly suite: Option.Option<string>
  readonly experiments: Option.Option<ReadonlyArray<string>>
  readonly repetitions: Option.Option<number>
}) {
  const selectedSuite = Option.isSome(config.suite)
    ? await readJson(
        join(root, 'suites', `${config.suite.value}.json`),
        suiteSchema,
      )
    : null
  return {
    tasks: option(config.task) ?? selectedSuite?.tasks ?? ['receipt-rounding'],
    experiments: option(config.experiments) ??
      selectedSuite?.experiments ?? ['plain-sol', 'pstack-sol'],
    repetitions: option(config.repetitions) ?? selectedSuite?.repetitions ?? 1,
  }
}

const command = <const Name extends string>(name: Name, description: string) =>
  Command.make(name).pipe(Command.withDescription(description))

const rootCommand = command(
  'workflow-bench',
  'Workflow Bench. Local, independently graded workflow experiments.',
).pipe(
  Command.withSharedFlags({
    work: Flag.String('work').pipe(Flag.withDefault(join(root, '.bench'))),
  }),
)

const doctor = Command.make('doctor', {}, () =>
  Effect.gen(function* () {
    const { work: raw } = yield* rootCommand
    const work = workPath(raw)
    yield* operation('doctor', async () => {
      const docker = await execute('docker', [
        'info',
        '--format',
        '{{.ServerVersion}}',
      ]).catch(() => null)
      print({
        node: process.version,
        docker: docker?.code === 0 ? docker.stdout.trim() : 'unavailable',
        local: await localDoctor(),
        localAuthFilePresent: await exists(join(defaultProfile, 'auth.json')),
        work,
        notice:
          'Presence is not an authentication or quota check. Images pin their own Codex version.',
      })
    })
  }),
).pipe(Command.withDescription('Check local and Docker prerequisites.'))

const list = Command.make('list', {}, () =>
  Effect.gen(function* () {
    const { work } = yield* rootCommand
    yield* operation('list', async () =>
      print({
        tasks: await Promise.all((await taskIds()).map(loadTask)),
        experiments: await Promise.all(
          (await experimentIds()).map(loadExperiment),
        ),
        plans: (await plans(workPath(work))).map((plan) => ({
          id: plan.id,
          cells: plan.cells.length,
        })),
      }),
    )
  }),
).pipe(Command.withDescription('List tasks, experiments, and plans as JSON.'))

const demo = Command.make('demo', { backend }, ({ backend }) =>
  Effect.gen(function* () {
    const { work: raw } = yield* rootCommand
    const work = workPath(raw)
    yield* operation('demo', () =>
      withCacheMaintenanceLock(work, async () => {
        await prepare(work, 'receipt-rounding', console.log, backend)
        const evidence = await qualify(work, 'receipt-rounding', backend)
        await writeJson(join(work, 'demo', 'qualification.json'), evidence)
        console.log(
          'Demo proved: broken base fails, reference passes. This is qualification evidence, not a workflow ranking. Run pnpm dev and open /results/.',
        )
      }),
    )
  }),
).pipe(Command.withDescription('Run local qualification without model calls.'))

const prepareCommand = Command.make(
  'prepare',
  { task: ids('task'), suite, backend },
  (config) =>
    Effect.gen(function* () {
      const { work: raw } = yield* rootCommand
      const work = workPath(raw)
      yield* operation('prepare', () =>
        withCacheMaintenanceLock(work, async () => {
          const selected = await selection({
            ...config,
            experiments: Option.none(),
            repetitions: Option.none(),
          })
          for (const task of selected.tasks)
            console.log(await prepare(work, task, console.log, config.backend))
        }),
      )
    }),
).pipe(Command.withDescription('Prepare selected task snapshots.'))

const qualifyCommand = Command.make(
  'qualify',
  { task: ids('task'), suite, backend },
  (config) =>
    Effect.gen(function* () {
      const { work: raw } = yield* rootCommand
      const work = workPath(raw)
      yield* operation('qualify', () =>
        withCacheMaintenanceLock(work, async () => {
          const selected = await selection({
            ...config,
            experiments: Option.none(),
            repetitions: Option.none(),
          })
          for (const task of selected.tasks) {
            await qualify(work, task, config.backend)
            console.log(`Qualified ${task}`)
          }
        }),
      )
    }),
).pipe(
  Command.withDescription('Prove the broken base fails and reference passes.'),
)

const plan = Command.make(
  'plan',
  {
    task: ids('task'),
    suite,
    experiments: ids('experiments'),
    repetitions,
    seed: Flag.Int('seed').pipe(
      Flag.mapTryCatch((value) => {
        if (!Number.isSafeInteger(value))
          throw new Error('seed must be a safe integer')
        return value
      }, String),
      Flag.withDefault(42),
    ),
    backend,
    model: optional(
      Flag.String('model').pipe(
        Flag.mapTryCatch((value) => {
          if (!value.trim()) throw new Error('model must not be empty')
          return value
        }, String),
      ),
    ),
    reasoning: optional(
      Flag.Literals('reasoning', ['low', 'medium', 'high', 'xhigh']),
    ),
    timeout: positive('timeout'),
    maxThreads: positive('max-threads'),
    maxDepth: positive('max-depth'),
  },
  (config) =>
    Effect.gen(function* () {
      const { work: raw } = yield* rootCommand
      const work = workPath(raw)
      yield* operation('plan', () =>
        withCacheMaintenanceLock(work, async () => {
          const selected = await selection(config)
          const overrides: ExperimentOverrides = {
            ...(Option.isSome(config.model)
              ? { model: config.model.value }
              : {}),
            ...(Option.isSome(config.reasoning)
              ? {
                  reasoningEffort: decode(
                    Experiment.fields.reasoningEffort,
                    config.reasoning.value,
                  ),
                }
              : {}),
            ...(Option.isSome(config.timeout)
              ? { timeoutSeconds: config.timeout.value }
              : {}),
            ...(Option.isSome(config.maxThreads)
              ? { maxThreads: config.maxThreads.value }
              : {}),
            ...(Option.isSome(config.maxDepth)
              ? { maxDepth: config.maxDepth.value }
              : {}),
          }
          const created = await createPlan(
            work,
            selected.tasks,
            selected.experiments,
            selected.repetitions,
            config.seed,
            config.backend,
            overrides,
          )
          console.log(
            `${created.cells.length} attempts planned. No model calls made.\n${join(work, 'plans', created.id, 'plan.json')}`,
          )
        }),
      )
    }),
).pipe(Command.withDescription('Create a frozen experiment plan.'))

const run = Command.make('run', { plan: Flag.String('plan') }, ({ plan }) =>
  Effect.gen(function* () {
    const { work: raw } = yield* rootCommand
    const work = workPath(raw)
    const selected = yield* operation('read plan', () => planAt(plan))
    const controller = new AbortController()
    const cancel = () => {
      console.log('Cancellation requested; retaining partial evidence.')
      controller.abort()
    }
    process.on('SIGINT', cancel)
    process.on('SIGTERM', cancel)
    try {
      yield* operation('run plan', () =>
        withCacheMaintenanceLock(work, () =>
          Effect.runPromise(runPlan(work, selected, controller.signal)),
        ),
      )
    } finally {
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
    }
  }),
).pipe(Command.withDescription('Run a frozen plan with real Codex calls.'))

const judge = Command.make('judge', { plan: Flag.String('plan') }, ({ plan }) =>
  Effect.gen(function* () {
    const { work: raw } = yield* rootCommand
    const work = workPath(raw)
    const selected = yield* operation('read plan', () => planAt(plan))
    const auth = yield* authConfig
    yield* operation('judge plan', () =>
      withCacheMaintenanceLock(work, () => judgePlan(work, selected, auth)),
    )
  }),
).pipe(Command.withDescription('Run blind pairwise LLM code review.'))

const status = Command.make(
  'status',
  { plan: Flag.String('plan') },
  ({ plan }) =>
    Effect.gen(function* () {
      const { work } = yield* rootCommand
      yield* operation('status', async () =>
        print(await planStatus(workPath(work), await planAt(plan))),
      )
    }),
).pipe(Command.withDescription('Show plan progress as JSON.'))

const cancel = Command.make(
  'cancel',
  { plan: Flag.String('plan') },
  ({ plan }) =>
    Effect.gen(function* () {
      const { work } = yield* rootCommand
      yield* operation('cancel', async () =>
        print(await cancelPlan(workPath(work), await planAt(plan))),
      )
    }),
).pipe(Command.withDescription('Stop an active attempt and retain evidence.'))

const retry = Command.make(
  'retry',
  { plan: Flag.String('plan'), cell: ids('cell') },
  ({ plan, cell }) =>
    Effect.gen(function* () {
      const { work: raw } = yield* rootCommand
      const work = workPath(raw)
      yield* operation('retry', () =>
        withCacheMaintenanceLock(work, async () => {
          const result = await retryPlan(work, await planAt(plan), option(cell))
          print(result)
          if ('id' in result)
            console.log(join(work, 'plans', result.id, 'plan.json'))
        }),
      )
    }),
).pipe(Command.withDescription('Create a linked plan for failed attempts.'))

const reportCommand = Command.make(
  'report',
  { plan: Flag.String('plan') },
  ({ plan }) =>
    Effect.gen(function* () {
      const { work } = yield* rootCommand
      yield* operation('report', async () => {
        const result = await report(workPath(work), await planAt(plan))
        print({ summary: result.summary, comparisons: result.comparisons })
      })
    }),
).pipe(Command.withDescription('Report results for a frozen plan.'))

const benchmarkCommand = Command.make(
  'benchmark',
  {
    task: optional(id('task')),
    repetitions,
    output: optional(Flag.String('output')),
  },
  ({ task, repetitions, output }) =>
    Effect.gen(function* () {
      const { work: raw } = yield* rootCommand
      const work = workPath(raw)
      yield* operation('benchmark', () =>
        withCacheMaintenanceLock(work, async () => {
          const result = await benchmark(work, {
            ...(Option.isSome(task) ? { taskId: task.value } : {}),
            repetitions: option(repetitions) ?? 3,
            ...(Option.isSome(output) ? { output: output.value } : {}),
          })
          print({
            output: result.output,
            medians: result.medians,
            limitations: result.limitations,
          })
          if (result.samples.some((sample) => sample.status !== 'passed'))
            process.exitCode = 1
        }),
      )
    }),
).pipe(
  Command.withDescription(
    'Run paired native and Docker timings without model calls.',
  ),
)

const workflow = Command.make(
  'workflow',
  {
    id: Argument.String('id').pipe(
      Argument.mapTryCatch((value) => decode(Id, value), String),
    ),
    source: optional(Flag.String('source')),
  },
  ({ id, source }) =>
    Effect.gen(function* () {
      const { work: raw } = yield* rootCommand
      const work = workPath(raw)
      yield* operation('workflow', () =>
        withCacheMaintenanceLock(work, async () =>
          console.log(await installWorkflow(work, id, option(source))),
        ),
      )
    }),
).pipe(Command.withDescription('Fetch or export a pinned workflow.'))

const auth = command('auth', 'Manage Codex authentication.').pipe(
  Command.withSubcommands([
    Command.make('login', {}, () =>
      operation('auth login', async () => {
        await mkdir(defaultProfile, { recursive: true, mode: 0o700 })
        await new Promise<void>((done, reject) => {
          const child = spawn('codex', ['login', '--device-auth'], {
            stdio: 'inherit',
            env: { ...process.env, CODEX_HOME: defaultProfile },
          })
          child.on('error', reject)
          child.on('exit', (code) =>
            code === 0 ? done() : reject(new Error(`Login exited ${code}`)),
          )
        })
        console.log(
          `Local Codex subscription credentials stored outside this repository in ${defaultProfile}`,
        )
      }),
    ).pipe(
      Command.withDescription('Store a local Codex subscription profile.'),
    ),
  ]),
)

const cache = command('cache', 'Inspect and prune local snapshots.').pipe(
  Command.withSubcommands([
    Command.make('list', {}, () =>
      Effect.gen(function* () {
        const { work } = yield* rootCommand
        yield* operation('cache list', async () =>
          print(await inventoryLocalCache(workPath(work))),
        )
      }),
    ).pipe(
      Command.withDescription('List snapshot sizes and protection reasons.'),
    ),
    Command.make(
      'prune',
      { apply: Flag.Boolean('apply').pipe(Flag.withDefault(false)) },
      ({ apply }) =>
        Effect.gen(function* () {
          const { work } = yield* rootCommand
          yield* operation('cache prune', async () =>
            print(await pruneLocalCache(workPath(work), { apply })),
          )
        }),
    ).pipe(
      Command.withDescription('Preview or apply orphan snapshot deletion.'),
    ),
  ]),
)

const ui = Command.make('ui', {}, () =>
  Effect.gen(function* () {
    const { work } = yield* rootCommand
    yield* operation(
      'ui',
      () =>
        new Promise<void>((done, reject) => {
          const child = spawn('pnpm', ['dev'], {
            cwd: root,
            stdio: 'inherit',
            env: { ...process.env, BENCH_WORK: workPath(work) },
          })
          child.on('error', reject)
          child.on('exit', (code) =>
            code === 0 ? done() : reject(new Error(`UI exited ${code}`)),
          )
        }),
    )
  }),
).pipe(Command.withDescription('Open the local guide and results.'))

export const cli = rootCommand.pipe(
  Command.withSubcommands([
    doctor,
    list,
    demo,
    prepareCommand,
    qualifyCommand,
    plan,
    run,
    judge,
    reportCommand,
    status,
    cancel,
    retry,
    cache,
    benchmarkCommand,
    workflow,
    auth,
    ui,
  ]),
)

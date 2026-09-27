import { parseArgs } from 'node:util'
import { join, resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { Effect, Schema } from 'effect'
import {
  taskIds,
  experimentIds,
  loadTask,
  loadExperiment,
} from '../../packages/core/catalog.js'
import {
  Id,
  Experiment,
  decode,
  normalizePlan,
} from '../../packages/core/model.js'
import {
  planStatus,
  cancelPlan,
  retryPlan,
  type ExperimentOverrides,
} from '../../packages/runner/control.js'
import {
  inventoryLocalCache,
  pruneLocalCache,
  withCacheMaintenanceLock,
} from '../../packages/runner/cache.js'
import { benchmark } from '../../packages/runner/benchmark.js'
import {
  exists,
  root,
  readJson,
  writeJson,
  message,
  readUnknownJson,
} from '../../packages/core/io.js'
import { prepare } from '../../packages/runner/prepare.js'
import { qualify } from '../../packages/runner/grade.js'
import {
  createPlan,
  runPlan,
  report,
  plans,
  operation,
} from '../../packages/runner/experiment.js'
import { installWorkflow } from '../../packages/runner/workflows.js'
import { judgePlan } from '../../packages/judge/run.js'
import { authConfig } from '../../packages/runner/experiment.js'
import { defaultProfile } from '../../packages/codex/auth.js'
import { execute } from '../../packages/docker/process.js'
import { localDoctor } from '../../packages/local/workspace.js'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    work: { type: 'string' },
    task: { type: 'string' },
    suite: { type: 'string' },
    experiments: { type: 'string' },
    repetitions: { type: 'string' },
    seed: { type: 'string' },
    plan: { type: 'string' },
    source: { type: 'string' },
    help: { type: 'boolean' },
    backend: { type: 'string' },
    model: { type: 'string' },
    reasoning: { type: 'string' },
    timeout: { type: 'string' },
    'max-threads': { type: 'string' },
    'max-depth': { type: 'string' },
    cell: { type: 'string' },
    apply: { type: 'boolean' },
    output: { type: 'string' },
  },
})
const command = positionals[0] ?? 'help'
const leasedCommands = new Set([
  'prepare',
  'qualify',
  'plan',
  'demo',
  'retry',
  'benchmark',
  'workflow',
])
function withWorkLock<A>(use: () => Promise<A>) {
  return leasedCommands.has(command)
    ? withCacheMaintenanceLock(work, use)
    : use()
}
const work = resolve(values.work ?? join(root, '.bench'))
const backend =
  values.backend === undefined || values.backend === 'local'
    ? 'local'
    : values.backend === 'docker'
      ? 'docker'
      : (() => {
          throw new Error('--backend must be local or docker')
        })()
const suiteSchema = Schema.Struct({
  tasks: Schema.Array(Id),
  experiments: Schema.Array(Id),
  repetitions: Schema.Number,
})
async function selection() {
  const suite = values.suite
    ? await readJson(
        join(root, 'suites', `${decode(Id, values.suite)}.json`),
        suiteSchema,
      )
    : null
  return {
    tasks: values.task
      ? values.task.split(',').map((id) => decode(Id, id))
      : (suite?.tasks ?? ['receipt-rounding']),
    experiments: values.experiments?.split(',') ??
      suite?.experiments ?? ['plain-sol', 'pstack-sol'],
    repetitions: Number(values.repetitions ?? suite?.repetitions ?? 1),
  }
}
async function selectedPlan() {
  if (!values.plan) throw new Error('Supply --plan <path-to-plan.json>')
  return normalizePlan(await readUnknownJson(resolve(values.plan)))
}
const help = `Workflow Bench — local, independently graded workflow experiments

  pnpm bench doctor
  pnpm bench list
  pnpm bench demo                     Local qualification, no model calls
  pnpm bench auth login               Local Codex subscription profile
  pnpm bench workflow pstack          Fetch pinned workflow
  pnpm bench prepare --suite smoke
  pnpm bench qualify --suite smoke
  pnpm bench plan --suite smoke --repetitions 3
  pnpm bench run --plan <path>         Makes real Codex calls
  pnpm bench judge --plan <path>       Blind pairwise LLM code review; real calls
  pnpm bench report --plan <path>
  pnpm bench status --plan <path>      Progress and failure details as JSON
  pnpm bench cancel --plan <path>      Stop active attempt; retain evidence
  pnpm bench retry --plan <path>       New linked plan for failed/interrupted attempts
  pnpm bench cache list               Snapshot sizes and protection reasons
  pnpm bench cache prune              Preview orphan snapshot deletion
  pnpm bench cache prune --apply      Delete only unreferenced snapshots
  pnpm bench benchmark --repetitions 3  Paired native/Docker timings; no model calls
  pnpm bench ui                       Open the local guide and results

Options: --work <directory>, --task <id,id>, --experiments <id,id>,
         --suite <name>, --repetitions <n>, --seed <integer>,
         --backend <local|docker> (local default for prepare/qualify/plan/demo)
Plan overrides: --model <name> --reasoning <low|medium|high|xhigh>
                --timeout <seconds> --max-threads <n> --max-depth <n>
Retry selection: --cell <id,id>. Benchmark: --task <id> --output <new-json-path>.
Workflow pinning: --source <local-git-checkout> exports its pinned commit.
Run is serial and resumable. Completed failures are never silently retried.
Set BENCH_AUTH_FILE to select a different file-backed subscription profile.
Set BENCH_WORK to select the report directory when using pnpm dev/build.
`
const program = Effect.gen(function* () {
  if (values.help || command === 'help') {
    console.log(help)
    return
  }
  if (
    command !== 'plan' &&
    ['model', 'reasoning', 'timeout', 'max-threads', 'max-depth'].some(
      (key) => values[key as keyof typeof values] !== undefined,
    )
  )
    throw new Error(
      'Model and execution overrides apply only to plan; run uses frozen settings',
    )
  if (values.model !== undefined && !values.model.trim())
    throw new Error('Model must not be empty')
  if (
    values.backend !== undefined &&
    !['prepare', 'qualify', 'plan', 'demo'].includes(command)
  )
    throw new Error(
      '--backend applies to prepare, qualify, plan and demo; other commands use frozen or paired backends',
    )
  if (command === 'judge') {
    const plan = yield* operation('read plan', selectedPlan)
    const auth = yield* authConfig
    yield* operation('judge plan', () =>
      withCacheMaintenanceLock(work, () => judgePlan(work, plan, auth)),
    )
    return
  }
  if (command === 'run') {
    const plan = yield* operation('read plan', selectedPlan)
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
          Effect.runPromise(runPlan(work, plan, controller.signal)),
        ),
      )
    } finally {
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
    }
    return
  }
  yield* operation(command, () =>
    withWorkLock(async () => {
      if (command === 'status' || command === 'cancel' || command === 'retry') {
        const plan = await selectedPlan()
        const result =
          command === 'status'
            ? await planStatus(work, plan)
            : command === 'cancel'
              ? await cancelPlan(work, plan)
              : await retryPlan(work, plan, values.cell?.split(','))
        console.log(JSON.stringify(result, null, 2))
        if (command === 'retry' && 'id' in result)
          console.log(join(work, 'plans', result.id, 'plan.json'))
        return
      }
      if (command === 'cache') {
        if (!['list', 'prune'].includes(positionals[1] ?? ''))
          throw new Error('Use cache list or cache prune [--apply]')
        console.log(
          JSON.stringify(
            positionals[1] === 'list'
              ? await inventoryLocalCache(work)
              : await pruneLocalCache(work, { apply: values.apply ?? false }),
            null,
            2,
          ),
        )
        return
      }
      if (command === 'benchmark') {
        const result = await benchmark(work, {
          ...(values.task === undefined ? {} : { taskId: values.task }),
          repetitions: Number(values.repetitions ?? 3),
          ...(values.output === undefined ? {} : { output: values.output }),
        })
        console.log(
          JSON.stringify(
            {
              output: result.output,
              medians: result.medians,
              limitations: result.limitations,
            },
            null,
            2,
          ),
        )
        if (result.samples.some((sample) => sample.status !== 'passed'))
          process.exitCode = 1
        return
      }
      if (command === 'doctor') {
        const docker = await execute('docker', [
          'info',
          '--format',
          '{{.ServerVersion}}',
        ]).catch(() => null)
        const local = await localDoctor()
        console.log(
          JSON.stringify(
            {
              node: process.version,
              docker: docker?.code === 0 ? docker.stdout.trim() : 'unavailable',
              local,
              localAuthFilePresent: await exists(
                join(defaultProfile, 'auth.json'),
              ),
              work,
              notice:
                'Presence is not an authentication or quota check. Images pin their own Codex version.',
            },
            null,
            2,
          ),
        )
        return
      }
      if (command === 'list') {
        console.log(
          JSON.stringify(
            {
              tasks: await Promise.all((await taskIds()).map(loadTask)),
              experiments: await Promise.all(
                (await experimentIds()).map(loadExperiment),
              ),
              plans: (await plans(work)).map((p) => ({
                id: p.id,
                cells: p.cells.length,
              })),
            },
            null,
            2,
          ),
        )
        return
      }
      if (command === 'auth' && positionals[1] === 'login') {
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
        return
      }
      if (command === 'workflow') {
        const id = decode(Id, positionals[1])
        console.log(await installWorkflow(work, id, values.source))
        return
      }
      if (command === 'ui') {
        await new Promise<void>((done, reject) => {
          const child = spawn('pnpm', ['dev'], {
            cwd: root,
            stdio: 'inherit',
            env: { ...process.env, BENCH_WORK: work },
          })
          child.on('error', reject)
          child.on('exit', (code) =>
            code === 0 ? done() : reject(new Error(`UI exited ${code}`)),
          )
        })
        return
      }
      if (command === 'report') {
        const plan = await selectedPlan()
        const result = await report(work, plan)
        console.log(
          JSON.stringify(
            { summary: result.summary, comparisons: result.comparisons },
            null,
            2,
          ),
        )
        return
      }
      if (command === 'demo') {
        await prepare(work, 'receipt-rounding', console.log, backend)
        const evidence = await qualify(work, 'receipt-rounding', backend)
        await writeJson(join(work, 'demo', 'qualification.json'), evidence)
        console.log(
          'Demo proved: broken base fails, reference passes. This is qualification evidence, not a workflow ranking. Run pnpm dev and open /results/.',
        )
        return
      }
      const selected = await selection()
      if (command === 'prepare') {
        for (const task of selected.tasks)
          console.log(await prepare(work, task, console.log, backend))
        return
      }
      if (command === 'qualify') {
        for (const task of selected.tasks) {
          await qualify(work, task, backend)
          console.log(`Qualified ${task}`)
        }
        return
      }
      if (command === 'plan') {
        const overrides: ExperimentOverrides = {
          ...(values.model === undefined ? {} : { model: values.model }),
          ...(values.reasoning === undefined
            ? {}
            : {
                reasoningEffort: decode(
                  Experiment.fields.reasoningEffort,
                  values.reasoning,
                ),
              }),
          ...(values.timeout === undefined
            ? {}
            : { timeoutSeconds: Number(values.timeout) }),
          ...(values['max-threads'] === undefined
            ? {}
            : { maxThreads: Number(values['max-threads']) }),
          ...(values['max-depth'] === undefined
            ? {}
            : { maxDepth: Number(values['max-depth']) }),
        }
        const plan = await createPlan(
          work,
          selected.tasks,
          selected.experiments,
          selected.repetitions,
          Number(values.seed ?? 42),
          backend,
          overrides,
        )
        console.log(
          `${plan.cells.length} attempts planned. No model calls made.\n${join(work, 'plans', plan.id, 'plan.json')}`,
        )
        return
      }
      throw new Error(`Unknown command: ${command}. Run pnpm bench --help`)
    }),
  )
})
try {
  await Effect.runPromise(program)
} catch (error) {
  console.error(message(error))
  process.exitCode = 1
}

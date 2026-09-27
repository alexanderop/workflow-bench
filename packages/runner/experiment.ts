import { mkdir, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Config, Effect, Schema } from 'effect'
import { loadExperiment, loadWorkflow } from '../core/catalog.js'
import {
  Cell,
  Experiment,
  LegacyQualification,
  Plan,
  Qualification,
  Result,
  decode,
  normalizePlan,
  normalizeResult,
  sameEnvironment,
} from '../core/model.js'
import {
  exists,
  hash,
  message,
  now,
  readUnknownJson,
  treeHash,
  writeJson,
} from '../core/io.js'
import {
  shuffled,
  summarize,
  compare,
  validateResults,
} from '../core/statistics.js'
import { currentPrepared, type Backend } from './prepare.js'
import { installWorkflow, workflowDirectory } from './workflows.js'
import { solve, type SolveOptions } from '../codex/solve.js'
import { defaultProfile } from '../codex/auth.js'
import { runLock, type ExperimentOverrides } from './control.js'

export class BenchmarkError extends Schema.TaggedError<BenchmarkError>()(
  'BenchmarkError',
  { operation: Schema.String, detail: Schema.String },
) {}
export const operation = Effect.fn('Benchmark.operation')(
  <A>(name: string, work: () => Promise<A>) =>
    Effect.tryPromise({
      try: work,
      catch: (e) => new BenchmarkError({ operation: name, detail: message(e) }),
    }),
)
export const authConfig = Config.String('BENCH_AUTH_FILE').pipe(
  Config.withDefault(join(defaultProfile, 'auth.json')),
)

export async function createPlan(
  work: string,
  taskIds: readonly string[],
  experimentIds: readonly string[],
  repetitions: number,
  seed: number,
  backend: Backend = 'local',
  overrides: ExperimentOverrides = {},
): Promise<Plan> {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100)
    throw new Error('Repetitions must be an integer from 1 to 100')
  if (!Number.isSafeInteger(seed)) throw new Error('Seed must be an integer')
  const experiments = await Promise.all(
    [...new Set(experimentIds)].map(async (id) =>
      decode(Experiment, { ...(await loadExperiment(id)), ...overrides }),
    ),
  )
  const cells: Cell[] = []
  for (const taskId of new Set(taskIds)) {
    const prepared = await currentPrepared(work, taskId, backend)
    const qualificationPath = join(
      work,
      'tasks',
      taskId,
      backend,
      'qualification.json',
    )
    const rawQualification = await readUnknownJson(
      (await exists(qualificationPath))
        ? qualificationPath
        : join(work, 'tasks', taskId, 'qualification.json'),
    )
    const qualified =
      typeof rawQualification === 'object' &&
      rawQualification !== null &&
      !('version' in rawQualification)
        ? (() => {
            const old = decode(LegacyQualification, rawQualification)
            return decode(Qualification, {
              ...old,
              version: 2,
              environment: { kind: 'docker', imageId: old.imageId },
            })
          })()
        : decode(Qualification, rawQualification)
    if (
      !qualified.qualified ||
      qualified.fingerprint !== prepared.fingerprint ||
      !sameEnvironment(qualified.environment, prepared.environment)
    )
      throw new Error(`Task ${taskId} must be qualified against current inputs`)
    for (const experiment of experiments) {
      const sourceHash = await installWorkflow(work, experiment.workflow)
      const workflowHash =
        sourceHash === null
          ? null
          : hash(
              sourceHash +
                JSON.stringify(await loadWorkflow(experiment.workflow)),
            )
      for (let repetition = 1; repetition <= repetitions; repetition++)
        cells.push({
          id: `${taskId}-${experiment.id}-r${repetition}`,
          taskId,
          experiment,
          repetition,
          fingerprint: prepared.fingerprint,
          environment: prepared.environment,
          workflowHash,
        })
    }
  }
  const plan: Plan = {
    version: 2,
    id: `plan-${randomUUID()}`,
    createdAt: now(),
    seed,
    cells: shuffled(cells, seed),
  }
  const validated = Schema.decodeUnknownSync(Plan)(plan)
  await writeJson(join(work, 'plans', plan.id, 'plan.json'), validated)
  return validated
}
export async function loadResults(work: string, plan: Plan): Promise<Result[]> {
  const results: Result[] = []
  for (const cell of plan.cells) {
    const path = join(
      work,
      'plans',
      plan.id,
      'attempts',
      cell.id,
      'result.json',
    )
    if (await exists(path))
      results.push(normalizeResult(await readUnknownJson(path)))
  }
  validateResults(plan, results)
  return results
}
export const runPlan = Effect.fn('Benchmark.runPlan')(function* (
  work: string,
  plan: Plan,
  signal?: AbortSignal,
  solveOptions: SolveOptions = {},
) {
  const authFile = yield* authConfig
  const lock = runLock(work, plan)
  yield* Effect.acquireUseRelease(
    operation('lock plan', () => mkdir(lock)),
    () =>
      operation('execute plan', async () => {
        const controller = new AbortController()
        const abort = () => controller.abort()
        signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) abort()
        const token = randomUUID(),
          startedAt = now()
        let polling = false
        const timer = setInterval(async () => {
          if (polling) return
          polling = true
          try {
            const path = join(lock, 'cancel.json')
            if (await exists(path)) {
              const request = await readUnknownJson(path)
              if (
                typeof request === 'object' &&
                request !== null &&
                'token' in request &&
                request.token === token
              )
                abort()
            }
          } catch (error) {
            console.error(`Cancellation check failed: ${message(error)}`)
          } finally {
            polling = false
          }
        }, 150)
        try {
          await writeJson(join(lock, 'state.json'), {
            token,
            pid: process.pid,
            startedAt,
            cellId: null,
          })
          const existing = await loadResults(work, plan)
          for (const cell of plan.cells) {
            if (controller.signal.aborted) break
            if (existing.some((r) => r.cellId === cell.id)) continue
            const attemptDirectory = join(
              work,
              'plans',
              plan.id,
              'attempts',
              cell.id,
            )
            if (await exists(attemptDirectory))
              throw new Error(
                `Interrupted attempt ${cell.id} has no result. Preserve its evidence and create a new plan; automatic retry would hide an attempt.`,
              )
            const prepared = await currentPrepared(
              work,
              cell.taskId,
              cell.environment.kind,
            )
            if (
              cell.fingerprint !== prepared.fingerprint ||
              !sameEnvironment(cell.environment, prepared.environment)
            )
              throw new Error('Plan inputs changed; create a new plan')
            if (cell.workflowHash !== null) {
              const digest = hash(
                (await treeHash(
                  workflowDirectory(work, cell.experiment.workflow),
                )) +
                  JSON.stringify(await loadWorkflow(cell.experiment.workflow)),
              )
              if (digest !== cell.workflowHash)
                throw new Error('Workflow inputs changed since planning')
            }
            console.log(`Running ${cell.id}`)
            if (controller.signal.aborted) break
            await writeJson(join(lock, 'state.json'), {
              token,
              pid: process.pid,
              startedAt,
              cellId: cell.id,
            })
            let result: Result
            try {
              result = await solve(work, plan.id, cell, prepared, authFile, {
                ...solveOptions,
                signal: controller.signal,
              })
            } catch (error) {
              result = {
                version: 2,
                planId: plan.id,
                cellId: cell.id,
                taskId: cell.taskId,
                experiment: cell.experiment,
                repetition: cell.repetition,
                fingerprint: cell.fingerprint,
                environment: cell.environment,
                workflowHash: cell.workflowHash,
                outcome: controller.signal.aborted
                  ? 'cancelled'
                  : /auth|credential/i.test(message(error))
                    ? 'auth_error'
                    : 'infrastructure_error',
                message: controller.signal.aborted
                  ? 'Cancelled by operator; partial evidence retained'
                  : message(error),
                startedAt: now(),
                durationMs: 0,
                candidateHash: null,
                activation:
                  cell.experiment.workflow === 'plain'
                    ? 'not_applicable'
                    : 'unknown',
                rootTokens: null,
                childTokens: null,
                completedChildren: 0,
                checks: [],
              }
            }
            await writeJson(join(attemptDirectory, 'result.json'), result)
            console.log(`${result.outcome}: ${result.message}`)
            if (['auth_error', 'rate_limited'].includes(result.outcome)) break
          }
          return report(work, plan)
        } finally {
          clearInterval(timer)
          signal?.removeEventListener('abort', abort)
        }
      }),
    () => Effect.promise(() => rm(lock, { recursive: true, force: true })),
  )
})
export async function report(work: string, plan: Plan) {
  const results = await loadResults(work, plan),
    summary = summarize(plan, results)
  const baseline = summary.find(
    (s) =>
      plan.cells.find((c) => c.experiment.id === s.id)?.experiment.workflow ===
      'plain',
  )?.id
  const comparisons = baseline
    ? summary
        .filter((s) => s.id !== baseline)
        .map((s) => compare(plan, results, baseline, s.id))
    : []
  const result = { plan, results, summary, comparisons }
  await writeJson(join(work, 'plans', plan.id, 'report.json'), result)
  return result
}
export async function plans(work: string) {
  if (!(await exists(join(work, 'plans')))) return []
  const entries = await readdir(join(work, 'plans'), { withFileTypes: true })
  return Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map(async (e) =>
        normalizePlan(
          await readUnknownJson(join(work, 'plans', e.name, 'plan.json')),
        ),
      ),
  )
}

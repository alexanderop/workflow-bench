import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { writeFile, rename, rm } from 'node:fs/promises'
import { Schema } from 'effect'
import { Id, Plan, decode, type Experiment } from '../core/model.js'
import { exists, now, readJson, writeJson } from '../core/io.js'
import { loadResults } from './experiment.js'

export const RunState = Schema.Struct({
  token: Schema.String,
  pid: Schema.Number,
  startedAt: Schema.String,
  cellId: Schema.NullOr(Id),
})
export const runLock = (work: string, plan: Plan) =>
  join(work, 'plans', plan.id, '.run-lock')
export async function activeRun(work: string, plan: Plan) {
  const path = join(runLock(work, plan), 'state.json')
  if (!(await exists(path))) return null
  const state = await readJson(path, RunState)
  let alive = true
  try {
    process.kill(state.pid, 0)
  } catch {
    alive = false
  }
  return { ...state, alive }
}
export async function planStatus(work: string, plan: Plan) {
  const results = await loadResults(work, plan)
  const active = await activeRun(work, plan)
  const cells = await Promise.all(
    plan.cells.map(async (cell) => {
      const result = results.find((r) => r.cellId === cell.id)
      const evidence = await exists(
        join(work, 'plans', plan.id, 'attempts', cell.id),
      )
      return {
        cellId: cell.id,
        task: cell.taskId,
        experiment: cell.experiment.id,
        state:
          result?.outcome ??
          (active?.alive && active.cellId === cell.id
            ? 'running'
            : evidence
              ? 'interrupted'
              : 'pending'),
        message: result?.message ?? null,
        durationMs: result?.durationMs ?? null,
      }
    }),
  )
  return {
    planId: plan.id,
    retryOf: plan.retryOf ?? null,
    active,
    completed: results.length,
    planned: plan.cells.length,
    cells,
  }
}
export async function cancelPlan(work: string, plan: Plan) {
  const active = await activeRun(work, plan)
  if (!active?.alive)
    throw new Error(
      'No active runner for this plan; retained interrupted evidence can be retried in a new plan',
    )
  const temporary = join(runLock(work, plan), `cancel-${randomUUID()}.tmp`)
  try {
    await writeFile(
      temporary,
      JSON.stringify({ token: active.token, requestedAt: now() }),
      { flag: 'wx', mode: 0o600 },
    )
    await rename(temporary, join(runLock(work, plan), 'cancel.json'))
  } finally {
    await rm(temporary, { force: true })
  }
  return { planId: plan.id, cancellationRequested: true, cellId: active.cellId }
}
export async function retryPlan(
  work: string,
  plan: Plan,
  cellIds?: readonly string[],
) {
  if (await exists(runLock(work, plan)))
    throw new Error(
      'Cannot retry a locked plan; stop its runner first (stale locks require operator inspection)',
    )
  const status = await planStatus(work, plan)
  const eligible = status.cells.filter(
    (c) => !['resolved', 'pending', 'running'].includes(c.state),
  )
  const selected = cellIds ?? eligible.map((c) => c.cellId)
  if (!selected.length)
    throw new Error('No unsuccessful or interrupted attempts to retry')
  if (
    new Set(selected).size !== selected.length ||
    selected.some((id) => !eligible.some((c) => c.cellId === id))
  )
    throw new Error(
      'Retry selection must contain distinct unsuccessful or interrupted cell IDs',
    )
  const retry = decode(Plan, {
    ...plan,
    id: `plan-${randomUUID()}`,
    createdAt: now(),
    cells: plan.cells.filter((c) => selected.includes(c.id)),
    retryOf: { planId: plan.id, cellIds: selected },
  })
  await writeJson(join(work, 'plans', retry.id, 'plan.json'), retry)
  return retry
}
export type ExperimentOverrides = Partial<
  Pick<
    Experiment,
    'model' | 'reasoningEffort' | 'timeoutSeconds' | 'maxThreads' | 'maxDepth'
  >
>

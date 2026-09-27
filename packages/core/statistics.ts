import { sameEnvironment, type Plan, type Result } from './model.js'

export function random(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
}
export function shuffled<A>(values: readonly A[], seed: number): A[] {
  const output = [...values],
    rng = random(seed)
  for (let i = output.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1)),
      a = output[i],
      b = output[j]
    if (a !== undefined && b !== undefined) {
      output[i] = b
      output[j] = a
    }
  }
  return output
}
export const evaluated = (r: Result) =>
  ['resolved', 'unresolved', 'timeout'].includes(r.outcome)
export function validateResults(plan: Plan, results: readonly Result[]) {
  if (
    new Set(plan.cells.map((c) => c.id)).size !== plan.cells.length ||
    new Set(
      plan.cells.map((c) => `${c.taskId}/${c.experiment.id}/${c.repetition}`),
    ).size !== plan.cells.length
  )
    throw new Error('Duplicate planned cell')
  const definitions = new Map<string, string>()
  for (const cell of plan.cells) {
    const definition = JSON.stringify(cell.experiment)
    if (
      definitions.has(cell.experiment.id) &&
      definitions.get(cell.experiment.id) !== definition
    )
      throw new Error(
        'Experiment identity contains inconsistent configurations',
      )
    definitions.set(cell.experiment.id, definition)
  }
  const seen = new Set<string>()
  for (const r of results) {
    const cell = plan.cells.find((c) => c.id === r.cellId)
    if (
      !cell ||
      seen.has(r.cellId) ||
      r.planId !== plan.id ||
      r.taskId !== cell.taskId ||
      r.repetition !== cell.repetition ||
      r.fingerprint !== cell.fingerprint ||
      !sameEnvironment(r.environment, cell.environment) ||
      r.workflowHash !== cell.workflowHash ||
      JSON.stringify(r.experiment) !== JSON.stringify(cell.experiment)
    )
      throw new Error(`Mismatched or duplicate result: ${r.cellId}`)
    seen.add(r.cellId)
  }
}
export function summarize(plan: Plan, results: readonly Result[]) {
  validateResults(plan, results)
  return [...new Set(plan.cells.map((c) => c.experiment.id))].map((id) => {
    const cells = plan.cells.filter((c) => c.experiment.id === id)
    const rows = results.filter((r) => r.experiment.id === id)
    const scored = rows.filter(evaluated)
    const resolved = scored.filter((r) => r.outcome === 'resolved').length
    return {
      id,
      planned: cells.length,
      completed: rows.length,
      missing: cells.length - rows.length,
      evaluated: scored.length,
      resolved,
      errors: rows.length - scored.length,
      rate: scored.length ? resolved / scored.length : null,
      coverage: rows.length / cells.length,
      medianMs: median(scored.map((r) => r.durationMs)),
    }
  })
}
export function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return null
  const lo = sorted[Math.floor((sorted.length - 1) / 2)],
    hi = sorted[Math.floor(sorted.length / 2)]
  return lo === undefined || hi === undefined ? null : (lo + hi) / 2
}
export function compare(
  plan: Plan,
  results: readonly Result[],
  baseline: string,
  treatment: string,
) {
  validateResults(plan, results)
  const groups = new Map<string, number[]>()
  let paired = 0,
    excluded = 0
  for (const cell of plan.cells.filter((c) => c.experiment.id === baseline)) {
    const other = plan.cells.find(
      (c) =>
        c.taskId === cell.taskId &&
        c.repetition === cell.repetition &&
        c.experiment.id === treatment,
    )
    const a = results.find((r) => r.cellId === cell.id),
      b = results.find((r) => r.cellId === other?.id)
    const comparable =
      other &&
      cell.fingerprint === other.fingerprint &&
      sameEnvironment(cell.environment, other.environment) &&
      cell.experiment.model === other.experiment.model &&
      cell.experiment.reasoningEffort === other.experiment.reasoningEffort &&
      cell.experiment.codexVersion === other.experiment.codexVersion &&
      cell.experiment.timeoutSeconds === other.experiment.timeoutSeconds &&
      cell.experiment.maxThreads === other.experiment.maxThreads &&
      cell.experiment.maxDepth === other.experiment.maxDepth
    if (!comparable || !a || !b || !evaluated(a) || !evaluated(b)) {
      excluded++
      continue
    }
    const values = groups.get(cell.taskId) ?? []
    values.push(
      Number(b.outcome === 'resolved') - Number(a.outcome === 'resolved'),
    )
    groups.set(cell.taskId, values)
    paired++
  }
  const means = [...groups.values()].map(
    (v) => v.reduce((a, b) => a + b, 0) / v.length,
  )
  const delta = means.length
    ? means.reduce((a, b) => a + b, 0) / means.length
    : null
  let interval: readonly [number, number] | null = null
  if (means.length >= 2) {
    const rng = random(841),
      draws: number[] = []
    for (let i = 0; i < 2000; i++) {
      let total = 0
      for (let j = 0; j < means.length; j++)
        total += means[Math.floor(rng() * means.length)] ?? 0
      draws.push(total / means.length)
    }
    draws.sort((a, b) => a - b)
    interval = [draws[50] ?? 0, draws[1949] ?? 0]
  }
  return {
    baseline,
    treatment,
    paired,
    excluded,
    tasks: means.length,
    delta,
    interval,
  }
}

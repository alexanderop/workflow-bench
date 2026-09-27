import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { format, resolveConfig } from 'prettier'
import { Plan, type Result } from '../packages/core/model.js'
import { readJson, root, now, writeJson } from '../packages/core/io.js'
import { loadResults } from '../packages/runner/experiment.js'
import {
  compare,
  evaluated,
  median,
  random,
  summarize,
} from '../packages/core/statistics.js'

// Keep the measured plans intact. This report pools disjoint tasks from two batches,
// checks their controls, and retains each original attempt's plan identity.
const planIds = [
  'plan-de0b5070-fcc2-40da-8487-0e81fe7df2a7',
  'plan-921a5f0f-fbc1-463b-8f1d-7a6b12372037',
]
const work = join(root, '.bench')
const rows: Result[] = []
const definitions = new Map<string, string>()
const workflowHashes = new Map<string, string | null>()
const taskIds = new Set<string>()
const batches = []
for (const id of planIds) {
  const plan = await readJson(join(work, 'plans', id, 'plan.json'), Plan)
  const results = await loadResults(work, plan)
  assert.equal(
    results.length,
    plan.cells.length,
    `${id}: finish all planned attempts before generating the final report`,
  )
  for (const task of new Set(plan.cells.map((c) => c.taskId))) {
    assert.ok(!taskIds.has(task), 'Do not double-weight a task across batches')
    taskIds.add(task)
  }
  for (const cell of plan.cells) {
    const id = cell.experiment.id
    const definition = JSON.stringify(cell.experiment)
    if (definitions.has(id))
      assert.equal(
        definitions.get(id),
        definition,
        'Experiment settings changed between batches',
      )
    if (workflowHashes.has(id))
      assert.equal(
        workflowHashes.get(id),
        cell.workflowHash,
        'Workflow snapshot changed between batches',
      )
    definitions.set(id, definition)
    workflowHashes.set(id, cell.workflowHash)
  }
  const paired = compare(plan, results, 'plain-sol', 'pstack-sol')
  assert.equal(
    paired.excluded,
    0,
    'Resolve or explicitly analyze missing/error pairs before pooling',
  )
  rows.push(...results)
  batches.push({
    planId: id,
    summary: summarize(plan, results),
    comparison: paired,
  })
}
assert.equal(taskIds.size, 6)
assert.equal(rows.length, 36)
const label = (id: string) =>
  id === 'plain-sol' ? 'Vanilla Codex' : 'pstack Poteto'
const rate = (xs: Result[]) =>
  xs.filter((r) => r.outcome === 'resolved').length / xs.length
const seconds = (ms: number | null) =>
  ms === null ? 'Unknown' : `${(ms / 1000).toFixed(1)}s`
const groups = [...taskIds].sort().map((taskId) => {
  const vanilla = rows.filter(
    (r) => r.taskId === taskId && r.experiment.id === 'plain-sol',
  )
  const pstack = rows.filter(
    (r) => r.taskId === taskId && r.experiment.id === 'pstack-sol',
  )
  assert.equal(vanilla.length, 3)
  assert.equal(pstack.length, 3)
  assert.ok([...vanilla, ...pstack].every(evaluated))
  return {
    taskId,
    vanillaResolved: vanilla.filter((r) => r.outcome === 'resolved').length,
    pstackResolved: pstack.filter((r) => r.outcome === 'resolved').length,
    vanillaMedianMs: median(vanilla.map((r) => r.durationMs)),
    pstackMedianMs: median(pstack.map((r) => r.durationMs)),
    delta: rate(pstack) - rate(vanilla),
  }
})
const summary = ['plain-sol', 'pstack-sol'].map((id) => {
  const values = rows.filter((r) => r.experiment.id === id)
  return {
    id,
    attempts: values.length,
    resolved: values.filter((r) => r.outcome === 'resolved').length,
    unresolved: values.filter((r) => r.outcome === 'unresolved').length,
    timeouts: values.filter((r) => r.outcome === 'timeout').length,
    medianMs: median(values.map((r) => r.durationMs)),
    rate: rate(values),
  }
})
const vanillaSummary = summary.find((s) => s.id === 'plain-sol')!
const pstackSummary = summary.find((s) => s.id === 'pstack-sol')!
const delta = groups.reduce((n, g) => n + g.delta, 0) / groups.length
const rng = random(841)
const draws = Array.from(
  { length: 2000 },
  () =>
    Array.from(
      { length: groups.length },
      () => groups[Math.floor(rng() * groups.length)]!.delta,
    ).reduce((a, b) => a + b, 0) / groups.length,
).sort((a, b) => a - b)
const analysis = {
  createdAt: now(),
  sourcePlans: planIds,
  batches,
  summary,
  tasks: groups,
  comparison: {
    pairs: 18,
    tasks: 6,
    delta,
    taskBootstrapInterval: [draws[50], draws[1949]],
  },
  attempts: rows.map((r) => ({
    planId: r.planId,
    cellId: r.cellId,
    outcome: r.outcome,
    durationMs: r.durationMs,
    rootTokens: r.rootTokens,
    childTokens: r.childTokens,
  })),
}
await mkdir(join(root, 'artifacts'), { recursive: true })
await writeJson(join(root, 'artifacts/expanded-comparison.json'), analysis)
const overview = summary
  .map(
    (s) =>
      `| ${label(s.id)} | ${s.resolved}/${s.attempts} | ${s.unresolved} | ${s.timeouts} | ${seconds(s.medianMs)} |`,
  )
  .join('\n')
const tasks = groups
  .map(
    (g) =>
      `| ${g.taskId} | ${g.vanillaResolved}/3 | ${g.pstackResolved}/3 | ${seconds(g.vanillaMedianMs)} | ${seconds(g.pstackMedianMs)} |`,
  )
  .join('\n')
const batchTable = batches
  .flatMap((batch, index) =>
    batch.summary.map(
      (s) =>
        `| ${index === 0 ? 'Original two cases' : 'Four new Reka cases'} | ${label(s.id)} | ${s.resolved}/${s.evaluated} | ${s.errors} | ${seconds(s.medianMs)} |`,
    ),
  )
  .join('\n')
const attempts = [...rows]
  .sort(
    (a, b) =>
      a.taskId.localeCompare(b.taskId) ||
      a.experiment.id.localeCompare(b.experiment.id) ||
      a.repetition - b.repetition,
  )
  .map(
    (r) =>
      `| ${r.taskId} | ${label(r.experiment.id)} | ${r.repetition} | ${r.outcome} | ${seconds(r.durationMs)} |`,
  )
  .join('\n')
const document = `---
title: Six-case pstack vs vanilla comparison
description: Real matched Docker results across VueUse, npmx, and four additional Reka UI regressions.
---

This report combines the [original two-case pilot](/start/pilot-results/) with **four additional Reka UI cases**. The six tasks have three repetitions per workflow: **36 real model attempts and 18 matched pairs**. All planned attempts completed with a recorded outcome. No failed attempts were retried or removed; there are no excluded error pairs.

Vanilla solved **${vanillaSummary.resolved}/${vanillaSummary.attempts} attempts** and pstack Poteto solved **${pstackSummary.resolved}/${pstackSummary.attempts}**. Median solver elapsed times were **${seconds(vanillaSummary.medianMs)}** and **${seconds(pstackSummary.medianMs)}**, respectively. These are measurements of small regression repairs under the stated controls, not a general ranking of workflows. The fixture and measurement limits below are part of the result.

## Combined results

| Workflow | Solved | Incorrect submissions | Timeouts | Median solver elapsed |
| --- | --- | --- | --- | --- |
${overview}

| Task | Vanilla solved | Pstack solved | Vanilla median | Pstack median |
| --- | --- | --- | --- | --- |
${tasks}

The equally task-weighted success difference is **${(delta * 100).toFixed(1)} percentage points for pstack minus vanilla**. The descriptive task-bootstrap interval is ${(draws[50]! * 100).toFixed(1)} to ${(draws[1949]! * 100).toFixed(1)} percentage points. Six tasks remain a small, deliberately selected corpus; four are from one library and closely related in domain. Repetitions do not create new independent task identities. The pooled result is task-weighted, not repository-balanced.

## New cases and qualification

The expansion was run as a separate batch, without rerunning or replacing the original pilot:

| Batch | Workflow | Solved / evaluated | Errors | Median solver elapsed |
| --- | --- | --- | --- | --- |
${batchTable}

All four Reka tasks replay accepted upstream fixes from a shared earlier source revision, \\BASE\\. The relevant component production files were unchanged between that revision and each fix's parent. Each task has a separate prompt, allowed production file, reference patch, hidden regression patch, and existing-behavior control.

- **Tooltip coordination**, [PR #2869](https://github.com/unovue/reka-ui/pull/2869): an open tooltip should close when another tooltip opens. Reference: 6 focused tests pass.
- **Touch dismissal**, [PR #2863](https://github.com/unovue/reka-ui/pull/2863): a retained hidden layer must not capture the tap that opens it and dismiss on the deferred click; later outside taps still dismiss. Reference: 20 focused tests pass.
- **Radio accessible naming**, [PR #2861](https://github.com/unovue/reka-ui/pull/2861): an internal form value must not become an accessible name when a matching label is absent. Reference: 21 focused tests pass.
- **Number-field deletion**, [PR #2851](https://github.com/unovue/reka-ui/pull/2851): users must be able to backspace through a formatted unit suffix. Reference: 41 focused tests pass.

On each broken baseline, exactly the added regression failed while all neighboring tests passed. Each accepted fix passed the full component file and separate existing-behavior control. Four deliberately incomplete fixes were also rejected by the intended assertions. Evidence is retained in the task qualification records and \\MUTANTS\\.

The hidden regression tests are imported from upstream under MIT and executed independently here; they are not claimed to be independently authored. These Reka checks run actual Vue components in Vitest/jsdom, not a real browser or assistive-technology audit. The original VueUse task uses Chromium. The npmx task remains a bounded helper test.

The Tooltip hidden test patch also adds upstream teardown cleanup for mounted wrappers. The solver sees the older test fixtures, which can retain detached wrappers after a receiver-target fix. This was observed during the final pstack tooltip attempt and can confound local verification time under the production-only editing constraint. Independent grading uses the cleaned fixtures for both arms. Keep the recorded tooltip results, but do not attribute all of that timing difference to useful or unnecessary workflow work; a future calibrated fixture should supply the cleanup to both solvers before a new matched run.

## Controls and interpretation

Both batches used unchanged experiment definitions: **gpt-5.6-sol, medium reasoning, Codex CLI 0.157.1, 900-second solver limit, four active threads, depth two**. Pstack used the pinned native plugin and explicit Poteto entrypoint, with all configured roles on Sol. Vanilla had no added workflow plugin and the same available agent limits. The pstack snapshot and experiment definitions are checked for equality before pooling.

Attempts ran serially in seeded shuffled order within each batch. Every solver started from a fresh container and frozen source snapshot. Hidden grading ran separately and offline. Source-only, autonomous constraints were the same for both workflows. The two batches occurred sequentially, so provider load and elapsed calendar time are possible timing confounders; pooled timing is descriptive.

The image replaces upstream Git history with a synthetic baseline commit, and the solver cannot retrieve external source repositories. Both arms receive that same restriction. Pstack's history-analysis steps therefore cannot use the original repository history; this result does not measure their value in a normal checkout with that history available.

Solver elapsed time includes setup and workflow installation and excludes independent grading. Failed and timed-out attempts remain in the medians. A timeout means no completed submission within the budget; unfinished patches were not graded. Longer budgets require a new matched experiment, not a reinterpretation of these attempts.

The outcome measures the declared behavioral checks and production-file scope. It does not score maintainability, design quality, or every possible edge case. A passing patch is evidence for those checks, not proof of complete application correctness.

Root-token totals are incomplete for timeouts. Pstack child usage and completed-child attribution remain unreliable due to inherited session identities, and explicit skill-read activation remains unknown despite native plugin invocation and observed workflow activity. No complete token-cost comparison is claimed. Historical public fixes may have been present in model training.

## Inspect the batches

The [results viewer](/results/) retains both original plans. Select the 24-attempt plan for the new four-case batch or the 12-attempt plan for the original pilot. The combined table here is an analysis of those plans, not a fabricated merged run.

- Original plan: ${planIds[0]}
- Expansion plan: ${planIds[1]}

The local machine-readable combined analysis is \\ANALYSIS\\. Every attempt retains its original plan ID. Rebuild this report without model calls using \\COMMAND\\, then rebuild the site with \\BUILD\\.

For an independent new run, prepare and qualify the \\SUITE\\ suite, create a plan with plain-sol and pstack-sol and three repetitions, and execute the printed plan path with an authenticated subscription profile. Existing terminal outcomes are preserved on resume.

Use the six-case suite instead for a fresh 36-attempt comparison of all six tasks in one randomized batch. The report above retains the two already-measured batches and their original records.

## Every measured attempt

| Task | Workflow | Repetition | Outcome | Solver elapsed |
| --- | --- | --- | --- | --- |
${attempts}
`
  .replace('\\BASE\\', '`719d59af17978eb1e1fe547256501ac960e1a1a4`')
  .replace('\\MUTANTS\\', '`artifacts/reka-mutants.json`')
  .replace('\\ANALYSIS\\', '`artifacts/expanded-comparison.json`')
  .replace('\\COMMAND\\', '`pnpm report:expanded`')
  .replace('\\BUILD\\', '`pnpm build`')
  .replace('\\SUITE\\', '`reka-expansion`')
const reportPath = join(
  root,
  'apps/docs/src/content/docs/start/expanded-results.md',
)
await writeFile(
  reportPath,
  await format(document, {
    ...((await resolveConfig(reportPath)) ?? {}),
    filepath: reportPath,
  }),
)
console.log(
  JSON.stringify(
    { sourcePlans: planIds, summary, comparison: analysis.comparison },
    null,
    2,
  ),
)

---
title: Six-case pstack vs vanilla comparison
description: Real matched Docker results across VueUse, npmx, and four additional Reka UI regressions.
---

The public site includes this written report. Inspect the underlying plans and candidate patches in a local checkout containing the original private `.bench` artifacts; they are not included in the GitHub Pages deployment.

This report combines the [original two-case pilot](/start/pilot-results/) with **four additional Reka UI cases**. The six tasks have three repetitions per workflow: **36 real model attempts and 18 matched pairs**. All planned attempts completed with a recorded outcome. No failed attempts were retried or removed; there are no excluded error pairs.

Vanilla solved **17/18 attempts** and pstack Poteto solved **14/18**. Median solver elapsed times were **64.3s** and **558.8s**, respectively. These are measurements of small regression repairs under the stated controls, not a general ranking of workflows. The fixture and measurement limits below are part of the result.

## Combined results

| Workflow      | Solved | Incorrect submissions | Timeouts | Median solver elapsed |
| ------------- | ------ | --------------------- | -------- | --------------------- |
| Vanilla Codex | 17/18  | 1                     | 0        | 64.3s                 |
| pstack Poteto | 14/18  | 0                     | 4        | 558.8s                |

| Task                       | Vanilla solved | Pstack solved | Vanilla median | Pstack median |
| -------------------------- | -------------- | ------------- | -------------- | ------------- |
| npmx-changelog-urls        | 3/3            | 3/3           | 59.2s          | 543.6s        |
| reka-dismissable-touch     | 3/3            | 2/3           | 56.6s          | 572.7s        |
| reka-number-field-deletion | 3/3            | 3/3           | 65.0s          | 538.8s        |
| reka-radio-accessible-name | 3/3            | 3/3           | 58.1s          | 486.7s        |
| reka-tooltip-coordination  | 3/3            | 3/3           | 88.5s          | 771.6s        |
| vueuse-element-size        | 2/3            | 0/3           | 155.4s         | 901.0s        |

The equally task-weighted success difference is **-16.7 percentage points for pstack minus vanilla**. The descriptive task-bootstrap interval is -38.9 to 0.0 percentage points. Six tasks remain a small, deliberately selected corpus; four are from one library and closely related in domain. Repetitions do not create new independent task identities. The pooled result is task-weighted, not repository-balanced.

## New cases and qualification

The expansion was run as a separate batch, without rerunning or replacing the original pilot:

| Batch               | Workflow      | Solved / evaluated | Errors | Median solver elapsed |
| ------------------- | ------------- | ------------------ | ------ | --------------------- |
| Original two cases  | pstack Poteto | 3/6                | 0      | 766.2s                |
| Original two cases  | Vanilla Codex | 5/6                | 0      | 109.7s                |
| Four new Reka cases | pstack Poteto | 11/12              | 0      | 541.8s                |
| Four new Reka cases | Vanilla Codex | 12/12              | 0      | 62.2s                 |

All four Reka tasks replay accepted upstream fixes from a shared earlier source revision, `719d59af17978eb1e1fe547256501ac960e1a1a4`. The relevant component production files were unchanged between that revision and each fix's parent. Each task has a separate prompt, allowed production file, reference patch, hidden regression patch, and existing-behavior control.

- **Tooltip coordination**, [PR #2869](https://github.com/unovue/reka-ui/pull/2869): an open tooltip should close when another tooltip opens. Reference: 6 focused tests pass.
- **Touch dismissal**, [PR #2863](https://github.com/unovue/reka-ui/pull/2863): a retained hidden layer must not capture the tap that opens it and dismiss on the deferred click; later outside taps still dismiss. Reference: 20 focused tests pass.
- **Radio accessible naming**, [PR #2861](https://github.com/unovue/reka-ui/pull/2861): an internal form value must not become an accessible name when a matching label is absent. Reference: 21 focused tests pass.
- **Number-field deletion**, [PR #2851](https://github.com/unovue/reka-ui/pull/2851): users must be able to backspace through a formatted unit suffix. Reference: 41 focused tests pass.

On each broken baseline, exactly the added regression failed while all neighboring tests passed. Each accepted fix passed the full component file and separate existing-behavior control. Four deliberately incomplete fixes were also rejected by the intended assertions. Evidence is retained in the task qualification records and `artifacts/reka-mutants.json`.

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

- Original plan: plan-de0b5070-fcc2-40da-8487-0e81fe7df2a7
- Expansion plan: plan-921a5f0f-fbc1-463b-8f1d-7a6b12372037

The local machine-readable combined analysis is `artifacts/expanded-comparison.json`. Every attempt retains its original plan ID. Rebuild this report without model calls using `pnpm report:expanded`, then rebuild the site with `pnpm build`.

For an independent new run, prepare and qualify the `reka-expansion` suite, create a plan with plain-sol and pstack-sol and three repetitions, and execute the printed plan path with an authenticated subscription profile. Existing terminal outcomes are preserved on resume.

Use the six-case suite instead for a fresh 36-attempt comparison of all six tasks in one randomized batch. The report above retains the two already-measured batches and their original records.

## Every measured attempt

| Task                       | Workflow      | Repetition | Outcome    | Solver elapsed |
| -------------------------- | ------------- | ---------- | ---------- | -------------- |
| npmx-changelog-urls        | Vanilla Codex | 1          | resolved   | 66.6s          |
| npmx-changelog-urls        | Vanilla Codex | 2          | resolved   | 45.0s          |
| npmx-changelog-urls        | Vanilla Codex | 3          | resolved   | 59.2s          |
| npmx-changelog-urls        | pstack Poteto | 1          | resolved   | 485.9s         |
| npmx-changelog-urls        | pstack Poteto | 2          | resolved   | 631.4s         |
| npmx-changelog-urls        | pstack Poteto | 3          | resolved   | 543.6s         |
| reka-dismissable-touch     | Vanilla Codex | 1          | resolved   | 60.7s          |
| reka-dismissable-touch     | Vanilla Codex | 2          | resolved   | 56.6s          |
| reka-dismissable-touch     | Vanilla Codex | 3          | resolved   | 53.6s          |
| reka-dismissable-touch     | pstack Poteto | 1          | resolved   | 572.7s         |
| reka-dismissable-touch     | pstack Poteto | 2          | timeout    | 901.0s         |
| reka-dismissable-touch     | pstack Poteto | 3          | resolved   | 268.0s         |
| reka-number-field-deletion | Vanilla Codex | 1          | resolved   | 59.6s          |
| reka-number-field-deletion | Vanilla Codex | 2          | resolved   | 65.0s          |
| reka-number-field-deletion | Vanilla Codex | 3          | resolved   | 73.3s          |
| reka-number-field-deletion | pstack Poteto | 1          | resolved   | 544.9s         |
| reka-number-field-deletion | pstack Poteto | 2          | resolved   | 312.8s         |
| reka-number-field-deletion | pstack Poteto | 3          | resolved   | 538.8s         |
| reka-radio-accessible-name | Vanilla Codex | 1          | resolved   | 58.1s          |
| reka-radio-accessible-name | Vanilla Codex | 2          | resolved   | 63.7s          |
| reka-radio-accessible-name | Vanilla Codex | 3          | resolved   | 46.6s          |
| reka-radio-accessible-name | pstack Poteto | 1          | resolved   | 486.7s         |
| reka-radio-accessible-name | pstack Poteto | 2          | resolved   | 584.5s         |
| reka-radio-accessible-name | pstack Poteto | 3          | resolved   | 156.2s         |
| reka-tooltip-coordination  | Vanilla Codex | 1          | resolved   | 112.4s         |
| reka-tooltip-coordination  | Vanilla Codex | 2          | resolved   | 88.5s          |
| reka-tooltip-coordination  | Vanilla Codex | 3          | resolved   | 81.4s          |
| reka-tooltip-coordination  | pstack Poteto | 1          | resolved   | 428.6s         |
| reka-tooltip-coordination  | pstack Poteto | 2          | resolved   | 810.3s         |
| reka-tooltip-coordination  | pstack Poteto | 3          | resolved   | 771.6s         |
| vueuse-element-size        | Vanilla Codex | 1          | resolved   | 183.3s         |
| vueuse-element-size        | Vanilla Codex | 2          | unresolved | 152.8s         |
| vueuse-element-size        | Vanilla Codex | 3          | resolved   | 155.4s         |
| vueuse-element-size        | pstack Poteto | 1          | timeout    | 901.0s         |
| vueuse-element-size        | pstack Poteto | 2          | timeout    | 901.4s         |
| vueuse-element-size        | pstack Poteto | 3          | timeout    | 901.0s         |

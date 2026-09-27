---
title: 'CLI commands'
description: 'Commands, selection options, and model-call boundaries.'
---

Run commands from the repository root as `pnpm bench COMMAND`. Unless a command accepts `--plan`, selection options choose tasks, experiments, and repetitions.

| Command              | Model calls? | Purpose                                                        |
| -------------------- | ------------ | -------------------------------------------------------------- |
| `doctor`             | No           | Check backend tools, native sandbox, and profile presence      |
| `list`               | No           | List tasks, experiments, and plans                             |
| `demo`               | No           | Prepare and qualify the receipt task with the selected backend |
| `auth login`         | Login only   | Authenticate the normal local Codex profile                    |
| `workflow ID`        | No           | Fetch and pin a workflow                                       |
| `prepare`            | No           | Prepare the baseline and dependency cache                      |
| `qualify`            | No           | Check broken base and reference                                |
| `plan`               | No           | Freeze a repeated comparison                                   |
| `run --plan PATH`    | **Yes**      | Execute pending attempts serially                              |
| `report --plan PATH` | No           | Validate and summarize results                                 |
| `judge --plan PATH`  | **Yes**      | Run blind pairwise code reviews after all solver cells finish  |
| `status --plan PATH` | No           | Show per-cell progress and the active runner as JSON           |
| `cancel --plan PATH` | No           | Ask the active runner to stop and retain partial evidence      |
| `retry --plan PATH`  | No           | Create a linked plan for unsuccessful or interrupted cells     |
| `cache list`         | No           | Inspect native snapshot sizes and protection reasons           |
| `cache prune`        | No           | Preview unreferenced native snapshot removal                   |
| `benchmark`          | No           | Measure paired local and Docker infrastructure timings         |
| `ui`                 | No           | Serve the guide and snapshot viewer                            |

## Selection options

| Option                    | Meaning                                                  |
| ------------------------- | -------------------------------------------------------- |
| `--task id,id`            | Select one or more task IDs                              |
| `--suite name`            | Load tasks, experiments, and repetitions                 |
| `--experiments id,id`     | Select one or more experiment IDs                        |
| `--repetitions N`         | Set the repetition count                                 |
| `--seed N`                | Set the plan shuffle seed                                |
| `--work PATH`             | Use another work directory                               |
| `--plan PATH`             | Select an existing `plan.json` for run, report, or judge |
| `--source PATH`           | Export a workflow from a local Git checkout              |
| `--backend local\|docker` | Select the backend for prepare, qualify, plan, or demo   |
| `--cell id,id`            | Select eligible cells when creating a retry plan         |
| `--output PATH`           | Select a new JSON path for `benchmark`                   |

The default selection is the receipt task with `plain-sol` and `pstack-sol`, one repetition. The default backend is `local`, which requires macOS. Planning requires tasks qualified with the same backend and environment identity. A frozen plan selects its backend for `run`; `run` has no `--backend` option.

## Freeze model settings from the CLI

Planning accepts `--model`, `--reasoning low|medium|high|xhigh`, `--timeout SECONDS`, `--max-threads N`, and `--max-depth N`. Overrides apply to every selected experiment and are validated and copied into the frozen plan. They do not edit the experiment files. `run` rejects these flags because it must use the recorded settings.

```sh
pnpm bench plan --suite smoke --repetitions 3 \
  --model gpt-5.6-sol --reasoning high --timeout 900 \
  --max-threads 4 --max-depth 2
```

## Stop and retry attempts

`status` reports each cell as pending, running, interrupted, or with its recorded outcome. `cancel` writes a cancellation request for the active runner. The solver stops, its partial evidence is retained, and the attempt receives a `cancelled` result when shutdown completes.

Completed outcomes are never silently rerun. After the original runner has stopped, `retry` creates a new frozen plan containing the unsuccessful or interrupted cells and records `retryOf` lineage back to the original plan. Use `--cell id,id` to select a subset. The original plan and attempt directories remain unchanged. A stale run lock requires operator inspection; the CLI does not guess that it is safe to delete one.

Retries retain the original task, workflow, model settings, and environment identity. If those inputs have changed, execution refuses the retry. Prepare and qualify the new inputs and create a new ordinary plan instead of treating changed conditions as a retry.

## Inspect and prune the native cache

`cache list` reports logical file byte counts for prepared native snapshots and identifies references from current prepared records and frozen plans. These totals describe file contents; copy-on-write filesystems such as APFS may reclaim a different amount of physical disk space.

`cache prune` is a dry run. Add `--apply` to remove only recognized snapshot directories under `.bench/cache/local/` that have no prepared-record or frozen-plan reference. Unknown entries, symlinks, toolchains, package stores, workflows, credentials, plans, results, and Docker data are never prune targets. Invalid manifests stop the operation before deletion.

Cache-changing and cache-consuming CLI operations share `.bench/.cache-maintenance-lock`, so pruning cannot race a prepare, qualification, plan, run, judge, retry, workflow fetch, or benchmark in the same work directory. The lock's `owner.json` records the owning PID and start time. After `SIGKILL` or another abrupt exit, inspect that record and verify the process is gone before removing a stale lock manually. The CLI never deletes a lock merely because it appears old.

## Compare backend infrastructure

`pnpm bench benchmark --repetitions 3` prepares and qualifies the selected task for both backends, then alternates backend order while timing warm identity validation, fresh workspace setup and cleanup, and independent grading of the trusted reference. It makes zero model calls. Use `--task ID` for one task and `--output NEW_PATH` to choose the artifact path; the output file must not already exist.

This is an infrastructure measurement, not a solver-speed or model-quality comparison. Preparation may reuse caches, host caches are not flushed, and local and Docker use different operating-system and resource conditions. Medians include successful samples only. Failed and blocked samples remain in the JSON artifact with their errors and checks.

## Artifact layout

See [artifact reference](/reference/artifacts/) for paths, schemas, field meanings, and examples. Missing files never establish success.

## Project checks

```sh
pnpm verify          # type checks, lint, tests, documentation build and export proof
pnpm test:local      # native macOS backend proof, no model calls
pnpm test:native-browser # real browser feedback through the native CDP endpoint
pnpm test:performance # paired backend measurements, no model calls
pnpm test:docs       # check the built Markdown exports against source
pnpm test:docker     # real Docker qualification and mutant proof
pnpm test:workflows  # native installation proofs, no model calls
pnpm test:runner     # deterministic transport stub, no model calls
pnpm test:upstream   # reject incomplete fixes; prepare ecosystem first
pnpm test:reka       # reject four incomplete Reka fixes; prepare reka-expansion first
pnpm report:expanded # combine the recorded pilot and expansion once all attempts finish
pnpm format:check
```

Ordinary checks never call a model. `test:local` exercises native preparation, qualification, fresh attempt workspaces, independent grading, and fail-closed permission checks. Local static output lives in `apps/docs/dist`. The report viewer and field guide ship together.

## Blind pairwise code review

`pnpm bench judge --plan <path>` makes real Codex calls after all solver cells finish. Select a file-backed profile with `BENCH_AUTH_FILE`. Plans must contain exactly two experiments with matched task and repetition pairs. Each pair gets two fresh code-only reviews with swapped labels. The judge uses the backend recorded by the plan. See the [workout comparison guide](/guides/workout-benchmark/) for the rubric, artifacts, failure behavior, and limitations. The primary code-quality artifact is `plans/<plan-id>/judge/report.md`; the ordinary result viewer continues to show deterministic correctness separately.

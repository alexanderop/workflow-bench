---
title: 'Artifact reference'
description: 'Locate plans, qualification evidence, and result records and interpret their fields.'
---

Artifacts live under `.bench` unless `--work` selects another directory. Schemas are defined in `packages/core/model.ts`. Raw execution evidence is private and is not part of the documentation exports.

## Artifact layout

```text
.bench/
  tasks/TASK/
    local/
      prepared.json
      qualification.json
      qualification/TIMESTAMP/evidence.json
    docker/
      prepared.json
      qualification.json
      qualification/TIMESTAMP/evidence.json
  cache/
    local/TASK/FINGERPRINT/SNAPSHOT_HASH/
    pnpm-store/PNPM_VERSION/
    playwright/
  workflows/WORKFLOW/
    pin.json
    source/
  plans/PLAN/
    plan.json
    report.json
    attempts/CELL/
      result.json
      candidate.patch
      prompt.md
      installation.log
      events.jsonl
      sessions.json
      stderr.log
  demo/qualification.json
artifacts/performance/TIMESTAMP-UUID.json
```

Fields may be absent when execution failed before producing that artifact. Missing files are never evidence of success.

## Qualification

`tasks/TASK/BACKEND/qualification.json` records the grader gate. It contains `version`, `fingerprint`, `environment`, `qualified`, `base`, `reference`, and `createdAt`.

Each check has `name`, `regression`, `exitCode`, `timedOut`, and `output`. `qualified: true` requires the intended base regression failure, passing unrelated base checks, a passing reference, and no timeout. This record is not a solver result.

## Frozen plan

| Field                                                | Meaning                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `version`                                            | Artifact version, currently `2`.                                                                 |
| `id`, `createdAt`, `seed`                            | Plan identity, creation timestamp, and shuffled execution seed.                                  |
| `cells`                                              | Every planned attempt. At least one cell is required.                                            |
| `cells[].id`, `taskId`, `repetition`                 | Cell identity, task identity, and positive repetition number.                                    |
| `cells[].experiment`                                 | Selected workflow, model, reasoning effort, Codex version, timeout, and thread and depth limits. |
| `cells[].fingerprint`, `environment`, `workflowHash` | Frozen task and runtime identities. The plain arm has a null workflow hash.                      |
| `retryOf`                                            | Optional source plan and selected cell IDs for an explicit retry plan.                           |

## Attempt result

| Field                                                                    | Meaning                                                                 |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `version`, `planId`, `cellId`, `taskId`                                  | Version and relationship to the planned attempt.                        |
| `experiment`, `repetition`, `fingerprint`, `environment`, `workflowHash` | Conditions copied from the frozen cell.                                 |
| `outcome`, `message`                                                     | Machine-readable outcome and diagnostic description.                    |
| `startedAt`, `durationMs`                                                | Start timestamp and elapsed duration in milliseconds.                   |
| `candidateHash`                                                          | SHA-256 of the candidate patch, or null when absent.                    |
| `activation`                                                             | `not_applicable`, `observed`, or `unknown`. Separate from correctness.  |
| `rootTokens`, `childTokens`                                              | Recorded token totals, or null when unknown. Null is not zero.          |
| `completedChildren`                                                      | Observed completed child count. It does not prove complete child usage. |
| `checks`                                                                 | Independent grading records with the check fields above.                |

Outcomes are `resolved`, `unresolved`, `timeout`, `infrastructure_error`, `auth_error`, `rate_limited`, `unsupported`, and `cancelled`. Cancellation is retained as a terminal outcome outside the correctness denominator. A missing result is pending or interrupted, never a successful attempt.

An attempt directory without a result remains interrupted evidence; `status` exposes it and `retry` can place it in a new linked plan.

## Cache and performance artifacts

The native cache stores immutable prepared snapshots at `cache/local/TASK/FINGERPRINT/SNAPSHOT_HASH/`. `cache list` reports logical byte totals and protection references. Frozen plans protect their referenced snapshots even when they are not the current prepared record. A prune preview and an applied prune return the same candidate inventory; only `--apply` removes recognized unreferenced snapshot directories.

Backend benchmark artifacts use `kind: "backend-performance"` and record the host identity, zero model calls, preparation and qualification records, every ordered sample, timing limitations, and successful-sample medians. Timing fields separate warm preparation, workspace setup, workspace cleanup, total workspace lifecycle, and grading. The artifact is written incrementally so failed and blocked samples remain visible.

## Environment identity

Every version 2 prepared record, qualification, plan cell, and result has one `environment` object. Records form a controlled pair only when their environment objects match exactly.

A local environment has `kind: "local"`, `platform`, `arch`, `osRelease`, `nodeVersion`, `pnpmVersion`, `codexVersion`, `snapshotHash`, and `sandboxPolicyVersion`. The prepared record also has a private locator with the cache directory and resolved tool paths.

A Docker environment has `kind: "docker"` and `imageId`. The prepared record locator also contains the image tag.

The reader normalizes legacy version 1 plans and results as Docker records with their existing `imageId`. Legacy prepared and qualification files at `tasks/TASK/` remain readable. New writes use version 2 and backend-specific directories.

The following check object is an **illustrative schema example**, not a measured result:

```json
{
  "name": "Line rounding regression",
  "regression": true,
  "exitCode": 1,
  "timedOut": false,
  "output": "LINE_ROUNDING_REGRESSION"
}
```

## Reports and private evidence

`report.json` contains validated `plan` and `results` records plus derived `summary` and `comparisons`. The report retains the plan so that missing attempts remain visible. The [result viewer](/results/) shows correctness independently of workflow activation.

Blind pairwise judging writes to `plans/PLAN/judge/`. Its `report.md` is a separate, advisory code-quality assessment. See [the judge contract](/guides/workout-benchmark/#blind-llm-code-quality-judging) for the full procedure.

`events.jsonl`, `sessions.json`, and `stderr.log` are private execution evidence. Do not publish raw transcripts or credentials. Review candidate patches and trusted grader output before publishing reports for private tasks.

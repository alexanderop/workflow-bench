---
title: 'Troubleshooting'
description: 'Troubleshooting in Workflow Bench.'
---

Start with `pnpm bench doctor`. It reports local and Docker tool availability, the native sandbox, and profile presence. It does not test account quota.

## The local backend is unavailable

The local backend supports macOS only and requires `/usr/bin/sandbox-exec`. On another platform, add `--backend docker` to `prepare`, `qualify`, `plan`, or `demo`.

Each local task uses its pinned pnpm version, and each experiment uses its pinned Codex version. Set `BENCH_PNPM_BIN` or `BENCH_CODEX_BIN` to an absolute matching executable when the command is not on `PATH`. The runner records both versions in the environment identity and fails on a mismatch.

The runner also fails closed if it cannot write the named Codex default permissions or apply the native sandbox policy. Do not bypass either check. Fix the tool installation or use Docker.

## A native solver's browser command cannot start Chromium

The named Codex permission profile does not allow an arbitrary macOS Chromium process to register its required Mach service. Browser-prepared tasks instead expose `BENCH_BROWSER_WS_ENDPOINT`. Browser-aware solver code can attach to that brokered process with `chromium.connectOverCDP(process.env.BENCH_BROWSER_WS_ENDPOINT)`. Independent native grading uses a separate restricted Seatbelt policy and can also run Playwright Chromium.

Existing suites that call `chromium.launch()` do not automatically use the endpoint. Add explicit endpoint support, or prepare, qualify, and plan with `--backend docker` when the workflow needs that suite as development feedback. A local attempt still receives an independent browser grade after the solve.

## The Docker backend is unavailable

Start Docker Desktop or your Docker engine, then run `pnpm bench doctor`. The runner does not start or reconfigure Docker for you. Docker availability does not block the default local backend.

## Preparation takes time

The first preparation installs dependencies and, for VueUse, Chromium and its system libraries. The local backend publishes a content-addressed snapshot and clones it for later workspaces. Docker uses layer caching. Preparation and qualification time are excluded from solve duration. A failed preparation is infrastructure trouble, not a workflow failure.

## Qualification fails

Inspect `.bench/tasks/TASK/BACKEND/qualification.json`. Check the exact base failure, reference outcome, and timeout flags. Missing libraries or a browser-launch error do not satisfy the intended assertion. Do not weaken expected-failure matching just to get a green result.

If the task changed, run `prepare` before `qualify`. Qualification uses the prepared environment identity recorded for that task and backend.

## Inputs changed

The runner refuses to reuse a plan if its fixture, implementation, workflow content, or environment identity changed. Prepare and qualify again with the same backend, then create a new plan. Keep the old artifacts for historical comparisons.

## Authentication or quota error

The runner retains the failed cell and stops further model calls. Reauthenticate the selected file-backed profile if needed. Create a new plan for a new study rather than erasing the recorded failure. No automatic model or provider substitution occurs.

## Interrupted run or stale lock

An interrupted cell with partial artifacts and no result is not automatically retried. Inspect it and retain its evidence. Create a new plan for subsequent attempts. A stale `.run-lock` or credential lock may remain after a forced host kill; remove it only after verifying no associated process is running.

For a local plan, a forced host kill can leave `workflow-bench-attempt-*` directories under the macOS temporary directory. Verify that no associated runner or Codex process remains before removing a specific directory.

For a Docker plan, inspect only this project's resources:

```sh
docker ps -a --filter label=workflow-bench=true
docker network ls --filter label=workflow-bench=true
```

Remove specific abandoned resources after inspection. Avoid global Docker prune commands.

## Results do not update

Restart `pnpm dev` after runs or use `pnpm build` to generate a new static report. Use an absolute `BENCH_WORK` path to view a different work directory. Malformed or mismatched results stop report generation rather than disappearing from the denominator.

## Activation says unknown

The parser recognizes successful skill-file reads, not every possible native-injection event. Inspect private logs before diagnosing a missing skill. A behaviorally passing patch can have unknown activation; do not silently exclude it to improve the treatment's score.

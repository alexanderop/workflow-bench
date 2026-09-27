# Workflow Bench

[Read the guide](https://alexanderop.github.io/workflow-bench/) · [GitHub](https://github.com/alexanderop/workflow-bench)

A local benchmark lab for asking whether agentic coding workflows improve independently verified software outcomes. Inspired by Supabase Evals: tasks, experiments, runners, and scorers remain separate.

Compare plain Codex, pstack, Superpowers, and a declared Matt Pocock skill recipe on frozen tasks. The default macOS backend runs each solver in a fresh local workspace and grades its exported patch in another fresh workspace. Hidden behavioral grading happens separately and offline. Docker remains available as an explicit backend for stronger process and network controls. The Astro Starlight field guide and Vue results viewer explain both the mechanics and the limits of the evidence.

## Start locally

Requirements for the default local backend: macOS, Node >=22.12, pnpm 10.28.2, Git, and the Codex CLI version selected by the experiment. Docker is optional.

```sh
pnpm install --frozen-lockfile
pnpm bench doctor
pnpm bench demo  # local qualification only; no model calls
pnpm dev        # guide at /, report viewer at /results/
```

## Run a real comparison

```sh
pnpm bench plan --suite smoke --repetitions 1
BENCH_AUTH_FILE="$HOME/.codex/auth.json" \
pnpm bench run --plan .bench/plans/PLAN_ID/plan.json
pnpm bench report --plan .bench/plans/PLAN_ID/plan.json
```

Use the exact plan path printed by `plan`. The plan freezes its backend, so `run` has no backend option. `run` consumes subscription allowance. The example uses your existing file-backed Codex subscription login and requires no API key or extra login. Restart the docs server after results change. Never run concurrent jobs against one credential stream.

Add `--backend docker` to `prepare`, `qualify`, `plan`, or `demo` when you want Docker. Keep local and Docker results separate because their environment identities differ.

Use `pnpm bench status --plan <path>` while a plan runs. `cancel` retains partial evidence, and `retry` creates a new plan linked to unsuccessful or interrupted cells instead of changing their history. Native cache cleanup is explicit: `pnpm bench cache list`, `pnpm bench cache prune` for a dry run, then `pnpm bench cache prune --apply`. Cache sizes are logical bytes and may differ from physical APFS space reclaimed.

Workspace operations share `.bench/.cache-maintenance-lock`. After an abrupt termination, inspect its `owner.json` PID and start time and verify that process is gone before manually removing a stale lock.

`pnpm bench benchmark --repetitions 3` compares local and Docker preparation, workspace, and trusted-reference grading overhead without model calls. It records every failed or blocked sample and its measurement limits; it is not a solver-speed comparison.

For the real VueUse browser task:

```sh
pnpm bench prepare --suite vueuse
pnpm bench qualify --suite vueuse
pnpm bench plan --suite vueuse --repetitions 1
```

The native grader can launch Playwright Chromium under its separate restricted policy. For browser-prepared tasks, a local solver receives `BENCH_BROWSER_WS_ENDPOINT` and can attach with Playwright's `chromium.connectOverCDP(endpoint)`. Starting another Chromium process inside the solver sandbox remains blocked. Existing test suites that call `chromium.launch()` need endpoint support before they can provide local solver feedback; use `--backend docker` on all three commands when the measured workflow depends on such a suite.

The `ecosystem` suite adds the bounded npmx changelog-URL helper replay. Use `--suite ecosystem` with prepare, qualify, and plan to compare all four workflows across both upstream tasks.

The `reka-expansion` suite adds four distinct Reka UI regressions: tooltip coordination, touch dismissal, radio accessible naming, and number-field deletion. It defaults to plain Codex versus pstack, three repetitions each. Run `pnpm bench prepare --suite reka-expansion`, `pnpm bench qualify --suite reka-expansion`, and `pnpm test:reka` before planning its 24 model attempts. `pnpm report:expanded` generates the six-case combined report from the two recorded plans only after both batches are complete.

Use `--suite six-case` with prepare, qualify, and plan for a fresh comparison across all six upstream cases: 36 attempts, plain Codex versus pstack, three repetitions. This suite excludes the receipt teaching fixture.

The `nuxt-workout` suite compares vanilla Codex and pstack on a detailed new-app brief: a Nuxt workout tracker with IndexedDB, editing, validation, and storage failure handling. It uses a blank fixed-toolchain starter and three repetitions per workflow. Run `pnpm test:workout` for model-free qualification and mutation checks, then follow the [workout benchmark guide](apps/docs/src/content/docs/guides/workout-benchmark.md) to plan a comparison. Use `pnpm bench judge --plan <path>` after the solver runs for blind pairwise code-quality reviews in both orders. Judge preferences and browser correctness remain separate.

## Read the guide

Start with [the walkthrough](apps/docs/src/content/docs/start/quickstart.md), [fair comparisons](apps/docs/src/content/docs/concepts/fair-comparisons.mdx), and [limitations](apps/docs/src/content/docs/reference/limitations.md). `pnpm dev` renders the full searchable Starlight guide. `pnpm build` exports the guide and validated local results to `apps/docs/dist`.

The [first authenticated pstack-versus-vanilla pilot](apps/docs/src/content/docs/start/pilot-results.md) records all twelve real Docker attempts. Vanilla solved 5/6 and pstack Poteto solved 3/6 under the same Sol model and 15-minute budget. This two-task pilot is exploratory; the report explains timeouts, elapsed time, and incomplete child-usage attribution.

The [expanded six-case report](apps/docs/src/content/docs/start/expanded-results.md) adds 24 measured Reka attempts: vanilla 12/12 and pstack 11/12. Across both batches, vanilla solved 17/18 and pstack 14/18, with median solver elapsed times of 64.3s and 558.8s. All four pstack failures were timeouts. The report preserves every attempt and explains the small correlated corpus, synthetic Git history, Tooltip test-cleanup timing confound, and incomplete child-token attribution.

## Development

```sh
pnpm verify
pnpm test:local
pnpm test:docker
pnpm test:workflows
pnpm test:runner
pnpm format:check
```

Ordinary checks make no model calls. `test:local` proves the native preparation, qualification, fresh-workspace, hidden-grader, and permission behavior on macOS. Docker proof qualifies the same teaching task, rejects an incomplete implementation, and checks clean-container boundaries. Evidence is saved under ignored local artifact directories.

This is a small initial corpus, not a leaderboard. Installation, activation, delegation, and acceptance are separate observations. Missing results and unknown child usage remain visible. A passing smoke experiment does not establish workflow superiority.

See [architecture and provenance](apps/docs/src/content/docs/reference/architecture.md) for upstream attribution and [authentication and backend boundaries](apps/docs/src/content/docs/guides/docker-auth.md) for account and runtime details. GitHub Actions verifies changes and deploys the guide to GitHub Pages after pushes to `main`. CI makes no model calls.

The guide includes a bounded no-model quickstart, a separate live-comparison guide, source-backed task examples, and a dedicated artifact reference. Each page has a Markdown export and a copy action. `/llms.txt` indexes documentation exports without including private benchmark artifacts. The guide links to its public GitHub sources. The hosted results viewer has no private run artifacts; use `pnpm dev` to inspect your local results.

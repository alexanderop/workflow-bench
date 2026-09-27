---
title: 'Run your first live comparison'
description: 'Freeze and run one receipt task with plain Codex and pstack.'
---

Complete [your first qualified task](/start/quickstart/) before this guide. Install the Codex CLI version selected by the experiment.

**The `run` command makes real model calls and consumes subscription allowance.** Login and planning make no inference calls. This comparison produces two attempts and is a plumbing pilot, not evidence of general workflow quality.

## 1. Select your subscription login

```sh
test -f "$HOME/.codex/auth.json"
```

The standard Codex login is file-backed at `~/.codex/auth.json`. The run command below selects that file. You do not need an API key or another login.

If the file is absent, run `pnpm bench auth login`. The command uses the normal local Codex home and preserves its existing configuration. Credentials are not included in reports. Never run simultaneous jobs against one credential stream.

## 2. Freeze a small comparison

The demonstration already prepares and qualifies the receipt task. These are the equivalent explicit steps:

```sh
pnpm bench prepare --suite smoke
pnpm bench qualify --suite smoke
pnpm bench plan --suite smoke --repetitions 1
```

Planning fetches the pinned workflow source and prints an immutable plan path. It makes no model calls. The smoke suite contains one task, plain Codex and pstack, and one repetition: two attempts.

The commands use the default local backend. Add `--backend docker` to all three commands when you want a Docker plan. Copy the printed path. The next step uses that exact `plan.json` file.

## 3. Run the printed plan

```sh
BENCH_AUTH_FILE="$HOME/.codex/auth.json" \
pnpm bench run --plan .bench/plans/PLAN_ID/plan.json
pnpm bench report --plan .bench/plans/PLAN_ID/plan.json
pnpm bench ui
```

Replace `PLAN_ID` with the ID printed by `plan`. **Run makes real model calls and consumes subscription allowance.** The plan supplies the backend and frozen environment identity. `run` does not accept `--backend`. Every completed outcome is retained. Re-running the command skips completed cells, including failures. Account and quota errors stop the remaining matrix.

In another terminal, inspect or stop a live plan with:

```sh
pnpm bench status --plan .bench/plans/PLAN_ID/plan.json
pnpm bench cancel --plan .bench/plans/PLAN_ID/plan.json
```

Cancellation retains partial evidence and records a cancelled outcome when the runner shuts down. To repeat failed, cancelled, timed-out, or interrupted cells, create a linked plan after the original runner stops:

```sh
pnpm bench retry --plan .bench/plans/PLAN_ID/plan.json
# Or select eligible cells:
pnpm bench retry --plan .bench/plans/PLAN_ID/plan.json --cell CELL_ID,CELL_ID
```

Run the new plan path printed by `retry`. The retry plan records its source plan and selected cell IDs; it does not alter or conceal the original attempts.

`report` validates the recorded attempts and writes the plan report. `ui` opens the guide and the result snapshot.

Restart the Astro dev server after new results arrive; the viewer reads a snapshot at startup/build time. For a static preview with a fresh search index, run `pnpm build` followed by `pnpm preview` (port 4367).

Check that every planned attempt appears in the report, including failures. Read [interpret results](/concepts/interpretation/) before comparing completion rates. Then [expand the task suite](/guides/expand-suite/) if the pilot is working.

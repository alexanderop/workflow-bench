---
title: First pstack vs vanilla pilot
description: Real local Docker results from twelve matched Codex attempts on VueUse and npmx.
---

The public site includes this written report. Inspect the underlying plans and candidate patches in a local checkout containing the original private `.bench` artifacts; they are not included in the GitHub Pages deployment.

On 26 September 2026, vanilla Codex solved **5/6 attempts** and pstack Poteto solved **3/6** under identical settings. Pstack did not improve verified completion in this pilot and took substantially longer. This is evidence about two specific historical tasks under a 15-minute budget, not a general ranking of workflows.

The [expanded six-case comparison](/start/expanded-results/) adds four qualified Reka UI regressions and 24 new attempts. This original pilot and its outcomes remain unchanged.

These are real authenticated model runs using the local Codex subscription login. They are separate from the repository's simulated runner checks. All twelve planned attempts have terminal records; no failed attempts were retried or removed. There were 0 provider, authentication, unsupported-configuration, or infrastructure errors.

## Results

| Workflow      | Solved | Incorrect submissions | Timeouts | Median solver elapsed time |
| ------------- | ------ | --------------------- | -------- | -------------------------- |
| Vanilla Codex | 5/6    | 1                     | 0        | 109.7s                     |
| pstack Poteto | 3/6    | 0                     | 3        | 766.2s                     |

| Task                | Vanilla solved | Pstack solved | Vanilla median | Pstack median |
| ------------------- | -------------- | ------------- | -------------- | ------------- |
| npmx-changelog-urls | 3/3            | 3/3           | 59.2s          | 543.6s        |
| vueuse-element-size | 2/3            | 0/3           | 155.4s         | 901.0s        |

Elapsed time includes container setup, workflow installation, and the solver turn. It excludes independent grading. Timeout durations include the small runner/setup overhead beyond the 900-second solver limit. Medians include unsuccessful and timed-out attempts.

On the npmx URL helper, both workflows passed all three repetitions. Median times were 59.2 seconds for vanilla and 543.6 seconds for pstack, a **9.2× time ratio**. On VueUse, vanilla's failed submission treated padding as content and produced a duplicate callback; its two other patches passed the browser regression and existing directive checks.

The paired, equally task-weighted success difference was **-33.3 percentage points for pstack minus vanilla**, over six pairs and two tasks. Repetitions measure variation on the same tasks; they do not turn two tasks into six independent tasks. A bootstrap over only two task identities is too weak to justify a broad conclusion, even when the viewer displays an interval.

## What was controlled

- Model: `gpt-5.6-sol`, medium reasoning, for both roots and configured pstack roles.
- Codex CLI: `0.157.1`; 900-second solver budget; at most four active agent threads and depth two.
- Workflow treatment: the pinned native pstack plugin, explicitly invoked through `$pstack:poteto-mode`. Vanilla had no added workflow plugin. Both had the same agent capability limits. This is not a test of every pstack skill or its default mixed-model configuration.
- Pstack revision: `e9b6d5d29c06e11e2b2af67c80cef8c38712a02e`.
- Three repetitions per workflow per task; seeded randomized order (seed 42); serial execution.
- Fresh Docker solver containers and local source snapshots for every attempt. Solvers could reach the model service through the restricted proxy; source retrieval and hidden grader access were unavailable.
- The broken base failed the intended regression, the accepted reference passed, and partial-fix mutations were rejected before the plan was created. Accepted candidates were graded in separate offline containers.
- Both arms received the same autonomous, production-only editing constraints. This evaluates a bounded autonomous repair, not a complete interactive PR workflow.

The VueUse task checks box measurements and directive callbacks in Chromium. The npmx task checks a TypeScript URL helper, not the whole application. Both are historical issue replays; prior model exposure to these fixes cannot be ruled out.

## What a timeout means

A timeout is a failed completion within the chosen budget. The runner does not grade or export unfinished patches after timeout, so it does **not** establish that every intermediate patch was incorrect. In live observation, pstack spent substantial time on investigation, competing designs, delegation, and review. Those stages count toward the workflow's elapsed time.

A larger budget could change the result. It must be tested as a new matched experiment with the larger budget applied to both workflows; these attempts should remain unchanged.

## Usage and workflow evidence limits

CLI-reported root usage is listed below. It includes repeated input context, much of it cached. These counts are not dollar costs, unique prompt sizes, or complete workflow token totals.

Pstack's child token attribution is unknown in this run. The saved session summaries contain repeated inherited root identities, so the collector correctly refuses to claim a complete child total. Its completed-child field is not a reliable delegation count for this dataset. Live session inspection observed child agents, and recorded events contain collaboration waits.

The automatic activation field remains `unknown` because its detector looks for an explicit skill-file read; native plugin delivery did not produce that recognized event. The plugin installation, explicit invocation, workflow narration, and collaboration evidence support the treatment having run, but do not prove compliance with every workflow step. Correctness remains the independent acceptance result.

| Task                | Workflow      | Repetition | Outcome    | Solver elapsed | Reported root tokens |
| ------------------- | ------------- | ---------- | ---------- | -------------- | -------------------- |
| npmx-changelog-urls | Vanilla Codex | 1          | resolved   | 66.6s          | 105,769              |
| npmx-changelog-urls | Vanilla Codex | 2          | resolved   | 45.0s          | 93,479               |
| npmx-changelog-urls | Vanilla Codex | 3          | resolved   | 59.2s          | 107,592              |
| npmx-changelog-urls | pstack Poteto | 1          | resolved   | 485.9s         | 1,301,939            |
| npmx-changelog-urls | pstack Poteto | 2          | resolved   | 631.4s         | 1,250,030            |
| npmx-changelog-urls | pstack Poteto | 3          | resolved   | 543.6s         | 1,181,862            |
| vueuse-element-size | Vanilla Codex | 1          | resolved   | 183.3s         | 285,385              |
| vueuse-element-size | Vanilla Codex | 2          | unresolved | 152.8s         | 271,613              |
| vueuse-element-size | Vanilla Codex | 3          | resolved   | 155.4s         | 274,803              |
| vueuse-element-size | pstack Poteto | 1          | timeout    | 901.0s         | Unknown              |
| vueuse-element-size | pstack Poteto | 2          | timeout    | 901.4s         | Unknown              |
| vueuse-element-size | pstack Poteto | 3          | timeout    | 901.0s         | Unknown              |

## Inspect and reproduce

Open the [results viewer](/results/) and select plan `plan-de0b5070-fcc2-40da-8487-0e81fe7df2a7`. Every submitted candidate patch and independent check can be inspected there. Raw transcripts remain private local artifacts; they are not embedded in the site.

The immutable local plan, attempt records, and aggregate report are under:

```text
.bench/plans/plan-de0b5070-fcc2-40da-8487-0e81fe7df2a7/
  plan.json
  report.json
  attempts/<cell>/result.json
  attempts/<cell>/candidate.patch   # completed submissions only
  attempts/<cell>/events.jsonl      # private local transcript
  attempts/<cell>/sessions.json
```

Regenerate the report without model calls:

```sh
pnpm bench report --plan .bench/plans/plan-de0b5070-fcc2-40da-8487-0e81fe7df2a7/plan.json
pnpm build
```

For a new independent replication, prepare and qualify the current fixtures, authenticate, then create a new plan:

```sh
pnpm bench plan --suite ecosystem --experiments plain-sol,pstack-sol --repetitions 3
pnpm bench run --plan <new-plan-path>
```

See [the quickstart](/start/quickstart/) for setup. This batch explicitly selected the existing local subscription profile; new installations can create the dedicated profile described in [the live comparison guide](/guides/live-comparison/).

The next useful comparison is a broader set of qualified tasks across task sizes, plus a separately planned budget study. Fix the child-usage and native-activation instrumentation before making total-token efficiency claims. Keep all of this pilot's outcomes visible when doing either follow-up.

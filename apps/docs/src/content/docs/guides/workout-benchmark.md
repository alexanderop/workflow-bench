---
title: 'Nuxt workout tracker comparison'
description: 'Compare vanilla Codex and pstack on a detailed new-application brief.'
---

The `nuxt-workout` suite compares `plain-sol` (vanilla Codex) and `pstack-sol` on the same detailed workout-tracker requirements. Both profiles use the same model, reasoning effort, 15-minute limit, and thread/depth limits. Three repetitions per workflow give six planned attempts. This is an authored product-building task, separate from historical bug replays.

## What agents build

A Nuxt application with workout creation, multiple exercise rows, dates, notes, validation, calculated training volume, chronological history, editing, confirmed deletion, and IndexedDB persistence. The brief also requires mobile usability, accessible control names, storage-error handling, and no remote workout service. Read the complete solver brief in `tasks/nuxt-workout-tracker/PROMPT.md`.

The source is a blank Nuxt 4 starter with a pinned dependency lockfile and no workout implementation. Nuxt configuration and dependencies are frozen; candidates can change production files under `app/`. This measures creating product behavior from a fixed starter, **not** scaffolding from an empty directory or choosing dependencies. Nuxt retains server rendering, so browser storage must be accessed safely. See [Nuxt rendering modes](https://nuxt.com/docs/4.x/guide/concepts/rendering).

## Qualify without model calls

```sh
pnpm test:workout
```

This prepares the Docker image, verifies that the blank base builds but fails the behavioral requirements, verifies the trusted reference, and rejects three incomplete implementations: missing persistence, incorrect volume, and edit cancellation that mutates the original. Evidence is written to `artifacts/workout-proof.json`. This is grader qualification, not a pstack result.

## Prepare a comparison

```sh
pnpm bench prepare --suite nuxt-workout
pnpm bench qualify --suite nuxt-workout
pnpm bench workflow pstack
pnpm bench plan --suite nuxt-workout --seed 42
```

The plan command prints its path. Use an explicitly selected authenticated profile for live calls:

```sh
BENCH_AUTH_FILE=/absolute/path/to/auth.json pnpm bench run --plan /path/printed/plan.json
pnpm bench report --plan /path/printed/plan.json
```

Keep all six attempts, including failures and timeouts. Do not rerun only disappointing attempts. The existing result viewer reports correctness, time, token observations, and workflow activation separately. Missing child token usage remains unknown. Three repetitions on one task are exploratory evidence, not a general ranking.

## Blind LLM code-quality judging

Code-quality preference is the primary exploratory outcome for this suite. After every planned solver attempt has a result, run:

```sh
BENCH_AUTH_FILE=/absolute/path/to/auth.json pnpm bench judge --plan /path/printed/plan.json
```

This makes six additional model calls: each of the three same-repetition pairs is reviewed in forward and reversed order. The judge uses `gpt-5.6-sol`, medium reasoning, pinned Codex 0.157.1, and a three-minute limit per review. The judge follows the backend recorded by the plan. A local plan uses a fresh native workspace, and a Docker plan uses a fresh container. Both paths disable skills, shell tools, delegation, plugins, apps, browser tools, computer use, and web search. Any tool use invalidates a native review. This is a code-only review, not a screenshot or runtime review. Structured output uses [Codex output schemas](https://learn.chatgpt.com/docs/non-interactive-mode).

The judge receives the original brief and complete production source reconstructed from the frozen base plus each candidate patch, with neutral A/B labels and line numbers. It never receives solver transcripts, workflow metadata, timings, tokens, or browser outcomes. Source comments can still reveal stylistic clues, so anonymity is not guaranteed. Source and requirement text are explicitly treated as untrusted review data.

The rubric assesses requirement coverage, code organization, Nuxt/Vue idioms, data reliability, and maintainability. Each dimension returns A, B, tie, or insufficient evidence, with a rationale and source citations from both candidates unless evidence is insufficient. The runner validates cited paths, line numbers, and exact quoted snippets. This validates grounding, not the truth of the reasoning. An overall preference has its own explanation rather than a computed numeric score.

Forward and reversed decisions are normalized back to workflow identities. Disagreement remains `order_disagreement`; it is not counted as a tie or resolved by cherry-picking. Reviews share the solver model and can share its biases. Six review calls are three paired observations, not six independent samples.

Artifacts under `plans/<plan-id>/judge/` include a frozen `judge-plan.json`, private numbered prompts, per-order structured results, and `report.json` plus a readable `report.md`. The report places blind preferences beside independent functionality and resource observations without combining them. The existing web results viewer continues to show deterministic correctness; open the separate Markdown judge report for code-quality findings. Raw model transcripts remain private ignored artifacts.

Failures, invalid citations, oversized packets, missing candidates, and interrupted reviews remain visible and are not automatically retried. A source packet over 180,000 serialized characters is marked unavailable rather than silently truncated. Timeout candidates are exported before classifying the solver outcome; their partial code can be reviewed but their timeout status is unchanged and the solver does not claim they passed browser checks. Existing historical timeout records without patches remain unavailable. Candidates outside the accepted source-only patch policy are not executed for judging.

Run `pnpm test:local`, `pnpm test:docker`, `pnpm test:runner`, and `pnpm test:judge` for model-free transport checks. The judge proof uses synthetic output and fake credentials for both backends. It provides no evidence of judge quality.

## Independent functionality and limitations

The production build is a separate check. The external Chromium grader prints seven named journey outcomes: initial/mobile state; multi-exercise calculation and IndexedDB persistence; ordering/edit/cancel behavior; validation; deletion; open errors; and write errors with retry. It uses public labels from the brief, without prescribing database names, component structure, or CSS classes. Each journey starts with an isolated browser context. The grader runs against the production server and stays outside the solver workspace.

Overall correctness requires every check to pass. Named journey outcomes aid diagnosis; they are not seven independent benchmark samples. Reload, a new page, and inspection of populated IndexedDB stores establish persistence evidence. This does not test browser-process restart, migrations, multi-tab concurrent edits, or crash recovery. The storage tests inject open/write failures; they do not exhaust every browser failure mode.

Visual polish, full keyboard/focus behavior, contrast, code maintainability, and exhaustive compliance with every sentence of the brief are not scored by this deterministic grader. Mobile overflow is checked in the initial editor. For a qualitative review, blind the workflow identity and use the same rubric for every attempt: requirement coverage, visual hierarchy, accessibility, and code organization. Keep that review separate from correctness, and retain its evidence. The blind code judge above provides an explicitly subjective code review; it does not replace the browser grade or establish visual quality.

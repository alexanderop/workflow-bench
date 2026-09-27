---
title: 'Architecture and provenance'
description: 'Architecture and provenance in Workflow Bench.'
---

## Small modules with explicit responsibilities

| Directory                                     | Responsibility                                                  |
| --------------------------------------------- | --------------------------------------------------------------- |
| `packages/core`                               | Boundary schemas, fingerprints, catalog, statistics             |
| `packages/local`                              | Native macOS workspaces, toolchain identity, and sandbox policy |
| `packages/docker`                             | Process and container lifecycle, inference proxy                |
| `packages/codex`                              | Isolated authentication, installation, execution, evidence      |
| `packages/runner`                             | Preparation, qualification, planning, execution, reporting      |
| `packages/judge`                              | Optional blind pairwise code review, separate from acceptance   |
| `apps/cli`                                    | Command parsing and Effect runtime                              |
| `apps/docs`                                   | Astro Starlight guide and Vue report viewer                     |
| `tasks`, `workflows`, `experiments`, `suites` | Declarative experiment inputs                                   |

The root uses strict TypeScript and Effect Schema at persisted-data boundaries. Effect coordinates CLI operations and scoped plan-lock release. The local adapter creates and removes temporary macOS workspaces. Docker adapters use explicit cleanup for containers and networks. Vue owns simple viewer state.

The installed Effect release is pinned. Its source uses `Schema.TaggedError` and `Config.String`; these differ from some earlier v4 examples. Follow the installed package rather than copying old snippets.

## Inspiration, not a Supabase fork

[Supabase Evals](https://github.com/supabase/evals) provides the useful separation between scenarios, experiments, runtimes, and scorers. This repository implements a new local runner oriented around source patches, independent grading, subscription login, and workflow comparisons. Its default backend runs native macOS processes. Its optional Docker backend retains container execution. It does not require a Supabase service.

The reference inspected during development was commit `36ae6ab6db1a05df44a2cd1bc7f380c7516c21d4`. No Supabase runtime source is bundled.

The VueUse and npmx fixtures retain their upstream licenses and attribution. The npmx fixture replays only the accepted changelog URL helper change, with independently authored Node checks. Each fixture records its source revision and upstream issue or pull request in its own `PROVENANCE.md`. The receipt fixture is authored for teaching. Workflow source is fetched at configured pins and retains each upstream project's license.

## Extension boundaries

A new task should not modify the Codex adapter. A new workflow should not modify the grader. A new harness would implement its own authentication, invocation, and evidence adapter while preserving result semantics. Only Codex is implemented today.

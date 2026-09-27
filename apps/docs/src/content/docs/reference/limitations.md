---
title: 'What this release does not prove'
description: 'What this release does not prove in Workflow Bench.'
---

## Corpus size

Eight shipped fixtures include an educational receipt example, a VueUse browser regression, a bounded npmx helper replay, four Reka UI component regressions, and an authored Nuxt workout tracker task. They cannot rank workflows generally.

The six upstream tasks are public historical replays, with possible training contamination. The npmx helper task does not test the full application. Reka's imported upstream tests run actual Vue components in Vitest and jsdom. They do not establish real-browser or assistive-technology behavior. Four tasks from one library are correlated, so a six-task average is not a repository-balanced estimate.

## Treatment boundaries

Runs are autonomous and source-only. No scripted stakeholder, interactive design approval, dependency upgrades, or unrestricted repository modifications are supported. Workflow entrypoints are named recipes. Results apply to those recipes and constraints.

Prepared task snapshots replace upstream Git history with one synthetic baseline commit. History-analysis steps cannot use original repository history. The restriction is shared by both arms, but these runs do not measure the value of history-aware workflow steps in an ordinary checkout.

## Measurement boundaries

Time limits are enforced, aggregate token ceilings are not. The local backend does not impose portable CPU, memory, or process quotas. Root usage comes from Codex events. Child totals require identifiable session records; incomplete totals stay unknown. Model labels can evolve upstream. Activation parsing is best-effort and currently recognizes successful file reads.

The dashboard reports descriptive rates and task-bootstrap intervals for compatible pairs, not a universal leaderboard. Small numbers of tasks do not justify strong statistical conclusions. The ordinary result viewer does not include the optional blind pairwise code review or live token-price estimates.

## Local backend boundaries

The local backend is for trusted macOS development runs. It starts each attempt and grade from a fresh clone of a prepared dependency cache. It keeps trusted grader files and the reference patch outside the solver workspace and gives Codex a fresh home. These filesystem boundaries reduce accidental contamination. They do not make the host safe for hostile candidate code.

Native execution shares the host kernel, user account, network, process table, and machine load. Named Codex permissions and the selected macOS sandbox policy restrict task tools, but they do not provide Docker's namespaces, dropped Linux capabilities, or cgroup limits. Do not claim that local and Docker timing are interchangeable. Do not run untrusted tasks with the local backend.

Native tools and the browser can reach services on the host's loopback interface. Localhost access is needed for development servers, but it is broader than container-local networking. Direct external network access remains blocked; the native boundary is not equivalent to Docker network isolation.

Native subprocess cleanup handles process groups and detached children that retain the runner's inherited process marker. A deliberately hostile process that removes that marker can evade this cooperative cleanup. Docker removes the entire container at release. Native execution remains a trusted-task development backend.

The local environment identity records the platform, architecture, OS release, Node, pnpm, Codex, prepared snapshot hash, and sandbox policy version. That identity does not capture every installed system library, background process, thermal condition, or network condition.

Native cache inventory reports logical file sizes. APFS cloning, compression, and shared blocks mean the reported orphan bytes are not a promise about physical disk space reclaimed by pruning.

The independent native grader can launch Playwright Chromium under a separate restricted Seatbelt policy. For browser-prepared tasks, the local runner starts a brokered browser outside the solver sandbox and provides `BENCH_BROWSER_WS_ENDPOINT`; solver code can attach with Playwright's `chromium.connectOverCDP(endpoint)`. Arbitrary `chromium.launch()` calls inside the named Codex permission profile remain blocked because Chromium cannot register its required Mach service. Existing suites that launch their own browser need endpoint support before they work as local solver feedback. Use Docker when that unsupported launch path is part of the workflow under study.

## Docker backend boundaries

Docker isolation reduces accidental contamination. It is not a hardened hostile-code evaluation service. The local host and Docker daemon are trusted. Browser tasks use the architecture of the local Docker engine; do not pool timing from different architectures.

Prepared images pin their resulting content IDs. Source Node tags and package registries can change across rebuilds, so cross-machine reproducibility requires exporting the qualified image or pinning base digests and retaining all relevant artifacts.

The optional blind pairwise judge follows the backend recorded by the plan. Native judging shares the local backend boundaries above. Docker judging uses the container boundary described in this section. Both judge paths disable tools and treat any observed tool use as an invalid code-only review.

## Delivery boundaries

The guide and viewer are static snapshots. Restart after new results. Account authentication is local and dedicated. Public CI/API authentication, automated candidate discovery, live streaming UI, and interactive workflow evaluation are future extensions.

A successful smoke run establishes integration, not workflow superiority. Keep that distinction in every report.

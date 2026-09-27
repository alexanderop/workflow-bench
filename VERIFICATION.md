# Local verification

Verified on 2026-09-26. This file records implementation checks and the provenance of measured comparisons.

All measured comparisons below used the Docker backend. The native macOS backend was added later. Its model-free proof and any new local smoke run are separate evidence and do not change the recorded Docker outcomes, timings, or plan identities.

- `pnpm verify`: strict TypeScript, Astro/Vue checks, Oxlint, unit tests, and the static Starlight build.
- `pnpm test:local`: model-free native macOS preparation, qualification, sandbox, fresh-workspace, fake transport, timeout, and cleanup proof.
- `pnpm test:docker`: real Docker baseline/reference qualification, rejected round-down mutant, and clean-container assertions.
- `pnpm test:workflows`: native pstack and Superpowers plugin installation plus Pocock engineering skill installation in isolated containers. No model calls; activation during a real turn is not established by this check.
- `pnpm test:runner`: deterministic fake-Codex transport proof exercising solver startup, candidate export, offline grading, usage parsing, refreshed fake credentials, and cleanup. Its artifacts are separate from the report corpus and are not model evidence.
- `pnpm bench prepare --task vueuse-element-size` and `pnpm bench qualify --task vueuse-element-size`: actual Chromium regression fails on baseline with the expected assertion and passes with the trusted reference; existing directive behavior passes.
- `pnpm bench prepare --task npmx-changelog-urls` and `pnpm bench qualify --task npmx-changelog-urls`: actual upstream TypeScript helper fails the new-provider assertions on baseline and passes the accepted helper patch, while existing providers remain correct.
- `pnpm test:upstream`: the VueUse directive-only partial fix and an npmx fix missing Gitee support both fail independent regression checks.
- Browser proof: followed the quickstart link; searched for qualification and opened the matching guide; changed the calculator through keyboard input and observed 156 attempts / 39 hours; selected the eight-cell plan; inspected desktop and 390px mobile layouts with no document overflow.

Local evidence is under ignored `artifacts/` and `.bench/`. The result viewer contains prepared smoke and four-workflow plans plus the completed, authenticated pstack-versus-vanilla pilot. No completed attempts are fabricated.

## Native macOS backend proof

On 2026-09-27, `pnpm test:local` passed without a model call. It reused an identical prepared snapshot, qualified the receipt baseline and reference, and rejected the round-down mutant. It also rejected manifest edits and denied task-tool access to credentials, Codex configuration, hidden graders, reference patches, sibling files, escaping symlinks, and direct outbound networking.

The 14 checks confirmed fresh attempt and grading workspaces, separate filesystem and network policies, descendant cleanup after normal exit and timeout, retained timeout artifacts, pstack installation, usage parsing, and fake credential refresh. The fake native judge accepted valid structured output and rejected tool use and timeout. Synthetic fake-solver and fake-judge results are transport evidence only. They are not measured workflow results. The environment identity and full model-free evidence are retained in ignored `artifacts/local-proof.json`.

The native workout grader also launched real Playwright Chromium under its separate restricted Seatbelt policy. The broken base built successfully and produced the expected `WORKOUT_NOT_ASSESSED` browser result. The trusted reference built successfully and passed all seven browser journeys. Direct Chromium launch remains unsupported under the stricter named Codex permission profile. Browser-prepared solver attempts now receive a brokered CDP endpoint, but existing suites must explicitly attach to it rather than launch their own process. Independent browser grading does not depend on that solver integration.

## Authenticated native smoke

The final native migration checks passed with `pnpm verify` (25 unit tests), `pnpm test:local` (14 model-free checks), and `pnpm test:docker`. `pnpm format:check` reports formatting in `suites/nuxt-workout.json` and `tasks/nuxt-workout-tracker/task.json`; those task definitions were left unchanged by the migration.

Plan `plan-7d1c2fb6-410d-4d22-9253-c9b7f78cbfe5` ran one `receipt-rounding` attempt with the native macOS backend and the explicitly selected existing Codex subscription profile. Plain Codex used `gpt-5.6-sol` with medium reasoning. The attempt resolved both independent checks in 46,768 ms. It recorded 73,544 root tokens, zero child tokens, and zero completed children.

The plan, result, patch, private execution evidence, and report are retained under `.bench/local-migration/live/`. This one-task smoke establishes authenticated native execution, candidate export, independent grading, and reporting. It does not compare workflows or establish a completion rate beyond this attempt.

The rendered results viewer showed the local backend label and the expanded attempt evidence. The browser check used agent-browser because computer-use automation reported no available browser surfaces. The inspected screenshot and accessibility text are retained as `artifacts/native-results.png` and `artifacts/native-results.txt`.

## CLI controls and native browser feedback

On 2026-09-27, the operational improvements passed `pnpm verify` with 34 tests, the 15-check native proof, Docker qualification proof, and Docker transport/cancellation proof. Cancellation retained an edited candidate, left unstarted cells pending, and created a linked retry plan without modifying the original result. Native cleanup tests covered ordinary and detached descendants after normal exit, timeout, and cancellation. Docker cancellation froze detached writers before exporting the patch. No model calls were made for these checks.

`artifacts/native-browser-proof.json` records actual localhost interaction, IndexedDB write/read, a positive workspace-file read, protected-file denial through browser CDP file access, external-network denial, and Chromium PID cleanup. It names the tested runtime policy separately from the cached snapshot identity. `artifacts/runner-proof.json` includes the cancelled Docker transport result, and `artifacts/local-proof.json` includes cancellation and retry lineage.

The CLI smoke created a plan with frozen model/reasoning/timeout/thread overrides and reported its two pending cells through `status`. A real `cache prune` preview identified one session-created orphan snapshot; `--apply` removed it while retaining the current prepared snapshot. The browser viewer displayed retry provenance and zero completed attempts for the separate no-model UI proof plan. Evidence is in `artifacts/controls-results.png`, `artifacts/controls-results.txt`, and `.bench/local-migration/`.

## Backend infrastructure benchmark

On 2026-09-27, after the browser broker and process-cleanup changes froze, `pnpm exec tsx scripts/performance-proof.ts` completed three alternating local/Docker pairs for `receipt-rounding` without model calls. Both backends qualified the broken baseline and trusted reference, and all six measured reference samples passed. The proof also confirmed that an existing output artifact cannot be overwritten. The final-runtime artifact is retained at `artifacts/performance/1790498061919-457b8c20-3c56-4f8e-b296-9907e16b52ec.json`.

Median local/Docker timings were 423.09/82.69 ms for warm preparation, 260.51/231.53 ms for the complete fresh-workspace lifecycle, and 820.34/817.98 ms for independent reference grading. The local arm used macOS arm64 with Node 24.21; the Docker arm used Linux arm64 with Node 22.23. This tiny cached task showed no native grading speed advantage. It measures infrastructure around a trusted reference, not solver latency or model quality; it does not flush operating-system or dependency caches, equalize the two operating systems, or represent a cold install. Native warm preparation includes snapshot and toolchain validation. Grading includes workspace creation, patch application, checks, and cleanup.

The larger application comparison completed on 2026-09-27 with `pnpm bench benchmark --work .bench/local-migration/browser --task nuxt-workout-tracker --repetitions 3`. Both backends qualified against the same task fingerprint, and all six measured samples passed the production Nuxt build and real Chromium workout journeys. No model calls were made. The final rerun had no concurrent repository verification, builds, or browser work from the agents. Raw measurements and check output are retained at `artifacts/performance/1790498499556-2ea81031-968e-4ee3-80ab-66b96555d39f.json`.

For this Nuxt task, median native/Docker timings were 4.018/0.145 seconds for warm preparation, 5.689/0.253 seconds for a fresh-workspace lifecycle, and 14.899/6.810 seconds for aggregate reference grading. Native grading took about 2.19 times as long in this run. These measurements do not support a native speed advantage for the current implementation. Snapshot validation and workspace copying are included in native setup; build and browser execution are included in grading but were not timed separately. The same macOS/Node 24 and Linux/Node 22 differences apply. Prepared snapshots, dependency caches, and Docker caches were reused, and disk space was limited. This is a three-pair infrastructure comparison of one trusted application reference, not a general claim about macOS versus Linux build performance.

The first Nuxt run remains at `artifacts/performance/1790498199611-14910d19-5a82-4e09-b314-1e3a3b5e724b.json`. All six samples passed, with native/Docker medians of 3.762/0.134 seconds for warm preparation, 5.501/0.243 seconds for workspace lifecycle, and 14.724/6.805 seconds for grading. Repository verification ran concurrently during its final pair. That run is retained as potentially affected by contention and is not pooled with the final rerun.

The earlier pre-cleanup measurement remains at `artifacts/performance/1790497355450-def24349-a9a6-4849-beee-c3a4f6a5626e.json`. Its median local/Docker timings were 280.89/34.70 ms for warm preparation, 145.75/151.74 ms for workspace lifecycle, and 510.22/490.28 ms for grading. It used an earlier runtime fingerprint and is retained as historical evidence, not pooled with the final-runtime samples.

The process-lifecycle checks reproduced a detached descendant surviving ordinary process-group cleanup, then confirmed its removal with inherited execution-lease tracking. Focused tests passed for detached descendants on both normal root exit and cancellation, prevented delayed file writes, and retained partial command output. Cleanup now completes before the command promise resolves. A descendant that deliberately removes the inherited lease is outside this cleanup guarantee; the native sandbox remains a separate enforcement boundary.

## Authenticated pilot

Executed plan `plan-de0b5070-fcc2-40da-8487-0e81fe7df2a7` on 2026-09-26 using the explicitly selected existing local subscription profile. All twelve attempts have terminal records: vanilla solved 5/6, pstack Poteto solved 3/6. Both passed npmx 3/3; vanilla passed VueUse 2/3 and pstack timed out 3/3. Median solver elapsed time was 109.7 seconds for vanilla and 766.2 seconds for pstack. There were no authentication, provider, unsupported-configuration, or infrastructure errors, and no missing attempts or retries. Benchmark containers and networks were cleaned up.

The [pilot report](apps/docs/src/content/docs/start/pilot-results.md) records controls, individual attempts, interpretation, and reproduction commands. This two-task result does not establish a general workflow ranking. Pstack's native plugin installation and live child-agent activity were observed, but automatic explicit-skill-read activation remains unknown. Inherited session identities prevent reliable child-token attribution; completed-child counts are not reliable delegation totals for this dataset. Timed-out turns have no terminal root usage or graded candidate. No total-token cost comparison is claimed.

After adding the report, `pnpm verify` and `pnpm format:check` passed. Browser verification opened the rendered pilot report, followed its results-viewer link, and confirmed 12 attempts, 6/6 recorded per arm, the 50%/83% rates, all task rows, and zero excluded pairs. The earlier failed-candidate inspection exposed its independent check results and patch. A report screenshot and final results snapshot are retained under `artifacts/pilot/`.

## Four-case expansion and combined report

All four Reka cases were prepared and qualified against frozen source revision `719d59af17978eb1e1fe547256501ac960e1a1a4`. Each baseline failed exactly the intended regression while its neighboring tests passed. Accepted reference fixes passed 6 Tooltip, 20 DismissableLayer, 21 RadioGroup, and 41 NumberField tests, plus separate existing-behavior controls. `pnpm test:reka` rejects four incomplete fixes through the intended behavioral assertions; evidence is in `artifacts/reka-mutants.json`.

Executed all 24 cells of plan `plan-921a5f0f-fbc1-463b-8f1d-7a6b12372037` with the unchanged plain-sol/pstack-sol definitions. Vanilla solved 12/12 and pstack solved 11/12; pstack's one unsuccessful new attempt was a touch-dismissal timeout. There were no missing attempts, automatic retries, or infrastructure/authentication errors. The Docker solver containers and networks were cleaned up.

`pnpm report:expanded` validates both source plans, identical experiment definitions and workflow snapshots, disjoint task identities, and all 18 matched pairs before producing `artifacts/expanded-comparison.json` and the [six-case report](apps/docs/src/content/docs/start/expanded-results.md). An independent artifact audit checked all 36 result-to-plan identities and candidate hashes, successful check counts, all four qualification records, and their mutation evidence. Combined outcomes are vanilla 17/18 and pstack 14/18; medians are 64.3s and 558.8s. The original pilot records were preserved.

Limitations include six selected tasks with four from one library, synthetic Git history, sequential batches, unknown child-token attribution, and a Tooltip fixture-cleanup difference between local solver tests and independent grading. The report explains these rather than attributing every timing difference to workflow overhead. `suites/six-case.json` supports a future fresh 36-attempt replication; this comparison uses the two recorded batches.

The corpus now contains the receipt teaching task and six upstream cases across VueUse, npmx, and Reka UI. Broader npmx application behavior is outside the helper task. Reka grading uses Vue components in jsdom, not real-browser proof. The guide describes the source-only/autonomous constraints and other limitations.

Final expansion checks passed: `pnpm verify` (18 tests, strict type checks, lint, and guide build) and the 36-attempt artifact audit. Browser verification opened the combined report, followed its results navigation, selected both measured plans, and inspected the new timeout. The viewer showed 12 pairs / 4 tasks / zero excluded for the expansion and 6 pairs / 2 tasks / zero excluded for the pilot. Reload restored the complete 24-attempt view. Desktop and 390px report screenshots were inspected; the mobile document width was 390px with no page overflow. Evidence is retained under `artifacts/expanded/`.

The Astro build emits upstream MDX directive/i18n/sitemap warnings; generated pages, navigation, search, and the interactive calculator were checked in Chromium. No public site, GitHub repository, commit, or push was created.

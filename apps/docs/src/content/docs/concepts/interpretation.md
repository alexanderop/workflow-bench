---
title: 'Interpret results without fooling yourself'
description: 'Read coverage, paired completion, overhead, and diagnostic evidence separately.'
---

A completion rate describes the attempts with valid task outcomes. To understand an experiment, read that rate alongside the planned attempts, missing results, errors, and conditions under which the attempts ran.

## Read coverage first

Suppose a teaching example has ten planned receipt attempts, three recorded passes, and seven missing results. The report does not establish a ten-attempt success. This is an illustrative example, not a measured result.

The dashboard separates planned, recorded, evaluated, and error counts. An evaluated attempt has a `resolved`, `unresolved`, or `timeout` outcome.

| Outcome                   | Meaning                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| resolved                  | Candidate passed all independent checks                             |
| unresolved                | Acceptance or allowed-production-scope checks failed                |
| timeout                   | Solver exceeded the configured budget; counts as unsuccessful       |
| infrastructure_error      | Execution failed without a valid task outcome                       |
| auth_error / rate_limited | Account access prevented a valid comparison                         |
| unsupported               | Required workflow setup or controlled model conditions were not met |

The completion rate divides resolved attempts by evaluated attempts. Setup and account errors stay visible alongside that rate. Quote the coverage and error counts whenever you quote completion, because those errors can limit which attempts the rate describes.

Attempt duration includes workspace startup, workflow installation, and the Codex turn. Docker attempts also include container and network startup. It excludes preparation, qualification, and independent grading. The duration measures the full solve path, not pure inference latency.

## Compare paired differences

A pair compares the baseline and treatment on the same task and repetition. The viewer requires matching fixture fingerprints, environment identities, models, reasoning effort, CLI versions, and limits. Missing, incompatible, or unevaluated attempts do not form a valid pair and count as excluded.

Each pair contributes treatment completion minus baseline completion. A treatment-only pass contributes `+1`, a baseline-only pass contributes `-1`, and equal outcomes contribute `0`. These values explain the calculation; they are not observed results.

The viewer averages paired differences within each task, then averages those task means. Each task receives equal weight, so a heavily repeated receipt fixture does not dominate tasks with fewer repetitions.

With two or more distinct paired tasks, the viewer shows a deterministic bootstrap interval by resampling tasks. With very few tasks, that interval can be unstable or misleadingly narrow. Treat it as exploratory and inspect the per-task differences as you expand the corpus. One task never produces a confidence interval.

## Separate explanation from scoring

Workflow activation and task correctness are separate observations. A missing recognized skill read is marked **unknown**, not proof that the skill was unused. Native injection and transcript schema changes can hide activation from the parser.

Delegation counts and usage help explain cost. More children do not establish better work, and faster failures do not establish higher productivity. Missing child usage remains unknown. Subscription token counts are not a dollar bill.

The optional LLM quality review provides a separate code-quality preference. It does not replace deterministic acceptance or establish that tests passed. The [workout benchmark guide](/guides/workout-benchmark/) describes that review and its limits.

## A useful conclusion has a boundary

A useful report names the frozen corpus, configuration, paired completion difference, interval, and overhead. Those details tell the reader what the evidence covers.

A broad interval leaves the comparison inconclusive. If all workflows pass easy tasks, add harder tasks instead of inferring quality differences from the agents' prose. The teaching-only receipt fixture can show that the pipeline works; it cannot establish that one workflow is better at coding in general.

Use [fair comparison design](/concepts/fair-comparisons/) to set those boundaries before a study, and keep every planned attempt visible when you report the results.

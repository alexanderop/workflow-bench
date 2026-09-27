---
title: 'Compare pstack and other workflows'
description: 'Compare pstack and other workflows in Workflow Bench.'
---

Compare workflows by pinning each workflow source, then selecting experiment definitions that hold the remaining settings constant. Workflow definitions live in `workflows/*.json`; experiment definitions live in `experiments/*.json`.

For example, this command freezes a three-repetition comparison across the four shipped recipes:

```sh
pnpm bench plan --task receipt-rounding --experiments plain-sol,pstack-sol,superpowers-sol,pocock-sol --repetitions 3
```

`plan` prints the path to an immutable plan. It makes no model calls.

| Workflow    | Initial treatment                                                                     |
| ----------- | ------------------------------------------------------------------------------------- |
| plain       | No extra workflow installed                                                           |
| pstack      | Native Codex plugin, explicit poteto-mode                                             |
| superpowers | Native Codex plugin, using-superpowers plus systematic debugging                      |
| pocock      | Engineering skills installed through native skill discovery; diagnosing-bugs plus TDD |

The Pocock arm is a specific recipe. It does not represent every combination of Matt Pocock's skills. The Superpowers arm is an autonomous debugging treatment, not its full interactive product-design process.

## Pin a workflow

Workflow pins are exact commits, not moving branches. Fetch the configured pins before you plan:

```sh
pnpm bench workflow pstack
pnpm bench workflow superpowers
pnpm bench workflow pocock
```

<details>
<summary>Use a local workflow checkout</summary>

For a local pstack checkout at the pinned revision:

```sh
pnpm bench workflow pstack --source /absolute/path/to/pstack
```

The local option exports committed files at the exact configured revision. It never imports dirty edits. Existing workflow pins are not overwritten. Use a new `--work` directory for another workflow revision.

</details>

## Define a comparison

Copy an experiment JSON and change the workflow ID. Hold model, effort, Codex version, timeout, and thread and depth limits equal for a controlled comparison. The local backend requires a matching Codex executable and records its resolved path and version. The Docker builder installs Codex 0.157.1. Changing an experiment's CLI pin requires preparation and qualification with matching tooling.

The initial installer supports versioned Codex plugins and the pinned Pocock engineering-tree layout. A different repository layout needs an explicit adapter. Do not silently turn a whole framework into a pasted prompt.

## Evidence and model policy

Installation logs, recognized successful skill reads, and child-session summaries are retained. Activation is best-effort observation and does not replace outcome grading. Observed use of a different child model marks the controlled run unsupported; absence of a recorded model is still a measurement limit.

Your personal `~/.pstack/models.md` is never modified. Experiment-local pstack roles all use the selected model.

Read [fair comparisons](/concepts/fair-comparisons/) before changing more than one treatment setting. Use the [CLI reference](/reference/cli/) when you are ready to run the printed plan.

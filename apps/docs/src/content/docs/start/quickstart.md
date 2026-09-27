---
title: 'Your first qualified task'
description: 'Prove that the receipt grader rejects a broken implementation and accepts its reference, without a model call.'
---

Finish this tutorial with a qualified receipt task and a visible qualification record in the local viewer. You do not need a Codex login. These commands make no model calls.

## Prerequisites

Use macOS. Install Node.js 22.12 or newer, pnpm 10.28.2, Git, and the Codex CLI. Docker is optional. Run these commands from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm bench doctor
```

`doctor` reports the local tools, native sandbox availability, and profile presence. A missing authentication profile does not prevent this tutorial. Resolve a missing tool or sandbox before continuing.

## 1. Learn the grader without a model call

```sh
pnpm bench demo
```

The first preparation installs the task dependencies in a local cache. The demonstration then clones that prepared cache into separate fresh workspaces for the broken receipt implementation and the trusted reference.

When the command succeeds, the CLI prints this message:

```text
Demo proved: broken base fails, reference passes. This is qualification evidence, not a workflow ranking. Run pnpm dev and open /results/.
```

The baseline fails the `LINE_ROUNDING_REGRESSION` assertion. The reference passes both checks. If the command fails, use [troubleshooting](/guides/troubleshooting/) before proceeding. A failed installation does not qualify a task.

## 2. Inspect your qualification record

```sh
pnpm dev
```

Open the URL printed by Astro, then choose **Results**. Find the receipt qualification record. It confirms that the broken base failed and the reference passed.

The files live at `.bench/tasks/receipt-rounding/local/qualification.json` and `.bench/demo/qualification.json`. They describe grader qualification, not workflow scores. The qualification record includes the local environment identity. A fresh checkout has no solver results. If the checkout already contains experiments, those results remain visible alongside the new qualification record.

**You have finished when the CLI reports success and the viewer shows the receipt qualification.** You have checked the measuring instrument without asking a model to solve anything.

## Continue with a live comparison

[Run your first live comparison](/guides/live-comparison/) covers selecting your existing Codex login, freezing a two-attempt plan, and spending subscription allowance. [Expand the task suite](/guides/expand-suite/) covers VueUse and npmx after that pilot.

To run the same demonstration in Docker, use `pnpm bench demo --backend docker`. The two backends produce different environment identities and must remain separate in comparisons.

<span id="2-sign-in-with-your-subscription"></span>
<span id="3-freeze-a-small-comparison"></span>
<span id="4-run-the-printed-plan"></span>

The former login and run steps now live in [the live comparison guide](/guides/live-comparison/).

<span id="5-try-a-real-vueuse-regression"></span>
<span id="6-include-npmx"></span>

The former larger-suite steps now live in [the suite expansion guide](/guides/expand-suite/).

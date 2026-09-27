---
title: 'Expand the task suite'
description: 'Prepare and qualify VueUse and npmx before planning a larger comparison.'
---

Finish [a live receipt comparison](/guides/live-comparison/) first. The commands below prepare, qualify, and plan. They make no model calls. Running any resulting plan spends subscription allowance.

## 1. Try a real VueUse regression

```sh
pnpm bench prepare --suite vueuse
pnpm bench qualify --suite vueuse
pnpm bench plan --suite vueuse --repetitions 1
```

This suite compares four workflows on one real task. It is still a pilot, not enough independent tasks to establish a winner. Read [fair comparisons](/concepts/fair-comparisons/) before expanding.

## 2. Include npmx

```sh
pnpm bench prepare --suite ecosystem
pnpm bench qualify --suite ecosystem
pnpm bench plan --suite ecosystem --repetitions 1
```

This prepares two real upstream tasks and four workflow recipes, giving eight attempts at one repetition. The npmx task checks the actual TypeScript changelog URL helper with Node type stripping; it does not install or exercise the complete application. At the suite default of three repetitions, the plan contains 24 attempts.

Next, read [how Workflow Bench qualifies and grades a patch](/concepts/how-it-works/). Before you design a larger study, use the [experiment calculator](/concepts/lab/) and review [fair comparisons](/concepts/fair-comparisons/).

---
title: 'Why measure workflows?'
description: 'Separate workflow activity from independently verified task completion.'
---

Workflow Bench measures whether a coding workflow changes independently verified task completion under fixed conditions. Planning, delegation, review, and testing instructions all cost time and tokens. The experiment asks whether that cost produces better results on the tasks you chose.

> On these tasks, with the same model and limits, does adding this workflow change independently verified completion?

You select a task corpus, freeze an experiment and backend, run Codex, and inspect the attempts. The default backend uses native macOS workspaces. Docker is an explicit alternative. A positive result applies to that corpus and configuration. A local study cannot establish a universal best workflow.

## Begin with a small example

The `receipt-rounding` fixture calculates discounted line totals. Its baseline rounds the whole cart, but the requirement is to round each line before adding the totals.

Consider two one-cent lines, each discounted by 50%. Each line becomes half a cent and rounds up to one cent. The correct receipt total is two cents. Adding the half cents first and rounding once gives one cent.

A workflow might help the agent notice that distinction, write a regression test, or review the fix. Workflow Bench records what the agent did and checks its exported patch independently. A convincing explanation of rounding does not establish that the implementation works.

This is a teaching fixture. Its small scope makes the runner understandable, but cannot support conclusions about sophisticated workflows. The VueUse fixture introduces a real browser regression. A broader held-out corpus is needed before drawing conclusions about workflow quality.

## Four things that look similar but are different

An installed plugin, an activated skill, a completed child agent, and a passing patch answer different questions.

| Observation        | What it establishes                                       |
| ------------------ | --------------------------------------------------------- |
| Plugin installed   | The runtime can discover the package                      |
| Skill activated    | There is evidence the agent used the entrypoint           |
| Children completed | Delegation happened                                       |
| Acceptance passed  | The resulting production patch met the independent checks |

Acceptance is the primary task outcome. The other observations help explain that outcome without replacing it. For example, a workflow can activate successfully and still produce an incorrect rounding fix.

The same separation applies to missing evidence. If the runtime cannot establish child usage, the total is unknown. It is not zero.

[Run the demonstration](/start/quickstart/) to follow the receipt fixture, or read [how a run works](/concepts/how-it-works/) to see where the solver and grader separate.

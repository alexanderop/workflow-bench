---
title: 'Subscription authentication and backend boundaries'
description: 'Select a Codex subscription login and understand the local and Docker runtime boundaries.'
---

Workflow Bench uses file-backed Codex subscription credentials. The runner copies credentials into a fresh Codex home only after dependency preparation. It preserves refreshed credentials for the next run.

## Use your existing Codex login

Select the standard Codex profile explicitly:

```sh
BENCH_AUTH_FILE="$HOME/.codex/auth.json" \
pnpm bench run --plan /path/to/plan.json
```

This uses your existing ChatGPT subscription login. It requires no API key and no additional login. If you use a custom `CODEX_HOME`, select its `auth.json` instead.

The runner locks the selected file and writes refreshed credentials back to the same file. The lock coordinates Workflow Bench processes only. Do not run another credential-refreshing process against the same profile at the same time.

The selected profile must contain ChatGPT-managed access and refresh tokens. The adapter rejects keychain-only and external-token profiles because it cannot copy and refresh them through this file contract.

## Sign in when the local profile is absent

Run this command when `~/.codex/auth.json` is absent:

```sh
pnpm bench auth login
```

Complete the device login. The command uses the normal local Codex home and does not replace its existing `config.toml`. Omit `BENCH_AUTH_FILE` to use `~/.codex/auth.json`.

## Local backend boundary

The local backend is the default on macOS. Preparation installs dependencies once and publishes an immutable cache snapshot under `.bench/cache/local/`. Each qualification, solver attempt, and grade clones that snapshot into a fresh temporary workspace.

The runner gives a solver a fresh `HOME`, `CODEX_HOME`, `TMPDIR`, and `XDG_CACHE_HOME`. It sets `CI`, `PATH`, `PLAYWRIGHT_BROWSERS_PATH`, and `BENCH_REPO_ROOT` for the attempt. From the parent environment, it forwards only `LANG`, `LC_ALL`, `TERM`, and `COLORTERM` when present. It writes explicit Codex default permissions into the fresh configuration and fails when it cannot establish that policy. It does not use `--dangerously-bypass-approvals-and-sandbox`.

The native macOS sandbox allows writes in the attempt workspace and denies reads and writes to the source task definitions, hidden graders, reference patches, credentials, and sibling files. It also denies direct outbound network access from task tools. Codex receives inference access through its own native execution path.

These controls reduce accidental contamination and keep the grader outside the solver workspace. The processes still share your macOS kernel, user account, machine load, and process table. The local backend has no portable CPU, memory, or process quotas. Use it only for trusted tasks.

## Docker backend boundary

Select Docker during preparation, qualification, planning, or the demonstration:

```sh
pnpm bench prepare --suite smoke --backend docker
pnpm bench qualify --suite smoke --backend docker
pnpm bench plan --suite smoke --repetitions 1 --backend docker
```

The frozen plan selects Docker when you run or judge it. Do not add `--backend` to `run` or `judge`.

The Docker backend has these additional controls:

- Each attempt gets a fresh writable source tree and a fresh Codex home.
- No host workspace, personal memory directory, or Docker socket is mounted into the solver.
- Solver networking uses an internal Docker network and an HTTPS CONNECT proxy restricted to OpenAI inference and authentication hosts.
- The grader has no network and no account credentials.
- Containers have resource limits and dropped Linux capabilities.

Codex runs without its inner approval sandbox only inside this Docker boundary. The host runner does not execute candidate code outside Docker. This design does not defend against a malicious Docker daemon, kernel vulnerability, or deliberately hostile grader exploit.

## Logs and sharing

Raw execution events stay under the ignored `.bench` directory with private file permissions. The website exports validated result records, trusted grader output, and candidate patches. It does not load raw transcripts or credentials. Review patches and grading output before publishing a built report, especially for private tasks.

For authentication failures and stale credential locks, use [troubleshooting](/guides/troubleshooting/). For the exact artifact layout, see the [artifact reference](/reference/artifacts/).

## CI is a separate deployment decision

OpenAI's [account authentication guidance](https://learn.chatgpt.com/docs/auth/ci-cd-auth) describes trusted private automation, serialized credentials, and preserved refreshes. It excludes public and open-source repositories from that CI method. This release targets personal local runs and does not ship a subscription CI workflow or API-key adapter. Use Docker for model-free CI checks. A public CI workflow needs a separately implemented API authentication path.

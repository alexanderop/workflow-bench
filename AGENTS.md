# Workflow Bench

Use pnpm. Keep the runner in packages, the CLI in apps/cli, and the Astro Starlight guide plus Vue report viewer in apps/docs.

Run `pnpm verify` for implementation changes. Run `pnpm test:local` when changing native preparation, qualification, patch handling, grading, or macOS sandbox behavior. Run `pnpm test:docker` for the equivalent Docker changes. Both proofs make no model calls. Live Codex runs use the explicitly selected profile and are separate from ordinary checks.

Never turn example data into measured results. Qualify the broken base and trusted reference before solving. Keep graders and credentials outside the solver workspace. Retain every planned cell and attempt; missing child usage is unknown, not zero. Workflow activation and correctness are separate observations. Do not weaken a grader to make a workflow pass.

Update the guide whenever commands, artifact contracts, or limitations change. Preserve licenses and provenance on imported fixtures. Do not commit credentials or raw model transcripts.

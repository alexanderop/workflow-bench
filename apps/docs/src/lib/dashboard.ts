import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { root, exists, hash } from '../../../../packages/core/io'
import { normalizeQualification } from '../../../../packages/core/model'
import { plans, loadResults } from '../../../../packages/runner/experiment'
import { compare, summarize } from '../../../../packages/core/statistics'

export async function dashboard() {
  const work = resolve(process.env.BENCH_WORK ?? join(root, '.bench'))
  const studies = []
  for (const plan of (await plans(work)).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )) {
    const results = await loadResults(work, plan)
    const summary = summarize(plan, results)
    const baseline = summary.find(
      (s) =>
        plan.cells.find((c) => c.experiment.id === s.id)?.experiment
          .workflow === 'plain',
    )?.id
    const attempts = []
    for (const result of results) {
      const path = join(
        work,
        'plans',
        plan.id,
        'attempts',
        result.cellId,
        'candidate.patch',
      )
      let patch = ''
      if (result.candidateHash) {
        patch = await readFile(path, 'utf8')
        if (hash(patch) !== result.candidateHash)
          throw new Error(`Candidate hash mismatch for ${result.cellId}`)
      }
      // Provider logs, prompts and raw transcripts are intentionally not exported.
      attempts.push({
        ...result,
        message:
          result.outcome === 'resolved'
            ? 'Acceptance passed'
            : result.outcome === 'unresolved'
              ? 'Acceptance or scope check failed'
              : 'See private CLI artifacts for details',
        patch: patch.slice(0, 100000),
      })
    }
    studies.push({
      plan,
      environmentLabel: [
        ...new Set(
          plan.cells.map(({ environment }) =>
            environment.kind === 'local'
              ? `Local macOS ${environment.arch} · Node ${environment.nodeVersion}`
              : 'Docker',
          ),
        ),
      ].join(' / '),
      summary,
      attempts,
      comparisons: baseline
        ? summary
            .filter((s) => s.id !== baseline)
            .map((s) => compare(plan, results, baseline, s.id))
        : [],
    })
  }
  const demoPath = join(work, 'demo', 'qualification.json')
  const demo = (await exists(demoPath))
    ? normalizeQualification(JSON.parse(await readFile(demoPath, 'utf8')))
    : null
  return { studies, demo, generatedAt: new Date().toISOString() }
}
export type Dashboard = Awaited<ReturnType<typeof dashboard>>

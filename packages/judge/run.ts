import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Schema } from 'effect'
import { sameEnvironment, type Plan, type Result } from '../core/model.js'
import {
  exists,
  hash,
  message,
  now,
  readJson,
  writeJson,
  treeHash,
  root,
} from '../core/io.js'
import { loadResults } from '../runner/experiment.js'
import { currentPrepared, prompt } from '../runner/prepare.js'
import { inspectPatch } from '../runner/grade.js'
import { container, copyIn } from '../docker/container.js'
import { must } from '../docker/process.js'
import { withLocalWorkspace } from '../local/workspace.js'
import { invokeJudge, invokeLocalJudge, judgeProfile } from './invoke.js'
import {
  Verdict,
  consensus,
  dimensions,
  normalizeWinner,
  reviewPrompt,
  rubric,
  validateVerdict,
  verdictJsonSchema,
  type SourceFile,
  type Sources,
} from './rubric.js'

const SourceFiles = Schema.Array(
  Schema.Struct({ path: Schema.String, text: Schema.String }),
)
const Review = Schema.Struct({
  status: Schema.Literals(['completed', 'failed', 'unavailable']),
  inputHash: Schema.String,
  createdAt: Schema.String,
  error: Schema.NullOr(Schema.String),
  verdict: Schema.NullOr(Verdict),
  durationMs: Schema.NullOr(Schema.Number),
  tokens: Schema.NullOr(Schema.Number),
})
interface Review extends Schema.Schema.Type<typeof Review> {}
async function source(
  work: string,
  plan: Plan,
  result: Result,
): Promise<readonly SourceFile[]> {
  if (!result.candidateHash)
    throw new Error('No candidate artifact was exported')
  const prepared = await currentPrepared(
    work,
    result.taskId,
    result.environment.kind,
  )
  if (
    result.fingerprint !== prepared.fingerprint ||
    !sameEnvironment(result.environment, prepared.environment)
  )
    throw new Error('Candidate preparation no longer matches plan')
  const path = join(
    work,
    'plans',
    plan.id,
    'attempts',
    result.cellId,
    'candidate.patch',
  )
  const patch = await readFile(path, 'utf8')
  if (hash(patch) !== result.candidateHash)
    throw new Error('Candidate hash mismatch')
  inspectPatch(patch, prepared.task)
  const script = `const fs=require('fs'),cp=require('child_process');const paths=JSON.parse(process.argv[1]);const names=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\\0').filter(Boolean);const files=[...new Set(names)].filter(p=>paths.some(a=>p===a||p.startsWith(a+'/'))||['package.json','nuxt.config.ts','tsconfig.json'].includes(p)).sort();const data=files.filter(p=>fs.existsSync(p)).map(path=>({path,text:fs.readFileSync(path,'utf8')}));process.stdout.write(JSON.stringify(data));`
  if (prepared.locator.kind === 'local')
    return withLocalWorkspace(prepared, async (workspace) => {
      if (patch.trim()) {
        const candidate = join(workspace.tmp, 'candidate.patch')
        await import('node:fs/promises').then(({ copyFile }) =>
          copyFile(path, candidate),
        )
        const applied = await workspace.run('git', ['apply', candidate])
        if (applied.code !== 0) throw new Error(applied.stderr)
      }
      const output = await workspace.run(process.execPath, [
        '-e',
        script,
        JSON.stringify(prepared.task.allowedPaths),
      ])
      if (output.code !== 0) throw new Error(output.stderr)
      if (output.stdout.length > 180000)
        throw new Error(
          'Source packet exceeds judge limit; not truncated or silently scored',
        )
      return Schema.decodeUnknownSync(SourceFiles)(JSON.parse(output.stdout))
    })
  return container(prepared.locator.imageId, async (id) => {
    if (patch.trim()) {
      await copyIn(id, path, '/tmp/candidate.patch')
      await must('docker', ['exec', id, 'git', 'apply', '/tmp/candidate.patch'])
    }
    const text = await must('docker', [
      'exec',
      id,
      'node',
      '-e',
      `
      const fs=require('fs'),cp=require('child_process');
      const paths=JSON.parse(process.argv[1]);
      const names=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\\0').filter(Boolean);
      const files=[...new Set(names)].filter(p=>paths.some(a=>p===a||p.startsWith(a+'/'))||['package.json','nuxt.config.ts','tsconfig.json'].includes(p)).sort();
      const data=files.filter(p=>fs.existsSync(p)).map(path=>({path,text:fs.readFileSync(path,'utf8')}));
      process.stdout.write(JSON.stringify(data));`,
      JSON.stringify(prepared.task.allowedPaths),
    ])
    if (text.length > 180000)
      throw new Error(
        'Source packet exceeds judge limit; not truncated or silently scored',
      )
    return Schema.decodeUnknownSync(SourceFiles)(JSON.parse(text))
  })
}
async function judgeUnlocked(work: string, plan: Plan, authFile: string) {
  const results = await loadResults(work, plan)
  if (results.length !== plan.cells.length)
    throw new Error('Finish all planned solver attempts before judging')
  const experiments = [
    ...new Set(plan.cells.map((c) => c.experiment.id)),
  ].sort()
  if (experiments.length !== 2)
    throw new Error('Pairwise judging requires exactly two experiments')
  const [left, right] = experiments
  if (!left || !right) throw new Error('Missing experiments')
  const directory = join(work, 'plans', plan.id, 'judge')
  await mkdir(directory, { recursive: true })
  const groups = plan.cells
    .filter((c) => c.experiment.id === left)
    .map((c) => ({
      taskId: c.taskId,
      repetition: c.repetition,
      left: c.id,
      right: plan.cells.find(
        (other) =>
          other.taskId === c.taskId &&
          other.repetition === c.repetition &&
          other.experiment.id === right,
      )?.id,
    }))
  if (groups.some((g) => !g.right)) throw new Error('Unpaired solver cells')
  const frozen = {
    version: 1,
    planId: plan.id,
    profile: judgeProfile,
    implementationHash: await treeHash(join(root, 'packages/judge')),
    rubricHash: hash(rubric + JSON.stringify(verdictJsonSchema)),
    pairs: groups,
    candidates: results
      .map((r) => ({ cellId: r.cellId, hash: r.candidateHash }))
      .sort((a, b) => a.cellId.localeCompare(b.cellId)),
  }
  const manifest = JSON.stringify(frozen)
  const manifestPath = join(directory, 'judge-plan.json')
  if (await exists(manifestPath)) {
    if (
      JSON.stringify(JSON.parse(await readFile(manifestPath, 'utf8'))) !==
      manifest
    )
      throw new Error(
        'Judge inputs changed; existing judge plan cannot be overwritten',
      )
  } else await writeJson(manifestPath, frozen)
  const pairs = []
  for (const group of groups) {
    const first = results.find((r) => r.cellId === group.left),
      second = results.find((r) => r.cellId === group.right)
    if (!first || !second) throw new Error('Missing paired results')
    const pairId = `${group.taskId}-r${group.repetition}`
    let sources: Sources | null = null,
      unavailable: string | null = null
    try {
      sources = {
        A: await source(work, plan, first),
        B: await source(work, plan, second),
      }
    } catch (error) {
      unavailable = message(error)
    }
    const requirements = await prompt(group.taskId)
    const reviews: { order: readonly [string, string]; record: Review }[] = []
    for (const reversed of [false, true]) {
      const order: readonly [string, string] = reversed
        ? [right, left]
        : [left, right]
      const labelled =
        sources && (reversed ? { A: sources.B, B: sources.A } : sources)
      const input = labelled ? reviewPrompt(requirements, labelled) : ''
      const inputHash = hash(manifest + input + String(reversed))
      const target = join(directory, pairId, reversed ? 'ba' : 'ab')
      const recordPath = join(target, 'result.json')
      let record: Review
      if (await exists(recordPath)) {
        record = await readJson(recordPath, Review)
        if (record.inputHash !== inputHash)
          throw new Error('Judge packet changed since previous review')
        if (record.verdict && labelled)
          validateVerdict(record.verdict, labelled)
      } else {
        const interrupted = await exists(target)
        await mkdir(target, { recursive: true })
        const started = Date.now()
        record = {
          status: 'unavailable',
          inputHash,
          createdAt: now(),
          error: unavailable,
          verdict: null,
          durationMs: null,
          tokens: null,
        }
        if (interrupted)
          record = {
            ...record,
            status: 'failed',
            error:
              'Interrupted judge attempt retained; not automatically retried',
          }
        else if (labelled) {
          await writeFile(join(target, 'prompt.md'), input, { mode: 0o600 })
          await writeJson(join(target, 'schema.json'), verdictJsonSchema)
          console.log(
            `Judging ${pairId} ${reversed ? 'reversed' : 'forward'} (blind code-only)`,
          )
          try {
            const output =
              first.environment.kind === 'local'
                ? await invokeLocalJudge(
                    await currentPrepared(work, first.taskId, 'local'),
                    authFile,
                    target,
                    input,
                  )
                : await invokeJudge(
                    first.environment.imageId,
                    authFile,
                    target,
                    input,
                  )
            record = {
              ...record,
              durationMs: output.durationMs,
              tokens: output.tokens,
            }
            record = {
              ...record,
              status: 'completed',
              error: null,
              verdict: validateVerdict(output.value, labelled),
              durationMs: output.durationMs,
              tokens: output.tokens,
            }
          } catch (error) {
            record = {
              ...record,
              status: 'failed',
              error: message(error),
              durationMs: Date.now() - started,
            }
          }
        }
        await writeJson(recordPath, record)
      }
      reviews.push({ order, record })
      console.log(
        `${pairId} ${reversed ? 'ba' : 'ab'}: ${record.status}${record.error ? ` (${record.error})` : ''}`,
      )
    }
    const decisions = Object.fromEntries(
      [...dimensions, 'overall' as const].map((d) => {
        const winners = reviews.map((r) =>
          r.record.verdict
            ? normalizeWinner(r.record.verdict[d].winner, r.order)
            : null,
        )
        return [
          d,
          {
            forward: winners[0] ?? null,
            reversed: winners[1] ?? null,
            consensus: consensus(winners[0] ?? null, winners[1] ?? null),
          },
        ]
      }),
    )
    pairs.push({
      pairId,
      taskId: group.taskId,
      repetition: group.repetition,
      left: first.cellId,
      right: second.cellId,
      decisions,
      reviews,
      functionality: [first, second].map((r) => ({
        cellId: r.cellId,
        outcome: r.outcome,
        checks: r.checks.map((c) => ({
          name: c.name,
          assessment:
            c.assessment ??
            (c.exitCode === 0 && !c.timedOut ? 'passed' : 'failed'),
        })),
        durationMs: r.durationMs,
        rootTokens: r.rootTokens,
        childTokens: r.childTokens,
        activation: r.activation,
      })),
    })
  }
  const report = {
    ...frozen,
    createdAt: now(),
    pairs,
    notice:
      'Code-quality preferences are model judgments, separate from deterministic correctness. Order disagreement is retained. Same-model judging can share solver biases. A small pilot does not establish general superiority.',
  }
  await writeJson(join(directory, 'report.json'), report)
  const lines = [
    '# Blind code-quality comparison',
    '',
    report.notice,
    '',
    `Judge: ${judgeProfile.model}, ${judgeProfile.reasoningEffort}; workflow identity and runtime outcomes withheld from each fresh review.`,
    '',
    '| Pair | Forward | Reversed | Overall consensus |',
    '| --- | --- | --- | --- |',
    ...pairs.map(
      (p) =>
        `| ${p.pairId} | ${p.decisions.overall?.forward ?? 'unavailable'} | ${p.decisions.overall?.reversed ?? 'unavailable'} | ${p.decisions.overall?.consensus} |`,
    ),
  ]
  for (const p of pairs) {
    lines.push(
      '',
      `## ${p.pairId}`,
      '',
      '| Dimension | Forward | Reversed | Consensus |',
      '| --- | --- | --- | --- |',
      ...Object.entries(p.decisions).map(
        ([d, v]) =>
          `| ${d} | ${v.forward ?? 'unavailable'} | ${v.reversed ?? 'unavailable'} | ${v.consensus} |`,
      ),
      '',
      '### Independent functionality',
      '',
      ...p.functionality.map(
        (f) =>
          `- ${f.cellId}: **${f.outcome}**, ${(f.durationMs / 1000).toFixed(1)}s; root tokens ${f.rootTokens ?? 'unknown'}, child tokens ${f.childTokens ?? 'unknown'}; activation ${f.activation}.`,
      ),
    )
    for (const review of p.reviews) {
      lines.push(
        '',
        `### Review: A = ${review.order[0]}, B = ${review.order[1]}`,
        '',
      )
      if (!review.record.verdict) {
        lines.push(review.record.error ?? 'Unavailable')
        continue
      }
      lines.push(review.record.verdict.overall.rationale)
      for (const d of dimensions) {
        const a = review.record.verdict[d]
        lines.push(
          '',
          `**${d}: ${a.winner}** — ${a.rationale}`,
          '',
          ...a.evidence.map(
            (e) =>
              `- ${e.candidate}/${e.path}:${e.line}: ${JSON.stringify(e.quote)}`,
          ),
        )
      }
    }
  }
  await writeFile(join(directory, 'report.md'), lines.join('\n') + '\n')
  console.log(`Judge report: ${join(directory, 'report.md')}`)
  return report
}

export async function judgePlan(work: string, plan: Plan, authFile: string) {
  const directory = join(work, 'plans', plan.id, 'judge')
  await mkdir(directory, { recursive: true })
  const lock = join(directory, '.run-lock')
  await mkdir(lock)
  try {
    return await judgeUnlocked(work, plan, authFile)
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

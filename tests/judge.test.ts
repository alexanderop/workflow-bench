import { describe, expect, it } from 'vitest'
import {
  consensus,
  dimensions,
  normalizeWinner,
  reviewPrompt,
  validateVerdict,
  type Sources,
} from '../packages/judge/rubric.js'
const sources: Sources = {
  A: [
    {
      path: 'app/app.vue',
      text: 'const title = ref("")\nawait db.put(workout)',
    },
  ],
  B: [
    { path: 'app/app.vue', text: 'const title = ref("")\nawait save(workout)' },
  ],
}
const assessment = {
  winner: 'tie',
  rationale: 'Both use a reactive title.',
  evidence: [
    { candidate: 'A', path: 'app/app.vue', line: 1, quote: 'ref("")' },
    { candidate: 'B', path: 'app/app.vue', line: 1, quote: 'ref("")' },
  ],
}
const verdict = () => ({
  ...Object.fromEntries(
    dimensions.map((d) => [d, structuredClone(assessment)]),
  ),
  overall: { winner: 'tie', rationale: 'No meaningful difference.' },
})
describe('blind pairwise review', () => {
  it('accepts grounded citations and rejects invented evidence', () => {
    expect(validateVerdict(verdict(), sources).overall.winner).toBe('tie')
    const corrupted = JSON.parse(
      JSON.stringify(verdict()).replaceAll('ref(\\"\\")', 'invented code'),
    )
    expect(() => validateVerdict(corrupted, sources)).toThrow(
      'invalid citation',
    )
  })
  it('requires evidence from both implementations for a preference', () => {
    const value = {
      ...verdict(),
      maintainability: {
        ...assessment,
        winner: 'A',
        evidence: assessment.evidence.slice(0, 1),
      },
    }
    expect(() => validateVerdict(value, sources)).toThrow('both candidates')
  })
  it('does not turn reversed label wins into a consistent workflow winner', () => {
    const forward = normalizeWinner('A', ['plain', 'pstack'])
    const reverse = normalizeWinner('A', ['pstack', 'plain'])
    expect(consensus(forward, reverse)).toBe('order_disagreement')
    expect(consensus(forward, normalizeWinner('B', ['pstack', 'plain']))).toBe(
      'plain',
    )
    expect(consensus(null, forward)).toBe('unavailable')
    expect(consensus('insufficient_evidence', 'insufficient_evidence')).toBe(
      'insufficient_evidence',
    )
  })
  it('provides complete numbered code without workflow or outcome metadata', () => {
    const prompt = reviewPrompt('Create a tracker', sources)
    expect(prompt).toContain('2: await db.put(workout)')
    expect(prompt).not.toContain('pstack')
    expect(prompt).not.toContain('plain-sol')
  })
})

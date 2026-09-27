import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { root } from '../packages/core/io.js'
import { benchmark } from '../packages/runner/benchmark.js'

const collision = await mkdtemp(join(tmpdir(), 'workflow-bench-performance-'))
try {
  const output = join(collision, 'existing.json')
  await writeFile(output, 'retained evidence')
  await assert.rejects(benchmark(join(collision, 'unused-work'), { output }), {
    code: 'EEXIST',
  })
  assert.equal(await readFile(output, 'utf8'), 'retained evidence')
} finally {
  await rm(collision, { recursive: true, force: true })
}

const report = await benchmark(join(root, '.bench', 'performance'))
assert.equal(report.modelCalls, 0)
assert.equal(report.samples.length, 6)
assert.ok(report.preparation.every((record) => record.qualification?.qualified))
assert.ok(
  report.samples.every((sample) => sample.status === 'passed'),
  JSON.stringify(report.samples.filter((sample) => sample.status !== 'passed')),
)
assert.ok(report.medians.every((record) => record.successfulSamples === 3))
console.table(report.medians)

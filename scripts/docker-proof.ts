import assert from 'node:assert/strict'
import { join } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { root, writeJson, now } from '../packages/core/io.js'
import { prepare } from '../packages/runner/prepare.js'
import { qualify, grade } from '../packages/runner/grade.js'
import { container } from '../packages/docker/container.js'
import { must } from '../packages/docker/process.js'

const work = join(root, '.bench/docker-proof')
const prepared = await prepare(work, 'receipt-rounding', console.log, 'docker')
if (prepared.locator.kind !== 'docker')
  throw new Error('Expected Docker preparation')
const qualification = await qualify(work, 'receipt-rounding', 'docker')
assert.equal(qualification.qualified, true)
const reference = await readFile(
  join(root, 'tasks/receipt-rounding/reference.patch'),
  'utf8',
)
const mutant = reference.replace(
  'Math.round(item.unitCents * item.quantity * (100 - item.discountPercent) / 100)',
  'Math.floor(item.unitCents * item.quantity * (100 - item.discountPercent) / 100)',
)
await mkdir(join(work, 'proof'), { recursive: true })
const path = join(work, 'proof', 'mutant.patch')
await writeFile(path, mutant)
const checks = await grade(prepared, path)
assert.ok(
  checks.some((c) => c.exitCode !== 0),
  'Incomplete rounding implementation must fail',
)
const isolation = await container(prepared.locator.imageId, async (id) => {
  const listing = await must('docker', [
    'exec',
    id,
    'node',
    '-e',
    "const fs=require('fs');console.log(JSON.stringify({auth:fs.existsSync('/home/node/.codex/auth.json'),grader:fs.existsSync('/tmp/grader'),socket:fs.existsSync('/var/run/docker.sock')}))",
  ])
  const value = JSON.parse(listing)
  assert.deepEqual(value, { auth: false, grader: false, socket: false })
  return value
})
await writeJson(join(root, 'artifacts', 'docker-proof.json'), {
  createdAt: now(),
  imageId: prepared.locator.imageId,
  qualification,
  mutant: checks,
  isolation,
})
console.log(
  'Docker proof passed: intended red baseline, green reference, rejected mutant, clean container.',
)

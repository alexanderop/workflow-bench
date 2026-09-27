import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root, now, writeJson } from '../packages/core/io.js'
import { prepare } from '../packages/runner/prepare.js'
import { grade, qualify } from '../packages/runner/grade.js'

const work = join(root, '.bench/workout-proof')
const prepared = await prepare(work, 'nuxt-workout-tracker')
const qualification = await qualify(work, 'nuxt-workout-tracker')
assert.equal(qualification.qualified, true)
const reference = await readFile(
  join(root, 'tasks/nuxt-workout-tracker/reference.patch'),
  'utf8',
)
const mutations = [
  [
    'no-persistence',
    'await (await open()).workouts.put(value)',
    'await Promise.resolve(value)',
  ],
  [
    'wrong-volume',
    'Number(e.sets)*Number(e.reps)*Number(e.weight)',
    'Number(e.reps)*Number(e.weight)',
  ],
  ['cancel-mutates-original', 'JSON.parse(JSON.stringify(w))', 'w'],
] as const
await mkdir(join(work, 'mutations'), { recursive: true })
const evidence = []
for (const [name, before, after] of mutations) {
  assert.ok(reference.includes(before))
  const path = join(work, 'mutations', `${name}.patch`)
  await writeFile(path, reference.replace(before, after))
  const checks = await grade(prepared, path)
  assert.ok(
    checks.find((c) => !c.regression)?.exitCode === 0,
    `${name} must build`,
  )
  assert.ok(
    checks.some(
      (c) =>
        c.regression &&
        c.exitCode !== 0 &&
        !c.timedOut &&
        c.output.includes('WORKOUT_REQUIREMENTS_FAILED'),
    ),
    `${name} must fail behavior grading`,
  )
  evidence.push({ name, checks })
}
await writeJson(join(root, 'artifacts/workout-proof.json'), {
  createdAt: now(),
  qualification,
  mutations: evidence,
})
console.log(
  'Workout proof passed: blank base fails, reference passes, three behavioral mutations rejected. No model calls.',
)

import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root, now, writeJson } from '../packages/core/io.js'
import { currentPrepared } from '../packages/runner/prepare.js'
import { grade } from '../packages/runner/grade.js'

const work = join(root, '.bench'),
  directory = join(work, 'upstream-mutants')
await mkdir(directory, { recursive: true })
const evidence = []
for (const id of ['vueuse-element-size', 'npmx-changelog-urls']) {
  const prepared = await currentPrepared(work, id, 'docker')
  const reference = await readFile(
    join(root, 'tasks', id, 'reference.patch'),
    'utf8',
  )
  const mutant =
    id === 'vueuse-element-size'
      ? 'diff --git' + reference.split('diff --git')[1]
      : reference.replace("case 'gitee':", "case 'giteee':")
  const path = join(directory, `${id}.patch`)
  await writeFile(path, mutant)
  const checks = await grade(prepared, path)
  assert.ok(
    checks.some((c) => c.regression && c.exitCode !== 0 && !c.timedOut),
    `${id}: incomplete implementation must fail a regression assertion`,
  )
  evidence.push({ id, environment: prepared.environment, checks })
  console.log(`${id}: incomplete fix rejected by independent behavior checks`)
}
await writeJson(join(root, 'artifacts/upstream-mutants.json'), {
  createdAt: now(),
  evidence,
})

import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root, now, writeJson } from '../packages/core/io.js'
import { currentPrepared } from '../packages/runner/prepare.js'
import { grade } from '../packages/runner/grade.js'

const mutations = [
  [
    'reka-tooltip-coordination',
    '+  useEventListener(document, TOOLTIP_OPEN',
    '+  useEventListener(document.body, TOOLTIP_OPEN',
  ],
  [
    'reka-dismissable-touch',
    '+}, layerElement, () => props.present)',
    '+}, layerElement, () => false)',
  ],
  [
    'reka-radio-accessible-name',
    '?.innerText : undefined)',
    "?.innerText ?? '' : undefined)",
  ],
  [
    'reka-number-field-deletion',
    "event.inputType.startsWith('delete') || event.inputType.startsWith('history')",
    "event.inputType.startsWith('history')",
  ],
] as const
const work = join(root, '.bench')
const directory = join(work, 'reka-mutants')
await mkdir(directory, { recursive: true })
const evidence = []
for (const [id, before, after] of mutations) {
  const prepared = await currentPrepared(work, id, 'docker')
  const reference = await readFile(
    join(root, 'tasks', id, 'reference.patch'),
    'utf8',
  )
  assert.ok(reference.includes(before), `${id}: mutation must change reference`)
  const path = join(directory, `${id}.patch`)
  await writeFile(path, reference.replace(before, after))
  const checks = await grade(prepared, path)
  assert.ok(
    checks.some(
      (c) =>
        c.regression &&
        c.exitCode !== 0 &&
        !c.timedOut &&
        new RegExp(prepared.task.expectedFailure).test(c.output),
    ),
    `${id}: mutant must fail the intended behavioral assertion`,
  )
  evidence.push({
    id,
    fingerprint: prepared.fingerprint,
    environment: prepared.environment,
    checks,
  })
  console.log(`${id}: incomplete fix rejected by the intended regression`)
}
await mkdir(join(root, 'artifacts'), { recursive: true })
await writeJson(join(root, 'artifacts/reka-mutants.json'), {
  createdAt: now(),
  evidence,
})

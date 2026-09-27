import assert from 'node:assert/strict'
import { join } from 'node:path'
import { loadWorkflow } from '../packages/core/catalog.js'
import { root, writeJson, now } from '../packages/core/io.js'
import { prepare } from '../packages/runner/prepare.js'
import {
  installWorkflow,
  workflowDirectory,
} from '../packages/runner/workflows.js'
import { container, copyIn } from '../packages/docker/container.js'
import { must } from '../packages/docker/process.js'

const work = join(root, '.bench')
const prepared = await prepare(work, 'receipt-rounding', console.log, 'docker')
if (prepared.locator.kind !== 'docker')
  throw new Error('Expected Docker preparation')
const evidence = []
for (const name of ['pstack', 'superpowers', 'pocock']) {
  const workflow = await loadWorkflow(name)
  const contentHash = await installWorkflow(work, name)
  const result = await container(prepared.locator.imageId, async (id) => {
    await copyIn(id, workflowDirectory(work, name), '/tmp/workflow')
    await copyIn(
      id,
      join(root, 'packages/codex/install.mjs'),
      '/tmp/install.mjs',
    )
    const install = await must('docker', [
      'exec',
      id,
      'node',
      '/tmp/install.mjs',
      workflow.installation,
      name,
      'gpt-5.6-sol',
    ])
    const files = await must('docker', [
      'exec',
      id,
      'find',
      '/home/node',
      '-name',
      'SKILL.md',
    ])
    assert.ok(
      files.includes(workflow.evidencePath),
      `Installed ${name} entrypoint must exist`,
    )
    const auth = await must('docker', [
      'exec',
      id,
      'node',
      '-e',
      "console.log(require('fs').existsSync('/home/node/.codex/auth.json'))",
    ])
    assert.equal(auth, 'false')
    return {
      name,
      contentHash,
      install: JSON.parse(install),
      skillFiles: files.split('\n').length,
      activationVerified: false,
    }
  })
  evidence.push(result)
  console.log(`${name}: native installation verified, no model call`)
}
await writeJson(join(root, 'artifacts/workflow-proof.json'), {
  createdAt: now(),
  imageId: prepared.locator.imageId,
  evidence,
})

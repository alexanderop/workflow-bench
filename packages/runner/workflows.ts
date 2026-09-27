import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadWorkflow } from '../core/catalog.js'
import { Workflow } from '../core/model.js'
import { Schema } from 'effect'
import { exists, treeHash, writeJson, readJson } from '../core/io.js'
import { must } from '../docker/process.js'

export const workflowDirectory = (work: string, id: string) =>
  join(work, 'workflows', id, 'source')
export async function installWorkflow(
  work: string,
  id: string,
  localSource?: string,
) {
  if (id === 'plain') return null
  const workflow = await loadWorkflow(id),
    destination = workflowDirectory(work, id)
  if (await exists(destination)) {
    if (localSource)
      throw new Error(
        'Workflow already pinned in this work directory; use a fresh --work directory',
      )
    const saved = await readJson(
      join(work, 'workflows', id, 'pin.json'),
      Schema.Struct({ workflow: Workflow, contentHash: Schema.String }),
    )
    const digest = await treeHash(destination)
    if (
      JSON.stringify(saved.workflow) !== JSON.stringify(workflow) ||
      digest !== saved.contentHash
    )
      throw new Error(
        'Pinned workflow inputs changed; use a fresh --work directory',
      )
    return digest
  }
  const staging = await mkdtemp(join(tmpdir(), 'workflow-bench-workflow-'))
  try {
    const source = join(staging, 'source')
    if (localSource) {
      const sha = await must('git', ['-C', localSource, 'rev-parse', 'HEAD'])
      if (sha !== workflow.revision)
        throw new Error('Local source HEAD differs from pinned revision')
      // Export committed files only, never the caller's dirty working tree.
      const archive = join(staging, 'source.tar')
      await must('git', [
        '-C',
        localSource,
        'archive',
        '--format=tar',
        '-o',
        archive,
        sha,
      ])
      await mkdir(source)
      await must('tar', ['-xf', archive, '-C', source])
    } else {
      await mkdir(source)
      await must('git', ['init', source])
      await must(
        'git',
        [
          '-C',
          source,
          'fetch',
          '--depth',
          '1',
          workflow.repository,
          workflow.revision,
        ],
        { timeoutMs: 300000 },
      )
      await must('git', ['-C', source, 'checkout', '--detach', 'FETCH_HEAD'])
      await rm(join(source, '.git'), { recursive: true, force: true })
    }
    const contentHash = await treeHash(source)
    await mkdir(join(work, 'workflows', id), { recursive: true })
    await cp(source, destination, { recursive: true, verbatimSymlinks: true })
    await writeJson(join(work, 'workflows', id, 'pin.json'), {
      workflow,
      contentHash,
    })
    return contentHash
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

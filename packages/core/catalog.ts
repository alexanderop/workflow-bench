import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Experiment, Id, Task, Workflow, decode } from './model.js'
import { readJson, root, treeHash, hash, within } from './io.js'

export const taskDirectory = (id: string) => join(root, 'tasks', decode(Id, id))
export const loadTask = (id: string) =>
  readJson(join(taskDirectory(id), 'task.json'), Task)
export const loadExperiment = (id: string) =>
  readJson(join(root, 'experiments', `${decode(Id, id)}.json`), Experiment)
export const loadWorkflow = (id: string) =>
  readJson(join(root, 'workflows', `${decode(Id, id)}.json`), Workflow)
export async function taskIds() {
  return (await readdir(join(root, 'tasks'), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
}
export async function experimentIds() {
  return (await readdir(join(root, 'experiments')))
    .filter((e) => e.endsWith('.json'))
    .map((e) => e.slice(0, -5))
    .sort()
}
export async function fingerprint(id: string) {
  const task = await loadTask(id)
  if (task.id !== id) throw new Error('Task directory and ID differ')
  if (!task.checks.some((c) => c.regression))
    throw new Error('A task needs a regression check')
  for (const p of task.allowedPaths) {
    within('/repo', p)
    if (p.startsWith('/') || p.includes('..'))
      throw new Error('Invalid allowed path')
  }
  new RegExp(task.expectedFailure)
  return hash(
    JSON.stringify({
      task: await treeHash(taskDirectory(id)),
      docker: await treeHash(join(root, 'packages/docker')),
      runner: await treeHash(join(root, 'packages/runner')),
      core: await treeHash(join(root, 'packages/core')),
      codex: await treeHash(join(root, 'packages/codex')),
      local: await treeHash(join(root, 'packages/local')),
      process: await treeHash(join(root, 'packages/process')),
      lock: hash(await readFile(join(root, 'pnpm-lock.yaml'))),
    }),
  )
}

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  type Check,
  type Prepared,
  type Task,
  Qualification,
} from '../core/model.js'
import { exists, now, writeJson } from '../core/io.js'
import { taskDirectory } from '../core/catalog.js'
import { container, copyIn } from '../docker/container.js'
import { execute, must } from '../docker/process.js'
import { currentPrepared, type Backend } from './prepare.js'
import { withLocalWorkspace } from '../local/workspace.js'

export function inspectPatch(patch: string, task: Task): string[] {
  if (!patch.trim()) return []
  if (
    /^((old|new) mode|new file mode (?!100644)|deleted file mode (?!100644)|rename (from|to)|copy (from|to)|GIT binary patch|Binary files)/m.test(
      patch,
    )
  )
    throw new Error(
      'Unsupported patch: modes, links, renames, or binary content',
    )
  const paths: string[] = []
  let current: string | null = null
  for (const line of patch.split('\n')) {
    if (line.startsWith('--- ') || line.startsWith('+++ ')) {
      const side = line.slice(4)
      const expected = (line.startsWith('--- ') ? 'a/' : 'b/') + current
      if (current === null || (side !== '/dev/null' && side !== expected))
        throw new Error('Patch file headers disagree')
    }
    if (!line.startsWith('diff --git ')) continue
    const match = /^diff --git a\/([^\s]+) b\/([^\s]+)$/.exec(line)
    if (!match || !match[1] || match[1] !== match[2])
      throw new Error('Invalid patch header')
    const path = match[1]
    current = path
    if (
      path.startsWith('/') ||
      path.split('/').some((p) => p === '..' || p === '.git') ||
      !task.allowedPaths.some((p) => path === p || path.startsWith(p + '/')) ||
      /(^|\/)(package\.json|.*lock.*|.*config.*|AGENTS\.md)$|\.(test|spec)\.|(^|\/)(__tests__|tests?)\//i.test(
        path,
      )
    )
      throw new Error(`Patch outside production scope: ${path}`)
    paths.push(path)
  }
  if (!paths.length) throw new Error('Patch has no recognized files')
  return paths
}
export function checkAssessment(
  code: number,
  timedOut: boolean,
  output: string,
): 'passed' | 'failed' | 'not_assessed' {
  if (code === 0 && !timedOut) return 'passed'
  if (output.includes('WORKOUT_REQUIREMENTS_FAILED:')) return 'failed'
  if (output.includes('WORKOUT_NOT_ASSESSED:')) return 'not_assessed'
  return 'failed'
}
export async function grade(
  prepared: Prepared,
  patchPath: string | null,
  signal?: AbortSignal,
): Promise<Check[]> {
  if (patchPath) inspectPatch(await readFile(patchPath, 'utf8'), prepared.task)
  if (prepared.locator.kind === 'local') {
    return withLocalWorkspace(prepared, async (workspace) => {
      if (patchPath && (await readFile(patchPath, 'utf8')).trim()) {
        const localPatch = join(workspace.tmp, 'candidate.patch')
        await import('node:fs/promises').then(({ copyFile }) =>
          copyFile(patchPath, localPatch),
        )
        const apply = await workspace.run('git', [
          'apply',
          '--check',
          localPatch,
        ])
        if (apply.code !== 0)
          return [
            {
              name: 'Patch applies to baseline',
              regression: false,
              exitCode: 1,
              timedOut: false,
              output: apply.stderr,
            },
          ]
        const applied = await workspace.run('git', ['apply', localPatch])
        if (applied.code !== 0)
          throw new Error(`Could not apply candidate patch: ${applied.stderr}`)
      }
      const hidden = join(taskDirectory(prepared.task.id), 'grader'),
        grader = join(workspace.tmp, 'grader')
      if (await exists(hidden))
        await import('node:fs/promises').then(({ cp }) =>
          cp(hidden, grader, { recursive: true, verbatimSymlinks: true }),
        )
      const tests = join(taskDirectory(prepared.task.id), 'tests.patch')
      if (await exists(tests)) {
        const localTests = join(workspace.tmp, 'tests.patch')
        await import('node:fs/promises').then(({ copyFile }) =>
          copyFile(tests, localTests),
        )
        const applied = await workspace.run('git', ['apply', localTests])
        if (applied.code !== 0)
          throw new Error(`Could not apply hidden tests: ${applied.stderr}`)
      }
      const checks: Check[] = []
      for (const check of prepared.task.checks) {
        const args = check.command
          .slice(1)
          .map((arg) =>
            arg
              .replaceAll('/repo', workspace.root)
              .replaceAll('/tmp/grader', grader),
          )
        const command = (check.command[0] ?? '')
          .replaceAll('/repo', workspace.root)
          .replaceAll('/tmp/grader', grader)
        const result = await workspace.runGrader(command, args, {
          timeoutMs: prepared.task.timeoutSeconds * 1000,
          ...(signal ? { signal } : {}),
        })
        checks.push({
          name: check.name,
          regression: check.regression,
          exitCode: result.code,
          timedOut: result.timedOut,
          output: (result.stdout + '\n' + result.stderr).slice(-60000),
          assessment: checkAssessment(
            result.code,
            result.timedOut,
            result.stdout + result.stderr,
          ),
        })
        if (result.timedOut || signal?.aborted) break
      }
      return checks
    })
  }
  const imageId = prepared.locator.imageId
  return container(imageId, async (id) => {
    if (patchPath && (await readFile(patchPath, 'utf8')).trim()) {
      await copyIn(id, patchPath, '/tmp/candidate.patch')
      const apply = await execute('docker', [
        'exec',
        id,
        'git',
        'apply',
        '--check',
        '/tmp/candidate.patch',
      ])
      if (apply.code !== 0)
        return [
          {
            name: 'Patch applies to baseline',
            regression: false,
            exitCode: 1,
            timedOut: false,
            output: apply.stderr,
          },
        ]
      await must('docker', ['exec', id, 'git', 'apply', '/tmp/candidate.patch'])
    }
    const hidden = join(taskDirectory(prepared.task.id), 'grader')
    if (await exists(hidden)) await copyIn(id, hidden, '/tmp/grader')
    const tests = join(taskDirectory(prepared.task.id), 'tests.patch')
    if (await exists(tests)) {
      await copyIn(id, tests, '/tmp/tests.patch')
      await must('docker', ['exec', id, 'git', 'apply', '/tmp/tests.patch'])
    }
    const checks: Check[] = []
    for (const check of prepared.task.checks) {
      const result = await execute(
        'docker',
        ['exec', '-e', 'CI=true', id, ...check.command],
        {
          timeoutMs: prepared.task.timeoutSeconds * 1000,
          ...(signal ? { signal } : {}),
        },
      )
      checks.push({
        name: check.name,
        regression: check.regression,
        exitCode: result.code,
        timedOut: result.timedOut,
        output: (result.stdout + '\n' + result.stderr).slice(-60000),
        assessment: checkAssessment(
          result.code,
          result.timedOut,
          result.stdout + result.stderr,
        ),
      })
      if (result.timedOut || signal?.aborted) break
    }
    return checks
  })
}
export function isQualified(
  base: readonly Check[],
  reference: readonly Check[],
  expected: string,
): boolean {
  return (
    base.some(
      (c) =>
        c.regression &&
        c.exitCode !== 0 &&
        !c.timedOut &&
        new RegExp(expected).test(c.output),
    ) &&
    base.every((c) => !c.timedOut && (c.regression || c.exitCode === 0)) &&
    reference.length === base.length &&
    reference.every((c) => c.exitCode === 0 && !c.timedOut)
  )
}
export async function qualify(
  work: string,
  id: string,
  backend: Backend = 'local',
): Promise<Qualification> {
  const prepared = await currentPrepared(work, id, backend)
  const base = await grade(prepared, null),
    reference = await grade(
      prepared,
      join(taskDirectory(id), 'reference.patch'),
    )
  const record: Qualification = {
    version: 2,
    fingerprint: prepared.fingerprint,
    environment: prepared.environment,
    qualified: isQualified(base, reference, prepared.task.expectedFailure),
    base,
    reference,
    createdAt: now(),
  }
  await writeJson(
    join(work, 'tasks', id, backend, 'qualification.json'),
    record,
  )
  const evidence = join(
    work,
    'tasks',
    id,
    backend,
    'qualification',
    record.createdAt.replaceAll(':', '-'),
  )
  await mkdir(evidence, { recursive: true })
  await writeFile(
    join(evidence, 'evidence.json'),
    JSON.stringify(record, null, 2),
  )
  if (!record.qualified)
    throw new Error(`Qualification failed for ${id}; inspect ${evidence}`)
  return record
}

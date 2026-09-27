import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  decode,
  Plan,
  Prepared,
  type Result,
  type Check,
} from '../packages/core/model.js'
import { root, within } from '../packages/core/io.js'
import { loadTask } from '../packages/core/catalog.js'
import { isQualified, inspectPatch } from '../packages/runner/grade.js'
import { validatePreparedIdentity } from '../packages/runner/prepare.js'
import { compare, summarize, shuffled } from '../packages/core/statistics.js'
import { parseEvents, sessionEvidence } from '../packages/codex/events.js'
import { withAuth } from '../packages/codex/auth.js'
import { execute } from '../packages/process/process.js'

const check = (overrides: Partial<Check> = {}): Check => ({
  name: 'regression',
  regression: true,
  exitCode: 0,
  timedOut: false,
  output: '',
  ...overrides,
})

describe('process lifecycle', () => {
  it('reaps descendants after the root process exits', async () => {
    const execution = await execute(process.execPath, [
      '-e',
      "const {spawn}=require('child_process');const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});console.log(child.pid);child.unref()",
    ])
    expect(execution.code).toBe(0)
    const pid = Number(execution.stdout.trim())
    expect(Number.isInteger(pid)).toBe(true)
    expect(() => process.kill(pid, 0)).toThrow()
  })
})

describe('prepared environment identity', () => {
  it('rejects a locator whose snapshot differs from the recorded environment', async () => {
    const task = await loadTask('receipt-rounding')
    const record = decode(Prepared, {
      version: 2,
      task,
      fingerprint,
      environment: {
        kind: 'local',
        platform: 'darwin',
        arch: 'arm64',
        osRelease: 'test',
        nodeVersion: 'v24.0.0',
        pnpmVersion: task.pnpmVersion,
        codexVersion: '0.157.1',
        snapshotHash: 'b'.repeat(64),
        sandboxPolicyVersion: 'native-macos-v1',
      },
      locator: {
        kind: 'local',
        cacheDirectory: '/tmp/cache',
        snapshotHash: 'c'.repeat(64),
        pnpmExecutable: '/tmp/pnpm',
        codexExecutable: '/tmp/codex',
      },
      preparedAt: '2026-09-27',
    })
    expect(() => validatePreparedIdentity(record)).toThrow(
      /identity and snapshot locator disagree/,
    )
  })
  it('rejects a changed runtime identity', async () => {
    const task = await loadTask('receipt-rounding')
    const environment = {
      kind: 'local' as const,
      platform: 'darwin' as const,
      arch: 'arm64',
      osRelease: 'test',
      nodeVersion: 'v24.0.0',
      pnpmVersion: task.pnpmVersion,
      codexVersion: '0.157.1',
      snapshotHash: 'b'.repeat(64),
      sandboxPolicyVersion: 'native-macos-v1',
    }
    const record = decode(Prepared, {
      version: 2,
      task,
      fingerprint,
      environment,
      locator: {
        kind: 'local',
        cacheDirectory: '/tmp/cache',
        snapshotHash: environment.snapshotHash,
        pnpmExecutable: '/tmp/pnpm',
        codexExecutable: '/tmp/codex',
      },
      preparedAt: '2026-09-27',
    })
    expect(() =>
      validatePreparedIdentity(record, {
        ...environment,
        nodeVersion: 'v25.0.0',
      }),
    ).toThrow(/differs from the current runtime/)
  })
})
const experiment = (id: string) => ({
  id,
  workflow: id,
  model: 'gpt-5.6-sol',
  reasoningEffort: 'medium' as const,
  codexVersion: '0.157.1',
  timeoutSeconds: 900,
  maxThreads: 4,
  maxDepth: 2,
})
const fingerprint = 'a'.repeat(64)
function fixture(tasks = ['one']) {
  return decode(Plan, {
    version: 2,
    id: 'plan-test',
    createdAt: '2026-09-26',
    seed: 1,
    cells: tasks.flatMap((taskId) =>
      ['plain', 'pstack'].map((id) => ({
        id: `${taskId}-${id}`,
        taskId,
        experiment: experiment(id),
        repetition: 1,
        fingerprint,
        environment: { kind: 'docker', imageId: 'sha256:image' },
        workflowHash: null,
      })),
    ),
  })
}
function result(plan: Plan, index: number, outcome: Result['outcome']): Result {
  const cell = plan.cells[index]
  if (!cell) throw new Error('Missing fixture cell')
  return {
    ...cell,
    cellId: cell.id,
    version: 2,
    planId: plan.id,
    outcome,
    message: '',
    startedAt: '2026-09-26',
    durationMs: 100,
    candidateHash: null,
    activation: 'unknown',
    rootTokens: null,
    childTokens: null,
    completedChildren: 0,
    checks: [],
  }
}
describe('qualification measures the grader', () => {
  it('accepts intended failure followed by passing reference', () =>
    expect(
      isQualified(
        [check({ exitCode: 1, output: 'expected regression' })],
        [check()],
        'expected regression',
      ),
    ).toBe(true))
  it('rejects setup errors, timeouts, and broken references', () => {
    expect(
      isQualified(
        [check({ exitCode: 1, output: 'missing browser' })],
        [check()],
        'expected regression',
      ),
    ).toBe(false)
    expect(
      isQualified(
        [check({ exitCode: 1, timedOut: true, output: 'expected regression' })],
        [check()],
        'expected regression',
      ),
    ).toBe(false)
    expect(
      isQualified(
        [check({ exitCode: 1, output: 'expected regression' })],
        [check({ exitCode: 1 })],
        'expected regression',
      ),
    ).toBe(false)
  })
  it('rejects failures in unrelated existing behavior', () =>
    expect(
      isQualified(
        [
          check({ exitCode: 1, output: 'regression' }),
          check({ regression: false, exitCode: 1 }),
        ],
        [check(), check({ regression: false })],
        'regression',
      ),
    ).toBe(false))
})
describe('production patch boundary', () => {
  it('accepts the reference and rejects tests, escaping paths, and links', async () => {
    const task = await loadTask('receipt-rounding')
    const patch = await readFile(
      join(root, 'tasks/receipt-rounding/reference.patch'),
      'utf8',
    )
    expect(inspectPatch(patch, task)).toEqual(['src/receipt.mjs'])
    expect(() =>
      inspectPatch(patch.replaceAll('src/receipt.mjs', '../receipt.mjs'), task),
    ).toThrow()
    expect(() =>
      inspectPatch(
        patch.replaceAll('src/receipt.mjs', 'src/receipt.test.mjs'),
        task,
      ),
    ).toThrow()
    expect(() =>
      inspectPatch(patch + '\nnew file mode 120000\n', task),
    ).toThrow()
    expect(() => within('/repo', '../auth.json')).toThrow()
  })
})
describe('complete and honest reporting', () => {
  it('rejects duplicate cells even before results exist', () => {
    const plan = fixture()
    expect(() =>
      summarize({ ...plan, cells: [...plan.cells, ...plan.cells] }, []),
    ).toThrow(/Duplicate/)
  })
  it('keeps missing and account failures out in the open', () => {
    const plan = fixture(['one', 'two'])
    const rows = [result(plan, 0, 'resolved'), result(plan, 1, 'auth_error')]
    const summary = summarize(plan, rows)
    expect(summary[0]).toMatchObject({
      planned: 2,
      completed: 1,
      missing: 1,
      resolved: 1,
      rate: 1,
    })
    expect(summary[1]).toMatchObject({
      planned: 2,
      errors: 1,
      evaluated: 0,
      rate: null,
    })
    expect(compare(plan, rows, 'plain', 'pstack')).toMatchObject({
      paired: 0,
      excluded: 2,
      delta: null,
    })
  })
  it('counts timeout as an unsuccessful evaluated attempt', () => {
    const plan = fixture()
    expect(summarize(plan, [result(plan, 0, 'timeout')])[0]).toMatchObject({
      evaluated: 1,
      rate: 0,
    })
  })
  it('refuses duplicate results and changed fingerprints', () => {
    const plan = fixture(),
      r = result(plan, 0, 'resolved')
    expect(() => summarize(plan, [r, r])).toThrow(/duplicate/)
    expect(() =>
      summarize(plan, [{ ...r, fingerprint: 'b'.repeat(64) }]),
    ).toThrow(/Mismatched/)
  })
  it('does not calculate uncertainty from repetitions on one task', () => {
    const plan = fixture()
    expect(
      compare(
        plan,
        [result(plan, 0, 'unresolved'), result(plan, 1, 'resolved')],
        'plain',
        'pstack',
      ),
    ).toMatchObject({ delta: 1, tasks: 1, interval: null })
  })
  it('compares compatible pairs and bootstraps tasks deterministically', () => {
    const plan = fixture(['one', 'two']),
      rows = plan.cells.map((_, i) =>
        result(plan, i, i % 2 ? 'resolved' : 'unresolved'),
      )
    expect(compare(plan, rows, 'plain', 'pstack')).toMatchObject({
      delta: 1,
      interval: [1, 1],
      tasks: 2,
    })
    const altered = decode(Plan, {
      ...plan,
      cells: plan.cells.map((c) =>
        c.experiment.id === 'pstack'
          ? { ...c, experiment: { ...c.experiment, model: 'other' } }
          : c,
      ),
    })
    expect(
      compare(
        altered,
        altered.cells.map((_, i) => result(altered, i, 'resolved')),
        'plain',
        'pstack',
      ).paired,
    ).toBe(0)
  })
  it('orders a plan reproducibly without dropping cells', () => {
    expect(shuffled([1, 2, 3, 4], 42)).toEqual(shuffled([1, 2, 3, 4], 42))
    expect(shuffled([1, 2, 3, 4], 42).sort()).toEqual([1, 2, 3, 4])
  })
})
describe('Codex evidence is not a correctness score', () => {
  it('requires a successful terminal event and distinguishes provider failures', () => {
    expect(
      parseEvents(
        '{"type":"turn.failed","error":{"message":"quota exceeded"}}',
        null,
      ).outcome,
    ).toBe('rate_limited')
    expect(
      parseEvents('{"type":"item.completed","item":{"text":"done"}}', null)
        .terminal,
    ).toBeNull()
  })
  it('failed shell reads are not activation proof', () => {
    const line = (exit_code: number) =>
      JSON.stringify({
        type: 'item.completed',
        item: {
          type: 'command_execution',
          command: 'cat /plugin/poteto-mode/SKILL.md',
          exit_code,
        },
      })
    expect(parseEvents(line(1), 'poteto-mode/SKILL.md').activated).toBe(false)
    expect(parseEvents(line(0), 'poteto-mode/SKILL.md').activated).toBe(true)
  })
  it('unknown child usage never becomes zero', () => {
    expect(sessionEvidence([], 'model').childTokens).toBeNull()
    expect(
      sessionEvidence(
        [
          {
            id: 'root',
            child: false,
            tokens: 10,
            complete: true,
            models: ['model'],
            spawned: ['missing'],
          },
        ],
        'model',
      ).childTokens,
    ).toBeNull()
    expect(
      sessionEvidence(
        [
          {
            id: 'root',
            child: false,
            tokens: 10,
            complete: true,
            models: ['model'],
            spawned: [],
          },
        ],
        'model',
      ).childTokens,
    ).toBe(0)
  })
})
describe('subscription lifecycle', () => {
  const auth = (token: string) =>
    JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: token, refresh_token: 'fake-refresh' },
    })
  it('does not leak malformed credential values into errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wb-auth-test-')),
      file = join(dir, 'auth.json')
    try {
      await writeFile(
        file,
        '{"secret":"DO-NOT-PRINT-THIS","auth_mode":"wrong"}',
      )
      await expect(withAuth(file, async () => {})).rejects.toThrow(
        'Invalid subscription authentication profile',
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('persists refreshes and releases its lock', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wb-auth-test-')),
      file = join(dir, 'auth.json')
    try {
      await writeFile(file, auth('old'))
      await withAuth(file, async (_, persist) => persist(auth('new')))
      expect(await readFile(file, 'utf8')).toBe(auth('new'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('refuses concurrent credential overwrite', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wb-auth-test-')),
      file = join(dir, 'auth.json')
    try {
      await writeFile(file, auth('old'))
      await expect(
        withAuth(file, async (_, persist) => {
          await writeFile(file, auth('external'))
          await persist(auth('runner'))
        }),
      ).rejects.toThrow(/concurrently/)
      expect(await readFile(file, 'utf8')).toBe(auth('external'))
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('rejects a second job using the same profile', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wb-auth-test-')),
      file = join(dir, 'auth.json')
    try {
      await writeFile(file, auth('old'))
      await mkdir(file + '.workflow-bench.lock')
      await expect(withAuth(file, async () => {})).rejects.toThrow(/locked/)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

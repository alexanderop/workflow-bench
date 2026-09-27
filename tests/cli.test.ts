import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { exists, root, writeJson } from '../packages/core/io.js'
import { normalizePlan } from '../packages/core/model.js'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  )
})

async function workspace() {
  const work = await mkdtemp(join(tmpdir(), 'wb-cli-'))
  temporary.push(work)
  return work
}

function cli(...args: string[]) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve, reject) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'apps/cli/main.ts', ...args],
        {
          cwd: root,
          env: { ...process.env, NO_COLOR: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 15_000,
        },
      )
      let stdout = '',
        stderr = ''
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
      })
      child.on('error', reject)
      child.on('close', (code) => resolve({ code, stdout, stderr }))
    },
  )
}

it('shows root help without running a command', async () => {
  for (const args of [[], ['--help'], ['help']]) {
    const result = await cli(...args)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Workflow Bench')
    expect(result.stdout).toContain('qualify')
    expect(result.stdout).toContain('cache')
  }
})

it('lists catalog data and plans as JSON in the chosen workspace', async () => {
  const result = await cli('list', '--work', await workspace())
  expect(result.code).toBe(0)
  const output = JSON.parse(result.stdout)
  expect(output.tasks).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'receipt-rounding' }),
    ]),
  )
  expect(output.experiments).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'plain-sol' })]),
  )
  expect(output.plans).toEqual([])
})

it('retains an orphan snapshot during preview and removes it only on apply', async () => {
  const work = await workspace()
  const snapshot = join(
    work,
    'cache',
    'local',
    'old-task',
    'a'.repeat(64),
    'b'.repeat(64),
  )
  await mkdir(snapshot, { recursive: true })
  await writeFile(join(snapshot, 'content.txt'), 'evidence')
  const preview = await cli('cache', 'prune', '--work', work)
  expect(preview.code).toBe(0)
  expect(JSON.parse(preview.stdout)).toMatchObject({
    applied: false,
    removed: [{ path: snapshot }],
  })
  expect(await readFile(join(snapshot, 'content.txt'), 'utf8')).toBe('evidence')
  const applied = await cli('cache', 'prune', '--work', work, '--apply')
  expect(applied.code).toBe(0)
  expect(JSON.parse(applied.stdout)).toMatchObject({
    applied: true,
    removed: [{ path: snapshot }],
  })
  expect(await exists(snapshot)).toBe(false)
})

it('reports a frozen plan and never reruns a completed failure', async () => {
  const work = await workspace()
  const path = join(work, 'plans', 'plan-test', 'plan.json')
  await writeJson(path, {
    version: 2,
    id: 'plan-test',
    createdAt: '2026-09-27',
    seed: 42,
    cells: [
      {
        id: 'receipt-plain-r1',
        taskId: 'receipt-rounding',
        repetition: 1,
        experiment: {
          id: 'plain-sol',
          workflow: 'plain',
          model: 'test',
          reasoningEffort: 'medium',
          codexVersion: '0.157.1',
          timeoutSeconds: 60,
          maxThreads: 1,
          maxDepth: 1,
        },
        fingerprint: 'a'.repeat(64),
        environment: { kind: 'docker', imageId: 'test' },
        workflowHash: null,
      },
    ],
  })
  const before = await readFile(path, 'utf8')
  const result = await cli('status', '--work', work, '--plan', path)
  expect(result.code).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual({
    planId: 'plan-test',
    retryOf: null,
    active: null,
    completed: 0,
    planned: 1,
    cells: [
      {
        cellId: 'receipt-plain-r1',
        task: 'receipt-rounding',
        experiment: 'plain-sol',
        state: 'pending',
        message: null,
        durationMs: null,
      },
    ],
  })
  expect(await readFile(path, 'utf8')).toBe(before)
  const plan = normalizePlan(JSON.parse(before))
  const cell = plan.cells[0]
  if (!cell) throw new Error('Fixture requires one cell')
  const resultPath = join(
    work,
    'plans',
    plan.id,
    'attempts',
    cell.id,
    'result.json',
  )
  await writeJson(resultPath, {
    ...cell,
    version: 2,
    planId: plan.id,
    cellId: cell.id,
    outcome: 'cancelled',
    message: 'operator cancelled',
    startedAt: plan.createdAt,
    durationMs: 100,
    candidateHash: null,
    activation: 'not_applicable',
    rootTokens: null,
    childTokens: null,
    completedChildren: 0,
    checks: [],
  })
  const evidence = await readFile(resultPath, 'utf8')
  const resumed = await cli('run', '--work', work, '--plan', path)
  expect(resumed.code).toBe(0)
  expect(resumed.stdout).not.toContain('Running')
  expect(await readFile(resultPath, 'utf8')).toBe(evidence)
  expect(await readFile(path, 'utf8')).toBe(before)
  expect(await exists(join(work, '.cache-maintenance-lock'))).toBe(false)
  expect(await exists(join(work, 'plans', plan.id, '.run-lock'))).toBe(false)
  const reported = await cli('report', '--work', work, '--plan', path)
  expect(reported.code).toBe(0)
  expect(JSON.parse(reported.stdout)).toMatchObject({
    comparisons: [],
    summary: [{ id: 'plain-sol' }],
  })
  const stored = JSON.parse(
    await readFile(join(work, 'plans', plan.id, 'report.json'), 'utf8'),
  )
  expect(stored.results).toEqual([
    expect.objectContaining({
      outcome: 'cancelled',
      rootTokens: null,
      childTokens: null,
    }),
  ])
})

it.each([
  ['status'],
  ['run', '--model', 'other'],
  ['run', '--backend', 'docker'],
  ['demo', '--backend', 'invalid'],
  ['unknown-command'],
])('rejects invalid invocation %j before creating work', async (...args) => {
  const parent = await workspace()
  const work = join(parent, 'unused')
  const result = await cli(...args, '--work', work)
  expect(result.code).toBe(1)
  expect(result.stdout + result.stderr).not.toBe('')
  expect(await exists(work)).toBe(false)
})

it.each([
  ['plan', '--repetitions', 'NaN'],
  ['plan', '--repetitions', '1.5'],
  ['plan', '--repetitions', '0'],
  ['plan', '--repetitions', '101'],
  ['plan', '--seed', '9007199254740992'],
  ['plan', '--timeout', '-1'],
  ['plan', '--max-threads', '0'],
  ['plan', '--max-depth', '1.5'],
  ['plan', '--model', '   '],
  ['plan', '--reasoning', 'invalid'],
  ['prepare', '--task', '../escape'],
  ['plan', '--experiments', '../escape'],
  ['workflow', '../escape'],
  ['cache', 'list', '--apply'],
  ['list', '--unexpected'],
  ['list', 'extra'],
])(
  'validates typed input %j before acquiring a workspace lock',
  async (...args) => {
    const parent = await workspace()
    const work = join(parent, 'unused')
    const result = await cli(...args, '--work', work)
    expect(result.code).toBe(1)
    expect(result.stdout + result.stderr).not.toBe('')
    expect(await exists(work)).toBe(false)
  },
)

it('generates command help without requiring inputs or creating work', async () => {
  const parent = await workspace()
  const work = join(parent, 'unused')
  for (const command of [
    ['plan'],
    ['run'],
    ['cache', 'prune'],
    ['auth', 'login'],
    ['workflow'],
  ]) {
    const result = await cli(...command, '--help', '--work', work)
    expect(result.code).toBe(0)
    expect(result.stdout).toContain(command.at(-1))
  }
  const plan = await cli('plan', '--help')
  expect(plan.stdout).toContain('--max-threads')
  const run = await cli('run', '--help')
  expect(run.stdout).toContain('--plan')
  expect(run.stdout).not.toContain('--max-threads')
  expect(await exists(work)).toBe(false)
}, 15_000)

it('accepts the shared work flag before the subcommand', async () => {
  const result = await cli('--work', await workspace(), 'list')
  expect(result.code).toBe(0)
  expect(JSON.parse(result.stdout).plans).toEqual([])
})

it('prints the package version', async () => {
  const result = await cli('--version')
  const manifest = JSON.parse(
    await readFile(join(root, 'package.json'), 'utf8'),
  )
  expect(result.code).toBe(0)
  expect(result.stdout.trim()).toBe(`workflow-bench v${manifest.version}`)
})

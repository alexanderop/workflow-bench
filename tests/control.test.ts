import { expect, it } from 'vitest'
import { mkdtemp, readFile, rm, mkdir, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Plan, decode, type Result } from '../packages/core/model.js'
import { writeJson } from '../packages/core/io.js'
import {
  cancelPlan,
  planStatus,
  retryPlan,
  runLock,
} from '../packages/runner/control.js'
import { execute } from '../packages/process/process.js'

it('keeps failed and interrupted evidence while retrying only selected cells in a linked plan', async () => {
  const work = await mkdtemp(join(tmpdir(), 'wb-control-test-'))
  try {
    const plan = decode(Plan, {
      version: 2,
      id: 'plan-original',
      createdAt: '2026-09-27',
      seed: 42,
      cells: ['failed', 'pending', 'interrupted'].map((id) => ({
        id,
        taskId: 'receipt-rounding',
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
        repetition: ['failed', 'pending', 'interrupted'].indexOf(id) + 1,
        fingerprint: 'a'.repeat(64),
        environment: { kind: 'docker', imageId: 'test' },
        workflowHash: null,
      })),
    })
    await writeJson(join(work, 'plans', plan.id, 'plan.json'), plan)
    const cell = plan.cells[0]!
    const result: Result = {
      ...cell,
      version: 2,
      planId: plan.id,
      cellId: cell.id,
      outcome: 'cancelled',
      message: 'operator cancelled',
      startedAt: '2026-09-27',
      durationMs: 100,
      candidateHash: null,
      activation: 'not_applicable',
      rootTokens: null,
      childTokens: null,
      completedChildren: 0,
      checks: [],
    }
    const original = join(
      work,
      'plans',
      plan.id,
      'attempts',
      cell.id,
      'result.json',
    )
    await writeJson(original, result)
    await mkdir(join(work, 'plans', plan.id, 'attempts', 'interrupted'), {
      recursive: true,
    })
    const status = await planStatus(work, plan)
    expect(status.cells.map((c) => c.state)).toEqual([
      'cancelled',
      'pending',
      'interrupted',
    ])
    await expect(retryPlan(work, plan, ['pending'])).rejects.toThrow(
      /unsuccessful/,
    )
    const before = await readFile(original, 'utf8')
    const retry = await retryPlan(work, plan)
    expect(retry.id).not.toBe(plan.id)
    expect(retry.retryOf).toEqual({
      planId: plan.id,
      cellIds: ['failed', 'interrupted'],
    })
    expect(retry.cells.map((c) => c.id)).toEqual(['failed', 'interrupted'])
    expect(await readFile(original, 'utf8')).toBe(before)
    await expect(cancelPlan(work, plan)).rejects.toThrow(/No active runner/)
    await mkdir(runLock(work, plan))
    await writeJson(join(runLock(work, plan), 'state.json'), {
      token: 'nonce',
      pid: process.pid,
      startedAt: 'now',
      cellId: 'pending',
    })
    expect((await planStatus(work, plan)).cells[1]?.state).toBe('running')
    await cancelPlan(work, plan)
    expect(
      JSON.parse(
        await readFile(join(runLock(work, plan), 'cancel.json'), 'utf8'),
      ).token,
    ).toBe('nonce')
    await expect(retryPlan(work, plan)).rejects.toThrow(/locked/)
  } finally {
    await rm(work, { recursive: true, force: true })
  }
})

it('cancels a real subprocess and retains its output', async () => {
  const controller = new AbortController()
  const pending = execute(
    process.execPath,
    ['-e', "console.log('partial evidence');setInterval(()=>{},1000)"],
    { signal: controller.signal },
  )
  const timer = setTimeout(() => controller.abort(), 300)
  try {
    const result = await pending
    expect(result.code).toBe(130)
    expect(result.stdout).toContain('partial evidence')
    expect(result.timedOut).toBe(false)
  } finally {
    clearTimeout(timer)
  }
})

it.each(['exit', 'abort'] as const)(
  'reaps a detached child before resolving after root %s',
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), 'wb-detached-test-'))
    const effect = join(directory, 'escaped-write')
    const ready = join(directory, 'ready')
    const controller = new AbortController()
    let childPid: number | undefined
    try {
      const child = `require('node:fs').writeFileSync(${JSON.stringify(ready)},String(process.pid));setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(effect)},'escaped'),1200)`
      const root = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(child)}],{detached:true,stdio:'inherit'});console.log('partial evidence');child.unref();${mode === 'abort' ? 'setInterval(()=>{},1000)' : ''}`
      const execution = execute(process.execPath, ['-e', root], {
        signal: controller.signal,
        timeoutMs: 5000,
      })
      if (mode === 'abort') {
        await expect
          .poll(async () => {
            try {
              return Number(await readFile(ready, 'utf8')) > 0
            } catch {
              return false
            }
          })
          .toBe(true)
        controller.abort()
      }
      const result = await execution
      expect(result.code).toBe(mode === 'abort' ? 130 : 0)
      expect(result.stdout).toContain('partial evidence')
      expect(result.timedOut).toBe(false)
      try {
        childPid = Number(await readFile(ready, 'utf8'))
      } catch {
        /* Cleanup can stop the child before its first statement. */
      }
      if (childPid) expect(() => process.kill(childPid!, 0)).toThrow()
      await new Promise((resolve) => setTimeout(resolve, 1400))
      await expect(access(effect)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      controller.abort()
      try {
        childPid ??= Number(await readFile(ready, 'utf8'))
        if (childPid) process.kill(childPid, 'SIGKILL')
      } catch {}
      await rm(directory, { recursive: true, force: true })
    }
  },
)

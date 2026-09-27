import { afterEach, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { Effect } from 'effect'
import { Command } from 'effect/unstable/cli'
import { NodeServices } from '@effect/platform-node'
import { root } from '../packages/core/io.js'
import { createPlan } from '../packages/runner/experiment.js'
import { cli } from '../apps/cli/commands.js'

vi.mock('../packages/runner/experiment.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../packages/runner/experiment.js')>()
  return {
    ...actual,
    createPlan: vi.fn(async () => ({ id: 'plan-test', cells: [] })),
  }
})

vi.mock('../packages/runner/cache.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../packages/runner/cache.js')>()
  return {
    ...actual,
    withCacheMaintenanceLock: async <A>(_work: string, use: () => Promise<A>) =>
      use(),
  }
})

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

async function plan(...args: string[]) {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await Effect.runPromise(
    Command.runWith(cli, { version: 'test' })(['plan', ...args]).pipe(
      Effect.provide(NodeServices.layer),
    ),
  )
}

it('passes the existing plan defaults to the runner', async () => {
  await plan()
  expect(createPlan).toHaveBeenCalledExactlyOnceWith(
    join(root, '.bench'),
    ['receipt-rounding'],
    ['plain-sol', 'pstack-sol'],
    1,
    42,
    'local',
    {},
  )
})

it('uses suite selection when explicit flags are omitted', async () => {
  await plan('--suite', 'vueuse')
  expect(createPlan).toHaveBeenCalledExactlyOnceWith(
    join(root, '.bench'),
    ['vueuse-element-size'],
    ['plain-sol', 'pstack-sol', 'superpowers-sol', 'pocock-sol'],
    3,
    42,
    'local',
    {},
  )
})

it('passes typed overrides ahead of suite defaults', async () => {
  await plan(
    '--suite',
    'vueuse',
    '--task',
    'receipt-rounding,other-task',
    '--experiments',
    'plain-sol,pstack-sol',
    '--repetitions',
    '2',
    '--seed=-7',
    '--backend',
    'docker',
    '--model',
    'test-model',
    '--reasoning',
    'high',
    '--timeout',
    '90',
    '--max-threads',
    '4',
    '--max-depth',
    '2',
  )
  expect(createPlan).toHaveBeenCalledExactlyOnceWith(
    join(root, '.bench'),
    ['receipt-rounding', 'other-task'],
    ['plain-sol', 'pstack-sol'],
    2,
    -7,
    'docker',
    {
      model: 'test-model',
      reasoningEffort: 'high',
      timeoutSeconds: 90,
      maxThreads: 4,
      maxDepth: 2,
    },
  )
})

import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readJson, writeJson, exists } from '../packages/core/io.js'
import { Schema } from 'effect'
import {
  cacheMaintenanceLock,
  inventoryLocalCache,
  pruneLocalCache,
  withCacheMaintenanceLock,
} from '../packages/runner/cache.js'

const temporary: string[] = []
const hash = (character: string) => character.repeat(64)
const LockOwner = Schema.Struct({
  pid: Schema.Number,
  startedAt: Schema.String,
})

async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), 'workflow-bench-cache-test-'))
  temporary.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  )
})

async function snapshot(
  work: string,
  taskId: string,
  fingerprint: string,
  snapshotHash: string,
  contents: string,
) {
  const path = join(work, 'cache', 'local', taskId, fingerprint, snapshotHash)
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'content.txt'), contents)
  return path
}

async function preparedManifest(
  work: string,
  taskId: string,
  fingerprint: string,
  snapshotHash: string,
  cacheDirectory: string,
) {
  await writeJson(join(work, 'tasks', taskId, 'local', 'prepared.json'), {
    version: 2,
    task: {
      id: taskId,
      title: taskId,
      project: 'test',
      provenance: 'test',
      source: { kind: 'local', path: 'source' },
      nodeImage: 'node:test',
      pnpmVersion: '10.28.2',
      install: [],
      checks: [{ name: 'check', command: ['true'], regression: true }],
      expectedFailure: 'EXPECTED',
      allowedPaths: ['src'],
      timeoutSeconds: 1,
    },
    fingerprint,
    environment: {
      kind: 'local',
      platform: 'darwin',
      arch: 'arm64',
      osRelease: 'test',
      nodeVersion: 'v24.0.0',
      pnpmVersion: '10.28.2',
      codexVersion: '0.157.1',
      snapshotHash,
      sandboxPolicyVersion: 'native-macos-v2',
    },
    locator: {
      kind: 'local',
      cacheDirectory,
      snapshotHash,
      pnpmExecutable: '/test/pnpm',
      codexExecutable: '/test/codex',
    },
    preparedAt: '2026-09-27T00:00:00.000Z',
  })
}

async function planManifest(
  work: string,
  planId: string,
  taskId: string,
  fingerprint: string,
  snapshotHash: string,
) {
  await writeJson(join(work, 'plans', planId, 'plan.json'), {
    version: 2,
    id: planId,
    createdAt: '2026-09-27T00:00:00.000Z',
    seed: 1,
    cells: [
      {
        id: `${taskId}-plain-sol-r1`,
        taskId,
        experiment: {
          id: 'plain-sol',
          workflow: 'plain',
          model: 'gpt-5.6-sol',
          reasoningEffort: 'medium',
          codexVersion: '0.157.1',
          timeoutSeconds: 1,
          maxThreads: 1,
          maxDepth: 1,
        },
        repetition: 1,
        fingerprint,
        environment: {
          kind: 'local',
          platform: 'darwin',
          arch: 'arm64',
          osRelease: 'test',
          nodeVersion: 'v24.0.0',
          pnpmVersion: '10.28.2',
          codexVersion: '0.157.1',
          snapshotHash,
          sandboxPolicyVersion: 'native-macos-v2',
        },
        workflowHash: null,
      },
    ],
  })
}

describe('local cache maintenance', () => {
  it('inventories sizes and protects prepared and frozen-plan snapshots', async () => {
    const work = await workspace()
    const preparedPath = await snapshot(
      work,
      'prepared-task',
      hash('a'),
      hash('b'),
      'prepared',
    )
    const plannedPath = await snapshot(
      work,
      'planned-task',
      hash('c'),
      hash('d'),
      'planned',
    )
    await snapshot(work, 'orphan-task', hash('e'), hash('f'), 'orphan')
    await preparedManifest(
      work,
      'prepared-task',
      hash('a'),
      hash('b'),
      preparedPath,
    )
    await planManifest(
      work,
      'plan-protected',
      'planned-task',
      hash('c'),
      hash('d'),
    )

    const inventory = await inventoryLocalCache(work)

    expect(inventory.entries).toHaveLength(3)
    expect(inventory.totalBytes).toBe(21)
    expect(inventory.protectedBytes).toBe(15)
    expect(inventory.orphanBytes).toBe(6)
    expect(
      inventory.entries.find((entry) => entry.path === preparedPath)
        ?.protectedBy,
    ).toEqual([{ kind: 'prepared', id: 'prepared-task' }])
    expect(
      inventory.entries.find((entry) => entry.path === plannedPath)
        ?.protectedBy,
    ).toEqual([{ kind: 'plan', id: 'plan-protected' }])
  })

  it('uses dry-run by default and deletes only known orphan leaves on apply', async () => {
    const work = await workspace()
    const protectedPath = await snapshot(
      work,
      'kept-task',
      hash('a'),
      hash('b'),
      'kept',
    )
    const orphanPath = await snapshot(
      work,
      'old-task',
      hash('c'),
      hash('d'),
      'old',
    )
    await preparedManifest(
      work,
      'kept-task',
      hash('a'),
      hash('b'),
      protectedPath,
    )

    const dryRun = await pruneLocalCache(work)
    expect(dryRun.applied).toBe(false)
    expect(dryRun.removed.map((entry) => entry.path)).toEqual([orphanPath])
    expect(await exists(orphanPath)).toBe(true)

    const applied = await pruneLocalCache(work, { apply: true })
    expect(applied.applied).toBe(true)
    expect(await exists(orphanPath)).toBe(false)
    expect(await exists(protectedPath)).toBe(true)
  })

  it('fails closed before deletion when a manifest is invalid', async () => {
    const work = await workspace()
    const orphanPath = await snapshot(
      work,
      'orphan-task',
      hash('a'),
      hash('b'),
      'orphan',
    )
    const manifest = join(work, 'tasks', 'broken', 'local', 'prepared.json')
    await mkdir(join(manifest, '..'), { recursive: true })
    await writeFile(manifest, '{broken')

    await expect(pruneLocalCache(work, { apply: true })).rejects.toThrow(
      /Invalid prepared manifest/,
    )
    expect(await exists(orphanPath)).toBe(true)
  })

  it('does not follow symlinked cache hierarchy entries', async () => {
    const work = await workspace()
    const external = await workspace()
    await writeFile(join(external, 'keep.txt'), 'keep')
    const localRoot = join(work, 'cache', 'local')
    await mkdir(localRoot, { recursive: true })
    const alias = join(localRoot, 'linked-task')
    await symlink(external, alias)

    const result = await pruneLocalCache(work, { apply: true })

    expect(result.unknownPaths).toEqual([alias])
    expect(result.removed).toEqual([])
    expect(await readFile(join(external, 'keep.txt'), 'utf8')).toBe('keep')
    expect(await exists(alias)).toBe(true)
  })

  it('rejects symlinked cache ancestors and concurrent maintenance', async () => {
    const work = await workspace()
    const external = await workspace()
    await mkdir(join(work, 'cache'), { recursive: true })
    await symlink(external, join(work, 'cache', 'local'))
    await expect(inventoryLocalCache(work)).rejects.toThrow(/real directory/)

    await rm(join(work, 'cache', 'local'))
    await withCacheMaintenanceLock(work, async () => {
      await expect(inventoryLocalCache(work)).rejects.toThrow(
        /Workspace operation already active, or stale maintenance lock/,
      )
      expect(await exists(cacheMaintenanceLock(work))).toBe(true)
      const owner = await readJson(
        join(cacheMaintenanceLock(work), 'owner.json'),
        LockOwner,
      )
      expect(owner.pid).toBe(process.pid)
      expect(Number.isNaN(Date.parse(owner.startedAt))).toBe(false)
    })
    expect(await exists(cacheMaintenanceLock(work))).toBe(false)
  })
})

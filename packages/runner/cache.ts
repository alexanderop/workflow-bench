import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rm } from 'node:fs/promises'
import { basename, join, resolve, sep } from 'node:path'
import { Prepared, decode, normalizePlan } from '../core/model.js'
import { exists, now, writeJson } from '../core/io.js'

const hashPattern = /^[a-f0-9]{64}$/
const taskPattern = /^[a-z0-9][a-z0-9-]*$/

export interface CacheProtection {
  readonly kind: 'prepared' | 'plan'
  readonly id: string
}

export interface LocalCacheEntry {
  readonly taskId: string
  readonly fingerprint: string
  readonly snapshotHash: string
  readonly path: string
  readonly bytes: number
  readonly protectedBy: readonly CacheProtection[]
}

export interface LocalCacheInventory {
  readonly entries: readonly LocalCacheEntry[]
  readonly unknownPaths: readonly string[]
  readonly totalBytes: number
  readonly protectedBytes: number
  readonly orphanBytes: number
}

export interface CachePruneResult extends LocalCacheInventory {
  readonly applied: boolean
  readonly removed: readonly LocalCacheEntry[]
}

export const cacheMaintenanceLock = (work: string) =>
  join(work, '.cache-maintenance-lock')

export async function withCacheMaintenanceLock<A>(
  work: string,
  use: () => Promise<A>,
): Promise<A> {
  const lock = cacheMaintenanceLock(work)
  await mkdir(work, { recursive: true })
  try {
    await mkdir(lock)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST')
      throw new Error(
        `Workspace operation already active, or stale maintenance lock: ${lock}`,
      )
    throw error
  }
  try {
    await writeJson(join(lock, 'owner.json'), {
      pid: process.pid,
      startedAt: now(),
    })
    return await use()
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

function expectedSnapshotPath(
  localRoot: string,
  taskId: string,
  fingerprint: string,
  snapshotHash: string,
) {
  return join(localRoot, taskId, fingerprint, snapshotHash)
}

function assertWithin(root: string, path: string) {
  const canonicalRoot = resolve(root)
  const canonicalPath = resolve(path)
  if (
    canonicalPath !== canonicalRoot &&
    !canonicalPath.startsWith(canonicalRoot + sep)
  )
    throw new Error(`Cache reference escapes the local cache: ${path}`)
}

async function directorySize(path: string): Promise<number> {
  let bytes = 0
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) bytes += await directorySize(child)
    else bytes += (await lstat(child)).size
  }
  return bytes
}

async function knownSnapshotDirectories(localRoot: string) {
  const entries: Omit<LocalCacheEntry, 'protectedBy'>[] = []
  const unknownPaths: string[] = []
  if (!(await exists(localRoot))) return { entries, unknownPaths }
  for (const ancestor of [join(localRoot, '..'), localRoot]) {
    const info = await lstat(ancestor)
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(
        `Local cache ancestor must be a real directory: ${ancestor}`,
      )
  }

  for (const task of await readdir(localRoot, { withFileTypes: true })) {
    const taskPath = join(localRoot, task.name)
    if (!task.isDirectory() || !taskPattern.test(task.name)) {
      unknownPaths.push(taskPath)
      continue
    }
    for (const fingerprint of await readdir(taskPath, {
      withFileTypes: true,
    })) {
      const fingerprintPath = join(taskPath, fingerprint.name)
      if (!fingerprint.isDirectory() || !hashPattern.test(fingerprint.name)) {
        unknownPaths.push(fingerprintPath)
        continue
      }
      for (const snapshot of await readdir(fingerprintPath, {
        withFileTypes: true,
      })) {
        const snapshotPath = join(fingerprintPath, snapshot.name)
        if (!snapshot.isDirectory() || !hashPattern.test(snapshot.name)) {
          unknownPaths.push(snapshotPath)
          continue
        }
        entries.push({
          taskId: task.name,
          fingerprint: fingerprint.name,
          snapshotHash: snapshot.name,
          path: snapshotPath,
          bytes: await directorySize(snapshotPath),
        })
      }
    }
  }
  return { entries, unknownPaths }
}

async function protectionReferences(work: string, localRoot: string) {
  const references = new Map<string, CacheProtection[]>()
  const protect = (path: string, reason: CacheProtection) => {
    assertWithin(localRoot, path)
    const reasons = references.get(resolve(path)) ?? []
    reasons.push(reason)
    references.set(resolve(path), reasons)
  }

  const tasksRoot = join(work, 'tasks')
  if (await exists(tasksRoot)) {
    for (const task of await readdir(tasksRoot, { withFileTypes: true })) {
      if (!task.isDirectory()) continue
      const manifest = join(tasksRoot, task.name, 'local', 'prepared.json')
      if (!(await exists(manifest))) continue
      let prepared
      try {
        prepared = decode(
          Prepared,
          JSON.parse(await readFile(manifest, 'utf8')),
        )
      } catch (error) {
        throw new Error(
          `Invalid prepared manifest ${manifest}: ${String(error)}`,
        )
      }
      if (
        prepared.environment.kind !== 'local' ||
        prepared.locator.kind !== 'local' ||
        prepared.task.id !== task.name ||
        prepared.environment.snapshotHash !== prepared.locator.snapshotHash
      )
        throw new Error(`Invalid local cache reference in ${manifest}`)
      const expected = expectedSnapshotPath(
        localRoot,
        task.name,
        prepared.fingerprint,
        prepared.locator.snapshotHash,
      )
      if (resolve(prepared.locator.cacheDirectory) !== resolve(expected))
        throw new Error(`Prepared cache locator disagrees with ${manifest}`)
      protect(expected, { kind: 'prepared', id: task.name })
    }
  }

  const plansRoot = join(work, 'plans')
  if (await exists(plansRoot)) {
    for (const planDirectory of await readdir(plansRoot, {
      withFileTypes: true,
    })) {
      if (!planDirectory.isDirectory()) continue
      const manifest = join(plansRoot, planDirectory.name, 'plan.json')
      if (!(await exists(manifest)))
        throw new Error(
          `Plan directory has no plan.json: ${planDirectory.name}`,
        )
      let plan
      try {
        plan = normalizePlan(JSON.parse(await readFile(manifest, 'utf8')))
      } catch (error) {
        throw new Error(`Invalid plan manifest ${manifest}: ${String(error)}`)
      }
      if (plan.id !== planDirectory.name)
        throw new Error(`Plan ID disagrees with directory: ${manifest}`)
      for (const cell of plan.cells) {
        if (cell.environment.kind !== 'local') continue
        protect(
          expectedSnapshotPath(
            localRoot,
            cell.taskId,
            cell.fingerprint,
            cell.environment.snapshotHash,
          ),
          { kind: 'plan', id: plan.id },
        )
      }
    }
  }
  return references
}

async function inventoryUnlocked(work: string): Promise<LocalCacheInventory> {
  const localRoot = join(work, 'cache', 'local')
  const [known, references] = await Promise.all([
    knownSnapshotDirectories(localRoot),
    protectionReferences(work, localRoot),
  ])
  const entries = known.entries
    .map((entry) => ({
      ...entry,
      protectedBy: references.get(resolve(entry.path)) ?? [],
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0)
  const protectedBytes = entries
    .filter((entry) => entry.protectedBy.length > 0)
    .reduce((total, entry) => total + entry.bytes, 0)
  return {
    entries,
    unknownPaths: known.unknownPaths.sort(),
    totalBytes,
    protectedBytes,
    orphanBytes: totalBytes - protectedBytes,
  }
}

export async function inventoryLocalCache(
  work: string,
): Promise<LocalCacheInventory> {
  return withCacheMaintenanceLock(work, () => inventoryUnlocked(work))
}

export async function pruneLocalCache(
  work: string,
  options: { readonly apply?: boolean } = {},
): Promise<CachePruneResult> {
  return withCacheMaintenanceLock(work, async () => {
    const inventory = await inventoryUnlocked(work)
    const removed = inventory.entries.filter(
      (entry) => entry.protectedBy.length === 0,
    )
    if (options.apply && removed.length > 0) {
      const trash = join(work, 'cache', `.local-prune-${randomUUID()}`)
      await mkdir(trash, { recursive: true })
      const moved: Array<{ source: string; target: string }> = []
      try {
        for (const [index, entry] of removed.entries()) {
          const target = join(trash, `${index}-${basename(entry.path)}`)
          await rename(entry.path, target)
          moved.push({ source: entry.path, target })
        }
      } catch (error) {
        const failures: string[] = []
        for (const entry of moved.reverse()) {
          try {
            await rename(entry.target, entry.source)
          } catch (rollbackError) {
            failures.push(`${entry.target}: ${String(rollbackError)}`)
          }
        }
        if (failures.length > 0)
          throw new Error(
            `Cache prune failed and rollback was incomplete. Recovery files remain at ${trash}. Restore them manually before retrying. Original error: ${String(error)}. Rollback errors: ${failures.join('; ')}`,
          )
        await rm(trash, { recursive: true, force: true })
        throw error
      }
      await rm(trash, { recursive: true, force: true })
    }
    return { ...inventory, applied: options.apply === true, removed }
  })
}

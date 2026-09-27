import { createHash, randomUUID } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
  lstat,
  readlink,
  realpath,
} from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Schema } from 'effect'
import { decode } from './model.js'

function repositoryRoot() {
  let path = dirname(fileURLToPath(import.meta.url))
  while (!existsSync(join(path, 'pnpm-workspace.yaml'))) {
    const parent = dirname(path)
    if (parent === path)
      throw new Error('Cannot locate Workflow Bench repository root')
    path = parent
  }
  return path
}
export const root = repositoryRoot()
export const hash = (text: string | Uint8Array) =>
  createHash('sha256').update(text).digest('hex')
export const now = () => new Date().toISOString()
export const message = (error: unknown) =>
  error instanceof Error
    ? error.message ||
      ('detail' in error ? String(error.detail) : String(error))
    : String(error)
export async function readJson<A>(
  path: string,
  schema: Schema.ConstraintDecoder<A>,
): Promise<A> {
  return decode(schema, JSON.parse(await readFile(path, 'utf8')))
}
export async function readUnknownJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}
export async function writeJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  await rename(temporary, path)
}
export async function exists(path: string) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return false
    throw error
  }
}
export function within(directory: string, path: string): string {
  const result = resolve(directory, path)
  if (
    result !== resolve(directory) &&
    !result.startsWith(resolve(directory) + sep)
  )
    throw new Error(`Path escapes its directory: ${path}`)
  return result
}
export async function treeHash(directory: string): Promise<string> {
  const canonicalDirectory = await realpath(directory)
  const entries: string[] = []
  async function visit(current: string, relative: string) {
    for (const entry of (await readdir(current, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      if (['.git', 'node_modules', '.bench'].includes(entry.name)) continue
      const name = join(relative, entry.name),
        file = join(current, entry.name)
      if (entry.isSymbolicLink()) {
        const target = await realpath(file)
        within(canonicalDirectory, target)
        entries.push(`${name}:symlink:${await readlink(file)}`)
      } else if (entry.isDirectory()) await visit(file, name)
      else if (entry.isFile())
        entries.push(`${name}:${hash(await readFile(file))}`)
    }
  }
  await visit(directory, '')
  return hash(entries.join('\n'))
}

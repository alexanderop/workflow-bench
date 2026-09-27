import { mkdir, readFile, rm, writeFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { hash } from '../core/io.js'
import { Schema } from 'effect'
import { decode } from '../core/model.js'

export const defaultProfile = join(homedir(), '.codex')
const Auth = Schema.Struct({
  auth_mode: Schema.Literal('chatgpt'),
  tokens: Schema.Struct({
    access_token: Schema.NonEmptyString,
    refresh_token: Schema.NonEmptyString,
  }),
})
function validateAuth(text: string) {
  try {
    decode(Auth, JSON.parse(text))
  } catch {
    throw new Error(
      'Invalid subscription authentication profile; run pnpm bench auth login',
    )
  }
}
export async function checkAuth(path: string) {
  const text = await readFile(path, 'utf8')
  validateAuth(text)
  return text
}
export async function withAuth<A>(
  path: string,
  use: (
    text: string,
    persist: (refreshed: string) => Promise<void>,
  ) => Promise<A>,
) {
  const lock = path + '.workflow-bench.lock'
  await mkdir(dirname(path), { recursive: true })
  try {
    await mkdir(lock)
  } catch {
    throw new Error(
      `Credential stream locked: ${lock}. Never run simultaneous jobs against one profile.`,
    )
  }
  try {
    const original = await checkAuth(path)
    const persist = async (refreshed: string) => {
      validateAuth(refreshed)
      if (hash(await readFile(path, 'utf8')) !== hash(original))
        throw new Error(
          'Authentication changed concurrently; refused to overwrite it',
        )
      const temp = path + '.workflow-bench.tmp'
      await writeFile(temp, refreshed, { mode: 0o600 })
      await rename(temp, path)
    }
    return await use(original, persist)
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

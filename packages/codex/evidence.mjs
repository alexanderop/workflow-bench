import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const summaries = []
async function walk(path) {
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch (e) {
    if (e.code === 'ENOENT') return
    throw e
  }
  for (const entry of entries) {
    const file = join(path, entry.name)
    if (entry.isDirectory()) {
      await walk(file)
      continue
    }
    if (!entry.name.endsWith('.jsonl')) continue
    let id = null,
      child = false,
      tokens = null,
      complete = false
    const models = new Set(),
      spawned = new Set()
    for (const line of (await readFile(file, 'utf8')).split('\n')) {
      let row
      try {
        row = JSON.parse(line)
      } catch {
        continue
      }
      const p = row.payload
      if (!p) continue
      if (row.type === 'session_meta') {
        id = p.id
        child =
          typeof p.source === 'object' &&
          p.source !== null &&
          'subagent' in p.source
      }
      if (row.type === 'turn_context' && typeof p.model === 'string')
        models.add(p.model)
      if (
        p.type === 'token_count' &&
        typeof p.info?.total_token_usage?.total_tokens === 'number'
      )
        tokens = p.info.total_token_usage.total_tokens
      if (['task_complete', 'turn_complete'].includes(p.type)) complete = true
      if (
        p.type === 'collab_agent_spawn_end' &&
        typeof p.new_thread_id === 'string'
      )
        spawned.add(p.new_thread_id)
      if (
        p.type === 'message' &&
        p.role === 'assistant' &&
        p.phase === 'final_answer'
      )
        complete = true
    }
    summaries.push({
      id,
      child,
      tokens,
      complete,
      models: [...models],
      spawned: [...spawned],
    })
  }
}
const profile = process.argv[2] ?? '/home/node/.codex'
await walk(join(profile, 'sessions'))
await walk(join(profile, 'archived_sessions'))
process.stdout.write(JSON.stringify(summaries))

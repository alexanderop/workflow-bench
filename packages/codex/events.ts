import { Schema } from 'effect'
import { decode, type Outcome } from '../core/model.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
export function parseEvents(text: string, evidencePath: string | null) {
  let terminal: 'completed' | 'failed' | null = null,
    tokens: number | null = null,
    activated = false
  let errorText = ''
  const timeline: { type: string; text: string }[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (!isRecord(row)) continue
    if (row.type === 'turn.completed') {
      terminal = 'completed'
      if (
        isRecord(row.usage) &&
        typeof row.usage.input_tokens === 'number' &&
        typeof row.usage.output_tokens === 'number'
      )
        tokens = row.usage.input_tokens + row.usage.output_tokens
    }
    if (row.type === 'turn.failed' || row.type === 'error') {
      terminal = 'failed'
      errorText += JSON.stringify(row)
    }
    if (row.type === 'item.completed' && isRecord(row.item)) {
      const item = row.item
      if (
        item.type === 'command_execution' &&
        item.exit_code === 0 &&
        typeof item.command === 'string' &&
        evidencePath &&
        item.command.includes(evidencePath) &&
        /\b(cat|sed|head|read_file)\b/.test(item.command)
      )
        activated = true
      if (typeof item.type === 'string')
        timeline.push({
          type: item.type,
          text:
            typeof item.command === 'string'
              ? item.command
              : typeof item.text === 'string'
                ? item.text
                : '',
        })
    }
  }
  const outcome: Outcome | null = /quota|rate.limit|usage.limit|429/i.test(
    errorText,
  )
    ? 'rate_limited'
    : /unauthorized|authentication|401|refresh.token/i.test(errorText)
      ? 'auth_error'
      : terminal === 'failed'
        ? 'infrastructure_error'
        : null
  return { terminal, tokens, activated, outcome, timeline }
}
const Session = Schema.Struct({
  id: Schema.NullOr(Schema.String),
  child: Schema.Boolean,
  tokens: Schema.NullOr(Schema.Number),
  complete: Schema.Boolean,
  models: Schema.Array(Schema.String),
  spawned: Schema.Array(Schema.String),
})
export function sessionEvidence(value: unknown, model: string) {
  const sessions = decode(Schema.Array(Session), value)
  const children = sessions.filter((s) => s.child),
    expected = new Set(sessions.flatMap((s) => s.spawned))
  const known = new Set(children.map((s) => s.id))
  const complete =
    new Set(sessions.map((s) => s.id)).size === sessions.length &&
    children.every((s) => s.tokens !== null) &&
    [...expected].every((id) => known.has(id)) &&
    sessions.length > 0
  return {
    childTokens: complete
      ? children.reduce((total, s) => total + (s.tokens ?? 0), 0)
      : null,
    completedChildren: children.filter((s) => s.complete).length,
    modelMismatch: sessions.some((s) => s.models.some((m) => m !== model)),
    sessions,
  }
}

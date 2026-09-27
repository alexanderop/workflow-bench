import { execFileSync } from 'node:child_process'
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const [
  kind,
  id,
  model,
  workflowRoot = '/tmp/workflow',
  home = '/home/node',
  profile = '/home/node/.codex',
] = process.argv.slice(2)
const run = (args) =>
  execFileSync('codex', args, {
    encoding: 'utf8',
    env: { ...process.env, CODEX_HOME: profile },
  })
if (kind === 'plugin') {
  const manifest = JSON.parse(
    readFileSync(join(workflowRoot, '.codex-plugin/plugin.json'), 'utf8'),
  )
  if (manifest.name !== id) throw new Error('Unexpected plugin identity')
  const marketplace = join(home, 'marketplace')
  mkdirSync(join(marketplace, '.agents/plugins'), { recursive: true })
  cpSync(workflowRoot, join(marketplace, id), {
    recursive: true,
    verbatimSymlinks: true,
  })
  writeFileSync(
    join(marketplace, '.agents/plugins/marketplace.json'),
    JSON.stringify({
      name: 'workflow-bench',
      plugins: [
        {
          name: id,
          source: { source: 'local', path: `./${id}` },
          policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
          category: 'Productivity',
        },
      ],
    }),
  )
  run(['plugin', 'marketplace', 'add', marketplace, '--json'])
  process.stdout.write(run(['plugin', 'add', `${id}@workflow-bench`, '--json']))
} else if (kind === 'skills') {
  const source = join(workflowRoot, 'skills/engineering')
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.isDirectory())
      cpSync(
        join(source, entry.name),
        join(home, '.agents/skills', entry.name),
        { recursive: true, verbatimSymlinks: true },
      )
  }
  process.stdout.write(
    JSON.stringify({ installed: id, source: 'skills/engineering' }),
  )
}
if (id === 'pstack') {
  mkdirSync(join(home, '.pstack'), { recursive: true })
  const roles = [
    'feature, refactoring',
    'bug-fix',
    'perf-issue',
    'hillclimb',
    'judgment and prose',
    'hardest tasks',
    'how explorer',
    'how explainer',
    'why investigators',
    'why synthesizer',
    'reflect tooling',
    'reflect judgment, divergent, synthesizer',
    'swarm workers',
  ]
  const panels = [
    'how critics',
    'arena runners',
    'arena cross-judge pool',
    'architect runners',
    'interrogate reviewers',
  ]
  writeFileSync(
    join(home, '.pstack/models.md'),
    [
      'harness: codex',
      ...roles.map((r) => `${r}: ${model}`),
      ...panels.map((r) => `${r}: ${model}, ${model}`),
    ].join('\n') + '\n',
  )
}

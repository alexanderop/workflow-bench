import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { root, writeJson, now } from '../packages/core/io.js'
import { prepare } from '../packages/runner/prepare.js'
import { must } from '../packages/docker/process.js'
import { invokeJudge } from '../packages/judge/invoke.js'
import {
  dimensions,
  validateVerdict,
  verdictJsonSchema,
} from '../packages/judge/rubric.js'
const temp = await mkdtemp(join(tmpdir(), 'wb-judge-proof-'))
try {
  const prepared = await prepare(
    join(root, '.bench/judge-proof'),
    'receipt-rounding',
    console.log,
    'docker',
  )
  if (prepared.locator.kind !== 'docker')
    throw new Error('Expected Docker preparation')
  const assessment = {
    winner: 'tie',
    rationale: 'Equivalent teaching fixtures.',
    evidence: [
      { candidate: 'A', path: 'app.vue', line: 1, quote: 'hello' },
      { candidate: 'B', path: 'app.vue', line: 1, quote: 'hello' },
    ],
  }
  const verdict = {
    ...Object.fromEntries(dimensions.map((d) => [d, assessment])),
    overall: { winner: 'tie', rationale: 'Equivalent teaching fixtures.' },
  }
  await writeFile(
    join(temp, 'fake-codex'),
    `#!/usr/bin/env node
const fs=require('fs');if(process.argv.includes('--version')){console.log('codex-cli 0.157.1');process.exit(0)}
fs.readFileSync(0,'utf8');fs.writeFileSync(process.argv[process.argv.indexOf('--output-last-message')+1],JSON.stringify(${JSON.stringify(verdict)}));
const path='/home/node/.codex/auth.json';const auth=JSON.parse(fs.readFileSync(path));auth.tokens.access_token='FAKE-REFRESHED';fs.writeFileSync(path,JSON.stringify(auth));
console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:4,output_tokens:6}}));
`,
  )
  await writeFile(
    join(temp, 'Dockerfile'),
    `FROM ${prepared.locator.image}\nUSER root\nRUN rm /usr/local/bin/codex\nCOPY --chmod=755 fake-codex /usr/local/bin/codex\nUSER node\n`,
  )
  await must('docker', [
    'build',
    '-t',
    'workflow-bench/judge-proof:local',
    temp,
  ])
  await writeJson(join(temp, 'schema.json'), verdictJsonSchema)
  const auth = join(temp, 'auth.json')
  await writeJson(auth, {
    auth_mode: 'chatgpt',
    tokens: { access_token: 'FAKE-INITIAL', refresh_token: 'FAKE-REFRESH' },
  })
  const result = await invokeJudge(
    'workflow-bench/judge-proof:local',
    auth,
    temp,
    'Synthetic transport proof; not a real review.',
  )
  const sources = {
    A: [{ path: 'app.vue', text: 'hello' }],
    B: [{ path: 'app.vue', text: 'hello' }],
  }
  assert.equal(validateVerdict(result.value, sources).overall.winner, 'tie')
  assert.equal(result.tokens, 10)
  assert.equal(
    JSON.parse(await readFile(auth, 'utf8')).tokens.access_token,
    'FAKE-REFRESHED',
  )
  await writeJson(join(root, 'artifacts/judge-proof.json'), {
    kind: 'synthetic-transport-not-model-evidence',
    createdAt: now(),
    schemaOutput: true,
    citationsValidated: true,
    refreshedFakeCredentials: true,
  })
  console.log('Judge Docker transport proof passed. No model calls.')
} finally {
  await rm(temp, { recursive: true, force: true })
}

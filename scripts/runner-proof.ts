import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepare } from '../packages/runner/prepare.js'
import { solve } from '../packages/codex/solve.js'
import { loadExperiment } from '../packages/core/catalog.js'
import { root, now, writeJson } from '../packages/core/io.js'
import { must } from '../packages/docker/process.js'

// This deterministic stub tests transport, not model quality. It never uses real credentials.
const work = join(root, '.bench/runner-proof')
const prepared = await prepare(work, 'receipt-rounding', console.log, 'docker')
if (prepared.locator.kind !== 'docker')
  throw new Error('Expected Docker preparation')
const temporary = await mkdtemp(join(tmpdir(), 'wb-runner-proof-'))
try {
  const fake = `#!/usr/bin/env node
const fs=require('fs');
const {spawn}=require('child_process');
if(process.argv.includes('--version')){console.log('codex-cli 0.157.1');process.exit(0)}
fs.readFileSync(0,'utf8');
fs.writeFileSync('/repo/src/receipt.mjs', 'export function receipt(items) {\\n  return items.reduce((total, item) => total + Math.round(item.unitCents * item.quantity * (100 - item.discountPercent) / 100), 0)\\n}\\n');
const file='/home/node/.codex/auth.json';const auth=JSON.parse(fs.readFileSync(file,'utf8'));auth.tokens.access_token='FAKE-REFRESHED';fs.writeFileSync(file,JSON.stringify(auth));
console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Deterministic test stub, not a model result'}}));
if(auth.tokens.refresh_token==='FAKE-CANCEL'){
  const child=spawn('sh',['-c','sleep 1; printf "\\n// LATE_CANCELLED_DESCENDANT_WRITE\\n" >> /repo/src/receipt.mjs'],{detached:true,stdio:'ignore'});child.unref();setInterval(()=>{},1000)
}else if(auth.tokens.refresh_token==='FAKE-TIMEOUT'){setInterval(()=>{},1000)}else{console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:7,output_tokens:3}}));}
`
  await writeFile(join(temporary, 'fake-codex'), fake)
  await writeFile(
    join(temporary, 'Dockerfile'),
    `FROM ${prepared.locator.image}\nUSER root\nRUN rm /usr/local/bin/codex\nCOPY --chmod=755 fake-codex /usr/local/bin/codex\nUSER node\n`,
  )
  await must(
    'docker',
    ['build', '-t', 'workflow-bench/transport-proof:local', temporary],
    { timeoutMs: 120000 },
  )
  const imageId = await must('docker', [
    'image',
    'inspect',
    'workflow-bench/transport-proof:local',
    '--format',
    '{{.Id}}',
  ])
  const authFile = join(temporary, 'auth.json')
  await writeFile(
    authFile,
    JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: 'FAKE-INITIAL', refresh_token: 'FAKE-REFRESH' },
    }),
    { mode: 0o600 },
  )
  const experiment = await loadExperiment('plain-sol')
  const result = await solve(
    work,
    'transport-proof',
    {
      id: 'stub-only',
      taskId: prepared.task.id,
      experiment,
      repetition: 1,
      fingerprint: prepared.fingerprint,
      environment: { kind: 'docker', imageId },
      workflowHash: null,
    },
    {
      ...prepared,
      environment: { kind: 'docker', imageId },
      locator: { ...prepared.locator, imageId },
    },
    authFile,
  )
  assert.equal(result.outcome, 'resolved')
  assert.equal(result.rootTokens, 10)
  assert.equal(result.childTokens, null)
  assert.ok(
    result.checks.length === 2 && result.checks.every((c) => c.exitCode === 0),
  )
  assert.equal(
    JSON.parse(await readFile(authFile, 'utf8')).tokens.access_token,
    'FAKE-REFRESHED',
  )
  await writeFile(
    authFile,
    JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: 'FAKE-INITIAL', refresh_token: 'FAKE-TIMEOUT' },
    }),
    { mode: 0o600 },
  )
  const timeoutResult = await solve(
    work,
    'transport-proof',
    {
      id: 'stub-timeout',
      taskId: prepared.task.id,
      experiment: { ...experiment, timeoutSeconds: 1 },
      repetition: 1,
      fingerprint: prepared.fingerprint,
      environment: { kind: 'docker', imageId },
      workflowHash: null,
    },
    {
      ...prepared,
      environment: { kind: 'docker', imageId },
      locator: { ...prepared.locator, imageId },
    },
    authFile,
  )
  assert.equal(timeoutResult.outcome, 'timeout')
  assert.ok(timeoutResult.candidateHash)
  assert.match(
    await readFile(
      join(work, 'plans/transport-proof/attempts/stub-timeout/candidate.patch'),
      'utf8',
    ),
    /Math.round/,
  )
  await writeFile(
    authFile,
    JSON.stringify({
      auth_mode: 'chatgpt',
      tokens: { access_token: 'FAKE-INITIAL', refresh_token: 'FAKE-CANCEL' },
    }),
    { mode: 0o600 },
  )
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 1_500)
  const cancelledResult = await solve(
    work,
    'transport-proof',
    {
      id: 'stub-cancelled',
      taskId: prepared.task.id,
      experiment: { ...experiment, timeoutSeconds: 10 },
      repetition: 1,
      fingerprint: prepared.fingerprint,
      environment: { kind: 'docker', imageId },
      workflowHash: null,
    },
    {
      ...prepared,
      environment: { kind: 'docker', imageId },
      locator: { ...prepared.locator, imageId },
    },
    authFile,
    { signal: controller.signal },
  )
  assert.equal(cancelledResult.outcome, 'cancelled')
  await new Promise((resolve) => setTimeout(resolve, 1_200))
  const cancelledPatch = await readFile(
    join(work, 'plans/transport-proof/attempts/stub-cancelled/candidate.patch'),
    'utf8',
  )
  assert.match(cancelledPatch, /Math\.round/)
  assert.doesNotMatch(cancelledPatch, /LATE_CANCELLED_DESCENDANT_WRITE/)
  await writeJson(join(root, 'artifacts/runner-proof.json'), {
    kind: 'deterministic-transport-test-not-model-evidence',
    createdAt: now(),
    result,
    timeoutResult,
    cancelledResult,
    refreshedFakeCredentials: true,
  })
  console.log(
    'Runner transport proof passed: isolated solve, patch export, independent grade, usage parsing, auth refresh, and cleanup. No model calls.',
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}

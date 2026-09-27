import assert from 'node:assert/strict'
import { Effect } from 'effect'
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  symlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepare } from '../packages/runner/prepare.js'
import { grade, qualify } from '../packages/runner/grade.js'
import {
  createPlan,
  loadResults,
  runPlan,
} from '../packages/runner/experiment.js'
import {
  cancelPlan,
  planStatus,
  retryPlan,
} from '../packages/runner/control.js'
import { solve, type SolveOptions } from '../packages/codex/solve.js'
import { withLocalWorkspace } from '../packages/local/workspace.js'
import { invokeLocalJudge } from '../packages/judge/invoke.js'
import {
  dimensions,
  validateVerdict,
  verdictJsonSchema,
} from '../packages/judge/rubric.js'
import { exists, now, root, writeJson } from '../packages/core/io.js'

const directory = await mkdtemp(join(tmpdir(), 'workflow-bench-local-proof-'))
const work = join(directory, 'work')
const artifact = join(root, 'artifacts/local-proof.json')
const checks: string[] = []
const record = (name: string) => {
  checks.push(name)
  console.log(`PASS ${name}`)
}
try {
  const prepared = await prepare(work, 'receipt-rounding', console.log, 'local')
  const cached = await prepare(work, 'receipt-rounding', console.log, 'local')
  assert.deepEqual(
    cached,
    prepared,
    'Preparation reuses the identical snapshot',
  )
  record('prepared snapshot reuse')

  const qualification = await qualify(work, 'receipt-rounding', 'local')
  assert.equal(qualification.qualified, true)
  record('intended base failure and passing trusted reference')

  const reference = await readFile(
    join(root, 'tasks/receipt-rounding/reference.patch'),
    'utf8',
  )
  const mutant = reference.replace('Math.round(', 'Math.floor(')
  assert.notEqual(mutant, reference)
  const mutantFile = join(directory, 'mutant.patch')
  await writeFile(mutantFile, mutant)
  assert.ok(
    (await grade(prepared, mutantFile)).some((check) => check.exitCode !== 0),
  )
  record('independent grader rejects rounding mutant')

  const forbiddenPatch = join(directory, 'forbidden.patch')
  await writeFile(
    forbiddenPatch,
    'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json\n@@ -1 +1 @@\n-{}\n+{"scripts":{}}\n',
  )
  await assert.rejects(
    grade(prepared, forbiddenPatch),
    /outside production scope/,
  )
  record('patch boundary rejects manifest edits')

  const sibling = join(directory, 'sibling-secret')
  await writeFile(sibling, 'not visible to solver tools')
  let firstWorkspace = ''
  await withLocalWorkspace(prepared, async (workspace) => {
    firstWorkspace = workspace.root
    await writeFile(join(workspace.codexHome, 'auth.json'), 'FAKE-CREDENTIAL')
    const targets = [
      sibling,
      join(workspace.codexHome, 'auth.json'),
      join(workspace.codexHome, 'config.toml'),
      join(root, 'tasks/receipt-rounding/reference.patch'),
      join(root, 'tasks/receipt-rounding/grader/regression.test.mjs'),
    ]
    const alias = join(workspace.root, 'hidden-alias')
    await symlink(sibling, alias)
    const script = `
      const fs=require('node:fs'), assert=require('node:assert/strict');
      for(const file of JSON.parse(process.argv[1])) {
        assert.throws(()=>fs.readFileSync(file), e=>e.code==='EPERM'||e.code==='EACCES', file);
        assert.throws(()=>fs.writeFileSync(file,'overwritten'), e=>e.code==='EPERM'||e.code==='EACCES', file);
      }
      assert.throws(()=>fs.readFileSync(process.argv[2]), e=>e.code==='EPERM'||e.code==='EACCES');
      fs.writeFileSync('source-write-proof','allowed');
      fs.writeFileSync('src/receipt.mjs','export function receipt() { return 999 }');
      console.log('isolation-passed');
    `
    const result = await workspace.run(process.execPath, [
      '-e',
      script,
      JSON.stringify(targets),
      alias,
    ])
    assert.equal(result.code, 0, result.stderr + result.stdout)
    assert.match(result.stdout, /isolation-passed/)
    record(
      'workspace edits allowed; graders, credentials, config and symlink escapes denied',
    )
    const graderIsolation = await workspace.runGrader(process.execPath, [
      '-e',
      script,
      JSON.stringify(targets),
      alias,
    ])
    assert.equal(
      graderIsolation.code,
      0,
      graderIsolation.stderr + graderIsolation.stdout,
    )
    record(
      'trusted grader policy also denies credentials, host graders and symlink escapes',
    )

    const network = await workspace.run(
      process.execPath,
      [
        '-e',
        `
      const net=require('node:net');
      const socket=net.connect({host:'1.1.1.1',port:443});
      socket.setTimeout(1500);
      socket.on('connect',()=>{socket.destroy();process.exit(1)});
      socket.on('error',()=>{socket.destroy();process.exit(0)});
      socket.on('timeout',()=>{socket.destroy();process.exit(2)});
    `,
      ],
      { timeoutMs: 4000 },
    )
    assert.equal(
      network.code,
      0,
      'Outbound network must fail with an error, not merely time out',
    )
    record('direct outbound tool networking denied')
    const graderNetwork = await workspace.runGrader(
      process.execPath,
      [
        '-e',
        `const net=require('node:net');
      const socket=net.connect({host:'1.1.1.1',port:443});
      socket.setTimeout(1500);
      socket.on('connect',()=>{socket.destroy();process.exit(1)});
      socket.on('error',()=>{socket.destroy();process.exit(0)});
      socket.on('timeout',()=>{socket.destroy();process.exit(2)});`,
      ],
      { timeoutMs: 4000 },
    )
    assert.equal(graderNetwork.code, 0, graderNetwork.stderr)
    record('direct outbound grader networking denied')

    for (const timeout of [true, false]) {
      for (const detached of [true, false]) {
        const sentinel = join(workspace.root, `orphan-${timeout}-${detached}`)
        const childCode = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'orphan'),1000)`
        const controller = `
        const {spawn}=require('node:child_process');
        const child=spawn(process.execPath,['-e',${JSON.stringify(childCode)}],{stdio:'ignore',detached:${detached}});
        child.unref();
        ${timeout ? 'setInterval(()=>{},1000)' : ''}
      `
        const outcome = await workspace.run(
          process.execPath,
          ['-e', controller],
          { timeoutMs: timeout ? 150 : 3000 },
        )
        assert.equal(outcome.timedOut, timeout)
        await new Promise((resolve) => setTimeout(resolve, 1300))
        assert.equal(
          await exists(sentinel),
          false,
          'Descendant must stop when its command finishes',
        )
      }
    }
    record(
      'ordinary and detached descendants cleaned up after timeout and successful root exit',
    )
  })
  assert.equal(await exists(firstWorkspace), false)
  await withLocalWorkspace(prepared, async (workspace) => {
    assert.notEqual(workspace.root, firstWorkspace)
    assert.equal(
      await exists(join(workspace.root, 'source-write-proof')),
      false,
    )
    assert.doesNotMatch(
      await readFile(join(workspace.root, 'src/receipt.mjs'), 'utf8'),
      /999/,
    )
  })
  assert.ok(
    (await grade(prepared, null)).some(
      (check) =>
        check.exitCode !== 0 && /LINE_ROUNDING_REGRESSION/.test(check.output),
    ),
  )
  record('fresh attempts and fresh grading ignore previous workspace mutations')

  const authFile = join(directory, 'fake-auth.json')
  await writeJson(authFile, {
    auth_mode: 'chatgpt',
    tokens: { access_token: 'FAKE', refresh_token: 'FAKE' },
  })
  const plan = await createPlan(
    work,
    ['receipt-rounding'],
    ['plain-sol'],
    1,
    27,
    'local',
  )
  const cell = plan.cells[0]
  assert.ok(cell)
  let selected = false
  const stub: SolveOptions = {
    solverCommand: async (request) => {
      selected = true
      assert.equal(
        request.args.includes('--dangerously-bypass-approvals-and-sandbox'),
        false,
      )
      assert.equal(request.args.includes('--sandbox'), false)
      const config = await readFile(
        join(request.env.CODEX_HOME!, 'config.toml'),
        'utf8',
      )
      assert.match(config, /default_permissions/)
      const code = `require('node:fs').writeFileSync('src/receipt.mjs', ${JSON.stringify('export function receipt(items) {\n  return items.reduce((total, item) => total + Math.round(item.unitCents * item.quantity * (100 - item.discountPercent) / 100), 0)\n}\n')})`
      const edit = await request.workspace.run(process.execPath, ['-e', code])
      assert.equal(edit.code, 0, edit.stderr)
      await writeJson(join(request.env.CODEX_HOME!, 'auth.json'), {
        auth_mode: 'chatgpt',
        tokens: { access_token: 'FAKE-REFRESHED', refresh_token: 'FAKE' },
      })
      return {
        code: 0,
        timedOut: false,
        stderr: '',
        stdout:
          JSON.stringify({
            type: 'turn.completed',
            usage: { input_tokens: 7, output_tokens: 3 },
          }) + '\n',
      }
    },
  }
  const solved = await solve(work, plan.id, cell, prepared, authFile, stub)
  assert.equal(selected, true)
  assert.equal(solved.outcome, 'resolved', solved.message)
  assert.equal(solved.rootTokens, 10)
  assert.equal(solved.childTokens, null)
  assert.equal(solved.activation, 'not_applicable')
  assert.ok(
    solved.checks.length === 2 &&
      solved.checks.every((check) => check.exitCode === 0),
  )
  assert.equal(
    JSON.parse(await readFile(authFile, 'utf8')).tokens.access_token,
    'FAKE-REFRESHED',
  )
  await writeJson(
    join(work, 'plans', plan.id, 'attempts', cell.id, 'result.json'),
    solved,
  )
  assert.equal((await loadResults(work, plan)).length, 1)
  record(
    'fake solver transport exports patch, grades independently, records usage and refreshes fake auth',
  )

  const workflowPlan = await createPlan(
    work,
    ['receipt-rounding'],
    ['pstack-sol'],
    1,
    28,
    'local',
  )
  const workflowCell = workflowPlan.cells[0]
  assert.ok(workflowCell)
  const workflowResult = await solve(
    work,
    workflowPlan.id,
    workflowCell,
    prepared,
    authFile,
    {
      solverCommand: async (request) => {
        const policy = await request.workspace.run(process.execPath, [
          '-e',
          `
        const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
        const model=fs.readFileSync(path.join(process.env.HOME,'.pstack/models.md'),'utf8');
        assert.match(model,/gpt-5.6-sol/);
        function find(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
          const f=path.join(dir,e.name);
          if(e.isDirectory()){const match=find(f);if(match)return match}
          else if(f.endsWith('/poteto-mode/SKILL.md'))return f;
        }}
        const skill=find(path.join(process.env.CODEX_HOME,'plugins'));
        assert.ok(skill,'Installed workflow skill must be readable');
        assert.match(fs.readFileSync(skill,'utf8'),/poteto/i);
      `,
        ])
        assert.equal(policy.code, 0, policy.stderr)
        assert.ok(stub.solverCommand)
        return stub.solverCommand(request)
      },
    },
  )
  assert.equal(workflowResult.outcome, 'resolved', workflowResult.message)
  assert.equal(
    workflowResult.activation,
    'unknown',
    'Installing a workflow is not proof of agent activation',
  )
  record(
    'selected pstack installs with readable skills and pinned role models; activation stays separate',
  )

  const timedOut = await solve(
    work,
    'deterministic-timeout',
    { ...cell, id: 'timeout-proof' },
    prepared,
    authFile,
    {
      solverCommand: async (request) => {
        const outcome = await request.workspace.run(
          process.execPath,
          ['-e', 'setInterval(()=>{},1000)'],
          { timeoutMs: 100 },
        )
        return outcome
      },
    },
  )
  assert.equal(timedOut.outcome, 'timeout')
  assert.ok(timedOut.candidateHash)
  record('timed-out attempt retains a candidate artifact and failure outcome')

  const cancellationPlan = await createPlan(
    work,
    ['receipt-rounding'],
    ['plain-sol'],
    2,
    41,
    'local',
    {
      model: 'test-model',
      reasoningEffort: 'high',
      timeoutSeconds: 60,
      maxThreads: 1,
    },
  )
  assert.equal(cancellationPlan.cells[0]?.experiment.model, 'test-model')
  const previousAuth = process.env.BENCH_AUTH_FILE
  process.env.BENCH_AUTH_FILE = authFile
  try {
    await Effect.runPromise(
      runPlan(work, cancellationPlan, undefined, {
        solverCommand: async (request) => {
          const edit = await request.workspace.run(process.execPath, [
            '-e',
            `require('node:fs').writeFileSync('src/receipt.mjs', 'export function receipt() { return 777 }')`,
          ])
          assert.equal(edit.code, 0, edit.stderr)
          assert.equal(
            (await planStatus(work, cancellationPlan)).cells.filter(
              (c) => c.state === 'running',
            ).length,
            1,
          )
          await cancelPlan(work, cancellationPlan)
          assert.ok(request.signal)
          return request.workspace.run(
            process.execPath,
            ['-e', 'setInterval(()=>{},1000)'],
            { signal: request.signal, timeoutMs: 5000 },
          )
        },
      }),
    )
  } finally {
    if (previousAuth === undefined) delete process.env.BENCH_AUTH_FILE
    else process.env.BENCH_AUTH_FILE = previousAuth
  }
  const cancelled = await loadResults(work, cancellationPlan)
  assert.equal(cancelled.length, 1)
  assert.equal(cancelled[0]?.outcome, 'cancelled')
  assert.deepEqual(cancelled[0]?.checks, [])
  const cancelledCell = cancelled[0]?.cellId
  assert.ok(cancelledCell)
  assert.match(
    await readFile(
      join(
        work,
        'plans',
        cancellationPlan.id,
        'attempts',
        cancelledCell,
        'candidate.patch',
      ),
      'utf8',
    ),
    /777/,
  )
  assert.equal(
    (await planStatus(work, cancellationPlan)).cells.filter(
      (c) => c.state === 'pending',
    ).length,
    1,
  )
  const retry = await retryPlan(work, cancellationPlan)
  assert.deepEqual(retry.retryOf, {
    planId: cancellationPlan.id,
    cellIds: [cancelledCell],
  })
  assert.equal(
    (await loadResults(work, cancellationPlan))[0]?.outcome,
    'cancelled',
  )
  record(
    'operator cancellation retains edited candidate, leaves pending cells, and retry creates linked plan without overwriting originals',
  )

  const reviewDirectory = join(directory, 'review')
  await mkdir(reviewDirectory)
  await writeJson(join(reviewDirectory, 'schema.json'), verdictJsonSchema)
  const assessment = {
    winner: 'tie',
    rationale: 'Equivalent synthetic candidates.',
    evidence: [
      { candidate: 'A', path: 'app.vue', line: 1, quote: 'hello' },
      { candidate: 'B', path: 'app.vue', line: 1, quote: 'hello' },
    ],
  }
  const verdict = {
    ...Object.fromEntries(
      dimensions.map((dimension) => [dimension, assessment]),
    ),
    overall: { winner: 'tie', rationale: 'Equivalent synthetic candidates.' },
  }
  const judged = await invokeLocalJudge(
    prepared,
    authFile,
    reviewDirectory,
    'Synthetic judge transport, not a real review.',
    async (_command, args, options) => {
      assert.ok(options?.env?.CODEX_HOME)
      const config = await readFile(
        join(options.env.CODEX_HOME, 'config.toml'),
        'utf8',
      )
      assert.match(config, /shell_tool = false/)
      assert.match(config, /multi_agent = false/)
      assert.match(config, /plugins = false/)
      assert.equal(options.timeoutMs, 180000)
      const output = args[args.indexOf('--output-last-message') + 1]
      assert.ok(output)
      await writeJson(output, verdict)
      await writeJson(join(options.env.CODEX_HOME, 'auth.json'), {
        auth_mode: 'chatgpt',
        tokens: { access_token: 'FAKE-JUDGE-REFRESH', refresh_token: 'FAKE' },
      })
      return {
        code: 0,
        timedOut: false,
        stderr: '',
        stdout:
          JSON.stringify({
            type: 'turn.completed',
            usage: { input_tokens: 4, output_tokens: 6 },
          }) + '\n',
      }
    },
  )
  const parsed = validateVerdict(judged.value, {
    A: [{ path: 'app.vue', text: 'hello' }],
    B: [{ path: 'app.vue', text: 'hello' }],
  })
  assert.equal(parsed.overall.winner, 'tie')
  assert.equal(judged.tokens, 10)
  assert.equal(
    JSON.parse(await readFile(authFile, 'utf8')).tokens.access_token,
    'FAKE-JUDGE-REFRESH',
  )
  await assert.rejects(
    invokeLocalJudge(
      prepared,
      authFile,
      reviewDirectory,
      'Reject tool usage.',
      async () => ({
        code: 0,
        timedOut: false,
        stderr: '',
        stdout: [
          {
            type: 'item.completed',
            item: { type: 'command_execution', command: 'true', exit_code: 0 },
          },
          {
            type: 'turn.completed',
            usage: { input_tokens: 1, output_tokens: 1 },
          },
        ]
          .map((value) => JSON.stringify(value))
          .join('\n'),
      }),
    ),
    /Judge used a tool/,
  )
  await assert.rejects(
    invokeLocalJudge(
      prepared,
      authFile,
      reviewDirectory,
      'Retain timeout failure.',
      async () => ({ code: 137, timedOut: true, stdout: '', stderr: '' }),
    ),
    /Judge timeout/,
  )
  record(
    'native fake judge validates output and usage, refreshes fake auth, rejects tool use and timeout',
  )

  await mkdir(join(root, 'artifacts'), { recursive: true })
  await writeJson(artifact, {
    kind: 'deterministic-local-proof-not-model-evidence',
    createdAt: now(),
    checks,
    qualification,
    transport: solved,
    workflowTransport: workflowResult,
    timeout: timedOut,
    cancellation: { plan: cancellationPlan, results: cancelled, retry },
    judge: judged,
  })
  console.log(`Local proof passed. No model calls. Evidence ${artifact}`)
} catch (error) {
  const qualification = join(
    work,
    'tasks/receipt-rounding/local/qualification.json',
  )
  if (await exists(qualification)) {
    console.error(await readFile(qualification, 'utf8'))
  }
  throw error
} finally {
  await rm(directory, { recursive: true, force: true })
}

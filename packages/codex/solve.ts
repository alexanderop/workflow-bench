import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Cell, Prepared, Result } from '../core/model.js'
import { loadWorkflow } from '../core/catalog.js'
import { hash, now, root, writeJson } from '../core/io.js'
import { container, copyIn } from '../docker/container.js'
import { execute, must } from '../docker/process.js'
import { withAuth } from './auth.js'
import { parseEvents, sessionEvidence } from './events.js'
import { workflowDirectory } from '../runner/workflows.js'
import { prompt } from '../runner/prepare.js'
import { grade, inspectPatch } from '../runner/grade.js'
import { withLocalWorkspace, type LocalWorkspace } from '../local/workspace.js'
import type { Execution } from '../process/process.js'

async function solveDocker(
  work: string,
  planId: string,
  cell: Cell,
  prepared: Prepared,
  authFile: string,
  options: SolveOptions,
): Promise<Result> {
  const directory = join(work, 'plans', planId, 'attempts', cell.id)
  await mkdir(directory, { recursive: true })
  const startedAt = now(),
    started = Date.now()
  const base: Result = {
    version: 2,
    planId,
    cellId: cell.id,
    taskId: cell.taskId,
    experiment: cell.experiment,
    repetition: cell.repetition,
    fingerprint: cell.fingerprint,
    environment: cell.environment,
    workflowHash: cell.workflowHash,
    outcome: 'infrastructure_error',
    message: 'Execution did not finish',
    startedAt,
    durationMs: 0,
    candidateHash: null,
    activation:
      cell.experiment.workflow === 'plain' ? 'not_applicable' : 'unknown',
    rootTokens: null,
    childTokens: null,
    completedChildren: 0,
    checks: [],
  }
  const workflow =
    cell.experiment.workflow === 'plain'
      ? null
      : await loadWorkflow(cell.experiment.workflow)
  const taskPrompt = await prompt(cell.taskId)
  const instructions = [
    workflow?.entrypoint ?? '',
    taskPrompt,
    `This is an autonomous benchmark with a fully specified task. Make reasonable assumptions; no human reply is available. Use ${cell.experiment.model} for all child agents. Do not publish, push, or access external source repositories.`,
    `Only production changes under these paths are accepted: ${prepared.task.allowedPaths.join(', ')}. Do not leave changes to tests, configuration, dependency manifests, or planning files. Use temporary files outside the repository for workflow notes. Existing tests are available; hidden acceptance tests are applied later.`,
  ].join('\n\n')
  await writeFile(join(directory, 'prompt.md'), instructions)
  const network = `wb-${randomUUID()}`,
    proxy = `wb-proxy-${randomUUID()}`
  try {
    return await withAuth(authFile, async (auth, persist) => {
      await must('docker', [
        'network',
        'create',
        '--internal',
        '--label',
        'workflow-bench=true',
        network,
      ])
      await must('docker', [
        'run',
        '-d',
        '--name',
        proxy,
        '--label',
        'workflow-bench=true',
        '--memory',
        '128m',
        '--pids-limit',
        '64',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--mount',
        `type=bind,src=${join(root, 'packages/docker/proxy.mjs')},dst=/proxy.mjs,readonly`,
        prepared.locator.kind === 'docker' ? prepared.locator.imageId : '',
        'node',
        '/proxy.mjs',
      ])
      await must('docker', ['network', 'connect', network, proxy])
      return container(
        prepared.locator.kind === 'docker' ? prepared.locator.imageId : '',
        async (id) => {
          const proxyUrl = `http://${proxy}:3128`
          const networkEnv = [
            '-e',
            `HTTPS_PROXY=${proxyUrl}`,
            '-e',
            `HTTP_PROXY=${proxyUrl}`,
            '-e',
            'NO_PROXY=localhost,127.0.0.1',
          ]
          const version = await must('docker', [
            'exec',
            id,
            'codex',
            '--version',
          ])
          if (version !== `codex-cli ${cell.experiment.codexVersion}`)
            throw new Error(
              `Image has ${version}; experiment requires ${cell.experiment.codexVersion}`,
            )
          await must(
            'docker',
            [
              'exec',
              '-i',
              id,
              'node',
              '-e',
              "require('fs').writeFileSync('/home/node/.codex/auth.json',require('fs').readFileSync(0),{mode:384})",
            ],
            { input: auth },
          )
          const baseline = await must('docker', [
            'exec',
            id,
            'git',
            'rev-parse',
            'HEAD',
          ])
          const config =
            [
              `model = ${JSON.stringify(cell.experiment.model)}`,
              `model_reasoning_effort = ${JSON.stringify(cell.experiment.reasoningEffort)}`,
              'cli_auth_credentials_store = "file"',
              'web_search = "disabled"',
              '[features]',
              'multi_agent = true',
              '[agents]',
              `max_threads = ${cell.experiment.maxThreads}`,
              `max_depth = ${cell.experiment.maxDepth}`,
            ].join('\n') + '\n'
          await must(
            'docker',
            [
              'exec',
              '-i',
              id,
              'node',
              '-e',
              "require('fs').writeFileSync('/home/node/.codex/config.toml',require('fs').readFileSync(0))",
            ],
            { input: '\n' + config },
          )
          if (workflow) {
            await copyIn(
              id,
              workflowDirectory(work, workflow.id),
              '/tmp/workflow',
            )
            await copyIn(
              id,
              join(root, 'packages/codex/install.mjs'),
              '/tmp/install.mjs',
            )
            const installed = await execute('docker', [
              'exec',
              id,
              'node',
              '/tmp/install.mjs',
              workflow.installation,
              workflow.id,
              cell.experiment.model,
            ])
            await writeFile(
              join(directory, 'installation.log'),
              installed.stdout + '\n' + installed.stderr,
            )
            if (installed.code !== 0)
              return {
                ...base,
                outcome: 'unsupported',
                message:
                  'Workflow installation failed; inspect installation.log',
                durationMs: Date.now() - started,
              }
          }
          let output
          try {
            output = await execute(
              'docker',
              [
                'exec',
                '-i',
                ...networkEnv,
                id,
                'timeout',
                '--signal=TERM',
                '--kill-after=5s',
                `${cell.experiment.timeoutSeconds}s`,
                'codex',
                'exec',
                '--json',
                '--color',
                'never',
                '--dangerously-bypass-approvals-and-sandbox',
                '--dangerously-bypass-hook-trust',
                '-m',
                cell.experiment.model,
                '-',
              ],
              {
                input: instructions,
                timeoutMs: (cell.experiment.timeoutSeconds + 30) * 1000,
                ...(options.signal ? { signal: options.signal } : {}),
              },
            )
          } finally {
            if (options.signal?.aborted)
              await must('docker', [
                'exec',
                id,
                'sh',
                '-c',
                // Freeze every pre-existing workload in the container before
                // exporting evidence. kill(-1) excludes this helper and PID 1;
                // container removal later kills the stopped process tree.
                'kill -STOP -1 2>/dev/null || true',
              ])
            const refreshed = await must('docker', [
              'exec',
              id,
              'node',
              '-e',
              "process.stdout.write(require('fs').readFileSync('/home/node/.codex/auth.json'))",
            ])
            await persist(refreshed)
          }
          // Raw transcripts are private local artifacts, never loaded into the public viewer.
          await writeFile(join(directory, 'events.jsonl'), output.stdout, {
            mode: 0o600,
          })
          await writeFile(join(directory, 'stderr.log'), output.stderr, {
            mode: 0o600,
          })
          const events = parseEvents(
            output.stdout,
            workflow?.evidencePath ?? null,
          )
          await copyIn(
            id,
            join(root, 'packages/codex/evidence.mjs'),
            '/tmp/evidence.mjs',
          )
          const evidence = sessionEvidence(
            JSON.parse(
              await must('docker', ['exec', id, 'node', '/tmp/evidence.mjs']),
            ),
            cell.experiment.model,
          )
          await writeJson(join(directory, 'sessions.json'), evidence)
          await must('docker', ['exec', id, 'git', 'add', '-N', '.'])
          const diff = await execute('docker', [
            'exec',
            id,
            'git',
            'diff',
            '--no-ext-diff',
            '--binary',
            baseline,
            '--',
            '.',
          ])
          if (diff.code !== 0)
            throw new Error('Could not export candidate diff')
          const patch = diff.stdout
          await writeFile(join(directory, 'candidate.patch'), patch)
          const observed = {
            ...base,
            candidateHash: hash(patch),
            durationMs: Date.now() - started,
            rootTokens: events.tokens,
            childTokens: evidence.childTokens,
            completedChildren: evidence.completedChildren,
            activation: workflow
              ? events.activated
                ? ('observed' as const)
                : ('unknown' as const)
              : ('not_applicable' as const),
          }
          if (options.signal?.aborted)
            return {
              ...observed,
              outcome: 'cancelled',
              message: 'Solver cancelled; partial evidence retained',
            }
          if (output.timedOut || output.code === 124 || output.code === 137)
            return {
              ...observed,
              outcome: 'timeout',
              message: 'Solver exceeded the experiment time limit',
            }
          if (events.outcome)
            return {
              ...observed,
              outcome: events.outcome,
              message:
                'Codex reported a provider or runtime error; inspect private logs',
            }
          if (output.code !== 0 || events.terminal !== 'completed')
            return {
              ...observed,
              outcome: 'infrastructure_error',
              message: 'Codex did not emit a successful terminal event',
            }
          if (evidence.modelMismatch)
            return {
              ...observed,
              outcome: 'unsupported',
              message:
                'Observed child model differs from the controlled experiment model',
            }
          try {
            inspectPatch(patch, prepared.task)
          } catch (error) {
            return {
              ...observed,
              candidateHash: hash(patch),
              outcome: 'unresolved',
              message: error instanceof Error ? error.message : String(error),
            }
          }
          const checks = await grade(
            prepared,
            join(directory, 'candidate.patch'),
            options.signal,
          )
          if (options.signal?.aborted)
            return {
              ...observed,
              checks,
              outcome: 'cancelled',
              message:
                'Solver cancelled during grading; partial evidence retained',
            }
          const passed =
            checks.length === prepared.task.checks.length &&
            checks.every((c) => c.exitCode === 0 && !c.timedOut)
          return {
            ...observed,
            candidateHash: hash(patch),
            checks,
            outcome: passed ? 'resolved' : 'unresolved',
            message: passed
              ? 'Independent acceptance checks passed'
              : 'Independent acceptance checks failed',
          }
        },
        network,
      )
    })
  } finally {
    await execute('docker', ['rm', '-f', proxy])
    await execute('docker', ['network', 'rm', network])
  }
}

export interface SolverRequest {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  readonly input: string
  readonly timeoutMs: number
  readonly workspace: LocalWorkspace
  readonly signal?: AbortSignal
}
export interface SolveOptions {
  readonly solverCommand?: (request: SolverRequest) => Promise<Execution>
  readonly signal?: AbortSignal
}

async function solveLocal(
  work: string,
  planId: string,
  cell: Cell,
  prepared: Prepared,
  authFile: string,
  options: SolveOptions,
): Promise<Result> {
  if (prepared.locator.kind !== 'local')
    throw new Error('Local solve requires a local prepared artifact')
  const locator = prepared.locator
  const directory = join(work, 'plans', planId, 'attempts', cell.id)
  await mkdir(directory, { recursive: true })
  const startedAt = now(),
    started = Date.now()
  const base: Result = {
    version: 2,
    planId,
    cellId: cell.id,
    taskId: cell.taskId,
    experiment: cell.experiment,
    repetition: cell.repetition,
    fingerprint: cell.fingerprint,
    environment: cell.environment,
    workflowHash: cell.workflowHash,
    outcome: 'infrastructure_error',
    message: 'Execution did not finish',
    startedAt,
    durationMs: 0,
    candidateHash: null,
    activation:
      cell.experiment.workflow === 'plain' ? 'not_applicable' : 'unknown',
    rootTokens: null,
    childTokens: null,
    completedChildren: 0,
    checks: [],
  }
  const workflow =
    cell.experiment.workflow === 'plain'
      ? null
      : await loadWorkflow(cell.experiment.workflow)
  const instructions = [
    workflow?.entrypoint ?? '',
    await prompt(cell.taskId),
    `This is an autonomous benchmark with a fully specified task. Make reasonable assumptions; no human reply is available. Use ${cell.experiment.model} for all child agents. Do not publish, push, or access external source repositories.`,
    `Only production changes under these paths are accepted: ${prepared.task.allowedPaths.join(', ')}. Do not leave changes to tests, configuration, dependency manifests, or planning files. Use temporary files outside the repository for workflow notes. Existing tests are available; hidden acceptance tests are applied later.`,
  ].join('\n\n')
  await writeFile(join(directory, 'prompt.md'), instructions)
  return withAuth(authFile, async (auth, persist) =>
    withLocalWorkspace(prepared, async (workspace) => {
      const authPath = join(workspace.codexHome, 'auth.json'),
        configPath = join(workspace.codexHome, 'config.toml')
      await writeFile(authPath, auth, { mode: 0o600 })
      const config =
        [
          `model = ${JSON.stringify(cell.experiment.model)}`,
          `model_reasoning_effort = ${JSON.stringify(cell.experiment.reasoningEffort)}`,
          'cli_auth_credentials_store = "file"',
          'web_search = "disabled"',
          'default_permissions = "bench"',
          'approval_policy = "never"',
          '[features]',
          'multi_agent = true',
          'network_proxy = true',
          'apps = false',
          'browser_use = false',
          'computer_use = false',
          '[agents]',
          `max_threads = ${cell.experiment.maxThreads}`,
          `max_depth = ${cell.experiment.maxDepth}`,
          workspace.permissions,
        ].join('\n') + '\n'

      await writeFile(configPath, config, { mode: 0o600 })
      if (workflow) {
        const workflowRoot = join(workspace.tmp, 'workflow')
        await cp(workflowDirectory(work, workflow.id), workflowRoot, {
          recursive: true,
          verbatimSymlinks: true,
        })
        const installed = await execute(
          process.execPath,
          [
            join(root, 'packages/codex/install.mjs'),
            workflow.installation,
            workflow.id,
            cell.experiment.model,
            workflowRoot,
            workspace.home,
            workspace.codexHome,
          ],
          { cwd: workspace.root, env: workspace.env },
        )
        await writeFile(
          join(directory, 'installation.log'),
          installed.stdout + '\n' + installed.stderr,
        )
        if (installed.code !== 0)
          return {
            ...base,
            outcome: 'unsupported',
            message: 'Workflow installation failed; inspect installation.log',
            durationMs: Date.now() - started,
          }
      }
      const browser = await workspace.startBrowser()
      const solverInstructions = browser
        ? `${instructions}\n\nA prestarted headless Chromium is available at the BENCH_BROWSER_WS_ENDPOINT environment variable. For browser feedback, connect with the installed Playwright chromium.connectOverCDP endpoint. Reuse that browser and do not launch another browser process.`
        : instructions
      if (browser) workspace.env.BENCH_BROWSER_WS_ENDPOINT = browser.endpoint
      await writeFile(join(directory, 'prompt.md'), solverInstructions)
      const request: SolverRequest = {
        command: locator.codexExecutable,
        args: [
          'exec',
          '--json',
          '--color',
          'never',
          '-m',
          cell.experiment.model,
          '-',
        ],
        cwd: workspace.root,
        env: workspace.env,
        input: solverInstructions,
        timeoutMs: cell.experiment.timeoutSeconds * 1000,
        workspace,
        ...(options.signal ? { signal: options.signal } : {}),
      }
      let output: Execution
      try {
        output = options.solverCommand
          ? await options.solverCommand(request)
          : await execute(request.command, request.args, {
              cwd: request.cwd,
              env: request.env,
              input: request.input,
              timeoutMs: request.timeoutMs,
              ...(request.signal ? { signal: request.signal } : {}),
            })
      } finally {
        try {
          await persist(await readFile(authPath, 'utf8'))
        } finally {
          await browser?.stop()
          delete workspace.env.BENCH_BROWSER_WS_ENDPOINT
        }
      }
      await writeFile(join(directory, 'events.jsonl'), output.stdout, {
        mode: 0o600,
      })
      await writeFile(join(directory, 'stderr.log'), output.stderr, {
        mode: 0o600,
      })
      const events = parseEvents(output.stdout, workflow?.evidencePath ?? null)
      const evidenceOutput = await execute(
        process.execPath,
        [join(root, 'packages/codex/evidence.mjs'), workspace.codexHome],
        { cwd: workspace.root, env: workspace.env },
      )
      const evidence = sessionEvidence(
        evidenceOutput.code === 0 ? JSON.parse(evidenceOutput.stdout) : [],
        cell.experiment.model,
      )
      await writeJson(join(directory, 'sessions.json'), evidence)
      await must('git', ['add', '-N', '.'], {
        cwd: workspace.root,
        env: workspace.env,
      })
      const baseline = await workspace.run('git', ['rev-parse', 'HEAD']),
        diff = await workspace.run('git', [
          'diff',
          '--no-ext-diff',
          '--binary',
          baseline.stdout.trim(),
          '--',
          '.',
        ])
      if (diff.code !== 0) throw new Error('Could not export candidate diff')
      const patch = diff.stdout
      await writeFile(join(directory, 'candidate.patch'), patch)
      const observed = {
        ...base,
        candidateHash: hash(patch),
        durationMs: Date.now() - started,
        rootTokens: events.tokens,
        childTokens: evidence.childTokens,
        completedChildren: evidence.completedChildren,
        activation: workflow
          ? events.activated
            ? ('observed' as const)
            : ('unknown' as const)
          : ('not_applicable' as const),
      }
      if (options.signal?.aborted)
        return {
          ...observed,
          outcome: 'cancelled',
          message: 'Solver cancelled; partial evidence retained',
        }
      if (output.timedOut || output.code === 124 || output.code === 137)
        return {
          ...observed,
          outcome: 'timeout',
          message: 'Solver exceeded the experiment time limit',
        }
      if (events.outcome)
        return {
          ...observed,
          outcome: events.outcome,
          message:
            'Codex reported a provider or runtime error; inspect private logs',
        }
      if (output.code !== 0 || events.terminal !== 'completed')
        return {
          ...observed,
          outcome: 'infrastructure_error',
          message: 'Codex did not emit a successful terminal event',
        }
      if (evidence.modelMismatch)
        return {
          ...observed,
          outcome: 'unsupported',
          message:
            'Observed child model differs from the controlled experiment model',
        }
      try {
        inspectPatch(patch, prepared.task)
      } catch (error) {
        return {
          ...observed,
          outcome: 'unresolved',
          message: error instanceof Error ? error.message : String(error),
        }
      }
      const checks = await grade(
          prepared,
          join(directory, 'candidate.patch'),
          options.signal,
        ),
        passed =
          checks.length === prepared.task.checks.length &&
          checks.every((check) => check.exitCode === 0 && !check.timedOut)
      if (options.signal?.aborted)
        return {
          ...observed,
          checks,
          outcome: 'cancelled',
          message: 'Solver cancelled during grading; partial evidence retained',
        }
      return {
        ...observed,
        checks,
        outcome: passed ? 'resolved' : 'unresolved',
        message: passed
          ? 'Independent acceptance checks passed'
          : 'Independent acceptance checks failed',
      }
    }),
  )
}

export async function solve(
  work: string,
  planId: string,
  cell: Cell,
  prepared: Prepared,
  authFile: string,
  options: SolveOptions = {},
): Promise<Result> {
  return prepared.environment.kind === 'local'
    ? solveLocal(work, planId, cell, prepared, authFile, options)
    : solveDocker(work, planId, cell, prepared, authFile, options)
}

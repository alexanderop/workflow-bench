import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { withAuth } from '../codex/auth.js'
import { parseEvents } from '../codex/events.js'
import { root } from '../core/io.js'
import { container, copyIn } from '../docker/container.js'
import { execute, must } from '../docker/process.js'
import type { Prepared } from '../core/model.js'
import { withLocalWorkspace } from '../local/workspace.js'

export const judgeProfile = {
  model: 'gpt-5.6-sol',
  reasoningEffort: 'medium',
  codexVersion: '0.157.1',
  timeoutSeconds: 180,
} as const

export async function invokeLocalJudge(
  prepared: Prepared,
  authFile: string,
  directory: string,
  prompt: string,
  invoke: typeof execute = execute,
) {
  if (
    prepared.locator.kind !== 'local' ||
    prepared.environment.kind !== 'local'
  )
    throw new Error('Native judging requires a local prepared environment')
  if (prepared.environment.codexVersion !== judgeProfile.codexVersion)
    throw new Error('Judge Codex version mismatch')
  const command = prepared.locator.codexExecutable
  return withAuth(authFile, async (auth, persist) =>
    withLocalWorkspace(prepared, async (workspace) => {
      const review = join(workspace.tmp, 'review')
      await mkdir(review)
      const schema = join(review, 'schema.json'),
        verdict = join(review, 'verdict.json')
      await copyFile(join(directory, 'schema.json'), schema)
      const authPath = join(workspace.codexHome, 'auth.json')
      await writeFile(authPath, auth, { mode: 0o600 })
      await writeFile(
        join(workspace.codexHome, 'config.toml'),
        [
          `model = ${JSON.stringify(judgeProfile.model)}`,
          `model_reasoning_effort = ${JSON.stringify(judgeProfile.reasoningEffort)}`,
          'cli_auth_credentials_store = "file"',
          'default_permissions = "bench"',
          'approval_policy = "never"',
          'web_search = "disabled"',
          'project_doc_max_bytes = 0',
          '[skills]',
          'include_instructions = false',
          '[features]',
          'network_proxy = true',
          'multi_agent = false',
          'shell_tool = false',
          'plugins = false',
          'apps = false',
          'browser_use = false',
          'computer_use = false',
          workspace.permissions,
        ].join('\n') + '\n',
        { mode: 0o600 },
      )
      const started = Date.now()
      let output
      try {
        output = await invoke(
          command,
          [
            'exec',
            '--json',
            '--color',
            'never',
            '--skip-git-repo-check',
            '--output-schema',
            schema,
            '--output-last-message',
            verdict,
            '-',
          ],
          {
            cwd: review,
            env: workspace.env,
            input: prompt,
            timeoutMs: judgeProfile.timeoutSeconds * 1000,
          },
        )
      } finally {
        await persist(await readFile(authPath, 'utf8'))
      }
      await writeFile(join(directory, 'events.jsonl'), output.stdout, {
        mode: 0o600,
      })
      await writeFile(join(directory, 'stderr.log'), output.stderr, {
        mode: 0o600,
      })
      const events = parseEvents(output.stdout, null)
      if (output.timedOut || output.code === 124 || output.code === 137)
        throw new Error('Judge timeout')
      if (
        output.code !== 0 ||
        events.terminal !== 'completed' ||
        events.outcome
      )
        throw new Error(
          `Judge failed: ${events.outcome ?? output.code}; inspect private logs`,
        )
      if (
        events.timeline.some(
          (item) => item.type !== 'agent_message' && item.type !== 'reasoning',
        )
      )
        throw new Error('Judge used a tool; blind code-only review invalid')
      const raw = await readFile(verdict, 'utf8')
      await writeFile(join(directory, 'raw-verdict.json'), raw, { mode: 0o600 })
      return {
        value: JSON.parse(raw) as unknown,
        durationMs: Date.now() - started,
        tokens: events.tokens,
      }
    }),
  )
}

export async function invokeJudge(
  image: string,
  authFile: string,
  directory: string,
  prompt: string,
) {
  const network = `wb-judge-${randomUUID()}`,
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
        image,
        'node',
        '/proxy.mjs',
      ])
      await must('docker', ['network', 'connect', network, proxy])
      return container(
        image,
        async (id) => {
          if (
            (await must('docker', ['exec', id, 'codex', '--version'])) !==
            `codex-cli ${judgeProfile.codexVersion}`
          )
            throw new Error('Judge Codex version mismatch')
          await must(
            'docker',
            [
              'exec',
              '-i',
              id,
              'node',
              '-e',
              "require('fs').writeFileSync('/home/node/.codex/auth.json',require('fs').readFileSync(0),{mode:384});require('fs').mkdirSync('/tmp/review',{recursive:true})",
            ],
            { input: auth },
          )
          await copyIn(
            id,
            join(directory, 'schema.json'),
            '/tmp/review/schema.json',
          )
          const started = Date.now()
          let output
          try {
            output = await execute(
              'docker',
              [
                'exec',
                '-i',
                '-w',
                '/tmp/review',
                '-e',
                `HTTPS_PROXY=http://${proxy}:3128`,
                '-e',
                `HTTP_PROXY=http://${proxy}:3128`,
                '-e',
                'NO_PROXY=localhost,127.0.0.1',
                id,
                'timeout',
                '--signal=TERM',
                '--kill-after=5s',
                `${judgeProfile.timeoutSeconds}s`,
                'codex',
                'exec',
                '--json',
                '--color',
                'never',
                '--skip-git-repo-check',
                '--sandbox',
                'read-only',
                '-m',
                judgeProfile.model,
                '-c',
                `model_reasoning_effort="${judgeProfile.reasoningEffort}"`,
                '-c',
                'cli_auth_credentials_store="file"',
                '-c',
                'web_search="disabled"',
                '-c',
                'features.multi_agent=false',
                '-c',
                'features.shell_tool=false',
                '-c',
                'features.apps=false',
                '--output-schema',
                '/tmp/review/schema.json',
                '--output-last-message',
                '/tmp/review/verdict.json',
                '-',
              ],
              {
                input: prompt,
                timeoutMs: (judgeProfile.timeoutSeconds + 30) * 1000,
              },
            )
          } finally {
            await persist(
              await must('docker', [
                'exec',
                id,
                'node',
                '-e',
                "process.stdout.write(require('fs').readFileSync('/home/node/.codex/auth.json'))",
              ]),
            )
          }
          await writeFile(join(directory, 'events.jsonl'), output.stdout, {
            mode: 0o600,
          })
          await writeFile(join(directory, 'stderr.log'), output.stderr, {
            mode: 0o600,
          })
          const events = parseEvents(output.stdout, null)
          if (output.timedOut || output.code === 124 || output.code === 137)
            throw new Error('Judge timeout')
          if (
            output.code !== 0 ||
            events.terminal !== 'completed' ||
            events.outcome
          )
            throw new Error(
              `Judge failed: ${events.outcome ?? output.code}; inspect private logs`,
            )
          if (
            events.timeline.some(
              (item) =>
                item.type !== 'agent_message' && item.type !== 'reasoning',
            )
          )
            throw new Error('Judge used a tool; blind code-only review invalid')
          const raw = await must('docker', [
            'exec',
            id,
            'cat',
            '/tmp/review/verdict.json',
          ])
          await writeFile(join(directory, 'raw-verdict.json'), raw, {
            mode: 0o600,
          })
          return {
            value: JSON.parse(raw) as unknown,
            durationMs: Date.now() - started,
            tokens: events.tokens,
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

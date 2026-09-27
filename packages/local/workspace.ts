import { arch, homedir, release, tmpdir } from 'node:os'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { delimiter, dirname, join, sep } from 'node:path'
import type { Prepared } from '../core/model.js'
import { exists, hash } from '../core/io.js'
import {
  execute,
  must,
  type Execution,
  type Options,
} from '../process/process.js'

export const sandboxPolicyVersion = 'native-macos-v3'
const codexTarget =
  process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
const codexFallback = join(
  homedir(),
  `.vite-plus/packages/@openai/codex/lib/node_modules/@openai/codex/node_modules/@openai/codex-darwin-${process.arch}/vendor/${codexTarget}/bin/codex`,
)
const safeEnvKeys = ['LANG', 'LC_ALL', 'TERM', 'COLORTERM'] as const

export async function resolveExecutable(name: 'codex' | 'pnpm') {
  const configured =
    name === 'codex' ? process.env.BENCH_CODEX_BIN : process.env.BENCH_PNPM_BIN
  if (configured) {
    await stat(configured)
    return await realpath(configured)
  }
  if (name === 'codex' && (await exists(codexFallback)))
    return await realpath(codexFallback)
  const result = await execute('/usr/bin/which', [name], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
  })
  if (result.code !== 0)
    throw new Error(
      `${name} is unavailable; set BENCH_${name.toUpperCase()}_BIN to the required executable`,
    )
  return await realpath(result.stdout.trim())
}
export async function ensurePinnedPnpm(work: string, version: string) {
  const configured = process.env.BENCH_PNPM_BIN
  if (configured) return await realpath(configured)
  const prefix = join(work, 'cache', 'toolchains', `pnpm-${version}`),
    executable = join(prefix, 'node_modules', '.bin', 'pnpm')
  if (!(await exists(executable))) {
    await mkdir(prefix, { recursive: true })
    await must(
      'npm',
      [
        'install',
        '--prefix',
        prefix,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        `pnpm@${version}`,
      ],
      { timeoutMs: 300_000 },
    )
  }
  const actual = await must(executable, ['--version'])
  if (actual !== version)
    throw new Error(
      `Cached pnpm identity mismatch: expected ${version}, received ${actual}`,
    )
  return await realpath(executable)
}
export async function localToolchain(
  pnpmVersion: string,
  codexVersion = '0.157.1',
  pnpmOverride?: string,
  codexOverride?: string,
) {
  if (process.platform !== 'darwin')
    throw new Error(
      'The local backend currently supports macOS only; choose --backend docker on this platform',
    )
  const pnpm = pnpmOverride ?? (await resolveExecutable('pnpm')),
    codex = codexOverride ?? (await resolveExecutable('codex'))
  const actualPnpm = (await must(pnpm, ['--version'])).trim(),
    actualCodex = (await must(codex, ['--version'])).replace(
      /^codex-cli\s+/,
      '',
    )
  if (actualPnpm !== pnpmVersion)
    throw new Error(
      `Task requires pnpm ${pnpmVersion}, but ${pnpm} is ${actualPnpm}. Set BENCH_PNPM_BIN to the task-pinned pnpm executable`,
    )
  if (actualCodex !== codexVersion)
    throw new Error(
      `Experiment requires Codex ${codexVersion}, but ${codex} is ${actualCodex}. Set BENCH_CODEX_BIN to the matching vendor executable`,
    )
  return {
    pnpm,
    codex,
    pnpmVersion: actualPnpm,
    codexVersion: actualCodex,
    platform: 'darwin' as const,
    arch: arch(),
    osRelease: release(),
    nodeVersion: process.version,
  }
}
async function cloneTree(source: string, destination: string) {
  await mkdir(dirname(destination), { recursive: true })
  const cloned = await execute('/bin/cp', ['-cR', source, destination])
  if (cloned.code !== 0)
    await cp(source, destination, {
      recursive: true,
      verbatimSymlinks: true,
      mode: constants.COPYFILE_FICLONE,
    })
}
export async function validateTree(root: string) {
  const canonical = await realpath(root)
  async function walk(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name)
      if (entry.isSymbolicLink()) {
        const target = await realpath(file)
        if (target !== canonical && !target.startsWith(canonical + sep))
          throw new Error(
            `Prepared snapshot contains escaping symlink: ${file}`,
          )
      } else if (entry.isDirectory()) await walk(file)
    }
  }
  await walk(root)
}
export async function snapshotDigest(root: string) {
  await validateTree(root)
  const entries: string[] = []
  async function walk(path: string, relative: string): Promise<void> {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const file = join(path, entry.name),
        name = join(relative, entry.name)
      if (entry.isSymbolicLink())
        entries.push(`${name}:link:${await readlink(file)}`)
      else if (entry.isDirectory()) await walk(file, name)
      else {
        const info = await lstat(file)
        entries.push(`${name}:${info.size}:${hash(await readFile(file))}`)
      }
    }
  }
  await walk(root, '')
  return hash(entries.join('\n'))
}
export interface LocalWorkspace {
  readonly root: string
  readonly home: string
  readonly codexHome: string
  readonly tmp: string
  readonly env: NodeJS.ProcessEnv
  readonly permissions: string
  startBrowser(): Promise<LocalBrowser | null>
  run(
    command: string,
    args: readonly string[],
    options?: Omit<Options, 'cwd' | 'env'>,
  ): Promise<Execution>
  runGrader(
    command: string,
    args: readonly string[],
    options?: Omit<Options, 'cwd' | 'env'>,
  ): Promise<Execution>
}
export interface LocalBrowser {
  readonly endpoint: string
  readonly pid: number
  stop(): Promise<void>
}
async function findHeadlessShell(directory: string): Promise<string | null> {
  if (!(await exists(directory))) return null
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await findHeadlessShell(path)
      if (nested) return nested
    } else if (entry.isFile() && entry.name === 'chrome-headless-shell')
      return path
  }
  return null
}
async function startLocalBrowser(
  repo: string,
  tmp: string,
  env: NodeJS.ProcessEnv,
  graderPolicyPath: string,
): Promise<LocalBrowser | null> {
  const executable = await findHeadlessShell(join(repo, '.bench-playwright'))
  if (!executable) return null
  const profile = join(tmp, 'solver-browser-profile')
  await mkdir(profile)
  const child = spawn(
    '/usr/bin/sandbox-exec',
    [
      '-f',
      graderPolicyPath,
      executable,
      '--headless',
      '--no-sandbox',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { cwd: repo, env, detached: true, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  let stopped = false
  const stop = async () => {
    if (stopped) return
    stopped = true
    if (child.pid)
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {}
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) resolve()
      else child.once('close', () => resolve())
    })
  }
  try {
    const endpoint = await new Promise<string>((resolve, reject) => {
      let stderr = ''
      const timer = setTimeout(
        () => reject(new Error(`Chromium CDP startup timed out: ${stderr}`)),
        10_000,
      )
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString()
        const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr)
        if (match?.[1]) {
          clearTimeout(timer)
          resolve(match[1])
        }
      })
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code, signal) => {
        clearTimeout(timer)
        reject(
          new Error(
            `Chromium exited before CDP startup (${code ?? signal}): ${stderr}`,
          ),
        )
      })
    })
    if (!child.pid) throw new Error('Chromium started without a process ID')
    return { endpoint, pid: child.pid, stop }
  } catch (error) {
    await stop()
    throw error
  }
}
function graderSeatbeltPolicy(
  repo: string,
  home: string,
  tmp: string,
  toolPaths: readonly string[],
) {
  const subpath = (operation: string, path: string) =>
    `(${operation} (subpath ${JSON.stringify(path)}))`
  return (
    [
      '(version 1)',
      '(deny default)',
      '(import "system.sb")',
      '(allow file-read-metadata)',
      '(allow process*)',
      '(allow sysctl-read)',
      '(allow system-info (info-type "vfs.disk-space"))',
      '(allow user-preference-read (preference-domain "kCFPreferencesAnyApplication"))',
      '(allow iokit-open-user-client (iokit-user-client-class "RootDomainUserClient"))',
      '(allow mach-lookup)',
      '(allow mach-register (global-name-regex #"^org\\.chromium\\.Chromium\\.MachPortRendezvousServer\\."))',
      '(allow signal (target same-sandbox))',
      ...[
        '/System',
        '/usr',
        '/bin',
        '/private/etc',
        '/opt/homebrew',
        '/Library/Developer',
        ...toolPaths,
      ].map((path) => subpath('allow file-read*', path)),
      subpath('allow file-read* file-write* file-map-executable', repo),
      subpath('allow file-read* file-write*', tmp),
      subpath('allow file-read* file-write*', join(home, '.cache')),
      subpath('deny file-read* file-write*', join(home, '.codex')),
      '(allow network-inbound (local ip "localhost:*"))',
      '(allow network-outbound (remote ip "localhost:*"))',
    ].join('\n') + '\n'
  )
}
function permissionRules(
  repo: string,
  home: string,
  tmp: string,
  tools: readonly string[],
) {
  const access = new Map<string, 'read' | 'write' | 'deny'>([
    [':minimal', 'read'],
    ...[
      '/System',
      '/usr',
      '/bin',
      '/private/etc',
      '/opt/homebrew',
      '/Library/Developer',
      ...tools,
    ].map((path) => [path, 'read'] as const),
    [tmp, 'write'],
    [join(home, '.cache'), 'write'],
    [join(home, '.codex'), 'deny'],
    [join(home, '.codex/plugins'), 'read'],
    [join(home, '.codex/skills'), 'read'],
    [join(home, '.agents'), 'read'],
    [join(home, '.pstack'), 'read'],
    [join(home, 'marketplace'), 'read'],
  ])
  return (
    [
      '[permissions.bench.workspace_roots]',
      `${JSON.stringify(repo)} = true`,
      '[permissions.bench.filesystem]',
      ...[...access].map(
        ([path, mode]) => `${JSON.stringify(path)} = ${JSON.stringify(mode)}`,
      ),
      '[permissions.bench.filesystem.":workspace_roots"]',
      '"." = "write"',
      '".git" = "read"',
      '".codex" = "read"',
      '[permissions.bench.network]',
      'enabled = true',
      'allow_local_binding = true',
      '[permissions.bench.network.domains]',
      '"localhost" = "allow"',
      '"127.0.0.1" = "allow"',
      '"[::1]" = "allow"',
    ].join('\n') + '\n'
  )
}
export async function withLocalWorkspace<A>(
  prepared: Prepared,
  use: (workspace: LocalWorkspace) => Promise<A>,
): Promise<A> {
  if (prepared.locator.kind !== 'local')
    throw new Error('Local workspace requires a local prepared artifact')
  if (
    (await snapshotDigest(prepared.locator.cacheDirectory)) !==
    prepared.locator.snapshotHash
  )
    throw new Error(
      'Prepared local snapshot is missing or corrupted; prepare again',
    )
  const runtime = await realpath(
    await mkdtemp(join(tmpdir(), 'workflow-bench-attempt-')),
  )
  const browsers = new Set<LocalBrowser>()
  try {
    const repo = join(runtime, 'repo'),
      home = join(runtime, 'home'),
      tmp = join(runtime, 'tmp'),
      codexHome = join(home, '.codex')
    await cloneTree(prepared.locator.cacheDirectory, repo)
    await Promise.all([
      mkdir(codexHome, { recursive: true }),
      mkdir(tmp, { recursive: true }),
    ])
    const pnpmExecutable = prepared.locator.pnpmExecutable
    const toolchain = await localToolchain(
      prepared.task.pnpmVersion,
      prepared.environment.kind === 'local'
        ? prepared.environment.codexVersion
        : '0.157.1',
      pnpmExecutable,
      prepared.locator.codexExecutable,
    )
    const env: NodeJS.ProcessEnv = {
      HOME: home,
      CODEX_HOME: codexHome,
      TMPDIR: tmp,
      XDG_CACHE_HOME: join(home, '.cache'),
      PLAYWRIGHT_BROWSERS_PATH: join(repo, '.bench-playwright'),
      CI: 'true',
      PATH: [
        dirname(process.execPath),
        dirname(toolchain.pnpm),
        dirname(toolchain.codex),
        '/usr/bin',
        '/bin',
        '/opt/homebrew/bin',
      ].join(delimiter),
      BENCH_REPO_ROOT: repo,
    }
    for (const key of safeEnvKeys)
      if (process.env[key]) env[key] = process.env[key]
    const permissions = permissionRules(repo, home, tmp, [
      dirname(dirname(process.execPath)),
      dirname(dirname(toolchain.pnpm)),
      dirname(toolchain.codex),
    ])
    const graderPolicyPath = join(runtime, 'grader.sb')
    await writeFile(
      graderPolicyPath,
      graderSeatbeltPolicy(repo, home, tmp, [
        dirname(dirname(process.execPath)),
        dirname(dirname(toolchain.pnpm)),
        dirname(toolchain.codex),
      ]),
    )
    await writeFile(
      join(codexHome, 'config.toml'),
      'default_permissions = "bench"\napproval_policy = "never"\n[features]\nnetwork_proxy = true\n' +
        permissions,
      { mode: 0o600 },
    )
    const workspace: LocalWorkspace = {
      root: repo,
      home,
      codexHome,
      tmp,
      env,
      permissions,
      startBrowser: async () => {
        const started = await startLocalBrowser(
          repo,
          tmp,
          env,
          graderPolicyPath,
        )
        if (!started) return null
        let stopped = false
        const managed: LocalBrowser = {
          endpoint: started.endpoint,
          pid: started.pid,
          stop: async () => {
            if (stopped) return
            stopped = true
            browsers.delete(managed)
            await started.stop()
          },
        }
        browsers.add(managed)
        return managed
      },
      run: (command, args, options = {}) =>
        execute(
          toolchain.codex,
          [
            'sandbox',
            '-P',
            'bench',
            '-C',
            repo,
            command === 'pnpm' ? pnpmExecutable : command,
            ...args,
          ],
          { ...options, cwd: repo, env },
        ),
      runGrader: (command, args, options = {}) =>
        execute(
          '/usr/bin/sandbox-exec',
          [
            '-f',
            graderPolicyPath,
            command === 'pnpm' ? pnpmExecutable : command,
            ...args,
          ],
          { ...options, cwd: repo, env },
        ),
    }
    return await use(workspace)
  } finally {
    await Promise.allSettled([...browsers].map((browser) => browser.stop()))
    await rm(runtime, { recursive: true, force: true })
  }
}
export async function localDoctor() {
  try {
    const toolchain = await localToolchain(
      (await must(await resolveExecutable('pnpm'), ['--version'])).trim(),
    )
    return {
      supported: true,
      sandbox: await exists('/usr/bin/sandbox-exec'),
      ...toolchain,
    }
  } catch (error) {
    return {
      supported: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
export async function publishSnapshot(staging: string, destination: string) {
  if (await exists(destination))
    throw new Error(`Refusing to overwrite snapshot: ${destination}`)
  await validateTree(staging)
  await cloneTree(staging, destination)
  return snapshotDigest(destination)
}

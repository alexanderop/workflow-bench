import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fingerprint, loadTask, taskDirectory } from '../core/catalog.js'
import {
  LegacyPrepared,
  Prepared,
  decode,
  sameEnvironment,
  type EnvironmentIdentity,
} from '../core/model.js'
import { exists, now, within, writeJson } from '../core/io.js'
import { must } from '../process/process.js'
import { shellQuote } from '../docker/container.js'
import {
  ensurePinnedPnpm,
  localToolchain,
  publishSnapshot,
  sandboxPolicyVersion,
  snapshotDigest,
} from '../local/workspace.js'

export type Backend = 'local' | 'docker'
export const preparedPath = (
  work: string,
  id: string,
  backend: Backend = 'local',
) => join(work, 'tasks', id, backend, 'prepared.json')
function normalizePrepared(value: unknown): Prepared {
  if (typeof value === 'object' && value !== null && !('version' in value)) {
    const old = decode(LegacyPrepared, value)
    return decode(Prepared, {
      version: 2,
      task: old.task,
      fingerprint: old.fingerprint,
      environment: { kind: 'docker', imageId: old.imageId },
      locator: { kind: 'docker', image: old.image, imageId: old.imageId },
      preparedAt: old.preparedAt,
    })
  }
  return decode(Prepared, value)
}
async function readPrepared(path: string) {
  return normalizePrepared(JSON.parse(await readFile(path, 'utf8')))
}
export function validatePreparedIdentity(
  record: Prepared,
  current?: EnvironmentIdentity,
) {
  if (record.environment.kind !== record.locator.kind)
    throw new Error('Prepared environment and locator kinds disagree')
  if (
    record.environment.kind === 'docker' &&
    record.locator.kind === 'docker' &&
    record.environment.imageId !== record.locator.imageId
  )
    throw new Error('Prepared Docker identity and locator disagree')
  if (
    record.environment.kind === 'local' &&
    record.locator.kind === 'local' &&
    record.environment.snapshotHash !== record.locator.snapshotHash
  )
    throw new Error('Prepared local identity and snapshot locator disagree')
  if (current && !sameEnvironment(record.environment, current))
    throw new Error(
      'Prepared environment differs from the current runtime; prepare and qualify again',
    )
}
async function currentLocalIdentity(
  record: Prepared,
): Promise<EnvironmentIdentity> {
  if (record.environment.kind !== 'local' || record.locator.kind !== 'local')
    throw new Error('Expected local prepared identity')
  const toolchain = await localToolchain(
    record.task.pnpmVersion,
    record.environment.codexVersion,
    record.locator.pnpmExecutable,
    record.locator.codexExecutable,
  )
  return {
    kind: 'local',
    platform: toolchain.platform,
    arch: toolchain.arch,
    osRelease: toolchain.osRelease,
    nodeVersion: toolchain.nodeVersion,
    pnpmVersion: toolchain.pnpmVersion,
    codexVersion: toolchain.codexVersion,
    snapshotHash: record.locator.snapshotHash,
    sandboxPolicyVersion,
  }
}
export async function currentPrepared(
  work: string,
  id: string,
  backend: Backend = 'local',
): Promise<Prepared> {
  const path = preparedPath(work, id, backend)
  const record = await readPrepared(
    (await exists(path)) ? path : join(work, 'tasks', id, 'prepared.json'),
  )
  if (record.fingerprint !== (await fingerprint(id)))
    throw new Error(`Inputs changed for ${id}; prepare and qualify again`)
  if (record.environment.kind !== backend)
    throw new Error(
      `Task ${id} was prepared for ${record.environment.kind}, not ${backend}`,
    )
  validatePreparedIdentity(record)
  if (record.locator.kind === 'docker') {
    if (record.environment.kind !== 'docker')
      throw new Error(`Prepared environment and locator disagree for ${id}`)
    const imageId = await must('docker', [
      'image',
      'inspect',
      record.locator.image,
      '--format',
      '{{.Id}}',
    ])
    if (imageId !== record.environment.imageId)
      throw new Error(`Image identity changed for ${id}`)
  } else {
    validatePreparedIdentity(record, await currentLocalIdentity(record))
    if (
      (await snapshotDigest(record.locator.cacheDirectory)) !==
      record.locator.snapshotHash
    )
      throw new Error(
        `Prepared local snapshot for ${id} is corrupted; prepare again`,
      )
  }
  return record
}
async function exportSource(id: string, destination: string) {
  const task = await loadTask(id)
  if (task.source.kind === 'local')
    await cp(within(taskDirectory(id), task.source.path), destination, {
      recursive: true,
      verbatimSymlinks: true,
    })
  else {
    await mkdir(destination)
    await must('git', ['init', destination])
    await must(
      'git',
      [
        '-C',
        destination,
        'fetch',
        '--depth',
        '1',
        task.source.repository,
        task.source.revision,
      ],
      { timeoutMs: 300000 },
    )
    await must('git', ['-C', destination, 'checkout', '--detach', 'FETCH_HEAD'])
    await rm(join(destination, '.git'), { recursive: true, force: true })
  }
  return task
}
async function prepareLocal(
  work: string,
  id: string,
  revision: string,
  log: (s: string) => void,
): Promise<Prepared> {
  const staging = await mkdtemp(join(tmpdir(), 'workflow-bench-build-'))
  try {
    const source = join(staging, 'source'),
      task = await exportSource(id, source),
      pnpmExecutable = await ensurePinnedPnpm(work, task.pnpmVersion),
      toolchain = await localToolchain(
        task.pnpmVersion,
        '0.157.1',
        pnpmExecutable,
      )
    const installHome = join(staging, 'home'),
      installTmp = join(staging, 'tmp'),
      store = join(work, 'cache', 'pnpm-store', task.pnpmVersion)
    await Promise.all([
      mkdir(installHome),
      mkdir(installTmp),
      mkdir(store, { recursive: true }),
    ])
    const env: NodeJS.ProcessEnv = {
      HOME: installHome,
      TMPDIR: installTmp,
      XDG_CACHE_HOME: join(installHome, '.cache'),
      PLAYWRIGHT_BROWSERS_PATH: join(source, '.bench-playwright'),
      PNPM_HOME: join(installHome, '.pnpm'),
      PATH: `${process.execPath.slice(0, process.execPath.lastIndexOf('/'))}:${toolchain.pnpm.slice(0, toolchain.pnpm.lastIndexOf('/'))}:/usr/bin:/bin:/opt/homebrew/bin`,
      CI: 'true',
    }
    log(`Preparing native snapshot for ${id}; dependencies are installed once`)
    for (const command of task.install)
      await must(
        command[0] === 'pnpm' ? toolchain.pnpm : (command[0] ?? toolchain.pnpm),
        command.slice(1),
        { cwd: source, env, timeoutMs: 1_800_000 },
      )
    await must('git', ['init'], { cwd: source })
    await writeFile(
      join(source, '.git', 'info', 'exclude'),
      '.bench-playwright/\n',
    )
    await must('git', ['config', 'user.email', 'bench@example.invalid'], {
      cwd: source,
    })
    await must('git', ['config', 'user.name', 'Benchmark'], { cwd: source })
    await must('git', ['add', '.'], { cwd: source })
    await must('git', ['commit', '-m', 'snapshot'], { cwd: source })
    const stagedDigest = await snapshotDigest(source),
      cacheDirectory = join(work, 'cache', 'local', id, revision, stagedDigest)
    if (!(await exists(cacheDirectory))) {
      const pending = `${cacheDirectory}.pending-${process.pid}`
      await publishSnapshot(source, pending)
      await mkdir(cacheDirectory.slice(0, cacheDirectory.lastIndexOf('/')), {
        recursive: true,
      })
      await rename(pending, cacheDirectory)
    }
    const snapshotHash = await snapshotDigest(cacheDirectory)
    const environment: EnvironmentIdentity = {
      kind: 'local',
      platform: 'darwin',
      arch: toolchain.arch,
      osRelease: toolchain.osRelease,
      nodeVersion: toolchain.nodeVersion,
      pnpmVersion: toolchain.pnpmVersion,
      codexVersion: toolchain.codexVersion,
      snapshotHash,
      sandboxPolicyVersion,
    }
    const record = decode(Prepared, {
      version: 2,
      task,
      fingerprint: revision,
      environment,
      locator: {
        kind: 'local',
        cacheDirectory,
        snapshotHash,
        pnpmExecutable: toolchain.pnpm,
        codexExecutable: toolchain.codex,
      },
      preparedAt: now(),
    })
    await writeJson(preparedPath(work, id, 'local'), record)
    return record
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
async function prepareDocker(
  work: string,
  id: string,
  revision: string,
  log: (s: string) => void,
): Promise<Prepared> {
  const staging = await mkdtemp(join(tmpdir(), 'workflow-bench-build-'))
  try {
    const source = join(staging, 'source'),
      task = await exportSource(id, source)
    const dockerfile =
      [
        `FROM ${task.nodeImage}`,
        'USER root',
        `RUN npm install -g pnpm@${task.pnpmVersion} @openai/codex@0.157.1`,
        'ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright CI=true',
        'WORKDIR /repo',
        'COPY source/ /repo/',
        ...task.install.map((args) => `RUN ${args.map(shellQuote).join(' ')}`),
        'RUN git init && git config user.email bench@example.invalid && git config user.name Benchmark && git add . && git commit -m snapshot && chown -R node:node /repo /home/node',
        'USER node',
        'ENV HOME=/home/node CODEX_HOME=/home/node/.codex',
        'RUN mkdir -p /home/node/.codex /home/node/.agents/skills /home/node/.pstack',
        'CMD ["sleep", "infinity"]',
      ].join('\n') + '\n'
    await writeFile(join(staging, 'Dockerfile'), dockerfile)
    const image = `workflow-bench/${id}:${revision.slice(0, 16)}`
    log(`Building ${image}; dependency preparation may take several minutes`)
    const output = await must(
      'docker',
      ['build', '--label', 'workflow-bench=true', '-t', image, staging],
      { timeoutMs: 1_800_000 },
    )
    await mkdir(join(work, 'tasks', id, 'docker'), { recursive: true })
    await writeFile(join(work, 'tasks', id, 'docker', 'build.log'), output)
    const imageId = await must('docker', [
      'image',
      'inspect',
      image,
      '--format',
      '{{.Id}}',
    ])
    const record = decode(Prepared, {
      version: 2,
      task,
      fingerprint: revision,
      environment: { kind: 'docker', imageId },
      locator: { kind: 'docker', image, imageId },
      preparedAt: now(),
    })
    await writeJson(preparedPath(work, id, 'docker'), record)
    return record
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
export async function prepare(
  work: string,
  id: string,
  log: (s: string) => void = console.log,
  backend: Backend = 'local',
) {
  const revision = await fingerprint(id),
    path = preparedPath(work, id, backend)
  if (await exists(path)) {
    const saved = await readPrepared(path)
    if (saved.fingerprint === revision) {
      validatePreparedIdentity(saved)
      if (backend === 'docker') return currentPrepared(work, id, backend)
      if (sameEnvironment(saved.environment, await currentLocalIdentity(saved)))
        return currentPrepared(work, id, backend)
    }
  }
  return backend === 'local'
    ? prepareLocal(work, id, revision, log)
    : prepareDocker(work, id, revision, log)
}
export async function prompt(id: string) {
  return readFile(join(taskDirectory(id), 'PROMPT.md'), 'utf8')
}

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { cpus, release } from 'node:os'
import { performance } from 'node:perf_hooks'
import { dirname, join } from 'node:path'
import { taskDirectory } from '../core/catalog.js'
import { exists, message, now, root, writeJson } from '../core/io.js'
import {
  sameEnvironment,
  type Check,
  type Prepared,
  type Qualification,
} from '../core/model.js'
import { container } from '../docker/container.js'
import { must } from '../process/process.js'
import { withLocalWorkspace } from '../local/workspace.js'
import { grade, qualify } from './grade.js'
import { prepare, preparedPath, type Backend } from './prepare.js'

export interface BenchmarkOptions {
  taskId?: string
  repetitions?: number
  output?: string
  log?: (message: string) => void
}
interface BackendPreparation {
  backend: Backend
  preparedArtifactExisted: boolean
  preparationMs: number | null
  prepared: Prepared | null
  runtime: string | null
  qualification: Qualification | null
  error: string | null
}
interface Sample {
  repetition: number
  backend: Backend
  order: number
  status: 'pending' | 'passed' | 'failed' | 'blocked'
  warmPreparationMs: number | null
  workspaceSetupMs: number | null
  workspaceCleanupMs: number | null
  workspaceTotalMs: number | null
  gradingMs: number | null
  checks: Check[]
  error: string | null
}
export interface BenchmarkReport {
  version: 1
  kind: 'backend-performance'
  taskId: string
  createdAt: string
  completedAt: string | null
  output: string
  modelCalls: 0
  host: {
    platform: string
    arch: string
    osRelease: string
    nodeVersion: string
    logicalCpus: number
  }
  limitations: string[]
  preparation: BackendPreparation[]
  samples: Sample[]
  medians: Array<{
    backend: Backend
    successfulSamples: number
    warmPreparationMs: number | null
    workspaceSetupMs: number | null
    workspaceCleanupMs: number | null
    workspaceTotalMs: number | null
    gradingMs: number | null
  }>
}
function median(values: readonly number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}
async function workspaceTiming(prepared: Prepared) {
  const started = performance.now()
  let ready = started
  if (prepared.locator.kind === 'local')
    await withLocalWorkspace(prepared, async () => {
      ready = performance.now()
    })
  else
    await container(prepared.locator.imageId, async () => {
      ready = performance.now()
    })
  const finished = performance.now()
  return {
    workspaceSetupMs: ready - started,
    workspaceCleanupMs: finished - ready,
    workspaceTotalMs: finished - started,
  }
}

export async function benchmark(
  work: string,
  options: BenchmarkOptions = {},
): Promise<BenchmarkReport> {
  const taskId = options.taskId ?? 'receipt-rounding'
  const repetitions = options.repetitions ?? 3
  if (
    !Number.isSafeInteger(repetitions) ||
    repetitions < 1 ||
    repetitions > 100
  )
    throw new Error(
      'Benchmark repetitions must be an integer between 1 and 100',
    )
  const log = options.log ?? console.log
  const output =
    options.output ??
    join(root, 'artifacts', 'performance', `${Date.now()}-${randomUUID()}.json`)
  const report: BenchmarkReport = {
    version: 1,
    kind: 'backend-performance',
    taskId,
    createdAt: now(),
    completedAt: null,
    output,
    modelCalls: 0,
    host: {
      platform: process.platform,
      arch: process.arch,
      osRelease: release(),
      nodeVersion: process.version,
      logicalCpus: cpus().length,
    },
    limitations: [
      'This measures infrastructure with a trusted reference patch, not model quality or solver latency.',
      'Initial preparation may reuse caches. It is not a cold-install measurement.',
      'Warm preparation includes identity validation. Workspace setup includes snapshot validation and native sandbox configuration or Docker container startup.',
      'Grading includes a fresh workspace, patch application, hidden grader injection, every declared check, and cleanup. Build time is included only when the task declares a build check; it is not measured separately.',
      'Native macOS and Docker Linux have different operating systems, Node versions, filesystem behavior, and resource limits. Docker uses 2 CPUs and 4 GiB; native execution uses host resources.',
      'Pairs alternate backend order. OS and dependency caches are not flushed. Medians include only successful samples; failed and blocked samples remain in the artifact.',
    ],
    preparation: [],
    samples: [],
    medians: [],
  }
  for (let repetition = 1; repetition <= repetitions; repetition++) {
    const order: Backend[] =
      repetition % 2 ? ['local', 'docker'] : ['docker', 'local']
    for (const backend of order)
      report.samples.push({
        repetition,
        backend,
        order: report.samples.length + 1,
        status: 'pending',
        warmPreparationMs: null,
        workspaceSetupMs: null,
        workspaceCleanupMs: null,
        workspaceTotalMs: null,
        gradingMs: null,
        checks: [],
        error: null,
      })
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  for (const backend of ['local', 'docker'] as const) {
    const record: BackendPreparation = {
      backend,
      preparedArtifactExisted: await exists(
        preparedPath(work, taskId, backend),
      ),
      preparationMs: null,
      prepared: null,
      runtime: null,
      qualification: null,
      error: null,
    }
    report.preparation.push(record)
    const started = performance.now()
    try {
      record.prepared = await prepare(work, taskId, log, backend)
      record.preparationMs = performance.now() - started
      if (record.prepared.locator.kind === 'docker') {
        record.runtime = await container(
          record.prepared.locator.imageId,
          (id) =>
            must('docker', [
              'exec',
              id,
              'node',
              '-p',
              'JSON.stringify({platform:process.platform,arch:process.arch,nodeVersion:process.version})',
            ]),
        )
      } else record.runtime = JSON.stringify(record.prepared.environment)
      record.qualification = await qualify(work, taskId, backend)
    } catch (error) {
      record.preparationMs ??= performance.now() - started
      record.error = message(error)
    }
    await writeJson(output, report)
  }
  const fingerprints = new Set(
    report.preparation.flatMap((record) =>
      record.prepared ? [record.prepared.fingerprint] : [],
    ),
  )
  for (const sample of report.samples) {
    const initial = report.preparation.find(
      (record) => record.backend === sample.backend,
    )
    if (
      !initial?.prepared ||
      initial.error ||
      !initial.qualification?.qualified ||
      fingerprints.size !== 1
    ) {
      sample.status = 'blocked'
      sample.error =
        initial?.error ??
        'Both backends require the same task fingerprint and successful qualification'
      await writeJson(output, report)
      continue
    }
    log(`Benchmark pair ${sample.repetition}/${repetitions}: ${sample.backend}`)
    try {
      const started = performance.now()
      const prepared = await prepare(work, taskId, log, sample.backend)
      sample.warmPreparationMs = performance.now() - started
      if (
        prepared.fingerprint !== initial.prepared.fingerprint ||
        !sameEnvironment(prepared.environment, initial.prepared.environment)
      )
        throw new Error('Prepared identity changed during benchmark')
      Object.assign(sample, await workspaceTiming(prepared))
      const gradingStarted = performance.now()
      try {
        sample.checks = await grade(
          prepared,
          join(taskDirectory(taskId), 'reference.patch'),
        )
      } finally {
        sample.gradingMs = performance.now() - gradingStarted
      }
      if (
        sample.checks.length !== prepared.task.checks.length ||
        sample.checks.some((check) => check.exitCode !== 0 || check.timedOut)
      )
        throw new Error('Trusted reference failed acceptance checks')
      sample.status = 'passed'
    } catch (error) {
      sample.status = 'failed'
      sample.error = message(error)
    }
    await writeJson(output, report)
  }
  report.medians = (['local', 'docker'] as const).map((backend) => {
    const samples = report.samples.filter(
      (sample) => sample.backend === backend && sample.status === 'passed',
    )
    const metric = (
      key:
        | 'warmPreparationMs'
        | 'workspaceSetupMs'
        | 'workspaceCleanupMs'
        | 'workspaceTotalMs'
        | 'gradingMs',
    ) =>
      median(
        samples.flatMap((sample) =>
          sample[key] === null ? [] : [sample[key]],
        ),
      )
    return {
      backend,
      successfulSamples: samples.length,
      warmPreparationMs: metric('warmPreparationMs'),
      workspaceSetupMs: metric('workspaceSetupMs'),
      workspaceCleanupMs: metric('workspaceCleanupMs'),
      workspaceTotalMs: metric('workspaceTotalMs'),
      gradingMs: metric('gradingMs'),
    }
  })
  report.completedAt = now()
  await writeJson(output, report)
  log(`Performance artifact: ${output}`)
  return report
}

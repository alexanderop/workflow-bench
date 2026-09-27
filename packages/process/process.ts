import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Effect, Schema } from 'effect'

const leaseKey = 'WORKFLOW_BENCH_PROCESS_LEASE'

// A new process group survives group signals, but retains its inherited lease.
// Deliberately clearing the environment is outside this cooperative cleanup boundary.
function leasedProcesses(lease: string): Promise<number[]> {
  if (process.platform === 'win32') return Promise.resolve([])
  return new Promise((resolve, reject) => {
    const reader = spawn(
      '/bin/ps',
      ['eww', '-U', String(process.getuid!()), '-o', 'pid=,command='],
      {
        env: { PATH: '/usr/bin:/bin', LANG: 'C' },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
    const marker = new RegExp(`(?:^|\\s)${leaseKey}=${lease}(?:\\s|$)`)
    const pids: number[] = []
    let pending = ''
    const inspect = (line: string) => {
      if (!marker.test(line)) return
      const pid = Number(/^\s*(\d+)/.exec(line)?.[1])
      if (Number.isSafeInteger(pid) && pid > 1 && pid !== process.pid)
        pids.push(pid)
    }
    reader.stdout.on('data', (chunk: Buffer) => {
      pending += chunk.toString()
      let end: number
      while ((end = pending.indexOf('\n')) !== -1) {
        inspect(pending.slice(0, end))
        pending = pending.slice(end + 1)
      }
    })
    const timer = setTimeout(() => reader.kill('SIGKILL'), 5000)
    reader.on('error', () => {
      clearTimeout(timer)
      reject(new Error('Could not inspect descendant processes'))
    })
    reader.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0)
        reject(new Error('Could not inspect descendant processes'))
      else {
        inspect(pending)
        resolve(pids)
      }
    })
  })
}
async function reapLease(lease: string) {
  for (let pass = 0; pass < 5; pass++) {
    const pids = await leasedProcesses(lease)
    if (!pids.length) return
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGKILL')
      } catch (error) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ESRCH'
        ))
          throw new Error('Could not stop a descendant process')
      }
    }
  }
  if ((await leasedProcesses(lease)).length)
    throw new Error('Descendant processes survived cleanup')
}
export interface Execution {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}
export interface Options {
  readonly cwd?: string
  readonly input?: string
  readonly timeoutMs?: number
  readonly env?: NodeJS.ProcessEnv
  readonly signal?: AbortSignal
}
export class ProcessError extends Schema.TaggedError<ProcessError>()(
  'ProcessError',
  { operation: Schema.String, detail: Schema.String },
) {}
export function execute(
  command: string,
  args: readonly string[],
  options: Options = {},
): Promise<Execution> {
  return new Promise((resolve, reject) => {
    const lease = randomUUID()
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: { ...(options.env ?? process.env), [leaseKey]: lease },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    })
    let stdout = '',
      stderr = '',
      timedOut = false,
      overflow = false,
      settled = false
    let cleanup: Promise<void> | undefined
    const killGroup = () => {
      if (child.pid && process.platform !== 'win32') {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {}
      } else child.kill('SIGKILL')
    }
    const abort = () => killGroup()
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) killGroup()
    const append = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
      if (stdout.length + stderr.length > 24 * 1024 * 1024) {
        overflow = true
        killGroup()
        return
      }
      if (stream === 'stdout') stdout += chunk.toString()
      else stderr += chunk.toString()
    }
    child.stdout.on('data', (c) => append('stdout', c))
    child.stderr.on('data', (c) => append('stderr', c))
    child.stdin.on('error', () => {})
    child.stdin.end(options.input)
    const timer = setTimeout(() => {
      timedOut = true
      killGroup()
    }, options.timeoutMs ?? 120_000)
    const clean = () => {
      killGroup()
      cleanup ??= reapLease(lease)
      return cleanup
    }
    const release = () => {
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
    }
    child.on('error', (error) => {
      killGroup()
      if (!settled) {
        settled = true
        release()
        void clean().then(() => reject(error), reject)
      }
    })
    child.on('exit', () => {
      void clean().catch((error: unknown) => {
        if (!settled) {
          settled = true
          release()
          child.stdout.destroy()
          child.stderr.destroy()
          reject(error)
        }
      })
    })
    child.on('close', (code) => {
      if (!settled) {
        settled = true
        release()
        void clean().then(
          () =>
            resolve({
              code: options.signal?.aborted ? 130 : (code ?? 137),
              stdout,
              stderr: overflow ? stderr + '\nOutput limit exceeded' : stderr,
              timedOut,
            }),
          reject,
        )
      }
    })
  })
}
export const run = Effect.fn('Process.run')(
  (command: string, args: readonly string[], options: Options = {}) =>
    Effect.tryPromise({
      try: (signal) => execute(command, args, { ...options, signal }),
      catch: (error) =>
        new ProcessError({ operation: command, detail: String(error) }),
    }),
)
export async function must(
  command: string,
  args: readonly string[],
  options: Options = {},
) {
  const result = await execute(command, args, options)
  if (result.code !== 0)
    throw new Error(
      `${command} failed (${result.code}): ${result.stderr.slice(-4000)} ${result.stdout.slice(-2000)}`,
    )
  return result.stdout.trim()
}

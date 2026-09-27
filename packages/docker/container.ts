import { randomUUID } from 'node:crypto'
import { execute, must } from './process.js'

export const label = 'workflow-bench=true'
export async function container<A>(
  image: string,
  use: (id: string) => Promise<A>,
  network = 'none',
): Promise<A> {
  const id = `workflow-bench-${randomUUID()}`
  try {
    await must('docker', [
      'run',
      '-d',
      '--name',
      id,
      '--label',
      label,
      '--network',
      network,
      '--memory',
      '4g',
      '--cpus',
      '2',
      '--pids-limit',
      '512',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--shm-size',
      '1g',
      image,
      'sleep',
      'infinity',
    ])
    return await use(id)
  } finally {
    await execute('docker', ['rm', '-f', id])
  }
}
export async function copyIn(id: string, from: string, to: string) {
  await must('docker', ['cp', from, `${id}:${to}`])
}
export async function copyOut(id: string, from: string, to: string) {
  await must('docker', ['cp', `${id}:${from}`, to])
}
export const shellQuote = (value: string) =>
  `'${value.replaceAll("'", "'\\''")}'`

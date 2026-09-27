import { NodeServices } from '@effect/platform-node'
import { Effect } from 'effect'
import { CliError, Command } from 'effect/unstable/cli'
import { message } from '../../packages/core/io.js'
import manifest from '../../package.json' with { type: 'json' }
import { cli } from './commands.js'

const args = process.argv.slice(2)
const normalizedArgs =
  args.length === 0 || args[0] === 'help' ? ['--help'] : args

try {
  await Effect.runPromise(
    Command.runWith(cli, { version: manifest.version })(normalizedArgs).pipe(
      Effect.provide(NodeServices.layer),
    ),
  )
} catch (error) {
  if (CliError.isCliError(error) && error._tag === 'ShowHelp') {
    process.exitCode = error.errors.length === 0 ? 0 : 1
  } else {
    console.error(message(error))
    process.exitCode = 1
  }
}

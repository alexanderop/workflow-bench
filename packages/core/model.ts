import { Schema } from 'effect'

export const Id = Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]*$/))
export const Hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))
const Revision = Schema.String.check(Schema.isPattern(/^[a-f0-9]{40}$/))
const Positive = Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0))
export const Command = Schema.Array(Schema.String).check(Schema.isMinLength(1))
export const Task = Schema.Struct({
  id: Id,
  title: Schema.String,
  project: Schema.String,
  provenance: Schema.String,
  source: Schema.Union([
    Schema.Struct({ kind: Schema.Literal('local'), path: Schema.String }),
    Schema.Struct({
      kind: Schema.Literal('git'),
      repository: Schema.String,
      revision: Revision,
    }),
  ]),
  nodeImage: Schema.String,
  pnpmVersion: Schema.String,
  install: Schema.Array(Command),
  checks: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      command: Command,
      regression: Schema.Boolean,
    }),
  ).check(Schema.isMinLength(1)),
  expectedFailure: Schema.String,
  allowedPaths: Schema.Array(Schema.String).check(Schema.isMinLength(1)),
  timeoutSeconds: Positive,
})
export interface Task extends Schema.Schema.Type<typeof Task> {}
export const Workflow = Schema.Struct({
  id: Id,
  title: Schema.String,
  repository: Schema.String,
  revision: Revision,
  installation: Schema.Literals(['plugin', 'skills']),
  entrypoint: Schema.String,
  evidencePath: Schema.String,
  description: Schema.String,
})
export interface Workflow extends Schema.Schema.Type<typeof Workflow> {}
export const Experiment = Schema.Struct({
  id: Id,
  workflow: Id,
  model: Schema.String,
  reasoningEffort: Schema.Literals(['low', 'medium', 'high', 'xhigh']),
  codexVersion: Schema.String,
  timeoutSeconds: Positive,
  maxThreads: Positive,
  maxDepth: Positive,
})
export interface Experiment extends Schema.Schema.Type<typeof Experiment> {}

export const EnvironmentIdentity = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('docker'), imageId: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal('local'),
    platform: Schema.Literal('darwin'),
    arch: Schema.String,
    osRelease: Schema.String,
    nodeVersion: Schema.String,
    pnpmVersion: Schema.String,
    codexVersion: Schema.String,
    snapshotHash: Hash,
    sandboxPolicyVersion: Schema.String,
  }),
])
export type EnvironmentIdentity = Schema.Schema.Type<typeof EnvironmentIdentity>
export const EnvironmentLocator = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('docker'),
    image: Schema.String,
    imageId: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal('local'),
    cacheDirectory: Schema.String,
    snapshotHash: Hash,
    pnpmExecutable: Schema.String,
    codexExecutable: Schema.String,
  }),
])
export type EnvironmentLocator = Schema.Schema.Type<typeof EnvironmentLocator>
export const Prepared = Schema.Struct({
  version: Schema.Literal(2),
  task: Task,
  fingerprint: Hash,
  environment: EnvironmentIdentity,
  locator: EnvironmentLocator,
  preparedAt: Schema.String,
})
export interface Prepared extends Schema.Schema.Type<typeof Prepared> {}
export const LegacyPrepared = Schema.Struct({
  task: Task,
  fingerprint: Hash,
  image: Schema.String,
  imageId: Schema.String,
  preparedAt: Schema.String,
})
export const Check = Schema.Struct({
  name: Schema.String,
  regression: Schema.Boolean,
  exitCode: Schema.Number,
  timedOut: Schema.Boolean,
  output: Schema.String,
  assessment: Schema.optionalKey(
    Schema.Literals(['passed', 'failed', 'not_assessed']),
  ),
})
export interface Check extends Schema.Schema.Type<typeof Check> {}
export const Qualification = Schema.Struct({
  version: Schema.Literal(2),
  fingerprint: Hash,
  environment: EnvironmentIdentity,
  qualified: Schema.Boolean,
  base: Schema.Array(Check),
  reference: Schema.Array(Check),
  createdAt: Schema.String,
})
export interface Qualification extends Schema.Schema.Type<
  typeof Qualification
> {}
export const LegacyQualification = Schema.Struct({
  fingerprint: Hash,
  imageId: Schema.String,
  qualified: Schema.Boolean,
  base: Schema.Array(Check),
  reference: Schema.Array(Check),
  createdAt: Schema.String,
})
export const Cell = Schema.Struct({
  id: Id,
  taskId: Id,
  experiment: Experiment,
  repetition: Positive,
  fingerprint: Hash,
  environment: EnvironmentIdentity,
  workflowHash: Schema.NullOr(Hash),
})
export interface Cell extends Schema.Schema.Type<typeof Cell> {}
export const LegacyCell = Schema.Struct({
  id: Id,
  taskId: Id,
  experiment: Experiment,
  repetition: Positive,
  fingerprint: Hash,
  imageId: Schema.String,
  workflowHash: Schema.NullOr(Hash),
})
export const Plan = Schema.Struct({
  version: Schema.Literal(2),
  id: Id,
  createdAt: Schema.String,
  seed: Schema.Number,
  cells: Schema.Array(Cell).check(Schema.isMinLength(1)),
  retryOf: Schema.optionalKey(
    Schema.Struct({ planId: Id, cellIds: Schema.Array(Id) }),
  ),
})
export interface Plan extends Schema.Schema.Type<typeof Plan> {}
export const LegacyPlan = Schema.Struct({
  version: Schema.Literal(1),
  id: Id,
  createdAt: Schema.String,
  seed: Schema.Number,
  cells: Schema.Array(LegacyCell).check(Schema.isMinLength(1)),
})
export const Outcome = Schema.Literals([
  'resolved',
  'unresolved',
  'timeout',
  'infrastructure_error',
  'auth_error',
  'rate_limited',
  'unsupported',
  'cancelled',
])
export type Outcome = Schema.Schema.Type<typeof Outcome>
const ResultFields = {
  planId: Id,
  cellId: Id,
  taskId: Id,
  experiment: Experiment,
  repetition: Positive,
  fingerprint: Hash,
  workflowHash: Schema.NullOr(Hash),
  outcome: Outcome,
  message: Schema.String,
  startedAt: Schema.String,
  durationMs: Schema.Number,
  candidateHash: Schema.NullOr(Hash),
  activation: Schema.Literals(['not_applicable', 'observed', 'unknown']),
  rootTokens: Schema.NullOr(Schema.Number),
  childTokens: Schema.NullOr(Schema.Number),
  completedChildren: Schema.Number,
  checks: Schema.Array(Check),
}
export const Result = Schema.Struct({
  version: Schema.Literal(2),
  ...ResultFields,
  environment: EnvironmentIdentity,
})
export interface Result extends Schema.Schema.Type<typeof Result> {}
export const LegacyResult = Schema.Struct({
  version: Schema.Literal(1),
  ...ResultFields,
  imageId: Schema.String,
})

export function decode<A>(
  schema: Schema.ConstraintDecoder<A>,
  value: unknown,
): A {
  return Schema.decodeUnknownSync(schema)(value)
}
export const sameEnvironment = (
  a: EnvironmentIdentity,
  b: EnvironmentIdentity,
) => JSON.stringify(a) === JSON.stringify(b)
export function normalizePlan(value: unknown): Plan {
  if (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1
  ) {
    const legacy = decode(LegacyPlan, value)
    return decode(Plan, {
      ...legacy,
      version: 2,
      cells: legacy.cells.map(({ imageId, ...cell }) => ({
        ...cell,
        environment: { kind: 'docker', imageId },
      })),
    })
  }
  return decode(Plan, value)
}
export function normalizeResult(value: unknown): Result {
  if (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    value.version === 1
  ) {
    const legacy = decode(LegacyResult, value)
    const { imageId, ...result } = legacy
    return decode(Result, {
      ...result,
      version: 2,
      environment: { kind: 'docker', imageId },
    })
  }
  return decode(Result, value)
}
export function normalizeQualification(value: unknown): Qualification {
  if (typeof value === 'object' && value !== null && !('version' in value)) {
    const legacy = decode(LegacyQualification, value)
    const { imageId, ...qualification } = legacy
    return decode(Qualification, {
      ...qualification,
      version: 2,
      environment: { kind: 'docker', imageId },
    })
  }
  return decode(Qualification, value)
}

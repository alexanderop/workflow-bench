import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { getBaseFileUrl } = await import(
  pathToFileURL(
    join(
      process.env.BENCH_REPO_ROOT ?? '/repo',
      'server/utils/changelog/baseFileUrl.ts',
    ),
  ).href
)
test('preserves existing providers and unknown-provider behavior', () => {
  assert.deepEqual(
    getBaseFileUrl({ provider: 'github', owner: 'org', repo: 'pkg' }),
    {
      raw: 'https://raw.githubusercontent.com/org/pkg/HEAD',
      blob: 'https://github.com/org/pkg/blob/HEAD',
    },
  )
  assert.deepEqual(
    getBaseFileUrl({
      provider: 'gitlab',
      host: 'git.example.org',
      owner: 'org',
      repo: 'pkg',
    }),
    {
      raw: 'https://git.example.org/org/pkg/-/raw/HEAD',
      blob: 'https://git.example.org/org/pkg/-/blob/HEAD',
    },
  )
  assert.deepEqual(
    getBaseFileUrl({ provider: 'gitlab', owner: 'org', repo: 'pkg' }),
    {
      raw: 'https://gitlab.com/org/pkg/-/raw/HEAD',
      blob: 'https://gitlab.com/org/pkg/-/blob/HEAD',
    },
  )
  assert.deepEqual(
    getBaseFileUrl({ provider: 'codeberg', owner: 'org', repo: 'pkg' }),
    {
      raw: 'https://codeberg.org/org/pkg/raw/branch/HEAD',
      blob: 'https://codeberg.org/org/pkg/src/branch/HEAD',
    },
  )
  assert.deepEqual(
    getBaseFileUrl({
      provider: 'forgejo',
      host: 'forge.example.org',
      owner: 'org',
      repo: 'pkg',
    }),
    {
      raw: 'https://forge.example.org/org/pkg/raw/branch/HEAD',
      blob: 'https://forge.example.org/org/pkg/src/branch/HEAD',
    },
  )
  assert.equal(
    getBaseFileUrl({ provider: 'unknown', owner: 'org', repo: 'pkg' }),
    null,
  )
})

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
const cases = [
  [
    { provider: 'gitea', owner: 'team', repo: 'pkg' },
    {
      raw: 'https://gitea.com/team/pkg/raw/branch/HEAD',
      blob: 'https://gitea.com/team/pkg/src/branch/HEAD',
    },
  ],
  [
    {
      provider: 'gitea',
      host: 'git.example.org',
      owner: 'dev',
      repo: 'library',
    },
    {
      raw: 'https://git.example.org/dev/library/raw/branch/HEAD',
      blob: 'https://git.example.org/dev/library/src/branch/HEAD',
    },
  ],
  [
    { provider: 'bitbucket', owner: 'team', repo: 'pkg' },
    {
      raw: 'https://bitbucket.org/team/pkg/raw/HEAD',
      blob: 'https://bitbucket.org/team/pkg/src/HEAD',
    },
  ],
  [
    { provider: 'sourcehut', owner: '~dev', repo: 'library' },
    {
      raw: 'https://git.sr.ht/~dev/library/blob/HEAD',
      blob: 'https://git.sr.ht/~dev/library/tree/HEAD/item',
    },
  ],
  [
    { provider: 'gitee', owner: 'team', repo: 'pkg' },
    {
      raw: 'https://gitee.com/team/pkg/raw/HEAD',
      blob: 'https://gitee.com/team/pkg/blob/HEAD',
    },
  ],
]
for (const [input, expected] of cases)
  test(`${input.provider} ${input.host ?? 'default'} URLs`, () => {
    assert.deepEqual(getBaseFileUrl(input), expected, 'PROVIDER_URL_REGRESSION')
  })

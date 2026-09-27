import assert from 'node:assert/strict'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { Check, decode } from '../packages/core/model.js'

const base = (process.env.DOCS_BASE ?? '/').replace(/\/$/, '')
const sourceRoot = 'apps/docs/src/content/docs'
const outputRoot = 'apps/docs/dist'
const entries = (await readdir(sourceRoot, { recursive: true })).filter(
  (file) => /\.mdx?$/.test(file),
)
const index = await readFile(join(outputRoot, 'llms.txt'), 'utf8')

for (const file of entries) {
  const slug = file.replace(/\.mdx?$/, '')
  const exported = await readFile(
    join(outputRoot, 'markdown', `${slug}.md`),
    'utf8',
  )
  assert(exported.startsWith('# '), `${slug} has a readable title`)
  assert(
    index.includes(`(${base}/markdown/${slug}.md)`),
    `${slug} appears in llms.txt`,
  )
  assert(
    !/^import /m.test(exported.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '')),
    `${slug} contains no unresolved imports`,
  )
  assert(
    !/<(?:ReceiptExample|Diagram|Lab|SourceLocation|LinkCard|Card|Tabs)\b/.test(
      exported,
    ),
    `${slug} contains no unresolved components`,
  )
}

const example = await readFile(
  join(outputRoot, 'markdown/guides/add-task.md'),
  'utf8',
)
for (const file of ['task.json', 'PROMPT.md', 'grader/regression.test.mjs']) {
  const source = await readFile(join('tasks/receipt-rounding', file), 'utf8')
  assert(
    example.includes(source.trimEnd()),
    `${file} is exported verbatim from the teaching fixture`,
  )
}
const live = await readFile(
  join(outputRoot, 'markdown/guides/live-comparison.md'),
  'utf8',
)
assert(
  live.includes('makes real model calls and consumes subscription allowance'),
  'Live-call warning survives export',
)
const qualification = await readFile(
  join(outputRoot, 'markdown/concepts/qualification.md'),
  'utf8',
)
assert(
  qualification.includes('expected conditions, not measured workflow results'),
  'Diagram caption survives export',
)
assert(
  qualification.includes('broken base must fail the intended regression'),
  'Diagram alternative text survives export',
)
const how = await readFile(
  join(outputRoot, 'markdown/concepts/how-it-works.md'),
  'utf8',
)
assert(
  how.includes('Reproduce a Docker image across machines'),
  'Disclosure title survives export',
)
assert(
  how.includes('export the qualified image'),
  'Collapsed content survives export',
)
const cli = await readFile(
  join(outputRoot, 'markdown/reference/cli.md'),
  'utf8',
)
assert(
  /`judge --plan PATH`\s*\|\s*\*\*Yes\*\*/.test(cli),
  'Judge appears in the command table as a real model call',
)
const artifacts = await readFile(
  join(outputRoot, 'markdown/reference/artifacts.md'),
  'utf8',
)
const checkExample = artifacts.match(/```json\n([\s\S]*?)\n```/)?.[1]
assert(checkExample, 'Artifact reference contains a schema example')
decode(Check, JSON.parse(checkExample))
console.log(
  `Verified ${entries.length} Markdown exports, the documentation index, source-backed examples, warnings, and diagram descriptions.`,
)

// Check rendered navigation and assets under both local and Pages base paths.
const htmlFiles = (await readdir(outputRoot, { recursive: true })).filter(
  (file) => file.endsWith('.html'),
)
for (const file of htmlFiles) {
  const html = await readFile(join(outputRoot, file), 'utf8')
  for (const match of html.matchAll(
    /(?:href|src|component-url|renderer-url)="(\/(?!\/)[^"]*)"/g,
  )) {
    const url = new URL(match[1]!, 'https://docs.example')
    assert(
      url.pathname.startsWith(`${base}/`),
      `${file}: ${url.pathname} escapes the docs base`,
    )
    const relative = decodeURIComponent(url.pathname.slice(base.length + 1))
    const target = join(outputRoot, relative)
    const info = await stat(target).catch(() => null)
    assert(info, `${file}: missing destination ${url.pathname}`)
    if (info.isDirectory()) await stat(join(target, 'index.html'))
  }
}
console.log(
  `Verified navigation and asset destinations in ${htmlFiles.length} HTML pages at ${base || '/'}.`,
)

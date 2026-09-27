import { withBase } from './links'
import { getCollection } from 'astro:content'
import { receiptMarkdown } from './receipt-example'

export interface MarkdownPage {
  id: string
  title: string
  description: string
  markdown: string
  href: string
  sourcePath: string
}

const sources = import.meta.glob<string>('../content/docs/**/*.{md,mdx}', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export function readableMarkdown(body: string): string {
  const codeBlocks: string[] = []
  const protectedBody = body.replace(/^```[^\n]*\n[\s\S]*?^```/gm, (code) => {
    codeBlocks.push(code)
    return `WB_CODE_BLOCK_${codeBlocks.length - 1}_END`
  })
  return protectedBody
    .replace(/^import .+\n/gm, '')
    .replace(
      /<SourceLocation\s*\/>/g,
      'Source files are under `apps/docs/src/content/docs/`. Use Edit page locally on the rendered page for its exact path.',
    )
    .replace(/<ReceiptExample\s*\/>/g, () => {
      codeBlocks.push(receiptMarkdown)
      return `WB_CODE_BLOCK_${codeBlocks.length - 1}_END`
    })
    .replace(/<Diagram\s+[\s\S]*?\/>/g, (tag) => {
      const alt = tag.match(/alt="([^"]*)"/)?.[1] ?? ''
      const caption = tag.match(/caption="([^"]*)"/)?.[1] ?? ''
      const src = tag.match(/src="([^"]*)"/)?.[1] ?? ''
      return `\n![${alt}](${src})\n\n${caption}\n`
    })
    .replace(
      /<Lab\s+client:load\s*\/>/g,
      '\nAttempts = tasks × workflows × repetitions. [Open the interactive calculator](/concepts/lab/).\n',
    )
    .replace(/<LinkCard\s+[\s\S]*?\/>/g, (tag) => {
      const title = tag.match(/title="([^"]*)"/)?.[1] ?? ''
      const href = tag.match(/href="([^"]*)"/)?.[1] ?? ''
      const description = tag.match(/description="([^"]*)"/)?.[1] ?? ''
      return `\n- [${title}](${href}) ${description}\n`
    })
    .replace(/<Card\s+title="([^"]*)"[^>]*>/g, '\n### $1\n\n')
    .replace(/<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary>/g, '\n### $1\n\n')
    .replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1** ')
    .replace(/<\/?(?:div|span|p|Card|CardGrid|details)[^>]*>/g, '\n')
    .replace(/\{' '\}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(
      /\]\((\/(?!\/)[^)]+)\)/g,
      (_, path: string) => `](${withBase(path)})`,
    )
    .replace(
      /WB_CODE_BLOCK_(\d+)_END/g,
      (_, index: string) => codeBlocks[Number(index)] ?? '',
    )
    .trim()
}

export async function markdownPages(): Promise<MarkdownPage[]> {
  const entries = await getCollection('docs')
  return entries
    .map((entry) => {
      const id = entry.id === 'index' ? 'index' : entry.id.replace(/\/$/, '')
      const source = Object.keys(sources).find(
        (path) =>
          path.replace('../content/docs/', '').replace(/\.mdx?$/, '') === id,
      )
      if (!source) throw new Error(`Missing documentation source for ${id}`)
      return {
        id,
        title: entry.data.title,
        description: entry.data.description ?? '',
        markdown: `# ${entry.data.title}\n\n${readableMarkdown(entry.body ?? '')}\n`,
        href: withBase(`/markdown/${id}.md`),
        sourcePath: source.replace('../', 'apps/docs/src/'),
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

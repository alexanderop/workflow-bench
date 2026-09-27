import type { APIRoute } from 'astro'
import { markdownPages } from '../lib/docs-export'

export const GET: APIRoute = async () => {
  const pages = await markdownPages()
  const text = [
    '# Workflow Bench',
    '',
    '> A local benchmark for controlled comparisons of agentic coding workflows.',
    '',
    'Qualify the broken base and trusted reference before solving. Run and judge make real model calls. Missing child usage is unknown, not zero. Workflow activation and correctness are separate observations.',
    '',
    'These exports contain documentation only. They exclude benchmark artifacts, raw execution transcripts, and credentials. Markdown links are relative to this site.',
    '',
    '## Documentation',
    '',
    ...pages.map(
      (page) => `- [${page.title}](${page.href}): ${page.description}`,
    ),
    '',
  ].join('\n')
  return new Response(text, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

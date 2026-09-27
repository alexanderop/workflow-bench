import type { APIRoute, GetStaticPaths } from 'astro'
import { markdownPages, type MarkdownPage } from '../../lib/docs-export'

export const getStaticPaths: GetStaticPaths = async () =>
  (await markdownPages()).map((page) => ({
    params: { slug: page.id },
    props: { page },
  }))

export const GET: APIRoute = ({ props }) => {
  const page = props.page as MarkdownPage
  return new Response(page.markdown, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}

import { defineConfig } from 'astro/config'
import { unified } from '@astrojs/markdown-remark'
import starlight from '@astrojs/starlight'
import vue from '@astrojs/vue'
import { remarkBaseLinks } from './src/lib/remark-base-links.mjs'

const base = process.env.DOCS_BASE ?? '/'
const repository = 'https://github.com/alexanderop/workflow-bench'

export default defineConfig({
  site: 'https://alexanderop.github.io',
  base,
  markdown: {
    processor: unified({ remarkPlugins: [[remarkBaseLinks, { base }]] }),
  },
  devToolbar: { enabled: false },
  integrations: [
    vue(),
    starlight({
      title: 'Workflow Bench',
      social: [{ icon: 'github', label: 'GitHub', href: repository }],
      editLink: { baseUrl: `${repository}/edit/main/apps/docs/` },
      description:
        'A field guide and local lab for measuring agentic workflows.',
      customCss: ['./src/styles/theme.css'],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
        PageTitle: './src/components/PageTitle.astro',
      },
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Why this benchmark', slug: 'start/why' },
            { label: 'Your first qualified task', slug: 'start/quickstart' },
            { label: 'Run a live comparison', slug: 'guides/live-comparison' },
            { label: 'Expand the task suite', slug: 'guides/expand-suite' },
            {
              label: 'Six-case comparison',
              slug: 'start/expanded-results',
            },
            {
              label: 'First pstack vs vanilla pilot',
              slug: 'start/pilot-results',
            },
            { label: 'Read the results', link: '/results/' },
          ],
        },
        {
          label: 'Understand the method',
          items: [
            { label: 'How a run works', slug: 'concepts/how-it-works' },
            {
              label: 'What makes a fair comparison',
              slug: 'concepts/fair-comparisons',
            },
            { label: 'Qualify a task', slug: 'concepts/qualification' },
            { label: 'Interpret results', slug: 'concepts/interpretation' },
            { label: 'Experiment calculator', slug: 'concepts/lab' },
          ],
        },
        {
          label: 'Build your benchmark',
          items: [
            { label: 'Add an open-source task', slug: 'guides/add-task' },
            { label: 'Compare workflows', slug: 'guides/workflows' },
            { label: 'Nuxt workout tracker', slug: 'guides/workout-benchmark' },
            { label: 'Docker and authentication', slug: 'guides/docker-auth' },
            { label: 'Troubleshooting', slug: 'guides/troubleshooting' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'CLI commands', slug: 'reference/cli' },
            { label: 'Artifacts', slug: 'reference/artifacts' },
            { label: 'Edit the guide', slug: 'reference/contributing' },
            {
              label: 'Architecture and provenance',
              slug: 'reference/architecture',
            },
            { label: 'Limitations', slug: 'reference/limitations' },
          ],
        },
      ],
    }),
  ],
  vite: { server: { fs: { allow: ['../..'] } } },
})

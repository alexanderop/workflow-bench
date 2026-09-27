import task from '../../../../tasks/receipt-rounding/task.json?raw'
import prompt from '../../../../tasks/receipt-rounding/PROMPT.md?raw'
import grader from '../../../../tasks/receipt-rounding/grader/regression.test.mjs?raw'

export const receiptFiles = [
  { name: 'task.json', language: 'json', code: task },
  { name: 'PROMPT.md', language: 'md', code: prompt },
  { name: 'grader/regression.test.mjs', language: 'js', code: grader },
] as const

export const receiptMarkdown = receiptFiles
  .map(
    ({ name, language, code }) =>
      `### ${name}\n\n\`\`\`${language}\n${code.trimEnd()}\n\`\`\``,
  )
  .join('\n\n')

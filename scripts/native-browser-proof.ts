import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Prepared } from '../packages/core/model.js'
import { now, readJson, root, writeJson } from '../packages/core/io.js'
import { prepare } from '../packages/runner/prepare.js'
import {
  sandboxPolicyVersion,
  withLocalWorkspace,
} from '../packages/local/workspace.js'

const work = join(root, '.bench/native-browser-proof')
const prepared = process.env.BENCH_BROWSER_PREPARED
  ? await readJson(resolve(process.env.BENCH_BROWSER_PREPARED), Prepared)
  : await prepare(work, 'nuxt-workout-tracker')
const privateHost = await mkdtemp(
  join(tmpdir(), 'workflow-bench-browser-private-'),
)

try {
  await withLocalWorkspace(prepared, async (workspace) => {
    const secrets = {
      auth: 'BROWSER_MUST_NOT_READ_AUTH_4fce',
      sibling: 'BROWSER_MUST_NOT_READ_SIBLING_790b',
      grader: 'BROWSER_MUST_NOT_READ_GRADER_a18d',
    }
    const sibling = join(dirname(workspace.root), 'sibling-secret.txt')
    const grader = join(privateHost, 'hidden-grader.txt')
    const auth = join(workspace.codexHome, 'auth.json')
    const allowed = join(workspace.root, 'browser-readable.txt')
    const allowedContent = 'BROWSER_ALLOWED_WORKSPACE_FILE_eb52'
    await Promise.all([
      writeFile(auth, secrets.auth, { mode: 0o600 }),
      writeFile(sibling, secrets.sibling, { mode: 0o600 }),
      writeFile(grader, secrets.grader, { mode: 0o600 }),
      writeFile(allowed, allowedContent),
    ])
    const browser = await workspace.startBrowser()
    assert(browser, 'Prepared browser task must expose cached Chromium')
    const browserPid = browser.pid
    workspace.env.BENCH_BROWSER_WS_ENDPOINT = browser.endpoint
    workspace.env.BENCH_BROWSER_FILES = JSON.stringify({
      allowed,
      denied: [auth, sibling, grader],
    })
    try {
      const result = await workspace.run(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        import http from 'node:http'
        import { chromium } from 'playwright'
        const server = http.createServer((_request, response) => {
          response.setHeader('content-type', 'text/html')
          response.end('<button>before</button><script>document.querySelector("button").onclick=event=>event.target.textContent="after"</script>')
        })
        await new Promise((resolve, reject) => {
          server.once('error', reject)
          server.listen(0, '127.0.0.1', resolve)
        })
        const address = server.address()
        if (!address || typeof address === 'string') throw new Error('No local server port')
        const browser = await chromium.connectOverCDP(process.env.BENCH_BROWSER_WS_ENDPOINT)
        const context = browser.contexts()[0] ?? await browser.newContext()
        const page = await context.newPage()
        await page.goto('http://127.0.0.1:' + address.port)
        await page.getByRole('button', { name: 'before' }).click()
        const text = await page.getByRole('button').textContent()
        const indexedDb = await page.evaluate(async () => {
          const opened = indexedDB.open('workflow-bench-proof', 1)
          opened.onupgradeneeded = () => opened.result.createObjectStore('values')
          const db = await new Promise((resolve, reject) => {
            opened.onsuccess = () => resolve(opened.result)
            opened.onerror = () => reject(opened.error)
          })
          const transaction = db.transaction('values', 'readwrite')
          transaction.objectStore('values').put('persisted', 'answer')
          await new Promise((resolve, reject) => {
            transaction.oncomplete = resolve
            transaction.onerror = () => reject(transaction.error)
          })
          const read = db.transaction('values').objectStore('values').get('answer')
          return await new Promise((resolve, reject) => {
            read.onsuccess = () => resolve(read.result)
            read.onerror = () => reject(read.error)
          })
        })
        await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<input id="browser-file" type="file">'))
        const cdp = await context.newCDPSession(page)
        const readThroughBrowser = async (path) => {
          try {
            const document = await cdp.send('DOM.getDocument')
            const input = await cdp.send('DOM.querySelector', { nodeId: document.root.nodeId, selector: '#browser-file' })
            await cdp.send('DOM.setFileInputFiles', { files: [path], nodeId: input.nodeId })
            return await page.locator('#browser-file').evaluate(async (element) => {
              const file = element.files?.[0]
              return file ? await file.text() : 'no-file'
            })
          } catch (error) { return error instanceof Error ? error.message : String(error) }
        }
        const files = JSON.parse(process.env.BENCH_BROWSER_FILES)
        const allowedFile = await readThroughBrowser(files.allowed)
        const deniedFiles = []
        for (const path of files.denied) deniedFiles.push(await readThroughBrowser(path))
        let externalNetwork = 'unexpected-success'
        try { await page.goto('https://example.com', { timeout: 3000 }) }
        catch (error) { externalNetwork = error instanceof Error ? error.message : String(error) }
        process.stdout.write(JSON.stringify({ text, indexedDb, allowedFile, deniedFiles, externalNetwork }))
        await page.close()
        server.closeAllConnections()
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
        await browser.close()
      `,
        ],
        { timeoutMs: 25_000 },
      )
      assert.equal(result.code, 0, result.stderr)
      const evidence = JSON.parse(result.stdout) as {
        text: string
        indexedDb: string
        allowedFile: string
        deniedFiles: string[]
        externalNetwork: string
      }
      assert.equal(evidence.text, 'after')
      assert.equal(evidence.indexedDb, 'persisted')
      assert.equal(evidence.allowedFile, allowedContent)
      assert.equal(evidence.deniedFiles.length, 3)
      for (const secret of Object.values(secrets))
        assert.ok(
          evidence.deniedFiles.every((value) => !value.includes(secret)),
        )
      assert.match(evidence.externalNetwork, /ERR_|failed|timeout|closed/i)
    } finally {
      delete workspace.env.BENCH_BROWSER_WS_ENDPOINT
      delete workspace.env.BENCH_BROWSER_FILES
      await browser.stop()
    }
    assert.throws(() => process.kill(browserPid, 0), /ESRCH/)
    assert.equal(await readFile(auth, 'utf8'), secrets.auth)
    await writeJson(join(root, 'artifacts/native-browser-proof.json'), {
      kind: 'deterministic-native-browser-test-not-model-evidence',
      createdAt: now(),
      environment: prepared.environment,
      runtimeSandboxPolicyVersion: sandboxPolicyVersion,
      localhostInteraction: true,
      indexedDbPersistence: true,
      protectedFilesDenied: true,
      externalNetworkDenied: true,
      browserReaped: true,
    })
  })
} finally {
  await rm(privateHost, { recursive: true, force: true })
}

console.log(
  'Native solver browser proof passed: a sandboxed tool exercised a localhost UI and IndexedDB through brokered Chromium; auth, sibling, hidden-grader, and external-network access were denied; Chromium was reaped. No model calls.',
)

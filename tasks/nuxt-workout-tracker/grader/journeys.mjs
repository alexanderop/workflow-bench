import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
const repo = process.env.BENCH_REPO_ROOT ?? '/repo'
const require = createRequire(join(repo, 'package.json'))
const { chromium } = require('playwright')
const server = spawn('node', ['.output/server/index.mjs'], {
  cwd: repo,
  env: { ...process.env, PORT: '3187', HOST: '127.0.0.1' },
  stdio: 'ignore',
})
let browser
let failures = 0
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3187')).ok) break
    } catch {}
    if (i === 99) throw new Error('Production server unavailable')
    await new Promise((r) => setTimeout(r, 200))
  }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  // Accessible names tolerate required markers and scoped action context.
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const labelName = (name) =>
    new RegExp(`^${escape(name)}(?:\\s*\\*|\\s*\\(required\\))?\\s*$`, 'i')
  const button = (page, name) =>
    page.getByRole('button', {
      name: new RegExp(`^${escape(name)}(?:\\s*[:—–-]\\s*.+)?\\s*$`, 'i'),
    })
  const field = (page, name) => {
    const options = { name: labelName(name) }
    // HTML date inputs have no implicit textbox role.
    if (name === 'Workout date') return page.getByLabel(labelName(name))
    return page
      .getByRole('textbox', options)
      .or(page.getByRole('spinbutton', options))
  }
  const articles = (page) =>
    page
      .getByRole('region', { name: 'Workout history', exact: true })
      .getByRole('article')
  async function fill(page, title = 'Strength', date = '2026-09-20') {
    await button(page, 'New workout').click()
    await field(page, 'Workout title').fill(title)
    await field(page, 'Workout date').fill(date)
    await field(page, 'Notes').fill('Steady progress')
    await field(page, 'Exercise name').first().fill('Squat')
    await field(page, 'Sets').first().fill('3')
    await field(page, 'Reps').first().fill('5')
    await field(page, 'Weight (kg)').first().fill('80.5')
  }
  async function save(page) {
    await button(page, 'Save workout').click()
    await button(page, 'New workout').waitFor()
  }
  async function count(page, n) {
    await articles(page)
      .nth(n ? n - 1 : 0)
      .waitFor({ state: n ? 'visible' : 'hidden' })
    assert.equal(await articles(page).count(), n)
  }
  async function confirmDelete(page, accept) {
    let native = false
    const listener = async (dialog) => {
      native = true
      await (accept ? dialog.accept() : dialog.dismiss())
    }
    page.once('dialog', listener)
    await button(articles(page).first(), 'Delete workout').click()
    if (!native) {
      const dialog = page.getByRole('dialog').or(page.getByRole('alertdialog'))
      await button(dialog, accept ? 'Confirm delete' : 'Cancel').click()
      page.off('dialog', listener)
    }
  }
  const cases = [
    [
      'empty state, mobile fit, and default date',
      async (page) => {
        await page
          .getByRole('heading', { name: 'Workout tracker', exact: true })
          .waitFor()
        await count(page, 0)
        assert.match(
          await page
            .getByRole('region', { name: 'Workout history' })
            .innerText(),
          /no workouts|first|empty/i,
        )
        await button(page, 'New workout').click()
        assert.equal(
          await field(page, 'Workout date').inputValue(),
          await page.evaluate(() => {
            const d = new Date()
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          }),
        )
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        await button(page, 'Cancel').click()
        await count(page, 0)
      },
    ],
    [
      'multi-exercise volume and IndexedDB persistence',
      async (page) => {
        await fill(page, '  Strength  ')
        await button(page, 'Add exercise').click()
        await field(page, 'Exercise name').nth(1).fill('Row')
        await field(page, 'Sets').nth(1).fill('2')
        await field(page, 'Reps').nth(1).fill('10')
        await field(page, 'Weight (kg)').nth(1).fill('20')
        await save(page)
        await count(page, 1)
        assert.match(
          (await articles(page).innerText()).replaceAll(',', ''),
          /1607\.5\s*kg/,
        )
        await page.evaluate(() => {
          localStorage.clear()
          sessionStorage.clear()
        })
        await page.reload()
        await count(page, 1)
        await articles(page)
          .getByRole('heading', { name: 'Strength', exact: true })
          .waitFor()
        assert.match(await articles(page).innerText(), /2026-09-20/)
        assert.match(await articles(page).innerText(), /Steady progress/)
        assert.match(await articles(page).innerText(), /Row/)
        const state = await page.context().storageState({ indexedDB: true })
        assert.ok(
          state.origins.some((o) =>
            o.indexedDB?.some((db) =>
              db.stores.some((s) => s.records.length > 0),
            ),
          ),
          'Must store records in IndexedDB',
        )
        const later = await page.context().newPage()
        await later.goto('http://127.0.0.1:3187')
        await count(later, 1)
        await later.close()
      },
    ],
    [
      'history order, edit replacement, row removal, and cancel isolation',
      async (page) => {
        await fill(page, 'Older', '2026-09-01')
        await save(page)
        await fill(page, 'Newer', '2026-09-22')
        await save(page)
        await count(page, 2)
        await articles(page)
          .first()
          .getByRole('heading', { name: 'Newer', exact: true })
          .waitFor()
        await button(articles(page).first(), 'Edit workout').click()
        assert.equal(await field(page, 'Exercise name').inputValue(), 'Squat')
        await field(page, 'Workout title').fill('Discarded')
        await button(page, 'Cancel').click()
        await articles(page)
          .first()
          .getByRole('heading', { name: 'Newer', exact: true })
          .waitFor()
        await page.reload()
        await count(page, 2)
        await articles(page)
          .first()
          .getByRole('heading', { name: 'Newer', exact: true })
          .waitFor()
        await button(articles(page).first(), 'Edit workout').click()
        await button(page, 'Add exercise').click()
        await field(page, 'Exercise name').nth(1).fill('Pushup')
        await field(page, 'Sets').nth(1).fill('2')
        await field(page, 'Reps').nth(1).fill('12')
        await field(page, 'Weight (kg)').nth(1).fill('0')
        await button(page, 'Remove exercise').first().click()
        await field(page, 'Workout title').fill('Updated')
        await save(page)
        await page.reload()
        await count(page, 2)
        const text = await articles(page).first().innerText()
        assert.match(text, /Updated/)
        assert.match(text, /Pushup/)
        assert.doesNotMatch(text, /Squat/)
        assert.match(text, /volume[^\n]*\b0\s*kg/i)
        await articles(page)
          .nth(1)
          .getByRole('heading', { name: 'Older', exact: true })
          .waitFor()
      },
    ],
    [
      'invalid values never save',
      async (page) => {
        await fill(page)
        const invalid = [
          ['Workout title', '   '],
          ['Workout date', ''],
          ['Exercise name', ' '],
          ['Sets', '0'],
          ['Sets', '1.5'],
          ['Reps', '-1'],
          ['Reps', '2.5'],
          ['Weight (kg)', '-1'],
          ['Weight (kg)', ''],
        ]
        for (const [name, value] of invalid) {
          const input = field(page, name).first()
          const original = await input.inputValue()
          await input.fill(value)
          await button(page, 'Save workout').click()
          await page.getByRole('alert').first().waitFor()
          assert.ok((await page.getByRole('alert').first().innerText()).trim())
          await input.waitFor()
          await input.fill(original)
        }
        await button(page, 'Remove exercise').click()
        await button(page, 'Save workout').click()
        await page.getByRole('alert').first().waitFor()
        await button(page, 'Cancel').click()
        await page.reload()
        await count(page, 0)
      },
    ],
    [
      'cancelled and confirmed deletion survive reload',
      async (page) => {
        await fill(page)
        await save(page)
        await confirmDelete(page, false)
        await page.reload()
        await count(page, 1)
        await confirmDelete(page, true)
        await count(page, 0)
        await page.reload()
        await count(page, 0)
      },
    ],
    [
      'database open failure is visible',
      async (page) => {
        await page.addInitScript(() => {
          IDBFactory.prototype.open = function () {
            throw new DOMException('Storage blocked', 'SecurityError')
          }
        })
        await page.reload()
        await page.getByRole('alert').first().waitFor()
        assert.ok((await page.getByRole('alert').first().innerText()).trim())
      },
    ],
    [
      'failed write retains draft and permits retry',
      async (page) => {
        await fill(page)
        await page.evaluate(() => {
          window.__put = IDBObjectStore.prototype.put
          window.__add = IDBObjectStore.prototype.add
          IDBObjectStore.prototype.put = IDBObjectStore.prototype.add =
            function () {
              throw new DOMException('Quota exceeded', 'QuotaExceededError')
            }
        })
        await button(page, 'Save workout').click()
        await page.getByRole('alert').first().waitFor()
        assert.equal(
          await field(page, 'Workout title').inputValue(),
          'Strength',
        )
        await page.evaluate(() => {
          IDBObjectStore.prototype.put = window.__put
          IDBObjectStore.prototype.add = window.__add
        })
        await save(page)
        await page.reload()
        await count(page, 1)
      },
    ],
  ]
  for (const [name, run] of cases) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: 'Europe/Berlin',
    })
    const page = await context.newPage()
    page.setDefaultTimeout(5000)
    try {
      await page.goto('http://127.0.0.1:3187')
      await run(page)
      console.log(`PASS ${name}`)
      console.log(
        'WORKOUT_JOURNEY ' + JSON.stringify({ name, status: 'passed' }),
      )
    } catch (error) {
      failures++
      const status =
        error.name === 'TimeoutError' && /locator\./.test(error.message)
          ? 'not_assessed'
          : 'failed'
      const marker =
        status === 'not_assessed'
          ? 'WORKOUT_NOT_ASSESSED'
          : 'WORKOUT_REQUIREMENTS_FAILED'
      console.error(`${marker}: ${name}: ${error.message}`)
      console.log(
        'WORKOUT_JOURNEY ' +
          JSON.stringify({ name, status, reason: error.message }),
      )
    } finally {
      await context.close()
    }
  }
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
process.exitCode = failures ? 1 : 0

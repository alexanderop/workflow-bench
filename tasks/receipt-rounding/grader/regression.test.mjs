import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const { receipt } = await import(
  pathToFileURL(join(process.env.BENCH_REPO_ROOT ?? '/repo', 'src/receipt.mjs'))
    .href
)
test('round each discounted line before summing', () => {
  assert.equal(
    receipt([
      { unitCents: 1, quantity: 1, discountPercent: 50 },
      { unitCents: 1, quantity: 1, discountPercent: 50 },
    ]),
    2,
    'LINE_ROUNDING_REGRESSION',
  )
})
test('quantities are grouped per line and discounts preserve integer cents', () => {
  assert.equal(receipt([{ unitCents: 1, quantity: 3, discountPercent: 50 }]), 2)
  assert.equal(
    receipt([
      { unitCents: 99, quantity: 2, discountPercent: 15 },
      { unitCents: 5, quantity: 1, discountPercent: 50 },
    ]),
    171,
  )
  assert.equal(
    receipt([{ unitCents: 123, quantity: 0, discountPercent: 50 }]),
    0,
  )
  assert.equal(
    receipt([{ unitCents: 123, quantity: 4, discountPercent: 100 }]),
    0,
  )
})

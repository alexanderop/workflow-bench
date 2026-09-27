import { test } from 'node:test'
import assert from 'node:assert/strict'
import { receipt } from '../src/receipt.mjs'
test('empty receipts and whole-cent lines', () => {
 assert.equal(receipt([]), 0)
 assert.equal(receipt([{unitCents: 200, quantity: 3, discountPercent: 25}]), 450)
})

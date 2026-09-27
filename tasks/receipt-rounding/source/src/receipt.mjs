export function receipt(items) {
  return Math.round(items.reduce((total, item) =>
    total + item.unitCents * item.quantity * (100 - item.discountPercent) / 100, 0))
}

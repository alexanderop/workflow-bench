# Receipt rounding

The receipt total sometimes differs from the sum of displayed line totals. Each line groups its quantity, applies its percentage discount, and rounds half cents up to an integer number of cents before the lines are added. Fix `receipt(items)` while preserving empty receipts and undiscounted totals. Inputs are nonnegative integer unitCents and quantity, with integer discountPercent from 0 to 100. Return an integer total in cents. Run the existing tests and verify fractional-cent cases.

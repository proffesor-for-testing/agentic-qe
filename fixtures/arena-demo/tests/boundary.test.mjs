// Arena demo — "boundary" group: edge values at every branch threshold
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount, computeTotal, shippingBand } from '../src/pricing.mjs';

test('coupon applies exactly at the 50 threshold', () => {
  assert.equal(applyDiscount(50, 'none', 'SAVE5'), 47.5);
});

test('coupon does not apply just below the threshold', () => {
  assert.equal(applyDiscount(49.99, 'none', 'SAVE5'), 49.99);
});

test('discount rate is capped at 25%', () => {
  // gold (0.20) + SAVE5 (0.05) = 0.25 exactly — cap must not reduce it
  assert.equal(applyDiscount(100, 'gold', 'SAVE5'), 75);
});

test('zero price is allowed', () => {
  assert.equal(applyDiscount(0, 'gold'), 0);
});

test('zero-qty items are skipped, not summed', () => {
  assert.equal(computeTotal([{ price: 10, qty: 0 }, { price: 5, qty: 1 }], 0), 5);
});

test('zero weight ships nothing', () => {
  assert.equal(shippingBand(0), 'none');
});

test('exactly 1kg is still small', () => {
  assert.equal(shippingBand(1), 'small');
});

test('exactly 10kg is still medium', () => {
  assert.equal(shippingBand(10), 'medium');
});

test('just over 10kg is freight', () => {
  assert.equal(shippingBand(10.01), 'freight');
});

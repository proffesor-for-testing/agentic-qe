// Arena demo — "happy" group: nominal paths only (weak mutant killer by design)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount, computeTotal, shippingBand } from '../src/pricing.mjs';

test('gold tier gets 20% off', () => {
  assert.equal(applyDiscount(100, 'gold'), 80);
});

test('no tier pays full price', () => {
  assert.equal(applyDiscount(40, 'none'), 40);
});

test('total sums items with tax', () => {
  assert.equal(computeTotal([{ price: 10, qty: 2 }], 0.1), 22);
});

test('medium parcel band', () => {
  assert.equal(shippingBand(5), 'medium');
});

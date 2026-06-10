// Arena demo — "errors" group: rejection paths and invalid input
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount, computeTotal, shippingBand } from '../src/pricing.mjs';

test('non-numeric price throws TypeError', () => {
  assert.throws(() => applyDiscount('100', 'gold'), TypeError);
});

test('NaN price throws TypeError', () => {
  assert.throws(() => applyDiscount(Number.NaN, 'gold'), TypeError);
});

test('negative price throws RangeError', () => {
  assert.throws(() => applyDiscount(-1, 'gold'), RangeError);
});

test('non-array items throws TypeError', () => {
  assert.throws(() => computeTotal('items', 0.1), TypeError);
});

test('taxRate above 1 throws RangeError', () => {
  assert.throws(() => computeTotal([], 1.01), RangeError);
});

test('negative taxRate throws RangeError', () => {
  assert.throws(() => computeTotal([], -0.01), RangeError);
});

test('item without numeric qty throws TypeError', () => {
  assert.throws(() => computeTotal([{ price: 10 }], 0), TypeError);
});

test('negative weight throws RangeError', () => {
  assert.throws(() => shippingBand(-0.5), RangeError);
});

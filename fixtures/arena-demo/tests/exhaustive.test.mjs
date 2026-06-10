// Arena demo — "exhaustive" group: dense input sweeps (strongest killer,
// genuinely slowest — the runtime penalty exists for suites like this)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDiscount, computeTotal, shippingBand } from '../src/pricing.mjs';

test('discount sweep across tiers, coupons and prices', () => {
  const expectRate = (tier, coupon, price) => {
    let rate = tier === 'gold' ? 0.2 : tier === 'silver' ? 0.1 : 0;
    if (coupon === 'SAVE5' && price >= 50) rate += 0.05;
    return Math.min(rate, 0.25);
  };
  for (const tier of ['gold', 'silver', 'none']) {
    for (const coupon of ['SAVE5', undefined]) {
      for (let price = 0; price <= 120; price += 0.5) {
        const expected = Math.round(price * (1 - expectRate(tier, coupon, price)) * 100) / 100;
        assert.equal(applyDiscount(price, tier, coupon), expected, `tier=${tier} coupon=${coupon} price=${price}`);
      }
    }
  }
});

test('total sweep across carts and tax rates', () => {
  for (let qty = 1; qty <= 25; qty++) {
    for (let tax = 0; tax <= 1; tax += 0.05) {
      const t = Math.round(tax * 100) / 100;
      const expected = Math.round(7.3 * qty * (1 + t) * 100) / 100;
      assert.equal(computeTotal([{ price: 7.3, qty }], t), expected, `qty=${qty} tax=${t}`);
    }
  }
});

test('shipping band sweep at fine granularity', () => {
  for (let w = 0; w <= 15; w += 0.01) {
    const kg = Math.round(w * 100) / 100;
    const expected = kg === 0 ? 'none' : kg <= 1 ? 'small' : kg <= 10 ? 'medium' : 'freight';
    assert.equal(shippingBand(kg), expected, `w=${kg}`);
  }
});

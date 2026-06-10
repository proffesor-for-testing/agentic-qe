/**
 * Arena demo fixture (ADR-104) — a small pricing module with deliberate
 * branch density so operator mutations produce meaningful mutants.
 * Pure ESM, no dependencies; tests run under `node --test`.
 */

export function applyDiscount(price, tier, coupon) {
  if (typeof price !== 'number' || Number.isNaN(price)) {
    throw new TypeError('price must be a number');
  }
  if (price < 0) {
    throw new RangeError('price must be >= 0');
  }

  let rate = 0;
  if (tier === 'gold') {
    rate = 0.2;
  } else if (tier === 'silver') {
    rate = 0.1;
  }

  if (coupon === 'SAVE5' && price >= 50) {
    rate = rate + 0.05;
  }

  if (rate > 0.25) {
    rate = 0.25;
  }

  return Math.round(price * (1 - rate) * 100) / 100;
}

export function computeTotal(items, taxRate) {
  if (!Array.isArray(items)) {
    throw new TypeError('items must be an array');
  }
  if (typeof taxRate !== 'number' || taxRate < 0 || taxRate > 1) {
    throw new RangeError('taxRate must be in [0, 1]');
  }

  let subtotal = 0;
  for (const item of items) {
    if (!item || typeof item.price !== 'number' || typeof item.qty !== 'number') {
      throw new TypeError('item must have numeric price and qty');
    }
    if (item.qty <= 0) {
      continue;
    }
    subtotal = subtotal + item.price * item.qty;
  }

  const total = subtotal * (1 + taxRate);
  return Math.round(total * 100) / 100;
}

export function shippingBand(weightKg) {
  if (typeof weightKg !== 'number' || weightKg < 0) {
    throw new RangeError('weight must be >= 0');
  }
  if (weightKg === 0) {
    return 'none';
  }
  if (weightKg <= 1) {
    return 'small';
  }
  if (weightKg <= 10) {
    return 'medium';
  }
  return 'freight';
}

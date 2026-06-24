/** D3 corpus fixture — numeric/array statistics with branch density.
 *  Pure ESM, no deps; tests run under `node --test`. */

export function clamp(value, lo, hi) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new TypeError('value must be a number');
  }
  if (lo > hi) {
    throw new RangeError('lo must be <= hi');
  }
  if (value < lo) {
    return lo;
  }
  if (value > hi) {
    return hi;
  }
  return value;
}

export function mean(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError('values must be a non-empty array');
  }
  let sum = 0;
  for (const v of values) {
    if (typeof v !== 'number' || Number.isNaN(v)) {
      throw new TypeError('all values must be numbers');
    }
    sum += v;
  }
  return sum / values.length;
}

export function median(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new RangeError('values must be a non-empty array');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function inRange(value, lo, hi) {
  return value >= lo && value <= hi;
}

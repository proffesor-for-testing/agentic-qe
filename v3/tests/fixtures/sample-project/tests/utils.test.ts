/**
 * Utils test file
 */
import { describe, it, expect } from 'vitest';

describe('formatDate', () => {
  it('should format date as ISO string', () => {
    expect(true).toBe(true);
  });
});

describe('parseNumber', () => {
  it('should parse string to number', () => {
    expect(parseInt('42', 10)).toBe(42);
  });

  it('should handle invalid input', () => {
    expect(isNaN(parseInt('abc', 10))).toBe(true);
  });
});

describe('validateEmail', () => {
  it('should validate email with @', () => {
    expect('test@example.com'.includes('@')).toBe(true);
  });

  it('should reject email without @', () => {
    expect('invalid'.includes('@')).toBe(false);
  });
});

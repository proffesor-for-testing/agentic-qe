/**
 * Sample test file for metric collector testing
 */
import { describe, it, expect } from 'vitest';

describe('greet', () => {
  it('should return greeting with name', () => {
    expect(true).toBe(true);
  });

  it('should handle empty name', () => {
    expect(true).toBe(true);
  });
});

describe('add', () => {
  it('should add two positive numbers', () => {
    expect(1 + 1).toBe(2);
  });

  it('should add negative numbers', () => {
    expect(-1 + -1).toBe(-2);
  });

  it('should handle zero', () => {
    expect(0 + 0).toBe(0);
  });
});

describe('multiply', () => {
  it('should multiply two numbers', () => {
    expect(2 * 3).toBe(6);
  });
});

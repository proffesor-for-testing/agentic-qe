/**
 * Unit tests for adaptive Ollama timeout sizing (#3). Pure function — no server.
 */

import { describe, it, expect } from 'vitest';

import { computeAdaptiveTimeoutMs, OLLAMA_TIMEOUT } from '../../src/shared/llm/providers/ollama-timeout.js';

describe('computeAdaptiveTimeoutMs', () => {
  it('gives a slower model a longer timeout than a faster one for the same output', () => {
    const slow = computeAdaptiveTimeoutMs(4096, 15);
    const fast = computeAdaptiveTimeoutMs(4096, 90);
    expect(fast).toBeLessThan(slow);
  });

  it('caps the timeout at CEIL_MS for very slow/large generations', () => {
    expect(computeAdaptiveTimeoutMs(8000, 5)).toBe(OLLAMA_TIMEOUT.CEIL_MS);
  });

  it('floors the timeout at FLOOR_MS for tiny generations', () => {
    expect(computeAdaptiveTimeoutMs(10, 90)).toBe(OLLAMA_TIMEOUT.FLOOR_MS);
    expect(computeAdaptiveTimeoutMs(0, 90)).toBe(OLLAMA_TIMEOUT.FLOOR_MS);
  });

  it('falls back to the default throughput for non-positive tok/s', () => {
    expect(computeAdaptiveTimeoutMs(4096, 0)).toBe(computeAdaptiveTimeoutMs(4096));
    expect(computeAdaptiveTimeoutMs(4096, -5)).toBe(computeAdaptiveTimeoutMs(4096));
  });

  it('scales monotonically with the output token cap', () => {
    expect(computeAdaptiveTimeoutMs(2000, 30)).toBeLessThanOrEqual(computeAdaptiveTimeoutMs(4000, 30));
  });
});

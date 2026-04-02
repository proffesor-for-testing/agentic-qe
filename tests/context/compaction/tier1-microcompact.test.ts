/**
 * Tests for Tier1Microcompact bridge (IMP-08)
 */

import { describe, it, expect } from 'vitest';
import { Tier1Microcompact } from '../../../src/context/compaction/tier1-microcompact';
import { MicrocompactEngine } from '../../../src/mcp/middleware/microcompact';

describe('Tier1Microcompact', () => {
  it('should return tier 1 result format', () => {
    const tier1 = new Tier1Microcompact();
    const result = tier1.compact();
    expect(result.tier).toBe(1);
    expect(result).toHaveProperty('tokensSaved');
    expect(result).toHaveProperty('clearedCount');
    expect(result).toHaveProperty('totalTokens');
    expect(result).toHaveProperty('totalResults');
  });

  it('should delegate to MicrocompactEngine', () => {
    // Use a very small context budget so pressure-based eviction kicks in.
    // keepLastN=1 protects only the last entry. contextBudget * threshold = 1 token,
    // so anything above 1 token triggers pressure eviction.
    // Each large result is ~67 tokens (200 chars / 3), sentinel is ~12 tokens.
    const tier1 = new Tier1Microcompact({
      keepLastN: 1,
      contextBudget: 10,
      contextPressureThreshold: 0.1, // ceiling = 1 token
    });
    const engine = tier1.getEngine();

    // Add large entries so clearing them actually saves tokens
    engine.addResult('tool-a', 'x'.repeat(200));
    engine.addResult('tool-b', 'y'.repeat(200));
    engine.addResult('tool-c', 'z'.repeat(200));

    const result = tier1.compact();
    // First 2 entries should be cleared (keepLastN=1 protects only last)
    expect(result.clearedCount).toBe(2);
    expect(result.totalResults).toBe(3);
  });

  it('should construct from existing engine via fromEngine', () => {
    const engine = new MicrocompactEngine({ keepLastN: 1 });
    engine.addResult('tool-x', 'some-result');
    engine.addResult('tool-y', 'another-result');

    const tier1 = Tier1Microcompact.fromEngine(engine);
    expect(tier1.getEngine()).toBe(engine);

    const result = tier1.compact();
    expect(result.tier).toBe(1);
    expect(result.totalResults).toBe(2);
  });

  it('should report zero savings when nothing to compact', () => {
    const tier1 = new Tier1Microcompact();
    const result = tier1.compact();
    expect(result.clearedCount).toBe(0);
    expect(result.tokensSaved).toBe(0);
    expect(result.totalResults).toBe(0);
  });
});

/**
 * IMP-01: Microcompact Engine Tests
 *
 * Verifies age-based eviction, context-pressure eviction, keepLastN protection,
 * token estimation, sentinel replacement, stats tracking, and middleware integration.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MicrocompactEngine,
  createMicrocompactMiddleware,
  estimateTokensPadded,
  type MicrocompactOptions,
  type ToolResultEntry,
} from '../../../src/mcp/middleware/microcompact';
import type { ToolCallContext } from '../../../src/mcp/middleware/middleware-chain';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContext(toolName = 'test_tool'): ToolCallContext {
  return {
    toolName,
    params: {},
    timestamp: Date.now(),
    metadata: {},
  };
}

/** Generate a string payload of roughly `tokenCount` estimated tokens. */
function payloadOfTokens(tokenCount: number): string {
  // estimateTokensPadded uses ceil(chars / 3), so chars ≈ tokenCount * 3
  return 'x'.repeat(tokenCount * 3);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MicrocompactEngine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Token estimation
  // -------------------------------------------------------------------------

  describe('estimateTokensPadded', () => {
    it('should calculate ceil(chars / 3) for strings', () => {
      expect(estimateTokensPadded('abc')).toBe(1);       // 3/3 = 1
      expect(estimateTokensPadded('abcd')).toBe(2);      // ceil(4/3) = 2
      expect(estimateTokensPadded('a')).toBe(1);          // ceil(1/3) = 1
      expect(estimateTokensPadded('')).toBe(0);            // 0/3 = 0
    });

    it('should serialize objects before estimating', () => {
      const obj = { key: 'value' };
      const serialized = JSON.stringify(obj);
      expect(estimateTokensPadded(obj)).toBe(Math.ceil(serialized.length / 3));
    });

    it('should be accessible as a static method', () => {
      expect(MicrocompactEngine.estimateTokensPadded('hello')).toBe(
        Math.ceil('hello'.length / 3),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Age-based eviction
  // -------------------------------------------------------------------------

  describe('age-based eviction', () => {
    it('should clear results older than maxAgeMs but keep last N', () => {
      const engine = new MicrocompactEngine({
        maxAgeMs: 3_600_000, // 60 min
        keepLastN: 5,
      });

      // Add 10 results at time 0
      for (let i = 0; i < 10; i++) {
        engine.addResult(`tool_${i}`, `result_${i}`);
      }

      // Advance 61 minutes
      vi.advanceTimersByTime(61 * 60 * 1000);

      const result = engine.compact();

      // First 5 entries (indices 0-4) should be cleared; last 5 protected
      expect(result.clearedCount).toBe(5);
      expect(result.totalResults).toBe(10);

      const entries = engine.getEntries();
      for (let i = 0; i < 5; i++) {
        expect(entries[i].cleared).toBe(true);
        expect(entries[i].result).toBe('[Old tool result content cleared]');
      }
      for (let i = 5; i < 10; i++) {
        expect(entries[i].cleared).toBe(false);
        expect(entries[i].result).toBe(`result_${i}`);
      }
    });

    it('should not clear any results when all are within maxAgeMs', () => {
      const engine = new MicrocompactEngine({
        maxAgeMs: 3_600_000,
        keepLastN: 5,
      });

      for (let i = 0; i < 10; i++) {
        engine.addResult(`tool_${i}`, `result_${i}`);
      }

      // Only advance 30 minutes — all within window
      vi.advanceTimersByTime(30 * 60 * 1000);

      const result = engine.compact();
      expect(result.clearedCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // keepLastN protection
  // -------------------------------------------------------------------------

  describe('keepLastN protection', () => {
    it('should not clear anything when total results <= keepLastN', () => {
      const engine = new MicrocompactEngine({ keepLastN: 5 });

      engine.addResult('a', 'result_a');
      engine.addResult('b', 'result_b');
      engine.addResult('c', 'result_c');

      // Even after a long time, these 3 are within keepLastN=5
      vi.advanceTimersByTime(2 * 3_600_000);

      const result = engine.compact();
      expect(result.clearedCount).toBe(0);
      expect(result.totalResults).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Context-pressure eviction
  // -------------------------------------------------------------------------

  describe('context-pressure eviction', () => {
    it('should evict oldest non-protected entries under pressure', () => {
      const engine = new MicrocompactEngine({
        maxAgeMs: Number.MAX_SAFE_INTEGER, // disable age-based
        keepLastN: 5,
        contextBudget: 100_000,            // 100k tokens budget
        contextPressureThreshold: 0.8,     // trigger at 80,000 tokens
      });

      // Each payload ≈ 1000 tokens; 100 entries ≈ 100,000 tokens (over 80k threshold)
      for (let i = 0; i < 100; i++) {
        engine.addResult(`tool_${i}`, payloadOfTokens(1000));
      }

      const result = engine.compact();

      // The engine clears entries from oldest until total drops below threshold.
      // It does NOT clear all non-protected — only enough to get under budget.
      expect(result.clearedCount).toBeGreaterThan(0);
      expect(result.totalTokens).toBeLessThanOrEqual(
        100_000 * 0.8 + 1000, // allow one entry's worth of rounding
      );

      // Last 5 entries must always be untouched (keepLastN protection)
      const entries = engine.getEntries();
      for (let i = 95; i < 100; i++) {
        expect(entries[i].cleared).toBe(false);
      }

      // Cleared entries should be at the front (oldest first)
      let sawUncleared = false;
      for (let i = 0; i < 95; i++) {
        if (!entries[i].cleared) {
          sawUncleared = true;
        }
        // Once we see an uncleared entry, all subsequent should also be uncleared
        if (sawUncleared) {
          expect(entries[i].cleared).toBe(false);
        }
      }
    });

    it('should not trigger pressure eviction when under threshold', () => {
      const engine = new MicrocompactEngine({
        maxAgeMs: Number.MAX_SAFE_INTEGER,
        keepLastN: 5,
        contextBudget: 100_000,
        contextPressureThreshold: 0.8,
      });

      // 5 small results — well under 80,000 token threshold
      for (let i = 0; i < 5; i++) {
        engine.addResult(`tool_${i}`, 'small');
      }

      const result = engine.compact();
      expect(result.clearedCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Sentinel replacement
  // -------------------------------------------------------------------------

  describe('sentinel string', () => {
    it('should replace cleared content with the default sentinel', () => {
      const engine = new MicrocompactEngine({ keepLastN: 1 });

      engine.addResult('old', 'old_content');
      engine.addResult('new', 'new_content');

      vi.advanceTimersByTime(2 * 3_600_000);
      engine.compact();

      const entries = engine.getEntries();
      expect(entries[0].result).toBe('[Old tool result content cleared]');
      expect(entries[1].result).toBe('new_content');
    });

    it('should use a custom sentinel when configured', () => {
      const engine = new MicrocompactEngine({
        keepLastN: 1,
        sentinel: '[REDACTED]',
      });

      engine.addResult('old', 'old_content');
      engine.addResult('new', 'new_content');

      vi.advanceTimersByTime(2 * 3_600_000);
      engine.compact();

      expect(engine.getEntries()[0].result).toBe('[REDACTED]');
    });
  });

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  describe('getStats', () => {
    it('should track totalResults, clearedCount, and totalTokens', () => {
      const engine = new MicrocompactEngine({ keepLastN: 2 });

      engine.addResult('a', 'aaa'); // 1 token
      engine.addResult('b', 'bbb'); // 1 token
      engine.addResult('c', 'ccc'); // 1 token

      const before = engine.getStats();
      expect(before.totalResults).toBe(3);
      expect(before.clearedCount).toBe(0);
      expect(before.totalTokens).toBe(3); // each 'aaa' is ceil(3/3) = 1

      // Advance past maxAge
      vi.advanceTimersByTime(2 * 3_600_000);
      engine.compact();

      const after = engine.getStats();
      expect(after.totalResults).toBe(3);
      expect(after.clearedCount).toBe(1); // only index 0 is outside keepLastN=2
      expect(after.totalTokens).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // tokensSaved accuracy
  // -------------------------------------------------------------------------

  describe('tokensSaved', () => {
    it('should report tokens saved from cleared entries', () => {
      const engine = new MicrocompactEngine({ keepLastN: 1 });

      const bigPayload = payloadOfTokens(500); // ~500 tokens
      engine.addResult('big', bigPayload);
      engine.addResult('keep', 'small');

      vi.advanceTimersByTime(2 * 3_600_000);

      const result = engine.compact();
      expect(result.clearedCount).toBe(1);
      expect(result.tokensSaved).toBeGreaterThan(0);
      // tokensSaved = original tokens - sentinel tokens
      const sentinelTokens = estimateTokensPadded('[Old tool result content cleared]');
      expect(result.tokensSaved).toBe(500 - sentinelTokens);
    });
  });

  // -------------------------------------------------------------------------
  // Idempotent compaction
  // -------------------------------------------------------------------------

  describe('idempotent compaction', () => {
    it('should not double-clear already-cleared entries', () => {
      const engine = new MicrocompactEngine({ keepLastN: 1 });

      engine.addResult('a', 'payload_a');
      engine.addResult('b', 'payload_b');

      vi.advanceTimersByTime(2 * 3_600_000);

      const first = engine.compact();
      expect(first.clearedCount).toBe(1);

      const second = engine.compact();
      expect(second.clearedCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Middleware integration
  // -------------------------------------------------------------------------

  describe('createMicrocompactMiddleware', () => {
    it('should create a valid ToolMiddleware with correct name and priority', () => {
      const { middleware: mw, engine } = createMicrocompactMiddleware();

      expect(mw.name).toBe('microcompact');
      expect(mw.priority).toBe(100);
      expect(mw.postToolResult).toBeDefined();
      expect(mw.preToolCall).toBeUndefined();
      expect(mw.onError).toBeUndefined();
      expect(engine).toBeDefined();
    });

    it('should return the result unchanged from postToolResult', async () => {
      const { middleware: mw } = createMicrocompactMiddleware();
      const ctx = createContext('my_tool');
      const originalResult = { data: [1, 2, 3], status: 'ok' };

      const returned = await mw.postToolResult!(ctx, originalResult);
      expect(returned).toBe(originalResult); // identity — same reference
    });

    it('should track results internally without mutating them', async () => {
      const { middleware: mw } = createMicrocompactMiddleware({ keepLastN: 2 });
      const ctx = createContext('tool_a');

      await mw.postToolResult!(ctx, 'first');
      await mw.postToolResult!(ctx, 'second');
      await mw.postToolResult!(ctx, 'third');

      // The middleware returns results as-is; compaction happens on history
      const result = await mw.postToolResult!(ctx, 'fourth');
      expect(result).toBe('fourth');
    });

    it('should expose the engine for sharing with compaction pipeline', () => {
      const { engine } = createMicrocompactMiddleware();
      expect(engine).toBeInstanceOf(MicrocompactEngine);
    });

    describe('kill switch: AQE_MICROCOMPACT=false', () => {
      beforeEach(() => { process.env.AQE_MICROCOMPACT = 'false'; });
      afterEach(() => { delete process.env.AQE_MICROCOMPACT; });

      it('should skip addResult and compact when disabled', async () => {
        const { middleware, engine } = createMicrocompactMiddleware();
        const ctx = createContext();
        const result = await middleware.postToolResult!(ctx, 'test-data');

        expect(result).toBe('test-data');
        expect(engine.getEntries()).toHaveLength(0);
      });
    });
  });
});

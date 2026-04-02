/**
 * Tests for the prompt cache latch field manager (IMP-05).
 *
 * Validates that values are locked after first set and preserved
 * until explicitly reset, preventing cache-busting in API calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PromptCacheLatch } from '../../src/shared/prompt-cache-latch.js';

describe('PromptCacheLatch', () => {
  let latch: PromptCacheLatch;

  beforeEach(() => {
    latch = new PromptCacheLatch();
  });

  // -------------------------------------------------------------------------
  // latch()
  // -------------------------------------------------------------------------

  it('stores a value and returns true on first call', () => {
    const result = latch.latch('system-prompt', 'You are a helpful assistant.');
    expect(result).toBe(true);
    expect(latch.get('system-prompt')).toBe('You are a helpful assistant.');
  });

  it('returns false and preserves original value on re-latch attempt', () => {
    latch.latch('model', 'claude-3-opus');
    const result = latch.latch('model', 'claude-3-sonnet');

    expect(result).toBe(false);
    expect(latch.get('model')).toBe('claude-3-opus');
  });

  // -------------------------------------------------------------------------
  // get()
  // -------------------------------------------------------------------------

  it('retrieves latched value with correct type', () => {
    latch.latch('temperature', 0.7);
    const temp = latch.get<number>('temperature');
    expect(temp).toBe(0.7);
  });

  it('returns undefined for unknown keys', () => {
    expect(latch.get('nonexistent')).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // has()
  // -------------------------------------------------------------------------

  it('returns true for latched keys', () => {
    latch.latch('api-version', '2024-01-01');
    expect(latch.has('api-version')).toBe(true);
  });

  it('returns false for unknown keys', () => {
    expect(latch.has('missing')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // reset()
  // -------------------------------------------------------------------------

  it('allows re-latching with a new value after reset', () => {
    latch.latch('system-prompt', 'original');
    latch.reset('system-prompt');

    expect(latch.has('system-prompt')).toBe(false);

    const result = latch.latch('system-prompt', 'updated');
    expect(result).toBe(true);
    expect(latch.get('system-prompt')).toBe('updated');
  });

  // -------------------------------------------------------------------------
  // resetAll()
  // -------------------------------------------------------------------------

  it('clears all latched values', () => {
    latch.latch('a', 1);
    latch.latch('b', 2);
    latch.latch('c', 3);

    latch.resetAll();

    expect(latch.size).toBe(0);
    expect(latch.has('a')).toBe(false);
    expect(latch.has('b')).toBe(false);
    expect(latch.has('c')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // getSnapshot()
  // -------------------------------------------------------------------------

  it('returns all key-value pairs as a plain object', () => {
    latch.latch('model', 'claude-3-opus');
    latch.latch('temperature', 0.7);

    const snapshot = latch.getSnapshot();
    expect(snapshot).toEqual({
      model: 'claude-3-opus',
      temperature: 0.7,
    });
  });

  // -------------------------------------------------------------------------
  // size
  // -------------------------------------------------------------------------

  it('reflects current latch count', () => {
    expect(latch.size).toBe(0);
    latch.latch('a', 1);
    expect(latch.size).toBe(1);
    latch.latch('b', 2);
    expect(latch.size).toBe(2);
    latch.reset('a');
    expect(latch.size).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Multiple keys
  // -------------------------------------------------------------------------

  it('latches multiple keys independently', () => {
    latch.latch('model', 'claude-3-opus');
    latch.latch('temperature', 0.7);
    latch.latch('max-tokens', 4096);

    // Re-latch attempts should all be no-ops
    expect(latch.latch('model', 'different')).toBe(false);
    expect(latch.latch('temperature', 0.9)).toBe(false);
    expect(latch.latch('max-tokens', 1024)).toBe(false);

    // Original values preserved
    expect(latch.get('model')).toBe('claude-3-opus');
    expect(latch.get('temperature')).toBe(0.7);
    expect(latch.get('max-tokens')).toBe(4096);
  });

  // -------------------------------------------------------------------------
  // Reference semantics
  // -------------------------------------------------------------------------

  it('latches complex objects by reference (not cloned)', () => {
    const headers = { 'x-api-key': 'sk-123', 'anthropic-version': '2024-01-01' };
    latch.latch('headers', headers);

    // Mutating the original object affects the latched value
    headers['x-api-key'] = 'sk-456';
    const retrieved = latch.get<Record<string, string>>('headers');
    expect(retrieved!['x-api-key']).toBe('sk-456');

    // Same reference
    expect(latch.get('headers')).toBe(headers);
  });

  describe('kill switch: AQE_PROMPT_CACHE_LATCH=false', () => {
    it('should always overwrite when disabled', () => {
      process.env.AQE_PROMPT_CACHE_LATCH = 'false';
      const disabledLatch = new PromptCacheLatch();

      expect(disabledLatch.latch('key', 'first')).toBe(true);
      // Normally this would return false (locked). When disabled, it overwrites.
      expect(disabledLatch.latch('key', 'second')).toBe(true);
      expect(disabledLatch.get('key')).toBe('second');

      delete process.env.AQE_PROMPT_CACHE_LATCH;
    });
  });
});

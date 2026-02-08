/**
 * Agentic QE v3 - Loop Detection Unit Tests (ADR-062)
 *
 * Tests for the ToolCallSignatureTracker that detects and steers
 * agents away from repetitive tool call loops using a 3-strike rule.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ToolCallSignatureTracker,
  type LoopDetectionConfig,
  type LoopDetectionResult,
  type ToolCallSignature,
  type LoopDetectionMetrics,
} from '../../../src/kernel/anti-drift-middleware.js';

// ============================================================================
// Test Helpers
// ============================================================================

/** Restore env after each test to prevent leakage. */
function withEnv(key: string, value: string | undefined, fn: () => void): void {
  const original = process.env[key];
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('ToolCallSignatureTracker', () => {
  let tracker: ToolCallSignatureTracker;

  beforeEach(() => {
    // Ensure feature flag is enabled by default
    delete process.env.AQE_LOOP_DETECTION_ENABLED;
    tracker = new ToolCallSignatureTracker();
  });

  afterEach(() => {
    delete process.env.AQE_LOOP_DETECTION_ENABLED;
  });

  // ==========================================================================
  // 3-strike detection
  // ==========================================================================

  describe('3-strike detection with identical tool calls', () => {
    it('should return allow on first call (strike 1)', () => {
      const result = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.action).toBe('allow');
      expect(result.isLoop).toBe(false);
      expect(result.callCount).toBe(1);
    });

    it('should return warn on second identical call (strike 2)', () => {
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      const result = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.action).toBe('warn');
      expect(result.isLoop).toBe(false);
      expect(result.callCount).toBe(2);
    });

    it('should return steer on third identical call (strike 3)', () => {
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      const result = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.action).toBe('steer');
      expect(result.isLoop).toBe(true);
      expect(result.callCount).toBe(3);
    });

    it('should continue returning steer on fourth+ identical call', () => {
      for (let i = 0; i < 3; i++) {
        tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      }
      const result = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.action).toBe('steer');
      expect(result.isLoop).toBe(true);
      expect(result.callCount).toBe(4);
    });
  });

  // ==========================================================================
  // Steering message
  // ==========================================================================

  describe('steering message', () => {
    it('should provide a steering message on strike 3', () => {
      for (let i = 0; i < 2; i++) {
        tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      }
      const result = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.steeringMessage).toBeDefined();
      expect(typeof result.steeringMessage).toBe('string');
      expect(result.steeringMessage!.length).toBeGreaterThan(0);
    });

    it('should use custom steering message when configured', () => {
      const customMessage = 'Stop repeating yourself!';
      const customTracker = new ToolCallSignatureTracker({
        steeringMessage: customMessage,
      });

      for (let i = 0; i < 2; i++) {
        customTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      }
      const result = customTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.steeringMessage).toBe(customMessage);
    });

    it('should not provide a steering message on allow', () => {
      const result = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.steeringMessage).toBeUndefined();
    });
  });

  // ==========================================================================
  // Sliding window expiry
  // ==========================================================================

  describe('sliding window expiry', () => {
    it('should not count calls outside the window', () => {
      // Use a very short window
      const shortWindowTracker = new ToolCallSignatureTracker({
        windowMs: 50, // 50ms window
      });

      shortWindowTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      shortWindowTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      // Wait for window to expire
      const start = Date.now();
      while (Date.now() - start < 60) {
        // busy wait for 60ms
      }

      // This should be strike 1 again (previous calls expired)
      const result = shortWindowTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.action).toBe('allow');
      expect(result.callCount).toBe(1);
    });
  });

  // ==========================================================================
  // Different tool calls
  // ==========================================================================

  describe('different tool calls do not trigger loop', () => {
    it('should not trigger loop for different tool names', () => {
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      tracker.trackCall('agent-1', 'writeFile', { path: '/foo.ts' });
      const result = tracker.trackCall('agent-1', 'deleteFile', { path: '/foo.ts' });

      expect(result.action).toBe('allow');
      expect(result.isLoop).toBe(false);
    });

    it('should not trigger loop for same tool name but different args', () => {
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      tracker.trackCall('agent-1', 'readFile', { path: '/bar.ts' });
      const result = tracker.trackCall('agent-1', 'readFile', { path: '/baz.ts' });

      expect(result.action).toBe('allow');
      expect(result.isLoop).toBe(false);
    });

    it('should track agents independently', () => {
      // Agent 1 makes 2 identical calls
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      // Agent 2 makes 1 call with same signature
      const result = tracker.trackCall('agent-2', 'readFile', { path: '/foo.ts' });

      // Agent 2 should be at strike 1, not strike 3
      expect(result.action).toBe('allow');
      expect(result.callCount).toBe(1);
    });
  });

  // ==========================================================================
  // Action values at appropriate strikes
  // ==========================================================================

  describe('action values at appropriate strikes', () => {
    it('should return allow, warn, steer in sequence for identical calls', () => {
      const r1 = tracker.trackCall('agent-1', 'search', { query: 'test' });
      expect(r1.action).toBe('allow');

      const r2 = tracker.trackCall('agent-1', 'search', { query: 'test' });
      expect(r2.action).toBe('warn');

      const r3 = tracker.trackCall('agent-1', 'search', { query: 'test' });
      expect(r3.action).toBe('steer');
    });

    it('should work with custom maxIdenticalCalls', () => {
      const customTracker = new ToolCallSignatureTracker({
        maxIdenticalCalls: 5,
      });

      // Calls 1-3 should be allow
      for (let i = 0; i < 3; i++) {
        const r = customTracker.trackCall('agent-1', 'search', { query: 'test' });
        expect(r.action).toBe('allow');
      }

      // Call 4 should be warn (maxIdenticalCalls - 1)
      const r4 = customTracker.trackCall('agent-1', 'search', { query: 'test' });
      expect(r4.action).toBe('warn');

      // Call 5 should be steer
      const r5 = customTracker.trackCall('agent-1', 'search', { query: 'test' });
      expect(r5.action).toBe('steer');
    });
  });

  // ==========================================================================
  // Feature flag
  // ==========================================================================

  describe('feature flag', () => {
    it('should always return allow when feature flag is disabled', () => {
      withEnv('AQE_LOOP_DETECTION_ENABLED', 'false', () => {
        const flagTracker = new ToolCallSignatureTracker();

        // Make 5 identical calls - should all be allowed
        for (let i = 0; i < 5; i++) {
          const result = flagTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
          expect(result.action).toBe('allow');
          expect(result.isLoop).toBe(false);
        }
      });
    });

    it('should still return a valid signature when feature flag is disabled', () => {
      withEnv('AQE_LOOP_DETECTION_ENABLED', 'false', () => {
        const flagTracker = new ToolCallSignatureTracker();
        const result = flagTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

        expect(result.signature).toBeDefined();
        expect(result.signature.hash).toBeDefined();
        expect(result.signature.toolName).toBe('readFile');
        expect(typeof result.signature.argsFingerprint).toBe('string');
      });
    });

    it('should detect loops when feature flag is not set (default enabled)', () => {
      delete process.env.AQE_LOOP_DETECTION_ENABLED;
      const flagTracker = new ToolCallSignatureTracker();

      flagTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      flagTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      const result = flagTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(result.action).toBe('steer');
      expect(result.isLoop).toBe(true);
    });

    it('should detect loops when feature flag is set to true', () => {
      withEnv('AQE_LOOP_DETECTION_ENABLED', 'true', () => {
        const flagTracker = new ToolCallSignatureTracker();

        flagTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
        flagTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
        const result = flagTracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

        expect(result.action).toBe('steer');
        expect(result.isLoop).toBe(true);
      });
    });
  });

  // ==========================================================================
  // Metrics
  // ==========================================================================

  describe('getMetrics', () => {
    it('should return zero counts initially', () => {
      const metrics = tracker.getMetrics();

      expect(metrics.totalCallsTracked).toBe(0);
      expect(metrics.loopsDetected).toBe(0);
    });

    it('should track total calls correctly', () => {
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      tracker.trackCall('agent-1', 'writeFile', { path: '/bar.ts' });
      tracker.trackCall('agent-2', 'search', { query: 'test' });

      const metrics = tracker.getMetrics();
      expect(metrics.totalCallsTracked).toBe(3);
    });

    it('should track loops detected correctly', () => {
      // Trigger 1 loop (3 identical calls)
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      const metrics = tracker.getMetrics();
      expect(metrics.loopsDetected).toBe(1);
    });

    it('should count subsequent identical calls as additional loops', () => {
      // 4 identical calls = 2 loop detections (strike 3 and strike 4)
      for (let i = 0; i < 4; i++) {
        tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      }

      const metrics = tracker.getMetrics();
      expect(metrics.loopsDetected).toBe(2);
      expect(metrics.totalCallsTracked).toBe(4);
    });
  });

  // ==========================================================================
  // Signature generation
  // ==========================================================================

  describe('signature generation', () => {
    it('should produce consistent hashes for identical inputs', () => {
      const r1 = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      const r2 = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      expect(r1.signature.hash).toBe(r2.signature.hash);
      expect(r1.signature.argsFingerprint).toBe(r2.signature.argsFingerprint);
    });

    it('should produce different hashes for different tool names', () => {
      const r1 = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      const r2 = tracker.trackCall('agent-1', 'writeFile', { path: '/foo.ts' });

      expect(r1.signature.hash).not.toBe(r2.signature.hash);
    });

    it('should produce different hashes for different args', () => {
      const r1 = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      const r2 = tracker.trackCall('agent-1', 'readFile', { path: '/bar.ts' });

      expect(r1.signature.hash).not.toBe(r2.signature.hash);
      expect(r1.signature.argsFingerprint).not.toBe(r2.signature.argsFingerprint);
    });

    it('should include toolName in the signature', () => {
      const result = tracker.trackCall('agent-1', 'myTool', { x: 1 });

      expect(result.signature.toolName).toBe('myTool');
    });

    it('should handle null/undefined args gracefully', () => {
      const r1 = tracker.trackCall('agent-1', 'ping', null);
      const r2 = tracker.trackCall('agent-1', 'ping', undefined);

      expect(r1.signature.hash).toBeDefined();
      expect(r2.signature.hash).toBeDefined();
    });
  });

  // ==========================================================================
  // Clear
  // ==========================================================================

  describe('clear', () => {
    it('should reset all state', () => {
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });

      tracker.clear();

      const metrics = tracker.getMetrics();
      expect(metrics.totalCallsTracked).toBe(0);
      expect(metrics.loopsDetected).toBe(0);

      // After clear, first call should be allow again
      const result = tracker.trackCall('agent-1', 'readFile', { path: '/foo.ts' });
      expect(result.action).toBe('allow');
      expect(result.callCount).toBe(1);
    });
  });
});

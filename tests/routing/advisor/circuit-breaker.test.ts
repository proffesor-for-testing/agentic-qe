/**
 * Advisor Circuit Breaker Tests (ADR-092)
 * Tests file-based persistence across process invocations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  AdvisorCircuitBreaker,
  AdvisorCircuitBreakerError,
} from '../../../src/routing/advisor/circuit-breaker.js';

describe('AdvisorCircuitBreaker', () => {
  let tmpDir: string;
  let statePath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'aqe-cb-'));
    statePath = join(tmpDir, 'circuit-breaker.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('acquire()', () => {
    it('allows calls up to the max', () => {
      const breaker = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });

      const s1 = breaker.acquire('session-1');
      expect(s1.callCount).toBe(1);
      expect(s1.remaining).toBe(2);
      expect(s1.tripped).toBe(false);

      const s2 = breaker.acquire('session-1');
      expect(s2.callCount).toBe(2);
      expect(s2.remaining).toBe(1);

      const s3 = breaker.acquire('session-1');
      expect(s3.callCount).toBe(3);
      expect(s3.remaining).toBe(0);
    });

    it('trips on the call that exceeds the max', () => {
      const breaker = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      breaker.acquire('s');
      breaker.acquire('s');
      breaker.acquire('s');

      expect(() => breaker.acquire('s')).toThrow(AdvisorCircuitBreakerError);
    });

    it('sets exit code 3 on trip', () => {
      const breaker = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      breaker.acquire('s');
      breaker.acquire('s');
      breaker.acquire('s');

      try {
        breaker.acquire('s');
        expect.fail('should have thrown');
      } catch (e) {
        const err = e as AdvisorCircuitBreakerError;
        expect(err.exitCode).toBe(3);
        expect(err.sessionId).toBe('s');
        expect(err.callCount).toBe(3);
        expect(err.maxCalls).toBe(3);
      }
    });

    it('tracks sessions independently', () => {
      const breaker = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      breaker.acquire('a');
      breaker.acquire('a');
      breaker.acquire('a');

      const sb = breaker.acquire('b');
      expect(sb.callCount).toBe(1);
      expect(sb.remaining).toBe(2);
    });
  });

  describe('file-based persistence (H4 fix)', () => {
    it('survives across separate breaker instances sharing the same state file', () => {
      const breaker1 = new AdvisorCircuitBreaker({ maxCallsPerSession: 5, statePath });
      breaker1.acquire('session-x');
      breaker1.acquire('session-x');

      // Simulate a new CLI invocation by creating a new instance
      const breaker2 = new AdvisorCircuitBreaker({ maxCallsPerSession: 5, statePath });
      const state = breaker2.getState('session-x');
      expect(state.callCount).toBe(2);
      expect(state.remaining).toBe(3);

      breaker2.acquire('session-x');
      expect(breaker2.getState('session-x').callCount).toBe(3);
    });

    it('trips across process boundaries', () => {
      const breaker1 = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      breaker1.acquire('s');
      breaker1.acquire('s');
      breaker1.acquire('s');

      const breaker2 = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      expect(() => breaker2.acquire('s')).toThrow(AdvisorCircuitBreakerError);
    });
  });

  describe('getState()', () => {
    it('returns zero state for unknown sessions', () => {
      const breaker = new AdvisorCircuitBreaker({ statePath });
      const state = breaker.getState('unknown');
      expect(state.callCount).toBe(0);
      expect(state.remaining).toBe(10);
      expect(state.tripped).toBe(false);
    });

    it('reflects tripped state without incrementing', () => {
      const breaker = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      breaker.acquire('s');
      breaker.acquire('s');
      breaker.acquire('s');

      const state = breaker.getState('s');
      expect(state.callCount).toBe(3);
      expect(state.remaining).toBe(0);
      expect(state.tripped).toBe(true);
    });
  });

  describe('reset()', () => {
    it('resets a specific session', () => {
      const breaker = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      breaker.acquire('a');
      breaker.acquire('a');
      breaker.reset('a');

      expect(breaker.getState('a').callCount).toBe(0);
    });

    it('resets all sessions when no ID given', () => {
      const breaker = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      breaker.acquire('a');
      breaker.acquire('b');
      breaker.reset();

      expect(breaker.getState('a').callCount).toBe(0);
      expect(breaker.getState('b').callCount).toBe(0);
    });

    it('persists reset to disk', () => {
      const breaker1 = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      breaker1.acquire('a');
      breaker1.acquire('a');
      breaker1.reset('a');

      const breaker2 = new AdvisorCircuitBreaker({ maxCallsPerSession: 3, statePath });
      expect(breaker2.getState('a').callCount).toBe(0);
    });
  });

  describe('default config', () => {
    it('defaults to 10 calls per session', () => {
      const breaker = new AdvisorCircuitBreaker({ statePath });
      for (let i = 0; i < 10; i++) {
        breaker.acquire('s');
      }
      expect(() => breaker.acquire('s')).toThrow(AdvisorCircuitBreakerError);
    });
  });
});

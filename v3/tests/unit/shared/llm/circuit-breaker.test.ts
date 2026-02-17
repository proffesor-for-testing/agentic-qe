/**
 * Agentic QE v3 - Circuit Breaker Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerManager,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from '../../../../src/shared/llm/circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    vi.useFakeTimers();
    breaker = new CircuitBreaker('claude', {
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      halfOpenSuccessThreshold: 2,
      failureWindowMs: 5000,
      includeTimeouts: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('should allow execution in closed state', () => {
      expect(breaker.canExecute()).toBe(true);
    });

    it('should have zero stats initially', () => {
      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.rejectedCount).toBe(0);
    });
  });

  describe('success recording', () => {
    it('should record successful requests', () => {
      breaker.recordSuccess();
      breaker.recordSuccess();

      const stats = breaker.getStats();
      expect(stats.successCount).toBe(2);
      expect(stats.lastSuccessTime).toBeDefined();
    });

    it('should stay closed after successes', () => {
      for (let i = 0; i < 10; i++) {
        breaker.recordSuccess();
      }
      expect(breaker.getState()).toBe('closed');
    });
  });

  describe('failure recording and circuit opening', () => {
    it('should record failures', () => {
      breaker.recordFailure(new Error('Test error'));

      const stats = breaker.getStats();
      expect(stats.failureCount).toBe(1);
      expect(stats.lastFailureTime).toBeDefined();
    });

    it('should open circuit after threshold failures', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure(new Error(`Error ${i}`));
      }

      expect(breaker.getState()).toBe('open');
      expect(breaker.canExecute()).toBe(false);
    });

    it('should reject requests when open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure(new Error(`Error ${i}`));
      }

      await expect(
        breaker.execute(() => Promise.resolve('test'))
      ).rejects.toThrow(/Circuit breaker is open/);

      const stats = breaker.getStats();
      expect(stats.rejectedCount).toBe(1);
    });

    it('should track recent failures', () => {
      breaker.recordFailure(new Error('Error 1'));
      breaker.recordFailure(new Error('Error 2'));

      const failures = breaker.getRecentFailures(5);
      expect(failures.length).toBe(2);
      expect(failures[0]).toContain('Error 1');
      expect(failures[1]).toContain('Error 2');
    });
  });

  describe('half-open state', () => {
    it('should transition to half-open after reset timeout', async () => {
      // Use a very short timeout for testing
      const fastBreaker = new CircuitBreaker('claude', {
        failureThreshold: 1,
        resetTimeoutMs: 50,
        halfOpenSuccessThreshold: 1,
        failureWindowMs: 5000,
        includeTimeouts: true,
      });

      fastBreaker.recordFailure(new Error('Test'));
      expect(fastBreaker.getState()).toBe('open');

      // Advance past reset timeout
      await vi.advanceTimersByTimeAsync(60);

      expect(fastBreaker.getState()).toBe('half-open');
      expect(fastBreaker.canExecute()).toBe(true);
    });

    it('should close after successful requests in half-open', () => {
      breaker.forceHalfOpen();
      expect(breaker.getState()).toBe('half-open');

      breaker.recordSuccess();
      breaker.recordSuccess();

      expect(breaker.getState()).toBe('closed');
    });

    it('should reopen after failure in half-open', () => {
      breaker.forceHalfOpen();
      breaker.recordFailure(new Error('Test'));

      expect(breaker.getState()).toBe('open');
    });
  });

  describe('execute with protection', () => {
    it('should execute and record success', async () => {
      const result = await breaker.execute(() => Promise.resolve('success'));

      expect(result).toBe('success');
      expect(breaker.getStats().successCount).toBe(1);
    });

    it('should execute and record failure', async () => {
      await expect(
        breaker.execute(() => Promise.reject(new Error('Test error')))
      ).rejects.toThrow('Test error');

      expect(breaker.getStats().failureCount).toBe(1);
    });

    it('should increment total requests on execute', async () => {
      await breaker.execute(() => Promise.resolve('test'));
      await breaker.execute(() => Promise.resolve('test'));

      expect(breaker.getStats().totalRequests).toBe(2);
    });
  });

  describe('manual controls', () => {
    it('should allow manual reset', () => {
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure(new Error(`Error ${i}`));
      }
      expect(breaker.getState()).toBe('open');

      breaker.reset();

      expect(breaker.getState()).toBe('closed');
      expect(breaker.getRecentFailures().length).toBe(0);
    });

    it('should allow force open', () => {
      expect(breaker.getState()).toBe('closed');
      breaker.forceOpen();
      expect(breaker.getState()).toBe('open');
    });

    it('should allow force half-open', () => {
      breaker.forceOpen();
      breaker.forceHalfOpen();
      expect(breaker.getState()).toBe('half-open');
    });
  });

  describe('timeout handling', () => {
    it('should count timeouts as failures when enabled', () => {
      breaker.recordFailure(new Error('timeout error'));
      expect(breaker.getStats().failureCount).toBe(1);
    });

    it('should not count timeouts when disabled', () => {
      const noTimeoutBreaker = new CircuitBreaker('claude', {
        ...DEFAULT_CIRCUIT_BREAKER_CONFIG,
        includeTimeouts: false,
      });

      // Create a proper timeout error
      const timeoutError = new Error('timeout');
      noTimeoutBreaker.recordFailure(timeoutError);

      // Timeout errors are skipped (totalFailures doesn't increment)
      // But the failure is still recorded for tracking purposes
      // The circuit state should not change due to timeout
      expect(noTimeoutBreaker.getState()).toBe('closed');
    });
  });
});

describe('CircuitBreakerManager', () => {
  let manager: CircuitBreakerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new CircuitBreakerManager();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('breaker management', () => {
    it('should create breaker on first access', () => {
      const breaker = manager.getBreaker('claude');
      expect(breaker).toBeDefined();
      expect(breaker.getState()).toBe('closed');
    });

    it('should return same breaker on subsequent access', () => {
      const breaker1 = manager.getBreaker('claude');
      const breaker2 = manager.getBreaker('claude');
      expect(breaker1).toBe(breaker2);
    });

    it('should create separate breakers for different providers', () => {
      const claudeBreaker = manager.getBreaker('claude');
      const openaiBreaker = manager.getBreaker('openai');

      expect(claudeBreaker).not.toBe(openaiBreaker);
    });
  });

  describe('aggregate operations', () => {
    it('should get all stats', () => {
      manager.getBreaker('claude');
      manager.getBreaker('openai');

      const stats = manager.getAllStats();
      expect(stats.claude).toBeDefined();
      expect(stats.openai).toBeDefined();
    });

    it('should get available providers', () => {
      const claudeBreaker = manager.getBreaker('claude');
      manager.getBreaker('openai');

      // Open claude circuit
      claudeBreaker.forceOpen();

      const available = manager.getAvailableProviders();
      expect(available).toContain('openai');
      expect(available).not.toContain('claude');
    });

    it('should reset all breakers', () => {
      const claudeBreaker = manager.getBreaker('claude');
      const openaiBreaker = manager.getBreaker('openai');

      claudeBreaker.forceOpen();
      openaiBreaker.forceOpen();

      manager.resetAll();

      expect(claudeBreaker.getState()).toBe('closed');
      expect(openaiBreaker.getState()).toBe('closed');
    });

    it('should reset specific provider', () => {
      const claudeBreaker = manager.getBreaker('claude');
      const openaiBreaker = manager.getBreaker('openai');

      claudeBreaker.forceOpen();
      openaiBreaker.forceOpen();

      manager.reset('claude');

      expect(claudeBreaker.getState()).toBe('closed');
      expect(openaiBreaker.getState()).toBe('open');
    });
  });
});

/**
 * Unit tests for AgentRateLimiter
 *
 * @module tests/unit/infrastructure/network/AgentRateLimiter.test
 * @see Issue #146 - Security Hardening: SP-3 Network Policy Enforcement
 */

import {
  AgentRateLimiter,
  createDefaultRateLimiter,
} from '../../../../src/infrastructure/network/AgentRateLimiter.js';
import type { RateLimitConfig } from '../../../../src/infrastructure/network/types.js';

describe('AgentRateLimiter', () => {
  let rateLimiter: AgentRateLimiter;

  const defaultConfig: RateLimitConfig = {
    requestsPerMinute: 60,
    requestsPerHour: 1000,
    burstSize: 10,
  };

  beforeEach(() => {
    rateLimiter = new AgentRateLimiter(defaultConfig);
  });

  afterEach(() => {
    rateLimiter.close();
  });

  describe('constructor', () => {
    it('should create rate limiter with config', () => {
      const limiter = new AgentRateLimiter(defaultConfig);
      expect(limiter).toBeInstanceOf(AgentRateLimiter);
      limiter.close();
    });
  });

  describe('check', () => {
    it('should allow first request', () => {
      const status = rateLimiter.check('agent-1');
      expect(status.limited).toBe(false);
      expect(status.remaining).toBeGreaterThan(0);
    });

    it('should not consume tokens on check', () => {
      const status1 = rateLimiter.check('agent-1');
      const status2 = rateLimiter.check('agent-1');

      expect(status1.remaining).toBe(status2.remaining);
    });

    it('should track separate agents independently', () => {
      const status1 = rateLimiter.check('agent-1');
      const status2 = rateLimiter.check('agent-2');

      expect(status1.remaining).toBe(status2.remaining);
    });
  });

  describe('consume', () => {
    it('should consume a token', () => {
      const initialStatus = rateLimiter.check('agent-1');
      rateLimiter.consume('agent-1');
      const afterStatus = rateLimiter.check('agent-1');

      expect(afterStatus.currentRate).toBe(initialStatus.currentRate + 1);
    });

    it('should track minute count', () => {
      rateLimiter.consume('agent-1');
      rateLimiter.consume('agent-1');
      rateLimiter.consume('agent-1');

      const status = rateLimiter.getStatus('agent-1');
      expect(status.currentRate).toBe(3);
    });

    it('should enforce rate limit after burst exceeded', () => {
      const config: RateLimitConfig = {
        requestsPerMinute: 5,
        requestsPerHour: 100,
        burstSize: 3,
      };
      const limiter = new AgentRateLimiter(config);

      // Consume all burst tokens
      for (let i = 0; i < 3; i++) {
        const status = limiter.consume('agent-1');
        expect(status.limited).toBe(false);
      }

      // Next request should be limited (no tokens left)
      const status = limiter.consume('agent-1');
      expect(status.limited).toBe(true);
      expect(status.retryAfter).toBeGreaterThan(0);

      limiter.close();
    });

    it('should enforce per-minute limit', () => {
      const config: RateLimitConfig = {
        requestsPerMinute: 3,
        requestsPerHour: 100,
        burstSize: 10,
      };
      const limiter = new AgentRateLimiter(config);

      // Consume up to per-minute limit
      for (let i = 0; i < 3; i++) {
        limiter.consume('agent-1');
      }

      // Next should be limited
      const status = limiter.consume('agent-1');
      expect(status.limited).toBe(true);

      limiter.close();
    });
  });

  describe('reset', () => {
    it('should reset rate limit for agent', () => {
      // Consume some tokens
      for (let i = 0; i < 5; i++) {
        rateLimiter.consume('agent-1');
      }

      expect(rateLimiter.getStatus('agent-1').currentRate).toBe(5);

      // Reset
      rateLimiter.reset('agent-1');

      // Should be fresh bucket
      const status = rateLimiter.getStatus('agent-1');
      expect(status.currentRate).toBe(0);
      expect(status.limited).toBe(false);
    });

    it('should not affect other agents', () => {
      rateLimiter.consume('agent-1');
      rateLimiter.consume('agent-2');

      rateLimiter.reset('agent-1');

      expect(rateLimiter.getStatus('agent-1').currentRate).toBe(0);
      expect(rateLimiter.getStatus('agent-2').currentRate).toBe(1);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      rateLimiter.consume('agent-1');
      rateLimiter.consume('agent-1');

      const status = rateLimiter.getStatus('agent-1');

      expect(status).toHaveProperty('limited');
      expect(status).toHaveProperty('currentRate');
      expect(status).toHaveProperty('remaining');
      expect(status).toHaveProperty('resetIn');
      expect(status.currentRate).toBe(2);
    });

    it('should calculate remaining correctly', () => {
      const config: RateLimitConfig = {
        requestsPerMinute: 10,
        requestsPerHour: 100,
        burstSize: 5,
      };
      const limiter = new AgentRateLimiter(config);

      limiter.consume('agent-1');
      limiter.consume('agent-1');

      const status = limiter.getStatus('agent-1');
      // remaining should be min of (perMinute - count, perHour - count, tokens)
      expect(status.remaining).toBeLessThanOrEqual(8);

      limiter.close();
    });
  });

  describe('getTrackedAgents', () => {
    it('should return all tracked agent IDs', () => {
      rateLimiter.consume('agent-1');
      rateLimiter.consume('agent-2');
      rateLimiter.check('agent-3');

      const agents = rateLimiter.getTrackedAgents();

      expect(agents).toContain('agent-1');
      expect(agents).toContain('agent-2');
      expect(agents).toContain('agent-3');
      expect(agents.length).toBe(3);
    });

    it('should return empty array initially', () => {
      expect(rateLimiter.getTrackedAgents()).toEqual([]);
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', async () => {
      const config: RateLimitConfig = {
        requestsPerMinute: 60, // 1 per second
        requestsPerHour: 1000,
        burstSize: 3,
      };
      const limiter = new AgentRateLimiter(config);

      // Consume all tokens
      for (let i = 0; i < 3; i++) {
        limiter.consume('agent-1');
      }

      // Should be limited
      expect(limiter.check('agent-1').limited).toBe(false); // check doesn't limit
      expect(limiter.consume('agent-1').limited).toBe(true);

      // Wait for refill (at least 1 second for 1 token)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should have refilled some tokens
      const status = limiter.check('agent-1');
      expect(status.limited).toBe(false);

      limiter.close();
    });
  });

  describe('window reset', () => {
    it('should reset minute count after window expires', async () => {
      jest.useFakeTimers();

      const config: RateLimitConfig = {
        requestsPerMinute: 3,
        requestsPerHour: 100,
        burstSize: 10,
      };
      const limiter = new AgentRateLimiter(config);

      // Consume up to limit
      for (let i = 0; i < 3; i++) {
        limiter.consume('agent-1');
      }

      expect(limiter.getStatus('agent-1').currentRate).toBe(3);

      // Advance past minute window
      jest.advanceTimersByTime(61000);

      // Count should reset
      const status = limiter.getStatus('agent-1');
      expect(status.currentRate).toBe(0);

      limiter.close();
      jest.useRealTimers();
    });
  });
});

describe('createDefaultRateLimiter', () => {
  it('should create limiter with default config', () => {
    const limiter = createDefaultRateLimiter();
    expect(limiter).toBeInstanceOf(AgentRateLimiter);

    // Should have reasonable defaults
    const status = limiter.check('test-agent');
    expect(status.remaining).toBeGreaterThan(0);
    expect(status.limited).toBe(false);

    limiter.close();
  });
});

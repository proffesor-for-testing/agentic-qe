/**
 * chaos/chaos-inject-failure Test Suite
 *
 * Tests for controlled failure injection in chaos engineering.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  chaosInjectFailure,
  getActiveFailureInjections,
  cleanupExpiredFailureInjections,
  type ChaosFailureConfig,
  type ChaosInjectionResult,
} from '@mcp/handlers/chaos';

describe('ChaosInjectFailure', () => {
  beforeEach(() => {
    // Clean up any active injections before each test
    jest.clearAllMocks();
  });

  describe('Section 1: HTTP Error Injection', () => {
    it('should inject HTTP 500 error successfully', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/users',
        failureType: 'http_error',
        httpErrorCode: 500,
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com', 'service.example.com'],
        },
        duration: 5000,
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.injectionId).toBeDefined();
      expect(result.target).toBe('https://api.example.com/users');
      expect(result.failureType).toBe('http_error');
      expect(result.affectedEndpoints).toContain('https://api.example.com/users');
      expect(result.blastRadiusImpact).toBeDefined();
      expect(result.blastRadiusImpact!.percentage).toBe(50);
      expect(result.metadata?.httpErrorCode).toBe(500);
    });

    it('should inject HTTP 503 Service Unavailable error', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/orders',
        failureType: 'http_error',
        httpErrorCode: 503,
        failureRate: 0.8,
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
        duration: 3000,
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureRate).toBe(0.8);
      expect(result.metadata?.httpErrorCode).toBe(503);
    });

    it('should inject HTTP 429 Too Many Requests error', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/rate-limited',
        failureType: 'http_error',
        httpErrorCode: 429,
        blastRadius: {
          percentage: 25,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.httpErrorCode).toBe(429);
    });

    it('should reject invalid HTTP error code', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/invalid',
        failureType: 'http_error',
        httpErrorCode: 999, // Invalid
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid HTTP error code');
    });
  });

  describe('Section 2: Timeout Injection', () => {
    it('should inject timeout failure', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/slow',
        failureType: 'timeout',
        timeoutMs: 30000,
        failureRate: 1.0,
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
        duration: 5000,
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('timeout');
      expect(result.timeoutMs).toBe(30000);
      expect(result.failureRate).toBe(1.0);
    });

    it('should inject timeout with 50% failure rate', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/flaky',
        failureType: 'timeout',
        timeoutMs: 15000,
        failureRate: 0.5,
        blastRadius: {
          percentage: 75,
          targetServices: ['api.example.com', 'backup.example.com'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureRate).toBe(0.5);
      expect(result.blastRadiusImpact!.percentage).toBe(75);
    });
  });

  describe('Section 3: Connection Failures', () => {
    it('should inject connection refused failure', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/unreachable',
        failureType: 'connection_refused',
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
        duration: 10000,
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('connection_refused');
      expect(result.metadata?.injectionMethod).toBe('interceptor');
    });

    it('should inject DNS failure', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://nonexistent.example.com/api',
        failureType: 'dns_failure',
        blastRadius: {
          percentage: 100,
          targetServices: ['nonexistent.example.com'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('dns_failure');
    });

    it('should inject partial response failure', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/streaming',
        failureType: 'partial_response',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('partial_response');
    });
  });

  describe('Section 4: Combined Failure Types', () => {
    it('should inject combined failures (http_error + timeout)', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/complex',
        failureType: 'combined',
        failureTypes: ['http_error', 'timeout'],
        httpErrorCode: 500,
        timeoutMs: 10000,
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('combined');
      expect(result.metadata?.failureTypes).toEqual(['http_error', 'timeout']);
    });

    it('should inject combined network failures', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/network',
        failureType: 'combined',
        failureTypes: ['connection_refused', 'dns_failure', 'timeout'],
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.metadata?.failureTypes).toHaveLength(3);
    });
  });

  describe('Section 5: Blast Radius Control', () => {
    it('should affect 50% of target services', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/multi',
        failureType: 'http_error',
        httpErrorCode: 500,
        blastRadius: {
          percentage: 50,
          targetServices: ['service1', 'service2', 'service3', 'service4'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact!.targetedCount).toBe(4);
      expect(result.blastRadiusImpact!.affectedCount).toBe(2);
      expect(result.blastRadiusImpact!.percentage).toBe(50);
    });

    it('should affect 25% of target services', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/selective',
        failureType: 'timeout',
        timeoutMs: 5000,
        blastRadius: {
          percentage: 25,
          targetServices: ['svc1', 'svc2', 'svc3', 'svc4'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact!.affectedCount).toBe(1);
    });

    it('should affect 100% of target services', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/all',
        failureType: 'connection_refused',
        blastRadius: {
          percentage: 100,
          targetServices: ['api1', 'api2', 'api3'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact!.affectedCount).toBe(3);
    });
  });

  describe('Section 6: Rollback and Cleanup', () => {
    it('should rollback failure injection', async () => {
      // First inject failure
      const injectConfig: ChaosFailureConfig = {
        target: 'https://api.example.com/rollback',
        failureType: 'http_error',
        httpErrorCode: 500,
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        duration: 60000, // Long duration
      };

      const injectResult = await chaosInjectFailure(injectConfig);
      expect(injectResult.success).toBe(true);
      const injectionId = injectResult.injectionId;

      // Then rollback
      const rollbackConfig: ChaosFailureConfig = {
        target: 'https://api.example.com/rollback',
        failureType: 'http_error',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        rollback: true,
        injectionId,
      };

      const rollbackResult = await chaosInjectFailure(rollbackConfig);
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.rolledBack).toBe(true);
      expect(rollbackResult.injectionId).toBe(injectionId);
    });

    it('should auto-rollback after duration expires', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/auto-rollback',
        failureType: 'timeout',
        timeoutMs: 5000,
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
        duration: 100, // Very short duration
      };

      const result = await chaosInjectFailure(config);
      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeDefined();

      // Wait for auto-rollback
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify injection is no longer active
      const activeInjections = getActiveFailureInjections();
      const stillActive = activeInjections.find((inj) => inj.injectionId === result.injectionId);
      expect(stillActive).toBeUndefined();
    });
  });

  describe('Section 7: Input Validation', () => {
    it('should reject invalid target URL', async () => {
      const config: ChaosFailureConfig = {
        target: 'not-a-valid-url',
        failureType: 'http_error',
        httpErrorCode: 500,
        blastRadius: {
          percentage: 50,
          targetServices: ['test'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid target URL');
    });

    it('should reject invalid blast radius percentage', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/test',
        failureType: 'http_error',
        httpErrorCode: 500,
        blastRadius: {
          percentage: 150, // Invalid
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blast radius percentage must be between 0 and 100');
    });

    it('should reject invalid failure rate', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/test',
        failureType: 'timeout',
        timeoutMs: 5000,
        failureRate: 1.5, // Invalid
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failure rate must be between 0 and 1');
    });
  });

  describe('Section 8: Active Injection Tracking', () => {
    it('should track active failure injections', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/tracked',
        failureType: 'http_error',
        httpErrorCode: 503,
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        duration: 30000,
      };

      const result = await chaosInjectFailure(config);
      expect(result.success).toBe(true);

      const activeInjections = getActiveFailureInjections();
      const found = activeInjections.find((inj) => inj.injectionId === result.injectionId);

      expect(found).toBeDefined();
      expect(found!.type).toBe('failure');
      expect(found!.active).toBe(true);
      expect(found!.target).toBe('https://api.example.com/tracked');
    });

    it('should list multiple active injections', async () => {
      const configs: ChaosFailureConfig[] = [
        {
          target: 'https://api1.example.com/test',
          failureType: 'http_error',
          httpErrorCode: 500,
          blastRadius: { percentage: 50, targetServices: ['api1.example.com'] },
          duration: 30000,
        },
        {
          target: 'https://api2.example.com/test',
          failureType: 'timeout',
          timeoutMs: 10000,
          blastRadius: { percentage: 50, targetServices: ['api2.example.com'] },
          duration: 30000,
        },
      ];

      const results = await Promise.all(configs.map((config) => chaosInjectFailure(config)));
      results.forEach((result) => expect(result.success).toBe(true));

      const activeInjections = getActiveFailureInjections();
      expect(activeInjections.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Section 9: Concurrent Injection Handling', () => {
    it('should handle concurrent failure injections', async () => {
      const configs: ChaosFailureConfig[] = Array.from({ length: 5 }, (_, i) => ({
        target: `https://api${i}.example.com/concurrent`,
        failureType: 'http_error' as const,
        httpErrorCode: 500,
        blastRadius: {
          percentage: 50,
          targetServices: [`api${i}.example.com`],
        },
        duration: 5000,
      }));

      const results = await Promise.all(configs.map((config) => chaosInjectFailure(config)));

      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.injectionId).toBeDefined();
      });

      // All injections should have unique IDs
      const uniqueIds = new Set(results.map((r) => r.injectionId));
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('Section 10: Metadata and Reporting', () => {
    it('should include complete metadata in results', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/metadata',
        failureType: 'http_error',
        httpErrorCode: 503,
        failureRate: 0.9,
        blastRadius: {
          percentage: 75,
          targetServices: ['api.example.com', 'backup.example.com'],
        },
        duration: 10000,
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.injectedAt).toBeInstanceOf(Date);
      expect(result.metadata!.injectionMethod).toBe('interceptor');
      expect(result.metadata!.targetType).toBe('http');
      expect(result.metadata!.httpErrorCode).toBe(503);
    });

    it('should calculate blast radius impact correctly', async () => {
      const config: ChaosFailureConfig = {
        target: 'https://api.example.com/impact',
        failureType: 'timeout',
        timeoutMs: 15000,
        blastRadius: {
          percentage: 60,
          targetServices: ['svc1', 'svc2', 'svc3', 'svc4', 'svc5'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact).toBeDefined();
      expect(result.blastRadiusImpact!.targetedCount).toBe(5);
      expect(result.blastRadiusImpact!.affectedCount).toBe(3); // 60% of 5
      expect(result.blastRadiusImpact!.percentage).toBe(60);
    });
  });
});

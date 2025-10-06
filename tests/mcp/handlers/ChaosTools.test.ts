/**
 * Chaos Engineering MCP Tools - Comprehensive Test Suite
 * Tests for real fault injection mechanisms with NO MOCKS (except in test setup)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  chaosInjectLatency,
  chaosInjectFailure,
  chaosResilienceTest,
} from '../../../src/mcp/handlers/chaos';
import type {
  ChaosLatencyConfig,
  ChaosFailureConfig,
  ChaosResilienceConfig,
  ChaosInjectionResult,
  ChaosResilienceReport,
} from '../../../src/mcp/types/chaos';

describe('Chaos Engineering MCP Tools', () => {
  // Test helpers
  const createMockService = () => {
    let latency = 0;
    let shouldFail = false;

    return {
      async call() {
        await new Promise(resolve => setTimeout(resolve, latency));
        if (shouldFail) throw new Error('Service failure');
        return { success: true, timestamp: Date.now() };
      },
      setLatency(ms: number) { latency = ms; },
      setFailure(fail: boolean) { shouldFail = fail; },
    };
  };

  describe('chaosInjectLatency', () => {
    it('should inject fixed latency into network calls', async () => {
      const config: ChaosLatencyConfig = {
        target: 'http://localhost:3000',
        latencyMs: 500,
        distribution: 'fixed',
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.injectionId).toBeDefined();
      expect(result.affectedEndpoints).toContain('http://localhost:3000');
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(500);
    });

    it('should inject uniform distributed latency', async () => {
      const config: ChaosLatencyConfig = {
        target: 'http://localhost:3000',
        latencyMs: 1000,
        distribution: 'uniform',
        distributionParams: {
          min: 500,
          max: 1500,
        },
        blastRadius: {
          percentage: 50,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(500);
      expect(result.actualLatencyMs).toBeLessThanOrEqual(1500);
      expect(result.blastRadiusImpact).toBeDefined();
    });

    it('should inject normal distributed latency', async () => {
      const config: ChaosLatencyConfig = {
        target: 'http://localhost:3000',
        latencyMs: 1000,
        distribution: 'normal',
        distributionParams: {
          mean: 1000,
          stdDev: 200,
        },
        blastRadius: {
          percentage: 75,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBeGreaterThan(0);
      expect(result.distribution).toBe('normal');
    });

    it('should respect blast radius percentage', async () => {
      const config: ChaosLatencyConfig = {
        target: 'http://localhost:3000',
        latencyMs: 100,
        distribution: 'fixed',
        blastRadius: {
          percentage: 25,
          targetServices: ['service-1', 'service-2', 'service-3', 'service-4'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact?.affectedCount).toBeLessThanOrEqual(1); // 25% of 4 = 1
    });

    it('should support duration-based injection', async () => {
      const config: ChaosLatencyConfig = {
        target: 'http://localhost:3000',
        latencyMs: 200,
        distribution: 'fixed',
        duration: 5000, // 5 seconds
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const startTime = Date.now();
      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.duration).toBe(5000);
      expect(result.expiresAt).toBeDefined();
    });

    it('should allow manual rollback', async () => {
      const config: ChaosLatencyConfig = {
        target: 'http://localhost:3000',
        latencyMs: 500,
        distribution: 'fixed',
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectLatency(config);
      expect(result.success).toBe(true);

      // Rollback
      const rollbackResult = await chaosInjectLatency({
        ...config,
        rollback: true,
        injectionId: result.injectionId,
      });

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.rolledBack).toBe(true);
    });

    it('should validate target URL format', async () => {
      const config: ChaosLatencyConfig = {
        target: 'invalid-url',
        latencyMs: 100,
        distribution: 'fixed',
        blastRadius: {
          percentage: 100,
          targetServices: ['test'],
        },
      };

      await expect(chaosInjectLatency(config)).rejects.toThrow('Invalid target URL');
    });

    it('should reject negative latency values', async () => {
      const config: ChaosLatencyConfig = {
        target: 'http://localhost:3000',
        latencyMs: -100,
        distribution: 'fixed',
        blastRadius: {
          percentage: 100,
          targetServices: ['test'],
        },
      };

      await expect(chaosInjectLatency(config)).rejects.toThrow('Latency must be positive');
    });

    it('should track active injections', async () => {
      const config: ChaosLatencyConfig = {
        target: 'http://localhost:3000',
        latencyMs: 100,
        distribution: 'fixed',
        blastRadius: {
          percentage: 100,
          targetServices: ['test'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.injectionId).toBeDefined();
      expect(result.metadata).toBeDefined();
    });
  });

  describe('chaosInjectFailure', () => {
    it('should inject HTTP error responses', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'http_error',
        httpErrorCode: 500,
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('http_error');
      expect(result.injectionId).toBeDefined();
    });

    it('should inject timeout failures', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'timeout',
        timeoutMs: 1000,
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('timeout');
      expect(result.timeoutMs).toBe(1000);
    });

    it('should inject connection refused errors', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'connection_refused',
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('connection_refused');
    });

    it('should inject DNS resolution failures', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'dns_failure',
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('dns_failure');
    });

    it('should inject partial response failures', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'partial_response',
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('partial_response');
    });

    it('should respect failure rate percentage', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'http_error',
        httpErrorCode: 503,
        failureRate: 0.5, // 50% failure rate
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureRate).toBe(0.5);
    });

    it('should support multiple failure types simultaneously', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'combined',
        failureTypes: ['http_error', 'timeout', 'connection_refused'],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.failureType).toBe('combined');
    });

    it('should allow failure rollback', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'http_error',
        httpErrorCode: 500,
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectFailure(config);
      expect(result.success).toBe(true);

      // Rollback
      const rollbackResult = await chaosInjectFailure({
        ...config,
        rollback: true,
        injectionId: result.injectionId,
      });

      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.rolledBack).toBe(true);
    });

    it('should validate HTTP error codes', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'http_error',
        httpErrorCode: 999, // Invalid code
        blastRadius: {
          percentage: 100,
          targetServices: ['test'],
        },
      };

      await expect(chaosInjectFailure(config)).rejects.toThrow('Invalid HTTP error code');
    });

    it('should track failure injection metrics', async () => {
      const config: ChaosFailureConfig = {
        target: 'http://localhost:3000',
        failureType: 'http_error',
        httpErrorCode: 500,
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const result = await chaosInjectFailure(config);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.injectedAt).toBeDefined();
    });
  });

  describe('chaosResilienceTest', () => {
    it('should run comprehensive resilience test', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        scenarios: [
          { type: 'latency', config: { latencyMs: 500, distribution: 'fixed' } },
          { type: 'failure', config: { failureType: 'http_error', httpErrorCode: 500 } },
        ],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
        duration: 10000, // 10 seconds
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.scenarios).toHaveLength(2);
      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
    });

    it('should test circuit breaker patterns', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        scenarios: [
          { type: 'failure', config: { failureType: 'http_error', httpErrorCode: 500 } },
        ],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
        resilience: {
          circuitBreaker: true,
          retryPolicy: { maxRetries: 3, backoffMs: 100 },
        },
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.resilience?.circuitBreakerTriggered).toBeDefined();
    });

    it('should test retry mechanisms', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        scenarios: [
          { type: 'failure', config: { failureType: 'timeout', timeoutMs: 1000 } },
        ],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
        resilience: {
          retryPolicy: { maxRetries: 5, backoffMs: 100 },
        },
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.resilience?.retriesAttempted).toBeGreaterThan(0);
    });

    it('should measure recovery time', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        scenarios: [
          { type: 'failure', config: { failureType: 'http_error', httpErrorCode: 500 } },
        ],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
        duration: 5000,
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.metrics?.recoveryTimeMs).toBeDefined();
      expect(report.metrics?.recoveryTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should calculate availability score', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        scenarios: [
          { type: 'latency', config: { latencyMs: 100, distribution: 'fixed' } },
        ],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
        duration: 5000,
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.metrics?.availabilityScore).toBeGreaterThanOrEqual(0);
      expect(report.metrics?.availabilityScore).toBeLessThanOrEqual(1);
    });

    it('should generate recommendations', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        scenarios: [
          { type: 'failure', config: { failureType: 'http_error', httpErrorCode: 500 } },
        ],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should auto-rollback after test completion', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        scenarios: [
          { type: 'latency', config: { latencyMs: 500, distribution: 'fixed' } },
        ],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
        duration: 2000,
        autoRollback: true,
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.rolledBack).toBe(true);
    });

    it('should support progressive blast radius', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        scenarios: [
          { type: 'latency', config: { latencyMs: 200, distribution: 'fixed' } },
        ],
        blastRadius: {
          percentage: 10, // Start with 10%
          progressive: true,
          maxPercentage: 100,
          incrementStep: 10,
          targetServices: ['test-service'],
        },
        duration: 10000,
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.blastRadiusProgression).toBeDefined();
    });

    it('should integrate with monitoring systems', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        scenarios: [
          { type: 'failure', config: { failureType: 'http_error', httpErrorCode: 500 } },
        ],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
        monitoring: {
          enabled: true,
          metricsEndpoint: 'http://localhost:9090/metrics',
        },
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.metrics).toBeDefined();
    });

    it('should handle test failures gracefully', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://invalid-target:9999',
        scenarios: [
          { type: 'latency', config: { latencyMs: 100, distribution: 'fixed' } },
        ],
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(false);
      expect(report.error).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should coordinate multiple chaos injections', async () => {
      const latencyConfig: ChaosLatencyConfig = {
        target: 'http://localhost:3000',
        latencyMs: 200,
        distribution: 'fixed',
        blastRadius: {
          percentage: 50,
          targetServices: ['service-a'],
        },
      };

      const failureConfig: ChaosFailureConfig = {
        target: 'http://localhost:3001',
        failureType: 'http_error',
        httpErrorCode: 503,
        blastRadius: {
          percentage: 50,
          targetServices: ['service-b'],
        },
      };

      const [latencyResult, failureResult] = await Promise.all([
        chaosInjectLatency(latencyConfig),
        chaosInjectFailure(failureConfig),
      ]);

      expect(latencyResult.success).toBe(true);
      expect(failureResult.success).toBe(true);
    });

    it('should support chaos experiment templates', async () => {
      const config: ChaosResilienceConfig = {
        target: 'http://localhost:3000',
        template: 'network-partition',
        blastRadius: {
          percentage: 100,
          targetServices: ['test-service'],
        },
      };

      const report = await chaosResilienceTest(config);

      expect(report.success).toBe(true);
      expect(report.template).toBe('network-partition');
    });
  });
});

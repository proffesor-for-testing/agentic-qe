/**
 * chaos/chaos-inject-latency Test Suite
 *
 * Tests for latency injection in chaos testing with multiple distributions.
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  chaosInjectLatency,
  getActiveLatencyInjections,
  cleanupExpiredInjections,
  type ChaosLatencyConfig,
  type ChaosInjectionResult,
} from '@mcp/handlers/chaos';

describe('ChaosInjectLatency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Section 1: Fixed Distribution Latency', () => {
    it('should inject fixed 100ms latency successfully', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/users',
        latencyMs: 100,
        distribution: 'fixed',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        duration: 5000,
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.injectionId).toBeDefined();
      expect(result.target).toBe('https://api.example.com/users');
      expect(result.distribution).toBe('fixed');
      expect(result.actualLatencyMs).toBe(100);
      expect(result.affectedEndpoints).toContain('https://api.example.com/users');
      expect(result.blastRadiusImpact).toBeDefined();
      expect(result.blastRadiusImpact!.percentage).toBe(50);
    });

    it('should inject fixed 500ms latency', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/orders',
        latencyMs: 500,
        distribution: 'fixed',
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
        duration: 3000,
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBe(500);
      expect(result.duration).toBe(3000);
    });

    it('should inject fixed 2000ms latency (high latency)', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/slow',
        latencyMs: 2000,
        distribution: 'fixed',
        blastRadius: {
          percentage: 75,
          targetServices: ['api.example.com', 'backup.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBe(2000);
      expect(result.blastRadiusImpact!.targetedCount).toBe(2);
    });
  });

  describe('Section 2: Uniform Distribution Latency', () => {
    it('should inject uniform distribution latency with default range', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/random',
        latencyMs: 500,
        distribution: 'uniform',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        duration: 5000,
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.distribution).toBe('uniform');
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(250); // min: baseLatency * 0.5
      expect(result.actualLatencyMs).toBeLessThanOrEqual(750); // max: baseLatency * 1.5
    });

    it('should inject uniform distribution with custom range', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/custom',
        latencyMs: 1000,
        distribution: 'uniform',
        distributionParams: {
          min: 800,
          max: 1200,
        },
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(800);
      expect(result.actualLatencyMs).toBeLessThanOrEqual(1200);
      expect(result.metadata?.distributionParams).toEqual({
        min: 800,
        max: 1200,
      });
    });

    it('should inject uniform distribution with wide range', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/wide',
        latencyMs: 500,
        distribution: 'uniform',
        distributionParams: {
          min: 100,
          max: 2000,
        },
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com', 'service2.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(100);
      expect(result.actualLatencyMs).toBeLessThanOrEqual(2000);
    });
  });

  describe('Section 3: Normal Distribution Latency', () => {
    it('should inject normal distribution with default parameters', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/normal',
        latencyMs: 500,
        distribution: 'normal',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        duration: 5000,
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.distribution).toBe('normal');
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(0);
      // Normal distribution should center around mean (500ms with stdDev of 100ms)
      expect(result.actualLatencyMs).toBeLessThan(1500); // Within 3 std devs
    });

    it('should inject normal distribution with custom mean and stdDev', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/gaussian',
        latencyMs: 1000,
        distribution: 'normal',
        distributionParams: {
          mean: 1000,
          stdDev: 200,
        },
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.distributionParams?.mean).toBe(1000);
      expect(result.metadata?.distributionParams?.stdDev).toBe(200);
    });

    it('should inject normal distribution with low stdDev (tight cluster)', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/tight',
        latencyMs: 500,
        distribution: 'normal',
        distributionParams: {
          mean: 500,
          stdDev: 50,
        },
        blastRadius: {
          percentage: 75,
          targetServices: ['api.example.com', 'api2.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should inject normal distribution with high stdDev (wide spread)', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/spread',
        latencyMs: 1000,
        distribution: 'normal',
        distributionParams: {
          mean: 1000,
          stdDev: 500,
        },
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Section 4: Exponential Distribution Latency', () => {
    it('should inject exponential distribution with default lambda', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/exponential',
        latencyMs: 500,
        distribution: 'exponential',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        duration: 5000,
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.distribution).toBe('exponential');
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should inject exponential distribution with custom lambda', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/exp-custom',
        latencyMs: 1000,
        distribution: 'exponential',
        distributionParams: {
          lambda: 0.001,
        },
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata?.distributionParams?.lambda).toBe(0.001);
    });

    it('should inject exponential distribution with high lambda (rapid decay)', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/rapid',
        latencyMs: 500,
        distribution: 'exponential',
        distributionParams: {
          lambda: 0.01,
        },
        blastRadius: {
          percentage: 75,
          targetServices: ['api.example.com', 'service2.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.actualLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Section 5: Blast Radius Control', () => {
    it('should affect 50% of target services', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/multi',
        latencyMs: 200,
        distribution: 'fixed',
        blastRadius: {
          percentage: 50,
          targetServices: ['service1', 'service2', 'service3', 'service4'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact!.targetedCount).toBe(4);
      expect(result.blastRadiusImpact!.affectedCount).toBe(2);
      expect(result.blastRadiusImpact!.percentage).toBe(50);
    });

    it('should affect 25% of target services', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/selective',
        latencyMs: 300,
        distribution: 'uniform',
        blastRadius: {
          percentage: 25,
          targetServices: ['svc1', 'svc2', 'svc3', 'svc4'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact!.affectedCount).toBe(1);
    });

    it('should affect 100% of target services', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/all',
        latencyMs: 500,
        distribution: 'normal',
        blastRadius: {
          percentage: 100,
          targetServices: ['api1', 'api2', 'api3'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact!.affectedCount).toBe(3);
    });

    it('should affect 75% of large service pool', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/large',
        latencyMs: 400,
        distribution: 'exponential',
        blastRadius: {
          percentage: 75,
          targetServices: ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact!.targetedCount).toBe(8);
      expect(result.blastRadiusImpact!.affectedCount).toBe(6);
    });
  });

  describe('Section 6: Rollback and Cleanup', () => {
    it('should rollback latency injection', async () => {
      const injectConfig: ChaosLatencyConfig = {
        target: 'https://api.example.com/rollback',
        latencyMs: 500,
        distribution: 'fixed',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        duration: 60000,
      };

      const injectResult = await chaosInjectLatency(injectConfig);
      expect(injectResult.success).toBe(true);
      const injectionId = injectResult.injectionId;

      const rollbackConfig: ChaosLatencyConfig = {
        target: 'https://api.example.com/rollback',
        latencyMs: 500,
        distribution: 'fixed',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        rollback: true,
        injectionId,
      };

      const rollbackResult = await chaosInjectLatency(rollbackConfig);
      expect(rollbackResult.success).toBe(true);
      expect(rollbackResult.rolledBack).toBe(true);
      expect(rollbackResult.injectionId).toBe(injectionId);
    });

    it('should auto-rollback after duration expires', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/auto-rollback',
        latencyMs: 300,
        distribution: 'fixed',
        blastRadius: {
          percentage: 100,
          targetServices: ['api.example.com'],
        },
        duration: 100,
      };

      const result = await chaosInjectLatency(config);
      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 150));

      const activeInjections = getActiveLatencyInjections();
      const stillActive = activeInjections.find((inj) => inj.injectionId === result.injectionId);
      expect(stillActive).toBeUndefined();
    });

    it('should cleanup multiple expired injections', async () => {
      const configs: ChaosLatencyConfig[] = Array.from({ length: 3 }, (_, i) => ({
        target: `https://api${i}.example.com/expire`,
        latencyMs: 200,
        distribution: 'fixed' as const,
        blastRadius: {
          percentage: 50,
          targetServices: [`api${i}.example.com`],
        },
        duration: 100,
      }));

      const results = await Promise.all(configs.map((config) => chaosInjectLatency(config)));
      results.forEach((result) => expect(result.success).toBe(true));

      await new Promise((resolve) => setTimeout(resolve, 150));
      cleanupExpiredInjections();

      const activeInjections = getActiveLatencyInjections();
      const expiredStillActive = results.filter((r) =>
        activeInjections.some((inj) => inj.injectionId === r.injectionId)
      );
      expect(expiredStillActive.length).toBe(0);
    });
  });

  describe('Section 7: Input Validation', () => {
    it('should reject invalid target URL', async () => {
      const config: ChaosLatencyConfig = {
        target: 'not-a-valid-url',
        latencyMs: 100,
        distribution: 'fixed',
        blastRadius: {
          percentage: 50,
          targetServices: ['test'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid target URL');
    });

    it('should reject negative latency', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/test',
        latencyMs: -100,
        distribution: 'fixed',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Latency must be positive');
    });

    it('should reject invalid blast radius percentage', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/test',
        latencyMs: 100,
        distribution: 'fixed',
        blastRadius: {
          percentage: 150,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blast radius percentage must be between 0 and 100');
    });

    it('should reject blast radius percentage below 0', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/test',
        latencyMs: 100,
        distribution: 'fixed',
        blastRadius: {
          percentage: -10,
          targetServices: ['api.example.com'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Blast radius percentage must be between 0 and 100');
    });
  });

  describe('Section 8: Active Injection Tracking', () => {
    it('should track active latency injections', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/tracked',
        latencyMs: 400,
        distribution: 'uniform',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        duration: 30000,
      };

      const result = await chaosInjectLatency(config);
      expect(result.success).toBe(true);

      const activeInjections = getActiveLatencyInjections();
      const found = activeInjections.find((inj) => inj.injectionId === result.injectionId);

      expect(found).toBeDefined();
      expect(found!.type).toBe('latency');
      expect(found!.active).toBe(true);
      expect(found!.target).toBe('https://api.example.com/tracked');
    });

    it('should list multiple active injections', async () => {
      const configs: ChaosLatencyConfig[] = [
        {
          target: 'https://api1.example.com/test',
          latencyMs: 200,
          distribution: 'fixed',
          blastRadius: { percentage: 50, targetServices: ['api1.example.com'] },
          duration: 30000,
        },
        {
          target: 'https://api2.example.com/test',
          latencyMs: 300,
          distribution: 'normal',
          blastRadius: { percentage: 50, targetServices: ['api2.example.com'] },
          duration: 30000,
        },
      ];

      const results = await Promise.all(configs.map((config) => chaosInjectLatency(config)));
      results.forEach((result) => expect(result.success).toBe(true));

      const activeInjections = getActiveLatencyInjections();
      expect(activeInjections.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Section 9: Concurrent Injection Handling', () => {
    it('should handle concurrent latency injections', async () => {
      const configs: ChaosLatencyConfig[] = Array.from({ length: 5 }, (_, i) => ({
        target: `https://api${i}.example.com/concurrent`,
        latencyMs: 100 * (i + 1),
        distribution: 'fixed' as const,
        blastRadius: {
          percentage: 50,
          targetServices: [`api${i}.example.com`],
        },
        duration: 5000,
      }));

      const results = await Promise.all(configs.map((config) => chaosInjectLatency(config)));

      results.forEach((result) => {
        expect(result.success).toBe(true);
        expect(result.injectionId).toBeDefined();
      });

      const uniqueIds = new Set(results.map((r) => r.injectionId));
      expect(uniqueIds.size).toBe(5);
    });

    it('should handle concurrent injections with different distributions', async () => {
      const distributions: Array<'fixed' | 'uniform' | 'normal' | 'exponential'> = [
        'fixed',
        'uniform',
        'normal',
        'exponential',
      ];
      const configs: ChaosLatencyConfig[] = distributions.map((dist, i) => ({
        target: `https://api${i}.example.com/mixed`,
        latencyMs: 500,
        distribution: dist,
        blastRadius: {
          percentage: 50,
          targetServices: [`api${i}.example.com`],
        },
      }));

      const results = await Promise.all(configs.map((config) => chaosInjectLatency(config)));

      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.distribution).toBe(distributions[i]);
      });
    });
  });

  describe('Section 10: Metadata and Reporting', () => {
    it('should include complete metadata in results', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/metadata',
        latencyMs: 600,
        distribution: 'normal',
        distributionParams: {
          mean: 600,
          stdDev: 100,
        },
        blastRadius: {
          percentage: 75,
          targetServices: ['api.example.com', 'backup.example.com'],
        },
        duration: 10000,
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata!.injectedAt).toBeInstanceOf(Date);
      expect(result.metadata!.injectionMethod).toBe('proxy');
      expect(result.metadata!.targetType).toBe('http');
      expect(result.metadata!.distributionParams).toEqual({
        mean: 600,
        stdDev: 100,
      });
    });

    it('should calculate blast radius impact correctly', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/impact',
        latencyMs: 400,
        distribution: 'exponential',
        blastRadius: {
          percentage: 60,
          targetServices: ['svc1', 'svc2', 'svc3', 'svc4', 'svc5'],
        },
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.blastRadiusImpact).toBeDefined();
      expect(result.blastRadiusImpact!.targetedCount).toBe(5);
      expect(result.blastRadiusImpact!.affectedCount).toBe(3);
      expect(result.blastRadiusImpact!.percentage).toBe(60);
    });

    it('should include expiration timestamp when duration is set', async () => {
      const config: ChaosLatencyConfig = {
        target: 'https://api.example.com/expire',
        latencyMs: 500,
        distribution: 'fixed',
        blastRadius: {
          percentage: 50,
          targetServices: ['api.example.com'],
        },
        duration: 20000,
      };

      const result = await chaosInjectLatency(config);

      expect(result.success).toBe(true);
      expect(result.expiresAt).toBeDefined();
      expect(result.expiresAt!.getTime()).toBeGreaterThan(Date.now());
      expect(result.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now() + 20000 + 100);
    });
  });
});

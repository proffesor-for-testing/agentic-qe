/**
 * Agentic QE v3 - Load Tester Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LoadTesterService } from '../../../../src/domains/chaos-resilience/services/load-tester';
import { MemoryBackend, StoreOptions } from '../../../../src/kernel/interfaces';
import {
  LoadTest,
  LoadProfile,
  TrafficSample,
  LoadAssertion,
} from '../../../../src/domains/chaos-resilience/interfaces';

/**
 * Mock MemoryBackend for testing
 */
function createMockMemory(): MemoryBackend {
  const store = new Map<string, unknown>();

  return {
    async initialize() {},
    async dispose() {},
    async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
      store.set(key, value);
    },
    async get<T>(key: string): Promise<T | undefined> {
      return store.get(key) as T | undefined;
    },
    async delete(key: string): Promise<boolean> {
      return store.delete(key);
    },
    async has(key: string): Promise<boolean> {
      return store.has(key);
    },
    async search(_pattern: string, _limit?: number): Promise<string[]> {
      return [];
    },
    async vectorSearch(_embedding: number[], _k: number): Promise<[]> {
      return [];
    },
    async storeVector(_key: string, _embedding: number[], _metadata?: unknown): Promise<void> {},
  };
}

/**
 * Create a valid LoadTest for testing
 */
function createValidLoadTest(overrides: Partial<LoadTest> = {}): LoadTest {
  return {
    id: 'test-001',
    name: 'API Load Test',
    type: 'load',
    target: {
      url: 'http://localhost:8080/api/users',
      method: 'GET',
    },
    profile: {
      virtualUsers: {
        start: 10,
        max: 100,
        pattern: 'ramp',
      },
      duration: 60000, // 1 minute
      rampUp: 10000,
      rampDown: 5000,
    },
    scenarios: [
      {
        name: 'Get Users',
        weight: 1,
        steps: [
          { type: 'request', target: { url: 'http://localhost:8080/api/users', method: 'GET' } },
          { type: 'think', duration: 1000 },
        ],
      },
    ],
    assertions: [
      { metric: 'p95', operator: 'lt', value: 500 },
      { metric: 'error-rate', operator: 'lt', value: 5 },
    ],
    ...overrides,
  };
}

/**
 * Create a valid TrafficSample for testing
 */
function createTrafficSample(): TrafficSample {
  return {
    requests: [
      { url: '/api/users', method: 'GET', frequency: 100, avgResponseTime: 50 },
      { url: '/api/orders', method: 'GET', frequency: 80, avgResponseTime: 75 },
      { url: '/api/products', method: 'GET', frequency: 60, avgResponseTime: 40 },
    ],
    duration: 60000,
    source: 'production-traffic',
  };
}

describe('LoadTesterService', () => {
  let service: LoadTesterService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemory();
    service = new LoadTesterService(mockMemory);
  });

  describe('createTest', () => {
    it('should create a valid load test successfully', async () => {
      const test = createValidLoadTest();

      const result = await service.createTest(test);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(test.id);
      }
    });

    it('should reject test without ID', async () => {
      const test = createValidLoadTest({ id: '' });

      const result = await service.createTest(test);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('ID is required');
      }
    });

    it('should reject test without name', async () => {
      const test = createValidLoadTest({ name: '' });

      const result = await service.createTest(test);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('name is required');
      }
    });

    it('should reject test without target URL', async () => {
      const test = createValidLoadTest({ target: { url: '', method: 'GET' } });

      const result = await service.createTest(test);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('target URL is required');
      }
    });

    it('should reject test with non-positive virtual users', async () => {
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 0, max: 0, pattern: 'constant' },
          duration: 60000,
        },
      });

      const result = await service.createTest(test);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Maximum virtual users must be positive');
      }
    });

    it('should reject test with non-positive duration', async () => {
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 10, max: 100, pattern: 'ramp' },
          duration: 0,
        },
      });

      const result = await service.createTest(test);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('duration must be positive');
      }
    });
  });

  describe('runTest', () => {
    it('should return error for non-existent test', async () => {
      const result = await service.runTest('non-existent-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Load test not found');
      }
    });

    it('should run test and return results', async () => {
      // Use short duration for faster test
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 5, max: 10, pattern: 'constant' },
          duration: 1500, // 1.5 seconds
        },
      });
      await service.createTest(test);

      const result = await service.runTest(test.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.testId).toBe(test.id);
        expect(result.value.duration).toBeGreaterThan(0);
        expect(result.value.summary.totalRequests).toBeGreaterThan(0);
        expect(['completed', 'failed']).toContain(result.value.status);
      }
    }, 10000);

    it('should not allow running the same test twice concurrently', async () => {
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 5, max: 10, pattern: 'constant' },
          duration: 2000,
        },
      });
      await service.createTest(test);

      // Start first run
      const firstRun = service.runTest(test.id);

      // Give it time to start
      await new Promise(resolve => setTimeout(resolve, 50));

      // Try to run again
      const secondRun = await service.runTest(test.id);

      // Second should fail
      expect(secondRun.success).toBe(false);
      if (!secondRun.success) {
        expect(secondRun.error.message).toContain('already running');
      }

      // Clean up
      await service.stopTest(test.id);
      await firstRun;
    }, 10000);

    it('should reject test exceeding max virtual users', async () => {
      const limitedService = new LoadTesterService(mockMemory, { maxVirtualUsers: 50 });
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 10, max: 100, pattern: 'ramp' },
          duration: 1000,
        },
      });
      await limitedService.createTest(test);

      const result = await limitedService.runTest(test.id);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('exceeds maximum');
      }
    });

    it('should evaluate assertions against results', async () => {
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 5, max: 10, pattern: 'constant' },
          duration: 1500,
        },
        assertions: [
          { metric: 'p95', operator: 'lt', value: 1000 }, // Should pass
          { metric: 'error-rate', operator: 'lt', value: 50 }, // Should pass
        ],
      });
      await service.createTest(test);

      const result = await service.runTest(test.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.assertionResults).toHaveLength(2);
        for (const assertion of result.value.assertionResults) {
          expect(assertion.actualValue).toBeDefined();
          expect(typeof assertion.passed).toBe('boolean');
        }
      }
    }, 10000);

    it('should calculate percentiles correctly', async () => {
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 10, max: 20, pattern: 'constant' },
          duration: 1500,
        },
      });
      await service.createTest(test);

      const result = await service.runTest(test.id);

      expect(result.success).toBe(true);
      if (result.success) {
        const { summary } = result.value;
        expect(summary.p50ResponseTime).toBeGreaterThanOrEqual(0);
        expect(summary.p95ResponseTime).toBeGreaterThanOrEqual(summary.p50ResponseTime);
        expect(summary.p99ResponseTime).toBeGreaterThanOrEqual(summary.p95ResponseTime);
        expect(summary.maxResponseTime).toBeGreaterThanOrEqual(summary.p99ResponseTime);
      }
    }, 10000);
  });

  describe('stopTest', () => {
    it('should return error for non-active test', async () => {
      const result = await service.stopTest('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No active load test found');
      }
    });

    it('should stop a running test', async () => {
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 5, max: 10, pattern: 'constant' },
          duration: 30000, // Long duration
        },
      });
      await service.createTest(test);

      // Start the test
      const runPromise = service.runTest(test.id);

      // Wait for it to start
      await new Promise(resolve => setTimeout(resolve, 100));

      // Stop it
      const stopResult = await service.stopTest(test.id);

      expect(stopResult.success).toBe(true);
      if (stopResult.success) {
        expect(stopResult.value.status).toBe('aborted');
      }

      // Wait for run to complete
      await runPromise;
    }, 10000);
  });

  describe('getRealtimeMetrics', () => {
    it('should return error for non-active test', async () => {
      const result = await service.getRealtimeMetrics('non-existent');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No active load test found');
      }
    });
  });

  describe('generateFromTraffic', () => {
    it('should generate load test from traffic sample', async () => {
      const trafficSample = createTrafficSample();
      const multiplier = 2;

      const result = await service.generateFromTraffic(trafficSample, multiplier);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.id).toBeDefined();
        expect(result.value.name).toContain(trafficSample.source);
        expect(result.value.scenarios.length).toBe(trafficSample.requests.length);
        expect(result.value.assertions.length).toBeGreaterThan(0);
      }
    });

    it('should reject empty traffic sample', async () => {
      const emptyTraffic: TrafficSample = {
        requests: [],
        duration: 60000,
        source: 'empty',
      };

      const result = await service.generateFromTraffic(emptyTraffic, 1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('no requests');
      }
    });

    it('should reject non-positive multiplier', async () => {
      const trafficSample = createTrafficSample();

      const result = await service.generateFromTraffic(trafficSample, 0);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Multiplier must be positive');
      }
    });

    it('should generate stress test type for high multiplier', async () => {
      const trafficSample = createTrafficSample();
      const multiplier = 10; // High multiplier

      const result = await service.generateFromTraffic(trafficSample, multiplier);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('stress');
      }
    });

    it('should generate load test type for normal multiplier', async () => {
      const trafficSample = createTrafficSample();
      const multiplier = 2; // Normal multiplier

      const result = await service.generateFromTraffic(trafficSample, multiplier);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.type).toBe('load');
      }
    });

    it('should calculate scenarios weights from request frequency', async () => {
      const trafficSample = createTrafficSample();

      const result = await service.generateFromTraffic(trafficSample, 1);

      expect(result.success).toBe(true);
      if (result.success) {
        const totalWeight = result.value.scenarios.reduce((sum, s) => sum + s.weight, 0);
        expect(totalWeight).toBeCloseTo(1, 5);
      }
    });

    it('should respect maxVirtualUsers configuration', async () => {
      const limitedService = new LoadTesterService(mockMemory, { maxVirtualUsers: 50 });
      const trafficSample = createTrafficSample();
      const multiplier = 100; // Very high

      const result = await limitedService.generateFromTraffic(trafficSample, multiplier);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.profile.virtualUsers.max).toBeLessThanOrEqual(50);
      }
    });
  });

  describe('virtual user patterns', () => {
    it('should handle constant pattern', async () => {
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 10, max: 10, pattern: 'constant' },
          duration: 1500,
        },
      });
      await service.createTest(test);

      const result = await service.runTest(test.id);

      expect(result.success).toBe(true);
      if (result.success) {
        // All timeline points should have ~10 VUs
        for (const point of result.value.timeline) {
          expect(point.virtualUsers).toBe(10);
        }
      }
    }, 10000);

    it('should handle ramp pattern', async () => {
      const test = createValidLoadTest({
        profile: {
          virtualUsers: { start: 5, max: 20, pattern: 'ramp' },
          duration: 2000,
          rampUp: 500,
          rampDown: 500,
        },
      });
      await service.createTest(test);

      const result = await service.runTest(test.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.timeline.length).toBeGreaterThan(0);
      }
    }, 10000);
  });

  describe('test types', () => {
    it('should handle load test type', async () => {
      const test = createValidLoadTest({
        type: 'load',
        profile: {
          virtualUsers: { start: 5, max: 10, pattern: 'constant' },
          duration: 1500,
        },
      });
      await service.createTest(test);

      const result = await service.runTest(test.id);

      expect(result.success).toBe(true);
    }, 10000);

    it('should handle stress test type with higher load', async () => {
      const test = createValidLoadTest({
        type: 'stress',
        profile: {
          virtualUsers: { start: 5, max: 10, pattern: 'constant' },
          duration: 1500,
        },
      });
      await service.createTest(test);

      const result = await service.runTest(test.id);

      expect(result.success).toBe(true);
    }, 10000);

    it('should handle spike test type', async () => {
      const test = createValidLoadTest({
        type: 'spike',
        profile: {
          virtualUsers: { start: 5, max: 10, pattern: 'spike' },
          duration: 1500,
        },
      });
      await service.createTest(test);

      const result = await service.runTest(test.id);

      expect(result.success).toBe(true);
    }, 10000);
  });

  describe('configuration', () => {
    it('should use default configuration when none provided', () => {
      const defaultService = new LoadTesterService(mockMemory);

      expect(defaultService).toBeDefined();
    });

    it('should merge provided configuration with defaults', () => {
      const customService = new LoadTesterService(mockMemory, {
        defaultTimeout: 120000,
        maxVirtualUsers: 500,
        reportingInterval: 500,
      });

      expect(customService).toBeDefined();
    });
  });
});

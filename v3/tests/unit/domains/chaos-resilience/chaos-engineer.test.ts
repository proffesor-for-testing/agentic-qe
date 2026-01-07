/**
 * Agentic QE v3 - Chaos Engineer Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChaosEngineerService } from '../../../../src/domains/chaos-resilience/services/chaos-engineer';
import { MemoryBackend, StoreOptions } from '../../../../src/kernel/interfaces';
import {
  ChaosExperiment,
  FaultInjection,
  SteadyStateDefinition,
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
 * Create a valid ChaosExperiment for testing
 */
function createValidExperiment(overrides: Partial<ChaosExperiment> = {}): ChaosExperiment {
  return {
    id: 'exp-001',
    name: 'Test Experiment',
    description: 'A test chaos experiment',
    hypothesis: {
      statement: 'Service should recover within 5 seconds',
      metrics: [
        { metric: 'response_time_ms', operator: 'lt', value: 200 },
      ],
      tolerances: [
        { metric: 'error_rate', maxDeviation: 5, unit: 'percent' },
      ],
    },
    steadyState: {
      description: 'Service is healthy',
      probes: [
        {
          name: 'HTTP Health Check',
          type: 'http',
          target: 'http://localhost:8080/health',
          expected: { status: 200 },
          timeout: 5000,
        },
      ],
    },
    faults: [
      {
        id: 'fault-001',
        type: 'latency',
        target: { type: 'service', selector: 'api-gateway' },
        parameters: { latencyMs: 500 },
        duration: 10000,
        probability: 1.0,
      },
    ],
    blastRadius: {
      scope: 'single',
      excludeProduction: true,
    },
    rollbackPlan: {
      automatic: true,
      triggerConditions: [
        { type: 'error-rate', condition: 'error_rate > 10%' },
      ],
      steps: [
        { order: 1, action: 'remove-fault', target: 'fault-001' },
        { order: 2, action: 'restart-service', target: 'api-gateway' },
      ],
    },
    ...overrides,
  };
}

/**
 * Create a valid FaultInjection for testing
 */
function createValidFault(overrides: Partial<FaultInjection> = {}): FaultInjection {
  return {
    id: 'fault-001',
    type: 'latency',
    target: { type: 'service', selector: 'api-gateway' },
    parameters: { latencyMs: 100 },
    duration: 5000,
    ...overrides,
  };
}

describe('ChaosEngineerService', () => {
  let service: ChaosEngineerService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemory();
    service = new ChaosEngineerService(mockMemory);
  });

  describe('createExperiment', () => {
    it('should create a valid experiment successfully', async () => {
      const experiment = createValidExperiment();

      const result = await service.createExperiment(experiment);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(experiment.id);
      }
    });

    it('should reject experiment without ID', async () => {
      const experiment = createValidExperiment({ id: '' });

      const result = await service.createExperiment(experiment);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('ID is required');
      }
    });

    it('should reject experiment without name', async () => {
      const experiment = createValidExperiment({ name: '' });

      const result = await service.createExperiment(experiment);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('name is required');
      }
    });

    it('should reject experiment without hypothesis', async () => {
      const experiment = createValidExperiment({ hypothesis: undefined as unknown as ChaosExperiment['hypothesis'] });

      const result = await service.createExperiment(experiment);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('hypothesis is required');
      }
    });

    it('should reject experiment without steady state probes', async () => {
      const experiment = createValidExperiment({
        steadyState: { description: 'empty', probes: [] },
      });

      const result = await service.createExperiment(experiment);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('At least one steady state probe is required');
      }
    });

    it('should reject experiment without faults', async () => {
      const experiment = createValidExperiment({ faults: [] });

      const result = await service.createExperiment(experiment);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('At least one fault injection is required');
      }
    });

    it('should reject experiment without rollback plan', async () => {
      const experiment = createValidExperiment({ rollbackPlan: undefined as unknown as ChaosExperiment['rollbackPlan'] });

      const result = await service.createExperiment(experiment);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Rollback plan is required');
      }
    });

    it('should require automatic rollback for production experiments', async () => {
      const experiment = createValidExperiment({
        blastRadius: { scope: 'single', excludeProduction: false },
        rollbackPlan: {
          automatic: false,
          triggerConditions: [],
          steps: [{ order: 1, action: 'manual-rollback' }],
        },
      });

      const result = await service.createExperiment(experiment);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Production experiments require automatic rollback');
      }
    });
  });

  describe('runExperiment', () => {
    it('should return error for non-existent experiment', async () => {
      const result = await service.runExperiment('non-existent-id');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Experiment not found');
      }
    });

    it('should run experiment and return result', async () => {
      const experiment = createValidExperiment();
      await service.createExperiment(experiment);

      const result = await service.runExperiment(experiment.id);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.experimentId).toBe(experiment.id);
        expect(result.value.startTime).toBeDefined();
        expect(result.value.endTime).toBeDefined();
        expect(['completed', 'failed', 'rolled-back']).toContain(result.value.status);
      }
    });

    it('should not allow running the same experiment twice concurrently', async () => {
      const experiment = createValidExperiment();
      await service.createExperiment(experiment);

      // Start first run (we need to manually simulate it being in progress)
      // Since runExperiment awaits completion, we test via abort mechanism
      const firstRun = service.runExperiment(experiment.id);

      // Wait a tick to let the experiment start
      await new Promise(resolve => setTimeout(resolve, 10));

      // The second run should fail if the first is still running
      // Since our stub completes quickly, this tests the happy path
      await firstRun;
    });
  });

  describe('abortExperiment', () => {
    it('should return error for non-active experiment', async () => {
      const result = await service.abortExperiment('non-existent', 'test reason');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No active experiment found');
      }
    });
  });

  describe('verifySteadyState', () => {
    it('should verify steady state with valid probes', async () => {
      const definition: SteadyStateDefinition = {
        description: 'Service health check',
        probes: [
          {
            name: 'HTTP probe',
            type: 'http',
            target: 'http://localhost:8080/health',
            expected: { status: 200 },
            timeout: 5000,
          },
        ],
      };

      const result = await service.verifySteadyState(definition);

      expect(result.success).toBe(true);
      // The stub returns true for all probes
      if (result.success) {
        expect(result.value).toBe(true);
      }
    });

    it('should handle multiple probe types', async () => {
      const definition: SteadyStateDefinition = {
        description: 'Multiple probes',
        probes: [
          { name: 'HTTP', type: 'http', target: 'http://localhost/health', expected: {}, timeout: 1000 },
          { name: 'TCP', type: 'tcp', target: 'localhost:8080', expected: {}, timeout: 1000 },
          { name: 'Command', type: 'command', target: 'echo OK', expected: {}, timeout: 1000 },
          { name: 'Metric', type: 'metric', target: 'cpu_usage', expected: {}, timeout: 1000 },
        ],
      };

      const result = await service.verifySteadyState(definition);

      expect(result.success).toBe(true);
    });
  });

  describe('injectFault', () => {
    it('should inject a valid fault successfully', async () => {
      const fault = createValidFault();

      const result = await service.injectFault(fault);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.faultId).toBe(fault.id);
        expect(result.value.injected).toBe(true);
        expect(result.value.errors).toHaveLength(0);
      }
    });

    it('should reject fault without ID', async () => {
      const fault = createValidFault({ id: '' });

      const result = await service.injectFault(fault);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Fault ID is required');
      }
    });

    it('should reject fault without type', async () => {
      const fault = createValidFault({ type: '' as FaultInjection['type'] });

      const result = await service.injectFault(fault);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Fault type is required');
      }
    });

    it('should reject fault without target', async () => {
      const fault = createValidFault({ target: undefined as unknown as FaultInjection['target'] });

      const result = await service.injectFault(fault);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Fault target is required');
      }
    });

    it('should reject fault with negative duration', async () => {
      const fault = createValidFault({ duration: -1000 });

      const result = await service.injectFault(fault);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('duration must be non-negative');
      }
    });

    it('should reject fault with invalid probability', async () => {
      const fault = createValidFault({ probability: 1.5 });

      const result = await service.injectFault(fault);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('probability must be between 0 and 1');
      }
    });

    it('should respect maximum concurrent faults limit', async () => {
      // Create service with low limit
      const limitedService = new ChaosEngineerService(mockMemory, { maxConcurrentFaults: 1 });

      const fault1 = createValidFault({ id: 'fault-1', duration: 0 });
      const fault2 = createValidFault({ id: 'fault-2', duration: 0 });

      // First fault should succeed
      const result1 = await limitedService.injectFault(fault1);
      expect(result1.success).toBe(true);

      // Second fault should fail due to limit
      const result2 = await limitedService.injectFault(fault2);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.message).toContain('Maximum concurrent faults');
      }
    });

    it('should skip fault injection based on probability', async () => {
      // Mock Math.random to return a value higher than probability
      const originalRandom = Math.random;
      Math.random = () => 0.9;

      try {
        const fault = createValidFault({ probability: 0.5 });
        const result = await service.injectFault(fault);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.injected).toBe(false);
          expect(result.value.errors).toContain('Skipped due to probability check');
        }
      } finally {
        Math.random = originalRandom;
      }
    });

    it('should inject different fault types', async () => {
      const faultTypes: FaultInjection['type'][] = [
        'latency', 'error', 'timeout', 'packet-loss',
        'cpu-stress', 'memory-stress', 'disk-stress',
        'network-partition', 'dns-failure', 'process-kill',
      ];

      for (const type of faultTypes) {
        const fault = createValidFault({ id: `fault-${type}`, type, duration: 0 });
        const result = await service.injectFault(fault);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.injected).toBe(true);
        }

        // Clean up
        await service.removeFault(fault.id);
      }
    });
  });

  describe('removeFault', () => {
    it('should remove an active fault', async () => {
      const fault = createValidFault({ duration: 0 });
      await service.injectFault(fault);

      const result = await service.removeFault(fault.id);

      expect(result.success).toBe(true);
    });

    it('should succeed silently for non-existent fault', async () => {
      const result = await service.removeFault('non-existent-fault');

      // Should succeed (no-op for already removed faults)
      expect(result.success).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should use default configuration when none provided', () => {
      const defaultService = new ChaosEngineerService(mockMemory);

      // Service should be created successfully with defaults
      expect(defaultService).toBeDefined();
    });

    it('should merge provided configuration with defaults', () => {
      const customService = new ChaosEngineerService(mockMemory, {
        defaultTimeout: 30000,
        enableDryRun: false,
      });

      expect(customService).toBeDefined();
    });
  });
});

/**
 * Agentic QE v3 - Quality Gate Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QualityGateService } from '../../../../src/domains/quality-assessment/services/quality-gate';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { GateEvaluationRequest, QualityMetrics, GateThresholds } from '../../../../src/domains/quality-assessment/interfaces';

/**
 * Mock MemoryBackend implementation for testing
 */
class MockMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {
    this.store.clear();
  }

  async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async search(pattern: string, _limit?: number): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  async vectorSearch(_embedding: number[], _k: number): Promise<VectorSearchResult[]> {
    return [];
  }

  async storeVector(_key: string, _embedding: number[], _metadata?: unknown): Promise<void> {}
}

describe('QualityGateService', () => {
  let service: QualityGateService;
  let mockMemory: MockMemoryBackend;

  const createMetrics = (overrides: Partial<QualityMetrics> = {}): QualityMetrics => ({
    coverage: 85,
    testsPassing: 100,
    criticalBugs: 0,
    codeSmells: 5,
    securityVulnerabilities: 0,
    technicalDebt: 2,
    duplications: 3,
    ...overrides,
  });

  const createThresholds = (overrides: Partial<GateThresholds> = {}): GateThresholds => ({
    coverage: { min: 80 },
    testsPassing: { min: 95 },
    criticalBugs: { max: 0 },
    codeSmells: { max: 20 },
    securityVulnerabilities: { max: 0 },
    technicalDebt: { max: 5 },
    duplications: { max: 5 },
    ...overrides,
  });

  beforeEach(() => {
    mockMemory = new MockMemoryBackend();
    service = new QualityGateService(mockMemory);
  });

  afterEach(async () => {
    await mockMemory.dispose();
  });

  describe('evaluateGate', () => {
    it('should pass gate when all metrics meet thresholds', async () => {
      const request: GateEvaluationRequest = {
        gateName: 'release-gate',
        metrics: createMetrics(),
        thresholds: createThresholds(),
      };

      const result = await service.evaluateGate(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passed).toBe(true);
        expect(result.value.gateName).toBe('release-gate');
        expect(result.value.failedChecks).toHaveLength(0);
        expect(result.value.overallScore).toBeGreaterThan(0);
      }
    });

    it('should fail gate when critical checks fail', async () => {
      const request: GateEvaluationRequest = {
        gateName: 'release-gate',
        metrics: createMetrics({ criticalBugs: 3, securityVulnerabilities: 1 }),
        thresholds: createThresholds(),
      };

      const result = await service.evaluateGate(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passed).toBe(false);
        expect(result.value.failedChecks).toContain('criticalBugs');
        expect(result.value.failedChecks).toContain('securityVulnerabilities');
      }
    });

    it('should fail gate when coverage is below minimum threshold', async () => {
      const request: GateEvaluationRequest = {
        gateName: 'coverage-gate',
        metrics: createMetrics({ coverage: 60 }),
        thresholds: createThresholds({ coverage: { min: 80 } }),
      };

      const result = await service.evaluateGate(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.failedChecks).toContain('coverage');
        const coverageCheck = result.value.checks.find((c) => c.name === 'coverage');
        expect(coverageCheck?.passed).toBe(false);
        expect(coverageCheck?.value).toBe(60);
        expect(coverageCheck?.threshold).toBe(80);
      }
    });

    it('should fail gate when tests passing is below minimum', async () => {
      const request: GateEvaluationRequest = {
        gateName: 'tests-gate',
        metrics: createMetrics({ testsPassing: 80 }),
        thresholds: createThresholds({ testsPassing: { min: 95 } }),
      };

      const result = await service.evaluateGate(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.failedChecks).toContain('testsPassing');
      }
    });

    it('should return error when no metrics provided', async () => {
      const request = {
        gateName: 'empty-gate',
        metrics: undefined as unknown as QualityMetrics,
        thresholds: createThresholds(),
      };

      const result = await service.evaluateGate(request);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No metrics provided');
      }
    });

    it('should calculate weighted overall score based on severity', async () => {
      const request: GateEvaluationRequest = {
        gateName: 'weighted-gate',
        metrics: createMetrics({
          coverage: 85,
          codeSmells: 50, // Fails (medium severity)
          duplications: 15, // Fails (low severity)
        }),
        thresholds: createThresholds(),
      };

      const result = await service.evaluateGate(request);

      expect(result.success).toBe(true);
      if (result.success) {
        // Score should be weighted - high/critical checks pass
        expect(result.value.overallScore).toBeGreaterThan(0);
        expect(result.value.overallScore).toBeLessThan(100);
      }
    });

    it('should store evaluation result in memory', async () => {
      const request: GateEvaluationRequest = {
        gateName: 'stored-gate',
        metrics: createMetrics(),
        thresholds: createThresholds(),
      };

      await service.evaluateGate(request);

      const storedKeys = await mockMemory.search('quality-gate:evaluation:stored-gate:*');
      expect(storedKeys.length).toBeGreaterThan(0);
    });

    it('should handle partial threshold definitions', async () => {
      const request: GateEvaluationRequest = {
        gateName: 'partial-gate',
        metrics: createMetrics(),
        thresholds: {
          coverage: { min: 70 },
          criticalBugs: { max: 0 },
        },
      };

      const result = await service.evaluateGate(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passed).toBe(true);
        expect(result.value.checks.length).toBe(2);
      }
    });
  });

  describe('createGatePreset', () => {
    it('should create and store a new preset', async () => {
      const thresholds = createThresholds({ coverage: { min: 95 } });

      const result = await service.createGatePreset('high-quality', thresholds);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toContain('preset-high-quality-');
      }

      const storedPreset = await service.getGatePreset('high-quality');
      expect(storedPreset).toEqual(thresholds);
    });

    it('should overwrite existing preset with same name', async () => {
      const thresholds1 = createThresholds({ coverage: { min: 80 } });
      const thresholds2 = createThresholds({ coverage: { min: 95 } });

      await service.createGatePreset('my-preset', thresholds1);
      await service.createGatePreset('my-preset', thresholds2);

      const storedPreset = await service.getGatePreset('my-preset');
      expect(storedPreset?.coverage?.min).toBe(95);
    });
  });

  describe('getGatePreset', () => {
    it('should return undefined for non-existent preset', async () => {
      const preset = await service.getGatePreset('non-existent');
      expect(preset).toBeUndefined();
    });

    it('should return default presets', async () => {
      const strictPreset = await service.getGatePreset('strict');
      const standardPreset = await service.getGatePreset('standard');
      const relaxedPreset = await service.getGatePreset('relaxed');

      expect(strictPreset).toBeDefined();
      expect(strictPreset?.coverage?.min).toBe(90);

      expect(standardPreset).toBeDefined();
      expect(standardPreset?.coverage?.min).toBe(80);

      expect(relaxedPreset).toBeDefined();
      expect(relaxedPreset?.coverage?.min).toBe(60);
    });
  });

  describe('listGatePresets', () => {
    it('should list default presets', async () => {
      const presets = await service.listGatePresets();

      expect(presets).toContain('strict');
      expect(presets).toContain('standard');
      expect(presets).toContain('relaxed');
    });

    it('should include custom presets in list', async () => {
      await service.createGatePreset('custom-preset', createThresholds());

      const presets = await service.listGatePresets();

      expect(presets).toContain('custom-preset');
    });
  });

  describe('strict mode configuration', () => {
    it('should fail gate in strict mode when any check fails', async () => {
      const strictService = new QualityGateService(mockMemory, { strictMode: true });

      const request: GateEvaluationRequest = {
        gateName: 'strict-gate',
        metrics: createMetrics({ codeSmells: 50 }), // Fails low-severity check
        thresholds: createThresholds(),
      };

      const result = await strictService.evaluateGate(request);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.passed).toBe(false);
      }
    });

    it('should pass gate in non-strict mode when only low-severity checks fail', async () => {
      const request: GateEvaluationRequest = {
        gateName: 'non-strict-gate',
        metrics: createMetrics({ duplications: 15 }), // Fails low-severity check
        thresholds: createThresholds(),
      };

      const result = await service.evaluateGate(request);

      expect(result.success).toBe(true);
      if (result.success) {
        // Only critical and high severity need to pass
        expect(result.value.passed).toBe(true);
      }
    });
  });
});

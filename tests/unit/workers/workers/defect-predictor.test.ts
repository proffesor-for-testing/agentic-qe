/**
 * Agentic QE v3 - Defect Predictor Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 *
 * TDD Tests for DefectPredictorWorker
 * Tests ML-based defect prediction and hotspot identification
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DefectPredictorWorker } from '../../../../src/workers/workers/defect-predictor';
import { WorkerContext } from '../../../../src/workers/interfaces';
import * as path from 'path';

/**
 * #1043: the worker relays only predictions the defect-intelligence predictor
 * recorded, for files that exist. Shaped like DefectPredictorService output,
 * on real files of this repository (absolute paths).
 */
function recordedPrediction(): Record<string, unknown> {
  const workersDir = path.resolve(__dirname, '../../../../src/workers/workers');
  return {
    'defect-intelligence:predictor:prediction:p-1': {
      id: 'p-1',
      timestamp: new Date().toISOString(),
      predictions: [
        {
          file: path.join(workersDir, 'learning-consolidation.ts'), probability: 0.82, riskLevel: 'high',
          factors: [{ name: 'codeComplexity', contribution: 0.25 }, { name: 'testCoverage', contribution: 0.15 }],
          recommendations: ['Split the file'],
        },
        {
          file: path.join(workersDir, 'index.ts'), probability: 0.1, riskLevel: 'info',
          factors: [], recommendations: [],
        },
      ],
    },
  };
}

function createMockContext(records: Record<string, unknown> = {}): WorkerContext {
  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn(async (key: string) => records[key]),
      set: vi.fn().mockResolvedValue(undefined),
      search: vi.fn(async (pattern: string) =>
        Object.keys(records).filter((k) => k.startsWith(pattern.replace(/\*$/, '')))),
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    domains: {
      getDomainAPI: vi.fn().mockReturnValue({}),
      getDomainHealth: vi.fn().mockReturnValue({ status: 'healthy', errors: [] }),
    },
    signal: new AbortController().signal,
  };
}

describe('DefectPredictorWorker', () => {
  let worker: DefectPredictorWorker;

  // The seeded predictions name files of this repository; the worker keeps
  // only files inside the project root (#1043 round 2b), so point it here.
  const savedProjectRoot = process.env.AQE_PROJECT_ROOT;

  beforeEach(() => {
    worker = new DefectPredictorWorker();
    process.env.AQE_PROJECT_ROOT = path.resolve(__dirname, '../../../..');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedProjectRoot === undefined) delete process.env.AQE_PROJECT_ROOT;
    else process.env.AQE_PROJECT_ROOT = savedProjectRoot;
  });

  describe('instantiation', () => {
    it('should be instantiated with correct config', () => {
      expect(worker.config.id).toBe('defect-predictor');
      expect(worker.config.name).toBe('Defect Predictor');
      expect(worker.config.priority).toBe('high');
      expect(worker.config.targetDomains).toContain('defect-intelligence');
    });

    it('should have 15 minute interval', () => {
      expect(worker.config.intervalMs).toBe(15 * 60 * 1000);
    });

    it('should have correct timeout and retry settings', () => {
      expect(worker.config.timeoutMs).toBe(180000);
      expect(worker.config.retryCount).toBe(2);
    });

    it('should start in idle status', () => {
      expect(worker.status).toBe('idle');
    });
  });

  describe('execute - successful prediction', () => {
    it('should execute successfully', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.success).toBe(true);
      expect(result.workerId).toBe('defect-predictor');
    });

    it('should return defect prediction metrics', async () => {
      const context = createMockContext(recordedPrediction());

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics).toHaveProperty('filesAnalyzed');
      expect(result.metrics.domainMetrics).toHaveProperty('highRiskFiles');
      expect(result.metrics.domainMetrics).toHaveProperty('hotspots');
      expect(result.metrics.domainMetrics).toHaveProperty('avgDefectProbability');
    });

    it('should store predictions in memory', async () => {
      const context = createMockContext(recordedPrediction());

      await worker.execute(context);

      expect(context.memory.set).toHaveBeenCalledWith('defect:predictions', expect.objectContaining({
        measured: true, predictionId: 'p-1', predictions: expect.any(Array),
      }));
      expect(context.memory.set).not.toHaveBeenCalledWith('defect:hotspots', expect.anything());
      expect(context.memory.set).toHaveBeenCalledWith('defect:lastAnalysis', expect.any(String));
    });

    it('should publish worker.executed event', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.eventBus.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'worker.executed',
          workerId: 'defect-predictor',
        })
      );
    });
  });

  describe('execute - high risk detection', () => {
    it('should generate findings for high risk files', async () => {
      const context = createMockContext(recordedPrediction());

      const result = await worker.execute(context);

      // The recorded prediction rates one file high risk
      expect(result.findings.some(f =>
        f.type === 'high-defect-risk' || f.type === 'critical-defect-risk'
      )).toBe(true);
    });

    it('should generate recommendations for high risk files', async () => {
      const context = createMockContext(recordedPrediction());

      const result = await worker.execute(context);

      expect(result.recommendations.some(r =>
        r.action.includes('Code Review') || r.action.includes('Risk')
      )).toBe(true);
    });

    it('should include file path in high risk findings', async () => {
      const context = createMockContext(recordedPrediction());

      const result = await worker.execute(context);

      const highRiskFindings = result.findings.filter(f =>
        f.type === 'high-defect-risk' || f.type === 'critical-defect-risk'
      );

      for (const finding of highRiskFindings) {
        expect(finding.resource).toBeDefined();
        expect(finding.context).toBeDefined();
      }
    });
  });

  describe('execute - hotspot detection', () => {
    it('should report hotspots as unmeasured (no measured source, #1043)', async () => {
      const context = createMockContext(recordedPrediction());

      const result = await worker.execute(context);

      expect(result.findings.some(f => f.type === 'code-hotspots')).toBe(false);
      expect(result.metrics.domainMetrics.hotspots).toBe('unmeasured');
    });

    it('should not invent hotspot recommendations (#1043)', async () => {
      const context = createMockContext(recordedPrediction());

      const result = await worker.execute(context);

      expect(result.recommendations.some(r =>
        r.action.includes('Hotspot')
      )).toBe(false);
    });
  });

  describe('execute - factor analysis', () => {
    it('should include defect factors in findings', async () => {
      const context = createMockContext(recordedPrediction());

      const result = await worker.execute(context);

      const riskFindings = result.findings.filter(f =>
        f.type.includes('defect-risk')
      );

      // At least one finding should have factor information
      expect(riskFindings.some(f =>
        f.context && f.context.factors
      )).toBe(true);
    });

    it('should recommend complexity reduction when relevant', async () => {
      const context = createMockContext(recordedPrediction());

      const result = await worker.execute(context);

      // The recorded prediction names complexity as a major factor
      expect(result.recommendations.some(r =>
        r.action.includes('Complexity')
      )).toBe(true);
    });
  });

  describe('health score calculation', () => {
    it('should calculate health score between 0 and 100', async () => {
      const context = createMockContext(recordedPrediction());

      const result = await worker.execute(context);

      expect(result.metrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.metrics.healthScore).toBeLessThanOrEqual(100);
    });

    it('#1137: reports no health score, not a passing 100, when nothing was measured', async () => {
      const result = await worker.execute(createMockContext());

      expect(result.metrics.healthScore).toBeNull();
      expect(result.metrics.domainMetrics).toMatchObject({ health: 'unmeasured' });
    });
  });

  describe('lifecycle methods', () => {
    it('should initialize correctly', async () => {
      await worker.initialize();
      expect(worker.status).toBe('idle');
      expect(worker.nextRunAt).toBeDefined();
    });

    it('should pause and resume', () => {
      worker.pause();
      expect(worker.status).toBe('paused');

      worker.resume();
      expect(worker.status).toBe('idle');
    });

    it('should stop', async () => {
      await worker.stop();
      expect(worker.status).toBe('stopped');
    });
  });

  describe('health tracking', () => {
    it('should track health after successful execution', async () => {
      const context = createMockContext();

      await worker.execute(context);
      const health = worker.getHealth();

      expect(health.totalExecutions).toBe(1);
      expect(health.successfulExecutions).toBe(1);
      expect(health.failedExecutions).toBe(0);
    });

    it('should calculate health score correctly', async () => {
      const context = createMockContext();

      await worker.execute(context);
      const health = worker.getHealth();

      expect(health.healthScore).toBe(100); // One success = 100%
    });
  });
});

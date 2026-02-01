/**
 * Agentic QE v3 - Defect Predictor Worker Unit Tests
 * ADR-014: Background Workers for QE Monitoring
 *
 * TDD Tests for DefectPredictorWorker
 * Tests ML-based defect prediction and hotspot identification
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefectPredictorWorker } from '../../../../src/workers/workers/defect-predictor';
import { WorkerContext } from '../../../../src/workers/interfaces';

function createMockContext(): WorkerContext {
  return {
    eventBus: {
      publish: vi.fn().mockResolvedValue(undefined),
    },
    memory: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      search: vi.fn().mockResolvedValue([]),
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

  beforeEach(() => {
    worker = new DefectPredictorWorker();
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
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.domainMetrics).toHaveProperty('filesAnalyzed');
      expect(result.metrics.domainMetrics).toHaveProperty('highRiskFiles');
      expect(result.metrics.domainMetrics).toHaveProperty('hotspots');
      expect(result.metrics.domainMetrics).toHaveProperty('avgDefectProbability');
    });

    it('should store predictions in memory', async () => {
      const context = createMockContext();

      await worker.execute(context);

      expect(context.memory.set).toHaveBeenCalledWith('defect:predictions', expect.any(Array));
      expect(context.memory.set).toHaveBeenCalledWith('defect:hotspots', expect.any(Array));
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
      const context = createMockContext();

      const result = await worker.execute(context);

      // The mock returns files with high risk levels
      expect(result.findings.some(f =>
        f.type === 'high-defect-risk' || f.type === 'critical-defect-risk'
      )).toBe(true);
    });

    it('should generate recommendations for high risk files', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.recommendations.some(r =>
        r.action.includes('Code Review') || r.action.includes('Risk')
      )).toBe(true);
    });

    it('should include file path in high risk findings', async () => {
      const context = createMockContext();

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
    it('should detect code hotspots', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.findings.some(f => f.type === 'code-hotspots')).toBe(true);
    });

    it('should generate recommendations for hotspots', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.recommendations.some(r =>
        r.action.includes('Hotspot')
      )).toBe(true);
    });
  });

  describe('execute - factor analysis', () => {
    it('should include defect factors in findings', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      const riskFindings = result.findings.filter(f =>
        f.type.includes('defect-risk')
      );

      // At least one finding should have factor information
      expect(riskFindings.some(f =>
        f.context && (f.context.factors || f.context.topFactors)
      )).toBe(true);
    });

    it('should recommend complexity reduction when relevant', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      // The mock data includes high complexity files
      expect(result.recommendations.some(r =>
        r.action.includes('Complexity')
      )).toBe(true);
    });
  });

  describe('health score calculation', () => {
    it('should calculate health score between 0 and 100', async () => {
      const context = createMockContext();

      const result = await worker.execute(context);

      expect(result.metrics.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.metrics.healthScore).toBeLessThanOrEqual(100);
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

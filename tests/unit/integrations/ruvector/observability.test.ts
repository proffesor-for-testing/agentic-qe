/**
 * Agentic QE v3 - RuVector ML Observability Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RuVectorObservability,
  getRuVectorObservability,
  recordMLUsage,
  recordFallback,
  getObservabilityReport,
  type RuVectorComponent,
  type FallbackReason,
  type MLObservabilityConfig,
  type ComponentMetrics,
} from '../../../../src/integrations/ruvector/observability';

describe('RuVectorObservability', () => {
  beforeEach(() => {
    // Reset singleton before each test
    RuVectorObservability.resetInstance();
  });

  afterEach(() => {
    // Clean up after each test
    RuVectorObservability.resetInstance();
    vi.restoreAllMocks();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = RuVectorObservability.getInstance();
      const instance2 = RuVectorObservability.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should reset instance correctly', () => {
      const instance1 = RuVectorObservability.getInstance();
      instance1.recordMLUsage('q-learning-router', true);

      RuVectorObservability.resetInstance();

      const instance2 = RuVectorObservability.getInstance();
      const metrics = instance2.getMetrics();

      expect(metrics.totalMLUsed).toBe(0);
      expect(instance1).not.toBe(instance2);
    });

    it('should accept config only on first call', () => {
      const instance1 = RuVectorObservability.getInstance({
        mlUsageAlertThreshold: 50,
      });

      // This config should be ignored
      const instance2 = RuVectorObservability.getInstance({
        mlUsageAlertThreshold: 10,
      });

      expect(instance1.getConfig().mlUsageAlertThreshold).toBe(50);
      expect(instance2.getConfig().mlUsageAlertThreshold).toBe(50);
    });
  });

  describe('recordMLUsage', () => {
    let obs: RuVectorObservability;

    beforeEach(() => {
      obs = RuVectorObservability.getInstance({ verboseLogging: false });
    });

    it('should record ML usage correctly', () => {
      obs.recordMLUsage('q-learning-router', true, 15.5);

      const metrics = obs.getMetrics();
      expect(metrics.totalMLUsed).toBe(1);
      expect(metrics.totalFallbackUsed).toBe(0);

      const compMetrics = obs.getComponentMetrics('q-learning-router');
      expect(compMetrics).toBeDefined();
      expect(compMetrics!.mlUsedCount).toBe(1);
      expect(compMetrics!.mlLatencies).toContain(15.5);
    });

    it('should record fallback when used is false', () => {
      obs.recordMLUsage('ast-complexity', false);

      const metrics = obs.getMetrics();
      expect(metrics.totalMLUsed).toBe(0);
      expect(metrics.totalFallbackUsed).toBe(1);

      const compMetrics = obs.getComponentMetrics('ast-complexity');
      expect(compMetrics!.fallbackUsedCount).toBe(1);
    });

    it('should track multiple components independently', () => {
      obs.recordMLUsage('q-learning-router', true, 10);
      obs.recordMLUsage('ast-complexity', true, 20);
      obs.recordMLUsage('diff-risk-classifier', false);
      obs.recordMLUsage('q-learning-router', true, 15);

      const metrics = obs.getMetrics();
      expect(metrics.totalMLUsed).toBe(3);
      expect(metrics.totalFallbackUsed).toBe(1);

      const qRouter = obs.getComponentMetrics('q-learning-router');
      expect(qRouter!.mlUsedCount).toBe(2);
      expect(qRouter!.mlLatencies).toEqual([10, 15]);

      const ast = obs.getComponentMetrics('ast-complexity');
      expect(ast!.mlUsedCount).toBe(1);

      const diff = obs.getComponentMetrics('diff-risk-classifier');
      expect(diff!.fallbackUsedCount).toBe(1);
    });

    it('should handle ML usage without latency', () => {
      obs.recordMLUsage('sona', true);

      const compMetrics = obs.getComponentMetrics('sona');
      expect(compMetrics!.mlUsedCount).toBe(1);
      expect(compMetrics!.mlLatencies).toHaveLength(0);
    });

    it('should trim latency history when exceeding max', () => {
      // Reset to get fresh instance with small history config
      RuVectorObservability.resetInstance();
      const obsWithSmallHistory = RuVectorObservability.getInstance({
        maxLatencyHistory: 3,
        verboseLogging: false,
      });

      obsWithSmallHistory.recordMLUsage('sona', true, 1);
      obsWithSmallHistory.recordMLUsage('sona', true, 2);
      obsWithSmallHistory.recordMLUsage('sona', true, 3);
      obsWithSmallHistory.recordMLUsage('sona', true, 4);

      const compMetrics = obsWithSmallHistory.getComponentMetrics('sona');
      expect(compMetrics!.mlLatencies).toEqual([2, 3, 4]);
    });

    it('should update timestamps correctly', async () => {
      obs.recordMLUsage('flash-attention', true);
      const first = obs.getComponentMetrics('flash-attention')!.firstSeen;
      const lastBefore = obs.getComponentMetrics('flash-attention')!.lastSeen;

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 10));

      obs.recordMLUsage('flash-attention', true);
      const lastAfter = obs.getComponentMetrics('flash-attention')!.lastSeen;

      expect(obs.getComponentMetrics('flash-attention')!.firstSeen).toEqual(first);
      expect(lastAfter.getTime()).toBeGreaterThanOrEqual(lastBefore.getTime());
    });
  });

  describe('recordFallback', () => {
    let obs: RuVectorObservability;

    beforeEach(() => {
      obs = RuVectorObservability.getInstance({ verboseLogging: false });
    });

    it('should record fallback with reason', () => {
      obs.recordFallback('coverage-router', 'timeout');

      const compMetrics = obs.getComponentMetrics('coverage-router');
      expect(compMetrics!.fallbackUsedCount).toBe(1);
      expect(compMetrics!.fallbackReasons.get('timeout')).toBe(1);
    });

    it('should track multiple fallback reasons', () => {
      obs.recordFallback('gnn-index', 'timeout');
      obs.recordFallback('gnn-index', 'timeout');
      obs.recordFallback('gnn-index', 'error');
      obs.recordFallback('gnn-index', 'unavailable');

      const compMetrics = obs.getComponentMetrics('gnn-index');
      expect(compMetrics!.fallbackUsedCount).toBe(4);
      expect(compMetrics!.fallbackReasons.get('timeout')).toBe(2);
      expect(compMetrics!.fallbackReasons.get('error')).toBe(1);
      expect(compMetrics!.fallbackReasons.get('unavailable')).toBe(1);
    });

    it('should support all fallback reasons', () => {
      const reasons: FallbackReason[] = [
        'disabled',
        'unavailable',
        'timeout',
        'error',
        'config',
        'feature-flag',
        'unknown',
      ];

      for (const reason of reasons) {
        obs.recordFallback('graph-boundaries', reason);
      }

      const compMetrics = obs.getComponentMetrics('graph-boundaries');
      expect(compMetrics!.fallbackUsedCount).toBe(reasons.length);

      for (const reason of reasons) {
        expect(compMetrics!.fallbackReasons.get(reason)).toBe(1);
      }
    });
  });

  describe('checkAndAlert', () => {
    let obs: RuVectorObservability;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      obs = RuVectorObservability.getInstance({
        mlUsageAlertThreshold: 20,
        enableConsoleAlerts: true,
        verboseLogging: false,
      });
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('should not alert when ML usage is above threshold', () => {
      // 8 ML, 2 fallback = 80% ML usage
      for (let i = 0; i < 8; i++) {
        obs.recordMLUsage('q-learning-router', true);
      }
      obs.recordFallback('q-learning-router', 'timeout');
      obs.recordFallback('q-learning-router', 'error');

      const alerts = obs.checkAndAlert();

      expect(alerts).toHaveLength(0);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should alert when global ML usage drops below threshold', () => {
      // 1 ML, 9 fallback = 10% ML usage (below 20% threshold)
      obs.recordMLUsage('q-learning-router', true);
      for (let i = 0; i < 9; i++) {
        obs.recordFallback('q-learning-router', 'unavailable');
      }

      const alerts = obs.checkAndAlert();

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].component).toBe('global');
      expect(alerts[0].currentPercentage).toBe(10);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('should alert for specific component with low ML usage', () => {
      // Component 1: 80% ML (good)
      for (let i = 0; i < 8; i++) {
        obs.recordMLUsage('q-learning-router', true);
      }
      obs.recordFallback('q-learning-router', 'timeout');
      obs.recordFallback('q-learning-router', 'timeout');

      // Component 2: 0% ML (bad)
      for (let i = 0; i < 6; i++) {
        obs.recordFallback('ast-complexity', 'disabled');
      }

      const alerts = obs.checkAndAlert();

      // Should have alert for ast-complexity
      const astAlert = alerts.find((a) => a.component === 'ast-complexity');
      expect(astAlert).toBeDefined();
      expect(astAlert!.currentPercentage).toBe(0);
    });

    it('should not alert if not enough data points', () => {
      // Only 3 calls total (below minimum of 10)
      obs.recordFallback('sona', 'unavailable');
      obs.recordFallback('sona', 'unavailable');
      obs.recordFallback('sona', 'unavailable');

      const alerts = obs.checkAndAlert();

      expect(alerts).toHaveLength(0);
    });

    it('should respect enableConsoleAlerts config', () => {
      RuVectorObservability.resetInstance();
      const obsNoConsole = RuVectorObservability.getInstance({
        enableConsoleAlerts: false,
        mlUsageAlertThreshold: 20,
      });

      for (let i = 0; i < 10; i++) {
        obsNoConsole.recordFallback('q-learning-router', 'error');
      }

      obsNoConsole.checkAndAlert();

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should accumulate alerts in the report', () => {
      // Trigger multiple alerts
      for (let i = 0; i < 10; i++) {
        obs.recordFallback('sona', 'unavailable');
      }

      obs.checkAndAlert();
      obs.checkAndAlert(); // Call again

      const report = obs.getReport();
      expect(report.alerts.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getReport', () => {
    let obs: RuVectorObservability;

    beforeEach(() => {
      obs = RuVectorObservability.getInstance({ verboseLogging: false });
    });

    it('should return complete report structure', () => {
      obs.recordMLUsage('q-learning-router', true, 10);
      obs.recordFallback('ast-complexity', 'timeout');

      const report = obs.getReport();

      expect(report).toHaveProperty('generatedAt');
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('componentBreakdown');
      expect(report).toHaveProperty('alerts');
      expect(report).toHaveProperty('sessionDurationMs');
      expect(report).toHaveProperty('healthStatus');
      expect(report).toHaveProperty('recommendations');
    });

    it('should calculate metrics correctly', () => {
      // 6 ML, 4 fallback = 60% ML usage
      for (let i = 0; i < 6; i++) {
        obs.recordMLUsage('q-learning-router', true, 10 + i);
      }
      for (let i = 0; i < 4; i++) {
        obs.recordFallback('ast-complexity', 'timeout');
      }

      const report = obs.getReport();

      expect(report.metrics.totalMLUsed).toBe(6);
      expect(report.metrics.totalFallbackUsed).toBe(4);
      expect(report.metrics.mlUsagePercentage).toBe(60);
    });

    it('should calculate average latency correctly', () => {
      obs.recordMLUsage('sona', true, 10);
      obs.recordMLUsage('sona', true, 20);
      obs.recordMLUsage('flash-attention', true, 30);

      const report = obs.getReport();

      expect(report.metrics.averageMLLatencyMs).toBe(20); // (10+20+30)/3
    });

    it('should provide component breakdown', () => {
      obs.recordMLUsage('q-learning-router', true, 15);
      obs.recordFallback('q-learning-router', 'timeout');
      obs.recordFallback('ast-complexity', 'error');

      const report = obs.getReport();

      expect(report.componentBreakdown).toHaveLength(2);

      const qRouter = report.componentBreakdown.find(
        (c) => c.component === 'q-learning-router'
      );
      expect(qRouter).toBeDefined();
      expect(qRouter!.mlUsed).toBe(1);
      expect(qRouter!.fallbackUsed).toBe(1);
      expect(qRouter!.mlPercentage).toBe(50);
      expect(qRouter!.avgLatencyMs).toBe(15);

      const ast = report.componentBreakdown.find(
        (c) => c.component === 'ast-complexity'
      );
      expect(ast).toBeDefined();
      expect(ast!.mlUsed).toBe(0);
      expect(ast!.fallbackUsed).toBe(1);
      expect(ast!.avgLatencyMs).toBeNull();
    });

    it('should sort component breakdown by fallback usage', () => {
      obs.recordMLUsage('sona', true);
      obs.recordFallback('ast-complexity', 'timeout');
      obs.recordFallback('ast-complexity', 'timeout');
      obs.recordFallback('ast-complexity', 'timeout');
      obs.recordFallback('q-learning-router', 'error');

      const report = obs.getReport();

      // ast-complexity should be first (most fallbacks)
      expect(report.componentBreakdown[0].component).toBe('ast-complexity');
    });

    it('should include top fallback reasons', () => {
      obs.recordFallback('gnn-index', 'timeout');
      obs.recordFallback('gnn-index', 'timeout');
      obs.recordFallback('gnn-index', 'timeout');
      obs.recordFallback('gnn-index', 'error');
      obs.recordFallback('gnn-index', 'unavailable');

      const report = obs.getReport();

      const gnn = report.componentBreakdown.find(
        (c) => c.component === 'gnn-index'
      );
      expect(gnn!.topFallbackReasons[0]).toEqual({ reason: 'timeout', count: 3 });
    });

    it('should determine health status correctly', () => {
      // Test healthy (>= 80%)
      for (let i = 0; i < 9; i++) {
        obs.recordMLUsage('sona', true);
      }
      obs.recordFallback('sona', 'timeout');

      let report = obs.getReport();
      expect(report.healthStatus).toBe('healthy');

      // Reset and test degraded (50-79%)
      obs.clear();
      for (let i = 0; i < 6; i++) {
        obs.recordMLUsage('sona', true);
      }
      for (let i = 0; i < 4; i++) {
        obs.recordFallback('sona', 'timeout');
      }

      report = obs.getReport();
      expect(report.healthStatus).toBe('degraded');

      // Reset and test critical (< 50%)
      obs.clear();
      obs.recordMLUsage('sona', true);
      for (let i = 0; i < 9; i++) {
        obs.recordFallback('sona', 'timeout');
      }

      report = obs.getReport();
      expect(report.healthStatus).toBe('critical');
    });

    it('should generate recommendations for low ML usage', () => {
      for (let i = 0; i < 10; i++) {
        obs.recordFallback('ast-complexity', 'timeout');
      }

      const report = obs.getReport();

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(
        report.recommendations.some((r) => r.includes('ML usage'))
      ).toBe(true);
    });

    it('should generate recommendations for high latency', () => {
      for (let i = 0; i < 5; i++) {
        obs.recordMLUsage('sona', true, 150); // High latency
      }

      const report = obs.getReport();

      expect(
        report.recommendations.some((r) => r.includes('latency'))
      ).toBe(true);
    });

    it('should generate recommendations for timeout fallbacks', () => {
      obs.recordMLUsage('q-learning-router', true);
      for (let i = 0; i < 5; i++) {
        obs.recordFallback('q-learning-router', 'timeout');
      }

      const report = obs.getReport();

      expect(
        report.recommendations.some((r) => r.includes('timeout'))
      ).toBe(true);
    });
  });

  describe('getMetrics', () => {
    let obs: RuVectorObservability;

    beforeEach(() => {
      obs = RuVectorObservability.getInstance({ verboseLogging: false });
    });

    it('should return empty metrics initially', () => {
      const metrics = obs.getMetrics();

      expect(metrics.totalMLUsed).toBe(0);
      expect(metrics.totalFallbackUsed).toBe(0);
      expect(metrics.mlUsagePercentage).toBe(0);
      expect(metrics.averageMLLatencyMs).toBe(0);
      expect(metrics.alertsTriggered).toBe(0);
      expect(metrics.components.size).toBe(0);
    });

    it('should return correct usage percentage', () => {
      obs.recordMLUsage('sona', true);
      obs.recordMLUsage('sona', true);
      obs.recordMLUsage('sona', true);
      obs.recordFallback('sona', 'timeout');

      const metrics = obs.getMetrics();

      expect(metrics.mlUsagePercentage).toBe(75);
    });

    it('should include session start time', () => {
      const beforeCreation = new Date();
      RuVectorObservability.resetInstance();
      const freshObs = RuVectorObservability.getInstance();
      const afterCreation = new Date();

      const metrics = freshObs.getMetrics();

      expect(metrics.sessionStart.getTime()).toBeGreaterThanOrEqual(
        beforeCreation.getTime()
      );
      expect(metrics.sessionStart.getTime()).toBeLessThanOrEqual(
        afterCreation.getTime()
      );
    });
  });

  describe('Configuration', () => {
    it('should use default config when not provided', () => {
      const obs = RuVectorObservability.getInstance();
      const config = obs.getConfig();

      expect(config.mlUsageAlertThreshold).toBe(20);
      expect(config.enableConsoleAlerts).toBe(true);
      expect(config.maxLatencyHistory).toBe(100);
      expect(config.verboseLogging).toBe(false);
    });

    it('should allow config updates', () => {
      const obs = RuVectorObservability.getInstance();

      obs.updateConfig({ mlUsageAlertThreshold: 30 });

      expect(obs.getConfig().mlUsageAlertThreshold).toBe(30);
    });

    it('should merge partial config updates', () => {
      const obs = RuVectorObservability.getInstance({
        mlUsageAlertThreshold: 25,
        verboseLogging: true,
      });

      obs.updateConfig({ mlUsageAlertThreshold: 35 });

      const config = obs.getConfig();
      expect(config.mlUsageAlertThreshold).toBe(35);
      expect(config.verboseLogging).toBe(true); // Should remain unchanged
    });
  });

  describe('Convenience Functions', () => {
    beforeEach(() => {
      RuVectorObservability.resetInstance();
    });

    it('getRuVectorObservability should return singleton', () => {
      const instance1 = getRuVectorObservability();
      const instance2 = getRuVectorObservability();

      expect(instance1).toBe(instance2);
    });

    it('recordMLUsage function should work', () => {
      recordMLUsage('sona', true, 15);

      const metrics = getRuVectorObservability().getMetrics();
      expect(metrics.totalMLUsed).toBe(1);
    });

    it('recordFallback function should work', () => {
      recordFallback('flash-attention', 'disabled');

      const metrics = getRuVectorObservability().getMetrics();
      expect(metrics.totalFallbackUsed).toBe(1);
    });

    it('getObservabilityReport function should work', () => {
      recordMLUsage('gnn-index', true);

      const report = getObservabilityReport();

      expect(report.metrics.totalMLUsed).toBe(1);
    });
  });

  describe('All Components', () => {
    let obs: RuVectorObservability;

    beforeEach(() => {
      obs = RuVectorObservability.getInstance({ verboseLogging: false });
    });

    it('should support all RuVector component types', () => {
      const components: RuVectorComponent[] = [
        'q-learning-router',
        'ast-complexity',
        'diff-risk-classifier',
        'coverage-router',
        'graph-boundaries',
        'sona',
        'flash-attention',
        'gnn-index',
      ];

      for (const component of components) {
        obs.recordMLUsage(component, true, 10);
        obs.recordFallback(component, 'timeout');
      }

      const metrics = obs.getMetrics();
      expect(metrics.components.size).toBe(components.length);
      expect(metrics.totalMLUsed).toBe(components.length);
      expect(metrics.totalFallbackUsed).toBe(components.length);
    });
  });

  describe('clear', () => {
    let obs: RuVectorObservability;

    beforeEach(() => {
      obs = RuVectorObservability.getInstance({ verboseLogging: false });
    });

    it('should clear all metrics', () => {
      obs.recordMLUsage('sona', true);
      obs.recordFallback('flash-attention', 'timeout');

      obs.clear();

      const metrics = obs.getMetrics();
      expect(metrics.totalMLUsed).toBe(0);
      expect(metrics.totalFallbackUsed).toBe(0);
      expect(metrics.components.size).toBe(0);
    });

    it('should clear alerts', () => {
      // Generate alerts
      for (let i = 0; i < 10; i++) {
        obs.recordFallback('sona', 'error');
      }
      obs.checkAndAlert();

      expect(obs.getReport().alerts.length).toBeGreaterThan(0);

      obs.clear();

      expect(obs.getReport().alerts).toHaveLength(0);
    });
  });

  describe('Edge Cases', () => {
    let obs: RuVectorObservability;

    beforeEach(() => {
      obs = RuVectorObservability.getInstance({ verboseLogging: false });
    });

    it('should handle zero latency', () => {
      obs.recordMLUsage('sona', true, 0);

      const compMetrics = obs.getComponentMetrics('sona');
      expect(compMetrics!.mlLatencies).toContain(0);
    });

    it('should handle very high latency', () => {
      obs.recordMLUsage('sona', true, 999999);

      const compMetrics = obs.getComponentMetrics('sona');
      expect(compMetrics!.mlLatencies).toContain(999999);
    });

    it('should handle rapid successive calls', () => {
      for (let i = 0; i < 100; i++) {
        obs.recordMLUsage('q-learning-router', i % 2 === 0, i);
      }

      const metrics = obs.getMetrics();
      expect(metrics.totalMLUsed).toBe(50);
      expect(metrics.totalFallbackUsed).toBe(50);
    });

    it('should return undefined for unknown component', () => {
      const metrics = obs.getComponentMetrics('sona');
      expect(metrics).toBeUndefined();
    });

    it('should handle report with no data gracefully', () => {
      const report = obs.getReport();

      expect(report.metrics.mlUsagePercentage).toBe(0);
      expect(report.componentBreakdown).toHaveLength(0);
      expect(report.healthStatus).toBe('critical'); // 0% is critical
    });
  });
});

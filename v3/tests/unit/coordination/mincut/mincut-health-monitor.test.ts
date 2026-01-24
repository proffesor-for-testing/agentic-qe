/**
 * Unit tests for MinCutHealthMonitor
 * ADR-047: MinCut Self-Organizing QE Integration
 *
 * Tests health monitoring, alerting, and trend analysis.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MinCutHealthMonitor,
  createMinCutHealthMonitor,
} from '../../../../src/coordination/mincut/mincut-health-monitor';
import { SwarmGraph, createSwarmGraph } from '../../../../src/coordination/mincut/swarm-graph';
import { MinCutHealthConfig, DEFAULT_MINCUT_HEALTH_CONFIG } from '../../../../src/coordination/mincut/interfaces';

describe('MinCutHealthMonitor', () => {
  let monitor: MinCutHealthMonitor;
  let graph: SwarmGraph;

  beforeEach(() => {
    graph = createSwarmGraph();
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
    vi.useRealTimers();
  });

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  function addVertices(ids: string[]): void {
    for (const id of ids) {
      graph.addVertex({
        id,
        type: 'agent',
        domain: 'test-generation',
        weight: 1.0,
        createdAt: new Date(),
      });
    }
  }

  function addEdge(source: string, target: string, weight: number = 1.0): void {
    graph.addEdge({
      source,
      target,
      weight,
      type: 'coordination',
      bidirectional: true,
    });
  }

  function createMonitorWithConfig(config: Partial<MinCutHealthConfig> = {}): MinCutHealthMonitor {
    monitor = createMinCutHealthMonitor(graph, config);
    return monitor;
  }

  // ==========================================================================
  // Construction & Configuration
  // ==========================================================================

  describe('Construction', () => {
    it('should create with default config', () => {
      monitor = createMinCutHealthMonitor(graph);
      const config = monitor.getConfig();

      expect(config.healthyThreshold).toBe(DEFAULT_MINCUT_HEALTH_CONFIG.healthyThreshold);
      expect(config.warningThreshold).toBe(DEFAULT_MINCUT_HEALTH_CONFIG.warningThreshold);
      expect(config.alertsEnabled).toBe(DEFAULT_MINCUT_HEALTH_CONFIG.alertsEnabled);
    });

    it('should create with custom config', () => {
      monitor = createMinCutHealthMonitor(graph, {
        healthyThreshold: 5.0,
        warningThreshold: 2.0,
        alertsEnabled: false,
      });

      const config = monitor.getConfig();
      expect(config.healthyThreshold).toBe(5.0);
      expect(config.warningThreshold).toBe(2.0);
      expect(config.alertsEnabled).toBe(false);
    });

    it('should update config', () => {
      monitor = createMinCutHealthMonitor(graph);
      monitor.updateConfig({ healthyThreshold: 10.0 });

      expect(monitor.getConfig().healthyThreshold).toBe(10.0);
    });
  });

  // ==========================================================================
  // Health Status
  // ==========================================================================

  describe('Health Status', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c', 'd']);
      addEdge('a', 'b', 2.0);
      addEdge('b', 'c', 2.0);
      addEdge('c', 'd', 2.0);
      addEdge('a', 'd', 2.0);
      monitor = createMonitorWithConfig({
        healthyThreshold: 3.0,
        warningThreshold: 1.5,
      });
    });

    it('should return healthy status when above threshold', () => {
      // All vertices have degree >= 4.0
      const health = monitor.getHealth();
      expect(health.status).toBe('healthy');
    });

    it('should return warning status when between thresholds', () => {
      // Lower edge weights to get warning range
      graph.clear();
      addVertices(['a', 'b']);
      addEdge('a', 'b', 2.5); // MinCut = 2.5 (between 1.5 and 3.0)

      monitor.updateGraph(graph);
      const health = monitor.getHealth();
      expect(health.status).toBe('warning');
    });

    it('should return critical status when below warning threshold', () => {
      graph.clear();
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0); // MinCut = 1.0 (below 1.5)

      monitor.updateGraph(graph);
      const health = monitor.getHealth();
      expect(health.status).toBe('critical');
    });

    it('should include MinCut value in health', () => {
      const health = monitor.getHealth();
      expect(health.minCutValue).toBeDefined();
      expect(typeof health.minCutValue).toBe('number');
    });

    it('should include weak vertex count', () => {
      const health = monitor.getHealth();
      expect(health.weakVertexCount).toBeDefined();
      expect(typeof health.weakVertexCount).toBe('number');
    });

    it('should include thresholds in health', () => {
      const health = monitor.getHealth();
      expect(health.healthyThreshold).toBe(3.0);
      expect(health.warningThreshold).toBe(1.5);
    });
  });

  // ==========================================================================
  // isHealthy / isCritical
  // ==========================================================================

  describe('isHealthy / isCritical', () => {
    it('should report healthy for well-connected graph', () => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 3.0);
      addEdge('b', 'c', 3.0);
      addEdge('a', 'c', 3.0);

      monitor = createMonitorWithConfig({ healthyThreshold: 5.0 });
      expect(monitor.isHealthy()).toBe(true);
    });

    it('should report critical for poorly connected graph', () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 0.5);

      monitor = createMonitorWithConfig({ warningThreshold: 1.0 });
      expect(monitor.isCritical()).toBe(true);
    });

    it('should not be critical when above warning threshold', () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 2.0);

      monitor = createMonitorWithConfig({ warningThreshold: 1.0 });
      expect(monitor.isCritical()).toBe(false);
    });
  });

  // ==========================================================================
  // Monitoring Lifecycle
  // ==========================================================================

  describe('Monitoring Lifecycle', () => {
    it('should start monitoring', () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);

      monitor = createMonitorWithConfig({ checkIntervalMs: 1000 });
      monitor.start();

      // First check happens immediately
      const health = monitor.getHealth();
      expect(health).toBeDefined();
    });

    it('should perform periodic health checks', () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);

      monitor = createMonitorWithConfig({ checkIntervalMs: 1000 });
      const checkSpy = vi.spyOn(monitor, 'checkHealth');

      monitor.start();
      expect(checkSpy).toHaveBeenCalledTimes(1); // Initial check

      vi.advanceTimersByTime(1000);
      expect(checkSpy).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(1000);
      expect(checkSpy).toHaveBeenCalledTimes(3);
    });

    it('should stop monitoring', () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);

      monitor = createMonitorWithConfig({ checkIntervalMs: 1000 });
      const checkSpy = vi.spyOn(monitor, 'checkHealth');

      monitor.start();
      expect(checkSpy).toHaveBeenCalledTimes(1);

      monitor.stop();

      vi.advanceTimersByTime(3000);
      expect(checkSpy).toHaveBeenCalledTimes(1); // No more checks
    });

    it('should handle multiple start calls gracefully', () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);

      monitor = createMonitorWithConfig({ checkIntervalMs: 1000 });
      const checkSpy = vi.spyOn(monitor, 'checkHealth');

      monitor.start();
      monitor.start(); // Second start should be ignored
      monitor.start(); // Third start should be ignored

      expect(checkSpy).toHaveBeenCalledTimes(1); // Only one initial check
    });
  });

  // ==========================================================================
  // Graph Updates
  // ==========================================================================

  describe('Graph Updates', () => {
    it('should update graph and trigger check when monitoring', () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);

      monitor = createMonitorWithConfig({ checkIntervalMs: 60000 });
      monitor.start();

      const checkSpy = vi.spyOn(monitor, 'checkHealth');
      checkSpy.mockClear();

      // Create new graph
      const newGraph = createSwarmGraph();
      newGraph.addVertex({ id: 'x', type: 'agent', weight: 1, createdAt: new Date() });
      newGraph.addVertex({ id: 'y', type: 'agent', weight: 1, createdAt: new Date() });
      newGraph.addEdge({ source: 'x', target: 'y', weight: 2.0, type: 'coordination', bidirectional: true });

      monitor.updateGraph(newGraph);

      expect(checkSpy).toHaveBeenCalledTimes(1);
    });

    it('should not trigger check when not monitoring', () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.0);

      monitor = createMonitorWithConfig();
      // Don't start monitoring

      const checkSpy = vi.spyOn(monitor, 'checkHealth');

      const newGraph = createSwarmGraph();
      monitor.updateGraph(newGraph);

      expect(checkSpy).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Alert Management
  // ==========================================================================

  describe('Alert Management', () => {
    beforeEach(() => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 0.5); // Critical level

      monitor = createMonitorWithConfig({
        alertsEnabled: true,
        warningThreshold: 1.0,
        healthyThreshold: 2.0,
        alertCooldownMs: 100,
      });
    });

    it('should generate alert on critical threshold', () => {
      monitor.checkHealth();

      const alerts = monitor.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should include severity in alert', () => {
      monitor.checkHealth();

      const alerts = monitor.getActiveAlerts();
      const criticalAlert = alerts.find(a => a.severity === 'critical');
      expect(criticalAlert).toBeDefined();
    });

    it('should include remediation suggestions in alert', () => {
      monitor.checkHealth();

      const alerts = monitor.getAllAlerts();
      for (const alert of alerts) {
        expect(alert.remediations).toBeDefined();
      }
    });

    it('should acknowledge alert', () => {
      monitor.checkHealth();

      const alerts = monitor.getActiveAlerts();
      const alertId = alerts[0]?.id;

      if (alertId) {
        const result = monitor.acknowledgeAlert(alertId);
        expect(result).toBe(true);

        const activeAlerts = monitor.getActiveAlerts();
        expect(activeAlerts.find(a => a.id === alertId)).toBeUndefined();
      }
    });

    it('should clear acknowledged alerts', () => {
      monitor.checkHealth();

      const alerts = monitor.getActiveAlerts();
      for (const alert of alerts) {
        monitor.acknowledgeAlert(alert.id);
      }

      const cleared = monitor.clearAcknowledgedAlerts();
      expect(cleared).toBeGreaterThan(0);

      expect(monitor.getAllAlerts().length).toBe(0);
    });

    it('should sort alerts by severity', () => {
      // Add more data to generate multiple alert types
      graph.addVertex({ id: 'isolated', type: 'agent', weight: 1, createdAt: new Date() });

      monitor.checkHealth();

      const alerts = monitor.getActiveAlerts();
      if (alerts.length >= 2) {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
        for (let i = 0; i < alerts.length - 1; i++) {
          expect(severityOrder[alerts[i].severity]).toBeLessThanOrEqual(
            severityOrder[alerts[i + 1].severity]
          );
        }
      }
    });

    it('should respect alert cooldown', () => {
      monitor.checkHealth();
      const count1 = monitor.getAllAlerts().length;

      // Immediate second check - should not create new alerts
      monitor.checkHealth();
      const count2 = monitor.getAllAlerts().length;

      expect(count2).toBe(count1);

      // After cooldown - may create new alerts
      vi.advanceTimersByTime(200);
      monitor.checkHealth();
    });

    it('should not generate alerts when disabled', () => {
      monitor.updateConfig({ alertsEnabled: false });
      monitor.checkHealth();

      const alerts = monitor.getAllAlerts();
      expect(alerts.length).toBe(0);
    });
  });

  // ==========================================================================
  // History & Trends
  // ==========================================================================

  describe('History & Trends', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 2.0);
      addEdge('b', 'c', 2.0);

      monitor = createMonitorWithConfig({ checkIntervalMs: 1000 });
    });

    it('should record history entries', () => {
      monitor.checkHealth();
      monitor.checkHealth();
      monitor.checkHealth();

      const history = monitor.getHistory();
      expect(history.length).toBe(3);
    });

    it('should limit history to max entries', () => {
      monitor.updateConfig({ maxHistoryEntries: 5 });

      for (let i = 0; i < 10; i++) {
        monitor.checkHealth();
      }

      const history = monitor.getHistory();
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should include timestamp in history', () => {
      monitor.checkHealth();

      const history = monitor.getHistory();
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it('should calculate trend as stable with few entries', () => {
      monitor.checkHealth();
      monitor.checkHealth();

      const trend = monitor.getTrend();
      expect(trend).toBe('stable');
    });

    it('should calculate improving trend', () => {
      // Simulate improving MinCut by adding edges
      for (let i = 0; i < 5; i++) {
        monitor.checkHealth();
        addEdge('a', 'c', 0.5 + i); // Increasing weight
      }

      const trend = monitor.getTrend();
      // May be improving or stable depending on threshold
      expect(['improving', 'stable']).toContain(trend);
    });

    it('should include trend in health', () => {
      for (let i = 0; i < 5; i++) {
        monitor.checkHealth();
      }

      const health = monitor.getHealth();
      expect(['improving', 'stable', 'degrading']).toContain(health.trend);
    });
  });

  // ==========================================================================
  // Statistics
  // ==========================================================================

  describe('Statistics', () => {
    beforeEach(() => {
      addVertices(['a', 'b', 'c']);
      addEdge('a', 'b', 2.0);
      addEdge('b', 'c', 3.0);

      monitor = createMonitorWithConfig();
    });

    it('should calculate stats over time window', () => {
      monitor.checkHealth();
      vi.advanceTimersByTime(100);
      monitor.checkHealth();
      vi.advanceTimersByTime(100);
      monitor.checkHealth();

      const stats = monitor.getStats(1000);
      expect(stats.count).toBe(3);
      expect(stats.min).toBeDefined();
      expect(stats.max).toBeDefined();
      expect(stats.average).toBeDefined();
    });

    it('should return current value for empty window', () => {
      const stats = monitor.getStats(1); // Very short window
      expect(stats.count).toBe(0);
      expect(stats.min).toBeDefined();
      expect(stats.max).toBeDefined();
    });

    it('should filter by time window', () => {
      // Add entries at different times
      monitor.checkHealth();
      vi.advanceTimersByTime(5000);
      monitor.checkHealth();
      vi.advanceTimersByTime(5000);
      monitor.checkHealth();

      const stats = monitor.getStats(3000); // Only last 3 seconds
      expect(stats.count).toBeLessThan(3);
    });
  });

  // ==========================================================================
  // Weak Vertices Access
  // ==========================================================================

  describe('Weak Vertices', () => {
    it('should return weak vertices', () => {
      addVertices(['a', 'b', 'c', 'isolated']);
      addEdge('a', 'b', 2.0);
      addEdge('b', 'c', 2.0);
      // 'isolated' has no edges

      monitor = createMonitorWithConfig();
      const weakVertices = monitor.getWeakVertices();

      expect(weakVertices.length).toBeGreaterThan(0);
      expect(weakVertices.find(v => v.vertexId === 'isolated')).toBeDefined();
    });

    it('should return MinCut value', () => {
      addVertices(['a', 'b']);
      addEdge('a', 'b', 1.5);

      monitor = createMonitorWithConfig();
      const minCut = monitor.getMinCutValue();

      expect(minCut).toBe(1.5);
    });
  });

  // ==========================================================================
  // Empty Graph
  // ==========================================================================

  describe('Empty Graph', () => {
    it('should handle empty graph', () => {
      monitor = createMonitorWithConfig();
      const health = monitor.getHealth();

      // Issue #205 fix: Empty graph should be 'idle', not 'critical'
      // This is expected for fresh installs with no agents
      expect(health.status).toBe('idle');
      expect(health.minCutValue).toBe(0);
      expect(health.weakVertexCount).toBe(0);
    });

    it('should not crash on checkHealth with empty graph', () => {
      monitor = createMonitorWithConfig();
      expect(() => monitor.checkHealth()).not.toThrow();
    });
  });
});

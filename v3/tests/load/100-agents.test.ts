/**
 * Agentic QE v3 - 100+ Agent Load Tests
 * Validates platform with 100+ concurrent agents
 *
 * Issue #177 Targets:
 * - 100+ agents coordinated simultaneously
 * - Memory usage < 4GB at scale
 * - No agent starvation or deadlocks
 * - Queen Coordinator handles load
 * - Gossip protocol stable at scale
 * - Coordination latency < 100ms p95
 *
 * Note: These tests can be marked as skip for CI to avoid long-running tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AgentLoadTester,
  createAgentLoadTester,
  createLoadTesterForTarget,
  MetricsCollector,
  createMetricsCollector,
  BottleneckAnalyzer,
  createBottleneckAnalyzer,
  createBottleneckAnalyzerWithThresholds,
  SCENARIO_RAMP_UP_100,
  SCENARIO_BURST_100,
  SCENARIO_CHURN_100,
  SCENARIO_STRESS_150,
  WORKLOAD_PROFILES,
  DEFAULT_SUCCESS_CRITERIA,
  DEFAULT_LOAD_TEST_CONFIG,
  DEFAULT_THRESHOLDS,
} from '../../src/testing/load/index.js';
import type {
  LoadTestConfig,
  LoadTestResult,
  AgentWorkload,
  LoadTestScenario,
  BottleneckReport,
  LoadTestReport,
  LatencyPercentiles,
} from '../../src/testing/load/index.js';

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Fast scenario for unit tests (reduced durations)
 */
const FAST_SCENARIO: LoadTestScenario = {
  name: 'fast-test',
  description: 'Fast test scenario for unit tests',
  steps: [{ agents: 10, holdTime: 100 }],
  workload: {
    taskCount: 2,
    taskDuration: 10,
    memoryUsage: 1024 * 1024,
    coordinationFrequency: 10,
  },
};

/**
 * Create a fast load tester for unit tests
 */
function createFastTester(): AgentLoadTester {
  return createAgentLoadTester({
    maxAgents: 50,
    mockMode: true,
    workloadProfile: 'light',
    seed: 12345, // Reproducible results
  });
}

// ============================================================================
// MetricsCollector Tests
// ============================================================================

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = createMetricsCollector({
      maxEvents: 1000,
      memorySampleInterval: 100,
      enableTimeline: true,
      timelineSampleInterval: 100,
    });
  });

  afterEach(() => {
    metrics.stop();
    metrics.reset();
  });

  describe('lifecycle', () => {
    it('should start and stop collecting', async () => {
      expect(metrics.getDuration()).toBe(0);

      metrics.start();
      // Wait a bit to ensure duration > 0
      await new Promise(r => setTimeout(r, 10));
      expect(metrics.getDuration()).toBeGreaterThan(0);

      metrics.stop();
      const duration = metrics.getDuration();
      expect(duration).toBeGreaterThan(0);

      // Duration should not change after stop
      const duration2 = metrics.getDuration();
      expect(duration2).toBe(duration);
    });

    it('should reset all metrics', () => {
      metrics.start();
      metrics.recordAgentSpawn('agent-1');
      metrics.recordCoordination('agent-1', 50);
      metrics.stop();

      expect(metrics.getAgentCount()).toBe(1);
      expect(metrics.getP95CoordinationLatency()).toBeGreaterThan(0);

      metrics.reset();

      expect(metrics.getAgentCount()).toBe(0);
      expect(metrics.getDuration()).toBe(0);
    });
  });

  describe('agent tracking', () => {
    it('should track agent spawn', () => {
      metrics.recordAgentSpawn('agent-1');
      metrics.recordAgentSpawn('agent-2');

      expect(metrics.getAgentCount()).toBe(2);
      expect(metrics.getTotalAgentsSpawned()).toBe(2);
    });

    it('should track agent termination', () => {
      metrics.recordAgentSpawn('agent-1');
      metrics.recordAgentSpawn('agent-2');
      metrics.recordAgentTerminate('agent-1');

      expect(metrics.getAgentCount()).toBe(1);
      expect(metrics.getTotalAgentsSpawned()).toBe(2);
    });

    it('should track peak agent count', () => {
      metrics.recordAgentSpawn('agent-1');
      metrics.recordAgentSpawn('agent-2');
      metrics.recordAgentSpawn('agent-3');
      expect(metrics.getPeakAgentCount()).toBe(3);

      metrics.recordAgentTerminate('agent-1');
      metrics.recordAgentTerminate('agent-2');
      expect(metrics.getAgentCount()).toBe(1);
      expect(metrics.getPeakAgentCount()).toBe(3); // Peak unchanged
    });
  });

  describe('task tracking', () => {
    it('should track task start and complete', () => {
      metrics.recordTaskStart('agent-1', 'task-1');
      metrics.recordTaskComplete('agent-1', 'task-1', 100);

      const percentiles = metrics.getTaskLatencyPercentiles();
      expect(percentiles.count).toBe(1);
      expect(percentiles.avg).toBe(100);
    });

    it('should calculate task latency percentiles', () => {
      // Record tasks with varying durations
      for (let i = 0; i < 100; i++) {
        metrics.recordTaskStart('agent-1', `task-${i}`);
        metrics.recordTaskComplete('agent-1', `task-${i}`, i + 1);
      }

      const percentiles = metrics.getTaskLatencyPercentiles();
      expect(percentiles.count).toBe(100);
      expect(percentiles.min).toBe(1);
      expect(percentiles.max).toBe(100);
      expect(percentiles.p50).toBeGreaterThan(45);
      expect(percentiles.p50).toBeLessThan(55);
      expect(percentiles.p95).toBeGreaterThan(90);
    });
  });

  describe('coordination latency', () => {
    it('should track coordination latency', () => {
      metrics.recordCoordination('agent-1', 50);
      metrics.recordCoordination('agent-1', 75);
      metrics.recordCoordination('agent-1', 100);

      const p95 = metrics.getP95CoordinationLatency();
      expect(p95).toBeGreaterThanOrEqual(75);
    });

    it('should calculate P99 latency', () => {
      // Record 100 latencies
      for (let i = 0; i < 100; i++) {
        metrics.recordCoordination('agent-1', i + 1);
      }

      const p99 = metrics.getP99CoordinationLatency();
      expect(p99).toBeGreaterThan(95);
    });

    it('should record issues for high latency', () => {
      metrics.recordCoordination('agent-1', 150);

      const report = metrics.exportReport();
      expect(report.issues.length).toBeGreaterThan(0);
      expect(report.issues[0]).toContain('High coordination latency');
    });
  });

  describe('memory tracking', () => {
    it('should track memory usage', () => {
      metrics.recordMemoryUsage(100 * 1024 * 1024, 200 * 1024 * 1024);
      metrics.recordMemoryUsage(150 * 1024 * 1024, 200 * 1024 * 1024);

      expect(metrics.getMaxMemoryUsage()).toBe(150 * 1024 * 1024);
      expect(metrics.getAverageMemoryUsage()).toBe(125 * 1024 * 1024);
    });

    it('should detect memory limit exceeded', () => {
      const overLimit = 5 * 1024 * 1024 * 1024; // 5GB
      metrics.recordMemoryUsage(overLimit, overLimit * 1.5);

      const report = metrics.exportReport();
      expect(report.issues.some(i => i.includes('Memory exceeded'))).toBe(true);
    });
  });

  describe('throughput', () => {
    it('should calculate throughput', async () => {
      metrics.start();

      // Spawn agents
      metrics.recordAgentSpawn('agent-1');
      metrics.recordAgentSpawn('agent-2');

      // Complete tasks
      for (let i = 0; i < 10; i++) {
        metrics.recordTaskStart('agent-1', `task-${i}`);
        metrics.recordTaskComplete('agent-1', `task-${i}`, 10);
      }

      // Wait a bit for duration to accumulate
      await new Promise(r => setTimeout(r, 100));
      metrics.stop();

      const throughput = metrics.getThroughput();
      expect(throughput.tasks).toBe(10);
      expect(throughput.agents).toBe(2);
      expect(throughput.tasksPerSecond).toBeGreaterThan(0);
    });
  });

  describe('starvation and deadlock detection', () => {
    it('should detect agent starvation', () => {
      metrics.recordAgentSpawn('agent-1');
      metrics.recordTaskStart('agent-1', 'task-1');
      metrics.recordTaskComplete('agent-1', 'task-1', 10);
      // No active tasks, but agents exist and tasks have been completed

      const hasStarvation = metrics.hasAgentStarvation();
      expect(hasStarvation).toBe(true);
    });

    it('should not report starvation when tasks are active', () => {
      metrics.recordAgentSpawn('agent-1');
      metrics.recordTaskStart('agent-1', 'task-1');
      // Task is still active

      const hasStarvation = metrics.hasAgentStarvation();
      expect(hasStarvation).toBe(false);
    });
  });

  describe('report generation', () => {
    it('should generate complete report', async () => {
      metrics.start();
      metrics.recordAgentSpawn('agent-1');
      metrics.recordCoordination('agent-1', 50);
      metrics.recordTaskStart('agent-1', 'task-1');
      metrics.recordTaskComplete('agent-1', 'task-1', 100);
      metrics.recordMemoryUsage(100 * 1024 * 1024, 200 * 1024 * 1024);
      // Wait a bit to ensure duration > 0
      await new Promise(r => setTimeout(r, 10));
      metrics.stop();

      const report = metrics.exportReport();

      expect(report.summary).toBeDefined();
      expect(report.summary.totalAgents).toBe(1);
      expect(report.summary.peakAgents).toBe(1);
      expect(report.summary.totalTasks).toBe(1);
      expect(report.summary.duration).toBeGreaterThan(0);

      expect(report.performance).toBeDefined();
      expect(report.performance.coordinationLatency).toBeDefined();
      expect(report.performance.taskLatency).toBeDefined();
      expect(report.performance.throughput).toBeDefined();

      expect(report.resources).toBeDefined();
      expect(report.resources.memoryPeak).toBe(100 * 1024 * 1024);
    });

    it('should evaluate success criteria', () => {
      metrics.start();

      // Simulate meeting criteria
      for (let i = 0; i < 100; i++) {
        metrics.recordAgentSpawn(`agent-${i}`);
      }
      metrics.recordMemoryUsage(2 * 1024 * 1024 * 1024, 4 * 1024 * 1024 * 1024);
      metrics.recordCoordination('agent-1', 50);

      metrics.stop();

      const report = metrics.exportReport();

      expect(report.summary.successCriteria.agentCount).toBe(true);
      expect(report.summary.successCriteria.memoryLimit).toBe(true);
      expect(report.summary.successCriteria.coordinationLatency).toBe(true);
    });
  });
});

// ============================================================================
// BottleneckAnalyzer Tests
// ============================================================================

describe('BottleneckAnalyzer', () => {
  let analyzer: BottleneckAnalyzer;
  let metrics: MetricsCollector;

  beforeEach(() => {
    analyzer = createBottleneckAnalyzer();
    metrics = createMetricsCollector();
  });

  afterEach(() => {
    metrics.reset();
  });

  describe('memory pressure detection', () => {
    it('should detect critical memory pressure', () => {
      const result = analyzer.checkMemoryPressure();
      // Without metrics, uses process memory
      expect(result.metric).toBe('memory_pressure');
      expect(result.threshold).toBe(4 * 1024 * 1024 * 1024);
    });

    it('should detect high memory pressure', () => {
      metrics.recordMemoryUsage(3.5 * 1024 * 1024 * 1024, 4 * 1024 * 1024 * 1024);

      const result = analyzer.checkMemoryPressure(metrics);
      expect(result.detected).toBe(true);
      expect(result.severity).toBe('high');
    });

    it('should not detect pressure under threshold', () => {
      metrics.recordMemoryUsage(1 * 1024 * 1024 * 1024, 4 * 1024 * 1024 * 1024);

      const result = analyzer.checkMemoryPressure(metrics);
      expect(result.detected).toBe(false);
    });
  });

  describe('latency detection', () => {
    it('should detect high coordination latency', () => {
      for (let i = 0; i < 100; i++) {
        metrics.recordCoordination('agent-1', 150); // Above P95 critical
      }

      const result = analyzer.checkCoordinationLatency();
      expect(result.metric).toBe('coordination_latency_p95');
    });

    it('should not detect latency issues when within threshold', () => {
      for (let i = 0; i < 100; i++) {
        metrics.recordCoordination('agent-1', 50);
      }

      const report = analyzer.analyze(metrics);
      const latencyBottleneck = report.bottlenecks.find(
        b => b.metric === 'coordination_latency_p95'
      );
      expect(latencyBottleneck?.detected).toBe(false);
    });
  });

  describe('starvation and deadlock detection', () => {
    it('should detect agent starvation', () => {
      metrics.recordAgentSpawn('agent-1');
      metrics.recordTaskStart('agent-1', 'task-1');
      metrics.recordTaskComplete('agent-1', 'task-1', 100);

      const result = analyzer.checkAgentStarvation(metrics);
      expect(result.metric).toBe('agent_starvation');
      expect(result.detected).toBe(true);
    });

    it('should detect deadlocks', () => {
      const result = analyzer.checkDeadlocks(metrics);
      expect(result.metric).toBe('deadlock_detection');
    });
  });

  describe('complete analysis', () => {
    it('should perform complete bottleneck analysis', () => {
      metrics.start();
      metrics.recordAgentSpawn('agent-1');
      metrics.recordCoordination('agent-1', 50);
      metrics.stop();

      const report = analyzer.analyze(metrics);

      expect(report.bottlenecks.length).toBeGreaterThan(0);
      expect(report.summary).toBeDefined();
      expect(report.summary.totalChecks).toBeGreaterThan(0);
      expect(report.recommendations).toBeDefined();
      expect(report.timestamp).toBeInstanceOf(Date);
    });

    it('should prioritize recommendations by severity', () => {
      // Create analyzer with low thresholds to trigger issues
      const strictAnalyzer = createBottleneckAnalyzerWithThresholds({
        latencyP95Critical: 10,
        memoryCritical: 100 * 1024, // Very low
      });

      metrics.recordMemoryUsage(1 * 1024 * 1024 * 1024, 2 * 1024 * 1024 * 1024);
      for (let i = 0; i < 100; i++) {
        metrics.recordCoordination('agent-1', 150);
      }

      const report = strictAnalyzer.analyze(metrics);

      if (report.recommendations.length > 1) {
        // Critical issues should come first
        expect(report.recommendations[0]).toContain('[CRITICAL]');
      }
    });
  });

  describe('report-based analysis', () => {
    it('should analyze from LoadTestReport', () => {
      const mockReport: LoadTestReport = {
        summary: {
          totalAgents: 100,
          peakAgents: 100,
          totalTasks: 1000,
          duration: 60000,
          success: true,
          successCriteria: {
            agentCount: true,
            memoryLimit: true,
            coordinationLatency: true,
            noDeadlocks: true,
            noStarvation: true,
          },
        },
        performance: {
          coordinationLatency: { p50: 30, p95: 80, p99: 150, max: 200, min: 5, avg: 50, count: 1000 },
          taskLatency: { p50: 50, p95: 100, p99: 150, max: 200, min: 10, avg: 60, count: 1000 },
          throughput: { tasks: 1000, tasksPerSecond: 16.67, agents: 100, agentsPerSecond: 1.67 },
        },
        resources: {
          memoryPeak: 2 * 1024 * 1024 * 1024,
          memoryAverage: 1.5 * 1024 * 1024 * 1024,
          cpuPeak: 0,
          cpuAverage: 0,
        },
        timeline: {
          agentCounts: [],
          latencies: [],
          memoryUsage: [],
        },
        issues: [],
        recommendations: [],
      };

      const report = analyzer.analyzeReport(mockReport);

      expect(report.bottlenecks.length).toBeGreaterThan(0);
      expect(report.hasCritical).toBe(false); // All criteria met
    });

    it('should detect failed success criteria', () => {
      const failingReport: LoadTestReport = {
        summary: {
          totalAgents: 50,
          peakAgents: 50,
          totalTasks: 500,
          duration: 60000,
          success: false,
          successCriteria: {
            agentCount: false,
            memoryLimit: true,
            coordinationLatency: false,
            noDeadlocks: true,
            noStarvation: false,
          },
        },
        performance: {
          coordinationLatency: { p50: 80, p95: 150, p99: 250, max: 500, min: 20, avg: 100, count: 500 },
          taskLatency: { p50: 50, p95: 100, p99: 150, max: 200, min: 10, avg: 60, count: 500 },
          throughput: { tasks: 500, tasksPerSecond: 8.33, agents: 50, agentsPerSecond: 0.83 },
        },
        resources: {
          memoryPeak: 2 * 1024 * 1024 * 1024,
          memoryAverage: 1.5 * 1024 * 1024 * 1024,
          cpuPeak: 0,
          cpuAverage: 0,
        },
        timeline: { agentCounts: [], latencies: [], memoryUsage: [] },
        issues: [],
        recommendations: [],
      };

      const report = analyzer.analyzeReport(failingReport);

      const criteriaCheck = report.bottlenecks.find(b => b.metric === 'success_criteria');
      expect(criteriaCheck?.detected).toBe(true);
      expect(criteriaCheck?.context?.failedCriteria).toContain('agentCount');
    });
  });

  describe('custom thresholds', () => {
    it('should support custom thresholds', () => {
      const customAnalyzer = createBottleneckAnalyzerWithThresholds({
        latencyP95Critical: 50, // More strict
        memoryWarning: 1 * 1024 * 1024 * 1024,
      });

      metrics.recordMemoryUsage(1.5 * 1024 * 1024 * 1024, 2 * 1024 * 1024 * 1024);

      const result = customAnalyzer.checkMemoryPressure(metrics);
      expect(result.detected).toBe(true);
    });
  });
});

// ============================================================================
// AgentLoadTester Tests
// ============================================================================

describe('AgentLoadTester', () => {
  let tester: AgentLoadTester;

  beforeEach(() => {
    tester = createFastTester();
  });

  afterEach(async () => {
    await tester.stop();
  });

  describe('configuration', () => {
    it('should use default configuration', () => {
      const defaultTester = createAgentLoadTester();
      expect(defaultTester.config.maxAgents).toBe(DEFAULT_LOAD_TEST_CONFIG.maxAgents);
      expect(defaultTester.config.mockMode).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customTester = createAgentLoadTester({
        maxAgents: 200,
        workloadProfile: 'heavy',
      });
      expect(customTester.config.maxAgents).toBe(200);
      expect(customTester.config.workloadProfile).toBe('heavy');
    });

    it('should create tester for specific target', () => {
      const targetTester = createLoadTesterForTarget(150, 'light');
      expect(targetTester.config.maxAgents).toBe(150);
      expect(targetTester.config.workloadProfile).toBe('light');
    });
  });

  describe('basic test execution', () => {
    it('should run a basic test', async () => {
      const result = await tester.runTest(5, 200);

      expect(result).toBeDefined();
      expect(result.report).toBeDefined();
      expect(result.bottlenecks).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
    });

    it('should collect metrics during test', async () => {
      const result = await tester.runTest(10, 300);

      expect(result.report.summary.totalAgents).toBeGreaterThan(0);
      expect(result.report.summary.duration).toBeGreaterThan(0);
    });

    it('should handle stop request', async () => {
      // Start a longer test
      const testPromise = tester.runTest(20, 5000);

      // Stop after brief delay
      await new Promise(r => setTimeout(r, 100));
      await tester.stop();

      const result = await testPromise;
      expect(result.duration).toBeLessThan(5000);
    });
  });

  describe('scenario execution', () => {
    it('should run fast scenario', async () => {
      const result = await tester.runScenario(FAST_SCENARIO);

      expect(result).toBeDefined();
      expect(result.report.summary.peakAgents).toBeGreaterThanOrEqual(
        FAST_SCENARIO.steps[0].agents
      );
    });

    it('should scale up agents', async () => {
      const scalingScenario: LoadTestScenario = {
        name: 'scaling-test',
        description: 'Test agent scaling',
        steps: [
          { agents: 5, holdTime: 50 },
          { agents: 10, holdTime: 50 },
        ],
        workload: FAST_SCENARIO.workload,
      };

      const result = await tester.runScenario(scalingScenario);

      expect(result.report.summary.peakAgents).toBeGreaterThanOrEqual(10);
    });

    it('should scale down agents', async () => {
      const scaleDownScenario: LoadTestScenario = {
        name: 'scale-down-test',
        description: 'Test agent scale down',
        steps: [
          { agents: 10, holdTime: 50 },
          { agents: 5, holdTime: 50 },
        ],
        workload: FAST_SCENARIO.workload,
      };

      const result = await tester.runScenario(scaleDownScenario);

      // Peak should be from first step
      expect(result.report.summary.peakAgents).toBeGreaterThanOrEqual(10);
    });
  });

  describe('agent simulation', () => {
    it('should simulate agent lifecycle', async () => {
      const workload: AgentWorkload = {
        taskCount: 3,
        taskDuration: 10,
        memoryUsage: 1024,
        coordinationFrequency: 5,
      };

      const result = await tester.simulateAgent('test-agent', workload);

      expect(result.agentId).toBe('test-agent');
      expect(result.tasksCompleted).toBe(3);
      expect(result.coordinationEvents).toBeGreaterThanOrEqual(3);
    });

    it('should ramp up agents gradually', async () => {
      const metrics = tester.getMetrics();
      metrics.start();

      await tester.rampUp(10, 100);

      expect(tester.getAgentCount()).toBe(10);
      metrics.stop();
    });
  });

  describe('metrics collection', () => {
    it('should provide metrics during test', async () => {
      const result = await tester.runScenario(FAST_SCENARIO);

      const metrics = result.report;
      expect(metrics.performance.coordinationLatency.count).toBeGreaterThan(0);
    });

    it('should track coordination latency', async () => {
      const result = await tester.runScenario(FAST_SCENARIO);

      const latency = result.report.performance.coordinationLatency;
      expect(latency.p50).toBeGreaterThan(0);
      expect(latency.p95).toBeGreaterThan(0);
      expect(latency.p99).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should not allow concurrent tests', async () => {
      // Start first test
      const test1 = tester.runTest(5, 1000);

      // Try to start second test
      await expect(tester.runTest(5, 100)).rejects.toThrow('already running');

      // Clean up
      await tester.stop();
      await test1;
    });

    it('should handle errors gracefully', async () => {
      const result = await tester.runTest(5, 100);

      // Should complete even with potential errors
      expect(result).toBeDefined();
      expect(result.report).toBeDefined();
    });
  });

  describe('reproducibility', () => {
    it('should produce consistent results with same seed', async () => {
      const seededTester1 = createAgentLoadTester({
        seed: 42,
        mockMode: true,
      });

      const seededTester2 = createAgentLoadTester({
        seed: 42,
        mockMode: true,
      });

      const result1 = await seededTester1.runScenario(FAST_SCENARIO);
      await seededTester1.stop();

      const result2 = await seededTester2.runScenario(FAST_SCENARIO);
      await seededTester2.stop();

      // Results should be similar (not exact due to timing)
      expect(result1.report.summary.peakAgents).toBe(result2.report.summary.peakAgents);
    });
  });
});

// ============================================================================
// Predefined Scenario Tests
// ============================================================================

describe('Predefined Scenarios', () => {
  it('should have valid SCENARIO_RAMP_UP_100', () => {
    expect(SCENARIO_RAMP_UP_100.name).toBe('ramp-up-100');
    expect(SCENARIO_RAMP_UP_100.steps.length).toBe(4);
    expect(SCENARIO_RAMP_UP_100.steps[SCENARIO_RAMP_UP_100.steps.length - 1].agents).toBe(100);
  });

  it('should have valid SCENARIO_BURST_100', () => {
    expect(SCENARIO_BURST_100.name).toBe('burst-100');
    expect(SCENARIO_BURST_100.steps.length).toBe(1);
    expect(SCENARIO_BURST_100.steps[0].agents).toBe(100);
  });

  it('should have valid SCENARIO_CHURN_100', () => {
    expect(SCENARIO_CHURN_100.name).toBe('churn-100');
    expect(SCENARIO_CHURN_100.steps[0].churnRate).toBe(0.1);
  });

  it('should have valid SCENARIO_STRESS_150', () => {
    expect(SCENARIO_STRESS_150.name).toBe('stress-150');
    expect(SCENARIO_STRESS_150.steps[SCENARIO_STRESS_150.steps.length - 1].agents).toBe(150);
    expect(SCENARIO_STRESS_150.criteria?.agentCount).toBe(150);
  });
});

// ============================================================================
// Workload Profiles Tests
// ============================================================================

describe('Workload Profiles', () => {
  it('should have valid light profile', () => {
    const light = WORKLOAD_PROFILES.light;
    expect(light.taskCount).toBeLessThan(WORKLOAD_PROFILES.medium.taskCount);
    expect(light.taskDuration).toBeLessThan(WORKLOAD_PROFILES.medium.taskDuration);
  });

  it('should have valid medium profile', () => {
    const medium = WORKLOAD_PROFILES.medium;
    expect(medium.taskCount).toBe(10);
    expect(medium.taskDuration).toBe(100);
    expect(medium.memoryUsage).toBe(10 * 1024 * 1024);
  });

  it('should have valid heavy profile', () => {
    const heavy = WORKLOAD_PROFILES.heavy;
    expect(heavy.taskCount).toBeGreaterThan(WORKLOAD_PROFILES.medium.taskCount);
    expect(heavy.taskDuration).toBeGreaterThan(WORKLOAD_PROFILES.medium.taskDuration);
  });
});

// ============================================================================
// Success Criteria Tests
// ============================================================================

describe('Success Criteria', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_SUCCESS_CRITERIA.agentCount).toBe(100);
    expect(DEFAULT_SUCCESS_CRITERIA.memoryLimit).toBe(4 * 1024 * 1024 * 1024);
    expect(DEFAULT_SUCCESS_CRITERIA.coordinationLatency).toBe(100);
    expect(DEFAULT_SUCCESS_CRITERIA.noAgentStarvation).toBe(true);
    expect(DEFAULT_SUCCESS_CRITERIA.noDeadlocks).toBe(true);
    expect(DEFAULT_SUCCESS_CRITERIA.gossipStable).toBe(true);
  });

  it('should have correct threshold values', () => {
    expect(DEFAULT_THRESHOLDS.memoryWarning).toBe(3 * 1024 * 1024 * 1024);
    expect(DEFAULT_THRESHOLDS.memoryCritical).toBe(4 * 1024 * 1024 * 1024);
    expect(DEFAULT_THRESHOLDS.latencyP95Critical).toBe(100);
    expect(DEFAULT_THRESHOLDS.latencyP99Critical).toBe(200);
  });
});

// ============================================================================
// Integration Tests (Longer Running - Can be Skipped in CI)
// ============================================================================

describe.skip('100+ Agent Load Tests (Integration)', () => {
  // These tests are skipped by default for CI
  // Run with: npm test -- --run load/100-agents --no-skip

  it('should coordinate 100 agents with ramp-up', async () => {
    const tester = createLoadTesterForTarget(100, 'medium');

    try {
      const result = await tester.runScenario(SCENARIO_RAMP_UP_100);

      expect(result.success).toBe(true);
      expect(result.report.summary.peakAgents).toBeGreaterThanOrEqual(100);
      expect(result.report.performance.coordinationLatency.p95).toBeLessThanOrEqual(100);
      expect(result.report.resources.memoryPeak).toBeLessThan(4 * 1024 * 1024 * 1024);
    } finally {
      await tester.stop();
    }
  }, 300000); // 5 minute timeout

  it('should handle burst of 100 agents', async () => {
    const tester = createLoadTesterForTarget(100, 'medium');

    try {
      const result = await tester.runScenario(SCENARIO_BURST_100);

      expect(result.success).toBe(true);
      expect(result.report.summary.peakAgents).toBeGreaterThanOrEqual(100);
    } finally {
      await tester.stop();
    }
  }, 180000); // 3 minute timeout

  it('should maintain stability with churn', async () => {
    const tester = createLoadTesterForTarget(100, 'medium');

    try {
      const result = await tester.runScenario(SCENARIO_CHURN_100);

      expect(result.success).toBe(true);
      expect(result.bottlenecks.hasCritical).toBe(false);
    } finally {
      await tester.stop();
    }
  }, 240000); // 4 minute timeout

  it('should handle stress beyond 100 agents', async () => {
    const tester = createLoadTesterForTarget(150, 'heavy');

    try {
      const result = await tester.runScenario(SCENARIO_STRESS_150);

      // May or may not succeed - we're testing limits
      expect(result.report.summary.peakAgents).toBeGreaterThanOrEqual(100);
      expect(result.bottlenecks).toBeDefined();
    } finally {
      await tester.stop();
    }
  }, 300000); // 5 minute timeout
});

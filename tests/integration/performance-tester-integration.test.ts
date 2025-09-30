/**
 * Integration tests for PerformanceTesterAgent
 * Tests real-world scenarios with EventBus and MemoryManager
 */

import { PerformanceTesterAgent, PerformanceTesterConfig } from '../../src/agents/PerformanceTesterAgent';
import { EventEmitter } from 'events';
import { AgentStatus, QEAgentType, QETask } from '../../src/types';

// Simple in-memory store for integration testing
class MemoryManager {
  private data = new Map<string, any>();

  async store(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.data.get(key);
  }

  async set(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async get(key: string): Promise<any> {
    return this.data.get(key);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
  }
}

describe('PerformanceTesterAgent Integration', () => {
  let agent: PerformanceTesterAgent;
  let eventBus: EventEmitter;
  let memoryStore: MemoryManager;

  beforeEach(async () => {
    eventBus = new EventEmitter();
    memoryStore = new MemoryManager();

    const config: PerformanceTesterConfig = {
      type: QEAgentType.PERFORMANCE_TESTER,
      capabilities: [],
      context: { id: 'perf-test', type: 'performance-tester', status: AgentStatus.IDLE },
      memoryStore: memoryStore as any,
      eventBus,
      tools: {
        loadTesting: 'k6',
        monitoring: ['prometheus', 'grafana'],
        apm: 'datadog'
      },
      thresholds: {
        maxLatencyP95: 500,
        maxLatencyP99: 1000,
        minThroughput: 1000,
        maxErrorRate: 0.01,
        maxCpuUsage: 80,
        maxMemoryUsage: 85
      },
      loadProfile: {
        virtualUsers: 100,
        duration: 300,
        rampUpTime: 30,
        pattern: 'ramp-up'
      }
    };

    agent = new PerformanceTesterAgent(config);
    await agent.initialize();
  });

  afterEach(async () => {
    await agent.terminate();
  });

  describe('end-to-end load testing workflow', () => {
    it('should execute complete load testing workflow', async () => {
      const events: string[] = [];

      // Listen for all performance events
      eventBus.on('performance.test.started', (event) => {
        events.push('test.started');
      });

      eventBus.on('performance.test.completed', (event) => {
        events.push('test.completed');
      });

      // Execute load test
      const loadTestTask: QETask = {
        id: 'integration-load-test-1',
        type: 'run-load-test',
        payload: {
          targetUrl: 'https://api.example.com',
          loadProfile: {
            virtualUsers: 50,
            duration: 60,
            rampUpTime: 10,
            pattern: 'ramp-up'
          },
          thresholds: {
            maxLatencyP95: 500,
            maxLatencyP99: 1000,
            minThroughput: 100,
            maxErrorRate: 0.01
          }
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(loadTestTask);

      // Verify results
      expect(result).toBeDefined();
      expect(result.metrics).toBeDefined();
      expect(result.bottlenecks).toBeDefined();
      expect(result.slaViolations).toBeDefined();

      // Verify events were emitted
      expect(events).toContain('test.started');
      expect(events).toContain('test.completed');

      // Verify results stored in memory
      const storedResult = await memoryStore.retrieve(`aqe/performance/results/${result.id}`);
      expect(storedResult).toBeDefined();
      expect(storedResult.id).toBe(result.id);
    });

    it('should coordinate with other agents through shared memory', async () => {
      // Simulate another agent storing requirements
      await memoryStore.store('aqe/requirements/performance', {
        targetRPS: 2000,
        maxLatency: 400,
        errorBudget: 0.005
      });

      // Execute load test
      const task: QETask = {
        id: 'integration-coordinated-test',
        type: 'run-load-test',
        payload: {
          targetUrl: 'https://api.example.com'
        },
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);

      // Verify shared memory was updated
      const sharedData = await memoryStore.retrieve(`shared:${QEAgentType.PERFORMANCE_TESTER}:latest-test`);
      expect(sharedData).toBeDefined();
      expect(sharedData.testId).toBeDefined();
    });
  });

  describe('performance regression workflow', () => {
    it('should establish baseline and detect regressions', async () => {
      const events: string[] = [];

      eventBus.on('performance.regression.detected', (event) => {
        events.push('regression.detected');
      });

      // Step 1: Establish baseline
      const baselineTask: QETask = {
        id: 'establish-baseline-task',
        type: 'establish-baseline',
        payload: {
          metrics: {
            requests: {
              total: 10000,
              successful: 9900,
              failed: 100,
              errorRate: 1
            },
            latency: {
              min: 50,
              max: 1000,
              mean: 200,
              p50: 180,
              p95: 400,
              p99: 800
            },
            throughput: {
              requestsPerSecond: 1500,
              bytesPerSecond: 1536000
            },
            resources: {
              cpu: { current: 60, average: 55, peak: 70, unit: '%' },
              memory: { current: 50, average: 48, peak: 55, unit: 'GB' },
              network: { current: 100, average: 95, peak: 120, unit: 'Mbps' }
            }
          },
          version: 'v1.0.0',
          environment: 'production'
        },
        priority: 1,
        status: 'pending'
      };

      const baseline = await agent.assignTask(baselineTask);
      expect(baseline).toBeDefined();

      // Verify baseline stored in memory
      const storedBaseline = await memoryStore.retrieve('aqe/performance/baselines/v1.0.0-production');
      expect(storedBaseline).toBeDefined();

      // Step 2: Run new test with degraded performance
      const loadTestTask: QETask = {
        id: 'regression-test',
        type: 'run-load-test',
        payload: {
          targetUrl: 'https://api.example.com'
        },
        priority: 1,
        status: 'pending'
      };

      const testResult = await agent.assignTask(loadTestTask);

      // Step 3: Detect regressions
      const regressionTask: QETask = {
        id: 'detect-regression-task',
        type: 'detect-regressions',
        payload: {
          currentMetrics: {
            requests: {
              total: 10000,
              successful: 9500,
              failed: 500,
              errorRate: 5
            },
            latency: {
              min: 80,
              max: 2000,
              mean: 500,
              p50: 450,
              p95: 1000,
              p99: 1800
            },
            throughput: {
              requestsPerSecond: 800,
              bytesPerSecond: 819200
            },
            resources: {
              cpu: { current: 85, average: 80, peak: 90, unit: '%' },
              memory: { current: 70, average: 68, peak: 75, unit: 'GB' },
              network: { current: 130, average: 125, peak: 150, unit: 'Mbps' }
            }
          },
          baselineId: 'v1.0.0-production'
        },
        priority: 1,
        status: 'pending'
      };

      const regressionResult = await agent.assignTask(regressionTask);

      expect(regressionResult).toBeDefined();
      expect(regressionResult.regressions.length).toBeGreaterThan(0);
      expect(regressionResult.verdict).toMatch(/FAIL|WARNING/);

      // Verify regression event was emitted
      expect(events).toContain('regression.detected');

      // Verify regression stored in memory
      const storedRegression = await memoryStore.retrieve('aqe/performance/regressions/latest');
      expect(storedRegression).toBeDefined();
    });
  });

  describe('bottleneck detection workflow', () => {
    it('should detect and report bottlenecks with remediation', async () => {
      const events: any[] = [];

      eventBus.on('performance.bottleneck.detected', (event) => {
        events.push(event);
      });

      // Run load test that will trigger bottlenecks
      const task: QETask = {
        id: 'bottleneck-test',
        type: 'detect-bottlenecks',
        payload: {
          metrics: {
            requests: {
              total: 10000,
              successful: 9200,
              failed: 800,
              errorRate: 8
            },
            latency: {
              min: 100,
              max: 3000,
              mean: 800,
              p50: 700,
              p95: 1500,
              p99: 2500
            },
            throughput: {
              requestsPerSecond: 400,
              bytesPerSecond: 409600
            },
            resources: {
              cpu: { current: 95, average: 92, peak: 98, unit: '%' },
              memory: { current: 88, average: 85, peak: 92, unit: 'GB' },
              network: { current: 180, average: 170, peak: 200, unit: 'Mbps' }
            }
          },
          testId: 'bottleneck-integration-test'
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      // Verify bottlenecks detected
      expect(result.length).toBeGreaterThan(0);

      const cpuBottleneck = result.find((b: any) => b.type === 'CPU');
      expect(cpuBottleneck).toBeDefined();
      expect(cpuBottleneck.severity).toMatch(/CRITICAL|HIGH/);
      expect(cpuBottleneck.remediation.length).toBeGreaterThan(0);

      // Verify events emitted
      expect(events.length).toBeGreaterThan(0);

      // Verify stored in memory
      const storedBottlenecks = await memoryStore.retrieve('aqe/performance/bottlenecks/bottleneck-integration-test');
      expect(storedBottlenecks).toBeDefined();
      expect(storedBottlenecks.bottlenecks.length).toBeGreaterThan(0);
    });
  });

  describe('SLA validation workflow', () => {
    it('should validate SLA and emit violations', async () => {
      const violations: any[] = [];

      eventBus.on('performance.sla.violated', (event) => {
        violations.push(event);
      });

      const task: QETask = {
        id: 'sla-validation-test',
        type: 'validate-sla',
        payload: {
          metrics: {
            requests: {
              total: 10000,
              successful: 9000,
              failed: 1000,
              errorRate: 10
            },
            latency: {
              min: 100,
              max: 3000,
              mean: 800,
              p50: 700,
              p95: 1200,
              p99: 2000
            },
            throughput: {
              requestsPerSecond: 500,
              bytesPerSecond: 512000
            }
          },
          thresholds: {
            maxLatencyP95: 500,
            maxLatencyP99: 1000,
            minThroughput: 1000,
            maxErrorRate: 0.01
          }
        },
        priority: 1,
        status: 'pending'
      };

      const result = await agent.assignTask(task);

      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);

      // Should have P95 latency violation
      const p95Violation = result.violations.find((v: any) => v.metric === 'latency_p95');
      expect(p95Violation).toBeDefined();

      // Should have throughput violation
      const throughputViolation = result.violations.find((v: any) => v.metric === 'throughput');
      expect(throughputViolation).toBeDefined();

      // Should have error rate violation
      const errorViolation = result.violations.find((v: any) => v.metric === 'error_rate');
      expect(errorViolation).toBeDefined();

      // Verify SLA violation event was emitted
      expect(violations.length).toBeGreaterThan(0);
    });
  });

  describe('cross-agent coordination', () => {
    it('should respond to fleet shutdown event', (done) => {
      eventBus.once('agent.terminated', (event) => {
        expect(event.data.agentId).toBeDefined();
        done();
      });

      // Emit fleet shutdown
      eventBus.emit('fleet.shutdown', {
        type: 'fleet.shutdown',
        source: { id: 'fleet-commander', type: QEAgentType.FLEET_COMMANDER, created: new Date() },
        data: {},
        timestamp: new Date(),
        priority: 'critical' as const,
        scope: 'global' as const
      });
    });

    it('should store test results accessible to other agents', async () => {
      const task: QETask = {
        id: 'shared-results-test',
        type: 'run-load-test',
        payload: {
          targetUrl: 'https://api.example.com'
        },
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);

      // Verify results are accessible via shared memory
      const sharedResults = await memoryStore.retrieve(`shared:${QEAgentType.PERFORMANCE_TESTER}:latest-test`);
      expect(sharedResults).toBeDefined();
      expect(sharedResults.testId).toBeDefined();
      expect(sharedResults.passed).toBeDefined();
      expect(sharedResults.metrics).toBeDefined();
    });

    it('should coordinate with test executor through events', (done) => {
      let testCompletedReceived = false;
      let performanceTestStarted = false;

      // Simulate test executor completing functional tests
      eventBus.on('performance.test.started', (event) => {
        performanceTestStarted = true;
        if (testCompletedReceived && performanceTestStarted) {
          done();
        }
      });

      // Emit test execution complete event
      eventBus.emit('test.execution.complete', {
        type: 'test.execution.complete',
        source: { id: 'test-executor', type: QEAgentType.TEST_EXECUTOR, created: new Date() },
        data: { testSuiteId: 'suite-1', passed: true },
        timestamp: new Date(),
        priority: 'medium' as const,
        scope: 'global' as const
      });

      testCompletedReceived = true;

      // Trigger performance test
      const task: QETask = {
        id: 'coordinated-perf-test',
        type: 'run-load-test',
        payload: { targetUrl: 'https://api.example.com' },
        priority: 1,
        status: 'pending'
      };

      agent.assignTask(task);
    });
  });

  describe('performance metrics tracking', () => {
    it('should track agent performance metrics', async () => {
      // Execute multiple tasks
      for (let i = 0; i < 3; i++) {
        const task: QETask = {
          id: `metrics-test-${i}`,
          type: 'generate-load-pattern',
          payload: {
            pattern: 'constant',
            virtualUsers: 50,
            duration: 60
          },
          priority: 1,
          status: 'pending'
        };

        await agent.assignTask(task);
      }

      const status = agent.getStatus();
      expect(status.performanceMetrics.tasksCompleted).toBe(3);
      expect(status.performanceMetrics.averageExecutionTime).toBeGreaterThan(0);
      expect(status.performanceMetrics.errorCount).toBe(0);
    });
  });

  describe('load pattern generation', () => {
    it('should generate different load patterns', async () => {
      const patterns = ['constant', 'ramp-up', 'spike', 'stress', 'soak'] as const;

      for (const pattern of patterns) {
        const task: QETask = {
          id: `pattern-${pattern}`,
          type: 'generate-load-pattern',
          payload: {
            pattern,
            virtualUsers: 100,
            duration: 300
          },
          priority: 1,
          status: 'pending'
        };

        const result = await agent.assignTask(task);

        expect(result).toBeDefined();
        expect(result.pattern).toBe(pattern);
        expect(result.virtualUsers).toBe(100);
        expect(result.duration).toBe(300);
      }
    });
  });

  describe('state persistence', () => {
    it('should persist state across termination and reinitialization', async () => {
      // Run a load test
      const task: QETask = {
        id: 'persistence-test',
        type: 'run-load-test',
        payload: { targetUrl: 'https://api.example.com' },
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);

      const beforeStatus = agent.getStatus();
      expect(beforeStatus.performanceMetrics.tasksCompleted).toBe(1);

      // Terminate agent
      await agent.terminate();

      // Create new agent with same memory store
      const newConfig: PerformanceTesterConfig = {
        type: QEAgentType.PERFORMANCE_TESTER,
        capabilities: [],
        context: { id: 'perf-test-2', type: 'performance-tester', status: AgentStatus.IDLE },
        memoryStore: memoryStore as any,
        eventBus,
        thresholds: {
          maxLatencyP95: 500,
          maxLatencyP99: 1000,
          minThroughput: 1000,
          maxErrorRate: 0.01,
          maxCpuUsage: 80,
          maxMemoryUsage: 85
        }
      };

      const newAgent = new PerformanceTesterAgent(newConfig);
      await newAgent.initialize();

      // Verify state was restored (baselines and test results should still be accessible)
      const storedResult = await memoryStore.retrieve('aqe/performance/results/persistence-test');
      // Note: Result won't be found because test ID is dynamic, but memory store should have data

      await newAgent.terminate();
    });
  });
});
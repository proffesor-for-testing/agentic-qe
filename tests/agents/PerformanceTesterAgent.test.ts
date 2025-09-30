import { PerformanceTesterAgent, PerformanceTesterConfig } from '../../src/agents/PerformanceTesterAgent';
import { EventEmitter } from 'events';
import { AgentType, QEAgentType, AgentStatus, QETask } from '../../src/types';

// Mock memory store
class MockMemoryStore {
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

  has(key: string): boolean {
    return this.data.has(key);
  }
}

describe('PerformanceTesterAgent', () => {
  let agent: PerformanceTesterAgent;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(async () => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    const config: PerformanceTesterConfig = {
      type: QEAgentType.PERFORMANCE_TESTER,
      capabilities: [],
      context: { id: 'test', type: 'test', status: AgentStatus.IDLE },
      memoryStore: mockMemoryStore as any,
      eventBus: mockEventBus,
      tools: {
        loadTesting: 'k6',
        monitoring: ['prometheus'],
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

  describe('initialization', () => {
    it('should initialize successfully', () => {
      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.ACTIVE);
      expect(status.agentId.type).toBe(QEAgentType.PERFORMANCE_TESTER);
    });

    it('should have load testing orchestration capability', () => {
      expect(agent.hasCapability('load-testing-orchestration')).toBe(true);
      const capability = agent.getCapability('load-testing-orchestration');
      expect(capability).toBeDefined();
      expect(capability?.parameters?.supportedTools).toContain('k6');
    });

    it('should have bottleneck detection capability', () => {
      expect(agent.hasCapability('bottleneck-detection')).toBe(true);
      const capability = agent.getCapability('bottleneck-detection');
      expect(capability).toBeDefined();
      expect(capability?.parameters?.analysisTypes).toContain('cpu');
      expect(capability?.parameters?.analysisTypes).toContain('memory');
    });

    it('should have resource monitoring capability', () => {
      expect(agent.hasCapability('resource-monitoring')).toBe(true);
      const capability = agent.getCapability('resource-monitoring');
      expect(capability).toBeDefined();
      expect(capability?.parameters?.metrics).toContain('cpu');
      expect(capability?.parameters?.metrics).toContain('memory');
    });

    it('should have SLA validation capability', () => {
      expect(agent.hasCapability('sla-validation')).toBe(true);
      const capability = agent.getCapability('sla-validation');
      expect(capability).toBeDefined();
      expect(capability?.parameters?.thresholds).toBeDefined();
    });

    it('should have performance regression detection capability', () => {
      expect(agent.hasCapability('performance-regression-detection')).toBe(true);
    });

    it('should have load pattern generation capability', () => {
      expect(agent.hasCapability('load-pattern-generation')).toBe(true);
      const capability = agent.getCapability('load-pattern-generation');
      expect(capability?.parameters?.patterns).toContain('spike');
      expect(capability?.parameters?.patterns).toContain('stress');
    });
  });

  describe('load testing', () => {
    it('should execute load test and return results', async () => {
      const task: QETask = {
        id: 'task-1',
        type: 'run-load-test',
        payload: {
          targetUrl: 'https://api.example.com',
          loadProfile: {
            virtualUsers: 50,
            duration: 60,
            rampUpTime: 10,
            pattern: 'constant'
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

      const assignment = {
        id: 'assignment-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.id).toContain('loadtest-');
      expect(result.metrics).toBeDefined();
      expect(result.metrics.requests).toBeDefined();
      expect(result.metrics.latency).toBeDefined();
      expect(result.metrics.throughput).toBeDefined();
      expect(result.bottlenecks).toBeDefined();
      expect(result.slaViolations).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should emit performance.test.started event', (done) => {
      mockEventBus.once('performance.test.started', (event) => {
        expect(event.type).toBe('performance.test.started');
        expect(event.data.testId).toBeDefined();
        expect(event.data.config).toBeDefined();
        done();
      });

      const task: QETask = {
        id: 'task-2',
        type: 'run-load-test',
        payload: {
          targetUrl: 'https://api.example.com'
        },
        priority: 1,
        status: 'pending'
      };

      agent.assignTask(task);
    });

    it('should store test results in memory', async () => {
      const task: QETask = {
        id: 'task-3',
        type: 'run-load-test',
        payload: {
          targetUrl: 'https://api.example.com'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(assignment);

      // Check if results are stored
      const storedResult = await mockMemoryStore.retrieve(`aqe/performance/results/${result.id}`);
      expect(storedResult).toBeDefined();
      expect(storedResult.id).toBe(result.id);
    });

    it('should support different load patterns', async () => {
      const patterns: Array<'constant' | 'ramp-up' | 'spike' | 'stress' | 'soak'> =
        ['constant', 'ramp-up', 'spike', 'stress', 'soak'];

      for (const pattern of patterns) {
        const task: QETask = {
          id: `task-pattern-${pattern}`,
          type: 'generate-load-pattern',
          payload: {
            pattern,
            virtualUsers: 100,
            duration: 300
          },
          priority: 1,
          status: 'pending'
        };

        const assignment = {
          id: `assignment-${pattern}`,
          task,
          agentId: agent.getStatus().agentId.id,
          assignedAt: new Date(),
          status: 'assigned' as const
        };

        const result = await agent.executeTask(assignment);
        expect(result.pattern).toBe(pattern);
      }
    });
  });

  describe('bottleneck detection', () => {
    it('should detect CPU bottlenecks', async () => {
      const task: QETask = {
        id: 'task-4',
        type: 'detect-bottlenecks',
        payload: {
          metrics: {
            requests: {
              total: 10000,
              successful: 9800,
              failed: 200,
              errorRate: 2
            },
            latency: {
              min: 50,
              max: 2000,
              mean: 300,
              p50: 250,
              p95: 800,
              p99: 1500
            },
            throughput: {
              requestsPerSecond: 500,
              bytesPerSecond: 512000
            },
            resources: {
              cpu: {
                current: 92,
                average: 88,
                peak: 95,
                unit: '%'
              },
              memory: {
                current: 5.2,
                average: 5.0,
                peak: 6.0,
                unit: 'GB'
              },
              network: {
                current: 120,
                average: 115,
                peak: 150,
                unit: 'Mbps'
              }
            }
          },
          testId: 'test-123'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-4',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);

      const cpuBottleneck = result.find((b: any) => b.type === 'CPU');
      expect(cpuBottleneck).toBeDefined();
      expect(cpuBottleneck.severity).toMatch(/LOW|MEDIUM|HIGH|CRITICAL/);
      expect(cpuBottleneck.remediation).toBeDefined();
      expect(cpuBottleneck.remediation.length).toBeGreaterThan(0);
    });

    it('should detect memory bottlenecks', async () => {
      const task: QETask = {
        id: 'task-5',
        type: 'detect-bottlenecks',
        payload: {
          metrics: {
            requests: { total: 10000, successful: 9800, failed: 200, errorRate: 2 },
            latency: { min: 50, max: 2000, mean: 300, p50: 250, p95: 600, p99: 1200 },
            throughput: { requestsPerSecond: 800, bytesPerSecond: 819200 },
            resources: {
              cpu: { current: 65, average: 60, peak: 70, unit: '%' },
              memory: { current: 92, average: 88, peak: 95, unit: 'GB' },
              network: { current: 120, average: 115, peak: 150, unit: 'Mbps' }
            }
          },
          testId: 'test-124'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-5',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(assignment);

      const memoryBottleneck = result.find((b: any) => b.type === 'MEMORY');
      expect(memoryBottleneck).toBeDefined();
      expect(memoryBottleneck.severity).toMatch(/LOW|MEDIUM|HIGH|CRITICAL/);
    });

    it('should emit bottleneck.detected event for critical issues', (done) => {
      mockEventBus.once('performance.bottleneck.detected', (event) => {
        expect(event.type).toBe('performance.bottleneck.detected');
        expect(event.data.type).toBeDefined();
        expect(event.data.severity).toMatch(/CRITICAL|HIGH/);
        done();
      });

      const task: QETask = {
        id: 'task-6',
        type: 'detect-bottlenecks',
        payload: {
          metrics: {
            requests: { total: 10000, successful: 9800, failed: 200, errorRate: 2 },
            latency: { min: 50, max: 2000, mean: 300, p50: 250, p95: 600, p99: 1200 },
            throughput: { requestsPerSecond: 800, bytesPerSecond: 819200 },
            resources: {
              cpu: { current: 95, average: 90, peak: 98, unit: '%' },
              memory: { current: 70, average: 65, peak: 75, unit: 'GB' },
              network: { current: 120, average: 115, peak: 150, unit: 'Mbps' }
            }
          },
          testId: 'test-125'
        },
        priority: 1,
        status: 'pending'
      };

      agent.assignTask(task);
    });

    it('should provide remediation recommendations', async () => {
      const task: QETask = {
        id: 'task-7',
        type: 'detect-bottlenecks',
        payload: {
          metrics: {
            requests: { total: 10000, successful: 9800, failed: 200, errorRate: 2 },
            latency: { min: 50, max: 2000, mean: 300, p50: 250, p95: 600, p99: 1200 },
            throughput: { requestsPerSecond: 800, bytesPerSecond: 819200 },
            resources: {
              cpu: { current: 85, average: 80, peak: 90, unit: '%' },
              memory: { current: 70, average: 65, peak: 75, unit: 'GB' },
              network: { current: 120, average: 115, peak: 150, unit: 'Mbps' }
            }
          },
          testId: 'test-126'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-7',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(assignment);

      if (result.length > 0) {
        const bottleneck = result[0];
        expect(bottleneck.remediation).toBeDefined();
        expect(Array.isArray(bottleneck.remediation)).toBe(true);
        expect(bottleneck.remediation.length).toBeGreaterThan(0);
        expect(bottleneck.impactEstimate).toBeDefined();
      }
    });
  });

  describe('SLA validation', () => {
    it('should validate SLA and return violations', async () => {
      const task: QETask = {
        id: 'task-8',
        type: 'validate-sla',
        payload: {
          metrics: {
            requests: {
              total: 10000,
              successful: 9500,
              failed: 500,
              errorRate: 5
            },
            latency: {
              min: 50,
              max: 2000,
              mean: 400,
              p50: 350,
              p95: 800,
              p99: 1500
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

      const assignment = {
        id: 'assignment-8',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.passed).toBe(false);
      expect(result.violations).toBeDefined();
      expect(result.violations.length).toBeGreaterThan(0);

      // Check for P95 latency violation
      const p95Violation = result.violations.find((v: any) => v.metric === 'latency_p95');
      expect(p95Violation).toBeDefined();
      expect(p95Violation.actual).toBeGreaterThan(p95Violation.threshold);

      // Check for error rate violation
      const errorViolation = result.violations.find((v: any) => v.metric === 'error_rate');
      expect(errorViolation).toBeDefined();
    });

    it('should pass SLA validation when all thresholds met', async () => {
      const task: QETask = {
        id: 'task-9',
        type: 'validate-sla',
        payload: {
          metrics: {
            requests: {
              total: 10000,
              successful: 9990,
              failed: 10,
              errorRate: 0.1
            },
            latency: {
              min: 50,
              max: 800,
              mean: 200,
              p50: 180,
              p95: 400,
              p99: 600
            },
            throughput: {
              requestsPerSecond: 1500,
              bytesPerSecond: 1536000
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

      const assignment = {
        id: 'assignment-9',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(assignment);

      expect(result.passed).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should emit SLA violation event', (done) => {
      mockEventBus.once('performance.sla.violated', (event) => {
        expect(event.type).toBe('performance.sla.violated');
        expect(event.data.violationCount).toBeGreaterThan(0);
        expect(event.data.violations).toBeDefined();
        done();
      });

      const task: QETask = {
        id: 'task-10',
        type: 'validate-sla',
        payload: {
          metrics: {
            requests: { total: 10000, successful: 9000, failed: 1000, errorRate: 10 },
            latency: { min: 50, max: 3000, mean: 800, p50: 700, p95: 1200, p99: 2000 },
            throughput: { requestsPerSecond: 300, bytesPerSecond: 307200 }
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

      agent.assignTask(task);
    });
  });

  describe('performance regression detection', () => {
    it('should detect performance regressions', async () => {
      // First, establish a baseline
      const baselineTask: QETask = {
        id: 'task-11',
        type: 'establish-baseline',
        payload: {
          metrics: {
            requests: { total: 10000, successful: 9900, failed: 100, errorRate: 1 },
            latency: { min: 50, max: 1000, mean: 200, p50: 180, p95: 400, p99: 800 },
            throughput: { requestsPerSecond: 1500, bytesPerSecond: 1536000 },
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

      const baselineAssignment = {
        id: 'baseline-assignment',
        task: baselineTask,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      await agent.executeTask(baselineAssignment);

      // Now detect regressions
      const regressionTask: QETask = {
        id: 'task-12',
        type: 'detect-regressions',
        payload: {
          currentMetrics: {
            requests: { total: 10000, successful: 9800, failed: 200, errorRate: 2 },
            latency: { min: 60, max: 1500, mean: 300, p50: 280, p95: 600, p99: 1200 },
            throughput: { requestsPerSecond: 1200, bytesPerSecond: 1228800 },
            resources: {
              cpu: { current: 70, average: 65, peak: 80, unit: '%' },
              memory: { current: 60, average: 58, peak: 65, unit: 'GB' },
              network: { current: 110, average: 105, peak: 130, unit: 'Mbps' }
            }
          },
          baselineId: 'v1.0.0-production'
        },
        priority: 1,
        status: 'pending'
      };

      const regressionAssignment = {
        id: 'regression-assignment',
        task: regressionTask,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(regressionAssignment);

      expect(result).toBeDefined();
      expect(result.regressions).toBeDefined();
      expect(result.verdict).toMatch(/PASS|FAIL|WARNING/);

      // Should detect latency regression
      const latencyRegression = result.regressions.find((r: any) => r.metric === 'latency_p95');
      expect(latencyRegression).toBeDefined();
      if (latencyRegression) {
        expect(latencyRegression.degradation).toBeGreaterThan(0);
      }
    });

    it('should detect improvements', async () => {
      // Establish baseline with poor performance
      const baselineTask: QETask = {
        id: 'task-13',
        type: 'establish-baseline',
        payload: {
          metrics: {
            requests: { total: 10000, successful: 9500, failed: 500, errorRate: 5 },
            latency: { min: 100, max: 2000, mean: 500, p50: 450, p95: 1000, p99: 1800 },
            throughput: { requestsPerSecond: 800, bytesPerSecond: 819200 },
            resources: {
              cpu: { current: 75, average: 70, peak: 85, unit: '%' },
              memory: { current: 65, average: 62, peak: 70, unit: 'GB' },
              network: { current: 120, average: 115, peak: 140, unit: 'Mbps' }
            }
          },
          version: 'v1.0.0',
          environment: 'staging'
        },
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(baselineTask);

      // Test with improved performance
      const improvedTask: QETask = {
        id: 'task-14',
        type: 'detect-regressions',
        payload: {
          currentMetrics: {
            requests: { total: 10000, successful: 9900, failed: 100, errorRate: 1 },
            latency: { min: 50, max: 1000, mean: 250, p50: 220, p95: 500, p99: 900 },
            throughput: { requestsPerSecond: 1500, bytesPerSecond: 1536000 },
            resources: {
              cpu: { current: 60, average: 55, peak: 70, unit: '%' },
              memory: { current: 50, average: 48, peak: 55, unit: 'GB' },
              network: { current: 100, average: 95, peak: 120, unit: 'Mbps' }
            }
          },
          baselineId: 'v1.0.0-staging'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'improved-assignment',
        task: improvedTask,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(assignment);

      expect(result.improvements).toBeDefined();
      expect(result.improvements.length).toBeGreaterThan(0);

      const latencyImprovement = result.improvements.find((i: any) => i.metric === 'latency_p95');
      expect(latencyImprovement).toBeDefined();
    });

    it('should emit regression.detected event', (done) => {
      mockEventBus.once('performance.regression.detected', (event) => {
        expect(event.type).toBe('performance.regression.detected');
        expect(event.data.count).toBeGreaterThan(0);
        expect(event.data.regressions).toBeDefined();
        done();
      });

      // Establish baseline first
      const baselineTask: QETask = {
        id: 'baseline-for-regression',
        type: 'establish-baseline',
        payload: {
          metrics: {
            requests: { total: 10000, successful: 9900, failed: 100, errorRate: 1 },
            latency: { min: 50, max: 800, mean: 180, p50: 160, p95: 350, p99: 700 },
            throughput: { requestsPerSecond: 2000, bytesPerSecond: 2048000 },
            resources: {
              cpu: { current: 50, average: 45, peak: 60, unit: '%' },
              memory: { current: 40, average: 38, peak: 45, unit: 'GB' },
              network: { current: 90, average: 85, peak: 110, unit: 'Mbps' }
            }
          },
          version: 'v2.0.0',
          environment: 'test'
        },
        priority: 1,
        status: 'pending'
      };

      agent.assignTask(baselineTask).then(() => {
        const regressionTask: QETask = {
          id: 'regression-detection',
          type: 'detect-regressions',
          payload: {
            currentMetrics: {
              requests: { total: 10000, successful: 9000, failed: 1000, errorRate: 10 },
              latency: { min: 100, max: 3000, mean: 800, p50: 700, p95: 1500, p99: 2500 },
              throughput: { requestsPerSecond: 500, bytesPerSecond: 512000 },
              resources: {
                cpu: { current: 90, average: 85, peak: 95, unit: '%' },
                memory: { current: 80, average: 78, peak: 85, unit: 'GB' },
                network: { current: 150, average: 145, peak: 180, unit: 'Mbps' }
              }
            },
            baselineId: 'v2.0.0-test'
          },
          priority: 1,
          status: 'pending'
        };

        agent.assignTask(regressionTask);
      });
    });
  });

  describe('memory operations', () => {
    it('should store test results in shared memory', async () => {
      const task: QETask = {
        id: 'task-15',
        type: 'run-load-test',
        payload: {
          targetUrl: 'https://api.example.com'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-15',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      await agent.executeTask(assignment);

      // Check shared memory
      const sharedKey = `shared:${QEAgentType.PERFORMANCE_TESTER}:latest-test`;
      const sharedData = await mockMemoryStore.retrieve(sharedKey);

      expect(sharedData).toBeDefined();
      expect(sharedData.testId).toBeDefined();
      expect(sharedData.passed).toBeDefined();
    });

    it('should store baselines in memory', async () => {
      const task: QETask = {
        id: 'task-16',
        type: 'establish-baseline',
        payload: {
          metrics: {
            requests: { total: 10000, successful: 9900, failed: 100, errorRate: 1 },
            latency: { min: 50, max: 1000, mean: 200, p50: 180, p95: 400, p99: 800 },
            throughput: { requestsPerSecond: 1500, bytesPerSecond: 1536000 },
            resources: {
              cpu: { current: 60, average: 55, peak: 70, unit: '%' },
              memory: { current: 50, average: 48, peak: 55, unit: 'GB' },
              network: { current: 100, average: 95, peak: 120, unit: 'Mbps' }
            }
          },
          version: 'v1.5.0',
          environment: 'production'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-16',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      const result = await agent.executeTask(assignment);

      const baselineId = `${result.version}-${result.environment}`;
      const storedBaseline = await mockMemoryStore.retrieve(`aqe/performance/baselines/${baselineId}`);

      expect(storedBaseline).toBeDefined();
      expect(storedBaseline.version).toBe('v1.5.0');
      expect(storedBaseline.environment).toBe('production');
    });

    it('should store bottleneck analysis in memory', async () => {
      const task: QETask = {
        id: 'task-17',
        type: 'detect-bottlenecks',
        payload: {
          metrics: {
            requests: { total: 10000, successful: 9800, failed: 200, errorRate: 2 },
            latency: { min: 50, max: 2000, mean: 300, p50: 250, p95: 800, p99: 1500 },
            throughput: { requestsPerSecond: 800, bytesPerSecond: 819200 },
            resources: {
              cpu: { current: 90, average: 85, peak: 95, unit: '%' },
              memory: { current: 70, average: 65, peak: 75, unit: 'GB' },
              network: { current: 120, average: 115, peak: 150, unit: 'Mbps' }
            }
          },
          testId: 'test-bottleneck-analysis'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-17',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      await agent.executeTask(assignment);

      const storedAnalysis = await mockMemoryStore.retrieve('aqe/performance/bottlenecks/test-bottleneck-analysis');
      expect(storedAnalysis).toBeDefined();
      expect(storedAnalysis.bottlenecks).toBeDefined();
      expect(storedAnalysis.testId).toBe('test-bottleneck-analysis');
    });
  });

  describe('error handling', () => {
    it('should handle invalid task type', async () => {
      const task: QETask = {
        id: 'task-18',
        type: 'invalid-task-type',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-18',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow('Unsupported task type');
    });

    it('should handle missing baseline in regression detection', async () => {
      const task: QETask = {
        id: 'task-19',
        type: 'detect-regressions',
        payload: {
          currentMetrics: {},
          baselineId: 'non-existent-baseline'
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-19',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned' as const
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow('Baseline non-existent-baseline not found');
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources on termination', async () => {
      const agentId = agent.getStatus().agentId.id;
      await agent.terminate();

      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.TERMINATED);
    });

    it('should save state on termination', async () => {
      // Run a test to create some state
      const task: QETask = {
        id: 'task-20',
        type: 'run-load-test',
        payload: { targetUrl: 'https://api.example.com' },
        priority: 1,
        status: 'pending'
      };

      await agent.assignTask(task);
      await agent.terminate();

      // Check if state was saved
      const stateKey = `agent:${agent.getStatus().agentId.id}:performance-state`;
      const savedState = await mockMemoryStore.retrieve(stateKey);

      expect(savedState).toBeDefined();
      expect(savedState.timestamp).toBeDefined();
    });
  });
});
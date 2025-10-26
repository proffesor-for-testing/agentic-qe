/**
 * Unit tests for ProductionIntelligenceAgent
 */

import { ProductionIntelligenceAgent, ProductionIntelligenceConfig, ProductionIncident } from '@agents/ProductionIntelligenceAgent';
import { EventEmitter } from 'events';
import { AgentStatus, QEAgentType } from '@types';

// Mock MemoryStore
class MockMemoryStore {
  private data = new Map<string, any>();

  async store(key: string, value: any, ttl?: number): Promise<void> {
    this.data.set(key, value);
  }

  async retrieve(key: string): Promise<any> {
    return this.data.get(key);
  }

  async set(key: string, value: any, namespace?: string): Promise<void> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    this.data.set(fullKey, value);
  }

  async get(key: string, namespace?: string): Promise<any> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return this.data.get(fullKey);
  }

  async delete(key: string, namespace?: string): Promise<boolean> {
    const fullKey = namespace ? `${namespace}:${key}` : key;
    return this.data.delete(fullKey);
  }

  async clear(namespace?: string): Promise<void> {
    if (namespace) {
      for (const key of this.data.keys()) {
        if (key.startsWith(`${namespace}:`)) {
          this.data.delete(key);
        }
      }
    } else {
      this.data.clear();
    }
  }

  // Helper for tests
  getAllKeys(): string[] {
    return Array.from(this.data.keys());
  }
}

describe('ProductionIntelligenceAgent', () => {
  let agent: ProductionIntelligenceAgent;
  let mockMemoryStore: MockMemoryStore;
  let mockEventBus: EventEmitter;

  beforeEach(async () => {
    mockMemoryStore = new MockMemoryStore();
    mockEventBus = new EventEmitter();

    const config: ProductionIntelligenceConfig = {
      type: QEAgentType.PRODUCTION_INTELLIGENCE,
      capabilities: [],
      context: {
        id: 'test-prod-intel',
        type: 'production-intelligence',
        status: AgentStatus.IDLE
      },
      memoryStore: mockMemoryStore as any,
      eventBus: mockEventBus,
      thresholds: {
        anomalyStdDev: 3,
        errorRateSpike: 0.5,
        latencyDegradation: 0.3,
        minIncidentOccurrences: 5
      },
      features: {
        incidentReplay: true,
        rumAnalysis: true,
        anomalyDetection: true,
        loadPatternAnalysis: true,
        featureUsageAnalytics: true
      }
    };

    agent = new ProductionIntelligenceAgent(config);
    await agent.initialize();
  });

  afterEach(async () => {
    await agent.terminate();
  });

  // ============================================================================
  // Initialization Tests
  // ============================================================================

  describe('initialization', () => {
    it('should initialize successfully', () => {
      const status = agent.getStatus();
      expect(status.status).toBe(AgentStatus.ACTIVE);
      expect(status.agentId.type).toBe(QEAgentType.PRODUCTION_INTELLIGENCE);
    });

    it('should have all required capabilities', () => {
      expect(agent.hasCapability('incident-replay')).toBe(true);
      expect(agent.hasCapability('rum-analysis')).toBe(true);
      expect(agent.hasCapability('anomaly-detection')).toBe(true);
      expect(agent.hasCapability('load-pattern-analysis')).toBe(true);
      expect(agent.hasCapability('feature-usage-analytics')).toBe(true);
    });

    it('should have correct capability versions', () => {
      const incidentReplay = agent.getCapability('incident-replay');
      expect(incidentReplay?.version).toBe('1.0.0');

      const rumAnalysis = agent.getCapability('rum-analysis');
      expect(rumAnalysis?.version).toBe('1.0.0');
    });

    it('should set default thresholds if not provided', async () => {
      const configWithoutThresholds: ProductionIntelligenceConfig = {
        type: QEAgentType.PRODUCTION_INTELLIGENCE,
        capabilities: [],
        context: {
          id: 'test-2',
          type: 'production-intelligence',
          status: AgentStatus.IDLE
        },
        memoryStore: mockMemoryStore as any,
        eventBus: mockEventBus
      };

      const agent2 = new ProductionIntelligenceAgent(configWithoutThresholds);
      await agent2.initialize();

      // Agent should have default thresholds
      const capability = agent2.getCapability('anomaly-detection');
      expect(capability?.parameters?.stdDevThreshold).toBe(3);

      await agent2.terminate();
    });
  });

  // ============================================================================
  // Incident Replay Tests
  // ============================================================================

  describe('incident replay', () => {
    const mockIncident: ProductionIncident = {
      id: 'INC-2024-TEST',
      timestamp: '2025-09-30T10:00:00.000Z',
      severity: 'CRITICAL',
      service: 'payment-service',
      error: 'PaymentProcessingException: Gateway timeout',
      affectedUsers: 1000,
      duration: 30000,
      region: 'us-east-1',
      context: {
        systemState: {
          cpu: 85,
          memory: 4.5,
          connections: 300,
          queueDepth: 1500,
          cacheHitRate: 25
        },
        requestTrace: {
          traceId: 'trace-123',
          spanId: 'span-456',
          duration: 31000,
          hops: [
            { service: 'api-gateway', duration: 50 },
            { service: 'payment-service', duration: 30000, timeout: true }
          ]
        },
        userContext: {
          userId: 'user-123',
          sessionId: 'session-456',
          userAgent: 'Mozilla/5.0',
          location: 'New York, NY'
        }
      }
    };

    it('should perform incident replay and generate test scenario', async () => {
      const task = {
        id: 'task-1',
        type: 'incident-replay',
        payload: { incident: mockIncident },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.testScenario).toBeDefined();
      expect(result.testScenario.name).toContain('should handle');
      expect(result.reproducible).toBe(true);
      expect(result.testSuite).toBeDefined();
      expect(result.testSuite.tests).toHaveLength(1);
    });

    it('should store incident analysis in memory', async () => {
      const task = {
        id: 'task-2',
        type: 'incident-replay',
        payload: { incident: mockIncident },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      // Check memory
      const stored = await mockMemoryStore.retrieve(`aqe/incidents/${mockIncident.id}`);
      expect(stored).toBeDefined();
      expect(stored.incident.id).toBe(mockIncident.id);
      expect(stored.testScenario).toBeDefined();
    });

    it('should emit event after incident analysis', (done) => {
      mockEventBus.once('production.incident.analyzed', (event) => {
        expect(event.data.incidentId).toBe(mockIncident.id);
        expect(event.data.severity).toBe('CRITICAL');
        done();
      });

      const task = {
        id: 'task-3',
        type: 'incident-replay',
        payload: { incident: mockIncident },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      agent.executeTask(assignment);
    });

    it('should generate test with proper assertions', async () => {
      const task = {
        id: 'task-4',
        type: 'incident-replay',
        payload: { incident: mockIncident },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-4',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.testScenario.assertions).toBeDefined();
      expect(result.testScenario.assertions.length).toBeGreaterThan(0);
      expect(result.testScenario.assertions).toContain(
        expect.stringContaining('expect')
      );
    });
  });

  // ============================================================================
  // RUM Analysis Tests
  // ============================================================================

  describe('RUM analysis', () => {
    it('should perform RUM analysis', async () => {
      const task = {
        id: 'task-rum-1',
        type: 'rum-analysis',
        payload: { timeWindow: '7d' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-rum-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.userJourneys).toBeDefined();
      expect(result.errorPatterns).toBeDefined();
      expect(result.performanceInsights).toBeDefined();
      expect(result.generatedTests).toBeDefined();
    });

    it('should generate tests from user journeys', async () => {
      const task = {
        id: 'task-rum-2',
        type: 'rum-analysis',
        payload: { timeWindow: '30d' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-rum-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.generatedTests.length).toBeGreaterThan(0);
      expect(result.generatedTests[0]).toHaveProperty('id');
      expect(result.generatedTests[0]).toHaveProperty('name');
      expect(result.generatedTests[0]).toHaveProperty('type');
    });

    it('should store RUM analysis in memory', async () => {
      const task = {
        id: 'task-rum-3',
        type: 'rum-analysis',
        payload: { timeWindow: '7d' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-rum-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const stored = await mockMemoryStore.retrieve('aqe/rum-data/latest');
      expect(stored).toBeDefined();
      expect(stored.userJourneys).toBeDefined();
    });

    it('should emit event after RUM analysis', (done) => {
      mockEventBus.once('production.rum.analyzed', (event) => {
        expect(event.data.journeys).toBeGreaterThan(0);
        done();
      });

      const task = {
        id: 'task-rum-4',
        type: 'rum-analysis',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-rum-4',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      agent.executeTask(assignment);
    });
  });

  // ============================================================================
  // Anomaly Detection Tests
  // ============================================================================

  describe('anomaly detection', () => {
    it('should detect error rate spikes', async () => {
      const task = {
        id: 'task-anomaly-1',
        type: 'anomaly-detection',
        payload: {
          currentMetrics: {
            errorRate: 0.15, // 15% error rate (high)
            activeUsers: 10000
          }
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-anomaly-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.anomalies).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should detect latency degradation', async () => {
      const task = {
        id: 'task-anomaly-2',
        type: 'anomaly-detection',
        payload: {
          currentMetrics: {
            errorRate: 0.005, // Normal
            latency: { p95: 500 }, // High latency
            endpoints: ['/api/orders', '/api/products']
          }
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-anomaly-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.anomalies).toBeDefined();
      const latencyAnomaly = result.anomalies.find((a: any) => a.type === 'LATENCY_DEGRADATION');
      if (latencyAnomaly) {
        expect(latencyAnomaly.severity).toBeDefined();
      }
    });

    it('should detect user behavior anomalies', async () => {
      const task = {
        id: 'task-anomaly-3',
        type: 'anomaly-detection',
        payload: {
          currentMetrics: {
            errorRate: 0.005,
            conversionRate: 0.3 // Low conversion (baseline ~0.75)
          }
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-anomaly-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      const behaviorAnomaly = result.anomalies.find((a: any) => a.type === 'USER_BEHAVIOR_ANOMALY');
      if (behaviorAnomaly) {
        expect(behaviorAnomaly.hypothesis).toBeDefined();
      }
    });

    it('should emit critical event for critical anomalies', (done) => {
      mockEventBus.once('production.anomaly.critical', (event) => {
        expect(event.data.count).toBeGreaterThan(0);
        expect(event.priority).toBe('critical');
        done();
      });

      const task = {
        id: 'task-anomaly-4',
        type: 'anomaly-detection',
        payload: {
          currentMetrics: {
            errorRate: 0.5, // 50% error rate - CRITICAL
            activeUsers: 5000
          }
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-anomaly-4',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      agent.executeTask(assignment);
    });

    it('should store anomaly detection results', async () => {
      const task = {
        id: 'task-anomaly-5',
        type: 'anomaly-detection',
        payload: {
          currentMetrics: { errorRate: 0.1 }
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-anomaly-5',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      const stored = await mockMemoryStore.retrieve('aqe/anomalies/latest');
      expect(stored).toBeDefined();
      expect(stored.anomalies).toBeDefined();
    });
  });

  // ============================================================================
  // Load Pattern Analysis Tests
  // ============================================================================

  describe('load pattern analysis', () => {
    it('should analyze load patterns', async () => {
      const task = {
        id: 'task-load-1',
        type: 'load-pattern-analysis',
        payload: { timeWindow: '30d' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-load-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.loadPattern).toBeDefined();
      expect(result.loadTestScript).toBeDefined();
      expect(result.recommendations).toBeDefined();
    });

    it('should extract daily traffic patterns', async () => {
      const task = {
        id: 'task-load-2',
        type: 'load-pattern-analysis',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-load-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.loadPattern.dailyPattern).toBeDefined();
      expect(result.loadPattern.dailyPattern.hourly).toHaveLength(24);
      expect(result.loadPattern.dailyPattern.peakHours).toBeDefined();
    });

    it('should generate k6 load test script', async () => {
      const task = {
        id: 'task-load-3',
        type: 'load-pattern-analysis',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-load-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.loadTestScript).toContain('import');
      expect(result.loadTestScript).toContain('export let options');
      expect(result.loadTestScript).toContain('stages');
      expect(result.loadTestScript).toContain('thresholds');
    });

    it('should provide load test recommendations', async () => {
      const task = {
        id: 'task-load-4',
        type: 'load-pattern-analysis',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-load-4',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain('RPS');
    });
  });

  // ============================================================================
  // Feature Usage Analytics Tests
  // ============================================================================

  describe('feature usage analytics', () => {
    it('should analyze feature usage', async () => {
      const task = {
        id: 'task-feature-1',
        type: 'feature-usage-analytics',
        payload: { timeWindow: '30d' },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-feature-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.features).toBeDefined();
      expect(result.unusedFeatures).toBeDefined();
    });

    it('should prioritize features by usage', async () => {
      const task = {
        id: 'task-feature-2',
        type: 'feature-usage-analytics',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-feature-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.features.length).toBeGreaterThan(0);

      // Check priority assignment
      const highUsageFeature = result.features.find((f: any) => f.usage > 0.5);
      if (highUsageFeature) {
        expect(highUsageFeature.priority).toBe('CRITICAL');
      }
    });

    it('should identify unused features', async () => {
      const task = {
        id: 'task-feature-3',
        type: 'feature-usage-analytics',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-feature-3',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.unusedFeatures).toBeDefined();
      result.unusedFeatures.forEach((feature: any) => {
        expect(feature.recommendation).toContain('remove');
      });
    });
  });

  // ============================================================================
  // Memory Coordination Tests
  // ============================================================================

  describe('memory coordination', () => {
    it('should store data in aqe/production namespace', async () => {
      const mockIncident: ProductionIncident = {
        id: 'INC-MEM-TEST',
        timestamp: '2025-09-30T10:00:00.000Z',
        severity: 'HIGH',
        service: 'test-service',
        error: 'Test error',
        affectedUsers: 100,
        duration: 5000,
        region: 'us-west-1',
        context: {
          systemState: {
            cpu: 50,
            memory: 2,
            connections: 100,
            queueDepth: 500,
            cacheHitRate: 80
          }
        }
      };

      const task = {
        id: 'task-mem-1',
        type: 'incident-replay',
        payload: { incident: mockIncident },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-mem-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await agent.executeTask(assignment);

      // Check memory keys
      const keys = mockMemoryStore.getAllKeys();
      const productionKeys = keys.filter(k => k.includes('aqe/incidents'));
      expect(productionKeys.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('error handling', () => {
    it('should handle invalid task type', async () => {
      const task = {
        id: 'task-error-1',
        type: 'invalid-task-type',
        payload: {},
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-error-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      await expect(agent.executeTask(assignment)).rejects.toThrow();
    });
  });

  // ============================================================================
  // Integration Tests
  // ============================================================================

  describe('integration', () => {
    it('should generate tests from multiple incidents', async () => {
      const task = {
        id: 'task-int-1',
        type: 'generate-tests-from-incidents',
        payload: {
          severityFilter: ['HIGH', 'CRITICAL'],
          limit: 5
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-int-1',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result).toBeDefined();
      expect(result.testSuites).toBeDefined();
      expect(result.totalTests).toBeGreaterThan(0);
    });

    it('should generate tests from RUM data', async () => {
      const task = {
        id: 'task-int-2',
        type: 'generate-tests-from-rum',
        payload: {
          timeWindow: '7d',
          minJourneyFrequency: 100
        },
        priority: 1,
        status: 'pending'
      };

      const assignment = {
        id: 'assignment-int-2',
        task,
        agentId: agent.getStatus().agentId.id,
        assignedAt: new Date(),
        status: 'assigned'
      };

      const result = await agent.executeTask(assignment);

      expect(result.testSuites).toBeDefined();
      expect(result.totalTests).toBeGreaterThan(0);
    });
  });
});
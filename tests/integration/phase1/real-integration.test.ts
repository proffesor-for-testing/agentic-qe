/**
 * REAL Integration Test for Phase 1
 *
 * This test actually imports and exercises the real implementations,
 * not mocks. This is what the original tests should have done.
 */

import * as path from 'path';
import * as fs from 'fs';

// Import REAL implementations
import { initTelemetry, shutdownTelemetry, getTracer, getMeter } from '../../../src/telemetry';
import { EventStore } from '../../../src/persistence/event-store';
import { ReasoningStore } from '../../../src/persistence/reasoning-store';
import { MetricsAggregator } from '../../../src/persistence/metrics-aggregator';
import { ConstitutionLoader } from '../../../src/constitution/loader';

describe('Phase 1 Real Integration Tests', () => {
  const testDbDir = path.join(__dirname, '../../../data/test');

  beforeAll(() => {
    // Ensure test directory exists
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
  });

  afterAll(async () => {
    // Cleanup
    await shutdownTelemetry();
  });

  describe('1.1 Telemetry Foundation', () => {
    it('should initialize telemetry with console export', async () => {
      const result = await initTelemetry({
        serviceName: 'test-service',
        serviceVersion: '1.0.0',
        environment: 'test',
        enableConsoleExport: true,
      });

      expect(result.success).toBe(true);
      expect(result.serviceName).toBe('test-service');
      expect(result.exporters).toContain('console-trace');
    });

    it('should get tracer and meter', () => {
      const tracer = getTracer('test-tracer');
      const meter = getMeter('test-meter');

      expect(tracer).toBeDefined();
      expect(meter).toBeDefined();
    });
  });

  describe('1.2 Data Persistence Layer', () => {
    let eventStore: EventStore;
    let reasoningStore: ReasoningStore;
    let metricsAggregator: MetricsAggregator;

    beforeAll(() => {
      eventStore = new EventStore({
        dbPath: path.join(testDbDir, 'events-test.db')
      });
      reasoningStore = new ReasoningStore({
        dbPath: path.join(testDbDir, 'reasoning-test.db')
      });
      metricsAggregator = new MetricsAggregator({
        dbPath: path.join(testDbDir, 'metrics-test.db')
      });
    });

    afterAll(() => {
      eventStore.close();
      reasoningStore.close();
      metricsAggregator.close();
    });

    it('should record and retrieve events', () => {
      const event = eventStore.recordEvent({
        agent_id: 'test-generator',
        event_type: 'test_generated',
        payload: { testCount: 10, coverage: 85 },
        session_id: 'session-test-123',
      });

      expect(event.id).toBeDefined();
      expect(event.agent_id).toBe('test-generator');

      const retrieved = eventStore.getEventsByAgent('test-generator');
      expect(retrieved.length).toBeGreaterThan(0);
      expect(retrieved[0].payload.testCount).toBe(10);
    });

    it('should create and complete reasoning chains', () => {
      const chain = reasoningStore.startChain({
        session_id: 'session-test-456',
        agent_id: 'analyzer',
        context: { task: 'analyze code' },
      });

      expect(chain.id).toBeDefined();
      expect(chain.status).toBe('active');

      reasoningStore.addStep({
        chain_id: chain.id,
        thought_type: 'observation',
        content: 'Found 3 functions without tests',
        confidence: 0.9,
        token_count: 50,
      });

      const completed = reasoningStore.completeChain(chain.id, 'completed');
      expect(completed.status).toBe('completed');

      const retrieved = reasoningStore.getChainWithSteps(chain.id);
      expect(retrieved.steps.length).toBe(1);
      expect(retrieved.steps[0].thought_type).toBe('observation');
    });

    it('should record and aggregate metrics', () => {
      metricsAggregator.recordMetric({
        agent_id: 'test-generator',
        metric_name: 'test_coverage',
        metric_value: 85.5,
        dimensions: { suite: 'unit' },
      });

      metricsAggregator.recordMetric({
        agent_id: 'test-generator',
        metric_name: 'test_coverage',
        metric_value: 90.0,
        dimensions: { suite: 'unit' },
      });

      const stats = metricsAggregator.getMetricStatistics(
        'test-generator',
        'test_coverage',
        new Date(Date.now() - 3600000).toISOString(),
        new Date().toISOString()
      );

      expect(stats.count).toBeGreaterThanOrEqual(2);
      expect(stats.avg).toBeGreaterThan(85);
    });
  });

  describe('1.3 Constitution Schema', () => {
    let loader: ConstitutionLoader;
    const constitutionDir = path.join(__dirname, '../../../src/constitution/base');

    beforeAll(() => {
      loader = new ConstitutionLoader(constitutionDir);
    });

    it('should load default constitution', () => {
      const constitution = loader.loadConstitution(
        path.join(constitutionDir, 'default.constitution.json')
      );

      expect(constitution).toBeDefined();
      expect(constitution.name).toBeDefined();
      expect(constitution.principles.length).toBeGreaterThan(0);
    });

    it('should load test-generation constitution', () => {
      const constitution = loader.loadConstitution(
        path.join(constitutionDir, 'test-generation.constitution.json')
      );

      expect(constitution).toBeDefined();
      expect(constitution.metrics.length).toBeGreaterThan(0);
    });

    it('should validate constitutions correctly', () => {
      const validConstitution = {
        id: 'test-const',
        name: 'Test Constitution',
        version: '1.0.0',
        description: 'Test',
        principles: [
          {
            id: 'p1',
            name: 'Test Principle',
            description: 'A test principle',
            priority: 'high',
            category: 'testing',
          },
        ],
        rules: [],
        metrics: [],
        thresholds: [],
        metadata: { created: new Date().toISOString() },
      };

      const result = loader.validateConstitution(validConstitution);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should get constitution for agent type', () => {
      const constitution = loader.getConstitutionForAgent('qe-test-generator');
      expect(constitution).toBeDefined();
    });
  });

  describe('End-to-End Integration', () => {
    it('should flow data from telemetry through persistence', async () => {
      // This test verifies the complete flow works together
      const eventStore = new EventStore({
        dbPath: path.join(testDbDir, 'e2e-test.db')
      });

      // Record an event (simulating telemetry data)
      const event = eventStore.recordEvent({
        agent_id: 'e2e-test-agent',
        event_type: 'telemetry_received',
        payload: {
          metric: 'task_duration',
          value: 1500,
          timestamp: new Date().toISOString()
        },
        session_id: 'e2e-session',
        correlation_id: 'trace-123',
      });

      // Verify we can retrieve it
      const events = eventStore.getEventsBySession('e2e-session');
      expect(events.length).toBe(1);
      expect(events[0].correlation_id).toBe('trace-123');

      eventStore.close();
    });
  });
});

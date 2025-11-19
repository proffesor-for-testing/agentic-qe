/**
 * Integration Tests for Telemetry-Persistence
 * Tests that telemetry data flows correctly into persistence layer
 */

import * as fs from 'fs';
import * as path from 'path';

// Load fixtures
const eventsFixturePath = path.join(__dirname, '../../fixtures/phase1/sample-events.json');
const metricsFixturePath = path.join(__dirname, '../../fixtures/phase1/sample-metrics.json');
const eventsFixture = JSON.parse(fs.readFileSync(eventsFixturePath, 'utf-8'));
const metricsFixture = JSON.parse(fs.readFileSync(metricsFixturePath, 'utf-8'));

// Mock integrated system
interface TelemetryMetric {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  value: number;
  dimensions?: Record<string, any>;
  timestamp: number;
}

interface PersistedMetric {
  id: string;
  name: string;
  type: string;
  value: number;
  dimensions?: Record<string, any>;
  timestamp: string;
}

// Mock integrated telemetry-persistence system
class TelemetryPersistenceIntegration {
  private metrics: PersistedMetric[] = [];
  private events: any[] = [];
  private idCounter = 0;
  private eventBus: Array<(event: any) => void> = [];

  // Telemetry API
  recordMetric(metric: TelemetryMetric): void {
    const persisted: PersistedMetric = {
      id: `metric-${++this.idCounter}`,
      name: metric.name,
      type: metric.type,
      value: metric.value,
      dimensions: metric.dimensions,
      timestamp: new Date(metric.timestamp).toISOString()
    };

    this.metrics.push(persisted);
    this.emit({ type: 'metric:recorded', data: persisted });
  }

  recordEvent(event: any): void {
    const persisted = {
      id: `event-${++this.idCounter}`,
      ...event,
      timestamp: new Date().toISOString()
    };

    this.events.push(persisted);
    this.emit({ type: 'event:recorded', data: persisted });
  }

  // Persistence API
  getMetrics(query?: { name?: string; startTime?: string; endTime?: string }): PersistedMetric[] {
    let results = [...this.metrics];

    if (query?.name) {
      results = results.filter(m => m.name === query.name);
    }

    if (query?.startTime) {
      const start = new Date(query.startTime).getTime();
      results = results.filter(m => new Date(m.timestamp).getTime() >= start);
    }

    if (query?.endTime) {
      const end = new Date(query.endTime).getTime();
      results = results.filter(m => new Date(m.timestamp).getTime() <= end);
    }

    return results;
  }

  getEvents(query?: { type?: string }): any[] {
    let results = [...this.events];

    if (query?.type) {
      results = results.filter(e => e.type === query.type);
    }

    return results;
  }

  aggregateMetrics(name: string): { count: number; sum: number; avg: number; min: number; max: number } {
    const metrics = this.getMetrics({ name });
    if (metrics.length === 0) {
      return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
    }

    const values = metrics.map(m => m.value);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      sum,
      avg: sum / values.length,
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  // Event bus
  subscribe(callback: (event: any) => void): void {
    this.eventBus.push(callback);
  }

  private emit(event: any): void {
    for (const callback of this.eventBus) {
      callback(event);
    }
  }

  clear(): void {
    this.metrics = [];
    this.events = [];
    this.idCounter = 0;
    this.eventBus = [];
  }
}

describe('Telemetry-Persistence Integration', () => {
  let system: TelemetryPersistenceIntegration;

  beforeEach(() => {
    system = new TelemetryPersistenceIntegration();
  });

  afterEach(() => {
    system.clear();
  });

  describe('Metric Recording Flow', () => {
    test('should persist telemetry metrics', () => {
      system.recordMetric({
        name: 'qe.agent.task_duration',
        type: 'histogram',
        value: 5000,
        timestamp: Date.now()
      });

      const metrics = system.getMetrics({ name: 'qe.agent.task_duration' });

      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBe(5000);
    });

    test('should persist metric dimensions', () => {
      system.recordMetric({
        name: 'qe.tests.count',
        type: 'counter',
        value: 15,
        dimensions: {
          agent: 'qe-test-generator',
          framework: 'jest'
        },
        timestamp: Date.now()
      });

      const metrics = system.getMetrics({ name: 'qe.tests.count' });

      expect(metrics[0].dimensions).toEqual({
        agent: 'qe-test-generator',
        framework: 'jest'
      });
    });

    test('should generate unique IDs for persisted metrics', () => {
      const now = Date.now();

      system.recordMetric({ name: 'm1', type: 'counter', value: 1, timestamp: now });
      system.recordMetric({ name: 'm2', type: 'counter', value: 2, timestamp: now });
      system.recordMetric({ name: 'm3', type: 'counter', value: 3, timestamp: now });

      const metrics = system.getMetrics();
      const ids = metrics.map(m => m.id);

      expect(new Set(ids).size).toBe(3);
    });

    test('should convert timestamp to ISO string', () => {
      const timestamp = Date.now();

      system.recordMetric({
        name: 'qe.test',
        type: 'gauge',
        value: 100,
        timestamp
      });

      const metrics = system.getMetrics();

      expect(typeof metrics[0].timestamp).toBe('string');
      expect(new Date(metrics[0].timestamp).getTime()).toBe(timestamp);
    });

    test('should emit event when metric is recorded', () => {
      const events: any[] = [];
      system.subscribe(event => events.push(event));

      system.recordMetric({
        name: 'qe.test',
        type: 'counter',
        value: 1,
        timestamp: Date.now()
      });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('metric:recorded');
    });

    test('should persist metrics from fixture data', () => {
      for (const fixtureMetric of metricsFixture.qualityMetrics) {
        system.recordMetric({
          name: fixtureMetric.name,
          type: fixtureMetric.type,
          value: fixtureMetric.value,
          dimensions: fixtureMetric.dimensions,
          timestamp: new Date(fixtureMetric.timestamp).getTime()
        });
      }

      const metrics = system.getMetrics();
      expect(metrics).toHaveLength(metricsFixture.qualityMetrics.length);
    });
  });

  describe('Event Recording Flow', () => {
    test('should persist telemetry events', () => {
      system.recordEvent({
        type: 'agent:started',
        agentId: 'qe-test-generator',
        payload: { taskId: 'task-123' }
      });

      const events = system.getEvents({ type: 'agent:started' });

      expect(events).toHaveLength(1);
      expect(events[0].agentId).toBe('qe-test-generator');
    });

    test('should generate unique IDs for events', () => {
      system.recordEvent({ type: 'test:1' });
      system.recordEvent({ type: 'test:2' });
      system.recordEvent({ type: 'test:3' });

      const events = system.getEvents();
      const ids = events.map(e => e.id);

      expect(new Set(ids).size).toBe(3);
    });

    test('should add timestamp to events', () => {
      const before = Date.now();
      system.recordEvent({ type: 'test' });
      const after = Date.now();

      const events = system.getEvents();
      const eventTime = new Date(events[0].timestamp).getTime();

      expect(eventTime).toBeGreaterThanOrEqual(before);
      expect(eventTime).toBeLessThanOrEqual(after);
    });

    test('should emit event when event is recorded', () => {
      const emissions: any[] = [];
      system.subscribe(event => emissions.push(event));

      system.recordEvent({ type: 'test' });

      expect(emissions).toHaveLength(1);
      expect(emissions[0].type).toBe('event:recorded');
    });

    test('should persist events from fixture data', () => {
      for (const fixtureEvent of eventsFixture.agentEvents) {
        system.recordEvent({
          type: fixtureEvent.type,
          agentId: fixtureEvent.agentId,
          payload: fixtureEvent.payload
        });
      }

      const events = system.getEvents();
      expect(events).toHaveLength(eventsFixture.agentEvents.length);
    });
  });

  describe('Metric Aggregation', () => {
    test('should aggregate metrics correctly', () => {
      const values = [100, 200, 300, 400, 500];
      const now = Date.now();

      for (const value of values) {
        system.recordMetric({
          name: 'qe.test',
          type: 'histogram',
          value,
          timestamp: now
        });
      }

      const aggregated = system.aggregateMetrics('qe.test');

      expect(aggregated.count).toBe(5);
      expect(aggregated.sum).toBe(1500);
      expect(aggregated.avg).toBe(300);
      expect(aggregated.min).toBe(100);
      expect(aggregated.max).toBe(500);
    });

    test('should return zeros for non-existent metric', () => {
      const aggregated = system.aggregateMetrics('non.existent');

      expect(aggregated.count).toBe(0);
      expect(aggregated.sum).toBe(0);
    });

    test('should aggregate single metric', () => {
      system.recordMetric({
        name: 'qe.single',
        type: 'gauge',
        value: 42,
        timestamp: Date.now()
      });

      const aggregated = system.aggregateMetrics('qe.single');

      expect(aggregated.count).toBe(1);
      expect(aggregated.avg).toBe(42);
    });
  });

  describe('Query Filtering', () => {
    beforeEach(() => {
      const now = Date.now();

      // Seed test data
      system.recordMetric({ name: 'metric.a', type: 'counter', value: 1, timestamp: now - 60000 });
      system.recordMetric({ name: 'metric.a', type: 'counter', value: 2, timestamp: now });
      system.recordMetric({ name: 'metric.b', type: 'gauge', value: 10, timestamp: now });
    });

    test('should filter metrics by name', () => {
      const metrics = system.getMetrics({ name: 'metric.a' });

      expect(metrics).toHaveLength(2);
      expect(metrics.every(m => m.name === 'metric.a')).toBe(true);
    });

    test('should filter metrics by time range', () => {
      const now = Date.now();
      const metrics = system.getMetrics({
        startTime: new Date(now - 30000).toISOString()
      });

      expect(metrics.length).toBeLessThan(3);
    });

    test('should filter events by type', () => {
      system.recordEvent({ type: 'agent:started' });
      system.recordEvent({ type: 'agent:completed' });
      system.recordEvent({ type: 'agent:started' });

      const events = system.getEvents({ type: 'agent:started' });

      expect(events).toHaveLength(2);
    });
  });

  describe('Real-world QE Workflows', () => {
    test('should track complete test generation workflow', () => {
      const now = Date.now();

      // Record task start event
      system.recordEvent({
        type: 'agent:task_started',
        agentId: 'qe-test-generator',
        payload: { taskId: 'task-123' }
      });

      // Record metrics during execution
      system.recordMetric({
        name: 'qe.agent.task_duration',
        type: 'histogram',
        value: 5000,
        dimensions: { agent: 'qe-test-generator' },
        timestamp: now
      });

      system.recordMetric({
        name: 'qe.tests.generated_count',
        type: 'counter',
        value: 15,
        dimensions: { agent: 'qe-test-generator', framework: 'jest' },
        timestamp: now
      });

      system.recordMetric({
        name: 'qe.coverage.percentage',
        type: 'gauge',
        value: 85.5,
        dimensions: { project: 'user-service' },
        timestamp: now
      });

      // Record task completion event
      system.recordEvent({
        type: 'agent:task_completed',
        agentId: 'qe-test-generator',
        payload: {
          taskId: 'task-123',
          result: { testsGenerated: 15, coverage: 85.5 }
        }
      });

      // Verify all data was persisted
      const events = system.getEvents();
      const metrics = system.getMetrics();

      expect(events).toHaveLength(2);
      expect(metrics).toHaveLength(3);

      // Verify aggregations
      const durationAgg = system.aggregateMetrics('qe.agent.task_duration');
      expect(durationAgg.avg).toBe(5000);
    });

    test('should track fleet-wide metrics', () => {
      const now = Date.now();
      const agents = ['test-generator', 'coverage-analyzer', 'security-scanner'];

      // Record metrics from multiple agents
      for (const agent of agents) {
        system.recordMetric({
          name: 'qe.agent.task_duration',
          type: 'histogram',
          value: Math.random() * 5000 + 1000,
          dimensions: { agent },
          timestamp: now
        });
      }

      const metrics = system.getMetrics({ name: 'qe.agent.task_duration' });
      expect(metrics).toHaveLength(3);

      const aggregated = system.aggregateMetrics('qe.agent.task_duration');
      expect(aggregated.count).toBe(3);
    });

    test('should handle concurrent metric recording', async () => {
      const now = Date.now();
      const recordPromises: Promise<void>[] = [];

      // Simulate concurrent metric recording
      for (let i = 0; i < 100; i++) {
        recordPromises.push(
          new Promise<void>(resolve => {
            system.recordMetric({
              name: 'qe.concurrent.test',
              type: 'counter',
              value: i,
              timestamp: now
            });
            resolve();
          })
        );
      }

      await Promise.all(recordPromises);

      const metrics = system.getMetrics({ name: 'qe.concurrent.test' });
      expect(metrics).toHaveLength(100);
    });

    test('should persist error events with metrics', () => {
      const now = Date.now();

      // Record error event
      system.recordEvent({
        type: 'agent:error',
        agentId: 'qe-coverage-analyzer',
        payload: {
          taskId: 'task-456',
          error: 'Timeout',
          code: 'TIMEOUT_ERROR'
        }
      });

      // Record error metric
      system.recordMetric({
        name: 'qe.agent.error_count',
        type: 'counter',
        value: 1,
        dimensions: {
          agent: 'qe-coverage-analyzer',
          errorType: 'TIMEOUT_ERROR'
        },
        timestamp: now
      });

      const errorEvents = system.getEvents({ type: 'agent:error' });
      const errorMetrics = system.getMetrics({ name: 'qe.agent.error_count' });

      expect(errorEvents).toHaveLength(1);
      expect(errorMetrics).toHaveLength(1);
    });
  });

  describe('Event Bus Integration', () => {
    test('should notify subscribers of all events', () => {
      const metricEvents: any[] = [];
      const eventEvents: any[] = [];

      system.subscribe(event => {
        if (event.type === 'metric:recorded') {
          metricEvents.push(event);
        } else if (event.type === 'event:recorded') {
          eventEvents.push(event);
        }
      });

      system.recordMetric({
        name: 'qe.test',
        type: 'counter',
        value: 1,
        timestamp: Date.now()
      });

      system.recordEvent({ type: 'test' });

      expect(metricEvents).toHaveLength(1);
      expect(eventEvents).toHaveLength(1);
    });

    test('should support multiple subscribers', () => {
      let count1 = 0;
      let count2 = 0;

      system.subscribe(() => count1++);
      system.subscribe(() => count2++);

      system.recordMetric({
        name: 'qe.test',
        type: 'counter',
        value: 1,
        timestamp: Date.now()
      });

      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });
  });
});

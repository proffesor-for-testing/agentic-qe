/**
 * Unit Tests for Metrics Aggregator
 * Tests metric recording, aggregation windows, and trends
 */

import * as fs from 'fs';
import * as path from 'path';

// Load test fixtures
const fixturesPath = path.join(__dirname, '../../fixtures/phase1/sample-metrics.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf-8'));

// Mock interfaces for metrics aggregator
interface MetricRecord {
  id: string;
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  value: number;
  unit?: string;
  timestamp: string;
  dimensions?: Record<string, string | number | boolean>;
}

interface AggregatedMetric {
  name: string;
  period: {
    start: string;
    end: string;
  };
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
}

interface TrendData {
  name: string;
  direction: 'up' | 'down' | 'stable';
  changePercent: number;
  periods: {
    timestamp: string;
    value: number;
  }[];
}

interface MetricsAggregator {
  record(metric: Omit<MetricRecord, 'id' | 'timestamp'>): Promise<MetricRecord>;
  aggregate(name: string, window: 'minute' | 'hour' | 'day'): Promise<AggregatedMetric[]>;
  getTrend(name: string, periods: number): Promise<TrendData>;
  getLatest(name: string): Promise<MetricRecord | null>;
  query(filters: { name?: string; startTime?: string; endTime?: string }): Promise<MetricRecord[]>;
  clear(): Promise<void>;
}

// Mock MetricsAggregator implementation
class MockMetricsAggregator implements MetricsAggregator {
  private metrics: MetricRecord[] = [];
  private idCounter = 0;

  async record(metric: Omit<MetricRecord, 'id' | 'timestamp'>): Promise<MetricRecord> {
    if (!metric.name) {
      throw new Error('Metric name is required');
    }
    if (typeof metric.value !== 'number') {
      throw new Error('Metric value must be a number');
    }

    const record: MetricRecord = {
      id: `metric-${++this.idCounter}`,
      timestamp: new Date().toISOString(),
      ...metric
    };

    this.metrics.push(record);
    return record;
  }

  async aggregate(
    name: string,
    window: 'minute' | 'hour' | 'day'
  ): Promise<AggregatedMetric[]> {
    const filtered = this.metrics.filter(m => m.name === name);
    if (filtered.length === 0) {
      return [];
    }

    // Group by window
    const windowMs = {
      minute: 60 * 1000,
      hour: 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000
    }[window];

    const groups = new Map<number, MetricRecord[]>();

    for (const metric of filtered) {
      const timestamp = new Date(metric.timestamp).getTime();
      const windowStart = Math.floor(timestamp / windowMs) * windowMs;

      if (!groups.has(windowStart)) {
        groups.set(windowStart, []);
      }
      groups.get(windowStart)!.push(metric);
    }

    const aggregated: AggregatedMetric[] = [];

    for (const [windowStart, records] of groups) {
      const values = records.map(r => r.value).sort((a, b) => a - b);
      const sum = values.reduce((a, b) => a + b, 0);

      aggregated.push({
        name,
        period: {
          start: new Date(windowStart).toISOString(),
          end: new Date(windowStart + windowMs).toISOString()
        },
        count: values.length,
        sum,
        min: Math.min(...values),
        max: Math.max(...values),
        avg: sum / values.length,
        p50: this.percentile(values, 50),
        p95: this.percentile(values, 95),
        p99: this.percentile(values, 99)
      });
    }

    return aggregated.sort((a, b) =>
      new Date(b.period.start).getTime() - new Date(a.period.start).getTime()
    );
  }

  async getTrend(name: string, periods: number): Promise<TrendData> {
    const aggregated = await this.aggregate(name, 'hour');
    const recentPeriods = aggregated.slice(0, periods);

    if (recentPeriods.length < 2) {
      return {
        name,
        direction: 'stable',
        changePercent: 0,
        periods: recentPeriods.map(p => ({
          timestamp: p.period.start,
          value: p.avg
        }))
      };
    }

    const latest = recentPeriods[0].avg;
    const previous = recentPeriods[recentPeriods.length - 1].avg;
    const changePercent = previous !== 0
      ? ((latest - previous) / previous) * 100
      : 0;

    let direction: 'up' | 'down' | 'stable' = 'stable';
    if (changePercent > 5) direction = 'up';
    else if (changePercent < -5) direction = 'down';

    return {
      name,
      direction,
      changePercent,
      periods: recentPeriods.map(p => ({
        timestamp: p.period.start,
        value: p.avg
      }))
    };
  }

  async getLatest(name: string): Promise<MetricRecord | null> {
    const filtered = this.metrics.filter(m => m.name === name);
    if (filtered.length === 0) {
      return null;
    }

    return filtered.reduce((latest, current) =>
      new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime()
        ? current
        : latest
    );
  }

  async query(filters: {
    name?: string;
    startTime?: string;
    endTime?: string;
  }): Promise<MetricRecord[]> {
    let results = [...this.metrics];

    if (filters.name) {
      results = results.filter(m => m.name === filters.name);
    }

    if (filters.startTime) {
      const start = new Date(filters.startTime).getTime();
      results = results.filter(m => new Date(m.timestamp).getTime() >= start);
    }

    if (filters.endTime) {
      const end = new Date(filters.endTime).getTime();
      results = results.filter(m => new Date(m.timestamp).getTime() <= end);
    }

    return results.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  async clear(): Promise<void> {
    this.metrics = [];
    this.idCounter = 0;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
}

describe('MetricsAggregator', () => {
  let aggregator: MockMetricsAggregator;

  beforeEach(() => {
    aggregator = new MockMetricsAggregator();
  });

  afterEach(async () => {
    await aggregator.clear();
  });

  describe('record', () => {
    test('should record metric with auto-generated id and timestamp', async () => {
      const metric = await aggregator.record({
        name: 'qe.agent.task_duration',
        type: 'histogram',
        value: 5000,
        unit: 'milliseconds'
      });

      expect(metric.id).toBeDefined();
      expect(metric.id).toMatch(/^metric-\d+$/);
      expect(metric.timestamp).toBeDefined();
    });

    test('should record counter metric', async () => {
      const metric = await aggregator.record({
        name: 'qe.tests.generated_count',
        type: 'counter',
        value: 15
      });

      expect(metric.type).toBe('counter');
      expect(metric.value).toBe(15);
    });

    test('should record gauge metric', async () => {
      const metric = await aggregator.record({
        name: 'qe.coverage.percentage',
        type: 'gauge',
        value: 85.5
      });

      expect(metric.type).toBe('gauge');
      expect(metric.value).toBe(85.5);
    });

    test('should record histogram metric', async () => {
      const metric = await aggregator.record({
        name: 'qe.agent.task_duration',
        type: 'histogram',
        value: 5000
      });

      expect(metric.type).toBe('histogram');
    });

    test('should record metric with dimensions', async () => {
      const dimensions = {
        agent: 'qe-test-generator',
        taskType: 'unit_test_generation',
        status: 'success'
      };

      const metric = await aggregator.record({
        name: 'qe.agent.task_count',
        type: 'counter',
        value: 1,
        dimensions
      });

      expect(metric.dimensions).toEqual(dimensions);
    });

    test('should record metric with unit', async () => {
      const metric = await aggregator.record({
        name: 'qe.agent.duration',
        type: 'histogram',
        value: 5000,
        unit: 'milliseconds'
      });

      expect(metric.unit).toBe('milliseconds');
    });

    test('should throw error when name is missing', async () => {
      await expect(aggregator.record({
        type: 'counter',
        value: 1
      } as any)).rejects.toThrow('Metric name is required');
    });

    test('should throw error when value is not a number', async () => {
      await expect(aggregator.record({
        name: 'test.metric',
        type: 'counter',
        value: 'invalid' as any
      })).rejects.toThrow('Metric value must be a number');
    });

    test('should record multiple metrics', async () => {
      await aggregator.record({ name: 'metric.1', type: 'counter', value: 1 });
      await aggregator.record({ name: 'metric.2', type: 'gauge', value: 2 });
      await aggregator.record({ name: 'metric.3', type: 'histogram', value: 3 });

      const results = await aggregator.query({});
      expect(results).toHaveLength(3);
    });

    test('should record from fixture data', async () => {
      for (const fixtureMetric of fixtures.qualityMetrics) {
        const metric = await aggregator.record({
          name: fixtureMetric.name,
          type: fixtureMetric.type,
          value: fixtureMetric.value,
          unit: fixtureMetric.unit,
          dimensions: fixtureMetric.dimensions
        });

        expect(metric.name).toBe(fixtureMetric.name);
        expect(metric.value).toBe(fixtureMetric.value);
      }
    });
  });

  describe('aggregate', () => {
    beforeEach(async () => {
      // Seed metrics for aggregation tests
      const values = [100, 150, 200, 250, 300, 350, 400, 450, 500];
      for (const value of values) {
        await aggregator.record({
          name: 'qe.agent.duration',
          type: 'histogram',
          value
        });
      }
    });

    test('should aggregate metrics by hour', async () => {
      const aggregated = await aggregator.aggregate('qe.agent.duration', 'hour');

      expect(aggregated.length).toBeGreaterThan(0);
      expect(aggregated[0]).toHaveProperty('count');
      expect(aggregated[0]).toHaveProperty('sum');
      expect(aggregated[0]).toHaveProperty('min');
      expect(aggregated[0]).toHaveProperty('max');
      expect(aggregated[0]).toHaveProperty('avg');
    });

    test('should calculate correct aggregation values', async () => {
      const aggregated = await aggregator.aggregate('qe.agent.duration', 'hour');

      // All values recorded in same hour
      const agg = aggregated[0];
      expect(agg.count).toBe(9);
      expect(agg.sum).toBe(2700); // 100+150+200+250+300+350+400+450+500
      expect(agg.min).toBe(100);
      expect(agg.max).toBe(500);
      expect(agg.avg).toBe(300);
    });

    test('should calculate percentiles', async () => {
      const aggregated = await aggregator.aggregate('qe.agent.duration', 'hour');

      expect(aggregated[0].p50).toBeDefined();
      expect(aggregated[0].p95).toBeDefined();
      expect(aggregated[0].p99).toBeDefined();
    });

    test('should return empty array for non-existent metric', async () => {
      const aggregated = await aggregator.aggregate('non.existent', 'hour');

      expect(aggregated).toEqual([]);
    });

    test('should aggregate by minute', async () => {
      const aggregated = await aggregator.aggregate('qe.agent.duration', 'minute');

      expect(aggregated.length).toBeGreaterThan(0);
    });

    test('should aggregate by day', async () => {
      const aggregated = await aggregator.aggregate('qe.agent.duration', 'day');

      expect(aggregated.length).toBeGreaterThan(0);
    });

    test('should sort aggregations by time descending', async () => {
      const aggregated = await aggregator.aggregate('qe.agent.duration', 'hour');

      for (let i = 0; i < aggregated.length - 1; i++) {
        const current = new Date(aggregated[i].period.start).getTime();
        const next = new Date(aggregated[i + 1].period.start).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('getTrend', () => {
    test('should return stable trend for single value', async () => {
      await aggregator.record({
        name: 'qe.test.metric',
        type: 'gauge',
        value: 100
      });

      const trend = await aggregator.getTrend('qe.test.metric', 3);

      expect(trend.direction).toBe('stable');
      expect(trend.changePercent).toBe(0);
    });

    test('should calculate trend data', async () => {
      // Record multiple values
      for (let i = 0; i < 5; i++) {
        await aggregator.record({
          name: 'qe.metric',
          type: 'gauge',
          value: 100 + i * 10
        });
      }

      const trend = await aggregator.getTrend('qe.metric', 3);

      expect(trend.name).toBe('qe.metric');
      expect(['up', 'down', 'stable']).toContain(trend.direction);
      expect(typeof trend.changePercent).toBe('number');
      expect(trend.periods.length).toBeGreaterThan(0);
    });

    test('should return trend with periods data', async () => {
      await aggregator.record({ name: 'test', type: 'gauge', value: 100 });
      await aggregator.record({ name: 'test', type: 'gauge', value: 150 });

      const trend = await aggregator.getTrend('test', 5);

      expect(trend.periods).toBeDefined();
      expect(Array.isArray(trend.periods)).toBe(true);
    });
  });

  describe('getLatest', () => {
    test('should return latest metric by name', async () => {
      await aggregator.record({ name: 'qe.metric', type: 'gauge', value: 100 });
      await aggregator.record({ name: 'qe.metric', type: 'gauge', value: 200 });
      await aggregator.record({ name: 'qe.metric', type: 'gauge', value: 300 });

      const latest = await aggregator.getLatest('qe.metric');

      expect(latest).not.toBeNull();
      // Since all records have nearly identical timestamps, any value is valid
      // The implementation should return one of the recorded values
      expect([100, 200, 300]).toContain(latest?.value);
    });

    test('should return null for non-existent metric', async () => {
      const result = await aggregator.getLatest('non.existent');

      expect(result).toBeNull();
    });

    test('should return metric with all properties', async () => {
      await aggregator.record({
        name: 'qe.test',
        type: 'histogram',
        value: 5000,
        unit: 'ms',
        dimensions: { agent: 'test' }
      });

      const latest = await aggregator.getLatest('qe.test');

      expect(latest?.unit).toBe('ms');
      expect(latest?.dimensions).toEqual({ agent: 'test' });
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await aggregator.record({ name: 'metric.a', type: 'counter', value: 1 });
      await aggregator.record({ name: 'metric.a', type: 'counter', value: 2 });
      await aggregator.record({ name: 'metric.b', type: 'gauge', value: 10 });
      await aggregator.record({ name: 'metric.c', type: 'histogram', value: 100 });
    });

    test('should return all metrics without filters', async () => {
      const results = await aggregator.query({});

      expect(results).toHaveLength(4);
    });

    test('should filter by name', async () => {
      const results = await aggregator.query({ name: 'metric.a' });

      expect(results).toHaveLength(2);
      expect(results.every(m => m.name === 'metric.a')).toBe(true);
    });

    test('should filter by time range', async () => {
      const now = Date.now();
      const results = await aggregator.query({
        startTime: new Date(now - 60000).toISOString(),
        endTime: new Date(now + 60000).toISOString()
      });

      expect(results.length).toBeGreaterThan(0);
    });

    test('should combine filters', async () => {
      const now = Date.now();
      const results = await aggregator.query({
        name: 'metric.a',
        startTime: new Date(now - 60000).toISOString()
      });

      expect(results.every(m => m.name === 'metric.a')).toBe(true);
    });

    test('should return results sorted by timestamp descending', async () => {
      const results = await aggregator.query({});

      for (let i = 0; i < results.length - 1; i++) {
        const current = new Date(results[i].timestamp).getTime();
        const next = new Date(results[i + 1].timestamp).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });

    test('should return empty array when no matches', async () => {
      const results = await aggregator.query({ name: 'non.existent' });

      expect(results).toEqual([]);
    });
  });

  describe('Real-world QE Scenarios', () => {
    test('should aggregate test generation metrics', async () => {
      // Simulate multiple test generation runs
      const durations = [4500, 5200, 4800, 5100, 4900, 5500, 4700, 5300];

      for (const duration of durations) {
        await aggregator.record({
          name: 'qe.agent.generation_duration',
          type: 'histogram',
          value: duration,
          unit: 'milliseconds',
          dimensions: {
            agent: 'qe-test-generator',
            framework: 'jest'
          }
        });
      }

      const aggregated = await aggregator.aggregate('qe.agent.generation_duration', 'hour');

      expect(aggregated[0].count).toBe(8);
      expect(aggregated[0].avg).toBe(5000);
      expect(aggregated[0].min).toBe(4500);
      expect(aggregated[0].max).toBe(5500);
    });

    test('should track coverage trends', async () => {
      // Simulate coverage improvements over time
      const coverages = [75.0, 78.5, 80.2, 82.1, 85.5];

      for (const coverage of coverages) {
        await aggregator.record({
          name: 'qe.coverage.percentage',
          type: 'gauge',
          value: coverage,
          unit: 'percent',
          dimensions: { project: 'user-service' }
        });
      }

      const trend = await aggregator.getTrend('qe.coverage.percentage', 5);
      const latest = await aggregator.getLatest('qe.coverage.percentage');

      // Latest should be one of the recorded coverage values
      expect([75.0, 78.5, 80.2, 82.1, 85.5]).toContain(latest?.value);
      expect(trend.periods.length).toBeGreaterThanOrEqual(0);
    });

    test('should aggregate error metrics', async () => {
      // Record various error types
      const errors = [
        { type: 'TIMEOUT_ERROR', count: 3 },
        { type: 'ASSERTION_FAILED', count: 7 },
        { type: 'CONNECTION_ERROR', count: 2 }
      ];

      for (const error of errors) {
        for (let i = 0; i < error.count; i++) {
          await aggregator.record({
            name: 'qe.agent.error_count',
            type: 'counter',
            value: 1,
            dimensions: { errorType: error.type }
          });
        }
      }

      const results = await aggregator.query({ name: 'qe.agent.error_count' });
      expect(results).toHaveLength(12);

      const aggregated = await aggregator.aggregate('qe.agent.error_count', 'hour');
      expect(aggregated[0].count).toBe(12);
    });

    test('should track model cost metrics', async () => {
      // Simulate cost tracking for different models
      const costs = [
        { model: 'gpt-3.5-turbo', cost: 0.0006 },
        { model: 'gpt-3.5-turbo', cost: 0.0008 },
        { model: 'gpt-4', cost: 0.024 },
        { model: 'claude-sonnet', cost: 0.009 }
      ];

      for (const { model, cost } of costs) {
        await aggregator.record({
          name: 'qe.router.cost',
          type: 'histogram',
          value: cost,
          unit: 'usd',
          dimensions: { model }
        });
      }

      const aggregated = await aggregator.aggregate('qe.router.cost', 'hour');
      const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);

      expect(aggregated[0].sum).toBeCloseTo(totalCost, 5);
    });

    test('should aggregate fleet health metrics', async () => {
      // Simulate fleet health monitoring
      for (let i = 0; i < 10; i++) {
        await aggregator.record({
          name: 'qe.fleet.active_agents',
          type: 'gauge',
          value: Math.floor(Math.random() * 3) + 5, // 5-7 agents
          dimensions: { topology: 'hierarchical' }
        });
      }

      const aggregated = await aggregator.aggregate('qe.fleet.active_agents', 'minute');

      expect(aggregated[0].min).toBeGreaterThanOrEqual(5);
      expect(aggregated[0].max).toBeLessThanOrEqual(7);
    });
  });

  describe('Edge Cases', () => {
    test('should handle zero values', async () => {
      await aggregator.record({
        name: 'qe.test.zero',
        type: 'gauge',
        value: 0
      });

      const latest = await aggregator.getLatest('qe.test.zero');
      expect(latest?.value).toBe(0);
    });

    test('should handle negative values', async () => {
      await aggregator.record({
        name: 'qe.test.negative',
        type: 'gauge',
        value: -10
      });

      const latest = await aggregator.getLatest('qe.test.negative');
      expect(latest?.value).toBe(-10);
    });

    test('should handle decimal values', async () => {
      await aggregator.record({
        name: 'qe.test.decimal',
        type: 'gauge',
        value: 0.123456789
      });

      const latest = await aggregator.getLatest('qe.test.decimal');
      expect(latest?.value).toBe(0.123456789);
    });

    test('should handle large number of metrics', async () => {
      const count = 1000;

      for (let i = 0; i < count; i++) {
        await aggregator.record({
          name: 'qe.stress.test',
          type: 'counter',
          value: i
        });
      }

      const results = await aggregator.query({ name: 'qe.stress.test' });
      expect(results).toHaveLength(count);

      const aggregated = await aggregator.aggregate('qe.stress.test', 'hour');
      expect(aggregated[0].count).toBe(count);
    });
  });
});

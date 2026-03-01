/**
 * Unit Tests for Metric Collectors
 * ADR-024: Self-Optimization Engine
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SearchLatencyCollector,
  RoutingAccuracyCollector,
  PatternQualityCollector,
  TestMaintainabilityCollector,
  MetricCollectorRegistry,
  createDefaultCollectorRegistry,
} from '../../../src/optimization/index.js';

describe('SearchLatencyCollector', () => {
  let collector: SearchLatencyCollector;

  beforeEach(() => {
    collector = new SearchLatencyCollector();
  });

  it('should have correct id and metric name', () => {
    expect(collector.id).toBe('search-latency');
    expect(collector.metricName).toBe('search_latency_ms');
  });

  it('should collect with no latencies recorded', async () => {
    const sample = await collector.collect();
    expect(sample.name).toBe('search_latency_ms');
    expect(sample.value).toBe(0);
    expect(sample.timestamp).toBeInstanceOf(Date);
  });

  it('should collect average of recorded latencies', async () => {
    collector.recordLatency(10);
    collector.recordLatency(20);
    collector.recordLatency(30);

    const sample = await collector.collect();
    expect(sample.value).toBe(20); // Average of 10, 20, 30
  });

  it('should clear pending latencies after collect', async () => {
    collector.recordLatency(100);
    await collector.collect();

    const sample = await collector.collect();
    expect(sample.value).toBe(0); // No pending latencies
  });

  it('should calculate stats over time', async () => {
    // Add multiple samples
    for (let i = 0; i < 10; i++) {
      collector.recordLatency(10 + i * 2);
      await collector.collect();
    }

    const stats = await collector.getStats(60 * 60 * 1000); // 1 hour
    expect(stats.count).toBe(10);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(28);
    expect(stats.mean).toBeCloseTo(19, 0);
  });

  it('should return empty stats when no samples', async () => {
    const stats = await collector.getStats(60 * 60 * 1000);
    expect(stats.count).toBe(0);
    expect(stats.trend).toBe('stable');
  });
});

describe('RoutingAccuracyCollector', () => {
  let collector: RoutingAccuracyCollector;

  beforeEach(() => {
    collector = new RoutingAccuracyCollector();
  });

  it('should have correct id and metric name', () => {
    expect(collector.id).toBe('routing-accuracy');
    expect(collector.metricName).toBe('routing_accuracy');
  });

  it('should calculate accuracy when following recommendations', async () => {
    collector.recordOutcome(true, true);  // Followed, successful
    collector.recordOutcome(true, true);  // Followed, successful
    collector.recordOutcome(true, false); // Followed, failed
    collector.recordOutcome(false, true); // Not followed (ignored for accuracy)

    const sample = await collector.collect();
    expect(sample.value).toBeCloseTo(0.667, 2); // 2/3 success when followed
  });

  it('should return 0 when no recommendations followed', async () => {
    collector.recordOutcome(false, true);
    collector.recordOutcome(false, false);

    const sample = await collector.collect();
    expect(sample.value).toBe(0);
  });

  it('should clear outcomes after collect', async () => {
    collector.recordOutcome(true, true);
    await collector.collect();

    const sample = await collector.collect();
    expect(sample.value).toBe(0);
  });
});

describe('PatternQualityCollector', () => {
  let collector: PatternQualityCollector;

  beforeEach(() => {
    collector = new PatternQualityCollector();
  });

  it('should have correct id and metric name', () => {
    expect(collector.id).toBe('pattern-quality');
    expect(collector.metricName).toBe('pattern_quality_score');
  });

  it('should calculate average quality', async () => {
    collector.recordQuality(0.8);
    collector.recordQuality(0.9);
    collector.recordQuality(0.7);

    const sample = await collector.collect();
    expect(sample.value).toBeCloseTo(0.8, 2);
  });

  it('should return 0 when no quality recorded', async () => {
    const sample = await collector.collect();
    expect(sample.value).toBe(0);
  });
});

describe('TestMaintainabilityCollector', () => {
  let collector: TestMaintainabilityCollector;

  beforeEach(() => {
    collector = new TestMaintainabilityCollector();
  });

  it('should have correct id and metric name', () => {
    expect(collector.id).toBe('test-maintainability');
    expect(collector.metricName).toBe('test_maintainability');
  });

  it('should calculate average maintainability', async () => {
    collector.recordMaintainability(0.85);
    collector.recordMaintainability(0.75);
    collector.recordMaintainability(0.90);

    const sample = await collector.collect();
    expect(sample.value).toBeCloseTo(0.833, 2);
  });
});

describe('MetricCollectorRegistry', () => {
  let registry: MetricCollectorRegistry;

  beforeEach(() => {
    registry = new MetricCollectorRegistry();
  });

  it('should register and retrieve collectors', () => {
    const collector = new SearchLatencyCollector();
    registry.register(collector);

    const retrieved = registry.get('search_latency_ms');
    expect(retrieved).toBe(collector);
  });

  it('should return undefined for unknown metric', () => {
    const retrieved = registry.get('unknown_metric');
    expect(retrieved).toBeUndefined();
  });

  it('should get all collectors', () => {
    registry.register(new SearchLatencyCollector());
    registry.register(new RoutingAccuracyCollector());

    const all = registry.getAll();
    expect(all.length).toBe(2);
  });

  it('should collect all metrics', async () => {
    registry.register(new SearchLatencyCollector());
    registry.register(new PatternQualityCollector());

    const samples = await registry.collectAll();
    expect(samples.length).toBe(2);
    expect(samples.map(s => s.name)).toContain('search_latency_ms');
    expect(samples.map(s => s.name)).toContain('pattern_quality_score');
  });

  it('should get stats for all metrics', async () => {
    const latencyCollector = new SearchLatencyCollector();
    latencyCollector.recordLatency(10);
    await latencyCollector.collect();

    registry.register(latencyCollector);
    registry.register(new PatternQualityCollector());

    const allStats = await registry.getAllStats(60 * 60 * 1000);
    expect(allStats.size).toBe(2);
    expect(allStats.get('search_latency_ms')?.count).toBe(1);
  });
});

describe('createDefaultCollectorRegistry', () => {
  it('should create registry with all default collectors', () => {
    const registry = createDefaultCollectorRegistry();
    const collectors = registry.getAll();

    expect(collectors.length).toBe(4);

    const metricNames = collectors.map(c => c.metricName);
    expect(metricNames).toContain('search_latency_ms');
    expect(metricNames).toContain('routing_accuracy');
    expect(metricNames).toContain('pattern_quality_score');
    expect(metricNames).toContain('test_maintainability');
  });
});

describe('MetricStats Calculations', () => {
  it('should calculate percentiles correctly', async () => {
    const collector = new SearchLatencyCollector();

    // Add 100 samples with values 1-100
    for (let i = 1; i <= 100; i++) {
      collector.recordLatency(i);
      await collector.collect();
    }

    const stats = await collector.getStats(60 * 60 * 1000);
    expect(stats.count).toBe(100);
    expect(stats.median).toBeCloseTo(50.5, 0);
    expect(stats.p95).toBeCloseTo(95, 1);
    expect(stats.p99).toBeCloseTo(99, 1);
  });

  it('should calculate standard deviation', async () => {
    const collector = new SearchLatencyCollector();

    // Add samples with known variance
    const values = [2, 4, 4, 4, 5, 5, 7, 9];
    for (const v of values) {
      collector.recordLatency(v);
      await collector.collect();
    }

    const stats = await collector.getStats(60 * 60 * 1000);
    // Mean = 5, StdDev = 2
    expect(stats.mean).toBe(5);
    expect(stats.stdDev).toBeCloseTo(2, 0);
  });

  it('should detect improving trend', async () => {
    const collector = new PatternQualityCollector();

    // Add samples that improve over time (higher is better for quality)
    for (let i = 0; i < 20; i++) {
      collector.recordQuality(0.5 + i * 0.02); // 0.5 to 0.88
      await collector.collect();
    }

    const stats = await collector.getStats(60 * 60 * 1000);
    expect(stats.trend).toBe('improving');
  });

  it('should detect degrading trend', async () => {
    const collector = new PatternQualityCollector();

    // Add samples that degrade over time
    for (let i = 0; i < 20; i++) {
      collector.recordQuality(0.9 - i * 0.02); // 0.9 to 0.52
      await collector.collect();
    }

    const stats = await collector.getStats(60 * 60 * 1000);
    expect(stats.trend).toBe('degrading');
  });

  it('should detect stable trend', async () => {
    const collector = new PatternQualityCollector();

    // Add samples that stay roughly the same
    for (let i = 0; i < 20; i++) {
      collector.recordQuality(0.75 + (Math.random() - 0.5) * 0.02);
      await collector.collect();
    }

    const stats = await collector.getStats(60 * 60 * 1000);
    expect(stats.trend).toBe('stable');
  });
});

describe('Division by Zero Edge Cases', () => {
  it('should handle zero values in latency trend calculation', async () => {
    const collector = new SearchLatencyCollector();

    // First half all zeros
    for (let i = 0; i < 10; i++) {
      collector.recordLatency(0);
      await collector.collect();
    }

    // Second half has some values
    for (let i = 0; i < 10; i++) {
      collector.recordLatency(5);
      await collector.collect();
    }

    const stats = await collector.getStats(60 * 60 * 1000);
    // Should not throw, and should detect degrading (latency went up from 0)
    expect(stats.trend).toBe('degrading');
  });

  it('should handle all zero values without crashing', async () => {
    const collector = new SearchLatencyCollector();

    // All zeros
    for (let i = 0; i < 20; i++) {
      collector.recordLatency(0);
      await collector.collect();
    }

    const stats = await collector.getStats(60 * 60 * 1000);
    // Should not throw, should be stable
    expect(stats.trend).toBe('stable');
  });

  it('should produce valid stats with zero mean', async () => {
    const collector = new SearchLatencyCollector();

    for (let i = 0; i < 15; i++) {
      collector.recordLatency(0);
      await collector.collect();
    }

    const stats = await collector.getStats(60 * 60 * 1000);

    // All values should be valid numbers, not NaN or Infinity
    expect(Number.isFinite(stats.mean)).toBe(true);
    expect(Number.isFinite(stats.stdDev)).toBe(true);
    expect(Number.isFinite(stats.min)).toBe(true);
    expect(Number.isFinite(stats.max)).toBe(true);
  });
});

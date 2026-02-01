/**
 * Metrics Collector Tests
 *
 * @module tests/unit/adapters/a2a/discovery/metrics
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  MetricsCollector,
  createMetricsCollector,
  getGlobalMetrics,
  resetGlobalMetrics,
  DEFAULT_METRICS_CONFIG,
} from '../../../../../src/adapters/a2a/discovery/metrics.js';

// ============================================================================
// Tests
// ============================================================================

describe('MetricsCollector', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = createMetricsCollector();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      expect(metrics).toBeInstanceOf(MetricsCollector);
    });

    it('should create with custom config', () => {
      const custom = createMetricsCollector({
        prefix: 'custom_prefix',
        defaultLabels: { env: 'test' },
        includeTimestamps: false,
      });
      expect(custom).toBeInstanceOf(MetricsCollector);
    });
  });

  describe('increment', () => {
    it('should increment counter by 1 by default', () => {
      metrics.increment('test.counter');
      expect(metrics.getCounter('test.counter')).toBe(1);
    });

    it('should increment counter by specified value', () => {
      metrics.increment('test.counter', {}, 5);
      expect(metrics.getCounter('test.counter')).toBe(5);
    });

    it('should accumulate counter values', () => {
      metrics.increment('test.counter');
      metrics.increment('test.counter');
      metrics.increment('test.counter');
      expect(metrics.getCounter('test.counter')).toBe(3);
    });

    it('should track counters with different labels separately', () => {
      metrics.increment('test.counter', { type: 'a' });
      metrics.increment('test.counter', { type: 'b' });
      metrics.increment('test.counter', { type: 'a' });

      expect(metrics.getCounter('test.counter', { type: 'a' })).toBe(2);
      expect(metrics.getCounter('test.counter', { type: 'b' })).toBe(1);
    });
  });

  describe('gauge', () => {
    it('should set gauge value', () => {
      metrics.gauge('test.gauge', 42);
      expect(metrics.getGauge('test.gauge')).toBe(42);
    });

    it('should overwrite gauge value', () => {
      metrics.gauge('test.gauge', 42);
      metrics.gauge('test.gauge', 100);
      expect(metrics.getGauge('test.gauge')).toBe(100);
    });

    it('should track gauges with different labels separately', () => {
      metrics.gauge('test.gauge', 10, { server: 'a' });
      metrics.gauge('test.gauge', 20, { server: 'b' });

      expect(metrics.getGauge('test.gauge', { server: 'a' })).toBe(10);
      expect(metrics.getGauge('test.gauge', { server: 'b' })).toBe(20);
    });
  });

  describe('observe', () => {
    it('should observe histogram values', () => {
      metrics.observe('test.histogram', 0.1);
      metrics.observe('test.histogram', 0.5);
      metrics.observe('test.histogram', 1.0);

      const histogram = metrics.getHistogram('test.histogram');
      expect(histogram).not.toBeNull();
      expect(histogram?.count).toBe(3);
      expect(histogram?.sum).toBeCloseTo(1.6);
    });

    it('should populate histogram buckets correctly', () => {
      metrics.observe('test.histogram', 0.001);
      metrics.observe('test.histogram', 0.05);
      metrics.observe('test.histogram', 0.5);

      const histogram = metrics.getHistogram('test.histogram');
      expect(histogram).not.toBeNull();

      // Check buckets
      const bucket005 = histogram?.buckets.find(b => b.le === 0.005);
      expect(bucket005?.count).toBe(1); // Only 0.001 is <= 0.005

      const bucket01 = histogram?.buckets.find(b => b.le === 0.1);
      expect(bucket01?.count).toBe(2); // 0.001 and 0.05 are <= 0.1
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus format output', () => {
      metrics.increment('test.counter', { label: 'value' });
      metrics.gauge('test.gauge', 42);

      const output = metrics.getMetrics();

      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
      expect(output).toContain('counter');
      expect(output).toContain('gauge');
    });

    it('should include counter metrics', () => {
      metrics.increment('registration.add', { domain: 'test' });

      const output = metrics.getMetrics();
      expect(output).toContain('registration_add');
      expect(output).toContain('domain="test"');
    });

    it('should include gauge metrics', () => {
      metrics.gauge('agents.registered', 68);

      const output = metrics.getMetrics();
      expect(output).toContain('agents_registered');
      expect(output).toContain('68');
    });

    it('should include histogram metrics', () => {
      metrics.observe('health.latency', 0.1);
      metrics.observe('health.latency', 0.2);

      const output = metrics.getMetrics();
      expect(output).toContain('histogram');
      expect(output).toContain('_bucket');
      expect(output).toContain('_sum');
      expect(output).toContain('_count');
    });

    it('should include timestamps when configured', () => {
      metrics = createMetricsCollector({ includeTimestamps: true });
      metrics.increment('test.counter');

      const output = metrics.getMetrics();
      // Timestamp should be a 13-digit number
      expect(output).toMatch(/\d{13}/);
    });

    it('should not include timestamps when disabled', () => {
      metrics = createMetricsCollector({ includeTimestamps: false });
      metrics.increment('test.counter');

      const output = metrics.getMetrics();
      const lines = output.split('\n');
      const counterLine = lines.find(l => l.includes('test_counter') && !l.startsWith('#'));
      expect(counterLine).not.toMatch(/\d{13}$/);
    });
  });

  describe('getDiscoveryMetrics', () => {
    it('should return discovery-specific metrics', () => {
      metrics.gauge('agents.registered', 68);
      metrics.increment('registration.add');
      metrics.increment('registration.add');
      metrics.increment('registration.remove');
      metrics.increment('cache.hits');
      metrics.increment('cache.misses');
      metrics.increment('file-watcher.events');

      const discoveryMetrics = metrics.getDiscoveryMetrics();

      expect(discoveryMetrics.agentsRegistered).toBe(68);
      expect(discoveryMetrics.registrationEvents.add).toBe(2);
      expect(discoveryMetrics.registrationEvents.remove).toBe(1);
      expect(discoveryMetrics.cacheHits).toBe(1);
      expect(discoveryMetrics.cacheMisses).toBe(1);
      expect(discoveryMetrics.fileWatcherEvents).toBe(1);
    });
  });

  describe('register', () => {
    it('should register help text for metrics', () => {
      metrics.register('custom.metric', 'A custom metric for testing');
      metrics.increment('custom.metric');

      const output = metrics.getMetrics();
      expect(output).toContain('A custom metric for testing');
    });
  });

  describe('reset', () => {
    it('should reset all metrics', () => {
      metrics.increment('test.counter', {}, 10);
      metrics.gauge('test.gauge', 42);
      metrics.observe('test.histogram', 0.5);

      metrics.reset();

      expect(metrics.getCounter('test.counter')).toBe(0);
      expect(metrics.getGauge('test.gauge')).toBe(0);
      expect(metrics.getHistogram('test.histogram')).toBeNull();
    });

    it('should reset specific counter', () => {
      metrics.increment('test.counter', { type: 'a' }, 10);
      metrics.increment('test.counter', { type: 'b' }, 5);

      metrics.resetCounter('test.counter', { type: 'a' });

      expect(metrics.getCounter('test.counter', { type: 'a' })).toBe(0);
      expect(metrics.getCounter('test.counter', { type: 'b' })).toBe(5);
    });

    it('should reset specific gauge', () => {
      metrics.gauge('test.gauge', 42, { server: 'a' });
      metrics.gauge('test.gauge', 100, { server: 'b' });

      metrics.resetGauge('test.gauge', { server: 'a' });

      expect(metrics.getGauge('test.gauge', { server: 'a' })).toBe(0);
      expect(metrics.getGauge('test.gauge', { server: 'b' })).toBe(100);
    });
  });

  describe('getMetricCount', () => {
    it('should return correct metric counts', () => {
      metrics.increment('counter1');
      metrics.increment('counter2');
      metrics.gauge('gauge1', 1);
      metrics.observe('histogram1', 0.5);

      const counts = metrics.getMetricCount();

      expect(counts.counters).toBe(2);
      expect(counts.gauges).toBe(1);
      expect(counts.histograms).toBe(1);
    });
  });

  describe('prefix', () => {
    it('should apply prefix to metric names', () => {
      metrics = createMetricsCollector({ prefix: 'custom' });
      metrics.increment('test.counter');

      const output = metrics.getMetrics();
      expect(output).toContain('custom_test_counter');
    });
  });

  describe('default labels', () => {
    it('should apply default labels to all metrics', () => {
      metrics = createMetricsCollector({
        defaultLabels: { env: 'test', version: '3.0' },
      });
      metrics.increment('test.counter');

      const output = metrics.getMetrics();
      expect(output).toContain('env="test"');
      expect(output).toContain('version="3.0"');
    });

    it('should merge default labels with provided labels', () => {
      metrics = createMetricsCollector({
        defaultLabels: { env: 'test' },
      });
      metrics.increment('test.counter', { custom: 'value' });

      const output = metrics.getMetrics();
      expect(output).toContain('env="test"');
      expect(output).toContain('custom="value"');
    });
  });

  describe('histogram buckets', () => {
    it('should use custom histogram buckets', () => {
      metrics = createMetricsCollector({
        histogramBuckets: [0.1, 0.5, 1.0],
      });
      metrics.observe('test.histogram', 0.3);

      const histogram = metrics.getHistogram('test.histogram');
      expect(histogram?.buckets).toHaveLength(3);
      expect(histogram?.buckets.map(b => b.le)).toEqual([0.1, 0.5, 1.0]);
    });
  });

  describe('default registered metrics', () => {
    it('should have hot-reload metrics registered', () => {
      metrics.increment('hot-reload.start');
      metrics.increment('hot-reload.stop');
      metrics.increment('hot-reload.file-event');
      metrics.increment('hot-reload.card-added');
      metrics.increment('hot-reload.card-updated');
      metrics.increment('hot-reload.card-removed');

      const output = metrics.getMetrics();
      expect(output).toContain('hot_reload_start');
      expect(output).toContain('hot_reload_file_event');
      expect(output).toContain('hot_reload_card_added');
    });

    it('should have health metrics registered', () => {
      metrics.increment('health.checks');
      metrics.increment('health.checks.success');
      metrics.increment('health.checks.failure');
      metrics.observe('health.latency', 0.1);

      const output = metrics.getMetrics();
      expect(output).toContain('health_checks');
      expect(output).toContain('health_latency');
    });
  });
});

describe('createMetricsCollector', () => {
  it('should create a MetricsCollector instance', () => {
    const collector = createMetricsCollector();
    expect(collector).toBeInstanceOf(MetricsCollector);
  });
});

describe('getGlobalMetrics', () => {
  beforeEach(() => {
    resetGlobalMetrics();
  });

  it('should return a MetricsCollector instance', () => {
    const global = getGlobalMetrics();
    expect(global).toBeInstanceOf(MetricsCollector);
  });

  it('should return the same instance on multiple calls', () => {
    const global1 = getGlobalMetrics();
    const global2 = getGlobalMetrics();
    expect(global1).toBe(global2);
  });

  it('should persist metrics across calls', () => {
    const global = getGlobalMetrics();
    global.increment('global.counter');

    const global2 = getGlobalMetrics();
    expect(global2.getCounter('global.counter')).toBe(1);
  });
});

describe('resetGlobalMetrics', () => {
  beforeEach(() => {
    resetGlobalMetrics();
  });

  it('should reset the global metrics', () => {
    const global = getGlobalMetrics();
    global.increment('reset.test.counter', {}, 10);
    expect(global.getCounter('reset.test.counter')).toBe(10);

    resetGlobalMetrics();
    expect(global.getCounter('reset.test.counter')).toBe(0);
  });
});

describe('DEFAULT_METRICS_CONFIG', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_METRICS_CONFIG.prefix).toBe('aqe_discovery');
    expect(DEFAULT_METRICS_CONFIG.defaultLabels).toEqual({});
    expect(DEFAULT_METRICS_CONFIG.includeTimestamps).toBe(true);
    expect(DEFAULT_METRICS_CONFIG.histogramBuckets).toEqual([
      0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
    ]);
  });
});

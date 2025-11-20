/**
 * Unit Tests for Telemetry Metrics
 * Tests metric recording, dimensions, and semantic naming
 */

// Mock interfaces for metrics system
interface MetricDimensions {
  [key: string]: string | number | boolean;
}

interface MetricOptions {
  description?: string;
  unit?: string;
  valueType?: 'int' | 'double';
}

interface Counter {
  add(value: number, dimensions?: MetricDimensions): void;
}

interface Histogram {
  record(value: number, dimensions?: MetricDimensions): void;
}

interface Gauge {
  record(value: number, dimensions?: MetricDimensions): void;
}

interface MetricsRecorder {
  createCounter(name: string, options?: MetricOptions): Counter;
  createHistogram(name: string, options?: MetricOptions): Histogram;
  createGauge(name: string, options?: MetricOptions): Gauge;
  flush(): Promise<void>;
  getRecordedMetrics(): RecordedMetric[];
}

interface RecordedMetric {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  value: number;
  dimensions?: MetricDimensions;
  timestamp: number;
}

// Mock MetricsRecorder implementation for testing
class MockMetricsRecorder implements MetricsRecorder {
  private counters = new Map<string, MockCounter>();
  private histograms = new Map<string, MockHistogram>();
  private gauges = new Map<string, MockGauge>();
  private recorded: RecordedMetric[] = [];

  createCounter(name: string, options?: MetricOptions): Counter {
    if (!this.validateMetricName(name)) {
      throw new Error(`Invalid metric name: ${name}`);
    }

    if (!this.counters.has(name)) {
      this.counters.set(name, new MockCounter(name, this.recorded, options));
    }

    return this.counters.get(name)!;
  }

  createHistogram(name: string, options?: MetricOptions): Histogram {
    if (!this.validateMetricName(name)) {
      throw new Error(`Invalid metric name: ${name}`);
    }

    if (!this.histograms.has(name)) {
      this.histograms.set(name, new MockHistogram(name, this.recorded, options));
    }

    return this.histograms.get(name)!;
  }

  createGauge(name: string, options?: MetricOptions): Gauge {
    if (!this.validateMetricName(name)) {
      throw new Error(`Invalid metric name: ${name}`);
    }

    if (!this.gauges.has(name)) {
      this.gauges.set(name, new MockGauge(name, this.recorded, options));
    }

    return this.gauges.get(name)!;
  }

  async flush(): Promise<void> {
    // In real implementation, would export to backend
    return Promise.resolve();
  }

  getRecordedMetrics(): RecordedMetric[] {
    return [...this.recorded];
  }

  clearRecordedMetrics(): void {
    this.recorded.length = 0;
  }

  private validateMetricName(name: string): boolean {
    // Semantic naming: prefix.component.metric
    const pattern = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_]*)+$/;
    return pattern.test(name);
  }
}

class MockCounter implements Counter {
  private total = 0;

  constructor(
    private name: string,
    private recorded: RecordedMetric[],
    private options?: MetricOptions
  ) {}

  add(value: number, dimensions?: MetricDimensions): void {
    if (value < 0) {
      throw new Error('Counter value must be non-negative');
    }

    this.total += value;
    this.recorded.push({
      name: this.name,
      type: 'counter',
      value,
      dimensions,
      timestamp: Date.now()
    });
  }

  getTotal(): number {
    return this.total;
  }
}

class MockHistogram implements Histogram {
  private values: number[] = [];

  constructor(
    private name: string,
    private recorded: RecordedMetric[],
    private options?: MetricOptions
  ) {}

  record(value: number, dimensions?: MetricDimensions): void {
    this.values.push(value);
    this.recorded.push({
      name: this.name,
      type: 'histogram',
      value,
      dimensions,
      timestamp: Date.now()
    });
  }

  getValues(): number[] {
    return [...this.values];
  }
}

class MockGauge implements Gauge {
  private currentValue = 0;

  constructor(
    private name: string,
    private recorded: RecordedMetric[],
    private options?: MetricOptions
  ) {}

  record(value: number, dimensions?: MetricDimensions): void {
    this.currentValue = value;
    this.recorded.push({
      name: this.name,
      type: 'gauge',
      value,
      dimensions,
      timestamp: Date.now()
    });
  }

  getCurrentValue(): number {
    return this.currentValue;
  }
}

describe('MetricsRecorder', () => {
  let recorder: MockMetricsRecorder;

  beforeEach(() => {
    recorder = new MockMetricsRecorder();
  });

  describe('Counter', () => {
    test('should create counter with valid semantic name', () => {
      const counter = recorder.createCounter('qe.agent.task_count');

      expect(counter).toBeDefined();
    });

    test('should add values to counter', () => {
      const counter = recorder.createCounter('qe.tests.generated');

      counter.add(5);
      counter.add(3);
      counter.add(2);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics).toHaveLength(3);
      expect(metrics.map(m => m.value)).toEqual([5, 3, 2]);
    });

    test('should record counter with dimensions', () => {
      const counter = recorder.createCounter('qe.agent.task_count');

      counter.add(1, {
        agent: 'qe-test-generator',
        taskType: 'unit_test_generation',
        status: 'success'
      });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].dimensions).toEqual({
        agent: 'qe-test-generator',
        taskType: 'unit_test_generation',
        status: 'success'
      });
    });

    test('should throw error for negative counter value', () => {
      const counter = recorder.createCounter('qe.tests.count');

      expect(() => counter.add(-1)).toThrow('Counter value must be non-negative');
    });

    test('should return same counter instance for same name', () => {
      const counter1 = recorder.createCounter('qe.tests.count');
      const counter2 = recorder.createCounter('qe.tests.count');

      expect(counter1).toBe(counter2);
    });

    test('should throw error for invalid metric name', () => {
      expect(() => recorder.createCounter('InvalidName')).toThrow('Invalid metric name');
      expect(() => recorder.createCounter('123.invalid')).toThrow('Invalid metric name');
      expect(() => recorder.createCounter('single')).toThrow('Invalid metric name');
    });

    test('should record timestamp with counter value', () => {
      const before = Date.now();
      const counter = recorder.createCounter('qe.tests.count');
      counter.add(1);
      const after = Date.now();

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(metrics[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Histogram', () => {
    test('should create histogram with valid semantic name', () => {
      const histogram = recorder.createHistogram('qe.agent.task_duration');

      expect(histogram).toBeDefined();
    });

    test('should record values to histogram', () => {
      const histogram = recorder.createHistogram('qe.agent.task_duration');

      histogram.record(100);
      histogram.record(150);
      histogram.record(200);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics).toHaveLength(3);
      expect(metrics.map(m => m.value)).toEqual([100, 150, 200]);
    });

    test('should record histogram with dimensions', () => {
      const histogram = recorder.createHistogram('qe.agent.task_duration');

      histogram.record(5000, {
        agent: 'qe-test-generator',
        complexity: 'medium'
      });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].dimensions).toEqual({
        agent: 'qe-test-generator',
        complexity: 'medium'
      });
    });

    test('should record negative values (for temperature-like metrics)', () => {
      const histogram = recorder.createHistogram('qe.system.temperature');

      histogram.record(-10);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].value).toBe(-10);
    });

    test('should return same histogram instance for same name', () => {
      const histogram1 = recorder.createHistogram('qe.duration.ms');
      const histogram2 = recorder.createHistogram('qe.duration.ms');

      expect(histogram1).toBe(histogram2);
    });

    test('should track histogram type correctly', () => {
      const histogram = recorder.createHistogram('qe.agent.duration');
      histogram.record(100);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].type).toBe('histogram');
    });
  });

  describe('Gauge', () => {
    test('should create gauge with valid semantic name', () => {
      const gauge = recorder.createGauge('qe.memory.usage');

      expect(gauge).toBeDefined();
    });

    test('should record current value to gauge', () => {
      const gauge = recorder.createGauge('qe.memory.usage');

      gauge.record(0.75);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].value).toBe(0.75);
    });

    test('should record gauge with dimensions', () => {
      const gauge = recorder.createGauge('qe.coverage.percentage');

      gauge.record(85.5, {
        project: 'user-service',
        type: 'line'
      });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].dimensions).toEqual({
        project: 'user-service',
        type: 'line'
      });
    });

    test('should update gauge value on subsequent records', () => {
      const gauge = recorder.createGauge('qe.queue.size') as MockGauge;

      gauge.record(10);
      gauge.record(15);
      gauge.record(5);

      expect(gauge.getCurrentValue()).toBe(5);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics).toHaveLength(3);
    });

    test('should return same gauge instance for same name', () => {
      const gauge1 = recorder.createGauge('qe.memory.usage');
      const gauge2 = recorder.createGauge('qe.memory.usage');

      expect(gauge1).toBe(gauge2);
    });

    test('should track gauge type correctly', () => {
      const gauge = recorder.createGauge('qe.memory.usage');
      gauge.record(0.8);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].type).toBe('gauge');
    });
  });

  describe('Semantic Naming', () => {
    test('should accept valid QE metric names', () => {
      const validNames = [
        'qe.agent.task_count',
        'qe.tests.generated_count',
        'qe.coverage.percentage',
        'qe.memory.usage',
        'qe.fleet.agent_count',
        'qe.model.request_duration',
        'qe.streaming.events_per_second'
      ];

      validNames.forEach(name => {
        expect(() => recorder.createCounter(name)).not.toThrow();
      });
    });

    test('should reject invalid metric names', () => {
      const invalidNames = [
        'QE.Agent.Count',      // uppercase
        'qe-agent-count',      // hyphens instead of dots
        '123.invalid.name',    // starts with number
        'single_word',         // no dots
        'qe.',                 // trailing dot
        '.qe.agent',           // leading dot
        'qe..agent.count',     // double dot
        ''                     // empty
      ];

      invalidNames.forEach(name => {
        expect(() => recorder.createCounter(name)).toThrow('Invalid metric name');
      });
    });

    test('should follow prefix.component.metric pattern', () => {
      // Standard QE metrics pattern
      const metricsMap = {
        'qe.agent.task_duration': 'agent component metrics',
        'qe.tests.generated_count': 'test generation metrics',
        'qe.coverage.line_percentage': 'coverage analysis metrics',
        'qe.fleet.active_agents': 'fleet management metrics'
      };

      Object.keys(metricsMap).forEach(name => {
        expect(() => recorder.createCounter(name)).not.toThrow();
      });
    });
  });

  describe('Dimensions', () => {
    test('should record string dimensions', () => {
      const counter = recorder.createCounter('qe.agent.task_count');

      counter.add(1, {
        agent: 'test-generator',
        framework: 'jest'
      });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].dimensions?.agent).toBe('test-generator');
      expect(metrics[0].dimensions?.framework).toBe('jest');
    });

    test('should record numeric dimensions', () => {
      const histogram = recorder.createHistogram('qe.agent.duration');

      histogram.record(1000, {
        complexity_score: 0.75,
        test_count: 10
      });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].dimensions?.complexity_score).toBe(0.75);
      expect(metrics[0].dimensions?.test_count).toBe(10);
    });

    test('should record boolean dimensions', () => {
      const counter = recorder.createCounter('qe.tests.execution');

      counter.add(1, {
        cached: true,
        parallel: false
      });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].dimensions?.cached).toBe(true);
      expect(metrics[0].dimensions?.parallel).toBe(false);
    });

    test('should record mixed dimension types', () => {
      const gauge = recorder.createGauge('qe.system.health');

      gauge.record(1, {
        component: 'fleet-manager',
        healthy: true,
        agent_count: 5,
        load_factor: 0.65
      });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].dimensions).toEqual({
        component: 'fleet-manager',
        healthy: true,
        agent_count: 5,
        load_factor: 0.65
      });
    });

    test('should handle metrics without dimensions', () => {
      const counter = recorder.createCounter('qe.simple.count');

      counter.add(1);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].dimensions).toBeUndefined();
    });

    test('should handle empty dimensions object', () => {
      const counter = recorder.createCounter('qe.simple.count');

      counter.add(1, {});

      const metrics = recorder.getRecordedMetrics();
      expect(metrics[0].dimensions).toEqual({});
    });
  });

  describe('flush', () => {
    test('should flush recorded metrics', async () => {
      const counter = recorder.createCounter('qe.tests.count');
      counter.add(5);

      await expect(recorder.flush()).resolves.not.toThrow();
    });

    test('should handle flush when no metrics recorded', async () => {
      await expect(recorder.flush()).resolves.not.toThrow();
    });
  });

  describe('getRecordedMetrics', () => {
    test('should return all recorded metrics', () => {
      const counter = recorder.createCounter('qe.tests.count');
      const histogram = recorder.createHistogram('qe.agent.duration');
      const gauge = recorder.createGauge('qe.memory.usage');

      counter.add(5);
      histogram.record(1000);
      gauge.record(0.8);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics).toHaveLength(3);
      expect(metrics.map(m => m.type)).toContain('counter');
      expect(metrics.map(m => m.type)).toContain('histogram');
      expect(metrics.map(m => m.type)).toContain('gauge');
    });

    test('should preserve metric order', () => {
      const counter = recorder.createCounter('qe.tests.count');

      counter.add(1);
      counter.add(2);
      counter.add(3);

      const metrics = recorder.getRecordedMetrics();
      expect(metrics.map(m => m.value)).toEqual([1, 2, 3]);
    });

    test('should return empty array when no metrics recorded', () => {
      const metrics = recorder.getRecordedMetrics();
      expect(metrics).toEqual([]);
    });

    test('should return copy of metrics array', () => {
      const counter = recorder.createCounter('qe.tests.count');
      counter.add(1);

      const metrics1 = recorder.getRecordedMetrics();
      const metrics2 = recorder.getRecordedMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  describe('Metric Options', () => {
    test('should create counter with options', () => {
      const counter = recorder.createCounter('qe.tests.count', {
        description: 'Total number of tests generated',
        unit: 'tests',
        valueType: 'int'
      });

      expect(counter).toBeDefined();
    });

    test('should create histogram with options', () => {
      const histogram = recorder.createHistogram('qe.agent.duration', {
        description: 'Agent task execution duration',
        unit: 'milliseconds',
        valueType: 'double'
      });

      expect(histogram).toBeDefined();
    });

    test('should create gauge with options', () => {
      const gauge = recorder.createGauge('qe.coverage.percentage', {
        description: 'Code coverage percentage',
        unit: 'percent',
        valueType: 'double'
      });

      expect(gauge).toBeDefined();
    });
  });

  describe('Real-world QE Metrics Scenarios', () => {
    test('should record test generation metrics', () => {
      const testsGenerated = recorder.createCounter('qe.tests.generated_count');
      const generationDuration = recorder.createHistogram('qe.agent.generation_duration');
      const coverageGauge = recorder.createGauge('qe.coverage.estimated_percentage');

      // Simulate test generation task
      testsGenerated.add(15, {
        agent: 'qe-test-generator',
        framework: 'jest',
        approach: 'london-school'
      });

      generationDuration.record(5000, {
        agent: 'qe-test-generator',
        complexity: 'medium'
      });

      coverageGauge.record(85.5, {
        project: 'user-service',
        type: 'line'
      });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics).toHaveLength(3);
    });

    test('should record agent coordination metrics', () => {
      const agentTasks = recorder.createCounter('qe.fleet.tasks_completed');
      const coordination = recorder.createHistogram('qe.fleet.coordination_latency');
      const activeAgents = recorder.createGauge('qe.fleet.active_agents');

      agentTasks.add(1, { agent: 'test-generator', status: 'success' });
      agentTasks.add(1, { agent: 'coverage-analyzer', status: 'success' });
      agentTasks.add(1, { agent: 'security-scanner', status: 'failed' });

      coordination.record(150, { topology: 'hierarchical' });
      activeAgents.record(5, { topology: 'hierarchical' });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics).toHaveLength(5);
    });

    test('should record model router metrics', () => {
      const modelSelections = recorder.createCounter('qe.router.selections');
      const selectionLatency = recorder.createHistogram('qe.router.latency');
      const costPerTest = recorder.createGauge('qe.router.cost_per_test');

      modelSelections.add(1, { model: 'gpt-3.5-turbo', complexity: 'simple' });
      modelSelections.add(1, { model: 'gpt-4', complexity: 'complex' });
      modelSelections.add(1, { model: 'claude-sonnet', complexity: 'critical' });

      selectionLatency.record(45, { cached: false });
      costPerTest.record(0.0005, { model: 'gpt-3.5-turbo' });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics.filter(m => m.name === 'qe.router.selections')).toHaveLength(3);
    });

    test('should record error metrics', () => {
      const errorCount = recorder.createCounter('qe.agent.errors');

      errorCount.add(1, {
        agent: 'qe-coverage-analyzer',
        errorType: 'TIMEOUT_ERROR',
        recoverable: true
      });

      errorCount.add(1, {
        agent: 'qe-test-executor',
        errorType: 'ASSERTION_FAILED',
        recoverable: false
      });

      const metrics = recorder.getRecordedMetrics();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].dimensions?.errorType).toBe('TIMEOUT_ERROR');
      expect(metrics[1].dimensions?.errorType).toBe('ASSERTION_FAILED');
    });
  });
});

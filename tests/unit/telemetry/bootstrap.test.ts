/**
 * Unit Tests for Telemetry Bootstrap
 * Tests REAL implementation, not mocks
 */

import {
  initTelemetry,
  shutdownTelemetry,
  getTracer,
  getMeter,
  withSpan
} from '../../../src/telemetry';

describe('Telemetry Bootstrap', () => {
  afterEach(async () => {
    // Clean shutdown after each test
    await shutdownTelemetry();
  });

  describe('Initialization', () => {
    it('should initialize telemetry with default config', async () => {
      const result = await initTelemetry({
        enableConsoleExport: true,
      });

      expect(result.success).toBe(true);
      expect(result.serviceName).toBe('agentic-qe-fleet');
      expect(result.environment).toBeDefined();
    });

    it('should initialize telemetry with custom config', async () => {
      const result = await initTelemetry({
        serviceName: 'test-service',
        serviceVersion: '2.0.0',
        environment: 'testing',
        enableConsoleExport: true,
      });

      expect(result.success).toBe(true);
      expect(result.serviceName).toBe('test-service');
    });

    it('should return already-initialized when called twice', async () => {
      await initTelemetry({ enableConsoleExport: true });
      const result = await initTelemetry({ enableConsoleExport: true });

      expect(result.success).toBe(true);
      expect(result.exporters).toContain('already-initialized');
    });

    it('should configure console exporters when enabled', async () => {
      const result = await initTelemetry({
        enableConsoleExport: true,
      });

      expect(result.exporters).toContain('console-trace');
      expect(result.exporters).toContain('console-metrics');
    });
  });

  describe('Tracer and Meter', () => {
    beforeEach(async () => {
      await initTelemetry({ enableConsoleExport: true });
    });

    it('should get tracer with name', () => {
      const tracer = getTracer('test-tracer');
      expect(tracer).toBeDefined();
      expect(typeof tracer.startSpan).toBe('function');
    });

    it('should get meter with name', () => {
      const meter = getMeter('test-meter');
      expect(meter).toBeDefined();
      expect(typeof meter.createCounter).toBe('function');
      expect(typeof meter.createHistogram).toBe('function');
    });

    it('should create spans with withSpan helper', async () => {
      const result = await withSpan('test-operation', async (span) => {
        span.setAttribute('test.attribute', 'value');
        return 'completed';
      });

      expect(result).toBe('completed');
    });

    it('should handle errors in withSpan', async () => {
      await expect(
        withSpan('failing-operation', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await initTelemetry({ enableConsoleExport: true });
      const result = await shutdownTelemetry();

      expect(result.success).toBe(true);
    });

    it('should handle shutdown when not initialized', async () => {
      const result = await shutdownTelemetry();
      expect(result.success).toBe(true);
    });
  });

  describe('Metrics Creation', () => {
    beforeEach(async () => {
      await initTelemetry({ enableConsoleExport: true });
    });

    it('should create counter metric', () => {
      const meter = getMeter('test');
      const counter = meter.createCounter('test.counter', {
        description: 'Test counter',
        unit: 'count',
      });

      expect(counter).toBeDefined();
      // Should not throw when adding
      counter.add(1, { label: 'test' });
    });

    it('should create histogram metric', () => {
      const meter = getMeter('test');
      const histogram = meter.createHistogram('test.histogram', {
        description: 'Test histogram',
        unit: 'ms',
      });

      expect(histogram).toBeDefined();
      // Should not throw when recording
      histogram.record(100, { operation: 'test' });
    });

    it('should create up-down counter metric', () => {
      const meter = getMeter('test');
      const upDownCounter = meter.createUpDownCounter('test.gauge', {
        description: 'Test gauge',
        unit: 'items',
      });

      expect(upDownCounter).toBeDefined();
      upDownCounter.add(5);
      upDownCounter.add(-2);
    });
  });
});

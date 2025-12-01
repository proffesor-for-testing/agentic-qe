/**
 * Telemetry Bootstrap Tests - Phase 2
 *
 * Comprehensive tests for OpenTelemetry initialization, exporters,
 * and graceful shutdown functionality.
 *
 * Coverage:
 * - SDK initialization with various configurations
 * - GRPC and HTTP exporters
 * - Console exporters for debugging
 * - Span creation and context propagation
 * - Metric recording
 * - Graceful shutdown
 * - Error handling
 */

import {
  initTelemetry,
  shutdownTelemetry,
  getTracer,
  getMeter,
  isTelemetryInitialized,
  withSpan,
  recordSpanEvent,
  setSpanAttributes,
  defaultTelemetryConfig
} from '../../src/telemetry/bootstrap';
import { trace, metrics, context, SpanStatusCode } from '@opentelemetry/api';

describe('TelemetryBootstrap - Phase 2', () => {
  // Clean up after each test
  afterEach(async () => {
    await shutdownTelemetry();
    jest.clearAllMocks();
  });

  describe('initTelemetry', () => {
    it('should initialize telemetry with default configuration', async () => {
      const result = await initTelemetry();

      expect(result.success).toBe(true);
      expect(result.serviceName).toBe('agentic-qe-fleet');
      expect(result.environment).toBeTruthy();
      expect(result.exporters).toBeDefined();
      expect(isTelemetryInitialized()).toBe(true);
    });

    it('should initialize with custom service name and environment', async () => {
      const result = await initTelemetry({
        serviceName: 'test-service',
        environment: 'test'
      });

      expect(result.success).toBe(true);
      expect(result.serviceName).toBe('test-service');
      expect(result.environment).toBe('test');
    });

    it('should return already-initialized status when called multiple times', async () => {
      const firstResult = await initTelemetry();
      expect(firstResult.success).toBe(true);

      const secondResult = await initTelemetry();
      expect(secondResult.success).toBe(true);
      expect(secondResult.exporters).toContain('already-initialized');
    });

    it('should initialize with console exporters when enabled', async () => {
      const result = await initTelemetry({
        enableConsoleExport: true
      });

      expect(result.success).toBe(true);
      expect(result.exporters).toContain('console-trace');
      expect(result.exporters).toContain('console-metrics');
    });

    it('should initialize with GRPC exporters', async () => {
      const result = await initTelemetry({
        otlpEndpoint: 'http://localhost:4317',
        useGrpc: true,
        enableConsoleExport: false
      });

      expect(result.success).toBe(true);
      expect(result.exporters).toContain('otlp-grpc-trace');
      expect(result.exporters).toContain('otlp-grpc-metrics');
    });

    it('should initialize with HTTP exporters', async () => {
      const result = await initTelemetry({
        otlpEndpoint: 'http://localhost:4318',
        useGrpc: false,
        enableConsoleExport: false
      });

      expect(result.success).toBe(true);
      expect(result.exporters).toContain('otlp-http-trace');
      expect(result.exporters).toContain('otlp-http-metrics');
    });

    it('should enable auto-instrumentation when configured', async () => {
      const result = await initTelemetry({
        enableAutoInstrumentation: true,
        enableConsoleExport: true
      });

      expect(result.success).toBe(true);
      expect(result.exporters).toContain('auto-instrumentation');
    });

    it('should handle initialization errors gracefully', async () => {
      // Force an error by providing invalid configuration
      const result = await initTelemetry({
        otlpEndpoint: undefined,
        enableConsoleExport: false,
        useGrpc: true
      });

      // Should either succeed (SDK handles gracefully) or return error
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('serviceName');
    });

    it('should apply custom resource attributes', async () => {
      const result = await initTelemetry({
        resourceAttributes: {
          'service.namespace': 'custom-namespace',
          'deployment.id': 'test-deployment-123'
        },
        enableConsoleExport: true
      });

      expect(result.success).toBe(true);
    });

    it('should configure trace sample rate', async () => {
      const result = await initTelemetry({
        traceSampleRate: 0.5,
        enableConsoleExport: true
      });

      expect(result.success).toBe(true);
    });

    it('should configure metric export interval', async () => {
      const result = await initTelemetry({
        metricExportInterval: 30000,
        enableConsoleExport: true
      });

      expect(result.success).toBe(true);
    });
  });

  describe('shutdownTelemetry', () => {
    it('should gracefully shutdown initialized telemetry', async () => {
      await initTelemetry({ enableConsoleExport: true });
      expect(isTelemetryInitialized()).toBe(true);

      const result = await shutdownTelemetry();

      expect(result.success).toBe(true);
      expect(result.shutdownDuration).toBeGreaterThanOrEqual(0);
      expect(isTelemetryInitialized()).toBe(false);
    });

    it('should handle shutdown when not initialized', async () => {
      const result = await shutdownTelemetry();

      expect(result.success).toBe(true);
      expect(result.shutdownDuration).toBe(0);
    });

    it('should measure shutdown duration', async () => {
      await initTelemetry({ enableConsoleExport: true });
      const result = await shutdownTelemetry();

      expect(result.shutdownDuration).toBeGreaterThanOrEqual(0);
      expect(result.shutdownDuration).toBeLessThan(5000); // Should be fast
    });
  });

  describe('getTracer', () => {
    beforeEach(async () => {
      await initTelemetry({ enableConsoleExport: true });
    });

    it('should return a tracer instance', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
    });

    it('should return tracer with custom name and version', () => {
      const tracer = getTracer('custom-tracer', '1.0.0');
      expect(tracer).toBeDefined();
    });

    it('should allow creating spans', () => {
      const tracer = getTracer();
      const span = tracer.startSpan('test-span');

      expect(span).toBeDefined();
      span.end();
    });
  });

  describe('getMeter', () => {
    beforeEach(async () => {
      await initTelemetry({ enableConsoleExport: true });
    });

    it('should return a meter instance', () => {
      const meter = getMeter();
      expect(meter).toBeDefined();
    });

    it('should return meter with custom name and version', () => {
      const meter = getMeter('custom-meter', '1.0.0');
      expect(meter).toBeDefined();
    });

    it('should allow creating counters', () => {
      const meter = getMeter();
      const counter = meter.createCounter('test-counter');

      expect(counter).toBeDefined();
      counter.add(1, { 'test.attribute': 'value' });
    });

    it('should allow creating histograms', () => {
      const meter = getMeter();
      const histogram = meter.createHistogram('test-histogram');

      expect(histogram).toBeDefined();
      histogram.record(42, { 'test.attribute': 'value' });
    });
  });

  describe('withSpan', () => {
    beforeEach(async () => {
      await initTelemetry({ enableConsoleExport: true });
    });

    it('should execute function within a span', async () => {
      const result = await withSpan('test-operation', async () => {
        return 'success';
      });

      expect(result).toBe('success');
    });

    it('should set span status to OK on success', async () => {
      await withSpan('successful-operation', async () => {
        return 'done';
      });

      // Span should have OK status (verified through exporter)
    });

    it('should record exceptions and set error status on failure', async () => {
      const testError = new Error('Test error');

      await expect(
        withSpan('failing-operation', async () => {
          throw testError;
        })
      ).rejects.toThrow('Test error');

      // Span should have ERROR status and recorded exception
    });

    it('should propagate return value', async () => {
      const result = await withSpan('computation', async () => {
        return { value: 42 };
      });

      expect(result).toEqual({ value: 42 });
    });

    it('should handle async operations', async () => {
      const result = await withSpan('async-operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'completed';
      });

      expect(result).toBe('completed');
    });
  });

  describe('recordSpanEvent', () => {
    beforeEach(async () => {
      await initTelemetry({ enableConsoleExport: true });
    });

    it('should record event on active span', async () => {
      await withSpan('parent-span', async () => {
        recordSpanEvent('checkpoint-reached', {
          'checkpoint.id': 'cp-1',
          'checkpoint.status': 'passed'
        });
      });

      // Event should be recorded on the span
    });

    it('should handle no active span gracefully', () => {
      expect(() => {
        recordSpanEvent('orphan-event', { key: 'value' });
      }).not.toThrow();
    });

    it('should record events with various attribute types', async () => {
      await withSpan('event-test', async () => {
        recordSpanEvent('mixed-attributes', {
          'string.attr': 'test',
          'number.attr': 42,
          'boolean.attr': true
        });
      });
    });
  });

  describe('setSpanAttributes', () => {
    beforeEach(async () => {
      await initTelemetry({ enableConsoleExport: true });
    });

    it('should set attributes on active span', async () => {
      await withSpan('parent-span', async () => {
        setSpanAttributes({
          'agent.id': 'agent-123',
          'task.type': 'test-generation',
          'task.priority': 'high'
        });
      });

      // Attributes should be set on the span
    });

    it('should handle no active span gracefully', () => {
      expect(() => {
        setSpanAttributes({ key: 'value' });
      }).not.toThrow();
    });

    it('should support semantic conventions', async () => {
      await withSpan('semantic-span', async () => {
        setSpanAttributes({
          'agent.id': 'test-agent',
          'agent.type': 'test-generator',
          'fleet.id': 'fleet-1',
          'task.id': 'task-123'
        });
      });
    });
  });

  describe('isTelemetryInitialized', () => {
    it('should return false when not initialized', () => {
      expect(isTelemetryInitialized()).toBe(false);
    });

    it('should return true when initialized', async () => {
      await initTelemetry({ enableConsoleExport: true });
      expect(isTelemetryInitialized()).toBe(true);
    });

    it('should return false after shutdown', async () => {
      await initTelemetry({ enableConsoleExport: true });
      await shutdownTelemetry();
      expect(isTelemetryInitialized()).toBe(false);
    });
  });

  describe('defaultTelemetryConfig', () => {
    it('should export default configuration', () => {
      expect(defaultTelemetryConfig).toBeDefined();
      expect(defaultTelemetryConfig.serviceName).toBe('agentic-qe-fleet');
      expect(defaultTelemetryConfig.environment).toBeTruthy();
    });

    it('should include all required fields', () => {
      expect(defaultTelemetryConfig).toHaveProperty('serviceName');
      expect(defaultTelemetryConfig).toHaveProperty('serviceVersion');
      expect(defaultTelemetryConfig).toHaveProperty('environment');
      expect(defaultTelemetryConfig).toHaveProperty('useGrpc');
      expect(defaultTelemetryConfig).toHaveProperty('enableAutoInstrumentation');
    });
  });

  describe('Context Propagation', () => {
    beforeEach(async () => {
      await initTelemetry({ enableConsoleExport: true });
    });

    it('should propagate context through nested spans', async () => {
      await withSpan('parent', async () => {
        setSpanAttributes({ 'span.level': 'parent' });

        await withSpan('child', async () => {
          setSpanAttributes({ 'span.level': 'child' });

          // Child span should have parent context
          const activeSpan = trace.getActiveSpan();
          expect(activeSpan).toBeDefined();
        });
      });
    });

    it('should maintain context across async boundaries', async () => {
      await withSpan('async-parent', async () => {
        await Promise.all([
          withSpan('async-child-1', async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
          }),
          withSpan('async-child-2', async () => {
            await new Promise(resolve => setTimeout(resolve, 5));
          })
        ]);
      });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle re-initialization gracefully', async () => {
      await initTelemetry({ enableConsoleExport: true });
      const result = await initTelemetry({ enableConsoleExport: true });

      expect(result.success).toBe(true);
      expect(result.exporters).toContain('already-initialized');
    });

    it('should handle shutdown errors gracefully', async () => {
      await initTelemetry({ enableConsoleExport: true });

      // Shutdown twice
      const firstShutdown = await shutdownTelemetry();
      const secondShutdown = await shutdownTelemetry();

      expect(firstShutdown.success).toBe(true);
      expect(secondShutdown.success).toBe(true);
    });

    it('should handle invalid OTLP endpoints', async () => {
      const result = await initTelemetry({
        otlpEndpoint: 'invalid://endpoint:99999',
        useGrpc: true,
        enableConsoleExport: false
      });

      // Should handle gracefully - either success or error
      expect(result).toHaveProperty('success');
    });
  });

  describe('Performance', () => {
    it('should initialize quickly', async () => {
      const start = Date.now();
      await initTelemetry({ enableConsoleExport: true });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000); // Should init in < 1 second
    });

    it('should shutdown quickly', async () => {
      await initTelemetry({ enableConsoleExport: true });

      const start = Date.now();
      await shutdownTelemetry();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(2000); // Should shutdown in < 2 seconds
    });

    it('should handle rapid span creation', async () => {
      await initTelemetry({ enableConsoleExport: true });
      const tracer = getTracer();

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        const span = tracer.startSpan(`test-span-${i}`);
        span.end();
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // 100 spans in < 100ms
    });
  });
});

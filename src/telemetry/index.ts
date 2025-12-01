/**
 * OpenTelemetry Module for Agentic QE Fleet
 *
 * Main entry point for telemetry functionality.
 */

// Bootstrap exports
export {
  initTelemetry,
  shutdownTelemetry,
  getTracer,
  getMeter,
  isTelemetryInitialized,
  withSpan,
  recordSpanEvent,
  setSpanAttributes,
  defaultTelemetryConfig,
} from './bootstrap';

// Type exports
export {
  TelemetryConfig,
  TelemetryInitResult,
  TelemetryShutdownResult,
  AgentAttributes,
  TaskAttributes,
  QEAttributes,
  ModelAttributes,
  MetricRecordOptions,
  METRIC_NAMES,
  HISTOGRAM_BOUNDARIES,
  SPAN_NAMES,
} from './types';

// Metrics exports
export * from './metrics';

/**
 * Quick start function for initializing telemetry with defaults
 *
 * @param serviceName - Optional service name override
 * @returns Initialization result
 */
export async function quickStartTelemetry(serviceName?: string) {
  const { initTelemetry } = await import('./bootstrap');
  const { initializeAllMetrics } = await import('./metrics');

  const result = await initTelemetry({
    serviceName: serviceName || 'agentic-qe-fleet',
    enableConsoleExport: process.env.NODE_ENV === 'development',
    enableAutoInstrumentation: true,
  });

  if (result.success) {
    // Initialize all metrics
    initializeAllMetrics();
  }

  return result;
}

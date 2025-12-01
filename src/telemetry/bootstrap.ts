/**
 * OpenTelemetry Bootstrap Module for Agentic QE Fleet
 *
 * Initializes OpenTelemetry SDK with auto-instrumentations, exporters,
 * and resource configuration for comprehensive observability.
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter as OTLPTraceExporterGrpc } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPTraceExporter as OTLPTraceExporterHttp } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter as OTLPMetricExporterGrpc } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { OTLPMetricExporter as OTLPMetricExporterHttp } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { diag, DiagConsoleLogger, DiagLogLevel, trace, metrics, Tracer, Meter } from '@opentelemetry/api';

import {
  TelemetryConfig,
  TelemetryInitResult,
  TelemetryShutdownResult
} from './types';

// Package version - read from package.json at runtime
const PACKAGE_VERSION = process.env.npm_package_version || '1.8.3';

// Default configuration
const DEFAULT_CONFIG: TelemetryConfig = {
  serviceName: 'agentic-qe-fleet',
  serviceVersion: PACKAGE_VERSION,
  environment: process.env.NODE_ENV || 'development',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
  metricsEndpoint: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
  logsEndpoint: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
  useGrpc: process.env.OTEL_EXPORTER_OTLP_PROTOCOL !== 'http/protobuf',
  enableConsoleExport: process.env.OTEL_CONSOLE_EXPORT === 'true',
  enableAutoInstrumentation: true,
  traceSampleRate: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '1.0'),
  metricExportInterval: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000', 10),
};

// Singleton SDK instance
let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry SDK with configuration
 *
 * @param config - Telemetry configuration options
 * @returns Initialization result with status and metadata
 */
export async function initTelemetry(
  config: Partial<TelemetryConfig> = {}
): Promise<TelemetryInitResult> {
  if (isInitialized && sdk) {
    return {
      success: true,
      serviceName: DEFAULT_CONFIG.serviceName,
      environment: DEFAULT_CONFIG.environment,
      exporters: ['already-initialized'],
    };
  }

  const mergedConfig: TelemetryConfig = { ...DEFAULT_CONFIG, ...config };
  const activeExporters: string[] = [];

  try {
    // Set up diagnostic logging for debugging
    if (process.env.OTEL_LOG_LEVEL === 'debug') {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
    }

    // Create resource with service identification
    const resource = new Resource({
      [SEMRESATTRS_SERVICE_NAME]: mergedConfig.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: mergedConfig.serviceVersion,
      [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: mergedConfig.environment,
      'service.namespace': 'agentic-qe',
      'service.instance.id': process.env.HOSTNAME || `instance-${process.pid}`,
      ...mergedConfig.resourceAttributes,
    });

    // Configure trace exporter
    let traceExporter;
    const traceEndpoint = mergedConfig.otlpEndpoint;

    if (mergedConfig.enableConsoleExport) {
      traceExporter = new ConsoleSpanExporter();
      activeExporters.push('console-trace');
    } else if (traceEndpoint) {
      if (mergedConfig.useGrpc) {
        traceExporter = new OTLPTraceExporterGrpc({
          url: traceEndpoint,
        });
        activeExporters.push('otlp-grpc-trace');
      } else {
        traceExporter = new OTLPTraceExporterHttp({
          url: `${traceEndpoint}/v1/traces`,
        });
        activeExporters.push('otlp-http-trace');
      }
    }

    // Configure metric exporter
    let metricReader;
    const metricsEndpoint = mergedConfig.metricsEndpoint || mergedConfig.otlpEndpoint;

    if (mergedConfig.enableConsoleExport) {
      metricReader = new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: mergedConfig.metricExportInterval,
      });
      activeExporters.push('console-metrics');
    } else if (metricsEndpoint) {
      let metricExporter;
      if (mergedConfig.useGrpc) {
        metricExporter = new OTLPMetricExporterGrpc({
          url: metricsEndpoint,
        });
        activeExporters.push('otlp-grpc-metrics');
      } else {
        metricExporter = new OTLPMetricExporterHttp({
          url: `${metricsEndpoint}/v1/metrics`,
        });
        activeExporters.push('otlp-http-metrics');
      }

      metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: mergedConfig.metricExportInterval,
      });
    }

    // Build SDK configuration
    const sdkConfig: ConstructorParameters<typeof NodeSDK>[0] = {
      resource,
    };

    // Add trace exporter if configured
    if (traceExporter) {
      // Type assertion needed due to version mismatch between sdk-node and sdk-trace-base
      sdkConfig.spanProcessors = [new BatchSpanProcessor(traceExporter) as any];
    }

    // Add metric reader if configured
    if (metricReader) {
      // Type assertion needed due to version mismatch between sdk-node and sdk-metrics
      sdkConfig.metricReader = metricReader as any;
    }

    // Add auto-instrumentations if enabled
    if (mergedConfig.enableAutoInstrumentation) {
      sdkConfig.instrumentations = [
        getNodeAutoInstrumentations({
          // Disable some noisy instrumentations
          '@opentelemetry/instrumentation-fs': {
            enabled: false,
          },
          '@opentelemetry/instrumentation-net': {
            enabled: false,
          },
          '@opentelemetry/instrumentation-dns': {
            enabled: false,
          },
        }),
      ];
      activeExporters.push('auto-instrumentation');
    }

    // Initialize SDK
    sdk = new NodeSDK(sdkConfig);
    await sdk.start();
    isInitialized = true;

    // Register shutdown handlers
    registerShutdownHandlers();

    return {
      success: true,
      serviceName: mergedConfig.serviceName,
      environment: mergedConfig.environment,
      exporters: activeExporters,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      serviceName: mergedConfig.serviceName,
      environment: mergedConfig.environment,
      exporters: [],
    };
  }
}

/**
 * Gracefully shutdown OpenTelemetry SDK
 *
 * @returns Shutdown result with status
 */
export async function shutdownTelemetry(): Promise<TelemetryShutdownResult> {
  const startTime = Date.now();

  if (!sdk || !isInitialized) {
    return {
      success: true,
      shutdownDuration: 0,
    };
  }

  try {
    await sdk.shutdown();
    sdk = null;
    isInitialized = false;

    return {
      success: true,
      shutdownDuration: Date.now() - startTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      shutdownDuration: Date.now() - startTime,
    };
  }
}

/**
 * Get a tracer instance for creating spans
 *
 * @param name - Tracer name (defaults to service name)
 * @param version - Tracer version (defaults to service version)
 * @returns Tracer instance
 */
export function getTracer(
  name: string = DEFAULT_CONFIG.serviceName,
  version: string = DEFAULT_CONFIG.serviceVersion
): Tracer {
  return trace.getTracer(name, version);
}

/**
 * Get a meter instance for creating metrics
 *
 * @param name - Meter name (defaults to service name)
 * @param version - Meter version (defaults to service version)
 * @returns Meter instance
 */
export function getMeter(
  name: string = DEFAULT_CONFIG.serviceName,
  version: string = DEFAULT_CONFIG.serviceVersion
): Meter {
  return metrics.getMeter(name, version);
}

/**
 * Check if telemetry is initialized
 *
 * @returns Whether telemetry has been initialized
 */
export function isTelemetryInitialized(): boolean {
  return isInitialized;
}

/**
 * Register process shutdown handlers for graceful shutdown
 */
function registerShutdownHandlers(): void {
  const shutdownHandler = async () => {
    await shutdownTelemetry();
    process.exit(0);
  };

  // Handle various shutdown signals
  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);

  // Handle uncaught exceptions - flush telemetry before exit
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await shutdownTelemetry();
    process.exit(1);
  });

  // Handle unhandled rejections
  process.on('unhandledRejection', async (reason) => {
    console.error('Unhandled Rejection:', reason);
    await shutdownTelemetry();
    process.exit(1);
  });
}

/**
 * Create a child span within the current context
 *
 * @param name - Span name
 * @param fn - Function to execute within the span
 * @returns Result of the function
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span) => {
    try {
      const result = await fn();
      span.setStatus({ code: 1 }); // OK
      return result;
    } catch (error) {
      span.setStatus({
        code: 2, // ERROR
        message: error instanceof Error ? error.message : String(error),
      });
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Record an event on the current span
 *
 * @param name - Event name
 * @param attributes - Event attributes
 */
export function recordSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.addEvent(name, attributes);
  }
}

/**
 * Set attributes on the current span
 *
 * @param attributes - Attributes to set
 */
export function setSpanAttributes(
  attributes: Record<string, string | number | boolean>
): void {
  const currentSpan = trace.getActiveSpan();
  if (currentSpan) {
    currentSpan.setAttributes(attributes);
  }
}

// Export configuration for external use
export { DEFAULT_CONFIG as defaultTelemetryConfig };

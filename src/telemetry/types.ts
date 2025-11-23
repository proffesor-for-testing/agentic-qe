/**
 * OpenTelemetry Types for Agentic QE Fleet
 *
 * Type definitions for telemetry configuration, metrics, and observability.
 */

import { Attributes } from '@opentelemetry/api';

/**
 * Telemetry configuration options
 */
export interface TelemetryConfig {
  /** Service name for resource identification */
  serviceName: string;
  /** Service version */
  serviceVersion: string;
  /** Deployment environment (development, staging, production) */
  environment: string;
  /** OTLP endpoint for trace export */
  otlpEndpoint?: string;
  /** OTLP endpoint for metrics export */
  metricsEndpoint?: string;
  /** OTLP endpoint for logs export */
  logsEndpoint?: string;
  /** Whether to use gRPC (true) or HTTP (false) for OTLP */
  useGrpc?: boolean;
  /** Enable console exporter for debugging */
  enableConsoleExport?: boolean;
  /** Enable auto-instrumentation */
  enableAutoInstrumentation?: boolean;
  /** Sample rate for traces (0.0 to 1.0) */
  traceSampleRate?: number;
  /** Metric export interval in milliseconds */
  metricExportInterval?: number;
  /** Additional resource attributes */
  resourceAttributes?: Attributes;
}

/**
 * Agent telemetry attributes
 */
export interface AgentAttributes {
  /** Unique agent identifier */
  'agent.id': string;
  /** Agent type (e.g., test-generator, coverage-analyzer) */
  'agent.type': string;
  /** Agent name */
  'agent.name': string;
  /** Fleet identifier */
  'fleet.id'?: string;
  /** Fleet topology (hierarchical, mesh, star, ring) */
  'fleet.topology'?: string;
}

/**
 * Task telemetry attributes
 */
export interface TaskAttributes {
  /** Unique task identifier */
  'task.id': string;
  /** Task type (unit-test, integration-test, coverage-analysis, etc.) */
  'task.type': string;
  /** Task priority (low, medium, high, critical) */
  'task.priority'?: string | number;
  /** Task status (pending, running, completed, failed) */
  'task.status': string;
  /** Parent task ID for hierarchical tasks */
  'task.parent_id'?: string;
}

/**
 * Quality Engineering specific attributes
 */
export interface QEAttributes {
  /** Test framework (jest, mocha, pytest, etc.) */
  'qe.test_framework'?: string;
  /** Coverage type (line, branch, function, statement) */
  'qe.coverage_type'?: string;
  /** Quality gate name */
  'qe.gate_name'?: string;
  /** Risk level (low, medium, high, critical) */
  'qe.risk_level'?: string;
  /** Security severity (info, low, medium, high, critical) */
  'qe.security_severity'?: string;
}

/**
 * Model routing attributes
 */
export interface ModelAttributes {
  /** Model provider (anthropic, openai, etc.) */
  'model.provider': string;
  /** Model name/ID */
  'model.name': string;
  /** Model tier (fast, balanced, quality) */
  'model.tier'?: string;
  /** Routing reason */
  'model.routing_reason'?: string;
}

/**
 * Metric recording options
 */
export interface MetricRecordOptions {
  /** Attributes to attach to the metric */
  attributes?: Attributes;
  /** Timestamp for the metric (defaults to now) */
  timestamp?: number;
}

/**
 * Histogram bucket boundaries for common metrics
 */
export const HISTOGRAM_BOUNDARIES = {
  /** Task duration in milliseconds */
  taskDuration: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000],
  /** Token counts */
  tokenCount: [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000],
  /** Coverage percentage */
  coveragePercent: [10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 100],
  /** Queue depth */
  queueDepth: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
  /** Memory in bytes */
  memoryBytes: [
    1024 * 1024,      // 1 MB
    10 * 1024 * 1024, // 10 MB
    50 * 1024 * 1024, // 50 MB
    100 * 1024 * 1024, // 100 MB
    500 * 1024 * 1024, // 500 MB
    1024 * 1024 * 1024, // 1 GB
  ],
};

/**
 * Semantic naming conventions for QE metrics
 */
export const METRIC_NAMES = {
  // Agent metrics
  AGENT_TASK_DURATION: 'aqe.agent.task.duration',
  AGENT_TASK_COUNT: 'aqe.agent.task.count',
  AGENT_SUCCESS_RATE: 'aqe.agent.success.rate',
  AGENT_TOKEN_USAGE: 'aqe.agent.token.usage',
  AGENT_COST: 'aqe.agent.cost',
  AGENT_ACTIVE_COUNT: 'aqe.agent.active.count',
  AGENT_ERROR_COUNT: 'aqe.agent.error.count',

  // Quality metrics
  TEST_PASS_RATE: 'aqe.quality.test.pass_rate',
  TEST_COUNT: 'aqe.quality.test.count',
  TEST_DURATION: 'aqe.quality.test.duration',
  COVERAGE_LINE: 'aqe.quality.coverage.line',
  COVERAGE_BRANCH: 'aqe.quality.coverage.branch',
  COVERAGE_FUNCTION: 'aqe.quality.coverage.function',
  DEFECT_DENSITY: 'aqe.quality.defect.density',
  FLAKY_TEST_COUNT: 'aqe.quality.flaky.count',
  QUALITY_GATE_PASS_RATE: 'aqe.quality.gate.pass_rate',
  SECURITY_VULNERABILITY_COUNT: 'aqe.quality.security.vulnerability.count',

  // System metrics
  MEMORY_USAGE: 'aqe.system.memory.usage',
  CPU_USAGE: 'aqe.system.cpu.usage',
  QUEUE_DEPTH: 'aqe.system.queue.depth',
  QUEUE_WAIT_TIME: 'aqe.system.queue.wait_time',
  DATABASE_QUERY_DURATION: 'aqe.system.db.query.duration',
  DATABASE_CONNECTION_COUNT: 'aqe.system.db.connection.count',
  EVENT_BUS_PUBLISH_COUNT: 'aqe.system.eventbus.publish.count',
  EVENT_BUS_LATENCY: 'aqe.system.eventbus.latency',
} as const;

/**
 * Span names for tracing
 */
export const SPAN_NAMES = {
  // Agent operations
  AGENT_EXECUTE_TASK: 'aqe.agent.execute_task',
  AGENT_GENERATE_TESTS: 'aqe.agent.generate_tests',
  AGENT_ANALYZE_COVERAGE: 'aqe.agent.analyze_coverage',
  AGENT_VALIDATE_QUALITY: 'aqe.agent.validate_quality',
  AGENT_SCAN_SECURITY: 'aqe.agent.scan_security',

  // Fleet operations
  FLEET_SPAWN_AGENT: 'aqe.fleet.spawn_agent',
  FLEET_COORDINATE: 'aqe.fleet.coordinate',
  FLEET_DISTRIBUTE_TASK: 'aqe.fleet.distribute_task',

  // Model routing
  MODEL_ROUTE: 'aqe.model.route',
  MODEL_INVOKE: 'aqe.model.invoke',

  // Database operations
  DB_QUERY: 'aqe.db.query',
  DB_INSERT: 'aqe.db.insert',
  DB_UPDATE: 'aqe.db.update',

  // Memory operations
  MEMORY_STORE: 'aqe.memory.store',
  MEMORY_RETRIEVE: 'aqe.memory.retrieve',
  MEMORY_SEARCH: 'aqe.memory.search',
} as const;

/**
 * Telemetry initialization result
 */
export interface TelemetryInitResult {
  /** Whether initialization was successful */
  success: boolean;
  /** Error message if initialization failed */
  error?: string;
  /** Configured service name */
  serviceName: string;
  /** Configured environment */
  environment: string;
  /** Active exporters */
  exporters: string[];
}

/**
 * Shutdown result
 */
export interface TelemetryShutdownResult {
  /** Whether shutdown was successful */
  success: boolean;
  /** Error message if shutdown failed */
  error?: string;
  /** Time taken to shutdown in milliseconds */
  shutdownDuration: number;
}

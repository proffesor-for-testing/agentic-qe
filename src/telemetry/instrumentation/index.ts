/**
 * Telemetry Instrumentation - Agent and Task Tracing
 *
 * Comprehensive OpenTelemetry instrumentation for all 18 QE agents
 * with automatic span management, context propagation, and semantic attributes.
 *
 * @module telemetry/instrumentation
 */

export {
  AgentSpanManager,
  agentSpanManager,
  AgentSpanConfig,
  TaskSpanConfig,
  InstrumentAgent,
  withAgentSpan,
} from './agent';

export {
  TaskSpanManager,
  taskSpanManager,
  TaskSpanConfig as TaskExecutionSpanConfig,
  TaskResult,
  withTaskSpan,
} from './task';

export {
  MemorySpanManager,
  memorySpanManager,
  MemoryStoreConfig,
  MemoryRetrieveConfig,
  MemorySearchConfig,
  MemoryDeleteConfig,
  MemoryStoreResult,
  MemoryRetrieveResult,
  MemorySearchResult,
  MemoryDeleteResult,
  withMemoryStore,
  withMemoryRetrieve,
  withMemorySearch,
  withMemoryDelete,
} from './memory';

/**
 * Initialize all instrumentation managers
 *
 * Call this during application startup to ensure proper cleanup on shutdown.
 */
export function initializeInstrumentation(): void {
  // Register cleanup handlers
  process.on('SIGTERM', cleanupInstrumentation);
  process.on('SIGINT', cleanupInstrumentation);
  process.on('beforeExit', cleanupInstrumentation);
}

/**
 * Cleanup all active instrumentation spans
 *
 * Ensures all spans are properly ended during graceful shutdown.
 */
export function cleanupInstrumentation(): void {
  const { agentSpanManager } = require('./agent');
  const { taskSpanManager } = require('./task');
  const { memorySpanManager } = require('./memory');

  agentSpanManager.cleanup();
  taskSpanManager.cleanup();
  memorySpanManager.cleanup();
}

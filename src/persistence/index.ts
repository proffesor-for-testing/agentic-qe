/**
 * @fileoverview Main entry point for AQE persistence layer
 * @module persistence
 */

import * as path from 'path';
import * as fs from 'fs';

// Export schema types and utilities
export {
  // Event types
  EventType,
  EventRecord,
  CreateEventInput,

  // Reasoning types
  ThoughtType,
  ChainStatus,
  ReasoningChain,
  ReasoningStep,
  ReasoningChainWithSteps,
  StartChainInput,
  AddStepInput,

  // Metrics types
  AggregationPeriod,
  QualityMetric,
  AggregatedMetric,
  RecordMetricInput,
  MetricTrendPoint,
  AgentPerformance,

  // Configuration
  PersistenceConfig,
  DEFAULT_PERSISTENCE_CONFIG,
  CURRENT_SCHEMA_VERSION,

  // Database utilities
  createDatabase,
  closeDatabase,
  initializeSchema,
} from './schema';

// Export store classes
export { EventStore, EventQueryOptions, TimeRange } from './event-store';
export { ReasoningStore, ChainQueryOptions } from './reasoning-store';
export { MetricsAggregator, MetricQueryOptions, AggregationConfig } from './metrics-aggregator';

// Import for initialization
import { EventStore } from './event-store';
import { ReasoningStore } from './reasoning-store';
import { MetricsAggregator } from './metrics-aggregator';
import { PersistenceConfig, DEFAULT_PERSISTENCE_CONFIG } from './schema';

/**
 * Options for persistence initialization
 */
export interface InitPersistenceOptions {
  /**
   * Base directory for database files
   * @default './data'
   */
  baseDir?: string;

  /**
   * Enable WAL mode for better concurrency
   * @default true
   */
  enableWAL?: boolean;

  /**
   * Busy timeout in milliseconds
   * @default 5000
   */
  busyTimeout?: number;

  /**
   * Maximum retry attempts for operations
   * @default 3
   */
  maxRetries?: number;

  /**
   * Use separate databases for each store
   * @default false (single database)
   */
  separateDatabases?: boolean;
}

/**
 * Initialized persistence stores
 */
export interface PersistenceStores {
  eventStore: EventStore;
  reasoningStore: ReasoningStore;
  metricsAggregator: MetricsAggregator;

  /**
   * Close all database connections
   */
  close: () => void;

  /**
   * Get statistics from all stores
   */
  getStatistics: () => {
    events: ReturnType<EventStore['getStatistics']>;
    reasoning: ReturnType<ReasoningStore['getStatistics']>;
    metrics: ReturnType<MetricsAggregator['getStatistics']>;
  };
}

/**
 * Initialize the persistence layer
 *
 * @param options - Initialization options
 * @returns Initialized persistence stores
 *
 * @example
 * ```typescript
 * // Initialize with default settings
 * const persistence = initPersistence();
 *
 * // Record an event
 * persistence.eventStore.recordEvent({
 *   agent_id: 'test-gen',
 *   event_type: 'test_generated',
 *   payload: { count: 5 },
 *   session_id: 'session-123'
 * });
 *
 * // Start a reasoning chain
 * const chain = persistence.reasoningStore.startChain({
 *   session_id: 'session-123',
 *   agent_id: 'test-gen'
 * });
 *
 * // Record a metric
 * persistence.metricsAggregator.recordMetric({
 *   agent_id: 'test-gen',
 *   metric_name: 'coverage',
 *   metric_value: 85.5
 * });
 *
 * // Clean up
 * persistence.close();
 * ```
 */
export function initPersistence(options: InitPersistenceOptions = {}): PersistenceStores {
  const {
    baseDir = './data',
    enableWAL = true,
    busyTimeout = 5000,
    maxRetries = 3,
    separateDatabases = false,
  } = options;

  // Ensure base directory exists
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  // Create configuration
  const createConfig = (dbName: string): Partial<PersistenceConfig> => ({
    dbPath: path.join(baseDir, dbName),
    enableWAL,
    busyTimeout,
    maxRetries,
  });

  // Initialize stores
  let eventStore: EventStore;
  let reasoningStore: ReasoningStore;
  let metricsAggregator: MetricsAggregator;

  if (separateDatabases) {
    // Each store gets its own database
    eventStore = new EventStore(createConfig('aqe-events.db'));
    reasoningStore = new ReasoningStore(createConfig('aqe-reasoning.db'));
    metricsAggregator = new MetricsAggregator(createConfig('aqe-metrics.db'));
  } else {
    // All stores share a single database
    const sharedConfig = createConfig('aqe-telemetry.db');
    eventStore = new EventStore(sharedConfig);
    reasoningStore = new ReasoningStore(sharedConfig);
    metricsAggregator = new MetricsAggregator(sharedConfig);
  }

  return {
    eventStore,
    reasoningStore,
    metricsAggregator,

    close: () => {
      eventStore.close();
      reasoningStore.close();
      metricsAggregator.close();
    },

    getStatistics: () => ({
      events: eventStore.getStatistics(),
      reasoning: reasoningStore.getStatistics(),
      metrics: metricsAggregator.getStatistics(),
    }),
  };
}

/**
 * Quick utility to create an event store with default settings
 * @param dbPath - Optional database path
 * @returns Configured EventStore instance
 */
export function createEventStore(dbPath?: string): EventStore {
  return new EventStore(dbPath ? { dbPath } : undefined);
}

/**
 * Quick utility to create a reasoning store with default settings
 * @param dbPath - Optional database path
 * @returns Configured ReasoningStore instance
 */
export function createReasoningStore(dbPath?: string): ReasoningStore {
  return new ReasoningStore(dbPath ? { dbPath } : undefined);
}

/**
 * Quick utility to create a metrics aggregator with default settings
 * @param dbPath - Optional database path
 * @returns Configured MetricsAggregator instance
 */
export function createMetricsAggregator(dbPath?: string): MetricsAggregator {
  return new MetricsAggregator(dbPath ? { dbPath } : undefined);
}

/**
 * Database cleanup utility
 * @param baseDir - Directory containing database files
 * @param olderThan - Delete data older than this ISO timestamp
 * @returns Cleanup results
 */
export function cleanupOldData(
  baseDir: string = './data',
  olderThan: string
): {
  eventsDeleted: number;
  chainsDeleted: number;
  metricsDeleted: number;
  aggregatedDeleted: number;
} {
  const persistence = initPersistence({ baseDir });

  try {
    const eventsDeleted = persistence.eventStore.deleteEventsOlderThan(olderThan);
    const chainsDeleted = persistence.reasoningStore.deleteOldChains(olderThan);
    const metricsDeleted = persistence.metricsAggregator.deleteMetricsOlderThan(olderThan);
    const aggregatedDeleted = persistence.metricsAggregator.deleteAggregatedOlderThan(olderThan);

    return {
      eventsDeleted,
      chainsDeleted,
      metricsDeleted,
      aggregatedDeleted,
    };
  } finally {
    persistence.close();
  }
}

/**
 * Run metric aggregation for all periods
 * @param baseDir - Directory containing database files
 * @param periods - Periods to aggregate
 * @returns Aggregation results
 */
export function runAggregation(
  baseDir: string = './data',
  periods: Array<'1min' | '5min' | '1hour' | '1day'> = ['1min', '5min', '1hour', '1day']
): Record<string, number> {
  const persistence = initPersistence({ baseDir });
  const results: Record<string, number> = {};

  try {
    for (const period of periods) {
      const count = persistence.metricsAggregator.aggregateByPeriod({ period });
      results[period] = count;
    }
    return results;
  } finally {
    persistence.close();
  }
}

// Default export for convenient usage
export default {
  initPersistence,
  createEventStore,
  createReasoningStore,
  createMetricsAggregator,
  cleanupOldData,
  runAggregation,
};

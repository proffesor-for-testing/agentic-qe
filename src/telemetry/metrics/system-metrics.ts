/**
 * System Metrics for Agentic QE Fleet
 *
 * Metrics for tracking system resources, queues, databases, and infrastructure.
 */

import { Meter, Counter, Histogram, UpDownCounter, Attributes, ObservableGauge } from '@opentelemetry/api';
import { getMeter } from '../bootstrap';
import { METRIC_NAMES, HISTOGRAM_BOUNDARIES } from '../types';
import * as os from 'os';
import * as v8 from 'v8';

/**
 * System metrics registry
 */
export interface SystemMetrics {
  /** Current heap memory usage */
  memoryHeapUsed: ObservableGauge;
  /** Total heap memory */
  memoryHeapTotal: ObservableGauge;
  /** RSS memory usage */
  memoryRss: ObservableGauge;
  /** External memory usage */
  memoryExternal: ObservableGauge;
  /** CPU usage percentage */
  cpuUsage: ObservableGauge;
  /** Event loop lag */
  eventLoopLag: Histogram;
  /** Task queue depth */
  queueDepth: UpDownCounter;
  /** Queue wait time */
  queueWaitTime: Histogram;
  /** Database query count */
  dbQueryCount: Counter;
  /** Database query duration */
  dbQueryDuration: Histogram;
  /** Database connection count */
  dbConnectionCount: UpDownCounter;
  /** Event bus publish count */
  eventBusPublishCount: Counter;
  /** Event bus latency */
  eventBusLatency: Histogram;
  /** File system operations */
  fsOperationCount: Counter;
  /** Network request count */
  networkRequestCount: Counter;
  /** Network request duration */
  networkRequestDuration: Histogram;
}

// Singleton metrics instance
let systemMetrics: SystemMetrics | null = null;

// CPU tracking state
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = Date.now();

/**
 * Calculate CPU usage percentage
 */
function calculateCpuUsage(): number {
  const currentCpuUsage = process.cpuUsage(lastCpuUsage);
  const currentTime = Date.now();
  const elapsedMs = currentTime - lastCpuTime;

  if (elapsedMs === 0) return 0;

  // Total CPU time used in microseconds
  const totalCpuTime = currentCpuUsage.user + currentCpuUsage.system;
  // Convert to percentage (microseconds to milliseconds, then to percentage)
  const cpuPercent = (totalCpuTime / 1000 / elapsedMs) * 100;

  // Update tracking state
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = currentTime;

  return Math.min(cpuPercent, 100);
}

/**
 * Initialize system metrics
 *
 * @param meter - OpenTelemetry Meter instance
 * @returns System metrics registry
 */
export function createSystemMetrics(meter?: Meter): SystemMetrics {
  if (systemMetrics) {
    return systemMetrics;
  }

  const m = meter || getMeter();

  // Create observable gauges for memory metrics
  const memoryHeapUsed = m.createObservableGauge(METRIC_NAMES.MEMORY_USAGE + '.heap.used', {
    description: 'Current heap memory used',
    unit: 'bytes',
  });

  const memoryHeapTotal = m.createObservableGauge(METRIC_NAMES.MEMORY_USAGE + '.heap.total', {
    description: 'Total heap memory',
    unit: 'bytes',
  });

  const memoryRss = m.createObservableGauge(METRIC_NAMES.MEMORY_USAGE + '.rss', {
    description: 'Resident set size memory',
    unit: 'bytes',
  });

  const memoryExternal = m.createObservableGauge(METRIC_NAMES.MEMORY_USAGE + '.external', {
    description: 'External memory usage',
    unit: 'bytes',
  });

  const cpuUsage = m.createObservableGauge(METRIC_NAMES.CPU_USAGE, {
    description: 'CPU usage percentage',
    unit: 'percent',
  });

  // Register callbacks for observable gauges
  m.addBatchObservableCallback(
    (observableResult) => {
      const memUsage = process.memoryUsage();
      const heapStats = v8.getHeapStatistics();

      observableResult.observe(memoryHeapUsed, memUsage.heapUsed);
      observableResult.observe(memoryHeapTotal, memUsage.heapTotal);
      observableResult.observe(memoryRss, memUsage.rss);
      observableResult.observe(memoryExternal, memUsage.external);
      observableResult.observe(cpuUsage, calculateCpuUsage());
    },
    [memoryHeapUsed, memoryHeapTotal, memoryRss, memoryExternal, cpuUsage]
  );

  systemMetrics = {
    memoryHeapUsed,
    memoryHeapTotal,
    memoryRss,
    memoryExternal,
    cpuUsage,

    eventLoopLag: m.createHistogram('aqe.system.eventloop.lag', {
      description: 'Event loop lag in milliseconds',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      },
    }),

    queueDepth: m.createUpDownCounter(METRIC_NAMES.QUEUE_DEPTH, {
      description: 'Current depth of task queues',
      unit: 'tasks',
    }),

    queueWaitTime: m.createHistogram(METRIC_NAMES.QUEUE_WAIT_TIME, {
      description: 'Time tasks wait in queue before processing',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      },
    }),

    dbQueryCount: m.createCounter(METRIC_NAMES.DATABASE_QUERY_DURATION + '.count', {
      description: 'Total number of database queries',
      unit: 'queries',
    }),

    dbQueryDuration: m.createHistogram(METRIC_NAMES.DATABASE_QUERY_DURATION, {
      description: 'Database query execution duration',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500],
      },
    }),

    dbConnectionCount: m.createUpDownCounter(METRIC_NAMES.DATABASE_CONNECTION_COUNT, {
      description: 'Current number of database connections',
      unit: 'connections',
    }),

    eventBusPublishCount: m.createCounter(METRIC_NAMES.EVENT_BUS_PUBLISH_COUNT, {
      description: 'Number of events published to event bus',
      unit: 'events',
    }),

    eventBusLatency: m.createHistogram(METRIC_NAMES.EVENT_BUS_LATENCY, {
      description: 'Event bus publish-to-receive latency',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [0.1, 0.5, 1, 5, 10, 25, 50, 100],
      },
    }),

    fsOperationCount: m.createCounter('aqe.system.fs.operation.count', {
      description: 'Number of file system operations',
      unit: 'operations',
    }),

    networkRequestCount: m.createCounter('aqe.system.network.request.count', {
      description: 'Number of network requests',
      unit: 'requests',
    }),

    networkRequestDuration: m.createHistogram('aqe.system.network.request.duration', {
      description: 'Network request duration',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
      },
    }),
  };

  return systemMetrics!;
}

/**
 * Get initialized system metrics
 *
 * @returns System metrics registry
 */
export function getSystemMetrics(): SystemMetrics {
  if (!systemMetrics) {
    return createSystemMetrics();
  }
  return systemMetrics;
}

/**
 * Record database query
 *
 * @param operation - Query operation (select, insert, update, delete)
 * @param table - Table or collection name
 * @param durationMs - Query duration in milliseconds
 * @param success - Whether the query succeeded
 */
export function recordDatabaseQuery(
  operation: string,
  table: string,
  durationMs: number,
  success: boolean = true
): void {
  const metrics = getSystemMetrics();

  const attributes: Attributes = {
    'db.operation': operation,
    'db.table': table,
    'db.status': success ? 'success' : 'error',
  };

  metrics.dbQueryCount.add(1, attributes);
  metrics.dbQueryDuration.record(durationMs, attributes);
}

/**
 * Record database connection change
 *
 * @param delta - Change in connection count (+1 for open, -1 for close)
 * @param poolName - Connection pool name
 */
export function recordDatabaseConnection(
  delta: number,
  poolName: string = 'default'
): void {
  const metrics = getSystemMetrics();

  metrics.dbConnectionCount.add(delta, {
    'db.pool': poolName,
  });
}

/**
 * Record queue operation
 *
 * @param queueName - Name of the queue
 * @param operation - Operation type (enqueue, dequeue)
 * @param waitTimeMs - Time item waited in queue (for dequeue)
 */
export function recordQueueOperation(
  queueName: string,
  operation: 'enqueue' | 'dequeue',
  waitTimeMs?: number
): void {
  const metrics = getSystemMetrics();

  const attributes: Attributes = {
    'queue.name': queueName,
  };

  if (operation === 'enqueue') {
    metrics.queueDepth.add(1, attributes);
  } else {
    metrics.queueDepth.add(-1, attributes);
    if (waitTimeMs !== undefined) {
      metrics.queueWaitTime.record(waitTimeMs, attributes);
    }
  }
}

/**
 * Record event bus operation
 *
 * @param eventType - Type of event
 * @param latencyMs - Publish-to-receive latency
 */
export function recordEventBusOperation(
  eventType: string,
  latencyMs?: number
): void {
  const metrics = getSystemMetrics();

  const attributes: Attributes = {
    'event.type': eventType,
  };

  metrics.eventBusPublishCount.add(1, attributes);

  if (latencyMs !== undefined) {
    metrics.eventBusLatency.record(latencyMs, attributes);
  }
}

/**
 * Record network request
 *
 * @param method - HTTP method
 * @param url - Request URL
 * @param statusCode - Response status code
 * @param durationMs - Request duration
 */
export function recordNetworkRequest(
  method: string,
  url: string,
  statusCode: number,
  durationMs: number
): void {
  const metrics = getSystemMetrics();

  // Extract host from URL
  let host = 'unknown';
  try {
    host = new URL(url).host;
  } catch {
    // Keep default
  }

  const attributes: Attributes = {
    'http.method': method,
    'http.host': host,
    'http.status_code': statusCode,
    'http.status_class': `${Math.floor(statusCode / 100)}xx`,
  };

  metrics.networkRequestCount.add(1, attributes);
  metrics.networkRequestDuration.record(durationMs, attributes);
}

/**
 * Record file system operation
 *
 * @param operation - FS operation (read, write, delete, etc.)
 * @param path - File path
 * @param success - Whether operation succeeded
 */
export function recordFileSystemOperation(
  operation: string,
  path: string,
  success: boolean = true
): void {
  const metrics = getSystemMetrics();

  // Extract directory from path for grouping
  const directory = path.substring(0, path.lastIndexOf('/')) || '/';

  metrics.fsOperationCount.add(1, {
    'fs.operation': operation,
    'fs.directory': directory,
    'fs.status': success ? 'success' : 'error',
  });
}

/**
 * Record event loop lag
 *
 * @param lagMs - Event loop lag in milliseconds
 */
export function recordEventLoopLag(lagMs: number): void {
  const metrics = getSystemMetrics();
  metrics.eventLoopLag.record(lagMs);
}

/**
 * Create memory-specific detailed metrics
 */
export function createMemoryDetailMetrics(meter?: Meter) {
  const m = meter || getMeter();

  return {
    heapSpaceUsed: m.createObservableGauge('aqe.system.memory.heap.space.used', {
      description: 'Heap space used by type',
      unit: 'bytes',
    }),

    heapSpaceAvailable: m.createObservableGauge('aqe.system.memory.heap.space.available', {
      description: 'Heap space available by type',
      unit: 'bytes',
    }),

    gcDuration: m.createHistogram('aqe.system.gc.duration', {
      description: 'Garbage collection duration',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500],
      },
    }),

    gcCount: m.createCounter('aqe.system.gc.count', {
      description: 'Number of garbage collections',
      unit: 'collections',
    }),
  };
}

/**
 * Create fleet coordination metrics
 */
export function createFleetCoordinationMetrics(meter?: Meter) {
  const m = meter || getMeter();

  return {
    coordinationRoundtrip: m.createHistogram('aqe.fleet.coordination.roundtrip', {
      description: 'Fleet coordination message roundtrip time',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      },
    }),

    taskDistributionTime: m.createHistogram('aqe.fleet.task.distribution.time', {
      description: 'Time to distribute tasks across fleet',
      unit: 'ms',
      advice: {
        explicitBucketBoundaries: [10, 50, 100, 250, 500, 1000, 2500],
      },
    }),

    agentSyncCount: m.createCounter('aqe.fleet.agent.sync.count', {
      description: 'Number of agent synchronization events',
      unit: 'syncs',
    }),

    memoryShareSize: m.createHistogram('aqe.fleet.memory.share.size', {
      description: 'Size of shared memory operations',
      unit: 'bytes',
      advice: {
        explicitBucketBoundaries: HISTOGRAM_BOUNDARIES.memoryBytes,
      },
    }),
  };
}

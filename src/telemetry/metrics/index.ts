/**
 * Metrics Index for Agentic QE Fleet Telemetry
 *
 * Exports all metric definitions and recording functions.
 */

// Agent metrics
export {
  AgentMetrics,
  createAgentMetrics,
  getAgentMetrics,
  recordAgentTask,
  recordAgentCount,
  createModelRoutingMetrics,
  createLearningMetrics,
  ModelRoutingRecord,
} from './agent-metrics';

// Quality metrics
export {
  QualityMetrics,
  createQualityMetrics,
  getQualityMetrics,
  recordTestExecution,
  recordCoverage,
  recordQualityGate,
  recordSecurityScan,
  recordFlakyTest,
  recordDefectDensity,
  createApiContractMetrics,
  TestExecutionResult,
  CoverageReport,
  QualityGateResult,
  SecurityScanResult,
} from './quality-metrics';

// System metrics
export {
  SystemMetrics,
  createSystemMetrics,
  getSystemMetrics,
  recordDatabaseQuery,
  recordDatabaseConnection,
  recordQueueOperation,
  recordEventBusOperation,
  recordNetworkRequest,
  recordFileSystemOperation,
  recordEventLoopLag,
  createMemoryDetailMetrics,
  createFleetCoordinationMetrics,
} from './system-metrics';

// Re-export types and constants
export { METRIC_NAMES, HISTOGRAM_BOUNDARIES, MetricRecordOptions } from '../types';

/**
 * Initialize all metrics
 *
 * @returns Object containing all metric registries
 */
export function initializeAllMetrics() {
  const { createAgentMetrics } = require('./agent-metrics');
  const { createQualityMetrics } = require('./quality-metrics');
  const { createSystemMetrics } = require('./system-metrics');

  return {
    agent: createAgentMetrics(),
    quality: createQualityMetrics(),
    system: createSystemMetrics(),
  };
}

/**
 * Convenience function to record a complete agent task with all metrics
 */
export interface CompleteTaskRecord {
  // Agent info
  agentType: string;
  agentId?: string;

  // Task info
  taskType: string;
  taskId?: string;
  priority?: string;

  // Execution results
  durationMs: number;
  success: boolean;

  // Resource usage
  tokensUsed?: number;
  cost?: number;

  // Quality results (optional)
  testResults?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };

  coverage?: {
    line: number;
    branch: number;
    function: number;
  };
}

/**
 * Record a complete agent task with all relevant metrics
 *
 * @param record - Complete task record
 */
export function recordCompleteTask(record: CompleteTaskRecord): void {
  const { recordAgentTask } = require('./agent-metrics');
  const { recordTestExecution, recordCoverage } = require('./quality-metrics');

  // Record agent task
  recordAgentTask(record.agentType, record.taskType, record.durationMs, record.success, {
    agentId: record.agentId,
    taskId: record.taskId,
    priority: record.priority,
    tokensUsed: record.tokensUsed,
    cost: record.cost,
  });

  // Record test results if provided
  if (record.testResults) {
    recordTestExecution({
      framework: 'jest', // Default, should be configurable
      suite: record.taskId || 'unknown',
      total: record.testResults.total,
      passed: record.testResults.passed,
      failed: record.testResults.failed,
      skipped: record.testResults.skipped,
      durationMs: record.durationMs,
    });
  }

  // Record coverage if provided
  if (record.coverage) {
    recordCoverage({
      target: record.taskId || 'unknown',
      line: record.coverage.line,
      branch: record.coverage.branch,
      function: record.coverage.function,
    });
  }
}

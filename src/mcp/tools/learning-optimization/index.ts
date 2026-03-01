/**
 * Learning Optimization MCP Tools
 *
 * Exports:
 * - LearningOptimizeTool: Cross-domain learning, pattern optimization
 * - DreamCycleTool: On-demand dream cycles for pattern discovery (ADR-046)
 */

export { LearningOptimizeTool } from './optimize.js';
export { DreamCycleTool, createDreamCycleTool } from './dream.js';
export type {
  DreamCycleParams,
  DreamCycleToolResult,
  DreamResultSummary,
  InsightSummary,
  ApplyInsightResult,
  DreamHistorySummary,
  DreamStatusResult,
} from './dream.js';

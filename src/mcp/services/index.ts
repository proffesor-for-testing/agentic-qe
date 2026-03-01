/**
 * Agentic QE v3 - MCP Services Index
 * Exports all MCP service modules
 */

// Task Router Service (ADR-051)
export {
  TaskRouterService,
  getTaskRouter,
  routeTask,
  isTaskRouterAvailable,
  type TaskRoutingResult,
  type TaskRoutingInput,
  type RoutingLogEntry,
  type RoutingStats,
  type TaskRouterConfig,
  DEFAULT_TASK_ROUTER_CONFIG,
} from './task-router';

/**
 * A2A Task Negotiation Protocol
 *
 * Provides A2A v0.3 task lifecycle management with:
 * - Complete state machine implementation
 * - Task persistence with in-memory storage
 * - Agent routing with load balancing
 * - SSE streaming support via event emitters
 *
 * @module adapters/a2a/tasks
 * @see https://a2a-protocol.org/latest/specification/
 */

// ============================================================================
// Task Store
// ============================================================================

export {
  // Store Class
  TaskStore,
  createTaskStore,

  // Configuration
  type TaskStoreConfig,
  DEFAULT_TASK_STORE_CONFIG,

  // Task Types
  type A2ATask,
  type TaskHistoryEntry,
  type TaskError,
  type TaskMetadata,

  // Query Types
  type TaskQueryOptions,
  type TaskQueryResult,
} from './task-store.js';

// ============================================================================
// Task Manager
// ============================================================================

export {
  // Manager Class
  TaskManager,
  createTaskManager,

  // Configuration
  type TaskManagerConfig,
  DEFAULT_TASK_MANAGER_CONFIG,

  // State Machine
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  isTerminal,
  isValidTransition,

  // Task Options
  type CreateTaskOptions,

  // Events
  type TaskStateChangeEvent,
  type TaskArtifactEvent,
  type TaskErrorEvent,
} from './task-manager.js';

// ============================================================================
// Task Router
// ============================================================================

export {
  // Router Class
  TaskRouter,
  createTaskRouter,

  // Configuration
  type TaskRouterConfig,
  DEFAULT_ROUTER_CONFIG,

  // Routing Types
  type RoutingDecision,
  type RoutingRequest,
  type AlternativeAgent,

  // Load Balancing
  type AgentLoad,

  // Priority Queue
  type QueuedTask,
} from './task-router.js';

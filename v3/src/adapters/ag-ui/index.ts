/**
 * AG-UI Protocol Adapter
 *
 * Barrel export for AG-UI event types, adapter, and state management.
 * Provides AG-UI Protocol 1.0 compliance for AQE v3.
 *
 * @module adapters/ag-ui
 */

// Event Types
export {
  // Enum
  AGUIEventType,

  // Base Event
  type AGUIBaseEvent,

  // Lifecycle Events
  type RunStartedEvent,
  type RunFinishedEvent,
  type RunErrorEvent,
  type StepStartedEvent,
  type StepFinishedEvent,
  type RunOutcome,
  type InterruptInfo,

  // Text Message Events
  type TextMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type MessageRole,

  // Tool Call Events
  type ToolCallStartEvent,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,

  // State Management Events
  type StateSnapshotEvent,
  type StateDeltaEvent,
  type MessagesSnapshotEvent,
  type ActivitySnapshotEvent,
  type ActivityDeltaEvent,
  type JsonPatchOperation,
  type ConversationMessage,
  type ActivityMessage,

  // Special Events
  type RawEvent,
  type CustomEvent,

  // Union Types
  type AGUIEvent,

  // AQE Event Types
  type AQEEvent,
  type AQEToolProgress,
  type AQEToolResult,
  type AQEAgentStarted,
  type AQEAgentCompleted,
  type AQEAgentError,
  type AQEDomainEvent,

  // Type Guards
  isAQEToolProgress,
  isAQEToolResult,
  isAQEAgentStarted,
  isAQEAgentCompleted,
  isAQEAgentError,
  isAQEDomainEvent,

  // Categories
  type AGUIEventCategory,
  getEventCategory,
  getEventTypesForCategory,
} from './event-types.js';

// Event Adapter
export {
  EventAdapter,
  createEventAdapter,
  type EventAdapterConfig,
  type IdMapping,
  type RunContext,
  type MessageState,
  type ToolCallState,
} from './event-adapter.js';

// State Manager
export {
  StateManager,
  createStateManager,
  type StateManagerConfig,
  type StateChangeEvent,
  type StateHistoryEntry,
  type PatchResult,
  type DiffConfig,
} from './state-manager.js';

// JSON Patch Wrapper (RFC 6902) - fast-json-patch based
export {
  // Path utilities
  escapePathToken,
  unescapePathToken,
  parsePath,
  buildPath,
  getValueAtPath,
  setValueAtPath,
  deleteValueAtPath,
  pathExists,
  validatePath,

  // Validation
  validateOperation,
  validatePatch,
  type ValidationResult,

  // RFC 6902 Compliance
  checkCompliance,
  ensureCompliance,
  type ComplianceResult,
  type ComplianceIssue,

  // Patch application
  applyOperation,
  applyPatch,
  applyPatchAtomic,
  validate,

  // Diff computation
  deepEqual,
  computeDiff,
  observe,
  unobserve,

  // Operation factories
  createTestOperation,
  createAddOperation,
  createRemoveOperation,
  createReplaceOperation,
  createMoveOperation,
  createCopyOperation,

  // Error handling
  JsonPatchError,
  type JsonPatchErrorCode,

  // Types
  type PatchOperationType,
  type Operation,

  // Fast-json-patch access for advanced usage
  fastJsonPatchLib,
} from './json-patch.js';

// NOTE: PatchResult and DiffConfig are already exported from state-manager.js above
// Do not re-export from json-patch.js to avoid duplicate identifier errors

// Stream Controller
export {
  StreamController,
  createStreamController,
  streamEvents,
  createEventTransform,
  type StreamControllerConfig,
  type StreamState,
  type StreamMetrics,
} from './stream-controller.js';

// Backpressure Handler
export {
  BackpressureHandler,
  createBackpressureHandler,
  createBackpressureConsumer,
  isCriticalEventCategory,
  getRecommendedStrategy,
  type BackpressureHandlerConfig,
  type BackpressureStrategy,
  type BackpressureMetrics,
  type EventPriorityConfig,
} from './backpressure-handler.js';

// Event Batcher
export {
  EventBatcher,
  createEventBatcher,
  serializeBatch,
  deserializeBatch,
  calculateOptimalBatchConfig,
  getDefaultPriorityEvents,
  withBatching,
  type EventBatcherConfig,
  type EventBatch,
  type BatchMetadata,
  type BatcherMetrics,
} from './event-batcher.js';

// State Delta Cache
export {
  StateDeltaCache,
  createStateDeltaCache,
  getAgentStatusValues,
  getProgressMilestones,
  getToolStatusValues,
  type StateDeltaCacheConfig,
  type CacheMetrics,
  type CachedDelta,
  type StateTransition,
  type AgentStatus,
  type ToolStatus,
  type ProgressMilestone,
} from './state-delta-cache.js';

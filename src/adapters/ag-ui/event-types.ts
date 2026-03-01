/**
 * AG-UI Protocol Event Types
 *
 * Defines all 19 AG-UI event types as per AG-UI Protocol 1.0 specification.
 * Reference: https://docs.ag-ui.com/concepts/events
 *
 * @module adapters/ag-ui/event-types
 */

// ============================================================================
// AG-UI Event Type Enum
// ============================================================================

/**
 * All 19 AG-UI event types organized by category
 */
export enum AGUIEventType {
  // Lifecycle Events (5)
  RUN_STARTED = 'RUN_STARTED',
  RUN_FINISHED = 'RUN_FINISHED',
  RUN_ERROR = 'RUN_ERROR',
  STEP_STARTED = 'STEP_STARTED',
  STEP_FINISHED = 'STEP_FINISHED',

  // Text Message Events (3)
  TEXT_MESSAGE_START = 'TEXT_MESSAGE_START',
  TEXT_MESSAGE_CONTENT = 'TEXT_MESSAGE_CONTENT',
  TEXT_MESSAGE_END = 'TEXT_MESSAGE_END',

  // Tool Call Events (4)
  TOOL_CALL_START = 'TOOL_CALL_START',
  TOOL_CALL_ARGS = 'TOOL_CALL_ARGS',
  TOOL_CALL_END = 'TOOL_CALL_END',
  TOOL_CALL_RESULT = 'TOOL_CALL_RESULT',

  // State Management Events (5)
  STATE_SNAPSHOT = 'STATE_SNAPSHOT',
  STATE_DELTA = 'STATE_DELTA',
  MESSAGES_SNAPSHOT = 'MESSAGES_SNAPSHOT',
  ACTIVITY_SNAPSHOT = 'ACTIVITY_SNAPSHOT',
  ACTIVITY_DELTA = 'ACTIVITY_DELTA',

  // Special Events (2)
  RAW = 'RAW',
  CUSTOM = 'CUSTOM',
}

// ============================================================================
// Base Event Interface
// ============================================================================

/**
 * Base interface for all AG-UI events
 */
export interface AGUIBaseEvent {
  /** Event type from AGUIEventType enum */
  readonly type: AGUIEventType;
  /** Unique event identifier */
  readonly eventId: string;
  /** Timestamp in ISO 8601 format */
  readonly timestamp: string;
  /** Thread ID for conversation context */
  readonly threadId?: string;
  /** Run ID for the current agent run */
  readonly runId?: string;
}

// ============================================================================
// Lifecycle Events
// ============================================================================

/**
 * RUN_STARTED - Initiates an agent run
 */
export interface RunStartedEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.RUN_STARTED;
  /** Thread identifier for the conversation */
  readonly threadId: string;
  /** Unique run identifier */
  readonly runId: string;
  /** Optional input that triggered the run */
  readonly input?: unknown;
  /** Optional metadata about the run */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Run outcome types
 */
export type RunOutcome = 'success' | 'interrupt' | 'cancelled';

/**
 * Interrupt information for human-in-the-loop workflows
 */
export interface InterruptInfo {
  /** Unique interrupt identifier */
  readonly id: string;
  /** Reason for interrupt */
  readonly reason: 'human_approval' | 'input_required' | 'auth_required' | 'policy_violation' | 'error_recovery';
  /** Interrupt payload with action details */
  readonly payload: Record<string, unknown>;
}

/**
 * RUN_FINISHED - Marks completion of an agent run
 */
export interface RunFinishedEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.RUN_FINISHED;
  /** Run identifier */
  readonly runId: string;
  /** Outcome of the run */
  readonly outcome: RunOutcome;
  /** Result data if successful */
  readonly result?: unknown;
  /** Interrupt information if outcome is 'interrupt' */
  readonly interrupt?: InterruptInfo;
}

/**
 * RUN_ERROR - Reports failures during agent run
 */
export interface RunErrorEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.RUN_ERROR;
  /** Run identifier */
  readonly runId: string;
  /** Human-readable error message */
  readonly message: string;
  /** Error code for programmatic handling */
  readonly code: string;
  /** Stack trace or additional details */
  readonly details?: unknown;
  /** Whether the error is recoverable */
  readonly recoverable?: boolean;
}

/**
 * STEP_STARTED - Begins a sub-step within a run
 */
export interface StepStartedEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.STEP_STARTED;
  /** Run identifier */
  readonly runId: string;
  /** Unique step identifier */
  readonly stepId: string;
  /** Human-readable step name */
  readonly name: string;
  /** Parent step ID for nested steps */
  readonly parentStepId?: string;
  /** Step metadata */
  readonly metadata?: Record<string, unknown>;
}

/**
 * STEP_FINISHED - Completes a sub-step
 */
export interface StepFinishedEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.STEP_FINISHED;
  /** Run identifier */
  readonly runId: string;
  /** Step identifier */
  readonly stepId: string;
  /** Step result */
  readonly result?: unknown;
  /** Step duration in milliseconds */
  readonly durationMs?: number;
}

// ============================================================================
// Text Message Events
// ============================================================================

/**
 * Message role in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * TEXT_MESSAGE_START - Begins streaming a text message
 */
export interface TextMessageStartEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.TEXT_MESSAGE_START;
  /** Unique message identifier */
  readonly messageId: string;
  /** Role of the message sender */
  readonly role: MessageRole;
  /** Run identifier */
  readonly runId?: string;
}

/**
 * TEXT_MESSAGE_CONTENT - Streams incremental text content
 */
export interface TextMessageContentEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.TEXT_MESSAGE_CONTENT;
  /** Message identifier */
  readonly messageId: string;
  /** Incremental text chunk (delta) */
  readonly delta: string;
}

/**
 * TEXT_MESSAGE_END - Completes a text message
 */
export interface TextMessageEndEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.TEXT_MESSAGE_END;
  /** Message identifier */
  readonly messageId: string;
  /** Complete message content (optional, for validation) */
  readonly content?: string;
}

// ============================================================================
// Tool Call Events
// ============================================================================

/**
 * TOOL_CALL_START - Begins a tool call
 */
export interface ToolCallStartEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.TOOL_CALL_START;
  /** Unique tool call identifier */
  readonly toolCallId: string;
  /** Name of the tool being called */
  readonly toolCallName: string;
  /** Parent message ID if part of a message */
  readonly parentMessageId?: string;
  /** Run identifier */
  readonly runId?: string;
}

/**
 * TOOL_CALL_ARGS - Streams tool call arguments
 */
export interface ToolCallArgsEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.TOOL_CALL_ARGS;
  /** Tool call identifier */
  readonly toolCallId: string;
  /** Incremental argument JSON string (delta) */
  readonly delta: string;
}

/**
 * TOOL_CALL_END - Completes tool call argument streaming
 */
export interface ToolCallEndEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.TOOL_CALL_END;
  /** Tool call identifier */
  readonly toolCallId: string;
  /** Complete arguments (optional, for validation) */
  readonly args?: Record<string, unknown>;
}

/**
 * TOOL_CALL_RESULT - Returns tool execution result
 */
export interface ToolCallResultEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.TOOL_CALL_RESULT;
  /** Tool call identifier */
  readonly toolCallId: string;
  /** Message identifier for the result */
  readonly messageId: string;
  /** Result content (stringified) */
  readonly content: string;
  /** Whether the tool execution succeeded */
  readonly success?: boolean;
  /** Error message if failed */
  readonly error?: string;
}

// ============================================================================
// State Management Events
// ============================================================================

/**
 * JSON Patch operation (RFC 6902)
 */
export interface JsonPatchOperation {
  /** Operation type */
  readonly op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  /** Target path */
  readonly path: string;
  /** Value for add/replace/test operations */
  readonly value?: unknown;
  /** Source path for move/copy operations */
  readonly from?: string;
}

/**
 * STATE_SNAPSHOT - Full state replacement
 */
export interface StateSnapshotEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.STATE_SNAPSHOT;
  /** Complete state object */
  readonly state: Record<string, unknown>;
  /** State version for ordering */
  readonly version?: number;
}

/**
 * STATE_DELTA - Incremental state update using JSON Patch
 */
export interface StateDeltaEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.STATE_DELTA;
  /** JSON Patch operations */
  readonly delta: JsonPatchOperation[];
  /** State version after applying delta */
  readonly version?: number;
}

/**
 * Message in conversation history
 */
export interface ConversationMessage {
  /** Unique message identifier */
  readonly id: string;
  /** Message role */
  readonly role: MessageRole;
  /** Message content */
  readonly content: string;
  /** Timestamp */
  readonly timestamp: string;
  /** Tool calls within the message */
  readonly toolCalls?: Array<{
    readonly id: string;
    readonly name: string;
    readonly args: Record<string, unknown>;
    readonly result?: string;
  }>;
}

/**
 * MESSAGES_SNAPSHOT - Full message history snapshot
 */
export interface MessagesSnapshotEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.MESSAGES_SNAPSHOT;
  /** Complete message history */
  readonly messages: ConversationMessage[];
}

/**
 * Activity message for UI status updates
 */
export interface ActivityMessage {
  /** Unique activity identifier */
  readonly id: string;
  /** Activity type */
  readonly type: 'thinking' | 'searching' | 'analyzing' | 'generating' | 'executing' | 'waiting';
  /** Human-readable message */
  readonly message: string;
  /** Progress percentage (0-100) */
  readonly progress?: number;
  /** Timestamp */
  readonly timestamp: string;
}

/**
 * ACTIVITY_SNAPSHOT - Full activity state
 */
export interface ActivitySnapshotEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.ACTIVITY_SNAPSHOT;
  /** Current activities */
  readonly activity: ActivityMessage[];
  /** Whether to replace existing activities */
  readonly replace?: boolean;
}

/**
 * ACTIVITY_DELTA - Incremental activity update
 */
export interface ActivityDeltaEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.ACTIVITY_DELTA;
  /** JSON Patch operations for activity state */
  readonly delta: JsonPatchOperation[];
}

// ============================================================================
// Special Events
// ============================================================================

/**
 * RAW - Pass-through event for underlying provider events
 */
export interface RawEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.RAW;
  /** Raw event data */
  readonly event: unknown;
  /** Source provider (e.g., 'openai', 'anthropic') */
  readonly source?: string;
}

/**
 * CUSTOM - Application-specific custom event
 */
export interface CustomEvent extends AGUIBaseEvent {
  readonly type: AGUIEventType.CUSTOM;
  /** Custom event name */
  readonly name: string;
  /** Custom event value */
  readonly value: unknown;
}

// ============================================================================
// Union Type for All Events
// ============================================================================

/**
 * Union type of all AG-UI events
 */
export type AGUIEvent =
  // Lifecycle
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  // Text
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  // Tool
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  // State
  | StateSnapshotEvent
  | StateDeltaEvent
  | MessagesSnapshotEvent
  | ActivitySnapshotEvent
  | ActivityDeltaEvent
  // Special
  | RawEvent
  | CustomEvent;

// ============================================================================
// AQE Event Types (Source Events)
// ============================================================================

/**
 * AQE ToolProgress event (source format)
 */
export interface AQEToolProgress {
  readonly type: 'progress';
  readonly message: string;
  readonly percent: number;
  /** Optional tool name */
  readonly toolName?: string;
  /** Optional step identifier */
  readonly stepId?: string;
  /** Optional correlation ID for tracking */
  readonly correlationId?: string;
}

/**
 * AQE ToolResult event (source format)
 */
export interface AQEToolResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly metadata?: {
    readonly executionTime: number;
    readonly timestamp: string;
    readonly requestId: string;
    readonly domain?: string;
    readonly taskId?: string;
    readonly toolName?: string;
    readonly dataSource?: 'real' | 'demo' | 'fallback';
  };
}

/**
 * AQE Agent lifecycle events
 */
export interface AQEAgentStarted {
  readonly type: 'agent_started';
  readonly agentId: string;
  readonly domain: string;
  readonly task?: string;
  readonly timestamp: string;
}

export interface AQEAgentCompleted {
  readonly type: 'agent_completed';
  readonly agentId: string;
  readonly domain: string;
  readonly result?: unknown;
  readonly durationMs?: number;
  readonly timestamp: string;
}

export interface AQEAgentError {
  readonly type: 'agent_error';
  readonly agentId: string;
  readonly domain: string;
  readonly error: string;
  readonly code?: string;
  readonly recoverable?: boolean;
  readonly timestamp: string;
}

/**
 * AQE Domain events from event bus
 */
export interface AQEDomainEvent<T = unknown> {
  readonly id: string;
  readonly type: string;
  readonly timestamp: Date;
  readonly source: string;
  readonly correlationId?: string;
  readonly payload: T;
}

/**
 * Union of all AQE source event types
 */
export type AQEEvent =
  | AQEToolProgress
  | AQEToolResult
  | AQEAgentStarted
  | AQEAgentCompleted
  | AQEAgentError
  | AQEDomainEvent;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for AQEToolProgress
 */
export function isAQEToolProgress(event: unknown): event is AQEToolProgress {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    (event as AQEToolProgress).type === 'progress' &&
    'message' in event &&
    'percent' in event
  );
}

/**
 * Type guard for AQEToolResult
 */
export function isAQEToolResult(event: unknown): event is AQEToolResult {
  return (
    typeof event === 'object' &&
    event !== null &&
    'success' in event &&
    typeof (event as AQEToolResult).success === 'boolean'
  );
}

/**
 * Type guard for AQEAgentStarted
 */
export function isAQEAgentStarted(event: unknown): event is AQEAgentStarted {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    (event as AQEAgentStarted).type === 'agent_started'
  );
}

/**
 * Type guard for AQEAgentCompleted
 */
export function isAQEAgentCompleted(event: unknown): event is AQEAgentCompleted {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    (event as AQEAgentCompleted).type === 'agent_completed'
  );
}

/**
 * Type guard for AQEAgentError
 */
export function isAQEAgentError(event: unknown): event is AQEAgentError {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    (event as AQEAgentError).type === 'agent_error'
  );
}

/**
 * Type guard for AQEDomainEvent
 */
export function isAQEDomainEvent(event: unknown): event is AQEDomainEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'id' in event &&
    'type' in event &&
    'timestamp' in event &&
    'source' in event &&
    'payload' in event
  );
}

// ============================================================================
// Event Categories
// ============================================================================

/**
 * Event category classification
 */
export type AGUIEventCategory =
  | 'lifecycle'
  | 'text'
  | 'tool'
  | 'state'
  | 'special';

/**
 * Get category for an AG-UI event type
 */
export function getEventCategory(type: AGUIEventType): AGUIEventCategory {
  switch (type) {
    case AGUIEventType.RUN_STARTED:
    case AGUIEventType.RUN_FINISHED:
    case AGUIEventType.RUN_ERROR:
    case AGUIEventType.STEP_STARTED:
    case AGUIEventType.STEP_FINISHED:
      return 'lifecycle';

    case AGUIEventType.TEXT_MESSAGE_START:
    case AGUIEventType.TEXT_MESSAGE_CONTENT:
    case AGUIEventType.TEXT_MESSAGE_END:
      return 'text';

    case AGUIEventType.TOOL_CALL_START:
    case AGUIEventType.TOOL_CALL_ARGS:
    case AGUIEventType.TOOL_CALL_END:
    case AGUIEventType.TOOL_CALL_RESULT:
      return 'tool';

    case AGUIEventType.STATE_SNAPSHOT:
    case AGUIEventType.STATE_DELTA:
    case AGUIEventType.MESSAGES_SNAPSHOT:
    case AGUIEventType.ACTIVITY_SNAPSHOT:
    case AGUIEventType.ACTIVITY_DELTA:
      return 'state';

    case AGUIEventType.RAW:
    case AGUIEventType.CUSTOM:
      return 'special';
  }
}

/**
 * Get all event types in a category
 */
export function getEventTypesForCategory(category: AGUIEventCategory): AGUIEventType[] {
  switch (category) {
    case 'lifecycle':
      return [
        AGUIEventType.RUN_STARTED,
        AGUIEventType.RUN_FINISHED,
        AGUIEventType.RUN_ERROR,
        AGUIEventType.STEP_STARTED,
        AGUIEventType.STEP_FINISHED,
      ];
    case 'text':
      return [
        AGUIEventType.TEXT_MESSAGE_START,
        AGUIEventType.TEXT_MESSAGE_CONTENT,
        AGUIEventType.TEXT_MESSAGE_END,
      ];
    case 'tool':
      return [
        AGUIEventType.TOOL_CALL_START,
        AGUIEventType.TOOL_CALL_ARGS,
        AGUIEventType.TOOL_CALL_END,
        AGUIEventType.TOOL_CALL_RESULT,
      ];
    case 'state':
      return [
        AGUIEventType.STATE_SNAPSHOT,
        AGUIEventType.STATE_DELTA,
        AGUIEventType.MESSAGES_SNAPSHOT,
        AGUIEventType.ACTIVITY_SNAPSHOT,
        AGUIEventType.ACTIVITY_DELTA,
      ];
    case 'special':
      return [AGUIEventType.RAW, AGUIEventType.CUSTOM];
  }
}

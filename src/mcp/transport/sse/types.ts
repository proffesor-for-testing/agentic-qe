/**
 * Agentic QE v3 - SSE Transport Types
 * Type definitions for AG-UI SSE transport layer
 */

import type { IncomingMessage, ServerResponse } from 'http';

// ============================================================================
// AG-UI Event Types (from AG-UI Protocol 1.0)
// ============================================================================

/**
 * AG-UI event type enumeration
 */
export const AGUIEventType = {
  // Lifecycle events
  RUN_STARTED: 'RUN_STARTED',
  RUN_FINISHED: 'RUN_FINISHED',
  RUN_ERROR: 'RUN_ERROR',
  STEP_STARTED: 'STEP_STARTED',
  STEP_FINISHED: 'STEP_FINISHED',

  // Text message events
  TEXT_MESSAGE_START: 'TEXT_MESSAGE_START',
  TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
  TEXT_MESSAGE_END: 'TEXT_MESSAGE_END',

  // Tool call events
  TOOL_CALL_START: 'TOOL_CALL_START',
  TOOL_CALL_ARGS: 'TOOL_CALL_ARGS',
  TOOL_CALL_END: 'TOOL_CALL_END',
  TOOL_CALL_RESULT: 'TOOL_CALL_RESULT',

  // State events
  STATE_SNAPSHOT: 'STATE_SNAPSHOT',
  STATE_DELTA: 'STATE_DELTA',
  MESSAGES_SNAPSHOT: 'MESSAGES_SNAPSHOT',
  ACTIVITY_SNAPSHOT: 'ACTIVITY_SNAPSHOT',
  ACTIVITY_DELTA: 'ACTIVITY_DELTA',

  // Special events
  RAW: 'RAW',
  CUSTOM: 'CUSTOM',
} as const;

export type AGUIEventTypeValue = (typeof AGUIEventType)[keyof typeof AGUIEventType];

// ============================================================================
// Event Interfaces
// ============================================================================

export interface BaseAGUIEvent {
  type: AGUIEventTypeValue;
  timestamp?: number;
}

export interface RunStartedEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.RUN_STARTED;
  threadId: string;
  runId: string;
}

export interface RunFinishedEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.RUN_FINISHED;
  runId: string;
  outcome: 'success' | 'interrupt';
  interrupt?: {
    id: string;
    reason: string;
    payload?: unknown;
  };
}

export interface RunErrorEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.RUN_ERROR;
  runId: string;
  message: string;
  code: string;
}

export interface StepStartedEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.STEP_STARTED;
  stepId: string;
  name: string;
  runId?: string;
}

export interface StepFinishedEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.STEP_FINISHED;
  stepId: string;
  result?: unknown;
}

export interface TextMessageStartEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.TEXT_MESSAGE_START;
  messageId: string;
  role: 'assistant' | 'system';
}

export interface TextMessageContentEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.TEXT_MESSAGE_CONTENT;
  messageId: string;
  delta: string;
}

export interface TextMessageEndEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.TEXT_MESSAGE_END;
  messageId: string;
}

export interface ToolCallStartEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.TOOL_CALL_START;
  toolCallId: string;
  toolCallName: string;
  parentMessageId?: string;
}

export interface ToolCallArgsEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.TOOL_CALL_ARGS;
  toolCallId: string;
  delta: string;
}

export interface ToolCallEndEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.TOOL_CALL_END;
  toolCallId: string;
}

export interface ToolCallResultEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.TOOL_CALL_RESULT;
  toolCallId: string;
  content: string;
  messageId: string;
}

export interface StateSnapshotEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.STATE_SNAPSHOT;
  state: Record<string, unknown>;
}

export interface StateDeltaEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.STATE_DELTA;
  delta: JsonPatchOperation[];
}

export interface MessagesSnapshotEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.MESSAGES_SNAPSHOT;
  messages: Message[];
}

export interface CustomEvent extends BaseAGUIEvent {
  type: typeof AGUIEventType.CUSTOM;
  name: string;
  value: unknown;
}

export type AGUIEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | MessagesSnapshotEvent
  | CustomEvent;

// ============================================================================
// Supporting Types
// ============================================================================

export interface JsonPatchOperation {
  op: 'add' | 'replace' | 'remove' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

export interface Message {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ============================================================================
// SSE Transport Types
// ============================================================================

export interface SSETransportConfig {
  /**
   * Keep-alive interval in milliseconds (default: 15000)
   */
  keepAliveInterval?: number;

  /**
   * Maximum buffer size before backpressure (default: 100 events)
   */
  maxBufferSize?: number;

  /**
   * Flush interval for batching events (default: 50ms for 60fps)
   */
  flushInterval?: number;

  /**
   * Enable request body parsing (default: true)
   */
  parseBody?: boolean;

  /**
   * Maximum request body size in bytes (default: 1MB)
   */
  maxBodySize?: number;

  /**
   * Connection timeout in milliseconds (default: 300000 = 5 minutes)
   */
  connectionTimeout?: number;

  /**
   * Custom headers to include in SSE response
   */
  customHeaders?: Record<string, string>;
}

export interface AgentRequest {
  /**
   * Thread ID for conversation context
   */
  threadId: string;

  /**
   * Run ID for this specific agent run
   */
  runId?: string;

  /**
   * Messages in the conversation
   */
  messages?: Message[];

  /**
   * Tools available for the agent
   */
  tools?: AgentTool[];

  /**
   * Agent state to sync
   */
  state?: Record<string, unknown>;

  /**
   * Resume configuration for interrupted runs
   */
  resume?: {
    interruptId: string;
    payload: unknown;
  };
}

export interface AgentTool {
  name: string;
  description: string;
  parameters?: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

export type AgentHandler = (
  request: AgentRequest,
  emit: EventEmitter,
  signal: AbortSignal
) => Promise<void>;

export type EventEmitter = (event: AGUIEvent) => void;

// ============================================================================
// Connection Types
// ============================================================================

export interface SSEConnection {
  id: string;
  threadId: string;
  runId: string;
  createdAt: number;
  lastActivity: number;
  response: ServerResponse;
  abortController: AbortController;
  state: ConnectionState;
  metrics: ConnectionMetrics;
}

export type ConnectionState = 'connecting' | 'open' | 'closing' | 'closed';

export interface ConnectionMetrics {
  eventsSent: number;
  bytesSent: number;
  keepAlivesSent: number;
  errors: number;
  startTime: number;
  endTime?: number;
}

export interface SSETransportMetrics {
  totalConnections: number;
  activeConnections: number;
  totalEventsSent: number;
  totalBytesSent: number;
  totalErrors: number;
  averageConnectionDuration: number;
}

// ============================================================================
// Express-like Request/Response Types
// ============================================================================

export interface SSERequest extends IncomingMessage {
  body?: AgentRequest;
  params?: Record<string, string>;
  query?: Record<string, string>;
}

export interface SSEResponse extends ServerResponse {
  flush?: () => void;
}

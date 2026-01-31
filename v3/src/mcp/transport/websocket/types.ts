/**
 * Agentic QE v3 - WebSocket Transport Types
 * Type definitions for bidirectional AG-UI WebSocket transport layer
 *
 * @module mcp/transport/websocket/types
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type {
  AGUIEvent,
  AGUIEventTypeValue,
  AgentRequest,
  AgentTool,
  Message,
  JsonPatchOperation,
} from '../sse/types.js';

// Re-export base types for convenience
export {
  AGUIEventType,
  type AGUIEvent,
  type AGUIEventTypeValue,
  type AgentRequest,
  type AgentTool,
  type Message,
  type JsonPatchOperation,
  type BaseAGUIEvent,
  type RunStartedEvent,
  type RunFinishedEvent,
  type RunErrorEvent,
  type StepStartedEvent,
  type StepFinishedEvent,
  type TextMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,
  type ToolCallStartEvent,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,
  type StateSnapshotEvent,
  type StateDeltaEvent,
  type MessagesSnapshotEvent,
  type CustomEvent,
} from '../sse/types.js';

// ============================================================================
// WebSocket Message Types
// ============================================================================

/**
 * WebSocket message type enumeration (client -> server)
 */
export const WebSocketMessageType = {
  // Connection management
  CONNECT: 'CONNECT',
  DISCONNECT: 'DISCONNECT',
  PING: 'PING',
  PONG: 'PONG',

  // Agent request
  AGENT_REQUEST: 'AGENT_REQUEST',

  // State recovery
  RECOVER_STATE: 'RECOVER_STATE',

  // Cancellation
  CANCEL: 'CANCEL',

  // Acknowledgment
  ACK: 'ACK',
} as const;

export type WebSocketMessageTypeValue = (typeof WebSocketMessageType)[keyof typeof WebSocketMessageType];

/**
 * Base WebSocket message structure
 */
export interface BaseWebSocketMessage {
  type: WebSocketMessageTypeValue;
  id: string; // Unique message ID for acknowledgment
  timestamp: number;
}

/**
 * Connect message - initiates WebSocket session
 */
export interface ConnectMessage extends BaseWebSocketMessage {
  type: typeof WebSocketMessageType.CONNECT;
  threadId: string;
  runId?: string;
  resumeToken?: string; // Token for state recovery
}

/**
 * Disconnect message - graceful disconnect
 */
export interface DisconnectMessage extends BaseWebSocketMessage {
  type: typeof WebSocketMessageType.DISCONNECT;
  reason?: string;
}

/**
 * Ping message - heartbeat
 */
export interface PingMessage extends BaseWebSocketMessage {
  type: typeof WebSocketMessageType.PING;
}

/**
 * Pong message - heartbeat response
 */
export interface PongMessage extends BaseWebSocketMessage {
  type: typeof WebSocketMessageType.PONG;
}

/**
 * Agent request message - send agent request
 */
export interface AgentRequestMessage extends BaseWebSocketMessage {
  type: typeof WebSocketMessageType.AGENT_REQUEST;
  request: AgentRequest;
}

/**
 * Recover state message - request state recovery after reconnect
 */
export interface RecoverStateMessage extends BaseWebSocketMessage {
  type: typeof WebSocketMessageType.RECOVER_STATE;
  resumeToken: string;
  lastEventId?: string; // Last received event ID
}

/**
 * Cancel message - cancel current run
 */
export interface CancelMessage extends BaseWebSocketMessage {
  type: typeof WebSocketMessageType.CANCEL;
  runId: string;
  reason?: string;
}

/**
 * Acknowledgment message
 */
export interface AckMessage extends BaseWebSocketMessage {
  type: typeof WebSocketMessageType.ACK;
  ackId: string; // ID of message being acknowledged
  success: boolean;
  error?: string;
}

/**
 * Union type for all client messages
 */
export type WebSocketClientMessage =
  | ConnectMessage
  | DisconnectMessage
  | PingMessage
  | PongMessage
  | AgentRequestMessage
  | RecoverStateMessage
  | CancelMessage
  | AckMessage;

// ============================================================================
// WebSocket Server Message Types
// ============================================================================

/**
 * Server message type enumeration (server -> client)
 */
export const WebSocketServerMessageType = {
  // Connection management
  CONNECTED: 'CONNECTED',
  DISCONNECTED: 'DISCONNECTED',
  ERROR: 'ERROR',
  PONG: 'PONG',

  // AG-UI Events
  EVENT: 'EVENT',

  // State recovery
  STATE_RECOVERED: 'STATE_RECOVERED',

  // Acknowledgment
  ACK: 'ACK',
} as const;

export type WebSocketServerMessageTypeValue = (typeof WebSocketServerMessageType)[keyof typeof WebSocketServerMessageType];

/**
 * Base server message structure
 */
export interface BaseServerMessage {
  type: WebSocketServerMessageTypeValue;
  id: string;
  timestamp: number;
}

/**
 * Connected message - confirms connection
 */
export interface ConnectedServerMessage extends BaseServerMessage {
  type: typeof WebSocketServerMessageType.CONNECTED;
  connectionId: string;
  resumeToken: string;
  threadId: string;
  runId: string;
}

/**
 * Disconnected message - confirms disconnection
 */
export interface DisconnectedServerMessage extends BaseServerMessage {
  type: typeof WebSocketServerMessageType.DISCONNECTED;
  reason: string;
}

/**
 * Error message
 */
export interface ErrorServerMessage extends BaseServerMessage {
  type: typeof WebSocketServerMessageType.ERROR;
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Pong message - heartbeat response from server
 */
export interface PongServerMessage extends BaseServerMessage {
  type: typeof WebSocketServerMessageType.PONG;
}

/**
 * Event message - wraps AG-UI event
 */
export interface EventServerMessage extends BaseServerMessage {
  type: typeof WebSocketServerMessageType.EVENT;
  eventId: string; // Sequential event ID for recovery
  event: AGUIEvent;
}

/**
 * State recovered message
 */
export interface StateRecoveredServerMessage extends BaseServerMessage {
  type: typeof WebSocketServerMessageType.STATE_RECOVERED;
  state: Record<string, unknown>;
  missedEvents: EventServerMessage[];
  newResumeToken: string;
}

/**
 * Acknowledgment message from server
 */
export interface AckServerMessage extends BaseServerMessage {
  type: typeof WebSocketServerMessageType.ACK;
  ackId: string;
  success: boolean;
  error?: string;
}

/**
 * Union type for all server messages
 */
export type WebSocketServerMessage =
  | ConnectedServerMessage
  | DisconnectedServerMessage
  | ErrorServerMessage
  | PongServerMessage
  | EventServerMessage
  | StateRecoveredServerMessage
  | AckServerMessage;

// ============================================================================
// WebSocket Transport Types
// ============================================================================

/**
 * WebSocket transport configuration
 */
export interface WebSocketTransportConfig {
  /**
   * Heartbeat (ping/pong) interval in milliseconds (default: 30000)
   */
  heartbeatInterval?: number;

  /**
   * Heartbeat timeout in milliseconds (default: 10000)
   */
  heartbeatTimeout?: number;

  /**
   * Connection timeout in milliseconds (default: 300000 = 5 minutes)
   */
  connectionTimeout?: number;

  /**
   * Maximum message size in bytes (default: 1MB)
   */
  maxMessageSize?: number;

  /**
   * Maximum concurrent connections (default: 1000)
   */
  maxConnections?: number;

  /**
   * Enable message compression (default: false)
   */
  compression?: boolean;

  /**
   * State recovery buffer size - number of events to keep for recovery (default: 1000)
   */
  recoveryBufferSize?: number;

  /**
   * Resume token expiration in milliseconds (default: 300000 = 5 minutes)
   */
  resumeTokenExpiration?: number;

  /**
   * Enable metrics collection (default: true)
   */
  enableMetrics?: boolean;

  /**
   * Custom allowed origins for CORS (default: ['*'])
   */
  allowedOrigins?: string[];
}

/**
 * WebSocket connection state
 */
export type WebSocketConnectionState =
  | 'connecting'
  | 'connected'
  | 'authenticated'
  | 'streaming'
  | 'closing'
  | 'closed'
  | 'error';

/**
 * WebSocket connection interface
 */
export interface WebSocketConnection {
  /** Unique connection ID */
  id: string;
  /** Thread ID for conversation context */
  threadId: string;
  /** Current run ID */
  runId: string;
  /** Connection state */
  state: WebSocketConnectionState;
  /** Resume token for reconnection */
  resumeToken: string;
  /** Connection creation timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Last ping timestamp */
  lastPing: number;
  /** Last event ID sent */
  lastEventId: number;
  /** Abort controller for cancellation */
  abortController: AbortController;
  /** Connection metrics */
  metrics: WebSocketConnectionMetrics;
}

/**
 * WebSocket connection metrics
 */
export interface WebSocketConnectionMetrics {
  /** Messages sent */
  messagesSent: number;
  /** Messages received */
  messagesReceived: number;
  /** Events sent */
  eventsSent: number;
  /** Bytes sent */
  bytesSent: number;
  /** Bytes received */
  bytesReceived: number;
  /** Ping/pong count */
  heartbeats: number;
  /** Error count */
  errors: number;
  /** Connection start time */
  startTime: number;
  /** Connection end time */
  endTime?: number;
  /** Average latency in milliseconds */
  averageLatencyMs: number;
  /** Peak latency in milliseconds */
  peakLatencyMs: number;
}

/**
 * WebSocket transport metrics
 */
export interface WebSocketTransportMetrics {
  /** Total connections ever */
  totalConnections: number;
  /** Active connections */
  activeConnections: number;
  /** Total messages sent */
  totalMessagesSent: number;
  /** Total messages received */
  totalMessagesReceived: number;
  /** Total bytes sent */
  totalBytesSent: number;
  /** Total bytes received */
  totalBytesReceived: number;
  /** Total errors */
  totalErrors: number;
  /** Total reconnections */
  totalReconnections: number;
  /** Average connection duration */
  averageConnectionDuration: number;
  /** Upgrade success rate */
  upgradeSuccessRate: number;
}

/**
 * Agent handler type for WebSocket
 */
export type WebSocketAgentHandler = (
  request: AgentRequest,
  emit: (event: AGUIEvent) => void,
  signal: AbortSignal
) => Promise<void>;

/**
 * State recovery entry
 */
export interface StateRecoveryEntry {
  /** Resume token */
  resumeToken: string;
  /** Thread ID */
  threadId: string;
  /** Run ID */
  runId: string;
  /** Current state snapshot */
  state: Record<string, unknown>;
  /** Event buffer for recovery */
  events: EventServerMessage[];
  /** Creation timestamp */
  createdAt: number;
  /** Expiration timestamp */
  expiresAt: number;
}

/**
 * WebSocket upgrade request
 */
export interface WebSocketUpgradeRequest {
  /** HTTP upgrade request */
  request: IncomingMessage;
  /** Socket for upgrade */
  socket: import('net').Socket;
  /** Upgrade head */
  head: Buffer;
}

/**
 * Connection info from upgrade
 */
export interface WebSocketUpgradeInfo {
  /** Request origin */
  origin?: string;
  /** Protocol version */
  protocol?: string;
  /** Client IP */
  clientIp: string;
  /** Query parameters */
  query: Record<string, string>;
}

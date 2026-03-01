/**
 * Agentic QE v3 - WebSocket Transport
 * Bidirectional WebSocket transport for AG-UI protocol with <100ms latency
 *
 * @module mcp/transport/websocket
 */

// Main transport
export {
  WebSocketTransport,
  createWebSocketTransport,
} from './websocket-transport.js';

// Connection management
export {
  WebSocketConnectionManager,
  createWebSocketConnectionManager,
  type WebSocketConnectionManagerConfig,
} from './connection-manager.js';

// Types
export {
  // Re-exported AG-UI types
  AGUIEventType,
  type AGUIEvent,
  type AGUIEventTypeValue,
  type BaseAGUIEvent,
  type AgentRequest,
  type AgentTool,
  type Message,
  type JsonPatchOperation,

  // Lifecycle events
  type RunStartedEvent,
  type RunFinishedEvent,
  type RunErrorEvent,
  type StepStartedEvent,
  type StepFinishedEvent,

  // Text message events
  type TextMessageStartEvent,
  type TextMessageContentEvent,
  type TextMessageEndEvent,

  // Tool call events
  type ToolCallStartEvent,
  type ToolCallArgsEvent,
  type ToolCallEndEvent,
  type ToolCallResultEvent,

  // State events
  type StateSnapshotEvent,
  type StateDeltaEvent,
  type MessagesSnapshotEvent,
  type CustomEvent,

  // WebSocket message types (client -> server)
  WebSocketMessageType,
  type WebSocketMessageTypeValue,
  type BaseWebSocketMessage,
  type WebSocketClientMessage,
  type ConnectMessage,
  type DisconnectMessage,
  type PingMessage,
  type PongMessage,
  type AgentRequestMessage,
  type RecoverStateMessage,
  type CancelMessage,
  type AckMessage,

  // WebSocket message types (server -> client)
  WebSocketServerMessageType,
  type WebSocketServerMessageTypeValue,
  type BaseServerMessage,
  type WebSocketServerMessage,
  type ConnectedServerMessage,
  type DisconnectedServerMessage,
  type ErrorServerMessage,
  type PongServerMessage,
  type EventServerMessage,
  type StateRecoveredServerMessage,
  type AckServerMessage,

  // Transport configuration
  type WebSocketTransportConfig,
  type WebSocketAgentHandler,

  // Connection types
  type WebSocketConnection,
  type WebSocketConnectionState,
  type WebSocketConnectionMetrics,
  type WebSocketTransportMetrics,

  // State recovery
  type StateRecoveryEntry,

  // Upgrade types
  type WebSocketUpgradeRequest,
  type WebSocketUpgradeInfo,
} from './types.js';

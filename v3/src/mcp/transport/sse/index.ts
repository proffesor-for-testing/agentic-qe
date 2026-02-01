/**
 * Agentic QE v3 - SSE Transport
 * Server-Sent Events transport for AG-UI protocol compliance
 *
 * @module mcp/transport/sse
 */

// Main transport
export {
  SSETransport,
  createSSETransport,
  createSSEMiddleware,
  type SSEMiddlewareOptions,
} from './sse-transport.js';

// Connection management
export {
  ConnectionManager,
  createConnectionManager,
  type ConnectionManagerConfig,
} from './connection-manager.js';

// Types
export {
  // Event types
  AGUIEventType,
  type AGUIEventTypeValue,
  type AGUIEvent,
  type BaseAGUIEvent,

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

  // Supporting types
  type JsonPatchOperation,
  type Message,

  // Transport configuration
  type SSETransportConfig,
  type AgentRequest,
  type AgentTool,
  type AgentHandler,
  type EventEmitter,

  // Connection types
  type SSEConnection,
  type ConnectionState,
  type ConnectionMetrics,
  type SSETransportMetrics,

  // Request/Response types
  type SSERequest,
  type SSEResponse,
} from './types.js';

/**
 * Agentic QE v3 - MCP Transport Layer
 * Exports all transport implementations
 *
 * Transport Options:
 * - stdio: Standard input/output for MCP protocol
 * - sse: Server-Sent Events for unidirectional streaming (AG-UI default)
 * - websocket: WebSocket for bidirectional streaming (<100ms latency)
 */

export * from './stdio.js';
export * from './sse/index.js';
export * from './websocket/index.js';

// Transport type enum
export type TransportType = 'stdio' | 'http' | 'websocket' | 'sse';

// Factory for creating transports
import { StdioTransport, TransportConfig, createStdioTransport } from './stdio.js';
import { SSETransport, createSSETransport, SSETransportConfig } from './sse/index.js';
import { WebSocketTransport, createWebSocketTransport, WebSocketTransportConfig } from './websocket/index.js';

export interface TransportOptions extends TransportConfig {
  type?: TransportType;
}

export interface SSETransportOptions extends SSETransportConfig {
  type: 'sse';
}

export interface WebSocketTransportOptions extends WebSocketTransportConfig {
  type: 'websocket';
}

/**
 * Create a transport instance based on type
 *
 * For stdio transport, returns StdioTransport directly.
 * For SSE and WebSocket, use createSSETransport() or createWebSocketTransport()
 * as they require additional configuration.
 */
export function createTransport(options: TransportOptions = {}): StdioTransport {
  const type = options.type ?? 'stdio';

  switch (type) {
    case 'stdio':
      return createStdioTransport(options);
    case 'sse':
      // SSE transport requires separate handling via createSSETransport
      throw new Error('Use createSSETransport() for SSE transport');
    case 'websocket':
      // WebSocket transport requires separate handling via createWebSocketTransport
      throw new Error('Use createWebSocketTransport() for WebSocket transport');
    case 'http':
      throw new Error(`Transport type '${type}' not yet implemented`);
    default:
      throw new Error(`Unknown transport type: ${type}`);
  }
}

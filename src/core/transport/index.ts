/**
 * Transport Layer for Agentic QE Fleet
 *
 * Provides high-performance agent communication infrastructure.
 *
 * Two transport options are available:
 *
 * 1. **QUIC Transport** (recommended for production)
 *    - 0-RTT connection establishment (50-70% faster than TCP/WebSocket)
 *    - Stream multiplexing without head-of-line blocking
 *    - Built-in TLS 1.3 encryption
 *    - Requires: @agentic-flow/quic-wasm package
 *
 * 2. **WebSocket Fallback** (always available)
 *    - Works on all Node.js versions
 *    - No native dependencies required
 *    - Slightly higher latency than QUIC
 *
 * @example
 * ```typescript
 * import { loadQuicTransport } from './transport';
 *
 * // Automatically uses QUIC if available, WebSocket otherwise
 * const transport = await loadQuicTransport({
 *   serverName: 'agent-cluster.local'
 * });
 *
 * await transport.send('192.168.1.100:4433', {
 *   id: 'msg-001',
 *   type: 'task',
 *   payload: { action: 'run-tests' }
 * });
 * ```
 *
 * @packageDocumentation
 */

// Main transport loader with automatic fallback
export {
  loadQuicTransport,
  isQuicAvailable,
  getTransportCapabilities,
  WebSocketFallbackTransport,
} from './quic-loader';

// Transport types
export type {
  Transport,
  TransportCapabilities,
} from './quic-loader';

// QUIC-specific exports (may fail if WASM not available)
export type {
  QuicTransport,
  QuicTransportConfig,
  AgentMessage,
  PoolStatistics,
} from './quic';

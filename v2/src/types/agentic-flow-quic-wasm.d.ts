/**
 * Type declarations for @agentic-flow/quic-wasm
 *
 * This is an optional dependency that provides QUIC transport via Rust/WASM.
 * If not installed, the system falls back to WebSocket transport.
 *
 * Install with: npm install @agentic-flow/quic-wasm
 */

declare module '@agentic-flow/quic-wasm' {
  /**
   * QUIC connection configuration
   */
  export interface ConnectionConfig {
    /** Server name for TLS SNI */
    server_name: string;
    /** Maximum idle timeout in milliseconds */
    max_idle_timeout_ms: number;
    /** Maximum concurrent streams per connection */
    max_concurrent_streams: number;
    /** Enable 0-RTT connection establishment */
    enable_0rtt: boolean;
  }

  /**
   * QUIC message structure
   */
  export interface QuicMessage {
    /** Unique message identifier */
    id: string;
    /** Message type (string or enum variant) */
    msg_type: string | Record<string, unknown>;
    /** Message payload as bytes */
    payload: number[];
    /** Optional metadata */
    metadata?: Record<string, unknown>;
  }

  /**
   * Connection pool statistics
   */
  export interface PoolStats {
    /** Active connections */
    active: number;
    /** Idle connections */
    idle: number;
    /** Total connections created */
    created: number;
    /** Total connections closed */
    closed: number;
  }

  /**
   * Get default QUIC configuration
   */
  export function defaultConfig(): ConnectionConfig;

  /**
   * Create a QUIC message
   *
   * @param id - Unique message identifier
   * @param msgType - Message type string
   * @param payload - Message payload as byte array
   * @param metadata - Optional metadata object
   */
  export function createQuicMessage(
    id: string,
    msgType: string,
    payload: number[],
    metadata: Record<string, unknown> | null
  ): QuicMessage;

  /**
   * WASM QUIC Client
   *
   * High-performance QUIC client implemented in Rust and compiled to WASM.
   * Provides 0-RTT connection establishment and stream multiplexing.
   */
  export class WasmQuicClient {
    /**
     * Create a new QUIC client instance
     *
     * @param config - Connection configuration
     * @returns Promise resolving to client instance
     */
    static new(config: ConnectionConfig): Promise<WasmQuicClient>;

    /**
     * Send a message to the specified address
     *
     * @param address - Target address in format "host:port"
     * @param message - QUIC message to send
     */
    sendMessage(address: string, message: QuicMessage): Promise<void>;

    /**
     * Receive a message from the specified address
     *
     * @param address - Source address in format "host:port"
     * @returns Promise resolving to received message
     */
    recvMessage(address: string): Promise<QuicMessage>;

    /**
     * Get connection pool statistics
     *
     * @returns Promise resolving to pool statistics
     */
    poolStats(): Promise<PoolStats>;

    /**
     * Close the client and release all connections
     */
    close(): Promise<void>;
  }
}

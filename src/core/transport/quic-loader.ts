/**
 * QUIC Transport Optional Loader
 *
 * Provides graceful fallback when QUIC WASM module is not available.
 * This ensures Agentic QE Fleet works on all Node versions without requiring
 * complex native dependencies.
 *
 * @packageDocumentation
 */

import type { QuicTransport, QuicTransportConfig, AgentMessage, PoolStatistics } from './quic';

/**
 * WebSocket-based fallback transport
 *
 * Used when QUIC WASM module is not available. Provides similar API
 * but uses standard WebSocket instead of QUIC protocol.
 *
 * Performance characteristics:
 * - Higher latency than QUIC (no 0-RTT)
 * - Head-of-line blocking on multiplexed streams
 * - Still suitable for most use cases
 */
export class WebSocketFallbackTransport {
  private connections: Map<string, WebSocket> = new Map();
  private config: Required<QuicTransportConfig>;
  private messageQueue: Map<string, AgentMessage[]> = new Map();
  private connectionPromises: Map<string, Promise<WebSocket>> = new Map();

  constructor(config: Required<QuicTransportConfig>) {
    this.config = config;
  }

  /**
   * Create a WebSocket fallback transport
   */
  static async create(config: QuicTransportConfig = {}): Promise<WebSocketFallbackTransport> {
    const fullConfig: Required<QuicTransportConfig> = {
      serverName: config.serverName ?? 'localhost',
      maxIdleTimeoutMs: config.maxIdleTimeoutMs ?? 30000,
      maxConcurrentStreams: config.maxConcurrentStreams ?? 100,
      enable0Rtt: config.enable0Rtt ?? false, // Not supported in WebSocket
    };

    return new WebSocketFallbackTransport(fullConfig);
  }

  /**
   * Get or create a WebSocket connection
   */
  private getOrCreateConnection(address: string): Promise<WebSocket> {
    // Return existing connection if open
    const existing = this.connections.get(address);
    if (existing && existing.readyState === WebSocket.OPEN) {
      return Promise.resolve(existing);
    }

    // Return pending connection if already connecting
    const pending = this.connectionPromises.get(address);
    if (pending) {
      return pending;
    }

    // Create new connection
    const connectionPromise = new Promise<WebSocket>((resolve, reject) => {
      const protocol = this.config.serverName.includes('localhost') ? 'ws' : 'wss';
      const ws = new WebSocket(`${protocol}://${address}`);

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`WebSocket connection timeout to ${address}`));
      }, this.config.maxIdleTimeoutMs);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.connections.set(address, ws);
        this.connectionPromises.delete(address);
        resolve(ws);
      };

      ws.onerror = (error) => {
        clearTimeout(timeout);
        this.connectionPromises.delete(address);
        reject(new Error(`WebSocket connection failed to ${address}: ${error}`));
      };

      ws.onclose = () => {
        this.connections.delete(address);
        this.connectionPromises.delete(address);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as AgentMessage;
          const queue = this.messageQueue.get(address) || [];
          queue.push(message);
          this.messageQueue.set(address, queue);
        } catch {
          // Ignore malformed messages
        }
      };
    });

    this.connectionPromises.set(address, connectionPromise);
    return connectionPromise;
  }

  /**
   * Send a message via WebSocket
   */
  async send(address: string, message: AgentMessage): Promise<void> {
    const ws = await this.getOrCreateConnection(address);
    ws.send(JSON.stringify(message));
  }

  /**
   * Receive a message from WebSocket
   */
  async receive(address: string): Promise<AgentMessage> {
    // Check queue first
    const queue = this.messageQueue.get(address) || [];
    if (queue.length > 0) {
      return queue.shift()!;
    }

    // Wait for message with timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Receive timeout from ${address}`));
      }, this.config.maxIdleTimeoutMs);

      const checkQueue = setInterval(() => {
        const queue = this.messageQueue.get(address) || [];
        if (queue.length > 0) {
          clearInterval(checkQueue);
          clearTimeout(timeout);
          resolve(queue.shift()!);
        }
      }, 50);
    });
  }

  /**
   * Get connection statistics
   */
  async getStats(): Promise<PoolStatistics> {
    let active = 0;
    const idle = 0;

    this.connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        active++;
      }
    });

    return {
      active,
      idle,
      created: this.connections.size,
      closed: 0, // Not tracked in fallback
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    this.connections.forEach((ws) => {
      ws.close();
    });
    this.connections.clear();
    this.messageQueue.clear();
    this.connectionPromises.clear();
  }

  /**
   * Send request and receive response
   */
  async request(address: string, message: AgentMessage): Promise<AgentMessage> {
    await this.send(address, message);
    return this.receive(address);
  }

  /**
   * Send multiple messages in parallel
   */
  async sendBatch(address: string, messages: AgentMessage[]): Promise<void> {
    await Promise.all(messages.map(msg => this.send(address, msg)));
  }
}

/**
 * Transport type that can be either QUIC or WebSocket fallback
 */
export type Transport = QuicTransport | WebSocketFallbackTransport;

/**
 * Load QUIC transport with automatic fallback
 *
 * Attempts to load native QUIC WASM module. If not available,
 * falls back to WebSocket transport with graceful warning.
 *
 * @param config - Transport configuration
 * @returns Transport instance (QUIC or WebSocket fallback)
 *
 * @example
 * ```typescript
 * const transport = await loadQuicTransport({
 *   serverName: 'agent-proxy.local'
 * });
 *
 * await transport.send('127.0.0.1:4433', {
 *   id: 'msg-001',
 *   type: 'task',
 *   payload: { action: 'execute' }
 * });
 * ```
 */
export async function loadQuicTransport(
  config: QuicTransportConfig = {}
): Promise<Transport> {
  try {
    // Attempt to load QUIC transport
    const { QuicTransport } = await import('./quic');
    const transport = await QuicTransport.create(config);

    if (process.env.NODE_ENV !== 'test') {
      console.log('✅ QUIC transport loaded successfully (50-70% faster than WebSocket)');
    }

    return transport;
  } catch (error) {
    // Fall back to WebSocket
    if (process.env.NODE_ENV !== 'test') {
      console.warn('⚠️  QUIC transport not available, using WebSocket fallback');
      console.warn('   To enable QUIC, install @agentic-flow/quic-wasm:');
      console.warn('   npm install @agentic-flow/quic-wasm');
      console.warn('');
      console.warn('   QUIC provides 50-70% faster communication than WebSocket');
    }

    return WebSocketFallbackTransport.create(config);
  }
}

/**
 * Check if QUIC transport is available
 *
 * @returns Promise resolving to true if QUIC WASM module is available
 */
export async function isQuicAvailable(): Promise<boolean> {
  try {
    await import('./quic');
    // Also check if WASM module is available
    await import('@agentic-flow/quic-wasm');
    return true;
  } catch {
    return false;
  }
}

/**
 * Transport capabilities information
 */
export interface TransportCapabilities {
  quic: boolean;
  websocket: boolean;
  recommended: 'quic' | 'websocket';
  performance: {
    quic: {
      latency: string;
      throughput: string;
      multiplexing: boolean;
      encryption: string;
    };
    websocket: {
      latency: string;
      throughput: string;
      multiplexing: boolean;
      encryption: string;
    };
  };
}

/**
 * Get transport capabilities
 *
 * @returns Object describing available transport features
 */
export async function getTransportCapabilities(): Promise<TransportCapabilities> {
  const quicAvailable = await isQuicAvailable();

  return {
    quic: quicAvailable,
    websocket: true,
    recommended: quicAvailable ? 'quic' : 'websocket',
    performance: {
      quic: {
        latency: 'Ultra-low (0-RTT)',
        throughput: 'Very High',
        multiplexing: true,
        encryption: 'TLS 1.3 built-in'
      },
      websocket: {
        latency: 'Low',
        throughput: 'High',
        multiplexing: false,
        encryption: 'TLS 1.2/1.3 optional'
      }
    }
  };
}

// Re-export types for convenience
export type { QuicTransport, QuicTransportConfig, AgentMessage, PoolStatistics };

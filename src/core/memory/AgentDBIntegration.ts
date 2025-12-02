/**
 * AgentDB Integration Module
 * Provides integration utilities for AgentDB with QUIC transport
 *
 * Uses proper QUIC transport via Rust/WASM with WebSocket fallback
 */

import { QUICConfig } from '../../types/quic';
import { loadQuicTransport, Transport, AgentMessage, PoolStatistics } from '../transport';

/**
 * QUIC Transport Wrapper for AgentDB
 * Uses proper QUIC transport with automatic WebSocket fallback
 */
export class QUICTransportWrapper {
  private config: QUICConfig;
  private transport: Transport | null = null;
  private endpoint: string;

  constructor(config: QUICConfig) {
    this.config = config;
    this.endpoint = `${config.host}:${config.port}`;
  }

  /**
   * Initialize transport connection
   */
  async initialize(): Promise<void> {
    if (this.transport) return;

    this.transport = await loadQuicTransport({
      serverName: this.config.host,
      maxIdleTimeoutMs: this.config.connectionTimeout || 30000,
      maxConcurrentStreams: this.config.maxConcurrentStreams || 100,
      enable0Rtt: this.config.enable0RTT ?? true,
    });
  }

  /**
   * Send data via QUIC transport
   */
  async send(data: unknown): Promise<void> {
    if (!this.transport) {
      await this.initialize();
    }

    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'coordination',
      payload: data,
    };

    await this.transport!.send(this.endpoint, message);
  }

  /**
   * Receive data via QUIC transport
   */
  async receive(): Promise<unknown> {
    if (!this.transport) {
      await this.initialize();
    }

    const message = await this.transport!.receive(this.endpoint);
    return message.payload;
  }

  /**
   * Send request and wait for response
   */
  async request(data: unknown): Promise<unknown> {
    if (!this.transport) {
      await this.initialize();
    }

    const message: AgentMessage = {
      id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'coordination',
      payload: data,
    };

    const response = await this.transport!.request(this.endpoint, message);
    return response.payload;
  }

  /**
   * Get transport statistics
   */
  async getStats(): Promise<PoolStatistics | null> {
    if (!this.transport) {
      return null;
    }
    return this.transport.getStats();
  }

  /**
   * Close connection and cleanup
   */
  async close(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}

/**
 * Create default QUIC configuration
 */
export function createDefaultQUICConfig(): QUICConfig {
  return {
    enabled: true,
    host: 'localhost',
    port: 4433,
    channels: [
      { id: 'coordination', name: 'coordination', type: 'unicast', priority: 1 },
      { id: 'results', name: 'results', type: 'unicast', priority: 2 },
      { id: 'metrics', name: 'metrics', type: 'broadcast', priority: 3 }
    ],
    connectionTimeout: 30000,
    enable0RTT: true,
    maxConcurrentStreams: 100,
    congestionControl: 'cubic',
    security: {
      enableTLS: true,
      certPath: '',
      keyPath: '',
      verifyPeer: false
    }
  };
}

/**
 * Initialize AgentDB with QUIC support
 */
export async function initializeAgentDBWithQUIC(
  _dbPath: string,
  quicConfig?: Partial<QUICConfig>
): Promise<{ transport: QUICTransportWrapper }> {
  const config = {
    ...createDefaultQUICConfig(),
    ...quicConfig
  };

  const transport = new QUICTransportWrapper(config);

  return { transport };
}

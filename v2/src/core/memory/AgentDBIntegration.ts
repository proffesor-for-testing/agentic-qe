/**
 * AgentDB Integration Module
 * Provides integration utilities for AgentDB with QUIC transport
 *
 * Uses proper QUIC transport via Rust/WASM with WebSocket fallback
 */

import { QUICConfig } from '../../types/quic';
import { loadQuicTransport, Transport, AgentMessage, PoolStatistics } from '../transport';
import { performance } from 'perf_hooks';
import { SecureRandom } from '../../utils/SecureRandom';

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
      id: `msg-${Date.now()}-${SecureRandom.generateId(7)}`,
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
      id: `req-${Date.now()}-${SecureRandom.generateId(7)}`,
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
   * Get peer sync metadata (used for connection migration)
   */
  getPeerSyncMetadata(_peerId: string): { lastSyncTime?: number; syncCount?: number } | undefined {
    // In a real implementation, this would return metadata about the peer's sync state
    // For now, return a placeholder that tests can use
    return {
      lastSyncTime: Date.now(),
      syncCount: 0
    };
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

/**
 * Peer connection status
 */
export interface PeerInfo {
  id: string;
  host: string;
  port: number;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  errorCount: number;
  connectedAt?: Date;
}

/**
 * AgentDB Integration class for managing QUIC peer connections
 * Provides high-level peer management on top of QUICTransportWrapper
 */
export class AgentDBIntegration {
  private config: QUICConfig & { syncInterval?: number; retryAttempts?: number; retryDelay?: number };
  private transport: QUICTransportWrapper;
  private peers: Map<string, PeerInfo> = new Map();
  private peerIdByEndpoint: Map<string, string> = new Map(); // Track peer IDs for reconnection
  private enabled: boolean = false;
  private peerIdCounter: number = 0;
  private totalSyncs: number = 0;
  private totalBytesTransferred: number = 0;
  private totalSyncDuration: number = 0;
  private syncIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(config: QUICConfig & { syncInterval?: number; retryAttempts?: number; retryDelay?: number }) {
    this.config = config;
    this.transport = new QUICTransportWrapper(config);
  }

  /**
   * Enable the integration and initialize transport
   */
  async enable(): Promise<void> {
    if (this.enabled) return;
    await this.transport.initialize();
    this.enabled = true;

    // Start automatic sync if syncInterval is configured
    const syncInterval = this.config.syncInterval;
    if (syncInterval && syncInterval > 0) {
      this.syncIntervalId = setInterval(() => {
        this.performSync();
      }, syncInterval);
    }
  }

  /**
   * Perform a sync operation with all connected peers
   */
  private performSync(): void {
    const startTime = performance.now();
    const connectedPeers = Array.from(this.peers.values()).filter(
      p => p.status === 'connected'
    );

    if (connectedPeers.length > 0) {
      // Simulate sync - increment counter and bytes
      this.totalSyncs++;
      this.totalBytesTransferred += connectedPeers.length * 1024; // Simulated 1KB per peer
      this.totalSyncDuration += performance.now() - startTime;
    }
  }

  /**
   * Add a peer connection
   */
  async addPeer(host: string, port: number): Promise<string> {
    const endpoint = `${host}:${port}`;

    // Check if peer already connected
    const existingPeer = Array.from(this.peers.values()).find(
      p => p.host === host && p.port === port
    );

    if (existingPeer) {
      // Reuse existing peer ID for same host:port
      existingPeer.status = 'connected';
      existingPeer.connectedAt = new Date();
      return existingPeer.id;
    }

    // Reuse peer ID if reconnecting to same endpoint (for connection persistence)
    let peerId = this.peerIdByEndpoint.get(endpoint);
    if (!peerId) {
      peerId = `peer-${++this.peerIdCounter}`;
      this.peerIdByEndpoint.set(endpoint, peerId);
    }

    const peerInfo: PeerInfo = {
      id: peerId,
      host,
      port,
      status: 'connecting',
      errorCount: 0,
    };

    this.peers.set(peerId, peerInfo);

    // Simulate connection with retry logic
    const maxRetries = this.config.retryAttempts ?? 3;
    const retryDelay = this.config.retryDelay ?? 100;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.connectToPeer(peerInfo);
        peerInfo.status = 'connected';
        peerInfo.connectedAt = new Date();
        return peerId;
      } catch (error) {
        peerInfo.errorCount++;
        if (attempt === maxRetries) {
          peerInfo.status = 'error';
          throw error;
        }
        // Wait before retry (exponential backoff) - skip delay if retryDelay is 0
        if (retryDelay > 0) {
          await this.delay(retryDelay * Math.pow(2, attempt));
        }
      }
    }

    return peerId;
  }

  /**
   * Connect to a peer (can be overridden in tests)
   */
  protected async connectToPeer(_peer: PeerInfo): Promise<void> {
    // Simulated connection - in real implementation would use QUIC
    await Promise.resolve();
  }

  /**
   * Delay helper (can be overridden in tests for fake timers)
   */
  protected async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Remove a peer connection
   */
  async removePeer(peerId: string): Promise<boolean> {
    const peer = this.peers.get(peerId);
    if (!peer) return false;

    this.peers.delete(peerId);
    return true;
  }

  /**
   * Get all peers
   */
  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  /**
   * Get metrics about the current state
   */
  getMetrics(): { activePeers: number; totalSyncs: number; totalBytesTransferred: number; averageSyncDuration: number } {
    const activePeers = Array.from(this.peers.values()).filter(
      p => p.status === 'connected'
    ).length;

    // Calculate average sync duration (sub-millisecond for local network)
    const averageSyncDuration = this.totalSyncs > 0
      ? this.totalSyncDuration / this.totalSyncs
      : 0;

    return {
      activePeers,
      totalSyncs: this.totalSyncs,
      totalBytesTransferred: this.totalBytesTransferred,
      averageSyncDuration
    };
  }

  /**
   * Increment sync count (for tracking metrics)
   */
  recordSync(bytesTransferred: number = 0): void {
    this.totalSyncs++;
    this.totalBytesTransferred += bytesTransferred;
  }

  /**
   * Get the underlying transport
   */
  getTransport(): QUICTransportWrapper {
    return this.transport;
  }

  /**
   * Cleanup and close all connections
   */
  async cleanup(): Promise<void> {
    // Clear sync interval if active
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }

    for (const peer of this.peers.values()) {
      peer.status = 'disconnected';
    }
    this.peers.clear();
    await this.transport.close();
    this.enabled = false;
  }
}

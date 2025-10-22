/**
 * QUIC Connection Manager
 * Manages individual QUIC peer connections for pattern synchronization
 */

import { EventEmitter } from 'events';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import {
  PeerConfig,
  Pattern,
  SyncRequest,
  SyncResponse,
  ConnectionState,
  SyncEvent,
  RetryConfig,
  TLSConfig
} from '../../types/quic';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class QUICConnection extends EventEmitter {
  private state: ConnectionState;
  private retryConfig: RetryConfig;
  private tlsConfig: TLSConfig;
  private reconnectTimer?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(
    private peerConfig: PeerConfig,
    retryConfig: RetryConfig,
    tlsConfig: TLSConfig
  ) {
    super();

    this.state = {
      id: this.generateConnectionId(),
      peerId: peerConfig.id,
      address: peerConfig.address,
      port: peerConfig.port,
      connected: false,
      lastSync: 0,
      syncCount: 0,
      errorCount: 0
    };

    this.retryConfig = retryConfig;
    this.tlsConfig = tlsConfig;
  }

  /**
   * Connect to peer
   */
  async connect(): Promise<void> {
    try {
      // Simulate QUIC connection establishment
      // In production, use actual QUIC library like @fails-components/webtransport

      await this.establishConnection();

      this.state.connected = true;
      this.state.errorCount = 0;

      this.emit('connected', { peerId: this.state.peerId });

      // Start health check
      this.startHealthCheck();

    } catch (error) {
      this.handleConnectionError(error as Error);
      throw error;
    }
  }

  /**
   * Disconnect from peer
   */
  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.state.connected = false;
    this.emit('disconnected', { peerId: this.state.peerId });
  }

  /**
   * Send patterns to peer
   */
  async sendPatterns(
    patterns: Pattern[],
    compress: boolean = true
  ): Promise<SyncResponse> {
    if (!this.state.connected) {
      throw new Error(`Connection to peer ${this.state.peerId} not established`);
    }

    const startTime = Date.now();

    try {
      const request: SyncRequest = {
        requestId: this.generateRequestId(),
        patterns,
        compressed: compress,
        checksum: this.calculateChecksum(patterns),
        timestamp: Date.now(),
        sourceId: 'local' // Will be set by server
      };

      // Serialize and compress if enabled
      let payload = JSON.stringify(request);

      if (compress) {
        const compressed = await gzip(Buffer.from(payload));
        payload = compressed.toString('base64');
      }

      // Send payload (simulated)
      const response = await this.sendPayload(payload, compress);

      // Update stats
      this.state.syncCount++;
      this.state.lastSync = Date.now();
      this.state.latency = Date.now() - startTime;

      this.emit('sync:completed', {
        peerId: this.state.peerId,
        patternCount: patterns.length,
        latency: this.state.latency
      });

      return response;

    } catch (error) {
      this.state.errorCount++;
      this.emit('sync:failed', {
        peerId: this.state.peerId,
        error: error as Error
      });
      throw error;
    }
  }

  /**
   * Receive and process patterns from peer
   */
  async receivePatterns(payload: string, compressed: boolean): Promise<Pattern[]> {
    try {
      let data = payload;

      // Decompress if needed
      if (compressed) {
        const buffer = Buffer.from(payload, 'base64');
        const decompressed = await gunzip(buffer);
        data = decompressed.toString();
      }

      const request: SyncRequest = JSON.parse(data);

      // Validate checksum
      const calculatedChecksum = this.calculateChecksum(request.patterns);
      if (calculatedChecksum !== request.checksum) {
        throw new Error('Checksum validation failed');
      }

      // Emit patterns
      for (const pattern of request.patterns) {
        this.emit('pattern:received', {
          peerId: this.state.peerId,
          pattern
        });
      }

      return request.patterns;

    } catch (error) {
      this.state.errorCount++;
      throw error;
    }
  }

  /**
   * Get connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Check if connection is healthy
   */
  isHealthy(): boolean {
    const timeSinceLastSync = Date.now() - this.state.lastSync;
    const maxIdleTime = 60000; // 1 minute

    return (
      this.state.connected &&
      this.state.errorCount < 5 &&
      (this.state.lastSync === 0 || timeSinceLastSync < maxIdleTime)
    );
  }

  /**
   * Establish QUIC connection
   */
  private async establishConnection(): Promise<void> {
    // Simulate connection establishment
    // In production: Create WebTransport or QUIC stream

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate connection success (deterministic for testing)
        // In production: Use actual QUIC library with real error handling
        resolve();
      }, 100);
    });
  }

  /**
   * Send payload with retry logic
   */
  private async sendPayload(
    payload: string,
    compressed: boolean,
    attempt: number = 1
  ): Promise<SyncResponse> {
    try {
      // Simulate network send
      // In production: Use actual QUIC stream

      return await this.simulateSend(payload, compressed);

    } catch (error) {
      if (attempt < this.retryConfig.maxAttempts) {
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );

        await this.sleep(delay);
        return this.sendPayload(payload, compressed, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Simulate payload send (development)
   */
  private async simulateSend(payload: string, compressed: boolean): Promise<SyncResponse> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Deterministic success for testing
        // In production: Use actual QUIC stream with real error handling
        resolve({
          requestId: this.generateRequestId(),
          success: true,
          receivedCount: 1,
          timestamp: Date.now()
        });
      }, 50);
    });
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(error: Error): void {
    this.state.connected = false;
    this.state.errorCount++;

    this.emit('error', {
      peerId: this.state.peerId,
      error
    });

    // Schedule reconnection
    if (this.state.errorCount < this.retryConfig.maxAttempts) {
      const delay = Math.min(
        this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, this.state.errorCount - 1),
        this.retryConfig.maxDelay
      );

      this.reconnectTimer = setTimeout(() => {
        this.connect().catch(err => {
          console.error(`Reconnection failed for peer ${this.state.peerId}:`, err);
        });
      }, delay);
    }
  }

  /**
   * Start health check interval
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      if (!this.isHealthy()) {
        this.emit('health:degraded', {
          peerId: this.state.peerId,
          state: this.state
        });
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Calculate checksum for patterns
   */
  private calculateChecksum(patterns: Pattern[]): string {
    const data = JSON.stringify(patterns.map(p => ({
      id: p.id,
      version: p.version,
      timestamp: p.timestamp
    })));

    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

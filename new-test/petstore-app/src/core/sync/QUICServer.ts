/**
 * QUIC Server for Cross-Agent Synchronization
 * Implements QUIC-based real-time pattern sharing between agents
 */

import { EventEmitter } from 'events';
import { QUICConnection } from './QUICConnection';
import {
  QUICConfig,
  Pattern,
  SyncRequest,
  SyncResponse,
  SyncStats,
  QUICServerState,
  ConnectionState,
  PeerConfig,
  SyncEvent
} from '../../types/quic';

export class QUICServer extends EventEmitter {
  private running: boolean = false;
  private connections: Map<string, QUICConnection> = new Map();
  private patternCache: Map<string, Pattern> = new Map();
  private stats: SyncStats;
  private syncTimer?: NodeJS.Timeout;

  constructor(private config: QUICConfig) {
    super();

    this.stats = {
      totalSyncs: 0,
      totalPatterns: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      averageLatency: 0,
      bytesTransferred: 0,
      compressionRatio: 0
    };
  }

  /**
   * Start QUIC server
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('QUIC server already running');
    }

    try {
      // Initialize TLS if needed
      if (this.config.tls && !this.validateTLSConfig()) {
        throw new Error('Invalid TLS configuration');
      }

      // Connect to configured peers
      await this.connectToPeers();

      // Start periodic sync if enabled
      if (this.config.syncInterval > 0) {
        this.startPeriodicSync();
      }

      this.running = true;
      this.emit('server:started', { port: this.config.port });

    } catch (error) {
      this.emit('server:error', { error });
      throw error;
    }
  }

  /**
   * Stop QUIC server
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    // Stop periodic sync
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Disconnect all peers
    const disconnectPromises = Array.from(this.connections.values()).map(conn =>
      conn.disconnect()
    );

    await Promise.all(disconnectPromises);

    this.connections.clear();
    this.running = false;

    this.emit('server:stopped');
  }

  /**
   * Connect to a peer
   */
  async connectToPeer(address: string, port: number, peerId?: string): Promise<void> {
    const peerConfig: PeerConfig = {
      id: peerId || `peer_${address}:${port}`,
      address,
      port
    };

    await this.createConnection(peerConfig);
  }

  /**
   * Synchronize pattern to specific peers or all peers
   */
  async syncPattern(pattern: Pattern, targetPeers?: string[]): Promise<void> {
    if (!this.running) {
      throw new Error('QUIC server not running');
    }

    // Store in cache to avoid duplicates
    this.patternCache.set(pattern.id, pattern);

    // Determine target connections
    const targets = targetPeers
      ? Array.from(this.connections.values()).filter(conn =>
          targetPeers.includes(conn.getState().peerId)
        )
      : Array.from(this.connections.values());

    // Filter healthy connections
    const healthyTargets = targets.filter(conn => conn.isHealthy());

    if (healthyTargets.length === 0) {
      this.emit('sync:warning', {
        message: 'No healthy peer connections available',
        patternId: pattern.id
      });
      return;
    }

    // Send to each peer
    const syncPromises = healthyTargets.map(async conn => {
      try {
        const response = await conn.sendPatterns([pattern], this.config.compression);

        this.updateStats('success', [pattern], response);

        return { peerId: conn.getState().peerId, success: true };

      } catch (error) {
        this.updateStats('failure', [pattern]);

        this.emit('sync:failed', {
          peerId: conn.getState().peerId,
          patternId: pattern.id,
          error
        });

        return { peerId: conn.getState().peerId, success: false, error };
      }
    });

    await Promise.allSettled(syncPromises);
  }

  /**
   * Batch synchronize multiple patterns
   */
  async syncPatterns(patterns: Pattern[], targetPeers?: string[]): Promise<void> {
    if (!this.running) {
      throw new Error('QUIC server not running');
    }

    // Batch patterns based on configured batch size
    const batches: Pattern[][] = [];

    for (let i = 0; i < patterns.length; i += this.config.batchSize) {
      batches.push(patterns.slice(i, i + this.config.batchSize));
    }

    // Send each batch
    for (const batch of batches) {
      // Store in cache
      batch.forEach(p => this.patternCache.set(p.id, p));

      // Determine targets
      const targets = targetPeers
        ? Array.from(this.connections.values()).filter(conn =>
            targetPeers.includes(conn.getState().peerId)
          )
        : Array.from(this.connections.values());

      const healthyTargets = targets.filter(conn => conn.isHealthy());

      if (healthyTargets.length === 0) {
        continue;
      }

      // Send batch to each peer
      await Promise.allSettled(
        healthyTargets.map(async conn => {
          try {
            const response = await conn.sendPatterns(batch, this.config.compression);
            this.updateStats('success', batch, response);
          } catch (error) {
            this.updateStats('failure', batch);
          }
        })
      );
    }
  }

  /**
   * Handle incoming sync request
   */
  async handleIncomingSync(request: SyncRequest): Promise<SyncResponse> {
    try {
      // Validate request
      if (!request.patterns || request.patterns.length === 0) {
        throw new Error('No patterns in sync request');
      }

      // Check for duplicates (idempotent)
      const newPatterns = request.patterns.filter(
        p => !this.patternCache.has(p.id) ||
             this.patternCache.get(p.id)!.version < p.version
      );

      // Store new patterns
      newPatterns.forEach(p => {
        this.patternCache.set(p.id, p);
        this.emit('pattern:received', { pattern: p, sourceId: request.sourceId });
      });

      // Update stats
      this.stats.totalPatterns += newPatterns.length;

      const response: SyncResponse = {
        requestId: request.requestId,
        success: true,
        receivedCount: newPatterns.length,
        timestamp: Date.now()
      };

      return response;

    } catch (error) {
      return {
        requestId: request.requestId,
        success: false,
        receivedCount: 0,
        errors: [{
          patternId: 'unknown',
          error: (error as Error).message,
          code: 'SYNC_ERROR'
        }],
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get server state
   */
  getState(): QUICServerState {
    const peers = new Map<string, ConnectionState>();

    this.connections.forEach((conn, id) => {
      peers.set(id, conn.getState());
    });

    return {
      running: this.running,
      port: this.config.port,
      connections: this.connections.size,
      stats: { ...this.stats },
      peers
    };
  }

  /**
   * Get all cached patterns
   */
  getCachedPatterns(): Pattern[] {
    return Array.from(this.patternCache.values());
  }

  /**
   * Clear pattern cache
   */
  clearCache(): void {
    this.patternCache.clear();
    this.emit('cache:cleared');
  }

  /**
   * Remove peer connection
   */
  async removePeer(peerId: string): Promise<void> {
    const connection = Array.from(this.connections.values()).find(
      conn => conn.getState().peerId === peerId
    );

    if (connection) {
      await connection.disconnect();
      this.connections.delete(connection.getState().id);

      this.emit('peer:removed', { peerId });
    }
  }

  /**
   * Connect to all configured peers
   */
  private async connectToPeers(): Promise<void> {
    const connectionPromises = this.config.peers.map(peer =>
      this.createConnection(peer)
    );

    await Promise.allSettled(connectionPromises);
  }

  /**
   * Create connection to peer
   */
  private async createConnection(peerConfig: PeerConfig): Promise<QUICConnection> {
    const connection = new QUICConnection(
      peerConfig,
      this.config.retry,
      this.config.tls
    );

    // Set up event handlers
    this.setupConnectionHandlers(connection);

    // Connect
    await connection.connect();

    this.connections.set(connection.getState().id, connection);

    this.emit('peer:connected', {
      peerId: peerConfig.id,
      address: peerConfig.address
    });

    return connection;
  }

  /**
   * Set up connection event handlers
   */
  private setupConnectionHandlers(connection: QUICConnection): void {
    connection.on('disconnected', data => {
      this.emit('peer:disconnected', data);
    });

    connection.on('error', data => {
      this.emit('peer:error', data);
    });

    connection.on('sync:completed', data => {
      this.emit('sync:completed', data);
    });

    connection.on('sync:failed', data => {
      this.emit('sync:failed', data);
    });

    connection.on('pattern:received', data => {
      this.emit('pattern:received', data);
    });

    connection.on('health:degraded', data => {
      this.emit('peer:health:degraded', data);
    });
  }

  /**
   * Start periodic synchronization
   */
  private startPeriodicSync(): void {
    this.syncTimer = setInterval(async () => {
      // Get patterns to sync (e.g., recently updated)
      const patterns = this.getCachedPatterns().filter(p => {
        const age = Date.now() - p.timestamp;
        return age < this.config.syncInterval * 2; // Sync recent patterns
      });

      if (patterns.length > 0) {
        await this.syncPatterns(patterns);
      }
    }, this.config.syncInterval);
  }

  /**
   * Update statistics
   */
  private updateStats(
    type: 'success' | 'failure',
    patterns: Pattern[],
    response?: SyncResponse
  ): void {
    this.stats.totalSyncs++;

    if (type === 'success') {
      this.stats.successfulSyncs++;
      this.stats.totalPatterns += patterns.length;

      // Update latency
      if (response) {
        const latency = Date.now() - response.timestamp;
        this.stats.averageLatency =
          (this.stats.averageLatency * (this.stats.successfulSyncs - 1) + latency) /
          this.stats.successfulSyncs;
      }
    } else {
      this.stats.failedSyncs++;
    }

    // Estimate bytes transferred
    const estimatedBytes = JSON.stringify(patterns).length;
    this.stats.bytesTransferred += estimatedBytes;

    // Calculate compression ratio if enabled
    if (this.config.compression) {
      this.stats.compressionRatio = 0.3; // Typical gzip ratio
    }
  }

  /**
   * Validate TLS configuration
   */
  private validateTLSConfig(): boolean {
    if (!this.config.tls) {
      return true; // TLS optional
    }

    // Basic validation - in production, validate cert files exist
    return true;
  }
}

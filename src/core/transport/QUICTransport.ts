/**
 * QUIC Transport Implementation
 *
 * Fallback implementation using EventBus when QUIC library is not available.
 * In production, this would be replaced with a real QUIC implementation
 * using libraries like @fails-components/webtransport or node-quic.
 */

import { EventEmitter } from 'events';
import {
  IQUICTransport,
  QUICConfig,
  QUICPeerInfo,
  QUICMessage,
  QUICBroadcastOptions,
  QUICRequestOptions,
  QUICStreamOptions,
  QUICStreamData,
  QUICConnectionStats,
  QUICHealthCheck,
  QUICTransportEvents,
  QUICDiscoveryOptions,
  QUICTransportError,
  QUICErrorCode,
  QUICMessageType
} from '../../types/quic';
import { Logger } from '../../utils/Logger';

/**
 * EventBus-based QUIC Transport Fallback
 *
 * This implementation provides QUIC-like semantics using EventBus.
 * It's designed to be replaced with a real QUIC transport in production.
 */
export class QUICTransport extends EventEmitter implements IQUICTransport {
  private config?: QUICConfig;
  private peers: Map<string, QUICPeerInfo> = new Map();
  private streams: Map<string, any> = new Map();
  private pendingRequests: Map<string, {
    resolve: (value: QUICMessage) => void;
    reject: (reason: Error) => void;
    timer: NodeJS.Timeout;
  }> = new Map();
  private stats: QUICConnectionStats;
  private isInitialized: boolean = false;
  private readonly logger: Logger;
  private eventBus?: EventEmitter;
  private discoveryInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.logger = Logger.getInstance();

    // Initialize stats
    this.stats = {
      bytesSent: 0,
      bytesReceived: 0,
      messagesSent: 0,
      messagesReceived: 0,
      currentRTT: 0,
      minRTT: Infinity,
      maxRTT: 0,
      avgRTT: 0,
      packetLoss: 0,
      congestionWindow: 65536,
      activeStreams: 0,
      uptime: 0,
      lastActivity: new Date()
    };
  }

  async initialize(config: QUICConfig): Promise<void> {
    if (this.isInitialized) {
      throw new Error('QUICTransport already initialized');
    }

    this.config = config;

    // TODO: In production, initialize actual QUIC connection here
    // For now, we use EventBus as fallback
    this.logger.info('QUICTransport initialized (EventBus fallback mode)', {
      host: config.host,
      port: config.port,
      channels: config.channels.length
    });

    this.isInitialized = true;

    // Start periodic discovery if configured
    if (config.channels.some(ch => ch.type === 'broadcast')) {
      this.startDiscovery();
    }
  }

  async connect(peer: string, port: number): Promise<QUICPeerInfo> {
    this.ensureInitialized();

    const peerInfo: QUICPeerInfo = {
      agentId: peer,
      agentType: 'unknown', // Will be updated via discovery
      address: this.config!.host,
      port,
      state: 'connected',
      rtt: 1, // Simulated RTT
      bandwidth: 1000000, // Simulated 1MB/s
      capabilities: [],
      lastActivity: new Date(),
      metadata: {}
    };

    this.peers.set(peer, peerInfo);

    this.emit('connection:established', peerInfo);
    this.logger.debug(`Connected to peer: ${peer}`);

    return peerInfo;
  }

  async disconnect(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return; // Already disconnected
    }

    peer.state = 'disconnected';
    this.peers.delete(peerId);

    this.emit('connection:lost', peer, new Error('Disconnected by user'));
    this.logger.debug(`Disconnected from peer: ${peerId}`);
  }

  async send(to: string, message: QUICMessage): Promise<void> {
    this.ensureInitialized();

    // Check if peer is connected
    const peer = this.peers.get(to);
    if (!peer || peer.state !== 'connected') {
      throw this.createError(
        QUICErrorCode.PEER_NOT_FOUND,
        `Peer ${to} not connected`,
        to
      );
    }

    // Update stats
    const messageSize = this.estimateMessageSize(message);
    this.stats.bytesSent += messageSize;
    this.stats.messagesSent++;
    this.stats.lastActivity = new Date();

    // Simulate network delay
    await this.simulateNetworkDelay();

    // In production, send via QUIC stream
    // For now, emit via EventBus
    this.emit('message:sent', { to, message });

    this.logger.debug(`Sent message to ${to}`, {
      type: message.type,
      channel: message.channel
    });
  }

  async broadcast(message: QUICMessage, options?: QUICBroadcastOptions): Promise<void> {
    this.ensureInitialized();

    const targets = this.getBroadcastTargets(options);

    const promises = targets.map(peerId =>
      this.send(peerId, {
        ...message,
        to: peerId,
        type: QUICMessageType.BROADCAST
      })
    );

    await Promise.all(promises);

    this.logger.debug(`Broadcast message to ${targets.length} peers`, {
      channel: options?.channel,
      type: message.type
    });
  }

  async request(to: string, message: QUICMessage, options?: QUICRequestOptions): Promise<QUICMessage> {
    this.ensureInitialized();

    const requestId = this.generateRequestId();
    message.requestId = requestId;
    message.type = QUICMessageType.REQUEST;

    const timeout = options?.timeout || 5000;
    const retries = options?.retries || 0;

    return this.sendRequestWithRetry(to, message, timeout, retries);
  }

  private async sendRequestWithRetry(
    to: string,
    message: QUICMessage,
    timeout: number,
    retriesLeft: number
  ): Promise<QUICMessage> {
    try {
      return await this.sendRequest(to, message, timeout);
    } catch (error) {
      if (retriesLeft > 0) {
        this.logger.debug(`Retrying request (${retriesLeft} retries left)`);
        await this.delay(100); // Retry delay
        return this.sendRequestWithRetry(to, message, timeout, retriesLeft - 1);
      }
      throw error;
    }
  }

  private sendRequest(to: string, message: QUICMessage, timeout: number): Promise<QUICMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(message.requestId!);
        reject(this.createError(
          QUICErrorCode.MESSAGE_TIMEOUT,
          `Request timeout after ${timeout}ms`,
          to
        ));
      }, timeout);

      this.pendingRequests.set(message.requestId!, { resolve, reject, timer });

      // Send request
      this.send(to, message).catch(error => {
        clearTimeout(timer);
        this.pendingRequests.delete(message.requestId!);
        reject(error);
      });
    });
  }

  async openStream(streamId: string, options?: QUICStreamOptions): Promise<void> {
    this.ensureInitialized();

    if (this.streams.has(streamId)) {
      throw this.createError(
        QUICErrorCode.STREAM_ERROR,
        `Stream ${streamId} already exists`
      );
    }

    const stream = {
      id: streamId,
      options: options || {},
      buffer: [] as QUICStreamData[],
      opened: new Date()
    };

    this.streams.set(streamId, stream);
    this.stats.activeStreams++;

    this.emit('stream:opened', streamId, options || {});
    this.logger.debug(`Opened stream: ${streamId}`);
  }

  async writeStream(streamId: string, data: QUICStreamData): Promise<void> {
    this.ensureInitialized();

    const stream = this.streams.get(streamId);
    if (!stream) {
      throw this.createError(
        QUICErrorCode.STREAM_ERROR,
        `Stream ${streamId} not found`
      );
    }

    stream.buffer.push(data);

    const dataSize = typeof data.data === 'string'
      ? Buffer.byteLength(data.data)
      : data.data.length;

    this.stats.bytesSent += dataSize;
    this.stats.lastActivity = new Date();

    this.logger.debug(`Wrote ${dataSize} bytes to stream: ${streamId}`);
  }

  async closeStream(streamId: string): Promise<void> {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return; // Already closed
    }

    this.streams.delete(streamId);
    this.stats.activeStreams--;

    this.emit('stream:closed', streamId);
    this.logger.debug(`Closed stream: ${streamId}`);
  }

  async discoverPeers(options?: QUICDiscoveryOptions): Promise<QUICPeerInfo[]> {
    this.ensureInitialized();

    // Simulate peer discovery
    const discoveredPeers = Array.from(this.peers.values())
      .filter(peer => peer.state === 'connected')
      .filter(peer => !options?.filter || options.filter(peer))
      .slice(0, options?.maxPeers || 100);

    return discoveredPeers;
  }

  getPeers(): QUICPeerInfo[] {
    return Array.from(this.peers.values())
      .filter(peer => peer.state === 'connected');
  }

  getPeer(peerId: string): QUICPeerInfo | undefined {
    return this.peers.get(peerId);
  }

  getStats(): QUICConnectionStats {
    const now = Date.now();
    const startTime = now - this.stats.uptime;

    return {
      ...this.stats,
      uptime: this.isInitialized ? now - startTime : 0,
      lastActivity: this.stats.lastActivity
    };
  }

  getHealth(): QUICHealthCheck {
    const connectedPeers = this.getPeers().length;
    const avgRTT = this.stats.avgRTT;
    const packetLoss = this.stats.packetLoss;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = 'Transport operating normally';

    if (!this.isInitialized) {
      status = 'unhealthy';
      message = 'Transport not initialized';
    } else if (packetLoss > 0.1) {
      status = 'unhealthy';
      message = 'High packet loss detected';
    } else if (avgRTT > 100) {
      status = 'degraded';
      message = 'High latency detected';
    } else if (connectedPeers === 0) {
      status = 'degraded';
      message = 'No peers connected';
    }

    return {
      operational: this.isInitialized,
      connectedPeers,
      activeChannels: this.config?.channels.length || 0,
      avgRTT,
      packetLoss,
      recentErrors: 0, // TODO: Track errors
      timestamp: new Date(),
      status,
      message
    };
  }

  async close(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    // Log before cleanup
    this.logger.info('Closing QUICTransport');

    // Stop discovery
    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = undefined;
    }

    // Disconnect all peers
    const disconnectPromises = Array.from(this.peers.keys())
      .map(peerId => this.disconnect(peerId));

    await Promise.all(disconnectPromises);

    // Close all streams
    for (const streamId of this.streams.keys()) {
      await this.closeStream(streamId);
    }

    // Clear pending requests with proper cleanup
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      try {
        clearTimeout(pending.timer);
        pending.reject(new Error('Transport closed'));
      } catch (error) {
        // Use logger if still available
        if (this.logger) {
          this.logger.warn(`Error cleaning up pending request ${requestId}:`, error);
        }
      }
    }

    // Clear all collections
    this.peers.clear();
    this.streams.clear();
    this.pendingRequests.clear();

    // Remove all event listeners (prevents memory leaks)
    this.removeAllListeners();

    // Clear EventBus reference
    this.eventBus = undefined;

    this.isInitialized = false;
    this.logger.info('QUICTransport closed');
  }

  // Helper methods

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw this.createError(
        QUICErrorCode.CONFIGURATION_ERROR,
        'QUICTransport not initialized'
      );
    }
  }

  private getBroadcastTargets(options?: QUICBroadcastOptions): string[] {
    let targets = Array.from(this.peers.keys());

    if (options?.exclude) {
      targets = targets.filter(id => !options.exclude!.includes(id));
    }

    if (options?.include) {
      targets = targets.filter(id => options.include!.includes(id));
    }

    return targets;
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private estimateMessageSize(message: QUICMessage): number {
    return JSON.stringify(message).length;
  }

  private async simulateNetworkDelay(): Promise<void> {
    // Simulate 1-5ms network delay
    const delay = Math.random() * 4 + 1;
    await this.delay(delay);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createError(
    code: QUICErrorCode,
    message: string,
    peer?: string,
    details?: any
  ): QUICTransportError {
    const error = new Error(message) as QUICTransportError;
    error.code = code;
    error.peer = peer;
    error.details = details;
    return error;
  }

  private startDiscovery(): void {
    // Periodic peer discovery (every 30 seconds)
    this.discoveryInterval = setInterval(async () => {
      try {
        const peers = await this.discoverPeers();
        this.logger.debug(`Discovered ${peers.length} peers`);
      } catch (error) {
        this.logger.error('Peer discovery failed:', error);
      }
    }, 30000);
  }

  /**
   * Handle incoming response message
   * Called by external message handler
   */
  public handleResponse(message: QUICMessage): void {
    if (message.type !== QUICMessageType.RESPONSE || !message.requestId) {
      return;
    }

    const pending = this.pendingRequests.get(message.requestId);
    if (!pending) {
      this.logger.warn(`Received response for unknown request: ${message.requestId}`);
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(message.requestId);
    pending.resolve(message);
  }

  /**
   * Set EventBus for fallback communication
   */
  public setEventBus(eventBus: EventEmitter): void {
    this.eventBus = eventBus;
  }
}

/**
 * QUIC Capable Mixin
 *
 * Provides QUIC coordination capabilities to agents through composition.
 * This mixin extends BaseAgent with distributed communication features.
 */

import { EventEmitter } from 'events';
import {
  QUICConfig,
  QUICMessage,
  QUICMessageType,
  QUICPeerInfo,
  QUICBroadcastOptions,
  QUICRequestOptions,
  QUICStreamOptions,
  QUICStreamData,
  QUICConnectionStats,
  QUICHealthCheck,
  IQUICTransport
} from '../../types/quic';
import { QUICTransport } from '../../core/transport/QUICTransport';
import { Logger } from '../../utils/Logger';

export interface QUICCapable {
  quicTransport?: IQUICTransport;
  quicConfig?: QUICConfig;

  enableQUIC(config: QUICConfig): Promise<void>;
  disableQUIC(): Promise<void>;
  isQUICEnabled(): boolean;

  // Direct agent-to-agent communication
  sendToAgent(agentId: string, payload: any, channel?: string): Promise<void>;
  requestFromAgent(agentId: string, payload: any, timeout?: number): Promise<any>;

  // Broadcast to fleet
  broadcastToFleet(payload: any, channel?: string, options?: QUICBroadcastOptions): Promise<void>;

  // Peer discovery
  discoverPeers(): Promise<QUICPeerInfo[]>;
  getConnectedPeers(): QUICPeerInfo[];

  // Stream operations
  openStream(streamId: string, options?: QUICStreamOptions): Promise<void>;
  writeToStream(streamId: string, data: Buffer | string): Promise<void>;
  closeStream(streamId: string): Promise<void>;

  // Health and stats
  getQUICStats(): QUICConnectionStats | null;
  getQUICHealth(): QUICHealthCheck | null;
}

/**
 * Apply QUIC capabilities to an agent class
 */
export function applyQUICCapabilities<T extends new (...args: any[]) => EventEmitter>(
  Base: T
): T & (new (...args: any[]) => QUICCapable) {
  return class QUICCapableAgent extends Base implements QUICCapable {
    public quicTransport?: IQUICTransport;
    public quicConfig?: QUICConfig;
    private logger: Logger;
    private messageHandlers: Map<string, (message: QUICMessage) => void> = new Map();

    constructor(...args: any[]) {
      super(...args);
      this.logger = Logger.getInstance();
    }

    async enableQUIC(config: QUICConfig): Promise<void> {
      if (this.quicTransport) {
        throw new Error('QUIC already enabled for this agent');
      }

      if (!config.enabled) {
        this.logger.debug('QUIC config provided but not enabled');
        return;
      }

      this.logger.info('Enabling QUIC transport', {
        host: config.host,
        port: config.port,
        channels: config.channels.length
      });

      // Create QUIC transport
      this.quicTransport = new QUICTransport();
      this.quicConfig = config;

      // Initialize transport
      await this.quicTransport.initialize(config);

      // Setup message handlers
      this.setupQUICMessageHandlers();

      // Auto-discover peers if configured
      if (config.channels.some(ch => ch.type === 'broadcast')) {
        await this.discoverPeers();
      }

      this.logger.info('QUIC transport enabled successfully');
    }

    async disableQUIC(): Promise<void> {
      if (!this.quicTransport) {
        return;
      }

      this.logger.info('Disabling QUIC transport');

      // Cleanup message handlers
      this.messageHandlers.clear();

      // Close transport
      await this.quicTransport.close();
      this.quicTransport = undefined;
      this.quicConfig = undefined;

      this.logger.info('QUIC transport disabled');
    }

    isQUICEnabled(): boolean {
      return this.quicTransport !== undefined;
    }

    async sendToAgent(agentId: string, payload: any, channel: string = 'coordination'): Promise<void> {
      this.ensureQUICEnabled();

      const message: QUICMessage = {
        id: this.generateMessageId(),
        from: this.getAgentId(),
        to: agentId,
        channel,
        type: QUICMessageType.DIRECT,
        payload,
        priority: 5,
        timestamp: new Date()
      };

      await this.quicTransport!.send(agentId, message);

      this.logger.debug(`Sent message to agent ${agentId}`, {
        channel,
        payloadType: typeof payload
      });
    }

    async requestFromAgent(agentId: string, payload: any, timeout: number = 5000): Promise<any> {
      this.ensureQUICEnabled();

      const message: QUICMessage = {
        id: this.generateMessageId(),
        from: this.getAgentId(),
        to: agentId,
        channel: 'coordination',
        type: QUICMessageType.REQUEST,
        payload,
        priority: 7,
        timestamp: new Date()
      };

      const response = await this.quicTransport!.request(agentId, message, {
        timeout,
        retries: 2,
        retryDelay: 100
      });

      this.logger.debug(`Received response from agent ${agentId}`);

      return response.payload;
    }

    async broadcastToFleet(
      payload: any,
      channel: string = 'coordination',
      options?: QUICBroadcastOptions
    ): Promise<void> {
      this.ensureQUICEnabled();

      const message: QUICMessage = {
        id: this.generateMessageId(),
        from: this.getAgentId(),
        to: 'broadcast',
        channel,
        type: QUICMessageType.BROADCAST,
        payload,
        priority: options?.priority || 5,
        timestamp: new Date(),
        ttl: options?.ttl
      };

      await this.quicTransport!.broadcast(message, {
        channel,
        ...options
      });

      const peers = this.quicTransport!.getPeers();
      this.logger.debug(`Broadcast message to ${peers.length} peers`, {
        channel,
        payloadType: typeof payload
      });
    }

    async discoverPeers(): Promise<QUICPeerInfo[]> {
      this.ensureQUICEnabled();

      const peers = await this.quicTransport!.discoverPeers({
        timeout: 5000,
        maxPeers: 100
      });

      this.logger.debug(`Discovered ${peers.length} peers`);

      // Auto-connect to discovered peers
      for (const peer of peers) {
        if (peer.state !== 'connected') {
          try {
            await this.quicTransport!.connect(peer.agentId, peer.port);
          } catch (error) {
            this.logger.warn(`Failed to connect to peer ${peer.agentId}:`, error);
          }
        }
      }

      return peers;
    }

    getConnectedPeers(): QUICPeerInfo[] {
      if (!this.quicTransport) {
        return [];
      }

      return this.quicTransport.getPeers();
    }

    async openStream(streamId: string, options?: QUICStreamOptions): Promise<void> {
      this.ensureQUICEnabled();

      await this.quicTransport!.openStream(streamId, options);

      this.logger.debug(`Opened stream: ${streamId}`);
    }

    async writeToStream(streamId: string, data: Buffer | string): Promise<void> {
      this.ensureQUICEnabled();

      const streamData: QUICStreamData = {
        streamId,
        data,
        final: false
      };

      await this.quicTransport!.writeStream(streamId, streamData);

      const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
      this.logger.debug(`Wrote ${size} bytes to stream: ${streamId}`);
    }

    async closeStream(streamId: string): Promise<void> {
      if (!this.quicTransport) {
        return;
      }

      await this.quicTransport.closeStream(streamId);

      this.logger.debug(`Closed stream: ${streamId}`);
    }

    getQUICStats(): QUICConnectionStats | null {
      if (!this.quicTransport) {
        return null;
      }

      return this.quicTransport.getStats();
    }

    getQUICHealth(): QUICHealthCheck | null {
      if (!this.quicTransport) {
        return null;
      }

      return this.quicTransport.getHealth();
    }

    // Private helper methods

    private setupQUICMessageHandlers(): void {
      if (!this.quicTransport) {
        return;
      }

      // Handle incoming messages
      this.quicTransport.on('message:received', (message: QUICMessage) => {
        this.handleIncomingMessage(message);
      });

      // Handle connection events
      this.quicTransport.on('connection:established', (peer: QUICPeerInfo) => {
        this.emit('peer:connected', peer);
        this.logger.info(`Peer connected: ${peer.agentId}`);
      });

      this.quicTransport.on('connection:lost', (peer: QUICPeerInfo, reason: Error) => {
        this.emit('peer:disconnected', peer);
        this.logger.warn(`Peer disconnected: ${peer.agentId}`, reason);
      });

      // Handle peer discovery
      this.quicTransport.on('peer:discovered', (peer: QUICPeerInfo) => {
        this.emit('peer:discovered', peer);
        this.logger.debug(`Peer discovered: ${peer.agentId}`);
      });

      // Handle transport errors
      this.quicTransport.on('transport:error', (error: Error) => {
        this.emit('quic:error', error);
        this.logger.error('QUIC transport error:', error);
      });
    }

    private handleIncomingMessage(message: QUICMessage): void {
      this.logger.debug(`Received QUIC message from ${message.from}`, {
        type: message.type,
        channel: message.channel
      });

      // Handle response messages
      if (message.type === QUICMessageType.RESPONSE && this.quicTransport) {
        (this.quicTransport as QUICTransport).handleResponse(message);
        return;
      }

      // Handle request messages
      if (message.type === QUICMessageType.REQUEST) {
        this.handleRequest(message);
        return;
      }

      // Emit message event for custom handling
      this.emit('quic:message', message);

      // Call registered handlers
      const handler = this.messageHandlers.get(message.channel);
      if (handler) {
        handler(message);
      }
    }

    private async handleRequest(message: QUICMessage): Promise<void> {
      try {
        // Call request handler if registered
        const handler = this.messageHandlers.get(`request:${message.channel}`);
        let responsePayload: any = null;

        if (handler) {
          // Call handler and get response
          const result = await Promise.resolve(handler(message));
          responsePayload = result;
        } else {
          // Default response
          responsePayload = {
            status: 'not_handled',
            message: 'No handler registered for this request'
          };
        }

        // Send response
        const response: QUICMessage = {
          id: this.generateMessageId(),
          from: this.getAgentId(),
          to: message.from,
          channel: message.channel,
          type: QUICMessageType.RESPONSE,
          payload: responsePayload,
          priority: message.priority,
          timestamp: new Date(),
          requestId: message.requestId
        };

        if (this.quicTransport) {
          await this.quicTransport.send(message.from, response);
        }
      } catch (error) {
        this.logger.error('Error handling request:', error);

        // Send error response
        const errorResponse: QUICMessage = {
          id: this.generateMessageId(),
          from: this.getAgentId(),
          to: message.from,
          channel: message.channel,
          type: QUICMessageType.ERROR,
          payload: {
            error: (error as Error).message,
            stack: (error as Error).stack
          },
          priority: message.priority,
          timestamp: new Date(),
          requestId: message.requestId
        };

        if (this.quicTransport) {
          await this.quicTransport.send(message.from, errorResponse);
        }
      }
    }

    private ensureQUICEnabled(): void {
      if (!this.quicTransport) {
        throw new Error('QUIC transport not enabled. Call enableQUIC() first.');
      }
    }

    private getAgentId(): string {
      // Try to get agent ID from various sources
      if ('agentId' in this && typeof (this as any).agentId === 'object') {
        return (this as any).agentId.id;
      }
      if ('id' in this) {
        return (this as any).id;
      }
      return 'unknown-agent';
    }

    private generateMessageId(): string {
      return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Register a custom message handler for a specific channel
     */
    public onQUICMessage(channel: string, handler: (message: QUICMessage) => void): void {
      this.messageHandlers.set(channel, handler);
      this.logger.debug(`Registered QUIC message handler for channel: ${channel}`);
    }

    /**
     * Register a request handler for a specific channel
     */
    public onQUICRequest(channel: string, handler: (message: QUICMessage) => any): void {
      this.messageHandlers.set(`request:${channel}`, handler);
      this.logger.debug(`Registered QUIC request handler for channel: ${channel}`);
    }

    /**
     * Unregister a message handler
     */
    public offQUICMessage(channel: string): void {
      this.messageHandlers.delete(channel);
      this.messageHandlers.delete(`request:${channel}`);
    }
  };
}

/**
 * Helper function to check if an object has QUIC capabilities
 */
export function hasQUICCapabilities(obj: any): obj is QUICCapable {
  return (
    typeof obj.enableQUIC === 'function' &&
    typeof obj.disableQUIC === 'function' &&
    typeof obj.isQUICEnabled === 'function' &&
    typeof obj.sendToAgent === 'function' &&
    typeof obj.broadcastToFleet === 'function'
  );
}

/**
 * Peer Connection Manager for WebRTC
 *
 * Manages multiple WebRTC peer connections with automatic reconnection,
 * data channel management, and connection state tracking.
 *
 * @module edge/p2p/webrtc/PeerConnectionManager
 * @version 1.0.0
 */

import {
  PeerId,
  PeerConnection,
  ConnectionState,
  ConnectionQuality,
  DataChannelConfig,
  DataChannelMessage,
  DataChannelState,
  PeerConnectionManagerConfig,
  ReconnectionConfig,
  ConnectOptions,
  DisconnectOptions,
  WebRTCEventType,
  WebRTCEvent,
  WebRTCEventHandler,
  ICECandidate,
  DEFAULT_ICE_SERVERS,
  DEFAULT_RECONNECT_CONFIG,
  DEFAULT_DATA_CHANNELS,
  generateId,
  createDefaultConnectionQuality,
} from './types';
import { ICEManager } from './ICEManager';
import { SignalingClient } from './SignalingClient';

/**
 * Default peer connection manager configuration
 */
const DEFAULT_CONFIG: Omit<Required<PeerConnectionManagerConfig>, 'localPeerId'> = {
  iceConfig: {
    iceServers: DEFAULT_ICE_SERVERS,
    enableTrickle: true,
    gatheringTimeout: 10000,
    enableTurnFallback: true,
  },
  poolConfig: {
    maxConnections: 50,
    idleTimeout: 60000,
    healthCheckInterval: 30000,
  },
  defaultDataChannels: DEFAULT_DATA_CHANNELS,
  autoReconnect: true,
  reconnectConfig: DEFAULT_RECONNECT_CONFIG,
  onConnectionStateChange: () => {},
  onDataReceived: () => {},
  onError: () => {},
};

/**
 * Internal peer connection state
 */
interface InternalPeerState {
  connection: PeerConnection;
  iceManager: ICEManager;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  pendingCandidates: ICECandidate[];
  isInitiator: boolean;
  negotiationNeeded: boolean;
}

/**
 * Peer Connection Manager - Manages WebRTC peer connections
 *
 * @example
 * ```typescript
 * const signaling = new SignalingClient({ serverUrl: 'wss://signal.example.com', peerId: 'local' });
 * const manager = new PeerConnectionManager({
 *   localPeerId: 'local',
 *   autoReconnect: true,
 * });
 *
 * // Set up signaling integration
 * manager.setSignaling(signaling);
 *
 * // Connect to a peer
 * const connection = await manager.connect('remote-peer');
 *
 * // Send message
 * manager.send('remote-peer', 'reliable', { type: 'hello', data: 'world' });
 *
 * // Listen for messages
 * manager.on(WebRTCEventType.DATA_CHANNEL_MESSAGE, (event) => {
 *   console.log('Message from', event.peerId, ':', event.data);
 * });
 * ```
 */
export class PeerConnectionManager {
  private readonly config: Required<PeerConnectionManagerConfig>;
  private readonly peers: Map<PeerId, InternalPeerState> = new Map();
  private readonly eventHandlers: Map<WebRTCEventType, Set<WebRTCEventHandler>> = new Map();
  private signaling: SignalingClient | null = null;
  private isDestroyed: boolean = false;

  /**
   * Create a new PeerConnectionManager instance
   *
   * @param config - Manager configuration
   */
  constructor(config: PeerConnectionManagerConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      iceConfig: { ...DEFAULT_CONFIG.iceConfig, ...config.iceConfig },
      poolConfig: { ...DEFAULT_CONFIG.poolConfig, ...config.poolConfig },
      reconnectConfig: { ...DEFAULT_CONFIG.reconnectConfig, ...config.reconnectConfig },
    };
  }

  /**
   * Set the signaling client for connection establishment
   *
   * @param signaling - SignalingClient instance
   */
  public setSignaling(signaling: SignalingClient): void {
    if (this.signaling) {
      // Remove previous handlers
      this.signaling.on({});
    }

    this.signaling = signaling;

    // Register signaling event handlers
    signaling.on({
      onOffer: async (from, sdp, metadata) => {
        await this.handleRemoteOffer(from, sdp, metadata);
      },
      onAnswer: async (from, sdp) => {
        await this.handleRemoteAnswer(from, sdp);
      },
      onIceCandidate: async (from, candidate) => {
        await this.handleRemoteIceCandidate(from, candidate);
      },
      onPeerLeft: (peerId) => {
        this.handlePeerLeft(peerId);
      },
      onRenegotiate: async (from, reason) => {
        await this.handleRenegotiationRequest(from, reason);
      },
    });
  }

  /**
   * Get local peer ID
   */
  public getLocalPeerId(): PeerId {
    return this.config.localPeerId;
  }

  /**
   * Connect to a remote peer
   *
   * @param peerId - Remote peer identifier
   * @param options - Connection options
   * @returns Promise resolving to the peer connection
   */
  public async connect(peerId: PeerId, options: ConnectOptions = {}): Promise<PeerConnection> {
    if (this.isDestroyed) {
      throw new Error('PeerConnectionManager has been destroyed');
    }

    // Check if already connected
    const existing = this.peers.get(peerId);
    if (existing && existing.connection.state === ConnectionState.CONNECTED) {
      return existing.connection;
    }

    // Check pool limits
    if (this.peers.size >= (this.config.poolConfig.maxConnections ?? 50)) {
      throw new Error('Connection pool is full');
    }

    const isInitiator = options.initiator ?? true;
    const dataChannels = options.dataChannels ?? this.config.defaultDataChannels;

    // Create ICE manager
    const iceManager = new ICEManager(this.config.iceConfig);

    // Create RTCPeerConnection
    const rtcConfig = iceManager.getRTCConfiguration();
    const rtcConnection = new RTCPeerConnection(rtcConfig);

    // Create peer connection object
    const connection: PeerConnection = {
      id: peerId,
      state: ConnectionState.NEW,
      rtcConnection,
      dataChannels: new Map(),
      quality: createDefaultConnectionQuality(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
      reconnectAttempts: 0,
      metadata: options.metadata,
    };

    // Store internal state
    const peerState: InternalPeerState = {
      connection,
      iceManager,
      reconnectTimer: null,
      pendingCandidates: [],
      isInitiator,
      negotiationNeeded: false,
    };

    this.peers.set(peerId, peerState);

    // Attach ICE manager
    iceManager.attachToPeerConnection(rtcConnection);

    // Set up event handlers
    this.setupPeerConnectionHandlers(peerId, peerState);

    // Set up ICE candidate handling
    iceManager.onCandidate((candidate) => {
      this.sendIceCandidate(peerId, candidate);
    });

    // Create data channels if initiator
    if (isInitiator) {
      for (const channelConfig of dataChannels) {
        this.createDataChannel(peerId, channelConfig);
      }
    }

    // Handle incoming data channels
    rtcConnection.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    // Start connection process if initiator
    if (isInitiator) {
      await this.initiateConnection(peerId);
    }

    return connection;
  }

  /**
   * Disconnect from a peer
   *
   * @param peerId - Peer to disconnect from
   * @param options - Disconnect options
   */
  public async disconnect(peerId: PeerId, options: DisconnectOptions = {}): Promise<void> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      return;
    }

    // Clear reconnect timer
    if (peerState.reconnectTimer) {
      clearTimeout(peerState.reconnectTimer);
      peerState.reconnectTimer = null;
    }

    // Notify peer if requested
    if (options.notify && this.signaling) {
      try {
        await this.signaling.requestRenegotiation(peerId, options.reason ?? 'disconnect');
      } catch {
        // Ignore signaling errors during disconnect
      }
    }

    // Close data channels
    peerState.connection.dataChannels.forEach((channel) => {
      try {
        channel.close();
      } catch {
        // Ignore errors
      }
    });

    // Close peer connection
    try {
      peerState.connection.rtcConnection.close();
    } catch {
      // Ignore errors
    }

    // Cleanup ICE manager
    peerState.iceManager.destroy();

    // Update state and remove
    peerState.connection.state = ConnectionState.CLOSED;
    this.emitEvent(WebRTCEventType.CONNECTION_STATE_CHANGED, peerId, ConnectionState.CLOSED);

    this.peers.delete(peerId);
  }

  /**
   * Send data to a peer through a data channel
   *
   * @param peerId - Target peer ID
   * @param channel - Data channel label
   * @param message - Message to send
   */
  public send<T = unknown>(peerId: PeerId, channel: string, message: DataChannelMessage<T>): void {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      throw new Error(`No connection to peer: ${peerId}`);
    }

    const dataChannel = peerState.connection.dataChannels.get(channel);
    if (!dataChannel) {
      throw new Error(`Data channel not found: ${channel}`);
    }

    if (dataChannel.readyState !== 'open') {
      throw new Error(`Data channel not open: ${channel} (state: ${dataChannel.readyState})`);
    }

    const data = JSON.stringify({
      ...message,
      id: message.id ?? generateId('msg'),
      timestamp: message.timestamp ?? Date.now(),
    });

    dataChannel.send(data);
    peerState.connection.lastActivityAt = Date.now();
  }

  /**
   * Send raw data to a peer
   *
   * @param peerId - Target peer ID
   * @param channel - Data channel label
   * @param data - Raw data (string, ArrayBuffer, etc.)
   */
  public sendRaw(peerId: PeerId, channel: string, data: string | ArrayBuffer | Blob): void {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      throw new Error(`No connection to peer: ${peerId}`);
    }

    const dataChannel = peerState.connection.dataChannels.get(channel);
    if (!dataChannel) {
      throw new Error(`Data channel not found: ${channel}`);
    }

    if (dataChannel.readyState !== 'open') {
      throw new Error(`Data channel not open: ${channel}`);
    }

    dataChannel.send(data as string);
    peerState.connection.lastActivityAt = Date.now();
  }

  /**
   * Get connection state for a peer
   *
   * @param peerId - Peer ID
   * @returns Connection state or null if not found
   */
  public getConnectionState(peerId: PeerId): ConnectionState | null {
    const peerState = this.peers.get(peerId);
    return peerState?.connection.state ?? null;
  }

  /**
   * Get peer connection object
   *
   * @param peerId - Peer ID
   * @returns Peer connection or undefined if not found
   */
  public getPeerConnection(peerId: PeerId): PeerConnection | undefined {
    return this.peers.get(peerId)?.connection;
  }

  /**
   * Get all connected peer IDs
   */
  public getConnectedPeers(): PeerId[] {
    const connected: PeerId[] = [];
    this.peers.forEach((state, peerId) => {
      if (state.connection.state === ConnectionState.CONNECTED) {
        connected.push(peerId);
      }
    });
    return connected;
  }

  /**
   * Get data channel state
   *
   * @param peerId - Peer ID
   * @param label - Channel label
   * @returns Data channel state or undefined
   */
  public getDataChannelState(peerId: PeerId, label: string): DataChannelState | undefined {
    const peerState = this.peers.get(peerId);
    const channel = peerState?.connection.dataChannels.get(label);

    if (!channel) {
      return undefined;
    }

    return {
      label: channel.label,
      readyState: channel.readyState,
      bufferedAmount: channel.bufferedAmount,
      bufferedAmountLowThreshold: channel.bufferedAmountLowThreshold,
      reliable: channel.maxRetransmits === null && channel.maxPacketLifeTime === null,
      ordered: channel.ordered,
      protocol: channel.protocol,
    };
  }

  /**
   * Get connection quality for a peer
   *
   * @param peerId - Peer ID
   * @returns Connection quality or undefined
   */
  public async getConnectionQuality(peerId: PeerId): Promise<ConnectionQuality | undefined> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      return undefined;
    }

    return peerState.iceManager.getConnectionQuality();
  }

  /**
   * Register event handler
   *
   * @param event - Event type
   * @param handler - Handler function
   * @returns Unsubscribe function
   */
  public on<T = unknown>(event: WebRTCEventType, handler: WebRTCEventHandler<T>): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)!.add(handler as WebRTCEventHandler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler as WebRTCEventHandler);
    };
  }

  /**
   * Create additional data channel on existing connection
   *
   * @param peerId - Peer ID
   * @param config - Data channel configuration
   */
  public createDataChannel(peerId: PeerId, config: DataChannelConfig): void {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      throw new Error(`No connection to peer: ${peerId}`);
    }

    const channelOptions: RTCDataChannelInit = {
      ordered: config.ordered ?? true,
      maxRetransmits: config.reliable === false ? (config.maxRetransmits ?? 0) : undefined,
      maxPacketLifeTime: config.reliable === false ? config.maxPacketLifeTime : undefined,
      protocol: config.protocol ?? '',
      negotiated: config.negotiated ?? false,
      id: config.id,
    };

    const channel = peerState.connection.rtcConnection.createDataChannel(
      config.label,
      channelOptions
    );

    this.setupDataChannel(peerId, channel);
  }

  /**
   * Destroy the manager and close all connections
   */
  public async destroy(): Promise<void> {
    this.isDestroyed = true;

    // Disconnect all peers
    const disconnectPromises = Array.from(this.peers.keys()).map((peerId) =>
      this.disconnect(peerId, { notify: true, reason: 'manager-destroyed' })
    );

    await Promise.all(disconnectPromises);

    // Clear event handlers
    this.eventHandlers.clear();

    // Clear signaling reference
    this.signaling = null;
  }

  // ============================================
  // Private Methods
  // ============================================

  private setupPeerConnectionHandlers(peerId: PeerId, peerState: InternalPeerState): void {
    const { connection } = peerState;
    const pc = connection.rtcConnection;

    // Connection state changes
    pc.onconnectionstatechange = () => {
      const state = this.mapConnectionState(pc.connectionState);
      const previousState = connection.state;
      connection.state = state;
      connection.lastActivityAt = Date.now();

      this.emitEvent(WebRTCEventType.CONNECTION_STATE_CHANGED, peerId, state);
      this.config.onConnectionStateChange?.(peerId, state);

      // Handle reconnection
      if (state === ConnectionState.DISCONNECTED || state === ConnectionState.FAILED) {
        if (this.config.autoReconnect && !this.isDestroyed) {
          this.scheduleReconnect(peerId, peerState);
        }
      }

      // Clear reconnect timer on successful connection
      if (state === ConnectionState.CONNECTED && peerState.reconnectTimer) {
        clearTimeout(peerState.reconnectTimer);
        peerState.reconnectTimer = null;
        connection.reconnectAttempts = 0;

        if (previousState === ConnectionState.RECONNECTING) {
          this.emitEvent(WebRTCEventType.RECONNECTED, peerId, {
            attempts: connection.reconnectAttempts,
          });
        }
      }
    };

    // Negotiation needed
    pc.onnegotiationneeded = async () => {
      if (peerState.isInitiator && !peerState.negotiationNeeded) {
        peerState.negotiationNeeded = true;
        try {
          await this.initiateConnection(peerId);
        } finally {
          peerState.negotiationNeeded = false;
        }
      }
    };
  }

  private setupDataChannel(peerId: PeerId, channel: RTCDataChannel): void {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      channel.close();
      return;
    }

    const { connection } = peerState;

    // Store channel
    connection.dataChannels.set(channel.label, channel);

    // Channel open
    channel.onopen = () => {
      const state = this.getChannelState(channel);
      this.emitEvent(WebRTCEventType.DATA_CHANNEL_OPEN, peerId, state);
    };

    // Channel close
    channel.onclose = () => {
      const state = this.getChannelState(channel);
      this.emitEvent(WebRTCEventType.DATA_CHANNEL_CLOSED, peerId, state);
    };

    // Channel error
    channel.onerror = (event) => {
      const error = new Error(`Data channel error: ${(event as ErrorEvent).message || 'unknown'}`);
      this.emitEvent(WebRTCEventType.DATA_CHANNEL_ERROR, peerId, error);
      this.config.onError?.(peerId, error);
    };

    // Channel message
    channel.onmessage = (event) => {
      connection.lastActivityAt = Date.now();

      let message: DataChannelMessage;
      try {
        if (typeof event.data === 'string') {
          message = JSON.parse(event.data);
        } else {
          // Binary data - wrap in message format
          message = {
            type: 'binary',
            data: event.data,
            timestamp: Date.now(),
          };
        }
      } catch {
        // Invalid JSON - treat as raw message
        message = {
          type: 'raw',
          data: event.data,
          timestamp: Date.now(),
        };
      }

      this.emitEvent(WebRTCEventType.DATA_CHANNEL_MESSAGE, peerId, {
        channel: channel.label,
        message,
      });
      this.config.onDataReceived?.(peerId, channel.label, message);
    };
  }

  private getChannelState(channel: RTCDataChannel): DataChannelState {
    return {
      label: channel.label,
      readyState: channel.readyState,
      bufferedAmount: channel.bufferedAmount,
      bufferedAmountLowThreshold: channel.bufferedAmountLowThreshold,
      reliable: channel.maxRetransmits === null && channel.maxPacketLifeTime === null,
      ordered: channel.ordered,
      protocol: channel.protocol,
    };
  }

  private async initiateConnection(peerId: PeerId): Promise<void> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      throw new Error(`No peer state for: ${peerId}`);
    }

    const { connection } = peerState;
    connection.state = ConnectionState.CONNECTING;
    this.emitEvent(WebRTCEventType.CONNECTION_STATE_CHANGED, peerId, ConnectionState.CONNECTING);

    try {
      // Create offer
      const offer = await connection.rtcConnection.createOffer();
      await connection.rtcConnection.setLocalDescription(offer);

      // Send offer via signaling
      if (this.signaling && offer.sdp) {
        await this.signaling.sendOffer(peerId, offer.sdp, connection.metadata);
      }
    } catch (error) {
      connection.state = ConnectionState.FAILED;
      this.emitEvent(WebRTCEventType.CONNECTION_ERROR, peerId, error);
      this.config.onError?.(peerId, error as Error);
      throw error;
    }
  }

  private async handleRemoteOffer(
    peerId: PeerId,
    sdp: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Create connection if doesn't exist
    let peerState = this.peers.get(peerId);

    if (!peerState) {
      await this.connect(peerId, { initiator: false, metadata });
      peerState = this.peers.get(peerId);
    }

    if (!peerState) {
      throw new Error(`Failed to create connection for: ${peerId}`);
    }

    const { connection } = peerState;

    try {
      // Set remote description
      await connection.rtcConnection.setRemoteDescription({
        type: 'offer',
        sdp,
      });

      // Add any pending ICE candidates
      for (const candidate of peerState.pendingCandidates) {
        await peerState.iceManager.addRemoteCandidate(candidate);
      }
      peerState.pendingCandidates = [];

      // Create and send answer
      const answer = await connection.rtcConnection.createAnswer();
      await connection.rtcConnection.setLocalDescription(answer);

      if (this.signaling && answer.sdp) {
        await this.signaling.sendAnswer(peerId, answer.sdp);
      }
    } catch (error) {
      connection.state = ConnectionState.FAILED;
      this.emitEvent(WebRTCEventType.CONNECTION_ERROR, peerId, error);
      this.config.onError?.(peerId, error as Error);
    }
  }

  private async handleRemoteAnswer(peerId: PeerId, sdp: string): Promise<void> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      console.warn(`Received answer for unknown peer: ${peerId}`);
      return;
    }

    try {
      await peerState.connection.rtcConnection.setRemoteDescription({
        type: 'answer',
        sdp,
      });

      // Add any pending ICE candidates
      for (const candidate of peerState.pendingCandidates) {
        await peerState.iceManager.addRemoteCandidate(candidate);
      }
      peerState.pendingCandidates = [];
    } catch (error) {
      peerState.connection.state = ConnectionState.FAILED;
      this.emitEvent(WebRTCEventType.CONNECTION_ERROR, peerId, error);
      this.config.onError?.(peerId, error as Error);
    }
  }

  private async handleRemoteIceCandidate(peerId: PeerId, candidate: ICECandidate): Promise<void> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      console.warn(`Received ICE candidate for unknown peer: ${peerId}`);
      return;
    }

    // If remote description not set yet, queue the candidate
    if (!peerState.connection.rtcConnection.remoteDescription) {
      peerState.pendingCandidates.push(candidate);
      return;
    }

    try {
      await peerState.iceManager.addRemoteCandidate(candidate);
    } catch (error) {
      console.error(`Failed to add ICE candidate from ${peerId}:`, error);
    }
  }

  private handlePeerLeft(peerId: PeerId): void {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      return;
    }

    // Clean up connection
    this.disconnect(peerId, { notify: false }).catch((error) => {
      console.error(`Error disconnecting from ${peerId}:`, error);
    });

    this.emitEvent(WebRTCEventType.PEER_LEFT, peerId, { reason: 'peer-left' });
  }

  private async handleRenegotiationRequest(peerId: PeerId, reason: string): Promise<void> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      return;
    }

    // If reason is disconnect, close the connection
    if (reason === 'disconnect') {
      await this.disconnect(peerId, { notify: false });
      return;
    }

    // Otherwise, initiate renegotiation
    if (peerState.isInitiator) {
      await this.initiateConnection(peerId);
    }
  }

  private sendIceCandidate(peerId: PeerId, candidate: ICECandidate): void {
    if (!this.signaling) {
      console.warn('No signaling client configured');
      return;
    }

    this.signaling.sendIceCandidate(peerId, candidate).catch((error) => {
      console.error(`Failed to send ICE candidate to ${peerId}:`, error);
    });
  }

  private scheduleReconnect(peerId: PeerId, peerState: InternalPeerState): void {
    const { connection } = peerState;
    const { reconnectConfig } = this.config;

    if (connection.reconnectAttempts >= reconnectConfig.maxAttempts) {
      connection.state = ConnectionState.FAILED;
      this.emitEvent(WebRTCEventType.CONNECTION_STATE_CHANGED, peerId, ConnectionState.FAILED);
      return;
    }

    connection.state = ConnectionState.RECONNECTING;
    connection.reconnectAttempts++;

    this.emitEvent(WebRTCEventType.RECONNECTING, peerId, {
      attempt: connection.reconnectAttempts,
      maxAttempts: reconnectConfig.maxAttempts,
    });

    // Calculate delay with exponential backoff and jitter
    const delay = this.calculateReconnectDelay(connection.reconnectAttempts, reconnectConfig);

    peerState.reconnectTimer = setTimeout(async () => {
      try {
        // Close existing connection
        peerState.connection.rtcConnection.close();
        peerState.iceManager.destroy();

        // Recreate connection
        await this.connect(peerId, {
          initiator: peerState.isInitiator,
          metadata: connection.metadata,
        });
      } catch (error) {
        console.error(`Reconnection attempt ${connection.reconnectAttempts} failed:`, error);

        // Schedule another attempt
        const newState = this.peers.get(peerId);
        if (newState) {
          this.scheduleReconnect(peerId, newState);
        }
      }
    }, delay);
  }

  private calculateReconnectDelay(attempt: number, config: ReconnectionConfig): number {
    const exponentialDelay = config.initialDelay * Math.pow(config.multiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
    const jitter = cappedDelay * config.jitter * (Math.random() * 2 - 1);

    return Math.max(0, cappedDelay + jitter);
  }

  private mapConnectionState(rtcState: RTCPeerConnectionState): ConnectionState {
    switch (rtcState) {
      case 'new':
        return ConnectionState.NEW;
      case 'connecting':
        return ConnectionState.CONNECTING;
      case 'connected':
        return ConnectionState.CONNECTED;
      case 'disconnected':
        return ConnectionState.DISCONNECTED;
      case 'failed':
        return ConnectionState.FAILED;
      case 'closed':
        return ConnectionState.CLOSED;
      default:
        return ConnectionState.NEW;
    }
  }

  private emitEvent<T>(type: WebRTCEventType, peerId: PeerId | undefined, data: T): void {
    const event: WebRTCEvent<T> = {
      type,
      timestamp: Date.now(),
      peerId,
      data,
    };

    const handlers = this.eventHandlers.get(type);
    handlers?.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Event handler error for ${type}:`, error);
      }
    });
  }
}

export default PeerConnectionManager;

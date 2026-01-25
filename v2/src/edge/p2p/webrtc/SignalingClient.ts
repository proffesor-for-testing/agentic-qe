/**
 * Signaling Client for WebRTC Connection Establishment
 *
 * WebSocket-based signaling client for exchanging SDP offers/answers and ICE candidates
 * between peers. Supports room-based peer discovery, heartbeat/keepalive mechanism,
 * and automatic reconnection.
 *
 * @module edge/p2p/webrtc/SignalingClient
 * @version 1.0.0
 */

import {
  PeerId,
  RoomId,
  SignalingMessage,
  SignalingMessageType,
  SignalingClientConfig,
  SignalingClientState,
  SignalingOfferMessage,
  SignalingAnswerMessage,
  SignalingICECandidateMessage,
  SignalingJoinRoomMessage,
  SignalingLeaveRoomMessage,
  SignalingPeerJoinedMessage,
  SignalingPeerLeftMessage,
  SignalingRoomInfoMessage,
  SignalingPingMessage,
  SignalingPongMessage,
  SignalingErrorMessage,
  ICECandidate,
  generateId,
} from './types';

/**
 * Default signaling client configuration
 */
const DEFAULT_CONFIG: Omit<Required<SignalingClientConfig>, 'serverUrl' | 'peerId' | 'authToken'> = {
  autoReconnect: true,
  reconnectDelay: 1000,
  maxReconnectAttempts: 5,
  heartbeatInterval: 30000,
  connectionTimeout: 10000,
};

/**
 * Signaling event handlers
 */
export interface SignalingEventHandlers {
  onOffer?: (from: PeerId, sdp: string, metadata?: Record<string, unknown>) => void;
  onAnswer?: (from: PeerId, sdp: string, metadata?: Record<string, unknown>) => void;
  onIceCandidate?: (from: PeerId, candidate: ICECandidate) => void;
  onPeerJoined?: (peerId: PeerId, metadata?: Record<string, unknown>) => void;
  onPeerLeft?: (peerId: PeerId, reason?: string) => void;
  onRoomInfo?: (roomId: RoomId, peers: Array<{ id: PeerId; metadata?: Record<string, unknown> }>) => void;
  onError?: (code: string, message: string, details?: unknown) => void;
  onStateChange?: (state: SignalingClientState) => void;
  onRenegotiate?: (from: PeerId, reason: string) => void;
}

/**
 * Signaling Client - WebSocket-based signaling for WebRTC connection establishment
 *
 * @example
 * ```typescript
 * const signaling = new SignalingClient({
 *   serverUrl: 'wss://signal.example.com',
 *   peerId: 'my-peer-id',
 *   autoReconnect: true,
 * });
 *
 * // Register event handlers
 * signaling.on({
 *   onOffer: (from, sdp) => handleOffer(from, sdp),
 *   onAnswer: (from, sdp) => handleAnswer(from, sdp),
 *   onIceCandidate: (from, candidate) => handleCandidate(from, candidate),
 *   onPeerJoined: (peerId) => console.log('Peer joined:', peerId),
 * });
 *
 * // Connect and join room
 * await signaling.connect();
 * await signaling.joinRoom('my-room');
 *
 * // Send offer to peer
 * await signaling.sendOffer(remotePeerId, localSdp);
 * ```
 */
export class SignalingClient {
  private readonly config: Required<SignalingClientConfig>;
  private socket: WebSocket | null = null;
  private state: SignalingClientState = SignalingClientState.DISCONNECTED;
  private currentRoom: RoomId | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingMessages: SignalingMessage[] = [];
  private eventHandlers: SignalingEventHandlers = {};
  private stateChangeListeners: Set<(state: SignalingClientState) => void> = new Set();
  private lastPongTime: number = 0;
  private messageQueue: Map<string, { resolve: () => void; reject: (error: Error) => void; timeout: ReturnType<typeof setTimeout> }> = new Map();

  /**
   * Create a new SignalingClient instance
   *
   * @param config - Signaling client configuration
   */
  constructor(config: SignalingClientConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      authToken: config.authToken ?? '',
    };
  }

  /**
   * Get current client state
   */
  public getState(): SignalingClientState {
    return this.state;
  }

  /**
   * Get local peer ID
   */
  public getPeerId(): PeerId {
    return this.config.peerId;
  }

  /**
   * Get current room ID
   */
  public getCurrentRoom(): RoomId | null {
    return this.currentRoom;
  }

  /**
   * Check if client is connected
   */
  public isConnected(): boolean {
    return this.state === SignalingClientState.CONNECTED;
  }

  /**
   * Register event handlers
   *
   * @param handlers - Event handler functions
   */
  public on(handlers: SignalingEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }

  /**
   * Add state change listener
   *
   * @param listener - Callback function
   * @returns Unsubscribe function
   */
  public onStateChange(listener: (state: SignalingClientState) => void): () => void {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  /**
   * Connect to signaling server
   *
   * @returns Promise that resolves when connected
   * @throws Error if connection fails
   */
  public async connect(): Promise<void> {
    if (this.state === SignalingClientState.CONNECTED) {
      return;
    }

    if (this.state === SignalingClientState.CONNECTING) {
      return this.waitForConnection();
    }

    return new Promise((resolve, reject) => {
      this.setState(SignalingClientState.CONNECTING);

      const url = new URL(this.config.serverUrl);
      url.searchParams.set('peerId', this.config.peerId);
      if (this.config.authToken) {
        url.searchParams.set('token', this.config.authToken);
      }

      try {
        this.socket = new WebSocket(url.toString());
      } catch (error) {
        this.setState(SignalingClientState.FAILED);
        reject(new Error(`Failed to create WebSocket: ${error}`));
        return;
      }

      // Connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.state === SignalingClientState.CONNECTING) {
          this.socket?.close();
          this.setState(SignalingClientState.FAILED);
          reject(new Error('Connection timeout'));
        }
      }, this.config.connectionTimeout);

      this.socket.onopen = () => {
        this.clearConnectionTimeout();
        this.setState(SignalingClientState.CONNECTED);
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.flushPendingMessages();
        resolve();
      };

      this.socket.onclose = (event) => {
        this.handleDisconnect(event.code, event.reason);
      };

      this.socket.onerror = (event) => {
        console.error('WebSocket error:', event);
        if (this.state === SignalingClientState.CONNECTING) {
          this.clearConnectionTimeout();
          reject(new Error('WebSocket connection error'));
        }
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  /**
   * Disconnect from signaling server
   *
   * @param reason - Optional reason for disconnection
   */
  public disconnect(reason?: string): void {
    this.clearReconnectTimeout();
    this.clearHeartbeat();
    this.clearConnectionTimeout();

    if (this.currentRoom) {
      this.leaveRoom(reason).catch(() => {
        // Ignore errors when leaving during disconnect
      });
    }

    if (this.socket) {
      this.socket.onclose = null;
      this.socket.close(1000, reason);
      this.socket = null;
    }

    this.setState(SignalingClientState.CLOSED);
    this.currentRoom = null;
    this.pendingMessages = [];

    // Reject all pending message acknowledgments
    this.messageQueue.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Client disconnected'));
    });
    this.messageQueue.clear();
  }

  /**
   * Join a room for peer discovery
   *
   * @param roomId - Room identifier to join
   * @param metadata - Optional metadata to share with peers
   */
  public async joinRoom(roomId: RoomId, metadata?: Record<string, unknown>): Promise<void> {
    if (this.currentRoom === roomId) {
      return;
    }

    if (this.currentRoom) {
      await this.leaveRoom();
    }

    const message: SignalingJoinRoomMessage = {
      type: SignalingMessageType.JOIN_ROOM,
      id: generateId('msg'),
      from: this.config.peerId,
      roomId,
      timestamp: Date.now(),
      payload: {
        roomId,
        metadata,
      },
    };

    await this.sendMessage(message);
    this.currentRoom = roomId;
  }

  /**
   * Leave current room
   *
   * @param reason - Optional reason for leaving
   */
  public async leaveRoom(reason?: string): Promise<void> {
    if (!this.currentRoom) {
      return;
    }

    const message: SignalingLeaveRoomMessage = {
      type: SignalingMessageType.LEAVE_ROOM,
      id: generateId('msg'),
      from: this.config.peerId,
      roomId: this.currentRoom,
      timestamp: Date.now(),
      payload: {
        roomId: this.currentRoom,
        reason,
      },
    };

    try {
      await this.sendMessage(message);
    } finally {
      this.currentRoom = null;
    }
  }

  /**
   * Send SDP offer to a peer
   *
   * @param to - Target peer ID
   * @param sdp - SDP offer string
   * @param metadata - Optional metadata
   */
  public async sendOffer(to: PeerId, sdp: string, metadata?: Record<string, unknown>): Promise<void> {
    const message: SignalingOfferMessage = {
      type: SignalingMessageType.OFFER,
      id: generateId('msg'),
      from: this.config.peerId,
      to,
      roomId: this.currentRoom ?? undefined,
      timestamp: Date.now(),
      payload: {
        sdp,
        metadata,
      },
    };

    await this.sendMessage(message);
  }

  /**
   * Send SDP answer to a peer
   *
   * @param to - Target peer ID
   * @param sdp - SDP answer string
   * @param metadata - Optional metadata
   */
  public async sendAnswer(to: PeerId, sdp: string, metadata?: Record<string, unknown>): Promise<void> {
    const message: SignalingAnswerMessage = {
      type: SignalingMessageType.ANSWER,
      id: generateId('msg'),
      from: this.config.peerId,
      to,
      roomId: this.currentRoom ?? undefined,
      timestamp: Date.now(),
      payload: {
        sdp,
        metadata,
      },
    };

    await this.sendMessage(message);
  }

  /**
   * Send ICE candidate to a peer
   *
   * @param to - Target peer ID
   * @param candidate - ICE candidate
   */
  public async sendIceCandidate(to: PeerId, candidate: ICECandidate): Promise<void> {
    const message: SignalingICECandidateMessage = {
      type: SignalingMessageType.ICE_CANDIDATE,
      id: generateId('msg'),
      from: this.config.peerId,
      to,
      roomId: this.currentRoom ?? undefined,
      timestamp: Date.now(),
      payload: {
        candidate,
      },
    };

    await this.sendMessage(message);
  }

  /**
   * Request renegotiation with a peer
   *
   * @param to - Target peer ID
   * @param reason - Reason for renegotiation
   */
  public async requestRenegotiation(to: PeerId, reason: string): Promise<void> {
    const message: SignalingMessage = {
      type: SignalingMessageType.RENEGOTIATE,
      id: generateId('msg'),
      from: this.config.peerId,
      to,
      roomId: this.currentRoom ?? undefined,
      timestamp: Date.now(),
      payload: {
        reason,
      },
    };

    await this.sendMessage(message);
  }

  /**
   * Get round-trip time to signaling server
   *
   * @returns RTT in milliseconds, or -1 if not available
   */
  public getServerRTT(): number {
    if (this.lastPongTime === 0) {
      return -1;
    }
    return Date.now() - this.lastPongTime;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async sendMessage(message: SignalingMessage): Promise<void> {
    if (!this.isConnected() || !this.socket) {
      if (this.state === SignalingClientState.CONNECTING || this.state === SignalingClientState.RECONNECTING) {
        // Queue message for later
        this.pendingMessages.push(message);
        return;
      }
      throw new Error('Not connected to signaling server');
    }

    return new Promise((resolve, reject) => {
      try {
        const data = JSON.stringify(message);
        this.socket!.send(data);

        // For messages that need acknowledgment, we could track them here
        // For now, we resolve immediately
        resolve();
      } catch (error) {
        reject(new Error(`Failed to send message: ${error}`));
      }
    });
  }

  private handleMessage(data: string): void {
    let message: SignalingMessage;

    try {
      message = JSON.parse(data) as SignalingMessage;
    } catch (error) {
      console.error('Failed to parse signaling message:', error);
      return;
    }

    switch (message.type) {
      case SignalingMessageType.OFFER:
        this.handleOffer(message as SignalingOfferMessage);
        break;

      case SignalingMessageType.ANSWER:
        this.handleAnswer(message as SignalingAnswerMessage);
        break;

      case SignalingMessageType.ICE_CANDIDATE:
        this.handleIceCandidate(message as SignalingICECandidateMessage);
        break;

      case SignalingMessageType.PEER_JOINED:
        this.handlePeerJoined(message as SignalingPeerJoinedMessage);
        break;

      case SignalingMessageType.PEER_LEFT:
        this.handlePeerLeft(message as SignalingPeerLeftMessage);
        break;

      case SignalingMessageType.ROOM_INFO:
        this.handleRoomInfo(message as SignalingRoomInfoMessage);
        break;

      case SignalingMessageType.PING:
        this.handlePing(message as SignalingPingMessage);
        break;

      case SignalingMessageType.PONG:
        this.handlePong(message as SignalingPongMessage);
        break;

      case SignalingMessageType.ERROR:
        this.handleError(message as SignalingErrorMessage);
        break;

      case SignalingMessageType.RENEGOTIATE:
        this.handleRenegotiate(message);
        break;

      default:
        console.warn('Unknown signaling message type:', (message as SignalingMessage).type);
    }
  }

  private handleOffer(message: SignalingOfferMessage): void {
    this.eventHandlers.onOffer?.(
      message.from,
      message.payload.sdp,
      message.payload.metadata
    );
  }

  private handleAnswer(message: SignalingAnswerMessage): void {
    this.eventHandlers.onAnswer?.(
      message.from,
      message.payload.sdp,
      message.payload.metadata
    );
  }

  private handleIceCandidate(message: SignalingICECandidateMessage): void {
    this.eventHandlers.onIceCandidate?.(message.from, message.payload.candidate);
  }

  private handlePeerJoined(message: SignalingPeerJoinedMessage): void {
    this.eventHandlers.onPeerJoined?.(
      message.payload.peerId,
      message.payload.metadata
    );
  }

  private handlePeerLeft(message: SignalingPeerLeftMessage): void {
    this.eventHandlers.onPeerLeft?.(message.payload.peerId, message.payload.reason);
  }

  private handleRoomInfo(message: SignalingRoomInfoMessage): void {
    this.eventHandlers.onRoomInfo?.(message.payload.roomId, message.payload.peers);
  }

  private handlePing(message: SignalingPingMessage): void {
    // Respond to server ping
    const pong: SignalingPongMessage = {
      type: SignalingMessageType.PONG,
      id: generateId('msg'),
      from: this.config.peerId,
      timestamp: Date.now(),
      payload: {
        originalTimestamp: message.payload.timestamp,
        respondTimestamp: Date.now(),
      },
    };

    this.sendMessage(pong).catch((error) => {
      console.error('Failed to send pong:', error);
    });
  }

  private handlePong(message: SignalingPongMessage): void {
    this.lastPongTime = message.payload.respondTimestamp;
  }

  private handleError(message: SignalingErrorMessage): void {
    this.eventHandlers.onError?.(
      message.payload.code,
      message.payload.message,
      message.payload.details
    );
  }

  private handleRenegotiate(message: SignalingMessage): void {
    if (message.type === SignalingMessageType.RENEGOTIATE) {
      const renegotiateMsg = message as { from: PeerId; payload: { reason: string } };
      this.eventHandlers.onRenegotiate?.(renegotiateMsg.from, renegotiateMsg.payload.reason);
    }
  }

  private handleDisconnect(code: number, reason: string): void {
    this.clearHeartbeat();
    this.socket = null;

    if (this.state === SignalingClientState.CLOSED) {
      return;
    }

    // Normal closure or intentional disconnect
    if (code === 1000) {
      this.setState(SignalingClientState.DISCONNECTED);
      return;
    }

    // Attempt reconnection if enabled
    if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.setState(SignalingClientState.RECONNECTING);
      this.scheduleReconnect();
    } else {
      this.setState(SignalingClientState.FAILED);
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimeout();

    const delay = this.calculateReconnectDelay();

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectAttempts++;

      try {
        await this.connect();

        // Rejoin room if we were in one
        if (this.currentRoom) {
          const room = this.currentRoom;
          this.currentRoom = null;
          await this.joinRoom(room);
        }
      } catch (error) {
        console.error('Reconnection attempt failed:', error);

        if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
          this.scheduleReconnect();
        } else {
          this.setState(SignalingClientState.FAILED);
        }
      }
    }, delay);
  }

  private calculateReconnectDelay(): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.reconnectDelay;
    const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts);
    const maxDelay = 30000; // Cap at 30 seconds
    const jitter = Math.random() * 0.3 * exponentialDelay;

    return Math.min(exponentialDelay + jitter, maxDelay);
  }

  private startHeartbeat(): void {
    this.clearHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (!this.isConnected()) {
        return;
      }

      const ping: SignalingPingMessage = {
        type: SignalingMessageType.PING,
        id: generateId('msg'),
        from: this.config.peerId,
        timestamp: Date.now(),
        payload: {
          timestamp: Date.now(),
        },
      };

      this.sendMessage(ping).catch((error) => {
        console.error('Failed to send heartbeat:', error);
      });
    }, this.config.heartbeatInterval);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  private flushPendingMessages(): void {
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];

    for (const message of messages) {
      this.sendMessage(message).catch((error) => {
        console.error('Failed to send pending message:', error);
      });
    }
  }

  private setState(state: SignalingClientState): void {
    if (this.state === state) {
      return;
    }

    this.state = state;
    this.eventHandlers.onStateChange?.(state);
    this.stateChangeListeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.error('State change listener error:', error);
      }
    });
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, this.config.connectionTimeout);

      const unsubscribe = this.onStateChange((state) => {
        if (state === SignalingClientState.CONNECTED) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        } else if (state === SignalingClientState.FAILED || state === SignalingClientState.CLOSED) {
          clearTimeout(timeout);
          unsubscribe();
          reject(new Error('Connection failed'));
        }
      });
    });
  }
}

export default SignalingClient;

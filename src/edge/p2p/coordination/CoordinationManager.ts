/**
 * Coordination Manager for Two-Machine Coordination
 *
 * Manages coordination between two or more peers in the P2P network.
 * Handles connection establishment, authentication, pattern synchronization,
 * and connection health monitoring.
 *
 * @module edge/p2p/coordination/CoordinationManager
 * @version 1.0.0
 */

import type { PeerId } from '../webrtc/types';
import type { AgentIdentity, KeyPair, IdentityProof } from '../crypto/types';
import type { SharedPattern } from '../sharing/types';
import type {
  CoordinationConfig,
  PeerInfo,
  PeerCapabilities,
  CoordinationMetrics,
  SyncStatus,
  HealthStatus,
  CoordinationEvent,
  CoordinationEventHandler,
  CoordinationMessage,
  AuthChallengePayload,
  AuthResponsePayload,
  AuthResultPayload,
  PingPayload,
  PongPayload,
} from './types';
import {
  CoordinationState,
  CoordinationRole,
  CoordinationEventType,
  CoordinationMessageType,
  CoordinationErrorCode,
  CoordinationError,
  HealthLevel,
  DEFAULT_COORDINATION_CONFIG,
  generateMessageId,
  generateChallenge,
  createDefaultCapabilities,
  createDefaultSyncStatus,
  createDefaultMetrics,
  createDefaultHealthStatus,
  COORDINATION_VERSION,
} from './types';
import { HealthMonitor } from './HealthMonitor';
import { SyncOrchestrator } from './SyncOrchestrator';

// ============================================
// Internal Types
// ============================================

/**
 * Internal peer state tracking
 */
interface InternalPeerState {
  /** Peer information */
  info: PeerInfo;

  /** Health monitor for this peer */
  healthMonitor: HealthMonitor;

  /** Sync orchestrator for this peer */
  syncOrchestrator: SyncOrchestrator;

  /** Pending authentication challenge */
  pendingChallenge?: {
    challenge: string;
    timestamp: number;
    expiresAt: number;
  };

  /** Session ID after authentication */
  sessionId?: string;

  /** Message handlers waiting for responses */
  pendingResponses: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>;

  /** Last message sequence number */
  lastSequence: number;

  /** Connection start time */
  connectionStartTime?: number;
}

/**
 * Message send callback type
 */
type MessageSendCallback = (peerId: PeerId, message: CoordinationMessage) => Promise<void>;

// ============================================
// Coordination Manager Class
// ============================================

/**
 * CoordinationManager - Manages two-machine coordination
 *
 * @example
 * ```typescript
 * const manager = new CoordinationManager({
 *   localIdentity: myIdentity,
 *   localKeyPair: myKeyPair,
 *   autoReconnect: true,
 * });
 *
 * // Set up message transport
 * manager.setMessageSender(async (peerId, message) => {
 *   await dataChannel.send(peerId, JSON.stringify(message));
 * });
 *
 * // Connect to peer
 * await manager.connect('peer-123');
 *
 * // Start synchronization
 * await manager.syncPatterns('peer-123');
 *
 * // Listen for events
 * manager.on(CoordinationEventType.SYNC_COMPLETED, (event) => {
 *   console.log('Sync completed with', event.peerId);
 * });
 * ```
 */
export class CoordinationManager {
  private readonly config: CoordinationConfig;
  private readonly localCapabilities: PeerCapabilities;
  private readonly peers: Map<PeerId, InternalPeerState> = new Map();
  private readonly eventHandlers: Map<CoordinationEventType, Set<CoordinationEventHandler>> = new Map();
  private messageSender?: MessageSendCallback;
  private isDestroyed = false;

  // Logging (initialized in setupLogging called from constructor)
  private log!: (...args: unknown[]) => void;
  private logDebug!: (...args: unknown[]) => void;
  private logWarn!: (...args: unknown[]) => void;
  private logError!: (...args: unknown[]) => void;

  /**
   * Create a new CoordinationManager
   *
   * @param config - Coordination configuration
   */
  constructor(config: Partial<CoordinationConfig> & Pick<CoordinationConfig, 'localIdentity' | 'localKeyPair'>) {
    this.config = {
      ...DEFAULT_COORDINATION_CONFIG,
      ...config,
      syncConfig: {
        ...DEFAULT_COORDINATION_CONFIG.syncConfig,
        ...config.syncConfig,
      },
    };

    this.localCapabilities = createDefaultCapabilities();

    // Setup logging
    this.setupLogging();
  }

  // ============================================
  // Public API - Connection Management
  // ============================================

  /**
   * Set the message sender callback for transport
   */
  setMessageSender(sender: MessageSendCallback): void {
    this.messageSender = sender;
  }

  /**
   * Connect to a peer
   *
   * @param peerId - Peer to connect to
   * @param role - Role in the connection
   * @returns Promise resolving when connected
   */
  async connect(peerId: PeerId, role?: CoordinationRole): Promise<PeerInfo> {
    this.ensureNotDestroyed();

    // Check if already connected
    const existing = this.peers.get(peerId);
    if (existing && existing.info.state === 'synchronized' as unknown as CoordinationState) {
      return existing.info;
    }

    const connectionRole = role ?? this.config.defaultRole;

    this.log(`Connecting to peer: ${peerId} with role: ${connectionRole}`);

    // Create peer state
    const peerState = this.createPeerState(peerId, connectionRole);
    this.peers.set(peerId, peerState);

    // Update state to connecting
    this.updatePeerState(peerId, CoordinationState.CONNECTING);

    try {
      // If initiator, send auth challenge
      if (connectionRole === 'initiator' || connectionRole === 'bidirectional') {
        await this.sendAuthChallenge(peerId, peerState);
      }

      return peerState.info;
    } catch (error) {
      this.updatePeerState(peerId, CoordinationState.ERROR);
      throw error;
    }
  }

  /**
   * Disconnect from a peer
   *
   * @param peerId - Peer to disconnect from
   * @param reason - Reason for disconnection
   */
  async disconnect(peerId: PeerId, reason?: string): Promise<void> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      return;
    }

    this.log(`Disconnecting from peer: ${peerId}, reason: ${reason ?? 'user requested'}`);

    try {
      // Send disconnect message
      await this.sendMessage(peerId, {
        type: CoordinationMessageType.DISCONNECT,
        messageId: generateMessageId(),
        senderId: this.config.localIdentity.agentId,
        payload: { reason: reason ?? 'disconnect requested' },
        timestamp: Date.now(),
      });
    } catch {
      // Ignore send errors during disconnect
    }

    // Cleanup peer state
    this.cleanupPeer(peerId);

    this.emit(CoordinationEventType.PEER_DISCONNECTED, peerId, { reason });
  }

  /**
   * Handle incoming message from a peer
   *
   * @param peerId - Sender peer ID
   * @param message - Received message
   */
  async handleMessage(peerId: PeerId, message: CoordinationMessage): Promise<void> {
    this.ensureNotDestroyed();

    let peerState = this.peers.get(peerId);

    // Create peer state if this is a new incoming connection
    if (!peerState) {
      peerState = this.createPeerState(peerId, CoordinationRole.RESPONDER);
      this.peers.set(peerId, peerState);
    }

    // Update metrics
    peerState.info.metrics.messagesReceived++;
    peerState.info.lastSeenAt = Date.now();

    this.logDebug(`Received message from ${peerId}: ${message.type}`);

    try {
      switch (message.type) {
        case CoordinationMessageType.AUTH_CHALLENGE:
          await this.handleAuthChallenge(peerId, peerState, message.payload as AuthChallengePayload, message.messageId);
          break;

        case CoordinationMessageType.AUTH_RESPONSE:
          await this.handleAuthResponse(peerId, peerState, message.payload as AuthResponsePayload, message.correlationId);
          break;

        case CoordinationMessageType.AUTH_RESULT:
          await this.handleAuthResult(peerId, peerState, message.payload as AuthResultPayload);
          break;

        case CoordinationMessageType.CAPABILITIES:
          await this.handleCapabilities(peerId, peerState, message.payload as PeerCapabilities);
          break;

        case CoordinationMessageType.PING:
          await this.handlePing(peerId, peerState, message.payload as PingPayload);
          break;

        case CoordinationMessageType.PONG:
          await this.handlePong(peerId, peerState, message.payload as PongPayload);
          break;

        case CoordinationMessageType.SYNC_REQUEST:
        case CoordinationMessageType.SYNC_RESPONSE:
        case CoordinationMessageType.SYNC_COMPLETE:
        case CoordinationMessageType.PATTERN_BATCH:
          await peerState.syncOrchestrator.handleMessage(message);
          break;

        case CoordinationMessageType.CONFLICT:
          await this.handleConflict(peerId, peerState, message.payload);
          break;

        case CoordinationMessageType.ERROR:
          await this.handleError(peerId, peerState, message.payload);
          break;

        case CoordinationMessageType.DISCONNECT:
          await this.handleDisconnect(peerId, peerState, message.payload as { reason?: string });
          break;

        default:
          this.logWarn(`Unknown message type: ${message.type}`);
      }

      // Resolve pending response if this is a response
      if (message.correlationId) {
        const pending = peerState.pendingResponses.get(message.correlationId);
        if (pending) {
          clearTimeout(pending.timeout);
          pending.resolve(message.payload);
          peerState.pendingResponses.delete(message.correlationId);
        }
      }
    } catch (error) {
      this.logError(`Error handling message from ${peerId}:`, error);
      this.emit(CoordinationEventType.ERROR, peerId, { error, message });
    }
  }

  // ============================================
  // Public API - Synchronization
  // ============================================

  /**
   * Start pattern synchronization with a peer
   *
   * @param peerId - Peer to sync with
   * @param patterns - Local patterns to sync
   * @returns Sync result
   */
  async syncPatterns(peerId: PeerId, patterns?: SharedPattern[]): Promise<SyncStatus> {
    const peerState = this.getPeerStateOrThrow(peerId);

    if (!peerState.info.isAuthenticated) {
      throw new CoordinationError(
        'Peer not authenticated',
        CoordinationErrorCode.PEER_NOT_AUTHENTICATED,
        peerId
      );
    }

    this.log(`Starting pattern sync with peer: ${peerId}`);
    this.updatePeerState(peerId, CoordinationState.SYNCING);

    this.emit(CoordinationEventType.SYNC_STARTED, peerId, {
      patternCount: patterns?.length ?? 0,
    });

    try {
      const result = await peerState.syncOrchestrator.startSync(patterns);

      if (result.state === 'completed') {
        this.updatePeerState(peerId, CoordinationState.SYNCHRONIZED);
        peerState.info.metrics.successfulSyncs++;

        this.emit(CoordinationEventType.SYNC_COMPLETED, peerId, result);
      } else if (result.state === 'failed') {
        peerState.info.metrics.failedSyncs++;
        this.emit(CoordinationEventType.SYNC_FAILED, peerId, result);
      }

      return result;
    } catch (error) {
      peerState.info.metrics.failedSyncs++;
      this.emit(CoordinationEventType.SYNC_FAILED, peerId, { error });
      throw error;
    }
  }

  /**
   * Get sync status for a peer
   */
  getSyncStatus(peerId: PeerId): SyncStatus | undefined {
    return this.peers.get(peerId)?.info.syncStatus;
  }

  // ============================================
  // Public API - Health & Metrics
  // ============================================

  /**
   * Get health status for a peer
   */
  getHealthStatus(peerId: PeerId): HealthStatus | undefined {
    return this.peers.get(peerId)?.info.health;
  }

  /**
   * Get coordination metrics for a peer
   */
  getMetrics(peerId: PeerId): CoordinationMetrics | undefined {
    return this.peers.get(peerId)?.info.metrics;
  }

  /**
   * Get peer information
   */
  getPeerInfo(peerId: PeerId): PeerInfo | undefined {
    return this.peers.get(peerId)?.info;
  }

  /**
   * Get all connected peers
   */
  getConnectedPeers(): PeerInfo[] {
    return Array.from(this.peers.values())
      .filter((state) => state.info.state !== CoordinationState.DISCONNECTED &&
                         state.info.state !== CoordinationState.ERROR)
      .map((state) => state.info);
  }

  /**
   * Get all authenticated peers
   */
  getAuthenticatedPeers(): PeerInfo[] {
    return Array.from(this.peers.values())
      .filter((state) => state.info.isAuthenticated)
      .map((state) => state.info);
  }

  /**
   * Get coordination state for a peer
   */
  getState(peerId: PeerId): CoordinationState | undefined {
    return this.peers.get(peerId)?.info.state;
  }

  /**
   * Get local identity
   */
  getLocalIdentity(): AgentIdentity {
    return this.config.localIdentity;
  }

  // ============================================
  // Public API - Events
  // ============================================

  /**
   * Register event handler
   *
   * @param event - Event type to handle
   * @param handler - Event handler function
   * @returns Unsubscribe function
   */
  on<T = unknown>(event: CoordinationEventType, handler: CoordinationEventHandler<T>): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)!.add(handler as CoordinationEventHandler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler as CoordinationEventHandler);
    };
  }

  /**
   * Remove event handler
   */
  off(event: CoordinationEventType, handler: CoordinationEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  // ============================================
  // Public API - Lifecycle
  // ============================================

  /**
   * Destroy the coordination manager
   */
  async destroy(): Promise<void> {
    this.isDestroyed = true;

    // Disconnect all peers
    const disconnectPromises = Array.from(this.peers.keys()).map((peerId) =>
      this.disconnect(peerId, 'manager destroyed')
    );

    await Promise.all(disconnectPromises);

    // Clear event handlers
    this.eventHandlers.clear();

    this.log('CoordinationManager destroyed');
  }

  // ============================================
  // Private - Authentication
  // ============================================

  private async sendAuthChallenge(peerId: PeerId, peerState: InternalPeerState): Promise<void> {
    const challenge = generateChallenge();
    const timestamp = Date.now();
    const expiresIn = this.config.authTimeout;

    // Store pending challenge
    peerState.pendingChallenge = {
      challenge,
      timestamp,
      expiresAt: timestamp + expiresIn,
    };

    this.updatePeerState(peerId, CoordinationState.AUTHENTICATING);

    const payload: AuthChallengePayload = {
      challenge,
      timestamp: new Date(timestamp).toISOString(),
      expiresIn,
      capabilities: this.localCapabilities,
    };

    await this.sendMessage(peerId, {
      type: CoordinationMessageType.AUTH_CHALLENGE,
      messageId: generateMessageId(),
      senderId: this.config.localIdentity.agentId,
      payload,
      timestamp,
    });
  }

  private async handleAuthChallenge(
    peerId: PeerId,
    peerState: InternalPeerState,
    payload: AuthChallengePayload,
    messageId: string
  ): Promise<void> {
    this.log(`Received auth challenge from ${peerId}`);
    this.updatePeerState(peerId, CoordinationState.AUTHENTICATING);

    // Update peer capabilities
    peerState.info.capabilities = payload.capabilities;

    // Create identity proof by signing the challenge
    const identityProof = await this.createIdentityProof(payload.challenge, payload.expiresIn);

    const response: AuthResponsePayload = {
      identityProof,
      capabilities: this.localCapabilities,
    };

    await this.sendMessage(peerId, {
      type: CoordinationMessageType.AUTH_RESPONSE,
      messageId: generateMessageId(),
      correlationId: messageId,
      senderId: this.config.localIdentity.agentId,
      payload: response,
      timestamp: Date.now(),
    });
  }

  private async handleAuthResponse(
    peerId: PeerId,
    peerState: InternalPeerState,
    payload: AuthResponsePayload,
    correlationId?: string
  ): Promise<void> {
    this.log(`Received auth response from ${peerId}`);

    // Verify we have a pending challenge
    if (!peerState.pendingChallenge) {
      throw new CoordinationError(
        'No pending challenge',
        CoordinationErrorCode.AUTH_FAILED,
        peerId
      );
    }

    // Check challenge hasn't expired
    if (Date.now() > peerState.pendingChallenge.expiresAt) {
      throw new CoordinationError(
        'Challenge expired',
        CoordinationErrorCode.AUTH_TIMEOUT,
        peerId
      );
    }

    // Verify the identity proof
    const isValid = await this.verifyIdentityProof(
      payload.identityProof,
      peerState.pendingChallenge.challenge
    );

    // Clear pending challenge
    peerState.pendingChallenge = undefined;

    if (!isValid) {
      peerState.info.isAuthenticated = false;
      this.emit(CoordinationEventType.AUTH_FAILED, peerId, { reason: 'Invalid signature' });

      await this.sendMessage(peerId, {
        type: CoordinationMessageType.AUTH_RESULT,
        messageId: generateMessageId(),
        correlationId,
        senderId: this.config.localIdentity.agentId,
        payload: { success: false, error: 'Invalid signature' } as AuthResultPayload,
        timestamp: Date.now(),
      });

      return;
    }

    // Check trust if callback provided
    if (this.config.onVerifyTrust) {
      const identity: AgentIdentity = {
        agentId: payload.identityProof.agentId,
        publicKey: payload.identityProof.publicKey,
        createdAt: new Date().toISOString(),
      };

      const isTrusted = await this.config.onVerifyTrust(identity);
      peerState.info.isTrusted = isTrusted;
    }

    // Update peer info
    peerState.info.identity = {
      agentId: payload.identityProof.agentId,
      publicKey: payload.identityProof.publicKey,
      createdAt: new Date().toISOString(),
    };
    peerState.info.publicKey = payload.identityProof.publicKey;
    peerState.info.capabilities = payload.capabilities;
    peerState.info.isAuthenticated = true;

    // Generate session ID
    const sessionId = `session-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    peerState.sessionId = sessionId;

    // Send success result
    await this.sendMessage(peerId, {
      type: CoordinationMessageType.AUTH_RESULT,
      messageId: generateMessageId(),
      correlationId,
      senderId: this.config.localIdentity.agentId,
      payload: {
        success: true,
        sessionId,
        capabilities: this.localCapabilities,
      } as AuthResultPayload,
      timestamp: Date.now(),
    });

    this.log(`Peer ${peerId} authenticated successfully`);
    this.emit(CoordinationEventType.PEER_AUTHENTICATED, peerId, {
      identity: peerState.info.identity,
      sessionId,
    });

    // Update state based on sync config
    if (this.config.syncConfig.autoSyncOnConnect) {
      this.updatePeerState(peerId, CoordinationState.SYNCING);
    } else {
      this.updatePeerState(peerId, CoordinationState.SYNCHRONIZED);
    }
  }

  private async handleAuthResult(
    peerId: PeerId,
    peerState: InternalPeerState,
    payload: AuthResultPayload
  ): Promise<void> {
    if (!payload.success) {
      this.logError(`Authentication failed with ${peerId}: ${payload.error}`);
      peerState.info.isAuthenticated = false;
      this.updatePeerState(peerId, CoordinationState.ERROR);
      this.emit(CoordinationEventType.AUTH_FAILED, peerId, { error: payload.error });
      return;
    }

    this.log(`Authentication successful with ${peerId}`);

    peerState.info.isAuthenticated = true;
    peerState.sessionId = payload.sessionId;

    if (payload.capabilities) {
      peerState.info.capabilities = payload.capabilities;
    }

    peerState.info.connectedAt = Date.now();

    this.emit(CoordinationEventType.PEER_AUTHENTICATED, peerId, {
      sessionId: payload.sessionId,
    });

    this.emit(CoordinationEventType.PEER_CONNECTED, peerId, {
      capabilities: peerState.info.capabilities,
    });

    // Update state
    if (this.config.syncConfig.autoSyncOnConnect) {
      this.updatePeerState(peerId, CoordinationState.SYNCING);
    } else {
      this.updatePeerState(peerId, CoordinationState.SYNCHRONIZED);
    }
  }

  private async createIdentityProof(challenge: string, expiresIn: number): Promise<IdentityProof> {
    // Sign the challenge with our private key
    const encoder = new TextEncoder();
    const data = encoder.encode(challenge);

    // Import private key and sign
    // In a real implementation, use proper Ed25519 signing via @noble/ed25519
    // For browser compatibility, we use a simplified approach
    const signature = await this.signData(data);

    return {
      agentId: this.config.localIdentity.agentId,
      publicKey: this.config.localKeyPair.publicKey,
      challenge,
      signature: this.arrayToBase64(signature),
      timestamp: new Date().toISOString(),
      expiresIn,
    };
  }

  private async verifyIdentityProof(proof: IdentityProof, expectedChallenge: string): Promise<boolean> {
    // Verify challenge matches
    if (proof.challenge !== expectedChallenge) {
      return false;
    }

    // Check expiration
    const proofTime = new Date(proof.timestamp).getTime();
    if (Date.now() > proofTime + proof.expiresIn) {
      return false;
    }

    // Verify signature
    // In a real implementation, use proper Ed25519 verification
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(proof.challenge);
      const signature = this.base64ToArray(proof.signature);
      const publicKey = this.base64ToArray(proof.publicKey);

      return await this.verifySignature(data, signature, publicKey);
    } catch {
      return false;
    }
  }

  // ============================================
  // Private - Health Monitoring
  // ============================================

  private async handlePing(peerId: PeerId, peerState: InternalPeerState, payload: PingPayload): Promise<void> {
    const pong: PongPayload = {
      sequence: payload.sequence,
      originalTimestamp: payload.timestamp,
      timestamp: Date.now(),
    };

    await this.sendMessage(peerId, {
      type: CoordinationMessageType.PONG,
      messageId: generateMessageId(),
      senderId: this.config.localIdentity.agentId,
      payload: pong,
      timestamp: Date.now(),
    });
  }

  private async handlePong(_peerId: PeerId, peerState: InternalPeerState, payload: PongPayload): Promise<void> {
    peerState.healthMonitor.recordPong(payload.sequence, payload.originalTimestamp, payload.timestamp);
  }

  private async handleCapabilities(peerId: PeerId, peerState: InternalPeerState, capabilities: PeerCapabilities): Promise<void> {
    peerState.info.capabilities = capabilities;
    this.log(`Updated capabilities for ${peerId}`);
  }

  private async handleConflict(peerId: PeerId, peerState: InternalPeerState, payload: unknown): Promise<void> {
    peerState.info.metrics.conflictsDetected++;
    this.emit(CoordinationEventType.CONFLICT_DETECTED, peerId, payload);
  }

  private async handleError(peerId: PeerId, _peerState: InternalPeerState, payload: unknown): Promise<void> {
    this.logError(`Received error from ${peerId}:`, payload);
    this.emit(CoordinationEventType.ERROR, peerId, payload);
  }

  private async handleDisconnect(peerId: PeerId, _peerState: InternalPeerState, payload: { reason?: string }): Promise<void> {
    this.log(`Peer ${peerId} disconnected: ${payload.reason ?? 'no reason given'}`);
    this.cleanupPeer(peerId);
    this.emit(CoordinationEventType.PEER_DISCONNECTED, peerId, payload);
  }

  // ============================================
  // Private - Peer State Management
  // ============================================

  private createPeerState(peerId: PeerId, role: CoordinationRole): InternalPeerState {
    const info: PeerInfo = {
      peerId,
      state: CoordinationState.DISCONNECTED,
      role,
      health: createDefaultHealthStatus(),
      metrics: createDefaultMetrics(),
      syncStatus: createDefaultSyncStatus(),
      isAuthenticated: false,
      isTrusted: false,
      capabilities: createDefaultCapabilities(),
      lastSeenAt: Date.now(),
      reconnectAttempts: 0,
    };

    const healthMonitor = new HealthMonitor({
      peerId,
      pingInterval: this.config.pingInterval,
      onPing: async (sequence) => {
        await this.sendPing(peerId, sequence);
      },
      onHealthChange: (health) => {
        const peerState = this.peers.get(peerId);
        if (peerState) {
          peerState.info.health = health;
          this.handleHealthChange(peerId, health);
        }
      },
    });

    const syncOrchestrator = new SyncOrchestrator({
      localAgentId: this.config.localIdentity.agentId,
      peerId,
      config: this.config.syncConfig,
      sendMessage: async (message) => {
        await this.sendMessage(peerId, message);
      },
      onSyncProgress: (status) => {
        const peerState = this.peers.get(peerId);
        if (peerState) {
          peerState.info.syncStatus = status;
          this.emit(CoordinationEventType.SYNC_PROGRESS, peerId, status);
        }
      },
    });

    return {
      info,
      healthMonitor,
      syncOrchestrator,
      pendingResponses: new Map(),
      lastSequence: 0,
    };
  }

  private updatePeerState(peerId: PeerId, newState: CoordinationState): void {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      return;
    }

    const previousState = peerState.info.state;
    peerState.info.state = newState;

    this.emit(CoordinationEventType.STATE_CHANGED, peerId, {
      previousState,
      newState,
    });
  }

  private handleHealthChange(peerId: PeerId, health: HealthStatus): void {
    if (health.level === HealthLevel.WARNING) {
      this.emit(CoordinationEventType.HEALTH_WARNING, peerId, health);

      // Update state to degraded if currently synchronized
      const peerState = this.peers.get(peerId);
      if (peerState?.info.state === CoordinationState.SYNCHRONIZED) {
        this.updatePeerState(peerId, CoordinationState.DEGRADED);
      }
    } else if (health.level === HealthLevel.CRITICAL || health.level === HealthLevel.UNHEALTHY) {
      this.emit(CoordinationEventType.HEALTH_CRITICAL, peerId, health);

      // Trigger reconnection if configured
      if (this.config.autoReconnect) {
        this.attemptReconnection(peerId);
      }
    } else if (health.level === HealthLevel.HEALTHY) {
      // Recover from degraded state
      const peerState = this.peers.get(peerId);
      if (peerState?.info.state === CoordinationState.DEGRADED) {
        this.updatePeerState(peerId, CoordinationState.SYNCHRONIZED);
        this.emit(CoordinationEventType.HEALTH_RECOVERED, peerId, health);
      }
    }
  }

  private async attemptReconnection(peerId: PeerId): Promise<void> {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      return;
    }

    if (peerState.info.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.logError(`Max reconnection attempts reached for ${peerId}`);
      this.updatePeerState(peerId, CoordinationState.ERROR);
      this.emit(CoordinationEventType.RECONNECT_FAILED, peerId, {
        attempts: peerState.info.reconnectAttempts,
      });
      return;
    }

    peerState.info.reconnectAttempts++;
    peerState.info.metrics.reconnectionAttempts++;
    this.updatePeerState(peerId, CoordinationState.RECONNECTING);

    this.emit(CoordinationEventType.RECONNECTING, peerId, {
      attempt: peerState.info.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
    });

    // Exponential backoff
    const delay = Math.min(
      1000 * Math.pow(2, peerState.info.reconnectAttempts - 1),
      this.config.reconnectTimeout
    );

    await this.delay(delay);

    try {
      // Reset authentication state
      peerState.info.isAuthenticated = false;
      peerState.pendingChallenge = undefined;
      peerState.sessionId = undefined;

      // Attempt to reconnect
      await this.sendAuthChallenge(peerId, peerState);
    } catch (error) {
      this.logError(`Reconnection attempt ${peerState.info.reconnectAttempts} failed:`, error);
      await this.attemptReconnection(peerId);
    }
  }

  private cleanupPeer(peerId: PeerId): void {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      return;
    }

    // Stop health monitoring
    peerState.healthMonitor.stop();

    // Stop sync orchestrator
    peerState.syncOrchestrator.stop();

    // Clear pending responses
    peerState.pendingResponses.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Peer disconnected'));
    });
    peerState.pendingResponses.clear();

    // Remove from peers map
    this.peers.delete(peerId);
  }

  private getPeerStateOrThrow(peerId: PeerId): InternalPeerState {
    const peerState = this.peers.get(peerId);
    if (!peerState) {
      throw new CoordinationError(
        `Peer not found: ${peerId}`,
        CoordinationErrorCode.PEER_NOT_FOUND,
        peerId
      );
    }
    return peerState;
  }

  // ============================================
  // Private - Messaging
  // ============================================

  private async sendMessage(peerId: PeerId, message: CoordinationMessage): Promise<void> {
    if (!this.messageSender) {
      throw new CoordinationError(
        'No message sender configured',
        CoordinationErrorCode.CONNECTION_FAILED,
        peerId
      );
    }

    const peerState = this.peers.get(peerId);
    if (peerState) {
      peerState.info.metrics.messagesSent++;
    }

    await this.messageSender(peerId, message);
  }

  private async sendPing(peerId: PeerId, sequence: number): Promise<void> {
    const payload: PingPayload = {
      sequence,
      timestamp: Date.now(),
    };

    await this.sendMessage(peerId, {
      type: CoordinationMessageType.PING,
      messageId: generateMessageId(),
      senderId: this.config.localIdentity.agentId,
      payload,
      timestamp: Date.now(),
    });
  }

  // ============================================
  // Private - Crypto Helpers
  // ============================================

  private async signData(data: Uint8Array): Promise<Uint8Array> {
    // Simplified signing using Web Crypto API
    // In production, use proper Ed25519 signing via @noble/ed25519
    const keyData = this.base64ToArray(this.config.localKeyPair.privateKey);

    // Use HMAC as a placeholder for Ed25519 signing
    // This is for demonstration - use proper Ed25519 in production
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.slice(0, 32).buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer);
    return new Uint8Array(signature);
  }

  private async verifySignature(data: Uint8Array, signature: Uint8Array, publicKey: Uint8Array): Promise<boolean> {
    // Simplified verification using Web Crypto API
    // In production, use proper Ed25519 verification
    try {
      const key = await crypto.subtle.importKey(
        'raw',
        publicKey.buffer as ArrayBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      return await crypto.subtle.verify('HMAC', key, signature.buffer as ArrayBuffer, data.buffer as ArrayBuffer);
    } catch {
      return false;
    }
  }

  private arrayToBase64(array: Uint8Array): string {
    return btoa(Array.from(array).map((b) => String.fromCharCode(b)).join(''));
  }

  private base64ToArray(base64: string): Uint8Array {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return array;
  }

  // ============================================
  // Private - Utilities
  // ============================================

  private emit<T>(type: CoordinationEventType, peerId: PeerId | undefined, data: T): void {
    const event: CoordinationEvent<T> = {
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
        this.logError(`Event handler error for ${type}:`, error);
      }
    });
  }

  private ensureNotDestroyed(): void {
    if (this.isDestroyed) {
      throw new CoordinationError(
        'CoordinationManager has been destroyed',
        CoordinationErrorCode.CONNECTION_CLOSED
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private setupLogging(): void {
    const noop = () => {};

    if (!this.config.enableLogging) {
      this.log = noop;
      this.logDebug = noop;
      this.logWarn = noop;
      this.logError = noop;
      return;
    }

    const prefix = '[CoordinationManager]';

    this.log = (...args) => console.log(prefix, ...args);
    this.logDebug = this.config.logLevel === 'debug'
      ? (...args) => console.debug(prefix, ...args)
      : noop;
    this.logWarn = ['debug', 'info', 'warn'].includes(this.config.logLevel)
      ? (...args) => console.warn(prefix, ...args)
      : noop;
    this.logError = (...args) => console.error(prefix, ...args);
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new CoordinationManager instance
 */
export function createCoordinationManager(
  config: Partial<CoordinationConfig> & Pick<CoordinationConfig, 'localIdentity' | 'localKeyPair'>
): CoordinationManager {
  return new CoordinationManager(config);
}

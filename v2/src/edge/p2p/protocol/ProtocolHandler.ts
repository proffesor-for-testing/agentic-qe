/**
 * Protocol Handler for Agent-to-Agent Communication
 *
 * Manages protocol state machine, message signing/verification using Ed25519,
 * heartbeat/keepalive management, protocol version negotiation, and rate limiting.
 *
 * @module edge/p2p/protocol/ProtocolHandler
 * @version 1.0.0
 */

import type { KeyPair, AgentIdentity, SignedMessage, IdentityProof } from '../crypto';
import { Signer, base64Utils } from '../crypto';
import type {
  ProtocolEnvelope,
  ProtocolHeader,
  ProtocolStateTransition,
  RateLimitConfig,
  RateLimitStatus,
  HandshakePayload,
  HandshakeAckPayload,
  HeartbeatPayload,
  ClosePayload,
  AckPayload,
  NackPayload,
  EventPayload,
  RequestPayload,
  ResponsePayload,
  MessageMetadata,
} from './types';
import {
  ProtocolState,
  ProtocolError,
  ProtocolErrorCode,
  MessageType,
  MessagePriority,
  DeliverySemantics,
  RoutingMode,
  ProtocolFeature,
  CloseCode,
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,
  DEFAULT_FEATURES,
  DEFAULT_RATE_LIMIT,
  DEFAULT_HEARTBEAT_INTERVAL,
  DEFAULT_MESSAGE_TTL,
  generateMessageId,
  generateSessionId,
  generateTraceId,
  generateSpanId,
  isVersionSupported,
  isRetryableError,
  createDefaultHeader,
} from './types';
import { MessageEncoder } from './MessageEncoder';

// ============================================
// Types
// ============================================

/**
 * Protocol handler configuration
 */
export interface ProtocolHandlerConfig {
  /** Local agent identity */
  identity: AgentIdentity;
  /** Key pair for signing */
  keyPair: KeyPair;
  /** Supported protocol versions */
  supportedVersions?: string[];
  /** Supported features */
  features?: ProtocolFeature[];
  /** Heartbeat interval (ms) */
  heartbeatInterval?: number;
  /** Heartbeat timeout (ms) */
  heartbeatTimeout?: number;
  /** Rate limit configuration */
  rateLimit?: Partial<RateLimitConfig>;
  /** Enable distributed tracing */
  enableTracing?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Protocol handler event types
 */
export enum ProtocolEventType {
  STATE_CHANGED = 'state_changed',
  MESSAGE_SIGNED = 'message_signed',
  MESSAGE_VERIFIED = 'message_verified',
  VERIFICATION_FAILED = 'verification_failed',
  HANDSHAKE_STARTED = 'handshake_started',
  HANDSHAKE_COMPLETED = 'handshake_completed',
  HANDSHAKE_FAILED = 'handshake_failed',
  HEARTBEAT_SENT = 'heartbeat_sent',
  HEARTBEAT_RECEIVED = 'heartbeat_received',
  HEARTBEAT_TIMEOUT = 'heartbeat_timeout',
  RATE_LIMITED = 'rate_limited',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

/**
 * Protocol handler event
 */
export interface ProtocolEvent {
  type: ProtocolEventType;
  timestamp: number;
  details?: unknown;
}

/**
 * Protocol event handler
 */
export type ProtocolEventHandler = (event: ProtocolEvent) => void;

/**
 * Handshake result
 */
export interface HandshakeResult {
  /** Whether handshake succeeded */
  success: boolean;
  /** Agreed protocol version */
  agreedVersion?: string;
  /** Agreed features */
  agreedFeatures?: ProtocolFeature[];
  /** Session ID */
  sessionId?: string;
  /** Remote agent identity */
  remoteIdentity?: AgentIdentity;
  /** Error if handshake failed */
  error?: ProtocolError;
}

/**
 * Rate limiter bucket
 */
interface RateLimitBucket {
  tokens: number;
  lastRefill: number;
  messageCount: number;
  byteCount: number;
}

// ============================================
// ProtocolHandler Class
// ============================================

/**
 * Protocol handler for agent-to-agent communication
 *
 * @example
 * ```typescript
 * const handler = new ProtocolHandler({
 *   identity: myIdentity,
 *   keyPair: myKeyPair,
 * });
 *
 * // Start handshake
 * const handshakeEnvelope = await handler.createHandshake();
 *
 * // Process incoming handshake
 * const result = await handler.processHandshake(receivedEnvelope);
 *
 * // Create signed message
 * const envelope = await handler.createMessage(MessageType.REQUEST, payload);
 *
 * // Verify incoming message
 * const verified = await handler.verifyMessage(receivedEnvelope);
 * ```
 */
export class ProtocolHandler {
  private state: ProtocolState = ProtocolState.IDLE;
  private identity: AgentIdentity;
  private keyPair: KeyPair;
  private config: Required<ProtocolHandlerConfig>;
  private encoder: MessageEncoder;
  private eventHandlers: ProtocolEventHandler[] = [];

  // Session state
  private sessionId: string | null = null;
  private remoteIdentity: AgentIdentity | null = null;
  private agreedVersion: string = PROTOCOL_VERSION;
  private agreedFeatures: ProtocolFeature[] = [];

  // Heartbeat state
  private heartbeatSequence = 0;
  private lastHeartbeatSent = 0;
  private lastHeartbeatReceived = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Rate limiting state
  private rateLimitBucket: RateLimitBucket;
  private rateLimitConfig: RateLimitConfig;

  // Message tracking
  private messageSequence = 0;
  private processedMessages: Set<string> = new Set();
  private messageTimestamps: Map<string, number> = new Map();

  // Tracing
  private currentTraceId: string | null = null;

  constructor(config: ProtocolHandlerConfig) {
    this.identity = config.identity;
    this.keyPair = config.keyPair;

    this.config = {
      identity: config.identity,
      keyPair: config.keyPair,
      supportedVersions: config.supportedVersions ?? [PROTOCOL_VERSION],
      features: config.features ?? DEFAULT_FEATURES,
      heartbeatInterval: config.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL,
      heartbeatTimeout: config.heartbeatTimeout ?? DEFAULT_HEARTBEAT_INTERVAL * 2,
      rateLimit: config.rateLimit ?? {},
      enableTracing: config.enableTracing ?? false,
      metadata: config.metadata ?? {},
    };

    this.rateLimitConfig = {
      ...DEFAULT_RATE_LIMIT,
      ...this.config.rateLimit,
    };

    this.rateLimitBucket = {
      tokens: this.rateLimitConfig.burstSize,
      lastRefill: Date.now(),
      messageCount: 0,
      byteCount: 0,
    };

    this.encoder = new MessageEncoder();

    if (this.config.enableTracing) {
      this.currentTraceId = generateTraceId();
    }
  }

  // ============================================
  // State Management
  // ============================================

  /**
   * Get current protocol state
   */
  getState(): ProtocolState {
    return this.state;
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: ProtocolState, reason: string): void {
    const oldState = this.state;
    this.state = newState;

    const transition: ProtocolStateTransition = {
      from: oldState,
      to: newState,
      reason,
      timestamp: Date.now(),
    };

    this.emit({
      type: ProtocolEventType.STATE_CHANGED,
      timestamp: Date.now(),
      details: transition,
    });
  }

  /**
   * Validate state transition
   */
  private validateStateTransition(targetState: ProtocolState): void {
    const validTransitions: Record<ProtocolState, ProtocolState[]> = {
      [ProtocolState.IDLE]: [ProtocolState.CONNECTING, ProtocolState.CLOSED],
      [ProtocolState.CONNECTING]: [
        ProtocolState.ACTIVE,
        ProtocolState.ERROR,
        ProtocolState.CLOSED,
      ],
      [ProtocolState.ACTIVE]: [ProtocolState.CLOSING, ProtocolState.ERROR],
      [ProtocolState.CLOSING]: [ProtocolState.CLOSED, ProtocolState.ERROR],
      [ProtocolState.CLOSED]: [ProtocolState.IDLE],
      [ProtocolState.ERROR]: [ProtocolState.IDLE, ProtocolState.CLOSED],
    };

    if (!validTransitions[this.state].includes(targetState)) {
      throw new ProtocolError(
        `Invalid state transition from ${this.state} to ${targetState}`,
        ProtocolErrorCode.INVALID_STATE
      );
    }
  }

  // ============================================
  // Handshake
  // ============================================

  /**
   * Create handshake message to initiate connection
   */
  async createHandshake(): Promise<ProtocolEnvelope<HandshakePayload>> {
    if (this.state !== ProtocolState.IDLE) {
      throw new ProtocolError(
        'Can only initiate handshake from IDLE state',
        ProtocolErrorCode.INVALID_STATE
      );
    }

    this.transitionTo(ProtocolState.CONNECTING, 'Initiating handshake');

    // Generate challenge for identity proof
    const challenge = Signer.generateChallenge();

    // Create identity proof
    const identityProof = await Signer.createIdentityProof(
      this.keyPair,
      this.identity,
      challenge
    );

    const payload: HandshakePayload = {
      identityProof: {
        agentId: identityProof.agentId,
        publicKey: identityProof.publicKey,
        challenge: identityProof.challenge,
        signature: identityProof.signature,
        timestamp: identityProof.timestamp,
        expiresIn: identityProof.expiresIn,
      },
      supportedVersions: this.config.supportedVersions,
      preferredVersion: PROTOCOL_VERSION,
      features: this.config.features,
      metadata: this.config.metadata,
    };

    const envelope = await this.createMessage(MessageType.HANDSHAKE, payload, '*');

    this.emit({
      type: ProtocolEventType.HANDSHAKE_STARTED,
      timestamp: Date.now(),
    });

    return envelope as ProtocolEnvelope<HandshakePayload>;
  }

  /**
   * Process incoming handshake and create acknowledgment
   */
  async processHandshake(
    envelope: ProtocolEnvelope<HandshakePayload>
  ): Promise<HandshakeResult> {
    // Verify message signature
    const verified = await this.verifyMessage(envelope);
    if (!verified) {
      this.transitionTo(ProtocolState.ERROR, 'Handshake signature verification failed');
      return {
        success: false,
        error: new ProtocolError(
          'Handshake signature verification failed',
          ProtocolErrorCode.INVALID_SIGNATURE
        ),
      };
    }

    const payload = envelope.payload;

    // Verify identity proof
    const proofResult = await Signer.verifyIdentityProof({
      agentId: payload.identityProof.agentId,
      publicKey: payload.identityProof.publicKey,
      challenge: payload.identityProof.challenge,
      signature: payload.identityProof.signature,
      timestamp: payload.identityProof.timestamp,
      expiresIn: payload.identityProof.expiresIn,
    });

    if (!proofResult.valid) {
      this.transitionTo(ProtocolState.ERROR, 'Identity proof verification failed');
      return {
        success: false,
        error: new ProtocolError(
          `Identity proof verification failed: ${proofResult.error}`,
          ProtocolErrorCode.AUTHENTICATION_FAILED
        ),
      };
    }

    // Negotiate version
    const agreedVersion = this.negotiateVersion(payload.supportedVersions);
    if (!agreedVersion) {
      this.transitionTo(ProtocolState.ERROR, 'No common protocol version');
      return {
        success: false,
        error: new ProtocolError(
          'No common protocol version supported',
          ProtocolErrorCode.UNSUPPORTED_VERSION
        ),
      };
    }

    // Negotiate features
    const agreedFeatures = this.negotiateFeatures(payload.features);

    // Create session
    this.sessionId = generateSessionId();
    this.remoteIdentity = {
      agentId: payload.identityProof.agentId,
      publicKey: payload.identityProof.publicKey,
      createdAt: new Date().toISOString(),
      metadata: payload.metadata,
    };
    this.agreedVersion = agreedVersion;
    this.agreedFeatures = agreedFeatures;

    if (this.state === ProtocolState.IDLE) {
      this.transitionTo(ProtocolState.CONNECTING, 'Received handshake');
    }

    this.emit({
      type: ProtocolEventType.HANDSHAKE_COMPLETED,
      timestamp: Date.now(),
      details: {
        remoteAgentId: this.remoteIdentity.agentId,
        agreedVersion,
        agreedFeatures,
        sessionId: this.sessionId,
      },
    });

    return {
      success: true,
      agreedVersion,
      agreedFeatures,
      sessionId: this.sessionId,
      remoteIdentity: this.remoteIdentity,
    };
  }

  /**
   * Create handshake acknowledgment
   */
  async createHandshakeAck(
    result: HandshakeResult
  ): Promise<ProtocolEnvelope<HandshakeAckPayload>> {
    if (!result.success) {
      throw new ProtocolError('Cannot acknowledge failed handshake', ProtocolErrorCode.INVALID_STATE);
    }

    const payload: HandshakeAckPayload = {
      agreedVersion: result.agreedVersion!,
      agreedFeatures: result.agreedFeatures!,
      sessionId: result.sessionId!,
      timestamp: Date.now(),
      publicKey: this.identity.publicKey,
    };

    const envelope = await this.createMessage(
      MessageType.HANDSHAKE_ACK,
      payload,
      result.remoteIdentity!.agentId
    );

    // Transition to active state
    this.transitionTo(ProtocolState.ACTIVE, 'Handshake acknowledgment sent');

    // Start heartbeat
    this.startHeartbeat();

    return envelope as ProtocolEnvelope<HandshakeAckPayload>;
  }

  /**
   * Process handshake acknowledgment
   */
  async processHandshakeAck(envelope: ProtocolEnvelope<HandshakeAckPayload>): Promise<boolean> {
    if (this.state !== ProtocolState.CONNECTING) {
      throw new ProtocolError(
        'Not expecting handshake acknowledgment',
        ProtocolErrorCode.INVALID_STATE
      );
    }

    // Verify signature
    const verified = await this.verifyMessage(envelope);
    if (!verified) {
      this.transitionTo(ProtocolState.ERROR, 'Handshake ack signature verification failed');
      return false;
    }

    const payload = envelope.payload;

    // Store session info
    this.sessionId = payload.sessionId;
    this.agreedVersion = payload.agreedVersion;
    this.agreedFeatures = payload.agreedFeatures;
    this.remoteIdentity = {
      agentId: envelope.header.senderId,
      publicKey: payload.publicKey,
      createdAt: new Date().toISOString(),
    };

    // Transition to active
    this.transitionTo(ProtocolState.ACTIVE, 'Handshake acknowledgment received');

    // Start heartbeat
    this.startHeartbeat();

    this.emit({
      type: ProtocolEventType.HANDSHAKE_COMPLETED,
      timestamp: Date.now(),
      details: {
        sessionId: this.sessionId,
        agreedVersion: this.agreedVersion,
        agreedFeatures: this.agreedFeatures,
      },
    });

    return true;
  }

  /**
   * Negotiate protocol version
   */
  private negotiateVersion(remoteVersions: string[]): string | null {
    // Find highest common version
    const commonVersions = this.config.supportedVersions.filter((v) =>
      remoteVersions.includes(v)
    );

    if (commonVersions.length === 0) {
      return null;
    }

    // Sort by version (semantic versioning)
    commonVersions.sort((a, b) => {
      const [aMajor, aMinor, aPatch] = a.split('.').map(Number);
      const [bMajor, bMinor, bPatch] = b.split('.').map(Number);
      return bMajor - aMajor || bMinor - aMinor || bPatch - aPatch;
    });

    return commonVersions[0];
  }

  /**
   * Negotiate features
   */
  private negotiateFeatures(remoteFeatures: ProtocolFeature[]): ProtocolFeature[] {
    return this.config.features.filter((f) => remoteFeatures.includes(f));
  }

  // ============================================
  // Message Creation and Signing
  // ============================================

  /**
   * Create a signed protocol envelope
   */
  async createMessage<T>(
    type: MessageType,
    payload: T,
    recipientId: string = '*',
    options: {
      priority?: MessagePriority;
      correlationId?: string;
      ttl?: number;
      delivery?: DeliverySemantics;
      routing?: RoutingMode;
    } = {}
  ): Promise<ProtocolEnvelope<T>> {
    // Check rate limit
    const rateLimitStatus = this.checkRateLimit(1, 0);
    if (rateLimitStatus.limited) {
      this.emit({
        type: ProtocolEventType.RATE_LIMITED,
        timestamp: Date.now(),
        details: rateLimitStatus,
      });
      throw new ProtocolError(
        `Rate limited. Retry after ${rateLimitStatus.retryAfter}ms`,
        ProtocolErrorCode.RATE_LIMITED,
        true
      );
    }

    // Create header
    const header: ProtocolHeader = {
      version: this.agreedVersion,
      messageId: generateMessageId(),
      correlationId: options.correlationId,
      type,
      priority: options.priority ?? MessagePriority.NORMAL,
      senderId: this.identity.agentId,
      recipientId,
      timestamp: Date.now(),
      ttl: options.ttl ?? DEFAULT_MESSAGE_TTL,
      hopCount: 0,
      maxHops: 5,
      compressed: false,
      delivery: options.delivery ?? DeliverySemantics.AT_LEAST_ONCE,
      routing: options.routing ?? RoutingMode.UNICAST,
      schemaVersion: 1,
    };

    // Create metadata
    const metadata: MessageMetadata = {};
    if (this.config.enableTracing) {
      metadata.traceId = this.currentTraceId ?? generateTraceId();
      metadata.spanId = generateSpanId();
    }

    // Create message to sign
    const messageToSign = {
      header,
      payload,
    };

    // Sign message
    const signedMessage = await Signer.sign(this.keyPair, this.identity, messageToSign, true);

    const envelope: ProtocolEnvelope<T> = {
      header,
      payload,
      signature: signedMessage.signature,
      signerPublicKey: signedMessage.signerPublicKey,
      metadata,
    };

    // Consume rate limit token
    this.consumeRateLimit(1, JSON.stringify(payload).length);

    // Track message
    this.messageSequence++;
    this.messageTimestamps.set(header.messageId, Date.now());

    this.emit({
      type: ProtocolEventType.MESSAGE_SIGNED,
      timestamp: Date.now(),
      details: { messageId: header.messageId, type },
    });

    return envelope;
  }

  /**
   * Verify a signed protocol envelope
   */
  async verifyMessage<T>(envelope: ProtocolEnvelope<T>): Promise<boolean> {
    try {
      // Check for duplicates (replay protection)
      if (this.processedMessages.has(envelope.header.messageId)) {
        throw new ProtocolError('Duplicate message', ProtocolErrorCode.DUPLICATE);
      }

      // Check TTL
      const age = Date.now() - envelope.header.timestamp;
      if (age > envelope.header.ttl) {
        throw new ProtocolError('Message expired', ProtocolErrorCode.TTL_EXPIRED);
      }

      // Check hop count
      if (envelope.header.hopCount > envelope.header.maxHops) {
        throw new ProtocolError('Max hops exceeded', ProtocolErrorCode.MAX_HOPS_EXCEEDED);
      }

      // Verify signature
      const messageToVerify = {
        header: envelope.header,
        payload: envelope.payload,
      };

      // Create canonical JSON for verification
      const canonical = Signer.canonicalizeJson(messageToVerify);
      const encoder = new TextEncoder();
      const messageBytes = encoder.encode(canonical);

      // Recreate the signing context
      const signingContext = {
        payload: canonical,
        publicKey: envelope.signerPublicKey,
        signedAt: new Date(envelope.header.timestamp).toISOString(),
        nonce: undefined, // The nonce was included in the original signing
      };

      const signedMessage: SignedMessage = {
        payload: messageToVerify,
        signature: envelope.signature,
        signerPublicKey: envelope.signerPublicKey,
        signerId: envelope.header.senderId,
        signedAt: new Date(envelope.header.timestamp).toISOString(),
      };

      const verifyResult = await Signer.verify(signedMessage);

      if (!verifyResult.valid) {
        this.emit({
          type: ProtocolEventType.VERIFICATION_FAILED,
          timestamp: Date.now(),
          details: {
            messageId: envelope.header.messageId,
            error: verifyResult.error,
          },
        });
        return false;
      }

      // Verify sender identity matches signature
      if (verifyResult.signerId !== envelope.header.senderId) {
        this.emit({
          type: ProtocolEventType.VERIFICATION_FAILED,
          timestamp: Date.now(),
          details: {
            messageId: envelope.header.messageId,
            error: 'Sender ID mismatch',
          },
        });
        return false;
      }

      // Mark message as processed
      this.processedMessages.add(envelope.header.messageId);

      // Cleanup old processed messages (keep last 10000)
      if (this.processedMessages.size > 10000) {
        const oldest = Array.from(this.processedMessages).slice(0, 5000);
        for (const id of oldest) {
          this.processedMessages.delete(id);
        }
      }

      this.emit({
        type: ProtocolEventType.MESSAGE_VERIFIED,
        timestamp: Date.now(),
        details: { messageId: envelope.header.messageId },
      });

      return true;
    } catch (error) {
      this.emit({
        type: ProtocolEventType.VERIFICATION_FAILED,
        timestamp: Date.now(),
        details: {
          messageId: envelope.header.messageId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      return false;
    }
  }

  // ============================================
  // Heartbeat Management
  // ============================================

  /**
   * Start heartbeat timer
   */
  startHeartbeat(): void {
    if (this.heartbeatTimer) return;

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  /**
   * Stop heartbeat timer
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  /**
   * Send heartbeat message
   */
  private async sendHeartbeat(): Promise<ProtocolEnvelope<HeartbeatPayload> | null> {
    if (this.state !== ProtocolState.ACTIVE) return null;

    const payload: HeartbeatPayload = {
      sequence: ++this.heartbeatSequence,
      timestamp: Date.now(),
      isResponse: false,
      stats: {
        messagesSent: this.messageSequence,
        messagesReceived: this.processedMessages.size,
        queueSize: 0, // Will be filled by router
      },
    };

    try {
      const envelope = await this.createMessage(
        MessageType.HEARTBEAT,
        payload,
        this.remoteIdentity?.agentId ?? '*',
        { priority: MessagePriority.HIGH }
      );

      this.lastHeartbeatSent = Date.now();

      // Start timeout timer
      this.startHeartbeatTimeout();

      this.emit({
        type: ProtocolEventType.HEARTBEAT_SENT,
        timestamp: Date.now(),
        details: { sequence: this.heartbeatSequence },
      });

      return envelope;
    } catch {
      return null;
    }
  }

  /**
   * Process incoming heartbeat
   */
  async processHeartbeat(
    envelope: ProtocolEnvelope<HeartbeatPayload>
  ): Promise<ProtocolEnvelope<HeartbeatPayload> | null> {
    const payload = envelope.payload;
    this.lastHeartbeatReceived = Date.now();

    // Clear timeout timer
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }

    this.emit({
      type: ProtocolEventType.HEARTBEAT_RECEIVED,
      timestamp: Date.now(),
      details: {
        sequence: payload.sequence,
        latency: payload.isResponse ? Date.now() - payload.originalTimestamp! : undefined,
      },
    });

    // If this is a request, send response
    if (!payload.isResponse) {
      const responsePayload: HeartbeatPayload = {
        sequence: payload.sequence,
        timestamp: Date.now(),
        isResponse: true,
        originalTimestamp: payload.timestamp,
        stats: {
          messagesSent: this.messageSequence,
          messagesReceived: this.processedMessages.size,
          queueSize: 0,
        },
      };

      return this.createMessage(MessageType.HEARTBEAT, responsePayload, envelope.header.senderId, {
        priority: MessagePriority.HIGH,
      });
    }

    return null;
  }

  /**
   * Start heartbeat timeout timer
   */
  private startHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
    }

    this.heartbeatTimeoutTimer = setTimeout(() => {
      this.handleHeartbeatTimeout();
    }, this.config.heartbeatTimeout);
  }

  /**
   * Handle heartbeat timeout
   */
  private handleHeartbeatTimeout(): void {
    this.emit({
      type: ProtocolEventType.HEARTBEAT_TIMEOUT,
      timestamp: Date.now(),
      details: {
        lastSent: this.lastHeartbeatSent,
        lastReceived: this.lastHeartbeatReceived,
      },
    });

    // Transition to error state after timeout
    this.transitionTo(ProtocolState.ERROR, 'Heartbeat timeout');
  }

  /**
   * Get heartbeat latency (ms)
   */
  getHeartbeatLatency(): number | null {
    if (this.lastHeartbeatSent === 0 || this.lastHeartbeatReceived === 0) {
      return null;
    }
    return this.lastHeartbeatReceived - this.lastHeartbeatSent;
  }

  // ============================================
  // Rate Limiting
  // ============================================

  /**
   * Check rate limit without consuming
   */
  checkRateLimit(messages: number, bytes: number): RateLimitStatus {
    this.refillBucket();

    const limited =
      this.rateLimitBucket.tokens < messages ||
      this.rateLimitBucket.byteCount + bytes > this.rateLimitConfig.bytesPerSecond;

    const remaining = Math.floor(this.rateLimitBucket.tokens);
    const resetIn = this.rateLimitConfig.windowSize - (Date.now() - this.rateLimitBucket.lastRefill);

    return {
      limited,
      currentRate: this.rateLimitBucket.messageCount,
      remaining,
      resetIn: Math.max(0, resetIn),
      retryAfter: limited ? resetIn : undefined,
    };
  }

  /**
   * Consume rate limit tokens
   */
  private consumeRateLimit(messages: number, bytes: number): void {
    this.rateLimitBucket.tokens -= messages;
    this.rateLimitBucket.messageCount += messages;
    this.rateLimitBucket.byteCount += bytes;
  }

  /**
   * Refill rate limit bucket based on elapsed time
   */
  private refillBucket(): void {
    const now = Date.now();
    const elapsed = now - this.rateLimitBucket.lastRefill;

    if (elapsed >= this.rateLimitConfig.windowSize) {
      // Full reset
      this.rateLimitBucket.tokens = this.rateLimitConfig.burstSize;
      this.rateLimitBucket.messageCount = 0;
      this.rateLimitBucket.byteCount = 0;
      this.rateLimitBucket.lastRefill = now;
    } else {
      // Partial refill
      const refillRate =
        this.rateLimitConfig.messagesPerSecond / (1000 / this.rateLimitConfig.windowSize);
      const refillAmount = (elapsed / this.rateLimitConfig.windowSize) * refillRate;
      this.rateLimitBucket.tokens = Math.min(
        this.rateLimitConfig.burstSize,
        this.rateLimitBucket.tokens + refillAmount
      );
    }
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    return this.checkRateLimit(0, 0);
  }

  // ============================================
  // Message Creation Helpers
  // ============================================

  /**
   * Create request message
   */
  async createRequest<T, R>(
    method: string,
    params: T,
    recipientId: string,
    timeout?: number
  ): Promise<ProtocolEnvelope<RequestPayload<T>>> {
    const payload: RequestPayload<T> = {
      method,
      params,
      timeout,
    };

    return this.createMessage(MessageType.REQUEST, payload, recipientId);
  }

  /**
   * Create response message
   */
  async createResponse<T>(
    correlationId: string,
    result: T,
    recipientId: string
  ): Promise<ProtocolEnvelope<ResponsePayload<T>>> {
    const payload: ResponsePayload<T> = {
      success: true,
      result,
    };

    return this.createMessage(MessageType.RESPONSE, payload, recipientId, { correlationId });
  }

  /**
   * Create error response
   */
  async createErrorResponse(
    correlationId: string,
    error: ProtocolError,
    recipientId: string
  ): Promise<ProtocolEnvelope<ResponsePayload<null>>> {
    const payload: ResponsePayload<null> = {
      success: false,
      error: error.toInfo(),
    };

    return this.createMessage(MessageType.RESPONSE, payload, recipientId, { correlationId });
  }

  /**
   * Create event message
   */
  async createEvent<T>(
    event: string,
    data: T,
    recipientId: string = '*',
    requiresAck: boolean = false
  ): Promise<ProtocolEnvelope<EventPayload<T>>> {
    const payload: EventPayload<T> = {
      event,
      data,
      requiresAck,
    };

    return this.createMessage(MessageType.EVENT, payload, recipientId, {
      routing: recipientId === '*' ? RoutingMode.BROADCAST : RoutingMode.UNICAST,
    });
  }

  /**
   * Create acknowledgment message
   */
  async createAck(messageId: string, recipientId: string): Promise<ProtocolEnvelope<AckPayload>> {
    const payload: AckPayload = {
      messageId,
      timestamp: Date.now(),
    };

    return this.createMessage(MessageType.ACK, payload, recipientId, {
      priority: MessagePriority.HIGH,
    });
  }

  /**
   * Create negative acknowledgment message
   */
  async createNack(
    messageId: string,
    reason: string,
    code: ProtocolErrorCode,
    recipientId: string
  ): Promise<ProtocolEnvelope<NackPayload>> {
    const payload: NackPayload = {
      messageId,
      reason,
      code,
      retryable: isRetryableError(code),
    };

    return this.createMessage(MessageType.NACK, payload, recipientId, {
      priority: MessagePriority.HIGH,
    });
  }

  // ============================================
  // Connection Close
  // ============================================

  /**
   * Create close message
   */
  async createClose(
    code: CloseCode = CloseCode.NORMAL,
    reason: string = 'Connection closed',
    reconnect: boolean = false
  ): Promise<ProtocolEnvelope<ClosePayload>> {
    this.validateStateTransition(ProtocolState.CLOSING);
    this.transitionTo(ProtocolState.CLOSING, reason);

    this.emit({
      type: ProtocolEventType.CLOSING,
      timestamp: Date.now(),
      details: { code, reason, reconnect },
    });

    const payload: ClosePayload = {
      code,
      reason,
      reconnect,
    };

    return this.createMessage(
      MessageType.CLOSE,
      payload,
      this.remoteIdentity?.agentId ?? '*',
      { priority: MessagePriority.CRITICAL }
    );
  }

  /**
   * Process close message
   */
  processClose(envelope: ProtocolEnvelope<ClosePayload>): ClosePayload {
    const payload = envelope.payload;

    this.transitionTo(ProtocolState.CLOSED, payload.reason);
    this.stopHeartbeat();

    this.emit({
      type: ProtocolEventType.CLOSED,
      timestamp: Date.now(),
      details: payload,
    });

    return payload;
  }

  /**
   * Close connection
   */
  close(): void {
    this.stopHeartbeat();
    if (this.state !== ProtocolState.CLOSED) {
      this.transitionTo(ProtocolState.CLOSED, 'Local close');
    }

    this.emit({
      type: ProtocolEventType.CLOSED,
      timestamp: Date.now(),
    });
  }

  // ============================================
  // Events
  // ============================================

  /**
   * Add event handler
   */
  on(handler: ProtocolEventHandler): void {
    this.eventHandlers.push(handler);
  }

  /**
   * Remove event handler
   */
  off(handler: ProtocolEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index !== -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  /**
   * Emit event to handlers
   */
  private emit(event: ProtocolEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  // ============================================
  // Getters
  // ============================================

  /**
   * Get session ID
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Get remote identity
   */
  getRemoteIdentity(): AgentIdentity | null {
    return this.remoteIdentity;
  }

  /**
   * Get agreed protocol version
   */
  getAgreedVersion(): string {
    return this.agreedVersion;
  }

  /**
   * Get agreed features
   */
  getAgreedFeatures(): ProtocolFeature[] {
    return [...this.agreedFeatures];
  }

  /**
   * Check if a feature is enabled
   */
  hasFeature(feature: ProtocolFeature): boolean {
    return this.agreedFeatures.includes(feature);
  }

  /**
   * Get local identity
   */
  getLocalIdentity(): AgentIdentity {
    return this.identity;
  }

  /**
   * Get message encoder
   */
  getEncoder(): MessageEncoder {
    return this.encoder;
  }

  // ============================================
  // Reset
  // ============================================

  /**
   * Reset handler state
   */
  reset(): void {
    this.stopHeartbeat();
    this.state = ProtocolState.IDLE;
    this.sessionId = null;
    this.remoteIdentity = null;
    this.agreedVersion = PROTOCOL_VERSION;
    this.agreedFeatures = [];
    this.heartbeatSequence = 0;
    this.lastHeartbeatSent = 0;
    this.lastHeartbeatReceived = 0;
    this.messageSequence = 0;
    this.processedMessages.clear();
    this.messageTimestamps.clear();

    // Reset rate limit bucket
    this.rateLimitBucket = {
      tokens: this.rateLimitConfig.burstSize,
      lastRefill: Date.now(),
      messageCount: 0,
      byteCount: 0,
    };
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a new protocol handler
 */
export function createProtocolHandler(config: ProtocolHandlerConfig): ProtocolHandler {
  return new ProtocolHandler(config);
}

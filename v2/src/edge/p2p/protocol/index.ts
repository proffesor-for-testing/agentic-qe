/**
 * Agent-to-Agent Communication Protocol Module
 *
 * Provides secure, typed communication between agents over WebRTC data channels.
 * Built on Ed25519 cryptographic signatures for message authentication and
 * integrity verification.
 *
 * Features:
 * - Binary message encoding with optional compression
 * - Message routing (unicast, broadcast, multicast)
 * - Request/response pattern with correlation IDs
 * - Event pub/sub pattern
 * - Reliable delivery with acknowledgments
 * - Rate limiting and backpressure
 * - Protocol version negotiation
 * - Heartbeat/keepalive management
 *
 * @module edge/p2p/protocol
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   AgentChannel,
 *   createAgentChannel,
 *   MessageType,
 *   ProtocolState,
 * } from './protocol';
 *
 * // Create and open channel
 * const channel = createAgentChannel({
 *   localIdentity: myIdentity,
 *   localKeyPair: myKeyPair,
 *   remoteAgentId: 'remote-agent-id',
 *   connectionManager: peerManager,
 * });
 *
 * await channel.open();
 *
 * // Request/Response
 * const result = await channel.request('process-task', { taskId: '123' });
 *
 * // Pub/Sub
 * channel.subscribe('task-completed', (data) => console.log(data));
 * await channel.publish('status-update', { status: 'active' });
 *
 * // Close channel
 * await channel.close();
 * ```
 */

// ============================================
// Type Exports
// ============================================

// Core protocol types
export type {
  ProtocolHeader,
  ProtocolEnvelope,
  MessageMetadata,
  RoutingInfo,
} from './types';

// Message payload types
export type {
  RequestPayload,
  ResponsePayload,
  EventPayload,
  HeartbeatPayload,
  HeartbeatStats,
  HandshakePayload,
  HandshakeAckPayload,
  ClosePayload,
  AckPayload,
  NackPayload,
} from './types';

// Error types
export type { ProtocolErrorInfo } from './types';

// State types
export type { ProtocolStateTransition } from './types';

// Rate limiting types
export type { RateLimitConfig, RateLimitStatus } from './types';

// Queue types
export type { QueueConfig, QueueStats } from './types';

// Delivery types
export type { DeliveryInfo, DeadLetter } from './types';

// Channel types
export type { ChannelConfig, ChannelStats } from './types';

// Handler types
export type {
  MessageHandler,
  EventHandler,
  ErrorHandler,
  StateChangeHandler,
} from './types';

// ============================================
// Enum Exports
// ============================================

export {
  // Message types and priorities
  MessageType,
  MessagePriority,
  DeliverySemantics,
  RoutingMode,

  // Protocol state
  ProtocolState,

  // Features
  ProtocolFeature,

  // Error codes
  ProtocolErrorCode,
  CloseCode,

  // Delivery status
  DeliveryStatus,
} from './types';

// ============================================
// Constant Exports
// ============================================

export {
  // Version
  PROTOCOL_VERSION,
  MIN_PROTOCOL_VERSION,

  // Size limits
  MAX_MESSAGE_SIZE,
  COMPRESSION_THRESHOLD,

  // Timeouts
  DEFAULT_MESSAGE_TTL,
  DEFAULT_HEARTBEAT_INTERVAL,
  DEFAULT_REQUEST_TIMEOUT,

  // Retry configuration
  MAX_RETRY_ATTEMPTS,
  RETRY_DELAY_MULTIPLIER,
  INITIAL_RETRY_DELAY,

  // Defaults
  DEFAULT_FEATURES,
  DEFAULT_RATE_LIMIT,
  DEFAULT_QUEUE_CONFIG,
} from './types';

// ============================================
// Utility Exports
// ============================================

export {
  // ID generation
  generateMessageId,
  generateSessionId,
  generateTraceId,
  generateSpanId,

  // Version checking
  isVersionSupported,

  // Error utilities
  getErrorMessage,
  isRetryableError,

  // Header creation
  createDefaultHeader,
} from './types';

// ============================================
// Class Exports
// ============================================

// Error class
export { ProtocolError } from './types';

// Message encoder
export {
  MessageEncoder,
  JsonMessageEncoder,
  createMessageEncoder,
  createJsonEncoder,
} from './MessageEncoder';

// Message router
export {
  MessageRouter,
  createMessageRouter,
  type RoutablePeer,
  type RouterConfig,
  type RouterEvent,
  type RouterEventHandler,
  RouterEventType,
} from './MessageRouter';

// Protocol handler
export {
  ProtocolHandler,
  createProtocolHandler,
  type ProtocolHandlerConfig,
  type ProtocolEvent,
  type ProtocolEventHandler,
  type HandshakeResult,
  ProtocolEventType,
} from './ProtocolHandler';

// Agent channel (high-level API)
export {
  AgentChannel,
  createAgentChannel,
  createAgentChannels,
  type AgentChannelOptions,
  type ChannelEvent,
  type ChannelEventHandler,
  ChannelEventType,
} from './AgentChannel';

// ============================================
// Version Information
// ============================================

/**
 * Protocol module version
 */
export const PROTOCOL_MODULE_VERSION = '1.0.0';

/**
 * Protocol capabilities
 */
export const PROTOCOL_CAPABILITIES = {
  /** Binary message encoding */
  binaryEncoding: true,
  /** Message compression (deflate) */
  compression: true,
  /** Request/response pattern */
  requestResponse: true,
  /** Event pub/sub pattern */
  pubSub: true,
  /** Message routing (unicast, broadcast, multicast) */
  routing: true,
  /** Reliable delivery with acknowledgments */
  reliableDelivery: true,
  /** Rate limiting */
  rateLimiting: true,
  /** Protocol version negotiation */
  versionNegotiation: true,
  /** Feature negotiation */
  featureNegotiation: true,
  /** Heartbeat/keepalive */
  heartbeat: true,
  /** Message signing (Ed25519) */
  messageSigning: true,
  /** Signature verification */
  signatureVerification: true,
  /** Replay protection */
  replayProtection: true,
  /** Dead letter queue */
  deadLetterQueue: true,
  /** Distributed tracing support */
  distributedTracing: true,
};

/**
 * Check if all protocol dependencies are available
 */
export function checkProtocolDependencies(): {
  available: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  // Check for Web Crypto API
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    missing.push('Web Crypto API (crypto.subtle)');
  }

  // Check for TextEncoder/TextDecoder
  if (typeof TextEncoder === 'undefined') {
    missing.push('TextEncoder');
  }
  if (typeof TextDecoder === 'undefined') {
    missing.push('TextDecoder');
  }

  // Check for compression streams (optional but recommended)
  if (typeof CompressionStream === 'undefined') {
    // Not critical - we have fallback
  }

  return {
    available: missing.length === 0,
    missing,
  };
}

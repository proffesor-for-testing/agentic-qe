/**
 * Agent-to-Agent Communication Protocol Types
 *
 * Type definitions for the protocol layer that enables secure agent-to-agent
 * communication over WebRTC data channels. Includes message types, envelopes,
 * routing information, and protocol errors.
 *
 * @module edge/p2p/protocol/types
 * @version 1.0.0
 */

// ============================================
// Protocol Version and Constants
// ============================================

/**
 * Current protocol version
 */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Minimum supported protocol version
 */
export const MIN_PROTOCOL_VERSION = '1.0.0';

/**
 * Maximum message size in bytes (64KB)
 */
export const MAX_MESSAGE_SIZE = 65536;

/**
 * Compression threshold in bytes (1KB)
 */
export const COMPRESSION_THRESHOLD = 1024;

/**
 * Default message TTL in milliseconds (30 seconds)
 */
export const DEFAULT_MESSAGE_TTL = 30000;

/**
 * Default heartbeat interval in milliseconds (15 seconds)
 */
export const DEFAULT_HEARTBEAT_INTERVAL = 15000;

/**
 * Default request timeout in milliseconds (10 seconds)
 */
export const DEFAULT_REQUEST_TIMEOUT = 10000;

/**
 * Maximum retry attempts for reliable delivery
 */
export const MAX_RETRY_ATTEMPTS = 3;

/**
 * Retry delay multiplier for exponential backoff
 */
export const RETRY_DELAY_MULTIPLIER = 2;

/**
 * Initial retry delay in milliseconds
 */
export const INITIAL_RETRY_DELAY = 1000;

// ============================================
// Message Types
// ============================================

/**
 * Message type enumeration
 */
export enum MessageType {
  /** Request expecting a response */
  REQUEST = 'request',
  /** Response to a request */
  RESPONSE = 'response',
  /** Event notification (fire-and-forget) */
  EVENT = 'event',
  /** Heartbeat/keepalive message */
  HEARTBEAT = 'heartbeat',
  /** Error notification */
  ERROR = 'error',
  /** Acknowledgment for reliable delivery */
  ACK = 'ack',
  /** Negative acknowledgment */
  NACK = 'nack',
  /** Handshake message */
  HANDSHAKE = 'handshake',
  /** Handshake acknowledgment */
  HANDSHAKE_ACK = 'handshake_ack',
  /** Protocol close message */
  CLOSE = 'close',
}

/**
 * Message priority levels
 */
export enum MessagePriority {
  /** Critical priority - immediate processing */
  CRITICAL = 0,
  /** High priority - processed before normal */
  HIGH = 1,
  /** Normal priority - standard processing */
  NORMAL = 2,
  /** Low priority - processed when idle */
  LOW = 3,
}

/**
 * Delivery semantics for messages
 */
export enum DeliverySemantics {
  /** At most once delivery (fire-and-forget) */
  AT_MOST_ONCE = 'at_most_once',
  /** At least once delivery (may duplicate) */
  AT_LEAST_ONCE = 'at_least_once',
  /** Exactly once delivery (requires deduplication) */
  EXACTLY_ONCE = 'exactly_once',
}

/**
 * Routing mode for messages
 */
export enum RoutingMode {
  /** Single recipient */
  UNICAST = 'unicast',
  /** All recipients */
  BROADCAST = 'broadcast',
  /** Selected group of recipients */
  MULTICAST = 'multicast',
  /** Relay through intermediate nodes */
  RELAY = 'relay',
}

// ============================================
// Protocol Envelope
// ============================================

/**
 * Protocol envelope header containing metadata
 */
export interface ProtocolHeader {
  /** Protocol version */
  version: string;
  /** Unique message identifier */
  messageId: string;
  /** Correlation ID for request/response pairs */
  correlationId?: string;
  /** Message type */
  type: MessageType;
  /** Message priority */
  priority: MessagePriority;
  /** Sender agent ID */
  senderId: string;
  /** Recipient agent ID (or '*' for broadcast) */
  recipientId: string;
  /** Timestamp when message was created */
  timestamp: number;
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Number of hops remaining (for relay) */
  hopCount: number;
  /** Maximum hops allowed */
  maxHops: number;
  /** Whether payload is compressed */
  compressed: boolean;
  /** Delivery semantics */
  delivery: DeliverySemantics;
  /** Routing mode */
  routing: RoutingMode;
  /** Schema version for payload */
  schemaVersion: number;
}

/**
 * Message metadata for tracking and analytics
 */
export interface MessageMetadata {
  /** Original message size before compression */
  originalSize?: number;
  /** Compressed size */
  compressedSize?: number;
  /** Source channel name */
  channel?: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** Span ID for distributed tracing */
  spanId?: string;
  /** Parent span ID */
  parentSpanId?: string;
  /** Custom tags */
  tags?: Record<string, string>;
  /** Retry count */
  retryCount?: number;
  /** Time spent in queue (ms) */
  queueTime?: number;
}

/**
 * Routing information for message delivery
 */
export interface RoutingInfo {
  /** Routing mode */
  mode: RoutingMode;
  /** Target peer IDs for multicast */
  targets?: string[];
  /** Room/group ID for multicast */
  roomId?: string;
  /** Path taken by message (for debugging) */
  path?: string[];
  /** Relay nodes used */
  relayNodes?: string[];
  /** Whether to exclude sender from broadcast */
  excludeSender?: boolean;
}

/**
 * Complete protocol envelope
 */
export interface ProtocolEnvelope<T = unknown> {
  /** Protocol header */
  header: ProtocolHeader;
  /** Message payload */
  payload: T;
  /** Base64-encoded signature of header + payload */
  signature: string;
  /** Signer's public key (Base64) */
  signerPublicKey: string;
  /** Optional routing information */
  routing?: RoutingInfo;
  /** Optional metadata */
  metadata?: MessageMetadata;
}

// ============================================
// Message Payloads
// ============================================

/**
 * Request message payload
 */
export interface RequestPayload<T = unknown> {
  /** Method/action to invoke */
  method: string;
  /** Request parameters */
  params: T;
  /** Expected response timeout (ms) */
  timeout?: number;
}

/**
 * Response message payload
 */
export interface ResponsePayload<T = unknown> {
  /** Whether request succeeded */
  success: boolean;
  /** Response data (if success) */
  result?: T;
  /** Error information (if failure) */
  error?: ProtocolErrorInfo;
}

/**
 * Event message payload
 */
export interface EventPayload<T = unknown> {
  /** Event name/type */
  event: string;
  /** Event data */
  data: T;
  /** Whether event requires acknowledgment */
  requiresAck?: boolean;
}

/**
 * Heartbeat message payload
 */
export interface HeartbeatPayload {
  /** Sequence number for tracking */
  sequence: number;
  /** Sender's timestamp */
  timestamp: number;
  /** Whether this is a request or response */
  isResponse: boolean;
  /** Original timestamp (in response) */
  originalTimestamp?: number;
  /** Local stats snapshot */
  stats?: HeartbeatStats;
}

/**
 * Heartbeat statistics
 */
export interface HeartbeatStats {
  /** Messages sent since last heartbeat */
  messagesSent: number;
  /** Messages received since last heartbeat */
  messagesReceived: number;
  /** Current message queue size */
  queueSize: number;
  /** Memory usage (bytes) */
  memoryUsage?: number;
}

/**
 * Handshake message payload
 */
export interface HandshakePayload {
  /** Agent identity proof */
  identityProof: {
    agentId: string;
    publicKey: string;
    challenge: string;
    signature: string;
    timestamp: string;
    expiresIn: number;
  };
  /** Supported protocol versions */
  supportedVersions: string[];
  /** Preferred protocol version */
  preferredVersion: string;
  /** Supported features */
  features: ProtocolFeature[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Handshake acknowledgment payload
 */
export interface HandshakeAckPayload {
  /** Agreed protocol version */
  agreedVersion: string;
  /** Agreed features */
  agreedFeatures: ProtocolFeature[];
  /** Session ID for this connection */
  sessionId: string;
  /** Server timestamp */
  timestamp: number;
  /** Server public key */
  publicKey: string;
}

/**
 * Close message payload
 */
export interface ClosePayload {
  /** Close code */
  code: CloseCode;
  /** Human-readable reason */
  reason: string;
  /** Whether to attempt reconnection */
  reconnect: boolean;
}

/**
 * Acknowledgment payload
 */
export interface AckPayload {
  /** Message ID being acknowledged */
  messageId: string;
  /** Acknowledgment timestamp */
  timestamp: number;
  /** Processing time (ms) */
  processingTime?: number;
}

/**
 * Negative acknowledgment payload
 */
export interface NackPayload {
  /** Message ID being rejected */
  messageId: string;
  /** Rejection reason */
  reason: string;
  /** Error code */
  code: ProtocolErrorCode;
  /** Whether message should be retried */
  retryable: boolean;
  /** Suggested retry delay (ms) */
  retryAfter?: number;
}

// ============================================
// Protocol Features
// ============================================

/**
 * Protocol feature flags
 */
export enum ProtocolFeature {
  /** Support for message compression */
  COMPRESSION = 'compression',
  /** Support for message encryption (beyond transport) */
  ENCRYPTION = 'encryption',
  /** Support for request/response pattern */
  REQUEST_RESPONSE = 'request_response',
  /** Support for pub/sub pattern */
  PUB_SUB = 'pub_sub',
  /** Support for message streaming */
  STREAMING = 'streaming',
  /** Support for binary payloads */
  BINARY = 'binary',
  /** Support for message batching */
  BATCHING = 'batching',
  /** Support for message prioritization */
  PRIORITIZATION = 'prioritization',
  /** Support for reliable delivery */
  RELIABLE_DELIVERY = 'reliable_delivery',
  /** Support for exactly-once semantics */
  EXACTLY_ONCE = 'exactly_once',
  /** Support for distributed tracing */
  TRACING = 'tracing',
  /** Support for backpressure */
  BACKPRESSURE = 'backpressure',
}

/**
 * Default supported features
 */
export const DEFAULT_FEATURES: ProtocolFeature[] = [
  ProtocolFeature.COMPRESSION,
  ProtocolFeature.REQUEST_RESPONSE,
  ProtocolFeature.BINARY,
  ProtocolFeature.PRIORITIZATION,
  ProtocolFeature.RELIABLE_DELIVERY,
  ProtocolFeature.BACKPRESSURE,
];

// ============================================
// Error Types
// ============================================

/**
 * Protocol error codes
 */
export enum ProtocolErrorCode {
  // General errors (1xxx)
  UNKNOWN_ERROR = 1000,
  INVALID_MESSAGE = 1001,
  MESSAGE_TOO_LARGE = 1002,
  UNSUPPORTED_VERSION = 1003,
  UNSUPPORTED_FEATURE = 1004,
  SERIALIZATION_ERROR = 1005,
  DESERIALIZATION_ERROR = 1006,
  COMPRESSION_ERROR = 1007,
  DECOMPRESSION_ERROR = 1008,

  // Authentication errors (2xxx)
  AUTHENTICATION_FAILED = 2000,
  INVALID_SIGNATURE = 2001,
  EXPIRED_SIGNATURE = 2002,
  UNKNOWN_SENDER = 2003,
  UNAUTHORIZED = 2004,
  IDENTITY_MISMATCH = 2005,

  // Routing errors (3xxx)
  ROUTING_FAILED = 3000,
  PEER_NOT_FOUND = 3001,
  PEER_UNREACHABLE = 3002,
  TTL_EXPIRED = 3003,
  MAX_HOPS_EXCEEDED = 3004,
  NO_ROUTE = 3005,

  // Delivery errors (4xxx)
  DELIVERY_FAILED = 4000,
  TIMEOUT = 4001,
  REJECTED = 4002,
  DUPLICATE = 4003,
  OUT_OF_ORDER = 4004,
  QUEUE_FULL = 4005,

  // Protocol errors (5xxx)
  PROTOCOL_ERROR = 5000,
  INVALID_STATE = 5001,
  HANDSHAKE_FAILED = 5002,
  CONNECTION_CLOSED = 5003,
  RATE_LIMITED = 5004,
  BACKPRESSURE = 5005,

  // Resource errors (6xxx)
  RESOURCE_EXHAUSTED = 6000,
  MEMORY_LIMIT = 6001,
  QUEUE_LIMIT = 6002,
  CONNECTION_LIMIT = 6003,
}

/**
 * Protocol error information
 */
export interface ProtocolErrorInfo {
  /** Error code */
  code: ProtocolErrorCode;
  /** Human-readable message */
  message: string;
  /** Additional details */
  details?: unknown;
  /** Timestamp when error occurred */
  timestamp: number;
  /** Whether the operation can be retried */
  retryable: boolean;
  /** Suggested retry delay (ms) */
  retryAfter?: number;
}

/**
 * Close codes for protocol close messages
 */
export enum CloseCode {
  /** Normal closure */
  NORMAL = 1000,
  /** Going away (e.g., server shutdown) */
  GOING_AWAY = 1001,
  /** Protocol error */
  PROTOCOL_ERROR = 1002,
  /** Unsupported data */
  UNSUPPORTED_DATA = 1003,
  /** No status received */
  NO_STATUS = 1005,
  /** Abnormal closure */
  ABNORMAL = 1006,
  /** Invalid payload */
  INVALID_PAYLOAD = 1007,
  /** Policy violation */
  POLICY_VIOLATION = 1008,
  /** Message too big */
  MESSAGE_TOO_BIG = 1009,
  /** Missing extension */
  MISSING_EXTENSION = 1010,
  /** Internal error */
  INTERNAL_ERROR = 1011,
  /** Service restart */
  SERVICE_RESTART = 1012,
  /** Try again later */
  TRY_AGAIN_LATER = 1013,
}

/**
 * Protocol error class
 */
export class ProtocolError extends Error {
  constructor(
    message: string,
    public readonly code: ProtocolErrorCode,
    public readonly retryable: boolean = false,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ProtocolError';
  }

  /**
   * Convert to error info
   */
  toInfo(): ProtocolErrorInfo {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      timestamp: Date.now(),
      retryable: this.retryable,
    };
  }

  /**
   * Create from error info
   */
  static fromInfo(info: ProtocolErrorInfo): ProtocolError {
    return new ProtocolError(info.message, info.code, info.retryable, info.details);
  }
}

// ============================================
// Protocol State
// ============================================

/**
 * Protocol state enumeration
 */
export enum ProtocolState {
  /** Initial state, not connected */
  IDLE = 'idle',
  /** Connecting, handshake in progress */
  CONNECTING = 'connecting',
  /** Handshake complete, ready for messages */
  ACTIVE = 'active',
  /** Closing gracefully */
  CLOSING = 'closing',
  /** Closed permanently */
  CLOSED = 'closed',
  /** Error state */
  ERROR = 'error',
}

/**
 * Protocol state transition
 */
export interface ProtocolStateTransition {
  /** Previous state */
  from: ProtocolState;
  /** New state */
  to: ProtocolState;
  /** Reason for transition */
  reason: string;
  /** Timestamp of transition */
  timestamp: number;
}

// ============================================
// Rate Limiting
// ============================================

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum messages per second */
  messagesPerSecond: number;
  /** Maximum bytes per second */
  bytesPerSecond: number;
  /** Maximum burst size (messages) */
  burstSize: number;
  /** Window size for rate limiting (ms) */
  windowSize: number;
  /** Whether to enable backpressure */
  enableBackpressure: boolean;
}

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  messagesPerSecond: 100,
  bytesPerSecond: 1048576, // 1MB
  burstSize: 50,
  windowSize: 1000,
  enableBackpressure: true,
};

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Whether rate limited */
  limited: boolean;
  /** Current messages per second */
  currentRate: number;
  /** Remaining messages in window */
  remaining: number;
  /** Time until reset (ms) */
  resetIn: number;
  /** Suggested delay before retry (ms) */
  retryAfter?: number;
}

// ============================================
// Queue Configuration
// ============================================

/**
 * Message queue configuration
 */
export interface QueueConfig {
  /** Maximum queue size */
  maxSize: number;
  /** Maximum memory usage (bytes) */
  maxMemory: number;
  /** Enable priority queuing */
  enablePriority: boolean;
  /** Flush interval (ms) */
  flushInterval: number;
  /** Maximum batch size for processing */
  batchSize: number;
}

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  maxSize: 1000,
  maxMemory: 10485760, // 10MB
  enablePriority: true,
  flushInterval: 100,
  batchSize: 50,
};

/**
 * Queue statistics
 */
export interface QueueStats {
  /** Current queue size */
  size: number;
  /** Current memory usage (bytes) */
  memory: number;
  /** Total messages enqueued */
  totalEnqueued: number;
  /** Total messages dequeued */
  totalDequeued: number;
  /** Total messages dropped */
  totalDropped: number;
  /** Average wait time (ms) */
  averageWaitTime: number;
  /** Messages by priority */
  byPriority: Record<MessagePriority, number>;
}

// ============================================
// Delivery Tracking
// ============================================

/**
 * Delivery status enumeration
 */
export enum DeliveryStatus {
  /** Message pending delivery */
  PENDING = 'pending',
  /** Message sent, awaiting acknowledgment */
  SENT = 'sent',
  /** Message delivered (acknowledged) */
  DELIVERED = 'delivered',
  /** Delivery failed */
  FAILED = 'failed',
  /** Message expired (TTL) */
  EXPIRED = 'expired',
  /** Delivery cancelled */
  CANCELLED = 'cancelled',
}

/**
 * Delivery tracking information
 */
export interface DeliveryInfo {
  /** Message ID */
  messageId: string;
  /** Current status */
  status: DeliveryStatus;
  /** Number of delivery attempts */
  attempts: number;
  /** Timestamp of first attempt */
  firstAttemptAt: number;
  /** Timestamp of last attempt */
  lastAttemptAt: number;
  /** Timestamp of delivery (if delivered) */
  deliveredAt?: number;
  /** Error info (if failed) */
  error?: ProtocolErrorInfo;
  /** Next retry timestamp */
  nextRetryAt?: number;
}

/**
 * Dead letter information
 */
export interface DeadLetter {
  /** Original envelope */
  envelope: ProtocolEnvelope;
  /** Delivery info */
  deliveryInfo: DeliveryInfo;
  /** Timestamp when moved to dead letter */
  deadLetteredAt: number;
  /** Reason for dead lettering */
  reason: string;
}

// ============================================
// Channel Configuration
// ============================================

/**
 * Agent channel configuration
 */
export interface ChannelConfig {
  /** Local agent ID */
  localAgentId: string;
  /** Remote agent ID */
  remoteAgentId: string;
  /** Protocol version to use */
  protocolVersion?: string;
  /** Requested features */
  features?: ProtocolFeature[];
  /** Rate limit configuration */
  rateLimit?: Partial<RateLimitConfig>;
  /** Queue configuration */
  queue?: Partial<QueueConfig>;
  /** Request timeout (ms) */
  requestTimeout?: number;
  /** Heartbeat interval (ms) */
  heartbeatInterval?: number;
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
}

/**
 * Channel statistics
 */
export interface ChannelStats {
  /** Total messages sent */
  messagesSent: number;
  /** Total messages received */
  messagesReceived: number;
  /** Total bytes sent */
  bytesSent: number;
  /** Total bytes received */
  bytesReceived: number;
  /** Total requests sent */
  requestsSent: number;
  /** Total responses received */
  responsesReceived: number;
  /** Total events published */
  eventsPublished: number;
  /** Total events received */
  eventsReceived: number;
  /** Average request latency (ms) */
  averageLatency: number;
  /** Current connection state */
  state: ProtocolState;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Channel opened timestamp */
  openedAt: number;
  /** Reconnection count */
  reconnectionCount: number;
}

// ============================================
// Handler Types
// ============================================

/**
 * Message handler function type
 */
export type MessageHandler<T = unknown, R = unknown> = (
  payload: T,
  envelope: ProtocolEnvelope<T>
) => Promise<R> | R;

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (
  data: T,
  envelope: ProtocolEnvelope<EventPayload<T>>
) => void | Promise<void>;

/**
 * Error handler function type
 */
export type ErrorHandler = (error: ProtocolError, envelope?: ProtocolEnvelope) => void;

/**
 * State change handler function type
 */
export type StateChangeHandler = (transition: ProtocolStateTransition) => void;

// ============================================
// Utility Functions
// ============================================

/**
 * Generate unique message ID
 */
export function generateMessageId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Generate session ID using cryptographically secure random values
 */
export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 9);
  return `sess-${timestamp}-${random}`;
}

/**
 * Generate trace ID
 */
export function generateTraceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate span ID
 */
export function generateSpanId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Check if protocol version is supported
 */
export function isVersionSupported(version: string): boolean {
  const [major] = version.split('.').map(Number);
  const [minMajor] = MIN_PROTOCOL_VERSION.split('.').map(Number);
  return major >= minMajor;
}

/**
 * Get error message for error code
 */
export function getErrorMessage(code: ProtocolErrorCode): string {
  const messages: Record<ProtocolErrorCode, string> = {
    [ProtocolErrorCode.UNKNOWN_ERROR]: 'An unknown error occurred',
    [ProtocolErrorCode.INVALID_MESSAGE]: 'Invalid message format',
    [ProtocolErrorCode.MESSAGE_TOO_LARGE]: 'Message exceeds maximum size',
    [ProtocolErrorCode.UNSUPPORTED_VERSION]: 'Protocol version not supported',
    [ProtocolErrorCode.UNSUPPORTED_FEATURE]: 'Requested feature not supported',
    [ProtocolErrorCode.SERIALIZATION_ERROR]: 'Failed to serialize message',
    [ProtocolErrorCode.DESERIALIZATION_ERROR]: 'Failed to deserialize message',
    [ProtocolErrorCode.COMPRESSION_ERROR]: 'Failed to compress message',
    [ProtocolErrorCode.DECOMPRESSION_ERROR]: 'Failed to decompress message',
    [ProtocolErrorCode.AUTHENTICATION_FAILED]: 'Authentication failed',
    [ProtocolErrorCode.INVALID_SIGNATURE]: 'Invalid message signature',
    [ProtocolErrorCode.EXPIRED_SIGNATURE]: 'Message signature has expired',
    [ProtocolErrorCode.UNKNOWN_SENDER]: 'Unknown sender',
    [ProtocolErrorCode.UNAUTHORIZED]: 'Not authorized',
    [ProtocolErrorCode.IDENTITY_MISMATCH]: 'Identity does not match signature',
    [ProtocolErrorCode.ROUTING_FAILED]: 'Failed to route message',
    [ProtocolErrorCode.PEER_NOT_FOUND]: 'Peer not found',
    [ProtocolErrorCode.PEER_UNREACHABLE]: 'Peer is unreachable',
    [ProtocolErrorCode.TTL_EXPIRED]: 'Message TTL expired',
    [ProtocolErrorCode.MAX_HOPS_EXCEEDED]: 'Maximum hops exceeded',
    [ProtocolErrorCode.NO_ROUTE]: 'No route to destination',
    [ProtocolErrorCode.DELIVERY_FAILED]: 'Message delivery failed',
    [ProtocolErrorCode.TIMEOUT]: 'Operation timed out',
    [ProtocolErrorCode.REJECTED]: 'Message rejected',
    [ProtocolErrorCode.DUPLICATE]: 'Duplicate message',
    [ProtocolErrorCode.OUT_OF_ORDER]: 'Message out of order',
    [ProtocolErrorCode.QUEUE_FULL]: 'Message queue is full',
    [ProtocolErrorCode.PROTOCOL_ERROR]: 'Protocol error',
    [ProtocolErrorCode.INVALID_STATE]: 'Invalid protocol state',
    [ProtocolErrorCode.HANDSHAKE_FAILED]: 'Handshake failed',
    [ProtocolErrorCode.CONNECTION_CLOSED]: 'Connection closed',
    [ProtocolErrorCode.RATE_LIMITED]: 'Rate limit exceeded',
    [ProtocolErrorCode.BACKPRESSURE]: 'Backpressure applied',
    [ProtocolErrorCode.RESOURCE_EXHAUSTED]: 'Resource exhausted',
    [ProtocolErrorCode.MEMORY_LIMIT]: 'Memory limit exceeded',
    [ProtocolErrorCode.QUEUE_LIMIT]: 'Queue limit exceeded',
    [ProtocolErrorCode.CONNECTION_LIMIT]: 'Connection limit exceeded',
  };
  return messages[code] || 'Unknown error';
}

/**
 * Check if error is retryable
 */
export function isRetryableError(code: ProtocolErrorCode): boolean {
  const retryable: ProtocolErrorCode[] = [
    ProtocolErrorCode.TIMEOUT,
    ProtocolErrorCode.PEER_UNREACHABLE,
    ProtocolErrorCode.DELIVERY_FAILED,
    ProtocolErrorCode.RATE_LIMITED,
    ProtocolErrorCode.BACKPRESSURE,
    ProtocolErrorCode.QUEUE_FULL,
  ];
  return retryable.includes(code);
}

/**
 * Create default protocol header
 */
export function createDefaultHeader(
  type: MessageType,
  senderId: string,
  recipientId: string
): ProtocolHeader {
  return {
    version: PROTOCOL_VERSION,
    messageId: generateMessageId(),
    type,
    priority: MessagePriority.NORMAL,
    senderId,
    recipientId,
    timestamp: Date.now(),
    ttl: DEFAULT_MESSAGE_TTL,
    hopCount: 0,
    maxHops: 5,
    compressed: false,
    delivery: DeliverySemantics.AT_LEAST_ONCE,
    routing: RoutingMode.UNICAST,
    schemaVersion: 1,
  };
}

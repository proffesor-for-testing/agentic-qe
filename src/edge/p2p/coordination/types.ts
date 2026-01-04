/**
 * Two-Machine Coordination Types
 *
 * Type definitions for P2-007: Two-Machine Coordination Proof.
 * Provides interfaces for managing coordination between two or more
 * browser agents in a P2P network.
 *
 * @module edge/p2p/coordination/types
 * @version 1.0.0
 */

import type { ConnectionQuality, PeerId } from '../webrtc/types';
import type { VectorClock, SharedPattern } from '../sharing/types';
import type { AgentIdentity, IdentityProof } from '../crypto/types';

// ============================================
// Constants
// ============================================

/**
 * Coordination protocol version
 */
export const COORDINATION_VERSION = '1.0.0';

/**
 * Default ping interval in milliseconds
 */
export const DEFAULT_PING_INTERVAL = 5000;

/**
 * Default health check interval in milliseconds
 */
export const DEFAULT_HEALTH_CHECK_INTERVAL = 10000;

/**
 * Default reconnection timeout in milliseconds
 */
export const DEFAULT_RECONNECT_TIMEOUT = 30000;

/**
 * Maximum reconnection attempts before giving up
 */
export const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Default sync batch size
 */
export const DEFAULT_SYNC_BATCH_SIZE = 50;

/**
 * Connection health threshold (RTT in ms)
 */
export const HEALTH_RTT_WARNING_THRESHOLD = 500;

/**
 * Connection health threshold (RTT in ms)
 */
export const HEALTH_RTT_CRITICAL_THRESHOLD = 2000;

/**
 * Packet loss warning threshold (percentage)
 */
export const HEALTH_PACKET_LOSS_WARNING = 5;

/**
 * Packet loss critical threshold (percentage)
 */
export const HEALTH_PACKET_LOSS_CRITICAL = 20;

// ============================================
// Coordination State
// ============================================

/**
 * Coordination state enumeration
 */
export enum CoordinationState {
  /** Not connected to any peer */
  DISCONNECTED = 'disconnected',
  /** Attempting to connect to peer */
  CONNECTING = 'connecting',
  /** Connected, performing authentication */
  AUTHENTICATING = 'authenticating',
  /** Authenticated, synchronizing patterns */
  SYNCING = 'syncing',
  /** Fully synchronized and coordinated */
  SYNCHRONIZED = 'synchronized',
  /** Connection degraded but functional */
  DEGRADED = 'degraded',
  /** Attempting to reconnect after failure */
  RECONNECTING = 'reconnecting',
  /** Unrecoverable error state */
  ERROR = 'error',
}

/**
 * Coordination role in the network
 */
export enum CoordinationRole {
  /** Initiator of the connection */
  INITIATOR = 'initiator',
  /** Responder to connection request */
  RESPONDER = 'responder',
  /** Both roles (for bidirectional communication) */
  BIDIRECTIONAL = 'bidirectional',
}

// ============================================
// Sync Status
// ============================================

/**
 * Detailed sync status for coordination
 */
export interface SyncStatus {
  /** Overall sync state */
  state: 'idle' | 'syncing' | 'completed' | 'failed';

  /** Number of patterns to sync */
  totalPatterns: number;

  /** Number of patterns synced */
  syncedPatterns: number;

  /** Number of patterns pending */
  pendingPatterns: number;

  /** Number of conflicts detected */
  conflicts: number;

  /** Number of conflicts resolved */
  conflictsResolved: number;

  /** Sync start time */
  startedAt?: string;

  /** Sync completion time */
  completedAt?: string;

  /** Current sync progress (0-100) */
  progressPercent: number;

  /** Estimated time remaining (ms) */
  estimatedTimeRemaining?: number;

  /** Last error if failed */
  lastError?: string;

  /** Direction of current sync */
  direction: 'pull' | 'push' | 'bidirectional';

  /** Bytes transferred */
  bytesTransferred: number;

  /** Patterns per second rate */
  patternsPerSecond: number;
}

// ============================================
// Coordination Metrics
// ============================================

/**
 * Coordination metrics for monitoring
 */
export interface CoordinationMetrics {
  /** Round-trip latency in milliseconds */
  latencyMs: number;

  /** Average latency over time window */
  avgLatencyMs: number;

  /** Minimum latency observed */
  minLatencyMs: number;

  /** Maximum latency observed */
  maxLatencyMs: number;

  /** Latency jitter (standard deviation) */
  jitterMs: number;

  /** Total messages sent */
  messagesSent: number;

  /** Total messages received */
  messagesReceived: number;

  /** Messages sent per second */
  messagesPerSecond: number;

  /** Total bytes sent */
  bytesSent: number;

  /** Total bytes received */
  bytesReceived: number;

  /** Number of conflicts detected */
  conflictsDetected: number;

  /** Number of conflicts resolved */
  conflictsResolved: number;

  /** Number of reconnection attempts */
  reconnectionAttempts: number;

  /** Successful syncs count */
  successfulSyncs: number;

  /** Failed syncs count */
  failedSyncs: number;

  /** Connection uptime in milliseconds */
  uptimeMs: number;

  /** Last activity timestamp */
  lastActivityAt: number;

  /** Timestamp when metrics were collected */
  collectedAt: number;
}

/**
 * Health status levels
 */
export enum HealthLevel {
  /** Connection is healthy */
  HEALTHY = 'healthy',
  /** Connection has minor issues */
  WARNING = 'warning',
  /** Connection has serious issues */
  CRITICAL = 'critical',
  /** Connection is unhealthy/failed */
  UNHEALTHY = 'unhealthy',
}

/**
 * Connection health status
 */
export interface HealthStatus {
  /** Overall health level */
  level: HealthLevel;

  /** Health score (0-100) */
  score: number;

  /** Whether connection is responsive */
  isResponsive: boolean;

  /** Last successful ping time */
  lastPingAt?: number;

  /** Last pong received time */
  lastPongAt?: number;

  /** Consecutive failed pings */
  failedPings: number;

  /** Current RTT measurement */
  currentRttMs: number;

  /** Packet loss percentage */
  packetLossPercent: number;

  /** Issues detected */
  issues: HealthIssue[];

  /** Recommendations for improvement */
  recommendations: string[];

  /** Timestamp of health check */
  checkedAt: number;
}

/**
 * Health issue descriptor
 */
export interface HealthIssue {
  /** Issue type */
  type: 'high_latency' | 'packet_loss' | 'no_response' | 'jitter' | 'degraded';

  /** Issue severity */
  severity: 'warning' | 'critical';

  /** Issue description */
  message: string;

  /** Issue detection time */
  detectedAt: number;

  /** Affected metric value */
  value?: number;

  /** Threshold that was exceeded */
  threshold?: number;
}

// ============================================
// Peer Information
// ============================================

/**
 * Peer information for coordination
 */
export interface PeerInfo {
  /** Unique peer identifier */
  peerId: PeerId;

  /** Agent identity (if authenticated) */
  identity?: AgentIdentity;

  /** Peer's public key (Base64) */
  publicKey?: string;

  /** Current coordination state with this peer */
  state: CoordinationState;

  /** Role in the coordination */
  role: CoordinationRole;

  /** Connection quality metrics */
  connectionQuality?: ConnectionQuality;

  /** Health status */
  health: HealthStatus;

  /** Coordination metrics */
  metrics: CoordinationMetrics;

  /** Sync status */
  syncStatus: SyncStatus;

  /** Whether peer is authenticated */
  isAuthenticated: boolean;

  /** Whether peer is trusted */
  isTrusted: boolean;

  /** Peer capabilities */
  capabilities: PeerCapabilities;

  /** Peer metadata */
  metadata?: Record<string, unknown>;

  /** Connection established time */
  connectedAt?: number;

  /** Last seen timestamp */
  lastSeenAt: number;

  /** Reconnection attempts for this peer */
  reconnectAttempts: number;
}

/**
 * Peer capabilities for coordination
 */
export interface PeerCapabilities {
  /** Supported coordination version */
  version: string;

  /** Supports pattern sharing */
  patternSharing: boolean;

  /** Supports CRDT sync */
  crdtSync: boolean;

  /** Supports differential privacy */
  differentialPrivacy: boolean;

  /** Maximum batch size */
  maxBatchSize: number;

  /** Supported pattern categories */
  categories: string[];

  /** Custom capabilities */
  custom?: Record<string, unknown>;
}

// ============================================
// Coordination Configuration
// ============================================

/**
 * Configuration for coordination manager
 */
export interface CoordinationConfig {
  /** Local agent identity */
  localIdentity: AgentIdentity;

  /** Local agent's keypair for signing */
  localKeyPair: {
    publicKey: string;
    privateKey: string;
  };

  /** Signaling server URL for WebRTC */
  signalingUrl?: string;

  /** Default role for connections */
  defaultRole: CoordinationRole;

  /** Enable automatic reconnection */
  autoReconnect: boolean;

  /** Maximum reconnection attempts */
  maxReconnectAttempts: number;

  /** Reconnection timeout in milliseconds */
  reconnectTimeout: number;

  /** Ping interval for health monitoring */
  pingInterval: number;

  /** Health check interval */
  healthCheckInterval: number;

  /** Sync configuration */
  syncConfig: SyncConfig;

  /** Authentication timeout in milliseconds */
  authTimeout: number;

  /** Enable logging */
  enableLogging: boolean;

  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  /** Custom ICE servers */
  iceServers?: Array<{
    urls: string | string[];
    username?: string;
    credential?: string;
  }>;

  /** Trust verification callback */
  onVerifyTrust?: (identity: AgentIdentity) => Promise<boolean>;
}

/**
 * Sync configuration for coordination
 */
export interface SyncConfig {
  /** Enable automatic sync on connection */
  autoSyncOnConnect: boolean;

  /** Sync interval in milliseconds (0 to disable) */
  syncInterval: number;

  /** Batch size for sync operations */
  batchSize: number;

  /** Conflict resolution strategy */
  conflictStrategy: 'latest_wins' | 'prefer_local' | 'prefer_remote' | 'merge';

  /** Enable incremental sync using vector clocks */
  incrementalSync: boolean;

  /** Maximum patterns to sync per session */
  maxPatternsPerSync: number;

  /** Enable pattern validation during sync */
  validatePatterns: boolean;

  /** Timeout for sync operations */
  syncTimeout: number;
}

/**
 * Default coordination configuration
 */
export const DEFAULT_COORDINATION_CONFIG: Omit<CoordinationConfig, 'localIdentity' | 'localKeyPair'> = {
  defaultRole: CoordinationRole.BIDIRECTIONAL,
  autoReconnect: true,
  maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
  reconnectTimeout: DEFAULT_RECONNECT_TIMEOUT,
  pingInterval: DEFAULT_PING_INTERVAL,
  healthCheckInterval: DEFAULT_HEALTH_CHECK_INTERVAL,
  authTimeout: 30000,
  enableLogging: true,
  logLevel: 'info',
  syncConfig: {
    autoSyncOnConnect: true,
    syncInterval: 60000,
    batchSize: DEFAULT_SYNC_BATCH_SIZE,
    conflictStrategy: 'latest_wins',
    incrementalSync: true,
    maxPatternsPerSync: 1000,
    validatePatterns: true,
    syncTimeout: 120000,
  },
};

// ============================================
// Events
// ============================================

/**
 * Coordination event types
 */
export enum CoordinationEventType {
  /** State changed */
  STATE_CHANGED = 'state_changed',
  /** Peer connected */
  PEER_CONNECTED = 'peer_connected',
  /** Peer disconnected */
  PEER_DISCONNECTED = 'peer_disconnected',
  /** Peer authenticated */
  PEER_AUTHENTICATED = 'peer_authenticated',
  /** Authentication failed */
  AUTH_FAILED = 'auth_failed',
  /** Sync started */
  SYNC_STARTED = 'sync_started',
  /** Sync progress */
  SYNC_PROGRESS = 'sync_progress',
  /** Sync completed */
  SYNC_COMPLETED = 'sync_completed',
  /** Sync failed */
  SYNC_FAILED = 'sync_failed',
  /** Conflict detected */
  CONFLICT_DETECTED = 'conflict_detected',
  /** Conflict resolved */
  CONFLICT_RESOLVED = 'conflict_resolved',
  /** Health warning */
  HEALTH_WARNING = 'health_warning',
  /** Health critical */
  HEALTH_CRITICAL = 'health_critical',
  /** Health recovered */
  HEALTH_RECOVERED = 'health_recovered',
  /** Reconnecting */
  RECONNECTING = 'reconnecting',
  /** Reconnection failed */
  RECONNECT_FAILED = 'reconnect_failed',
  /** Pattern received */
  PATTERN_RECEIVED = 'pattern_received',
  /** Pattern sent */
  PATTERN_SENT = 'pattern_sent',
  /** Error occurred */
  ERROR = 'error',
}

/**
 * Coordination event structure
 */
export interface CoordinationEvent<T = unknown> {
  /** Event type */
  type: CoordinationEventType;

  /** Event timestamp */
  timestamp: number;

  /** Peer ID associated with event */
  peerId?: PeerId;

  /** Event data */
  data: T;
}

/**
 * Coordination event handler type
 */
export type CoordinationEventHandler<T = unknown> = (event: CoordinationEvent<T>) => void;

// ============================================
// Messages
// ============================================

/**
 * Coordination message types
 */
export enum CoordinationMessageType {
  /** Authentication challenge */
  AUTH_CHALLENGE = 'auth_challenge',
  /** Authentication response */
  AUTH_RESPONSE = 'auth_response',
  /** Authentication result */
  AUTH_RESULT = 'auth_result',
  /** Capability exchange */
  CAPABILITIES = 'capabilities',
  /** Ping request */
  PING = 'ping',
  /** Pong response */
  PONG = 'pong',
  /** Sync request */
  SYNC_REQUEST = 'sync_request',
  /** Sync response */
  SYNC_RESPONSE = 'sync_response',
  /** Sync complete */
  SYNC_COMPLETE = 'sync_complete',
  /** Pattern batch */
  PATTERN_BATCH = 'pattern_batch',
  /** Conflict notification */
  CONFLICT = 'conflict',
  /** Error notification */
  ERROR = 'error',
  /** Disconnect notification */
  DISCONNECT = 'disconnect',
}

/**
 * Base coordination message
 */
export interface CoordinationMessage<T = unknown> {
  /** Message type */
  type: CoordinationMessageType;

  /** Message ID */
  messageId: string;

  /** Correlation ID for request/response pairs */
  correlationId?: string;

  /** Sender ID */
  senderId: string;

  /** Message payload */
  payload: T;

  /** Message timestamp */
  timestamp: number;

  /** Message signature */
  signature?: string;
}

/**
 * Authentication challenge payload
 */
export interface AuthChallengePayload {
  /** Random challenge to sign */
  challenge: string;

  /** Challenge creation time */
  timestamp: string;

  /** Challenge expiration (ms from timestamp) */
  expiresIn: number;

  /** Sender's capabilities */
  capabilities: PeerCapabilities;
}

/**
 * Authentication response payload
 */
export interface AuthResponsePayload {
  /** Identity proof with signed challenge */
  identityProof: IdentityProof;

  /** Responder's capabilities */
  capabilities: PeerCapabilities;
}

/**
 * Authentication result payload
 */
export interface AuthResultPayload {
  /** Whether authentication succeeded */
  success: boolean;

  /** Session ID if successful */
  sessionId?: string;

  /** Agreed capabilities */
  capabilities?: PeerCapabilities;

  /** Error message if failed */
  error?: string;
}

/**
 * Ping payload for health monitoring
 */
export interface PingPayload {
  /** Ping sequence number */
  sequence: number;

  /** Sender's timestamp */
  timestamp: number;
}

/**
 * Pong payload for health monitoring
 */
export interface PongPayload {
  /** Echo of ping sequence */
  sequence: number;

  /** Original ping timestamp */
  originalTimestamp: number;

  /** Responder's timestamp */
  timestamp: number;
}

// ============================================
// Errors
// ============================================

/**
 * Coordination error codes
 */
export enum CoordinationErrorCode {
  /** Connection failed */
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  /** Authentication failed */
  AUTH_FAILED = 'AUTH_FAILED',
  /** Authentication timeout */
  AUTH_TIMEOUT = 'AUTH_TIMEOUT',
  /** Invalid signature */
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  /** Peer not found */
  PEER_NOT_FOUND = 'PEER_NOT_FOUND',
  /** Peer not authenticated */
  PEER_NOT_AUTHENTICATED = 'PEER_NOT_AUTHENTICATED',
  /** Sync failed */
  SYNC_FAILED = 'SYNC_FAILED',
  /** Sync timeout */
  SYNC_TIMEOUT = 'SYNC_TIMEOUT',
  /** Conflict resolution failed */
  CONFLICT_RESOLUTION_FAILED = 'CONFLICT_RESOLUTION_FAILED',
  /** Protocol version mismatch */
  VERSION_MISMATCH = 'VERSION_MISMATCH',
  /** Invalid message */
  INVALID_MESSAGE = 'INVALID_MESSAGE',
  /** Rate limited */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Connection closed */
  CONNECTION_CLOSED = 'CONNECTION_CLOSED',
  /** Max reconnection attempts exceeded */
  MAX_RECONNECTS_EXCEEDED = 'MAX_RECONNECTS_EXCEEDED',
  /** Unknown error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Coordination error class
 */
export class CoordinationError extends Error {
  constructor(
    message: string,
    public readonly code: CoordinationErrorCode,
    public readonly peerId?: PeerId,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CoordinationError';
  }
}

// ============================================
// Utility Types
// ============================================

/**
 * Create default peer capabilities
 */
export function createDefaultCapabilities(): PeerCapabilities {
  return {
    version: COORDINATION_VERSION,
    patternSharing: true,
    crdtSync: true,
    differentialPrivacy: false,
    maxBatchSize: DEFAULT_SYNC_BATCH_SIZE,
    categories: ['test', 'code', 'refactor', 'bugfix'],
  };
}

/**
 * Create default sync status
 */
export function createDefaultSyncStatus(): SyncStatus {
  return {
    state: 'idle',
    totalPatterns: 0,
    syncedPatterns: 0,
    pendingPatterns: 0,
    conflicts: 0,
    conflictsResolved: 0,
    progressPercent: 0,
    direction: 'bidirectional',
    bytesTransferred: 0,
    patternsPerSecond: 0,
  };
}

/**
 * Create default coordination metrics
 */
export function createDefaultMetrics(): CoordinationMetrics {
  return {
    latencyMs: 0,
    avgLatencyMs: 0,
    minLatencyMs: Infinity,
    maxLatencyMs: 0,
    jitterMs: 0,
    messagesSent: 0,
    messagesReceived: 0,
    messagesPerSecond: 0,
    bytesSent: 0,
    bytesReceived: 0,
    conflictsDetected: 0,
    conflictsResolved: 0,
    reconnectionAttempts: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    uptimeMs: 0,
    lastActivityAt: Date.now(),
    collectedAt: Date.now(),
  };
}

/**
 * Create default health status
 */
export function createDefaultHealthStatus(): HealthStatus {
  return {
    level: HealthLevel.HEALTHY,
    score: 100,
    isResponsive: true,
    failedPings: 0,
    currentRttMs: 0,
    packetLossPercent: 0,
    issues: [],
    recommendations: [],
    checkedAt: Date.now(),
  };
}

/**
 * Generate unique message ID
 */
export function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `coord-${timestamp}-${random}`;
}

/**
 * Generate authentication challenge
 */
export function generateChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

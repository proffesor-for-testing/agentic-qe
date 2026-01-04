/**
 * WebRTC Types for @ruvector/edge P2P Foundation
 *
 * Type definitions for WebRTC peer connections, signaling, ICE management,
 * and data channel communication in browser environments.
 *
 * @module edge/p2p/webrtc/types
 * @version 1.0.0
 */

// ============================================
// Core Connection Types
// ============================================

/**
 * Unique identifier for a peer in the P2P network
 */
export type PeerId = string;

/**
 * Unique identifier for a room (group of peers)
 */
export type RoomId = string;

/**
 * Connection state enumeration
 */
export enum ConnectionState {
  /** Initial state, not yet connecting */
  NEW = 'new',
  /** Connection attempt in progress */
  CONNECTING = 'connecting',
  /** Connection established and active */
  CONNECTED = 'connected',
  /** Connection temporarily interrupted, attempting recovery */
  RECONNECTING = 'reconnecting',
  /** Connection closed gracefully */
  DISCONNECTED = 'disconnected',
  /** Connection failed due to error */
  FAILED = 'failed',
  /** Connection closed permanently */
  CLOSED = 'closed',
}

/**
 * Peer connection metadata and state
 */
export interface PeerConnection {
  /** Unique peer identifier */
  id: PeerId;
  /** Current connection state */
  state: ConnectionState;
  /** Native RTCPeerConnection instance */
  rtcConnection: RTCPeerConnection;
  /** Map of data channels by label */
  dataChannels: Map<string, RTCDataChannel>;
  /** Connection quality metrics */
  quality: ConnectionQuality;
  /** Timestamp of connection creation */
  createdAt: number;
  /** Timestamp of last activity */
  lastActivityAt: number;
  /** Number of reconnection attempts */
  reconnectAttempts: number;
  /** Custom metadata attached to this peer */
  metadata?: Record<string, unknown>;
}

/**
 * Connection quality metrics
 */
export interface ConnectionQuality {
  /** Round-trip time in milliseconds */
  rttMs: number;
  /** Packet loss percentage (0-100) */
  packetLossPercent: number;
  /** Available outbound bandwidth in bits/second */
  availableBandwidth: number;
  /** Local ICE candidate type */
  localCandidateType: ICECandidateType;
  /** Remote ICE candidate type */
  remoteCandidateType: ICECandidateType;
  /** Timestamp of last quality measurement */
  measuredAt: number;
}

// ============================================
// ICE Types
// ============================================

/**
 * ICE candidate type classification
 */
export type ICECandidateType = 'host' | 'srflx' | 'prflx' | 'relay' | 'unknown';

/**
 * NAT type classification
 */
export enum NATType {
  /** No NAT detected (public IP) */
  NONE = 'none',
  /** Full cone NAT - most permissive */
  FULL_CONE = 'full_cone',
  /** Address-restricted cone NAT */
  ADDRESS_RESTRICTED = 'address_restricted',
  /** Port-restricted cone NAT */
  PORT_RESTRICTED = 'port_restricted',
  /** Symmetric NAT - most restrictive */
  SYMMETRIC = 'symmetric',
  /** NAT type could not be determined */
  UNKNOWN = 'unknown',
}

/**
 * ICE candidate information
 */
export interface ICECandidate {
  /** Candidate string in SDP format */
  candidate: string;
  /** SDP media description index */
  sdpMLineIndex: number | null;
  /** SDP media description identifier */
  sdpMid: string | null;
  /** Username fragment for ICE */
  usernameFragment: string | null;
  /** Candidate type classification */
  type: ICECandidateType;
  /** Candidate priority */
  priority: number;
  /** IP address (may be empty for privacy) */
  address?: string;
  /** Port number */
  port?: number;
  /** Transport protocol */
  protocol?: 'udp' | 'tcp';
}

/**
 * ICE server configuration
 */
export interface ICEServer {
  /** STUN/TURN server URLs */
  urls: string | string[];
  /** Username for TURN authentication */
  username?: string;
  /** Credential for TURN authentication */
  credential?: string;
  /** Credential type ('password' or 'oauth') */
  credentialType?: 'password' | 'oauth';
}

/**
 * ICE manager configuration
 */
export interface ICEManagerConfig {
  /** List of ICE servers (STUN/TURN) */
  iceServers: ICEServer[];
  /** ICE transport policy */
  iceTransportPolicy?: RTCIceTransportPolicy;
  /** Bundle policy for media */
  bundlePolicy?: RTCBundlePolicy;
  /** Enable ICE candidate trickling */
  enableTrickle?: boolean;
  /** Timeout for ICE gathering in ms */
  gatheringTimeout?: number;
  /** Enable TURN fallback if direct connection fails */
  enableTurnFallback?: boolean;
}

/**
 * ICE gathering state
 */
export interface ICEGatheringState {
  /** Current gathering state */
  state: RTCIceGatheringState;
  /** Collected local candidates */
  localCandidates: ICECandidate[];
  /** Received remote candidates */
  remoteCandidates: ICECandidate[];
  /** Detected NAT type */
  natType: NATType;
  /** Whether gathering is complete */
  isComplete: boolean;
}

// ============================================
// Signaling Types
// ============================================

/**
 * Signaling message type enumeration
 */
export enum SignalingMessageType {
  /** SDP offer message */
  OFFER = 'offer',
  /** SDP answer message */
  ANSWER = 'answer',
  /** ICE candidate message */
  ICE_CANDIDATE = 'ice_candidate',
  /** Join room request */
  JOIN_ROOM = 'join_room',
  /** Leave room notification */
  LEAVE_ROOM = 'leave_room',
  /** Peer joined room notification */
  PEER_JOINED = 'peer_joined',
  /** Peer left room notification */
  PEER_LEFT = 'peer_left',
  /** Room info response */
  ROOM_INFO = 'room_info',
  /** Heartbeat ping */
  PING = 'ping',
  /** Heartbeat pong */
  PONG = 'pong',
  /** Error message */
  ERROR = 'error',
  /** Peer renegotiation request */
  RENEGOTIATE = 'renegotiate',
}

/**
 * Base signaling message structure
 */
export interface SignalingMessageBase {
  /** Message type */
  type: SignalingMessageType;
  /** Unique message identifier */
  id: string;
  /** Sender peer ID */
  from: PeerId;
  /** Target peer ID (optional for broadcasts) */
  to?: PeerId;
  /** Room ID context */
  roomId?: RoomId;
  /** Message timestamp */
  timestamp: number;
}

/**
 * SDP offer message
 */
export interface SignalingOfferMessage extends SignalingMessageBase {
  type: SignalingMessageType.OFFER;
  payload: {
    sdp: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * SDP answer message
 */
export interface SignalingAnswerMessage extends SignalingMessageBase {
  type: SignalingMessageType.ANSWER;
  payload: {
    sdp: string;
    metadata?: Record<string, unknown>;
  };
}

/**
 * ICE candidate message
 */
export interface SignalingICECandidateMessage extends SignalingMessageBase {
  type: SignalingMessageType.ICE_CANDIDATE;
  payload: {
    candidate: ICECandidate;
  };
}

/**
 * Join room message
 */
export interface SignalingJoinRoomMessage extends SignalingMessageBase {
  type: SignalingMessageType.JOIN_ROOM;
  payload: {
    roomId: RoomId;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Leave room message
 */
export interface SignalingLeaveRoomMessage extends SignalingMessageBase {
  type: SignalingMessageType.LEAVE_ROOM;
  payload: {
    roomId: RoomId;
    reason?: string;
  };
}

/**
 * Peer joined notification
 */
export interface SignalingPeerJoinedMessage extends SignalingMessageBase {
  type: SignalingMessageType.PEER_JOINED;
  payload: {
    peerId: PeerId;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Peer left notification
 */
export interface SignalingPeerLeftMessage extends SignalingMessageBase {
  type: SignalingMessageType.PEER_LEFT;
  payload: {
    peerId: PeerId;
    reason?: string;
  };
}

/**
 * Room info message
 */
export interface SignalingRoomInfoMessage extends SignalingMessageBase {
  type: SignalingMessageType.ROOM_INFO;
  payload: {
    roomId: RoomId;
    peers: Array<{
      id: PeerId;
      metadata?: Record<string, unknown>;
    }>;
  };
}

/**
 * Ping message
 */
export interface SignalingPingMessage extends SignalingMessageBase {
  type: SignalingMessageType.PING;
  payload: {
    timestamp: number;
  };
}

/**
 * Pong message
 */
export interface SignalingPongMessage extends SignalingMessageBase {
  type: SignalingMessageType.PONG;
  payload: {
    originalTimestamp: number;
    respondTimestamp: number;
  };
}

/**
 * Error message
 */
export interface SignalingErrorMessage extends SignalingMessageBase {
  type: SignalingMessageType.ERROR;
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Renegotiation request message
 */
export interface SignalingRenegotiateMessage extends SignalingMessageBase {
  type: SignalingMessageType.RENEGOTIATE;
  payload: {
    reason: string;
  };
}

/**
 * Union type of all signaling messages
 */
export type SignalingMessage =
  | SignalingOfferMessage
  | SignalingAnswerMessage
  | SignalingICECandidateMessage
  | SignalingJoinRoomMessage
  | SignalingLeaveRoomMessage
  | SignalingPeerJoinedMessage
  | SignalingPeerLeftMessage
  | SignalingRoomInfoMessage
  | SignalingPingMessage
  | SignalingPongMessage
  | SignalingErrorMessage
  | SignalingRenegotiateMessage;

/**
 * Signaling client configuration
 */
export interface SignalingClientConfig {
  /** WebSocket server URL */
  serverUrl: string;
  /** Local peer ID */
  peerId: PeerId;
  /** Automatic reconnection */
  autoReconnect?: boolean;
  /** Reconnection delay in ms */
  reconnectDelay?: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Heartbeat interval in ms */
  heartbeatInterval?: number;
  /** Connection timeout in ms */
  connectionTimeout?: number;
  /** Authentication token */
  authToken?: string;
}

/**
 * Signaling client state
 */
export enum SignalingClientState {
  /** Not connected */
  DISCONNECTED = 'disconnected',
  /** Connecting to server */
  CONNECTING = 'connecting',
  /** Connected and ready */
  CONNECTED = 'connected',
  /** Reconnecting after disconnect */
  RECONNECTING = 'reconnecting',
  /** Connection failed */
  FAILED = 'failed',
  /** Closed permanently */
  CLOSED = 'closed',
}

// ============================================
// Data Channel Types
// ============================================

/**
 * Data channel configuration
 */
export interface DataChannelConfig {
  /** Channel label/name */
  label: string;
  /** Whether delivery is guaranteed (ordered, reliable) */
  reliable?: boolean;
  /** Whether messages are ordered */
  ordered?: boolean;
  /** Maximum retransmissions (for unreliable channels) */
  maxRetransmits?: number;
  /** Maximum packet lifetime in ms (for unreliable channels) */
  maxPacketLifeTime?: number;
  /** Protocol identifier */
  protocol?: string;
  /** Pre-negotiated channel ID */
  negotiated?: boolean;
  /** Channel ID (if negotiated) */
  id?: number;
}

/**
 * Data channel state
 */
export interface DataChannelState {
  /** Channel label */
  label: string;
  /** Ready state */
  readyState: RTCDataChannelState;
  /** Buffered amount in bytes */
  bufferedAmount: number;
  /** Buffered amount low threshold */
  bufferedAmountLowThreshold: number;
  /** Whether channel is reliable */
  reliable: boolean;
  /** Whether channel is ordered */
  ordered: boolean;
  /** Channel protocol */
  protocol: string;
}

/**
 * Data channel message with metadata
 */
export interface DataChannelMessage<T = unknown> {
  /** Message type identifier */
  type: string;
  /** Message payload */
  data: T;
  /** Message ID for acknowledgment */
  id?: string;
  /** Message timestamp */
  timestamp: number;
  /** Whether acknowledgment is required */
  requireAck?: boolean;
}

// ============================================
// Connection Pool Types
// ============================================

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  /** Maximum number of connections */
  maxConnections: number;
  /** Minimum connections to maintain */
  minConnections?: number;
  /** Connection idle timeout in ms */
  idleTimeout?: number;
  /** Connection health check interval in ms */
  healthCheckInterval?: number;
  /** Eviction policy when pool is full */
  evictionPolicy?: EvictionPolicy;
  /** Priority function for connections */
  priorityFunction?: (connection: PeerConnection) => number;
}

/**
 * Eviction policy for connection pool
 */
export enum EvictionPolicy {
  /** Least Recently Used */
  LRU = 'lru',
  /** Least Frequently Used */
  LFU = 'lfu',
  /** Lowest Quality */
  LOWEST_QUALITY = 'lowest_quality',
  /** Oldest First */
  OLDEST = 'oldest',
  /** Random Selection */
  RANDOM = 'random',
}

/**
 * Connection pool statistics
 */
export interface ConnectionPoolStats {
  /** Total connections in pool */
  totalConnections: number;
  /** Active (connected) connections */
  activeConnections: number;
  /** Idle connections */
  idleConnections: number;
  /** Failed connections */
  failedConnections: number;
  /** Average connection quality */
  averageQuality: ConnectionQuality | null;
  /** Total bytes sent */
  totalBytesSent: number;
  /** Total bytes received */
  totalBytesReceived: number;
  /** Pool creation time */
  createdAt: number;
}

// ============================================
// Peer Connection Manager Types
// ============================================

/**
 * Peer connection manager configuration
 */
export interface PeerConnectionManagerConfig {
  /** Local peer identifier */
  localPeerId: PeerId;
  /** ICE manager configuration */
  iceConfig?: ICEManagerConfig;
  /** Connection pool configuration */
  poolConfig?: Partial<ConnectionPoolConfig>;
  /** Default data channel configurations */
  defaultDataChannels?: DataChannelConfig[];
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
  /** Reconnection configuration */
  reconnectConfig?: ReconnectionConfig;
  /** Connection state change callback */
  onConnectionStateChange?: (peerId: PeerId, state: ConnectionState) => void;
  /** Data received callback */
  onDataReceived?: (peerId: PeerId, channel: string, data: unknown) => void;
  /** Error callback */
  onError?: (peerId: PeerId, error: Error) => void;
}

/**
 * Reconnection configuration
 */
export interface ReconnectionConfig {
  /** Initial delay before first reconnection attempt */
  initialDelay: number;
  /** Maximum delay between reconnection attempts */
  maxDelay: number;
  /** Delay multiplier for exponential backoff */
  multiplier: number;
  /** Maximum number of reconnection attempts */
  maxAttempts: number;
  /** Jitter factor (0-1) to randomize delays */
  jitter: number;
}

/**
 * Connection request options
 */
export interface ConnectOptions {
  /** Custom metadata to send with offer */
  metadata?: Record<string, unknown>;
  /** Data channels to create */
  dataChannels?: DataChannelConfig[];
  /** Whether to create offer (vs wait for offer) */
  initiator?: boolean;
  /** Connection timeout in ms */
  timeout?: number;
}

/**
 * Disconnect options
 */
export interface DisconnectOptions {
  /** Reason for disconnection */
  reason?: string;
  /** Whether to send notification to peer */
  notify?: boolean;
  /** Grace period before force close */
  gracePeriod?: number;
}

// ============================================
// Event Types
// ============================================

/**
 * WebRTC event types
 */
export enum WebRTCEventType {
  /** Connection state changed */
  CONNECTION_STATE_CHANGED = 'connection_state_changed',
  /** ICE candidate gathered */
  ICE_CANDIDATE = 'ice_candidate',
  /** ICE gathering state changed */
  ICE_GATHERING_STATE_CHANGED = 'ice_gathering_state_changed',
  /** ICE connection state changed */
  ICE_CONNECTION_STATE_CHANGED = 'ice_connection_state_changed',
  /** Data channel opened */
  DATA_CHANNEL_OPEN = 'data_channel_open',
  /** Data channel closed */
  DATA_CHANNEL_CLOSED = 'data_channel_closed',
  /** Data channel message received */
  DATA_CHANNEL_MESSAGE = 'data_channel_message',
  /** Data channel error */
  DATA_CHANNEL_ERROR = 'data_channel_error',
  /** Connection error */
  CONNECTION_ERROR = 'connection_error',
  /** Reconnection started */
  RECONNECTING = 'reconnecting',
  /** Reconnection succeeded */
  RECONNECTED = 'reconnected',
  /** Quality measurement updated */
  QUALITY_UPDATED = 'quality_updated',
  /** Signaling connected */
  SIGNALING_CONNECTED = 'signaling_connected',
  /** Signaling disconnected */
  SIGNALING_DISCONNECTED = 'signaling_disconnected',
  /** Signaling error */
  SIGNALING_ERROR = 'signaling_error',
  /** Peer joined room */
  PEER_JOINED = 'peer_joined',
  /** Peer left room */
  PEER_LEFT = 'peer_left',
}

/**
 * Generic WebRTC event structure
 */
export interface WebRTCEvent<T = unknown> {
  /** Event type */
  type: WebRTCEventType;
  /** Event timestamp */
  timestamp: number;
  /** Peer ID associated with event */
  peerId?: PeerId;
  /** Event data */
  data: T;
}

/**
 * Event handler type
 */
export type WebRTCEventHandler<T = unknown> = (event: WebRTCEvent<T>) => void;

// ============================================
// Default Configurations
// ============================================

/**
 * Default ICE servers (public Google STUN servers)
 */
export const DEFAULT_ICE_SERVERS: ICEServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Default reconnection configuration
 */
export const DEFAULT_RECONNECT_CONFIG: ReconnectionConfig = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 2,
  maxAttempts: 5,
  jitter: 0.1,
};

/**
 * Default data channel configurations
 */
export const DEFAULT_DATA_CHANNELS: DataChannelConfig[] = [
  {
    label: 'reliable',
    reliable: true,
    ordered: true,
  },
  {
    label: 'unreliable',
    reliable: false,
    ordered: false,
    maxRetransmits: 0,
  },
];

/**
 * Default connection pool configuration
 */
export const DEFAULT_POOL_CONFIG: ConnectionPoolConfig = {
  maxConnections: 50,
  minConnections: 0,
  idleTimeout: 60000,
  healthCheckInterval: 30000,
  evictionPolicy: EvictionPolicy.LRU,
};

// ============================================
// Utility Types
// ============================================

/**
 * Result type for async operations
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Success/Failure result type
 */
export type Result<T, E = Error> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Connection event callback map
 */
export interface ConnectionEventMap {
  [WebRTCEventType.CONNECTION_STATE_CHANGED]: ConnectionState;
  [WebRTCEventType.ICE_CANDIDATE]: ICECandidate;
  [WebRTCEventType.ICE_GATHERING_STATE_CHANGED]: RTCIceGatheringState;
  [WebRTCEventType.ICE_CONNECTION_STATE_CHANGED]: RTCIceConnectionState;
  [WebRTCEventType.DATA_CHANNEL_OPEN]: DataChannelState;
  [WebRTCEventType.DATA_CHANNEL_CLOSED]: DataChannelState;
  [WebRTCEventType.DATA_CHANNEL_MESSAGE]: DataChannelMessage;
  [WebRTCEventType.DATA_CHANNEL_ERROR]: Error;
  [WebRTCEventType.CONNECTION_ERROR]: Error;
  [WebRTCEventType.RECONNECTING]: { attempt: number; maxAttempts: number };
  [WebRTCEventType.RECONNECTED]: { attempts: number };
  [WebRTCEventType.QUALITY_UPDATED]: ConnectionQuality;
}

/**
 * Generate unique ID
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
}

/**
 * Parse ICE candidate type from candidate string
 */
export function parseICECandidateType(candidate: string): ICECandidateType {
  if (candidate.includes('typ host')) return 'host';
  if (candidate.includes('typ srflx')) return 'srflx';
  if (candidate.includes('typ prflx')) return 'prflx';
  if (candidate.includes('typ relay')) return 'relay';
  return 'unknown';
}

/**
 * Create default connection quality object
 */
export function createDefaultConnectionQuality(): ConnectionQuality {
  return {
    rttMs: 0,
    packetLossPercent: 0,
    availableBandwidth: 0,
    localCandidateType: 'unknown',
    remoteCandidateType: 'unknown',
    measuredAt: Date.now(),
  };
}

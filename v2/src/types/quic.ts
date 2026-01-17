/**
 * QUIC Protocol Types for Distributed Agent Coordination
 *
 * Provides types for low-latency, connection-oriented communication between agents
 * using QUIC protocol features like multiplexing, 0-RTT, and stream prioritization.
 */

export interface QUICConfig {
  /** Enable QUIC transport (opt-in) */
  enabled: boolean;

  /** QUIC server host */
  host: string;

  /** QUIC server port */
  port: number;

  /** Communication channels for different message types */
  channels: QUICChannel[];

  /** Connection timeout in ms */
  connectionTimeout?: number;

  /** Enable 0-RTT for faster reconnection */
  enable0RTT?: boolean;

  /** Stream priority configuration */
  streamPriority?: {
    coordination: number;
    results: number;
    metrics: number;
    broadcast: number;
  };

  /** Enable connection migration */
  enableMigration?: boolean;

  /** Maximum concurrent streams */
  maxConcurrentStreams?: number;

  /** Congestion control algorithm */
  congestionControl?: 'cubic' | 'bbr' | 'reno';

  /** Security configuration */
  security?: QUICSecurityConfig;
}

export interface QUICSecurityConfig {
  /** Enable TLS 1.3 encryption */
  enableTLS: boolean;

  /** Certificate path for TLS */
  certPath?: string;

  /** Private key path for TLS */
  keyPath?: string;

  /** CA certificate path */
  caPath?: string;

  /** Verify peer certificates */
  verifyPeer?: boolean;

  /** Require client certificates */
  requireClientCertificates?: boolean;

  /** Enable token-based authentication */
  enableTokenAuth?: boolean;

  /** Authentication token */
  token?: string;

  /** Allowed cipher suites */
  allowedCipherSuites?: string[];
}

export interface QUICChannel {
  /** Channel name */
  name: string;

  /** Channel ID */
  id: string;

  /** Channel type */
  type: 'unicast' | 'broadcast' | 'multicast';

  /** Channel priority (higher = more important) */
  priority: number;

  /** Enable ordered delivery */
  ordered?: boolean;

  /** Enable reliable delivery */
  reliable?: boolean;

  /** Maximum message size in bytes */
  maxMessageSize?: number;

  /** Channel-specific metadata */
  metadata?: Record<string, any>;
}

export interface QUICPeerInfo {
  /** Peer agent ID */
  agentId: string;

  /** Peer agent type */
  agentType: string;

  /** Peer connection address */
  address: string;

  /** Peer connection port */
  port: number;

  /** Connection state */
  state: 'connecting' | 'connected' | 'disconnected' | 'error';

  /** Round-trip time in ms */
  rtt?: number;

  /** Bandwidth estimate in bytes/sec */
  bandwidth?: number;

  /** Peer capabilities */
  capabilities?: string[];

  /** Last activity timestamp */
  lastActivity: Date;

  /** Connection metadata */
  metadata?: Record<string, any>;
}

export interface QUICMessage {
  /** Message ID */
  id: string;

  /** Source agent ID */
  from: string;

  /** Target agent ID(s) */
  to: string | string[];

  /** Channel name */
  channel: string;

  /** Message type */
  type: QUICMessageType;

  /** Message payload */
  payload: any;

  /** Message priority */
  priority: number;

  /** Message timestamp */
  timestamp: Date;

  /** Request ID (for request-response pattern) */
  requestId?: string;

  /** Correlation ID for tracking */
  correlationId?: string;

  /** Time-to-live in ms */
  ttl?: number;

  /** Message metadata */
  metadata?: Record<string, any>;
}

export enum QUICMessageType {
  /** Direct message to specific agent */
  DIRECT = 'direct',

  /** Broadcast to all agents */
  BROADCAST = 'broadcast',

  /** Multicast to agent group */
  MULTICAST = 'multicast',

  /** Request message (expects response) */
  REQUEST = 'request',

  /** Response to request */
  RESPONSE = 'response',

  /** Streaming data */
  STREAM = 'stream',

  /** Heartbeat/keepalive */
  HEARTBEAT = 'heartbeat',

  /** Peer discovery */
  DISCOVERY = 'discovery',

  /** Connection control */
  CONTROL = 'control',

  /** Error notification */
  ERROR = 'error'
}

export interface QUICStreamOptions {
  /** Stream ID */
  streamId?: string;

  /** Stream priority */
  priority?: number;

  /** Enable ordered delivery */
  ordered?: boolean;

  /** Enable reliable delivery */
  reliable?: boolean;

  /** Buffer size in bytes */
  bufferSize?: number;

  /** Flow control window size */
  flowControlWindow?: number;

  /** Stream timeout in ms */
  timeout?: number;
}

export interface QUICConnectionStats {
  /** Total bytes sent */
  bytesSent: number;

  /** Total bytes received */
  bytesReceived: number;

  /** Total messages sent */
  messagesSent: number;

  /** Total messages received */
  messagesReceived: number;

  /** Current RTT in ms */
  currentRTT: number;

  /** Minimum RTT in ms */
  minRTT: number;

  /** Maximum RTT in ms */
  maxRTT: number;

  /** Average RTT in ms */
  avgRTT: number;

  /** Packet loss rate (0-1) */
  packetLoss: number;

  /** Current congestion window */
  congestionWindow: number;

  /** Active streams count */
  activeStreams: number;

  /** Connection uptime in ms */
  uptime: number;

  /** Last activity timestamp */
  lastActivity: Date;
}

export interface QUICTransportEvents {
  /** Connection established */
  'connection:established': (peer: QUICPeerInfo) => void;

  /** Connection lost */
  'connection:lost': (peer: QUICPeerInfo, reason: Error) => void;

  /** Peer discovered */
  'peer:discovered': (peer: QUICPeerInfo) => void;

  /** Peer left */
  'peer:left': (peer: QUICPeerInfo) => void;

  /** Message received */
  'message:received': (message: QUICMessage) => void;

  /** Stream opened */
  'stream:opened': (streamId: string, options: QUICStreamOptions) => void;

  /** Stream closed */
  'stream:closed': (streamId: string) => void;

  /** Transport error */
  'transport:error': (error: Error) => void;

  /** Connection stats updated */
  'stats:updated': (stats: QUICConnectionStats) => void;
}

export interface QUICDiscoveryOptions {
  /** Discovery timeout in ms */
  timeout?: number;

  /** Discovery interval in ms */
  interval?: number;

  /** Maximum peers to discover */
  maxPeers?: number;

  /** Filter discovered peers */
  filter?: (peer: QUICPeerInfo) => boolean;

  /** Discovery channels */
  channels?: string[];
}

export interface QUICBroadcastOptions {
  /** Broadcast channel */
  channel: string;

  /** Message priority */
  priority?: number;

  /** Time-to-live in ms */
  ttl?: number;

  /** Exclude specific peers */
  exclude?: string[];

  /** Include only specific peers */
  include?: string[];

  /** Delivery confirmation required */
  confirmDelivery?: boolean;
}

export interface QUICRequestOptions {
  /** Request timeout in ms */
  timeout?: number;

  /** Number of retry attempts */
  retries?: number;

  /** Retry delay in ms */
  retryDelay?: number;

  /** Expected response type */
  expectedResponseType?: string;

  /** Request priority */
  priority?: number;
}

export interface QUICStreamData {
  /** Stream ID */
  streamId: string;

  /** Data chunk */
  data: Buffer | string;

  /** Is final chunk */
  final?: boolean;

  /** Chunk sequence number */
  sequence?: number;

  /** Chunk metadata */
  metadata?: Record<string, any>;
}

export interface QUICHealthCheck {
  /** Transport is operational */
  operational: boolean;

  /** Connected peers count */
  connectedPeers: number;

  /** Active channels count */
  activeChannels: number;

  /** Average RTT in ms */
  avgRTT: number;

  /** Packet loss rate (0-1) */
  packetLoss: number;

  /** Transport errors in last minute */
  recentErrors: number;

  /** Last health check timestamp */
  timestamp: Date;

  /** Health status */
  status: 'healthy' | 'degraded' | 'unhealthy';

  /** Status message */
  message?: string;
}

/**
 * QUIC Transport Interface
 *
 * Abstract interface for QUIC transport implementation.
 * Allows for different QUIC library backends (e.g., @fails-components/webtransport, node-quic)
 */
export interface IQUICTransport {
  /** Initialize transport */
  initialize(config: QUICConfig): Promise<void>;

  /** Connect to peer */
  connect(peer: string, port: number): Promise<QUICPeerInfo>;

  /** Disconnect from peer */
  disconnect(peerId: string): Promise<void>;

  /** Send direct message */
  send(to: string, message: QUICMessage): Promise<void>;

  /** Broadcast message */
  broadcast(message: QUICMessage, options?: QUICBroadcastOptions): Promise<void>;

  /** Send request and wait for response */
  request(to: string, message: QUICMessage, options?: QUICRequestOptions): Promise<QUICMessage>;

  /** Open stream */
  openStream(streamId: string, options?: QUICStreamOptions): Promise<void>;

  /** Write to stream */
  writeStream(streamId: string, data: QUICStreamData): Promise<void>;

  /** Close stream */
  closeStream(streamId: string): Promise<void>;

  /** Discover peers */
  discoverPeers(options?: QUICDiscoveryOptions): Promise<QUICPeerInfo[]>;

  /** Get connected peers */
  getPeers(): QUICPeerInfo[];

  /** Get peer by ID */
  getPeer(peerId: string): QUICPeerInfo | undefined;

  /** Get connection stats */
  getStats(): QUICConnectionStats;

  /** Get health status */
  getHealth(): QUICHealthCheck;

  /** Subscribe to transport events */
  on<K extends keyof QUICTransportEvents>(
    event: K,
    handler: QUICTransportEvents[K]
  ): void;

  /** Unsubscribe from transport events */
  off<K extends keyof QUICTransportEvents>(
    event: K,
    handler: QUICTransportEvents[K]
  ): void;

  /** Close transport */
  close(): Promise<void>;
}

export interface QUICTransportError extends Error {
  code: QUICErrorCode;
  peer?: string;
  details?: any;
}

export enum QUICErrorCode {
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  CONNECTION_LOST = 'CONNECTION_LOST',
  PEER_NOT_FOUND = 'PEER_NOT_FOUND',
  CHANNEL_NOT_FOUND = 'CHANNEL_NOT_FOUND',
  MESSAGE_SEND_FAILED = 'MESSAGE_SEND_FAILED',
  MESSAGE_TIMEOUT = 'MESSAGE_TIMEOUT',
  STREAM_ERROR = 'STREAM_ERROR',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  SECURITY_ERROR = 'SECURITY_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

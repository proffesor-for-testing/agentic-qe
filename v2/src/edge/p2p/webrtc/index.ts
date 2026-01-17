/**
 * WebRTC Module for @ruvector/edge P2P Foundation
 *
 * Provides WebRTC-based peer-to-peer connectivity for agent-to-agent
 * communication in browser environments.
 *
 * Features:
 * - Peer connection management with automatic reconnection
 * - WebSocket-based signaling for connection establishment
 * - ICE candidate gathering and NAT traversal
 * - Connection pooling with eviction policies
 * - Reliable and unreliable data channels
 * - Connection quality monitoring
 *
 * @module edge/p2p/webrtc
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   PeerConnectionManager,
 *   SignalingClient,
 *   ConnectionState,
 *   WebRTCEventType,
 * } from './webrtc';
 *
 * // Initialize signaling
 * const signaling = new SignalingClient({
 *   serverUrl: 'wss://signal.example.com',
 *   peerId: 'my-peer-id',
 * });
 *
 * // Initialize connection manager
 * const manager = new PeerConnectionManager({
 *   localPeerId: 'my-peer-id',
 * });
 *
 * // Connect signaling to manager
 * manager.setSignaling(signaling);
 *
 * // Connect to signaling server and join room
 * await signaling.connect();
 * await signaling.joinRoom('my-room');
 *
 * // Listen for peer events
 * manager.on(WebRTCEventType.DATA_CHANNEL_MESSAGE, (event) => {
 *   console.log('Received from', event.peerId, ':', event.data);
 * });
 *
 * // Connect to a peer
 * const connection = await manager.connect('remote-peer-id');
 *
 * // Send a message
 * manager.send('remote-peer-id', 'reliable', {
 *   type: 'pattern-share',
 *   data: { pattern: 'example' },
 *   timestamp: Date.now(),
 * });
 * ```
 */

// Types and interfaces
export type {
  // Core types
  PeerId,
  RoomId,
  PeerConnection,
  ConnectionQuality,

  // ICE types
  ICECandidate,
  ICEServer,
  ICEManagerConfig,
  ICEGatheringState,
  ICECandidateType,

  // Signaling types
  SignalingMessage,
  SignalingClientConfig,
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
  SignalingRenegotiateMessage,

  // Data channel types
  DataChannelConfig,
  DataChannelState,
  DataChannelMessage,

  // Pool types
  ConnectionPoolConfig,
  ConnectionPoolStats,

  // Manager types
  PeerConnectionManagerConfig,
  ReconnectionConfig,
  ConnectOptions,
  DisconnectOptions,

  // Event types
  WebRTCEvent,
  WebRTCEventHandler,
  ConnectionEventMap,

  // Utility types
  AsyncResult,
  Result,
} from './types';

// Enums
export {
  ConnectionState,
  NATType,
  SignalingMessageType,
  SignalingClientState,
  EvictionPolicy,
  WebRTCEventType,
} from './types';

// Default configurations
export {
  DEFAULT_ICE_SERVERS,
  DEFAULT_RECONNECT_CONFIG,
  DEFAULT_DATA_CHANNELS,
  DEFAULT_POOL_CONFIG,
} from './types';

// Utility functions
export {
  generateId,
  parseICECandidateType,
  createDefaultConnectionQuality,
} from './types';

// Classes - Import for re-export and internal use
import { ICEManager as ICEManagerClass } from './ICEManager';
import { SignalingClient as SignalingClientClass } from './SignalingClient';
import { PeerConnectionManager as PeerConnectionManagerClass } from './PeerConnectionManager';
import { ConnectionPool as ConnectionPoolClass } from './ConnectionPool';

export { ICEManagerClass as ICEManager };
export type {
  ICECandidateHandler,
  ICEGatheringStateHandler,
  ICEConnectionStateHandler,
} from './ICEManager';

export { SignalingClientClass as SignalingClient };
export type { SignalingEventHandlers } from './SignalingClient';

export { PeerConnectionManagerClass as PeerConnectionManager };

export { ConnectionPoolClass as ConnectionPool };

// Version information
export const WEBRTC_MODULE_VERSION = '1.0.0';

/**
 * Check if WebRTC is supported in the current environment
 */
export function isWebRTCSupported(): boolean {
  return (
    typeof RTCPeerConnection !== 'undefined' &&
    typeof RTCDataChannel !== 'undefined' &&
    typeof RTCIceCandidate !== 'undefined' &&
    typeof RTCSessionDescription !== 'undefined'
  );
}

/**
 * Check if WebSocket is supported in the current environment
 */
export function isWebSocketSupported(): boolean {
  return typeof WebSocket !== 'undefined';
}

/**
 * Get WebRTC capabilities for the current environment
 */
export function getWebRTCCapabilities(): WebRTCCapabilities {
  return {
    supportsWebRTC: isWebRTCSupported(),
    supportsWebSocket: isWebSocketSupported(),
    supportsDataChannels: typeof RTCDataChannel !== 'undefined',
    supportsBroadcastChannel: typeof BroadcastChannel !== 'undefined',
    supportsSharedWorker: typeof SharedWorker !== 'undefined',
  };
}

/**
 * WebRTC capabilities information
 */
export interface WebRTCCapabilities {
  /** Whether WebRTC is supported */
  supportsWebRTC: boolean;
  /** Whether WebSocket is supported */
  supportsWebSocket: boolean;
  /** Whether data channels are supported */
  supportsDataChannels: boolean;
  /** Whether BroadcastChannel is supported */
  supportsBroadcastChannel: boolean;
  /** Whether SharedWorker is supported */
  supportsSharedWorker: boolean;
}

/**
 * Create a fully configured P2P connection system
 *
 * @param config - Configuration options
 * @returns Object with signaling client and connection manager
 *
 * @example
 * ```typescript
 * const { signaling, manager } = createP2PSystem({
 *   signalingUrl: 'wss://signal.example.com',
 *   peerId: 'my-peer-id',
 *   autoReconnect: true,
 * });
 *
 * await signaling.connect();
 * await signaling.joinRoom('my-room');
 * ```
 */
export function createP2PSystem(config: P2PSystemConfig): P2PSystem {
  const signaling = new SignalingClientClass({
    serverUrl: config.signalingUrl,
    peerId: config.peerId,
    autoReconnect: config.autoReconnect ?? true,
    reconnectDelay: config.reconnectDelay,
    maxReconnectAttempts: config.maxReconnectAttempts,
    heartbeatInterval: config.heartbeatInterval,
    authToken: config.authToken,
  });

  const manager = new PeerConnectionManagerClass({
    localPeerId: config.peerId,
    iceConfig: config.iceConfig,
    poolConfig: config.poolConfig,
    defaultDataChannels: config.dataChannels,
    autoReconnect: config.autoReconnect ?? true,
    reconnectConfig: config.reconnectConfig,
  });

  manager.setSignaling(signaling);

  return { signaling, manager };
}

/**
 * Configuration for creating a P2P system
 */
export interface P2PSystemConfig {
  /** WebSocket signaling server URL */
  signalingUrl: string;
  /** Local peer identifier */
  peerId: string;
  /** Enable automatic reconnection (default: true) */
  autoReconnect?: boolean;
  /** Reconnection delay in ms */
  reconnectDelay?: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Heartbeat interval in ms */
  heartbeatInterval?: number;
  /** Authentication token */
  authToken?: string;
  /** ICE configuration */
  iceConfig?: import('./types').ICEManagerConfig;
  /** Connection pool configuration */
  poolConfig?: Partial<import('./types').ConnectionPoolConfig>;
  /** Default data channels */
  dataChannels?: import('./types').DataChannelConfig[];
  /** Reconnection configuration */
  reconnectConfig?: import('./types').ReconnectionConfig;
}

/**
 * P2P system components
 */
export interface P2PSystem {
  /** Signaling client for connection establishment */
  signaling: SignalingClientClass;
  /** Peer connection manager */
  manager: PeerConnectionManagerClass;
}

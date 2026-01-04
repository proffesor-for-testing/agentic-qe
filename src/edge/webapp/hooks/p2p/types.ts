/**
 * P2P Hook Types
 *
 * Type definitions for P2P React hooks.
 *
 * @module edge/webapp/hooks/p2p/types
 * @version 1.0.0
 */

import type {
  PeerId,
  PeerState,
  ConnectionState,
  ConnectionQuality,
  PatternSyncStatus,
  P2PEventType,
  P2PEventHandler,
  P2PConfig,
  AgentIdentity,
} from '../../context/P2PContext';

// ============================================
// useP2PService Types
// ============================================

export interface UseP2PServiceOptions {
  /** Auto-initialize on mount (default: true) */
  autoInit?: boolean;
  /** Service configuration */
  config?: Partial<P2PConfig>;
  /** Error callback */
  onError?: (error: Error) => void;
}

export interface UseP2PServiceReturn {
  /** Whether the service is initialized */
  isInitialized: boolean;
  /** Whether the service is initializing */
  isInitializing: boolean;
  /** Initialization error if any */
  error: Error | null;
  /** Local agent identity */
  identity: AgentIdentity | null;
  /** Initialize the P2P service */
  initialize: () => Promise<void>;
  /** Shutdown the P2P service */
  shutdown: () => Promise<void>;
}

// ============================================
// usePeers Types
// ============================================

export interface PeerFilter {
  /** Filter by connection states */
  connectionState?: ConnectionState[];
  /** Minimum quality score (0-1) */
  minQuality?: number;
  /** Maximum latency in ms */
  maxLatencyMs?: number;
  /** Include only peers with patterns */
  hasPatterns?: boolean;
}

export interface UsePeersOptions {
  /** Auto-subscribe to events on mount (default: true) */
  autoSubscribe?: boolean;
  /** Filter peers by criteria */
  filter?: PeerFilter;
  /** Sort peers by field */
  sortBy?: 'id' | 'lastSeen' | 'latency' | 'patternsShared';
  /** Sort direction */
  sortDirection?: 'asc' | 'desc';
}

export interface UsePeersReturn {
  /** All peers (after filtering) */
  peers: PeerState[];
  /** Total peer count */
  peerCount: number;
  /** Only connected peers */
  connectedPeers: PeerState[];
  /** Count of connected peers */
  connectedCount: number;
  /** Get a specific peer by ID */
  getPeer: (peerId: PeerId) => PeerState | undefined;
  /** Connect to a peer */
  connect: (peerId: PeerId) => Promise<void>;
  /** Disconnect from a peer */
  disconnect: (peerId: PeerId) => Promise<void>;
  /** Force refresh peer list */
  refreshPeers: () => void;
  /** Subscribe to peer discovered events */
  onPeerDiscovered: (handler: (peer: PeerState) => void) => () => void;
  /** Subscribe to peer connected events */
  onPeerConnected: (handler: (peer: PeerState) => void) => () => void;
  /** Subscribe to peer disconnected events */
  onPeerDisconnected: (handler: (peerId: PeerId) => void) => () => void;
}

// ============================================
// useConnection Types
// ============================================

export interface UseConnectionOptions {
  /** Track a specific peer (optional) */
  peerId?: PeerId;
}

export interface ConnectionEvent {
  /** Event timestamp */
  timestamp: number;
  /** Previous state */
  fromState: ConnectionState;
  /** New state */
  toState: ConnectionState;
  /** Reason for state change */
  reason?: string;
}

export interface UseConnectionReturn {
  /** Current connection state */
  state: ConnectionState;
  /** Whether connected */
  isConnected: boolean;
  /** Whether connecting */
  isConnecting: boolean;
  /** Whether disconnected */
  isDisconnected: boolean;
  /** Whether in error state */
  isError: boolean;
  /** Specific peer state (if peerId provided) */
  peerState: PeerState | null;
  /** Connection quality */
  quality: ConnectionQuality | null;
  /** Current latency in ms */
  latencyMs: number;
  /** Packet loss percentage */
  packetLossPercent: number;
  /** Attempt reconnection */
  reconnect: () => Promise<void>;
  /** Disconnect */
  disconnect: () => Promise<void>;
  /** Connection history */
  connectionHistory: ConnectionEvent[];
}

// ============================================
// usePatternSync Types
// ============================================

export interface UsePatternSyncOptions {
  /** Auto-sync on peer connect (default: true) */
  autoSync?: boolean;
  /** Sync interval in ms (default: 30000) */
  syncInterval?: number;
  /** Maximum pending patterns before auto-sync */
  maxPendingPatterns?: number;
}

export interface SyncResult {
  /** Peer ID synced with */
  peerId: PeerId;
  /** Patterns received */
  patternsReceived: number;
  /** Patterns sent */
  patternsSent: number;
  /** Conflicts encountered */
  conflicts: PatternConflict[];
  /** Duration in ms */
  durationMs: number;
  /** Error if sync failed */
  error?: Error;
}

export interface PatternConflict {
  /** Pattern ID */
  patternId: string;
  /** Local version */
  localVersion: string;
  /** Remote version */
  remoteVersion: string;
  /** Conflict type */
  conflictType: 'concurrent_update' | 'version_mismatch' | 'content_divergence';
  /** Whether conflict was resolved */
  resolved: boolean;
  /** Resolution strategy used */
  resolutionStrategy?: string;
}

export interface SharedPattern {
  /** Pattern ID */
  id: string;
  /** Pattern category */
  category: string;
  /** Pattern type */
  type: string;
  /** Pattern domain */
  domain: string;
  /** Content hash */
  contentHash: string;
  /** Tags */
  tags: string[];
  /** Created timestamp */
  createdAt: string;
}

export interface UsePatternSyncReturn {
  /** Current sync status */
  status: PatternSyncStatus;
  /** Whether currently syncing */
  isSyncing: boolean;
  /** Last sync timestamp */
  lastSyncAt: number | null;
  /** Number of pending patterns */
  pendingCount: number;
  /** Number of synced patterns */
  syncedCount: number;
  /** Number of local patterns */
  localCount: number;
  /** Sync with a specific peer */
  sync: (peerId?: PeerId) => Promise<SyncResult>;
  /** Sync with all connected peers */
  syncAll: () => Promise<SyncResult[]>;
  /** Cancel ongoing sync */
  cancelSync: () => void;
  /** Subscribe to pattern received events */
  onPatternReceived: (handler: (pattern: SharedPattern) => void) => () => void;
  /** Subscribe to sync complete events */
  onSyncComplete: (handler: (result: SyncResult) => void) => () => void;
  /** Subscribe to sync error events */
  onSyncError: (handler: (error: Error) => void) => () => void;
  /** Subscribe to conflict events */
  onConflict: (handler: (conflict: PatternConflict) => void) => () => void;
}

// ============================================
// Re-exports
// ============================================

export type {
  PeerId,
  PeerState,
  ConnectionState,
  ConnectionQuality,
  PatternSyncStatus,
  P2PEventType,
  P2PEventHandler,
  P2PConfig,
  AgentIdentity,
};

/**
 * P2P Hooks Module
 *
 * React hooks for integrating with P2P services in the web dashboard.
 * Browser-compatible implementation using WebRTC and Web Crypto APIs.
 *
 * @module edge/webapp/hooks/p2p
 * @version 1.0.0
 *
 * @example
 * ```tsx
 * import {
 *   useP2PService,
 *   usePeers,
 *   useConnection,
 *   usePatternSync,
 * } from './hooks/p2p';
 *
 * function Dashboard() {
 *   const { isInitialized, error } = useP2PService();
 *   const { peers, connect, disconnect } = usePeers();
 *   const { state, isConnected } = useConnection();
 *   const { sync, pendingCount } = usePatternSync();
 *
 *   // ... render dashboard
 * }
 * ```
 */

// ============================================
// Hooks
// ============================================

export { useP2PService } from './useP2PService';
export { usePeers } from './usePeers';
export { useConnection } from './useConnection';
export { usePatternSync } from './usePatternSync';

// ============================================
// Types
// ============================================

export type {
  // useP2PService types
  UseP2PServiceOptions,
  UseP2PServiceReturn,

  // usePeers types
  PeerFilter,
  UsePeersOptions,
  UsePeersReturn,

  // useConnection types
  UseConnectionOptions,
  ConnectionEvent,
  UseConnectionReturn,

  // usePatternSync types
  UsePatternSyncOptions,
  SyncResult,
  PatternConflict,
  SharedPattern,
  UsePatternSyncReturn,

  // Shared types
  PeerId,
  PeerState,
  ConnectionState,
  ConnectionQuality,
  PatternSyncStatus,
  P2PEventType,
  P2PEventHandler,
  P2PConfig,
  AgentIdentity,
} from './types';

// ============================================
// Re-export Context
// ============================================

export {
  P2PProvider,
  useP2PContext,
  P2PContext,
  P2PEventType as P2PEvent,
} from '../../context/P2PContext';

export type {
  P2PProviderProps,
  P2PContextValue,
  P2PContextState,
  P2PContextActions,
  P2PConfig as P2PContextConfig,
  AgentInfo,
  P2PMetrics,
} from '../../context/P2PContext';

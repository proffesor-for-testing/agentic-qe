/**
 * Hook Exports
 *
 * React hooks for integrating the P2P services with the web dashboard.
 *
 * @module edge/webapp/hooks
 */

// ============================================
// P2P Service Hook
// ============================================

export {
  useP2PService,
  type UseP2PServiceOptions,
  type UseP2PServiceReturn,
  type ServiceStatus,
} from './useP2PService';

// ============================================
// Peer Management Hook
// ============================================

export {
  usePeers,
  type UsePeersOptions,
  type UsePeersReturn,
  type PeerWithStatus,
  type PeerEvent,
  type PeerEventType,
} from './usePeers';

// ============================================
// Connection State Hook
// ============================================

export {
  useConnection,
  type UseConnectionOptions,
  type UseConnectionReturn,
  type ConnectionInfo,
  type ConnectionEvent,
  type ConnectionQuality,
} from './useConnection';

// ============================================
// Pattern Sync Hook
// ============================================

export {
  usePatternSync,
  type UsePatternSyncOptions,
  type UsePatternSyncReturn,
  type PatternSyncState,
  type PatternSyncEvent,
  type PatternSyncEventType,
  type SyncStatus,
} from './usePatternSync';

// ============================================
// Legacy Hooks (from useP2P.ts)
// ============================================

export {
  useP2P,
  useP2PEvents,
  useConnectionStatus,
  usePeers as usePeersLegacy,
  usePatterns,
  useCRDT,
  useMetrics,
  type UseP2POptions,
  type UseP2PReturn,
} from './useP2P';

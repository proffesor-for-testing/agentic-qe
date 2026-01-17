/**
 * Context Module
 *
 * React context providers for the web dashboard.
 *
 * @module edge/webapp/context
 * @version 1.0.0
 */

// ============================================
// P2P Context
// ============================================

export {
  P2PProvider,
  P2PContext,
  useP2PContext,
  P2PEventType,
} from './P2PContext';

export type {
  // Provider types
  P2PProviderProps,

  // Context types
  P2PContextValue,
  P2PContextState,
  P2PContextActions,
  P2PConfig,

  // Identity types
  AgentIdentity,
  AgentInfo,

  // Connection types
  PeerId,
  PeerState,
  ConnectionState,
  ConnectionQuality,

  // Pattern types
  PatternSyncStatus,

  // Metrics types
  P2PMetrics,

  // Event types
  P2PEvent,
  P2PEventHandler,
} from './P2PContext';

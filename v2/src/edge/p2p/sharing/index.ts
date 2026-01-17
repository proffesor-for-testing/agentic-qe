/**
 * Pattern Sharing Protocol Module
 *
 * Enables secure pattern sharing between QE agents for collaborative learning.
 * Includes serialization, indexing, synchronization, and broadcasting.
 *
 * @module edge/p2p/sharing
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   // Types
 *   SharedPattern,
 *   PatternSharingConfig,
 *   SharingPolicy,
 *   PatternCategory,
 *
 *   // Core classes
 *   PatternSerializer,
 *   PatternIndex,
 *   PatternSyncManager,
 *   PatternBroadcaster,
 *
 *   // Factory functions
 *   createPatternIndex,
 *   createPatternSyncManager,
 *   createPatternBroadcaster,
 * } from '@ruvector/edge/p2p/sharing';
 *
 * // Create pattern index
 * const index = createPatternIndex({ maxPatterns: 1000 });
 *
 * // Create sync manager
 * const syncManager = createPatternSyncManager({
 *   localAgentId: 'my-agent',
 *   index,
 *   channel: agentChannel,
 * });
 *
 * // Create broadcaster
 * const broadcaster = createPatternBroadcaster({
 *   localAgentId: 'my-agent',
 *   index,
 *   channel: agentChannel,
 * });
 *
 * // Share a pattern
 * const serializer = new PatternSerializer();
 * const pattern = serializer.createPattern(
 *   'pattern-1',
 *   PatternCategory.TEST,
 *   'unit-test',
 *   'api',
 *   'describe("test", () => { ... })',
 *   embeddingVector,
 * );
 *
 * index.add(pattern);
 * await broadcaster.announceNewPattern(pattern);
 * ```
 */

// ============================================
// Types
// ============================================

export type {
  // Core pattern types
  SharedPattern,
  PatternContent,
  PatternPlaceholder,
  PatternSharingMetadata,
  PatternVersion,
  VectorClock,
  PatternQualityMetrics,
  PatternSharingConfig,

  // Query and search
  PatternQuery,
  PatternMatch,
  PatternHighlight,
  PatternSearchResults,

  // Synchronization
  PatternSyncState,
  PatternSyncRequest,
  PatternSyncResponse,
  PatternConflict,
  ConflictResolution,

  // Broadcasting
  PatternBroadcast,
  BroadcastPayload,
  NewPatternPayload,
  PatternUpdatePayload,
  PatternDeletePayload,
  PatternRequestPayload,
  PeerDiscoveryPayload,
  PatternSummary,
  PeerCapabilities,

  // Anonymization
  AnonymizationConfig,
  AnonymizationResult,
  AnonymizationStats,

  // Differential privacy
  DifferentialPrivacyConfig,
  DPResult,

  // Index
  PatternIndexStats,
  PatternIndexConfig,

  // Configuration
  BandwidthConfig,
  SharingRateLimitConfig,

  // Events
  SharingEvent,
  SharingEventHandler,

  // Signatures
  PatternSignature,
} from './types';

// ============================================
// Enums
// ============================================

export {
  // Pattern classification
  PatternCategory,
  PatternQuality,
  SharingPolicy,
  PrivacyLevel,

  // Synchronization
  SyncStatus,

  // Broadcasting
  BroadcastType,

  // Events
  SharingEventType,

  // Errors
  SharingErrorCode,
  SharingError,
} from './types';

// ============================================
// Constants
// ============================================

export {
  // Protocol
  SHARING_PROTOCOL_VERSION,
  DEFAULT_EMBEDDING_DIMENSION,
  MAX_PATTERN_SIZE,
  MAX_BATCH_SIZE,
  DEFAULT_DP_EPSILON,
  DEFAULT_DP_DELTA,
  DEFAULT_PATTERN_TTL,
  DEFAULT_CACHE_SIZE,

  // Default configurations
  DEFAULT_SHARING_CONFIG,
  DEFAULT_ANONYMIZATION_CONFIG,
  DEFAULT_BANDWIDTH_CONFIG,
  DEFAULT_RATE_LIMIT_CONFIG,
} from './types';

// ============================================
// Serializer
// ============================================

export {
  PatternSerializer,
  createPatternSerializer,
  serializePattern,
  deserializePattern,
  anonymizePattern,
} from './PatternSerializer';

// ============================================
// Index
// ============================================

export { PatternIndex, createPatternIndex } from './PatternIndex';

// ============================================
// Sync Manager
// ============================================

export {
  PatternSyncManager,
  createPatternSyncManager,
  type PatternSyncManagerConfig,
} from './PatternSyncManager';

// ============================================
// Broadcaster
// ============================================

export {
  PatternBroadcaster,
  createPatternBroadcaster,
  type PatternBroadcasterConfig,
  type BroadcastSubscription,
  type BroadcastHandler,
} from './PatternBroadcaster';

// ============================================
// Module Version
// ============================================

/**
 * Pattern sharing module version
 */
export const SHARING_VERSION = '1.0.0';

/**
 * Pattern sharing module capabilities
 */
export const SHARING_CAPABILITIES = {
  binarySerialization: true,
  anonymization: true,
  differentialPrivacy: true,
  vectorSearch: true,
  lruEviction: true,
  deduplication: true,
  vectorClockSync: true,
  conflictResolution: true,
  gossipProtocol: true,
  rateLimiting: true,
  subscriptionFiltering: true,
};

/**
 * Two-Machine Coordination Module
 *
 * P2-007: Two-Machine Coordination Proof
 *
 * Provides high-level coordination between two or more browser agents
 * in a P2P network. Handles connection establishment, authentication,
 * pattern synchronization, and connection health monitoring.
 *
 * @module edge/p2p/coordination
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   CoordinationManager,
 *   createCoordinationManager,
 *   CoordinationState,
 *   CoordinationEventType,
 * } from '@ruvector/edge/p2p/coordination';
 *
 * // Create coordination manager
 * const manager = createCoordinationManager({
 *   localIdentity: {
 *     agentId: 'agent-123',
 *     publicKey: 'base64-public-key',
 *     createdAt: new Date().toISOString(),
 *   },
 *   localKeyPair: {
 *     publicKey: 'base64-public-key',
 *     privateKey: 'base64-private-key',
 *   },
 *   autoReconnect: true,
 * });
 *
 * // Set up message transport (via WebRTC data channel)
 * manager.setMessageSender(async (peerId, message) => {
 *   await dataChannel.send(peerId, JSON.stringify(message));
 * });
 *
 * // Listen for events
 * manager.on(CoordinationEventType.PEER_AUTHENTICATED, (event) => {
 *   console.log('Peer authenticated:', event.peerId);
 * });
 *
 * manager.on(CoordinationEventType.SYNC_COMPLETED, (event) => {
 *   console.log('Sync completed with', event.peerId);
 * });
 *
 * // Connect and sync with a peer
 * await manager.connect('peer-456');
 * const status = await manager.syncPatterns('peer-456', localPatterns);
 * console.log('Synced patterns:', status.syncedPatterns);
 *
 * // Monitor health
 * const health = manager.getHealthStatus('peer-456');
 * console.log('Connection health:', health.level, 'Score:', health.score);
 *
 * // Clean up
 * await manager.destroy();
 * ```
 */

// ============================================
// Types
// ============================================

export type {
  // Configuration
  CoordinationConfig,
  SyncConfig,

  // State types
  SyncStatus,
  CoordinationMetrics,
  HealthStatus,
  HealthIssue,
  PeerInfo,
  PeerCapabilities,

  // Event types
  CoordinationEvent,
  CoordinationEventHandler,

  // Message types
  CoordinationMessage,
  AuthChallengePayload,
  AuthResponsePayload,
  AuthResultPayload,
  PingPayload,
  PongPayload,
} from './types';

export {
  // Enums
  CoordinationState,
  CoordinationRole,
  HealthLevel,
  CoordinationEventType,
  CoordinationMessageType,
  CoordinationErrorCode,

  // Error class
  CoordinationError,

  // Constants
  COORDINATION_VERSION,
  DEFAULT_PING_INTERVAL,
  DEFAULT_HEALTH_CHECK_INTERVAL,
  DEFAULT_RECONNECT_TIMEOUT,
  MAX_RECONNECT_ATTEMPTS,
  DEFAULT_SYNC_BATCH_SIZE,
  HEALTH_RTT_WARNING_THRESHOLD,
  HEALTH_RTT_CRITICAL_THRESHOLD,
  HEALTH_PACKET_LOSS_WARNING,
  HEALTH_PACKET_LOSS_CRITICAL,
  DEFAULT_COORDINATION_CONFIG,

  // Utility functions
  createDefaultCapabilities,
  createDefaultSyncStatus,
  createDefaultMetrics,
  createDefaultHealthStatus,
  generateMessageId,
  generateChallenge,
} from './types';

// ============================================
// Classes
// ============================================

export { CoordinationManager, createCoordinationManager } from './CoordinationManager';
export { HealthMonitor, createHealthMonitor } from './HealthMonitor';
export { SyncOrchestrator, createSyncOrchestrator } from './SyncOrchestrator';

// ============================================
// Health Monitor Types
// ============================================

export type { HealthMonitorConfig } from './HealthMonitor';

// ============================================
// Sync Orchestrator Types
// ============================================

export type { SyncOrchestratorConfig } from './SyncOrchestrator';

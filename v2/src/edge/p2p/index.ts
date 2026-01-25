/**
 * P2P Module for @ruvector/edge
 *
 * Provides peer-to-peer communication infrastructure for browser agents.
 * Built on Ed25519 cryptographic identities for secure agent communication.
 *
 * Modules:
 * - crypto: Ed25519 cryptographic identity system (P2-001)
 * - webrtc: WebRTC peer connection management (P2-002)
 * - protocol: Agent-to-agent communication protocol (P2-003)
 * - sharing: Pattern sharing protocol (P2-004)
 * - federated: Federated learning infrastructure (P2-005)
 * - crdt: CRDT-based conflict resolution (P2-006)
 * - coordination: Two-machine coordination (P2-007)
 * - nat: NAT traversal and TURN fallback (P2-008)
 *
 * @module edge/p2p
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   // Crypto (P2-001)
 *   IdentityManager,
 *   KeyManager,
 *   Signer,
 *
 *   // WebRTC (P2-002)
 *   PeerConnectionManager,
 *   SignalingClient,
 *
 *   // Protocol (P2-003)
 *   AgentChannel,
 *   ProtocolHandler,
 *   MessageEncoder,
 *
 *   // NAT Traversal (P2-008)
 *   NATDetector,
 *   TURNManager,
 *   HolePuncher,
 *   ConnectivityTester,
 * } from '@ruvector/edge/p2p';
 *
 * // Create identity
 * const identity = await IdentityManager.create({
 *   displayName: 'My Agent',
 *   password: 'secure-password'
 * });
 *
 * // Detect NAT type
 * const detector = new NATDetector();
 * const natResult = await detector.detect();
 *
 * // Setup WebRTC with NAT-aware configuration
 * const manager = new PeerConnectionManager({
 *   localPeerId: identity.agentId,
 * });
 *
 * // Create communication channel
 * const channel = new AgentChannel({
 *   localIdentity: identity,
 *   localKeyPair: keyPair,
 *   remoteAgentId: 'remote-agent',
 *   connectionManager: manager,
 * });
 *
 * await channel.open();
 * ```
 */

// Cryptographic Identity System (P2-001)
export * from './crypto';

// WebRTC Peer Connections (P2-002)
export * from './webrtc';

// Agent-to-Agent Communication Protocol (P2-003)
export * from './protocol';

// Pattern Sharing Protocol (P2-004)
export * from './sharing';

// Federated Learning Infrastructure (P2-005)
export * from './federated';

// CRDT-Based Conflict Resolution (P2-006)
// Note: Some types conflict with sharing module, re-export with namespace prefix
export {
  // Classes
  GCounter,
  LWWRegister,
  ORSet,
  PatternCRDT,
  VectorClock,
  CRDTStore,
  // Types that don't conflict
  CRDTType,
  CRDTState,
  CRDTMetadata,
  CRDTDelta,
  MergeResult,
  MergeStats,
  ConflictInfo,
  ConflictType,
  ResolutionStrategy,
  DeltaOperation,
  DeltaOpType,
  Tombstone,
  GCResult,
  GCounterState,
  SerializedGCounterState,
  PNCounterState,
  SerializedPNCounterState,
  LWWRegisterState,
  SerializedLWWRegisterState,
  ORSetElement,
  ORSetState,
  SerializedORSetState,
  MVRegisterValue,
  MVRegisterState,
  PatternCRDTFields,
  PatternSharingConfigData,
  SerializedPatternCRDTState,
  CRDTStoreConfig,
  DEFAULT_STORE_CONFIG,
  CRDTStoreStats,
  CRDTEventType,
  CRDTEvent,
  CRDTEventHandler,
  CRDTErrorCode,
  CRDT,
  CRDTFactory,
  CRDTSerializer,
  // VectorClock types
  VectorClockState,
  SerializedVectorClock,
  VectorClockComparison,
  // PatternCRDT types
  PatternInput,
  PatternData,
  ModificationEntry,
  // Constants
  CRDT_VERSION,
  CRDT_CAPABILITIES,
  CRDT_PROTOCOL_VERSION,
  MAX_VECTOR_CLOCK_SIZE,
  DEFAULT_TOMBSTONE_TTL,
  MAX_MERGE_DEPTH,
  // Aliases
  type ReplicaId,
  type LogicalTimestamp,
  type WallTimestamp,
} from './crdt';

// Re-export CRDT-specific conflicting types with namespace prefix
export type {
  ConflictResolution as CRDTConflictResolution,
  PatternQualityMetrics as CRDTPatternQualityMetrics,
} from './crdt';

// Two-Machine Coordination (P2-007)
// Note: Some types conflict with sharing and protocol modules
export {
  // Classes/Functions
  CoordinationManager,
  SyncOrchestrator,
  HealthMonitor,
  // Types that don't conflict
  CoordinationState,
  CoordinationRole,
  CoordinationMetrics,
  HealthLevel,
  HealthStatus,
  HealthIssue,
  PeerInfo,
  CoordinationConfig,
  SyncConfig,
  DEFAULT_COORDINATION_CONFIG,
  CoordinationEventType,
  CoordinationEvent,
  CoordinationEventHandler,
  CoordinationMessageType,
  CoordinationMessage,
  AuthChallengePayload,
  AuthResponsePayload,
  AuthResultPayload,
  PingPayload,
  PongPayload,
  CoordinationErrorCode,
  createDefaultCapabilities,
  createDefaultSyncStatus,
  createDefaultMetrics,
  createDefaultHealthStatus,
  generateChallenge,
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
} from './coordination';

// Re-export coordination-specific conflicting types with namespace prefix
export type {
  SyncStatus as CoordinationSyncStatus,
  PeerCapabilities as CoordinationPeerCapabilities,
} from './coordination';

// Re-export generateMessageId from coordination with prefix (conflicts with protocol)
export { generateMessageId as generateCoordinationMessageId } from './coordination';

// NAT Traversal and TURN Fallback (P2-008)
export * from './nat';

/**
 * P2P Module version
 */
export const P2P_VERSION = '1.0.0';

/**
 * P2P Module phase
 */
export const P2P_PHASE = 'P2-Foundation';

/**
 * P2P module capabilities
 */
export const P2P_CAPABILITIES = {
  // P2-001: Cryptographic Identity
  ed25519KeyGeneration: true,
  identityManagement: true,
  messageSigning: true,
  signatureVerification: true,
  keyRotation: true,
  seedPhraseRecovery: true,

  // P2-002: WebRTC
  peerConnections: true,
  dataChannels: true,
  iceNegotiation: true,
  signalingProtocol: true,
  connectionPooling: true,
  autoReconnect: true,

  // P2-003: Protocol
  binaryMessageEncoding: true,
  messageCompression: true,
  requestResponse: true,
  pubSub: true,
  messageRouting: true,
  reliableDelivery: true,
  rateLimiting: true,
  protocolVersionNegotiation: true,
  heartbeat: true,
  deadLetterQueue: true,

  // P2-004: Pattern Sharing
  patternSharing: true,
  patternSerialization: true,
  patternAnonymization: true,
  differentialPrivacy: true,
  vectorSimilaritySearch: true,
  patternDeduplication: true,
  vectorClockSync: true,
  conflictResolution: true,
  gossipProtocol: true,
  subscriptionFiltering: true,

  // P2-005: Federated Learning
  federatedLearning: true,
  fedAvgAggregation: true,
  fedProxAggregation: true,
  secureAggregation: true,
  gradientClipping: true,
  differentialPrivacyFL: true,
  byzantineResilience: true,
  modelCheckpointing: true,
  convergenceMonitoring: true,

  // P2-006: CRDT Conflict Resolution
  crdtGCounter: true,
  crdtLWWRegister: true,
  crdtORSet: true,
  crdtPatternCRDT: true,
  crdtVectorClocks: true,
  crdtDeltaSync: true,
  crdtTombstoneGC: true,
  crdtConflictTracking: true,

  // P2-007: Two-Machine Coordination
  peerCoordination: true,
  authenticationHandshake: true,
  healthMonitoring: true,
  syncOrchestration: true,
  incrementalSync: true,
  reconnectionManagement: true,

  // P2-008: NAT Traversal
  natTypeDetection: true,
  turnManagement: true,
  turnCredentialRefresh: true,
  holePunching: true,
  portPrediction: true,
  connectivityTesting: true,
  fallbackEscalation: true,
};

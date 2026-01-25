/**
 * NAT Traversal Module for @ruvector/edge P2P
 *
 * Provides NAT traversal capabilities including NAT type detection,
 * TURN relay management, UDP hole punching, and connectivity testing.
 *
 * @module edge/p2p/nat
 * @version 1.0.0
 *
 * @example
 * ```typescript
 * import {
 *   NATDetector,
 *   TURNManager,
 *   HolePuncher,
 *   ConnectivityTester,
 *   NATClassification,
 *   ConnectionPath,
 * } from '@ruvector/edge/p2p/nat';
 *
 * // Detect NAT type
 * const detector = new NATDetector();
 * const result = await detector.detect();
 * console.log('NAT Type:', result.natType);
 *
 * // Manage TURN servers
 * const turnManager = new TURNManager({
 *   servers: [{ urls: 'turn:turn.example.com', ... }],
 * });
 * const selection = await turnManager.selectOptimalServer();
 *
 * // Test connectivity
 * const tester = new ConnectivityTester();
 * const testResult = await tester.test(peerId, { dataChannel, candidates });
 * ```
 */

// Type exports
export {
  // NAT Classifications
  NATClassification,
  NAT_CONNECTIVITY_MATRIX,

  // Connection Path
  ConnectionPath,
  ConnectionPathResult,

  // TURN Configuration
  TURNConfig,
  TURNCredentialConfig,
  TURNAllocation,
  TURNServerSelection,

  // Relay Candidates
  RelayCandidate,
  RelayCandidatePair,

  // NAT Detection
  NATDetectionResult,
  NATDetectionConfig,
  STUNBindingResponse,

  // Hole Punching
  HolePunchResult,
  HolePunchConfig,
  PortPrediction,

  // Connectivity Testing
  ConnectivityTestResult,
  ConnectivityTestConfig,
  CandidateRanking,
  ConnectivityRecommendation,

  // Escalation
  EscalationLevel,
  EscalationState,
  EscalationConfig,

  // Events
  NATEventType,
  NATEvent,
  NATEventHandler,

  // Manager Configs
  NATDetectorConfig,
  TURNManagerConfig,
  HolePuncherConfig,
  ConnectivityTesterConfig,

  // Default Configurations
  DEFAULT_STUN_SERVERS,
  DEFAULT_NAT_DETECTOR_CONFIG,
  DEFAULT_TURN_MANAGER_CONFIG,
  DEFAULT_HOLE_PUNCHER_CONFIG,
  DEFAULT_CONNECTIVITY_TESTER_CONFIG,
  DEFAULT_ESCALATION_CONFIG,
} from './types';

// Class exports
export { NATDetector } from './NATDetector';
export { TURNManager } from './TURNManager';
export { HolePuncher } from './HolePuncher';
export { ConnectivityTester } from './ConnectivityTester';

/**
 * NAT module version
 */
export const NAT_MODULE_VERSION = '1.0.0';

/**
 * NAT module capabilities
 */
export const NAT_CAPABILITIES = {
  // Detection
  natTypeDetection: true,
  stunMultiServer: true,
  parallelTesting: true,
  resultCaching: true,

  // TURN Management
  turnCredentialManagement: true,
  turnCredentialRefresh: true,
  turnServerSelection: true,
  turnHealthMonitoring: true,
  multiProviderSupport: true,

  // Hole Punching
  udpHolePunching: true,
  simultaneousOpen: true,
  portPrediction: true,
  symmetricNatPiercing: true,
  coordinatedPunching: true,

  // Connectivity Testing
  rttMeasurement: true,
  packetLossDetection: true,
  jitterMeasurement: true,
  bandwidthEstimation: true,
  candidateRanking: true,
  connectivityRecommendation: true,

  // Fallback
  escalationLevels: true,
  autoEscalation: true,
  turnFallback: true,
};

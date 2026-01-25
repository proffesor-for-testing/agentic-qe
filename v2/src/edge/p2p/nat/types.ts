/**
 * NAT Traversal Types for @ruvector/edge P2P
 *
 * Type definitions for NAT detection, TURN management, hole punching,
 * and connectivity testing in browser environments.
 *
 * @module edge/p2p/nat/types
 * @version 1.0.0
 */

import { ICEServer, ICECandidate, PeerId } from '../webrtc/types';

// ============================================
// NAT Type Classifications
// ============================================

/**
 * NAT type classification based on RFC 3489/5389
 *
 * NAT behavior affects peer-to-peer connectivity:
 * - Open/FullCone: Best connectivity, direct connections usually work
 * - RestrictedCone: Good connectivity with coordination
 * - PortRestricted: Limited connectivity, may need TURN
 * - Symmetric: Most restrictive, usually requires TURN relay
 */
export enum NATClassification {
  /** No NAT detected - public IP address */
  Open = 'open',
  /** Full Cone NAT - most permissive NAT type */
  FullCone = 'full_cone',
  /** Address Restricted Cone NAT */
  RestrictedCone = 'restricted_cone',
  /** Port Restricted Cone NAT */
  PortRestricted = 'port_restricted',
  /** Symmetric NAT - most restrictive */
  Symmetric = 'symmetric',
  /** NAT type could not be determined */
  Unknown = 'unknown',
  /** Detection in progress */
  Detecting = 'detecting',
  /** Detection failed */
  Failed = 'failed',
}

/**
 * Mapping table for NAT connectivity probability
 * Values represent probability (0-1) of successful direct connection
 */
export const NAT_CONNECTIVITY_MATRIX: Record<
  NATClassification,
  Record<NATClassification, number>
> = {
  [NATClassification.Open]: {
    [NATClassification.Open]: 1.0,
    [NATClassification.FullCone]: 1.0,
    [NATClassification.RestrictedCone]: 1.0,
    [NATClassification.PortRestricted]: 1.0,
    [NATClassification.Symmetric]: 0.8,
    [NATClassification.Unknown]: 0.5,
    [NATClassification.Detecting]: 0.5,
    [NATClassification.Failed]: 0.3,
  },
  [NATClassification.FullCone]: {
    [NATClassification.Open]: 1.0,
    [NATClassification.FullCone]: 1.0,
    [NATClassification.RestrictedCone]: 0.95,
    [NATClassification.PortRestricted]: 0.9,
    [NATClassification.Symmetric]: 0.7,
    [NATClassification.Unknown]: 0.5,
    [NATClassification.Detecting]: 0.5,
    [NATClassification.Failed]: 0.3,
  },
  [NATClassification.RestrictedCone]: {
    [NATClassification.Open]: 1.0,
    [NATClassification.FullCone]: 0.95,
    [NATClassification.RestrictedCone]: 0.85,
    [NATClassification.PortRestricted]: 0.7,
    [NATClassification.Symmetric]: 0.5,
    [NATClassification.Unknown]: 0.4,
    [NATClassification.Detecting]: 0.4,
    [NATClassification.Failed]: 0.2,
  },
  [NATClassification.PortRestricted]: {
    [NATClassification.Open]: 1.0,
    [NATClassification.FullCone]: 0.9,
    [NATClassification.RestrictedCone]: 0.7,
    [NATClassification.PortRestricted]: 0.5,
    [NATClassification.Symmetric]: 0.3,
    [NATClassification.Unknown]: 0.3,
    [NATClassification.Detecting]: 0.3,
    [NATClassification.Failed]: 0.1,
  },
  [NATClassification.Symmetric]: {
    [NATClassification.Open]: 0.8,
    [NATClassification.FullCone]: 0.7,
    [NATClassification.RestrictedCone]: 0.5,
    [NATClassification.PortRestricted]: 0.3,
    [NATClassification.Symmetric]: 0.1,
    [NATClassification.Unknown]: 0.2,
    [NATClassification.Detecting]: 0.2,
    [NATClassification.Failed]: 0.05,
  },
  [NATClassification.Unknown]: {
    [NATClassification.Open]: 0.5,
    [NATClassification.FullCone]: 0.5,
    [NATClassification.RestrictedCone]: 0.4,
    [NATClassification.PortRestricted]: 0.3,
    [NATClassification.Symmetric]: 0.2,
    [NATClassification.Unknown]: 0.3,
    [NATClassification.Detecting]: 0.3,
    [NATClassification.Failed]: 0.1,
  },
  [NATClassification.Detecting]: {
    [NATClassification.Open]: 0.5,
    [NATClassification.FullCone]: 0.5,
    [NATClassification.RestrictedCone]: 0.4,
    [NATClassification.PortRestricted]: 0.3,
    [NATClassification.Symmetric]: 0.2,
    [NATClassification.Unknown]: 0.3,
    [NATClassification.Detecting]: 0.3,
    [NATClassification.Failed]: 0.1,
  },
  [NATClassification.Failed]: {
    [NATClassification.Open]: 0.3,
    [NATClassification.FullCone]: 0.3,
    [NATClassification.RestrictedCone]: 0.2,
    [NATClassification.PortRestricted]: 0.1,
    [NATClassification.Symmetric]: 0.05,
    [NATClassification.Unknown]: 0.1,
    [NATClassification.Detecting]: 0.1,
    [NATClassification.Failed]: 0.05,
  },
};

// ============================================
// Connection Path Types
// ============================================

/**
 * Connection path classification
 */
export enum ConnectionPath {
  /** Direct peer-to-peer connection */
  Direct = 'direct',
  /** Connection through TURN relay */
  Relay = 'relay',
  /** Connection failed */
  Failed = 'failed',
  /** Path determination in progress */
  Pending = 'pending',
}

/**
 * Connection path result with metadata
 */
export interface ConnectionPathResult {
  /** Determined connection path */
  path: ConnectionPath;
  /** Round-trip time in milliseconds */
  rttMs: number;
  /** IP address used for connection */
  address?: string;
  /** Port used for connection */
  port?: number;
  /** TURN server used if relay path */
  relayServer?: string;
  /** Number of hops (1 for direct, 2+ for relay) */
  hops: number;
  /** Timestamp of determination */
  determinedAt: number;
}

// ============================================
// TURN Configuration Types
// ============================================

/**
 * TURN server configuration with credentials
 */
export interface TURNConfig {
  /** TURN server URL(s) */
  urls: string | string[];
  /** Username for authentication */
  username: string;
  /** Credential (password or token) */
  credential: string;
  /** Credential type */
  credentialType: 'password' | 'oauth';
  /** Credential expiration timestamp (epoch ms) */
  expiresAt?: number;
  /** Server region/location for latency optimization */
  region?: string;
  /** Server priority (lower is better) */
  priority?: number;
  /** Whether TCP transport is supported */
  supportsTcp?: boolean;
  /** Whether TLS is supported */
  supportsTls?: boolean;
  /** Maximum bandwidth in kbps (0 for unlimited) */
  maxBandwidth?: number;
}

/**
 * TURN credential refresh configuration
 */
export interface TURNCredentialConfig {
  /** Credential refresh endpoint URL */
  refreshUrl: string;
  /** Authentication token for refresh requests */
  authToken?: string;
  /** Time before expiry to refresh (ms) */
  refreshBeforeExpiry: number;
  /** Maximum refresh retries */
  maxRetries: number;
  /** Retry delay in ms */
  retryDelay: number;
}

/**
 * TURN allocation result
 */
export interface TURNAllocation {
  /** Relay address assigned by TURN server */
  relayAddress: string;
  /** Relay port assigned */
  relayPort: number;
  /** Allocation lifetime in seconds */
  lifetime: number;
  /** Allocation creation timestamp */
  createdAt: number;
  /** TURN server used */
  server: string;
  /** Transport protocol */
  transport: 'udp' | 'tcp' | 'tls';
}

/**
 * TURN server selection result
 */
export interface TURNServerSelection {
  /** Selected server configuration */
  server: TURNConfig;
  /** Measured latency in ms */
  latencyMs: number;
  /** Selection timestamp */
  selectedAt: number;
  /** Other servers tested with latencies */
  alternatives: Array<{ server: TURNConfig; latencyMs: number }>;
}

// ============================================
// Relay Candidate Types
// ============================================

/**
 * Relay candidate information
 */
export interface RelayCandidate {
  /** Unique candidate identifier */
  id: string;
  /** Relay type */
  type: 'turn' | 'tcp' | 'tls';
  /** Relay server address */
  address: string;
  /** Relay server port */
  port: number;
  /** Transport protocol */
  transport: 'udp' | 'tcp';
  /** Associated TURN server */
  server: string;
  /** Candidate priority */
  priority: number;
  /** ICE candidate string */
  candidateString: string;
  /** Whether this is a fallback candidate */
  isFallback: boolean;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Relay candidate pair for connectivity check
 */
export interface RelayCandidatePair {
  /** Local relay candidate */
  local: RelayCandidate;
  /** Remote relay candidate */
  remote: RelayCandidate;
  /** Pair state */
  state: 'new' | 'checking' | 'succeeded' | 'failed' | 'frozen';
  /** Priority of the pair */
  priority: number;
  /** Round-trip time if succeeded */
  rttMs?: number;
}

// ============================================
// NAT Detection Types
// ============================================

/**
 * NAT detection result
 */
export interface NATDetectionResult {
  /** Detected NAT type */
  natType: NATClassification;
  /** Local IP address (may be private) */
  localAddress?: string;
  /** Public/external IP address */
  externalAddress?: string;
  /** Local port */
  localPort?: number;
  /** External/mapped port */
  externalPort?: number;
  /** Whether port mapping is consistent */
  portMappingConsistent: boolean;
  /** Whether filtering is endpoint-independent */
  endpointIndependentFiltering: boolean;
  /** Detection confidence (0-1) */
  confidence: number;
  /** STUN servers used for detection */
  serversUsed: string[];
  /** Detection duration in ms */
  durationMs: number;
  /** Detection timestamp */
  detectedAt: number;
  /** Error if detection failed */
  error?: string;
}

/**
 * NAT detection configuration
 */
export interface NATDetectionConfig {
  /** STUN servers to use for detection */
  stunServers: ICEServer[];
  /** Detection timeout in ms */
  timeout: number;
  /** Number of servers required for reliable detection */
  minServersRequired: number;
  /** Whether to cache detection results */
  enableCache: boolean;
  /** Cache TTL in ms */
  cacheTtl: number;
  /** Enable parallel server testing */
  parallelTesting: boolean;
}

/**
 * STUN binding response
 */
export interface STUNBindingResponse {
  /** Server URL that responded */
  server: string;
  /** Mapped/reflexive address */
  mappedAddress: string;
  /** Mapped port */
  mappedPort: number;
  /** Response time in ms */
  responseTimeMs: number;
  /** Whether response was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ============================================
// Hole Punching Types
// ============================================

/**
 * Hole punching attempt result
 */
export interface HolePunchResult {
  /** Whether hole punching succeeded */
  success: boolean;
  /** Method that succeeded (if any) */
  method?: 'simultaneous' | 'sequential' | 'predicted';
  /** Number of attempts made */
  attempts: number;
  /** Local endpoint used */
  localEndpoint?: { address: string; port: number };
  /** Remote endpoint reached */
  remoteEndpoint?: { address: string; port: number };
  /** Duration of hole punching in ms */
  durationMs: number;
  /** Timestamp of result */
  timestamp: number;
  /** Error if failed */
  error?: string;
}

/**
 * Hole punching configuration
 */
export interface HolePunchConfig {
  /** Maximum attempts before giving up */
  maxAttempts: number;
  /** Timeout per attempt in ms */
  attemptTimeout: number;
  /** Delay between attempts in ms */
  attemptDelay: number;
  /** Enable port prediction for symmetric NAT */
  enablePortPrediction: boolean;
  /** Port prediction range to try */
  portPredictionRange: number;
  /** Whether to try simultaneous open */
  enableSimultaneousOpen: boolean;
  /** Coordination server URL for timing sync */
  coordinationServer?: string;
}

/**
 * Port prediction result
 */
export interface PortPrediction {
  /** Predicted ports to try */
  predictedPorts: number[];
  /** Confidence in prediction (0-1) */
  confidence: number;
  /** Base port observed */
  basePort: number;
  /** Port increment pattern */
  increment: number;
  /** Prediction method used */
  method: 'linear' | 'random' | 'hybrid';
}

// ============================================
// Connectivity Testing Types
// ============================================

/**
 * Connectivity test result
 */
export interface ConnectivityTestResult {
  /** Peer ID tested */
  peerId: PeerId;
  /** Whether connectivity was established */
  connected: boolean;
  /** Determined connection path */
  path: ConnectionPath;
  /** Round-trip time in ms */
  rttMs: number;
  /** Packet loss percentage (0-100) */
  packetLossPercent: number;
  /** Jitter in ms */
  jitterMs: number;
  /** Bandwidth estimate in kbps */
  bandwidthKbps?: number;
  /** ICE candidates that succeeded */
  successfulCandidates: ICECandidate[];
  /** Test duration in ms */
  durationMs: number;
  /** Test timestamp */
  testedAt: number;
}

/**
 * Connectivity test configuration
 */
export interface ConnectivityTestConfig {
  /** Test timeout in ms */
  timeout: number;
  /** Number of ping packets to send */
  pingCount: number;
  /** Interval between pings in ms */
  pingInterval: number;
  /** Enable bandwidth estimation */
  enableBandwidthTest: boolean;
  /** Size of bandwidth test packets */
  bandwidthTestSize: number;
  /** Maximum acceptable RTT in ms */
  maxAcceptableRtt: number;
  /** Maximum acceptable packet loss percentage */
  maxAcceptablePacketLoss: number;
}

/**
 * Candidate ranking result
 */
export interface CandidateRanking {
  /** Candidate being ranked */
  candidate: ICECandidate;
  /** Calculated score (higher is better) */
  score: number;
  /** RTT contribution to score */
  rttScore: number;
  /** Reliability contribution to score */
  reliabilityScore: number;
  /** Path type contribution to score */
  pathScore: number;
  /** Whether candidate is recommended */
  recommended: boolean;
}

/**
 * Connectivity recommendation
 */
export interface ConnectivityRecommendation {
  /** Recommended connection approach */
  approach: 'direct' | 'turn' | 'hybrid' | 'abort';
  /** Primary candidates to use */
  primaryCandidates: ICECandidate[];
  /** Fallback candidates if primary fails */
  fallbackCandidates: ICECandidate[];
  /** Recommended TURN server if relay needed */
  turnServer?: TURNConfig;
  /** Estimated success probability (0-1) */
  successProbability: number;
  /** Recommendation reasoning */
  reasoning: string;
}

// ============================================
// Fallback Escalation Types
// ============================================

/**
 * Fallback escalation level
 */
export enum EscalationLevel {
  /** Try direct connection first */
  Direct = 0,
  /** Try UDP hole punching */
  HolePunch = 1,
  /** Try TCP connection */
  TCP = 2,
  /** Use TURN UDP relay */
  TurnUdp = 3,
  /** Use TURN TCP relay */
  TurnTcp = 4,
  /** Use TURN TLS relay */
  TurnTls = 5,
  /** All options exhausted */
  Exhausted = 6,
}

/**
 * Fallback escalation state
 */
export interface EscalationState {
  /** Current escalation level */
  level: EscalationLevel;
  /** Levels that have been tried */
  attemptedLevels: EscalationLevel[];
  /** Current level attempt count */
  currentAttempts: number;
  /** Maximum attempts per level */
  maxAttemptsPerLevel: number;
  /** Escalation start timestamp */
  startedAt: number;
  /** Last level change timestamp */
  lastEscalationAt: number;
  /** Time spent at each level in ms */
  timePerLevel: Map<EscalationLevel, number>;
}

/**
 * Fallback escalation configuration
 */
export interface EscalationConfig {
  /** Enable automatic escalation */
  autoEscalate: boolean;
  /** Maximum attempts per level */
  maxAttemptsPerLevel: number;
  /** Timeout per level in ms */
  timeoutPerLevel: number;
  /** Levels to skip */
  skipLevels: EscalationLevel[];
  /** Maximum total escalation time in ms */
  maxTotalTime: number;
  /** Callback when escalation level changes */
  onEscalation?: (from: EscalationLevel, to: EscalationLevel) => void;
}

// ============================================
// Event Types
// ============================================

/**
 * NAT module event types
 */
export enum NATEventType {
  /** NAT detection started */
  DetectionStarted = 'nat_detection_started',
  /** NAT detection completed */
  DetectionCompleted = 'nat_detection_completed',
  /** NAT detection failed */
  DetectionFailed = 'nat_detection_failed',
  /** TURN credentials refreshed */
  CredentialsRefreshed = 'turn_credentials_refreshed',
  /** TURN allocation created */
  AllocationCreated = 'turn_allocation_created',
  /** TURN allocation failed */
  AllocationFailed = 'turn_allocation_failed',
  /** Hole punch started */
  HolePunchStarted = 'hole_punch_started',
  /** Hole punch succeeded */
  HolePunchSucceeded = 'hole_punch_succeeded',
  /** Hole punch failed */
  HolePunchFailed = 'hole_punch_failed',
  /** Connectivity test completed */
  ConnectivityTestCompleted = 'connectivity_test_completed',
  /** Escalation level changed */
  EscalationChanged = 'escalation_changed',
  /** Connection path determined */
  PathDetermined = 'path_determined',
}

/**
 * NAT module event
 */
export interface NATEvent<T = unknown> {
  /** Event type */
  type: NATEventType;
  /** Event timestamp */
  timestamp: number;
  /** Associated peer ID if applicable */
  peerId?: PeerId;
  /** Event data */
  data: T;
}

/**
 * NAT event handler type
 */
export type NATEventHandler<T = unknown> = (event: NATEvent<T>) => void;

// ============================================
// Manager Configuration Types
// ============================================

/**
 * NAT Detector configuration
 */
export interface NATDetectorConfig {
  /** STUN servers for detection */
  stunServers: ICEServer[];
  /** Detection timeout in ms */
  timeout: number;
  /** Enable result caching */
  enableCache: boolean;
  /** Cache TTL in ms */
  cacheTtl: number;
  /** Parallel server testing */
  parallelTesting: boolean;
  /** Minimum servers for reliable detection */
  minServers: number;
}

/**
 * TURN Manager configuration
 */
export interface TURNManagerConfig {
  /** Available TURN servers */
  servers: TURNConfig[];
  /** Credential refresh configuration */
  credentialConfig?: TURNCredentialConfig;
  /** Latency test timeout in ms */
  latencyTestTimeout: number;
  /** Enable server health monitoring */
  enableHealthMonitoring: boolean;
  /** Health check interval in ms */
  healthCheckInterval: number;
  /** Maximum credential age before refresh in ms */
  maxCredentialAge: number;
}

/**
 * Hole Puncher configuration
 */
export interface HolePuncherConfig {
  /** Maximum hole punch attempts */
  maxAttempts: number;
  /** Per-attempt timeout in ms */
  attemptTimeout: number;
  /** Delay between attempts in ms */
  attemptDelay: number;
  /** Enable port prediction */
  enablePortPrediction: boolean;
  /** Port prediction range */
  portPredictionRange: number;
  /** Enable simultaneous open */
  enableSimultaneousOpen: boolean;
}

/**
 * Connectivity Tester configuration
 */
export interface ConnectivityTesterConfig {
  /** Test timeout in ms */
  timeout: number;
  /** Number of ping packets */
  pingCount: number;
  /** Ping interval in ms */
  pingInterval: number;
  /** Enable bandwidth testing */
  enableBandwidthTest: boolean;
  /** Maximum acceptable RTT */
  maxAcceptableRtt: number;
  /** Maximum acceptable packet loss */
  maxAcceptablePacketLoss: number;
}

// ============================================
// Default Configurations
// ============================================

/**
 * Default STUN servers for NAT detection
 */
export const DEFAULT_STUN_SERVERS: ICEServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
];

/**
 * Default NAT detector configuration
 */
export const DEFAULT_NAT_DETECTOR_CONFIG: NATDetectorConfig = {
  stunServers: DEFAULT_STUN_SERVERS,
  timeout: 10000,
  enableCache: true,
  cacheTtl: 300000, // 5 minutes
  parallelTesting: true,
  minServers: 2,
};

/**
 * Default TURN manager configuration
 */
export const DEFAULT_TURN_MANAGER_CONFIG: Partial<TURNManagerConfig> = {
  latencyTestTimeout: 5000,
  enableHealthMonitoring: true,
  healthCheckInterval: 60000,
  maxCredentialAge: 3600000, // 1 hour
};

/**
 * Default hole puncher configuration
 */
export const DEFAULT_HOLE_PUNCHER_CONFIG: HolePuncherConfig = {
  maxAttempts: 10,
  attemptTimeout: 3000,
  attemptDelay: 500,
  enablePortPrediction: true,
  portPredictionRange: 100,
  enableSimultaneousOpen: true,
};

/**
 * Default connectivity tester configuration
 */
export const DEFAULT_CONNECTIVITY_TESTER_CONFIG: ConnectivityTesterConfig = {
  timeout: 15000,
  pingCount: 10,
  pingInterval: 100,
  enableBandwidthTest: false,
  maxAcceptableRtt: 500,
  maxAcceptablePacketLoss: 10,
};

/**
 * Default escalation configuration
 */
export const DEFAULT_ESCALATION_CONFIG: EscalationConfig = {
  autoEscalate: true,
  maxAttemptsPerLevel: 3,
  timeoutPerLevel: 5000,
  skipLevels: [],
  maxTotalTime: 30000,
};

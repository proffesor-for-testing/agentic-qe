/**
 * Web App Types
 *
 * Type definitions for the @ruvector/edge web dashboard.
 *
 * @module edge/webapp/types
 */

// ============================================
// Dashboard State Types
// ============================================

export interface DashboardState {
  /** Connection status */
  connectionStatus: ConnectionStatus;

  /** Local agent info */
  localAgent: AgentInfo | null;

  /** Connected peers */
  peers: PeerInfo[];

  /** Pattern statistics */
  patterns: PatternStats;

  /** CRDT sync state */
  crdt: CRDTState;

  /** Active tests */
  tests: TestState;

  /** System metrics */
  metrics: SystemMetrics;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface AgentInfo {
  id: string;
  publicKey: string;
  createdAt: number;
  capabilities: string[];
}

export interface PeerInfo {
  id: string;
  publicKey: string;
  connectionState: string;
  latencyMs: number;
  lastSeen: number;
  patternsShared: number;
}

export interface PatternStats {
  total: number;
  local: number;
  synced: number;
  pending: number;
  categories: Record<string, number>;
}

export interface CRDTState {
  stores: CRDTStoreInfo[];
  totalOperations: number;
  conflictsResolved: number;
  lastSync: number;
}

export interface CRDTStoreInfo {
  id: string;
  type: 'GCounter' | 'LWWRegister' | 'ORSet' | 'PatternCRDT';
  size: number;
  version: number;
}

export interface TestState {
  running: TestInfo[];
  completed: TestResult[];
  queued: number;
}

export interface TestInfo {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  progress: number;
  startedAt: number;
}

export interface TestResult {
  id: string;
  name: string;
  status: 'passed' | 'failed' | 'error';
  duration: number;
  passed: number;
  failed: number;
  total: number;
}

export interface SystemMetrics {
  memoryUsage: number;
  cpuUsage: number;
  networkLatency: number;
  messagesPerSecond: number;
  uptime: number;
}

// ============================================
// Action Types
// ============================================

export type DashboardAction =
  | { type: 'SET_CONNECTION_STATUS'; status: ConnectionStatus }
  | { type: 'SET_LOCAL_AGENT'; agent: AgentInfo }
  | { type: 'ADD_PEER'; peer: PeerInfo }
  | { type: 'UPDATE_PEER'; peerId: string; updates: Partial<PeerInfo> }
  | { type: 'REMOVE_PEER'; peerId: string }
  | { type: 'UPDATE_PATTERNS'; stats: PatternStats }
  | { type: 'UPDATE_CRDT'; state: CRDTState }
  | { type: 'ADD_TEST'; test: TestInfo }
  | { type: 'UPDATE_TEST'; testId: string; updates: Partial<TestInfo> }
  | { type: 'COMPLETE_TEST'; result: TestResult }
  | { type: 'UPDATE_METRICS'; metrics: SystemMetrics }
  | { type: 'RESET' };

// ============================================
// Component Props Types
// ============================================

export interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  status?: 'success' | 'warning' | 'error' | 'info';
  icon?: string;
}

export interface PeerCardProps {
  peer: PeerInfo;
  onDisconnect?: (peerId: string) => void;
  onSync?: (peerId: string) => void;
}

export interface PatternListProps {
  patterns: PatternItem[];
  onShare?: (patternId: string) => void;
  onDelete?: (patternId: string) => void;
}

export interface PatternItem {
  id: string;
  name: string;
  category: string;
  confidence: number;
  synced: boolean;
  createdAt: number;
}

export interface CRDTVisualizerProps {
  stores: CRDTStoreInfo[];
  onInspect?: (storeId: string) => void;
}

export interface TestRunnerProps {
  tests: TestInfo[];
  results: TestResult[];
  onRun?: (testIds: string[]) => void;
  onCancel?: (testId: string) => void;
}

// ============================================
// Service Types
// ============================================

export interface P2PServiceConfig {
  /** Enable auto-connect to known peers */
  autoConnect: boolean;

  /** WebRTC configuration */
  webrtc: {
    iceServers: RTCIceServer[];
    enableDataChannel: boolean;
  };

  /** Signaling server configuration */
  signaling: {
    serverUrl: string;
    roomId?: string;
    autoReconnect?: boolean;
  };

  /** Agent API configuration */
  agentApi: {
    baseUrl: string;
  };

  /** Pattern sync configuration */
  patternSync: {
    autoSync: boolean;
    syncInterval: number;
  };

  /** CRDT configuration */
  crdt: {
    enableDeltaSync: boolean;
    conflictResolution: 'lww' | 'merge';
  };
}

export interface P2PService {
  /** Initialize the service */
  init(): Promise<void>;

  /** Connect to a peer */
  connect(peerId: string): Promise<void>;

  /** Disconnect from a peer */
  disconnect(peerId: string): Promise<void>;

  /** Share a pattern with peers */
  sharePattern(patternId: string, peerIds?: string[]): Promise<void>;

  /** Sync CRDT state with a peer */
  syncCRDT(peerId: string): Promise<void>;

  /** Get current state */
  getState(): DashboardState;

  /** Subscribe to state changes */
  subscribe(callback: (state: DashboardState) => void): () => void;

  /** Cleanup resources */
  destroy(): void;
}

// ============================================
// Event Types
// ============================================

export type WebAppEvent =
  | { type: 'peer:discovered'; peer: PeerInfo }
  | { type: 'peer:connected'; peer: PeerInfo }
  | { type: 'peer:disconnected'; peerId: string }
  | { type: 'pattern:received'; patternId: string; from: string }
  | { type: 'pattern:synced'; count: number }
  | { type: 'pattern:created'; patternId: string; name: string }
  | { type: 'crdt:updated'; storeId: string }
  | { type: 'crdt:conflict'; storeId: string; resolved: boolean }
  | { type: 'test:started'; testId: string }
  | { type: 'test:completed'; result: TestResult }
  | { type: 'signaling:connected' }
  | { type: 'signaling:disconnected' }
  | { type: 'signaling:error'; message: string }
  | { type: 'room:joined'; roomId: string; peers: PeerInfo[] }
  | { type: 'agent:spawned'; agentId: string; agentType: string }
  | { type: 'agent:completed'; agentId: string; exitCode: number }
  | { type: 'agent:error'; agentId: string; error: string }
  | { type: 'error'; message: string; code?: string };

export type WebAppEventHandler = (event: WebAppEvent) => void;

// ============================================
// Navigation Types
// ============================================

export type NavRoute =
  | 'dashboard'
  | 'peers'
  | 'patterns'
  | 'crdt'
  | 'tests'
  | 'settings';

export interface NavItem {
  route: NavRoute;
  label: string;
  icon: string;
  badge?: number;
}

// ============================================
// Settings Types
// ============================================

export interface AppSettings {
  /** Theme */
  theme: 'light' | 'dark' | 'system';

  /** Auto-connect on startup */
  autoConnect: boolean;

  /** Show notifications */
  notifications: boolean;

  /** Sync interval in seconds */
  syncInterval: number;

  /** Max peers */
  maxPeers: number;

  /** Debug mode */
  debug: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  autoConnect: true,
  notifications: true,
  syncInterval: 30,
  maxPeers: 10,
  debug: false,
};

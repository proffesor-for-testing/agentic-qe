/**
 * QUIC Synchronization Types
 * Type definitions for QUIC-based cross-agent pattern synchronization
 */

export interface QUICConfig {
  enabled: boolean;
  port: number;
  host?: string;
  peers: PeerConfig[];
  syncInterval: number;
  batchSize: number;
  compression: boolean;
  tls: TLSConfig;
  retry: RetryConfig;
}

export interface PeerConfig {
  id: string;
  address: string;
  port: number;
  priority?: number;
  tags?: string[];
}

export interface TLSConfig {
  cert?: string;
  key?: string;
  ca?: string;
  rejectUnauthorized?: boolean;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface Pattern {
  id: string;
  agentId: string;
  type: string;
  data: any;
  metadata: PatternMetadata;
  timestamp: number;
  version: number;
}

export interface PatternMetadata {
  source: string;
  tags: string[];
  priority?: number;
  expiresAt?: number;
  checksum?: string;
}

export interface SyncRequest {
  requestId: string;
  patterns: Pattern[];
  compressed: boolean;
  checksum: string;
  timestamp: number;
  sourceId: string;
}

export interface SyncResponse {
  requestId: string;
  success: boolean;
  receivedCount: number;
  errors?: SyncError[];
  timestamp: number;
}

export interface SyncError {
  patternId: string;
  error: string;
  code: string;
}

export interface ConnectionState {
  id: string;
  peerId: string;
  address: string;
  port: number;
  connected: boolean;
  lastSync: number;
  syncCount: number;
  errorCount: number;
  latency?: number;
}

export interface SyncStats {
  totalSyncs: number;
  totalPatterns: number;
  successfulSyncs: number;
  failedSyncs: number;
  averageLatency: number;
  bytesTransferred: number;
  compressionRatio?: number;
}

export interface QUICServerState {
  running: boolean;
  port: number;
  connections: number;
  stats: SyncStats;
  peers: Map<string, ConnectionState>;
}

export type SyncEventType =
  | 'connection:opened'
  | 'connection:closed'
  | 'sync:started'
  | 'sync:completed'
  | 'sync:failed'
  | 'pattern:received'
  | 'error';

export interface SyncEvent {
  type: SyncEventType;
  timestamp: number;
  peerId?: string;
  data?: any;
  error?: Error;
}

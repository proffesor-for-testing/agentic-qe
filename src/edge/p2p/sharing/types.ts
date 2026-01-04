/**
 * Pattern Sharing Protocol Types
 *
 * Type definitions for secure pattern sharing between QE agents.
 * Enables collaborative learning through test and code patterns with
 * privacy-preserving features including anonymization and differential privacy.
 *
 * @module edge/p2p/sharing/types
 * @version 1.0.0
 */

// ============================================
// Protocol Version and Constants
// ============================================

/**
 * Pattern sharing protocol version
 */
export const SHARING_PROTOCOL_VERSION = '1.0.0';

/**
 * Default embedding dimension for pattern vectors
 */
export const DEFAULT_EMBEDDING_DIMENSION = 384;

/**
 * Maximum pattern size in bytes (256KB)
 */
export const MAX_PATTERN_SIZE = 262144;

/**
 * Maximum patterns per sync batch
 */
export const MAX_BATCH_SIZE = 100;

/**
 * Default differential privacy epsilon
 */
export const DEFAULT_DP_EPSILON = 1.0;

/**
 * Default differential privacy delta
 */
export const DEFAULT_DP_DELTA = 1e-5;

/**
 * Pattern TTL in milliseconds (30 days)
 */
export const DEFAULT_PATTERN_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * Default LRU cache size for patterns
 */
export const DEFAULT_CACHE_SIZE = 1000;

// ============================================
// Pattern Types
// ============================================

/**
 * Types of patterns that can be shared
 */
export enum PatternCategory {
  /** Test patterns (unit, integration, e2e) */
  TEST = 'test',
  /** Code patterns (functions, classes) */
  CODE = 'code',
  /** Refactoring patterns */
  REFACTOR = 'refactor',
  /** Bug fix patterns */
  DEFECT_FIX = 'defect-fix',
  /** Performance patterns */
  PERFORMANCE = 'performance',
  /** Security patterns */
  SECURITY = 'security',
}

/**
 * Pattern quality levels based on usage and success
 */
export enum PatternQuality {
  /** Unverified pattern */
  UNVERIFIED = 'unverified',
  /** Verified but low usage */
  LOW = 'low',
  /** Moderate quality */
  MEDIUM = 'medium',
  /** High quality, well-tested */
  HIGH = 'high',
  /** Expert-curated pattern */
  CURATED = 'curated',
}

/**
 * Sharing policy levels
 */
export enum SharingPolicy {
  /** Share with everyone */
  PUBLIC = 'public',
  /** Share only with trusted peers */
  TRUSTED = 'trusted',
  /** Share only with explicitly allowed peers */
  SELECTIVE = 'selective',
  /** Never share */
  PRIVATE = 'private',
}

/**
 * Privacy level for pattern content
 */
export enum PrivacyLevel {
  /** Full content visible */
  FULL = 'full',
  /** Anonymized (identifiers removed) */
  ANONYMIZED = 'anonymized',
  /** Only embedding shared (no content) */
  EMBEDDING_ONLY = 'embedding_only',
  /** Aggregated patterns only */
  AGGREGATED = 'aggregated',
}

// ============================================
// Core Pattern Interfaces
// ============================================

/**
 * Shared pattern structure for P2P distribution
 */
export interface SharedPattern {
  /** Unique pattern identifier */
  id: string;

  /** Pattern category */
  category: PatternCategory;

  /** Pattern type (more specific, e.g., 'unit-test', 'factory') */
  type: string;

  /** Domain/context (e.g., 'api', 'database', 'ui') */
  domain: string;

  /** Pattern content (code, template, etc.) */
  content: PatternContent;

  /** Vector embedding for similarity search */
  embedding: Float32Array | number[];

  /** Pattern metadata */
  metadata: PatternSharingMetadata;

  /** Version information */
  version: PatternVersion;

  /** Quality metrics */
  quality: PatternQualityMetrics;

  /** Sharing configuration */
  sharing: PatternSharingConfig;

  /** ISO timestamp of creation */
  createdAt: string;

  /** ISO timestamp of last update */
  updatedAt: string;

  /** ISO timestamp of expiration */
  expiresAt?: string;
}

/**
 * Pattern content with optional anonymization
 */
export interface PatternContent {
  /** Raw content (code, template, etc.) */
  raw: string;

  /** Normalized/processed content */
  normalized?: string;

  /** Anonymized content (identifiers replaced) */
  anonymized?: string;

  /** Content hash for deduplication */
  contentHash: string;

  /** Language (typescript, javascript, etc.) */
  language: string;

  /** Framework if applicable */
  framework?: string;

  /** Placeholder definitions for templates */
  placeholders?: PatternPlaceholder[];
}

/**
 * Placeholder in pattern templates
 */
export interface PatternPlaceholder {
  /** Placeholder name */
  name: string;

  /** Placeholder type */
  type: 'string' | 'number' | 'identifier' | 'type' | 'expression';

  /** Description */
  description?: string;

  /** Default value */
  defaultValue?: string;
}

/**
 * Metadata for shared patterns
 */
export interface PatternSharingMetadata {
  /** Optional human-readable name */
  name?: string;

  /** Description of the pattern */
  description?: string;

  /** Tags for categorization */
  tags: string[];

  /** Source identifier (anonymized if needed) */
  sourceId?: string;

  /** Original file path (anonymized) */
  filePath?: string;

  /** Dependencies required */
  dependencies?: string[];

  /** Custom metadata */
  custom?: Record<string, unknown>;
}

/**
 * Pattern version tracking with vector clocks
 */
export interface PatternVersion {
  /** Semantic version */
  semver: string;

  /** Vector clock for distributed versioning */
  vectorClock: VectorClock;

  /** Previous version ID */
  previousVersionId?: string;

  /** Change description */
  changeLog?: string;
}

/**
 * Vector clock for distributed systems
 */
export interface VectorClock {
  /** Map of agent ID to logical timestamp */
  clock: Record<string, number>;
}

/**
 * Quality metrics for patterns
 */
export interface PatternQualityMetrics {
  /** Quality level */
  level: PatternQuality;

  /** Success rate (0-1) */
  successRate: number;

  /** Total usage count */
  usageCount: number;

  /** Number of unique users */
  uniqueUsers: number;

  /** Average confidence score */
  avgConfidence: number;

  /** Last success timestamp */
  lastSuccessAt?: string;

  /** Feedback score (-1 to 1) */
  feedbackScore: number;
}

/**
 * Sharing configuration for patterns
 */
export interface PatternSharingConfig {
  /** Sharing policy */
  policy: SharingPolicy;

  /** Privacy level */
  privacyLevel: PrivacyLevel;

  /** Allowed peer IDs (for selective sharing) */
  allowedPeers?: string[];

  /** Blocked peer IDs */
  blockedPeers?: string[];

  /** Whether to apply differential privacy */
  differentialPrivacy: boolean;

  /** Epsilon for differential privacy */
  dpEpsilon?: number;

  /** Delta for differential privacy */
  dpDelta?: number;

  /** Whether pattern can be further shared */
  redistributable: boolean;

  /** Attribution required */
  requireAttribution: boolean;
}

// ============================================
// Query and Search Types
// ============================================

/**
 * Query for searching patterns
 */
export interface PatternQuery {
  /** Query embedding vector for similarity search */
  embedding?: Float32Array | number[];

  /** Text search query */
  textQuery?: string;

  /** Filter by categories */
  categories?: PatternCategory[];

  /** Filter by types */
  types?: string[];

  /** Filter by domains */
  domains?: string[];

  /** Filter by tags */
  tags?: string[];

  /** Filter by language */
  language?: string;

  /** Filter by framework */
  framework?: string;

  /** Minimum quality level */
  minQuality?: PatternQuality;

  /** Minimum success rate */
  minSuccessRate?: number;

  /** Minimum usage count */
  minUsageCount?: number;

  /** Maximum number of results */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Minimum similarity threshold (0-1) */
  similarityThreshold?: number;

  /** Include expired patterns */
  includeExpired?: boolean;
}

/**
 * Search result with relevance scoring
 */
export interface PatternMatch {
  /** Matched pattern */
  pattern: SharedPattern;

  /** Similarity score (0-1) */
  similarity: number;

  /** Text match score (0-1) */
  textScore?: number;

  /** Combined relevance score */
  relevance: number;

  /** Match highlights */
  highlights?: PatternHighlight[];

  /** Why this pattern matched */
  matchReason: string;
}

/**
 * Highlight in matched content
 */
export interface PatternHighlight {
  /** Field that matched */
  field: string;

  /** Start position */
  start: number;

  /** End position */
  end: number;

  /** Matched text */
  text: string;
}

/**
 * Batch search results
 */
export interface PatternSearchResults {
  /** Matched patterns */
  matches: PatternMatch[];

  /** Total count (before pagination) */
  totalCount: number;

  /** Query used */
  query: PatternQuery;

  /** Search duration (ms) */
  duration: number;

  /** Whether results are from cache */
  cached: boolean;
}

// ============================================
// Synchronization Types
// ============================================

/**
 * Pattern sync status
 */
export enum SyncStatus {
  /** Not synced */
  PENDING = 'pending',
  /** Currently syncing */
  SYNCING = 'syncing',
  /** Successfully synced */
  SYNCED = 'synced',
  /** Sync failed */
  FAILED = 'failed',
  /** Conflict detected */
  CONFLICT = 'conflict',
}

/**
 * Sync state for a pattern
 */
export interface PatternSyncState {
  /** Pattern ID */
  patternId: string;

  /** Current sync status */
  status: SyncStatus;

  /** Last sync attempt */
  lastSyncAt?: string;

  /** Last successful sync */
  lastSuccessAt?: string;

  /** Sync error if failed */
  error?: string;

  /** Peers synced with */
  syncedPeers: string[];

  /** Pending peers */
  pendingPeers: string[];
}

/**
 * Sync request message
 */
export interface PatternSyncRequest {
  /** Request ID */
  requestId: string;

  /** Requesting agent ID */
  requesterId: string;

  /** Patterns being requested (by ID) */
  patternIds?: string[];

  /** Query for patterns */
  query?: PatternQuery;

  /** Vector clocks for incremental sync */
  vectorClocks?: Record<string, VectorClock>;

  /** Request timestamp */
  timestamp: string;

  /** Whether to include content */
  includeContent: boolean;
}

/**
 * Sync response message
 */
export interface PatternSyncResponse {
  /** Request ID this responds to */
  requestId: string;

  /** Responding agent ID */
  responderId: string;

  /** Patterns being shared */
  patterns: SharedPattern[];

  /** Patterns that had conflicts */
  conflicts?: PatternConflict[];

  /** Whether more patterns are available */
  hasMore: boolean;

  /** Continuation token for pagination */
  continuationToken?: string;

  /** Response timestamp */
  timestamp: string;
}

/**
 * Pattern conflict information
 */
export interface PatternConflict {
  /** Pattern ID */
  patternId: string;

  /** Local version */
  localVersion: PatternVersion;

  /** Remote version */
  remoteVersion: PatternVersion;

  /** Conflict type */
  conflictType: 'concurrent_update' | 'version_mismatch' | 'content_divergence';

  /** Resolution (if available) */
  resolution?: ConflictResolution;
}

/**
 * Conflict resolution strategy
 */
export interface ConflictResolution {
  /** Resolution strategy used */
  strategy: 'latest_wins' | 'merge' | 'manual' | 'prefer_local' | 'prefer_remote';

  /** Resolved pattern (if auto-resolved) */
  resolvedPattern?: SharedPattern;

  /** Resolution timestamp */
  resolvedAt: string;

  /** Resolver agent ID */
  resolvedBy?: string;
}

// ============================================
// Broadcasting Types
// ============================================

/**
 * Broadcast message types
 */
export enum BroadcastType {
  /** New pattern announcement */
  NEW_PATTERN = 'new_pattern',
  /** Pattern update announcement */
  PATTERN_UPDATE = 'pattern_update',
  /** Pattern deletion announcement */
  PATTERN_DELETE = 'pattern_delete',
  /** Request for patterns */
  PATTERN_REQUEST = 'pattern_request',
  /** Peer discovery */
  PEER_DISCOVERY = 'peer_discovery',
}

/**
 * Broadcast message structure
 */
export interface PatternBroadcast {
  /** Broadcast type */
  type: BroadcastType;

  /** Broadcast ID */
  broadcastId: string;

  /** Sender agent ID */
  senderId: string;

  /** Payload */
  payload: BroadcastPayload;

  /** TTL (number of hops) */
  ttl: number;

  /** Timestamp */
  timestamp: string;

  /** Signature */
  signature: string;
}

/**
 * Broadcast payload union type
 */
export type BroadcastPayload =
  | NewPatternPayload
  | PatternUpdatePayload
  | PatternDeletePayload
  | PatternRequestPayload
  | PeerDiscoveryPayload;

/**
 * New pattern announcement
 */
export interface NewPatternPayload {
  type: 'new_pattern';
  /** Pattern summary (not full content) */
  summary: PatternSummary;
}

/**
 * Pattern update announcement
 */
export interface PatternUpdatePayload {
  type: 'pattern_update';
  /** Pattern ID */
  patternId: string;
  /** New version */
  version: PatternVersion;
  /** Update summary */
  changes: string[];
}

/**
 * Pattern deletion announcement
 */
export interface PatternDeletePayload {
  type: 'pattern_delete';
  /** Pattern ID */
  patternId: string;
  /** Deletion reason */
  reason?: string;
}

/**
 * Request for specific patterns
 */
export interface PatternRequestPayload {
  type: 'pattern_request';
  /** Requested pattern IDs */
  patternIds?: string[];
  /** Or query */
  query?: PatternQuery;
}

/**
 * Peer discovery announcement
 */
export interface PeerDiscoveryPayload {
  type: 'peer_discovery';
  /** Peer capabilities */
  capabilities: PeerCapabilities;
  /** Pattern categories this peer has */
  availableCategories: PatternCategory[];
  /** Number of patterns available */
  patternCount: number;
}

/**
 * Pattern summary for broadcasts
 */
export interface PatternSummary {
  /** Pattern ID */
  id: string;

  /** Category */
  category: PatternCategory;

  /** Type */
  type: string;

  /** Domain */
  domain: string;

  /** Content hash */
  contentHash: string;

  /** Quality level */
  quality: PatternQuality;

  /** Tags */
  tags: string[];

  /** Embedding (may be privacy-adjusted) */
  embedding?: Float32Array | number[];
}

/**
 * Peer capabilities for pattern sharing
 */
export interface PeerCapabilities {
  /** Supported protocol version */
  protocolVersion: string;

  /** Maximum patterns per sync */
  maxBatchSize: number;

  /** Supported categories */
  categories: PatternCategory[];

  /** Supports differential privacy */
  differentialPrivacy: boolean;

  /** Supports vector search */
  vectorSearch: boolean;

  /** Maximum embedding dimension */
  maxEmbeddingDimension: number;
}

// ============================================
// Anonymization Types
// ============================================

/**
 * Anonymization configuration
 */
export interface AnonymizationConfig {
  /** Replace identifiers */
  replaceIdentifiers: boolean;

  /** Replace string literals */
  replaceStrings: boolean;

  /** Replace numbers */
  replaceNumbers: boolean;

  /** Replace file paths */
  replaceFilePaths: boolean;

  /** Remove comments */
  removeComments: boolean;

  /** Preserve structure */
  preserveStructure: boolean;

  /** Custom patterns to anonymize */
  customPatterns?: RegExp[];

  /** Words to preserve (keywords, etc.) */
  preserveWords?: string[];
}

/**
 * Anonymization result
 */
export interface AnonymizationResult {
  /** Anonymized content */
  content: string;

  /** Mapping of original to anonymized (for debugging) */
  mapping?: Record<string, string>;

  /** Statistics */
  stats: AnonymizationStats;
}

/**
 * Anonymization statistics
 */
export interface AnonymizationStats {
  /** Identifiers replaced */
  identifiersReplaced: number;

  /** Strings replaced */
  stringsReplaced: number;

  /** Numbers replaced */
  numbersReplaced: number;

  /** Comments removed */
  commentsRemoved: number;

  /** Total characters changed */
  charactersChanged: number;
}

// ============================================
// Differential Privacy Types
// ============================================

/**
 * Differential privacy configuration
 */
export interface DifferentialPrivacyConfig {
  /** Privacy budget (epsilon) */
  epsilon: number;

  /** Delta parameter */
  delta: number;

  /** Mechanism to use */
  mechanism: 'laplace' | 'gaussian';

  /** Sensitivity bound */
  sensitivity: number;

  /** Clip embeddings to this norm */
  clipNorm: number;
}

/**
 * Result of applying differential privacy
 */
export interface DPResult {
  /** Noised data */
  data: Float32Array | number[];

  /** Noise magnitude added */
  noiseMagnitude: number;

  /** Privacy budget consumed */
  budgetConsumed: number;
}

// ============================================
// Index Types
// ============================================

/**
 * Index statistics
 */
export interface PatternIndexStats {
  /** Total patterns indexed */
  totalPatterns: number;

  /** Patterns by category */
  byCategory: Record<PatternCategory, number>;

  /** Patterns by quality */
  byQuality: Record<PatternQuality, number>;

  /** Memory usage (bytes) */
  memoryUsage: number;

  /** Last update timestamp */
  lastUpdated: string;

  /** Index version */
  version: string;
}

/**
 * Index configuration
 */
export interface PatternIndexConfig {
  /** Maximum patterns to store */
  maxPatterns: number;

  /** Embedding dimension */
  embeddingDimension: number;

  /** Enable LRU eviction */
  enableEviction: boolean;

  /** Eviction threshold (0-1) */
  evictionThreshold: number;

  /** Enable content deduplication */
  enableDeduplication: boolean;

  /** Enable automatic cleanup of expired patterns */
  enableExpiration: boolean;
}

// ============================================
// Error Types
// ============================================

/**
 * Sharing error codes
 */
export enum SharingErrorCode {
  /** Invalid pattern format */
  INVALID_PATTERN = 'INVALID_PATTERN',
  /** Pattern not found */
  PATTERN_NOT_FOUND = 'PATTERN_NOT_FOUND',
  /** Duplicate pattern */
  DUPLICATE_PATTERN = 'DUPLICATE_PATTERN',
  /** Sharing policy violation */
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  /** Sync conflict */
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  /** Peer not authorized */
  UNAUTHORIZED_PEER = 'UNAUTHORIZED_PEER',
  /** Rate limit exceeded */
  RATE_LIMITED = 'RATE_LIMITED',
  /** Pattern too large */
  PATTERN_TOO_LARGE = 'PATTERN_TOO_LARGE',
  /** Serialization error */
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  /** Network error */
  NETWORK_ERROR = 'NETWORK_ERROR',
  /** Index full */
  INDEX_FULL = 'INDEX_FULL',
  /** Version conflict */
  VERSION_CONFLICT = 'VERSION_CONFLICT',
}

/**
 * Sharing error class
 */
export class SharingError extends Error {
  constructor(
    message: string,
    public readonly code: SharingErrorCode,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'SharingError';
  }
}

// ============================================
// Event Types
// ============================================

/**
 * Sharing event types
 */
export enum SharingEventType {
  /** Pattern added to index */
  PATTERN_ADDED = 'pattern_added',
  /** Pattern updated */
  PATTERN_UPDATED = 'pattern_updated',
  /** Pattern removed */
  PATTERN_REMOVED = 'pattern_removed',
  /** Sync started */
  SYNC_STARTED = 'sync_started',
  /** Sync completed */
  SYNC_COMPLETED = 'sync_completed',
  /** Sync failed */
  SYNC_FAILED = 'sync_failed',
  /** Broadcast received */
  BROADCAST_RECEIVED = 'broadcast_received',
  /** Conflict detected */
  CONFLICT_DETECTED = 'conflict_detected',
  /** Conflict resolved */
  CONFLICT_RESOLVED = 'conflict_resolved',
}

/**
 * Sharing event
 */
export interface SharingEvent {
  /** Event type */
  type: SharingEventType;

  /** Event timestamp */
  timestamp: number;

  /** Event details */
  details: unknown;
}

/**
 * Sharing event handler
 */
export type SharingEventHandler = (event: SharingEvent) => void;

// ============================================
// Utility Types
// ============================================

/**
 * Pattern signature for verification
 */
export interface PatternSignature {
  /** Pattern ID */
  patternId: string;

  /** Content hash */
  contentHash: string;

  /** Signer public key */
  signerPublicKey: string;

  /** Signer agent ID */
  signerId: string;

  /** Base64-encoded signature */
  signature: string;

  /** Signature timestamp */
  signedAt: string;
}

/**
 * Bandwidth configuration for sync
 */
export interface BandwidthConfig {
  /** Maximum bytes per second for uploads */
  maxUploadBps: number;

  /** Maximum bytes per second for downloads */
  maxDownloadBps: number;

  /** Maximum concurrent transfers */
  maxConcurrent: number;

  /** Batch size for sync */
  batchSize: number;

  /** Delay between batches (ms) */
  batchDelay: number;
}

/**
 * Rate limit configuration
 */
export interface SharingRateLimitConfig {
  /** Maximum broadcasts per minute */
  broadcastsPerMinute: number;

  /** Maximum sync requests per minute */
  syncRequestsPerMinute: number;

  /** Maximum patterns received per hour */
  patternsPerHour: number;

  /** Cooldown after rate limit (ms) */
  cooldownMs: number;
}

/**
 * Default sharing configuration
 */
export const DEFAULT_SHARING_CONFIG: PatternSharingConfig = {
  policy: SharingPolicy.PUBLIC,
  privacyLevel: PrivacyLevel.ANONYMIZED,
  differentialPrivacy: false,
  redistributable: true,
  requireAttribution: false,
};

/**
 * Default anonymization configuration
 */
export const DEFAULT_ANONYMIZATION_CONFIG: AnonymizationConfig = {
  replaceIdentifiers: true,
  replaceStrings: true,
  replaceNumbers: false,
  replaceFilePaths: true,
  removeComments: false,
  preserveStructure: true,
};

/**
 * Default bandwidth configuration
 */
export const DEFAULT_BANDWIDTH_CONFIG: BandwidthConfig = {
  maxUploadBps: 1048576, // 1 MB/s
  maxDownloadBps: 2097152, // 2 MB/s
  maxConcurrent: 5,
  batchSize: 10,
  batchDelay: 100,
};

/**
 * Default rate limit configuration
 */
export const DEFAULT_RATE_LIMIT_CONFIG: SharingRateLimitConfig = {
  broadcastsPerMinute: 30,
  syncRequestsPerMinute: 10,
  patternsPerHour: 1000,
  cooldownMs: 60000,
};

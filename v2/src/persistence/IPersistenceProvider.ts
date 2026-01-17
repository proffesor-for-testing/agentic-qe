/**
 * Persistence Provider Interface
 *
 * Unified interface for persistence backends (SQLite, Supabase, Hybrid).
 * Supports learning experiences, test patterns, and nervous system state.
 *
 * @module persistence/IPersistenceProvider
 */

// Note: StoredPattern is defined standalone below rather than extending TestPattern
// to avoid circular dependencies with the various TestPattern definitions in the codebase

// ============================================
// Privacy and Sharing Types
// ============================================

/**
 * Privacy levels for shared data
 */
export type PrivacyLevel = 'private' | 'team' | 'public';

/**
 * Configuration for sharing experiences
 */
export interface SharingConfig {
  /** Default privacy level for new experiences */
  defaultPrivacyLevel: PrivacyLevel;
  /** Auto-share successful patterns */
  autoShare: boolean;
  /** Auto-import high-quality public patterns */
  autoImport: boolean;
}

// ============================================
// Learning Experience Types
// ============================================

/**
 * Outcome type for learning experiences
 */
export type LearningOutcome = 'success' | 'failure' | 'partial' | 'unknown';

/**
 * A learning experience captured by an agent
 */
export interface LearningExperience {
  /** Unique identifier */
  id: string;
  /** Agent that created this experience */
  agentId: string;
  /** Agent type (e.g., 'test-generator', 'coverage-analyzer') */
  agentType: string;
  /** Task type (e.g., 'unit-test-generation', 'flaky-detection') */
  taskType: string;

  /** Context in which the experience occurred */
  context: {
    /** Source code or file being analyzed */
    sourceFile?: string;
    /** Framework being used */
    framework?: string;
    /** Language */
    language?: string;
    /** Additional context fields */
    [key: string]: unknown;
  };

  /** Outcome of the experience */
  outcome: {
    /** Overall result */
    result: LearningOutcome;
    /** Confidence score (0-1) */
    confidence: number;
    /** Detailed metrics */
    metrics?: Record<string, number>;
    /** Error message if failed */
    errorMessage?: string;
    /** Additional outcome fields */
    [key: string]: unknown;
  };

  /** Embedding vector for similarity search (optional) */
  embedding?: number[];

  /** Privacy level */
  privacyLevel: PrivacyLevel;
  /** Whether data has been anonymized */
  isAnonymized: boolean;
  /** Number of times this has been shared */
  shareCount: number;

  /** When this experience was created */
  createdAt: Date;
  /** Who created this experience (user ID) */
  createdBy?: string;
}

/**
 * Query options for experiences
 */
export interface ExperienceQuery {
  /** Filter by agent ID */
  agentId?: string;
  /** Filter by agent type */
  agentType?: string;
  /** Filter by task type */
  taskType?: string;
  /** Filter by outcome result */
  outcome?: LearningOutcome;
  /** Filter by privacy level */
  privacyLevel?: PrivacyLevel;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Date range start */
  startDate?: Date;
  /** Date range end */
  endDate?: Date;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Query for shared experiences (cloud only)
 */
export interface SharedExperienceQuery extends ExperienceQuery {
  /** Include team experiences */
  includeTeam?: boolean;
  /** Include public experiences */
  includePublic?: boolean;
  /** Minimum quality score */
  minQuality?: number;
}

// ============================================
// Pattern Types
// ============================================

/**
 * Query options for patterns
 */
export interface PatternQuery {
  /** Filter by pattern type */
  type?: string;
  /** Filter by domain */
  domain?: string;
  /** Filter by framework */
  framework?: string;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Privacy level filter */
  privacyLevel?: PrivacyLevel;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Stored test pattern with metadata
 * Standalone interface (not extending TestPattern to avoid circular deps)
 */
export interface StoredPattern {
  /** Unique identifier */
  id: string;
  /** Pattern type (e.g., 'edge-case', 'boundary-condition') */
  type: string;
  /** Pattern domain (e.g., 'unit-test', 'integration-test') */
  domain?: string;
  /** Pattern content (the actual code/template) */
  content?: string;
  /** Pattern name for display */
  name?: string;
  /** Pattern description */
  description?: string;
  /** Testing framework (e.g., 'jest', 'vitest', 'mocha') */
  framework?: string;
  /** Project/tenant ID */
  projectId?: string;
  /** Embedding vector for similarity search */
  embedding?: number[];
  /** Confidence score (0-1) */
  confidence: number;
  /** Number of times this pattern has been used */
  usageCount: number;
  /** Last time this pattern was used */
  lastUsed?: Date;
  /** Verdict on pattern quality */
  verdict?: string;
  /** Privacy level */
  privacyLevel: PrivacyLevel;
  /** Whether data has been anonymized */
  isAnonymized: boolean;
  /** Hash for deduplication */
  sourceHash?: string;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** When pattern was created */
  createdAt: Date;
}

// ============================================
// Memory Entry Types (SwarmMemory sync)
// ============================================

/**
 * Access level for memory entries
 */
export type MemoryAccessLevel = 'owner' | 'team' | 'swarm' | 'public';

/**
 * A memory entry stored by agents
 */
export interface MemoryEntry {
  /** Unique key */
  key: string;
  /** Serialized value (JSON string) */
  value: string;
  /** Partition/namespace */
  partition: string;
  /** Owner agent/user ID */
  owner: string;
  /** Access level */
  accessLevel: MemoryAccessLevel;
  /** Team ID for team access */
  teamId?: string;
  /** Swarm ID for swarm access */
  swarmId?: string;
  /** Creation timestamp */
  createdAt: Date;
  /** Expiration timestamp (null = never) */
  expiresAt?: Date | null;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Query options for memory entries
 */
export interface MemoryQuery {
  /** Filter by partition */
  partition?: string;
  /** Filter by owner */
  owner?: string;
  /** Filter by key pattern (supports wildcards) */
  keyPattern?: string;
  /** Filter by access level */
  accessLevel?: MemoryAccessLevel;
  /** Include expired entries */
  includeExpired?: boolean;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ============================================
// Event Types (Telemetry sync)
// ============================================

/**
 * An event record for telemetry
 */
export interface EventRecord {
  /** Unique event ID */
  id: string;
  /** Event type (e.g., 'test_generated', 'coverage_analyzed') */
  type: string;
  /** Event payload (JSON serialized) */
  payload: Record<string, unknown>;
  /** Source agent/component */
  source: string;
  /** Timestamp */
  timestamp: Date;
  /** Time-to-live in seconds (0 = forever) */
  ttl: number;
}

/**
 * Query options for events
 */
export interface EventQuery {
  /** Filter by event type */
  type?: string;
  /** Filter by source */
  source?: string;
  /** Start time range */
  startTime?: Date;
  /** End time range */
  endTime?: Date;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ============================================
// Code Intelligence Types (Code chunks sync)
// ============================================

/**
 * Programming language for code chunks
 */
export type CodeLanguage = 'typescript' | 'javascript' | 'python' | 'java' | 'go' | 'rust' | 'other';

/**
 * Type of code chunk
 */
export type CodeChunkType = 'function' | 'class' | 'method' | 'interface' | 'type' | 'import' | 'export' | 'block';

/**
 * A code chunk with embedding for semantic search
 */
export interface CodeChunk {
  /** Unique chunk ID */
  id: string;
  /** Repository/project ID */
  projectId: string;
  /** File path relative to project root */
  filePath: string;
  /** Start line (1-indexed) */
  startLine: number;
  /** End line (1-indexed) */
  endLine: number;
  /** Chunk type */
  chunkType: CodeChunkType;
  /** Entity name (function name, class name, etc.) */
  name?: string;
  /** Full content of the chunk */
  content: string;
  /** Programming language */
  language: CodeLanguage;
  /** Embedding vector for semantic search */
  embedding?: number[];
  /** AST-derived metadata */
  metadata?: {
    /** Parent entity (e.g., class for method) */
    parent?: string;
    /** Exported symbols */
    exports?: string[];
    /** Imported symbols */
    imports?: string[];
    /** Complexity metrics */
    complexity?: number;
    /** Additional fields */
    [key: string]: unknown;
  };
  /** Last indexed timestamp */
  indexedAt: Date;
  /** Git commit SHA when indexed */
  commitSha?: string;
}

/**
 * Query options for code chunks
 */
export interface CodeChunkQuery {
  /** Filter by project */
  projectId?: string;
  /** Filter by file path pattern */
  filePattern?: string;
  /** Filter by chunk type */
  chunkType?: CodeChunkType;
  /** Filter by language */
  language?: CodeLanguage;
  /** Filter by name pattern */
  namePattern?: string;
  /** Maximum results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Code search result with similarity score
 */
export interface CodeSearchResult {
  /** The matching code chunk */
  chunk: CodeChunk;
  /** Similarity score (0-1) */
  score: number;
}

// ============================================
// Nervous System State Types
// ============================================

/**
 * Component types for nervous system state
 */
export type NervousSystemComponent = 'hdc' | 'btsp' | 'circadian' | 'workspace';

/**
 * Nervous system state wrapper
 */
export interface NervousSystemStateRecord {
  /** Agent ID this state belongs to */
  agentId: string;
  /** Component type */
  component: NervousSystemComponent;
  /** Binary state data (for HDC, BTSP) */
  stateData?: Uint8Array;
  /** JSON state data (for Circadian) */
  stateJson?: Record<string, unknown>;
  /** Schema version */
  version: number;
  /** When state was saved */
  updatedAt: Date;
}

// ============================================
// Provider Info Types
// ============================================

/**
 * Provider type
 */
export type ProviderType = 'sqlite' | 'supabase' | 'hybrid';

/**
 * Information about a persistence provider
 */
export interface ProviderInfo {
  /** Provider type */
  type: ProviderType;
  /** Supported features */
  features: string[];
  /** Whether the provider is initialized */
  initialized: boolean;
  /** Database location (path or URL) */
  location?: string;
  /** Additional statistics */
  stats?: {
    experienceCount?: number;
    patternCount?: number;
    agentCount?: number;
    lastSyncTime?: Date;
  };
}

// ============================================
// Main Interface
// ============================================

/**
 * Unified persistence provider interface
 *
 * Implementations:
 * - SQLitePersistenceProvider: Local SQLite database
 * - SupabasePersistenceProvider: Cloud PostgreSQL with RuVector
 * - HybridPersistenceProvider: Local-first with cloud sync
 */
export interface IPersistenceProvider {
  // ============================================
  // Lifecycle
  // ============================================

  /**
   * Initialize the provider
   * Connects to database and creates tables if needed
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the provider
   * Flushes pending writes and closes connections
   */
  shutdown(): Promise<void>;

  // ============================================
  // Learning Experiences
  // ============================================

  /**
   * Store a learning experience
   * @param experience The experience to store
   */
  storeExperience(experience: LearningExperience): Promise<void>;

  /**
   * Query learning experiences
   * @param query Query parameters
   * @returns Matching experiences
   */
  queryExperiences(query: ExperienceQuery): Promise<LearningExperience[]>;

  /**
   * Search for similar experiences using vector similarity
   * @param embedding Query embedding vector
   * @param limit Maximum results
   * @returns Similar experiences sorted by similarity
   */
  searchSimilarExperiences(embedding: number[], limit: number): Promise<LearningExperience[]>;

  // ============================================
  // Patterns
  // ============================================

  /**
   * Store a test pattern
   * @param pattern The pattern to store
   */
  storePattern(pattern: StoredPattern): Promise<void>;

  /**
   * Query stored patterns
   * @param query Query parameters
   * @returns Matching patterns
   */
  queryPatterns(query: PatternQuery): Promise<StoredPattern[]>;

  /**
   * Search for similar patterns using vector similarity
   * @param embedding Query embedding vector
   * @param limit Maximum results
   * @returns Similar patterns sorted by similarity
   */
  searchSimilarPatterns(embedding: number[], limit: number): Promise<StoredPattern[]>;

  // ============================================
  // Nervous System State
  // ============================================

  /**
   * Save nervous system component state
   * @param agentId Agent identifier
   * @param component Component type
   * @param state Binary or JSON state data
   */
  saveNervousSystemState(
    agentId: string,
    component: NervousSystemComponent,
    state: Uint8Array | Record<string, unknown>
  ): Promise<void>;

  /**
   * Load nervous system component state
   * @param agentId Agent identifier
   * @param component Component type
   * @returns State data or null if not found
   */
  loadNervousSystemState(
    agentId: string,
    component: NervousSystemComponent
  ): Promise<Uint8Array | Record<string, unknown> | null>;

  /**
   * Delete all nervous system state for an agent
   * @param agentId Agent identifier
   */
  deleteNervousSystemState(agentId: string): Promise<void>;

  /**
   * List agents with stored nervous system state
   * @returns Array of agent IDs
   */
  listAgentsWithState(): Promise<string[]>;

  // ============================================
  // Memory Entries (Optional - for full sync)
  // ============================================

  /**
   * Store a memory entry
   * @param entry Memory entry to store
   */
  storeMemoryEntry?(entry: MemoryEntry): Promise<void>;

  /**
   * Store multiple memory entries in batch
   * @param entries Memory entries to store
   */
  storeMemoryEntries?(entries: MemoryEntry[]): Promise<void>;

  /**
   * Retrieve a memory entry by key
   * @param key Entry key
   * @param partition Optional partition
   * @returns Memory entry or null
   */
  getMemoryEntry?(key: string, partition?: string): Promise<MemoryEntry | null>;

  /**
   * Query memory entries
   * @param query Query parameters
   * @returns Matching entries
   */
  queryMemoryEntries?(query: MemoryQuery): Promise<MemoryEntry[]>;

  /**
   * Delete memory entries by key pattern
   * @param keyPattern Key pattern (supports wildcards)
   * @param partition Optional partition filter
   * @returns Number of deleted entries
   */
  deleteMemoryEntries?(keyPattern: string, partition?: string): Promise<number>;

  // ============================================
  // Events (Optional - for telemetry sync)
  // ============================================

  /**
   * Store an event record
   * @param event Event to store
   */
  storeEvent?(event: EventRecord): Promise<void>;

  /**
   * Store multiple events in batch
   * @param events Events to store
   */
  storeEvents?(events: EventRecord[]): Promise<void>;

  /**
   * Query events
   * @param query Query parameters
   * @returns Matching events
   */
  queryEvents?(query: EventQuery): Promise<EventRecord[]>;

  /**
   * Delete old events
   * @param olderThan Delete events older than this date
   * @returns Number of deleted events
   */
  deleteOldEvents?(olderThan: Date): Promise<number>;

  // ============================================
  // Code Intelligence (Optional - for code sync)
  // ============================================

  /**
   * Store a code chunk
   * @param chunk Code chunk to store
   */
  storeCodeChunk?(chunk: CodeChunk): Promise<void>;

  /**
   * Store multiple code chunks in batch
   * @param chunks Code chunks to store
   */
  storeCodeChunks?(chunks: CodeChunk[]): Promise<void>;

  /**
   * Query code chunks
   * @param query Query parameters
   * @returns Matching chunks
   */
  queryCodeChunks?(query: CodeChunkQuery): Promise<CodeChunk[]>;

  /**
   * Search for similar code using vector similarity
   * @param embedding Query embedding vector
   * @param options Search options
   * @returns Similar code chunks with scores
   */
  searchSimilarCode?(embedding: number[], options?: {
    limit?: number;
    minScore?: number;
    projectId?: string;
    language?: CodeLanguage;
  }): Promise<CodeSearchResult[]>;

  /**
   * Delete code chunks for a file
   * @param projectId Project ID
   * @param filePath File path
   * @returns Number of deleted chunks
   */
  deleteCodeChunksForFile?(projectId: string, filePath: string): Promise<number>;

  /**
   * Delete all code chunks for a project
   * @param projectId Project ID
   * @returns Number of deleted chunks
   */
  deleteCodeChunksForProject?(projectId: string): Promise<number>;

  // ============================================
  // Sharing (Cloud Only - Optional)
  // ============================================

  /**
   * Share an experience with a specific privacy level
   * Only available on cloud providers
   * @param experienceId Experience to share
   * @param privacyLevel New privacy level
   */
  shareExperience?(experienceId: string, privacyLevel: PrivacyLevel): Promise<void>;

  /**
   * Import shared experiences from other users/projects
   * Only available on cloud providers
   * @param query Query for shared experiences
   * @returns Imported experiences
   */
  importSharedExperiences?(query: SharedExperienceQuery): Promise<LearningExperience[]>;

  /**
   * Share a pattern with a specific privacy level
   * Only available on cloud providers
   * @param patternId Pattern to share
   * @param privacyLevel New privacy level
   */
  sharePattern?(patternId: string, privacyLevel: PrivacyLevel): Promise<void>;

  /**
   * Import shared patterns from other users/projects
   * Only available on cloud providers
   * @param query Query for shared patterns
   * @returns Imported patterns
   */
  importSharedPatterns?(query: PatternQuery & { includePublic?: boolean }): Promise<StoredPattern[]>;

  // ============================================
  // Sync (Hybrid Only - Optional)
  // ============================================

  /**
   * Sync local data to cloud
   * Only available on hybrid provider
   */
  syncToCloud?(): Promise<{ uploaded: number; conflicts: number }>;

  /**
   * Sync cloud data to local
   * Only available on hybrid provider
   */
  syncFromCloud?(): Promise<{ downloaded: number; conflicts: number }>;

  /**
   * Get sync status
   * Only available on hybrid provider
   */
  getSyncStatus?(): Promise<{
    lastSyncTime: Date | null;
    pendingUploads: number;
    pendingDownloads: number;
    conflicts: number;
  }>;

  // ============================================
  // Info
  // ============================================

  /**
   * Get provider information and capabilities
   * @returns Provider info including type and features
   */
  getProviderInfo(): ProviderInfo;
}

// ============================================
// Factory Types
// ============================================

/**
 * Configuration for creating a persistence provider
 */
export interface PersistenceProviderConfig {
  /** Provider type to create */
  type: ProviderType;

  /** SQLite-specific config */
  sqlite?: {
    /** Database file path (use ':memory:' for in-memory) */
    dbPath: string;
    /** WAL mode for better concurrency */
    walMode?: boolean;
  };

  /** Supabase-specific config */
  supabase?: {
    /** Supabase project URL */
    url: string;
    /** Supabase anon key */
    anonKey: string;
    /** Service role key for admin operations */
    serviceRoleKey?: string;
    /** Project ID (auto-created if not specified) */
    projectId?: string;
  };

  /** Hybrid-specific config */
  hybrid?: {
    /** Local SQLite path */
    localDbPath: string;
    /** Supabase URL for cloud sync */
    supabaseUrl: string;
    /** Supabase anon key */
    supabaseAnonKey: string;
    /** Sync interval in ms (default: 60000) */
    syncInterval?: number;
    /** Conflict resolution strategy */
    conflictResolution?: 'local' | 'remote' | 'newest';
  };

  /** Sharing configuration */
  sharing?: SharingConfig;
}

/**
 * Factory function type for creating providers
 */
export type PersistenceProviderFactory = (config: PersistenceProviderConfig) => IPersistenceProvider;

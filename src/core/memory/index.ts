/**
 * Memory Management for Agentic QE Fleet
 *
 * Provides persistent storage and retrieval for agent coordination
 * with 5-level access control system
 *
 * @version 2.0.0 - Explicit adapter configuration with fail-fast validation
 */

export { SwarmMemoryManager } from './SwarmMemoryManager';
export type { MemoryEntry, StoreOptions, RetrieveOptions, DeleteOptions, Hint } from './SwarmMemoryManager';

// Access Control System
export {
  AccessControl,
  AccessLevel,
  Permission,
  AccessControlError
} from './AccessControl';
export type {
  ACL,
  PermissionCheckParams,
  ACLPermissionCheckParams,
  PermissionCheckResult,
  CreateACLParams,
  UpdateACLParams
} from './AccessControl';

// Adapter Configuration (v2.0.0)
export {
  AdapterType,
  AdapterConfigValidator,
  AdapterConfigHelper,
  AdapterConfigurationError
} from './AdapterConfig';
export type {
  AdapterConfig,
  ValidationResult
} from './AdapterConfig';

// Adapter Factory (v2.0.0)
export {
  AdapterFactory
} from './AdapterFactory';
export type {
  IAdapter,
  AdapterCreationResult
} from './AdapterFactory';

// AgentDB Integration (Optional - for distributed coordination)
export {
  AgentDBManager,
  createAgentDBManager
} from './AgentDBManager';
export type {
  AgentDBConfig,
  MemoryPattern,
  RetrievalOptions,
  RetrievalResult,
  TrainingOptions,
  TrainingMetrics
} from './AgentDBManager';

// AgentDB QUIC Integration
export {
  QUICTransportWrapper,
  createDefaultQUICConfig,
  initializeAgentDBWithQUIC
} from './AgentDBIntegration';

// AgentDBService - Production-ready vector database wrapper (v2.0.0)
// Updated for agentdb@1.6.1 with WASMVectorSearch and HNSWIndex
export { AgentDBService, createAgentDBService } from './AgentDBService';
export type {
  QEPattern,
  AgentDBServiceConfig,
  PatternSearchOptions,
  BatchResult,
  PatternSearchResult
} from './AgentDBService';

// Memory Manager Factory - Singleton pattern for shared database connection
// Prevents data fragmentation where data written by one component isn't visible to others
export {
  getSharedMemoryManager,
  initializeSharedMemoryManager,
  resetSharedMemoryManager,
  hasSharedMemoryManager,
  getSharedMemoryManagerPath,
  resolveDbPath,
  ensureDbDirectoryExists,
  getDbPathInfo
} from './MemoryManagerFactory';

// =============================================================================
// RuVector Integration (v2.0.0)
// High-performance vector database with 192K QPS, 1.5µs p50 latency
// =============================================================================

// Unified Pattern Store Interface
export type {
  IPatternStore,
  IPatternStoreWithEvents,
  TestPattern as ITestPattern,
  PatternSearchOptions as IPatternSearchOptions,
  PatternSearchResult as IPatternSearchResult,
  PatternStoreStats,
  PatternStoreConfig,
  PatternStoreEvent,
  VectorEntry,
  SearchQuery,
  SearchResult,
} from './IPatternStore';

// RuVector Pattern Store Implementation
export {
  RuVectorPatternStore,
  isRuVectorAvailable,
  getRuVectorInfo,
  createQEPatternStore,
  createHighPerformancePatternStore,
} from './RuVectorPatternStore';
export type {
  RuVectorConfig,
  TestPattern as RuVectorTestPattern,
  PatternSearchOptions as RuVectorSearchOptions,
  PatternSearchResult as RuVectorSearchResult,
} from './RuVectorPatternStore';

// Pattern Store Factory
export {
  PatternStoreFactory,
  createPatternStore,
  createHighPerformanceStore,
  createPatternStoreFromEnv,
} from './PatternStoreFactory';
export type {
  PatternStoreFactoryConfig,
  PatternStoreFactoryResult,
  PlatformFeatures,
} from './PatternStoreFactory';

// =============================================================================
// Migration Tools (v2.0.0)
// AgentDB to RuVector migration with dual-write support
// =============================================================================
export {
  PatternMigrator,
  DualWriteProxy,
  createDualWriteProxy,
  checkMigrationStatus,
} from './MigrationTools';
export type {
  MigrationOptions,
  MigrationResult,
} from './MigrationTools';

// =============================================================================
// Neural Enhancement Layer (v2.0.0)
// Multi-head attention, GNN, and RL-based navigation
// =============================================================================
export {
  NeuralEnhancementLayer,
  NeuralPatternStore,
} from './NeuralEnhancement';
export type {
  NeuralConfig,
  EnhancedSearchOptions,
  AttentionOutput,
  TrainingFeedback,
  TrainingMetrics as NeuralTrainingMetrics,
} from './NeuralEnhancement';

// =============================================================================
// Self-Healing Monitor (v2.0.0)
// Automatic performance monitoring and recovery
// =============================================================================
export {
  SelfHealingMonitor,
} from './SelfHealingMonitor';
export type {
  HealthMetrics,
  MonitorConfig,
  HealingAction,
} from './SelfHealingMonitor';

// =============================================================================
// Unified Memory Coordinator (v1.0.0)
// Single interface for all memory systems with automatic fallback
// =============================================================================
export {
  UnifiedMemoryCoordinator,
  NamespacedCoordinator,
  createUnifiedMemoryCoordinator,
} from './UnifiedMemoryCoordinator';
export type {
  MemoryConfig,
  MemoryHealth,
  SyncResult,
  MemoryBackend,
  SearchOptions,
  SearchResult as UnifiedSearchResult,
  VectorSearchResult as UnifiedVectorSearchResult,
  Pattern as UnifiedPattern,
  PatternFilter as UnifiedPatternFilter,
  MemoryMetrics,
} from './UnifiedMemoryCoordinator';

// =============================================================================
// QUIC Transport Layer (v2.0.0)
// High-performance QUIC via Rust/WASM with WebSocket fallback
// =============================================================================
export {
  loadQuicTransport,
  isQuicAvailable,
  getTransportCapabilities,
  WebSocketFallbackTransport,
} from '../transport';
export type {
  Transport,
  TransportCapabilities,
  QuicTransport,
  QuicTransportConfig,
  AgentMessage,
  PoolStatistics,
} from '../transport';

// =============================================================================
// Tiered Compression (v2.0.0)
// Adaptive tiered compression for 2-32x memory reduction
// =============================================================================
export {
  TieredCompressionManager,
  ProductQuantizer,
  encodeF16,
  decodeF16,
  encodeBinary,
  decodeBinary,
  DEFAULT_TIERS,
} from './TieredCompression';
export type {
  CompressionTier,
  TierConfig,
  CompressedVector,
} from './TieredCompression';

// =============================================================================
// ReflexionMemory Adapter (v2.1.0) - Issue #109
// Learn from test failures to predict and prevent flakiness
// =============================================================================
export {
  ReflexionMemoryAdapter,
  createReflexionMemoryAdapter,
} from './ReflexionMemoryAdapter';
export type {
  TestExecution,
  ReflexionEpisode,
  FlakinessPrediction,
} from './ReflexionMemoryAdapter';

// =============================================================================
// Sparse Vector Search (v2.1.0) - Issue #109
// BM25/TF-IDF hybrid search for improved pattern retrieval
// =============================================================================
export {
  BM25Scorer,
  HybridSearcher,
  reciprocalRankFusion,
} from './SparseVectorSearch';
export type {
  SparseVector,
  BM25Config,
  HybridResult,
} from './SparseVectorSearch';

// =============================================================================
// HNSW Vector Memory (v2.2.0) - Issue #118
// Hierarchical Navigable Small World indexing for efficient pattern matching
// =============================================================================
export {
  HNSWVectorMemory,
  createHNSWVectorMemory,
  createHighPrecisionHNSW,
  createHighThroughputHNSW,
  createBalancedHNSW,
} from './HNSWVectorMemory';
export type {
  HNSWConfig,
  HNSWVectorMemoryConfig,
  SearchMetrics,
  MaintenanceStats,
  BatchResult as HNSWBatchResult,
} from './HNSWVectorMemory';

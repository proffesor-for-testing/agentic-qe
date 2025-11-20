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

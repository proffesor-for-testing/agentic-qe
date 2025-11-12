/**
 * Memory Management for Agentic QE Fleet
 *
 * Provides persistent storage and retrieval for agent coordination
 * with 5-level access control system
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

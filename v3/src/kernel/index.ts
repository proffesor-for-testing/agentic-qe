/**
 * Agentic QE v3 - Kernel Exports
 */

// Interfaces
export * from './interfaces';

// Implementations
export { InMemoryEventBus } from './event-bus';
export { DefaultAgentCoordinator } from './agent-coordinator';
export { DefaultPluginLoader } from './plugin-loader';
export { InMemoryBackend } from './memory-backend';
export { QEKernelImpl, createKernel } from './kernel';

// Memory Backends (unified into HybridMemoryBackend via UnifiedMemoryManager)
export { HybridMemoryBackend } from './hybrid-backend';
export type { HybridBackendConfig, SQLiteConfig, AgentDBConfig } from './hybrid-backend';

// Memory Factory
export {
  createMemoryBackend,
  createDefaultMemoryBackend,
  selectBackendType,
  getRecommendedConfig,
} from './memory-factory';
export type { MemoryBackendType, MemoryBackendConfig, MemoryBackendResult } from './memory-factory';

// Unified Memory (Single memory.db - the source of truth)
export {
  UnifiedMemoryManager,
  getUnifiedMemory,
  initializeUnifiedMemory,
  resetUnifiedMemory,
  DEFAULT_UNIFIED_MEMORY_CONFIG,
} from './unified-memory';
export type { UnifiedMemoryConfig } from './unified-memory';

// Migration utilities
export {
  migrateToUnifiedMemory,
  migrationNeeded,
  getMigrationStatus,
} from './unified-memory-migration';
export type { MigrationResult, MigrationOptions } from './unified-memory-migration';

// Legacy persistence (for backward compatibility - delegates to UnifiedMemoryManager)
export {
  UnifiedPersistenceManager,
  getUnifiedPersistence,
  initializeUnifiedPersistence,
  resetUnifiedPersistence,
} from './unified-persistence';
export type { UnifiedPersistenceConfig } from './unified-persistence';

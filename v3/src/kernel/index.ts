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

// Memory Backends
export { AgentDBBackend } from './agentdb-backend';
export type { AgentDBConfig, HNSWConfig } from './agentdb-backend';
export { HybridMemoryBackend } from './hybrid-backend';
export type { HybridBackendConfig, SQLiteConfig } from './hybrid-backend';

// Memory Factory
export {
  createMemoryBackend,
  createDefaultMemoryBackend,
  selectBackendType,
  getRecommendedConfig,
} from './memory-factory';
export type { MemoryBackendType, MemoryBackendConfig, MemoryBackendResult } from './memory-factory';

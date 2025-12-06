/**
 * Core - Export all core classes
 */

export { FleetManager } from './FleetManager';
export { Agent, AgentStatus } from './Agent';
export { Task, TaskStatus, TaskPriority } from './Task';
export { EventBus } from './EventBus';
export { MemoryManager } from './MemoryManager';
export { ArtifactWorkflow } from './ArtifactWorkflow';
export type { FleetStatus } from './FleetManager';
export type { AgentCapability, AgentMetrics } from './Agent';
export type { TaskMetadata, TaskRequirements } from './Task';
export type { FleetEvent } from './EventBus';
export type { MemoryOptions, MemorySearchOptions, MemoryStats } from './MemoryManager';
export type {
  ArtifactManifest,
  ArtifactCreateOptions,
  ArtifactVersionOptions,
  ArtifactQueryResult,
  ArtifactRetrievalResult
} from './ArtifactWorkflow';

// Dependency Injection
export {
  DIContainer,
  DependencyLifecycle,
  DependencyConfig,
  DIScope,
  getGlobalContainer,
  setGlobalContainer,
  resetGlobalContainer,
  DependencyNames,
  AgentDependencyConfig,
  IDIAgent,
  registerAgentDependencies,
  createAgentContainer,
  withDI
} from './di';
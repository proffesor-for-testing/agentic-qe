/**
 * Dependency Injection Module
 *
 * Provides DI container and agent dependency configuration for the AQE Fleet.
 *
 * @module core/di
 * @version 1.0.0
 */

export {
  DIContainer,
  DependencyLifecycle,
  DependencyConfig,
  DIScope,
  getGlobalContainer,
  setGlobalContainer,
  resetGlobalContainer
} from './DIContainer';

export {
  DependencyNames,
  AgentDependencyConfig,
  IDIAgent,
  registerAgentDependencies,
  createAgentContainer,
  withDI
} from './AgentDependencies';

/**
 * Agent Adapters - Bridge existing services to strategy interfaces
 *
 * These adapters provide backward compatibility during the B1.2 migration
 * from inline implementations to the strategy pattern.
 *
 * @module agents/adapters
 * @version 1.0.0
 */

export {
  LifecycleManagerAdapter,
  createLifecycleAdapter,
} from './LifecycleManagerAdapter';

export {
  MemoryServiceAdapter,
  createMemoryAdapter,
} from './MemoryServiceAdapter';

/**
 * Enhancements Index
 * Optional integrations for enhanced AQE capabilities
 */

import type { EnhancementRegistry as EnhancementRegistryType, EnhancementAdapter } from './types.js';

export type {
  EnhancementAdapter,
  ClaudeFlowAdapter,
  ClaudeFlowFeatures,
  RuVectorAdapter,
  EnhancementRegistry,
} from './types.js';

export { detectEnhancements } from './detector.js';
export { ClaudeFlowAdapterImpl, createClaudeFlowAdapter } from './claude-flow-adapter.js';

/**
 * Create an enhancement registry
 */
export function createEnhancementRegistry(): EnhancementRegistryType {
  const adapters = new Map<string, EnhancementAdapter>();

  return {
    adapters,

    isAvailable(name: string): boolean {
      return adapters.has(name);
    },

    get<T extends EnhancementAdapter>(name: string): T | undefined {
      return adapters.get(name) as T | undefined;
    },

    register(adapter: EnhancementAdapter): void {
      adapters.set(adapter.name, adapter);
    },
  };
}

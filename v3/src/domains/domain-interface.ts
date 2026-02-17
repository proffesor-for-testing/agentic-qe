/**
 * Agentic QE v3 - Domain Interface
 *
 * Re-exports BaseDomainPlugin and related types from shared/base-domain-plugin.
 * The base class was moved to shared/ to break the circular dependency between
 * coordination/ and domains/ modules.
 *
 * All existing imports from this file continue to work unchanged.
 */

export {
  BaseDomainPlugin,
  type TaskHandler,
  type DomainConsensusConfig,
  type DomainPluginIntegrationConfig,
} from '../shared/base-domain-plugin';

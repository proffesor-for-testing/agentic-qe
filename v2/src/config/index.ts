/**
 * Configuration Module - Multi-Provider LLM Configuration System
 *
 * Exports all configuration types, loaders, and utilities for managing
 * multiple LLM providers with YAML-based configuration and environment
 * variable support.
 *
 * @module config
 * @version 1.0.0
 */

// Core configuration types
export {
  TaskType,
  ProviderType,
  DeploymentMode,
  RateLimitConfig,
  CostConfig,
  ProviderConfig,
  CostBudgetConfig,
  MultiProviderConfig,
  ConfigValidationResult,
  DEFAULT_PROVIDER_CONFIGS,
  DEFAULT_MODE_CONFIGS,
} from './ProviderConfig';

// Configuration loader
export {
  ConfigLoadOptions,
  ConfigLoader,
  loadConfig,
  validateConfig,
} from './ConfigLoader';

/**
 * Example usage:
 *
 * ```typescript
 * import { loadConfig, MultiProviderConfig } from './config';
 *
 * // Load from default location (.aqe/providers.yaml)
 * const config = await loadConfig();
 *
 * // Load from specific file
 * const config = await loadConfig({
 *   configPath: './my-config.yaml',
 *   loadFromEnv: true,
 *   mergeDefaults: true,
 *   validate: true,
 * });
 *
 * // Access configuration
 * console.log('Mode:', config.mode);
 * console.log('Providers:', config.providers.map(p => p.type));
 * ```
 */

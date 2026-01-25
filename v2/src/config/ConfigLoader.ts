/**
 * Configuration Loader for Multi-Provider LLM System
 *
 * Loads and validates provider configurations from:
 * - YAML files (.aqe/providers.yaml)
 * - Environment variables
 * - Programmatic configuration objects
 *
 * Supports environment variable interpolation and schema validation.
 *
 * @module config/ConfigLoader
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { Logger } from '../utils/Logger';
import {
  MultiProviderConfig,
  ProviderConfig,
  ProviderType,
  DeploymentMode,
  ConfigValidationResult,
  DEFAULT_PROVIDER_CONFIGS,
  DEFAULT_MODE_CONFIGS,
} from './ProviderConfig';

/**
 * Configuration source options
 */
export interface ConfigLoadOptions {
  /** Path to YAML config file */
  configPath?: string;
  /** Base directory for resolving relative paths */
  baseDir?: string;
  /** Whether to load from environment variables */
  loadFromEnv?: boolean;
  /** Whether to merge with defaults */
  mergeDefaults?: boolean;
  /** Whether to validate the configuration */
  validate?: boolean;
  /** Whether to interpolate environment variables */
  interpolateEnv?: boolean;
}

/**
 * Environment variable mapping for providers
 */
const ENV_VAR_MAPPING: Record<string, string> = {
  'ANTHROPIC_API_KEY': 'claude.apiKey',
  'OPENROUTER_API_KEY': 'openrouter.apiKey',
  'GROQ_API_KEY': 'groq.apiKey',
  'GOOGLE_API_KEY': 'google.apiKey',
  'TOGETHER_API_KEY': 'together.apiKey',
  'GITHUB_TOKEN': 'github.apiKey',
  'OLLAMA_HOST': 'ollama.baseUrl',
  'RUVLLM_HOST': 'ruvllm.baseUrl',
  'LLM_PROVIDER': 'defaultProvider',
  'LLM_MODE': 'mode',
};

/**
 * Configuration loader class
 */
export class ConfigLoader {
  private logger: Logger;
  private baseDir: string;

  constructor(baseDir?: string) {
    this.logger = Logger.getInstance();
    this.baseDir = baseDir || process.cwd();
  }

  /**
   * Load configuration from various sources
   */
  async load(options: ConfigLoadOptions = {}): Promise<MultiProviderConfig> {
    const {
      configPath,
      loadFromEnv = true,
      mergeDefaults = true,
      validate = true,
      interpolateEnv = true,
    } = options;

    let config: Partial<MultiProviderConfig> = {};

    // 1. Load from YAML file if provided
    if (configPath) {
      const yamlConfig = await this.loadFromYaml(configPath);
      config = this.deepMerge(config, yamlConfig);
    } else {
      // Try default locations
      const defaultPaths = [
        path.join(this.baseDir, '.aqe', 'providers.yaml'),
        path.join(this.baseDir, '.aqe', 'providers.yml'),
        path.join(this.baseDir, 'aqe.config.yaml'),
        path.join(this.baseDir, 'aqe.config.yml'),
      ];

      for (const defaultPath of defaultPaths) {
        if (fs.existsSync(defaultPath)) {
          this.logger.debug(`Loading config from: ${defaultPath}`);
          const yamlConfig = await this.loadFromYaml(defaultPath);
          config = this.deepMerge(config, yamlConfig);
          break;
        }
      }
    }

    // 2. Load from environment variables
    if (loadFromEnv) {
      const envConfig = this.loadFromEnvironment();
      config = this.deepMerge(config, envConfig);
    }

    // 3. Merge with defaults
    if (mergeDefaults) {
      config = this.mergeWithDefaults(config);
    }

    // 4. Interpolate environment variables
    if (interpolateEnv) {
      config = this.interpolateEnvironmentVariables(config);
    }

    // 5. Validate configuration
    const finalConfig = config as MultiProviderConfig;

    if (validate) {
      const validation = this.validate(finalConfig);

      if (!validation.valid) {
        throw new Error(
          `Configuration validation failed:\n${validation.errors.join('\n')}`
        );
      }

      if (validation.warnings.length > 0) {
        this.logger.warn('Configuration warnings:', validation.warnings);
      }
    }

    return finalConfig;
  }

  /**
   * Load configuration from YAML file
   */
  private async loadFromYaml(configPath: string): Promise<Partial<MultiProviderConfig>> {
    try {
      const absolutePath = path.isAbsolute(configPath)
        ? configPath
        : path.join(this.baseDir, configPath);

      if (!fs.existsSync(absolutePath)) {
        throw new Error(`Configuration file not found: ${absolutePath}`);
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      const config = yaml.parse(content);

      this.logger.info(`Loaded configuration from: ${absolutePath}`);
      return config;

    } catch (error) {
      this.logger.error('Failed to load YAML configuration', { error });
      throw error;
    }
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): Partial<MultiProviderConfig> {
    const config: Partial<MultiProviderConfig> = {
      providers: [],
    };

    // Map environment variables to config
    for (const [envVar, configPath] of Object.entries(ENV_VAR_MAPPING)) {
      const value = process.env[envVar];
      if (value) {
        this.setNestedProperty(config, configPath, value);
      }
    }

    // Auto-detect and configure providers based on available API keys
    const providers: ProviderConfig[] = [];

    if (process.env.ANTHROPIC_API_KEY) {
      providers.push({
        ...DEFAULT_PROVIDER_CONFIGS.claude,
        apiKey: process.env.ANTHROPIC_API_KEY,
        enabled: true,
        priority: 10,
      } as ProviderConfig);
    }

    if (process.env.OPENROUTER_API_KEY) {
      providers.push({
        ...DEFAULT_PROVIDER_CONFIGS.openrouter,
        apiKey: process.env.OPENROUTER_API_KEY,
        enabled: true,
        priority: 20,
      } as ProviderConfig);
    }

    if (process.env.GROQ_API_KEY) {
      providers.push({
        ...DEFAULT_PROVIDER_CONFIGS.groq,
        apiKey: process.env.GROQ_API_KEY,
        enabled: true,
        priority: 30,
      } as ProviderConfig);
    }

    if (process.env.GOOGLE_API_KEY) {
      providers.push({
        ...DEFAULT_PROVIDER_CONFIGS.google,
        apiKey: process.env.GOOGLE_API_KEY,
        enabled: true,
        priority: 40,
      } as ProviderConfig);
    }

    if (providers.length > 0) {
      config.providers = providers;
    }

    // Set mode from environment
    const mode = process.env.LLM_MODE as DeploymentMode;
    if (mode) {
      config.mode = mode;
    }

    return config;
  }

  /**
   * Merge configuration with defaults
   */
  private mergeWithDefaults(config: Partial<MultiProviderConfig>): Partial<MultiProviderConfig> {
    // Get mode-specific defaults
    const mode = config.mode || 'hybrid';
    const modeDefaults = DEFAULT_MODE_CONFIGS[mode] || {};

    // Merge mode defaults
    let merged = this.deepMerge(modeDefaults, config);

    // Merge provider defaults
    if (merged.providers) {
      merged.providers = merged.providers.map((provider: ProviderConfig) => {
        const defaults = DEFAULT_PROVIDER_CONFIGS[provider.type as ProviderType];
        return this.deepMerge(defaults, provider) as ProviderConfig;
      });
    }

    return merged;
  }

  /**
   * Interpolate environment variables in configuration
   * Replaces ${ENV_VAR} with the value of ENV_VAR
   */
  private interpolateEnvironmentVariables(
    config: Partial<MultiProviderConfig>
  ): Partial<MultiProviderConfig> {
    const interpolate = (value: any): any => {
      if (typeof value === 'string') {
        // Match ${VAR_NAME} or $VAR_NAME
        return value.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, p1, p2) => {
          const varName = p1 || p2;
          const envValue = process.env[varName];

          if (envValue === undefined) {
            this.logger.warn(`Environment variable not found: ${varName}`);
            return match; // Keep original if not found
          }

          return envValue;
        });
      }

      if (Array.isArray(value)) {
        return value.map(interpolate);
      }

      if (value && typeof value === 'object') {
        const result: any = {};
        for (const [key, val] of Object.entries(value)) {
          result[key] = interpolate(val);
        }
        return result;
      }

      return value;
    };

    return interpolate(config);
  }

  /**
   * Validate configuration
   */
  validate(config: MultiProviderConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check mode
    if (!config.mode) {
      errors.push('Deployment mode is required');
    }

    const validModes: DeploymentMode[] = ['local_first', 'hosted', 'free_only', 'hybrid'];
    if (config.mode && !validModes.includes(config.mode)) {
      errors.push(`Invalid deployment mode: ${config.mode}`);
    }

    // Check providers
    if (!config.providers || config.providers.length === 0) {
      errors.push('At least one provider must be configured');
    }

    // Validate each provider
    config.providers?.forEach((provider, index) => {
      const prefix = `Provider ${index} (${provider.type})`;

      if (!provider.type) {
        errors.push(`${prefix}: type is required`);
      }

      if (!provider.defaultModel) {
        errors.push(`${prefix}: defaultModel is required`);
      }

      if (provider.enabled && !provider.apiKey && provider.type !== 'ollama' && provider.type !== 'ruvllm') {
        warnings.push(`${prefix}: apiKey is missing (may fail if not provided via environment)`);
      }

      if (provider.priority < 0) {
        warnings.push(`${prefix}: priority should be >= 0`);
      }

      // Validate fallback chain
      if (provider.fallbackProvider) {
        const fallbackExists = config.providers?.some(p => p.type === provider.fallbackProvider);
        if (!fallbackExists) {
          warnings.push(`${prefix}: fallback provider '${provider.fallbackProvider}' not found`);
        }
      }

      // Validate rate limits
      if (provider.limits) {
        if (provider.limits.requestsPerMinute && provider.limits.requestsPerMinute <= 0) {
          errors.push(`${prefix}: requestsPerMinute must be > 0`);
        }
        if (provider.limits.tokensPerMinute && provider.limits.tokensPerMinute <= 0) {
          errors.push(`${prefix}: tokensPerMinute must be > 0`);
        }
      }

      // Validate cost config
      if (provider.costPer1MTokens) {
        if (provider.costPer1MTokens.input < 0) {
          errors.push(`${prefix}: input cost cannot be negative`);
        }
        if (provider.costPer1MTokens.output < 0) {
          errors.push(`${prefix}: output cost cannot be negative`);
        }
      }
    });

    // Validate cost budget
    if (config.costBudget) {
      if (config.costBudget.daily && config.costBudget.daily <= 0) {
        errors.push('Daily cost budget must be > 0');
      }
      if (config.costBudget.monthly && config.costBudget.monthly <= 0) {
        errors.push('Monthly cost budget must be > 0');
      }
      if (config.costBudget.warnThreshold && (config.costBudget.warnThreshold <= 0 || config.costBudget.warnThreshold > 100)) {
        errors.push('Warn threshold must be between 0 and 100');
      }
    }

    // Validate fallback chain
    if (config.fallbackChain) {
      config.fallbackChain.forEach(providerName => {
        const exists = config.providers?.some(p => p.type === providerName);
        if (!exists) {
          warnings.push(`Fallback chain references unknown provider: ${providerName}`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    if (!source) return target;
    if (!target) return source;

    const result = { ...target };

    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Set nested property using dot notation
   * Includes comprehensive prototype pollution protection
   */
  private setNestedProperty(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;

    // Prototype pollution protection - reject dangerous property names
    const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
    for (const part of parts) {
      if (dangerousKeys.has(part)) {
        this.logger.warn(`Rejected potentially dangerous property path: ${path}`);
        return;
      }
    }

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      // CodeQL fix: Immediate dangerous key check before property access
      if (dangerousKeys.has(part)) {
        this.logger.warn(`Blocked prototype pollution: ${part}`);
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(current, part)) {
        // Create plain object using Object.defineProperty for safety
        const newObj = Object.create(null);
        Object.setPrototypeOf(newObj, Object.prototype);
        Object.defineProperty(current, part, {
          value: newObj,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      }
      current = current[part];
      // Ensure we haven't traversed to a built-in prototype
      if (current === Object.prototype || current === Array.prototype || current === Function.prototype) {
        this.logger.warn(`Rejected path that would modify built-in prototype: ${path}`);
        return;
      }
    }

    const finalKey = parts[parts.length - 1];
    // CodeQL fix: Immediate dangerous key check before Object.defineProperty
    if (dangerousKeys.has(finalKey)) {
      this.logger.warn(`Blocked prototype pollution: ${finalKey}`);
      return;
    }
    // Final safety check: ensure current is a valid target
    if (
      current !== null &&
      current !== undefined &&
      current !== Object.prototype &&
      current !== Array.prototype &&
      current !== Function.prototype &&
      typeof current === 'object'
    ) {
      // Use Object.defineProperty for safe assignment
      // CodeQL: False positive - finalKey validated against dangerousKeys Set above
      // lgtm[js/prototype-pollution-utility]
      Object.defineProperty(current, finalKey, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }

  /**
   * Save configuration to YAML file
   */
  async save(config: MultiProviderConfig, outputPath: string): Promise<void> {
    try {
      const absolutePath = path.isAbsolute(outputPath)
        ? outputPath
        : path.join(this.baseDir, outputPath);

      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const yamlContent = yaml.stringify(config);
      fs.writeFileSync(absolutePath, yamlContent, 'utf-8');

      this.logger.info(`Configuration saved to: ${absolutePath}`);

    } catch (error) {
      this.logger.error('Failed to save configuration', { error });
      throw error;
    }
  }
}

/**
 * Convenience function to load configuration
 */
export async function loadConfig(options?: ConfigLoadOptions): Promise<MultiProviderConfig> {
  const loader = new ConfigLoader(options?.baseDir);
  return loader.load(options);
}

/**
 * Convenience function to validate configuration
 */
export function validateConfig(config: MultiProviderConfig): ConfigValidationResult {
  const loader = new ConfigLoader();
  return loader.validate(config);
}

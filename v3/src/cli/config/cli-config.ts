/**
 * QE CLI Configuration System
 * ADR-041: CLI Configuration for Enhanced Developer Experience
 *
 * Provides configuration management for CLI interactive features:
 * - Wizards (init, test, coverage)
 * - Progress indicators (multi-bar, spinner)
 * - Shell completions
 * - Real-time streaming
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { safeJsonParse } from '../../shared/safe-json.js';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Wizard configuration for interactive CLI experiences
 */
export interface WizardConfig {
  /** Enable interactive wizard mode */
  enabled: boolean;
  /** Available themes for wizard display */
  themes: ('default' | 'minimal' | 'detailed')[];
  /** Default theme to use */
  defaultTheme: 'default' | 'minimal' | 'detailed';
}

/**
 * Progress indicator configuration
 */
export interface ProgressConfig {
  /** Style of progress display */
  style: 'multi-bar' | 'single-bar' | 'spinner';
  /** Update interval in milliseconds */
  updateIntervalMs: number;
  /** Show estimated time of arrival */
  showETA: boolean;
  /** Enable colored output */
  colors: boolean;
}

/**
 * Shell completion configuration
 */
export interface CompletionConfig {
  /** Maximum number of suggestions to show */
  maxSuggestions: number;
  /** Weight for history-based suggestions (0-1) */
  historyWeight: number;
  /** Weight for context-based suggestions (0-1) */
  contextWeight: number;
  /** Enable fuzzy matching */
  fuzzyMatch: boolean;
}

/**
 * Streaming output configuration
 */
export interface StreamingConfig {
  /** Enable real-time streaming */
  enabled: boolean;
  /** Buffer size for streaming output */
  bufferSize: number;
  /** Update interval in milliseconds */
  updateIntervalMs: number;
}

/**
 * Complete QE CLI configuration
 */
export interface QECLIConfig {
  /** Interactive wizard configuration */
  wizards: WizardConfig;
  /** Progress indicator configuration */
  progress: ProgressConfig;
  /** Shell completion configuration */
  completion: CompletionConfig;
  /** Streaming output configuration */
  streaming: StreamingConfig;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default CLI configuration values
 */
export const DEFAULT_CLI_CONFIG: QECLIConfig = {
  wizards: {
    enabled: true,
    themes: ['default', 'minimal', 'detailed'],
    defaultTheme: 'default',
  },
  progress: {
    style: 'multi-bar',
    updateIntervalMs: 100,
    showETA: true,
    colors: true,
  },
  completion: {
    maxSuggestions: 10,
    historyWeight: 0.3,
    contextWeight: 0.7,
    fuzzyMatch: true,
  },
  streaming: {
    enabled: true,
    bufferSize: 100,
    updateIntervalMs: 50,
  },
};

// ============================================================================
// Configuration Paths
// ============================================================================

/**
 * Get the configuration directory path
 */
export function getConfigDir(): string {
  return join(homedir(), '.aqe');
}

/**
 * Get the configuration file path
 */
export function getConfigPath(): string {
  return join(getConfigDir(), 'cli-config.json');
}

// ============================================================================
// Configuration Cache
// ============================================================================

let cachedConfig: QECLIConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 5000; // 5 seconds

/**
 * Check if cache is valid
 */
function isCacheValid(): boolean {
  if (!cachedConfig) return false;
  return Date.now() - cacheTimestamp < CACHE_TTL_MS;
}

/**
 * Invalidate the configuration cache
 */
export function invalidateCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation errors for configuration
 */
export interface ValidationError {
  path: string;
  message: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate wizard configuration
 */
function validateWizardConfig(config: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const wizards = config as Partial<WizardConfig>;

  if (typeof wizards.enabled !== 'boolean' && wizards.enabled !== undefined) {
    errors.push({ path: 'wizards.enabled', message: 'must be a boolean' });
  }

  if (wizards.themes !== undefined) {
    if (!Array.isArray(wizards.themes)) {
      errors.push({ path: 'wizards.themes', message: 'must be an array' });
    } else {
      const validThemes = ['default', 'minimal', 'detailed'];
      for (const theme of wizards.themes) {
        if (!validThemes.includes(theme)) {
          errors.push({ path: 'wizards.themes', message: `invalid theme: ${theme}` });
        }
      }
    }
  }

  if (wizards.defaultTheme !== undefined) {
    const validThemes = ['default', 'minimal', 'detailed'];
    if (!validThemes.includes(wizards.defaultTheme)) {
      errors.push({ path: 'wizards.defaultTheme', message: `invalid theme: ${wizards.defaultTheme}` });
    }
  }

  return errors;
}

/**
 * Validate progress configuration
 */
function validateProgressConfig(config: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const progress = config as Partial<ProgressConfig>;

  if (progress.style !== undefined) {
    const validStyles = ['multi-bar', 'single-bar', 'spinner'];
    if (!validStyles.includes(progress.style)) {
      errors.push({ path: 'progress.style', message: `invalid style: ${progress.style}` });
    }
  }

  if (progress.updateIntervalMs !== undefined) {
    if (typeof progress.updateIntervalMs !== 'number' || progress.updateIntervalMs < 10) {
      errors.push({ path: 'progress.updateIntervalMs', message: 'must be a number >= 10' });
    }
  }

  if (typeof progress.showETA !== 'boolean' && progress.showETA !== undefined) {
    errors.push({ path: 'progress.showETA', message: 'must be a boolean' });
  }

  if (typeof progress.colors !== 'boolean' && progress.colors !== undefined) {
    errors.push({ path: 'progress.colors', message: 'must be a boolean' });
  }

  return errors;
}

/**
 * Validate completion configuration
 */
function validateCompletionConfig(config: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const completion = config as Partial<CompletionConfig>;

  if (completion.maxSuggestions !== undefined) {
    if (typeof completion.maxSuggestions !== 'number' || completion.maxSuggestions < 1) {
      errors.push({ path: 'completion.maxSuggestions', message: 'must be a number >= 1' });
    }
  }

  if (completion.historyWeight !== undefined) {
    if (typeof completion.historyWeight !== 'number' || completion.historyWeight < 0 || completion.historyWeight > 1) {
      errors.push({ path: 'completion.historyWeight', message: 'must be a number between 0 and 1' });
    }
  }

  if (completion.contextWeight !== undefined) {
    if (typeof completion.contextWeight !== 'number' || completion.contextWeight < 0 || completion.contextWeight > 1) {
      errors.push({ path: 'completion.contextWeight', message: 'must be a number between 0 and 1' });
    }
  }

  if (typeof completion.fuzzyMatch !== 'boolean' && completion.fuzzyMatch !== undefined) {
    errors.push({ path: 'completion.fuzzyMatch', message: 'must be a boolean' });
  }

  return errors;
}

/**
 * Validate streaming configuration
 */
function validateStreamingConfig(config: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  const streaming = config as Partial<StreamingConfig>;

  if (typeof streaming.enabled !== 'boolean' && streaming.enabled !== undefined) {
    errors.push({ path: 'streaming.enabled', message: 'must be a boolean' });
  }

  if (streaming.bufferSize !== undefined) {
    if (typeof streaming.bufferSize !== 'number' || streaming.bufferSize < 1) {
      errors.push({ path: 'streaming.bufferSize', message: 'must be a number >= 1' });
    }
  }

  if (streaming.updateIntervalMs !== undefined) {
    if (typeof streaming.updateIntervalMs !== 'number' || streaming.updateIntervalMs < 10) {
      errors.push({ path: 'streaming.updateIntervalMs', message: 'must be a number >= 10' });
    }
  }

  return errors;
}

/**
 * Validate a configuration object
 */
export function validateConfig(config: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  if (typeof config !== 'object' || config === null) {
    return { valid: false, errors: [{ path: '', message: 'config must be an object' }] };
  }

  const cfg = config as Record<string, unknown>;

  if (cfg.wizards !== undefined) {
    if (typeof cfg.wizards !== 'object' || cfg.wizards === null) {
      errors.push({ path: 'wizards', message: 'must be an object' });
    } else {
      errors.push(...validateWizardConfig(cfg.wizards));
    }
  }

  if (cfg.progress !== undefined) {
    if (typeof cfg.progress !== 'object' || cfg.progress === null) {
      errors.push({ path: 'progress', message: 'must be an object' });
    } else {
      errors.push(...validateProgressConfig(cfg.progress));
    }
  }

  if (cfg.completion !== undefined) {
    if (typeof cfg.completion !== 'object' || cfg.completion === null) {
      errors.push({ path: 'completion', message: 'must be an object' });
    } else {
      errors.push(...validateCompletionConfig(cfg.completion));
    }
  }

  if (cfg.streaming !== undefined) {
    if (typeof cfg.streaming !== 'object' || cfg.streaming === null) {
      errors.push({ path: 'streaming', message: 'must be an object' });
    } else {
      errors.push(...validateStreamingConfig(cfg.streaming));
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Configuration Management Functions
// ============================================================================

/**
 * Keys that should never be merged (prototype pollution prevention)
 */
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

/**
 * Deep merge two objects
 * Security: Skips prototype pollution vectors (__proto__, constructor, prototype)
 */
function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as Array<keyof T>) {
    // Security: Prevent prototype pollution by skipping dangerous keys
    if (FORBIDDEN_KEYS.includes(key as string)) {
      console.warn(`Security: Skipping forbidden key '${String(key)}' in configuration merge`);
      continue;
    }

    const sourceValue = source[key];
    const targetValue = target[key];

    if (
      sourceValue !== undefined &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue as object, sourceValue as object) as T[keyof T];
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Load CLI configuration from file or return defaults
 *
 * @returns The loaded configuration merged with defaults
 */
export function loadCLIConfig(): QECLIConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return { ...DEFAULT_CLI_CONFIG };
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const parsed = safeJsonParse<Record<string, unknown>>(content);

    const validation = validateConfig(parsed);
    if (!validation.valid) {
      console.warn(`CLI config validation errors: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`);
      console.warn('Using default configuration');
      return { ...DEFAULT_CLI_CONFIG };
    }

    // Deep merge with defaults to fill in missing values
    return deepMerge(DEFAULT_CLI_CONFIG, parsed);
  } catch (error) {
    console.warn(`Failed to load CLI config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { ...DEFAULT_CLI_CONFIG };
  }
}

/**
 * Save CLI configuration to file
 *
 * @param config - The configuration to save
 * @throws Error if validation fails or write fails
 */
export function saveCLIConfig(config: QECLIConfig): void {
  const validation = validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid configuration: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`);
  }

  const configDir = getConfigDir();
  const configPath = getConfigPath();

  // Ensure directory exists
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    // Invalidate cache after save
    invalidateCache();
  } catch (error) {
    throw new Error(`Failed to save CLI config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get current CLI configuration (cached)
 *
 * Uses caching to avoid repeated file reads. Cache expires after 5 seconds.
 *
 * @returns The current configuration
 */
export function getCLIConfig(): QECLIConfig {
  if (isCacheValid()) {
    return cachedConfig!;
  }

  cachedConfig = loadCLIConfig();
  cacheTimestamp = Date.now();
  return cachedConfig;
}

/**
 * Reset CLI configuration to defaults
 *
 * This will delete the config file and invalidate the cache.
 */
export function resetCLIConfig(): void {
  const configPath = getConfigPath();

  if (existsSync(configPath)) {
    try {
      unlinkSync(configPath);
    } catch (error) {
      throw new Error(`Failed to reset CLI config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  invalidateCache();
}

/**
 * Update specific configuration values
 *
 * @param updates - Partial configuration to merge
 * @returns The updated configuration
 */
export function updateCLIConfig(updates: Partial<QECLIConfig>): QECLIConfig {
  const current = getCLIConfig();
  const updated = deepMerge(current, updates);
  saveCLIConfig(updated);
  return updated;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if running in TTY mode (interactive terminal)
 */
export function isInteractive(): boolean {
  return process.stdout.isTTY === true;
}

/**
 * Check if colors should be enabled
 */
export function shouldUseColors(): boolean {
  const config = getCLIConfig();

  // Respect NO_COLOR environment variable
  if (process.env.NO_COLOR !== undefined) {
    return false;
  }

  // Check FORCE_COLOR
  if (process.env.FORCE_COLOR !== undefined) {
    return true;
  }

  // Check config and TTY
  return config.progress.colors && isInteractive();
}

/**
 * Get wizard theme based on terminal capabilities
 */
export function getEffectiveWizardTheme(): 'default' | 'minimal' | 'detailed' {
  const config = getCLIConfig();

  if (!config.wizards.enabled) {
    return 'minimal';
  }

  // Use minimal theme in non-interactive mode
  if (!isInteractive()) {
    return 'minimal';
  }

  return config.wizards.defaultTheme;
}

/**
 * Get progress style based on terminal capabilities
 */
export function getEffectiveProgressStyle(): 'multi-bar' | 'single-bar' | 'spinner' {
  const config = getCLIConfig();

  // Use spinner in non-interactive mode
  if (!isInteractive()) {
    return 'spinner';
  }

  return config.progress.style;
}

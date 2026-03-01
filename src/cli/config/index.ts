/**
 * CLI Configuration Module
 * ADR-041: CLI Configuration for Enhanced Developer Experience
 *
 * Exports all configuration types and functions for the QE CLI.
 */

export {
  // Types
  type QECLIConfig,
  type WizardConfig,
  type ProgressConfig,
  type CompletionConfig,
  type StreamingConfig,
  type ValidationError,
  type ValidationResult,
  // Default configuration
  DEFAULT_CLI_CONFIG,
  // Path utilities
  getConfigDir,
  getConfigPath,
  // Configuration management
  loadCLIConfig,
  saveCLIConfig,
  getCLIConfig,
  resetCLIConfig,
  updateCLIConfig,
  // Validation
  validateConfig,
  // Cache management
  invalidateCache,
  // Utility functions
  isInteractive,
  shouldUseColors,
  getEffectiveWizardTheme,
  getEffectiveProgressStyle,
} from './cli-config.js';

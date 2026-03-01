/**
 * Agentic QE v3 - MCP Security: Validation Strategy Interfaces
 * Defines the Strategy Pattern interfaces for security validators
 */

// ============================================================================
// Risk and Result Types
// ============================================================================

/**
 * Risk level classification for security validation
 */
export type RiskLevel = 'none' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Base validation result returned by all validators
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  riskLevel: RiskLevel;
}

/**
 * Path validation result with normalized path
 */
export interface PathValidationResult extends ValidationResult {
  normalizedPath?: string;
}

/**
 * Regex safety result with pattern analysis
 */
export interface RegexSafetyResult {
  safe: boolean;
  pattern?: string;
  escapedPattern?: string;
  error?: string;
  riskyPatterns: string[];
}

/**
 * Command validation result with sanitized command
 */
export interface CommandValidationResult extends ValidationResult {
  sanitizedCommand?: string;
  blockedPatterns: string[];
}

// ============================================================================
// Validation Options
// ============================================================================

/**
 * Input sanitization options
 */
export interface SanitizationOptions {
  maxLength?: number;
  allowedChars?: RegExp;
  stripHtml?: boolean;
  stripSql?: boolean;
  escapeShell?: boolean;
  trim?: boolean;
  /** Strip dangerous control characters (null bytes, escape sequences, etc.) - default: true */
  stripControlChars?: boolean;
}

/**
 * Path validation options
 */
export interface PathValidationOptions {
  basePath?: string;
  allowAbsolute?: boolean;
  allowedExtensions?: string[];
  deniedExtensions?: string[];
  maxDepth?: number;
  maxLength?: number;
}

/**
 * Regex validation options
 */
export interface RegexValidationOptions {
  maxLength?: number;
  maxComplexity?: number;
}

/**
 * Command validation options
 */
export interface CommandValidationOptions {
  allowedCommands?: string[];
}

// ============================================================================
// Strategy Interface
// ============================================================================

/**
 * Base interface for all validation strategies
 * Implements the Strategy Pattern for modular security validation
 */
export interface IValidationStrategy<
  TInput = unknown,
  TOptions = unknown,
  TResult extends ValidationResult = ValidationResult
> {
  /**
   * Unique name identifier for this validator
   */
  readonly name: string;

  /**
   * Validate the input according to this strategy
   * @param input - The input to validate
   * @param options - Optional validation options
   * @returns The validation result
   */
  validate(input: TInput, options?: TOptions): TResult;

  /**
   * Get the risk level this validator typically addresses
   * @returns The primary risk level category
   */
  getRiskLevel(): RiskLevel;
}

/**
 * Path traversal validation strategy interface
 */
export interface IPathValidationStrategy
  extends IValidationStrategy<string, PathValidationOptions, PathValidationResult> {
  normalizePath(path: string): string;
  joinPaths(...paths: string[]): string;
  joinPathsAbsolute(...paths: string[]): string;
  getExtension(path: string): string | null;
}

/**
 * Regex safety validation strategy interface
 */
export interface IRegexValidationStrategy
  extends IValidationStrategy<string, RegexValidationOptions, ValidationResult> {
  isRegexSafe(pattern: string): RegexSafetyResult;
  escapeRegex(str: string): string;
  createSafeRegex(pattern: string, flags?: string, maxLength?: number): RegExp | null;
}

/**
 * Command validation strategy interface
 */
export interface ICommandValidationStrategy
  extends IValidationStrategy<string, CommandValidationOptions, CommandValidationResult> {
  escapeShellArg(arg: string): string;
}

/**
 * Input sanitization strategy interface
 */
export interface IInputSanitizationStrategy {
  readonly name: string;
  sanitize(input: string, options?: SanitizationOptions): string;
  escapeHtml(str: string): string;
  stripHtmlTags(str: string): string;
  getRiskLevel(): RiskLevel;
}

/**
 * Crypto validation strategy interface
 */
export interface ICryptoValidationStrategy {
  readonly name: string;
  timingSafeCompare(a: string, b: string): boolean;
  timingSafeHashCompare(value: string, expectedHash: string): boolean;
  generateSecureToken(length?: number): string;
  secureHash(value: string, salt?: string): string;
  getRiskLevel(): RiskLevel;
}

// ============================================================================
// Orchestrator Interface
// ============================================================================

/**
 * Validation orchestrator interface for coordinating multiple validators
 */
export interface IValidationOrchestrator {
  /**
   * Register a validation strategy
   */
  registerStrategy(strategy: IValidationStrategy): void;

  /**
   * Get a registered strategy by name
   */
  getStrategy(name: string): IValidationStrategy | undefined;

  /**
   * Validate using a specific strategy
   */
  validateWith<TResult extends ValidationResult>(
    strategyName: string,
    input: unknown,
    options?: unknown
  ): TResult;

  /**
   * Run all registered validators on an input
   */
  validateAll(input: unknown): Map<string, ValidationResult>;
}

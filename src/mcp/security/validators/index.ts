/**
 * Agentic QE v3 - MCP Security: Validators Index
 * Re-exports all validators and interfaces for easy importing
 */

// ============================================================================
// Interfaces and Types
// ============================================================================

export type {
  // Risk and Result Types
  RiskLevel,
  ValidationResult,
  PathValidationResult,
  RegexSafetyResult,
  CommandValidationResult,

  // Options Types
  SanitizationOptions,
  PathValidationOptions,
  RegexValidationOptions,
  CommandValidationOptions,

  // Strategy Interfaces
  IValidationStrategy,
  IPathValidationStrategy,
  IRegexValidationStrategy,
  ICommandValidationStrategy,
  IInputSanitizationStrategy,
  ICryptoValidationStrategy,
  IValidationOrchestrator,
} from './interfaces';

// ============================================================================
// Validators
// ============================================================================

// Path Traversal
export {
  PathTraversalValidator,
  PATH_TRAVERSAL_PATTERNS,
  DANGEROUS_PATH_COMPONENTS,
  validatePath,
  normalizePath,
  joinPaths,
  joinPathsAbsolute,
  getExtension,
} from './path-traversal-validator';

// Regex Safety
export {
  RegexSafetyValidator,
  REDOS_PATTERNS,
  countQuantifierNesting,
  hasExponentialBacktracking,
  isRegexSafe,
  escapeRegex,
  createSafeRegex,
} from './regex-safety-validator';

// Command Validator
export {
  CommandValidator,
  DEFAULT_ALLOWED_COMMANDS,
  BLOCKED_COMMAND_PATTERNS,
  validateCommand,
  escapeShellArg,
} from './command-validator';

// Input Sanitizer
export {
  InputSanitizer,
  HTML_ESCAPE_MAP,
  SQL_INJECTION_PATTERNS,
  SHELL_METACHARACTERS,
  DANGEROUS_CONTROL_CHARS,
  sanitizeInput,
  escapeHtml,
  stripHtmlTags,
} from './input-sanitizer';

// Crypto Validator
export {
  CryptoValidator,
  timingSafeCompare,
  timingSafeHashCompare,
  generateSecureToken,
  secureHash,
} from './crypto-validator';

// ============================================================================
// Orchestrator
// ============================================================================

export {
  ValidationOrchestrator,
  getOrchestrator,
  createOrchestrator,
} from './validation-orchestrator';

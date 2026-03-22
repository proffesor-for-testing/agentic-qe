/**
 * Agentic QE v3 - Security Utilities
 */

export { OSVClient } from './osv-client';
export type {
  OSVClientConfig,
  OSVQueryRequest,
  OSVEcosystem,
  OSVVulnerability,
  OSVSeverity,
  OSVAffected,
  OSVRange,
  OSVReference,
  OSVQueryResponse,
  OSVBatchQueryRequest,
  OSVBatchQueryResponse,
  ParsedVulnerability,
} from './osv-client';

export { CompliancePatternAnalyzer, getCompliancePatternAnalyzer } from './compliance-patterns';
export type {
  PatternMatch,
  CompliancePatternResult,
  EncryptionAnalysis,
  AccessControlAnalysis,
  LoggingAnalysis,
  DataProtectionAnalysis,
  SecurityControlsAnalysis,
} from './compliance-patterns';

// ============================================================================
// Validator Interfaces and Types (moved from mcp/security/validators/)
// ============================================================================

export type {
  RiskLevel,
  ValidationResult,
  PathValidationResult,
  RegexSafetyResult,
  CommandValidationResult,
  SanitizationOptions,
  PathValidationOptions,
  RegexValidationOptions,
  CommandValidationOptions,
  IValidationStrategy,
  IPathValidationStrategy,
  IRegexValidationStrategy,
  ICommandValidationStrategy,
  IInputSanitizationStrategy,
  ICryptoValidationStrategy,
  IValidationOrchestrator,
} from './validators-interfaces';

// ============================================================================
// Validators (moved from mcp/security/validators/)
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

// Orchestrator
export {
  ValidationOrchestrator,
  getOrchestrator,
  createOrchestrator,
} from './validation-orchestrator';

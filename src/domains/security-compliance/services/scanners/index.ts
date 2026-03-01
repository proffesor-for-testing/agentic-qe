/**
 * Agentic QE v3 - Security Scanners Module
 * Exports all scanner components and types
 */

// Main orchestrator (facade for backward compatibility)
export { SecurityScannerService } from './scanner-orchestrator.js';

// Individual scanners
export { SASTScanner } from './sast-scanner.js';
export { DASTScanner } from './dast-scanner.js';
export { DependencyScanner } from './dependency-scanner.js';

// Types and interfaces
export type {
  SecurityScannerConfig,
  SecurityScannerDependencies,
  ISecurityScannerService,
  FullScanResult,
  DependencyScanResult,
  SecurityPattern,
  MutableScanSummary,
} from './scanner-types.js';

export { DEFAULT_CONFIG } from './scanner-types.js';

// Re-export domain types for convenience
export type {
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilityCategory,
  VulnerabilityLocation,
  RemediationAdvice,
  ScanSummary,
  SecurityCoverage,
  ScanStatus,
  SASTResult,
  DASTResult,
  DASTOptions,
  AuthCredentials,
  RuleSet,
  FalsePositiveCheck,
} from './scanner-types.js';

// Security patterns
export {
  ALL_SECURITY_PATTERNS,
  SQL_INJECTION_PATTERNS,
  XSS_PATTERNS,
  SECRET_PATTERNS,
  PATH_TRAVERSAL_PATTERNS,
  COMMAND_INJECTION_PATTERNS,
  MISCONFIGURATION_PATTERNS,
  DESERIALIZATION_PATTERNS,
  AUTH_PATTERNS,
  BUILT_IN_RULE_SETS,
} from './security-patterns.js';

// DAST helper functions (for advanced/custom usage)
export {
  analyzeSecurityHeaders,
  analyzeCookieSecurity,
  analyzeServerHeaders,
  scanSensitiveFiles,
  analyzeCORS,
  extractAndCrawlLinks,
  testXSS,
  testSQLi,
  analyzeFormsForSecurityIssues,
  testAuthorizationBypass,
  testIDOR,
  validateCredentials,
  buildAuthHeaders,
  handleFetchError,
  calculateSummary,
  storeScanResults,
} from './dast-helpers.js';

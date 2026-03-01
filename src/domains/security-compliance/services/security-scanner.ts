/**
 * Agentic QE v3 - Security Scanner Service (Facade)
 *
 * This file provides backward compatibility by re-exporting from the
 * refactored scanner modules. The original 2,486-line file has been
 * split into focused sub-modules:
 *
 * - scanner-types.ts: Shared types and interfaces (~170 LOC)
 * - security-patterns.ts: Vulnerability detection patterns (~430 LOC)
 * - sast-scanner.ts: Static Application Security Testing (~410 LOC)
 * - dast-scanner.ts: Dynamic Application Security Testing (~580 LOC)
 * - dependency-scanner.ts: NPM/OSV vulnerability scanning (~160 LOC)
 * - scanner-orchestrator.ts: Main service coordinating all scanners (~220 LOC)
 *
 * @see /docs/reports/quality-analysis/milestone-1.1-complete.md
 */

// =============================================================================
// Main Service Export (Backward Compatible)
// =============================================================================

export { SecurityScannerService } from './scanners/index.js';

// =============================================================================
// Type Exports (Backward Compatible)
// =============================================================================

export type {
  // Service interfaces
  ISecurityScannerService,
  SecurityScannerConfig,
  SecurityScannerDependencies,
  FullScanResult,
  DependencyScanResult,

  // Security patterns
  SecurityPattern,

  // Domain types (re-exported for convenience)
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
} from './scanners/index.js';

// =============================================================================
// Pattern Exports (For Advanced Usage)
// =============================================================================

export {
  // Default configuration
  DEFAULT_CONFIG,

  // All patterns combined
  ALL_SECURITY_PATTERNS,

  // Individual pattern categories
  SQL_INJECTION_PATTERNS,
  XSS_PATTERNS,
  SECRET_PATTERNS,
  PATH_TRAVERSAL_PATTERNS,
  COMMAND_INJECTION_PATTERNS,
  MISCONFIGURATION_PATTERNS,
  DESERIALIZATION_PATTERNS,
  AUTH_PATTERNS,

  // Built-in rule sets
  BUILT_IN_RULE_SETS,
} from './scanners/index.js';

// =============================================================================
// Individual Scanner Exports (For Direct Access)
// =============================================================================

export { SASTScanner } from './scanners/sast-scanner.js';
export { DASTScanner } from './scanners/dast-scanner.js';
export { DependencyScanner } from './scanners/dependency-scanner.js';

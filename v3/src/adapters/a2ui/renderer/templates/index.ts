/**
 * A2UI QE Surface Templates
 *
 * Barrel export for all QE-specific surface templates.
 *
 * @module adapters/a2ui/renderer/templates
 */

// Coverage Dashboard Template
export {
  createCoverageSurface,
  createCoverageDataUpdate,
  createCoverageSummarySurface,
  type CoverageData,
  type FileCoverage,
  type CoverageGap,
  type ModuleCoverage,
} from './coverage-surface.js';

// Test Results Template
export {
  createTestResultsSurface,
  createTestResultsDataUpdate,
  createTestSummarySurface,
  type TestResults,
  type TestResult,
  type TestSuite,
  type TestStatus,
} from './test-results-surface.js';

// Security Findings Template
export {
  createSecuritySurface,
  createSecurityDataUpdate,
  createSecuritySummarySurface,
  type SecurityFindings,
  type SecurityFinding,
  type Severity,
  type OwaspCategory,
  type SeverityCount,
  type DependencyVulnerability,
} from './security-surface.js';

// Accessibility Audit Template
export {
  createAccessibilitySurface,
  createAccessibilityDataUpdate,
  createAccessibilitySummarySurface,
  type A11yAudit,
  type A11yFinding,
  type WcagLevel,
  type ImpactLevel,
  type WcagPrinciple,
  type ImpactCount,
  type LevelCount,
  type PrincipleBreakdown,
  type PageAudit,
} from './accessibility-surface.js';

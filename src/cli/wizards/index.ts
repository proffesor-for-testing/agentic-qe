/**
 * CLI Wizards - Interactive Configuration Wizards
 * ADR-041: V3 QE CLI Enhancement
 *
 * Exports all interactive wizards for the AQE v3 CLI.
 * Refactored to use Command Pattern for reduced complexity.
 */

// Core wizard infrastructure (Command Pattern)
export * from './core/index.js';

// Test Generation Wizard
export {
  TestGenerationWizard,
  runTestGenerationWizard,
  type TestWizardOptions,
  type TestWizardResult,
  type TestType,
  type TestFramework,
  type AIEnhancementLevel,
} from './test-wizard.js';

// Coverage Analysis Wizard
export {
  CoverageAnalysisWizard,
  runCoverageAnalysisWizard,
  getSensitivityConfig,
  type CoverageWizardOptions,
  type CoverageWizardResult,
  type GapSensitivity,
  type ReportFormat as CoverageReportFormat,
  type PriorityFocus,
} from './coverage-wizard.js';

// Security Scan Wizard
export {
  SecurityScanWizard,
  runSecurityScanWizard,
  getScanTypeConfig,
  getComplianceConfig,
  getSeverityConfig,
  type SecurityWizardOptions,
  type SecurityWizardResult,
  type ScanType,
  type ComplianceFramework,
  type SeverityLevel,
  type ReportFormat as SecurityReportFormat,
} from './security-wizard.js';

// Fleet Initialization Wizard
export {
  FleetInitWizard,
  runFleetInitWizard,
  getTopologyConfig,
  getDomainConfig,
  getMemoryBackendConfig,
  getAllDomains,
  type FleetWizardOptions,
  type FleetWizardResult,
  type TopologyType,
  type DDDDomain,
  type MemoryBackend,
} from './fleet-wizard.js';

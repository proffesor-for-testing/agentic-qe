/**
 * Agentic QE v3 - Security & Compliance Domain
 * SAST/DAST scanning, vulnerability analysis, and compliance validation
 *
 * This module exports the public API for the security-compliance domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  SecurityCompliancePlugin,
  createSecurityCompliancePlugin,
  type SecurityCompliancePluginConfig,
  type SecurityComplianceAPI,
  type SecurityComplianceExtendedAPI,
} from './plugin.js';

// ============================================================================
// Coordinator
// ============================================================================

export {
  SecurityComplianceCoordinator,
  type IExtendedSecurityComplianceCoordinator,
  type WorkflowStatus,
  type CoordinatorConfig,
} from './coordinator.js';

// ============================================================================
// Services
// ============================================================================

export {
  SecurityScannerService,
  type ISecurityScannerService,
  type SecurityScannerConfig,
  type FullScanResult,
} from './services/security-scanner.js';

export {
  SecurityAuditorService,
  type ISecurityAuditorService,
  type SecurityAuditorConfig,
  type SecurityPostureSummary,
  type TriagedVulnerabilities,
} from './services/security-auditor.js';

export {
  ComplianceValidatorService,
  type IExtendedComplianceValidationService,
  type ComplianceValidatorConfig,
  type MultiStandardReport,
  type DataType,
  type DataHandlingReport,
  type DataLocation,
  type ComplianceEvidence,
  type ControlEvidence,
} from './services/compliance-validator.js';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

// ============================================================================
// CQ-005: Register domain services in the shared DomainServiceRegistry
// so coordination/ can resolve them without importing from domains/.
// ============================================================================
import { DomainServiceRegistry, ServiceKeys } from '../../shared/domain-service-registry';
import type { MemoryBackend } from '../../kernel/interfaces';
import { SecurityScannerService as _SecurityScannerService } from './services/security-scanner.js';
import {
  isSemgrepAvailable,
  runSemgrepWithRules,
  convertSemgrepFindings,
} from './services/semgrep-integration.js';

DomainServiceRegistry.register(
  ServiceKeys.SecurityScannerService,
  (memory: MemoryBackend) => new _SecurityScannerService(memory),
);

DomainServiceRegistry.register(
  ServiceKeys.isSemgrepAvailable,
  isSemgrepAvailable,
);

DomainServiceRegistry.register(
  ServiceKeys.runSemgrepWithRules,
  runSemgrepWithRules,
);

DomainServiceRegistry.register(
  ServiceKeys.convertSemgrepFindings,
  convertSemgrepFindings,
);

export type {
  // Value Objects
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilityCategory,
  VulnerabilityLocation,
  DependencyInfo,
  RemediationAdvice,

  // Compliance
  ComplianceStandard,
  ComplianceRule,
  ComplianceViolation,
  ComplianceContext,
  ComplianceReport,
  GapAnalysis,
  ComplianceGap,
  RemediationAction,

  // Scan Results
  SASTResult,
  DASTResult,
  DASTOptions,
  DependencyScanResult,
  SecretScanResult,
  DetectedSecret,
  ScanSummary,
  ScanStatus,
  RuleSet,
  FalsePositiveCheck,
  SecurityCoverage,
  AuthCredentials,
  PackageSecurityInfo,
  OutdatedPackage,
  UpgradeRecommendation,

  // Audit
  SecurityAuditOptions,
  SecurityAuditReport,
  SecurityPosture,

  // Service Interfaces
  ISASTService,
  IDASTService,
  IDependencySecurityService,
  IComplianceValidationService,
  ISecurityComplianceCoordinator,
  IVulnerabilityRepository,
  IComplianceReportRepository,

  // Events
  SecurityScanCompletedEvent,
  VulnerabilityDetectedEvent,
  ComplianceCheckCompletedEvent,
} from './interfaces.js';

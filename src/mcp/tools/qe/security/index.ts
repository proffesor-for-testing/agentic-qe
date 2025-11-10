/**
 * Security Domain Tools
 *
 * Comprehensive security testing and compliance validation tools for QE workflows.
 * Includes SAST/DAST scanning, vulnerability detection, and compliance validation
 * against OWASP, CWE, and SANS standards.
 *
 * @module tools/qe/security
 * @version 1.0.0
 */

// Comprehensive security scanning
export {
  scanComprehensiveSecurity,
  type ComprehensiveScanResult,
  type SASTFinding,
  type DASTFinding,
  type DependencyVulnerability,
  type CodeQualityIssue,
  type ComplianceMapping,
  type SecurityRecommendation,
  type ScanMetadata
} from './scan-comprehensive'

// Vulnerability detection and classification
export {
  detectVulnerabilities,
  type VulnerabilityDetectionParams,
  type VulnerabilityDetectionResult,
  type DetectedVulnerability,
  type CVEDetails,
  type ExploitInfo,
  type DetectionSummary,
  type RiskAssessment,
  type RiskFactor,
  type RemediationPlan,
  type RemediationAction,
  type MLDetectionMetrics
} from './detect-vulnerabilities'

// Compliance validation
export {
  validateCompliance,
  type ComplianceValidationParams,
  type ComplianceValidationResult,
  type StandardComplianceResult,
  type ControlResult,
  type ComplianceGap,
  type CertificationReadiness,
  type CertificationStatus,
  type RemediationRoadmap,
  type RoadmapPhase,
  type RoadmapTask,
  type Milestone,
  type SuccessMetric,
  type ValidationMetadata
} from './validate-compliance'

// ==================== Security Tools API ====================

import { scanComprehensiveSecurity } from './scan-comprehensive'
import { detectVulnerabilities } from './detect-vulnerabilities'
import { validateCompliance } from './validate-compliance'

/**
 * Security domain tools aggregated API
 */
export const SecurityTools = {
  /**
   * Perform comprehensive security scan
   */
  scan: scanComprehensiveSecurity,

  /**
   * Detect and classify vulnerabilities
   */
  detect: detectVulnerabilities,

  /**
   * Validate compliance against standards
   */
  validate: validateCompliance
} as const;

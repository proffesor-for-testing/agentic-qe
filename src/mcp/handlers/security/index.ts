/**
 * Security Domain Tools
 *
 * Comprehensive security testing tools for SAST, DAST, authentication,
 * authorization, dependency scanning, and security reporting.
 *
 * @module security
 * @version 1.0.0
 * @author Agentic QE Team
 */

// Comprehensive Security Scanning
export {
  securityScanComprehensive,
  type SecurityScanComprehensiveParams,
  type SecurityScanComprehensiveResult,
  type SecurityVulnerability,
  type ComplianceCheck
} from './scan-comprehensive';

// Authentication Validation
export {
  validateAuthenticationFlow,
  ValidateAuthenticationFlowHandler,
  type ValidateAuthenticationFlowParams,
  type AuthValidationResult,
  type AuthTestCase,
  type AuthFinding
} from './validate-auth';

// Authorization Checking
export {
  checkAuthorizationRules,
  CheckAuthorizationRulesHandler,
  type CheckAuthorizationRulesParams,
  type AuthzCheckResult,
  type AuthorizationPolicy,
  type AuthzFinding
} from './check-authz';

// Dependency Vulnerability Scanning
export {
  scanDependenciesVulnerabilities,
  ScanDependenciesVulnerabilitiesHandler,
  type ScanDependenciesVulnerabilitiesParams,
  type VulnerabilityScanResult,
  type DependencyVulnerability,
  type LicenseIssue,
  type OutdatedPackage
} from './scan-dependencies';

// Security Report Generation
export {
  generateSecurityReport,
  GenerateSecurityReportHandler,
  type GenerateSecurityReportParams,
  type SecurityReport,
  type SecurityScanData
} from './generate-report';

/**
 * Security Domain Tool Registry
 *
 * All tools are registered and available for MCP server integration.
 */
export const SECURITY_TOOLS = {
  // Comprehensive scanning
  'scan-comprehensive': {
    name: 'scan-comprehensive',
    description: 'Comprehensive security scanning with SAST, DAST, SCA, and CVE monitoring',
    handler: 'securityScanComprehensive'
  },

  // Authentication validation
  'validate-auth': {
    name: 'validate-auth',
    description: 'Validate authentication flows, test auth endpoints, and perform token validation',
    handler: 'validateAuthenticationFlow'
  },

  // Authorization checking
  'check-authz': {
    name: 'check-authz',
    description: 'Check authorization rules, policy enforcement, and RBAC/ABAC configuration',
    handler: 'checkAuthorizationRules'
  },

  // Dependency scanning
  'scan-dependencies': {
    name: 'scan-dependencies',
    description: 'Scan dependencies for vulnerabilities with severity filtering and auto-fix suggestions',
    handler: 'scanDependenciesVulnerabilities'
  },

  // Report generation
  'generate-report': {
    name: 'generate-report',
    description: 'Generate security reports in HTML, SARIF, JSON, or Markdown formats',
    handler: 'generateSecurityReport'
  }
} as const;

/**
 * Get all security tool names
 */
export function getSecurityToolNames(): string[] {
  return Object.keys(SECURITY_TOOLS);
}

/**
 * Get security tool by name
 */
export function getSecurityTool(name: string) {
  return SECURITY_TOOLS[name as keyof typeof SECURITY_TOOLS];
}

/**
 * Check if tool exists in security domain
 */
export function isSecurityTool(name: string): boolean {
  return name in SECURITY_TOOLS;
}

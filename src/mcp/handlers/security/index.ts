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

// NOTE: validate-auth, check-authz, scan-dependencies removed in Issue #115
// Use QE_SECURITY_DETECT_VULNERABILITIES instead for comprehensive security scanning

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

  // NOTE: validate-auth, check-authz, scan-dependencies removed in Issue #115
  // Use QE_SECURITY_DETECT_VULNERABILITIES instead

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

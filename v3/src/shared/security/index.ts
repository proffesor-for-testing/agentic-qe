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

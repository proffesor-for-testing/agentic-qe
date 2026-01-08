/**
 * Agentic QE v3 - Security Utilities
 */

export {
  OSVClient,
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

export {
  CompliancePatternAnalyzer,
  getCompliancePatternAnalyzer,
  PatternMatch,
  CompliancePatternResult,
  EncryptionAnalysis,
  AccessControlAnalysis,
  LoggingAnalysis,
  DataProtectionAnalysis,
  SecurityControlsAnalysis,
} from './compliance-patterns';

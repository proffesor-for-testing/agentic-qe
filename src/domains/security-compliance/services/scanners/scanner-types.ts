/**
 * Agentic QE v3 - Security Scanner Shared Types
 * Common types, interfaces, and patterns used across all scanner modules
 */

import type { MemoryBackend } from '@kernel/interfaces.js';
import type {
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
} from '../../interfaces.js';

// ADR-051: LLM Router for AI-enhanced security analysis
import type { HybridRouter, ChatResponse } from '@shared/llm/index.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Combined security scanner configuration
 */
export interface SecurityScannerConfig {
  defaultRuleSets: string[];
  maxConcurrentScans: number;
  timeout: number;
  enableFalsePositiveDetection: boolean;
  dastMaxDepth: number;
  dastActiveScanning: boolean;
  /** ADR-051: Enable LLM-powered vulnerability analysis */
  enableLLMAnalysis: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier: number;
}

/**
 * Dependencies for SecurityScannerService
 * ADR-051: Added LLM router for AI-enhanced analysis
 */
export interface SecurityScannerDependencies {
  memory: MemoryBackend;
  llmRouter?: HybridRouter;
}

export const DEFAULT_CONFIG: SecurityScannerConfig = {
  defaultRuleSets: ['owasp-top-10', 'cwe-sans-25'],
  maxConcurrentScans: 4,
  timeout: 300000, // 5 minutes
  enableFalsePositiveDetection: true,
  dastMaxDepth: 5,
  dastActiveScanning: false,
  enableLLMAnalysis: true, // On by default - opt-out (ADR-051)
  llmModelTier: 4, // Opus for security analysis (needs expert reasoning)
};

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Dependency scan result
 */
export interface DependencyScanResult {
  readonly scanId: string;
  readonly vulnerabilities: Vulnerability[];
  readonly packagesScanned: number;
  readonly vulnerablePackages: number;
  readonly summary: ScanSummary;
  readonly scanDurationMs: number;
}

/**
 * Full scan result combining SAST and DAST
 */
export interface FullScanResult {
  readonly sastResult: SASTResult;
  readonly dastResult?: DASTResult;
  readonly combinedSummary: ScanSummary;
}

/**
 * Combined security scanner service interface
 */
export interface ISecurityScannerService {
  // SAST Methods
  scanFiles(files: import('../../../../shared/value-objects/index.js').FilePath[]): Promise<import('../../../../shared/types/index.js').Result<SASTResult>>;
  scanWithRules(files: import('../../../../shared/value-objects/index.js').FilePath[], ruleSetIds: string[]): Promise<import('../../../../shared/types/index.js').Result<SASTResult>>;
  getAvailableRuleSets(): Promise<RuleSet[]>;
  checkFalsePositive(vulnerability: Vulnerability): Promise<import('../../../../shared/types/index.js').Result<FalsePositiveCheck>>;

  // DAST Methods
  scanUrl(targetUrl: string, options?: DASTOptions): Promise<import('../../../../shared/types/index.js').Result<DASTResult>>;
  scanAuthenticated(
    targetUrl: string,
    credentials: AuthCredentials,
    options?: DASTOptions
  ): Promise<import('../../../../shared/types/index.js').Result<DASTResult>>;
  getScanStatus(scanId: string): Promise<ScanStatus>;

  // Dependency Scanning (OSV)
  scanDependencies(dependencies: Record<string, string>): Promise<import('../../../../shared/types/index.js').Result<DependencyScanResult>>;
  scanPackageJson(packageJsonPath: string): Promise<import('../../../../shared/types/index.js').Result<DependencyScanResult>>;

  // Combined
  runFullScan(
    files: import('../../../../shared/value-objects/index.js').FilePath[],
    targetUrl?: string,
    options?: DASTOptions
  ): Promise<import('../../../../shared/types/index.js').Result<FullScanResult>>;
}

// ============================================================================
// Security Pattern Definition
// ============================================================================

/**
 * Pattern definition for vulnerability detection
 */
export interface SecurityPattern {
  readonly id: string;
  readonly pattern: RegExp;
  readonly category: VulnerabilityCategory;
  readonly severity: VulnerabilitySeverity;
  readonly title: string;
  readonly description: string;
  readonly owaspId: string;
  readonly cweId: string;
  readonly remediation: string;
  readonly fixExample?: string;
}

// ============================================================================
// Mutable Summary Type for Internal Use
// ============================================================================

export interface MutableScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  totalFiles: number;
  scanDurationMs: number;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

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
  MemoryBackend,
  HybridRouter,
  ChatResponse,
};

/**
 * Agentic QE v3 - Security & Compliance Domain Interfaces
 *
 * Bounded Context: Security & Compliance
 * Responsibility: SAST/DAST scanning, vulnerability analysis, compliance validation
 */

import type { DomainEvent, Result } from '../../shared/types/index.js';
import type { FilePath, RiskScore } from '../../shared/value-objects/index.js';

// ============================================================================
// Value Objects
// ============================================================================

/**
 * Security vulnerability details
 */
export interface Vulnerability {
  readonly id: string;
  readonly cveId?: string;
  readonly title: string;
  readonly description: string;
  readonly severity: VulnerabilitySeverity;
  readonly category: VulnerabilityCategory;
  readonly location: VulnerabilityLocation;
  readonly remediation: RemediationAdvice;
  readonly references: string[];
}

export type VulnerabilitySeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

export type VulnerabilityCategory =
  | 'injection'
  | 'broken-auth'
  | 'sensitive-data'
  | 'xxe'
  | 'access-control'
  | 'security-misconfiguration'
  | 'xss'
  | 'insecure-deserialization'
  | 'vulnerable-components'
  | 'insufficient-logging';

export interface VulnerabilityLocation {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly snippet?: string;
  readonly dependency?: DependencyInfo;
}

export interface DependencyInfo {
  readonly name: string;
  readonly version: string;
  readonly ecosystem: 'npm' | 'pip' | 'maven' | 'nuget' | 'cargo';
}

export interface RemediationAdvice {
  readonly description: string;
  readonly fixExample?: string;
  readonly estimatedEffort: 'trivial' | 'minor' | 'moderate' | 'major';
  readonly automatable: boolean;
}

/**
 * Compliance standard and rules
 */
export interface ComplianceStandard {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly rules: ComplianceRule[];
}

export interface ComplianceRule {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly severity: 'required' | 'recommended' | 'optional';
  readonly checkType: 'static' | 'dynamic' | 'manual';
}

export interface ComplianceViolation {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly location: VulnerabilityLocation;
  readonly details: string;
  readonly remediation: string;
}

// ============================================================================
// Domain Events
// ============================================================================

export interface SecurityScanCompletedEvent extends DomainEvent {
  readonly type: 'SecurityScanCompletedEvent';
  readonly scanId: string;
  readonly scanType: 'sast' | 'dast' | 'dependency' | 'secret';
  readonly vulnerabilities: Vulnerability[];
  readonly summary: ScanSummary;
}

export interface VulnerabilityDetectedEvent extends DomainEvent {
  readonly type: 'VulnerabilityDetectedEvent';
  readonly vulnerability: Vulnerability;
  readonly isNew: boolean;
  readonly previousOccurrences: number;
}

export interface ComplianceCheckCompletedEvent extends DomainEvent {
  readonly type: 'ComplianceCheckCompletedEvent';
  readonly standardId: string;
  readonly violations: ComplianceViolation[];
  readonly complianceScore: number;
  readonly passed: boolean;
}

export interface ScanSummary {
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
  readonly informational: number;
  readonly totalFiles: number;
  readonly scanDurationMs: number;
}

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * SAST (Static Application Security Testing) Service
 */
export interface ISASTService {
  /**
   * Scan files for security vulnerabilities
   */
  scan(files: FilePath[]): Promise<Result<SASTResult>>;

  /**
   * Scan with specific rule sets
   */
  scanWithRules(files: FilePath[], ruleSetIds: string[]): Promise<Result<SASTResult>>;

  /**
   * Get available rule sets
   */
  getAvailableRuleSets(): Promise<RuleSet[]>;

  /**
   * Check if vulnerability is false positive
   */
  checkFalsePositive(vulnerability: Vulnerability): Promise<Result<FalsePositiveCheck>>;
}

export interface SASTResult {
  readonly scanId: string;
  readonly vulnerabilities: Vulnerability[];
  readonly summary: ScanSummary;
  readonly coverage: SecurityCoverage;
}

export interface RuleSet {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly ruleCount: number;
  readonly categories: VulnerabilityCategory[];
}

export interface FalsePositiveCheck {
  readonly isFalsePositive: boolean;
  readonly confidence: number;
  readonly reason?: string;
}

export interface SecurityCoverage {
  readonly filesScanned: number;
  readonly linesScanned: number;
  readonly rulesApplied: number;
}

/**
 * DAST (Dynamic Application Security Testing) Service
 */
export interface IDASTService {
  /**
   * Scan running application
   */
  scan(targetUrl: string, options?: DASTOptions): Promise<Result<DASTResult>>;

  /**
   * Scan authenticated endpoints
   */
  scanAuthenticated(
    targetUrl: string,
    credentials: AuthCredentials,
    options?: DASTOptions
  ): Promise<Result<DASTResult>>;

  /**
   * Get scan status
   */
  getScanStatus(scanId: string): Promise<ScanStatus>;
}

export interface DASTOptions {
  readonly maxDepth?: number;
  readonly excludePatterns?: string[];
  readonly activeScanning?: boolean;
  readonly timeout?: number;
}

export interface DASTResult {
  readonly scanId: string;
  readonly targetUrl: string;
  readonly vulnerabilities: Vulnerability[];
  readonly summary: ScanSummary;
  readonly crawledUrls: number;
}

export interface AuthCredentials {
  readonly type: 'basic' | 'bearer' | 'cookie' | 'oauth';
  readonly token?: string;
  readonly username?: string;
  readonly password?: string;
}

export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Dependency Vulnerability Service
 */
export interface IDependencySecurityService {
  /**
   * Scan dependencies for vulnerabilities
   */
  scanDependencies(manifestPath: FilePath): Promise<Result<DependencyScanResult>>;

  /**
   * Check specific package
   */
  checkPackage(name: string, version: string, ecosystem: DependencyInfo['ecosystem']): Promise<Result<PackageSecurityInfo>>;

  /**
   * Get upgrade recommendations
   */
  getUpgradeRecommendations(vulnerabilities: Vulnerability[]): Promise<Result<UpgradeRecommendation[]>>;
}

export interface DependencyScanResult {
  readonly vulnerabilities: Vulnerability[];
  readonly outdatedPackages: OutdatedPackage[];
  readonly summary: ScanSummary;
}

export interface PackageSecurityInfo {
  readonly name: string;
  readonly version: string;
  readonly vulnerabilities: Vulnerability[];
  readonly latestVersion: string;
  readonly isDeprecated: boolean;
}

export interface OutdatedPackage {
  readonly name: string;
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly updateType: 'major' | 'minor' | 'patch';
}

export interface UpgradeRecommendation {
  readonly package: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly fixesVulnerabilities: string[];
  readonly breakingChanges: boolean;
}

/**
 * Compliance Validation Service
 */
export interface IComplianceValidationService {
  /**
   * Validate against compliance standard
   */
  validate(standard: ComplianceStandard, context: ComplianceContext): Promise<Result<ComplianceReport>>;

  /**
   * Get available compliance standards
   */
  getAvailableStandards(): Promise<ComplianceStandard[]>;

  /**
   * Get compliance gap analysis
   */
  analyzeGaps(currentState: ComplianceReport, targetStandard: ComplianceStandard): Promise<Result<GapAnalysis>>;
}

export interface ComplianceContext {
  readonly projectRoot: FilePath;
  readonly includePatterns: string[];
  readonly excludePatterns: string[];
  readonly customRules?: ComplianceRule[];
}

export interface ComplianceReport {
  readonly standardId: string;
  readonly standardName: string;
  readonly violations: ComplianceViolation[];
  readonly passedRules: string[];
  readonly skippedRules: string[];
  readonly complianceScore: number;
  readonly generatedAt: Date;
}

export interface GapAnalysis {
  readonly currentScore: number;
  readonly targetScore: number;
  readonly gaps: ComplianceGap[];
  readonly prioritizedActions: RemediationAction[];
}

export interface ComplianceGap {
  readonly ruleId: string;
  readonly currentStatus: 'not-implemented' | 'partial' | 'failed';
  readonly effort: RemediationAdvice['estimatedEffort'];
  readonly impact: 'high' | 'medium' | 'low';
}

export interface RemediationAction {
  readonly id: string;
  readonly description: string;
  readonly affectedRules: string[];
  readonly effort: RemediationAdvice['estimatedEffort'];
  readonly priority: number;
}

// ============================================================================
// Repository Interfaces
// ============================================================================

export interface IVulnerabilityRepository {
  findById(id: string): Promise<Vulnerability | null>;
  findBySeverity(severity: VulnerabilitySeverity): Promise<Vulnerability[]>;
  findByFile(file: FilePath): Promise<Vulnerability[]>;
  save(vulnerability: Vulnerability): Promise<void>;
  markResolved(id: string): Promise<void>;
}

export interface IComplianceReportRepository {
  findLatest(standardId: string): Promise<ComplianceReport | null>;
  findByDateRange(startDate: Date, endDate: Date): Promise<ComplianceReport[]>;
  save(report: ComplianceReport): Promise<void>;
}

// ============================================================================
// Coordinator Interface
// ============================================================================

export interface ISecurityComplianceCoordinator {
  /**
   * Run comprehensive security audit
   */
  runSecurityAudit(options: SecurityAuditOptions): Promise<Result<SecurityAuditReport>>;

  /**
   * Run compliance check
   */
  runComplianceCheck(standardId: string): Promise<Result<ComplianceReport>>;

  /**
   * Get security posture summary
   */
  getSecurityPosture(): Promise<Result<SecurityPosture>>;
}

export interface SecurityAuditOptions {
  readonly includeSAST: boolean;
  readonly includeDAST: boolean;
  readonly includeDependencies: boolean;
  readonly includeSecrets: boolean;
  readonly targetUrl?: string;
}

export interface SecurityAuditReport {
  readonly auditId: string;
  readonly timestamp: Date;
  readonly sastResults?: SASTResult;
  readonly dastResults?: DASTResult;
  readonly dependencyResults?: DependencyScanResult;
  readonly secretScanResults?: SecretScanResult;
  readonly overallRiskScore: RiskScore;
  readonly recommendations: string[];
}

export interface SecretScanResult {
  readonly secretsFound: DetectedSecret[];
  readonly filesScanned: number;
}

export interface DetectedSecret {
  readonly type: 'api-key' | 'password' | 'token' | 'certificate' | 'private-key';
  readonly location: VulnerabilityLocation;
  readonly entropy: number;
  readonly isValid: boolean;
}

export interface SecurityPosture {
  readonly overallScore: number;
  readonly trend: 'improving' | 'stable' | 'declining';
  readonly criticalVulnerabilities: number;
  readonly complianceStatus: Map<string, number>;
  readonly lastAuditDate: Date;
}

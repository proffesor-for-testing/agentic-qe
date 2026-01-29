/**
 * Agentic QE v3 - Scanner Orchestrator
 * Coordinates SAST, DAST, and Dependency scanning activities
 */

import { Result, ok, err } from '../../../../shared/types/index.js';
import type { FilePath } from '../../../../shared/value-objects/index.js';
import type {
  SecurityScannerConfig,
  SecurityScannerDependencies,
  ISecurityScannerService,
  FullScanResult,
  DependencyScanResult,
  Vulnerability,
  ScanSummary,
  SASTResult,
  DASTResult,
  DASTOptions,
  AuthCredentials,
  RuleSet,
  FalsePositiveCheck,
  MemoryBackend,
  HybridRouter,
  ScanStatus,
} from './scanner-types.js';
import { DEFAULT_CONFIG } from './scanner-types.js';
import { SASTScanner } from './sast-scanner.js';
import { DASTScanner } from './dast-scanner.js';
import { DependencyScanner } from './dependency-scanner.js';

// ============================================================================
// Scanner Orchestrator Service
// ============================================================================

/**
 * SecurityScannerService - Main orchestrator for all security scanning
 * Coordinates SAST, DAST, and dependency scanning activities
 */
export class SecurityScannerService implements ISecurityScannerService {
  private readonly config: SecurityScannerConfig;
  private readonly memory: MemoryBackend;
  private readonly llmRouter?: HybridRouter;
  private readonly activeScans: Map<string, ScanStatus> = new Map();

  // Sub-scanners
  private readonly sastScanner: SASTScanner;
  private readonly dastScanner: DASTScanner;
  private readonly dependencyScanner: DependencyScanner;

  constructor(
    dependencies: SecurityScannerDependencies | MemoryBackend,
    config: Partial<SecurityScannerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Support both old and new constructor signatures
    if ('memory' in dependencies) {
      this.memory = dependencies.memory;
      this.llmRouter = dependencies.llmRouter;
    } else {
      this.memory = dependencies;
    }

    // Initialize sub-scanners with shared state
    this.sastScanner = new SASTScanner(
      this.config,
      this.memory,
      this.llmRouter,
      this.activeScans
    );
    this.dastScanner = new DASTScanner(
      this.config,
      this.memory,
      this.activeScans
    );
    this.dependencyScanner = new DependencyScanner(
      this.config,
      this.memory,
      this.activeScans
    );
  }

  // ==========================================================================
  // SAST Methods (delegated to SASTScanner)
  // ==========================================================================

  /**
   * Scan files for security vulnerabilities using static analysis
   */
  async scanFiles(files: FilePath[]): Promise<Result<SASTResult>> {
    return this.sastScanner.scanFiles(files);
  }

  /**
   * Scan with specific rule sets
   */
  async scanWithRules(
    files: FilePath[],
    ruleSetIds: string[]
  ): Promise<Result<SASTResult>> {
    return this.sastScanner.scanWithRules(files, ruleSetIds);
  }

  /**
   * Get available rule sets
   */
  async getAvailableRuleSets(): Promise<RuleSet[]> {
    return this.sastScanner.getAvailableRuleSets();
  }

  /**
   * Check if vulnerability is a false positive
   */
  async checkFalsePositive(
    vulnerability: Vulnerability
  ): Promise<Result<FalsePositiveCheck>> {
    return this.sastScanner.checkFalsePositive(vulnerability);
  }

  // ==========================================================================
  // DAST Methods (delegated to DASTScanner)
  // ==========================================================================

  /**
   * Scan running application using dynamic analysis
   */
  async scanUrl(
    targetUrl: string,
    options?: DASTOptions
  ): Promise<Result<DASTResult>> {
    return this.dastScanner.scanUrl(targetUrl, options);
  }

  /**
   * Scan authenticated endpoints
   */
  async scanAuthenticated(
    targetUrl: string,
    credentials: AuthCredentials,
    options?: DASTOptions
  ): Promise<Result<DASTResult>> {
    return this.dastScanner.scanAuthenticated(targetUrl, credentials, options);
  }

  /**
   * Get scan status
   */
  async getScanStatus(scanId: string): Promise<ScanStatus> {
    return this.activeScans.get(scanId) ?? 'pending';
  }

  // ==========================================================================
  // Dependency Scanning Methods (delegated to DependencyScanner)
  // ==========================================================================

  /**
   * Scan npm dependencies for known vulnerabilities using OSV API
   */
  async scanDependencies(
    dependencies: Record<string, string>
  ): Promise<Result<DependencyScanResult>> {
    return this.dependencyScanner.scanDependencies(dependencies);
  }

  /**
   * Scan a package.json file for dependency vulnerabilities
   */
  async scanPackageJson(packageJsonPath: string): Promise<Result<DependencyScanResult>> {
    return this.dependencyScanner.scanPackageJson(packageJsonPath);
  }

  // ==========================================================================
  // Combined Scanning
  // ==========================================================================

  /**
   * Run combined SAST and DAST scan
   */
  async runFullScan(
    files: FilePath[],
    targetUrl?: string,
    options?: DASTOptions
  ): Promise<Result<FullScanResult>> {
    try {
      // Run SAST scan
      const sastResult = await this.scanWithRules(files, this.config.defaultRuleSets);
      if (sastResult.success === false) {
        return err(sastResult.error);
      }

      // Run DAST scan if target URL provided
      let dastResult: DASTResult | undefined;
      if (targetUrl) {
        const dastScan = await this.scanUrl(targetUrl, options);
        if (dastScan.success) {
          dastResult = dastScan.value;
        }
        // Don't fail the full scan if DAST fails
      }

      // Combine summaries
      const combinedSummary = this.combineSummaries(
        sastResult.value.summary,
        dastResult?.summary
      );

      return ok({
        sastResult: sastResult.value,
        dastResult,
        combinedSummary,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // LLM Enhancement Methods (ADR-051) - delegated to SASTScanner
  // ==========================================================================

  /**
   * Check if LLM analysis is available and enabled
   */
  isLLMAnalysisAvailable(): boolean {
    return this.sastScanner.isLLMAnalysisAvailable();
  }

  /**
   * Get model ID for the configured tier
   */
  getModelForTier(tier: number): string {
    return this.sastScanner.getModelForTier(tier);
  }

  /**
   * Analyze vulnerability with LLM for deeper insights
   */
  async analyzeVulnerabilityWithLLM(
    vuln: Vulnerability,
    codeContext: string
  ): Promise<import('./scanner-types.js').RemediationAdvice> {
    return this.sastScanner.analyzeVulnerabilityWithLLM(vuln, codeContext);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Combine SAST and DAST summaries
   */
  private combineSummaries(
    sast: ScanSummary,
    dast?: ScanSummary
  ): ScanSummary {
    if (!dast) return sast;

    return {
      critical: sast.critical + dast.critical,
      high: sast.high + dast.high,
      medium: sast.medium + dast.medium,
      low: sast.low + dast.low,
      informational: sast.informational + dast.informational,
      totalFiles: sast.totalFiles + dast.totalFiles,
      scanDurationMs: sast.scanDurationMs + dast.scanDurationMs,
    };
  }
}

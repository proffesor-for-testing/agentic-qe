/**
 * Agentic QE v3 - Security Scanner Service
 * Implements SAST and DAST security scanning capabilities
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import type { MemoryBackend } from '../../../kernel/interfaces.js';
import type { FilePath } from '../../../shared/value-objects/index.js';
import type {
  SASTResult,
  DASTResult,
  DASTOptions,
  AuthCredentials,
  RuleSet,
  FalsePositiveCheck,
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilityCategory,
  VulnerabilityLocation,
  RemediationAdvice,
  ScanSummary,
  SecurityCoverage,
  ScanStatus,
} from '../interfaces.js';

// ============================================================================
// Service Interfaces
// ============================================================================

/**
 * Combined security scanner service interface
 * Note: We define separate methods for SAST and DAST to avoid interface conflicts
 */
export interface ISecurityScannerService {
  // SAST Methods
  scanFiles(files: FilePath[]): Promise<Result<SASTResult>>;
  scanWithRules(files: FilePath[], ruleSetIds: string[]): Promise<Result<SASTResult>>;
  getAvailableRuleSets(): Promise<RuleSet[]>;
  checkFalsePositive(vulnerability: Vulnerability): Promise<Result<FalsePositiveCheck>>;

  // DAST Methods
  scanUrl(targetUrl: string, options?: DASTOptions): Promise<Result<DASTResult>>;
  scanAuthenticated(
    targetUrl: string,
    credentials: AuthCredentials,
    options?: DASTOptions
  ): Promise<Result<DASTResult>>;
  getScanStatus(scanId: string): Promise<ScanStatus>;

  // Combined
  runFullScan(
    files: FilePath[],
    targetUrl?: string,
    options?: DASTOptions
  ): Promise<Result<FullScanResult>>;
}

export interface FullScanResult {
  readonly sastResult: SASTResult;
  readonly dastResult?: DASTResult;
  readonly combinedSummary: ScanSummary;
}

// ============================================================================
// Configuration
// ============================================================================

export interface SecurityScannerConfig {
  defaultRuleSets: string[];
  maxConcurrentScans: number;
  timeout: number;
  enableFalsePositiveDetection: boolean;
  dastMaxDepth: number;
  dastActiveScanning: boolean;
}

const DEFAULT_CONFIG: SecurityScannerConfig = {
  defaultRuleSets: ['owasp-top-10', 'cwe-sans-25'],
  maxConcurrentScans: 4,
  timeout: 300000, // 5 minutes
  enableFalsePositiveDetection: true,
  dastMaxDepth: 5,
  dastActiveScanning: false,
};

// ============================================================================
// Built-in Rule Sets
// ============================================================================

const BUILT_IN_RULE_SETS: RuleSet[] = [
  {
    id: 'owasp-top-10',
    name: 'OWASP Top 10',
    description: 'OWASP Top 10 most critical security risks',
    ruleCount: 45,
    categories: [
      'injection',
      'broken-auth',
      'sensitive-data',
      'xxe',
      'access-control',
      'security-misconfiguration',
      'xss',
      'insecure-deserialization',
      'vulnerable-components',
      'insufficient-logging',
    ],
  },
  {
    id: 'cwe-sans-25',
    name: 'CWE/SANS Top 25',
    description: 'Most dangerous software errors',
    ruleCount: 38,
    categories: [
      'injection',
      'xss',
      'access-control',
      'sensitive-data',
      'broken-auth',
    ],
  },
  {
    id: 'nodejs-security',
    name: 'Node.js Security',
    description: 'Node.js specific security rules',
    ruleCount: 25,
    categories: ['injection', 'xss', 'sensitive-data', 'security-misconfiguration'],
  },
  {
    id: 'typescript-security',
    name: 'TypeScript Security',
    description: 'TypeScript specific security rules',
    ruleCount: 20,
    categories: ['injection', 'xss', 'sensitive-data'],
  },
];

// ============================================================================
// Mutable Summary Type for Internal Use
// ============================================================================

interface MutableScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  totalFiles: number;
  scanDurationMs: number;
}

// ============================================================================
// Security Scanner Service Implementation
// ============================================================================

export class SecurityScannerService implements ISecurityScannerService {
  private readonly config: SecurityScannerConfig;
  private readonly activeScans: Map<string, ScanStatus> = new Map();

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<SecurityScannerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // SAST Methods
  // ==========================================================================

  /**
   * Scan files for security vulnerabilities using static analysis
   */
  async scanFiles(files: FilePath[]): Promise<Result<SASTResult>> {
    return this.scanWithRules(files, this.config.defaultRuleSets);
  }

  /**
   * Scan with specific rule sets
   */
  async scanWithRules(
    files: FilePath[],
    ruleSetIds: string[]
  ): Promise<Result<SASTResult>> {
    const scanId = uuidv4();

    try {
      if (files.length === 0) {
        return err(new Error('No files provided for scanning'));
      }

      this.activeScans.set(scanId, 'running');
      const startTime = Date.now();

      // Get applicable rule sets
      const ruleSets = BUILT_IN_RULE_SETS.filter((rs) =>
        ruleSetIds.includes(rs.id)
      );

      if (ruleSets.length === 0) {
        return err(new Error(`No valid rule sets found: ${ruleSetIds.join(', ')}`));
      }

      // Perform static analysis on each file
      const vulnerabilities: Vulnerability[] = [];
      let linesScanned = 0;

      for (const file of files) {
        const fileVulns = await this.analyzeFile(file, ruleSets);
        vulnerabilities.push(...fileVulns.vulnerabilities);
        linesScanned += fileVulns.linesScanned;
      }

      const scanDurationMs = Date.now() - startTime;

      // Calculate summary
      const summary = this.calculateSummary(
        vulnerabilities,
        files.length,
        scanDurationMs
      );

      // Calculate coverage
      const coverage: SecurityCoverage = {
        filesScanned: files.length,
        linesScanned,
        rulesApplied: ruleSets.reduce((acc, rs) => acc + rs.ruleCount, 0),
      };

      // Store scan results in memory
      await this.storeScanResults(scanId, 'sast', vulnerabilities, summary);

      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        vulnerabilities,
        summary,
        coverage,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get available rule sets
   */
  async getAvailableRuleSets(): Promise<RuleSet[]> {
    // Return built-in rule sets plus any custom ones from memory
    const customRuleSets = await this.memory.get<RuleSet[]>(
      'security:custom-rule-sets'
    );

    return [...BUILT_IN_RULE_SETS, ...(customRuleSets || [])];
  }

  /**
   * Check if vulnerability is a false positive
   */
  async checkFalsePositive(
    vulnerability: Vulnerability
  ): Promise<Result<FalsePositiveCheck>> {
    try {
      if (!this.config.enableFalsePositiveDetection) {
        return ok({
          isFalsePositive: false,
          confidence: 0,
          reason: 'False positive detection is disabled',
        });
      }

      // Stub: In production, this would use AI/ML to analyze context
      const analysis = await this.analyzeFalsePositive(vulnerability);

      // Store the check result for learning
      await this.memory.set(
        `security:fp-check:${vulnerability.id}`,
        { vulnerability, analysis },
        { namespace: 'security-compliance', ttl: 86400 * 30 } // 30 days
      );

      return ok(analysis);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // DAST Methods
  // ==========================================================================

  /**
   * Scan running application using dynamic analysis
   */
  async scanUrl(
    targetUrl: string,
    options?: DASTOptions
  ): Promise<Result<DASTResult>> {
    const scanId = uuidv4();

    try {
      this.activeScans.set(scanId, 'running');
      const startTime = Date.now();

      const mergedOptions: DASTOptions = {
        maxDepth: options?.maxDepth ?? this.config.dastMaxDepth,
        activeScanning: options?.activeScanning ?? this.config.dastActiveScanning,
        timeout: options?.timeout ?? this.config.timeout,
        excludePatterns: options?.excludePatterns ?? [],
      };

      // Perform dynamic analysis
      const result = await this.performDynamicScan(targetUrl, mergedOptions);

      const scanDurationMs = Date.now() - startTime;

      const summary = this.calculateSummary(
        result.vulnerabilities,
        1,
        scanDurationMs
      );

      // Store results
      await this.storeScanResults(scanId, 'dast', result.vulnerabilities, summary);

      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        targetUrl,
        vulnerabilities: result.vulnerabilities,
        summary,
        crawledUrls: result.crawledUrls,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Scan authenticated endpoints
   */
  async scanAuthenticated(
    targetUrl: string,
    credentials: AuthCredentials,
    options?: DASTOptions
  ): Promise<Result<DASTResult>> {
    const scanId = uuidv4();

    try {
      this.activeScans.set(scanId, 'running');
      const startTime = Date.now();

      // Validate credentials
      const credValidation = this.validateCredentials(credentials);
      if (!credValidation.valid) {
        return err(new Error(credValidation.reason));
      }

      const mergedOptions: DASTOptions = {
        maxDepth: options?.maxDepth ?? this.config.dastMaxDepth,
        activeScanning: options?.activeScanning ?? this.config.dastActiveScanning,
        timeout: options?.timeout ?? this.config.timeout,
        excludePatterns: options?.excludePatterns ?? [],
      };

      // Perform authenticated dynamic analysis
      const result = await this.performAuthenticatedScan(
        targetUrl,
        credentials,
        mergedOptions
      );

      const scanDurationMs = Date.now() - startTime;

      const summary = this.calculateSummary(
        result.vulnerabilities,
        1,
        scanDurationMs
      );

      // Store results (without credentials)
      await this.storeScanResults(scanId, 'dast-auth', result.vulnerabilities, summary);

      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        targetUrl,
        vulnerabilities: result.vulnerabilities,
        summary,
        crawledUrls: result.crawledUrls,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get scan status
   */
  async getScanStatus(scanId: string): Promise<ScanStatus> {
    return this.activeScans.get(scanId) ?? 'pending';
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
      if (!sastResult.success) {
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
  // Private Helper Methods
  // ==========================================================================

  private async analyzeFile(
    file: FilePath,
    ruleSets: RuleSet[]
  ): Promise<{ vulnerabilities: Vulnerability[]; linesScanned: number }> {
    // Stub: In production, this would perform actual static analysis
    const vulnerabilities: Vulnerability[] = [];
    const filePath = file.value;
    const extension = file.extension;

    // Simulate line counting
    const linesScanned = Math.floor(Math.random() * 500) + 100;

    // Apply rules based on file type
    const applicableCategories = ruleSets.flatMap((rs) => rs.categories);

    // Stub vulnerabilities based on file patterns
    if (extension === 'ts' || extension === 'js') {
      // Check for common JS/TS vulnerabilities
      if (this.shouldGenerateStubVuln(0.1)) {
        vulnerabilities.push(
          this.createVulnerability(
            'injection',
            'high',
            filePath,
            'Potential SQL injection vulnerability',
            applicableCategories
          )
        );
      }

      if (this.shouldGenerateStubVuln(0.15)) {
        vulnerabilities.push(
          this.createVulnerability(
            'xss',
            'medium',
            filePath,
            'Potential XSS vulnerability - unsanitized user input',
            applicableCategories
          )
        );
      }

      if (this.shouldGenerateStubVuln(0.2)) {
        vulnerabilities.push(
          this.createVulnerability(
            'sensitive-data',
            'low',
            filePath,
            'Hardcoded credential detected',
            applicableCategories
          )
        );
      }
    }

    return { vulnerabilities, linesScanned };
  }

  private shouldGenerateStubVuln(probability: number): boolean {
    // For stub implementation, generate vulnerabilities randomly
    return Math.random() < probability;
  }

  private createVulnerability(
    category: VulnerabilityCategory,
    severity: VulnerabilitySeverity,
    file: string,
    description: string,
    applicableCategories: VulnerabilityCategory[]
  ): Vulnerability {
    if (!applicableCategories.includes(category)) {
      return this.createVulnerability(
        applicableCategories[0],
        severity,
        file,
        description,
        applicableCategories
      );
    }

    const location: VulnerabilityLocation = {
      file,
      line: Math.floor(Math.random() * 200) + 1,
      column: Math.floor(Math.random() * 80) + 1,
      snippet: '// Sample vulnerable code snippet',
    };

    const remediation: RemediationAdvice = {
      description: this.getRemediationForCategory(category),
      estimatedEffort: this.getEffortForSeverity(severity),
      automatable: severity === 'low' || severity === 'informational',
    };

    return {
      id: uuidv4(),
      title: this.getTitleForCategory(category),
      description,
      severity,
      category,
      location,
      remediation,
      references: this.getReferencesForCategory(category),
    };
  }

  private getTitleForCategory(category: VulnerabilityCategory): string {
    const titles: Record<VulnerabilityCategory, string> = {
      injection: 'Code Injection Vulnerability',
      'broken-auth': 'Broken Authentication',
      'sensitive-data': 'Sensitive Data Exposure',
      xxe: 'XML External Entity (XXE)',
      'access-control': 'Broken Access Control',
      'security-misconfiguration': 'Security Misconfiguration',
      xss: 'Cross-Site Scripting (XSS)',
      'insecure-deserialization': 'Insecure Deserialization',
      'vulnerable-components': 'Using Known Vulnerable Components',
      'insufficient-logging': 'Insufficient Logging & Monitoring',
    };
    return titles[category];
  }

  private getRemediationForCategory(category: VulnerabilityCategory): string {
    const remediations: Record<VulnerabilityCategory, string> = {
      injection: 'Use parameterized queries or prepared statements',
      'broken-auth': 'Implement proper session management and MFA',
      'sensitive-data': 'Encrypt sensitive data at rest and in transit',
      xxe: 'Disable external entity processing in XML parsers',
      'access-control': 'Implement proper authorization checks',
      'security-misconfiguration': 'Apply security hardening configurations',
      xss: 'Sanitize and encode all user input before rendering',
      'insecure-deserialization': 'Validate and sanitize deserialized data',
      'vulnerable-components': 'Update to patched versions of dependencies',
      'insufficient-logging': 'Implement comprehensive logging and monitoring',
    };
    return remediations[category];
  }

  private getReferencesForCategory(category: VulnerabilityCategory): string[] {
    const baseUrl = 'https://owasp.org/Top10/';
    return [`${baseUrl}A03_2021-${category}`];
  }

  private getEffortForSeverity(
    severity: VulnerabilitySeverity
  ): RemediationAdvice['estimatedEffort'] {
    const efforts: Record<VulnerabilitySeverity, RemediationAdvice['estimatedEffort']> = {
      critical: 'major',
      high: 'moderate',
      medium: 'minor',
      low: 'trivial',
      informational: 'trivial',
    };
    return efforts[severity];
  }

  private async performDynamicScan(
    targetUrl: string,
    options: DASTOptions
  ): Promise<{ vulnerabilities: Vulnerability[]; crawledUrls: number }> {
    // Stub: In production, this would perform actual dynamic scanning
    const vulnerabilities: Vulnerability[] = [];
    const crawledUrls = Math.min(
      (options.maxDepth ?? 5) * 20,
      Math.floor(Math.random() * 100) + 10
    );

    // Simulate finding vulnerabilities
    if (this.shouldGenerateStubVuln(0.25)) {
      const location: VulnerabilityLocation = {
        file: targetUrl,
        snippet: 'HTTP response header vulnerability',
      };

      vulnerabilities.push({
        id: uuidv4(),
        title: 'Missing Security Headers',
        description: 'Application is missing important security headers',
        severity: 'medium',
        category: 'security-misconfiguration',
        location,
        remediation: {
          description: 'Add X-Content-Type-Options, X-Frame-Options headers',
          estimatedEffort: 'trivial',
          automatable: true,
        },
        references: ['https://owasp.org/www-project-secure-headers/'],
      });
    }

    if (options.activeScanning && this.shouldGenerateStubVuln(0.15)) {
      const location: VulnerabilityLocation = {
        file: `${targetUrl}/api/users`,
        snippet: 'Reflected XSS in search parameter',
      };

      vulnerabilities.push({
        id: uuidv4(),
        title: 'Reflected Cross-Site Scripting',
        description: 'User input is reflected without proper sanitization',
        severity: 'high',
        category: 'xss',
        location,
        remediation: {
          description: 'Implement output encoding and Content Security Policy',
          estimatedEffort: 'moderate',
          automatable: false,
        },
        references: ['https://owasp.org/www-community/attacks/xss/'],
      });
    }

    return { vulnerabilities, crawledUrls };
  }

  private async performAuthenticatedScan(
    targetUrl: string,
    _credentials: AuthCredentials,
    options: DASTOptions
  ): Promise<{ vulnerabilities: Vulnerability[]; crawledUrls: number }> {
    // Stub: Similar to unauthenticated but can access protected endpoints
    const baseResult = await this.performDynamicScan(targetUrl, options);

    // Add authentication-specific checks
    if (this.shouldGenerateStubVuln(0.2)) {
      const location: VulnerabilityLocation = {
        file: `${targetUrl}/api/admin`,
        snippet: 'Insufficient authorization check',
      };

      baseResult.vulnerabilities.push({
        id: uuidv4(),
        title: 'Broken Access Control',
        description: 'Horizontal privilege escalation possible',
        severity: 'critical',
        category: 'access-control',
        location,
        remediation: {
          description: 'Implement proper role-based access control',
          estimatedEffort: 'major',
          automatable: false,
        },
        references: ['https://owasp.org/Top10/A01_2021-Broken_Access_Control/'],
      });
    }

    return {
      vulnerabilities: baseResult.vulnerabilities,
      crawledUrls: baseResult.crawledUrls * 1.5, // More URLs accessible when authenticated
    };
  }

  private validateCredentials(credentials: AuthCredentials): {
    valid: boolean;
    reason?: string;
  } {
    switch (credentials.type) {
      case 'basic':
        if (!credentials.username || !credentials.password) {
          return { valid: false, reason: 'Basic auth requires username and password' };
        }
        break;
      case 'bearer':
      case 'oauth':
        if (!credentials.token) {
          return { valid: false, reason: 'Bearer/OAuth auth requires token' };
        }
        break;
      case 'cookie':
        if (!credentials.token) {
          return { valid: false, reason: 'Cookie auth requires session cookie' };
        }
        break;
    }
    return { valid: true };
  }

  private async analyzeFalsePositive(
    vulnerability: Vulnerability
  ): Promise<FalsePositiveCheck> {
    // Stub: In production, use ML/AI to analyze context
    // For now, use heuristics

    let isFalsePositive = false;
    let confidence = 0.5;
    let reason = 'Manual review recommended';

    // Check for common false positive patterns
    if (vulnerability.severity === 'informational') {
      confidence = 0.3;
      reason = 'Low severity findings often require manual verification';
    }

    if (
      vulnerability.location.snippet?.includes('test') ||
      vulnerability.location.file.includes('test')
    ) {
      isFalsePositive = true;
      confidence = 0.8;
      reason = 'Vulnerability found in test code';
    }

    if (vulnerability.location.snippet?.includes('// nosec')) {
      isFalsePositive = true;
      confidence = 0.95;
      reason = 'Explicitly marked as ignored with nosec comment';
    }

    return { isFalsePositive, confidence, reason };
  }

  private calculateSummary(
    vulnerabilities: Vulnerability[],
    totalFiles: number,
    scanDurationMs: number
  ): ScanSummary {
    const summary: MutableScanSummary = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
      totalFiles,
      scanDurationMs,
    };

    for (const vuln of vulnerabilities) {
      summary[vuln.severity]++;
    }

    return summary as ScanSummary;
  }

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

  private async storeScanResults(
    scanId: string,
    scanType: string,
    vulnerabilities: Vulnerability[],
    summary: ScanSummary
  ): Promise<void> {
    await this.memory.set(
      `security:scan:${scanId}`,
      {
        scanId,
        scanType,
        vulnerabilities,
        summary,
        timestamp: new Date().toISOString(),
      },
      { namespace: 'security-compliance', ttl: 86400 * 7 } // 7 days
    );
  }
}

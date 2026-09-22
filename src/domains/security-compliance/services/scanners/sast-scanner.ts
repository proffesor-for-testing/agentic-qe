/**
 * Agentic QE v3 - SAST (Static Application Security Testing) Scanner
 * Performs static code analysis to detect security vulnerabilities
 */

import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { FilePath } from '@shared/value-objects/index.js';
import type { SecurityEngineEvidence, SecurityFileEvidence, SecurityScanEvidence } from '../../scan-evidence.js';
import { LoggerFactory } from '../../../../logging/index.js';
import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '@shared/types/index.js';
import type {
  SecurityPattern,
  SecurityScannerConfig,
  Vulnerability,
  VulnerabilitySeverity,
  VulnerabilityCategory,
  VulnerabilityLocation,
  RemediationAdvice,
  ScanSummary,
  SecurityCoverage,
  SASTResult,
  RuleSet,
  FalsePositiveCheck,
  MemoryBackend,
  HybridRouter,
  ChatResponse,
  MutableScanSummary,
  ScanStatus,
} from './scanner-types.js';
import { ALL_SECURITY_PATTERNS, BUILT_IN_RULE_SETS } from './security-patterns.js';
import { toError } from '@shared/error-utils.js';
import { safeJsonParse } from '@shared/safe-json.js';
import {
  isSemgrepAvailable,
  runSemgrepWithRules,
  convertSemgrepFindings,
} from '../semgrep-integration.js';

// ============================================================================
// SAST Scanner Service
// ============================================================================

/**
 * SAST Scanner - Static Application Security Testing
 * Scans source code files for security vulnerabilities using pattern matching
 */
const logger = LoggerFactory.create('security-compliance/sast-scanner');

export class SASTScanner {
  private readonly config: SecurityScannerConfig;
  private readonly memory: MemoryBackend;
  private readonly llmRouter?: HybridRouter;
  private readonly activeScans: Map<string, ScanStatus>;

  constructor(
    config: SecurityScannerConfig,
    memory: MemoryBackend,
    llmRouter?: HybridRouter,
    activeScans?: Map<string, ScanStatus>
  ) {
    this.config = config;
    this.memory = memory;
    this.llmRouter = llmRouter;
    this.activeScans = activeScans || new Map();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Scan files for security vulnerabilities using static analysis
   */
  async scanFiles(files: FilePath[]): Promise<Result<SASTResult>> {
    return this.scanWithRules(files, this.config.defaultRuleSets);
  }

  /**
   * Scan with specific rule sets.
   * Runs pattern-based scanning and semgrep (when available) in parallel,
   * then merges and deduplicates results.
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

      const startTime = Date.now();

      // Get applicable rule sets
      const ruleSets = BUILT_IN_RULE_SETS.filter((rs) =>
        ruleSetIds.includes(rs.id)
      );

      if (ruleSets.length === 0) {
        return err(new Error(`No valid rule sets found: ${ruleSetIds.join(', ')}`));
      }

      const unknownRuleSets = ruleSetIds.filter(id => !BUILT_IN_RULE_SETS.some(ruleSet => ruleSet.id === id));
      if (unknownRuleSets.length > 0) {
        return err(new Error('Unknown rule sets requested; no scan executed.'));
      }
      this.activeScans.set(scanId, 'running');

      // Deduplicate lexical absolute paths; do not follow symlinks to invent identity.
      const requestedPaths = [...new Set(files.map(file => path.resolve(file.value)))];
      const uniqueFiles = requestedPaths.map(value => FilePath.create(value));

      // Run independent engines while retaining each engine's execution outcome.
      const [patternResult, semgrepResult] = await Promise.all([
        this.runPatternScanning(uniqueFiles, ruleSets),
        this.runSemgrepScanning(uniqueFiles, ruleSetIds),
      ]);

      // Merge pattern-based and semgrep findings, deduplicating by file+line
      const vulnerabilities = this.mergeVulnerabilities(
        patternResult.vulnerabilities,
        semgrepResult.vulnerabilities
      );
      const analyzedFiles = patternResult.files.filter(file => file.status === 'analyzed');
      const linesScanned = analyzedFiles.reduce((total, file) => total + file.analyzedLines, 0);

      const scanDurationMs = Date.now() - startTime;

      // Calculate summary
      const summary = this.calculateSummary(
        vulnerabilities,
        analyzedFiles.length,
        scanDurationMs
      );

      const patterns = this.getApplicablePatterns(ruleSets);
      const ruleIds = analyzedFiles.length > 0 ? [...new Set(patterns.map(pattern => pattern.id))] : [];
      const coverage: SecurityCoverage = {
        filesScanned: analyzedFiles.length,
        linesScanned,
        rulesApplied: ruleIds.length,
        rulesAppliedScope: 'built-in-patterns',
      };
      const patternEngine: SecurityEngineEvidence = {
        id: 'patterns', requested: true, required: true, scope: 'requested-files',
        status: analyzedFiles.length === uniqueFiles.length ? 'completed' : analyzedFiles.length > 0 ? 'partial' : 'failed',
        analyzedFiles: analyzedFiles.length,
        ruleIds,
        rulesetDigest: createHash('sha256').update(JSON.stringify(patterns.map(pattern => ({
          id: pattern.id, category: pattern.category, expression: pattern.pattern.source, flags: pattern.pattern.flags,
        })))).digest('hex'),
        ruleCoverage: 'known',
        errors: patternResult.files.filter(file => file.status === 'unreadable').map(file => file.reason || 'File unreadable'),
        limitations: ['Built-in pattern matching covers supported JavaScript and TypeScript inputs only.'],
      };
      const evidence: SecurityScanEvidence = {
        schemaVersion: 1,
        completeness: analyzedFiles.length === uniqueFiles.length ? 'complete' : analyzedFiles.length > 0 ? 'partial' : 'none',
        requestedFiles: uniqueFiles.length,
        requestedPaths,
        duplicateInputs: files.length - uniqueFiles.length,
        files: patternResult.files,
        engines: [patternEngine, semgrepResult.evidence],
        limitations: [...patternEngine.limitations, ...semgrepResult.evidence.limitations],
      };

      // Store scan results in memory
      await this.storeScanResults(scanId, 'sast', vulnerabilities, summary);

      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        vulnerabilities,
        summary,
        coverage,
        evidence,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(toError(error));
    }
  }

  /**
   * Run pattern-based scanning on all files
   */
  private async runPatternScanning(
    files: FilePath[],
    ruleSets: RuleSet[]
  ): Promise<{ vulnerabilities: Vulnerability[]; files: SecurityFileEvidence[] }> {
    const vulnerabilities: Vulnerability[] = [];
    const receipts: SecurityFileEvidence[] = [];
    for (const file of files) {
      const result = await this.analyzeFile(file, ruleSets);
      vulnerabilities.push(...result.vulnerabilities);
      receipts.push(result.evidence);
    }
    return { vulnerabilities, files: receipts };
  }

  /**
   * Run semgrep scanning when enabled and available.
   * Optional engine failure preserves completed pattern analysis and its findings.
   */
  private async runSemgrepScanning(
    files: FilePath[],
    ruleSetIds: string[]
  ): Promise<{ vulnerabilities: Vulnerability[]; evidence: SecurityEngineEvidence }> {
    const targetDir = this.resolveTargetDirectory(files);
    const base: SecurityEngineEvidence = {
      id: 'semgrep', requested: !!this.config.enableSemgrep, required: false,
      status: 'disabled', scope: 'parent-directory', target: targetDir,
      ruleCoverage: 'unknown', errors: [], limitations: [],
    };
    if (!this.config.enableSemgrep) {
      return { vulnerabilities: [], evidence: base };
    }
    const limitations = [
      'Optional Semgrep scans a parent directory; requested-file membership and executed-rule coverage are unverified.',
    ];
    try {
      if (!await isSemgrepAvailable()) {
        return { vulnerabilities: [], evidence: { ...base, status: 'unavailable', limitations,
          errors: ['Semgrep is unavailable.'] } };
      }
      const semgrepResult = await runSemgrepWithRules(targetDir, ruleSetIds);
      const evidence: SecurityEngineEvidence = {
        ...base,
        status: semgrepResult.status || 'unverified',
        version: semgrepResult.version,
        errors: semgrepResult.errors.length > 0 ? [`Semgrep reported ${semgrepResult.errors.length} execution error(s).`] : [],
        limitations: [...limitations, ...(semgrepResult.diagnostics ?? []),
          ...(!semgrepResult.status ? ['Legacy Semgrep adapter returned no execution disposition.'] : [])],
      };
      // Convert semgrep findings to our Vulnerability format
      const converted = convertSemgrepFindings(semgrepResult.findings);
      const vulnerabilities = converted.map(f => ({
        id: uuidv4(),
        cveId: undefined,
        title: f.title,
        description: `[semgrep] ${f.description}`,
        severity: f.severity as VulnerabilitySeverity,
        category: this.mapSemgrepCategory(f.owaspCategory),
        location: {
          file: f.file,
          line: f.line,
          column: f.column,
          snippet: f.snippet,
        },
        remediation: {
          description: f.remediation,
          estimatedEffort: 'moderate' as const,
          automatable: false,
        },
        references: f.references,
      }));
      return { vulnerabilities, evidence };
    } catch {
      return { vulnerabilities: [], evidence: { ...base, status: 'failed', limitations,
        errors: ['Semgrep execution failed.'] } };
    }
  }

  /**
   * Resolve the common parent directory from a set of file paths
   */
  private resolveTargetDirectory(files: FilePath[]): string {
    if (files.length === 0) return process.cwd();
    let common = path.dirname(path.resolve(files[0].value));
    for (const file of files.slice(1)) {
      const directory = path.dirname(path.resolve(file.value));
      while (directory !== common && !directory.startsWith(common.endsWith(path.sep) ? common : common + path.sep)) {
        const parent = path.dirname(common);
        if (parent === common) break;
        common = parent;
      }
    }
    return common;
  }

  /**
   * Map semgrep OWASP category string to VulnerabilityCategory
   */
  private mapSemgrepCategory(owaspCategory?: string): VulnerabilityCategory {
    if (!owaspCategory) return 'injection';

    const categoryMap: Record<string, VulnerabilityCategory> = {
      'A01': 'access-control',
      'A02': 'sensitive-data',
      'A03': 'injection',
      'A04': 'insecure-deserialization',
      'A05': 'security-misconfiguration',
      'A06': 'vulnerable-components',
      'A07': 'broken-auth',
      'A08': 'insecure-deserialization',
      'A09': 'insufficient-logging',
      'A10': 'xxe',
    };

    // Try exact match or prefix match (e.g. "A03:2021-Injection")
    for (const [key, value] of Object.entries(categoryMap)) {
      if (owaspCategory.startsWith(key)) return value;
    }

    return 'injection';
  }

  /**
   * Merge pattern-based and semgrep vulnerabilities, deduplicating
   * findings that overlap on the same file and line.
   */
  private mergeVulnerabilities(
    patternVulns: Vulnerability[],
    semgrepVulns: Vulnerability[]
  ): Vulnerability[] {
    if (semgrepVulns.length === 0) return patternVulns;
    if (patternVulns.length === 0) return semgrepVulns;

    // Build a set of file:line keys from pattern results
    const patternKeys = new Set(
      patternVulns.map(v => `${v.location.file}:${v.location.line ?? 0}:${v.category}`)
    );

    // Only add semgrep findings that don't overlap with pattern findings
    const uniqueSemgrep = semgrepVulns.filter(
      v => !patternKeys.has(`${v.location.file}:${v.location.line ?? 0}:${v.category}`)
    );

    return [...patternVulns, ...uniqueSemgrep];
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

      // Analyze vulnerability using heuristics-based false positive detection
      const analysis = await this.analyzeFalsePositive(vulnerability);

      // Store the check result for learning
      await this.memory.set(
        `security:fp-check:${vulnerability.id}`,
        { vulnerability, analysis },
        { namespace: 'security-compliance', ttl: 86400 * 30 } // 30 days
      );

      return ok(analysis);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Analyze a file for security vulnerabilities using pattern-based detection
   */
  private getApplicablePatterns(ruleSets: RuleSet[]): SecurityPattern[] {
    const categories = new Set(ruleSets.flatMap(ruleSet => ruleSet.categories));
    return ALL_SECURITY_PATTERNS.filter(pattern => categories.has(pattern.category));
  }

  private async analyzeFile(
    file: FilePath,
    ruleSets: RuleSet[]
  ): Promise<{ vulnerabilities: Vulnerability[]; evidence: SecurityFileEvidence }> {
    const vulnerabilities: Vulnerability[] = [];
    const filePath = file.value;
    const receipt = { path: filePath, engineId: 'patterns', readLines: 0, analyzedLines: 0 };
    let content: string;
    let sourceDigest: string;
    try {
      const fs = await import('fs/promises');
      const bytes = await fs.readFile(filePath);
      sourceDigest = createHash('sha256').update(bytes).digest('hex');
      content = bytes.toString('utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { vulnerabilities: [], evidence: { ...receipt, status: 'unreadable',
        reason: typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code) ? code : 'File unreadable' } };
    }
    const lines = content.split('\n');
    const readReceipt = { ...receipt, sourceDigest, readLines: lines.length };
    const supportedExtensions = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'];
    if (!supportedExtensions.includes(file.extension)) {
      return { vulnerabilities: [], evidence: { ...readReceipt, status: 'unsupported',
        reason: 'Unsupported language for built-in SAST patterns' } };
    }
    const applicablePatterns = this.getApplicablePatterns(ruleSets);

    // Scan content for each pattern
    for (const securityPattern of applicablePatterns) {
      const matches = this.findPatternMatches(content, lines, securityPattern);
      for (const match of matches) {
        // Skip if in comments or string that looks like documentation
        if (this.isInComment(content, match.index) || this.isInDocumentation(match.snippet)) {
          continue;
        }

        // Skip nosec annotations
        if (this.hasNosecAnnotation(lines, match.line)) {
          continue;
        }

        vulnerabilities.push(
          this.createVulnerabilityFromPattern(securityPattern, filePath, match)
        );
      }
    }

    return { vulnerabilities, evidence: { ...readReceipt, status: 'analyzed', analyzedLines: lines.length } };
  }

  /**
   * Find all matches of a security pattern in the file content
   */
  private findPatternMatches(
    content: string,
    lines: string[],
    securityPattern: SecurityPattern
  ): Array<{ index: number; line: number; column: number; snippet: string }> {
    const matches: Array<{ index: number; line: number; column: number; snippet: string }> = [];

    // Reset regex state for global patterns
    const pattern = new RegExp(securityPattern.pattern.source, securityPattern.pattern.flags);

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const index = match.index;
      const { line, column } = this.getLineAndColumn(content, index);

      // Extract snippet with context (the matched line plus surrounding context)
      const snippetLines: string[] = [];
      const startLine = Math.max(0, line - 2);
      const endLine = Math.min(lines.length - 1, line + 1);
      for (let i = startLine; i <= endLine; i++) {
        snippetLines.push(lines[i]);
      }
      const snippet = snippetLines.join('\n');

      matches.push({ index, line: line + 1, column: column + 1, snippet }); // 1-indexed
    }

    return matches;
  }

  /**
   * Convert character index to line and column numbers
   */
  private getLineAndColumn(content: string, index: number): { line: number; column: number } {
    const beforeMatch = content.substring(0, index);
    const lines = beforeMatch.split('\n');
    const line = lines.length - 1;
    const column = lines[lines.length - 1].length;
    return { line, column };
  }

  /**
   * Check if the match is inside a comment
   */
  private isInComment(content: string, index: number): boolean {
    const beforeMatch = content.substring(0, index);

    // Check for single-line comment
    const lastNewline = beforeMatch.lastIndexOf('\n');
    const currentLine = beforeMatch.substring(lastNewline + 1);
    if (currentLine.includes('//')) {
      const commentStart = currentLine.indexOf('//');
      if (index - (beforeMatch.length - currentLine.length) > commentStart) {
        return true;
      }
    }

    // Check for multi-line comment
    const lastBlockCommentStart = beforeMatch.lastIndexOf('/*');
    const lastBlockCommentEnd = beforeMatch.lastIndexOf('*/');
    if (lastBlockCommentStart > lastBlockCommentEnd) {
      return true;
    }

    return false;
  }

  /**
   * Check if the snippet appears to be in documentation or test code examples
   */
  private isInDocumentation(snippet: string): boolean {
    const docPatterns = [
      /\*\s*@example/i,
      /\*\s*@description/i,
      /\/\/\s*example:/i,
      /\/\/\s*e\.g\./i,
      /```[\s\S]*```/,
    ];
    return docPatterns.some((pattern) => pattern.test(snippet));
  }

  /**
   * Check if the line has a nosec annotation
   */
  private hasNosecAnnotation(lines: string[], lineNumber: number): boolean {
    const lineIndex = lineNumber - 1;
    if (lineIndex < 0 || lineIndex >= lines.length) {
      return false;
    }

    const currentLine = lines[lineIndex];
    const previousLine = lineIndex > 0 ? lines[lineIndex - 1] : '';

    const nosecPatterns = [
      /\/\/\s*nosec/i,
      /\/\/\s*security-ignore/i,
      /\/\*\s*nosec\s*\*\//i,
      /#\s*nosec/i,
    ];

    return nosecPatterns.some(
      (pattern) => pattern.test(currentLine) || pattern.test(previousLine)
    );
  }

  /**
   * Create a Vulnerability object from a pattern match
   */
  private createVulnerabilityFromPattern(
    pattern: SecurityPattern,
    file: string,
    match: { line: number; column: number; snippet: string }
  ): Vulnerability {
    const location: VulnerabilityLocation = {
      file,
      line: match.line,
      column: match.column,
      snippet: match.snippet,
    };

    const remediation: RemediationAdvice = {
      description: pattern.remediation,
      fixExample: pattern.fixExample,
      estimatedEffort: this.getEffortForSeverity(pattern.severity),
      automatable: pattern.severity === 'low' || pattern.severity === 'informational',
    };

    return {
      id: uuidv4(),
      cveId: undefined,
      title: pattern.title,
      description: `${pattern.description} [${pattern.cweId}]`,
      severity: pattern.severity,
      category: pattern.category,
      location,
      remediation,
      references: [
        `https://owasp.org/Top10/${pattern.owaspId.replace(':', '_')}/`,
        `https://cwe.mitre.org/data/definitions/${pattern.cweId.replace('CWE-', '')}.html`,
      ],
    };
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

  /**
   * Analyze if a vulnerability detection is a false positive using heuristics
   */
  private async analyzeFalsePositive(
    vulnerability: Vulnerability
  ): Promise<FalsePositiveCheck> {
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

  /**
   * Calculate scan summary from vulnerabilities
   */
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

  /**
   * Store scan results in memory
   */
  private async storeScanResults(
    scanId: string,
    scanType: string,
    vulnerabilities: Vulnerability[],
    summary: ScanSummary
  ): Promise<void> {
    // Store summary only — full scan results caused 65MB bloat (Issue #258)
    const scanSummary = {
      scanId,
      scanType,
      summary,
      timestamp: new Date().toISOString(),
      vulnerabilityCount: vulnerabilities.length,
      // Keep only critical/high vulnerabilities in stored result
      criticalVulnerabilities: vulnerabilities.filter(
        (v) => v.severity === 'critical' || v.severity === 'high'
      ),
    };

    await this.memory.set(
      `security:scan:${scanId}`,
      scanSummary,
      { namespace: 'security-compliance', ttl: 86400 * 2 } // 2 days (reduced from 7)
    );
  }

  // ==========================================================================
  // LLM Enhancement Methods (ADR-051)
  // ==========================================================================

  /**
   * Check if LLM analysis is available and enabled
   */
  isLLMAnalysisAvailable(): boolean {
    return this.config.enableLLMAnalysis && this.llmRouter !== undefined;
  }

  /**
   * Get model ID for the configured tier
   */
  getModelForTier(tier: number): string {
    switch (tier) {
      case 1: return 'claude-haiku-4-5-20251001';
      case 2: return 'claude-sonnet-4-6';
      case 3: return 'claude-sonnet-4-6';
      case 4: return 'claude-opus-4-7';
      default: return 'claude-opus-4-7'; // Default to Opus for security
    }
  }

  /**
   * Analyze vulnerability with LLM for deeper insights
   */
  async analyzeVulnerabilityWithLLM(
    vuln: Vulnerability,
    codeContext: string
  ): Promise<RemediationAdvice> {
    if (!this.llmRouter) {
      return this.getDefaultRemediation(vuln);
    }

    try {
      const modelId = this.getModelForTier(this.config.llmModelTier);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are a senior security engineer. Analyze the vulnerability and provide:
1. Detailed explanation of the risk
2. Code example showing the fix
3. Effort estimate (trivial/minor/moderate/major)
4. Whether it's automatable
Be specific to the code context provided. Return JSON with: { "description": "", "fixExample": "", "estimatedEffort": "minor", "automatable": false }`,
          },
          {
            role: 'user',
            content: `Vulnerability: ${vuln.title} (${vuln.category})
Severity: ${vuln.severity}
Description: ${vuln.description}

Code context:
\`\`\`
${codeContext}
\`\`\`

Provide detailed remediation advice specific to this code.`,
          },
        ],
        model: modelId,
        maxTokens: 1500,
        temperature: 0.2,
        // Issue #568: per-agent routing rules (including the user's on-disk
        // `agentOverrides`) match on `agentType`; without it an override for
        // this agent never fires.
        agentType: 'qe-security-scanner',
      });

      if (response.content) {
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = safeJsonParse(jsonMatch[0]);
            return {
              description: analysis.description || vuln.remediation?.description || 'Review and fix the vulnerability',
              fixExample: analysis.fixExample || vuln.remediation?.fixExample,
              estimatedEffort: analysis.estimatedEffort || vuln.remediation?.estimatedEffort || 'moderate',
              automatable: analysis.automatable ?? vuln.remediation?.automatable ?? false,
              llmEnhanced: true,
            };
          }
        } catch {
          // JSON parse failed - use default
        }
      }
    } catch (error) {
      logger.warn('LLM analysis failed:');
    }

    return this.getDefaultRemediation(vuln);
  }

  /**
   * Get default remediation advice without LLM
   */
  private getDefaultRemediation(vuln: Vulnerability): RemediationAdvice {
    return vuln.remediation || {
      description: 'Review and fix the vulnerability following security best practices',
      estimatedEffort: 'moderate',
      automatable: false,
    };
  }
}

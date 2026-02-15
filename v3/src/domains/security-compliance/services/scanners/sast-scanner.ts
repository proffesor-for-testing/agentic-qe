/**
 * Agentic QE v3 - SAST (Static Application Security Testing) Scanner
 * Performs static code analysis to detect security vulnerabilities
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../../shared/types/index.js';
import type { FilePath } from '../../../../shared/value-objects/index.js';
import type {
  SecurityPattern,
  SecurityScannerConfig,
  Vulnerability,
  VulnerabilitySeverity,
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

// ============================================================================
// SAST Scanner Service
// ============================================================================

/**
 * SAST Scanner - Static Application Security Testing
 * Scans source code files for security vulnerabilities using pattern matching
 */
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
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Analyze a file for security vulnerabilities using pattern-based detection
   */
  private async analyzeFile(
    file: FilePath,
    ruleSets: RuleSet[]
  ): Promise<{ vulnerabilities: Vulnerability[]; linesScanned: number }> {
    const vulnerabilities: Vulnerability[] = [];
    const filePath = file.value;
    const extension = file.extension;

    // Read file content
    let content: string;
    let lines: string[];
    try {
      const fs = await import('fs/promises');
      content = await fs.readFile(filePath, 'utf-8');
      lines = content.split('\n');
    } catch {
      // File not accessible - return empty results
      return { vulnerabilities: [], linesScanned: 0 };
    }

    const linesScanned = lines.length;

    // Only scan supported file types
    const supportedExtensions = ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'];
    if (!supportedExtensions.includes(extension)) {
      return { vulnerabilities: [], linesScanned };
    }

    // Get applicable categories from rule sets
    const applicableCategories = new Set(ruleSets.flatMap((rs) => rs.categories));

    // Filter patterns to only those matching applicable categories
    const applicablePatterns = ALL_SECURITY_PATTERNS.filter((pattern) =>
      applicableCategories.has(pattern.category)
    );

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

    return { vulnerabilities, linesScanned };
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
      case 1: return 'claude-3-5-haiku-20241022';
      case 2: return 'claude-sonnet-4-20250514';
      case 3: return 'claude-sonnet-4-20250514';
      case 4: return 'claude-opus-4-5-20251101';
      default: return 'claude-opus-4-5-20251101'; // Default to Opus for security
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
      });

      if (response.content) {
        try {
          const jsonMatch = response.content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
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
      console.warn('[SASTScanner] LLM analysis failed:', error);
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

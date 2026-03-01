/**
 * Agentic QE v3 - RuVector Fallback Logic
 *
 * Rule-based fallback implementations when RuVector is unavailable.
 * All QE features MUST work without RuVector - this provides the baseline.
 */

import type {
  TestTask,
  AgentRoutingResult,
  FileComplexityResult,
  ComplexityMetrics,
  RiskClassification,
  DiffContext,
  FileChange,
  CoverageRoutingResult,
  FileCoverage,
  CoverageGap,
  GraphBoundariesResult,
  ModuleBoundary,
  BoundaryCrossing,
  QLearningRouter,
  ASTComplexityAnalyzer,
  DiffRiskClassifier,
  CoverageRouter,
  GraphBoundariesAnalyzer,
  QLearningState,
  QLearningAction,
} from './interfaces';
import type { AgentType, DomainName, Severity, Priority } from '../../shared/types';

// ============================================================================
// Fallback Q-Learning Router
// ============================================================================

/**
 * Rule-based fallback for Q-Learning router
 * Uses simple heuristics instead of ML-based routing
 */
export class FallbackQLearningRouter implements QLearningRouter {
  private feedback: Map<string, { success: boolean; durationMs: number; quality: number }[]> = new Map();

  async routeTask(task: TestTask): Promise<AgentRoutingResult> {
    const routing = this.computeRuleBasedRouting(task);
    return {
      ...routing,
      usedFallback: true,
    };
  }

  async routeTasks(tasks: TestTask[]): Promise<AgentRoutingResult[]> {
    return Promise.all(tasks.map((task) => this.routeTask(task)));
  }

  async provideFeedback(
    taskId: string,
    result: { success: boolean; durationMs: number; quality: number }
  ): Promise<void> {
    const existing = this.feedback.get(taskId) || [];
    existing.push(result);
    this.feedback.set(taskId, existing);
  }

  getQValue(_state: QLearningState, _action: QLearningAction): number {
    // Fallback returns neutral Q-value
    return 0.5;
  }

  async reset(): Promise<void> {
    this.feedback.clear();
  }

  async exportModel(): Promise<Record<string, unknown>> {
    return {
      type: 'fallback',
      feedback: Object.fromEntries(this.feedback),
    };
  }

  async importModel(_model: Record<string, unknown>): Promise<void> {
    // Fallback does not support model import
  }

  private computeRuleBasedRouting(task: TestTask): Omit<AgentRoutingResult, 'usedFallback'> {
    const { agentType, domain, confidence, reasoning } = this.mapTaskToAgent(task);

    const alternatives = this.getAlternatives(task, agentType, domain);

    return {
      agentType,
      domain,
      confidence,
      reasoning,
      alternatives,
    };
  }

  private mapTaskToAgent(task: TestTask): {
    agentType: AgentType;
    domain: DomainName;
    confidence: number;
    reasoning: string;
  } {
    // Rule-based mapping based on task type
    switch (task.type) {
      case 'unit':
        return {
          agentType: 'tester',
          domain: task.domain || 'test-execution',
          confidence: 0.8,
          reasoning: `Unit test task routed to tester agent based on task type`,
        };

      case 'integration':
        return {
          agentType: 'tester',
          domain: 'contract-testing',
          confidence: 0.75,
          reasoning: `Integration test routed to contract-testing domain`,
        };

      case 'e2e':
        return {
          agentType: 'tester',
          domain: 'visual-accessibility',
          confidence: 0.7,
          reasoning: `E2E test may involve visual/accessibility checks`,
        };

      case 'performance':
        return {
          agentType: 'analyzer',
          domain: 'chaos-resilience',
          confidence: 0.8,
          reasoning: `Performance test routed to chaos-resilience domain`,
        };

      case 'security':
        return {
          agentType: 'validator',
          domain: 'security-compliance',
          confidence: 0.85,
          reasoning: `Security test routed to security-compliance domain`,
        };

      case 'accessibility':
        return {
          agentType: 'validator',
          domain: 'visual-accessibility',
          confidence: 0.85,
          reasoning: `Accessibility test routed to visual-accessibility domain`,
        };

      default:
        return {
          agentType: 'tester',
          domain: 'test-execution',
          confidence: 0.6,
          reasoning: `Default routing for unknown task type`,
        };
    }
  }

  private getAlternatives(
    task: TestTask,
    primaryAgent: AgentType,
    primaryDomain: DomainName
  ): Array<{ agentType: AgentType; domain: DomainName; confidence: number }> {
    const alternatives: Array<{ agentType: AgentType; domain: DomainName; confidence: number }> = [];

    // Add analyzer as alternative for complex tasks
    if ((task.complexity || 0) > 0.7 && primaryAgent !== 'analyzer') {
      alternatives.push({
        agentType: 'analyzer',
        domain: 'code-intelligence',
        confidence: 0.6,
      });
    }

    // Add validator as alternative for high-priority tasks
    if (task.priority === 'p0' && primaryAgent !== 'validator') {
      alternatives.push({
        agentType: 'validator',
        domain: primaryDomain,
        confidence: 0.65,
      });
    }

    // Add specialist as generic alternative
    if (primaryAgent !== 'specialist') {
      alternatives.push({
        agentType: 'specialist',
        domain: primaryDomain,
        confidence: 0.5,
      });
    }

    return alternatives;
  }
}

// ============================================================================
// Fallback AST Complexity Analyzer
// ============================================================================

/**
 * Rule-based fallback for AST complexity analysis
 * Uses simple heuristics based on file size and patterns
 */
export class FallbackASTComplexityAnalyzer implements ASTComplexityAnalyzer {
  async analyzeFile(filePath: string): Promise<FileComplexityResult> {
    // Estimate complexity based on file path patterns
    const metrics = this.estimateComplexity(filePath);
    const overallScore = this.calculateOverallScore(metrics);
    const riskLevel = this.scoreToRiskLevel(overallScore);

    return {
      filePath,
      metrics,
      overallScore,
      riskLevel,
      hotspots: [],
      recommendations: this.generateRecommendations(overallScore),
      analyzedAt: new Date(),
      usedFallback: true,
    };
  }

  async analyzeFiles(filePaths: string[]): Promise<FileComplexityResult[]> {
    return Promise.all(filePaths.map((fp) => this.analyzeFile(fp)));
  }

  async getComplexityRanking(
    filePaths: string[]
  ): Promise<Array<{ filePath: string; score: number; priority: Priority }>> {
    const results = await this.analyzeFiles(filePaths);
    return results
      .map((r) => ({
        filePath: r.filePath,
        score: r.overallScore,
        priority: this.scoreToPriority(r.overallScore),
      }))
      .sort((a, b) => b.score - a.score);
  }

  async suggestTestFocus(
    filePaths: string[]
  ): Promise<Array<{ filePath: string; functions: string[]; reason: string }>> {
    const results = await this.analyzeFiles(filePaths);
    return results
      .filter((r) => r.overallScore > 0.5)
      .map((r) => ({
        filePath: r.filePath,
        functions: [], // Fallback cannot identify specific functions
        reason: `High complexity score (${r.overallScore.toFixed(2)}) suggests focused testing`,
      }));
  }

  private estimateComplexity(filePath: string): ComplexityMetrics {
    // Estimate complexity based on file patterns
    const isTestFile = filePath.includes('.test.') || filePath.includes('.spec.');
    const isConfigFile = filePath.includes('config') || filePath.endsWith('.json');
    const isTypeFile = filePath.endsWith('.d.ts') || filePath.includes('types');

    let baseComplexity = 5;

    // Adjust based on file type
    if (isTestFile) baseComplexity = 3;
    if (isConfigFile) baseComplexity = 2;
    if (isTypeFile) baseComplexity = 1;

    // Adjust based on path depth (deeper = potentially more complex)
    const depth = filePath.split('/').length;
    baseComplexity += Math.min(depth * 0.5, 5);

    // Adjust based on known complex patterns
    if (filePath.includes('service') || filePath.includes('handler')) baseComplexity += 3;
    if (filePath.includes('util') || filePath.includes('helper')) baseComplexity -= 2;

    return {
      cyclomatic: Math.max(1, Math.round(baseComplexity)),
      cognitive: Math.max(1, Math.round(baseComplexity * 1.2)),
      linesOfCode: Math.round(baseComplexity * 50),
      dependencies: Math.max(0, Math.round(baseComplexity * 2)),
      inheritanceDepth: Math.min(3, Math.max(0, Math.round(baseComplexity / 5))),
      coupling: Math.min(1, baseComplexity / 20),
      cohesion: Math.max(0.3, 1 - baseComplexity / 30),
      halsteadDifficulty: baseComplexity * 2,
      maintainabilityIndex: Math.max(20, 100 - baseComplexity * 5),
    };
  }

  private calculateOverallScore(metrics: ComplexityMetrics): number {
    // Weighted average of normalized metrics
    const cyclomaticNorm = Math.min(1, metrics.cyclomatic / 20);
    const cognitiveNorm = Math.min(1, metrics.cognitive / 30);
    const couplingScore = metrics.coupling;
    const cohesionPenalty = 1 - metrics.cohesion;
    const maintainabilityPenalty = 1 - metrics.maintainabilityIndex / 100;

    return (
      cyclomaticNorm * 0.25 +
      cognitiveNorm * 0.25 +
      couplingScore * 0.2 +
      cohesionPenalty * 0.15 +
      maintainabilityPenalty * 0.15
    );
  }

  private scoreToRiskLevel(score: number): Severity {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.2) return 'low';
    return 'info';
  }

  private scoreToPriority(score: number): Priority {
    if (score >= 0.8) return 'p0';
    if (score >= 0.6) return 'p1';
    if (score >= 0.4) return 'p2';
    return 'p3';
  }

  private generateRecommendations(score: number): string[] {
    const recommendations: string[] = [];

    if (score >= 0.6) {
      recommendations.push('Consider breaking down complex functions into smaller units');
      recommendations.push('Add unit tests for high-complexity code paths');
    }

    if (score >= 0.4) {
      recommendations.push('Review and document complex logic');
      recommendations.push('Consider refactoring to reduce coupling');
    }

    return recommendations;
  }
}

// ============================================================================
// Fallback Diff Risk Classifier
// ============================================================================

/**
 * Rule-based fallback for diff risk classification
 */
export class FallbackDiffRiskClassifier implements DiffRiskClassifier {
  private readonly HIGH_RISK_PATTERNS = [
    'auth', 'security', 'password', 'token', 'secret', 'key',
    'payment', 'billing', 'crypto', 'encrypt', 'decrypt',
    'database', 'migration', 'schema', 'sql',
    'permission', 'role', 'access', 'admin',
  ];

  private readonly SENSITIVE_FILE_PATTERNS = [
    /\.env/,
    /config.*\.(ts|js|json)$/,
    /secrets?\./,
    /credentials?\./,
    /\.pem$/,
    /\.key$/,
  ];

  async classifyDiff(context: DiffContext): Promise<RiskClassification> {
    const { score, factors } = this.calculateRiskScore(context);
    const level = this.scoreToLevel(score);
    const highRiskFiles = this.identifyHighRiskFiles(context.files);
    const recommendedTests = this.getRecommendedTests(context, level);

    return {
      level,
      score,
      factors,
      highRiskFiles,
      recommendedTests,
      usedFallback: true,
    };
  }

  async rankFilesByRisk(
    files: FileChange[]
  ): Promise<Array<{ filePath: string; riskScore: number; riskLevel: Severity }>> {
    return files
      .map((file) => {
        const riskScore = this.calculateFileRisk(file);
        return {
          filePath: file.filePath,
          riskScore,
          riskLevel: this.scoreToLevel(riskScore),
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  async requiresSecurityReview(context: DiffContext): Promise<boolean> {
    return context.files.some((file) => {
      const path = file.filePath.toLowerCase();
      return this.HIGH_RISK_PATTERNS.some((pattern) => path.includes(pattern));
    });
  }

  async getRecommendedReviewers(_context: DiffContext): Promise<string[]> {
    // Fallback cannot determine specific reviewers
    return [];
  }

  async predictDefects(
    context: DiffContext
  ): Promise<Array<{ filePath: string; probability: number; type: string; location?: { line: number; column: number } }>> {
    return context.files
      .filter((f) => f.additions > 50 || f.deletions > 50)
      .map((file) => ({
        filePath: file.filePath,
        probability: Math.min(0.8, (file.additions + file.deletions) / 200),
        type: file.additions > file.deletions ? 'new-code-defect' : 'regression',
      }));
  }

  private calculateRiskScore(context: DiffContext): {
    score: number;
    factors: Array<{ name: string; weight: number; description: string }>;
  } {
    const factors: Array<{ name: string; weight: number; description: string }> = [];
    let totalWeight = 0;
    let weightedSum = 0;

    // Factor: Total lines changed
    const totalChanges = context.files.reduce(
      (sum, f) => sum + f.additions + f.deletions,
      0
    );
    if (totalChanges > 500) {
      const weight = 0.3;
      factors.push({
        name: 'large-change',
        weight,
        description: `Large changeset with ${totalChanges} lines modified`,
      });
      weightedSum += weight;
      totalWeight += weight;
    }

    // Factor: Files with sensitive patterns
    const sensitiveFiles = context.files.filter((f) =>
      this.SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(f.filePath))
    );
    if (sensitiveFiles.length > 0) {
      const weight = 0.4;
      factors.push({
        name: 'sensitive-files',
        weight,
        description: `${sensitiveFiles.length} sensitive files modified`,
      });
      weightedSum += weight;
      totalWeight += weight;
    }

    // Factor: High-risk code patterns
    const highRiskFiles = context.files.filter((f) =>
      this.HIGH_RISK_PATTERNS.some((pattern) =>
        f.filePath.toLowerCase().includes(pattern)
      )
    );
    if (highRiskFiles.length > 0) {
      const weight = 0.35;
      factors.push({
        name: 'high-risk-patterns',
        weight,
        description: `${highRiskFiles.length} files touch security-sensitive areas`,
      });
      weightedSum += weight;
      totalWeight += weight;
    }

    // Factor: Deleted files
    const deletedFiles = context.files.filter((f) => f.status === 'deleted');
    if (deletedFiles.length > 0) {
      const weight = 0.2;
      factors.push({
        name: 'file-deletions',
        weight,
        description: `${deletedFiles.length} files deleted`,
      });
      weightedSum += weight * 0.7;
      totalWeight += weight;
    }

    // Factor: File count
    if (context.files.length > 10) {
      const weight = 0.15;
      factors.push({
        name: 'many-files',
        weight,
        description: `${context.files.length} files modified`,
      });
      weightedSum += weight * 0.6;
      totalWeight += weight;
    }

    const score = totalWeight > 0 ? weightedSum / totalWeight : 0.2;
    return { score: Math.min(1, score), factors };
  }

  private calculateFileRisk(file: FileChange): number {
    let risk = 0.2; // Base risk

    // Sensitive file patterns
    if (this.SENSITIVE_FILE_PATTERNS.some((p) => p.test(file.filePath))) {
      risk += 0.4;
    }

    // High-risk code patterns
    if (this.HIGH_RISK_PATTERNS.some((p) => file.filePath.toLowerCase().includes(p))) {
      risk += 0.3;
    }

    // Large changes
    const totalChanges = file.additions + file.deletions;
    if (totalChanges > 100) risk += 0.2;
    if (totalChanges > 500) risk += 0.2;

    // Deleted files
    if (file.status === 'deleted') risk += 0.1;

    return Math.min(1, risk);
  }

  private scoreToLevel(score: number): Severity {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.2) return 'low';
    return 'info';
  }

  private identifyHighRiskFiles(files: FileChange[]): string[] {
    return files
      .filter((f) => this.calculateFileRisk(f) >= 0.6)
      .map((f) => f.filePath);
  }

  private getRecommendedTests(
    context: DiffContext,
    level: Severity
  ): Array<{ type: 'unit' | 'integration' | 'e2e' | 'security' | 'performance'; priority: Priority; reason: string }> {
    const tests: Array<{
      type: 'unit' | 'integration' | 'e2e' | 'security' | 'performance';
      priority: Priority;
      reason: string;
    }> = [];

    // Always recommend unit tests
    tests.push({
      type: 'unit',
      priority: level === 'critical' || level === 'high' ? 'p0' : 'p1',
      reason: 'Verify core functionality of changed code',
    });

    // Integration tests for moderate+ risk
    if (level !== 'info' && level !== 'low') {
      tests.push({
        type: 'integration',
        priority: level === 'critical' ? 'p0' : 'p1',
        reason: 'Verify component interactions',
      });
    }

    // Security tests for security-related changes
    if (
      context.files.some((f) =>
        this.HIGH_RISK_PATTERNS.some((p) => f.filePath.toLowerCase().includes(p))
      )
    ) {
      tests.push({
        type: 'security',
        priority: 'p0',
        reason: 'Changes affect security-sensitive code',
      });
    }

    // E2E for high risk
    if (level === 'critical' || level === 'high') {
      tests.push({
        type: 'e2e',
        priority: 'p1',
        reason: 'High-risk changes require end-to-end validation',
      });
    }

    return tests;
  }
}

// ============================================================================
// Fallback Coverage Router
// ============================================================================

/**
 * Rule-based fallback for coverage routing
 */
export class FallbackCoverageRouter implements CoverageRouter {
  private readonly DEFAULT_TARGET_COVERAGE = 80;

  async analyzeCoverage(
    coverageData: FileCoverage[],
    targetCoverage: number = this.DEFAULT_TARGET_COVERAGE
  ): Promise<CoverageRoutingResult> {
    const gaps = await this.getCoverageGaps(coverageData);
    const prioritizedFiles = this.prioritizeFiles(coverageData, targetCoverage, gaps);
    const testGenerationTargets = this.getTestGenerationTargets(coverageData);
    const agentAssignments = this.assignAgents(prioritizedFiles);

    return {
      prioritizedFiles,
      testGenerationTargets,
      agentAssignments,
      usedFallback: true,
    };
  }

  async getCoverageGaps(coverageData: FileCoverage[]): Promise<CoverageGap[]> {
    const gaps: CoverageGap[] = [];

    for (const coverage of coverageData) {
      // Line coverage gaps
      if (coverage.uncoveredLines.length > 0) {
        gaps.push({
          filePath: coverage.filePath,
          gapType: 'line',
          severity: this.gapSeverity(coverage.lineCoverage),
          lines: coverage.uncoveredLines,
          recommendation: `Add tests for ${coverage.uncoveredLines.length} uncovered lines`,
        });
      }

      // Branch coverage gaps
      if (coverage.uncoveredBranches.length > 0) {
        gaps.push({
          filePath: coverage.filePath,
          gapType: 'branch',
          severity: this.gapSeverity(coverage.branchCoverage),
          lines: coverage.uncoveredBranches.map((b) => b.line),
          recommendation: `Add tests for ${coverage.uncoveredBranches.length} uncovered branches`,
        });
      }

      // Function coverage gaps
      if (coverage.uncoveredFunctions.length > 0) {
        gaps.push({
          filePath: coverage.filePath,
          gapType: 'function',
          severity: this.gapSeverity(coverage.functionCoverage),
          functions: coverage.uncoveredFunctions,
          recommendation: `Add tests for functions: ${coverage.uncoveredFunctions.join(', ')}`,
        });
      }
    }

    return gaps;
  }

  async prioritizeForCoverage(
    files: string[],
    coverageData: FileCoverage[]
  ): Promise<string[]> {
    const coverageMap = new Map(coverageData.map((c) => [c.filePath, c]));

    return files.sort((a, b) => {
      const coverageA = coverageMap.get(a);
      const coverageB = coverageMap.get(b);

      if (!coverageA && !coverageB) return 0;
      if (!coverageA) return 1;
      if (!coverageB) return -1;

      // Lower coverage = higher priority (comes first)
      return coverageA.lineCoverage - coverageB.lineCoverage;
    });
  }

  async suggestTestsForCoverage(
    filePath: string,
    coverage: FileCoverage
  ): Promise<Array<{ testType: string; target: string; expectedCoverageGain: number }>> {
    const suggestions: Array<{ testType: string; target: string; expectedCoverageGain: number }> = [];

    // Suggest tests for uncovered functions
    for (const func of coverage.uncoveredFunctions) {
      suggestions.push({
        testType: 'unit',
        target: `${filePath}:${func}`,
        expectedCoverageGain: Math.min(20, 100 / Math.max(1, coverage.uncoveredFunctions.length)),
      });
    }

    // Suggest branch coverage tests
    if (coverage.uncoveredBranches.length > 0) {
      suggestions.push({
        testType: 'branch',
        target: `${filePath} branches`,
        expectedCoverageGain: Math.min(15, (100 - coverage.branchCoverage) / 3),
      });
    }

    return suggestions;
  }

  private prioritizeFiles(
    coverageData: FileCoverage[],
    targetCoverage: number,
    gaps: CoverageGap[]
  ): Array<{
    filePath: string;
    currentCoverage: number;
    targetCoverage: number;
    gaps: CoverageGap[];
    priority: Priority;
  }> {
    return coverageData
      .filter((c) => c.lineCoverage < targetCoverage)
      .map((c) => ({
        filePath: c.filePath,
        currentCoverage: c.lineCoverage,
        targetCoverage,
        gaps: gaps.filter((g) => g.filePath === c.filePath),
        priority: this.coverageToPriority(c.lineCoverage),
      }))
      .sort((a, b) => a.currentCoverage - b.currentCoverage);
  }

  private getTestGenerationTargets(
    coverageData: FileCoverage[]
  ): Array<{ filePath: string; functions: string[]; reason: string }> {
    return coverageData
      .filter((c) => c.uncoveredFunctions.length > 0)
      .map((c) => ({
        filePath: c.filePath,
        functions: c.uncoveredFunctions,
        reason: `${c.uncoveredFunctions.length} untested functions`,
      }));
  }

  private assignAgents(
    prioritizedFiles: Array<{
      filePath: string;
      currentCoverage: number;
      priority: Priority;
    }>
  ): Array<{ agentType: AgentType; domain: DomainName; files: string[] }> {
    const assignments: Array<{ agentType: AgentType; domain: DomainName; files: string[] }> = [];

    // Group files by priority
    const p0Files = prioritizedFiles.filter((f) => f.priority === 'p0').map((f) => f.filePath);
    const p1Files = prioritizedFiles.filter((f) => f.priority === 'p1').map((f) => f.filePath);
    const otherFiles = prioritizedFiles.filter((f) => f.priority !== 'p0' && f.priority !== 'p1').map((f) => f.filePath);

    if (p0Files.length > 0) {
      assignments.push({
        agentType: 'generator',
        domain: 'test-generation',
        files: p0Files,
      });
    }

    if (p1Files.length > 0) {
      assignments.push({
        agentType: 'tester',
        domain: 'coverage-analysis',
        files: p1Files,
      });
    }

    if (otherFiles.length > 0) {
      assignments.push({
        agentType: 'specialist',
        domain: 'test-execution',
        files: otherFiles,
      });
    }

    return assignments;
  }

  private gapSeverity(coverage: number): Severity {
    if (coverage < 30) return 'critical';
    if (coverage < 50) return 'high';
    if (coverage < 70) return 'medium';
    if (coverage < 80) return 'low';
    return 'info';
  }

  private coverageToPriority(coverage: number): Priority {
    if (coverage < 30) return 'p0';
    if (coverage < 50) return 'p1';
    if (coverage < 70) return 'p2';
    return 'p3';
  }
}

// ============================================================================
// Fallback Graph Boundaries Analyzer
// ============================================================================

/**
 * Rule-based fallback for graph boundaries analysis
 */
export class FallbackGraphBoundariesAnalyzer implements GraphBoundariesAnalyzer {
  async analyzeBoundaries(entryPoints: string[]): Promise<GraphBoundariesResult> {
    const modules = this.inferModules(entryPoints);
    const boundaries = this.inferBoundaries(modules);
    const criticalBoundaries = boundaries
      .filter((b) => b.riskScore > 0.6)
      .map((b) => `${b.fromModule}->${b.toModule}`);

    return {
      modules,
      boundaries,
      criticalBoundaries,
      integrationTestSuggestions: this.suggestTests(boundaries),
      violations: [],
      usedFallback: true,
    };
  }

  async getBoundaryCrossings(modules: string[]): Promise<BoundaryCrossing[]> {
    // Fallback cannot determine actual crossings
    return modules.slice(0, -1).map((mod, i) => ({
      fromModule: mod,
      toModule: modules[i + 1],
      crossings: [],
      riskScore: 0.5,
      requiresIntegrationTest: true,
    }));
  }

  async getCriticalPaths(): Promise<Array<{ path: string[]; importance: number; reason: string }>> {
    // Fallback cannot determine critical paths
    return [];
  }

  async suggestIntegrationTests(): Promise<Array<{
    location: string;
    modules: string[];
    priority: Priority;
    reason: string;
  }>> {
    return [];
  }

  async detectViolations(): Promise<Array<{
    type: string;
    location: string;
    severity: Severity;
    suggestion: string;
  }>> {
    // Fallback cannot detect violations without actual graph analysis
    return [];
  }

  private inferModules(entryPoints: string[]): ModuleBoundary[] {
    // Infer modules from directory structure
    const moduleMap = new Map<string, string[]>();

    for (const entry of entryPoints) {
      const parts = entry.split('/');
      const moduleName = parts.length > 1 ? parts[parts.length - 2] : 'root';

      const existing = moduleMap.get(moduleName) || [];
      existing.push(entry);
      moduleMap.set(moduleName, existing);
    }

    return Array.from(moduleMap.entries()).map(([module, files]) => ({
      module,
      files,
      publicAPIs: [],
      dependencies: [],
      couplingScore: 0.5, // Default
      cohesionScore: 0.7, // Default
    }));
  }

  private inferBoundaries(modules: ModuleBoundary[]): BoundaryCrossing[] {
    const boundaries: BoundaryCrossing[] = [];

    // Create boundaries between adjacent modules
    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        boundaries.push({
          fromModule: modules[i].module,
          toModule: modules[j].module,
          crossings: [],
          riskScore: 0.5,
          requiresIntegrationTest: true,
        });
      }
    }

    return boundaries;
  }

  private suggestTests(boundaries: BoundaryCrossing[]): Array<{
    fromModule: string;
    toModule: string;
    reason: string;
    priority: Priority;
  }> {
    return boundaries
      .filter((b) => b.requiresIntegrationTest)
      .map((b) => ({
        fromModule: b.fromModule,
        toModule: b.toModule,
        reason: 'Cross-module boundary should be tested',
        priority: b.riskScore > 0.7 ? 'p0' : 'p1',
      }));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create fallback implementations for all RuVector components
 */
export function createFallbackComponents(): {
  qLearningRouter: QLearningRouter;
  astComplexityAnalyzer: ASTComplexityAnalyzer;
  diffRiskClassifier: DiffRiskClassifier;
  coverageRouter: CoverageRouter;
  graphBoundariesAnalyzer: GraphBoundariesAnalyzer;
} {
  return {
    qLearningRouter: new FallbackQLearningRouter(),
    astComplexityAnalyzer: new FallbackASTComplexityAnalyzer(),
    diffRiskClassifier: new FallbackDiffRiskClassifier(),
    coverageRouter: new FallbackCoverageRouter(),
    graphBoundariesAnalyzer: new FallbackGraphBoundariesAnalyzer(),
  };
}

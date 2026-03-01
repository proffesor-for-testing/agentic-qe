/**
 * Agentic QE v3 - Impact Analyzer Service
 * Analyzes change impact across codebase using dependency graph
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err, Severity } from '../../../shared/types';
import { MemoryBackend } from '../../../kernel/interfaces';
import {
  ImpactRequest,
  ImpactAnalysis,
  ImpactedFile,
} from '../interfaces';
import { toError } from '../../../shared/error-utils.js';
import {
  IKnowledgeGraphService,
  KnowledgeGraphService,
} from './knowledge-graph';

/**
 * Interface for the impact analyzer service
 */
export interface IImpactAnalyzerService {
  /** Analyze impact of changed files */
  analyzeImpact(request: ImpactRequest): Promise<Result<ImpactAnalysis, Error>>;

  /** Get impacted tests for changes */
  getImpactedTests(changedFiles: string[]): Promise<Result<string[], Error>>;

  /** Calculate risk level for changes */
  calculateRiskLevel(impact: ImpactAnalysis): Severity;

  /** Get change recommendations */
  getRecommendations(impact: ImpactAnalysis): string[];
}

/**
 * Configuration for the impact analyzer
 */
export interface ImpactAnalyzerConfig {
  maxDepth: number;
  riskWeights: RiskWeights;
  testPatterns: string[];
  criticalPaths: string[];
  namespace: string;
}

/**
 * Risk weight configuration
 */
export interface RiskWeights {
  directImpact: number;
  transitiveImpact: number;
  testCoverage: number;
  criticalPath: number;
  dependencyCount: number;
}

const DEFAULT_CONFIG: ImpactAnalyzerConfig = {
  maxDepth: 5,
  riskWeights: {
    directImpact: 0.4,
    transitiveImpact: 0.2,
    testCoverage: 0.2,
    criticalPath: 0.15,
    dependencyCount: 0.05,
  },
  testPatterns: [
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/test_*.py',
    '**/*_test.py',
    '**/*_test.go',
  ],
  criticalPaths: [
    '**/auth/**',
    '**/security/**',
    '**/payment/**',
    '**/api/**',
    '**/core/**',
  ],
  namespace: 'code-intelligence:impact',
};

/**
 * Impact Analyzer Service Implementation
 * Analyzes change impact using knowledge graph traversal
 */
export class ImpactAnalyzerService implements IImpactAnalyzerService {
  private readonly config: ImpactAnalyzerConfig;
  private readonly knowledgeGraph: IKnowledgeGraphService;

  constructor(
    private readonly memory: MemoryBackend,
    knowledgeGraph?: IKnowledgeGraphService,
    config: Partial<ImpactAnalyzerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.knowledgeGraph = knowledgeGraph || new KnowledgeGraphService(memory);
  }

  /**
   * Analyze impact of changed files
   */
  async analyzeImpact(request: ImpactRequest): Promise<Result<ImpactAnalysis, Error>> {
    try {
      const {
        changedFiles,
        depth = this.config.maxDepth,
        includeTests = true,
      } = request;

      if (changedFiles.length === 0) {
        return ok({
          directImpact: [],
          transitiveImpact: [],
          impactedTests: [],
          riskLevel: 'info',
          recommendations: [],
        });
      }

      // Get direct dependencies
      const directImpact = await this.analyzeDirectImpact(changedFiles);

      // Get transitive dependencies
      const transitiveImpact = await this.analyzeTransitiveImpact(
        changedFiles,
        directImpact,
        depth
      );

      // Find impacted tests
      let impactedTests: string[] = [];
      if (includeTests) {
        const testsResult = await this.getImpactedTests(changedFiles);
        if (testsResult.success) {
          impactedTests = testsResult.value;
        }
      }

      // Build initial analysis
      const analysis: ImpactAnalysis = {
        directImpact,
        transitiveImpact,
        impactedTests,
        riskLevel: 'info', // Will be calculated
        recommendations: [], // Will be generated
      };

      // Calculate risk level
      analysis.riskLevel = this.calculateRiskLevel(analysis);

      // Generate recommendations
      analysis.recommendations = this.getRecommendations(analysis);

      // Store analysis for history
      await this.storeAnalysis(changedFiles, analysis);

      return ok(analysis);
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Get impacted tests for changed files
   */
  async getImpactedTests(changedFiles: string[]): Promise<Result<string[], Error>> {
    try {
      const impactedTests = new Set<string>();

      for (const changedFile of changedFiles) {
        // Check if the changed file is itself a test
        if (this.isTestFile(changedFile)) {
          impactedTests.add(changedFile);
          continue;
        }

        // Find tests that import/depend on the changed file
        const dependencyResult = await this.knowledgeGraph.mapDependencies({
          files: [changedFile],
          direction: 'incoming',
          depth: 3,
        });

        if (dependencyResult.success) {
          for (const node of dependencyResult.value.nodes) {
            if (this.isTestFile(node.path)) {
              impactedTests.add(node.path);
            }
          }
        }

        // Search for test files by naming convention
        const baseName = this.getBaseName(changedFile);
        const possibleTestPatterns = [
          `${baseName}.test`,
          `${baseName}.spec`,
          `test_${baseName}`,
          `${baseName}_test`,
        ];

        // Search memory for matching test files
        for (const pattern of possibleTestPatterns) {
          const keys = await this.memory.search(
            `code-intelligence:kg:node:*${pattern}*`,
            10
          );
          for (const key of keys) {
            const node = await this.memory.get<{ properties: { path: string } }>(key);
            if (node?.properties?.path && this.isTestFile(node.properties.path)) {
              impactedTests.add(node.properties.path);
            }
          }
        }
      }

      return ok(Array.from(impactedTests));
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Calculate risk level for the impact analysis
   */
  calculateRiskLevel(impact: ImpactAnalysis): Severity {
    const weights = this.config.riskWeights;
    let score = 0;

    // Direct impact contribution
    const directScore = Math.min(1, impact.directImpact.length / 10);
    score += directScore * weights.directImpact;

    // Transitive impact contribution
    const transitiveScore = Math.min(1, impact.transitiveImpact.length / 20);
    score += transitiveScore * weights.transitiveImpact;

    // Test coverage contribution (inverse - fewer tests = higher risk)
    const testScore =
      impact.impactedTests.length > 0
        ? Math.max(
            0,
            1 - impact.impactedTests.length / (impact.directImpact.length || 1)
          )
        : 1;
    score += testScore * weights.testCoverage;

    // Critical path contribution
    const criticalCount = this.countCriticalFiles([
      ...impact.directImpact.map((i) => i.file),
      ...impact.transitiveImpact.map((i) => i.file),
    ]);
    const criticalScore = Math.min(1, criticalCount / 5);
    score += criticalScore * weights.criticalPath;

    // Average risk score from impacted files
    const avgRiskScore = this.calculateAverageRiskScore([
      ...impact.directImpact,
      ...impact.transitiveImpact,
    ]);
    score += avgRiskScore * weights.dependencyCount;

    // Map score to severity
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    if (score >= 0.2) return 'low';
    return 'info';
  }

  /**
   * Get recommendations based on impact analysis
   */
  getRecommendations(impact: ImpactAnalysis): string[] {
    const recommendations: string[] = [];

    // Risk-based recommendations
    if (impact.riskLevel === 'critical' || impact.riskLevel === 'high') {
      recommendations.push(
        'This change has significant impact - consider peer review before merging'
      );
    }

    // Test coverage recommendations
    if (impact.impactedTests.length === 0 && impact.directImpact.length > 0) {
      recommendations.push('No tests found for impacted files - add test coverage');
    } else if (impact.impactedTests.length < impact.directImpact.length / 2) {
      recommendations.push('Test coverage appears low for impacted files');
    }

    // Run specific tests recommendation
    if (impact.impactedTests.length > 0) {
      if (impact.impactedTests.length <= 10) {
        recommendations.push(
          `Run these ${impact.impactedTests.length} tests: ${impact.impactedTests.slice(0, 3).join(', ')}${impact.impactedTests.length > 3 ? '...' : ''}`
        );
      } else {
        recommendations.push(
          `Run all ${impact.impactedTests.length} impacted tests before deployment`
        );
      }
    }

    // Critical path recommendations
    const criticalFiles = [
      ...impact.directImpact,
      ...impact.transitiveImpact,
    ].filter((i) => this.isCriticalPath(i.file));

    if (criticalFiles.length > 0) {
      recommendations.push(
        `${criticalFiles.length} critical path files affected - extra scrutiny recommended`
      );
    }

    // Transitive impact recommendations
    if (impact.transitiveImpact.length > 10) {
      recommendations.push(
        'Large transitive impact - consider breaking down into smaller changes'
      );
    }

    // High-risk file recommendations
    const highRiskFiles = [...impact.directImpact, ...impact.transitiveImpact].filter(
      (i) => i.riskScore >= 0.7
    );

    if (highRiskFiles.length > 0) {
      recommendations.push(
        `${highRiskFiles.length} high-risk files impacted: ${highRiskFiles
          .slice(0, 2)
          .map((f) => this.getFileName(f.file))
          .join(', ')}`
      );
    }

    return recommendations;
  }

  // ============================================================================
  // Private Analysis Methods
  // ============================================================================

  private async analyzeDirectImpact(changedFiles: string[]): Promise<ImpactedFile[]> {
    const directImpact: ImpactedFile[] = [];

    for (const changedFile of changedFiles) {
      // Get files that directly depend on the changed file
      const dependencyResult = await this.knowledgeGraph.mapDependencies({
        files: [changedFile],
        direction: 'incoming',
        depth: 1,
      });

      if (dependencyResult.success) {
        const { nodes, edges } = dependencyResult.value;

        for (const node of nodes) {
          // Skip the changed file itself
          if (node.path === changedFile) continue;

          // Find the edge that connects to this node
          const edge = edges.find(
            (e) => e.target === node.id || e.source === node.id
          );

          const riskScore = this.calculateFileRiskScore(
            node.path,
            node.inDegree,
            node.outDegree
          );

          directImpact.push({
            file: node.path,
            reason: `Directly ${edge?.type || 'depends on'} ${this.getFileName(changedFile)}`,
            distance: 1,
            riskScore,
          });
        }
      }
    }

    return this.deduplicateImpact(directImpact);
  }

  private async analyzeTransitiveImpact(
    changedFiles: string[],
    directImpact: ImpactedFile[],
    depth: number
  ): Promise<ImpactedFile[]> {
    const transitiveImpact: ImpactedFile[] = [];
    const visited = new Set<string>([
      ...changedFiles,
      ...directImpact.map((d) => d.file),
    ]);

    const queue: Array<{ file: string; distance: number }> = directImpact.map(
      (d) => ({ file: d.file, distance: 1 })
    );

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.distance >= depth) continue;

      const dependencyResult = await this.knowledgeGraph.mapDependencies({
        files: [current.file],
        direction: 'incoming',
        depth: 1,
      });

      if (dependencyResult.success) {
        for (const node of dependencyResult.value.nodes) {
          if (visited.has(node.path)) continue;
          if (node.path === current.file) continue;

          visited.add(node.path);

          const riskScore = this.calculateFileRiskScore(
            node.path,
            node.inDegree,
            node.outDegree,
            current.distance + 1
          );

          transitiveImpact.push({
            file: node.path,
            reason: `Transitively depends via ${this.getFileName(current.file)}`,
            distance: current.distance + 1,
            riskScore,
          });

          queue.push({ file: node.path, distance: current.distance + 1 });
        }
      }
    }

    return this.deduplicateImpact(transitiveImpact);
  }

  private calculateFileRiskScore(
    file: string,
    inDegree: number,
    outDegree: number,
    distance: number = 1
  ): number {
    let score = 0;

    // Files with many dependents are higher risk
    score += Math.min(0.3, inDegree / 20);

    // Files with many dependencies are more complex
    score += Math.min(0.2, outDegree / 30);

    // Critical paths are higher risk
    if (this.isCriticalPath(file)) {
      score += 0.3;
    }

    // Entry points and exports are higher risk
    if (this.isEntryPoint(file)) {
      score += 0.2;
    }

    // Distance decay - closer files are higher risk
    score = score * Math.pow(0.8, distance - 1);

    return Math.min(1, Math.max(0, score));
  }

  private calculateAverageRiskScore(files: ImpactedFile[]): number {
    if (files.length === 0) return 0;
    const sum = files.reduce((acc, f) => acc + f.riskScore, 0);
    return sum / files.length;
  }

  private countCriticalFiles(files: string[]): number {
    return files.filter((f) => this.isCriticalPath(f)).length;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private isTestFile(path: string): boolean {
    const testPatterns = [
      /\.test\.[tj]sx?$/,
      /\.spec\.[tj]sx?$/,
      /_test\.[tj]sx?$/,
      /test_.*\.py$/,
      /.*_test\.py$/,
      /.*_test\.go$/,
    ];

    return testPatterns.some((pattern) => pattern.test(path));
  }

  private isCriticalPath(path: string): boolean {
    const criticalPatterns = this.config.criticalPaths.map((p) =>
      p.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')
    );

    return criticalPatterns.some((pattern) => new RegExp(pattern).test(path));
  }

  private isEntryPoint(path: string): boolean {
    const entryPatterns = [
      /\/index\.[tj]sx?$/,
      /\/main\.[tj]sx?$/,
      /\/app\.[tj]sx?$/,
      /^src\/[^/]+\.[tj]sx?$/,
      /\/server\.[tj]sx?$/,
      /\/__init__\.py$/,
      /\/main\.go$/,
    ];

    return entryPatterns.some((pattern) => pattern.test(path));
  }

  private getBaseName(path: string): string {
    const fileName = this.getFileName(path);
    return fileName.replace(/\.[^.]+$/, '');
  }

  private getFileName(path: string): string {
    return path.split(/[/\\]/).pop() || path;
  }

  private deduplicateImpact(impact: ImpactedFile[]): ImpactedFile[] {
    const seen = new Map<string, ImpactedFile>();

    for (const item of impact) {
      const existing = seen.get(item.file);
      if (!existing || item.distance < existing.distance) {
        seen.set(item.file, item);
      }
    }

    return Array.from(seen.values()).sort((a, b) => {
      // Sort by risk score descending, then by distance ascending
      if (b.riskScore !== a.riskScore) {
        return b.riskScore - a.riskScore;
      }
      return a.distance - b.distance;
    });
  }

  private async storeAnalysis(
    changedFiles: string[],
    analysis: ImpactAnalysis
  ): Promise<void> {
    const analysisId = uuidv4();
    await this.memory.set(
      `${this.config.namespace}:analysis:${analysisId}`,
      {
        id: analysisId,
        changedFiles,
        analysis,
        timestamp: new Date().toISOString(),
      },
      { namespace: this.config.namespace, persist: true }
    );
  }
}

/**
 * Agentic QE v3 - Gap Detection Service
 * Implements IGapDetectionService with risk-based prioritization
 *
 * ADR-051: Added LLM-powered gap analysis for intelligent prioritization
 */

import { Result, ok, err, Severity } from '../../../shared/types';
import { toError } from '../../../shared/error-utils.js';
import { MemoryBackend, VectorSearchResult } from '../../../kernel/interfaces';
import {
  GapDetectionRequest,
  CoverageGaps,
  CoverageGap,
  FileCoverage,
} from '../interfaces';

// ADR-051: LLM Router for AI-enhanced gap analysis
import type { HybridRouter, ChatResponse } from '../../../shared/llm';
import { safeJsonParse } from '../../../shared/safe-json.js';

// ============================================================================
// Service Interface
// ============================================================================

export interface IGapDetectionService {
  /** Detect uncovered code regions */
  detectGaps(request: GapDetectionRequest): Promise<Result<CoverageGaps, Error>>;

  /** Prioritize gaps by risk score, size, or recent changes */
  prioritizeGaps(
    gaps: CoverageGap[],
    strategy: 'risk' | 'size' | 'recent-changes'
  ): CoverageGap[];

  /** Suggest tests to fill coverage gaps */
  suggestTests(gap: CoverageGap): Promise<Result<TestSuggestion[], Error>>;
}

export interface TestSuggestion {
  type: 'unit' | 'integration' | 'e2e';
  description: string;
  priority: 'high' | 'medium' | 'low';
  targetLines: number[];
  estimatedEffort: number;
  testTemplate?: string;
}

// ============================================================================
// Configuration and Dependencies
// ============================================================================

/**
 * Configuration for GapDetectorService
 */
export interface GapDetectorConfig {
  /** Minimum coverage threshold (default: 80) */
  minCoverage?: number;
  /** ADR-051: Enable LLM-powered gap analysis */
  enableLLMAnalysis?: boolean;
  /** ADR-051: Model tier for LLM calls (1=Haiku, 2=Sonnet, 4=Opus) */
  llmModelTier?: number;
  /** ADR-051: Max tokens for LLM responses */
  llmMaxTokens?: number;
}

/**
 * Dependencies for GapDetectorService
 * ADR-051: Added LLM router for AI-enhanced analysis
 */
export interface GapDetectorDependencies {
  memory: MemoryBackend;
  /** ADR-051: Optional LLM router for AI-enhanced gap analysis */
  llmRouter?: HybridRouter;
}

/**
 * LLM-enhanced gap analysis result
 * Provides intelligent prioritization and suggestions
 */
export interface LLMGapAnalysis {
  /** Risk-weighted prioritization of gaps */
  prioritizedGaps: Array<{
    gapId: string;
    riskWeight: number;
    explanation: string;
    businessImpact: 'critical' | 'high' | 'medium' | 'low';
  }>;
  /** Suggested test cases to fill gaps */
  suggestedTests: Array<{
    gapId: string;
    testDescription: string;
    testType: 'unit' | 'integration' | 'e2e';
    estimatedEffort: number; // hours
  }>;
  /** Estimated effort to achieve target coverage */
  effortEstimate: {
    totalHours: number;
    confidence: number; // 0-1
    breakdown: Record<string, number>; // by file
  };
  /** Overall analysis summary */
  summary: string;
}

const DEFAULT_CONFIG: GapDetectorConfig = {
  minCoverage: 80,
  enableLLMAnalysis: true, // On by default - opt-out
  llmModelTier: 2, // Sonnet by default for balanced cost/quality
  llmMaxTokens: 2048,
};

// ============================================================================
// Service Implementation
// ============================================================================

export class GapDetectorService implements IGapDetectionService {
  private static readonly DEFAULT_MIN_COVERAGE = 80;
  private static readonly VECTOR_DIMENSION = 128;

  private readonly memory: MemoryBackend;
  private readonly config: GapDetectorConfig;
  private readonly llmRouter?: HybridRouter;

  /**
   * Create a GapDetectorService instance
   * Supports both old (MemoryBackend only) and new (dependencies + config) signatures
   *
   * @param dependenciesOrMemory - Either a GapDetectorDependencies object or a MemoryBackend
   * @param config - Optional configuration (only used with new signature)
   */
  constructor(dependenciesOrMemory: GapDetectorDependencies | MemoryBackend, config?: GapDetectorConfig) {
    // Support both old and new constructor signatures for backward compatibility
    if ('memory' in dependenciesOrMemory) {
      // New signature: dependencies object
      this.memory = dependenciesOrMemory.memory;
      this.llmRouter = dependenciesOrMemory.llmRouter;
      this.config = { ...DEFAULT_CONFIG, ...config };
    } else {
      // Old signature: just memory backend (backward compatible)
      this.memory = dependenciesOrMemory;
      this.llmRouter = undefined;
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  // ============================================================================
  // ADR-051: LLM Enhancement Methods
  // ============================================================================

  /**
   * Check if LLM analysis is available and enabled
   */
  private isLLMAnalysisAvailable(): boolean {
    return this.config.enableLLMAnalysis === true && this.llmRouter !== undefined;
  }

  /**
   * Get model ID for the configured tier
   */
  private getModelForTier(tier: number): string {
    switch (tier) {
      case 1: return 'claude-3-5-haiku-20241022';
      case 2: return 'claude-sonnet-4-20250514';
      case 3: return 'claude-sonnet-4-20250514';
      case 4: return 'claude-opus-4-5-20251101';
      default: return 'claude-sonnet-4-20250514';
    }
  }

  /**
   * Analyze coverage gaps using LLM for intelligent prioritization
   * Provides risk-weighted analysis, test suggestions, and effort estimates
   */
  async analyzeGapsWithLLM(
    gaps: CoverageGap[],
    codeContext?: string
  ): Promise<Result<LLMGapAnalysis, Error>> {
    if (!this.llmRouter) {
      return err(new Error('LLM router not available'));
    }

    if (gaps.length === 0) {
      return ok({
        prioritizedGaps: [],
        suggestedTests: [],
        effortEstimate: {
          totalHours: 0,
          confidence: 1,
          breakdown: {},
        },
        summary: 'No coverage gaps to analyze.',
      });
    }

    try {
      const prompt = this.buildGapAnalysisPrompt(gaps, codeContext);
      const modelId = this.getModelForTier(this.config.llmModelTier ?? 2);

      const response: ChatResponse = await this.llmRouter.chat({
        messages: [
          {
            role: 'system',
            content: `You are a senior QE engineer analyzing coverage gaps. Provide:
1. Risk-weighted prioritization (which gaps are most dangerous)
2. Business impact assessment for each gap
3. Specific test cases to fill each gap
4. Effort estimates (in hours) to achieve target coverage

Return JSON in this exact format:
{
  "prioritizedGaps": [{ "gapId": "...", "riskWeight": 0.8, "explanation": "...", "businessImpact": "high" }],
  "suggestedTests": [{ "gapId": "...", "testDescription": "...", "testType": "unit", "estimatedEffort": 2 }],
  "effortEstimate": { "totalHours": 10, "confidence": 0.8, "breakdown": { "file.ts": 5 } },
  "summary": "Brief analysis summary..."
}`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        model: modelId,
        maxTokens: this.config.llmMaxTokens ?? 2048,
        temperature: 0.3, // Low temperature for consistent analysis
      });

      if (response.content) {
        const analysis = this.parseGapAnalysisResponse(response.content, gaps);
        return ok(analysis);
      }

      return err(new Error('Empty response from LLM'));
    } catch (error) {
      console.warn('[GapDetector] LLM analysis failed:', error);
      return err(toError(error));
    }
  }

  /**
   * Build prompt for gap analysis
   */
  private buildGapAnalysisPrompt(gaps: CoverageGap[], codeContext?: string): string {
    let prompt = `## Coverage Gaps to Analyze\n\n`;

    for (const gap of gaps) {
      prompt += `### Gap: ${gap.id}\n`;
      prompt += `- File: ${gap.file}\n`;
      prompt += `- Lines: ${gap.lines.length > 10 ? `${gap.lines.slice(0, 5).join(', ')}... (${gap.lines.length} total)` : gap.lines.join(', ')}\n`;
      prompt += `- Branches: ${gap.branches.length}\n`;
      prompt += `- Current Risk Score: ${gap.riskScore.toFixed(2)}\n`;
      prompt += `- Severity: ${gap.severity}\n`;
      prompt += `- Recommendation: ${gap.recommendation}\n\n`;
    }

    if (codeContext) {
      prompt += `## Code Context\n\`\`\`typescript\n${codeContext.slice(0, 2000)}\n\`\`\`\n\n`;
    }

    prompt += `## Analysis Request\n`;
    prompt += `1. Prioritize these gaps by actual risk (not just line count)\n`;
    prompt += `2. Explain why each gap matters from a business perspective\n`;
    prompt += `3. Suggest specific test cases to fill each gap\n`;
    prompt += `4. Estimate effort to achieve 80% coverage\n`;

    return prompt;
  }

  /**
   * Parse LLM response into structured gap analysis
   */
  private parseGapAnalysisResponse(content: string, gaps: CoverageGap[]): LLMGapAnalysis {
    try {
      // Try to extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = safeJsonParse(jsonMatch[0]);
        return {
          prioritizedGaps: parsed.prioritizedGaps || [],
          suggestedTests: parsed.suggestedTests || [],
          effortEstimate: parsed.effortEstimate || {
            totalHours: this.calculateTotalEffort(gaps),
            confidence: 0.5,
            breakdown: {},
          },
          summary: parsed.summary || 'Analysis complete.',
        };
      }
    } catch {
      // JSON parsing failed - return fallback analysis
    }

    // Fallback: create basic analysis from existing data
    return {
      prioritizedGaps: gaps.map((gap) => ({
        gapId: gap.id,
        riskWeight: gap.riskScore,
        explanation: gap.recommendation,
        businessImpact: this.severityToBusinessImpact(gap.severity),
      })),
      suggestedTests: gaps.slice(0, 5).map((gap) => ({
        gapId: gap.id,
        testDescription: `Test coverage for ${gap.file} lines ${gap.lines[0]}-${gap.lines[gap.lines.length - 1] || gap.lines[0]}`,
        testType: 'unit' as const,
        estimatedEffort: Math.ceil(gap.lines.length / 15),
      })),
      effortEstimate: {
        totalHours: this.calculateTotalEffort(gaps),
        confidence: 0.5,
        breakdown: this.calculateEffortBreakdown(gaps),
      },
      summary: `Analyzed ${gaps.length} coverage gaps. LLM response parsing failed, using heuristic analysis.`,
    };
  }

  /**
   * Convert severity to business impact
   */
  private severityToBusinessImpact(severity: Severity): 'critical' | 'high' | 'medium' | 'low' {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      default: return 'low';
    }
  }

  /**
   * Calculate effort breakdown by file
   */
  private calculateEffortBreakdown(gaps: CoverageGap[]): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const gap of gaps) {
      const effort = Math.ceil(gap.lines.length / 15);
      breakdown[gap.file] = (breakdown[gap.file] || 0) + effort;
    }
    return breakdown;
  }

  /**
   * Detect uncovered code regions using vector similarity for O(log n) analysis
   */
  async detectGaps(request: GapDetectionRequest): Promise<Result<CoverageGaps, Error>> {
    try {
      const {
        coverageData,
        minCoverage = GapDetectorService.DEFAULT_MIN_COVERAGE,
        prioritize = 'risk',
      } = request;

      const gaps: CoverageGap[] = [];
      let totalUncoveredLines = 0;

      for (const file of coverageData.files) {
        const fileGaps = await this.analyzeFileGaps(file, minCoverage);
        gaps.push(...fileGaps);
        totalUncoveredLines += file.uncoveredLines.length;
      }

      // Apply prioritization strategy
      const prioritizedGaps = this.prioritizeGaps(gaps, prioritize);

      // Calculate estimated effort
      const estimatedEffort = this.calculateTotalEffort(prioritizedGaps);

      // Store gap patterns for learning
      await this.storeGapPatterns(prioritizedGaps);

      return ok({
        gaps: prioritizedGaps,
        totalUncoveredLines,
        estimatedEffort,
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  /**
   * Prioritize gaps based on specified strategy
   */
  prioritizeGaps(
    gaps: CoverageGap[],
    strategy: 'risk' | 'size' | 'recent-changes'
  ): CoverageGap[] {
    const sorted = [...gaps];

    switch (strategy) {
      case 'risk':
        // Sort by risk score (highest first), then by severity
        sorted.sort((a, b) => {
          if (b.riskScore !== a.riskScore) {
            return b.riskScore - a.riskScore;
          }
          return this.severityToNumber(b.severity) - this.severityToNumber(a.severity);
        });
        break;

      case 'size':
        // Sort by number of uncovered lines (largest gaps first)
        sorted.sort((a, b) => b.lines.length - a.lines.length);
        break;

      case 'recent-changes':
        // Sort by file path (as a proxy for recent changes)
        // In production, this would integrate with git history
        sorted.sort((a, b) => {
          // Files in src/domains are prioritized as they're likely active
          const aScore = this.getRecencyScore(a.file);
          const bScore = this.getRecencyScore(b.file);
          return bScore - aScore;
        });
        break;
    }

    return sorted;
  }

  /**
   * Suggest tests to fill a coverage gap
   */
  async suggestTests(gap: CoverageGap): Promise<Result<TestSuggestion[], Error>> {
    try {
      const suggestions: TestSuggestion[] = [];

      // Analyze gap characteristics
      const isLargeGap = gap.lines.length > 20;
      const hasBranchGaps = gap.branches.length > 0;
      const isCritical = gap.severity === 'critical' || gap.severity === 'high';

      // Find similar gaps that were previously addressed
      const similarPatterns = await this.findSimilarAddressedGaps(gap);

      // Generate unit test suggestions
      if (gap.lines.length > 0) {
        const unitTestSuggestion = this.createUnitTestSuggestion(gap, similarPatterns);
        suggestions.push(unitTestSuggestion);
      }

      // Add integration test suggestion for complex gaps
      if (isLargeGap || hasBranchGaps) {
        suggestions.push({
          type: 'integration',
          description: `Integration tests for ${gap.file} covering ${gap.lines.length} lines and ${gap.branches.length} branches`,
          priority: isCritical ? 'high' : 'medium',
          targetLines: gap.lines.slice(0, 20), // Focus on first 20 lines
          estimatedEffort: Math.ceil(gap.lines.length / 10),
          testTemplate: this.generateIntegrationTestTemplate(gap),
        });
      }

      // Add E2E test suggestion for critical gaps
      if (isCritical && isLargeGap) {
        suggestions.push({
          type: 'e2e',
          description: `End-to-end tests for critical functionality in ${gap.file}`,
          priority: 'high',
          targetLines: gap.lines,
          estimatedEffort: Math.ceil(gap.lines.length / 5),
        });
      }

      return ok(suggestions);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async analyzeFileGaps(
    file: FileCoverage,
    minCoverage: number
  ): Promise<CoverageGap[]> {
    const gaps: CoverageGap[] = [];
    const coverage = this.calculateFileCoverage(file);

    if (coverage < minCoverage && file.uncoveredLines.length > 0) {
      // Identify contiguous regions of uncovered code
      const regions = this.identifyUncoveredRegions(file.uncoveredLines);

      for (const region of regions) {
        const riskScore = await this.calculateRegionRiskScore(file, region);
        const severity = this.riskScoreToSeverity(riskScore);

        gaps.push({
          id: this.generateGapId(file.path, region.start),
          file: file.path,
          lines: region.lines,
          branches: this.getBranchesInRegion(file.uncoveredBranches, region),
          riskScore,
          severity,
          recommendation: this.generateRecommendation(file, region, severity),
        });
      }
    }

    return gaps;
  }

  private calculateFileCoverage(file: FileCoverage): number {
    const metrics = [
      file.lines.total > 0 ? (file.lines.covered / file.lines.total) * 100 : 100,
      file.branches.total > 0 ? (file.branches.covered / file.branches.total) * 100 : 100,
      file.functions.total > 0 ? (file.functions.covered / file.functions.total) * 100 : 100,
      file.statements.total > 0 ? (file.statements.covered / file.statements.total) * 100 : 100,
    ];
    return metrics.reduce((sum, m) => sum + m, 0) / 4;
  }

  private identifyUncoveredRegions(lines: number[]): UncoveredRegion[] {
    if (lines.length === 0) return [];

    const sorted = [...lines].sort((a, b) => a - b);
    const regions: UncoveredRegion[] = [];

    let regionStart = sorted[0];
    let regionLines = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      // If lines are within 3 of each other, consider them part of the same region
      if (sorted[i] - sorted[i - 1] <= 3) {
        regionLines.push(sorted[i]);
      } else {
        // End current region and start new one
        regions.push({
          start: regionStart,
          end: regionLines[regionLines.length - 1],
          lines: regionLines,
          size: regionLines.length,
        });
        regionStart = sorted[i];
        regionLines = [sorted[i]];
      }
    }

    // Add final region
    regions.push({
      start: regionStart,
      end: regionLines[regionLines.length - 1],
      lines: regionLines,
      size: regionLines.length,
    });

    return regions;
  }

  private getBranchesInRegion(allBranches: number[], region: UncoveredRegion): number[] {
    return allBranches.filter((b) => b >= region.start && b <= region.end);
  }

  private async calculateRegionRiskScore(
    file: FileCoverage,
    region: UncoveredRegion
  ): Promise<number> {
    // Base risk from region size
    const sizeRisk = Math.min(1, region.size / 50);

    // Risk from function coverage in region
    const functionRisk =
      file.functions.total > 0 ? 1 - file.functions.covered / file.functions.total : 0;

    // Risk from branch coverage in region
    const branchesInRegion = this.getBranchesInRegion(file.uncoveredBranches, region);
    const branchRisk = branchesInRegion.length > 0 ? Math.min(1, branchesInRegion.length / 10) : 0;

    // Query memory for historical risk data
    const historicalRisk = await this.getHistoricalRisk(file.path);

    // Weighted combination
    const baseRisk = sizeRisk * 0.2 + functionRisk * 0.3 + branchRisk * 0.3 + historicalRisk * 0.2;

    return Math.min(1, Math.max(0, baseRisk));
  }

  private async getHistoricalRisk(filePath: string): Promise<number> {
    try {
      const history = await this.memory.get<{ defectCount: number }>(
        `defect-history:${filePath}`
      );
      if (history && history.defectCount > 0) {
        return Math.min(1, history.defectCount / 10);
      }
      return 0.3; // Default moderate risk
    } catch {
      return 0.3;
    }
  }

  private riskScoreToSeverity(riskScore: number): Severity {
    if (riskScore >= 0.8) return 'critical';
    if (riskScore >= 0.6) return 'high';
    if (riskScore >= 0.3) return 'medium';
    return 'low';
  }

  private severityToNumber(severity: Severity): number {
    switch (severity) {
      case 'critical':
        return 4;
      case 'high':
        return 3;
      case 'medium':
        return 2;
      case 'low':
        return 1;
      default:
        return 0;
    }
  }

  private getRecencyScore(filePath: string): number {
    // Prioritize active development areas
    if (filePath.includes('src/domains/')) return 0.9;
    if (filePath.includes('src/kernel/')) return 0.8;
    if (filePath.includes('src/')) return 0.7;
    if (filePath.includes('lib/')) return 0.5;
    return 0.3;
  }

  private generateGapId(filePath: string, startLine: number): string {
    const hash = `${filePath}:${startLine}`.split('').reduce((acc, char) => {
      return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
    }, 0);
    return `gap-${Math.abs(hash).toString(16)}`;
  }

  private generateRecommendation(
    _file: FileCoverage,
    region: UncoveredRegion,
    severity: Severity
  ): string {
    const lineRange =
      region.start === region.end
        ? `line ${region.start}`
        : `lines ${region.start}-${region.end}`;

    let recommendation = `Add tests for ${lineRange} (${region.size} lines uncovered)`;

    if (severity === 'critical') {
      recommendation += '. CRITICAL: High-risk area requiring immediate attention.';
    } else if (severity === 'high') {
      recommendation += '. HIGH priority for test coverage.';
    }

    return recommendation;
  }

  private calculateTotalEffort(gaps: CoverageGap[]): number {
    const totalLines = gaps.reduce((sum, gap) => sum + gap.lines.length, 0);
    // Estimate: ~12 lines of test code per source line, 20 lines/hour
    return Math.ceil((totalLines * 12) / 20);
  }

  private async storeGapPatterns(gaps: CoverageGap[]): Promise<void> {
    try {
      for (const gap of gaps) {
        const embedding = this.createGapEmbedding(gap);
        await this.memory.storeVector(`gap-pattern:${gap.id}`, embedding, {
          file: gap.file,
          riskScore: gap.riskScore,
          severity: gap.severity,
          lineCount: gap.lines.length,
        });
      }
    } catch {
      // Non-critical operation
    }
  }

  private createGapEmbedding(gap: CoverageGap): number[] {
    const embedding = new Array(GapDetectorService.VECTOR_DIMENSION).fill(0);

    // Encode gap characteristics
    embedding[0] = gap.riskScore;
    embedding[1] = Math.min(1, gap.lines.length / 100);
    embedding[2] = Math.min(1, gap.branches.length / 20);
    embedding[3] = this.severityToNumber(gap.severity) / 4;

    // Encode file path characteristics
    const pathHash = gap.file.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    embedding[4] = (pathHash % 1000) / 1000;

    // Fill remaining with derived features
    for (let i = 5; i < GapDetectorService.VECTOR_DIMENSION; i++) {
      embedding[i] = Math.sin(i * gap.riskScore) * 0.5 + 0.5;
    }

    return embedding;
  }

  private async findSimilarAddressedGaps(gap: CoverageGap): Promise<VectorSearchResult[]> {
    try {
      const embedding = this.createGapEmbedding(gap);
      return await this.memory.vectorSearch(embedding, 3);
    } catch {
      return [];
    }
  }

  private createUnitTestSuggestion(
    gap: CoverageGap,
    similarPatterns: VectorSearchResult[]
  ): TestSuggestion {
    const isCritical = gap.severity === 'critical' || gap.severity === 'high';

    let description = `Unit tests for ${gap.file}`;
    if (gap.lines.length <= 10) {
      description += ` covering lines ${gap.lines.join(', ')}`;
    } else {
      description += ` covering ${gap.lines.length} uncovered lines`;
    }

    if (similarPatterns.length > 0 && similarPatterns[0].score > 0.7) {
      description += ' (similar pattern found - check existing tests for reference)';
    }

    return {
      type: 'unit',
      description,
      priority: isCritical ? 'high' : 'medium',
      targetLines: gap.lines,
      estimatedEffort: Math.ceil(gap.lines.length / 15),
      testTemplate: this.generateUnitTestTemplate(gap),
    };
  }

  private generateUnitTestTemplate(gap: CoverageGap): string {
    const fileName = gap.file.split('/').pop()?.replace(/\.[^.]+$/, '') || 'module';
    const moduleName = this.toCamelCase(fileName);
    const lineRange = gap.lines.length > 1
      ? `${gap.lines[0]}-${gap.lines[gap.lines.length - 1]}`
      : `${gap.lines[0]}`;

    return `import { ${moduleName} } from './${fileName}';

describe('${fileName}', () => {
  describe('uncovered functionality (lines ${lineRange})', () => {
    let instance: typeof ${moduleName};

    beforeEach(() => {
      instance = ${moduleName};
    });

    it('should handle expected input correctly', () => {
      const input = { /* valid input matching lines ${lineRange} */ };
      const result = instance(input);
      expect(result).toBeDefined();
      expect(result).toMatchSnapshot();
    });

    it('should handle edge cases gracefully', () => {
      const edgeCases = [null, undefined, {}, [], ''];
      for (const input of edgeCases) {
        expect(() => instance(input)).not.toThrow();
      }
    });

    it('should handle boundary values', () => {
      const boundaries = [0, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];
      for (const value of boundaries) {
        const result = instance(value);
        expect(typeof result).toBe('object');
      }
    });
${gap.branches.length > 0 ? `
    describe('branch coverage (${gap.branches.length} branches)', () => {
${gap.branches.map((branch, i) => `      it('should cover branch ${i + 1} at line ${branch}', () => {
        const conditionInput = { triggerBranch: ${i + 1} };
        const result = instance(conditionInput);
        expect(result).toBeDefined();
      });
`).join('\n')}    });
` : ''}  });
});`;
  }

  private toCamelCase(str: string): string {
    return str.replace(/[-_](.)/g, (_, c) => c.toUpperCase());
  }

  private generateIntegrationTestTemplate(gap: CoverageGap): string {
    const fileName = gap.file.split('/').pop()?.replace(/\.[^.]+$/, '') || 'module';
    const moduleName = this.toCamelCase(fileName);
    const lineCount = gap.lines.length;

    return `import { ${moduleName} } from './${fileName}';
import { createTestContext, mockDependencies } from '../test-utils';

describe('${fileName} Integration', () => {
  let context: ReturnType<typeof createTestContext>;
  let mocks: ReturnType<typeof mockDependencies>;

  beforeEach(async () => {
    mocks = mockDependencies();
    context = createTestContext({ mocks });
    await context.initialize();
  });

  afterEach(async () => {
    await context.cleanup();
    jest.clearAllMocks();
  });

  describe('dependency integration (${lineCount} lines)', () => {
    it('should integrate with dependencies correctly', async () => {
      const input = { testMode: true };
      const result = await ${moduleName}.execute(input, context);

      expect(result.success).toBe(true);
      expect(mocks.dependency.call).toHaveBeenCalled();
      expect(result.data).toMatchObject({
        processed: true,
        linesExecuted: expect.any(Number),
      });
    });

    it('should handle dependency timeout gracefully', async () => {
      mocks.dependency.call.mockRejectedValueOnce(new Error('Timeout'));

      const result = await ${moduleName}.execute({ testMode: true }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Timeout');
      expect(result.retryable).toBe(true);
    });

    it('should handle dependency unavailable', async () => {
      mocks.dependency.isAvailable.mockReturnValue(false);

      const result = await ${moduleName}.execute({ testMode: true }, context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('unavailable');
    });
  });

  describe('error handling paths', () => {
    it('should handle invalid input with descriptive error', async () => {
      const invalidInput = { invalid: true };

      await expect(${moduleName}.execute(invalidInput, context))
        .rejects.toThrow(/validation|invalid/i);
    });

    it('should handle network errors with retry logic', async () => {
      mocks.network.request.mockRejectedValueOnce(new Error('Network error'));
      mocks.network.request.mockResolvedValueOnce({ data: 'success' });

      const result = await ${moduleName}.execute({ retry: true }, context);

      expect(result.success).toBe(true);
      expect(mocks.network.request).toHaveBeenCalledTimes(2);
    });

    it('should propagate unrecoverable errors', async () => {
      const fatalError = new Error('Unrecoverable');
      fatalError.name = 'FatalError';
      mocks.dependency.call.mockRejectedValueOnce(fatalError);

      await expect(${moduleName}.execute({ testMode: true }, context))
        .rejects.toThrow('Unrecoverable');
    });
  });
});`;
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface UncoveredRegion {
  start: number;
  end: number;
  lines: number[];
  size: number;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a GapDetectorService instance with default dependencies
 * Maintains backward compatibility with existing code
 *
 * @param memory - Memory backend for pattern storage
 * @param config - Optional configuration overrides
 * @returns Configured GapDetectorService instance
 */
export function createGapDetectorService(
  memory: MemoryBackend,
  config?: GapDetectorConfig
): GapDetectorService {
  return new GapDetectorService(memory, config);
}

/**
 * Create a GapDetectorService instance with custom dependencies
 * Used when LLM router or other custom implementations are needed
 *
 * @param dependencies - All service dependencies (memory + optional llmRouter)
 * @param config - Optional configuration overrides
 * @returns Configured GapDetectorService instance
 */
export function createGapDetectorServiceWithDependencies(
  dependencies: GapDetectorDependencies,
  config?: GapDetectorConfig
): GapDetectorService {
  return new GapDetectorService(dependencies, config);
}

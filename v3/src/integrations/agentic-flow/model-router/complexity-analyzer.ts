/**
 * Agentic QE v3 - Task Complexity Analyzer
 * ADR-051: Multi-Model Router - Complexity Assessment
 *
 * Analyzes task complexity to determine optimal model tier routing.
 * Uses multiple signals including:
 * - Code complexity metrics (lines, files, cyclomatic complexity)
 * - Task description keywords
 * - Agent Booster transform detection
 * - Architecture/security scope detection
 * - Multi-step reasoning requirements
 *
 * @module integrations/agentic-flow/model-router/complexity-analyzer
 */

import type {
  IComplexityAnalyzer,
  ComplexityScore,
  ComplexitySignals,
  RoutingInput,
  ModelTier,
  ModelRouterConfig,
} from './types';
import { TIER_METADATA, ComplexityAnalysisError } from './types';
import type { TransformType, IAgentBoosterAdapter } from '../agent-booster/types';
import { ALL_TRANSFORM_TYPES } from '../agent-booster/types';

// ============================================================================
// Keyword Patterns for Complexity Detection
// ============================================================================

/**
 * Keyword patterns for different complexity levels
 */
const COMPLEXITY_KEYWORDS = {
  // Tier 0 - Mechanical transforms
  mechanical: [
    'convert var to const',
    'add types',
    'remove console',
    'convert to async',
    'convert to esm',
    'arrow function',
    'rename variable',
    'format code',
  ],

  // Tier 1 - Simple tasks
  simple: [
    'fix typo',
    'update comment',
    'fix simple bug',
    'add documentation',
    'format',
    'rename',
    'simple refactor',
    'basic test',
  ],

  // Tier 2 - Moderate complexity
  moderate: [
    'implement feature',
    'complex refactor',
    'performance optimization',
    'test generation',
    'error handling',
    'validation logic',
    'api integration',
  ],

  // Tier 3 - High complexity
  complex: [
    'multi-file refactor',
    'orchestrate',
    'coordinate',
    'large codebase',
    'migration',
    'cross-domain',
    'workflow',
    'system design',
  ],

  // Tier 4 - Critical/expert
  critical: [
    'architecture',
    'security audit',
    'critical bug',
    'algorithm design',
    'system-wide',
    'vulnerability',
    'cryptography',
    'performance critical',
  ],
} as const;

/**
 * Patterns that indicate specific scopes
 */
const SCOPE_PATTERNS = {
  architecture: /\b(architect|design|system design|overall structure|component design)\b/i,
  security: /\b(security|vulnerability|audit|xss|sql injection|csrf|encryption)\b/i,
  multiStep: /\b(orchestrate|coordinate|workflow|pipeline|multi[- ]step)\b/i,
  crossDomain: /\b(cross[- ]domain|across (domains|modules)|integrate|coordination)\b/i,
} as const;

// ============================================================================
// Complexity Analyzer Implementation
// ============================================================================

/**
 * Analyzes task complexity to recommend optimal model tier
 */
export class ComplexityAnalyzer implements IComplexityAnalyzer {
  private readonly config: ModelRouterConfig;
  private readonly agentBoosterAdapter?: IAgentBoosterAdapter;

  constructor(
    config: ModelRouterConfig,
    agentBoosterAdapter?: IAgentBoosterAdapter
  ) {
    this.config = config;
    this.agentBoosterAdapter = agentBoosterAdapter;
  }

  /**
   * Analyze task complexity
   */
  async analyze(input: RoutingInput): Promise<ComplexityScore> {
    const startTime = Date.now();

    try {
      // Collect complexity signals
      const signals = await this.collectSignals(input);

      // Calculate component scores
      const codeComplexity = this.calculateCodeComplexity(signals);
      const reasoningComplexity = this.calculateReasoningComplexity(signals);
      const scopeComplexity = this.calculateScopeComplexity(signals);

      // Calculate overall complexity (weighted average)
      const overall = this.calculateOverallComplexity(
        codeComplexity,
        reasoningComplexity,
        scopeComplexity,
        signals
      );

      // Determine recommended tier
      const recommendedTier = this.getRecommendedTier(overall);

      // Find alternative tiers
      const alternateTiers = this.findAlternateTiers(overall, recommendedTier);

      // Calculate confidence based on signal quality
      const confidence = this.calculateConfidence(signals, input);

      // Generate explanation
      const explanation = this.generateExplanation(
        overall,
        recommendedTier,
        signals
      );

      return {
        overall,
        codeComplexity,
        reasoningComplexity,
        scopeComplexity,
        confidence,
        signals,
        recommendedTier,
        alternateTiers,
        explanation,
      };
    } catch (error) {
      throw new ComplexityAnalysisError(
        `Failed to analyze task complexity: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Check if task is eligible for Agent Booster (Tier 0)
   */
  async checkAgentBoosterEligibility(
    input: RoutingInput
  ): Promise<{
    eligible: boolean;
    transformType?: TransformType;
    confidence: number;
    reason: string;
  }> {
    if (!this.config.enableAgentBooster || !this.agentBoosterAdapter) {
      return {
        eligible: false,
        confidence: 0,
        reason: 'Agent Booster is disabled or not available',
      };
    }

    // Check for mechanical transform keywords in task description
    const taskLower = input.task.toLowerCase();
    let detectedTransformType: TransformType | undefined;
    let maxConfidence = 0;

    for (const transformType of ALL_TRANSFORM_TYPES) {
      const keywords = this.getTransformKeywords(transformType);
      let confidence = 0;

      for (const keyword of keywords) {
        if (taskLower.includes(keyword.toLowerCase())) {
          confidence += 0.2;
        }
      }

      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        detectedTransformType = transformType;
      }
    }

    // If code context provided, try Agent Booster detection
    if (input.codeContext && detectedTransformType) {
      try {
        const opportunities = await this.agentBoosterAdapter.detectTransformOpportunities(
          input.codeContext
        );

        const matchingOpp = opportunities.opportunities.find(
          (opp) => opp.type === detectedTransformType
        );

        if (matchingOpp) {
          return {
            eligible: matchingOpp.confidence >= this.config.agentBoosterThreshold,
            transformType: detectedTransformType,
            confidence: matchingOpp.confidence,
            reason: matchingOpp.reason,
          };
        }
      } catch {
        // Fall through to keyword-based detection
      }
    }

    // Keyword-based detection
    const eligible =
      maxConfidence >= this.config.agentBoosterThreshold &&
      detectedTransformType !== undefined;

    return {
      eligible,
      transformType: detectedTransformType,
      confidence: Math.min(maxConfidence, 1),
      reason: eligible
        ? `Detected ${detectedTransformType} transform pattern`
        : 'No mechanical transform pattern detected',
    };
  }

  /**
   * Get recommended tier based on complexity score
   */
  getRecommendedTier(complexity: number): ModelTier {
    // Check each tier's complexity range
    for (const tier of [0, 1, 2, 3, 4] as ModelTier[]) {
      const [min, max] = TIER_METADATA[tier].complexityRange;
      if (complexity >= min && complexity <= max) {
        return tier;
      }
    }

    // Default to Tier 2 (Sonnet) if no match
    return 2;
  }

  // ============================================================================
  // Private: Signal Collection
  // ============================================================================

  /**
   * Collect all complexity signals from input
   */
  private async collectSignals(input: RoutingInput): Promise<ComplexitySignals> {
    const taskLower = input.task.toLowerCase();
    const codeLower = input.codeContext?.toLowerCase() || '';

    // Check for Agent Booster eligibility
    const agentBoosterCheck = await this.checkAgentBoosterEligibility(input);

    // Detect keyword matches
    const keywordMatches = {
      simple: this.findKeywordMatches(taskLower, COMPLEXITY_KEYWORDS.simple),
      moderate: this.findKeywordMatches(taskLower, COMPLEXITY_KEYWORDS.moderate),
      complex: this.findKeywordMatches(taskLower, COMPLEXITY_KEYWORDS.complex),
      critical: this.findKeywordMatches(taskLower, COMPLEXITY_KEYWORDS.critical),
    };

    // Analyze code context if provided
    const linesOfCode = input.codeContext
      ? input.codeContext.split('\n').length
      : undefined;

    const fileCount = input.filePaths ? input.filePaths.length : undefined;

    // Detect scope patterns
    const hasArchitectureScope = SCOPE_PATTERNS.architecture.test(taskLower);
    const hasSecurityScope = SCOPE_PATTERNS.security.test(taskLower);
    const requiresMultiStepReasoning = SCOPE_PATTERNS.multiStep.test(taskLower);
    const requiresCrossDomainCoordination = SCOPE_PATTERNS.crossDomain.test(taskLower);

    // Detect creativity requirements
    const requiresCreativity =
      taskLower.includes('design') ||
      taskLower.includes('creative') ||
      taskLower.includes('innovative') ||
      taskLower.includes('novel');

    // Estimate language complexity
    const languageComplexity = this.estimateLanguageComplexity(
      input.codeContext,
      input.filePaths
    );

    // Estimate cyclomatic complexity (simple heuristic)
    const cyclomaticComplexity = input.codeContext
      ? this.estimateCyclomaticComplexity(input.codeContext)
      : undefined;

    return {
      linesOfCode,
      fileCount,
      hasArchitectureScope,
      hasSecurityScope,
      requiresMultiStepReasoning,
      requiresCrossDomainCoordination,
      isMechanicalTransform: agentBoosterCheck.eligible,
      languageComplexity,
      cyclomaticComplexity,
      dependencyCount: this.countDependencies(input.codeContext),
      requiresCreativity,
      detectedTransformType: agentBoosterCheck.transformType,
      keywordMatches,
    };
  }

  // ============================================================================
  // Private: Complexity Calculation
  // ============================================================================

  /**
   * Calculate code complexity component (0-100)
   */
  private calculateCodeComplexity(signals: ComplexitySignals): number {
    let score = 0;

    // Lines of code contribution (0-30 points)
    if (signals.linesOfCode !== undefined) {
      if (signals.linesOfCode < 10) score += 0;
      else if (signals.linesOfCode < 50) score += 10;
      else if (signals.linesOfCode < 200) score += 20;
      else score += 30;
    }

    // File count contribution (0-20 points)
    if (signals.fileCount !== undefined) {
      if (signals.fileCount === 1) score += 0;
      else if (signals.fileCount < 5) score += 10;
      else score += 20;
    }

    // Cyclomatic complexity contribution (0-30 points)
    if (signals.cyclomaticComplexity !== undefined) {
      if (signals.cyclomaticComplexity < 5) score += 0;
      else if (signals.cyclomaticComplexity < 10) score += 10;
      else if (signals.cyclomaticComplexity < 20) score += 20;
      else score += 30;
    }

    // Language complexity contribution (0-20 points)
    if (signals.languageComplexity === 'low') score += 0;
    else if (signals.languageComplexity === 'medium') score += 10;
    else if (signals.languageComplexity === 'high') score += 20;

    return Math.min(score, 100);
  }

  /**
   * Calculate reasoning complexity component (0-100)
   */
  private calculateReasoningComplexity(signals: ComplexitySignals): number {
    let score = 0;

    // Keyword-based scoring
    const keywordScore =
      signals.keywordMatches.simple.length * 5 +
      signals.keywordMatches.moderate.length * 15 +
      signals.keywordMatches.complex.length * 25 +
      signals.keywordMatches.critical.length * 35;

    score += Math.min(keywordScore, 60);

    // Multi-step reasoning (0-20 points)
    if (signals.requiresMultiStepReasoning) score += 20;

    // Creativity requirements (0-20 points)
    if (signals.requiresCreativity) score += 20;

    return Math.min(score, 100);
  }

  /**
   * Calculate scope complexity component (0-100)
   */
  private calculateScopeComplexity(signals: ComplexitySignals): number {
    let score = 0;

    // Architecture scope (0-40 points)
    if (signals.hasArchitectureScope) score += 40;

    // Security scope (0-30 points)
    if (signals.hasSecurityScope) score += 30;

    // Cross-domain coordination (0-20 points)
    if (signals.requiresCrossDomainCoordination) score += 20;

    // Dependency count (0-10 points)
    if (signals.dependencyCount !== undefined) {
      if (signals.dependencyCount < 3) score += 0;
      else if (signals.dependencyCount < 10) score += 5;
      else score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Calculate overall complexity score (0-100)
   */
  private calculateOverallComplexity(
    codeComplexity: number,
    reasoningComplexity: number,
    scopeComplexity: number,
    signals: ComplexitySignals
  ): number {
    // Mechanical transforms always score 0-10
    if (signals.isMechanicalTransform) {
      return 5;
    }

    // Weighted average: code (30%), reasoning (40%), scope (30%)
    const weighted =
      codeComplexity * 0.3 + reasoningComplexity * 0.4 + scopeComplexity * 0.3;

    return Math.min(Math.round(weighted), 100);
  }

  /**
   * Calculate confidence in complexity assessment (0-1)
   */
  private calculateConfidence(
    signals: ComplexitySignals,
    input: RoutingInput
  ): number {
    let confidence = 0.5; // Base confidence

    // More confidence if code context provided
    if (input.codeContext) confidence += 0.2;

    // More confidence if file paths provided
    if (input.filePaths && input.filePaths.length > 0) confidence += 0.1;

    // More confidence if strong keyword matches
    const totalKeywords =
      signals.keywordMatches.simple.length +
      signals.keywordMatches.moderate.length +
      signals.keywordMatches.complex.length +
      signals.keywordMatches.critical.length;

    if (totalKeywords >= 3) confidence += 0.1;
    else if (totalKeywords >= 1) confidence += 0.05;

    // More confidence for Agent Booster detections
    if (signals.isMechanicalTransform) confidence += 0.15;

    return Math.min(confidence, 1);
  }

  // ============================================================================
  // Private: Helper Methods
  // ============================================================================

  /**
   * Find matching keywords in text
   */
  private findKeywordMatches(text: string, keywords: readonly string[]): string[] {
    const matches: string[] = [];
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matches.push(keyword);
      }
    }
    return matches;
  }

  /**
   * Estimate language complexity from code context
   */
  private estimateLanguageComplexity(
    codeContext?: string,
    filePaths?: string[]
  ): 'low' | 'medium' | 'high' | undefined {
    if (!codeContext && (!filePaths || filePaths.length === 0)) {
      return undefined;
    }

    // Simple heuristic based on file extensions
    const complexExtensions = ['.ts', '.tsx', '.rs', '.cpp', '.c', '.go'];
    const mediumExtensions = ['.js', '.jsx', '.py', '.java'];
    const simpleExtensions = ['.json', '.yaml', '.md', '.txt', '.css', '.html'];

    if (filePaths) {
      for (const path of filePaths) {
        if (complexExtensions.some((ext) => path.endsWith(ext))) return 'high';
      }
      for (const path of filePaths) {
        if (mediumExtensions.some((ext) => path.endsWith(ext))) return 'medium';
      }
      for (const path of filePaths) {
        if (simpleExtensions.some((ext) => path.endsWith(ext))) return 'low';
      }
    }

    // Code-based heuristic
    if (codeContext) {
      const hasGenerics = /<[A-Z][^>]*>/.test(codeContext);
      const hasAsyncAwait = /\b(async|await)\b/.test(codeContext);
      const hasComplexTypes = /\b(interface|type|class)\b/.test(codeContext);

      if (hasGenerics && hasComplexTypes) return 'high';
      if (hasAsyncAwait || hasComplexTypes) return 'medium';
      return 'low';
    }

    return 'medium';
  }

  /**
   * Estimate cyclomatic complexity (simple heuristic)
   */
  private estimateCyclomaticComplexity(code: string): number {
    // Count decision points: if, for, while, case, catch, &&, ||, ?
    const patterns = [
      /\bif\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /&&/g,
      /\|\|/g,
      /\?/g,
    ];

    let complexity = 1; // Base complexity

    for (const pattern of patterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }

    return complexity;
  }

  /**
   * Count dependencies in code context
   */
  private countDependencies(codeContext?: string): number | undefined {
    if (!codeContext) return undefined;

    // Count import/require statements
    const importMatches = codeContext.match(/\b(import|require|from)\b.*['"].*['"]/g);
    return importMatches ? importMatches.length : 0;
  }

  /**
   * Get transform keywords for Agent Booster detection
   */
  private getTransformKeywords(transformType: TransformType): string[] {
    const keywordMap: Record<TransformType, string[]> = {
      'var-to-const': ['var to const', 'convert var', 'var declaration'],
      'add-types': ['add types', 'typescript types', 'type annotations'],
      'remove-console': ['remove console', 'delete console', 'console.log'],
      'promise-to-async': [
        'promise to async',
        'async await',
        '.then to async',
      ],
      'cjs-to-esm': [
        'commonjs to esm',
        'require to import',
        'convert to esm',
      ],
      'func-to-arrow': ['arrow function', 'function to arrow', 'convert to arrow'],
    };

    return keywordMap[transformType] || [];
  }

  /**
   * Find alternative tiers that could handle this task
   */
  private findAlternateTiers(
    complexity: number,
    recommendedTier: ModelTier
  ): ModelTier[] {
    const alternatives: ModelTier[] = [];

    // Add adjacent tiers
    if (recommendedTier > 0) {
      alternatives.push((recommendedTier - 1) as ModelTier);
    }
    if (recommendedTier < 4) {
      alternatives.push((recommendedTier + 1) as ModelTier);
    }

    // Add tier that can definitely handle it (higher tier)
    if (recommendedTier < 3 && !alternatives.includes(4)) {
      alternatives.push(4);
    }

    return alternatives;
  }

  /**
   * Generate human-readable explanation
   */
  private generateExplanation(
    overall: number,
    tier: ModelTier,
    signals: ComplexitySignals
  ): string {
    const parts: string[] = [];

    parts.push(`Complexity score: ${overall}/100 (Tier ${tier})`);

    if (signals.isMechanicalTransform) {
      parts.push(
        `Detected mechanical transform: ${signals.detectedTransformType}`
      );
    }

    if (signals.hasArchitectureScope) {
      parts.push('Architecture scope detected');
    }

    if (signals.hasSecurityScope) {
      parts.push('Security scope detected');
    }

    if (signals.requiresMultiStepReasoning) {
      parts.push('Multi-step reasoning required');
    }

    if (signals.requiresCrossDomainCoordination) {
      parts.push('Cross-domain coordination required');
    }

    if (signals.linesOfCode !== undefined && signals.linesOfCode > 100) {
      parts.push(`Large code change: ${signals.linesOfCode} lines`);
    }

    if (signals.fileCount !== undefined && signals.fileCount > 3) {
      parts.push(`Multi-file change: ${signals.fileCount} files`);
    }

    return parts.join('. ');
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a complexity analyzer instance
 */
export function createComplexityAnalyzer(
  config: ModelRouterConfig,
  agentBoosterAdapter?: IAgentBoosterAdapter
): ComplexityAnalyzer {
  return new ComplexityAnalyzer(config, agentBoosterAdapter);
}

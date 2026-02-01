/**
 * Agentic QE v3 - Signal Collector
 * ADR-051: Multi-Model Router - Signal Collection
 *
 * Extracts complexity signals from task inputs for model routing decisions.
 * Collects signals including:
 * - Code metrics (lines, files, cyclomatic complexity)
 * - Keyword pattern matching
 * - Scope detection (architecture, security)
 * - Agent Booster eligibility
 *
 * @module integrations/agentic-flow/model-router/signal-collector
 */

import type { ComplexitySignals, RoutingInput, ModelRouterConfig } from './types';
import type { TransformType, IAgentBoosterAdapter } from '../agent-booster/types';
import { ALL_TRANSFORM_TYPES } from '../agent-booster/types';

// ============================================================================
// Keyword Patterns for Complexity Detection
// ============================================================================

/**
 * Keyword patterns for different complexity levels
 */
export const COMPLEXITY_KEYWORDS = {
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
export const SCOPE_PATTERNS = {
  architecture: /\b(architect|design|system design|overall structure|component design)\b/i,
  security: /\b(security|vulnerability|audit|xss|sql injection|csrf|encryption)\b/i,
  multiStep: /\b(orchestrate|coordinate|workflow|pipeline|multi[- ]step)\b/i,
  crossDomain: /\b(cross[- ]domain|across (domains|modules)|integrate|coordination)\b/i,
} as const;

// ============================================================================
// Signal Collector Interface
// ============================================================================

/**
 * Interface for collecting complexity signals
 */
export interface ISignalCollector {
  /**
   * Collect all complexity signals from input
   */
  collectSignals(input: RoutingInput): Promise<ComplexitySignals>;

  /**
   * Check if task is eligible for Agent Booster (Tier 0)
   */
  checkAgentBoosterEligibility(input: RoutingInput): Promise<{
    eligible: boolean;
    transformType?: TransformType;
    confidence: number;
    reason: string;
  }>;
}

// ============================================================================
// Signal Collector Implementation
// ============================================================================

/**
 * Collects complexity signals from task inputs
 */
export class SignalCollector implements ISignalCollector {
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
   * Collect all complexity signals from input
   */
  async collectSignals(input: RoutingInput): Promise<ComplexitySignals> {
    const taskLower = input.task.toLowerCase();

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
    const requiresCreativity = this.detectCreativityRequirement(taskLower);

    // Estimate language complexity
    const languageComplexity = this.estimateLanguageComplexity(
      input.codeContext,
      input.filePaths
    );

    // Estimate cyclomatic complexity
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
          // ADR-051 Fix: Increase confidence per match to exceed threshold
          // Primary keyword match gets 0.5, secondary matches add 0.25
          confidence = confidence === 0 ? 0.5 : confidence + 0.25;
        }
      }

      // ADR-051 Fix: Boost confidence for mechanical transform keyword matches
      // Check if task matches any mechanical keywords from COMPLEXITY_KEYWORDS
      for (const mechanicalKeyword of COMPLEXITY_KEYWORDS.mechanical) {
        if (taskLower.includes(mechanicalKeyword.toLowerCase())) {
          confidence = Math.max(confidence, 0.6);
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
      } catch (error) {
        // Non-critical: WASM analysis failed, using keyword detection
        console.debug('[SignalCollector] WASM analysis error:', error instanceof Error ? error.message : error);
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

  // ============================================================================
  // Private Helper Methods
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
   * Detect creativity requirements from task text
   */
  private detectCreativityRequirement(taskLower: string): boolean {
    return (
      taskLower.includes('design') ||
      taskLower.includes('creative') ||
      taskLower.includes('innovative') ||
      taskLower.includes('novel')
    );
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
    // ADR-051 Fix: Expanded keyword patterns for better booster eligibility detection
    const keywordMap: Record<TransformType, string[]> = {
      'var-to-const': [
        'var to const',
        'convert var',
        'var declaration',
        'var to let',
        'convert var to const',  // Added explicit full phrase
        'change var to const',
      ],
      'add-types': [
        'add types',
        'add type',
        'typescript types',
        'type annotations',
        'type annotation',
        'add type annotations',
      ],
      'remove-console': [
        'remove console',
        'delete console',
        'console.log',
        'remove console.log',
        'strip console',
      ],
      'promise-to-async': [
        'promise to async',
        'async await',
        '.then to async',
        'convert to async',
        'convert function to async',
      ],
      'cjs-to-esm': [
        'commonjs to esm',
        'require to import',
        'convert to esm',
        'cjs to esm',
        'module conversion',
      ],
      'func-to-arrow': [
        'arrow function',
        'function to arrow',
        'convert to arrow',
        'convert function to arrow',
      ],
    };

    return keywordMap[transformType] || [];
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a signal collector instance
 */
export function createSignalCollector(
  config: ModelRouterConfig,
  agentBoosterAdapter?: IAgentBoosterAdapter
): SignalCollector {
  return new SignalCollector(config, agentBoosterAdapter);
}

/**
 * Complexity-Driven Team Composer
 * Inspired by loki-mode agent composition pattern
 *
 * Bridges existing AST complexity analysis and fleet tier selection
 * with specific agent team recommendations. Uses deterministic rules
 * (no LLM) to map code complexity dimensions to the optimal agent
 * composition for quality engineering tasks.
 */

// ============================================================================
// Types
// ============================================================================

/** Additional dimensions beyond what ComplexityMetrics provides */
export interface ExtendedDimensions {
  /** 0-1: auth, crypto, token, user input patterns */
  securitySurface: number;
  /** 0-1: async, Promise, shared state patterns */
  concurrency: number;
  /** 0-1: map, filter, reduce chains */
  dataFlow: number;
  /** 0-1: exported functions/classes ratio */
  apiSurface: number;
}

export interface AgentRecommendation {
  /** e.g., 'qe-test-generator' */
  agentType: string;
  /** 1=critical, 2=important, 3=optional */
  priority: number;
  /** Human-readable reason for including this agent */
  reason: string;
}

export interface TeamComposition {
  agents: AgentRecommendation[];
  /** e.g., ['unit', 'integration', 'security'] */
  testTypes: string[];
  recommendedTier: 'haiku' | 'sonnet' | 'opus';
  complexityCategory: 'trivial' | 'simple' | 'moderate' | 'complex' | 'critical';
}

/**
 * Minimal complexity input that the composer needs.
 * Compatible with ComplexityMetrics from ruvector/interfaces.ts but
 * only requires the fields we actually use.
 */
export interface ComplexityInput {
  cyclomatic: number;
  cognitive: number;
  linesOfCode: number;
  maintainabilityIndex: number;
}

export interface TeamComposerConfig {
  securityKeywords: string[];
  concurrencyKeywords: string[];
  enableDimensionOverrides: boolean;
}

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_SECURITY_KEYWORDS = [
  'password', 'secret', 'token', 'crypto', 'auth',
  'credential', 'jwt', 'oauth',
];

const DEFAULT_CONCURRENCY_KEYWORDS = [
  'async', 'await', 'Promise', 'setTimeout', 'setInterval',
  'Worker', 'mutex', 'lock',
];

const DEFAULT_CONFIG: TeamComposerConfig = {
  securityKeywords: DEFAULT_SECURITY_KEYWORDS,
  concurrencyKeywords: DEFAULT_CONCURRENCY_KEYWORDS,
  enableDimensionOverrides: false,
};

// ============================================================================
// Complexity Category Thresholds
// ============================================================================

/**
 * Determine complexity category from combined cyclomatic + cognitive scores.
 * These thresholds align with the existing AST complexity analyzer.
 */
function categorize(cyclomatic: number, cognitive: number): TeamComposition['complexityCategory'] {
  const combined = cyclomatic + cognitive;
  if (combined <= 8) return 'trivial';
  if (combined <= 20) return 'simple';
  if (combined <= 40) return 'moderate';
  if (combined <= 70) return 'complex';
  return 'critical';
}

// ============================================================================
// TeamComposer
// ============================================================================

export class TeamComposer {
  private readonly config: TeamComposerConfig;

  constructor(config?: Partial<TeamComposerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze extended complexity dimensions from raw source code.
   * All scores are clamped to [0, 1].
   */
  analyzeExtendedDimensions(sourceCode: string): ExtendedDimensions {
    const lines = sourceCode.split('\n');
    const totalLines = Math.max(lines.length, 1);

    // Security surface: count lines containing security keywords
    const securityHits = this.countKeywordLines(lines, this.config.securityKeywords);
    const securitySurface = clamp(securityHits / totalLines, 0, 1);

    // Concurrency: count lines containing concurrency keywords
    const concurrencyHits = this.countKeywordLines(lines, this.config.concurrencyKeywords);
    const concurrency = clamp(concurrencyHits / totalLines, 0, 1);

    // Data flow: count .map/.filter/.reduce chains per total lines
    const dataFlowHits = this.countPatternMatches(sourceCode, /\.(map|filter|reduce|flatMap|forEach)\s*\(/g);
    const dataFlow = clamp(dataFlowHits / totalLines, 0, 1);

    // API surface: count export declarations / total declaration-like lines
    const exportCount = this.countPatternMatches(sourceCode, /^export\s/gm);
    const declarationCount = Math.max(
      this.countPatternMatches(sourceCode, /^(export\s+)?(const|let|var|function|class|interface|type|enum)\s/gm),
      1,
    );
    const apiSurface = clamp(exportCount / declarationCount, 0, 1);

    return { securitySurface, concurrency, dataFlow, apiSurface };
  }

  /**
   * Compose an optimal agent team based on complexity metrics, fleet tier,
   * and source code analysis.
   *
   * @param complexityMetrics - Core complexity metrics (cyclomatic, cognitive, etc.)
   * @param tier - Fleet tier string (used for logging/context, composition is driven by metrics)
   * @param sourceCode - Raw source code for extended dimension analysis
   */
  compose(
    complexityMetrics: ComplexityInput,
    tier: string,
    sourceCode: string,
  ): TeamComposition {
    const category = categorize(complexityMetrics.cyclomatic, complexityMetrics.cognitive);
    const dimensions = this.analyzeExtendedDimensions(sourceCode);

    const agents: AgentRecommendation[] = [];
    const testTypes: string[] = [];
    let recommendedTier: TeamComposition['recommendedTier'];

    switch (category) {
      case 'trivial':
      case 'simple':
        agents.push({
          agentType: 'qe-test-generator',
          priority: 1,
          reason: `${category} complexity — basic test generation sufficient`,
        });
        testTypes.push('unit');
        recommendedTier = 'haiku';
        break;

      case 'moderate':
        agents.push(
          {
            agentType: 'qe-test-generator',
            priority: 1,
            reason: 'Moderate complexity requires thorough test generation',
          },
          {
            agentType: 'qe-code-intelligence',
            priority: 2,
            reason: 'Moderate complexity benefits from code intelligence analysis',
          },
        );
        testTypes.push('unit', 'integration');
        recommendedTier = 'sonnet';
        break;

      case 'complex':
        agents.push(
          {
            agentType: 'qe-test-generator',
            priority: 1,
            reason: 'Complex code needs comprehensive test generation',
          },
          {
            agentType: 'qe-security-scanner',
            priority: 2,
            reason: 'High complexity warrants security analysis',
          },
          {
            agentType: 'qe-code-intelligence',
            priority: 2,
            reason: 'Complex code requires deep code intelligence',
          },
        );
        testTypes.push('unit', 'integration', 'security');
        recommendedTier = 'sonnet';
        break;

      case 'critical':
        agents.push(
          {
            agentType: 'qe-test-generator',
            priority: 1,
            reason: 'Critical complexity demands full test generation',
          },
          {
            agentType: 'qe-security-scanner',
            priority: 1,
            reason: 'Critical complexity mandates security scanning',
          },
          {
            agentType: 'qe-code-intelligence',
            priority: 1,
            reason: 'Critical complexity requires deep analysis',
          },
          {
            agentType: 'qe-chaos-resilience',
            priority: 2,
            reason: 'Critical systems need chaos/resilience testing',
          },
          {
            agentType: 'qe-performance',
            priority: 2,
            reason: 'Critical complexity warrants performance analysis',
          },
        );
        testTypes.push('unit', 'integration', 'security', 'chaos', 'performance');
        recommendedTier = 'opus';
        break;
    }

    // Dimension-driven overrides
    if (dimensions.securitySurface > 0.3) {
      if (!agents.some(a => a.agentType === 'qe-security-scanner')) {
        agents.push({
          agentType: 'qe-security-scanner',
          priority: 2,
          reason: `High security surface (${(dimensions.securitySurface * 100).toFixed(0)}%) — security scanning recommended`,
        });
      }
      if (!testTypes.includes('security')) {
        testTypes.push('security');
      }
    }

    if (dimensions.concurrency > 0.3) {
      if (!agents.some(a => a.agentType === 'qe-chaos-resilience')) {
        agents.push({
          agentType: 'qe-chaos-resilience',
          priority: 2,
          reason: `High concurrency (${(dimensions.concurrency * 100).toFixed(0)}%) — chaos/resilience testing recommended`,
        });
      }
      if (!testTypes.includes('chaos')) {
        testTypes.push('chaos');
      }
    }

    if (dimensions.apiSurface > 0.5) {
      if (!testTypes.includes('integration')) {
        testTypes.push('integration');
      }
    }

    // Sort agents by priority (lower number = higher priority)
    agents.sort((a, b) => a.priority - b.priority);

    return {
      agents,
      testTypes,
      recommendedTier,
      complexityCategory: category,
    };
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private countKeywordLines(lines: string[], keywords: string[]): number {
    let count = 0;
    for (const line of lines) {
      for (const kw of keywords) {
        if (line.includes(kw)) {
          count++;
          break; // count each line at most once
        }
      }
    }
    return count;
  }

  private countPatternMatches(text: string, pattern: RegExp): number {
    const matches = text.match(pattern);
    return matches ? matches.length : 0;
  }
}

// ============================================================================
// Utility
// ============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

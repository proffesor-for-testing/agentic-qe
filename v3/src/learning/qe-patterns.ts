/**
 * Agentic QE v3 - QE Pattern Types and Domains
 * ADR-021: QE ReasoningBank for Pattern Learning
 *
 * Defines QE-specific pattern types, domains, and validation.
 */

import type { DomainName } from '../shared/types/index.js';

// ============================================================================
// QE Domains - Pattern Classification
// ============================================================================

/**
 * QE domain patterns for automatic classification
 * Each domain has regex patterns to match against task descriptions
 * Aligned with the 12 DDD bounded contexts from DomainName type
 */
export const QE_DOMAINS = {
  // Core Testing Domains
  'test-generation': /test|spec|describe|it\(|expect|assert|mock|stub|fixture|tdd|bdd/i,
  'test-execution': /run|execute|parallel|retry|flaky|timeout|worker|orchestrat/i,
  'coverage-analysis': /coverage|branch|line|uncovered|gap|untested|percentage|sublinear/i,

  // Quality Domains
  'quality-assessment': /quality|gate|deploy|readiness|metric|threshold|sla|score/i,
  'defect-intelligence': /defect|bug|predict|root.?cause|regression|failure|incident/i,
  'requirements-validation': /requirement|bdd|gherkin|testabil|accept|criteri|scenario/i,

  // Analysis Domains
  'code-intelligence': /semantic|knowledge|graph|ast|symbol|reference|impact|depend/i,
  'security-compliance': /vuln|cve|owasp|xss|sqli|injection|csrf|auth|secret|compliance|sast|dast/i,
  'contract-testing': /contract|pact|openapi|swagger|graphql|schema|endpoint|api/i,

  // Specialized Testing Domains
  'visual-accessibility': /screenshot|visual|snapshot|pixel|percy|a11y|aria|wcag|screen.?reader|accessible|contrast/i,
  'chaos-resilience': /chaos|resilience|fault|inject|blast|recover|latency|failure|stress|load/i,
  'learning-optimization': /learn|pattern|optim|neural|embedding|vector|memory|adapt|train/i,
} as const;

/**
 * QE Domain type - aligned with DomainName from shared types
 */
export type QEDomain = keyof typeof QE_DOMAINS;

/**
 * QE pattern types - specific pattern categories
 */
export type QEPatternType =
  | 'test-template' // Reusable test structure
  | 'assertion-pattern' // How to assert specific conditions
  | 'mock-pattern' // How to mock specific dependencies
  | 'coverage-strategy' // Coverage improvement approaches
  | 'mutation-strategy' // Mutation testing patterns
  | 'api-contract' // API testing patterns
  | 'visual-baseline' // Visual regression patterns
  | 'a11y-check' // Accessibility test patterns
  | 'perf-benchmark' // Performance test patterns
  | 'flaky-fix' // Flaky test fix patterns
  | 'refactor-safe' // Refactoring patterns that preserve tests
  | 'error-handling'; // Error handling test patterns

/**
 * Test framework identifiers
 */
export type TestFramework =
  | 'jest'
  | 'vitest'
  | 'mocha'
  | 'pytest'
  | 'junit'
  | 'testng'
  | 'playwright'
  | 'cypress'
  | 'selenium';

/**
 * Programming language identifiers
 */
export type ProgrammingLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'java'
  | 'go'
  | 'rust'
  | 'csharp'
  | 'kotlin';

/**
 * Pattern complexity levels
 */
export type ComplexityLevel = 'simple' | 'medium' | 'complex';

// ============================================================================
// QE Pattern Interface
// ============================================================================

/**
 * QE-specific pattern for learning and reuse
 */
export interface QEPattern {
  /** Unique pattern identifier */
  readonly id: string;

  /** Pattern type category */
  readonly patternType: QEPatternType;

  /** QE domain this pattern belongs to */
  readonly qeDomain: QEDomain;

  /** Mapped AQE domain name */
  readonly domain: DomainName;

  /** Human-readable pattern name */
  readonly name: string;

  /** Detailed description of what this pattern does */
  readonly description: string;

  /** Pattern confidence score (0-1) */
  readonly confidence: number;

  /** Number of times this pattern has been used */
  readonly usageCount: number;

  /** Success rate when applied (0-1) */
  readonly successRate: number;

  /** Quality score combining confidence, usage, and success */
  readonly qualityScore: number;

  /** Pattern applicability context */
  readonly context: QEPatternContext;

  /** The actual pattern template */
  readonly template: QEPatternTemplate;

  /** Vector embedding for similarity search */
  readonly embedding?: number[];

  /** Short-term or long-term storage */
  readonly tier: 'short-term' | 'long-term';

  /** Creation timestamp */
  readonly createdAt: Date;

  /** Last used timestamp */
  readonly lastUsedAt: Date;

  /** Number of successful uses (for promotion) */
  readonly successfulUses: number;

  // ============================================================================
  // Token Tracking Fields (ADR-042)
  // ============================================================================

  /** Total tokens used when this pattern was created/last applied */
  readonly tokensUsed?: number;

  /** Input tokens consumed */
  readonly inputTokens?: number;

  /** Output tokens generated */
  readonly outputTokens?: number;

  /** Latency in milliseconds when pattern was applied */
  readonly latencyMs?: number;

  /** Whether this pattern can be reused to skip LLM calls */
  readonly reusable: boolean;

  /** Number of times this pattern has been reused */
  readonly reuseCount: number;

  /** Average tokens saved when this pattern is reused */
  readonly averageTokenSavings: number;

  /** Total tokens saved across all reuses */
  readonly totalTokensSaved?: number;

  // ============================================================================
  // ADR-061: Asymmetric Learning / Quarantine Fields
  // ============================================================================

  /** Whether this pattern is quarantined due to low confidence (ADR-061) */
  readonly quarantined?: boolean;

  /** When the pattern was quarantined (ADR-061) */
  readonly quarantinedAt?: Date;

  /** Consecutive success count for rehabilitation tracking (ADR-061) */
  readonly consecutiveSuccesses?: number;

  /** Asymmetric failure penalty ratio applied (ADR-061) */
  readonly asymmetryRatio?: number;
}

/**
 * Pattern applicability context
 */
export interface QEPatternContext {
  /** Programming language this pattern applies to */
  readonly language?: ProgrammingLanguage;

  /** Test framework this pattern uses */
  readonly framework?: TestFramework;

  /** Test type (unit, integration, e2e) */
  readonly testType?: 'unit' | 'integration' | 'e2e' | 'contract' | 'smoke';

  /** Code context pattern applies to */
  readonly codeContext?: 'class' | 'function' | 'module' | 'api' | 'component';

  /** Complexity level */
  readonly complexity?: ComplexityLevel;

  /** Related domains */
  readonly relatedDomains?: QEDomain[];

  /** Searchable tags */
  readonly tags: string[];
}

/**
 * Pattern template with variables
 */
export interface QEPatternTemplate {
  /** Template type */
  readonly type: 'code' | 'prompt' | 'workflow' | 'config';

  /** Template content with {{variable}} placeholders */
  readonly content: string;

  /** Variables that need to be filled in */
  readonly variables: QETemplateVariable[];

  /** Example of filled template */
  readonly example?: string;
}

/**
 * Template variable definition
 */
export interface QETemplateVariable {
  /** Variable name (matches {{name}} in template) */
  readonly name: string;

  /** Variable type */
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'code';

  /** Whether this variable is required */
  readonly required: boolean;

  /** Default value if not provided */
  readonly defaultValue?: unknown;

  /** Description for users/agents */
  readonly description?: string;

  /** Validation pattern (regex for strings) */
  readonly validation?: string;
}

// ============================================================================
// Pattern Creation & Validation
// ============================================================================

/**
 * Options for creating a new QE pattern
 */
export interface CreateQEPatternOptions {
  patternType: QEPatternType;
  name: string;
  description: string;
  template: Omit<QEPatternTemplate, 'example'>;
  context?: Partial<QEPatternContext>;
  embedding?: number[];
  /** Initial confidence score (0-1). Defaults to 0.5 if not provided. */
  confidence?: number;
  /** Explicit QE domain override. When provided, bypasses auto-detection from patternType. */
  qeDomain?: QEDomain;
}

/**
 * Detect QE domain from task description
 */
export function detectQEDomain(taskDescription: string): QEDomain | null {
  for (const [domain, pattern] of Object.entries(QE_DOMAINS)) {
    if (pattern.test(taskDescription)) {
      return domain as QEDomain;
    }
  }
  return null;
}

/**
 * Detect multiple QE domains from task description
 */
export function detectQEDomains(taskDescription: string): QEDomain[] {
  const detected: QEDomain[] = [];
  for (const [domain, pattern] of Object.entries(QE_DOMAINS)) {
    if (pattern.test(taskDescription)) {
      detected.push(domain as QEDomain);
    }
  }
  return detected;
}

/**
 * Map QE domain to AQE bounded context domain
 * Since QEDomain is now aligned with DomainName, this is an identity mapping
 */
export function mapQEDomainToAQE(qeDomain: QEDomain): DomainName {
  // QEDomain and DomainName are now aligned (same 12 domains)
  return qeDomain as DomainName;
}

/**
 * Calculate pattern quality score
 */
export function calculateQualityScore(pattern: {
  confidence: number;
  usageCount: number;
  successRate: number;
}): number {
  // Weighted scoring:
  // - Confidence: 30% (how certain we are about the pattern)
  // - Usage: 20% (popularity, capped at 100 uses)
  // - Success Rate: 50% (effectiveness)
  const usageScore = Math.min(pattern.usageCount / 100, 1);
  return (
    pattern.confidence * 0.3 + usageScore * 0.2 + pattern.successRate * 0.5
  );
}

/**
 * Pattern promotion check result
 */
export interface PromotionCheck {
  meetsUsageCriteria: boolean;
  meetsQualityCriteria: boolean;
  meetsCoherenceCriteria: boolean;
  blockReason?: 'insufficient_usage' | 'low_quality' | 'coherence_violation';
}

/**
 * Check if pattern should be promoted to long-term storage
 * Requires 3+ successful uses as per ADR-021
 * Optionally checks coherence energy to prevent contradictory patterns (ADR-052)
 *
 * @param pattern - Pattern to evaluate for promotion
 * @param coherenceEnergy - Optional coherence energy from coherence gate
 * @param coherenceThreshold - Threshold for coherence violation (default: 0.4)
 */
export function shouldPromotePattern(
  pattern: QEPattern,
  coherenceEnergy?: number,
  coherenceThreshold: number = 0.4
): PromotionCheck {
  const meetsUsageCriteria = pattern.tier === 'short-term' && pattern.successfulUses >= 3;
  const meetsQualityCriteria = pattern.successRate >= 0.7 && pattern.confidence >= 0.6;

  // NEW: Coherence criteria - only block if coherence energy is provided and exceeds threshold
  const meetsCoherenceCriteria = coherenceEnergy === undefined || coherenceEnergy < coherenceThreshold;

  let blockReason: PromotionCheck['blockReason'] | undefined;
  if (!meetsUsageCriteria) {
    blockReason = 'insufficient_usage';
  } else if (!meetsQualityCriteria) {
    blockReason = 'low_quality';
  } else if (!meetsCoherenceCriteria) {
    blockReason = 'coherence_violation';
  }

  return {
    meetsUsageCriteria,
    meetsQualityCriteria,
    meetsCoherenceCriteria,
    blockReason,
  };
}

/**
 * Validate QE pattern structure
 */
export function validateQEPattern(
  pattern: Partial<QEPattern>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!pattern.id) errors.push('Pattern ID is required');
  if (!pattern.patternType) errors.push('Pattern type is required');
  if (!pattern.qeDomain) errors.push('QE domain is required');
  if (!pattern.name) errors.push('Pattern name is required');
  if (!pattern.template?.content) errors.push('Template content is required');

  if (
    pattern.confidence !== undefined &&
    (pattern.confidence < 0 || pattern.confidence > 1)
  ) {
    errors.push('Confidence must be between 0 and 1');
  }

  if (
    pattern.successRate !== undefined &&
    (pattern.successRate < 0 || pattern.successRate > 1)
  ) {
    errors.push('Success rate must be between 0 and 1');
  }

  // Validate template variables
  if (pattern.template?.variables) {
    const variableNames = new Set<string>();
    for (const variable of pattern.template.variables) {
      if (variableNames.has(variable.name)) {
        errors.push(`Duplicate variable name: ${variable.name}`);
      }
      variableNames.add(variable.name);

      // Check if variable is referenced in template
      if (!pattern.template.content.includes(`{{${variable.name}}}`)) {
        errors.push(
          `Variable ${variable.name} not referenced in template`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Apply template variables to pattern content
 */
export function applyPatternTemplate(
  template: QEPatternTemplate,
  variables: Record<string, unknown>
): string {
  let content = template.content;

  for (const variable of template.variables) {
    const value = variables[variable.name] ?? variable.defaultValue;

    if (variable.required && value === undefined) {
      throw new Error(`Required variable ${variable.name} not provided`);
    }

    if (value !== undefined) {
      const placeholder = `{{${variable.name}}}`;
      const stringValue =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      content = content.split(placeholder).join(stringValue);
    }
  }

  return content;
}

// ============================================================================
// Pattern Search & Matching
// ============================================================================

/**
 * Pattern match result
 */
export interface PatternMatchResult {
  pattern: QEPattern;
  score: number;
  matchedContext: {
    language: boolean;
    framework: boolean;
    testType: boolean;
    codeContext: boolean;
    domain: boolean;
  };
}

/**
 * Match patterns against a context
 */
export function matchPatternContext(
  pattern: QEPattern,
  context: Partial<QEPatternContext>
): PatternMatchResult {
  const matched = {
    language: !context.language || pattern.context.language === context.language,
    framework:
      !context.framework || pattern.context.framework === context.framework,
    testType: !context.testType || pattern.context.testType === context.testType,
    codeContext:
      !context.codeContext ||
      pattern.context.codeContext === context.codeContext,
    domain:
      !context.relatedDomains?.length ||
      context.relatedDomains.some((d) =>
        pattern.context.relatedDomains?.includes(d)
      ),
  };

  // Calculate match score
  const matchedCount = Object.values(matched).filter(Boolean).length;
  const totalChecked = Object.values(matched).length;
  const contextScore = matchedCount / totalChecked;

  // Combine with pattern quality score
  const score = contextScore * 0.6 + pattern.qualityScore * 0.4;

  return { pattern, score, matchedContext: matched };
}

// ============================================================================
// Exports
// ============================================================================

export const QE_PATTERN_TYPES: QEPatternType[] = [
  'test-template',
  'assertion-pattern',
  'mock-pattern',
  'coverage-strategy',
  'mutation-strategy',
  'api-contract',
  'visual-baseline',
  'a11y-check',
  'perf-benchmark',
  'flaky-fix',
  'refactor-safe',
  'error-handling',
];

export const QE_DOMAIN_LIST: QEDomain[] = Object.keys(QE_DOMAINS) as QEDomain[];

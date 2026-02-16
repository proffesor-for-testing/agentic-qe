/**
 * Agentic QE v3 - Code Transform Integration for Test Generation
 *
 * Integrates Agent Booster (ADR-051) with the test-generation domain to provide
 * fast mechanical code transforms for generated test code.
 *
 * Agent Booster provides 352x faster transforms by using WASM/TypeScript instead
 * of LLM API calls for mechanical patterns like:
 * - var-to-const: Convert var declarations to const/let
 * - remove-console: Remove console.* statements
 * - func-to-arrow: Convert function declarations to arrow functions
 *
 * This integration:
 * 1. Checks if generated test code is eligible for Agent Booster transforms
 * 2. Applies eligible transforms for faster, cleaner code
 * 3. Falls back to original code if transforms fail or are ineligible
 *
 * @module domains/test-generation/services/code-transform-integration
 */

import type { Result } from '../../../shared/types';
import type { TransformType, TransformResult, IAgentBoosterAdapter } from '../../../integrations/agentic-flow';
import { toErrorMessage } from '../../../shared/error-utils.js';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configuration for Agent Booster integration with test generation
 */
export interface CodeTransformConfig {
  /** Enable Agent Booster integration */
  enabled: boolean;

  /** Minimum confidence threshold for applying transforms */
  confidenceThreshold: number;

  /** Transforms to apply to generated test code */
  enabledTransforms: TransformType[];

  /** Whether to log transform metrics */
  logMetrics: boolean;
}

/**
 * Default configuration - conservative settings for test generation
 */
export const DEFAULT_TRANSFORM_CONFIG: CodeTransformConfig = {
  enabled: true,
  confidenceThreshold: 0.8,
  enabledTransforms: ['var-to-const', 'remove-console'],
  logMetrics: false,
};

// ============================================================================
// Eligibility Check
// ============================================================================

/**
 * Patterns that indicate code is suitable for Agent Booster transforms
 */
const TRANSFORM_PATTERNS: Record<TransformType, RegExp[]> = {
  'var-to-const': [/\bvar\s+\w+/],
  'add-types': [/function\s+\w+\s*\([^)]*\)\s*\{/],
  'remove-console': [/console\.(log|warn|error|info|debug|trace)\(/],
  'promise-to-async': [/\.then\s*\(/],
  'cjs-to-esm': [/require\s*\(/, /module\.exports/],
  'func-to-arrow': [/\bfunction\s+\w+\s*\(/],
};

/**
 * Check if code has patterns eligible for a specific transform
 *
 * @param code - Source code to check
 * @param type - Transform type to check eligibility for
 * @returns True if code contains patterns suitable for this transform
 */
export function isEligibleForTransform(code: string, type: TransformType): boolean {
  const patterns = TRANSFORM_PATTERNS[type];
  if (!patterns) return false;

  return patterns.some(pattern => pattern.test(code));
}

/**
 * Detect all transforms that could be applied to code
 *
 * @param code - Source code to analyze
 * @param enabledTransforms - List of transforms to consider
 * @returns List of eligible transform types
 */
export function detectEligibleTransforms(
  code: string,
  enabledTransforms: TransformType[] = ['var-to-const', 'remove-console']
): TransformType[] {
  return enabledTransforms.filter(type => isEligibleForTransform(code, type));
}

// ============================================================================
// Transform Result
// ============================================================================

/**
 * Result of applying code transforms
 */
export interface CodeTransformResult {
  /** Whether any transforms were applied */
  transformed: boolean;

  /** Resulting code (original if no transforms applied) */
  code: string;

  /** Transforms that were applied */
  appliedTransforms: TransformType[];

  /** Overall confidence score */
  confidence: number;

  /** Total duration in milliseconds */
  durationMs: number;

  /** Any warnings from transforms */
  warnings: string[];

  /** Any errors that occurred */
  errors: string[];
}

// ============================================================================
// Code Transform Service
// ============================================================================

/**
 * Code Transform Service for test generation
 *
 * Integrates Agent Booster with the test generation pipeline to clean up
 * generated test code using fast mechanical transforms.
 */
export class CodeTransformService {
  private adapter: IAgentBoosterAdapter | null = null;
  private readonly config: CodeTransformConfig;
  private metrics = {
    totalTransforms: 0,
    successfulTransforms: 0,
    totalTimeMs: 0,
  };

  constructor(config: Partial<CodeTransformConfig> = {}) {
    this.config = { ...DEFAULT_TRANSFORM_CONFIG, ...config };
  }

  /**
   * Initialize with an Agent Booster adapter
   *
   * @param adapter - Initialized Agent Booster adapter
   */
  setAdapter(adapter: IAgentBoosterAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Check if the service is ready to transform code
   */
  isReady(): boolean {
    return this.config.enabled && this.adapter !== null;
  }

  /**
   * Apply Agent Booster transforms to generated test code
   *
   * @param code - Generated test code
   * @returns Transform result with cleaned code
   *
   * @example
   * ```typescript
   * const service = new CodeTransformService();
   * service.setAdapter(await createAgentBoosterAdapter({ enabled: true }));
   *
   * const result = await service.transformTestCode(generatedCode);
   * if (result.transformed) {
   *   console.log('Cleaned code:', result.code);
   * }
   * ```
   */
  async transformTestCode(code: string): Promise<CodeTransformResult> {
    const startTime = Date.now();

    // Return original if not ready
    if (!this.isReady()) {
      return this.createNoTransformResult(code, startTime, 'Service not ready');
    }

    // Detect eligible transforms
    const eligibleTransforms = detectEligibleTransforms(code, this.config.enabledTransforms);

    if (eligibleTransforms.length === 0) {
      return this.createNoTransformResult(code, startTime, 'No eligible transforms');
    }

    // Apply transforms
    const appliedTransforms: TransformType[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    let currentCode = code;
    let overallConfidence = 1.0;

    for (const transformType of eligibleTransforms) {
      try {
        const result = await this.adapter!.transform(currentCode, transformType);

        if (result.success && result.confidence >= this.config.confidenceThreshold) {
          currentCode = result.transformedCode;
          appliedTransforms.push(transformType);
          overallConfidence = Math.min(overallConfidence, result.confidence);
          warnings.push(...result.warnings);

          this.metrics.successfulTransforms++;
        } else if (!result.success && result.error) {
          errors.push(`${transformType}: ${result.error}`);
        }

        this.metrics.totalTransforms++;
      } catch (error) {
        const message = toErrorMessage(error);
        errors.push(`${transformType}: ${message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    this.metrics.totalTimeMs += durationMs;

    if (this.config.logMetrics) {
      console.log(`[CodeTransformService] Applied ${appliedTransforms.length} transforms in ${durationMs}ms`);
    }

    return {
      transformed: appliedTransforms.length > 0,
      code: currentCode,
      appliedTransforms,
      confidence: overallConfidence,
      durationMs,
      warnings,
      errors,
    };
  }

  /**
   * Get transformation metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalTransforms: 0,
      successfulTransforms: 0,
      totalTimeMs: 0,
    };
  }

  /**
   * Create a result when no transforms are applied
   */
  private createNoTransformResult(
    code: string,
    startTime: number,
    reason: string
  ): CodeTransformResult {
    return {
      transformed: false,
      code,
      appliedTransforms: [],
      confidence: 1.0,
      durationMs: Date.now() - startTime,
      warnings: [reason],
      errors: [],
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a Code Transform Service with Agent Booster integration
 *
 * @param config - Optional configuration overrides
 * @returns Initialized CodeTransformService (adapter must be set separately)
 *
 * @example
 * ```typescript
 * const service = createCodeTransformService({ logMetrics: true });
 * const adapter = await createAgentBoosterAdapter({ enabled: true });
 * service.setAdapter(adapter);
 * ```
 */
export function createCodeTransformService(
  config: Partial<CodeTransformConfig> = {}
): CodeTransformService {
  return new CodeTransformService(config);
}

/**
 * Quick transform helper - applies transforms to code without needing to manage adapter
 *
 * @param code - Code to transform
 * @param config - Optional configuration
 * @returns Transform result
 *
 * @example
 * ```typescript
 * const result = await quickTransformTestCode(generatedTestCode);
 * if (result.transformed) {
 *   console.log(`Applied ${result.appliedTransforms.length} transforms`);
 * }
 * ```
 */
export async function quickTransformTestCode(
  code: string,
  config: Partial<CodeTransformConfig> = {}
): Promise<CodeTransformResult> {
  const mergedConfig = { ...DEFAULT_TRANSFORM_CONFIG, ...config };

  if (!mergedConfig.enabled) {
    return {
      transformed: false,
      code,
      appliedTransforms: [],
      confidence: 1.0,
      durationMs: 0,
      warnings: ['Transforms disabled'],
      errors: [],
    };
  }

  // Dynamically import to avoid circular dependencies
  const { createAgentBoosterAdapter } = await import('../../../integrations/agentic-flow');

  const adapter = await createAgentBoosterAdapter({ enabled: true });
  try {
    const service = new CodeTransformService(mergedConfig);
    service.setAdapter(adapter);
    return await service.transformTestCode(code);
  } finally {
    await adapter.dispose();
  }
}

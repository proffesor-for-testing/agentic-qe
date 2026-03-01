/**
 * Agentic QE v3 - Agent Booster Integration
 *
 * Agent Booster provides faster mechanical code transforms using TypeScript
 * implementations for simple patterns like:
 * - var-to-const: Convert var declarations to const/let
 * - add-types: Add TypeScript type annotations
 * - remove-console: Remove console.* statements
 * - promise-to-async: Convert .then() chains to async/await
 * - cjs-to-esm: Convert CommonJS to ES modules
 * - func-to-arrow: Convert function declarations to arrow functions
 *
 * **IMPORTANT: Implementation Status**
 * - TypeScript transforms: IMPLEMENTED (1-20ms latency)
 * - WASM acceleration: NOT IMPLEMENTED (planned for future)
 *
 * The "352x faster" claim applies to TypeScript transforms for these 6
 * specific mechanical patterns compared to LLM API calls (200-500ms).
 * WASM would be faster still, but is not yet available.
 *
 * Per ADR-051, Agent Booster becomes Tier 0 in the model routing hierarchy:
 * - Tier 0: Agent Booster (6 mechanical transforms only, 1-20ms, $0)
 * - Tier 1: Gemini Flash (simple tasks, free tier)
 * - Tier 2: Haiku (budget, ~500ms)
 * - Tier 3: GPT-4-mini (complex, ~1s)
 * - Tier 4: Opus (expert reasoning, ~3s)
 *
 * @example Basic Usage
 * ```typescript
 * import {
 *   createAgentBoosterAdapter,
 *   AgentBoosterConfig,
 * } from 'agentic-qe/integrations/agentic-flow/agent-booster';
 *
 * // Create and initialize adapter
 * const adapter = await createAgentBoosterAdapter({
 *   enabled: true,
 *   fallbackToLLM: true,
 *   confidenceThreshold: 0.7,
 * });
 *
 * // Transform code
 * const result = await adapter.transform(code, 'var-to-const');
 * console.log(result.confidence); // 0.95
 * console.log(result.durationMs); // 1-5ms
 * console.log(result.transformedCode);
 * ```
 *
 * @example Batch Processing
 * ```typescript
 * const files = [
 *   { path: 'src/utils.ts', content: '...' },
 *   { path: 'src/helpers.ts', content: '...' },
 * ];
 *
 * const batchResult = await adapter.batchTransform(files, 'remove-console');
 * console.log(`${batchResult.successCount}/${batchResult.totalFiles} files transformed`);
 * console.log(`${batchResult.totalChanges} total changes made`);
 * ```
 *
 * @example Opportunity Detection
 * ```typescript
 * const opportunities = await adapter.detectTransformOpportunities(code);
 *
 * for (const opp of opportunities.opportunities) {
 *   console.log(`${opp.type} at line ${opp.location.line}: ${opp.reason}`);
 *   console.log(`  Confidence: ${opp.confidence}`);
 *   console.log(`  Risk: ${opp.risk}`);
 * }
 * ```
 *
 * @module integrations/agentic-flow/agent-booster
 */

// ============================================================================
// Type Exports
// ============================================================================

export type {
  // Configuration
  AgentBoosterConfig,
  AgentBoosterLogger,

  // Transform types
  TransformType,
  TransformMetadata,

  // Result types
  TransformResult,
  BatchTransformResult,
  OpportunityDetectionResult,
  TransformOpportunity,
  CodeFile,
  FileTransformResult,
  CodeEdit,
  SourceLocation,

  // Health/status
  AgentBoosterHealth,

  // Interface
  IAgentBoosterAdapter,

  // Cache
  TransformCacheEntry,

  // Result wrappers
  TransformResultType,
  BatchTransformResultType,
  OpportunityDetectionResultType,
} from './types';

// ============================================================================
// Constant Exports
// ============================================================================

export {
  // Default configuration
  DEFAULT_AGENT_BOOSTER_CONFIG,

  // Transform metadata
  ALL_TRANSFORM_TYPES,
  TRANSFORM_METADATA,
} from './types';

// ============================================================================
// Error Exports
// ============================================================================

export {
  AgentBoosterError,
  TransformError,
  WasmUnavailableError,
  TransformTimeoutError,
  FileTooLargeError,
} from './types';

// ============================================================================
// Adapter Exports
// ============================================================================

export { AgentBoosterAdapter } from './adapter';

// ============================================================================
// Factory Function Exports
// ============================================================================

export {
  createAgentBoosterAdapter,
  createAgentBoosterAdapterSync,
} from './adapter';

// ============================================================================
// Transform Implementation Exports
// ============================================================================

export {
  // Individual transforms
  transformVarToConst,
  transformAddTypes,
  transformRemoveConsole,
  transformPromiseToAsync,
  transformCjsToEsm,
  transformFuncToArrow,

  // Registry and utilities
  TRANSFORM_REGISTRY,
  executeTransform,
  getAvailableTransformTypes,
} from './transforms';

export type {
  TransformFunction,
  TransformRegistry,
} from './transforms';

// ============================================================================
// Convenience Utilities
// ============================================================================

/**
 * Quick transform helper - creates adapter, transforms, and disposes
 *
 * @param code - Source code to transform
 * @param type - Transform type to apply
 * @returns Transform result
 *
 * @example
 * ```typescript
 * const result = await quickTransform(code, 'var-to-const');
 * if (result.success) {
 *   console.log(result.transformedCode);
 * }
 * ```
 */
export async function quickTransform(
  code: string,
  type: import('./types').TransformType
): Promise<import('./types').TransformResult> {
  const { createAgentBoosterAdapter } = await import('./adapter');

  const adapter = await createAgentBoosterAdapter({ enabled: true });
  try {
    return await adapter.transform(code, type);
  } finally {
    await adapter.dispose();
  }
}

/**
 * Quick batch transform helper
 *
 * @param files - Files to transform
 * @param type - Transform type to apply
 * @returns Batch transform result
 */
export async function quickBatchTransform(
  files: import('./types').CodeFile[],
  type: import('./types').TransformType
): Promise<import('./types').BatchTransformResult> {
  const { createAgentBoosterAdapter } = await import('./adapter');

  const adapter = await createAgentBoosterAdapter({ enabled: true });
  try {
    return await adapter.batchTransform(files, type);
  } finally {
    await adapter.dispose();
  }
}

/**
 * Quick opportunity detection helper
 *
 * @param code - Source code to analyze
 * @returns Detected opportunities
 */
export async function quickDetectOpportunities(
  code: string
): Promise<import('./types').OpportunityDetectionResult> {
  const { createAgentBoosterAdapter } = await import('./adapter');

  const adapter = await createAgentBoosterAdapter({ enabled: true });
  try {
    return await adapter.detectTransformOpportunities(code);
  } finally {
    await adapter.dispose();
  }
}

/**
 * Check if Agent Booster is available and working
 *
 * @returns True if Agent Booster can be used
 */
export async function isAgentBoosterAvailable(): Promise<boolean> {
  try {
    const { createAgentBoosterAdapter } = await import('./adapter');
    const adapter = await createAgentBoosterAdapter({ enabled: true });
    try {
      const health = adapter.getHealth();
      return health.ready;
    } finally {
      await adapter.dispose();
    }
  } catch {
    return false;
  }
}

/**
 * Get Agent Booster status summary
 *
 * @returns Status summary with availability and supported transforms
 */
export async function getAgentBoosterStatus(): Promise<{
  available: boolean;
  wasmAvailable: boolean;
  transforms: import('./types').TransformType[];
  metrics: {
    totalTransforms: number;
    successfulTransforms: number;
    averageDurationMs: number;
  };
}> {
  try {
    const { createAgentBoosterAdapter } = await import('./adapter');
    const adapter = await createAgentBoosterAdapter({ enabled: true });
    try {
      const health = adapter.getHealth();
      return {
        available: health.ready,
        wasmAvailable: health.wasmAvailable,
        transforms: health.availableTransforms,
        metrics: {
          totalTransforms: health.metrics.totalTransforms,
          successfulTransforms: health.metrics.successfulTransforms,
          averageDurationMs: health.metrics.averageDurationMs,
        },
      };
    } finally {
      await adapter.dispose();
    }
  } catch {
    return {
      available: false,
      wasmAvailable: false,
      transforms: [],
      metrics: {
        totalTransforms: 0,
        successfulTransforms: 0,
        averageDurationMs: 0,
      },
    };
  }
}

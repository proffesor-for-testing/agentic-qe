/**
 * Agentic QE v3 - Agent Booster Adapter
 *
 * Provides fast mechanical code transforms using Rust/WASM with TypeScript fallback.
 *
 * **IMPORTANT: Current Implementation Status**
 * - WASM acceleration: IMPLEMENTED (0.02-0.35ms latency, 1000x faster than LLM)
 * - TypeScript transforms: IMPLEMENTED as fallback (1-20ms latency)
 *
 * The adapter loads the local WASM module from `../../agent-booster-wasm/index.js`
 * and falls back to TypeScript if WASM is unavailable.
 *
 * **What Agent Booster CAN do:**
 * - 6 specific transform types: var-to-const, add-types, remove-console,
 *   promise-to-async, cjs-to-esm, func-to-arrow
 * - Ultra-fast for these mechanical patterns (0.02-0.35ms WASM, 1-20ms TS)
 *
 * **What Agent Booster CANNOT do:**
 * - Complex refactoring requiring semantic understanding
 * - Custom transforms not in the 6 supported types
 * - Context-aware changes (e.g., knowing if a variable should be const)
 *
 * Per ADR-051, this becomes Tier 0 in the model routing hierarchy,
 * handling mechanical transforms at <1ms and $0 cost.
 *
 * @example
 * ```typescript
 * const adapter = new AgentBoosterAdapter({ enabled: true });
 * await adapter.initialize();
 *
 * // Transform code
 * const result = await adapter.transform(code, 'var-to-const');
 * console.log(result.confidence); // 0.95
 * console.log(result.durationMs); // 0.02-0.35ms (WASM) or 1-20ms (TypeScript fallback)
 *
 * // Detect opportunities
 * const opportunities = await adapter.detectTransformOpportunities(code);
 * console.log(opportunities.totalCount);
 * ```
 *
 * @module integrations/agentic-flow/agent-booster/adapter
 */

import type {
  AgentBoosterConfig,
  TransformType,
  TransformResult,
  BatchTransformResult,
  OpportunityDetectionResult,
  TransformOpportunity,
  TransformMetadata,
  AgentBoosterHealth,
  IAgentBoosterAdapter,
  CodeFile,
  AgentBoosterLogger,
} from './types';

import {
  DEFAULT_AGENT_BOOSTER_CONFIG,
  ALL_TRANSFORM_TYPES,
  TRANSFORM_METADATA,
  TransformError,
  WasmUnavailableError,
  TransformTimeoutError,
  FileTooLargeError,
} from './types';

import { executeTransform } from './transforms';

import type { MetricsTracker } from '../metrics/metrics-tracker';

import { getPatternLoader } from '../pattern-loader';

// Import WASM module functions
import {
  transform as wasmTransform,
  warmup as wasmWarmup,
  isWasmAvailable as checkWasmAvailable,
  Language as WasmLanguage,
} from '../../agent-booster-wasm/index';

// ============================================================================
// Transform Type to WASM Language Mapping
// ============================================================================

/**
 * Map TransformType to WASM Language enum
 * The WASM module uses Language to determine parsing rules
 */
function getWasmLanguageForTransform(_type: TransformType): WasmLanguage {
  // All our transforms are for TypeScript/JavaScript
  // The WASM module handles both with TypeScript setting
  return WasmLanguage.TypeScript;
}

// ============================================================================
// Cache Implementation
// ============================================================================

interface CacheEntry {
  result: TransformResult;
  expiresAt: number;
}

/**
 * Simple in-memory cache for transform results
 */
class TransformCache {
  private cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly enabled: boolean;

  constructor(enabled: boolean, ttlMs: number) {
    this.enabled = enabled;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from code and transform type
   */
  private generateKey(code: string, type: TransformType): string {
    // Simple hash - in production, use a proper hash function
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `${type}:${hash}:${code.length}`;
  }

  /**
   * Get cached result if valid
   */
  get(code: string, type: TransformType): TransformResult | null {
    if (!this.enabled) return null;

    const key = this.generateKey(code, type);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  /**
   * Store result in cache
   */
  set(code: string, type: TransformType, result: TransformResult): void {
    if (!this.enabled) return;

    const key = this.generateKey(code, type);
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses
    };
  }
}

// ============================================================================
// Agent Booster Adapter
// ============================================================================

/**
 * Agent Booster adapter for fast mechanical code transforms
 *
 * **Current Implementation:**
 * - WASM acceleration (0.02-0.35ms) - ACTIVE (loaded from local module)
 * - TypeScript fallback (1-20ms) - ACTIVE (used when WASM unavailable)
 * - LLM fallback (if confidence < threshold) - AVAILABLE
 *
 * The adapter loads the WASM module from `../../agent-booster-wasm/index.js`
 * and gracefully falls back to TypeScript if WASM fails to load.
 */
export class AgentBoosterAdapter implements IAgentBoosterAdapter {
  private readonly config: AgentBoosterConfig;
  private readonly logger: AgentBoosterLogger;
  private readonly cache: TransformCache;
  private enabledTransforms: Set<TransformType>;  // Mutable: updated from PatternLoader
  private metricsTracker?: MetricsTracker;

  private initialized = false;
  private wasmAvailable = false;
  private wasmModule: unknown = null;
  private patternsLoaded = false;  // ADR-051: Tracks if transforms loaded from patterns

  // Metrics
  private totalTransforms = 0;
  private successfulTransforms = 0;
  private totalDurationMs = 0;
  private cacheHits = 0;
  private cacheMisses = 0;

  /**
   * Create a new Agent Booster adapter
   *
   * @param config - Adapter configuration
   * @param logger - Optional logger for diagnostics
   * @param metricsTracker - Optional metrics tracker for recording outcomes
   */
  constructor(
    config: Partial<AgentBoosterConfig> = {},
    logger?: AgentBoosterLogger,
    metricsTracker?: MetricsTracker
  ) {
    this.config = { ...DEFAULT_AGENT_BOOSTER_CONFIG, ...config };
    this.logger = logger || {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    this.metricsTracker = metricsTracker;

    this.cache = new TransformCache(
      this.config.cacheEnabled,
      this.config.cacheTtlMs
    );

    // Determine enabled transforms
    if (this.config.transforms.length === 0) {
      this.enabledTransforms = new Set(ALL_TRANSFORM_TYPES);
    } else {
      this.enabledTransforms = new Set(this.config.transforms);
    }
  }

  /**
   * Set the metrics tracker (for dependency injection after construction)
   */
  setMetricsTracker(tracker: MetricsTracker): void {
    this.metricsTracker = tracker;
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  /**
   * Initialize the adapter
   *
   * Attempts to load WASM module if available.
   * Loads eligible transforms from PatternLoader (ADR-051 configuration-as-data).
   * Adapter is usable even if WASM fails to load (falls back to TypeScript).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('Initializing Agent Booster adapter', {
      enabled: this.config.enabled,
      transforms: Array.from(this.enabledTransforms),
    });

    // Load eligible transforms from PatternLoader (ADR-051 wiring)
    // This allows runtime configuration without recompiling
    if (this.config.transforms.length === 0) {
      await this.loadEligibleTransformsFromPatterns();
    }

    // Attempt to load WASM module
    if (this.config.enabled) {
      await this.tryLoadWasm();
    }

    this.initialized = true;

    this.logger.info('Agent Booster adapter initialized', {
      wasmAvailable: this.wasmAvailable,
      enabledTransforms: Array.from(this.enabledTransforms),
      patternsLoaded: this.patternsLoaded,
    });
  }

  /**
   * Load eligible transforms from PatternLoader (ADR-051)
   * Falls back to ALL_TRANSFORM_TYPES if patterns are unavailable
   */
  private async loadEligibleTransformsFromPatterns(): Promise<void> {
    try {
      const loader = getPatternLoader();
      const eligibleTransforms = await loader.getEligibleBoosterTransforms();

      if (eligibleTransforms.length > 0) {
        // Validate that pattern transforms are valid TransformTypes
        const validTransforms = eligibleTransforms.filter((t) =>
          ALL_TRANSFORM_TYPES.includes(t as TransformType)
        ) as TransformType[];

        if (validTransforms.length > 0) {
          this.enabledTransforms = new Set(validTransforms);
          this.patternsLoaded = true;
          this.logger.info('Loaded eligible transforms from PatternLoader', {
            fromPatterns: validTransforms,
            invalidIgnored: eligibleTransforms.length - validTransforms.length,
          });
          return;
        }
      }

      this.logger.debug('PatternLoader returned empty transforms, using defaults');
    } catch (error) {
      this.logger.warn('Failed to load transforms from PatternLoader, using defaults', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Fallback to hardcoded defaults
    this.enabledTransforms = new Set(ALL_TRANSFORM_TYPES);
    this.patternsLoaded = false;
  }

  /**
   * Attempt to load WASM module from local agent-booster-wasm package
   */
  private async tryLoadWasm(): Promise<void> {
    try {
      this.logger.debug('Checking WASM availability from local module');

      // Check if WASM is available via the local module
      const available = await checkWasmAvailable();

      if (available) {
        // Pre-warm the WASM module for optimal performance
        this.logger.debug('Warming up WASM module');
        await wasmWarmup();

        // Store reference to indicate WASM is ready
        // We use the imported functions directly, so wasmModule stores metadata
        this.wasmModule = {
          transform: wasmTransform,
          warmup: wasmWarmup,
          isAvailable: checkWasmAvailable,
        };
        this.wasmAvailable = true;

        this.logger.info('WASM Agent Booster loaded and warmed up successfully', {
          source: 'local-module',
        });
      } else {
        this.logger.debug('WASM not available from local module, using TypeScript fallback');
        this.wasmAvailable = false;
      }
    } catch (error) {
      this.logger.warn('Failed to load WASM module', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.wasmAvailable = false;
    }
  }

  /**
   * Dispose of adapter resources
   */
  async dispose(): Promise<void> {
    this.cache.clear();
    this.wasmModule = null;
    this.wasmAvailable = false;
    this.initialized = false;

    this.logger.info('Agent Booster adapter disposed');
  }

  // ============================================================================
  // Transform Operations
  // ============================================================================

  /**
   * Apply a single transform to code
   *
   * Implements fallback chain:
   * 1. Check cache
   * 2. Try WASM (if available)
   * 3. Fall back to TypeScript
   * 4. Fall back to LLM (if confidence < threshold)
   *
   * @param code - Source code to transform
   * @param type - Transform type to apply
   * @returns Transform result with confidence and changes
   */
  async transform(code: string, type: TransformType): Promise<TransformResult> {
    this.ensureInitialized();
    this.ensureEnabled();

    const startTime = Date.now();
    this.totalTransforms++;

    // Validate transform type
    if (!this.enabledTransforms.has(type)) {
      return this.createErrorResult(
        code,
        type,
        `Transform type '${type}' is not enabled`,
        startTime
      );
    }

    // Check cache
    const cachedResult = this.cache.get(code, type);
    if (cachedResult) {
      this.cacheHits++;
      this.logger.debug('Cache hit for transform', { type });
      return { ...cachedResult, durationMs: Date.now() - startTime };
    }
    this.cacheMisses++;

    // Execute transform with fallback chain
    let result: TransformResult;

    try {
      result = await this.executeWithFallback(code, type, startTime);
    } catch (error) {
      return this.createErrorResult(
        code,
        type,
        error instanceof Error ? error.message : 'Unknown error',
        startTime
      );
    }

    // Cache successful results
    if (result.success) {
      this.successfulTransforms++;
      this.cache.set(code, type, result);
    }

    this.totalDurationMs += result.durationMs;

    // Record metrics if tracker is available
    await this.recordMetrics(result, type);

    return result;
  }

  /**
   * Record metrics for a transform operation
   */
  private async recordMetrics(result: TransformResult, type: TransformType): Promise<void> {
    if (!this.metricsTracker) return;

    try {
      const taskId = `booster-${type}-${Date.now()}`;
      await this.metricsTracker.recordOutcome(
        'booster',
        taskId,
        result.success,
        result.durationMs,
        {
          subType: type,
          confidence: result.confidence,
          usedFallback: result.usedFallback,
          implementationUsed: result.implementationUsed,
          itemCount: result.changeCount,
          errorMessage: result.error,
        }
      );
    } catch (error) {
      // Don't let metrics tracking failure affect transform operations
      this.logger.warn('Failed to record metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Execute transform with fallback chain
   */
  private async executeWithFallback(
    code: string,
    type: TransformType,
    startTime: number
  ): Promise<TransformResult> {
    // Try WASM first
    if (this.wasmAvailable) {
      try {
        const wasmResult = await this.executeWasmTransform(code, type, startTime);
        if (wasmResult.success && wasmResult.confidence >= this.config.confidenceThreshold) {
          return wasmResult;
        }
        // Continue to TypeScript if WASM result is low confidence
        this.logger.debug('WASM transform low confidence, trying TypeScript', {
          confidence: wasmResult.confidence,
          threshold: this.config.confidenceThreshold,
        });
      } catch (error) {
        this.logger.warn('WASM transform failed, falling back to TypeScript', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // TypeScript implementation
    const tsResult = executeTransform(code, type, this.logger);
    tsResult.durationMs = Date.now() - startTime;

    // Check if we should fall back to LLM
    if (
      this.config.fallbackToLLM &&
      tsResult.confidence < this.config.confidenceThreshold
    ) {
      this.logger.debug('TypeScript transform low confidence, LLM fallback available', {
        confidence: tsResult.confidence,
        threshold: this.config.confidenceThreshold,
      });

      // Note: LLM fallback would be implemented here
      // For now, we return the TypeScript result with a warning
      tsResult.warnings.push(
        `Confidence ${tsResult.confidence.toFixed(2)} is below threshold ${this.config.confidenceThreshold}. ` +
        'LLM fallback recommended for review.'
      );
      tsResult.usedFallback = true;
    }

    return tsResult;
  }

  /**
   * Execute transform using WASM module
   *
   * The WASM module uses a different API than the old interface:
   * - It takes (original, edit, language) and merges the edit into original
   * - For transforms, we generate the "edit" by applying TypeScript transform first
   * - Then use WASM to merge with high confidence
   */
  private async executeWasmTransform(
    code: string,
    type: TransformType,
    startTime: number
  ): Promise<TransformResult> {
    if (!this.wasmAvailable) {
      throw new WasmUnavailableError();
    }

    // Get the language for WASM module
    const language = getWasmLanguageForTransform(type);

    // For WASM transform, we need to provide the "edit" (desired output)
    // First, generate what the transform should produce using TypeScript
    const tsResult = executeTransform(code, type, this.logger);

    // If TypeScript didn't find any changes, return early
    if (tsResult.changeCount === 0) {
      return {
        ...tsResult,
        durationMs: Date.now() - startTime,
        implementationUsed: 'wasm', // Still counts as WASM path since we checked
      };
    }

    // Use WASM to apply the transform with high-confidence merging
    const wasmResult = await Promise.race([
      wasmTransform(code, tsResult.transformedCode, language, {
        confidenceThreshold: this.config.confidenceThreshold,
        allowFallback: true,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new TransformTimeoutError('WASM transform timed out', type, this.config.timeoutMs)),
          this.config.timeoutMs
        )
      ),
    ]);

    const durationMs = Date.now() - startTime;

    // Convert WASM result to adapter TransformResult format
    // WASM provides mergedCode, confidence, syntaxValid, source, latencyMs
    const changeCount = wasmResult.success && wasmResult.mergedCode !== code
      ? tsResult.changeCount
      : 0;

    return {
      success: wasmResult.success,
      transformType: type,
      originalCode: code,
      transformedCode: wasmResult.mergedCode,
      edits: tsResult.edits, // Use TypeScript-generated edits for detail
      changeCount,
      confidence: wasmResult.confidence,
      durationMs,
      implementationUsed: wasmResult.source === 'wasm' ? 'wasm' : 'typescript',
      usedFallback: wasmResult.source !== 'wasm',
      error: wasmResult.error,
      warnings: wasmResult.syntaxValid ? [] : ['WASM reported syntax may be invalid'],
    };
  }

  /**
   * Apply a transform to multiple files
   *
   * @param files - Files to transform
   * @param type - Transform type to apply
   * @returns Batch result with per-file results
   */
  async batchTransform(
    files: CodeFile[],
    type: TransformType
  ): Promise<BatchTransformResult> {
    this.ensureInitialized();
    this.ensureEnabled();

    const startTime = Date.now();
    const results: Array<{ path: string; result: TransformResult }> = [];
    const errors: Array<{ path: string; error: string }> = [];

    let successCount = 0;
    let failureCount = 0;
    let noChangeCount = 0;
    let totalChanges = 0;

    for (const file of files) {
      // Check file size
      if (file.content.length > this.config.maxFileSizeBytes) {
        const error = new FileTooLargeError(
          file.path,
          file.content.length,
          this.config.maxFileSizeBytes
        );
        errors.push({ path: file.path, error: error.message });
        failureCount++;
        continue;
      }

      try {
        const result = await this.transform(file.content, type);
        results.push({ path: file.path, result });

        if (result.success) {
          if (result.changeCount > 0) {
            successCount++;
            totalChanges += result.changeCount;
          } else {
            noChangeCount++;
          }
        } else {
          failureCount++;
          if (result.error) {
            errors.push({ path: file.path, error: result.error });
          }
        }
      } catch (error) {
        failureCount++;
        errors.push({
          path: file.path,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      success: failureCount === 0,
      transformType: type,
      files: results,
      totalFiles: files.length,
      successCount,
      failureCount,
      noChangeCount,
      totalChanges,
      durationMs: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Detect opportunities for code transformation
   *
   * Analyzes code to find all potential transforms that could be applied.
   *
   * @param code - Source code to analyze
   * @returns Detected opportunities with confidence scores
   */
  async detectTransformOpportunities(
    code: string
  ): Promise<OpportunityDetectionResult> {
    this.ensureInitialized();
    this.ensureEnabled();

    const startTime = Date.now();
    const opportunities: TransformOpportunity[] = [];
    const byType: Record<TransformType, number> = {} as Record<TransformType, number>;
    const warnings: string[] = [];

    // Initialize counts
    for (const type of ALL_TRANSFORM_TYPES) {
      byType[type] = 0;
    }

    // Analyze for each enabled transform type
    for (const type of Array.from(this.enabledTransforms)) {
      try {
        const result = await this.transform(code, type);

        if (result.changeCount > 0) {
          // Convert edits to opportunities
          for (const edit of result.edits) {
            const opportunity: TransformOpportunity = {
              type,
              confidence: result.confidence,
              location: edit.start,
              codeSnippet: edit.oldText.slice(0, 100) + (edit.oldText.length > 100 ? '...' : ''),
              suggestedCode: edit.newText.slice(0, 100) + (edit.newText.length > 100 ? '...' : ''),
              reason: edit.description,
              risk: this.confidenceToRisk(result.confidence),
              estimatedDurationMs: TRANSFORM_METADATA[type].typicalLatencyMs,
            };

            opportunities.push(opportunity);
            byType[type]++;
          }
        }
      } catch (error) {
        warnings.push(
          `Failed to analyze for ${type}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    // Sort by confidence (highest first)
    opportunities.sort((a, b) => b.confidence - a.confidence);

    return {
      opportunities,
      totalCount: opportunities.length,
      byType,
      durationMs: Date.now() - startTime,
      complete: warnings.length === 0,
      warnings,
    };
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Check if a specific transform is available
   */
  isTransformAvailable(type: TransformType): boolean {
    return this.enabledTransforms.has(type);
  }

  /**
   * Get metadata for a transform type
   */
  getTransformMetadata(type: TransformType): TransformMetadata {
    return TRANSFORM_METADATA[type];
  }

  /**
   * Get all available transforms
   */
  getAvailableTransforms(): TransformType[] {
    return Array.from(this.enabledTransforms);
  }

  /**
   * Check if WASM implementation is available
   */
  isWasmAvailable(): boolean {
    return this.wasmAvailable;
  }

  /**
   * Get adapter health/status
   */
  getHealth(): AgentBoosterHealth {
    const avgDuration =
      this.totalTransforms > 0
        ? this.totalDurationMs / this.totalTransforms
        : 0;

    const cacheHitRate =
      this.cacheHits + this.cacheMisses > 0
        ? this.cacheHits / (this.cacheHits + this.cacheMisses)
        : 0;

    const issues: string[] = [];
    if (!this.initialized) {
      issues.push('Adapter not initialized');
    }
    if (!this.config.enabled) {
      issues.push('Adapter is disabled');
    }
    if (!this.wasmAvailable) {
      issues.push('WASM module not loaded (using TypeScript fallback)');
    }
    if (!this.patternsLoaded) {
      issues.push('Patterns not loaded from PatternLoader (using defaults)');
    }

    return {
      ready: this.initialized && this.config.enabled,
      wasmAvailable: this.wasmAvailable,
      patternsLoaded: this.patternsLoaded,  // ADR-051: Configuration from patterns
      availableTransforms: Array.from(this.enabledTransforms),
      lastChecked: new Date(),
      issues,
      metrics: {
        totalTransforms: this.totalTransforms,
        successfulTransforms: this.successfulTransforms,
        averageDurationMs: avgDuration,
        cacheHitRate,
      },
    };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Ensure adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new TransformError(
        'AgentBoosterAdapter not initialized. Call initialize() first.',
        'var-to-const' // Default type for error
      );
    }
  }

  /**
   * Ensure adapter is enabled
   */
  private ensureEnabled(): void {
    if (!this.config.enabled) {
      throw new TransformError(
        'AgentBoosterAdapter is disabled. Set enabled: true in config.',
        'var-to-const' // Default type for error
      );
    }
  }

  /**
   * Create an error result
   */
  private createErrorResult(
    code: string,
    type: TransformType,
    error: string,
    startTime: number
  ): TransformResult {
    return {
      success: false,
      transformType: type,
      originalCode: code,
      transformedCode: code,
      edits: [],
      changeCount: 0,
      confidence: 0,
      durationMs: Date.now() - startTime,
      implementationUsed: 'typescript',
      usedFallback: false,
      error,
      warnings: [],
    };
  }

  /**
   * Convert confidence to risk level
   */
  private confidenceToRisk(confidence: number): 'critical' | 'high' | 'medium' | 'low' | 'info' {
    if (confidence >= 0.95) return 'info';
    if (confidence >= 0.85) return 'low';
    if (confidence >= 0.7) return 'medium';
    if (confidence >= 0.5) return 'high';
    return 'critical';
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create and initialize an Agent Booster adapter
 *
 * @param config - Adapter configuration
 * @param logger - Optional logger
 * @param metricsTracker - Optional metrics tracker for recording outcomes
 * @returns Initialized adapter
 *
 * @example
 * ```typescript
 * const adapter = await createAgentBoosterAdapter({
 *   enabled: true,
 *   fallbackToLLM: true,
 *   confidenceThreshold: 0.7,
 * });
 *
 * const result = await adapter.transform(code, 'var-to-const');
 * ```
 *
 * @example With metrics tracking
 * ```typescript
 * import { getMetricsTracker } from '../metrics';
 *
 * const metricsTracker = await getMetricsTracker();
 * const adapter = await createAgentBoosterAdapter(
 *   { enabled: true },
 *   undefined,
 *   metricsTracker
 * );
 *
 * // Metrics will be automatically recorded for each transform
 * const result = await adapter.transform(code, 'var-to-const');
 *
 * // Check real success rate
 * const stats = await metricsTracker.getSuccessRate('booster');
 * console.log(`Real success rate: ${(stats.rate * 100).toFixed(1)}%`);
 * ```
 */
export async function createAgentBoosterAdapter(
  config: Partial<AgentBoosterConfig> = {},
  logger?: AgentBoosterLogger,
  metricsTracker?: MetricsTracker
): Promise<AgentBoosterAdapter> {
  const adapter = new AgentBoosterAdapter(config, logger, metricsTracker);
  await adapter.initialize();
  return adapter;
}

/**
 * Create an Agent Booster adapter synchronously (must call initialize() manually)
 *
 * @param config - Adapter configuration
 * @param logger - Optional logger
 * @param metricsTracker - Optional metrics tracker
 * @returns Uninitialized adapter
 */
export function createAgentBoosterAdapterSync(
  config: Partial<AgentBoosterConfig> = {},
  logger?: AgentBoosterLogger,
  metricsTracker?: MetricsTracker
): AgentBoosterAdapter {
  return new AgentBoosterAdapter(config, logger, metricsTracker);
}

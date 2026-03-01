/**
 * Agentic QE v3 - Category Engine Adapter
 *
 * Wraps the Prime Radiant CategoryEngine for category theory operations.
 * Used for type verification and compositional consistency checking.
 *
 * Category Theory in QE:
 * - Objects are types (inputs/outputs)
 * - Morphisms are transformations (agents, functions)
 * - Composition must be associative and type-safe
 *
 * @module integrations/coherence/engines/category-adapter
 */

import type {
  TypedPipeline,
  TypedElement,
  TypeVerification,
  TypeMismatch,
  TypeMismatchRaw,
  ICategoryEngine,
  IRawCategoryEngine,
  IWasmLoader,
  CoherenceLogger,
} from '../types';
import { WasmNotLoadedError, DEFAULT_COHERENCE_LOGGER } from '../types';
import type { Severity } from '../../../shared/types';

// ============================================================================
// WASM Engine Wrapper
// ============================================================================

/**
 * Creates an ICategoryEngine wrapper around the raw WASM engine
 */
function createCategoryEngineWrapper(rawEngine: IRawCategoryEngine): ICategoryEngine {
  const types = new Map<string, string>();
  const morphisms: Array<{ source: string; target: string; name: string }> = [];

  const buildCategory = (): unknown => ({
    objects: Array.from(types.entries()).map(([name, schema]) => ({ name, schema })),
    morphisms: morphisms.map(m => ({
      source: m.source,
      target: m.target,
      name: m.name,
    })),
  });

  return {
    add_type(name: string, schema: string): void {
      types.set(name, schema);
    },

    add_morphism(source: string, target: string, name: string): void {
      morphisms.push({ source, target, name });
    },

    verify_composition(path: string[]): boolean {
      if (path.length < 2) return true;

      // Check that each step has a valid morphism
      for (let i = 0; i < path.length - 1; i++) {
        const source = path[i];
        const target = path[i + 1];
        const hasMorphism = morphisms.some(m => m.source === source && m.target === target);
        if (!hasMorphism) return false;
      }

      // Verify categorical laws via raw engine
      const category = buildCategory();
      return rawEngine.verifyCategoryLaws(category);
    },

    check_type_consistency(): TypeMismatchRaw[] {
      const mismatches: TypeMismatchRaw[] = [];

      // Check that all morphism endpoints have defined types
      for (const m of morphisms) {
        if (!types.has(m.source)) {
          mismatches.push({
            location: m.name,
            expected: 'defined type',
            actual: `undefined type '${m.source}'`,
          });
        }
        if (!types.has(m.target)) {
          mismatches.push({
            location: m.name,
            expected: 'defined type',
            actual: `undefined type '${m.target}'`,
          });
        }
      }

      return mismatches;
    },

    clear(): void {
      types.clear();
      morphisms.length = 0;
    },
  };
}

// ============================================================================
// Category Adapter Interface
// ============================================================================

/**
 * Interface for the category adapter
 */
export interface ICategoryAdapter {
  /** Initialize the adapter */
  initialize(): Promise<void>;
  /** Check if initialized */
  isInitialized(): boolean;
  /** Add a type to the category */
  addType(name: string, schema: string): void;
  /** Add a morphism (transformation) between types */
  addMorphism(source: string, target: string, name: string): void;
  /** Verify composition of morphisms */
  verifyComposition(path: string[]): boolean;
  /** Check type consistency of the category */
  checkTypeConsistency(): TypeMismatch[];
  /** Verify a typed pipeline */
  verifyPipeline(pipeline: TypedPipeline): TypeVerification;
  /** Clear the category */
  clear(): void;
  /** Dispose of resources */
  dispose(): void;
}

// ============================================================================
// Category Adapter Implementation
// ============================================================================

/**
 * Adapter for the Prime Radiant CategoryEngine
 *
 * Provides category theory operations for verifying type consistency
 * in agent pipelines and data transformations.
 *
 * @example
 * ```typescript
 * const adapter = new CategoryAdapter(wasmLoader, logger);
 * await adapter.initialize();
 *
 * adapter.addType('SourceCode', '{ path: string, content: string }');
 * adapter.addType('AST', '{ nodes: Node[], edges: Edge[] }');
 * adapter.addType('TestSuite', '{ tests: Test[] }');
 *
 * adapter.addMorphism('SourceCode', 'AST', 'parser');
 * adapter.addMorphism('AST', 'TestSuite', 'test-generator');
 *
 * const isValid = adapter.verifyComposition(['SourceCode', 'AST', 'TestSuite']);
 * ```
 */
export class CategoryAdapter implements ICategoryAdapter {
  private engine: ICategoryEngine | null = null;
  private initialized = false;
  private readonly types = new Map<string, string>();
  private readonly morphisms: Array<{
    source: string;
    target: string;
    name: string;
  }> = [];

  /**
   * Create a new CategoryAdapter
   *
   * @param wasmLoader - WASM module loader
   * @param logger - Optional logger for diagnostics
   */
  constructor(
    private readonly wasmLoader: IWasmLoader,
    private readonly logger: CoherenceLogger = DEFAULT_COHERENCE_LOGGER
  ) {}

  /**
   * Initialize the adapter by loading the WASM module
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.debug('Initializing CategoryAdapter');

    const isAvailable = await this.wasmLoader.isAvailable();
    if (!isAvailable) {
      throw new WasmNotLoadedError(
        'WASM module is not available. Cannot initialize CategoryAdapter.'
      );
    }

    const module = await this.wasmLoader.load();
    // Create wrapper around raw WASM engine
    const rawEngine = new module.CategoryEngine();
    this.engine = createCategoryEngineWrapper(rawEngine);
    this.initialized = true;

    this.logger.info('CategoryAdapter initialized successfully');
  }

  /**
   * Check if the adapter is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Ensure the adapter is initialized before use
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.engine) {
      throw new WasmNotLoadedError(
        'CategoryAdapter not initialized. Call initialize() first.'
      );
    }
  }

  /**
   * Add a type (object) to the category
   *
   * @param name - Type name
   * @param schema - Type schema (JSON Schema or TypeScript type syntax)
   */
  addType(name: string, schema: string): void {
    this.ensureInitialized();

    this.types.set(name, schema);
    this.engine!.add_type(name, schema);

    this.logger.debug('Added type to category', { name });
  }

  /**
   * Add a morphism (arrow/transformation) between types
   *
   * @param source - Source type name
   * @param target - Target type name
   * @param name - Morphism name (e.g., function or agent name)
   */
  addMorphism(source: string, target: string, name: string): void {
    this.ensureInitialized();

    this.morphisms.push({ source, target, name });
    this.engine!.add_morphism(source, target, name);

    this.logger.debug('Added morphism to category', { source, target, name });
  }

  /**
   * Verify that a composition path is valid
   *
   * Checks that morphisms can be composed in sequence.
   *
   * @param path - Array of type names representing a composition path
   * @returns True if the composition is valid
   */
  verifyComposition(path: string[]): boolean {
    this.ensureInitialized();

    if (path.length < 2) {
      return true; // Trivial composition
    }

    const isValid = this.engine!.verify_composition(path);

    this.logger.debug('Verified composition', {
      path,
      isValid,
    });

    return isValid;
  }

  /**
   * Check for type consistency issues in the category
   *
   * @returns Array of type mismatches found
   */
  checkTypeConsistency(): TypeMismatch[] {
    this.ensureInitialized();

    const rawMismatches = this.engine!.check_type_consistency();

    const mismatches = rawMismatches.map(raw => this.transformMismatch(raw));

    this.logger.debug('Checked type consistency', {
      mismatchCount: mismatches.length,
    });

    return mismatches;
  }

  /**
   * Verify a typed pipeline for consistency
   *
   * Builds a category from the pipeline and verifies type compatibility.
   *
   * @param pipeline - The pipeline to verify
   * @returns Type verification result
   */
  verifyPipeline(pipeline: TypedPipeline): TypeVerification {
    const startTime = Date.now();

    // Clear and rebuild category from pipeline
    this.clear();

    // Add all types from the pipeline
    this.addType(pipeline.inputType, this.inferSchema(pipeline.inputType));
    this.addType(pipeline.outputType, this.inferSchema(pipeline.outputType));

    for (const element of pipeline.elements) {
      this.addType(element.inputType, this.inferSchema(element.inputType));
      this.addType(element.outputType, this.inferSchema(element.outputType));
    }

    // Add morphisms for each element
    for (const element of pipeline.elements) {
      this.addMorphism(element.inputType, element.outputType, element.name);
    }

    // Build the composition path
    const path = this.buildCompositionPath(pipeline);

    // Verify the composition
    const compositionValid = this.verifyComposition(path);

    // Check overall type consistency
    const mismatches = this.checkTypeConsistency();

    // Generate warnings for potential issues
    const warnings = this.generateWarnings(pipeline, compositionValid, mismatches);

    const durationMs = Date.now() - startTime;

    const result: TypeVerification = {
      isValid: compositionValid && mismatches.length === 0,
      mismatches,
      warnings,
      durationMs,
      usedFallback: false,
    };

    this.logger.info('Verified pipeline', {
      pipelineId: pipeline.id,
      isValid: result.isValid,
      mismatchCount: mismatches.length,
      warningCount: warnings.length,
      durationMs,
    });

    return result;
  }

  /**
   * Build a composition path from a pipeline
   */
  private buildCompositionPath(pipeline: TypedPipeline): string[] {
    const path = [pipeline.inputType];

    for (const element of pipeline.elements) {
      // Add intermediate types
      if (element.inputType !== path[path.length - 1]) {
        path.push(element.inputType);
      }
      path.push(element.outputType);
    }

    // Ensure output matches expected
    if (path[path.length - 1] !== pipeline.outputType) {
      path.push(pipeline.outputType);
    }

    return path;
  }

  /**
   * Infer a schema from a type name
   * In practice, this would use actual type definitions
   */
  private inferSchema(typeName: string): string {
    // Simple inference based on naming conventions
    // In practice, this would look up actual type definitions
    if (typeName.endsWith('[]')) {
      return `{ items: ${typeName.slice(0, -2)}[] }`;
    }
    if (typeName.includes('|')) {
      return `{ union: [${typeName.split('|').map(t => `"${t.trim()}"`).join(', ')}] }`;
    }
    return `{ type: "${typeName}" }`;
  }

  /**
   * Transform raw WASM mismatch to domain type
   */
  private transformMismatch(raw: TypeMismatchRaw): TypeMismatch {
    return {
      location: raw.location,
      expected: raw.expected,
      actual: raw.actual,
      severity: this.determineMismatchSeverity(raw),
    };
  }

  /**
   * Determine severity of a type mismatch
   */
  private determineMismatchSeverity(raw: TypeMismatchRaw): Severity {
    // Critical if types are completely incompatible
    if (raw.expected === 'never' || raw.actual === 'never') {
      return 'critical';
    }

    // High if we're losing type information (e.g., any -> specific)
    if (raw.actual === 'any' || raw.actual === 'unknown') {
      return 'high';
    }

    // Medium if it's a subtype issue
    if (raw.expected.includes(raw.actual) || raw.actual.includes(raw.expected)) {
      return 'medium';
    }

    // Low for minor mismatches
    return 'low';
  }

  /**
   * Generate warnings for potential issues
   */
  private generateWarnings(
    pipeline: TypedPipeline,
    compositionValid: boolean,
    mismatches: TypeMismatch[]
  ): string[] {
    const warnings: string[] = [];

    if (!compositionValid) {
      warnings.push(
        `Pipeline '${pipeline.id}' has an invalid composition chain. ` +
        'Types do not connect properly from input to output.'
      );
    }

    // Check for any types (weak typing)
    for (const element of pipeline.elements) {
      if (element.inputType === 'any' || element.outputType === 'any') {
        warnings.push(
          `Element '${element.name}' uses 'any' type, which bypasses type safety.`
        );
      }
    }

    // Check for unconstrained generics
    for (const element of pipeline.elements) {
      if (element.inputType.includes('<T>') || element.outputType.includes('<T>')) {
        warnings.push(
          `Element '${element.name}' has unconstrained generic types.`
        );
      }
    }

    // Warn about high-severity mismatches
    const criticalMismatches = mismatches.filter(m => m.severity === 'critical');
    if (criticalMismatches.length > 0) {
      warnings.push(
        `Found ${criticalMismatches.length} critical type mismatch(es) that will cause runtime errors.`
      );
    }

    return warnings;
  }

  /**
   * Clear the category
   */
  clear(): void {
    this.ensureInitialized();

    this.types.clear();
    this.morphisms.length = 0;
    this.engine!.clear();

    this.logger.debug('Cleared category');
  }

  /**
   * Dispose of adapter resources
   */
  dispose(): void {
    if (this.engine) {
      this.engine.clear();
      this.engine = null;
    }
    this.types.clear();
    this.morphisms.length = 0;
    this.initialized = false;

    this.logger.info('CategoryAdapter disposed');
  }

  /**
   * Get the number of types in the category
   */
  getTypeCount(): number {
    return this.types.size;
  }

  /**
   * Get the number of morphisms in the category
   */
  getMorphismCount(): number {
    return this.morphisms.length;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create and initialize a CategoryAdapter
 *
 * @param wasmLoader - WASM module loader
 * @param logger - Optional logger
 * @returns Initialized adapter
 */
export async function createCategoryAdapter(
  wasmLoader: IWasmLoader,
  logger?: CoherenceLogger
): Promise<CategoryAdapter> {
  const adapter = new CategoryAdapter(wasmLoader, logger);
  await adapter.initialize();
  return adapter;
}

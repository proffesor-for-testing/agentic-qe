/**
 * Constitution Loader - Load, validate, and manage constitutions
 *
 * Provides functionality to load constitution files, validate against schema,
 * and support inheritance/composition patterns.
 *
 * @module constitution/loader
 * @version 1.0.0
 */

import Ajv, { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import * as fs from 'fs';
import * as path from 'path';

import {
  Constitution,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  LoadOptions,
  MergeOptions,
  Principle,
  Rule,
  MetricDefinition,
  Threshold
} from './schema';

// Load the JSON schema
const schemaPath = path.join(__dirname, '../../config/constitution.schema.json');

/**
 * Constitution loader class for managing quality constitutions
 */
export class ConstitutionLoader {
  private ajv: Ajv;
  private validateFn: ValidateFunction | null = null;
  private constitutionCache: Map<string, Constitution> = new Map();
  private schemaLoaded: boolean = false;

  constructor() {
    this.ajv = new Ajv({
      allErrors: true,
      strict: false,
      validateFormats: true
    });
    addFormats(this.ajv);
  }

  /**
   * Load and compile the JSON schema for validation
   */
  private loadSchema(): void {
    if (this.schemaLoaded) return;

    try {
      if (fs.existsSync(schemaPath)) {
        const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
        const schema = JSON.parse(schemaContent);
        this.validateFn = this.ajv.compile(schema);
        this.schemaLoaded = true;
      } else {
        // Use inline schema validation if file not found
        this.schemaLoaded = true;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to load constitution schema: ${errorMessage}`);
    }
  }

  /**
   * Load a single constitution from a file path
   *
   * @param filePath - Path to the constitution JSON file
   * @param options - Loading options
   * @returns Loaded and optionally validated constitution
   */
  loadConstitution(filePath: string, options: LoadOptions = {}): Constitution {
    const {
      validate = true,
      resolveInheritance = true
    } = options;

    // Check cache first
    const absolutePath = path.resolve(filePath);
    if (this.constitutionCache.has(absolutePath)) {
      return this.constitutionCache.get(absolutePath)!;
    }

    // Read and parse the file
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Constitution file not found: ${absolutePath}`);
    }

    let constitution: Constitution;
    try {
      const content = fs.readFileSync(absolutePath, 'utf-8');
      constitution = JSON.parse(content) as Constitution;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse constitution file ${absolutePath}: ${errorMessage}`);
    }

    // Validate if requested
    if (validate) {
      const validationResult = this.validateConstitution(constitution);
      if (!validationResult.valid) {
        const errorMessages = validationResult.errors
          .map(e => `  - ${e.path}: ${e.message}`)
          .join('\n');
        throw new Error(`Invalid constitution in ${absolutePath}:\n${errorMessages}`);
      }
    }

    // Resolve inheritance if requested
    if (resolveInheritance && constitution.metadata.inheritsFrom) {
      const baseDir = path.dirname(absolutePath);
      const parentPath = path.join(baseDir, `${constitution.metadata.inheritsFrom}.constitution.json`);

      if (fs.existsSync(parentPath)) {
        const parentConstitution = this.loadConstitution(parentPath, {
          validate,
          resolveInheritance: true
        });
        constitution = this.mergeConstitutions(parentConstitution, constitution);
      }
    }

    // Cache the result
    this.constitutionCache.set(absolutePath, constitution);
    return constitution;
  }

  /**
   * Load all constitutions from a directory
   *
   * @param directory - Directory containing constitution files
   * @param options - Loading options
   * @returns Map of constitution ID to Constitution object
   */
  loadConstitutions(directory: string, options: LoadOptions = {}): Map<string, Constitution> {
    const absoluteDir = path.resolve(directory);

    if (!fs.existsSync(absoluteDir)) {
      throw new Error(`Constitution directory not found: ${absoluteDir}`);
    }

    const stats = fs.statSync(absoluteDir);
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${absoluteDir}`);
    }

    const constitutions = new Map<string, Constitution>();
    const files = fs.readdirSync(absoluteDir);

    for (const file of files) {
      if (file.endsWith('.constitution.json')) {
        const filePath = path.join(absoluteDir, file);
        try {
          const constitution = this.loadConstitution(filePath, options);
          constitutions.set(constitution.id, constitution);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`Warning: Failed to load constitution from ${file}: ${errorMessage}`);
        }
      }
    }

    return constitutions;
  }

  /**
   * Merge two constitutions with inheritance support
   *
   * @param base - Base constitution to inherit from
   * @param override - Constitution with overrides
   * @param options - Merge options
   * @returns Merged constitution
   */
  mergeConstitutions(
    base: Constitution,
    override: Constitution,
    options: MergeOptions = {}
  ): Constitution {
    const {
      arrayStrategy = 'merge',
      preserveMetadata = false,
      deepMerge = true
    } = options;

    // Start with a copy of the override (it takes precedence)
    const merged: Constitution = {
      id: override.id,
      name: override.name,
      version: override.version,
      description: override.description,
      principles: this.mergeArrays(
        base.principles,
        override.principles,
        'id',
        arrayStrategy,
        deepMerge
      ) as Principle[],
      rules: this.mergeArrays(
        base.rules,
        override.rules,
        'id',
        arrayStrategy,
        deepMerge
      ) as Rule[],
      metrics: this.mergeArrays(
        base.metrics,
        override.metrics,
        'id',
        arrayStrategy,
        deepMerge
      ) as MetricDefinition[],
      thresholds: this.mergeArrays(
        base.thresholds,
        override.thresholds,
        'id',
        arrayStrategy,
        deepMerge
      ) as Threshold[],
      metadata: preserveMetadata
        ? { ...base.metadata, ...override.metadata }
        : override.metadata
    };

    return merged;
  }

  /**
   * Merge arrays based on strategy
   */
  private mergeArrays<T extends { id: string }>(
    baseArray: T[],
    overrideArray: T[],
    keyField: keyof T,
    strategy: 'replace' | 'concat' | 'merge',
    deepMerge: boolean
  ): T[] {
    switch (strategy) {
      case 'replace':
        return [...overrideArray];

      case 'concat':
        return [...baseArray, ...overrideArray];

      case 'merge':
      default: {
        const result = new Map<unknown, T>();

        // Add base items
        for (const item of baseArray) {
          result.set(item[keyField], item);
        }

        // Merge or replace with override items
        for (const item of overrideArray) {
          const key = item[keyField];
          if (result.has(key) && deepMerge) {
            const baseItem = result.get(key)!;
            result.set(key, { ...baseItem, ...item });
          } else {
            result.set(key, item);
          }
        }

        return Array.from(result.values());
      }
    }
  }

  /**
   * Validate a constitution against the JSON schema
   *
   * @param constitution - Constitution object to validate
   * @returns Validation result with errors and warnings
   */
  validateConstitution(constitution: unknown): ValidationResult {
    this.loadSchema();

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Schema validation
    if (this.validateFn) {
      const valid = this.validateFn(constitution);
      if (!valid && this.validateFn.errors) {
        for (const err of this.validateFn.errors) {
          errors.push(this.ajvErrorToValidationError(err));
        }
      }
    }

    // Additional semantic validations
    if (typeof constitution === 'object' && constitution !== null) {
      const c = constitution as Partial<Constitution>;

      // Check for orphaned rules (rules referencing non-existent principles)
      if (c.rules && c.principles) {
        const principleIds = new Set(c.principles.map(p => p.id));
        for (const rule of c.rules) {
          if (!principleIds.has(rule.principleId)) {
            errors.push({
              path: `/rules/${rule.id}`,
              message: `Rule references non-existent principle: ${rule.principleId}`,
              code: 'ORPHANED_RULE',
              expected: `One of: ${Array.from(principleIds).join(', ')}`,
              actual: rule.principleId
            });
          }
        }
      }

      // Check for orphaned thresholds (thresholds referencing non-existent metrics)
      if (c.thresholds && c.metrics) {
        const metricIds = new Set(c.metrics.map(m => m.id));
        for (const threshold of c.thresholds) {
          if (!metricIds.has(threshold.metricId)) {
            errors.push({
              path: `/thresholds/${threshold.id}`,
              message: `Threshold references non-existent metric: ${threshold.metricId}`,
              code: 'ORPHANED_THRESHOLD',
              expected: `One of: ${Array.from(metricIds).join(', ')}`,
              actual: threshold.metricId
            });
          }
        }
      }

      // Warn about missing descriptions
      if (c.metrics) {
        for (const metric of c.metrics) {
          if (!metric.description) {
            warnings.push({
              path: `/metrics/${metric.id}`,
              message: 'Metric is missing a description',
              code: 'MISSING_DESCRIPTION',
              suggestion: 'Add a description to improve documentation'
            });
          }
        }
      }

      // Warn about inconsistent threshold values
      if (c.metrics) {
        for (const metric of c.metrics) {
          if (metric.warningThreshold !== undefined &&
              metric.criticalThreshold !== undefined) {
            const higherIsBetter = metric.higherIsBetter ?? true;
            if (higherIsBetter) {
              if (metric.warningThreshold < metric.criticalThreshold) {
                warnings.push({
                  path: `/metrics/${metric.id}`,
                  message: 'Warning threshold should be higher than critical when higher is better',
                  code: 'INCONSISTENT_THRESHOLDS',
                  suggestion: 'Swap warning and critical threshold values'
                });
              }
            } else {
              if (metric.warningThreshold > metric.criticalThreshold) {
                warnings.push({
                  path: `/metrics/${metric.id}`,
                  message: 'Warning threshold should be lower than critical when lower is better',
                  code: 'INCONSISTENT_THRESHOLDS',
                  suggestion: 'Swap warning and critical threshold values'
                });
              }
            }
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Convert Ajv error to ValidationError
   */
  private ajvErrorToValidationError(error: ErrorObject): ValidationError {
    return {
      path: error.instancePath || '/',
      message: error.message || 'Unknown validation error',
      code: error.keyword.toUpperCase(),
      expected: error.params ? JSON.stringify(error.params) : undefined
    };
  }

  /**
   * Get constitution for a specific agent type
   *
   * @param agentType - Type of agent
   * @param constitutionsDir - Directory containing constitutions
   * @returns Constitution applicable to the agent
   */
  getConstitutionForAgent(
    agentType: string,
    constitutionsDir?: string
  ): Constitution {
    // Resolve the base directory - handles both src and dist contexts
    let directory = constitutionsDir;
    if (!directory) {
      // Try dist/constitution/base first, then src/constitution/base
      const distBase = path.join(__dirname, 'base');
      const srcBase = path.join(__dirname, '../../src/constitution/base');

      if (fs.existsSync(distBase)) {
        directory = distBase;
      } else if (fs.existsSync(srcBase)) {
        directory = srcBase;
      } else {
        // Fall back to relative from process.cwd()
        directory = path.join(process.cwd(), 'src/constitution/base');
      }
    }
    const constitutions = this.loadConstitutions(directory);

    // Find constitution that applies to this agent type
    const constitutionEntries = Array.from(constitutions.entries());
    for (const [, constitution] of constitutionEntries) {
      const applicableTo = constitution.metadata.applicableTo;
      if (applicableTo.includes(agentType) || applicableTo.includes('*')) {
        // If it inherits from default, merge them
        if (constitution.metadata.inheritsFrom === 'default') {
          const defaultConstitution = constitutions.get('default');
          if (defaultConstitution) {
            return this.mergeConstitutions(defaultConstitution, constitution);
          }
        }
        return constitution;
      }
    }

    // Fall back to default constitution
    const defaultConstitution = constitutions.get('default');
    if (defaultConstitution) {
      return defaultConstitution;
    }

    throw new Error(`No constitution found for agent type: ${agentType}`);
  }

  /**
   * Clear the constitution cache
   */
  clearCache(): void {
    this.constitutionCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.constitutionCache.size,
      keys: Array.from(this.constitutionCache.keys())
    };
  }
}

// Default singleton instance
let defaultLoader: ConstitutionLoader | null = null;

/**
 * Get the default constitution loader instance
 */
export function getDefaultLoader(): ConstitutionLoader {
  if (!defaultLoader) {
    defaultLoader = new ConstitutionLoader();
  }
  return defaultLoader;
}

/**
 * Load a single constitution from file
 * Convenience function using default loader
 *
 * @param filePath - Path to constitution file
 * @param options - Loading options
 * @returns Loaded constitution
 */
export function loadConstitution(
  filePath: string,
  options?: LoadOptions
): Constitution {
  return getDefaultLoader().loadConstitution(filePath, options);
}

/**
 * Load all constitutions from directory
 * Convenience function using default loader
 *
 * @param directory - Directory containing constitutions
 * @param options - Loading options
 * @returns Map of constitution ID to Constitution
 */
export function loadConstitutions(
  directory: string,
  options?: LoadOptions
): Map<string, Constitution> {
  return getDefaultLoader().loadConstitutions(directory, options);
}

/**
 * Merge two constitutions
 * Convenience function using default loader
 *
 * @param base - Base constitution
 * @param override - Override constitution
 * @param options - Merge options
 * @returns Merged constitution
 */
export function mergeConstitutions(
  base: Constitution,
  override: Constitution,
  options?: MergeOptions
): Constitution {
  return getDefaultLoader().mergeConstitutions(base, override, options);
}

/**
 * Validate a constitution
 * Convenience function using default loader
 *
 * @param constitution - Constitution to validate
 * @returns Validation result
 */
export function validateConstitution(constitution: unknown): ValidationResult {
  return getDefaultLoader().validateConstitution(constitution);
}

/**
 * Get constitution for agent type
 * Convenience function using default loader
 *
 * @param agentType - Agent type
 * @param constitutionsDir - Optional directory
 * @returns Constitution for agent
 */
export function getConstitutionForAgent(
  agentType: string,
  constitutionsDir?: string
): Constitution {
  return getDefaultLoader().getConstitutionForAgent(agentType, constitutionsDir);
}

/**
 * Get the base constitutions directory path
 */
export function getBaseConstitutionsPath(): string {
  // Try dist/constitution/base first, then src/constitution/base
  const distBase = path.join(__dirname, 'base');
  const srcBase = path.join(__dirname, '../../src/constitution/base');

  if (fs.existsSync(distBase)) {
    return distBase;
  } else if (fs.existsSync(srcBase)) {
    return srcBase;
  }
  // Fall back to relative from process.cwd()
  return path.join(process.cwd(), 'src/constitution/base');
}

/**
 * List available constitution files in the base directory
 */
export function listAvailableConstitutions(): string[] {
  const basePath = getBaseConstitutionsPath();
  if (!fs.existsSync(basePath)) {
    return [];
  }

  return fs.readdirSync(basePath)
    .filter(f => f.endsWith('.constitution.json'))
    .map(f => f.replace('.constitution.json', ''));
}

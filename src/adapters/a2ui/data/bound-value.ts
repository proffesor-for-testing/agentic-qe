/**
 * BoundValue Resolution and Utilities
 *
 * Provides resolution of BoundValue types (LiteralValue, PathValue, CombinedValue)
 * against data contexts, with dependency tracking and type inference.
 *
 * @module adapters/a2ui/data/bound-value
 */

import {
  resolvePointer,
  pointerExists,
  isParentPointer,
  parseJsonPointer,
} from './json-pointer-resolver.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Static literal value
 */
export interface LiteralValue<T = unknown> {
  readonly literalString: T;
}

/**
 * Dynamic path binding (JSON Pointer RFC 6901)
 */
export interface PathValue {
  readonly path: string;
}

/**
 * Combined value with static default and dynamic binding
 */
export interface CombinedValue<T = unknown> {
  readonly literalString: T;
  readonly path: string;
}

/**
 * BoundValue - supports static, dynamic, or combined data binding
 */
export type BoundValue<T = unknown> = LiteralValue<T> | PathValue | CombinedValue<T>;

/**
 * Explicit list of child component IDs
 */
export interface ExplicitListChildren {
  readonly explicitList: string[];
}

/**
 * Template configuration for dynamic children generation
 */
export interface TemplateChildrenConfig {
  /** JSON Pointer path to array data */
  readonly dataBinding: string;
  /** Component ID to use as template */
  readonly componentId: string;
  /** Optional path within each item for unique key (relative to item) */
  readonly keyPath?: string;
}

/**
 * Template-based children from data array
 */
export interface TemplateChildren {
  readonly template: TemplateChildrenConfig;
}

/**
 * ComponentChildren - supports static or dynamic child rendering
 */
export type ComponentChildren = ExplicitListChildren | TemplateChildren;

/**
 * Resolved template children instance
 */
export interface ResolvedTemplateChild {
  /** Generated unique ID for this instance */
  readonly id: string;
  /** Template component ID */
  readonly templateId: string;
  /** The item data from the array */
  readonly itemData: unknown;
  /** Index in the source array */
  readonly index: number;
  /** Optional unique key from keyPath */
  readonly key?: string;
}

/**
 * BoundValue resolver configuration
 */
export interface BoundValueResolverConfig {
  /** Strict mode throws on missing paths (default: false) */
  readonly strictMode?: boolean;
  /** Default value when path not found and no literalString */
  readonly defaultValue?: unknown;
}

/**
 * Interface for BoundValue resolver
 */
export interface IBoundValueResolver {
  /** Resolve a BoundValue against data context */
  resolve<T>(boundValue: BoundValue<T>, data: unknown): T | undefined;
  /** Check if BoundValue depends on a specific path */
  dependsOn(boundValue: BoundValue<unknown>, path: string): boolean;
  /** Get all paths a BoundValue depends on */
  getDependencies(boundValue: BoundValue<unknown>): string[];
  /** Resolve template children to instances */
  resolveTemplateChildren(
    children: TemplateChildren,
    data: unknown
  ): ResolvedTemplateChild[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a LiteralValue
 */
export function isLiteralValue<T>(value: unknown): value is LiteralValue<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'literalString' in value &&
    !('path' in value)
  );
}

/**
 * Check if a value is a PathValue
 */
export function isPathValue(value: unknown): value is PathValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    typeof (value as PathValue).path === 'string' &&
    !('literalString' in value)
  );
}

/**
 * Check if a value is a CombinedValue
 */
export function isCombinedValue<T>(value: unknown): value is CombinedValue<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'literalString' in value &&
    'path' in value &&
    typeof (value as CombinedValue).path === 'string'
  );
}

/**
 * Check if a value is any BoundValue type
 */
export function isBoundValue<T>(value: unknown): value is BoundValue<T> {
  return isLiteralValue(value) || isPathValue(value) || isCombinedValue(value);
}

/**
 * Check if children is an ExplicitListChildren
 */
export function isExplicitListChildren(
  children: unknown
): children is ExplicitListChildren {
  return (
    typeof children === 'object' &&
    children !== null &&
    'explicitList' in children &&
    Array.isArray((children as ExplicitListChildren).explicitList)
  );
}

/**
 * Check if children is a TemplateChildren
 */
export function isTemplateChildren(
  children: unknown
): children is TemplateChildren {
  return (
    typeof children === 'object' &&
    children !== null &&
    'template' in children &&
    typeof (children as TemplateChildren).template === 'object' &&
    'dataBinding' in (children as TemplateChildren).template &&
    'componentId' in (children as TemplateChildren).template
  );
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a static LiteralValue
 */
export function createLiteralValue<T>(value: T): LiteralValue<T> {
  return { literalString: value };
}

/**
 * Create a dynamic PathValue
 */
export function createPathValue(path: string): PathValue {
  if (!path.startsWith('/') && path !== '') {
    throw new Error(`Path must start with '/' or be empty, got: "${path}"`);
  }
  return { path };
}

/**
 * Create a CombinedValue with default and binding
 */
export function createCombinedValue<T>(
  defaultValue: T,
  path: string
): CombinedValue<T> {
  if (!path.startsWith('/') && path !== '') {
    throw new Error(`Path must start with '/' or be empty, got: "${path}"`);
  }
  return { literalString: defaultValue, path };
}

/**
 * Create ExplicitListChildren
 */
export function createExplicitListChildren(
  componentIds: string[]
): ExplicitListChildren {
  return { explicitList: [...componentIds] };
}

/**
 * Create TemplateChildren
 */
export function createTemplateChildren(
  dataBinding: string,
  componentId: string,
  keyPath?: string
): TemplateChildren {
  const config: TemplateChildrenConfig = {
    dataBinding,
    componentId,
  };
  if (keyPath !== undefined) {
    return {
      template: { ...config, keyPath },
    };
  }
  return { template: config };
}

// ============================================================================
// BoundValue Resolver Implementation
// ============================================================================

/**
 * BoundValue Resolver
 *
 * Resolves BoundValue types against data contexts with support for:
 * - LiteralValue: Returns static value directly
 * - PathValue: Resolves JSON Pointer path against data
 * - CombinedValue: Tries path first, falls back to literal
 */
export class BoundValueResolver implements IBoundValueResolver {
  private readonly config: BoundValueResolverConfig;

  constructor(config: BoundValueResolverConfig = {}) {
    this.config = {
      strictMode: false,
      ...config,
    };
  }

  /**
   * Resolve a BoundValue against a data context
   *
   * Resolution rules:
   * 1. LiteralValue: return literalString directly
   * 2. PathValue: resolve path against data
   * 3. CombinedValue: try path first, fall back to literalString
   *
   * @param boundValue - The BoundValue to resolve
   * @param data - The data context to resolve against
   * @returns The resolved value, or undefined if not found
   */
  resolve<T>(boundValue: BoundValue<T>, data: unknown): T | undefined {
    // CombinedValue - try path first, fall back to literalString
    // Check this first since it has both properties
    if (isCombinedValue<T>(boundValue)) {
      const pathResult = resolvePointer<T>(data, boundValue.path);
      if (pathResult !== undefined) {
        return pathResult;
      }
      return boundValue.literalString;
    }

    // LiteralValue - return static value
    if (isLiteralValue<T>(boundValue)) {
      return boundValue.literalString;
    }

    // PathValue - resolve path against data
    if (isPathValue(boundValue)) {
      const result = resolvePointer<T>(data, boundValue.path);
      if (result === undefined && this.config.strictMode) {
        throw new Error(`Path not found: ${boundValue.path}`);
      }
      return result ?? (this.config.defaultValue as T | undefined);
    }

    // Unknown format - return undefined
    return undefined;
  }

  /**
   * Check if a BoundValue depends on a specific path
   *
   * A BoundValue depends on a path if:
   * - It's a PathValue and its path equals or is a child of the given path
   * - It's a CombinedValue and its path equals or is a child of the given path
   *
   * @param boundValue - The BoundValue to check
   * @param path - The path to check dependency against
   * @returns True if the BoundValue depends on the path
   */
  dependsOn(boundValue: BoundValue<unknown>, path: string): boolean {
    // LiteralValue has no dependencies
    if (isLiteralValue(boundValue)) {
      return false;
    }

    const boundPath = isPathValue(boundValue)
      ? boundValue.path
      : (boundValue as CombinedValue).path;

    // Exact match
    if (boundPath === path) {
      return true;
    }

    // Check if path is a parent of boundPath
    if (isParentPointer(path, boundPath)) {
      return true;
    }

    // Check if boundPath is a parent of path (value at boundPath would change)
    if (isParentPointer(boundPath, path)) {
      return true;
    }

    return false;
  }

  /**
   * Get all paths a BoundValue depends on
   *
   * @param boundValue - The BoundValue to analyze
   * @returns Array of paths the BoundValue depends on
   */
  getDependencies(boundValue: BoundValue<unknown>): string[] {
    // CombinedValue has both, check first
    if (isCombinedValue(boundValue)) {
      return [boundValue.path];
    }

    if (isPathValue(boundValue)) {
      return [boundValue.path];
    }

    // LiteralValue has no dependencies
    return [];
  }

  /**
   * Resolve template children to instances
   *
   * @param children - TemplateChildren configuration
   * @param data - Data context containing the array
   * @returns Array of resolved template child instances
   */
  resolveTemplateChildren(
    children: TemplateChildren,
    data: unknown
  ): ResolvedTemplateChild[] {
    const { dataBinding, componentId, keyPath } = children.template;

    // Resolve the array data
    const arrayData = resolvePointer<unknown[]>(data, dataBinding);
    if (!Array.isArray(arrayData)) {
      return [];
    }

    // Map each item to a resolved child
    return arrayData.map((itemData, index) => {
      // Resolve key if keyPath is provided
      let key: string | undefined;
      if (keyPath) {
        // keyPath is relative to the item
        const keyValue = resolvePointer(itemData, keyPath);
        if (keyValue !== undefined) {
          key = String(keyValue);
        }
      }

      // Generate a unique ID for this instance
      const id = key
        ? `${componentId}-${key}`
        : `${componentId}-${index}`;

      return {
        id,
        templateId: componentId,
        itemData,
        index,
        key,
      };
    });
  }
}

/**
 * Create a BoundValue resolver with the given configuration
 */
export function createBoundValueResolver(
  config?: BoundValueResolverConfig
): BoundValueResolver {
  return new BoundValueResolver(config);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the static value from a BoundValue (if available)
 *
 * @param boundValue - The BoundValue to extract from
 * @returns The static value, or undefined if not a literal/combined
 */
export function getStaticValue<T>(boundValue: BoundValue<T>): T | undefined {
  if (isLiteralValue<T>(boundValue) || isCombinedValue<T>(boundValue)) {
    return boundValue.literalString;
  }
  return undefined;
}

/**
 * Get the binding path from a BoundValue (if available)
 *
 * @param boundValue - The BoundValue to extract from
 * @returns The path, or undefined if not a path/combined
 */
export function getBindingPath(boundValue: BoundValue<unknown>): string | undefined {
  if (isPathValue(boundValue) || isCombinedValue(boundValue)) {
    return boundValue.path;
  }
  return undefined;
}

/**
 * Check if a BoundValue has a dynamic binding
 *
 * @param boundValue - The BoundValue to check
 * @returns True if the value has a path binding
 */
export function hasDynamicBinding(boundValue: BoundValue<unknown>): boolean {
  return isPathValue(boundValue) || isCombinedValue(boundValue);
}

/**
 * Check if a BoundValue has a static default
 *
 * @param boundValue - The BoundValue to check
 * @returns True if the value has a literalString
 */
export function hasStaticDefault(boundValue: BoundValue<unknown>): boolean {
  return isLiteralValue(boundValue) || isCombinedValue(boundValue);
}

/**
 * Convert a raw value to the appropriate BoundValue type
 *
 * - If the value has literalString and path, returns CombinedValue
 * - If the value has only literalString, returns LiteralValue
 * - If the value has only path, returns PathValue
 * - Otherwise, wraps the value in a LiteralValue
 *
 * @param value - The value to convert
 * @returns A BoundValue
 */
export function toBoundValue<T>(value: T | BoundValue<T>): BoundValue<T> {
  if (isBoundValue<T>(value)) {
    return value;
  }
  return createLiteralValue(value);
}

/**
 * Extract all BoundValue paths from a component properties object
 *
 * @param properties - Component properties object
 * @returns Array of unique paths used in the properties
 */
export function extractBoundPaths(
  properties: Record<string, unknown>
): string[] {
  const paths = new Set<string>();

  function traverse(value: unknown): void {
    if (value === null || value === undefined) {
      return;
    }

    if (isBoundValue(value)) {
      const path = getBindingPath(value);
      if (path) {
        paths.add(path);
      }
      return;
    }

    if (isTemplateChildren(value)) {
      paths.add(value.template.dataBinding);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        traverse(item);
      }
      return;
    }

    if (typeof value === 'object') {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        traverse((value as Record<string, unknown>)[key]);
      }
    }
  }

  traverse(properties);
  return Array.from(paths);
}

/**
 * Deep resolve all BoundValues in a properties object
 *
 * @param properties - Component properties object
 * @param data - Data context to resolve against
 * @param resolver - BoundValue resolver to use
 * @returns Properties object with all BoundValues resolved
 */
export function resolveAllBoundValues(
  properties: Record<string, unknown>,
  data: unknown,
  resolver: IBoundValueResolver = new BoundValueResolver()
): Record<string, unknown> {
  function resolveValue(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (isBoundValue(value)) {
      return resolver.resolve(value, data);
    }

    if (isExplicitListChildren(value)) {
      return value;
    }

    if (isTemplateChildren(value)) {
      return resolver.resolveTemplateChildren(value, data);
    }

    if (Array.isArray(value)) {
      return value.map(resolveValue);
    }

    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(value as Record<string, unknown>)) {
        result[key] = resolveValue((value as Record<string, unknown>)[key]);
      }
      return result;
    }

    return value;
  }

  return resolveValue(properties) as Record<string, unknown>;
}

/**
 * Agentic QE v3 - RuVector Metadata Filtering Adapter
 * Task 1.2: Metadata Filtering Layer (ruvector-filter)
 *
 * Provides composable filter expressions (AND/OR/NOT/FIELD) that can be
 * applied to pattern search results for rich post-search filtering.
 *
 * TypeScript in-memory implementation (no native package exists).
 * Backward compatible: no filter = no change to search results.
 *
 * @module integrations/ruvector/filter-adapter
 */

import type { PatternSearchResult } from '../../learning/pattern-store.js';
import type {
  FilterExpression,
  FilterOperator,
  FieldFilterExpression,
} from './interfaces.js';
import { getRuVectorFeatureFlags } from './feature-flags.js';

// ============================================================================
// Native RuVector Filter (Optional Dependency)
// ============================================================================

/**
 * Placeholder interface for the optional native ruvector-filter module.
 * If installed, it provides SIMD-accelerated filtering.
 */
interface NativeFilterEngine {
  applyFilter(
    results: PatternSearchResult[],
    filter: FilterExpression
  ): PatternSearchResult[];
}

let nativeEngine: NativeFilterEngine | null = null;
let nativeChecked = false;

/**
 * Check for native filter engine.
 * No native package exists — always returns null.
 * The TypeScript implementation is the production implementation.
 */
async function loadNativeEngine(): Promise<NativeFilterEngine | null> {
  if (nativeChecked) return nativeEngine;
  nativeChecked = true;
  nativeEngine = null;
  return null;
}

// ============================================================================
// Filter Builder Helpers
// ============================================================================

/**
 * Create an AND filter combining multiple sub-expressions
 */
export function and(...children: FilterExpression[]): FilterExpression {
  return { type: 'AND', children };
}

/**
 * Create an OR filter combining multiple sub-expressions
 */
export function or(...children: FilterExpression[]): FilterExpression {
  return { type: 'OR', children };
}

/**
 * Create a NOT filter inverting a sub-expression
 */
export function not(child: FilterExpression): FilterExpression {
  return { type: 'NOT', child };
}

/**
 * Create a field-level filter expression
 */
export function field(
  fieldName: string,
  operator: FilterOperator,
  value: unknown
): FieldFilterExpression {
  return { type: 'FIELD', field: fieldName, operator, value };
}

// ============================================================================
// TypeScript Fallback Filter Engine
// ============================================================================

/**
 * Resolve a nested field path (e.g., "context.tags") on a PatternSearchResult.
 * Looks first on the pattern object, then on the result itself.
 */
function resolveField(result: PatternSearchResult, fieldPath: string): unknown {
  const pattern = result.pattern;

  // Try pattern first, then result-level fields
  const targets = [pattern, result];

  for (const target of targets) {
    const parts = fieldPath.split('.');
    let current: unknown = target;

    for (const part of parts) {
      if (current === null || current === undefined) break;
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[part];
      } else {
        current = undefined;
        break;
      }
    }

    if (current !== undefined) return current;
  }

  return undefined;
}

/**
 * Evaluate a single FIELD filter against a resolved value
 */
function evaluateFieldFilter(
  resolvedValue: unknown,
  operator: FilterOperator,
  filterValue: unknown
): boolean {
  switch (operator) {
    case 'eq':
      return resolvedValue === filterValue;

    case 'gt':
      return (
        typeof resolvedValue === 'number' &&
        typeof filterValue === 'number' &&
        resolvedValue > filterValue
      );

    case 'lt':
      return (
        typeof resolvedValue === 'number' &&
        typeof filterValue === 'number' &&
        resolvedValue < filterValue
      );

    case 'gte':
      return (
        typeof resolvedValue === 'number' &&
        typeof filterValue === 'number' &&
        resolvedValue >= filterValue
      );

    case 'lte':
      return (
        typeof resolvedValue === 'number' &&
        typeof filterValue === 'number' &&
        resolvedValue <= filterValue
      );

    case 'in': {
      if (!Array.isArray(filterValue)) return false;
      return filterValue.includes(resolvedValue);
    }

    case 'contains': {
      // Array.includes or string.includes
      if (Array.isArray(resolvedValue)) {
        return resolvedValue.includes(filterValue);
      }
      if (typeof resolvedValue === 'string' && typeof filterValue === 'string') {
        return resolvedValue.includes(filterValue);
      }
      return false;
    }

    case 'between': {
      if (
        typeof resolvedValue !== 'number' ||
        !Array.isArray(filterValue) ||
        filterValue.length !== 2
      ) {
        // Also support Date-based between
        if (resolvedValue instanceof Date && Array.isArray(filterValue) && filterValue.length === 2) {
          const ts = resolvedValue.getTime();
          const lo = filterValue[0] instanceof Date ? filterValue[0].getTime() : Number(filterValue[0]);
          const hi = filterValue[1] instanceof Date ? filterValue[1].getTime() : Number(filterValue[1]);
          return ts >= lo && ts <= hi;
        }
        return false;
      }
      const [lo, hi] = filterValue as [number, number];
      return resolvedValue >= lo && resolvedValue <= hi;
    }

    default:
      return false;
  }
}

/**
 * Evaluate a filter expression against a single search result.
 * Returns true if the result passes the filter.
 */
export function evaluateFilter(
  result: PatternSearchResult,
  filter: FilterExpression
): boolean {
  switch (filter.type) {
    case 'AND': {
      const children = filter.children ?? [];
      return children.every((child) => evaluateFilter(result, child));
    }

    case 'OR': {
      const children = filter.children ?? [];
      if (children.length === 0) return true;
      return children.some((child) => evaluateFilter(result, child));
    }

    case 'NOT': {
      if (!filter.child) return true;
      return !evaluateFilter(result, filter.child);
    }

    case 'FIELD': {
      if (!filter.field || !filter.operator) return true;
      const resolved = resolveField(result, filter.field);
      return evaluateFieldFilter(resolved, filter.operator, filter.value);
    }

    default:
      return true;
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Apply a filter expression to pattern search results.
 *
 * If the `useMetadataFiltering` feature flag is disabled, returns results unchanged.
 * If the native `ruvector-filter` engine is available, delegates to it.
 * Otherwise, applies the TypeScript fallback engine.
 *
 * @param results - Pattern search results to filter
 * @param filter - Composable filter expression
 * @returns Filtered results (subset of input, order preserved)
 */
export async function applyFilter(
  results: PatternSearchResult[],
  filter: FilterExpression | undefined | null
): Promise<PatternSearchResult[]> {
  // No filter = passthrough
  if (!filter) return results;

  // Check feature flag
  const flags = getRuVectorFeatureFlags();
  if (!flags.useMetadataFiltering) return results;

  // Try native engine first
  const native = await loadNativeEngine();
  if (native) {
    return native.applyFilter(results, filter);
  }

  // TypeScript fallback: in-memory filtering
  return applyFilterSync(results, filter);
}

/**
 * Synchronous version of applyFilter using the TypeScript fallback engine.
 * Useful when native engine availability is already known to be absent.
 *
 * @param results - Pattern search results to filter
 * @param filter - Composable filter expression
 * @returns Filtered results (subset of input, order preserved)
 */
export function applyFilterSync(
  results: PatternSearchResult[],
  filter: FilterExpression | undefined | null
): PatternSearchResult[] {
  if (!filter) return results;
  return results.filter((result) => evaluateFilter(result, filter));
}

/**
 * Validate a filter expression for structural correctness.
 *
 * @param filter - Filter expression to validate
 * @returns Validation result with error messages
 */
export function validateFilter(
  filter: FilterExpression
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!filter.type) {
    errors.push('Filter must have a type');
    return { valid: false, errors };
  }

  const validTypes = ['AND', 'OR', 'NOT', 'FIELD'];
  if (!validTypes.includes(filter.type)) {
    errors.push(`Invalid filter type: ${filter.type}. Must be one of: ${validTypes.join(', ')}`);
  }

  if (filter.type === 'AND' || filter.type === 'OR') {
    if (!filter.children || !Array.isArray(filter.children)) {
      errors.push(`${filter.type} filter must have a 'children' array`);
    } else {
      for (let i = 0; i < filter.children.length; i++) {
        const childResult = validateFilter(filter.children[i]);
        if (!childResult.valid) {
          errors.push(
            ...childResult.errors.map((e) => `${filter.type}.children[${i}]: ${e}`)
          );
        }
      }
    }
  }

  if (filter.type === 'NOT') {
    if (!filter.child) {
      errors.push("NOT filter must have a 'child' expression");
    } else {
      const childResult = validateFilter(filter.child);
      if (!childResult.valid) {
        errors.push(...childResult.errors.map((e) => `NOT.child: ${e}`));
      }
    }
  }

  if (filter.type === 'FIELD') {
    if (!filter.field) {
      errors.push("FIELD filter must have a 'field' property");
    }
    if (!filter.operator) {
      errors.push("FIELD filter must have an 'operator' property");
    } else {
      const validOps: FilterOperator[] = [
        'eq', 'gt', 'lt', 'gte', 'lte', 'in', 'contains', 'between',
      ];
      if (!validOps.includes(filter.operator)) {
        errors.push(
          `Invalid operator: ${filter.operator}. Must be one of: ${validOps.join(', ')}`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Reset (for testing)
// ============================================================================

/**
 * Reset native engine state (for testing only)
 */
export function resetNativeEngine(): void {
  nativeEngine = null;
  nativeChecked = false;
}

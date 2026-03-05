/**
 * Rust Ownership Analyzer
 * Analyzes ownership patterns from parsed function parameters.
 *
 * Provides utilities for determining ownership semantics (owned, borrowed,
 * mut-borrowed, clone) and detecting Result/Option wrapper types commonly
 * used in idiomatic Rust code.
 *
 * @module shared/parsers
 */

export type OwnershipType = 'owned' | 'borrowed' | 'mut-borrowed' | 'clone';

export interface ParameterOwnership {
  name: string;
  type: string;
  ownership: OwnershipType;
  hasLifetime: boolean;
}

/**
 * Analyze ownership semantics for a list of parameters.
 *
 * Rules:
 * - `&mut T` -> mut-borrowed
 * - `&T`     -> borrowed
 * - otherwise -> owned
 *
 * Lifetime detection checks for the `'` character in the type string.
 */
export function analyzeOwnership(
  params: Array<{ name: string; type?: string }>,
): ParameterOwnership[] {
  return params.map((p) => {
    const type = p.type || '';
    let ownership: OwnershipType = 'owned';
    if (type.startsWith('&mut ')) ownership = 'mut-borrowed';
    else if (type.startsWith('&')) ownership = 'borrowed';

    const hasLifetime = type.includes("'");

    return { name: p.name, type, ownership, hasLifetime };
  });
}

/**
 * Determine whether a type needs `.clone()` because it is heap-allocated
 * and does not implement Copy.
 */
export function needsClone(type: string): boolean {
  return type.includes('String') || type.includes('Vec<') || type.includes('HashMap<');
}

/**
 * Check if a type is a `Result<T, E>` wrapper.
 */
export function isResultType(type: string): boolean {
  return type.startsWith('Result<') || type.includes('Result<');
}

/**
 * Check if a type is an `Option<T>` wrapper.
 */
export function isOptionType(type: string): boolean {
  return type.startsWith('Option<') || type.includes('Option<');
}

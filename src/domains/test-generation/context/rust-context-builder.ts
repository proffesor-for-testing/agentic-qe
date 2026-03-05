/**
 * Rust Context Builder
 * Builds test context with ownership-aware patterns for Rust test generation.
 *
 * Determines which crate dependencies (tokio, mockall) are needed and
 * whether `use super::*` should be emitted for inline test modules.
 *
 * @module test-generation/context
 */

export interface RustTestContext {
  /** Whether to emit `use super::*;` (true for inline test modules) */
  useSuper: boolean;
  /** Whether async functions require `#[tokio::test]` */
  needsTokio: boolean;
  /** Whether trait mocking via mockall is needed */
  needsMockall: boolean;
  /** List of trait names that need `#[automock]` */
  traitMocks: string[];
}

/**
 * Build a RustTestContext from a list of parsed function signatures.
 *
 * @param functions - Array of function metadata (name, isAsync, decorators)
 * @returns Context object describing crate/feature requirements
 */
export function buildRustTestContext(
  functions: Array<{ name: string; isAsync: boolean; decorators: string[] }>,
): RustTestContext {
  const needsTokio = functions.some((f) => f.isAsync);
  // Full trait analysis would require AST inspection; stubbed for now
  const needsMockall = false;

  return {
    useSuper: true,
    needsTokio,
    needsMockall,
    traitMocks: [],
  };
}

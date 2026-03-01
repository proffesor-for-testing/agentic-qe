/**
 * Agentic QE v3 - Agent Booster Transform Implementations
 *
 * TypeScript fallback implementations for code transforms.
 * These are used when WASM is not available or for testing.
 *
 * Each transform is designed to be:
 * 1. Fast (no external dependencies)
 * 2. Safe (conservative changes only)
 * 3. Accurate (high confidence on pattern matches)
 *
 * @module integrations/agentic-flow/agent-booster/transforms
 */

import type {
  TransformType,
  TransformResult,
  CodeEdit,
  SourceLocation,
  AgentBoosterLogger,
  DEFAULT_LOGGER,
} from './types';

// ============================================================================
// Transform Engine Types
// ============================================================================

/**
 * Transform function signature
 */
export type TransformFunction = (
  code: string,
  logger?: AgentBoosterLogger
) => TransformResult;

/**
 * Transform registry
 */
export type TransformRegistry = Record<TransformType, TransformFunction>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a source location from line and column
 */
function createLocation(code: string, offset: number): SourceLocation {
  const lines = code.slice(0, offset).split('\n');
  const line = lines.length;
  const column = (lines[lines.length - 1] || '').length;
  return { line, column, offset };
}

/**
 * Create a code edit
 */
function createEdit(
  code: string,
  startOffset: number,
  endOffset: number,
  newText: string,
  description: string
): CodeEdit {
  return {
    start: createLocation(code, startOffset),
    end: createLocation(code, endOffset),
    oldText: code.slice(startOffset, endOffset),
    newText,
    description,
  };
}

/**
 * Apply edits to code (sorted by position, applied in reverse)
 */
function applyEdits(code: string, edits: CodeEdit[]): string {
  // Sort by offset descending so we can apply from end to start
  const sortedEdits = [...edits].sort((a, b) => b.start.offset - a.start.offset);

  let result = code;
  for (const edit of sortedEdits) {
    result =
      result.slice(0, edit.start.offset) +
      edit.newText +
      result.slice(edit.end.offset);
  }

  return result;
}

/**
 * Calculate confidence based on edit complexity
 */
function calculateConfidence(
  edits: CodeEdit[],
  baseConfidence: number
): number {
  if (edits.length === 0) return 1.0; // No changes needed = high confidence

  // Reduce confidence for complex changes
  const avgEditSize =
    edits.reduce((sum, e) => sum + Math.abs(e.newText.length - e.oldText.length), 0) /
    edits.length;

  // Large edits reduce confidence
  const sizeMultiplier = Math.max(0.5, 1 - avgEditSize / 1000);

  // Many edits reduce confidence slightly
  const countMultiplier = Math.max(0.7, 1 - edits.length / 100);

  return Math.min(1, baseConfidence * sizeMultiplier * countMultiplier);
}

/**
 * Create a successful transform result
 */
function createSuccessResult(
  code: string,
  transformType: TransformType,
  edits: CodeEdit[],
  startTime: number,
  baseConfidence: number = 0.9
): TransformResult {
  const transformedCode = applyEdits(code, edits);
  const durationMs = Date.now() - startTime;

  return {
    success: true,
    transformType,
    originalCode: code,
    transformedCode,
    edits,
    changeCount: edits.length,
    confidence: calculateConfidence(edits, baseConfidence),
    durationMs,
    implementationUsed: 'typescript',
    usedFallback: false,
    warnings: [],
  };
}

/**
 * Create a failed transform result
 */
function createErrorResult(
  code: string,
  transformType: TransformType,
  error: string,
  startTime: number
): TransformResult {
  return {
    success: false,
    transformType,
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

// ============================================================================
// Transform: var-to-const
// ============================================================================

/**
 * Convert var declarations to const/let
 *
 * Strategy:
 * 1. Find all var declarations
 * 2. Track which variables are reassigned
 * 3. Use const for never-reassigned, let for reassigned
 */
export function transformVarToConst(
  code: string,
  logger: AgentBoosterLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
): TransformResult {
  const startTime = Date.now();
  const edits: CodeEdit[] = [];
  const warnings: string[] = [];

  try {
    // Match var declarations
    const varPattern = /\bvar\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    const assignmentPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*(?:\+\+|--|[+\-*/%&|^]=|\?\?=|&&=|\|\|=|=(?!=))/g;

    // Find all variable names declared with var
    const varDeclarations: Array<{ name: string; offset: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = varPattern.exec(code)) !== null) {
      varDeclarations.push({
        name: match[1],
        offset: match.index,
      });
    }

    // Find all reassignments
    const reassignedVars = new Set<string>();
    while ((match = assignmentPattern.exec(code)) !== null) {
      reassignedVars.add(match[1]);
    }

    // Also check for loop variables (always use let)
    const forLoopVarPattern = /\bfor\s*\(\s*var\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    const loopVars = new Set<string>();
    while ((match = forLoopVarPattern.exec(code)) !== null) {
      loopVars.add(match[1]);
    }

    // Create edits
    for (const decl of varDeclarations) {
      const replacement = loopVars.has(decl.name) || reassignedVars.has(decl.name)
        ? 'let'
        : 'const';

      edits.push(
        createEdit(
          code,
          decl.offset,
          decl.offset + 3, // 'var'.length
          replacement,
          `Convert var ${decl.name} to ${replacement}`
        )
      );
    }

    logger.debug('var-to-const transform completed', {
      declarations: varDeclarations.length,
      reassigned: reassignedVars.size,
      loopVars: loopVars.size,
    });

    const result = createSuccessResult(code, 'var-to-const', edits, startTime, 0.95);
    result.warnings = warnings;
    return result;
  } catch (error) {
    logger.error('var-to-const transform failed', error as Error);
    return createErrorResult(
      code,
      'var-to-const',
      error instanceof Error ? error.message : 'Unknown error',
      startTime
    );
  }
}

// ============================================================================
// Transform: add-types
// ============================================================================

/**
 * Add TypeScript type annotations
 *
 * Strategy:
 * 1. Find function parameters without type annotations
 * 2. Find function return types
 * 3. Add 'any' or inferred types where missing
 */
export function transformAddTypes(
  code: string,
  logger: AgentBoosterLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
): TransformResult {
  const startTime = Date.now();
  const edits: CodeEdit[] = [];
  const warnings: string[] = [];

  try {
    // Match function parameters without types
    // This is a simplified pattern - real implementation would use AST
    const functionPattern = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)/g;
    const arrowFunctionPattern = /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\(([^)]*)\)\s*=>/g;
    const methodPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\s*\{/g;

    let match: RegExpExecArray | null;

    // Process regular functions
    while ((match = functionPattern.exec(code)) !== null) {
      const params = match[2].trim();
      if (params && !params.includes(':')) {
        // Parameters exist but have no types
        const typedParams = params
          .split(',')
          .map((p) => {
            const paramName = p.trim().replace(/\s*=.*$/, ''); // Remove default value
            if (paramName && !paramName.includes(':')) {
              return `${paramName}: unknown`;
            }
            return p.trim();
          })
          .join(', ');

        const paramsStart = match.index + match[0].indexOf('(') + 1;
        const paramsEnd = paramsStart + match[2].length;

        edits.push(
          createEdit(
            code,
            paramsStart,
            paramsEnd,
            typedParams,
            `Add types to function ${match[1]} parameters`
          )
        );
      }
    }

    // Process arrow functions
    while ((match = arrowFunctionPattern.exec(code)) !== null) {
      const params = match[2].trim();
      if (params && !params.includes(':')) {
        const typedParams = params
          .split(',')
          .map((p) => {
            const paramName = p.trim().replace(/\s*=.*$/, '');
            if (paramName && !paramName.includes(':')) {
              return `${paramName}: unknown`;
            }
            return p.trim();
          })
          .join(', ');

        const paramsStart = match.index + match[0].indexOf('(') + 1;
        const paramsEnd = paramsStart + match[2].length;

        edits.push(
          createEdit(
            code,
            paramsStart,
            paramsEnd,
            typedParams,
            `Add types to arrow function ${match[1]} parameters`
          )
        );
      }
    }

    logger.debug('add-types transform completed', { edits: edits.length });

    // Lower confidence because type inference is complex
    const result = createSuccessResult(code, 'add-types', edits, startTime, 0.7);
    result.warnings = warnings;
    if (edits.length > 0) {
      result.warnings.push('Type annotations use "unknown" - manual review recommended');
    }
    return result;
  } catch (error) {
    logger.error('add-types transform failed', error as Error);
    return createErrorResult(
      code,
      'add-types',
      error instanceof Error ? error.message : 'Unknown error',
      startTime
    );
  }
}

// ============================================================================
// Transform: remove-console
// ============================================================================

/**
 * Remove console.* statements
 *
 * Strategy:
 * 1. Find all console.* calls
 * 2. Remove the entire statement including semicolon
 * 3. Handle multiline console calls
 */
export function transformRemoveConsole(
  code: string,
  logger: AgentBoosterLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
): TransformResult {
  const startTime = Date.now();
  const edits: CodeEdit[] = [];
  const warnings: string[] = [];

  try {
    // Match console.* statements - handle various console methods
    // This pattern handles:
    // - console.log(), console.warn(), console.error(), etc.
    // - Multiline arguments
    // - Trailing semicolon
    const consolePattern =
      /^\s*console\.(log|warn|error|info|debug|trace|dir|table|time|timeEnd|group|groupEnd|assert)\s*\([^)]*\);?\s*$/gm;

    // Also match inline console statements (in expressions, not recommended)
    const inlineConsolePattern =
      /console\.(log|warn|error|info|debug|trace|dir|table|time|timeEnd|group|groupEnd|assert)\s*\([^)]*\)/g;

    let match: RegExpExecArray | null;
    const processedOffsets = new Set<number>();

    // Process statement-level console calls (remove entire line)
    while ((match = consolePattern.exec(code)) !== null) {
      if (processedOffsets.has(match.index)) continue;
      processedOffsets.add(match.index);

      edits.push(
        createEdit(
          code,
          match.index,
          match.index + match[0].length,
          '',
          `Remove console.${match[1]}() statement`
        )
      );
    }

    // Process inline console calls (just the call, with warning)
    while ((match = inlineConsolePattern.exec(code)) !== null) {
      if (processedOffsets.has(match.index)) continue;

      // Check if this is part of a statement we already processed
      const lineStart = code.lastIndexOf('\n', match.index) + 1;
      const lineEnd = code.indexOf('\n', match.index);
      const line = code.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);

      // Skip if this is a standalone statement (already handled)
      if (/^\s*console\./.test(line)) continue;

      processedOffsets.add(match.index);
      warnings.push(
        `Inline console.${match[1]}() at offset ${match.index} - consider manual review`
      );
    }

    logger.debug('remove-console transform completed', {
      removed: edits.length,
      warnings: warnings.length,
    });

    const result = createSuccessResult(code, 'remove-console', edits, startTime, 0.95);
    result.warnings = warnings;
    return result;
  } catch (error) {
    logger.error('remove-console transform failed', error as Error);
    return createErrorResult(
      code,
      'remove-console',
      error instanceof Error ? error.message : 'Unknown error',
      startTime
    );
  }
}

// ============================================================================
// Transform: promise-to-async
// ============================================================================

/**
 * Convert Promise .then() chains to async/await
 *
 * Strategy:
 * 1. Find .then() chains
 * 2. Convert to await expressions
 * 3. Handle error cases with try/catch
 */
export function transformPromiseToAsync(
  code: string,
  logger: AgentBoosterLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
): TransformResult {
  const startTime = Date.now();
  const edits: CodeEdit[] = [];
  const warnings: string[] = [];

  try {
    // Simple pattern for single .then() calls
    // Real implementation would need AST for complex chains
    const simpleThenPattern =
      /([a-zA-Z_$][a-zA-Z0-9_$]*(?:\([^)]*\))?)\s*\.then\s*\(\s*(?:async\s*)?\(?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\)?\s*=>\s*([^)]+)\)/g;

    let match: RegExpExecArray | null;

    while ((match = simpleThenPattern.exec(code)) !== null) {
      const [fullMatch, promiseExpr, paramName, body] = match;

      // Only handle simple cases
      if (body.includes('.then') || body.includes('.catch')) {
        warnings.push(`Complex promise chain at offset ${match.index} - manual review recommended`);
        continue;
      }

      const awaitExpr = `const ${paramName} = await ${promiseExpr};\n${body.trim()}`;

      edits.push(
        createEdit(
          code,
          match.index,
          match.index + fullMatch.length,
          awaitExpr,
          `Convert .then() to await`
        )
      );
    }

    logger.debug('promise-to-async transform completed', {
      converted: edits.length,
      warnings: warnings.length,
    });

    // Lower confidence due to complexity
    const result = createSuccessResult(code, 'promise-to-async', edits, startTime, 0.65);
    result.warnings = warnings;
    if (edits.length > 0) {
      result.warnings.push(
        'Promise chains converted to await - ensure containing function is async'
      );
    }
    return result;
  } catch (error) {
    logger.error('promise-to-async transform failed', error as Error);
    return createErrorResult(
      code,
      'promise-to-async',
      error instanceof Error ? error.message : 'Unknown error',
      startTime
    );
  }
}

// ============================================================================
// Transform: cjs-to-esm
// ============================================================================

/**
 * Convert CommonJS to ES modules
 *
 * Strategy:
 * 1. Convert require() to import
 * 2. Convert module.exports to export
 * 3. Convert exports.x to export
 */
export function transformCjsToEsm(
  code: string,
  logger: AgentBoosterLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
): TransformResult {
  const startTime = Date.now();
  const edits: CodeEdit[] = [];
  const warnings: string[] = [];

  try {
    let match: RegExpExecArray | null;

    // Convert: const x = require('y') -> import x from 'y'
    const requirePattern =
      /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*require\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*;?/g;

    while ((match = requirePattern.exec(code)) !== null) {
      const [fullMatch, varName, modulePath] = match;
      const importStmt = `import ${varName} from ${modulePath};`;

      edits.push(
        createEdit(code, match.index, match.index + fullMatch.length, importStmt, `Convert require to import`)
      );
    }

    // Convert: const { a, b } = require('y') -> import { a, b } from 'y'
    const destructureRequirePattern =
      /(?:const|let|var)\s+\{\s*([^}]+)\s*\}\s*=\s*require\s*\(\s*(['"`][^'"`]+['"`])\s*\)\s*;?/g;

    while ((match = destructureRequirePattern.exec(code)) !== null) {
      const [fullMatch, imports, modulePath] = match;
      const importStmt = `import { ${imports.trim()} } from ${modulePath};`;

      edits.push(
        createEdit(code, match.index, match.index + fullMatch.length, importStmt, `Convert destructured require to import`)
      );
    }

    // Convert: module.exports = x -> export default x
    const moduleExportsPattern = /module\.exports\s*=\s*([^;]+);?/g;

    while ((match = moduleExportsPattern.exec(code)) !== null) {
      const [fullMatch, exportValue] = match;
      const exportStmt = `export default ${exportValue.trim()};`;

      edits.push(
        createEdit(code, match.index, match.index + fullMatch.length, exportStmt, `Convert module.exports to export default`)
      );
    }

    // Convert: exports.x = y -> export const x = y
    const exportsPattern = /exports\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*([^;]+);?/g;

    while ((match = exportsPattern.exec(code)) !== null) {
      const [fullMatch, exportName, exportValue] = match;

      // Check if the value is a function or class
      const value = exportValue.trim();
      let exportStmt: string;

      if (value.startsWith('function') || value.startsWith('class')) {
        exportStmt = `export ${value}`;
      } else if (value.startsWith('async function')) {
        exportStmt = `export ${value}`;
      } else {
        exportStmt = `export const ${exportName} = ${value};`;
      }

      edits.push(
        createEdit(code, match.index, match.index + fullMatch.length, exportStmt, `Convert exports.${exportName} to named export`)
      );
    }

    logger.debug('cjs-to-esm transform completed', { edits: edits.length });

    const result = createSuccessResult(code, 'cjs-to-esm', edits, startTime, 0.85);
    result.warnings = warnings;
    return result;
  } catch (error) {
    logger.error('cjs-to-esm transform failed', error as Error);
    return createErrorResult(
      code,
      'cjs-to-esm',
      error instanceof Error ? error.message : 'Unknown error',
      startTime
    );
  }
}

// ============================================================================
// Transform: func-to-arrow
// ============================================================================

/**
 * Convert function declarations to arrow functions
 *
 * Strategy:
 * 1. Find function expressions (not declarations used as constructors)
 * 2. Convert to arrow syntax
 * 3. Handle 'this' binding carefully
 */
export function transformFuncToArrow(
  code: string,
  logger: AgentBoosterLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
): TransformResult {
  const startTime = Date.now();
  const edits: CodeEdit[] = [];
  const warnings: string[] = [];

  try {
    // Match function expressions assigned to variables
    // const x = function(a, b) { ... }
    const funcExprPattern =
      /(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function\s*\(([^)]*)\)\s*\{/g;

    let match: RegExpExecArray | null;

    while ((match = funcExprPattern.exec(code)) !== null) {
      const [fullMatch, keyword, varName, params] = match;

      // Check if function uses 'this' - skip if it does (arrow functions bind this differently)
      const funcStart = match.index;
      let braceCount = 1;
      let funcEnd = funcStart + fullMatch.length;

      // Find the closing brace
      while (braceCount > 0 && funcEnd < code.length) {
        if (code[funcEnd] === '{') braceCount++;
        if (code[funcEnd] === '}') braceCount--;
        funcEnd++;
      }

      const funcBody = code.slice(funcStart, funcEnd);

      if (/\bthis\b/.test(funcBody)) {
        warnings.push(
          `Function ${varName} uses 'this' - skipping arrow conversion (would change binding)`
        );
        continue;
      }

      if (/\barguments\b/.test(funcBody)) {
        warnings.push(
          `Function ${varName} uses 'arguments' - skipping arrow conversion (not available in arrow functions)`
        );
        continue;
      }

      // Convert to arrow function
      const arrowDecl = `${keyword} ${varName} = (${params}) => {`;

      edits.push(
        createEdit(code, match.index, match.index + fullMatch.length, arrowDecl, `Convert function ${varName} to arrow function`)
      );
    }

    // Match anonymous function expressions in callbacks
    // .map(function(x) { return x * 2; })
    const callbackPattern = /function\s*\(([^)]*)\)\s*\{\s*return\s+([^;]+);\s*\}/g;

    while ((match = callbackPattern.exec(code)) !== null) {
      const [fullMatch, params, returnExpr] = match;

      // Check for this/arguments usage
      if (/\b(this|arguments)\b/.test(fullMatch)) {
        continue;
      }

      // Simple single-expression return - use concise arrow
      const arrowFunc =
        params.includes(',') || params.trim() === ''
          ? `(${params}) => ${returnExpr}`
          : `${params.trim()} => ${returnExpr}`;

      edits.push(
        createEdit(code, match.index, match.index + fullMatch.length, arrowFunc, `Convert callback to arrow function`)
      );
    }

    logger.debug('func-to-arrow transform completed', {
      converted: edits.length,
      warnings: warnings.length,
    });

    const result = createSuccessResult(code, 'func-to-arrow', edits, startTime, 0.85);
    result.warnings = warnings;
    return result;
  } catch (error) {
    logger.error('func-to-arrow transform failed', error as Error);
    return createErrorResult(
      code,
      'func-to-arrow',
      error instanceof Error ? error.message : 'Unknown error',
      startTime
    );
  }
}

// ============================================================================
// Transform Registry
// ============================================================================

/**
 * Registry of all available transforms
 */
export const TRANSFORM_REGISTRY: TransformRegistry = {
  'var-to-const': transformVarToConst,
  'add-types': transformAddTypes,
  'remove-console': transformRemoveConsole,
  'promise-to-async': transformPromiseToAsync,
  'cjs-to-esm': transformCjsToEsm,
  'func-to-arrow': transformFuncToArrow,
};

/**
 * Execute a transform by type
 */
export function executeTransform(
  code: string,
  type: TransformType,
  logger?: AgentBoosterLogger
): TransformResult {
  const transform = TRANSFORM_REGISTRY[type];
  if (!transform) {
    return {
      success: false,
      transformType: type,
      originalCode: code,
      transformedCode: code,
      edits: [],
      changeCount: 0,
      confidence: 0,
      durationMs: 0,
      implementationUsed: 'typescript',
      usedFallback: false,
      error: `Unknown transform type: ${type}`,
      warnings: [],
    };
  }

  return transform(code, logger);
}

/**
 * Get all available transform types
 */
export function getAvailableTransformTypes(): TransformType[] {
  return Object.keys(TRANSFORM_REGISTRY) as TransformType[];
}

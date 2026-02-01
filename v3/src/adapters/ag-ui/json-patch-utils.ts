/**
 * JSON Patch Utilities (RFC 6902)
 *
 * Provides utilities for computing and applying JSON Patch operations
 * for AG-UI STATE_DELTA event synchronization.
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc6902
 *
 * @module adapters/ag-ui/json-patch-utils
 */

import type { JsonPatchOperation } from './event-types.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of applying a patch operation
 */
export interface PatchResult {
  /** Whether the patch was applied successfully */
  success: boolean;
  /** The resulting document after patch application */
  document: Record<string, unknown>;
  /** Error message if patch failed */
  error?: string;
  /** Index of the failed operation (if any) */
  failedOperationIndex?: number;
}

/**
 * Configuration for diff computation
 */
export interface DiffConfig {
  /** Whether to generate 'test' operations for validation */
  generateTestOps?: boolean;
  /** Whether to use 'move' operations when possible */
  detectMoves?: boolean;
  /** Maximum depth to compare objects (default: unlimited) */
  maxDepth?: number;
}

/**
 * Validation result for a patch operation
 */
export interface ValidationResult {
  /** Whether the operation is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
}

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Escape special characters in a JSON Pointer token (RFC 6901)
 * ~ becomes ~0
 * / becomes ~1
 */
export function escapePathToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Unescape special characters in a JSON Pointer token (RFC 6901)
 * ~0 becomes ~
 * ~1 becomes /
 */
export function unescapePathToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Parse a JSON Pointer path into tokens
 */
export function parsePath(path: string): string[] {
  if (path === '') {
    return [];
  }
  if (!path.startsWith('/')) {
    throw new Error(`Invalid JSON Pointer: path must start with '/' or be empty, got '${path}'`);
  }
  return path.slice(1).split('/').map(unescapePathToken);
}

/**
 * Build a JSON Pointer path from tokens
 */
export function buildPath(tokens: string[]): string {
  if (tokens.length === 0) {
    return '';
  }
  return '/' + tokens.map(escapePathToken).join('/');
}

/**
 * Get a value from an object using a JSON Pointer path
 */
export function getValueAtPath(
  document: Record<string, unknown>,
  path: string
): unknown {
  if (path === '') {
    return document;
  }

  const tokens = parsePath(path);
  let current: unknown = document;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = token === '-' ? current.length : parseInt(token, 10);
      if (isNaN(index) || index < 0) {
        return undefined;
      }
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[token];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Set a value at a JSON Pointer path (mutates the document)
 */
export function setValueAtPath(
  document: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  if (path === '') {
    throw new Error('Cannot replace root document');
  }

  const tokens = parsePath(path);
  const lastToken = tokens.pop()!;
  let current: unknown = document;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      throw new Error(`Path does not exist: ${path}`);
    }

    if (Array.isArray(current)) {
      const index = parseInt(token, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        throw new Error(`Invalid array index: ${token}`);
      }
      current = current[index];
    } else if (typeof current === 'object') {
      if (!(token in (current as Record<string, unknown>))) {
        throw new Error(`Path does not exist: ${path}`);
      }
      current = (current as Record<string, unknown>)[token];
    } else {
      throw new Error(`Cannot traverse non-object: ${path}`);
    }
  }

  if (Array.isArray(current)) {
    const index = lastToken === '-' ? current.length : parseInt(lastToken, 10);
    if (isNaN(index) || index < 0) {
      throw new Error(`Invalid array index: ${lastToken}`);
    }
    current[index] = value;
  } else if (typeof current === 'object' && current !== null) {
    (current as Record<string, unknown>)[lastToken] = value;
  } else {
    throw new Error(`Cannot set value at path: ${path}`);
  }
}

/**
 * Delete a value at a JSON Pointer path (mutates the document)
 */
export function deleteValueAtPath(
  document: Record<string, unknown>,
  path: string
): void {
  if (path === '') {
    throw new Error('Cannot remove root document');
  }

  const tokens = parsePath(path);
  const lastToken = tokens.pop()!;
  let current: unknown = document;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      throw new Error(`Path does not exist: ${path}`);
    }

    if (Array.isArray(current)) {
      const index = parseInt(token, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        throw new Error(`Invalid array index: ${token}`);
      }
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[token];
    } else {
      throw new Error(`Cannot traverse non-object: ${path}`);
    }
  }

  if (Array.isArray(current)) {
    const index = parseInt(lastToken, 10);
    if (isNaN(index) || index < 0 || index >= current.length) {
      throw new Error(`Invalid array index: ${lastToken}`);
    }
    current.splice(index, 1);
  } else if (typeof current === 'object' && current !== null) {
    if (!(lastToken in (current as Record<string, unknown>))) {
      throw new Error(`Path does not exist: ${path}`);
    }
    delete (current as Record<string, unknown>)[lastToken];
  } else {
    throw new Error(`Cannot delete value at path: ${path}`);
  }
}

/**
 * Check if a path exists in the document
 */
export function pathExists(
  document: Record<string, unknown>,
  path: string
): boolean {
  if (path === '') {
    return true;
  }

  const tokens = parsePath(path);
  let current: unknown = document;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return false;
    }

    if (Array.isArray(current)) {
      const index = parseInt(token, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
    } else if (typeof current === 'object') {
      if (!(token in (current as Record<string, unknown>))) {
        return false;
      }
      current = (current as Record<string, unknown>)[token];
    } else {
      return false;
    }
  }

  return true;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a single patch operation
 */
export function validateOperation(op: JsonPatchOperation): ValidationResult {
  // Check operation type
  const validOps = ['add', 'remove', 'replace', 'move', 'copy', 'test'];
  if (!validOps.includes(op.op)) {
    return { valid: false, error: `Invalid operation: ${op.op}` };
  }

  // Check path
  if (typeof op.path !== 'string') {
    return { valid: false, error: 'Path must be a string' };
  }
  if (op.path !== '' && !op.path.startsWith('/')) {
    return { valid: false, error: 'Path must start with / or be empty' };
  }

  // Check value for operations that require it
  if (['add', 'replace', 'test'].includes(op.op) && !('value' in op)) {
    return { valid: false, error: `Operation '${op.op}' requires a value` };
  }

  // Check from for move/copy operations
  if (['move', 'copy'].includes(op.op)) {
    if (!('from' in op) || typeof op.from !== 'string') {
      return { valid: false, error: `Operation '${op.op}' requires 'from' path` };
    }
    if (op.from !== '' && !op.from.startsWith('/')) {
      return { valid: false, error: "'from' path must start with / or be empty" };
    }
  }

  return { valid: true };
}

/**
 * Validate an array of patch operations
 */
export function validatePatch(patch: JsonPatchOperation[]): ValidationResult {
  for (let i = 0; i < patch.length; i++) {
    const result = validateOperation(patch[i]);
    if (!result.valid) {
      return { valid: false, error: `Operation ${i}: ${result.error}` };
    }
  }
  return { valid: true };
}

// ============================================================================
// Patch Application
// ============================================================================

/**
 * Apply a single patch operation to a document
 * Returns a new document (immutable)
 */
export function applyOperation(
  document: Record<string, unknown>,
  op: JsonPatchOperation
): Record<string, unknown> {
  // Deep clone to avoid mutation
  const result = structuredClone(document);

  switch (op.op) {
    case 'add': {
      if (op.path === '') {
        // Replace entire document
        if (typeof op.value !== 'object' || op.value === null) {
          throw new Error('Cannot replace root with non-object');
        }
        return structuredClone(op.value) as Record<string, unknown>;
      }
      addValue(result, op.path, op.value);
      break;
    }

    case 'remove': {
      deleteValueAtPath(result, op.path);
      break;
    }

    case 'replace': {
      if (!pathExists(result, op.path)) {
        throw new Error(`Path does not exist for replace: ${op.path}`);
      }
      setValueAtPath(result, op.path, structuredClone(op.value));
      break;
    }

    case 'move': {
      const from = op.from!;
      const value = getValueAtPath(result, from);
      if (value === undefined && !pathExists(result, from)) {
        throw new Error(`Source path does not exist for move: ${from}`);
      }
      deleteValueAtPath(result, from);
      addValue(result, op.path, structuredClone(value));
      break;
    }

    case 'copy': {
      const from = op.from!;
      const value = getValueAtPath(result, from);
      if (value === undefined && !pathExists(result, from)) {
        throw new Error(`Source path does not exist for copy: ${from}`);
      }
      addValue(result, op.path, structuredClone(value));
      break;
    }

    case 'test': {
      const currentValue = getValueAtPath(result, op.path);
      if (!deepEqual(currentValue, op.value)) {
        throw new Error(
          `Test failed at path ${op.path}: expected ${JSON.stringify(op.value)}, got ${JSON.stringify(currentValue)}`
        );
      }
      break;
    }

    default:
      throw new Error(`Unknown operation: ${(op as JsonPatchOperation).op}`);
  }

  return result;
}

/**
 * Add a value at a path (handles array insertion)
 */
function addValue(
  document: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  const tokens = parsePath(path);
  const lastToken = tokens.pop()!;
  let current: unknown = document;

  // Navigate to parent
  for (const token of tokens) {
    if (current === null || current === undefined) {
      throw new Error(`Path does not exist: ${path}`);
    }

    if (Array.isArray(current)) {
      const index = parseInt(token, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        throw new Error(`Invalid array index: ${token}`);
      }
      current = current[index];
    } else if (typeof current === 'object') {
      if (!(token in (current as Record<string, unknown>))) {
        // Create intermediate object
        (current as Record<string, unknown>)[token] = {};
      }
      current = (current as Record<string, unknown>)[token];
    } else {
      throw new Error(`Cannot traverse non-object: ${path}`);
    }
  }

  // Add value
  if (Array.isArray(current)) {
    const index = lastToken === '-' ? current.length : parseInt(lastToken, 10);
    if (isNaN(index) || index < 0 || index > current.length) {
      throw new Error(`Invalid array index for add: ${lastToken}`);
    }
    current.splice(index, 0, structuredClone(value));
  } else if (typeof current === 'object' && current !== null) {
    (current as Record<string, unknown>)[lastToken] = structuredClone(value);
  } else {
    throw new Error(`Cannot add value at path: ${path}`);
  }
}

/**
 * Apply a JSON Patch to a document
 * Returns result with success status and either new document or error info
 */
export function applyPatch(
  document: Record<string, unknown>,
  patch: JsonPatchOperation[]
): PatchResult {
  // Validate first
  const validation = validatePatch(patch);
  if (!validation.valid) {
    return {
      success: false,
      document,
      error: validation.error,
    };
  }

  let result = structuredClone(document);

  for (let i = 0; i < patch.length; i++) {
    try {
      result = applyOperation(result, patch[i]);
    } catch (error) {
      return {
        success: false,
        document, // Return original document (rollback)
        error: error instanceof Error ? error.message : String(error),
        failedOperationIndex: i,
      };
    }
  }

  return {
    success: true,
    document: result,
  };
}

/**
 * Apply a JSON Patch atomically with automatic rollback on failure
 * Returns the new document if successful, throws on error
 */
export function applyPatchAtomic(
  document: Record<string, unknown>,
  patch: JsonPatchOperation[]
): Record<string, unknown> {
  const result = applyPatch(document, patch);
  if (!result.success) {
    throw new Error(result.error ?? 'Patch application failed');
  }
  return result.document;
}

// ============================================================================
// Diff Computation
// ============================================================================

/**
 * Deep equality comparison for JSON values
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return a === b;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => key in bObj && deepEqual(aObj[key], bObj[key]));
}

/**
 * Compute the JSON Patch to transform oldState into newState
 */
export function computeDiff(
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>,
  config: DiffConfig = {}
): JsonPatchOperation[] {
  const { maxDepth = Infinity } = config;
  const operations: JsonPatchOperation[] = [];

  computeDiffRecursive(oldState, newState, '', operations, 0, maxDepth);

  return operations;
}

/**
 * Recursive diff computation
 */
function computeDiffRecursive(
  oldVal: unknown,
  newVal: unknown,
  path: string,
  ops: JsonPatchOperation[],
  depth: number,
  maxDepth: number
): void {
  // If values are equal, no operation needed
  if (deepEqual(oldVal, newVal)) {
    return;
  }

  // If types differ or we're at max depth, replace
  if (
    typeof oldVal !== typeof newVal ||
    oldVal === null ||
    newVal === null ||
    depth >= maxDepth
  ) {
    if (oldVal === undefined) {
      ops.push({ op: 'add', path, value: newVal });
    } else if (newVal === undefined) {
      ops.push({ op: 'remove', path });
    } else {
      ops.push({ op: 'replace', path, value: newVal });
    }
    return;
  }

  // Handle arrays
  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    computeArrayDiff(oldVal, newVal, path, ops, depth, maxDepth);
    return;
  }

  // Handle objects
  if (typeof oldVal === 'object' && typeof newVal === 'object') {
    const oldObj = oldVal as Record<string, unknown>;
    const newObj = newVal as Record<string, unknown>;

    // Find removed keys
    for (const key of Object.keys(oldObj)) {
      if (!(key in newObj)) {
        ops.push({ op: 'remove', path: buildPath([...parsePath(path), key]) });
      }
    }

    // Find added and changed keys
    for (const key of Object.keys(newObj)) {
      const childPath = buildPath([...parsePath(path), key]);
      if (!(key in oldObj)) {
        ops.push({ op: 'add', path: childPath, value: newObj[key] });
      } else {
        computeDiffRecursive(
          oldObj[key],
          newObj[key],
          childPath,
          ops,
          depth + 1,
          maxDepth
        );
      }
    }
    return;
  }

  // Primitive values that differ
  ops.push({ op: 'replace', path, value: newVal });
}

/**
 * Compute diff for arrays
 * Uses simple index-based comparison for efficiency
 */
function computeArrayDiff(
  oldArr: unknown[],
  newArr: unknown[],
  path: string,
  ops: JsonPatchOperation[],
  depth: number,
  maxDepth: number
): void {
  const maxLen = Math.max(oldArr.length, newArr.length);

  // Process from end to start to preserve indices during removal
  const removals: JsonPatchOperation[] = [];
  const modifications: JsonPatchOperation[] = [];

  for (let i = 0; i < maxLen; i++) {
    const childPath = `${path}/${i}`;

    if (i >= newArr.length) {
      // Element removed
      removals.push({ op: 'remove', path: childPath });
    } else if (i >= oldArr.length) {
      // Element added
      modifications.push({ op: 'add', path: childPath, value: newArr[i] });
    } else if (!deepEqual(oldArr[i], newArr[i])) {
      // Element changed
      const oldItem = oldArr[i];
      const newItem = newArr[i];

      // For complex objects, recurse
      if (
        typeof oldItem === 'object' &&
        typeof newItem === 'object' &&
        oldItem !== null &&
        newItem !== null &&
        !Array.isArray(oldItem) === !Array.isArray(newItem) &&
        depth < maxDepth
      ) {
        computeDiffRecursive(oldItem, newItem, childPath, modifications, depth + 1, maxDepth);
      } else {
        modifications.push({ op: 'replace', path: childPath, value: newItem });
      }
    }
  }

  // Add removals in reverse order to preserve indices
  for (let i = removals.length - 1; i >= 0; i--) {
    ops.push(removals[i]);
  }

  // Add modifications and additions
  ops.push(...modifications);
}

/**
 * Create a test operation to validate state before applying patches
 */
export function createTestOperation(
  path: string,
  value: unknown
): JsonPatchOperation {
  return { op: 'test', path, value };
}

/**
 * Create an add operation
 */
export function createAddOperation(
  path: string,
  value: unknown
): JsonPatchOperation {
  return { op: 'add', path, value };
}

/**
 * Create a remove operation
 */
export function createRemoveOperation(path: string): JsonPatchOperation {
  return { op: 'remove', path };
}

/**
 * Create a replace operation
 */
export function createReplaceOperation(
  path: string,
  value: unknown
): JsonPatchOperation {
  return { op: 'replace', path, value };
}

/**
 * Create a move operation
 */
export function createMoveOperation(
  from: string,
  path: string
): JsonPatchOperation {
  return { op: 'move', from, path };
}

/**
 * Create a copy operation
 */
export function createCopyOperation(
  from: string,
  path: string
): JsonPatchOperation {
  return { op: 'copy', from, path };
}

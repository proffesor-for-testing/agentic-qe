/**
 * JSON Patch Wrapper (RFC 6902)
 *
 * Provides a unified interface for JSON Patch operations using fast-json-patch
 * for RFC 6902 compliance. This module wraps fast-json-patch with additional
 * validation, error handling, and AQE-specific types.
 *
 * Reference: https://datatracker.ietf.org/doc/html/rfc6902
 *
 * @module adapters/ag-ui/json-patch
 */

import * as fastJsonPatch from 'fast-json-patch';
import type { JsonPatchOperation as AQEJsonPatchOperation } from './event-types.js';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * JSON Patch operation type (RFC 6902)
 */
export type PatchOperationType = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

/**
 * Re-export fast-json-patch types for compatibility
 */
export type Operation = fastJsonPatch.Operation;

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
  /** Validation errors if any */
  validationErrors?: string[];
}

/**
 * Configuration for diff computation
 */
export interface DiffConfig {
  /** Whether to generate 'test' operations for validation */
  generateTestOps?: boolean;
  /** Whether to use 'move' operations when possible (fast-json-patch always detects moves) */
  detectMoves?: boolean;
  /** Maximum depth to compare objects (default: unlimited) */
  maxDepth?: number;
  /** Whether to use hash comparison for arrays (faster but less precise) */
  hash?: boolean;
  /** Whether to invert the diff (newState -> oldState) */
  invertible?: boolean;
}

/**
 * Validation result for a patch operation
 */
export interface ValidationResult {
  /** Whether the operation is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Array of all validation errors */
  errors?: string[];
}

/**
 * Compliance check result for RFC 6902
 */
export interface ComplianceResult {
  /** Whether the patch is RFC 6902 compliant */
  compliant: boolean;
  /** List of compliance issues found */
  issues: ComplianceIssue[];
}

/**
 * Individual compliance issue
 */
export interface ComplianceIssue {
  /** Issue type */
  type: 'invalid_op' | 'missing_path' | 'invalid_path' | 'missing_value' | 'missing_from' | 'invalid_from';
  /** Operation index where issue was found */
  operationIndex: number;
  /** Human-readable description */
  message: string;
  /** RFC 6902 section reference */
  rfcSection?: string;
}

// ============================================================================
// Path Utilities (RFC 6901 JSON Pointer)
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
    throw new JsonPatchError(
      `Invalid JSON Pointer: path must start with '/' or be empty, got '${path}'`,
      'INVALID_PATH',
      { path }
    );
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

/**
 * Set a value at a JSON Pointer path (mutates the document)
 */
export function setValueAtPath(
  document: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  if (path === '') {
    throw new JsonPatchError('Cannot replace root document via setValueAtPath', 'INVALID_OPERATION');
  }

  const tokens = parsePath(path);
  const lastToken = tokens.pop()!;
  let current: unknown = document;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      throw new JsonPatchError(`Path does not exist: ${path}`, 'PATH_NOT_FOUND', { path });
    }

    if (Array.isArray(current)) {
      const index = parseInt(token, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        throw new JsonPatchError(`Invalid array index: ${token}`, 'INVALID_INDEX', { token, path });
      }
      current = current[index];
    } else if (typeof current === 'object') {
      if (!(token in (current as Record<string, unknown>))) {
        throw new JsonPatchError(`Path does not exist: ${path}`, 'PATH_NOT_FOUND', { path });
      }
      current = (current as Record<string, unknown>)[token];
    } else {
      throw new JsonPatchError(`Cannot traverse non-object: ${path}`, 'INVALID_PATH', { path });
    }
  }

  if (Array.isArray(current)) {
    const index = lastToken === '-' ? current.length : parseInt(lastToken, 10);
    if (isNaN(index) || index < 0) {
      throw new JsonPatchError(`Invalid array index: ${lastToken}`, 'INVALID_INDEX', { token: lastToken, path });
    }
    current[index] = value;
  } else if (typeof current === 'object' && current !== null) {
    (current as Record<string, unknown>)[lastToken] = value;
  } else {
    throw new JsonPatchError(`Cannot set value at path: ${path}`, 'INVALID_OPERATION', { path });
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
    throw new JsonPatchError('Cannot remove root document', 'INVALID_OPERATION');
  }

  const tokens = parsePath(path);
  const lastToken = tokens.pop()!;
  let current: unknown = document;

  for (const token of tokens) {
    if (current === null || current === undefined) {
      throw new JsonPatchError(`Path does not exist: ${path}`, 'PATH_NOT_FOUND', { path });
    }

    if (Array.isArray(current)) {
      const index = parseInt(token, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        throw new JsonPatchError(`Invalid array index: ${token}`, 'INVALID_INDEX', { token, path });
      }
      current = current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[token];
    } else {
      throw new JsonPatchError(`Cannot traverse non-object: ${path}`, 'INVALID_PATH', { path });
    }
  }

  if (Array.isArray(current)) {
    const index = parseInt(lastToken, 10);
    if (isNaN(index) || index < 0 || index >= current.length) {
      throw new JsonPatchError(`Invalid array index: ${lastToken}`, 'INVALID_INDEX', { token: lastToken, path });
    }
    current.splice(index, 1);
  } else if (typeof current === 'object' && current !== null) {
    if (!(lastToken in (current as Record<string, unknown>))) {
      throw new JsonPatchError(`Path does not exist: ${path}`, 'PATH_NOT_FOUND', { path });
    }
    delete (current as Record<string, unknown>)[lastToken];
  } else {
    throw new JsonPatchError(`Cannot delete value at path: ${path}`, 'INVALID_OPERATION', { path });
  }
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Error codes for JSON Patch operations
 */
export type JsonPatchErrorCode =
  | 'INVALID_OPERATION'
  | 'INVALID_PATH'
  | 'PATH_NOT_FOUND'
  | 'INVALID_INDEX'
  | 'TEST_FAILED'
  | 'VALIDATION_FAILED'
  | 'COMPLIANCE_FAILED'
  | 'APPLICATION_FAILED';

/**
 * Custom error class for JSON Patch operations
 */
export class JsonPatchError extends Error {
  constructor(
    message: string,
    public readonly code: JsonPatchErrorCode,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'JsonPatchError';
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, JsonPatchError.prototype);
  }

  /**
   * Create error from fast-json-patch error
   */
  static fromFastJsonPatch(error: unknown, operationIndex?: number): JsonPatchError {
    const message = toErrorMessage(error);
    return new JsonPatchError(message, 'APPLICATION_FAILED', {
      originalError: message,
      operationIndex,
    });
  }

  /**
   * Create test failure error
   */
  static testFailed(path: string, expected: unknown, actual: unknown): JsonPatchError {
    return new JsonPatchError(
      `Test failed at path ${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
      'TEST_FAILED',
      { path, expected, actual }
    );
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Valid operation types per RFC 6902
 */
const VALID_OPERATIONS: PatchOperationType[] = ['add', 'remove', 'replace', 'move', 'copy', 'test'];

/**
 * Operations that require a 'value' field
 */
const VALUE_REQUIRED_OPS: PatchOperationType[] = ['add', 'replace', 'test'];

/**
 * Operations that require a 'from' field
 */
const FROM_REQUIRED_OPS: PatchOperationType[] = ['move', 'copy'];

/**
 * Validate a JSON Pointer path format (RFC 6901)
 */
export function validatePath(path: string): boolean {
  // Empty string is valid (refers to whole document)
  if (path === '') {
    return true;
  }
  // Must start with /
  if (!path.startsWith('/')) {
    return false;
  }
  // Check for valid escape sequences
  const tokens = path.slice(1).split('/');
  for (const token of tokens) {
    // Check for invalid escape sequences (~ not followed by 0 or 1)
    for (let i = 0; i < token.length; i++) {
      if (token[i] === '~') {
        const next = token[i + 1];
        if (next !== '0' && next !== '1') {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * Validate a single patch operation against RFC 6902
 */
export function validateOperation(op: AQEJsonPatchOperation): ValidationResult {
  const errors: string[] = [];

  // Check operation type
  if (!VALID_OPERATIONS.includes(op.op)) {
    errors.push(`Invalid operation type: '${op.op}'. Valid types are: ${VALID_OPERATIONS.join(', ')}`);
  }

  // Check path
  if (typeof op.path !== 'string') {
    errors.push('Path must be a string');
  } else if (!validatePath(op.path)) {
    errors.push(`Invalid JSON Pointer path: '${op.path}'. Path must be empty or start with '/'`);
  }

  // Check value for operations that require it
  if (VALUE_REQUIRED_OPS.includes(op.op) && !('value' in op)) {
    errors.push(`Operation '${op.op}' requires a 'value' field`);
  }

  // Check from for move/copy operations
  if (FROM_REQUIRED_OPS.includes(op.op)) {
    if (!('from' in op) || typeof op.from !== 'string') {
      errors.push(`Operation '${op.op}' requires a 'from' path`);
    } else if (!validatePath(op.from)) {
      errors.push(`Invalid 'from' JSON Pointer path: '${op.from}'`);
    }
  }

  return {
    valid: errors.length === 0,
    error: errors.length > 0 ? errors[0] : undefined,
    errors: errors.length > 0 ? errors : undefined,
  };
}

/**
 * Validate an array of patch operations
 */
export function validatePatch(patch: AQEJsonPatchOperation[]): ValidationResult {
  const allErrors: string[] = [];

  for (let i = 0; i < patch.length; i++) {
    const result = validateOperation(patch[i]);
    if (!result.valid && result.errors) {
      for (const error of result.errors) {
        allErrors.push(`Operation ${i}: ${error}`);
      }
    }
  }

  return {
    valid: allErrors.length === 0,
    error: allErrors.length > 0 ? allErrors[0] : undefined,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}

/**
 * Check RFC 6902 compliance of a patch
 */
export function checkCompliance(patch: AQEJsonPatchOperation[]): ComplianceResult {
  const issues: ComplianceIssue[] = [];

  for (let i = 0; i < patch.length; i++) {
    const op = patch[i];

    // Check operation type (RFC 6902 Section 4)
    if (!VALID_OPERATIONS.includes(op.op)) {
      issues.push({
        type: 'invalid_op',
        operationIndex: i,
        message: `Invalid operation '${op.op}'. RFC 6902 defines: add, remove, replace, move, copy, test`,
        rfcSection: '4',
      });
    }

    // Check path (RFC 6902 Section 4, RFC 6901)
    if (typeof op.path !== 'string') {
      issues.push({
        type: 'missing_path',
        operationIndex: i,
        message: 'Missing required \'path\' member',
        rfcSection: '4',
      });
    } else if (!validatePath(op.path)) {
      issues.push({
        type: 'invalid_path',
        operationIndex: i,
        message: `Invalid JSON Pointer: '${op.path}'`,
        rfcSection: '4 (referencing RFC 6901)',
      });
    }

    // Check value requirement (RFC 6902 Sections 4.1, 4.3, 4.6)
    if (VALUE_REQUIRED_OPS.includes(op.op) && !('value' in op)) {
      issues.push({
        type: 'missing_value',
        operationIndex: i,
        message: `Operation '${op.op}' requires 'value' member`,
        rfcSection: op.op === 'add' ? '4.1' : op.op === 'replace' ? '4.3' : '4.6',
      });
    }

    // Check from requirement (RFC 6902 Sections 4.4, 4.5)
    if (FROM_REQUIRED_OPS.includes(op.op)) {
      if (!('from' in op) || typeof op.from !== 'string') {
        issues.push({
          type: 'missing_from',
          operationIndex: i,
          message: `Operation '${op.op}' requires 'from' member`,
          rfcSection: op.op === 'move' ? '4.4' : '4.5',
        });
      } else if (!validatePath(op.from)) {
        issues.push({
          type: 'invalid_from',
          operationIndex: i,
          message: `Invalid 'from' JSON Pointer: '${op.from}'`,
          rfcSection: op.op === 'move' ? '4.4' : '4.5',
        });
      }
    }
  }

  return {
    compliant: issues.length === 0,
    issues,
  };
}

/**
 * Validate compliance and throw if not compliant
 */
export function ensureCompliance(patch: AQEJsonPatchOperation[]): void {
  const result = checkCompliance(patch);
  if (!result.compliant) {
    const messages = result.issues.map((i) => `[Op ${i.operationIndex}] ${i.message}`);
    throw new JsonPatchError(
      `Patch is not RFC 6902 compliant: ${messages.join('; ')}`,
      'COMPLIANCE_FAILED',
      { issues: result.issues }
    );
  }
}

// ============================================================================
// Patch Application
// ============================================================================

/**
 * Convert AQE patch operations to fast-json-patch format
 */
function toFastJsonPatchOperations(patch: AQEJsonPatchOperation[]): Operation[] {
  return patch.map((op) => {
    const result: Operation = {
      op: op.op,
      path: op.path,
    } as Operation;

    if ('value' in op) {
      (result as { value: unknown }).value = op.value;
    }
    if ('from' in op && op.from !== undefined) {
      (result as { from: string }).from = op.from;
    }

    return result;
  });
}

/**
 * Apply a single patch operation to a document
 * Returns a new document (immutable)
 */
export function applyOperation(
  document: Record<string, unknown>,
  op: AQEJsonPatchOperation
): Record<string, unknown> {
  // Validate first
  const validation = validateOperation(op);
  if (!validation.valid) {
    throw new JsonPatchError(
      validation.error ?? 'Invalid operation',
      'VALIDATION_FAILED',
      { operation: op }
    );
  }

  // Deep clone to avoid mutation
  const cloned = structuredClone(document);

  try {
    const result = fastJsonPatch.applyOperation(cloned, toFastJsonPatchOperations([op])[0], true, true);
    return result.newDocument as Record<string, unknown>;
  } catch (error) {
    throw JsonPatchError.fromFastJsonPatch(error, 0);
  }
}

/**
 * Apply a JSON Patch to a document
 * Returns result with success status and either new document or error info
 */
export function applyPatch(
  document: Record<string, unknown>,
  patch: AQEJsonPatchOperation[]
): PatchResult {
  // Validate first
  const validation = validatePatch(patch);
  if (!validation.valid) {
    return {
      success: false,
      document,
      error: validation.error,
      validationErrors: validation.errors,
    };
  }

  // Check compliance
  const compliance = checkCompliance(patch);
  if (!compliance.compliant) {
    const messages = compliance.issues.map((i) => `[Op ${i.operationIndex}] ${i.message}`);
    return {
      success: false,
      document,
      error: `RFC 6902 compliance error: ${messages[0]}`,
      validationErrors: messages,
    };
  }

  // Deep clone to avoid mutation
  const cloned = structuredClone(document);

  try {
    const operations = toFastJsonPatchOperations(patch);
    const result = fastJsonPatch.applyPatch(cloned, operations, true, true);

    return {
      success: true,
      document: result.newDocument as Record<string, unknown>,
    };
  } catch (error) {
    const message = toErrorMessage(error);
    // Try to extract operation index from error message
    const indexMatch = message.match(/Operation resulted in error.*index (\d+)/);
    const failedIndex = indexMatch ? parseInt(indexMatch[1], 10) : undefined;

    return {
      success: false,
      document, // Return original document (rollback)
      error: message,
      failedOperationIndex: failedIndex,
    };
  }
}

/**
 * Apply a JSON Patch atomically with automatic rollback on failure
 * Returns the new document if successful, throws on error
 */
export function applyPatchAtomic(
  document: Record<string, unknown>,
  patch: AQEJsonPatchOperation[]
): Record<string, unknown> {
  const result = applyPatch(document, patch);
  if (!result.success) {
    throw new JsonPatchError(
      result.error ?? 'Patch application failed',
      'APPLICATION_FAILED',
      { failedOperationIndex: result.failedOperationIndex }
    );
  }
  return result.document;
}

/**
 * Validate a patch against a document (dry run)
 * Returns true if the patch would apply successfully
 */
export function validate(
  document: Record<string, unknown>,
  patch: AQEJsonPatchOperation[]
): boolean {
  // First validate syntax
  const syntaxValidation = validatePatch(patch);
  if (!syntaxValidation.valid) {
    return false;
  }

  // Check compliance
  const compliance = checkCompliance(patch);
  if (!compliance.compliant) {
    return false;
  }

  // Try to apply (on a clone)
  const cloned = structuredClone(document);
  try {
    const operations = toFastJsonPatchOperations(patch);
    fastJsonPatch.applyPatch(cloned, operations, true, true);
    return true;
  } catch {
    return false;
  }
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
 * Uses fast-json-patch's compare function for optimal diff generation
 */
export function computeDiff(
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>,
  config: DiffConfig = {}
): AQEJsonPatchOperation[] {
  const { maxDepth = Infinity, invertible = false } = config;

  // Use fast-json-patch compare for optimal diff generation
  // It automatically detects moves and generates minimal patches
  const operations = fastJsonPatch.compare(oldState, newState);

  // Convert to AQE format
  let result = operations.map((op): AQEJsonPatchOperation => {
    const baseOp: AQEJsonPatchOperation = {
      op: op.op as AQEJsonPatchOperation['op'],
      path: op.path,
    };

    if ('value' in op) {
      return { ...baseOp, value: op.value };
    }
    if ('from' in op) {
      return { ...baseOp, from: op.from };
    }
    return baseOp;
  });

  // Apply maxDepth filtering if specified
  if (maxDepth < Infinity) {
    result = applyMaxDepthFilter(oldState, newState, result, maxDepth);
  }

  // Generate invertible patch if requested
  if (invertible && config.generateTestOps) {
    result = addTestOperations(oldState, result);
  }

  return result;
}

/**
 * Apply max depth filtering - replace deep nested changes with higher-level replaces
 */
function applyMaxDepthFilter(
  oldState: Record<string, unknown>,
  newState: Record<string, unknown>,
  operations: AQEJsonPatchOperation[],
  maxDepth: number
): AQEJsonPatchOperation[] {
  const replacedPaths = new Set<string>();
  const filtered: AQEJsonPatchOperation[] = [];

  for (const op of operations) {
    const depth = op.path.split('/').length - 1;

    if (depth > maxDepth) {
      // Find the path at maxDepth
      const tokens = parsePath(op.path);
      const truncatedTokens = tokens.slice(0, maxDepth);
      const truncatedPath = buildPath(truncatedTokens);

      // Only add one replace operation per truncated path
      if (!replacedPaths.has(truncatedPath)) {
        replacedPaths.add(truncatedPath);
        const newValue = getValueAtPath(newState, truncatedPath);
        filtered.push({ op: 'replace', path: truncatedPath, value: newValue });
      }
    } else {
      filtered.push(op);
    }
  }

  return filtered;
}

/**
 * Add test operations before each modification for invertibility
 */
function addTestOperations(
  document: Record<string, unknown>,
  operations: AQEJsonPatchOperation[]
): AQEJsonPatchOperation[] {
  const result: AQEJsonPatchOperation[] = [];

  for (const op of operations) {
    if (op.op === 'replace' || op.op === 'remove') {
      const currentValue = getValueAtPath(document, op.path);
      result.push({ op: 'test', path: op.path, value: currentValue });
    }
    result.push(op);
  }

  return result;
}

/**
 * Generate an observer for watching document changes
 * Returns a function to call when you want to generate the patch
 */
export function observe<T extends object>(
  document: T
): { observer: fastJsonPatch.Observer<object>; generate: () => AQEJsonPatchOperation[] } {
  // Cast to object to satisfy fast-json-patch's generic constraint
  const observer = fastJsonPatch.observe(document as object);

  return {
    observer,
    generate: () => {
      const ops = fastJsonPatch.generate(observer);
      return ops.map((op): AQEJsonPatchOperation => ({
        op: op.op as AQEJsonPatchOperation['op'],
        path: op.path,
        ...('value' in op ? { value: op.value } : {}),
        ...('from' in op ? { from: op.from } : {}),
      }));
    },
  };
}

/**
 * Unobserve a document (cleanup)
 */
export function unobserve<T extends object>(
  document: T,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  observer: any
): void {
  fastJsonPatch.unobserve(document, observer);
}

// ============================================================================
// Operation Factories
// ============================================================================

/**
 * Create a test operation to validate state before applying patches
 */
export function createTestOperation(
  path: string,
  value: unknown
): AQEJsonPatchOperation {
  return { op: 'test', path, value };
}

/**
 * Create an add operation
 */
export function createAddOperation(
  path: string,
  value: unknown
): AQEJsonPatchOperation {
  return { op: 'add', path, value };
}

/**
 * Create a remove operation
 */
export function createRemoveOperation(path: string): AQEJsonPatchOperation {
  return { op: 'remove', path };
}

/**
 * Create a replace operation
 */
export function createReplaceOperation(
  path: string,
  value: unknown
): AQEJsonPatchOperation {
  return { op: 'replace', path, value };
}

/**
 * Create a move operation
 */
export function createMoveOperation(
  from: string,
  path: string
): AQEJsonPatchOperation {
  return { op: 'move', from, path };
}

/**
 * Create a copy operation
 */
export function createCopyOperation(
  from: string,
  path: string
): AQEJsonPatchOperation {
  return { op: 'copy', from, path };
}

// ============================================================================
// Utility Exports
// ============================================================================

/**
 * Re-export fast-json-patch internals for advanced usage
 */
export const fastJsonPatchLib = {
  compare: fastJsonPatch.compare,
  generate: fastJsonPatch.generate,
  observe: fastJsonPatch.observe,
  unobserve: fastJsonPatch.unobserve,
  applyPatch: fastJsonPatch.applyPatch,
  applyOperation: fastJsonPatch.applyOperation,
  validate: fastJsonPatch.validate,
  getValueByPointer: fastJsonPatch.getValueByPointer,
  escapePathComponent: fastJsonPatch.escapePathComponent,
  unescapePathComponent: fastJsonPatch.unescapePathComponent,
};

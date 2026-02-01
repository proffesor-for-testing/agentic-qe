/**
 * JSON Pointer Resolver (RFC 6901)
 *
 * Implements RFC 6901 JSON Pointer specification for resolving,
 * setting, and manipulating data within nested objects.
 *
 * @see https://www.rfc-editor.org/rfc/rfc6901
 * @module adapters/a2ui/data/json-pointer-resolver
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Error thrown for invalid JSON Pointer operations
 */
export class JsonPointerError extends Error {
  constructor(
    message: string,
    public readonly pointer: string,
    public readonly code: JsonPointerErrorCode
  ) {
    super(message);
    this.name = 'JsonPointerError';
  }
}

/**
 * JSON Pointer error codes
 */
export type JsonPointerErrorCode =
  | 'INVALID_POINTER_FORMAT'
  | 'INVALID_ARRAY_INDEX'
  | 'PATH_NOT_FOUND'
  | 'INVALID_ESCAPE_SEQUENCE'
  | 'CANNOT_SET_ON_PRIMITIVE';

/**
 * Result of a JSON Pointer resolution
 */
export interface ResolveResult<T> {
  /** Whether the resolution was successful */
  readonly found: boolean;
  /** The resolved value (undefined if not found) */
  readonly value: T | undefined;
  /** The parent object containing the final segment */
  readonly parent?: unknown;
  /** The final segment key */
  readonly key?: string | number;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Escape a JSON Pointer segment according to RFC 6901
 *
 * ~ -> ~0
 * / -> ~1
 *
 * @param segment - The segment to escape
 * @returns Escaped segment
 */
export function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Unescape a JSON Pointer segment according to RFC 6901
 *
 * ~0 -> ~
 * ~1 -> /
 *
 * @param segment - The escaped segment
 * @returns Unescaped segment
 */
export function unescapeSegment(segment: string): string {
  // Must process ~1 before ~0 to avoid double-unescaping
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Parse a JSON Pointer string into path segments
 *
 * @param pointer - JSON Pointer string (must start with '/' or be empty)
 * @returns Array of path segments
 * @throws {JsonPointerError} If pointer format is invalid
 *
 * @example
 * parseJsonPointer('/metrics/coverage/line') -> ['metrics', 'coverage', 'line']
 * parseJsonPointer('/users/0/name') -> ['users', '0', 'name']
 * parseJsonPointer('') -> []
 */
export function parseJsonPointer(pointer: string): string[] {
  // Empty pointer refers to the root document
  if (pointer === '') {
    return [];
  }

  // Non-empty pointer must start with '/'
  if (!pointer.startsWith('/')) {
    throw new JsonPointerError(
      `JSON Pointer must start with '/' or be empty, got: "${pointer}"`,
      pointer,
      'INVALID_POINTER_FORMAT'
    );
  }

  // Split and unescape segments (skip the first empty segment from split)
  const segments = pointer.slice(1).split('/');
  return segments.map(unescapeSegment);
}

/**
 * Build a JSON Pointer string from path segments
 *
 * @param segments - Array of path segments
 * @returns JSON Pointer string
 *
 * @example
 * buildJsonPointer(['metrics', 'coverage']) -> '/metrics/coverage'
 * buildJsonPointer([]) -> ''
 */
export function buildJsonPointer(segments: string[]): string {
  if (segments.length === 0) {
    return '';
  }
  return '/' + segments.map(escapeSegment).join('/');
}

/**
 * Validate a JSON Pointer string format
 *
 * @param pointer - String to validate
 * @returns True if valid JSON Pointer format
 */
export function isValidPointer(pointer: string): boolean {
  if (pointer === '') {
    return true;
  }

  if (!pointer.startsWith('/')) {
    return false;
  }

  // Check for invalid escape sequences
  // Valid: ~0 and ~1, Invalid: ~ followed by anything else
  const invalidEscapePattern = /~(?![01])/;
  return !invalidEscapePattern.test(pointer);
}

/**
 * Resolve a JSON Pointer against a data object
 *
 * @param data - The data object to resolve against
 * @param pointer - JSON Pointer string
 * @returns The resolved value, or undefined if not found
 *
 * @example
 * const data = { metrics: { coverage: { line: 85 } } };
 * resolvePointer(data, '/metrics/coverage/line') -> 85
 * resolvePointer(data, '/metrics/unknown') -> undefined
 */
export function resolvePointer<T = unknown>(
  data: unknown,
  pointer: string
): T | undefined {
  const result = resolvePointerWithInfo<T>(data, pointer);
  return result.value;
}

/**
 * Resolve a JSON Pointer with additional information about the resolution
 *
 * @param data - The data object to resolve against
 * @param pointer - JSON Pointer string
 * @returns Resolution result with found flag, value, parent, and key
 */
export function resolvePointerWithInfo<T = unknown>(
  data: unknown,
  pointer: string
): ResolveResult<T> {
  // Validate pointer format
  if (!isValidPointer(pointer)) {
    return { found: false, value: undefined };
  }

  const segments = parseJsonPointer(pointer);

  // Empty pointer returns the root
  if (segments.length === 0) {
    return { found: true, value: data as T };
  }

  let current: unknown = data;
  let parent: unknown = undefined;
  let lastKey: string | number | undefined = undefined;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Cannot navigate into null or primitives
    if (current === null || current === undefined) {
      return { found: false, value: undefined };
    }

    if (typeof current !== 'object') {
      return { found: false, value: undefined };
    }

    parent = current;

    if (Array.isArray(current)) {
      // Array access - segment must be a valid array index or '-'
      if (segment === '-') {
        // '-' refers to the element after the last (for appending)
        // For resolution, treat as not found
        return { found: false, value: undefined };
      }

      const index = parseInt(segment, 10);
      if (isNaN(index) || index < 0 || index.toString() !== segment) {
        return { found: false, value: undefined };
      }

      if (index >= current.length) {
        return { found: false, value: undefined };
      }

      lastKey = index;
      current = current[index];
    } else {
      // Object access
      const obj = current as Record<string, unknown>;
      if (!(segment in obj)) {
        return { found: false, value: undefined };
      }

      lastKey = segment;
      current = obj[segment];
    }
  }

  return {
    found: true,
    value: current as T,
    parent,
    key: lastKey,
  };
}

/**
 * Check if a JSON Pointer path exists in the data
 *
 * @param data - The data object to check
 * @param pointer - JSON Pointer string
 * @returns True if the path exists
 */
export function pointerExists(data: unknown, pointer: string): boolean {
  const result = resolvePointerWithInfo(data, pointer);
  return result.found;
}

/**
 * Set a value at a JSON Pointer location
 *
 * @param data - The data object to modify (must be an object or array)
 * @param pointer - JSON Pointer string
 * @param value - The value to set
 * @throws {JsonPointerError} If the path cannot be set
 *
 * @example
 * const data = { metrics: { coverage: 75 } };
 * setAtPointer(data, '/metrics/coverage', 85);
 * // data.metrics.coverage is now 85
 */
export function setAtPointer(
  data: unknown,
  pointer: string,
  value: unknown
): void {
  if (!isValidPointer(pointer)) {
    throw new JsonPointerError(
      `Invalid JSON Pointer format: "${pointer}"`,
      pointer,
      'INVALID_POINTER_FORMAT'
    );
  }

  const segments = parseJsonPointer(pointer);

  // Cannot set the root
  if (segments.length === 0) {
    throw new JsonPointerError(
      'Cannot replace the root document',
      pointer,
      'CANNOT_SET_ON_PRIMITIVE'
    );
  }

  // Navigate to the parent
  let current: unknown = data;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];

    if (current === null || current === undefined || typeof current !== 'object') {
      throw new JsonPointerError(
        `Cannot navigate through non-object at segment "${segment}"`,
        pointer,
        'PATH_NOT_FOUND'
      );
    }

    if (Array.isArray(current)) {
      const index = parseInt(segment, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        throw new JsonPointerError(
          `Invalid array index "${segment}"`,
          pointer,
          'INVALID_ARRAY_INDEX'
        );
      }
      current = current[index];
    } else {
      const obj = current as Record<string, unknown>;
      if (!(segment in obj)) {
        // Auto-create intermediate objects
        obj[segment] = {};
      }
      current = obj[segment];
    }
  }

  // Set the final value
  const lastSegment = segments[segments.length - 1];

  if (current === null || current === undefined || typeof current !== 'object') {
    throw new JsonPointerError(
      'Cannot set property on non-object',
      pointer,
      'CANNOT_SET_ON_PRIMITIVE'
    );
  }

  if (Array.isArray(current)) {
    if (lastSegment === '-') {
      // '-' means append to array
      current.push(value);
    } else {
      const index = parseInt(lastSegment, 10);
      if (isNaN(index) || index < 0) {
        throw new JsonPointerError(
          `Invalid array index "${lastSegment}"`,
          pointer,
          'INVALID_ARRAY_INDEX'
        );
      }
      // Allow setting at index equal to length (append)
      if (index > current.length) {
        throw new JsonPointerError(
          `Array index ${index} out of bounds (length: ${current.length})`,
          pointer,
          'INVALID_ARRAY_INDEX'
        );
      }
      current[index] = value;
    }
  } else {
    (current as Record<string, unknown>)[lastSegment] = value;
  }
}

/**
 * Delete a value at a JSON Pointer location
 *
 * @param data - The data object to modify
 * @param pointer - JSON Pointer string
 * @returns True if the value was deleted, false if it didn't exist
 */
export function deleteAtPointer(data: unknown, pointer: string): boolean {
  if (!isValidPointer(pointer)) {
    return false;
  }

  const segments = parseJsonPointer(pointer);

  // Cannot delete the root
  if (segments.length === 0) {
    return false;
  }

  const result = resolvePointerWithInfo(data, buildJsonPointer(segments.slice(0, -1)));
  if (!result.found || result.value === null || typeof result.value !== 'object') {
    return false;
  }

  const lastSegment = segments[segments.length - 1];
  const parent = result.value;

  if (Array.isArray(parent)) {
    const index = parseInt(lastSegment, 10);
    if (isNaN(index) || index < 0 || index >= parent.length) {
      return false;
    }
    parent.splice(index, 1);
    return true;
  } else {
    const obj = parent as Record<string, unknown>;
    if (!(lastSegment in obj)) {
      return false;
    }
    delete obj[lastSegment];
    return true;
  }
}

/**
 * Get all paths in a data object as JSON Pointers
 *
 * @param data - The data object to traverse
 * @param maxDepth - Maximum depth to traverse (default: 10)
 * @returns Array of JSON Pointer strings
 */
export function getAllPaths(data: unknown, maxDepth: number = 10): string[] {
  const paths: string[] = [];

  function traverse(current: unknown, segments: string[], depth: number): void {
    // Add current path
    if (segments.length > 0) {
      paths.push(buildJsonPointer(segments));
    }

    // Stop at max depth or non-object
    if (depth >= maxDepth || current === null || typeof current !== 'object') {
      return;
    }

    if (Array.isArray(current)) {
      for (let i = 0; i < current.length; i++) {
        traverse(current[i], [...segments, i.toString()], depth + 1);
      }
    } else {
      for (const key of Object.keys(current as Record<string, unknown>)) {
        traverse(
          (current as Record<string, unknown>)[key],
          [...segments, key],
          depth + 1
        );
      }
    }
  }

  traverse(data, [], 0);
  return paths;
}

/**
 * Check if a pointer is a parent of another pointer
 *
 * @param parent - Potential parent pointer
 * @param child - Potential child pointer
 * @returns True if parent is an ancestor of child
 *
 * @example
 * isParentPointer('/metrics', '/metrics/coverage') -> true
 * isParentPointer('/metrics/coverage', '/metrics') -> false
 */
export function isParentPointer(parent: string, child: string): boolean {
  if (parent === '') {
    return child !== '';
  }

  if (!child.startsWith(parent)) {
    return false;
  }

  // Must be followed by '/' or be exact match
  const remaining = child.slice(parent.length);
  return remaining.startsWith('/');
}

/**
 * Get the parent pointer of a given pointer
 *
 * @param pointer - JSON Pointer string
 * @returns Parent pointer, or undefined for root
 */
export function getParentPointer(pointer: string): string | undefined {
  const segments = parseJsonPointer(pointer);
  if (segments.length === 0) {
    return undefined;
  }
  return buildJsonPointer(segments.slice(0, -1));
}

/**
 * Get the last segment (key) of a pointer
 *
 * @param pointer - JSON Pointer string
 * @returns The last segment, or undefined for root
 */
export function getPointerKey(pointer: string): string | undefined {
  const segments = parseJsonPointer(pointer);
  if (segments.length === 0) {
    return undefined;
  }
  return segments[segments.length - 1];
}

/**
 * Join two pointers together
 *
 * @param base - Base pointer
 * @param relative - Relative pointer to append
 * @returns Combined pointer
 */
export function joinPointers(base: string, relative: string): string {
  const baseSegments = parseJsonPointer(base);
  const relativeSegments = parseJsonPointer(relative);
  return buildJsonPointer([...baseSegments, ...relativeSegments]);
}

/**
 * Create a relative pointer from an absolute pointer to another
 *
 * @param from - Starting pointer
 * @param to - Target pointer
 * @returns Relative segments needed to go from 'from' to 'to'
 */
export function getRelativePath(from: string, to: string): string[] {
  const fromSegments = parseJsonPointer(from);
  const toSegments = parseJsonPointer(to);

  // Find common prefix
  let commonLength = 0;
  while (
    commonLength < fromSegments.length &&
    commonLength < toSegments.length &&
    fromSegments[commonLength] === toSegments[commonLength]
  ) {
    commonLength++;
  }

  return toSegments.slice(commonLength);
}

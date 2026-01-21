/**
 * Secure JSON Parsing Utilities
 *
 * SEC-001: Prevents prototype pollution attacks via __proto__, constructor, prototype keys.
 * Uses secure-json-parse with protoAction and constructorAction set to 'remove'.
 */

import sjson from 'secure-json-parse';

/**
 * Safely parse JSON with prototype pollution protection.
 * SEC-001: Removes __proto__, constructor, prototype keys to prevent pollution attacks.
 *
 * @param json - The JSON string to parse
 * @returns The parsed object with dangerous keys removed
 * @throws Error if the JSON is invalid
 *
 * @example
 * ```typescript
 * // Normal usage
 * const data = safeJsonParse('{"name": "test", "count": 42}');
 *
 * // Prototype pollution attempt is neutralized
 * const malicious = safeJsonParse('{"__proto__": {"polluted": true}}');
 * // Result: {} - __proto__ key is removed
 * // Object.prototype.polluted remains undefined
 * ```
 */
export function safeJsonParse<T = unknown>(json: string): T {
  return sjson.parse(json, undefined, {
    protoAction: 'remove',
    constructorAction: 'remove',
  });
}

/**
 * Parse JSON from a CLI option with error handling.
 * Provides user-friendly error messages for CLI usage.
 *
 * @param json - The JSON string from CLI option
 * @param optionName - The name of the CLI option (for error messages)
 * @returns The parsed object
 * @throws Error with user-friendly message if JSON is invalid
 *
 * @example
 * ```typescript
 * // In CLI action handler:
 * const params = parseJsonOption(options.params, 'params');
 * const payload = parseJsonOption(options.payload, 'payload');
 * ```
 */
export function parseJsonOption<T = Record<string, unknown>>(
  json: string,
  optionName: string
): T {
  try {
    return safeJsonParse<T>(json);
  } catch (error) {
    throw new Error(
      `Invalid JSON in --${optionName}: ${error instanceof Error ? error.message : 'Parse error'}`
    );
  }
}

/**
 * Parse JSON from a file with prototype pollution protection.
 * Useful for parsing configuration files.
 *
 * @param content - The raw file content (JSON string)
 * @param filePath - The file path (for error messages)
 * @returns The parsed object with dangerous keys removed
 * @throws Error with user-friendly message if JSON is invalid
 */
export function parseJsonFile<T = Record<string, unknown>>(
  content: string,
  filePath: string
): T {
  try {
    return safeJsonParse<T>(content);
  } catch (error) {
    throw new Error(
      `Invalid JSON in file ${filePath}: ${error instanceof Error ? error.message : 'Parse error'}`
    );
  }
}

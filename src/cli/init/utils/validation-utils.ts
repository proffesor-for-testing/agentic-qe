/**
 * Validation utilities module
 *
 * Input validation and parsing utilities:
 * - Numeric range validation
 * - Enum validation
 * - Comma-separated string parsing
 * - Package version retrieval
 *
 * @module cli/init/utils/validation-utils
 */

/**
 * Validate that a value is within a numeric range
 *
 * @param value - Value to validate
 * @param min - Minimum allowed value (inclusive)
 * @param max - Maximum allowed value (inclusive)
 * @param fieldName - Name of field for error message
 * @throws Error if value is out of range
 */
export function validateRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): void {
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }
}

/**
 * Validate that a value is one of allowed options
 *
 * @param value - Value to validate
 * @param allowedValues - Array of allowed values
 * @param fieldName - Name of field for error message
 * @throws Error if value is not in allowed values
 */
export function validateEnum<T>(
  value: T,
  allowedValues: T[],
  fieldName: string
): void {
  if (!allowedValues.includes(value)) {
    throw new Error(
      `Invalid ${fieldName}. Must be one of: ${allowedValues.join(', ')}`
    );
  }
}

/**
 * Parse comma-separated string into trimmed array
 *
 * @param input - Comma-separated string
 * @returns Array of trimmed strings
 */
export function parseCommaSeparated(input: string): string[] {
  return input.split(',').map(item => item.trim()).filter(item => item.length > 0);
}

/**
 * Get the current package version
 *
 * @returns Package version from package.json
 */
export function getPackageVersion(): string {
  try {
    const packageJson = require('../../../../package.json');
    return packageJson.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

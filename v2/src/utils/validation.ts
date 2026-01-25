import { SecureRandom } from './SecureRandom.js';

/**
 * Validation Utilities for Chaos Engineering
 */

/**
 * Validate URL format
 */
export function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate unique ID with prefix
 */
export function generateId(prefix: string): string {
  const timestamp = Date.now();
  const random = SecureRandom.randomFloat().toString(36).substring(2, 15);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Validate percentage (0-100)
 */
export function validatePercentage(value: number): boolean {
  return value >= 0 && value <= 100;
}

/**
 * Validate rate (0-1)
 */
export function validateRate(value: number): boolean {
  return value >= 0 && value <= 1;
}

/**
 * Validate positive number
 */
export function validatePositive(value: number): boolean {
  return value > 0;
}

/**
 * Validate HTTP status code
 */
export function validateHttpStatusCode(code: number): boolean {
  return code >= 100 && code < 600;
}

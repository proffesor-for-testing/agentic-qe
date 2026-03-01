/**
 * Agentic QE v3 - MCP Security: Crypto Validator
 * Implements the Strategy Pattern for cryptographic security operations
 */

import { createHash, timingSafeEqual, randomBytes } from 'crypto';
import { ICryptoValidationStrategy, RiskLevel } from './interfaces';

// ============================================================================
// Crypto Validator Implementation
// ============================================================================

/**
 * Crypto Validator Strategy
 * Provides timing-safe comparisons and secure cryptographic operations
 */
export class CryptoValidator implements ICryptoValidationStrategy {
  public readonly name = 'crypto-security';

  /**
   * Get the primary risk level this validator addresses
   */
  public getRiskLevel(): RiskLevel {
    return 'critical';
  }

  /**
   * Perform a timing-safe string comparison
   * Prevents timing attacks by ensuring constant-time comparison
   */
  public timingSafeCompare(a: string, b: string): boolean {
    // Pad shorter string to prevent length-based timing attacks
    const maxLen = Math.max(a.length, b.length);
    const paddedA = a.padEnd(maxLen, '\0');
    const paddedB = b.padEnd(maxLen, '\0');

    try {
      return timingSafeEqual(Buffer.from(paddedA), Buffer.from(paddedB));
    } catch {
      return false;
    }
  }

  /**
   * Timing-safe comparison for hashed values
   * Hashes the input value and compares against expected hash
   */
  public timingSafeHashCompare(value: string, expectedHash: string): boolean {
    const hash = createHash('sha256').update(value).digest('hex');
    return this.timingSafeCompare(hash, expectedHash);
  }

  /**
   * Generate a secure random token
   * Uses cryptographically secure random bytes
   */
  public generateSecureToken(length = 32): string {
    return randomBytes(length)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Hash a value securely using SHA-256
   */
  public secureHash(value: string, salt?: string): string {
    const data = salt ? `${salt}:${value}` : value;
    return createHash('sha256').update(data).digest('hex');
  }
}

// ============================================================================
// Standalone Functions (for backward compatibility)
// ============================================================================

const defaultValidator = new CryptoValidator();

export const timingSafeCompare = (a: string, b: string): boolean =>
  defaultValidator.timingSafeCompare(a, b);

export const timingSafeHashCompare = (value: string, expectedHash: string): boolean =>
  defaultValidator.timingSafeHashCompare(value, expectedHash);

export const generateSecureToken = (length?: number): string =>
  defaultValidator.generateSecureToken(length);

export const secureHash = (value: string, salt?: string): string =>
  defaultValidator.secureHash(value, salt);

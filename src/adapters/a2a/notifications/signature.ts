/**
 * A2A Webhook Signature Utilities
 *
 * Provides HMAC-SHA256 signature generation and verification for webhook payloads.
 * Follows the pattern: X-A2A-Signature: t={timestamp},v1={hmac}
 *
 * @module adapters/a2a/notifications/signature
 * @see https://a2a-protocol.org/latest/specification/
 */

import { createHmac, timingSafeEqual } from 'crypto';

// ============================================================================
// Constants
// ============================================================================

/**
 * Header name for A2A webhook signatures
 */
export const SIGNATURE_HEADER = 'X-A2A-Signature';

/**
 * Current signature version
 */
export const SIGNATURE_VERSION = 'v1';

/**
 * Default maximum age for signature validation (5 minutes)
 */
export const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * Minimum timestamp value to prevent integer overflow attacks
 */
export const MIN_TIMESTAMP = 1704067200000; // Jan 1, 2024

// ============================================================================
// Types
// ============================================================================

/**
 * Parsed signature components
 */
export interface ParsedSignature {
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Version 1 signature hash */
  v1: string;
}

/**
 * Signature verification result
 */
export interface VerificationResult {
  /** Whether the signature is valid */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Timestamp from the signature */
  timestamp?: number;
  /** Age of the signature in milliseconds */
  ageMs?: number;
}

// ============================================================================
// Signature Generation
// ============================================================================

/**
 * Generate an HMAC-SHA256 signature for a webhook payload
 *
 * @param payload - The JSON string payload to sign
 * @param secret - The shared secret key
 * @param timestamp - Unix timestamp in milliseconds
 * @returns The hex-encoded HMAC-SHA256 signature
 *
 * @example
 * ```typescript
 * const signature = generateSignature(
 *   JSON.stringify({ event: 'task.completed', taskId: '123' }),
 *   'webhook-secret-key',
 *   Date.now()
 * );
 * // Returns: 'a1b2c3d4e5f6...' (64 character hex string)
 * ```
 */
export function generateSignature(
  payload: string,
  secret: string,
  timestamp: number
): string {
  if (!payload) {
    throw new Error('Payload is required for signature generation');
  }
  if (!secret) {
    throw new Error('Secret is required for signature generation');
  }
  if (timestamp < MIN_TIMESTAMP) {
    throw new Error(`Invalid timestamp: must be after ${new Date(MIN_TIMESTAMP).toISOString()}`);
  }

  // Create signed payload: timestamp.payload
  const signedPayload = `${timestamp}.${payload}`;

  // Generate HMAC-SHA256
  const hmac = createHmac('sha256', secret);
  hmac.update(signedPayload, 'utf8');

  return hmac.digest('hex');
}

/**
 * Generate the complete signature header value
 *
 * @param payload - The JSON string payload to sign
 * @param secret - The shared secret key
 * @param timestamp - Optional timestamp (defaults to current time)
 * @returns The complete header value in format: t={timestamp},v1={signature}
 *
 * @example
 * ```typescript
 * const headerValue = generateSignatureHeader(
 *   JSON.stringify({ event: 'task.completed' }),
 *   'webhook-secret-key'
 * );
 * // Returns: 't=1704067200000,v1=a1b2c3d4e5f6...'
 * ```
 */
export function generateSignatureHeader(
  payload: string,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp ?? Date.now();
  const signature = generateSignature(payload, secret, ts);

  return `t=${ts},${SIGNATURE_VERSION}=${signature}`;
}

// ============================================================================
// Signature Verification
// ============================================================================

/**
 * Parse a signature header value into its components
 *
 * @param header - The signature header value
 * @returns Parsed signature components or null if invalid format
 *
 * @example
 * ```typescript
 * const parsed = parseSignatureHeader('t=1704067200000,v1=abc123...');
 * // Returns: { timestamp: 1704067200000, v1: 'abc123...' }
 * ```
 */
export function parseSignatureHeader(header: string): ParsedSignature | null {
  if (!header || typeof header !== 'string') {
    return null;
  }

  const parts = header.split(',');
  let timestamp: number | undefined;
  let v1: string | undefined;

  for (const part of parts) {
    const [key, ...valueParts] = part.split('=');
    const value = valueParts.join('='); // Handle '=' in value

    if (key === 't') {
      timestamp = parseInt(value, 10);
      if (isNaN(timestamp)) {
        return null;
      }
    } else if (key === 'v1') {
      v1 = value;
    }
  }

  if (timestamp === undefined || !v1) {
    return null;
  }

  return { timestamp, v1 };
}

/**
 * Verify a webhook signature using timing-safe comparison
 *
 * @param payload - The raw JSON string payload
 * @param signature - The signature header value to verify
 * @param secret - The shared secret key
 * @param maxAge - Maximum age of signature in milliseconds (default: 5 minutes)
 * @returns Verification result with validity status and any errors
 *
 * @example
 * ```typescript
 * const result = verifySignature(
 *   '{"event":"task.completed"}',
 *   't=1704067200000,v1=abc123...',
 *   'webhook-secret-key'
 * );
 *
 * if (result.valid) {
 *   console.log('Signature verified');
 * } else {
 *   console.error('Verification failed:', result.error);
 * }
 * ```
 */
export function verifySignature(
  payload: string,
  signature: string,
  secret: string,
  maxAge: number = DEFAULT_MAX_AGE_MS
): VerificationResult {
  // Parse the signature header
  const parsed = parseSignatureHeader(signature);
  if (!parsed) {
    return {
      valid: false,
      error: 'Invalid signature format: expected t={timestamp},v1={signature}',
    };
  }

  const { timestamp, v1: providedSignature } = parsed;

  // Check timestamp validity
  if (timestamp < MIN_TIMESTAMP) {
    return {
      valid: false,
      error: `Invalid timestamp: must be after ${new Date(MIN_TIMESTAMP).toISOString()}`,
      timestamp,
    };
  }

  // Check signature age
  const now = Date.now();
  const ageMs = now - timestamp;

  if (ageMs > maxAge) {
    return {
      valid: false,
      error: `Signature expired: age ${ageMs}ms exceeds maximum ${maxAge}ms`,
      timestamp,
      ageMs,
    };
  }

  // Check for future timestamps (allow 1 minute clock skew)
  if (ageMs < -60000) {
    return {
      valid: false,
      error: 'Signature timestamp is too far in the future',
      timestamp,
      ageMs,
    };
  }

  // Generate expected signature
  let expectedSignature: string;
  try {
    expectedSignature = generateSignature(payload, secret, timestamp);
  } catch (error) {
    return {
      valid: false,
      error: `Failed to generate expected signature: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp,
      ageMs,
    };
  }

  // Timing-safe comparison to prevent timing attacks
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  // Length check (must be same length for timingSafeEqual)
  if (providedBuffer.length !== expectedBuffer.length) {
    return {
      valid: false,
      error: 'Signature mismatch',
      timestamp,
      ageMs,
    };
  }

  const valid = timingSafeEqual(providedBuffer, expectedBuffer);

  if (!valid) {
    return {
      valid: false,
      error: 'Signature mismatch',
      timestamp,
      ageMs,
    };
  }

  return {
    valid: true,
    timestamp,
    ageMs,
  };
}

/**
 * Simple boolean check for signature validity (convenience wrapper)
 *
 * @param payload - The raw JSON string payload
 * @param signature - The signature header value to verify
 * @param secret - The shared secret key
 * @param maxAge - Maximum age of signature in milliseconds
 * @returns true if signature is valid, false otherwise
 */
export function isValidSignature(
  payload: string,
  signature: string,
  secret: string,
  maxAge?: number
): boolean {
  return verifySignature(payload, signature, secret, maxAge).valid;
}

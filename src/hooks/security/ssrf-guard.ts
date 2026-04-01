/**
 * SSRF Guard for Hook URLs
 *
 * Blocks hooks from hitting private/internal IP ranges.
 * Validates both direct IP addresses and DNS-resolved addresses
 * to prevent DNS rebinding attacks.
 *
 * @module hooks/security/ssrf-guard
 * @see IMP-07 Hook Security Hardening
 */

import { isIP } from 'net';
import { lookup } from 'dns/promises';

const PRIVATE_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^fd[0-9a-f]{2}:/i,
];

export interface SsrfValidationResult {
  safe: boolean;
  reason?: string;
}

/**
 * Check if an IP address is in a private/reserved range.
 */
export function isPrivateIp(ip: string): boolean {
  return PRIVATE_RANGES.some(r => r.test(ip));
}

/**
 * Validate a hook URL for SSRF safety.
 * Blocks private IPs both as direct addresses and via DNS resolution.
 */
export async function validateHookUrl(url: string): Promise<SsrfValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: `Invalid URL: ${url}` };
  }

  // Strip IPv6 brackets — URL.hostname wraps IPv6 as "[::1]" but
  // isIP() and our regex patterns expect the bare address "::1".
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

  // Direct IP check
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { safe: false, reason: `Private IP blocked: ${hostname}` };
    }
    return { safe: true };
  }

  // DNS resolution check (prevents DNS rebinding)
  try {
    const resolved = await lookup(hostname);
    if (isPrivateIp(resolved.address)) {
      return { safe: false, reason: `DNS resolves to private IP: ${resolved.address}` };
    }
  } catch (err) {
    return { safe: false, reason: `DNS lookup failed for ${hostname}: ${(err as Error).message}` };
  }

  return { safe: true };
}

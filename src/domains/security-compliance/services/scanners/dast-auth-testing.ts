/**
 * Agentic QE v3 - DAST Authorization Testing
 * Authorization bypass and IDOR testing utilities
 */

import { v4 as uuidv4 } from 'uuid';
import type { Vulnerability, AuthCredentials } from './scanner-types.js';

// ============================================================================
// Authorization Testing
// ============================================================================

/**
 * Test for authorization bypass on protected endpoints
 */
export async function testAuthorizationBypass(
  parsedUrl: URL,
  authHeaders: Record<string, string>,
  crawledUrls: number,
  maxDepth: number,
  vulnerabilities: Vulnerability[]
): Promise<number> {
  const protectedEndpoints = [
    '/admin',
    '/dashboard',
    '/api/users',
    '/api/admin',
    '/settings',
    '/profile',
  ];

  for (const endpoint of protectedEndpoints) {
    if (crawledUrls >= maxDepth * 15) break;

    try {
      const testUrl = new URL(endpoint, parsedUrl.origin).toString();

      // Try with authentication
      const authResponse = await fetch(testUrl, {
        method: 'GET',
        headers: { ...authHeaders },
        signal: AbortSignal.timeout(5000),
      });

      if (authResponse.ok) {
        crawledUrls++;

        // Try without authentication
        const unauthResponse = await fetch(testUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });

        if (unauthResponse.ok && unauthResponse.status === 200) {
          const authText = await authResponse.text();
          const unauthText = await unauthResponse.text();

          if (authText.length > 100 && unauthText.length > 100 &&
              Math.abs(authText.length - unauthText.length) < authText.length * 0.1) {
            vulnerabilities.push({
              id: uuidv4(),
              title: 'Missing Authentication on Protected Endpoint',
              description: `Endpoint ${endpoint} is accessible without authentication`,
              severity: 'high',
              category: 'broken-auth',
              location: { file: testUrl },
              remediation: { description: 'Implement proper authentication checks', estimatedEffort: 'moderate', automatable: false },
              references: ['https://owasp.org/www-project-web-security-testing-guide/'],
            });
          }
        }
      }
    } catch {
      // Endpoint not accessible - expected
    }
  }

  return crawledUrls;
}

/**
 * Test for Insecure Direct Object References (IDOR)
 */
export async function testIDOR(
  parsedUrl: URL,
  authHeaders: Record<string, string>,
  crawledUrls: number,
  maxDepth: number,
  vulnerabilities: Vulnerability[]
): Promise<number> {
  const idorEndpoints = [
    '/api/users/1',
    '/api/users/2',
    '/api/orders/1',
    '/profile/1',
  ];

  for (const endpoint of idorEndpoints.slice(0, 2)) {
    if (crawledUrls >= maxDepth * 15) break;

    try {
      const testUrl = new URL(endpoint, parsedUrl.origin).toString();
      const response = await fetch(testUrl, {
        method: 'GET',
        headers: { ...authHeaders },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        crawledUrls++;
        const text = await response.text();

        if (text.includes('email') || text.includes('password') || text.includes('phone')) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Potential Insecure Direct Object Reference (IDOR)',
            description: `Endpoint ${endpoint} may expose other users' data`,
            severity: 'high',
            category: 'access-control',
            location: { file: testUrl },
            remediation: { description: 'Implement proper authorization checks for resource access', estimatedEffort: 'moderate', automatable: false },
            references: ['https://owasp.org/www-project-web-security-testing-guide/latest/4-Web_Application_Security_Testing/05-Authorization_Testing/04-Testing_for_Insecure_Direct_Object_References'],
          });
        }
      }
    } catch {
      // Endpoint not accessible
    }
  }

  return crawledUrls;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Validate authentication credentials
 */
export function validateCredentials(credentials: AuthCredentials): {
  valid: boolean;
  reason?: string;
} {
  switch (credentials.type) {
    case 'basic':
      if (!credentials.username || !credentials.password) {
        return { valid: false, reason: 'Basic auth requires username and password' };
      }
      break;
    case 'bearer':
    case 'oauth':
      if (!credentials.token) {
        return { valid: false, reason: 'Bearer/OAuth auth requires token' };
      }
      break;
    case 'cookie':
      if (!credentials.token) {
        return { valid: false, reason: 'Cookie auth requires session cookie' };
      }
      break;
  }
  return { valid: true };
}

/**
 * Build authentication headers
 */
export function buildAuthHeaders(credentials: AuthCredentials): Record<string, string> {
  const authHeaders: Record<string, string> = {};

  switch (credentials.type) {
    case 'basic':
      if (credentials.username && credentials.password) {
        const encoded = Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64');
        authHeaders['Authorization'] = `Basic ${encoded}`;
      }
      break;
    case 'bearer':
    case 'oauth':
      if (credentials.token) {
        authHeaders['Authorization'] = `Bearer ${credentials.token}`;
      }
      break;
    case 'cookie':
      if (credentials.token) {
        authHeaders['Cookie'] = credentials.token;
      }
      break;
  }

  return authHeaders;
}

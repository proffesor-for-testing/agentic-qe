/**
 * Agentic QE v3 - DAST Injection Testing
 * XSS and SQL injection testing utilities
 */

import { v4 as uuidv4 } from 'uuid';
import type { Vulnerability, DASTRequestFailure } from './scanner-types.js';
import { probe } from './dast-requests.js';

// ============================================================================
// Injection Testing
// ============================================================================

/**
 * Test for XSS vulnerabilities
 */
export async function testXSS(
  targetUrl: string,
  parsedUrl: URL,
  paramName: string,
  payloads: Array<{ payload: string; name: string }>,
  vulnerabilities: Vulnerability[],
  failures?: DASTRequestFailure[]
): Promise<void> {
  for (const xss of payloads) {
    const testParams = new URLSearchParams(parsedUrl.search);
    testParams.set(paramName, xss.payload);
    const testUrl = `${parsedUrl.origin}${parsedUrl.pathname}?${testParams.toString()}`;

    const response = await probe(testUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'AgenticQE-DAST-Scanner/3.0' },
      signal: AbortSignal.timeout(5000),
    }, failures);

    if (response?.ok) {
      const text = response.text;
      const escapedPayload = xss.payload
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');

      const hasUnescapedPayload = text.includes(xss.payload);
      const hasEscapedPayload = text.includes(escapedPayload);

      if (hasUnescapedPayload && !hasEscapedPayload) {
        vulnerabilities.push({
          id: uuidv4(),
          title: `Reflected XSS: ${xss.name}`,
          description: `Parameter '${paramName}' reflects unsanitized input`,
          severity: 'critical',
          category: 'xss',
          location: { file: targetUrl, snippet: `Parameter: ${paramName}, Payload: ${xss.payload.substring(0, 30)}...` },
          remediation: { description: 'HTML-encode all user input before rendering', estimatedEffort: 'moderate', automatable: false },
          references: ['https://owasp.org/www-community/attacks/xss/'],
        });
        break;
      }
    }
  }
}

/**
 * Test for SQL injection vulnerabilities
 */
export async function testSQLi(
  targetUrl: string,
  parsedUrl: URL,
  paramName: string,
  payloads: Array<{ payload: string; name: string }>,
  vulnerabilities: Vulnerability[],
  failures?: DASTRequestFailure[]
): Promise<void> {
  const sqlErrorPatterns = [
    /SQL syntax.*MySQL/i,
    /Warning.*mysql/i,
    /PostgreSQL.*ERROR/i,
    /ORA-\d{5}/i,
    /SQLite.*error/i,
    /SQLITE_ERROR/i,
    /unclosed quotation mark/i,
    /quoted string not properly terminated/i,
  ];

  for (const sqli of payloads) {
    const testParams = new URLSearchParams(parsedUrl.search);
    testParams.set(paramName, sqli.payload);
    const testUrl = `${parsedUrl.origin}${parsedUrl.pathname}?${testParams.toString()}`;

    // SQL errors often come back as HTTP 500: that body is analysed.
    const response = await probe(testUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'AgenticQE-DAST-Scanner/3.0' },
      signal: AbortSignal.timeout(5000),
    }, failures, { analyzeServerErrors: true });
    if (!response) continue;

    const text = response.text;

    for (const pattern of sqlErrorPatterns) {
      if (pattern.test(text)) {
        vulnerabilities.push({
          id: uuidv4(),
          title: `SQL Injection: ${sqli.name}`,
          description: `Parameter '${paramName}' appears vulnerable to SQL injection`,
          severity: 'critical',
          category: 'injection',
          location: { file: targetUrl, snippet: `Parameter: ${paramName}` },
          remediation: { description: 'Use parameterized queries or prepared statements', estimatedEffort: 'moderate', automatable: false },
          references: ['https://owasp.org/www-community/attacks/SQL_Injection'],
        });
        break;
      }
    }
  }
}

/**
 * Agentic QE v3 - Security Auditor DAST Scanner
 * Extracted from security-auditor.ts - Dynamic Application Security Testing
 */

import { LoggerFactory } from '../../../logging/index.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  Vulnerability,
  VulnerabilitySeverity,
  DASTResult,
  DASTRequestFailure,
} from '../interfaces.js';
import {
  assertScannableResponse,
  dastRequestFailure,
  parseDastTarget,
  probe,
  summarizeFailures,
} from './scanners/dast-requests.js';

// ============================================================================
// DAST Scanning
// ============================================================================

/**
 * Perform DAST scan using HTTP requests to test for vulnerabilities
 * Tests for common web vulnerabilities: XSS, SQL injection, security headers, etc.
 *
 * #1052: runAudit has no error channel for one phase, so a target that could
 * not be scanned is a result with status 'failed' and the reason, never an
 * empty result that reads as "no findings".
 */
const logger = LoggerFactory.create('security-compliance/security-auditor-dast');

export async function performDASTScan(targetUrl: string): Promise<DASTResult> {
  const scanId = uuidv4();
  const startTime = Date.now();
  const vulnerabilities: Vulnerability[] = [];
  const failedRequests: DASTRequestFailure[] = [];
  let crawledUrls = 0;

  const finish = (failure?: Error & { code?: string }): DASTResult => ({
    scanId,
    targetUrl,
    vulnerabilities: failure ? [] : vulnerabilities,
    summary: summarize(failure ? [] : vulnerabilities, Date.now() - startTime),
    crawledUrls,
    status: failure ? 'failed' : failedRequests.length > 0 ? 'incomplete' : 'complete',
    failedRequests,
    ...(failure ? { error: `${failure.code ? `${failure.code}: ` : ''}${failure.message}` }
      : failedRequests.length > 0 ? { error: summarizeFailures(failedRequests) } : {}),
  });

  try {
    const parsedUrl = parseDastTarget(targetUrl);

    // Perform HTTP request to check security headers and response characteristics
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'AgenticQE-SecurityScanner/3.0',
          'Accept': 'text/html,application/json,*/*',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
      await response.body?.cancel().catch(() => undefined);
      // The headers of a 401/403/407/408/429/5xx page are not the target's.
      assertScannableResponse(response.status);
    } catch (fetchError) {
      throw dastRequestFailure(fetchError);
    } finally {
      clearTimeout(timeoutId);
    }
    crawledUrls = 1;

    // Check security headers
    const headers = response.headers;

    // Check for missing security headers
    const securityHeaderChecks: Array<{
      header: string;
      title: string;
      description: string;
      severity: VulnerabilitySeverity;
      remediation: string;
    }> = [
      {
        header: 'strict-transport-security',
        title: 'Missing HTTP Strict Transport Security (HSTS)',
        description: 'HSTS header is missing, allowing downgrade attacks',
        severity: 'medium',
        remediation: 'Add Strict-Transport-Security header with appropriate max-age',
      },
      {
        header: 'x-content-type-options',
        title: 'Missing X-Content-Type-Options Header',
        description: 'X-Content-Type-Options header is missing, allowing MIME sniffing attacks',
        severity: 'low',
        remediation: 'Add X-Content-Type-Options: nosniff header',
      },
      {
        header: 'x-frame-options',
        title: 'Missing X-Frame-Options Header',
        description: 'X-Frame-Options header is missing, allowing clickjacking attacks',
        severity: 'medium',
        remediation: 'Add X-Frame-Options: DENY or SAMEORIGIN header',
      },
      {
        header: 'content-security-policy',
        title: 'Missing Content Security Policy',
        description: 'CSP header is missing, increasing XSS attack surface',
        severity: 'medium',
        remediation: 'Implement a Content-Security-Policy header',
      },
      {
        header: 'x-xss-protection',
        title: 'Missing X-XSS-Protection Header',
        description: 'X-XSS-Protection header is missing (legacy XSS filter)',
        severity: 'low',
        remediation: 'Add X-XSS-Protection: 1; mode=block header',
      },
    ];

    for (const check of securityHeaderChecks) {
      if (!headers.get(check.header)) {
        vulnerabilities.push({
          id: uuidv4(),
          title: check.title,
          description: check.description,
          severity: check.severity,
          category: 'security-misconfiguration',
          location: {
            file: targetUrl,
            snippet: `Response Headers: ${check.header} not present`,
          },
          remediation: {
            description: check.remediation,
            estimatedEffort: 'minor',
            automatable: true,
          },
          references: [
            'https://owasp.org/www-project-secure-headers/',
          ],
        });
      }
    }

    // Check for insecure cookies
    const cookies = headers.get('set-cookie');
    if (cookies) {
      if (!cookies.toLowerCase().includes('secure')) {
        vulnerabilities.push({
          id: uuidv4(),
          title: 'Cookie Without Secure Flag',
          description: 'Session cookie is set without the Secure flag',
          severity: 'medium',
          category: 'sensitive-data',
          location: { file: targetUrl, snippet: `Set-Cookie: ${cookies.substring(0, 50)}...` },
          remediation: { description: 'Add Secure flag to cookies', estimatedEffort: 'trivial', automatable: true },
          references: ['https://owasp.org/www-community/controls/SecureCookieAttribute'],
        });
      }
      if (!cookies.toLowerCase().includes('httponly')) {
        vulnerabilities.push({
          id: uuidv4(),
          title: 'Cookie Without HttpOnly Flag',
          description: 'Session cookie is set without the HttpOnly flag, making it accessible to JavaScript',
          severity: 'medium',
          category: 'sensitive-data',
          location: { file: targetUrl, snippet: `Set-Cookie: ${cookies.substring(0, 50)}...` },
          remediation: { description: 'Add HttpOnly flag to session cookies', estimatedEffort: 'trivial', automatable: true },
          references: ['https://owasp.org/www-community/HttpOnly'],
        });
      }
      if (!cookies.toLowerCase().includes('samesite')) {
        vulnerabilities.push({
          id: uuidv4(),
          title: 'Cookie Without SameSite Attribute',
          description: 'Cookie is set without the SameSite attribute, potentially vulnerable to CSRF',
          severity: 'low',
          category: 'broken-auth',
          location: { file: targetUrl, snippet: `Set-Cookie: ${cookies.substring(0, 50)}...` },
          remediation: { description: 'Add SameSite=Strict or SameSite=Lax to cookies', estimatedEffort: 'trivial', automatable: true },
          references: ['https://owasp.org/www-community/SameSite'],
        });
      }
    }

    // Check for server information disclosure
    const server = headers.get('server');
    if (server && /[0-9]+\.[0-9]+/.test(server)) {
      vulnerabilities.push({
        id: uuidv4(),
        title: 'Server Version Disclosure',
        description: `Server header reveals version information: ${server}`,
        severity: 'low',
        category: 'security-misconfiguration',
        location: { file: targetUrl, snippet: `Server: ${server}` },
        remediation: { description: 'Remove or obfuscate server version information', estimatedEffort: 'trivial', automatable: true },
        references: ['https://owasp.org/www-project-web-security-testing-guide/'],
      });
    }

    // Check for HTTPS
    if (parsedUrl.protocol === 'http:') {
      vulnerabilities.push({
        id: uuidv4(),
        title: 'Insecure HTTP Protocol',
        description: 'Target is using HTTP instead of HTTPS, exposing data in transit',
        severity: 'high',
        category: 'sensitive-data',
        location: { file: targetUrl },
        remediation: { description: 'Use HTTPS with valid TLS certificate', estimatedEffort: 'moderate', automatable: false },
        references: ['https://owasp.org/www-project-web-security-testing-guide/'],
      });
    }

    // Try common test endpoints for additional checks
    const testEndpoints = [
      { path: '/.git/config', vuln: 'Git Repository Exposed', severity: 'high' as VulnerabilitySeverity },
      { path: '/.env', vuln: 'Environment File Exposed', severity: 'critical' as VulnerabilitySeverity },
      { path: '/phpinfo.php', vuln: 'PHP Info Exposed', severity: 'medium' as VulnerabilitySeverity },
      { path: '/wp-config.php.bak', vuln: 'WordPress Config Backup Exposed', severity: 'critical' as VulnerabilitySeverity },
    ];

    for (const endpoint of testEndpoints) {
      // An unanswered probe is recorded, and leaves the scan incomplete.
      const testUrl = new URL(endpoint.path, parsedUrl.origin).toString();
      const testResponse = await probe(testUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      }, failedRequests);
      if (testResponse?.ok && testResponse.status === 200) {
        const text = testResponse.text;
        // Verify it's actually the sensitive content, not a custom 404
        if (text.length > 10 && !text.toLowerCase().includes('not found')) {
          crawledUrls++;
          vulnerabilities.push({
            id: uuidv4(),
            title: endpoint.vuln,
            description: `Sensitive file found at ${endpoint.path}`,
            severity: endpoint.severity,
            category: 'sensitive-data',
            location: { file: testUrl },
            remediation: { description: 'Remove or restrict access to sensitive files', estimatedEffort: 'trivial', automatable: true },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        }
      }
    }
  } catch (error) {
    // DAST_INVALID_TARGET, DAST_TLS_FAILED, DAST_RATE_LIMITED, ... or an analysis bug.
    logger.warn(`DAST scan failed: ${error instanceof Error ? error.message : String(error)}`);
    return finish(error instanceof Error ? error : new Error(String(error)));
  }

  return finish();
}

function summarize(vulnerabilities: Vulnerability[], scanDurationMs: number): DASTResult['summary'] {
  let critical = 0, high = 0, medium = 0, low = 0, informational = 0;
  for (const vuln of vulnerabilities) {
    switch (vuln.severity) {
      case 'critical': critical++; break;
      case 'high': high++; break;
      case 'medium': medium++; break;
      case 'low': low++; break;
      case 'informational': informational++; break;
    }
  }

  return { critical, high, medium, low, informational, totalFiles: 1, scanDurationMs };
}

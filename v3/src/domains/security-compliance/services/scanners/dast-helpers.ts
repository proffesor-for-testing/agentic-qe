/**
 * Agentic QE v3 - DAST Scanner Helper Functions
 * Utility functions for dynamic security analysis
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Vulnerability,
  VulnerabilitySeverity,
  ScanSummary,
  MutableScanSummary,
  MemoryBackend,
} from './scanner-types.js';

// Re-export from specialized modules for convenience
export { testXSS, testSQLi } from './dast-injection-testing.js';
export {
  testAuthorizationBypass,
  testIDOR,
  validateCredentials,
  buildAuthHeaders,
} from './dast-auth-testing.js';

// ============================================================================
// Security Header Analysis
// ============================================================================

/**
 * Analyze security headers in HTTP response
 */
export function analyzeSecurityHeaders(
  headers: Headers,
  targetUrl: string,
  vulnerabilities: Vulnerability[],
  authenticated = false
): void {
  const headerChecks = [
    { header: 'strict-transport-security', title: 'Missing HSTS Header', severity: 'medium' as VulnerabilitySeverity, remediation: 'Add Strict-Transport-Security header' },
    { header: 'x-content-type-options', title: 'Missing X-Content-Type-Options', severity: 'low' as VulnerabilitySeverity, remediation: 'Add X-Content-Type-Options: nosniff' },
    { header: 'x-frame-options', title: 'Missing X-Frame-Options', severity: 'medium' as VulnerabilitySeverity, remediation: 'Add X-Frame-Options: DENY or SAMEORIGIN' },
    { header: 'content-security-policy', title: 'Missing Content-Security-Policy', severity: 'medium' as VulnerabilitySeverity, remediation: 'Implement a Content-Security-Policy' },
  ];

  if (!authenticated) {
    headerChecks.push(
      { header: 'referrer-policy', title: 'Missing Referrer-Policy', severity: 'low' as VulnerabilitySeverity, remediation: 'Add Referrer-Policy header' },
      { header: 'permissions-policy', title: 'Missing Permissions-Policy', severity: 'low' as VulnerabilitySeverity, remediation: 'Add Permissions-Policy header' }
    );
  }

  for (const check of headerChecks) {
    if (!headers.get(check.header)) {
      vulnerabilities.push({
        id: uuidv4(),
        title: check.title,
        description: `Security header ${check.header} is not present in the response`,
        severity: check.severity,
        category: 'security-misconfiguration',
        location: { file: targetUrl, snippet: `Missing: ${check.header}` },
        remediation: { description: check.remediation, estimatedEffort: 'minor', automatable: true },
        references: ['https://owasp.org/www-project-secure-headers/'],
      });
    }
  }
}

/**
 * Analyze cookie security attributes
 */
export function analyzeCookieSecurity(
  headers: Headers,
  targetUrl: string,
  vulnerabilities: Vulnerability[],
  authenticated = false
): void {
  const setCookie = headers.get('set-cookie');
  if (!setCookie) return;

  const cookieLower = setCookie.toLowerCase();
  const severity = authenticated ? 'high' : 'medium';

  if (!cookieLower.includes('secure')) {
    vulnerabilities.push({
      id: uuidv4(),
      title: authenticated ? 'Session Cookie Missing Secure Flag' : 'Cookie Missing Secure Flag',
      description: authenticated
        ? 'Authenticated session cookie is not marked as Secure'
        : 'Cookie is set without the Secure attribute',
      severity,
      category: 'sensitive-data',
      location: { file: targetUrl, snippet: `Set-Cookie header without Secure flag` },
      remediation: { description: 'Add Secure flag to all cookies', estimatedEffort: 'trivial', automatable: true },
      references: ['https://owasp.org/www-community/controls/SecureCookieAttribute'],
    });
  }

  if (!cookieLower.includes('httponly')) {
    vulnerabilities.push({
      id: uuidv4(),
      title: authenticated ? 'Session Cookie Missing HttpOnly Flag' : 'Cookie Missing HttpOnly Flag',
      description: authenticated
        ? 'Session cookie is accessible to JavaScript'
        : 'Cookie is accessible to client-side JavaScript',
      severity,
      category: 'sensitive-data',
      location: { file: targetUrl, snippet: `Set-Cookie header without HttpOnly flag` },
      remediation: { description: 'Add HttpOnly flag to session cookies', estimatedEffort: 'trivial', automatable: true },
      references: ['https://owasp.org/www-community/HttpOnly'],
    });
  }
}

/**
 * Analyze server headers for version disclosure
 */
export function analyzeServerHeaders(
  headers: Headers,
  targetUrl: string,
  vulnerabilities: Vulnerability[]
): void {
  const serverHeader = headers.get('server') || headers.get('x-powered-by');
  if (serverHeader && /\d+\.\d+/.test(serverHeader)) {
    vulnerabilities.push({
      id: uuidv4(),
      title: 'Server Version Disclosure',
      description: `Server version information exposed: ${serverHeader}`,
      severity: 'low',
      category: 'security-misconfiguration',
      location: { file: targetUrl, snippet: `Server: ${serverHeader}` },
      remediation: { description: 'Remove or obfuscate server version headers', estimatedEffort: 'trivial', automatable: true },
      references: ['https://owasp.org/www-project-web-security-testing-guide/'],
    });
  }
}

// ============================================================================
// Sensitive File Scanning
// ============================================================================

/**
 * Scan for sensitive file exposure
 */
export async function scanSensitiveFiles(
  parsedUrl: URL,
  crawledUrls: number,
  maxDepth: number,
  vulnerabilities: Vulnerability[]
): Promise<number> {
  const sensitiveEndpoints = [
    { path: '/.git/config', name: 'Git Configuration' },
    { path: '/.env', name: 'Environment File' },
    { path: '/robots.txt', name: 'Robots.txt' },
    { path: '/sitemap.xml', name: 'Sitemap' },
    { path: '/.htaccess', name: 'htaccess File' },
    { path: '/web.config', name: 'IIS Configuration' },
  ];

  for (const endpoint of sensitiveEndpoints) {
    if (crawledUrls >= maxDepth * 10) break;

    try {
      const testUrl = new URL(endpoint.path, parsedUrl.origin).toString();
      const testResponse = await fetch(testUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (testResponse.ok) {
        crawledUrls++;
        const text = await testResponse.text();

        if (text.length > 20 && !text.toLowerCase().includes('not found') && !text.toLowerCase().includes('404')) {
          const isSensitive =
            endpoint.path.includes('.git') ||
            endpoint.path.includes('.env') ||
            endpoint.path.includes('.htaccess') ||
            endpoint.path.includes('web.config');

          if (isSensitive) {
            vulnerabilities.push({
              id: uuidv4(),
              title: `Sensitive File Exposed: ${endpoint.name}`,
              description: `${endpoint.name} is publicly accessible`,
              severity: endpoint.path.includes('.git') || endpoint.path.includes('.env') ? 'high' : 'medium',
              category: 'sensitive-data',
              location: { file: testUrl },
              remediation: { description: `Restrict access to ${endpoint.path}`, estimatedEffort: 'trivial', automatable: true },
              references: ['https://owasp.org/www-project-web-security-testing-guide/'],
            });
          }
        }
      }
    } catch {
      // File not accessible - expected
    }
  }

  return crawledUrls;
}

// ============================================================================
// CORS Analysis
// ============================================================================

/**
 * Analyze CORS configuration
 */
export async function analyzeCORS(
  targetUrl: string,
  vulnerabilities: Vulnerability[]
): Promise<void> {
  try {
    const corsResponse = await fetch(targetUrl, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://evil-attacker.com',
        'Access-Control-Request-Method': 'GET',
      },
      signal: AbortSignal.timeout(5000),
    });

    const allowOrigin = corsResponse.headers.get('access-control-allow-origin');
    if (allowOrigin === '*' || allowOrigin === 'https://evil-attacker.com') {
      vulnerabilities.push({
        id: uuidv4(),
        title: 'Overly Permissive CORS Policy',
        description: allowOrigin === '*' ? 'CORS allows all origins' : 'CORS reflects arbitrary origin',
        severity: 'medium',
        category: 'access-control',
        location: { file: targetUrl, snippet: `Access-Control-Allow-Origin: ${allowOrigin}` },
        remediation: { description: 'Restrict CORS to specific trusted origins', estimatedEffort: 'minor', automatable: false },
        references: ['https://owasp.org/www-community/attacks/CORS_OriginHeaderScrutiny'],
      });
    }
  } catch {
    // OPTIONS request failed - CORS might be properly restricted
  }
}

// ============================================================================
// Link Crawling
// ============================================================================

/**
 * Extract links from HTML and crawl discovered pages
 */
export async function extractAndCrawlLinks(
  html: string,
  baseUrl: URL,
  currentCrawled: number,
  maxDepth: number,
  vulnerabilities: Vulnerability[]
): Promise<number> {
  let crawledUrls = currentCrawled;
  const maxCrawl = maxDepth * 5;

  const linkPattern = /href=["']([^"']+)["']/gi;
  const discoveredLinks = new Set<string>();
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    try {
      const linkUrl = new URL(href, baseUrl.origin);
      if (linkUrl.origin === baseUrl.origin && !discoveredLinks.has(linkUrl.pathname)) {
        discoveredLinks.add(linkUrl.pathname);
      }
    } catch {
      // Invalid URL - skip
    }
  }

  const linksToCrawl = Array.from(discoveredLinks).slice(0, Math.min(10, maxCrawl - crawledUrls));

  for (const path of linksToCrawl) {
    if (crawledUrls >= maxCrawl) break;

    try {
      const crawlUrl = new URL(path, baseUrl.origin).toString();
      const crawlResponse = await fetch(crawlUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'AgenticQE-DAST-Scanner/3.0' },
        signal: AbortSignal.timeout(5000),
        redirect: 'follow',
      });

      crawledUrls++;

      if (crawlResponse.ok) {
        if (path.includes('password') || path.includes('token') || path.includes('api_key')) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Sensitive Data in URL Path',
            description: `URL path may contain sensitive parameter names: ${path}`,
            severity: 'medium',
            category: 'sensitive-data',
            location: { file: crawlUrl },
            remediation: { description: 'Avoid sensitive data in URL paths', estimatedEffort: 'minor', automatable: false },
            references: ['https://owasp.org/www-community/vulnerabilities/Information_exposure_through_query_strings_in_url'],
          });
        }

        const responseText = await crawlResponse.text();
        if (responseText.includes('Index of /') || responseText.includes('Directory listing for')) {
          vulnerabilities.push({
            id: uuidv4(),
            title: 'Directory Listing Enabled',
            description: `Directory listing is enabled at: ${crawlUrl}`,
            severity: 'medium',
            category: 'security-misconfiguration',
            location: { file: crawlUrl },
            remediation: { description: 'Disable directory listing in server configuration', estimatedEffort: 'trivial', automatable: true },
            references: ['https://owasp.org/www-project-web-security-testing-guide/'],
          });
        }
      }
    } catch {
      // Page not accessible
    }
  }

  return crawledUrls;
}

// ============================================================================
// Form Analysis
// ============================================================================

/**
 * Analyze HTML forms for security issues
 */
export function analyzeFormsForSecurityIssues(
  html: string,
  baseUrl: string,
  vulnerabilities: Vulnerability[]
): void {
  const formPattern = /<form[^>]*>([\s\S]*?)<\/form>/gi;
  let formMatch;
  let formIndex = 0;

  while ((formMatch = formPattern.exec(html)) !== null && formIndex < 10) {
    formIndex++;
    const formHtml = formMatch[0];
    const formContent = formMatch[1];

    // Check for CSRF token
    const hasCsrfToken =
      /name=["']?csrf/i.test(formContent) ||
      /name=["']?_token/i.test(formContent) ||
      /name=["']?authenticity_token/i.test(formContent) ||
      /name=["']?__RequestVerificationToken/i.test(formContent);

    const isPostForm = /method=["']?post/i.test(formHtml);

    if (isPostForm && !hasCsrfToken) {
      vulnerabilities.push({
        id: uuidv4(),
        title: 'Missing CSRF Token',
        description: `POST form #${formIndex} does not appear to have CSRF protection`,
        severity: 'medium',
        category: 'broken-auth',
        location: { file: baseUrl, snippet: `Form #${formIndex}` },
        remediation: { description: 'Add CSRF token to all state-changing forms', estimatedEffort: 'minor', automatable: false },
        references: ['https://owasp.org/www-community/attacks/csrf'],
      });
    }

    // Check for password fields without autocomplete=off
    if (/type=["']?password/i.test(formContent)) {
      const hasAutocompleteOff =
        /autocomplete=["']?(off|new-password)/i.test(formContent) ||
        /autocomplete=["']?(off|new-password)/i.test(formHtml);

      if (!hasAutocompleteOff) {
        vulnerabilities.push({
          id: uuidv4(),
          title: 'Password Field Allows Autocomplete',
          description: `Form #${formIndex} has password field that may be cached by browser`,
          severity: 'low',
          category: 'sensitive-data',
          location: { file: baseUrl, snippet: `Form #${formIndex}` },
          remediation: { description: 'Add autocomplete="new-password" to password fields', estimatedEffort: 'trivial', automatable: true },
          references: ['https://owasp.org/www-project-web-security-testing-guide/'],
        });
      }
    }

    // Check for insecure form action
    const actionMatch = /action=["']?([^"'\s>]+)/i.exec(formHtml);
    if (actionMatch) {
      const action = actionMatch[1];
      if (action.startsWith('http://') && !action.includes('localhost') && !action.includes('127.0.0.1')) {
        vulnerabilities.push({
          id: uuidv4(),
          title: 'Form Submits to Insecure HTTP',
          description: `Form #${formIndex} submits data over insecure HTTP: ${action}`,
          severity: 'high',
          category: 'sensitive-data',
          location: { file: baseUrl, snippet: `Action: ${action}` },
          remediation: { description: 'Change form action to use HTTPS', estimatedEffort: 'trivial', automatable: true },
          references: ['https://owasp.org/www-project-web-security-testing-guide/'],
        });
      }
    }
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Handle fetch errors and add appropriate vulnerabilities
 */
export function handleFetchError(
  fetchError: unknown,
  targetUrl: string,
  vulnerabilities: Vulnerability[]
): void {
  const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);

  if (errorMsg.includes('CERT') || errorMsg.includes('SSL') || errorMsg.includes('TLS') || errorMsg.includes('certificate')) {
    vulnerabilities.push({
      id: uuidv4(),
      title: 'TLS Certificate Error',
      description: `SSL/TLS error: ${errorMsg}`,
      severity: 'high',
      category: 'security-misconfiguration',
      location: { file: targetUrl },
      remediation: { description: 'Fix TLS certificate configuration', estimatedEffort: 'moderate', automatable: false },
      references: ['https://owasp.org/www-project-web-security-testing-guide/'],
    });
  } else if (errorMsg.includes('timeout') || errorMsg.includes('abort')) {
    vulnerabilities.push({
      id: uuidv4(),
      title: 'Connection Timeout',
      description: `Target did not respond within timeout: ${errorMsg}`,
      severity: 'informational',
      category: 'security-misconfiguration',
      location: { file: targetUrl },
      remediation: { description: 'Verify target is accessible', estimatedEffort: 'trivial', automatable: false },
      references: [],
    });
  }
}

/**
 * Calculate scan summary from vulnerabilities
 */
export function calculateSummary(
  vulnerabilities: Vulnerability[],
  totalFiles: number,
  scanDurationMs: number
): ScanSummary {
  const summary: MutableScanSummary = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
    totalFiles,
    scanDurationMs,
  };

  for (const vuln of vulnerabilities) {
    summary[vuln.severity]++;
  }

  return summary as ScanSummary;
}

/**
 * Store scan results in memory
 */
export async function storeScanResults(
  memory: MemoryBackend,
  scanId: string,
  scanType: string,
  vulnerabilities: Vulnerability[],
  summary: ScanSummary
): Promise<void> {
  await memory.set(
    `security:scan:${scanId}`,
    {
      scanId,
      scanType,
      vulnerabilities,
      summary,
      timestamp: new Date().toISOString(),
    },
    { namespace: 'security-compliance', ttl: 86400 * 7 }
  );
}

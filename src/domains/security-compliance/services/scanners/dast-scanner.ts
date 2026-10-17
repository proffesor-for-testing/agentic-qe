/**
 * Agentic QE v3 - DAST (Dynamic Application Security Testing) Scanner
 * Performs dynamic analysis of running applications to detect security vulnerabilities
 */

import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '@shared/types/index.js';
import type {
  SecurityScannerConfig,
  Vulnerability,
  DASTResult,
  DASTOptions,
  AuthCredentials,
  MemoryBackend,
  ScanStatus,
} from './scanner-types.js';
import { toError } from '@shared/error-utils.js';
import { fetchWithResponseDeadline } from '@shared/llm/providers/response-deadline.js';
import {
  analyzeSecurityHeaders,
  analyzeCookieSecurity,
  analyzeServerHeaders,
  scanSensitiveFiles,
  analyzeCORS,
  extractAndCrawlLinks,
  testXSS,
  testSQLi,
  analyzeFormsForSecurityIssues,
  testAuthorizationBypass,
  testIDOR,
  validateCredentials,
  buildAuthHeaders,
  calculateSummary,
  storeScanResults,
} from './dast-helpers.js';

// ============================================================================
// DAST Scanner Service
// ============================================================================

/** Transport failures are execution errors, not absence of vulnerabilities. */
function dastRequestFailure(error: unknown): Error {
  if (error instanceof Error && 'code' in error && error.code === 'DAST_AUTHENTICATION_FAILED') return error;
  const timeout = error instanceof Error && /timeout|abort/i.test(error.message);
  return Object.assign(new Error(timeout
    ? 'DAST target request timeout; dynamic analysis is incomplete'
    : 'DAST target request failed; dynamic analysis is incomplete'), {
    code: timeout ? 'DAST_REQUEST_TIMEOUT' : 'DAST_REQUEST_FAILED',
  });
}


/**
 * DAST Scanner - Dynamic Application Security Testing
 * Scans running applications for security vulnerabilities
 *
 * **Capabilities:**
 * - Security header analysis (HSTS, CSP, X-Frame-Options, etc.)
 * - Cookie security (Secure, HttpOnly, SameSite flags)
 * - CORS misconfiguration detection
 * - Sensitive file exposure (/.git, /.env, etc.)
 * - Link crawling with same-origin scope
 * - XSS reflection testing (GET parameters)
 * - SQL injection error-based detection (GET parameters)
 * - Form security analysis (CSRF tokens, autocomplete, action URLs)
 *
 * **Limitations:**
 * - Injection testing: GET parameters only (POST form submission not implemented)
 * - Crawling: Same-origin only, max 10 links per page, single depth
 * - Auth flows: Header-based only, no login form automation
 * - No JavaScript execution (static response analysis only)
 * - No session management testing beyond cookie attributes
 */

export class DASTScanner {
  private readonly config: SecurityScannerConfig;
  private readonly memory: MemoryBackend;
  private readonly activeScans: Map<string, ScanStatus>;

  constructor(
    config: SecurityScannerConfig,
    memory: MemoryBackend,
    activeScans?: Map<string, ScanStatus>
  ) {
    this.config = config;
    this.memory = memory;
    this.activeScans = activeScans || new Map();
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Scan running application using dynamic analysis
   */
  async scanUrl(
    targetUrl: string,
    options?: DASTOptions
  ): Promise<Result<DASTResult>> {
    const scanId = uuidv4();

    try {
      this.activeScans.set(scanId, 'running');
      const startTime = Date.now();

      const mergedOptions: DASTOptions = {
        maxDepth: options?.maxDepth ?? this.config.dastMaxDepth,
        activeScanning: options?.activeScanning ?? this.config.dastActiveScanning,
        timeout: options?.timeout ?? this.config.timeout,
        excludePatterns: options?.excludePatterns ?? [],
      };

      // Perform dynamic analysis
      const result = await this.performDynamicScan(targetUrl, mergedOptions);

      const scanDurationMs = Date.now() - startTime;

      const summary = calculateSummary(
        result.vulnerabilities,
        1,
        scanDurationMs
      );

      // Store results
      await storeScanResults(this.memory, scanId, 'dast', result.vulnerabilities, summary);

      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        targetUrl,
        vulnerabilities: result.vulnerabilities,
        summary,
        crawledUrls: result.crawledUrls,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(toError(error));
    }
  }

  /**
   * Scan authenticated endpoints
   */
  async scanAuthenticated(
    targetUrl: string,
    credentials: AuthCredentials,
    options?: DASTOptions
  ): Promise<Result<DASTResult>> {
    const scanId = uuidv4();

    try {
      this.activeScans.set(scanId, 'running');
      const startTime = Date.now();

      // Validate credentials
      const credValidation = validateCredentials(credentials);
      if (!credValidation.valid) {
        throw new Error(credValidation.reason);
      }

      const mergedOptions: DASTOptions = {
        maxDepth: options?.maxDepth ?? this.config.dastMaxDepth,
        activeScanning: options?.activeScanning ?? this.config.dastActiveScanning,
        timeout: options?.timeout ?? this.config.timeout,
        excludePatterns: options?.excludePatterns ?? [],
      };

      // Perform authenticated dynamic analysis
      const result = await this.performAuthenticatedScan(
        targetUrl,
        credentials,
        mergedOptions
      );

      const scanDurationMs = Date.now() - startTime;

      const summary = calculateSummary(
        result.vulnerabilities,
        1,
        scanDurationMs
      );

      // Store results (without credentials)
      await storeScanResults(this.memory, scanId, 'dast-auth', result.vulnerabilities, summary);

      this.activeScans.set(scanId, 'completed');

      return ok({
        scanId,
        targetUrl,
        vulnerabilities: result.vulnerabilities,
        summary,
        crawledUrls: result.crawledUrls,
      });
    } catch (error) {
      this.activeScans.set(scanId, 'failed');
      return err(toError(error));
    }
  }

  /**
   * Get scan status
   */
  async getScanStatus(scanId: string): Promise<ScanStatus> {
    return this.activeScans.get(scanId) ?? 'pending';
  }

  // ==========================================================================
  // Private Methods - Dynamic Scanning
  // ==========================================================================

  /**
   * Perform dynamic (DAST) scanning on a target URL
   */
  private async performDynamicScan(
    targetUrl: string,
    options: DASTOptions
  ): Promise<{ vulnerabilities: Vulnerability[]; crawledUrls: number }> {
    const vulnerabilities: Vulnerability[] = [];
    let crawledUrls = 0;

    try {
      // Validate and parse URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        vulnerabilities.push(this.createInvalidUrlVuln(targetUrl));
        return { vulnerabilities, crawledUrls: 0 };
      }

      const timeout = options.timeout ?? this.config.timeout;
      const maxDepth = options.maxDepth ?? this.config.dastMaxDepth;

      // Perform main page scan. #980: the deadline must cover the body too —
      // the target is untrusted and may send headers and then stall the body,
      // so it stays armed until `response.clone().text()` below has finished.
      const deadlineMs = Math.min(timeout, 30000);

      try {
        const response = await fetchWithResponseDeadline(
          targetUrl,
          {
            method: 'GET',
            headers: {
              'User-Agent': 'AgenticQE-DAST-Scanner/3.0',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            redirect: 'follow',
          },
          deadlineMs,
          () => new Error(`DAST request timeout after ${deadlineMs}ms: ${targetUrl}`),
        );

        crawledUrls++;

        // Security header analysis
        analyzeSecurityHeaders(response.headers, targetUrl, vulnerabilities);

        // Check for insecure protocol
        if (parsedUrl.protocol === 'http:') {
          vulnerabilities.push(this.createInsecureProtocolVuln(targetUrl));
        }

        // Check for cookie security
        analyzeCookieSecurity(response.headers, targetUrl, vulnerabilities);

        // Check for server version disclosure
        analyzeServerHeaders(response.headers, targetUrl, vulnerabilities);

        // Active scanning features
        if (options.activeScanning ?? this.config.dastActiveScanning) {
          // Read the page body first, inside the request deadline (#980), so the
          // slower probes below cannot use up the deadline of a healthy target.
          const responseText = await response.text();

          crawledUrls = await scanSensitiveFiles(parsedUrl, crawledUrls, maxDepth, vulnerabilities);
          await analyzeCORS(targetUrl, vulnerabilities);

          // Enhanced DAST: Link crawling, injection testing, form analysis

          crawledUrls = await extractAndCrawlLinks(
            responseText,
            parsedUrl,
            crawledUrls,
            maxDepth,
            vulnerabilities
          );

          if (parsedUrl.search) {
            await this.testInjectionVulnerabilities(targetUrl, parsedUrl, vulnerabilities);
          }

          analyzeFormsForSecurityIssues(responseText, targetUrl, vulnerabilities);
        } else {
          // Passive scan: headers only. Release the connection instead of
          // leaving an unread body to the deadline timer.
          await response.body?.cancel().catch(() => undefined);
        }

      } catch (fetchError) {
        throw dastRequestFailure(fetchError);
      }

    } catch (error) {
      throw toError(error);
    }

    return { vulnerabilities, crawledUrls };
  }

  /**
   * Perform authenticated dynamic scanning
   */
  private async performAuthenticatedScan(
    targetUrl: string,
    credentials: AuthCredentials,
    options: DASTOptions
  ): Promise<{ vulnerabilities: Vulnerability[]; crawledUrls: number }> {
    const vulnerabilities: Vulnerability[] = [];
    let crawledUrls = 0;

    try {
      const authHeaders = buildAuthHeaders(credentials);

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(targetUrl);
      } catch {
        vulnerabilities.push(this.createInvalidUrlVuln(targetUrl));
        return { vulnerabilities, crawledUrls: 0 };
      }

      const timeout = options.timeout ?? this.config.timeout;
      const maxDepth = options.maxDepth ?? this.config.dastMaxDepth;

      // #980 review N8: same deadline treatment as the unauthenticated scan.
      // This path reads headers only; the unread body is cancelled below so
      // a target that stalls it cannot hold the connection open.
      const deadlineMs = Math.min(timeout, 30000);

      try {
        const response = await fetchWithResponseDeadline(
          targetUrl,
          {
            method: 'GET',
            headers: {
              'User-Agent': 'AgenticQE-DAST-Scanner/3.0',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              ...authHeaders,
            },
            redirect: 'follow',
          },
          deadlineMs,
          () => new Error(`DAST request timeout after ${deadlineMs}ms: ${targetUrl}`),
        );
        await response.body?.cancel().catch(() => undefined);

        crawledUrls++;

        // Check if authentication was successful
        if (response.status === 401 || response.status === 403) {
          throw Object.assign(new Error(`DAST authentication rejected (HTTP ${response.status}); dynamic analysis is incomplete`), {
            code: 'DAST_AUTHENTICATION_FAILED',
          });
        }

        // Standard security header checks
        analyzeSecurityHeaders(response.headers, targetUrl, vulnerabilities, true);

        // Check for session token in URL
        if (parsedUrl.search.includes('token=') || parsedUrl.search.includes('session=') || parsedUrl.search.includes('auth=')) {
          vulnerabilities.push(this.createTokenInUrlVuln(targetUrl, parsedUrl.search));
        }

        // Active scanning for authenticated endpoints
        if (options.activeScanning ?? this.config.dastActiveScanning) {
          crawledUrls = await testAuthorizationBypass(parsedUrl, authHeaders, crawledUrls, maxDepth, vulnerabilities);
          crawledUrls = await testIDOR(parsedUrl, authHeaders, crawledUrls, maxDepth, vulnerabilities);
        }

        // Enhanced cookie security for authenticated sessions
        analyzeCookieSecurity(response.headers, targetUrl, vulnerabilities, true);

      } catch (fetchError) {
        throw dastRequestFailure(fetchError);
      }

    } catch (error) {
      throw toError(error);
    }

    return { vulnerabilities, crawledUrls };
  }

  // ==========================================================================
  // Private Methods - Vulnerability Factories
  // ==========================================================================

  private createInvalidUrlVuln(targetUrl: string): Vulnerability {
    return {
      id: uuidv4(),
      title: 'Invalid Target URL',
      description: 'The provided target URL is not valid',
      severity: 'informational',
      category: 'security-misconfiguration',
      location: { file: targetUrl },
      remediation: { description: 'Provide a valid URL', estimatedEffort: 'trivial', automatable: false },
      references: [],
    };
  }

  private createInsecureProtocolVuln(targetUrl: string): Vulnerability {
    return {
      id: uuidv4(),
      title: 'Insecure HTTP Protocol',
      description: 'Application is accessible over unencrypted HTTP',
      severity: 'high',
      category: 'sensitive-data',
      location: { file: targetUrl },
      remediation: { description: 'Redirect all HTTP traffic to HTTPS', estimatedEffort: 'moderate', automatable: false },
      references: ['https://owasp.org/www-project-web-security-testing-guide/'],
    };
  }

  private createTokenInUrlVuln(targetUrl: string, search: string): Vulnerability {
    return {
      id: uuidv4(),
      title: 'Session Token in URL',
      description: 'Authentication token appears in URL query string',
      severity: 'high',
      category: 'sensitive-data',
      location: { file: targetUrl, snippet: search.substring(0, 50) },
      remediation: { description: 'Send tokens in headers or request body, not URL', estimatedEffort: 'moderate', automatable: false },
      references: ['https://owasp.org/www-community/vulnerabilities/Information_exposure_through_query_strings_in_url'],
    };
  }

  // ==========================================================================
  // Private Methods - Injection Testing
  // ==========================================================================

  /**
   * Test URL parameters for injection vulnerabilities
   */
  private async testInjectionVulnerabilities(
    targetUrl: string,
    parsedUrl: URL,
    vulnerabilities: Vulnerability[]
  ): Promise<void> {
    const params = new URLSearchParams(parsedUrl.search);
    const paramNames = Array.from(params.keys());

    const xssPayloads = [
      { payload: '<script>alert(1)</script>', name: 'Basic XSS' },
      { payload: '"><img src=x onerror=alert(1)>', name: 'Attribute Injection' },
      { payload: "'-alert(1)-'", name: 'JavaScript Injection' },
    ];

    const sqliPayloads = [
      { payload: "' OR '1'='1", name: 'SQL OR Injection' },
      { payload: "1; DROP TABLE test--", name: 'SQL Statement Injection' },
      { payload: "1' AND '1'='1", name: 'SQL AND Injection' },
    ];

    for (const paramName of paramNames.slice(0, 3)) {
      await testXSS(targetUrl, parsedUrl, paramName, xssPayloads, vulnerabilities);
      await testSQLi(targetUrl, parsedUrl, paramName, sqliPayloads, vulnerabilities);
    }
  }
}

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
  DASTRequestFailure,
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
import {
  assertScannableResponse,
  dastError,
  dastRequestFailure,
  isDastError,
  parseDastTarget,
  summarizeFailures,
  unansweredStatus,
} from './dast-requests.js';

// ============================================================================
// DAST Scanner Service
// ============================================================================

/** A bug in the analysis code is not a request failure (#1135). */
function dastAnalysisFailure(error: unknown): Error {
  if (isDastError(error)) return error;
  return dastError(`DAST analysis failed (${toError(error).message}); dynamic analysis is incomplete`, 'DAST_ANALYSIS_FAILED', error);
}

interface DynamicScanOutcome {
  vulnerabilities: Vulnerability[];
  crawledUrls: number;
  failedRequests: DASTRequestFailure[];
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

      const dastResult = this.toResult(scanId, targetUrl, result, summary);
      await storeScanResults(this.memory, scanId, 'dast', result.vulnerabilities, summary,
        { status: dastResult.status, failedRequests: dastResult.failedRequests });

      this.activeScans.set(scanId, 'completed');

      return ok(dastResult);
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
      const dastResult = this.toResult(scanId, targetUrl, result, summary);
      await storeScanResults(this.memory, scanId, 'dast-auth', result.vulnerabilities, summary,
        { status: dastResult.status, failedRequests: dastResult.failedRequests });

      this.activeScans.set(scanId, 'completed');

      return ok(dastResult);
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

  /**
   * #1135: probes the target did not answer leave the scan incomplete. The
   * findings already collected are real and kept; the failed URLs are listed.
   */
  private toResult(scanId: string, targetUrl: string, outcome: DynamicScanOutcome, summary: DASTResult['summary']): DASTResult {
    const { failedRequests } = outcome;
    return {
      scanId,
      targetUrl,
      vulnerabilities: outcome.vulnerabilities,
      summary,
      crawledUrls: outcome.crawledUrls,
      status: failedRequests.length > 0 ? 'incomplete' : 'complete',
      failedRequests,
      ...(failedRequests.length > 0 ? { error: summarizeFailures(failedRequests) } : {}),
    };
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
  ): Promise<DynamicScanOutcome> {
    const vulnerabilities: Vulnerability[] = [];
    const failedRequests: DASTRequestFailure[] = [];
    const parsedUrl = parseDastTarget(targetUrl);
    const timeout = options.timeout ?? this.config.timeout;
    const maxDepth = options.maxDepth ?? this.config.dastMaxDepth;
    const activeScanning = options.activeScanning ?? this.config.dastActiveScanning;

    // Perform main page scan. #980: the deadline must cover the body too —
    // the target is untrusted and may send headers and then stall the body,
    // so it stays armed until `response.text()` below has finished.
    const deadlineMs = Math.min(timeout, 30000);
    let response: Response;
    let responseText = '';
    try {
      response = await fetchWithResponseDeadline(
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
      if (unansweredStatus(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        assertScannableResponse(response.status);
      }
      if (activeScanning) {
        // Read the page body first, inside the request deadline (#980), so the
        // slower probes below cannot use up the deadline of a healthy target.
        responseText = await response.text();
      } else {
        // Passive scan: headers only. Release the connection instead of
        // leaving an unread body to the deadline timer.
        await response.body?.cancel().catch(() => undefined);
      }
    } catch (fetchError) {
      throw dastRequestFailure(fetchError);
    }

    let crawledUrls = 1;
    try {
      analyzeSecurityHeaders(response.headers, targetUrl, vulnerabilities);
      if (parsedUrl.protocol === 'http:') {
        vulnerabilities.push(this.createInsecureProtocolVuln(targetUrl));
      }
      analyzeCookieSecurity(response.headers, targetUrl, vulnerabilities);
      analyzeServerHeaders(response.headers, targetUrl, vulnerabilities);

      if (activeScanning) {
        // #1135: a probe the target does not answer is recorded and the scan
        // continues; the result is then incomplete, not discarded.
        crawledUrls = await scanSensitiveFiles(parsedUrl, crawledUrls, maxDepth, vulnerabilities, failedRequests);
        await analyzeCORS(targetUrl, vulnerabilities, failedRequests);
        crawledUrls = await extractAndCrawlLinks(responseText, parsedUrl, crawledUrls, maxDepth, vulnerabilities, failedRequests);
        if (parsedUrl.search) {
          await this.testInjectionVulnerabilities(targetUrl, parsedUrl, vulnerabilities, failedRequests);
        }
        analyzeFormsForSecurityIssues(responseText, targetUrl, vulnerabilities);
      }
    } catch (error) {
      throw dastAnalysisFailure(error);
    }

    return { vulnerabilities, crawledUrls, failedRequests };
  }

  /**
   * Perform authenticated dynamic scanning
   */
  private async performAuthenticatedScan(
    targetUrl: string,
    credentials: AuthCredentials,
    options: DASTOptions
  ): Promise<DynamicScanOutcome> {
    const vulnerabilities: Vulnerability[] = [];
    const failedRequests: DASTRequestFailure[] = [];
    const authHeaders = buildAuthHeaders(credentials);
    const parsedUrl = parseDastTarget(targetUrl);
    const timeout = options.timeout ?? this.config.timeout;
    const maxDepth = options.maxDepth ?? this.config.dastMaxDepth;

    // #980 review N8: same deadline treatment as the unauthenticated scan.
    // This path reads headers only; the unread body is cancelled below so
    // a target that stalls it cannot hold the connection open.
    const deadlineMs = Math.min(timeout, 30000);
    let response: Response;
    try {
      response = await fetchWithResponseDeadline(
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
      assertScannableResponse(response.status);
    } catch (fetchError) {
      throw dastRequestFailure(fetchError);
    }

    let crawledUrls = 1;
    try {
      // Standard security header checks
      analyzeSecurityHeaders(response.headers, targetUrl, vulnerabilities, true);

      // Check for session token in URL
      if (parsedUrl.search.includes('token=') || parsedUrl.search.includes('session=') || parsedUrl.search.includes('auth=')) {
        vulnerabilities.push(this.createTokenInUrlVuln(targetUrl, parsedUrl.search));
      }

      // Active scanning for authenticated endpoints
      if (options.activeScanning ?? this.config.dastActiveScanning) {
        crawledUrls = await testAuthorizationBypass(parsedUrl, authHeaders, crawledUrls, maxDepth, vulnerabilities, failedRequests);
        crawledUrls = await testIDOR(parsedUrl, authHeaders, crawledUrls, maxDepth, vulnerabilities, failedRequests);
      }

      // Enhanced cookie security for authenticated sessions
      analyzeCookieSecurity(response.headers, targetUrl, vulnerabilities, true);
    } catch (error) {
      throw dastAnalysisFailure(error);
    }

    return { vulnerabilities, crawledUrls, failedRequests };
  }

  // ==========================================================================
  // Private Methods - Vulnerability Factories
  // ==========================================================================

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
    vulnerabilities: Vulnerability[],
    failures: DASTRequestFailure[]
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
      await testXSS(targetUrl, parsedUrl, paramName, xssPayloads, vulnerabilities, failures);
      await testSQLi(targetUrl, parsedUrl, paramName, sqliPayloads, vulnerabilities, failures);
    }
  }
}

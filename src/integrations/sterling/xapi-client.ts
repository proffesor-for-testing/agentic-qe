/**
 * Agentic QE v3 - Sterling XAPI Client (Playwright)
 *
 * Drives the Sterling XAPI HTTP API Tester JSP page via Playwright.
 * This is the proven approach from the Adidas O2C MVP (15/15 PASS).
 *
 * How it works:
 *   1. Launches headless Chromium with HTTP Basic credentials
 *   2. Navigates to the JSP page (yantrahttpapitester.jsp)
 *   3. Fills YFSEnvironment.userId / .password on the form
 *   4. For flows: checks "Is a Service?" checkbox, fills ServiceName
 *   5. For APIs: unchecks checkbox, selects ApiName from dropdown
 *   6. Pastes XML into InteropApiData textarea
 *   7. Clicks "Test API Now!" and reads the response
 *
 * The JSP page handles session/auth naturally, avoiding the transient
 * 403 errors seen with direct InteropHttpServlet POST calls.
 */

import type { XAPIClientConfig, XAPIClient, XAPIResponse } from './types';
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';

// ============================================================================
// Known Service Flows
// ============================================================================

/**
 * Services that are "flows" (composite services) vs simple API calls.
 * Flows use the "Is a Service?" checkbox + ServiceName field.
 * APIs use the ApiName dropdown.
 */
const KNOWN_SERVICE_FLOWS = new Set([
  'adidasWE_CreateOrderSync',
  'adidasWE_CheckAdyenAsyncResponseSvc',
  'adidasWE_ProcessSHPConfirmation',
  'adidas_UpdateSOAcknowledgmentSvc',
  'adidasWE_ProcessPODUpdate',
  'adidasWE_CreateReturnFromSSRSvc',
  'adidasWE_ProcessReturnPODUpdates',
  'adidasWE_ProcessReturnCompletionUpdateSvc',
]);

function isServiceFlow(serviceName: string): boolean {
  return KNOWN_SERVICE_FLOWS.has(serviceName);
}

// ============================================================================
// Error Detection
// ============================================================================

/**
 * Check if a response body contains a Sterling error.
 * Sterling returns 200 OK even for logical errors — the error is in the body.
 */
export function extractSterlingXmlError(text: string): string | undefined {
  const trimmed = text.trimStart();

  // HTML page returned instead of API response
  if (trimmed.startsWith('<HTML') || trimmed.startsWith('<html') || trimmed.startsWith('<!DOCTYPE')) {
    return 'XAPI returned HTML page instead of XML response';
  }

  // Error patterns in response text
  const descMatch = text.match(/ErrorDescription="([^"]+)"/);
  if (descMatch) return descMatch[1];

  const codeMatch = text.match(/ErrorCode="([^"]+)"/);
  if (codeMatch) return `Error code: ${codeMatch[1]}`;

  const errorMatch = text.match(/<Error[^>]*>(.*?)<\/Error>/s);
  if (errorMatch) return errorMatch[1].trim() || 'Unknown Sterling error';

  // HTTP error patterns in page text
  if (text.includes('Error 403') || text.includes('SRVE0295E')) return 'HTTP 403 Forbidden';
  if (text.includes('Error 401')) return 'HTTP 401 Unauthorized';
  if (text.includes('Error 500')) return 'HTTP 500 Internal Server Error';

  return undefined;
}

// ============================================================================
// Playwright XAPI Client
// ============================================================================

class PlaywrightXAPIClient implements XAPIClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelay: number;

  // Lazy-initialized browser resources
  private browser: import('playwright').Browser | null = null;
  private context: import('playwright').BrowserContext | null = null;
  private page: import('playwright').Page | null = null;
  private launching: Promise<void> | null = null;

  constructor(config: XAPIClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 60_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.retryBaseDelay = config.retryBaseDelay ?? 2_000;
    this.username = config.username;
    this.password = config.password;
  }

  // --------------------------------------------------------------------------
  // Browser lifecycle (lazy init)
  // --------------------------------------------------------------------------

  private async ensureBrowser(): Promise<import('playwright').Page> {
    if (this.page) return this.page;

    // Prevent concurrent launches
    if (this.launching) {
      await this.launching;
      return this.page!;
    }

    this.launching = (async () => {
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox'],
      });
      this.context = await this.browser.newContext({
        httpCredentials: { username: this.username, password: this.password },
      });
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(this.timeout);
    })();

    await this.launching;
    return this.page!;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  // --------------------------------------------------------------------------
  // Core: invoke a service/API via the JSP form
  // --------------------------------------------------------------------------

  async invoke(serviceName: string, xmlPayload: string): Promise<XAPIResponse> {
    const start = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = this.retryBaseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const page = await this.ensureBrowser();
        let responseText: string;

        if (isServiceFlow(serviceName)) {
          responseText = await this.invokeServiceOnPage(page, serviceName, xmlPayload);
        } else {
          responseText = await this.invokeAPIOnPage(page, serviceName, xmlPayload);
        }

        const duration = Date.now() - start;
        const error = extractSterlingXmlError(responseText);

        return {
          body: responseText,
          status: 200,
          duration,
          retries: attempt,
          success: !error,
          error,
        };
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));

        // On page crash or navigation timeout, open a fresh page and retry
        if (lastError.message.includes('crash') || lastError.message.includes('Target closed')) {
          try {
            this.page = await this.context!.newPage();
            this.page.setDefaultTimeout(this.timeout);
          } catch { /* will retry with ensureBrowser */ }
        }

        if (attempt >= this.maxRetries) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error(`XAPI ${serviceName} failed after ${this.maxRetries} retries`);
  }

  // --------------------------------------------------------------------------
  // JSP form interaction — Service (IsFlow=Y)
  // --------------------------------------------------------------------------

  private async invokeServiceOnPage(
    page: import('playwright').Page,
    serviceName: string,
    xml: string,
  ): Promise<string> {
    // Navigate fresh each time to avoid stale state
    await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // Fill credentials on the form
    await page.locator('input[name="YFSEnvironment.userId"]').first().fill(this.username);
    await page.locator('input[name="YFSEnvironment.password"]').first().fill(this.password);

    // Check "Is a Service?" checkbox
    const checkbox = page.locator('input[name="InvokeFlow"]');
    if (!(await checkbox.isChecked())) {
      await checkbox.check();
    }

    // Fill service name
    await page.locator('input[name="ServiceName"]').fill(serviceName);

    // Paste XML into Message textarea
    await page.locator('textarea[name="InteropApiData"]').fill(xml);

    // Click "Test API Now!"
    await page.locator('input[name="btnTest"]').click();

    // Wait for response page
    await page.waitForLoadState('networkidle', { timeout: this.timeout });

    return page.evaluate(() => document.body.innerText);
  }

  // --------------------------------------------------------------------------
  // JSP form interaction — API (IsFlow=N)
  // --------------------------------------------------------------------------

  private async invokeAPIOnPage(
    page: import('playwright').Page,
    apiName: string,
    xml: string,
  ): Promise<string> {
    await page.goto(this.baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });

    // Fill credentials
    await page.locator('input[name="YFSEnvironment.userId"]').first().fill(this.username);
    await page.locator('input[name="YFSEnvironment.password"]').first().fill(this.password);

    // Uncheck "Is a Service?" if checked
    const checkbox = page.locator('input[name="InvokeFlow"]');
    if (await checkbox.isChecked()) {
      await checkbox.uncheck();
    }

    // Select API from dropdown
    await page.locator('select[name="ApiName"]').selectOption(apiName);

    // Paste XML into Message textarea
    await page.locator('textarea[name="InteropApiData"]').fill(xml);

    // Click "Test API Now!"
    await page.locator('input[name="btnTest"]').click();

    // Wait for response page
    await page.waitForLoadState('networkidle', { timeout: this.timeout });

    return page.evaluate(() => document.body.innerText);
  }

  // --------------------------------------------------------------------------
  // Convenience: invoke and assert success
  // --------------------------------------------------------------------------

  async invokeOrThrow(serviceName: string, xmlPayload: string): Promise<XAPIResponse> {
    const result = await this.invoke(serviceName, xmlPayload);
    if (!result.success) {
      throw new Error(
        `XAPI ${serviceName} returned error: ${result.error}\nResponse: ${result.body.slice(0, 500)}`,
      );
    }
    return result;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a Playwright-based XAPI client for Sterling OMS.
 *
 * @example
 * ```ts
 * const result = createXAPIClient({
 *   baseUrl: 'https://host/smcfs/yfshttpapi/yantrahttpapitester.jsp',
 *   username: 'admin',
 *   password: 'secret',
 * });
 * if (!result.success) throw new Error(result.error);
 * const response = await result.value.invoke('getOrderDetails', orderXml);
 * await result.value.close?.();
 * ```
 */
export function createXAPIClient(
  config: XAPIClientConfig,
): Result<XAPIClient, string> {
  if (!config.baseUrl) {
    return err('XAPIClientConfig.baseUrl is required');
  }
  if (!config.username || !config.password) {
    return err('XAPIClientConfig.username and password are required');
  }
  return ok(new PlaywrightXAPIClient(config));
}

/**
 * Web Content Fetcher - V3 Browser Cascade
 *
 * Provides resilient web content fetching with a 5-tier cascade:
 * 1. Vibium MCP Browser (best for bot-protected sites)
 * 2. Agent Browser (CLI-based with refs)
 * 3. Playwright + Stealth (headless with anti-detection)
 * 4. Simple HTTP Fetch (for static sites)
 * 5. Web Search Fallback (research-based, last resort)
 *
 * @module integrations/browser/web-content-fetcher
 * @version 1.0.0
 * @since v3
 */

import { exec, execSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { createBrowserClient, isVibiumAvailable, isAgentBrowserAvailable } from './client-factory';
import type { IBrowserClient } from './types';
import { BrowserError } from './types';
import { toErrorMessage } from '../../shared/error-utils.js';
import { safeJsonParse } from '../../shared/safe-json.js';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

/**
 * Fetch tier identifiers
 */
export type FetchTier =
  | 'vibium'
  | 'agent-browser'
  | 'playwright-stealth'
  | 'http-fetch'
  | 'websearch-fallback';

/**
 * Fetch status
 */
export type FetchStatus = 'success' | 'degraded' | 'failed';

/**
 * Result of a web content fetch operation
 */
export interface WebContentFetchResult {
  /** Whether the fetch succeeded */
  success: boolean;
  /** The fetched HTML content (or research-based content for websearch tier) */
  content: string | null;
  /** Which tier was used to fetch the content */
  tier: FetchTier | null;
  /** Overall fetch status */
  status: FetchStatus;
  /** Size of content in bytes */
  contentSize: number;
  /** Path to screenshot if captured */
  screenshotPath?: string;
  /** URL that was fetched */
  url: string;
  /** Error message if failed */
  error?: string;
  /** Tier-specific metadata */
  metadata?: Record<string, unknown>;
  /** Tiers that were attempted */
  tiersAttempted: FetchTier[];
  /** Errors from each tier that failed */
  tierErrors: Record<FetchTier, string>;
}

/**
 * Options for web content fetching
 */
export interface WebContentFetchOptions {
  /** URL to fetch */
  url: string;
  /** Output directory for screenshots and cached content */
  outputDir?: string;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
  /** Whether to capture screenshots (default: true) */
  captureScreenshot?: boolean;
  /** Tiers to skip (for testing or preference) */
  skipTiers?: FetchTier[];
  /** User agent to use */
  userAgent?: string;
  /** Locale for the browser (default: 'en-US') */
  locale?: string;
  /** Whether to try dismissing cookie banners (default: true) */
  dismissCookieBanners?: boolean;
  /** MCP tools reference (for Vibium integration) */
  mcpTools?: {
    vibiumLaunch?: (options: { headless: boolean }) => Promise<unknown>;
    vibiumNavigate?: (options: { url: string }) => Promise<unknown>;
    vibiumScreenshot?: (options: { filename?: string }) => Promise<unknown>;
    vibiumFind?: (options: { selector: string }) => Promise<unknown>;
    vibiumQuit?: () => Promise<unknown>;
    webFetch?: (options: { url: string; prompt: string }) => Promise<string>;
    webSearch?: (options: { query: string }) => Promise<string>;
  };
}

// ============================================================================
// WebContentFetcher Class
// ============================================================================

/**
 * Fetches web content using a resilient 5-tier cascade
 *
 * @example
 * ```typescript
 * const fetcher = new WebContentFetcher();
 * const result = await fetcher.fetch({
 *   url: 'https://www.example.com',
 *   outputDir: '/tmp/fetch-output'
 * });
 *
 * if (result.success) {
 *   console.log(`Fetched via ${result.tier}: ${result.contentSize} bytes`);
 *   console.log(result.content);
 * }
 * ```
 */
export class WebContentFetcher {
  private readonly defaultTimeout = 60000;
  private readonly defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  /**
   * Fetch web content with automatic tier selection
   *
   * @param options Fetch options
   * @returns Promise<WebContentFetchResult> Fetch result with content and metadata
   */
  async fetch(options: WebContentFetchOptions): Promise<WebContentFetchResult> {
    const {
      url,
      outputDir = '/tmp/web-content-fetch',
      timeout = this.defaultTimeout,
      captureScreenshot = true,
      skipTiers = [],
      userAgent = this.defaultUserAgent,
      locale = 'en-US',
      dismissCookieBanners = true,
      mcpTools,
    } = options;

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const result: WebContentFetchResult = {
      success: false,
      content: null,
      tier: null,
      status: 'failed',
      contentSize: 0,
      url,
      tiersAttempted: [],
      tierErrors: {} as Record<FetchTier, string>,
    };

    const tiersToTry: FetchTier[] = [
      'vibium',
      'agent-browser',
      'playwright-stealth',
      'http-fetch',
      'websearch-fallback',
    ].filter(tier => !skipTiers.includes(tier as FetchTier)) as FetchTier[];

    for (const tier of tiersToTry) {
      result.tiersAttempted.push(tier);

      try {
        const tierResult = await this.fetchWithTier(tier, {
          url,
          outputDir,
          timeout,
          captureScreenshot,
          userAgent,
          locale,
          dismissCookieBanners,
          mcpTools,
        });

        if (tierResult.success && tierResult.content) {
          result.success = true;
          result.content = tierResult.content;
          result.tier = tier;
          result.contentSize = Buffer.byteLength(tierResult.content, 'utf8');
          result.screenshotPath = tierResult.screenshotPath;
          result.metadata = tierResult.metadata;
          result.status = tier === 'websearch-fallback' ? 'degraded' : 'success';

          console.log(`[WebContentFetcher] SUCCESS via ${tier}: ${result.contentSize} bytes`);
          return result;
        }
      } catch (error) {
        const errorMessage = toErrorMessage(error);
        result.tierErrors[tier] = errorMessage;
        console.log(`[WebContentFetcher] ${tier} failed: ${errorMessage}`);
      }
    }

    result.error = 'All fetch tiers failed';
    return result;
  }

  /**
   * Fetch using a specific tier
   */
  private async fetchWithTier(
    tier: FetchTier,
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    switch (tier) {
      case 'vibium':
        return this.fetchWithVibium(options);
      case 'agent-browser':
        return this.fetchWithAgentBrowser(options);
      case 'playwright-stealth':
        return this.fetchWithPlaywrightStealth(options);
      case 'http-fetch':
        return this.fetchWithHttp(options);
      case 'websearch-fallback':
        return this.fetchWithWebSearch(options);
      default:
        throw new Error(`Unknown tier: ${tier}`);
    }
  }

  // ========================================================================
  // Tier 1: Vibium MCP Browser
  // ========================================================================

  private async fetchWithVibium(
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    console.log('[WebContentFetcher] Trying Tier 1: Vibium MCP');

    if (!options.mcpTools?.vibiumLaunch) {
      throw new Error('Vibium MCP tools not provided');
    }

    const { vibiumLaunch, vibiumNavigate, vibiumScreenshot, vibiumFind, vibiumQuit } = options.mcpTools;

    try {
      // Launch browser
      await vibiumLaunch!({ headless: true });

      // Navigate to URL
      await vibiumNavigate!({ url: options.url });

      // Wait for content to load
      await this.sleep(3000);

      // Get page content
      const bodyResult = await vibiumFind!({ selector: 'html' }) as { text?: string };
      const content = bodyResult?.text || '';

      // Capture screenshot
      let screenshotPath: string | undefined;
      if (options.captureScreenshot) {
        const screenshotFile = path.join(options.outputDir!, 'screenshot-vibium.png');
        await vibiumScreenshot!({ filename: screenshotFile });
        screenshotPath = screenshotFile;
      }

      // Cleanup
      await vibiumQuit!();

      if (!content || content.length < 100) {
        throw new Error('Vibium returned insufficient content');
      }

      return {
        success: true,
        content,
        screenshotPath,
        metadata: { tool: 'vibium-mcp' },
      };
    } catch (error) {
      // Ensure cleanup on error
      try {
        await vibiumQuit?.();
      } catch { /* ignore cleanup errors */ }
      throw error;
    }
  }

  // ========================================================================
  // Tier 2: Agent Browser (CLI)
  // ========================================================================

  private async fetchWithAgentBrowser(
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    console.log('[WebContentFetcher] Trying Tier 2: Agent Browser');

    const available = await isAgentBrowserAvailable();
    if (!available) {
      throw new Error('Agent Browser is not available');
    }

    const client = await createBrowserClient({ preference: 'agent-browser' });

    try {
      // Launch browser
      const launchResult = await client.launch({ headless: true });
      if (!launchResult.success) {
        const err = launchResult as { success: false; error: BrowserError };
        throw err.error || new Error('Failed to launch agent-browser');
      }

      // Navigate to URL
      const navResult = await client.navigate(options.url);
      if (!navResult.success) {
        const err = navResult as { success: false; error: BrowserError };
        throw err.error || new Error('Failed to navigate');
      }

      // Wait for content
      await this.sleep(3000);

      // Get page content via evaluate
      const evalResult = await client.evaluate('document.documentElement.outerHTML');
      if (!evalResult.success || !evalResult.value) {
        throw new Error('Failed to get page content');
      }

      const content = evalResult.value as string;

      // Capture screenshot
      let screenshotPath: string | undefined;
      if (options.captureScreenshot) {
        const screenshotFile = path.join(options.outputDir!, 'screenshot-agent-browser.png');
        const ssResult = await client.screenshot({ path: screenshotFile });
        if (ssResult.success) {
          screenshotPath = screenshotFile;
        }
      }

      // Cleanup
      await client.quit();
      await client.dispose();

      return {
        success: true,
        content,
        screenshotPath,
        metadata: { tool: 'agent-browser' },
      };
    } catch (error) {
      // Ensure cleanup
      try {
        await client.quit();
        await client.dispose();
      } catch { /* ignore cleanup errors */ }
      throw error;
    }
  }

  // ========================================================================
  // Tier 3: Playwright + Stealth
  // ========================================================================

  private async fetchWithPlaywrightStealth(
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    console.log('[WebContentFetcher] Trying Tier 3: Playwright + Stealth');

    const workDir = path.join(options.outputDir!, 'playwright-work');
    if (!fs.existsSync(workDir)) {
      fs.mkdirSync(workDir, { recursive: true });
    }

    // Check if playwright-extra is installed, install if needed
    const packageJsonPath = path.join(workDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      fs.writeFileSync(packageJsonPath, JSON.stringify({ name: 'pw-fetch', type: 'commonjs' }));

      try {
        execSync('npm install playwright-extra puppeteer-extra-plugin-stealth playwright', {
          cwd: workDir,
          stdio: 'pipe',
          timeout: 120000,
        });
      } catch (installError) {
        console.log('[WebContentFetcher] Playwright install failed, trying with existing installation');
      }
    }

    // Create the fetch script
    const scriptPath = path.join(workDir, 'fetch-stealth.js');
    const outputPath = path.join(workDir, 'content.html');
    const screenshotPath = path.join(options.outputDir!, 'screenshot-playwright.png');

    const fetchScript = `
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

const TARGET_URL = ${JSON.stringify(options.url)};
const OUTPUT_FILE = ${JSON.stringify(outputPath)};
const SCREENSHOT_FILE = ${JSON.stringify(screenshotPath)};
const USER_AGENT = ${JSON.stringify(options.userAgent)};
const LOCALE = ${JSON.stringify(options.locale)};
const DISMISS_COOKIES = ${options.dismissCookieBanners};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  });

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1920, height: 1080 },
    locale: LOCALE
  });

  const page = await context.newPage();

  try {
    await page.goto(TARGET_URL, {
      waitUntil: 'domcontentloaded',
      timeout: ${options.timeout}
    });

    // Wait for content to load
    await page.waitForTimeout(3000);

    // Try to dismiss cookie banners
    if (DISMISS_COOKIES) {
      try {
        const cookieSelectors = [
          '[data-testid="consent-accept-all"]',
          '.consent-accept',
          '#onetrust-accept-btn-handler',
          '[class*="cookie"] button[class*="accept"]',
          'button[id*="accept"]',
          '[aria-label*="Accept"]'
        ];

        for (const selector of cookieSelectors) {
          const btn = await page.$(selector);
          if (btn) {
            await btn.click();
            await page.waitForTimeout(1000);
            break;
          }
        }
      } catch (e) {
        // Ignore cookie banner errors
      }
    }

    // Scroll to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await page.waitForTimeout(2000);

    // Get content
    const content = await page.content();
    require('fs').writeFileSync(OUTPUT_FILE, content);

    // Screenshot
    await page.screenshot({ path: SCREENSHOT_FILE, fullPage: false });

    console.log(JSON.stringify({
      success: true,
      size: content.length,
      title: await page.title()
    }));

  } catch (error) {
    console.log(JSON.stringify({
      success: false,
      error: error.message
    }));
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
`;

    fs.writeFileSync(scriptPath, fetchScript);

    // Run the script
    try {
      const { stdout } = await execAsync(`node ${scriptPath}`, {
        cwd: workDir,
        timeout: options.timeout! + 30000,
      });

      const result = safeJsonParse(stdout.trim());

      if (!result.success) {
        throw new Error(result.error || 'Playwright fetch failed');
      }

      const content = fs.readFileSync(outputPath, 'utf8');

      return {
        success: true,
        content,
        screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : undefined,
        metadata: {
          tool: 'playwright-stealth',
          title: result.title,
        },
      };
    } catch (error) {
      // Cleanup temp files on error
      try {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      } catch { /* ignore */ }
      throw error;
    }
  }

  // ========================================================================
  // Tier 4: Simple HTTP Fetch
  // ========================================================================

  private async fetchWithHttp(
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    console.log('[WebContentFetcher] Trying Tier 4: HTTP Fetch');

    // Try using MCP webFetch if available
    if (options.mcpTools?.webFetch) {
      const content = await options.mcpTools.webFetch({
        url: options.url,
        prompt: 'Return the complete HTML content of this page',
      });

      if (content && content.length > 100) {
        return {
          success: true,
          content,
          metadata: { tool: 'mcp-webfetch' },
        };
      }
    }

    // Fallback to native fetch
    const response = await fetch(options.url, {
      headers: {
        'User-Agent': options.userAgent!,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${options.locale},en;q=0.5`,
      },
      signal: AbortSignal.timeout(options.timeout!),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();

    if (content.length < 100) {
      throw new Error('HTTP fetch returned insufficient content');
    }

    return {
      success: true,
      content,
      metadata: {
        tool: 'http-fetch',
        statusCode: response.status,
      },
    };
  }

  // ========================================================================
  // Tier 5: Web Search Fallback
  // ========================================================================

  private async fetchWithWebSearch(
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    console.log('[WebContentFetcher] Trying Tier 5: WebSearch Fallback');

    if (!options.mcpTools?.webSearch) {
      throw new Error('WebSearch MCP tool not provided - cannot use fallback tier');
    }

    // Extract domain for search
    const urlObj = new URL(options.url);
    const domain = urlObj.hostname;
    const pathname = urlObj.pathname;

    // Search for information about the page
    const searchQuery = `${domain} ${pathname} site features functionality`;
    const searchResults = await options.mcpTools.webSearch({ query: searchQuery });

    if (!searchResults || searchResults.length < 50) {
      throw new Error('WebSearch returned insufficient results');
    }

    // Create a research-based document
    const researchContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Research: ${options.url}</title>
  <meta name="fetch-method" content="websearch-fallback">
  <meta name="fetch-status" content="degraded">
  <meta name="original-url" content="${options.url}">
  <meta name="fetch-date" content="${new Date().toISOString()}">
</head>
<body>
  <h1>Research-Based Content: ${domain}</h1>
  <p><strong>Note:</strong> This content was generated from web search research because direct page access was blocked.</p>
  <p><strong>Original URL:</strong> ${options.url}</p>
  <hr>
  <div class="research-content">
    ${searchResults}
  </div>
</body>
</html>
`;

    // Save to file for reference
    const researchPath = path.join(options.outputDir!, 'research-content.html');
    fs.writeFileSync(researchPath, researchContent);

    return {
      success: true,
      content: researchContent,
      metadata: {
        tool: 'websearch-fallback',
        searchQuery,
        note: 'Content is research-based, not live page capture',
      },
    };
  }

  // ========================================================================
  // Utility Methods
  // ========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new WebContentFetcher instance
 *
 * @returns WebContentFetcher instance
 */
export function createWebContentFetcher(): WebContentFetcher {
  return new WebContentFetcher();
}

// ============================================================================
// Convenience Function
// ============================================================================

/**
 * Fetch web content with a single function call
 *
 * @param url URL to fetch
 * @param options Additional options
 * @returns Promise<WebContentFetchResult> Fetch result
 *
 * @example
 * ```typescript
 * const result = await fetchWebContent('https://example.com', {
 *   outputDir: '/tmp/fetch',
 *   captureScreenshot: true
 * });
 * ```
 */
export async function fetchWebContent(
  url: string,
  options: Omit<WebContentFetchOptions, 'url'> = {}
): Promise<WebContentFetchResult> {
  const fetcher = new WebContentFetcher();
  return fetcher.fetch({ url, ...options });
}

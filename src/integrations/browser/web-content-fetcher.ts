/**
 * Web Content Fetcher - V3 Browser Cascade
 *
 * Provides resilient web content fetching with a 3-tier cascade:
 * 1. Patchright via StealthBrowserClient (CDP-level stealth, bot protection)
 * 2. Simple HTTP Fetch (for static/unprotected sites)
 * 3. Web Search Fallback (research-based, last resort)
 *
 * Phase 2 consolidation: Removed dead tiers (Vibium, agent-browser, playwright-extra).
 * Patchright tier now uses StealthBrowserClient instead of spawning playwright-extra
 * into temp directories.
 *
 * @module integrations/browser/web-content-fetcher
 * @version 2.0.0
 * @since v3
 */

import * as fs from 'fs';
import * as path from 'path';
import { StealthBrowserClient } from './stealth/stealth-client';
import { isBotChallenge } from './bot-protection';
import { COOKIE_BANNER_SELECTORS } from './cookie-dismissal';
import { toErrorMessage } from '../../shared/error-utils.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Fetch tier identifiers
 */
export type FetchTier =
  | 'patchright-stealth'
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
  success: boolean;
  content: string | null;
  tier: FetchTier | null;
  status: FetchStatus;
  contentSize: number;
  screenshotPath?: string;
  url: string;
  error?: string;
  metadata?: Record<string, unknown>;
  tiersAttempted: FetchTier[];
  tierErrors: Record<string, string>;
}

/**
 * Options for web content fetching
 */
export interface WebContentFetchOptions {
  url: string;
  outputDir?: string;
  timeout?: number;
  captureScreenshot?: boolean;
  skipTiers?: FetchTier[];
  userAgent?: string;
  locale?: string;
  dismissCookieBanners?: boolean;
  /** Seconds to wait for bot protection challenge resolution (0 = disabled) */
  stealthWaitSeconds?: number;
  /** Resource blocking preset: 'functional' | 'performance' | 'visual' | 'none' */
  resourceBlocking?: string;
  /** MCP tools reference (for websearch fallback) */
  mcpTools?: {
    webSearch?: (options: { query: string }) => Promise<string>;
  };
}

// ============================================================================
// WebContentFetcher Class
// ============================================================================

/**
 * Fetches web content using a resilient 3-tier cascade.
 *
 * @example
 * ```typescript
 * const fetcher = new WebContentFetcher();
 * const result = await fetcher.fetch({
 *   url: 'https://www.example.com',
 *   outputDir: '/tmp/fetch-output',
 *   stealthWaitSeconds: 10,  // for bot-protected sites
 * });
 * ```
 */
export class WebContentFetcher {
  private readonly defaultTimeout = 60000;

  async fetch(options: WebContentFetchOptions): Promise<WebContentFetchResult> {
    const {
      url,
      outputDir = '/tmp/web-content-fetch',
      timeout = this.defaultTimeout,
      skipTiers = [],
    } = options;

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
      tierErrors: {},
    };

    const allTiers: FetchTier[] = [
      'patchright-stealth',
      'http-fetch',
      'websearch-fallback',
    ];
    const tiersToTry = allTiers.filter(t => !skipTiers.includes(t));

    for (const tier of tiersToTry) {
      result.tiersAttempted.push(tier);

      try {
        const tierResult = await this.fetchWithTier(tier, options);

        if (tierResult.success && tierResult.content) {
          result.success = true;
          result.content = tierResult.content;
          result.tier = tier;
          result.contentSize = Buffer.byteLength(tierResult.content, 'utf8');
          result.screenshotPath = tierResult.screenshotPath;
          result.metadata = tierResult.metadata;
          result.status = tier === 'websearch-fallback' ? 'degraded' : 'success';

          // Save content to file
          const contentPath = path.join(outputDir, 'content.html');
          fs.writeFileSync(contentPath, tierResult.content);

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

  private async fetchWithTier(
    tier: FetchTier,
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    switch (tier) {
      case 'patchright-stealth':
        return this.fetchWithPatchright(options);
      case 'http-fetch':
        return this.fetchWithHttp(options);
      case 'websearch-fallback':
        return this.fetchWithWebSearch(options);
      default:
        throw new Error(`Unknown tier: ${tier}`);
    }
  }

  // ========================================================================
  // Tier 1: Patchright via StealthBrowserClient
  // ========================================================================

  private async fetchWithPatchright(
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    console.log('[WebContentFetcher] Trying Tier 1: Patchright (CDP-stealth)');

    const stealthWait = options.stealthWaitSeconds ?? 0;
    const client = new StealthBrowserClient({
      cloudflareWaitSeconds: stealthWait,
      akamaiWaitSeconds: stealthWait,
      resourceBlocking: (['functional', 'performance', 'visual'].includes(options.resourceBlocking || '')
        ? (options.resourceBlocking as 'functional' | 'performance' | 'visual')
        : 'functional'),
      userAgent: options.userAgent,
    });

    const available = await client.isAvailable();
    if (!available) {
      throw new Error('Patchright is not installed');
    }

    try {
      // Launch
      const launchResult = await client.launch({
        headless: true,
        viewport: { width: 1920, height: 1080 },
      });
      if (!launchResult.success) {
        throw launchResult.error;
      }

      // Navigate
      const navResult = await client.navigate(options.url);
      if (!navResult.success) {
        throw navResult.error;
      }

      // Bot protection wait is handled by StealthBrowserClient.navigate()

      // Dismiss cookie banners
      if (options.dismissCookieBanners !== false) {
        await this.dismissCookies(client);
      }

      // Get page content
      const evalResult = await client.evaluate<string>('document.documentElement.outerHTML');
      if (!evalResult.success || !evalResult.value) {
        throw new Error('Failed to get page content');
      }

      const content = evalResult.value;

      // Screenshot
      let screenshotPath: string | undefined;
      if (options.captureScreenshot !== false && options.outputDir) {
        const ssPath = path.join(options.outputDir, 'screenshot.png');
        const ssResult = await client.screenshot({ path: ssPath });
        if (ssResult.success) {
          screenshotPath = ssPath;
        }
      }

      // Cleanup
      await client.quit();

      if (content.length < 100) {
        throw new Error('Patchright returned insufficient content');
      }

      return {
        success: true,
        content,
        screenshotPath,
        metadata: { tool: 'patchright-stealth' },
      };
    } catch (error) {
      await client.quit().catch(() => {});
      throw error;
    }
  }

  /**
   * Try to dismiss cookie consent banners using shared selectors.
   */
  private async dismissCookies(client: StealthBrowserClient): Promise<void> {
    for (const selector of COOKIE_BANNER_SELECTORS) {
      try {
        const visible = await client.isVisible(selector);
        if (visible.success && visible.value) {
          await client.click(selector);
          await this.sleep(1000);
          break;
        }
      } catch {
        // Ignore — banner might not exist
      }
    }
  }

  // ========================================================================
  // Tier 2: Simple HTTP Fetch
  // ========================================================================

  private async fetchWithHttp(
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    console.log('[WebContentFetcher] Trying Tier 2: HTTP Fetch');

    const userAgent = options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
    const locale = options.locale || 'en-US';

    const response = await fetch(options.url, {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${locale},en;q=0.5`,
      },
      signal: AbortSignal.timeout(options.timeout || 30000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const content = await response.text();

    if (content.length < 100) {
      throw new Error('HTTP fetch returned insufficient content');
    }

    // Check if we got a bot challenge page
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && isBotChallenge(titleMatch[1])) {
      throw new Error('HTTP fetch received bot challenge page — need stealth browser');
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
  // Tier 3: Web Search Fallback
  // ========================================================================

  private async fetchWithWebSearch(
    options: WebContentFetchOptions
  ): Promise<Partial<WebContentFetchResult>> {
    console.log('[WebContentFetcher] Trying Tier 3: WebSearch Fallback');

    if (!options.mcpTools?.webSearch) {
      throw new Error('WebSearch MCP tool not provided — cannot use fallback tier');
    }

    const urlObj = new URL(options.url);
    const domain = urlObj.hostname;
    const pathname = urlObj.pathname;

    const searchQuery = `${domain} ${pathname} site features functionality`;
    const searchResults = await options.mcpTools.webSearch({ query: searchQuery });

    if (!searchResults || searchResults.length < 50) {
      throw new Error('WebSearch returned insufficient results');
    }

    const researchContent = `<!DOCTYPE html>
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
</html>`;

    if (options.outputDir) {
      const researchPath = path.join(options.outputDir, 'research-content.html');
      fs.writeFileSync(researchPath, researchContent);
    }

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
  // Utility
  // ========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createWebContentFetcher(): WebContentFetcher {
  return new WebContentFetcher();
}

export async function fetchWebContent(
  url: string,
  options: Omit<WebContentFetchOptions, 'url'> = {}
): Promise<WebContentFetchResult> {
  const fetcher = new WebContentFetcher();
  return fetcher.fetch({ url, ...options });
}

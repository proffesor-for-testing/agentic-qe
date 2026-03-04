/**
 * Agentic QE v3 - Playwright Browser Provider
 * Wraps Playwright behind a provider interface for E2E browser checks.
 *
 * Requires: npm install @playwright/test && npx playwright install chromium
 */

import type { BrowserProvider, BrowserConfig, PageCheckResult } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pw: any = null;

async function loadPlaywright(): Promise<void> {
  if (pw) return;
  try {
    pw = await import('playwright');
  } catch {
    throw new Error(
      'playwright package not installed. Run: npm install @playwright/test && npx playwright install chromium'
    );
  }
}

class PlaywrightBrowserProvider implements BrowserProvider {
  private readonly config: BrowserConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private browser: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private context: any = null;
  // Active page for multi-step interactions (navigateAndKeepOpen → click/fill/select)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private activePage: any = null;

  constructor(config: BrowserConfig) {
    this.config = config;
  }

  private async ensureBrowser(): Promise<void> {
    if (this.browser) return;
    await loadPlaywright();
    this.browser = await pw.chromium.launch({
      headless: this.config.headless ?? true,
    });
    this.context = await this.browser.newContext();
    if (this.config.timeout) {
      this.context.setDefaultTimeout(this.config.timeout);
    }
  }

  async navigateAndCapture(path: string): Promise<PageCheckResult> {
    await this.ensureBrowser();
    const page = await this.context.newPage();
    try {
      const url = `${this.config.baseUrl}${path}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      const textContent = await page.textContent('body') ?? '';
      const screenshot = await page.screenshot();
      return {
        url: page.url(),
        title: await page.title(),
        textContent,
        screenshot,
      };
    } finally {
      await page.close();
    }
  }

  async findText(path: string, patterns: string[]): Promise<Map<string, boolean>> {
    await this.ensureBrowser();
    const page = await this.context.newPage();
    try {
      const url = `${this.config.baseUrl}${path}`;
      await page.goto(url, { waitUntil: 'networkidle' });
      const bodyText = await page.textContent('body') ?? '';
      const results = new Map<string, boolean>();
      for (const pattern of patterns) {
        results.set(pattern, bodyText.includes(pattern));
      }
      return results;
    } finally {
      await page.close();
    }
  }

  async click(selector: string): Promise<void> {
    if (!this.activePage) throw new Error('No active page — call navigateAndKeepOpen first');
    await this.activePage.click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    if (!this.activePage) throw new Error('No active page — call navigateAndKeepOpen first');
    await this.activePage.fill(selector, value);
  }

  async selectOption(selector: string, value: string): Promise<void> {
    if (!this.activePage) throw new Error('No active page — call navigateAndKeepOpen first');
    await this.activePage.selectOption(selector, value);
  }

  async waitForSelector(selector: string, options?: { timeout?: number }): Promise<void> {
    if (!this.activePage) throw new Error('No active page — call navigateAndKeepOpen first');
    await this.activePage.waitForSelector(selector, { timeout: options?.timeout ?? 10000 });
  }

  async navigateAndKeepOpen(path: string): Promise<PageCheckResult & { pageRef: string }> {
    await this.ensureBrowser();
    // Close previous active page if any
    if (this.activePage) {
      await this.activePage.close().catch(() => {});
    }
    this.activePage = await this.context.newPage();
    const url = `${this.config.baseUrl}${path}`;
    await this.activePage.goto(url, { waitUntil: 'networkidle' });
    const textContent = await this.activePage.textContent('body') ?? '';
    return {
      url: this.activePage.url(),
      title: await this.activePage.title(),
      textContent,
      pageRef: 'active',
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureBrowser();
      const page = await this.context.newPage();
      await page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
      await page.close();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.activePage) {
      await this.activePage.close().catch(() => {});
      this.activePage = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
    }
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createBrowserProvider(config: BrowserConfig): BrowserProvider {
  return new PlaywrightBrowserProvider(config);
}

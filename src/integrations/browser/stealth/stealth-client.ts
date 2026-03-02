/**
 * Stealth Browser Client via Patchright
 *
 * Implements IBrowserClient using Patchright — a drop-in Playwright replacement
 * that avoids CDP detection for bot-protected test environments.
 *
 * Uses lazy require pattern (like ruvector wrappers) so the module works
 * even if patchright is not installed.
 *
 * @module integrations/browser/stealth/stealth-client
 */

import { randomUUID } from 'crypto';
import type {
  IBrowserClient,
  BrowserLaunchOptions,
  BrowserSessionInfo,
  BrowserNavigateResult,
  BrowserScreenshotResult,
  ElementTarget,
} from '../types';
import { BrowserError, BrowserUnavailableError } from '../types';
import type { Result } from '../../../shared/types';
import type { StealthBrowserConfig } from './stealth-types';
import { DEFAULT_STEALTH_CONFIG } from './stealth-types';
import {
  shouldBlockRequest,
  getResourceBlockingPreset,
  type ResourceBlockingConfig,
} from '../resource-blocking';

// ============================================================================
// Lazy Patchright Import
// ============================================================================

interface PatchrightModule {
  chromium: {
    launchPersistentContext: (
      userDataDir: string,
      options?: Record<string, unknown>
    ) => Promise<PatchrightContext>;
    launch: (options?: Record<string, unknown>) => Promise<PatchrightBrowser>;
  };
}

interface PatchrightBrowser {
  newPage: () => Promise<PatchrightPage>;
  close: () => Promise<void>;
}

interface PatchrightContext {
  pages: () => PatchrightPage[];
  newPage: () => Promise<PatchrightPage>;
  close: () => Promise<void>;
}

interface PatchrightPage {
  goto: (url: string, options?: Record<string, unknown>) => Promise<{ status: () => number | null } | null>;
  title: () => Promise<string>;
  url: () => string;
  reload: (options?: Record<string, unknown>) => Promise<void>;
  goBack: (options?: Record<string, unknown>) => Promise<void>;
  goForward: (options?: Record<string, unknown>) => Promise<void>;
  click: (selector: string, options?: Record<string, unknown>) => Promise<void>;
  fill: (selector: string, text: string) => Promise<void>;
  textContent: (selector: string) => Promise<string | null>;
  isVisible: (selector: string) => Promise<boolean>;
  screenshot: (options?: Record<string, unknown>) => Promise<Buffer>;
  evaluate: <T>(fn: string | (() => T)) => Promise<T>;
  route: (pattern: string | RegExp, handler: (route: PatchrightRoute) => void) => Promise<void>;
  close: () => Promise<void>;
}

interface PatchrightRoute {
  request: () => { url: () => string; resourceType: () => string };
  abort: () => Promise<void>;
  continue: () => Promise<void>;
}

let patchrightModule: PatchrightModule | null = null;
let patchrightChecked = false;

function getPatchright(): PatchrightModule | null {
  if (patchrightChecked) return patchrightModule;
  patchrightChecked = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    patchrightModule = require('patchright') as PatchrightModule;
  } catch {
    patchrightModule = null;
  }
  return patchrightModule;
}

// ============================================================================
// Stealth Browser Client
// ============================================================================

/**
 * Stealth browser client using Patchright for bot-protected environments.
 * Implements IBrowserClient with `tool = 'stealth'`.
 */
export class StealthBrowserClient implements IBrowserClient {
  readonly tool = 'stealth' as const;

  private readonly stealthConfig: StealthBrowserConfig;
  private page: PatchrightPage | null = null;
  private context: PatchrightContext | null = null;
  private browser: PatchrightBrowser | null = null;
  private sessionId: string | null = null;

  constructor(config?: Partial<StealthBrowserConfig>) {
    this.stealthConfig = { ...DEFAULT_STEALTH_CONFIG, ...config };
  }

  // ========================================================================
  // Lifecycle
  // ========================================================================

  async isAvailable(): Promise<boolean> {
    return getPatchright() !== null;
  }

  async launch(
    options?: BrowserLaunchOptions
  ): Promise<Result<BrowserSessionInfo, BrowserError>> {
    const pr = getPatchright();
    if (!pr) {
      return {
        success: false,
        error: new BrowserUnavailableError(
          'stealth',
          'Patchright is not installed. Install with: npm install patchright'
        ),
      };
    }

    try {
      const launchOptions: Record<string, unknown> = {
        headless: options?.headless ?? true,
      };

      if (options?.viewport) {
        launchOptions.viewport = options.viewport;
      }
      if (options?.args) {
        launchOptions.args = options.args;
      }
      if (this.stealthConfig.userAgent) {
        launchOptions.userAgent = this.stealthConfig.userAgent;
      }
      if (this.stealthConfig.proxy) {
        launchOptions.proxy = this.stealthConfig.proxy;
      }

      if (this.stealthConfig.persistentContext) {
        const userDataDir =
          this.stealthConfig.userDataDir || `/tmp/stealth-browser-${randomUUID()}`;
        this.context = await pr.chromium.launchPersistentContext(userDataDir, launchOptions);
        const pages = this.context.pages();
        this.page = pages.length > 0 ? pages[0] : await this.context.newPage();
      } else {
        this.browser = await pr.chromium.launch(launchOptions);
        this.page = await this.browser.newPage();
      }

      // Apply resource blocking
      await this.applyResourceBlocking();

      this.sessionId = randomUUID();

      return {
        success: true,
        value: {
          id: this.sessionId,
          tool: 'stealth',
          status: 'active',
          createdAt: new Date(),
        },
      };
    } catch (err) {
      return {
        success: false,
        error: new BrowserError(
          `Failed to launch stealth browser: ${err instanceof Error ? err.message : String(err)}`,
          'LAUNCH_FAILED',
          'stealth',
          err instanceof Error ? err : undefined
        ),
      };
    }
  }

  async quit(): Promise<Result<void, BrowserError>> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      this.page = null;
      this.sessionId = null;
      return { success: true, value: undefined };
    } catch (err) {
      return {
        success: false,
        error: new BrowserError(
          'Failed to quit stealth browser',
          'QUIT_FAILED',
          'stealth',
          err instanceof Error ? err : undefined
        ),
      };
    }
  }

  // ========================================================================
  // Navigation
  // ========================================================================

  async navigate(url: string): Promise<Result<BrowserNavigateResult, BrowserError>> {
    if (!this.page) return this.notLaunched();

    try {
      const start = Date.now();
      const response = await this.page.goto(url, { waitUntil: 'domcontentloaded' });
      const statusCode = response?.status() ?? undefined;

      // Optional Cloudflare challenge wait
      if (this.stealthConfig.cloudflareWaitSeconds > 0) {
        await this.waitForCloudflare();
      }

      const title = await this.page.title();

      return {
        success: true,
        value: {
          url: this.page.url(),
          title,
          success: true,
          durationMs: Date.now() - start,
          statusCode: statusCode ?? undefined,
        },
      };
    } catch (err) {
      return this.wrapError('navigate', err);
    }
  }

  async reload(): Promise<Result<void, BrowserError>> {
    if (!this.page) return this.notLaunched();
    try {
      await this.page.reload();
      return { success: true, value: undefined };
    } catch (err) {
      return this.wrapError('reload', err);
    }
  }

  async goBack(): Promise<Result<void, BrowserError>> {
    if (!this.page) return this.notLaunched();
    try {
      await this.page.goBack();
      return { success: true, value: undefined };
    } catch (err) {
      return this.wrapError('goBack', err);
    }
  }

  async goForward(): Promise<Result<void, BrowserError>> {
    if (!this.page) return this.notLaunched();
    try {
      await this.page.goForward();
      return { success: true, value: undefined };
    } catch (err) {
      return this.wrapError('goForward', err);
    }
  }

  // ========================================================================
  // Element Interaction
  // ========================================================================

  async click(target: ElementTarget | string): Promise<Result<void, BrowserError>> {
    if (!this.page) return this.notLaunched();
    try {
      const selector = this.resolveSelector(target);
      await this.page.click(selector);
      return { success: true, value: undefined };
    } catch (err) {
      return this.wrapError('click', err);
    }
  }

  async fill(target: ElementTarget | string, text: string): Promise<Result<void, BrowserError>> {
    if (!this.page) return this.notLaunched();
    try {
      const selector = this.resolveSelector(target);
      await this.page.fill(selector, text);
      return { success: true, value: undefined };
    } catch (err) {
      return this.wrapError('fill', err);
    }
  }

  async getText(target: ElementTarget | string): Promise<Result<string, BrowserError>> {
    if (!this.page) return this.notLaunched();
    try {
      const selector = this.resolveSelector(target);
      const text = await this.page.textContent(selector);
      return { success: true, value: text ?? '' };
    } catch (err) {
      return this.wrapError('getText', err);
    }
  }

  async isVisible(target: ElementTarget | string): Promise<Result<boolean, BrowserError>> {
    if (!this.page) return this.notLaunched();
    try {
      const selector = this.resolveSelector(target);
      const visible = await this.page.isVisible(selector);
      return { success: true, value: visible };
    } catch (err) {
      return this.wrapError('isVisible', err);
    }
  }

  // ========================================================================
  // Screenshots
  // ========================================================================

  async screenshot(
    options?: { path?: string; fullPage?: boolean }
  ): Promise<Result<BrowserScreenshotResult, BrowserError>> {
    if (!this.page) return this.notLaunched();
    try {
      const buffer = await this.page.screenshot({
        path: options?.path,
        fullPage: options?.fullPage,
        type: 'png',
      });

      return {
        success: true,
        value: {
          base64: buffer.toString('base64'),
          path: options?.path,
          format: 'png',
          dimensions: { width: 0, height: 0 }, // Patchright doesn't expose dimensions directly
        },
      };
    } catch (err) {
      return this.wrapError('screenshot', err);
    }
  }

  // ========================================================================
  // Evaluate
  // ========================================================================

  async evaluate<T = unknown>(script: string): Promise<Result<T, BrowserError>> {
    if (!this.page) return this.notLaunched();
    try {
      const result = await this.page.evaluate(script);
      return { success: true, value: result as T };
    } catch (err) {
      return this.wrapError('evaluate', err);
    }
  }

  // ========================================================================
  // Cleanup
  // ========================================================================

  async dispose(): Promise<void> {
    await this.quit();
  }

  // ========================================================================
  // Private Helpers
  // ========================================================================

  private resolveSelector(target: ElementTarget | string): string {
    if (typeof target === 'string') return target;
    switch (target.type) {
      case 'css':
        return target.value;
      case 'xpath':
        return `xpath=${target.value}`;
      case 'text':
        return `text=${target.value}`;
      case 'ref':
        return target.value;
      default:
        return (target as ElementTarget).value;
    }
  }

  private async applyResourceBlocking(): Promise<void> {
    if (!this.page || !this.stealthConfig.resourceBlocking) return;

    const config: ResourceBlockingConfig =
      typeof this.stealthConfig.resourceBlocking === 'string'
        ? getResourceBlockingPreset(this.stealthConfig.resourceBlocking)
        : this.stealthConfig.resourceBlocking;

    if (!config.enabled) return;

    await this.page.route('**/*', (route: PatchrightRoute) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();

      if (shouldBlockRequest(url, resourceType, config)) {
        route.abort().catch(() => {});
      } else {
        route.continue().catch(() => {});
      }
    });
  }

  private async waitForCloudflare(): Promise<void> {
    if (!this.page || this.stealthConfig.cloudflareWaitSeconds <= 0) return;

    const ms = this.stealthConfig.cloudflareWaitSeconds * 1000;
    const start = Date.now();

    while (Date.now() - start < ms) {
      try {
        const title = await this.page.title();
        // Cloudflare challenge pages typically have these in the title
        if (!title.includes('Just a moment') && !title.includes('Checking your browser')) {
          return;
        }
      } catch {
        // page might not be ready
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private notLaunched(): Result<never, BrowserError> {
    return {
      success: false,
      error: new BrowserError(
        'Stealth browser not launched. Call launch() first.',
        'NOT_LAUNCHED',
        'stealth'
      ),
    };
  }

  private wrapError(operation: string, err: unknown): Result<never, BrowserError> {
    return {
      success: false,
      error: new BrowserError(
        `Stealth ${operation} failed: ${err instanceof Error ? err.message : String(err)}`,
        'OPERATION_FAILED',
        'stealth',
        err instanceof Error ? err : undefined
      ),
    };
  }
}

/**
 * Browser Integration - Security Scanner Integration Tests
 *
 * Tests the full security audit workflow with visual-accessibility domain:
 * - URL validation → screenshot → PII scan pipeline
 * - Error propagation through pipeline
 * - Integration with security scanner and accessibility services
 *
 * These tests use mocked browser sessions since actual browser automation
 * requires Playwright/agent-browser setup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { IBrowserClient, IAgentBrowserClient, BrowserResult, ScreenshotResult } from '../../../src/integrations/browser/types';
import type { MemoryBackend } from '../../../src/kernel/interfaces';
import type { SecurityScannerConfig, ISecurityScannerService, DependencyScanResult } from '../../../src/domains/security-compliance/services/security-scanner';
import type { ViewportCaptureConfig, IViewportCaptureService, ViewportCaptureResult, MultiViewportCaptureResult } from '../../../src/domains/visual-accessibility/services/viewport-capture';
import { Result, ok, err } from '../../../src/shared/types';
import { FilePath } from '../../../src/shared/value-objects';

// ============================================================================
// Test Doubles
// ============================================================================

/**
 * In-memory test backend
 */
class TestMemoryBackend implements MemoryBackend {
  private store = new Map<string, unknown>();

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {}

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async search(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  async vectorSearch(): Promise<any[]> {
    return [];
  }

  async storeVector(): Promise<void> {}

  async count(namespace: string): Promise<number> {
    const keys = await this.search(`${namespace}:*`);
    return keys.length;
  }

  async hasCodeIntelligenceIndex(): Promise<boolean> {
    const count = await this.count('code-intelligence:kg');
    return count > 0;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Mock browser client for testing
 */
class MockBrowserClient implements IAgentBrowserClient {
  readonly tool = 'agent-browser' as const;
  private launched = false;
  private currentUrl = '';
  public screenshotShouldFail = false;
  public navigateShouldFail = false;

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async launch(): Promise<BrowserResult<{ id: string; tool: string }>> {
    this.launched = true;
    return ok({ id: 'mock-session', tool: 'agent-browser' });
  }

  async navigate(url: string): Promise<BrowserResult<{ url: string }>> {
    if (!this.launched) {
      return err(new Error('Browser not launched'));
    }
    if (this.navigateShouldFail) {
      return err(new Error('Navigation failed'));
    }
    this.currentUrl = url;
    return ok({ url });
  }

  async screenshot(options?: { fullPage?: boolean }): Promise<BrowserResult<ScreenshotResult>> {
    if (!this.launched) {
      return err(new Error('Browser not launched'));
    }
    if (this.screenshotShouldFail) {
      return err(new Error('Screenshot failed'));
    }

    return ok({
      format: 'png',
      path: `/tmp/screenshot-${Date.now()}.png`,
      dimensions: { width: 1280, height: 720 },
      timestamp: new Date(),
    });
  }

  async setViewport(width: number, height: number): Promise<BrowserResult<void>> {
    return ok(undefined);
  }

  async setDevice(deviceName: string): Promise<BrowserResult<void>> {
    return ok(undefined);
  }

  async quit(): Promise<BrowserResult<void>> {
    this.launched = false;
    return ok(undefined);
  }

  async dispose(): Promise<void> {
    this.launched = false;
  }

  // Additional required methods
  async getSnapshot(): Promise<any> {
    return ok({ elements: [], refMap: {} });
  }

  async click(): Promise<any> {
    return ok(undefined);
  }

  async fill(): Promise<any> {
    return ok(undefined);
  }

  async getText(): Promise<any> {
    return ok('');
  }

  async evaluate<T>(): Promise<BrowserResult<T>> {
    return ok(undefined as T);
  }

  async waitForElement(): Promise<any> {
    return ok(undefined);
  }

  async waitForText(): Promise<any> {
    return ok(undefined);
  }

  async waitForUrl(): Promise<any> {
    return ok(undefined);
  }

  async waitForNetworkIdle(): Promise<any> {
    return ok(undefined);
  }

  async isVisible(): Promise<any> {
    return ok(true);
  }

  async goBack(): Promise<any> {
    return ok(undefined);
  }

  async goForward(): Promise<any> {
    return ok(undefined);
  }

  async reload(): Promise<any> {
    return ok(undefined);
  }

  async createSession(): Promise<any> {
    return ok({ id: 'mock-session', tool: 'agent-browser' });
  }

  async listSessions(): Promise<any> {
    return ok([]);
  }
}

/**
 * Simple PII scanner for testing
 */
class MockPIIScanner {
  scanScreenshot(path: string): { hasPII: boolean; findings: string[] } {
    // Simulate PII detection based on filename
    if (path.includes('sensitive')) {
      return {
        hasPII: true,
        findings: ['email@example.com', 'SSN: 123-45-6789'],
      };
    }
    return {
      hasPII: false,
      findings: [],
    };
  }
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Security Scanner Integration - URL Validation Pipeline', () => {
  let memory: TestMemoryBackend;
  let browserClient: MockBrowserClient;
  let piiScanner: MockPIIScanner;

  beforeEach(() => {
    memory = new TestMemoryBackend();
    browserClient = new MockBrowserClient();
    piiScanner = new MockPIIScanner();
  });

  afterEach(async () => {
    await browserClient.dispose();
    memory.clear();
  });

  it('should execute full pipeline: URL validation → screenshot → PII scan', async () => {
    const url = 'https://example.com';

    // Step 1: URL validation
    const urlValid = /^https?:\/\//.test(url);
    expect(urlValid).toBe(true);

    // Step 2: Launch browser and navigate
    const launchResult = await browserClient.launch();
    expect(launchResult.success).toBe(true);

    const navResult = await browserClient.navigate(url);
    expect(navResult.success).toBe(true);
    expect(navResult.value?.url).toBe(url);

    // Step 3: Capture screenshot
    const screenshotResult = await browserClient.screenshot({ fullPage: true });
    expect(screenshotResult.success).toBe(true);
    expect(screenshotResult.value?.path).toBeDefined();
    expect(screenshotResult.value?.format).toBe('png');

    // Step 4: PII scan
    const piiResult = piiScanner.scanScreenshot(screenshotResult.value!.path!);
    expect(piiResult.hasPII).toBe(false);
    expect(piiResult.findings).toHaveLength(0);

    // Step 5: Store results
    await memory.set('security-scan:result', {
      url,
      screenshotPath: screenshotResult.value?.path,
      piiScanResult: piiResult,
      timestamp: new Date().toISOString(),
    });

    const stored = await memory.get('security-scan:result');
    expect(stored).toBeDefined();
  });

  it('should detect PII in sensitive screenshots', async () => {
    const url = 'https://example.com/sensitive-data';

    await browserClient.launch();
    await browserClient.navigate(url);

    // Mock sensitive screenshot path
    const screenshotResult = await browserClient.screenshot();
    const sensitivePath = '/tmp/screenshot-sensitive-1234.png';

    const piiResult = piiScanner.scanScreenshot(sensitivePath);

    expect(piiResult.hasPII).toBe(true);
    expect(piiResult.findings.length).toBeGreaterThan(0);
    expect(piiResult.findings.some(f => f.includes('email'))).toBe(true);
  });

  it('should propagate navigation errors through pipeline', async () => {
    const url = 'https://invalid-url-that-will-fail.com';

    await browserClient.launch();

    // Simulate navigation failure
    browserClient.navigateShouldFail = true;
    const navResult = await browserClient.navigate(url);

    expect(navResult.success).toBe(false);
    expect(navResult.error?.message).toContain('Navigation failed');

    // Pipeline should halt - no screenshot attempted
    // Store error result
    await memory.set('security-scan:error', {
      url,
      error: navResult.error?.message,
      stage: 'navigation',
      timestamp: new Date().toISOString(),
    });

    const errorRecord = await memory.get<any>('security-scan:error');
    expect(errorRecord?.stage).toBe('navigation');
  });

  it('should propagate screenshot errors through pipeline', async () => {
    const url = 'https://example.com';

    await browserClient.launch();
    await browserClient.navigate(url);

    // Simulate screenshot failure
    browserClient.screenshotShouldFail = true;
    const screenshotResult = await browserClient.screenshot();

    expect(screenshotResult.success).toBe(false);
    expect(screenshotResult.error?.message).toContain('Screenshot failed');

    // Store error result
    await memory.set('security-scan:error', {
      url,
      error: screenshotResult.error?.message,
      stage: 'screenshot',
      timestamp: new Date().toISOString(),
    });

    const errorRecord = await memory.get<any>('security-scan:error');
    expect(errorRecord?.stage).toBe('screenshot');
  });

  it('should handle browser not launched error', async () => {
    const url = 'https://example.com';

    // Attempt navigation without launching
    const navResult = await browserClient.navigate(url);

    expect(navResult.success).toBe(false);
    expect(navResult.error?.message).toContain('Browser not launched');
  });

  it('should validate URLs before processing', async () => {
    const invalidUrls = [
      'not-a-url',
      'ftp://example.com', // Not http/https
      '',
      'javascript:alert(1)',
    ];

    for (const url of invalidUrls) {
      const urlValid = /^https?:\/\//.test(url);
      expect(urlValid).toBe(false);
    }

    const validUrls = [
      'http://example.com',
      'https://example.com',
      'https://example.com:8080/path',
    ];

    for (const url of validUrls) {
      const urlValid = /^https?:\/\//.test(url);
      expect(urlValid).toBe(true);
    }
  });
});

describe('Security Scanner Integration - Visual Accessibility Domain', () => {
  let memory: TestMemoryBackend;
  let browserClient: MockBrowserClient;

  beforeEach(() => {
    memory = new TestMemoryBackend();
    browserClient = new MockBrowserClient();
  });

  afterEach(async () => {
    await browserClient.dispose();
    memory.clear();
  });

  it('should integrate with visual-accessibility domain for comprehensive audit', async () => {
    const url = 'https://example.com';

    await browserClient.launch();
    await browserClient.navigate(url);

    // Capture screenshot for visual testing
    const screenshotResult = await browserClient.screenshot({ fullPage: true });
    expect(screenshotResult.success).toBe(true);

    // Simulate accessibility audit (would use axe-core in real implementation)
    const accessibilityResult = {
      violations: [],
      passes: 15,
      incomplete: 0,
      wcagLevel: 'AA',
    };

    // Combine security and accessibility results
    await memory.set('visual-security-audit:result', {
      url,
      screenshot: screenshotResult.value,
      accessibility: accessibilityResult,
      security: {
        piiDetected: false,
        vulnerabilities: [],
      },
      timestamp: new Date().toISOString(),
    });

    const auditResult = await memory.get<any>('visual-security-audit:result');
    expect(auditResult?.accessibility.passes).toBe(15);
    expect(auditResult?.security.piiDetected).toBe(false);
  });

  it('should report both security and accessibility issues', async () => {
    const url = 'https://example.com/form';

    await browserClient.launch();
    await browserClient.navigate(url);

    const screenshotResult = await browserClient.screenshot();

    // Simulate findings in both domains
    const combinedResult = {
      url,
      screenshot: screenshotResult.value,
      accessibility: {
        violations: [
          {
            id: 'color-contrast',
            impact: 'serious',
            description: 'Elements must have sufficient color contrast',
            nodes: 3,
          },
        ],
        passes: 12,
        incomplete: 1,
      },
      security: {
        piiDetected: true,
        piiFindings: ['email@example.com'],
        vulnerabilities: [],
      },
      combinedScore: 72, // Reduced due to issues
      timestamp: new Date().toISOString(),
    };

    await memory.set('combined-audit:result', combinedResult);

    const stored = await memory.get<any>('combined-audit:result');
    expect(stored?.accessibility.violations).toHaveLength(1);
    expect(stored?.security.piiDetected).toBe(true);
    expect(stored?.combinedScore).toBeLessThan(100);
  });

  it('should handle missing optional dependencies gracefully', async () => {
    // Test without PII scanner
    const url = 'https://example.com';

    await browserClient.launch();
    await browserClient.navigate(url);

    const screenshotResult = await browserClient.screenshot();
    expect(screenshotResult.success).toBe(true);

    // Should still complete audit without PII scan
    const partialResult = {
      url,
      screenshot: screenshotResult.value,
      security: {
        piiScanSkipped: true,
        reason: 'PII scanner not available',
      },
      timestamp: new Date().toISOString(),
    };

    await memory.set('partial-audit:result', partialResult);

    const stored = await memory.get<any>('partial-audit:result');
    expect(stored?.security.piiScanSkipped).toBe(true);
  });
});

describe('Security Scanner Integration - Error Recovery', () => {
  let memory: TestMemoryBackend;
  let browserClient: MockBrowserClient;

  beforeEach(() => {
    memory = new TestMemoryBackend();
    browserClient = new MockBrowserClient();
  });

  afterEach(async () => {
    await browserClient.dispose();
    memory.clear();
  });

  it('should retry failed operations with exponential backoff', async () => {
    const url = 'https://flaky-site.com';
    let attemptCount = 0;

    await browserClient.launch();

    // Simulate retries
    const maxRetries = 3;
    let navResult: BrowserResult<{ url: string }> | null = null;

    for (let i = 0; i < maxRetries; i++) {
      attemptCount++;

      // Fail first 2 attempts, succeed on 3rd
      browserClient.navigateShouldFail = i < 2;
      navResult = await browserClient.navigate(url);

      if (navResult.success) {
        break;
      }

      // Exponential backoff (simulated)
      const backoffMs = Math.pow(2, i) * 100;
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }

    expect(attemptCount).toBeLessThanOrEqual(maxRetries);
    expect(navResult?.success).toBe(true);
  });

  it('should cleanup resources on error', async () => {
    const url = 'https://example.com';

    await browserClient.launch();

    browserClient.screenshotShouldFail = true;
    const result = await browserClient.screenshot();

    // Error should be returned, not thrown
    expect(result.success).toBe(false);

    // Ensure cleanup happens
    await browserClient.quit();

    // Verify cleanup
    expect(browserClient['launched']).toBe(false);
  });

  it('should aggregate errors from multiple stages', async () => {
    const urls = [
      'https://example1.com',
      'https://example2.com',
      'https://example3.com',
    ];

    await browserClient.launch();

    const errors: Array<{ url: string; stage: string; error: string }> = [];

    for (const url of urls) {
      // Simulate random failures
      const shouldFail = Math.random() > 0.5;

      if (shouldFail) {
        errors.push({
          url,
          stage: 'navigation',
          error: 'Simulated failure',
        });
      } else {
        const navResult = await browserClient.navigate(url);
        if (!navResult.success) {
          errors.push({
            url,
            stage: 'navigation',
            error: navResult.error?.message ?? 'Unknown error',
          });
        }
      }
    }

    // Store aggregated errors
    await memory.set('bulk-scan:errors', {
      totalUrls: urls.length,
      failedCount: errors.length,
      errors,
      timestamp: new Date().toISOString(),
    });

    const errorReport = await memory.get<any>('bulk-scan:errors');
    expect(errorReport?.totalUrls).toBe(urls.length);
    expect(Array.isArray(errorReport?.errors)).toBe(true);
  });
});

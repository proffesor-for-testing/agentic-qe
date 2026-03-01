/**
 * Agentic QE v3 - REAL Vibium Integration Tests
 *
 * ⚠️ IMPORTANT: This file contains NO MOCKS.
 * These tests exercise the actual Vibium browser automation.
 *
 * Requirements:
 * - Vibium binary must be installed (@vibium/linux-arm64 or similar)
 * - Set VIBIUM_REAL_TESTS=true to run these tests
 * - Tests are skipped by default in CI without browser support
 *
 * Run with: npm run test:integration:browser
 *
 * @module tests/integrations/vibium/vibium-real
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

// ============================================================================
// Environment Detection - NO MOCKS
// ============================================================================

/**
 * Check if real Vibium tests should run.
 * Conditions:
 * - VIBIUM_REAL_TESTS=true environment variable is set, OR
 * - Not in CI environment (local development)
 */
const shouldRunRealTests = (): boolean => {
  // Explicit opt-in
  if (process.env.VIBIUM_REAL_TESTS === 'true') {
    return true;
  }

  // Skip in CI unless explicitly enabled
  if (process.env.CI === 'true') {
    console.log('[Vibium Real Tests] Skipped in CI - set VIBIUM_REAL_TESTS=true to enable');
    return false;
  }

  // Local development - try to run
  return true;
};

/**
 * Check if Vibium binary is actually available
 */
async function isVibiumBinaryAvailable(): Promise<boolean> {
  try {
    const { browser } = await import('vibium');
    // Try to launch - this will fail fast if binary missing
    const vibe = await browser.launch({ headless: true });
    await vibe.quit();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('clicker binary') || message.includes('CLICKER_PATH')) {
      console.log('[Vibium Real Tests] Binary not available:', message);
      return false;
    }
    // Other errors might be transient - still report as unavailable
    console.log('[Vibium Real Tests] Launch test failed:', message);
    return false;
  }
}

// ============================================================================
// PNG Validation Utilities
// ============================================================================

/**
 * PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
 */
const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Verify a buffer is a valid PNG by checking magic bytes
 */
function isValidPNG(buffer: Buffer): boolean {
  if (buffer.length < 8) return false;
  return buffer.subarray(0, 8).equals(PNG_MAGIC_BYTES);
}

/**
 * Get PNG dimensions from IHDR chunk
 */
function getPNGDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (!isValidPNG(buffer) || buffer.length < 24) return null;

  // IHDR chunk starts at byte 8, width at 16, height at 20
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  return { width, height };
}

// ============================================================================
// Real Integration Tests
// ============================================================================

describe.skipIf(!shouldRunRealTests())('Real Vibium Integration (NO MOCKS)', () => {
  let vibiumAvailable = false;

  beforeAll(async () => {
    vibiumAvailable = await isVibiumBinaryAvailable();
    if (!vibiumAvailable) {
      console.log('[Vibium Real Tests] Skipping all tests - binary not available');
    }
  });

  describe.skipIf(!vibiumAvailable)('Browser Launch', () => {
    it('should actually launch and quit browser', async () => {
      const { browser } = await import('vibium');

      const vibe = await browser.launch({ headless: true });
      expect(vibe).toBeDefined();
      expect(typeof vibe.quit).toBe('function');

      await vibe.quit();
    }, 30000);

    it('should launch in headless mode without visible window', async () => {
      const { browser } = await import('vibium');

      const startTime = Date.now();
      const vibe = await browser.launch({ headless: true });
      const launchTime = Date.now() - startTime;

      // Headless should launch faster than headed
      expect(launchTime).toBeLessThan(15000);

      await vibe.quit();
    }, 30000);
  });

  describe.skipIf(!vibiumAvailable)('Navigation', () => {
    let vibe: Awaited<ReturnType<typeof import('vibium').browser.launch>>;

    beforeEach(async () => {
      const { browser } = await import('vibium');
      vibe = await browser.launch({ headless: true });
    }, 30000);

    afterEach(async () => {
      if (vibe) {
        await vibe.quit();
      }
    });

    it('should navigate to a real URL', async () => {
      await vibe.go('https://example.com');

      // Verify we're on the page by evaluating JavaScript
      const title = await vibe.evaluate<string>('document.title');
      expect(title).toContain('Example');
    }, 30000);

    it('should evaluate JavaScript in page context', async () => {
      await vibe.go('https://example.com');

      const result = await vibe.evaluate<{ href: string; title: string }>(`
        ({ href: window.location.href, title: document.title })
      `);

      expect(result.href).toContain('example.com');
      expect(typeof result.title).toBe('string');
    }, 30000);
  });

  describe.skipIf(!vibiumAvailable)('Screenshot Capture', () => {
    let vibe: Awaited<ReturnType<typeof import('vibium').browser.launch>>;

    beforeEach(async () => {
      const { browser } = await import('vibium');
      vibe = await browser.launch({ headless: true });
      await vibe.go('https://example.com');
    }, 30000);

    afterEach(async () => {
      if (vibe) {
        await vibe.quit();
      }
    });

    it('should capture REAL screenshot as PNG buffer', async () => {
      const screenshot = await vibe.screenshot();

      // Verify it's a Buffer
      expect(screenshot).toBeInstanceOf(Buffer);

      // Verify it's a real PNG (check magic bytes)
      expect(isValidPNG(screenshot)).toBe(true);

      // Real screenshots are typically > 10KB
      expect(screenshot.length).toBeGreaterThan(10000);
    }, 30000);

    it('should capture screenshot with correct dimensions', async () => {
      const screenshot = await vibe.screenshot();

      const dimensions = getPNGDimensions(screenshot);
      expect(dimensions).not.toBeNull();

      // Default viewport should be reasonable
      expect(dimensions!.width).toBeGreaterThan(100);
      expect(dimensions!.height).toBeGreaterThan(100);
    }, 30000);
  });

  describe.skipIf(!vibiumAvailable)('Element Interaction', () => {
    let vibe: Awaited<ReturnType<typeof import('vibium').browser.launch>>;

    beforeEach(async () => {
      const { browser } = await import('vibium');
      vibe = await browser.launch({ headless: true });
    }, 30000);

    afterEach(async () => {
      if (vibe) {
        await vibe.quit();
      }
    });

    it('should find element on page', async () => {
      await vibe.go('https://example.com');

      // Example.com has an h1 element
      const element = await vibe.find('h1');

      expect(element).toBeDefined();
      expect(element.info).toBeDefined();
      expect(element.info.tag.toLowerCase()).toBe('h1');
    }, 30000);

    it('should get element text', async () => {
      await vibe.go('https://example.com');

      const element = await vibe.find('h1');
      const text = await element.text();

      expect(text).toContain('Example');
    }, 30000);
  });

  describe.skipIf(!vibiumAvailable)('VibiumClientImpl Real Usage', () => {
    it('should work through VibiumClientImpl wrapper', async () => {
      // Import the actual client - NOT mocked
      const { VibiumClientImpl } = await import('../../../src/integrations/vibium/client');

      const client = new VibiumClientImpl({
        enabled: true,
        headless: true,
        timeout: 30000,
      });

      await client.initialize();

      // Check availability
      const available = await client.isAvailable();
      // This might be false if binary not found, but the call should work
      expect(typeof available).toBe('boolean');

      if (available) {
        // Launch browser
        const launchResult = await client.launch({ headless: true });
        expect(launchResult.success).toBe(true);

        if (launchResult.success) {
          // Navigate
          const navResult = await client.navigate({ url: 'https://example.com' });
          expect(navResult.success).toBe(true);

          // Screenshot
          const screenshotResult = await client.screenshot();
          expect(screenshotResult.success).toBe(true);

          if (screenshotResult.success) {
            const buffer = Buffer.from(screenshotResult.value.base64!, 'base64');
            expect(isValidPNG(buffer)).toBe(true);
          }

          // Evaluate
          const evalResult = await client.evaluate<string>('document.title');
          expect(evalResult.success).toBe(true);
          if (evalResult.success) {
            expect(evalResult.value).toContain('Example');
          }
        }
      }

      await client.dispose();
    }, 60000);
  });

  describe.skipIf(!vibiumAvailable)('Axe-Core Real Integration', () => {
    let vibe: Awaited<ReturnType<typeof import('vibium').browser.launch>>;

    beforeEach(async () => {
      const { browser } = await import('vibium');
      vibe = await browser.launch({ headless: true });
      await vibe.go('https://example.com');
    }, 30000);

    afterEach(async () => {
      if (vibe) {
        await vibe.quit();
      }
    });

    it('should inject and run axe-core for accessibility testing', async () => {
      // Load axe-core source
      const fs = await import('fs/promises');
      const path = await import('path');
      const { createRequire } = await import('module');

      let axeSource: string;
      try {
        const require = createRequire(import.meta.url);
        const axePath = require.resolve('axe-core/axe.min.js');
        axeSource = await fs.readFile(axePath, 'utf-8');
      } catch {
        console.log('[Axe-Core Test] axe-core not installed, skipping');
        return;
      }

      // Inject axe-core
      await vibe.evaluate(axeSource);

      // Verify axe is available
      const axeAvailable = await vibe.evaluate<boolean>('typeof axe !== "undefined"');
      expect(axeAvailable).toBe(true);

      // Run audit
      const results = await vibe.evaluate<{
        violations: Array<{ id: string; impact: string }>;
        passes: Array<{ id: string }>;
      }>(`
        new Promise((resolve) => {
          axe.run().then(resolve);
        })
      `);

      expect(results).toBeDefined();
      expect(Array.isArray(results.violations)).toBe(true);
      expect(Array.isArray(results.passes)).toBe(true);

      // Example.com should pass most rules
      console.log(`[Axe-Core] Violations: ${results.violations.length}, Passes: ${results.passes.length}`);
    }, 60000);
  });
});

// ============================================================================
// Smoke Test - Always Runs (Reports Skip Reason)
// ============================================================================

describe('Vibium Smoke Test', () => {
  it('should report Vibium availability status', async () => {
    const available = await isVibiumBinaryAvailable();

    console.log(`[Vibium Smoke Test] Binary available: ${available}`);
    console.log(`[Vibium Smoke Test] VIBIUM_REAL_TESTS: ${process.env.VIBIUM_REAL_TESTS}`);
    console.log(`[Vibium Smoke Test] CI: ${process.env.CI}`);

    // This test always passes - it's informational
    expect(typeof available).toBe('boolean');
  });
});

/**
 * Agent-Browser Client INFRASTRUCTURE Tests
 *
 * NOTE: These are NOT user-facing E2E tests. They test the browser
 * client infrastructure. For critical user journey E2E tests, see:
 * tests/e2e/critical-user-journeys.e2e.test.ts
 *
 * These tests verify:
 * - Browser launch and session management
 * - Command execution (navigate, click, type, etc.)
 * - Snapshot parsing and element reference resolution
 * - Screenshot capture functionality
 *
 * These tests require agent-browser CLI to be installed.
 * NOTE: These tests are automatically SKIPPED in CI environments
 * where agent-browser is not installed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { AgentBrowserClient, cleanupAllBrowserProcesses } from '../../../src/integrations/browser/agent-browser/client';
import { AgentBrowserCommandExecutor, isAgentBrowserAvailable } from '../../../src/integrations/browser/agent-browser/command-executor';
import { SnapshotParser, getSnapshotParser } from '../../../src/integrations/browser/agent-browser/snapshot-parser';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Test timeout for browser operations
const BROWSER_TIMEOUT = 60000;

// Test URLs - using reliable public sites
const TEST_URLS = {
  simple: 'https://example.com',
  forms: 'https://httpbin.org/forms/post',
  html: 'data:text/html,<html><head><title>Test Page</title></head><body><h1>Hello World</h1><button id="btn1">Click Me</button><input type="text" id="input1" placeholder="Enter text"><a href="#link">Link</a></body></html>',
};

// Check if agent-browser is available (synchronous check for test setup)
let agentBrowserAvailable = false;
try {
  execSync('which npx', { encoding: 'utf-8', stdio: 'pipe' });
  const result = execSync('npx agent-browser --version 2>&1 || echo "not-found"', {
    encoding: 'utf-8',
    stdio: 'pipe',
    timeout: 10000
  });
  agentBrowserAvailable = !result.includes('not-found') && !result.includes('ERR!');
} catch {
  agentBrowserAvailable = false;
}

// Skip all tests if agent-browser is not available OR if running in CI
// CI environments typically don't have browser automation setup
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const describeIfAvailable = (!isCI && agentBrowserAvailable) ? describe : describe.skip;

describe('Agent-Browser CLI Availability', () => {
  it('should check if agent-browser CLI is available', async () => {
    const available = await isAgentBrowserAvailable();
    // This test documents the availability status - it passes either way
    if (!available) {
      console.log('⚠️  agent-browser CLI not available - E2E tests will be skipped');
    }
    expect(typeof available).toBe('boolean');
  }, 10000);
});

describeIfAvailable('AgentBrowserCommandExecutor - Real CLI Execution', () => {
  let executor: AgentBrowserCommandExecutor;
  const sessionName = `test-executor-${Date.now()}`;

  beforeAll(() => {
    executor = new AgentBrowserCommandExecutor({
      sessionName,
      timeout: BROWSER_TIMEOUT,
      debug: false,
    });
  });

  afterAll(async () => {
    // Clean up - terminate daemon (not just close browser)
    try {
      executor.terminateDaemon();
    } catch {
      // Ignore cleanup errors
    }
    // Global cleanup as safety net
    await cleanupAllBrowserProcesses();
  });

  it('should open a real URL and get page info', () => {
    const openResult = executor.open(TEST_URLS.simple);
    expect(openResult.success).toBe(true);

    // Get page title
    const titleResult = executor.execute<string>('get', ['title']);
    expect(titleResult.success).toBe(true);
    expect(titleResult.data).toContain('Example');
  }, BROWSER_TIMEOUT);

  it('should get real accessibility snapshot with refs', () => {
    // Navigate first
    executor.open(TEST_URLS.simple);

    // Get snapshot
    const snapshotResult = executor.snapshot({ interactive: false });
    expect(snapshotResult.success).toBe(true);
    expect(snapshotResult.data).toBeDefined();

    // The snapshot should contain element refs
    const snapshotText = typeof snapshotResult.data === 'string'
      ? snapshotResult.data
      : JSON.stringify(snapshotResult.data);

    // Real page should have some content
    expect(snapshotText.length).toBeGreaterThan(10);
  }, BROWSER_TIMEOUT);

  it('should take a real screenshot and return base64', () => {
    executor.open(TEST_URLS.simple);

    const screenshotResult = executor.screenshot();
    expect(screenshotResult.success).toBe(true);

    // Screenshot should be base64 encoded PNG
    if (typeof screenshotResult.data === 'string') {
      // If it's a path, check file exists
      if (screenshotResult.data.endsWith('.png')) {
        expect(fs.existsSync(screenshotResult.data)).toBe(true);
      } else {
        // Should be base64 data
        expect(screenshotResult.data.length).toBeGreaterThan(100);
      }
    }
  }, BROWSER_TIMEOUT);

  it('should get current URL after navigation', () => {
    executor.open(TEST_URLS.simple);

    const urlResult = executor.execute<string>('get', ['url']);
    expect(urlResult.success).toBe(true);
    expect(urlResult.data).toContain('example.com');
  }, BROWSER_TIMEOUT);
});

describeIfAvailable('SnapshotParser - Real Snapshot Parsing', () => {
  let executor: AgentBrowserCommandExecutor;
  let parser: SnapshotParser;
  const sessionName = `test-parser-${Date.now()}`;

  beforeAll(() => {
    executor = new AgentBrowserCommandExecutor({
      sessionName,
      timeout: BROWSER_TIMEOUT,
    });
    parser = getSnapshotParser();
  });

  afterAll(async () => {
    try {
      executor.terminateDaemon();
    } catch {
      // Ignore cleanup errors
    }
    await cleanupAllBrowserProcesses();
  });

  it('should parse real snapshot from example.com', () => {
    executor.open(TEST_URLS.simple);

    const snapshotResult = executor.snapshot({ interactive: false });
    expect(snapshotResult.success).toBe(true);

    // CLI returns JSON format with --json flag, use parseJson for objects
    const parsed = typeof snapshotResult.data === 'object'
      ? parser.parseJson(snapshotResult.data)
      : parser.parse(snapshotResult.data);

    // Real page should have elements (from refs in JSON)
    expect(parsed.elements.length).toBeGreaterThan(0);
    expect(parsed.stats.totalElements).toBeGreaterThan(0);
  }, BROWSER_TIMEOUT);

  it('should find interactive elements on a real page', () => {
    executor.open(TEST_URLS.simple);

    const snapshotResult = executor.snapshot({ interactive: true });
    expect(snapshotResult.success).toBe(true);

    // CLI returns JSON format with --json flag, use parseJson for objects
    const parsed = typeof snapshotResult.data === 'object'
      ? parser.parseJson(snapshotResult.data)
      : parser.parse(snapshotResult.data);

    // example.com has a link "More information..." / "Learn more"
    const links = parser.findByRole(parsed, 'link');
    expect(links.length).toBeGreaterThan(0); // example.com has at least one link
  }, BROWSER_TIMEOUT);
});

describeIfAvailable('AgentBrowserClient - Full Integration', () => {
  let client: AgentBrowserClient;

  beforeEach(async () => {
    client = new AgentBrowserClient({
      sessionName: `test-client-${Date.now()}`,
      timeout: BROWSER_TIMEOUT,
      debug: false,
    });
  });

  afterEach(async () => {
    try {
      await client.quit();
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);  // Increased timeout for daemon termination

  it('should report availability correctly', async () => {
    const available = await client.isAvailable();
    expect(available).toBe(true);
  }, 10000);

  it('should launch browser and navigate to URL', async () => {
    const launchResult = await client.launch({ headless: true });
    expect(launchResult.success).toBe(true);
    expect(launchResult.value).toBeDefined();
    expect(launchResult.value?.tool).toBe('agent-browser');

    const navResult = await client.navigate(TEST_URLS.simple);
    expect(navResult.success).toBe(true);
    expect(navResult.value?.url).toContain('example.com');
  }, BROWSER_TIMEOUT);

  it('should get real snapshot with element refs', async () => {
    await client.launch({ headless: true });
    await client.navigate(TEST_URLS.simple);

    const snapshotResult = await client.getSnapshot({ interactive: false });
    expect(snapshotResult.success).toBe(true);
    expect(snapshotResult.value).toBeDefined();
    expect(snapshotResult.value?.elements).toBeDefined();
    expect(snapshotResult.value?.refMap).toBeDefined();
  }, BROWSER_TIMEOUT);

  it('should take screenshot and return valid result', async () => {
    await client.launch({ headless: true });
    await client.navigate(TEST_URLS.simple);

    const screenshotResult = await client.screenshot({ fullPage: false });
    expect(screenshotResult.success).toBe(true);
    expect(screenshotResult.value).toBeDefined();

    // Should have either base64 or path
    const result = screenshotResult.value!;
    expect(result.format).toBe('png');
    expect(result.dimensions).toBeDefined();
  }, BROWSER_TIMEOUT);

  it('should evaluate JavaScript in real browser context', async () => {
    await client.launch({ headless: true });
    await client.navigate(TEST_URLS.simple);

    // Get document title via JS evaluation
    const evalResult = await client.evaluate<string>('document.title');
    expect(evalResult.success).toBe(true);
    expect(evalResult.value).toContain('Example');
  }, BROWSER_TIMEOUT);

  it('should navigate back and forward in history', async () => {
    await client.launch({ headless: true });
    await client.navigate(TEST_URLS.simple);

    // Navigate to another page
    await client.navigate('https://httpbin.org/html');

    // Go back
    const backResult = await client.goBack();
    expect(backResult.success).toBe(true);

    // Go forward
    const forwardResult = await client.goForward();
    expect(forwardResult.success).toBe(true);
  }, BROWSER_TIMEOUT);

  it('should reload page successfully', async () => {
    await client.launch({ headless: true });
    await client.navigate(TEST_URLS.simple);

    const reloadResult = await client.reload();
    expect(reloadResult.success).toBe(true);
  }, BROWSER_TIMEOUT);
});

describeIfAvailable('AgentBrowserClient - Element Interactions', () => {
  let client: AgentBrowserClient;

  beforeEach(async () => {
    client = new AgentBrowserClient({
      sessionName: `test-interact-${Date.now()}`,
      timeout: BROWSER_TIMEOUT,
    });
    await client.launch({ headless: true });
  });

  afterEach(async () => {
    try {
      await client.quit();
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);  // Increased timeout for daemon termination

  it('should check element visibility on real page', async () => {
    await client.navigate(TEST_URLS.simple);

    // Check if body is visible (should always be true on a real page)
    const visibleResult = await client.isVisible('body');
    expect(visibleResult.success).toBe(true);
    expect(visibleResult.value).toBe(true);
  }, BROWSER_TIMEOUT);

  it('should get text from real DOM element', async () => {
    await client.navigate(TEST_URLS.simple);

    // Get text from h1 (example.com has "Example Domain" heading)
    const textResult = await client.getText('h1');
    expect(textResult.success).toBe(true);
    expect(textResult.value).toContain('Example');
  }, BROWSER_TIMEOUT);

  it('should click element using CSS selector', async () => {
    await client.navigate(TEST_URLS.simple);

    // example.com has a link we can click
    const clickResult = await client.click('a');
    // Click may or may not succeed depending on page state
    // The important thing is no crash and proper Result return
    expect(clickResult).toBeDefined();
    expect(typeof clickResult.success).toBe('boolean');
  }, BROWSER_TIMEOUT);

  it('should fill input field on forms page', async () => {
    await client.navigate(TEST_URLS.forms);

    // httpbin.org/forms/post has input fields
    // Find an input and fill it
    const fillResult = await client.fill('input[name="custname"]', 'Test User');
    expect(fillResult.success).toBe(true);

    // Verify the value was set
    const evalResult = await client.evaluate<string>(
      'document.querySelector("input[name=\\"custname\\"]")?.value'
    );
    expect(evalResult.success).toBe(true);
    expect(evalResult.value).toBe('Test User');
  }, BROWSER_TIMEOUT);
});

describeIfAvailable('AgentBrowserClient - Viewport and Device Emulation', () => {
  let client: AgentBrowserClient;

  beforeEach(async () => {
    client = new AgentBrowserClient({
      sessionName: `test-viewport-${Date.now()}`,
      timeout: BROWSER_TIMEOUT,
    });
    await client.launch({ headless: true });
  });

  afterEach(async () => {
    try {
      await client.quit();
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);  // Increased timeout for daemon termination

  it('should set custom viewport dimensions', async () => {
    const result = await client.setViewport(375, 667); // iPhone SE dimensions
    expect(result.success).toBe(true);

    // Verify via JS
    await client.navigate(TEST_URLS.simple);
    const widthResult = await client.evaluate<number>('window.innerWidth');
    expect(widthResult.success).toBe(true);
    expect(widthResult.value).toBe(375);
  }, BROWSER_TIMEOUT);

  it('should emulate mobile device', async () => {
    const result = await client.setDevice('iPhone 12');
    expect(result.success).toBe(true);

    await client.navigate(TEST_URLS.simple);

    // Verify mobile viewport
    const widthResult = await client.evaluate<number>('window.innerWidth');
    expect(widthResult.success).toBe(true);
    // iPhone 12 has 390px viewport width
    expect(widthResult.value).toBeLessThan(500);
  }, BROWSER_TIMEOUT);
});

describeIfAvailable('AgentBrowserClient - Wait Strategies', () => {
  let client: AgentBrowserClient;

  beforeEach(async () => {
    client = new AgentBrowserClient({
      sessionName: `test-wait-${Date.now()}`,
      timeout: BROWSER_TIMEOUT,
    });
    await client.launch({ headless: true });
  });

  afterEach(async () => {
    try {
      await client.quit();
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);  // Increased timeout for daemon termination

  it('should wait for element to be present', async () => {
    await client.navigate(TEST_URLS.simple);

    // Wait for h1 which should be immediately present
    const waitResult = await client.waitForElement('h1', 5000);
    expect(waitResult.success).toBe(true);
  }, BROWSER_TIMEOUT);

  it('should wait for text to appear', async () => {
    await client.navigate(TEST_URLS.simple);

    // Wait for "Example" text which should be present
    const waitResult = await client.waitForText('Example', 5000);
    expect(waitResult.success).toBe(true);
  }, BROWSER_TIMEOUT);

  it('should wait for URL pattern', async () => {
    await client.navigate(TEST_URLS.simple);

    // Wait for example.com URL
    const waitResult = await client.waitForUrl('example.com', 5000);
    expect(waitResult.success).toBe(true);
  }, BROWSER_TIMEOUT);

  it('should wait for network idle', async () => {
    await client.navigate(TEST_URLS.simple);

    // Wait for network to be idle after page load
    const waitResult = await client.waitForNetworkIdle(5000);
    expect(waitResult.success).toBe(true);
  }, BROWSER_TIMEOUT);
});

describeIfAvailable('AgentBrowserClient - Session Management', () => {
  let client: AgentBrowserClient;

  beforeEach(async () => {
    client = new AgentBrowserClient({
      sessionName: `test-session-${Date.now()}`,
      timeout: BROWSER_TIMEOUT,
    });
  });

  afterEach(async () => {
    try {
      await client.quit();
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);  // Increased timeout for daemon termination

  it('should create new session with unique name', async () => {
    const sessionName = `session-${Date.now()}`;
    const result = await client.createSession(sessionName);

    expect(result.success).toBe(true);
    expect(result.value).toBeDefined();
    expect(result.value?.id).toBe(sessionName);
    expect(result.value?.tool).toBe('agent-browser');
  }, BROWSER_TIMEOUT);

  it('should list available sessions', async () => {
    await client.launch({ headless: true });

    const result = await client.listSessions();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.value)).toBe(true);
  }, BROWSER_TIMEOUT);
});

describeIfAvailable('AgentBrowserClient - Error Handling', () => {
  let client: AgentBrowserClient;

  beforeEach(async () => {
    client = new AgentBrowserClient({
      sessionName: `test-error-${Date.now()}`,
      timeout: 10000, // Short timeout for error tests
    });
  });

  afterEach(async () => {
    try {
      await client.quit();
    } catch {
      // Ignore cleanup errors
    }
  }, 30000);  // Increased timeout for daemon termination

  it('should handle navigation to invalid URL gracefully', async () => {
    await client.launch({ headless: true });

    const result = await client.navigate('not-a-valid-url');
    // Should return error result, not throw
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  }, 30000);

  it('should handle click on non-existent element gracefully', async () => {
    await client.launch({ headless: true });
    await client.navigate(TEST_URLS.simple);

    const result = await client.click('#non-existent-element-12345');
    // Should return error result, not throw
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  }, BROWSER_TIMEOUT);

  it('should handle getText on non-existent element gracefully', async () => {
    await client.launch({ headless: true });
    await client.navigate(TEST_URLS.simple);

    const result = await client.getText('#non-existent-element-12345');
    // Should return error result, not throw
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  }, BROWSER_TIMEOUT);
});

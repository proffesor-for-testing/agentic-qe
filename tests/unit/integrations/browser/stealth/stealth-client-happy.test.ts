/**
 * Tests for Stealth Browser Client — Happy Path (Patchright available)
 *
 * Uses a fully mocked Patchright module to test the actual browser lifecycle,
 * navigation, element interaction, resource blocking, and cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

// Create mock page, context, browser objects
const mockPage = {
  goto: vi.fn().mockResolvedValue({ status: () => 200 }),
  title: vi.fn().mockResolvedValue('Test Page'),
  url: vi.fn().mockReturnValue('https://example.com/test'),
  reload: vi.fn().mockResolvedValue(undefined),
  goBack: vi.fn().mockResolvedValue(undefined),
  goForward: vi.fn().mockResolvedValue(undefined),
  click: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  textContent: vi.fn().mockResolvedValue('Hello World'),
  isVisible: vi.fn().mockResolvedValue(true),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
  evaluate: vi.fn().mockResolvedValue(42),
  route: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockContext = {
  pages: vi.fn().mockReturnValue([mockPage]),
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
};

// Mock patchright as installed and working
vi.mock('patchright', () => ({
  chromium: {
    launchPersistentContext: vi.fn().mockResolvedValue(mockContext),
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

// Must import AFTER vi.mock
import { StealthBrowserClient } from '../../../../../src/integrations/browser/stealth/stealth-client';

describe('StealthBrowserClient (patchright available)', () => {
  let client: StealthBrowserClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new StealthBrowserClient({ persistentContext: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });


  it('isAvailable returns true', async () => {
    expect(await client.isAvailable()).toBe(true);
  });

  it('launches with persistent context', async () => {
    const result = await client.launch({ headless: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.tool).toBe('stealth');
      expect(result.value.status).toBe('active');
      expect(result.value.id).toBeTruthy();
    }
  });

  it('applies resource blocking routes on launch', async () => {
    await client.launch({ headless: true });
    // Default config uses 'functional' preset which blocks resources
    expect(mockPage.route).toHaveBeenCalledWith('**/*', expect.any(Function));
  });

  it('navigates and returns URL + title', async () => {
    await client.launch({ headless: true });
    const result = await client.navigate('https://example.com');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.url).toBe('https://example.com/test');
      expect(result.value.title).toBe('Test Page');
      expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(mockPage.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'domcontentloaded' });
  });

  it('clicks an element', async () => {
    await client.launch({ headless: true });
    const result = await client.click('#btn');
    expect(result.success).toBe(true);
    expect(mockPage.click).toHaveBeenCalledWith('#btn');
  });

  it('fills an input', async () => {
    await client.launch({ headless: true });
    const result = await client.fill('#email', 'test@example.com');
    expect(result.success).toBe(true);
    expect(mockPage.fill).toHaveBeenCalledWith('#email', 'test@example.com');
  });

  it('gets text content', async () => {
    await client.launch({ headless: true });
    const result = await client.getText('#heading');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('Hello World');
    }
  });

  it('checks visibility', async () => {
    await client.launch({ headless: true });
    const result = await client.isVisible('.modal');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(true);
    }
  });

  it('takes screenshots', async () => {
    await client.launch({ headless: true });
    const result = await client.screenshot({ fullPage: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.base64).toBeTruthy();
      expect(result.value.format).toBe('png');
    }
  });

  it('evaluates JavaScript', async () => {
    await client.launch({ headless: true });
    const result = await client.evaluate<number>('1 + 1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe(42); // mock returns 42
    }
  });

  it('reloads the page', async () => {
    await client.launch({ headless: true });
    const result = await client.reload();
    expect(result.success).toBe(true);
    expect(mockPage.reload).toHaveBeenCalled();
  });

  it('goes back and forward', async () => {
    await client.launch({ headless: true });
    const back = await client.goBack();
    const forward = await client.goForward();
    expect(back.success).toBe(true);
    expect(forward.success).toBe(true);
  });

  it('quits and closes context', async () => {
    await client.launch({ headless: true });
    const result = await client.quit();
    expect(result.success).toBe(true);
    expect(mockContext.close).toHaveBeenCalled();
  });

  it('handles ElementTarget types', async () => {
    await client.launch({ headless: true });

    await client.click({ type: 'css', value: '.btn' });
    expect(mockPage.click).toHaveBeenCalledWith('.btn');

    await client.click({ type: 'xpath', value: '//button' });
    expect(mockPage.click).toHaveBeenCalledWith('xpath=//button');

    await client.click({ type: 'text', value: 'Submit' });
    expect(mockPage.click).toHaveBeenCalledWith('text=Submit');
  });
});

describe('StealthBrowserClient (non-persistent context)', () => {
  it('launches with browser.launch instead of persistent context', async () => {
    const client = new StealthBrowserClient({ persistentContext: false });
    const result = await client.launch({ headless: true });
    expect(result.success).toBe(true);
    // Should use browser.launch, not launchPersistentContext
    expect(mockBrowser.newPage).toHaveBeenCalled();
  });

  it('quits by closing browser', async () => {
    const client = new StealthBrowserClient({ persistentContext: false });
    await client.launch({ headless: true });
    const result = await client.quit();
    expect(result.success).toBe(true);
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});

describe('StealthBrowserClient resource blocking route handler', () => {
  it('blocks image requests via route callback', async () => {
    const client = new StealthBrowserClient({
      persistentContext: true,
      resourceBlocking: {
        enabled: true,
        blockedCategories: ['image'],
      },
    });
    await client.launch({ headless: true });

    // Get the route handler that was registered
    expect(mockPage.route).toHaveBeenCalledWith('**/*', expect.any(Function));
    const routeHandler = mockPage.route.mock.calls[0][1];

    // Simulate an image request
    const mockRoute = {
      request: () => ({
        url: () => 'https://example.com/photo.jpg',
        resourceType: () => 'image',
      }),
      abort: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
    };

    routeHandler(mockRoute);
    expect(mockRoute.abort).toHaveBeenCalled();
    expect(mockRoute.continue).not.toHaveBeenCalled();
  });

  it('allows script requests through', async () => {
    const client = new StealthBrowserClient({
      persistentContext: true,
      resourceBlocking: {
        enabled: true,
        blockedCategories: ['image'],
      },
    });
    await client.launch({ headless: true });

    const routeHandler = mockPage.route.mock.calls[0][1];

    const mockRoute = {
      request: () => ({
        url: () => 'https://example.com/app.js',
        resourceType: () => 'script',
      }),
      abort: vi.fn().mockResolvedValue(undefined),
      continue: vi.fn().mockResolvedValue(undefined),
    };

    routeHandler(mockRoute);
    expect(mockRoute.continue).toHaveBeenCalled();
    expect(mockRoute.abort).not.toHaveBeenCalled();
  });
});

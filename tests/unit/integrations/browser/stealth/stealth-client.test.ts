/**
 * Tests for Stealth Browser Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StealthBrowserClient } from '../../../../../src/integrations/browser/stealth/stealth-client';
import { DEFAULT_STEALTH_CONFIG } from '../../../../../src/integrations/browser/stealth/stealth-types';

// Mock patchright as not installed (default state)
vi.mock('patchright', () => {
  throw new Error('Cannot find module patchright');
});

describe('StealthBrowserClient (patchright not installed)', () => {
  let client: StealthBrowserClient;

  beforeEach(() => {
    client = new StealthBrowserClient();
  });

  it('reports tool as stealth', () => {
    expect(client.tool).toBe('stealth');
  });

  it('isAvailable returns false when patchright not installed', async () => {
    const available = await client.isAvailable();
    expect(available).toBe(false);
  });

  it('launch returns error when patchright not installed', async () => {
    const result = await client.launch({ headless: true });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Patchright is not installed');
    }
  });

  it('navigate returns not-launched error', async () => {
    const result = await client.navigate('https://example.com');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_LAUNCHED');
    }
  });

  it('click returns not-launched error', async () => {
    const result = await client.click('#btn');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_LAUNCHED');
    }
  });

  it('fill returns not-launched error', async () => {
    const result = await client.fill('#input', 'text');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_LAUNCHED');
    }
  });

  it('getText returns not-launched error', async () => {
    const result = await client.getText('#el');
    expect(result.success).toBe(false);
  });

  it('isVisible returns not-launched error', async () => {
    const result = await client.isVisible('#el');
    expect(result.success).toBe(false);
  });

  it('screenshot returns not-launched error', async () => {
    const result = await client.screenshot();
    expect(result.success).toBe(false);
  });

  it('evaluate returns not-launched error', async () => {
    const result = await client.evaluate('1+1');
    expect(result.success).toBe(false);
  });

  it('quit returns success even when not launched', async () => {
    const result = await client.quit();
    expect(result.success).toBe(true);
  });

  it('dispose does not throw', async () => {
    await expect(client.dispose()).resolves.toBeUndefined();
  });
});

describe('StealthBrowserClient configuration', () => {
  it('uses default config when none provided', () => {
    const client = new StealthBrowserClient();
    // Client should be constructable with defaults
    expect(client.tool).toBe('stealth');
  });

  it('accepts custom config', () => {
    const client = new StealthBrowserClient({
      persistentContext: false,
      cloudflareWaitSeconds: 10,
      userAgent: 'Custom/1.0',
    });
    expect(client.tool).toBe('stealth');
  });

  it('accepts resource blocking preset', () => {
    const client = new StealthBrowserClient({
      resourceBlocking: 'performance',
    });
    expect(client.tool).toBe('stealth');
  });

  it('accepts resource blocking config object', () => {
    const client = new StealthBrowserClient({
      resourceBlocking: {
        enabled: true,
        blockedCategories: ['image', 'font'],
      },
    });
    expect(client.tool).toBe('stealth');
  });

  it('accepts proxy configuration', () => {
    const client = new StealthBrowserClient({
      proxy: {
        server: 'http://proxy.example.com:8080',
        username: 'user',
        password: 'pass',
      },
    });
    expect(client.tool).toBe('stealth');
  });
});

describe('StealthBrowserClient selector resolution', () => {
  let client: StealthBrowserClient;

  beforeEach(() => {
    client = new StealthBrowserClient();
  });

  it('handles string selectors', async () => {
    // These will fail with NOT_LAUNCHED but should not throw
    const result = await client.click('#my-button');
    expect(result.success).toBe(false);
  });

  it('handles CSS ElementTarget', async () => {
    const result = await client.click({ type: 'css', value: '.btn' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_LAUNCHED');
    }
  });

  it('handles XPath ElementTarget', async () => {
    const result = await client.click({ type: 'xpath', value: '//button' });
    expect(result.success).toBe(false);
  });

  it('handles text ElementTarget', async () => {
    const result = await client.click({ type: 'text', value: 'Submit' });
    expect(result.success).toBe(false);
  });

  it('handles ref ElementTarget', async () => {
    const result = await client.click({ type: 'ref', value: '@e1' });
    expect(result.success).toBe(false);
  });
});

describe('DEFAULT_STEALTH_CONFIG', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_STEALTH_CONFIG.persistentContext).toBe(true);
    expect(DEFAULT_STEALTH_CONFIG.cloudflareWaitSeconds).toBe(0);
    expect(DEFAULT_STEALTH_CONFIG.resourceBlocking).toBe('functional');
  });
});

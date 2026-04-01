/**
 * Tests for ssrf-guard: isPrivateIp and validateHookUrl
 * @see IMP-07 Hook Security Hardening
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isPrivateIp, validateHookUrl } from '../../../src/hooks/security/ssrf-guard.js';

// =============================================================================
// Mock dns/promises so we can control DNS resolution in tests
// =============================================================================

vi.mock('dns/promises', () => ({
  lookup: vi.fn(),
}));

// Import the mock after vi.mock so we can control return values per test
import { lookup as mockLookup } from 'dns/promises';

// =============================================================================
// isPrivateIp
// =============================================================================

describe('isPrivateIp', () => {
  it.each([
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.1.1', true],
    ['192.168.0.0', true],
    ['127.0.0.1', true],
    ['127.255.255.255', true],
    ['0.0.0.0', true],
    ['169.254.1.1', true],
    ['169.254.169.254', true],
    ['::1', true],
    ['fc00::', true],
    ['fe80::1', true],
    ['fd12:3456:789a::1', true],
  ])('identifies %s as private (%s)', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });

  it.each([
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['203.0.113.50', false],
    ['172.32.0.1', false],  // just outside 172.16-31 range
    ['11.0.0.1', false],
    ['2001:db8::1', false],
  ])('identifies %s as public (%s)', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

// =============================================================================
// validateHookUrl
// =============================================================================

describe('validateHookUrl', () => {
  beforeEach(() => {
    vi.mocked(mockLookup).mockReset();
  });

  // ---- Invalid URLs ----

  it('returns error for an invalid URL', async () => {
    const result = await validateHookUrl('not-a-url');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Invalid URL');
  });

  it('returns error for an empty string', async () => {
    const result = await validateHookUrl('');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Invalid URL');
  });

  // ---- Direct IP addresses ----

  it.each([
    'http://10.0.0.1/hook',
    'http://172.16.0.1:8080/callback',
    'http://192.168.1.1/api',
    'http://127.0.0.1:3000/webhook',
    'http://169.254.169.254/latest/meta-data/',
  ])('blocks direct private IP: %s', async (url) => {
    const result = await validateHookUrl(url);
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Private IP blocked');
  });

  it('blocks IPv6 loopback', async () => {
    const result = await validateHookUrl('http://[::1]:8080/hook');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Private IP blocked');
  });

  it.each([
    'http://8.8.8.8/hook',
    'https://1.1.1.1/callback',
  ])('allows direct public IP: %s', async (url) => {
    const result = await validateHookUrl(url);
    expect(result.safe).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // ---- DNS resolution ----

  it('allows a hostname that resolves to a public IP', async () => {
    vi.mocked(mockLookup).mockResolvedValue({ address: '93.184.216.34', family: 4 });

    const result = await validateHookUrl('https://example.com/webhook');
    expect(result.safe).toBe(true);
  });

  it('blocks a hostname that resolves to a private IP (DNS rebinding)', async () => {
    vi.mocked(mockLookup).mockResolvedValue({ address: '192.168.1.100', family: 4 });

    const result = await validateHookUrl('https://evil.example.com/steal-data');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('DNS resolves to private IP');
    expect(result.reason).toContain('192.168.1.100');
  });

  it('blocks a hostname that resolves to loopback', async () => {
    vi.mocked(mockLookup).mockResolvedValue({ address: '127.0.0.1', family: 4 });

    const result = await validateHookUrl('https://sneaky.example.com/hook');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('DNS resolves to private IP');
  });

  it('returns error when DNS lookup fails', async () => {
    vi.mocked(mockLookup).mockRejectedValue(new Error('ENOTFOUND'));

    const result = await validateHookUrl('https://nonexistent.invalid/hook');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('DNS lookup failed');
    expect(result.reason).toContain('ENOTFOUND');
  });

  it('blocks link-local metadata endpoint via DNS', async () => {
    vi.mocked(mockLookup).mockResolvedValue({ address: '169.254.169.254', family: 4 });

    const result = await validateHookUrl('https://metadata.google.internal/computeMetadata/v1/');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('DNS resolves to private IP');
  });
});

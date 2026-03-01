/**
 * BrowserSecurityScanner Tests
 * Verifies security scanning functionality with fallback behavior
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BrowserSecurityScanner,
  createBrowserSecurityScanner,
} from '../../../../src/domains/visual-accessibility/services/browser-security-scanner.js';

describe('BrowserSecurityScanner', () => {
  let scanner: BrowserSecurityScanner;

  beforeEach(async () => {
    scanner = createBrowserSecurityScanner({ verbose: false });
    await scanner.initialize();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const freshScanner = createBrowserSecurityScanner();
      await freshScanner.initialize();
      expect(freshScanner.isAvailable).toBeDefined();
    });

    it('should return availability status', () => {
      // In test environment, MCP tools are not available, so fallback is used
      const available = scanner.isAvailable();
      expect(typeof available).toBe('boolean');
    });
  });

  describe('validateUrl', () => {
    it('should detect SSRF attempts with localhost', async () => {
      const result = await scanner.validateUrl('http://localhost:8080/admin');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.safe).toBe(false);
        expect(result.value.threats).toContain('SSRF: Local network access');
        expect(result.value.score).toBeLessThan(1.0);
      }
    });

    it('should detect SSRF attempts with private IP', async () => {
      const result = await scanner.validateUrl('http://192.168.1.1/config');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.safe).toBe(false);
        expect(result.value.threats.length).toBeGreaterThan(0);
      }
    });

    it('should accept safe HTTPS URLs', async () => {
      const result = await scanner.validateUrl('https://example.com/page');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.safe).toBe(true);
        expect(result.value.threats).toHaveLength(0);
        expect(result.value.score).toBe(1.0);
      }
    });

    it('should detect credential exposure in URL', async () => {
      const result = await scanner.validateUrl('https://user:pass@example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.safe).toBe(false);
        expect(result.value.threats).toContain('Potential credential exposure in URL');
      }
    });

    it('should reject invalid URLs', async () => {
      const result = await scanner.validateUrl('not-a-valid-url');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Invalid URL');
      }
    });
  });

  describe('detectPhishing', () => {
    it('should detect brand impersonation', async () => {
      const result = await scanner.detectPhishing('http://paypal-secure.tk/login');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isPhishing).toBe(true);
        expect(result.value.confidence).toBeGreaterThan(0.5);
        expect(result.value.indicators.length).toBeGreaterThan(0);
      }
    });

    it('should detect suspicious TLD', async () => {
      const result = await scanner.detectPhishing('https://secure-login.tk');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.indicators).toContain('Uses suspicious TLD');
      }
    });

    it('should detect IP-based URLs', async () => {
      const result = await scanner.detectPhishing('http://123.45.67.89/login');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.indicators).toContain('Uses IP address instead of domain');
      }
    });

    it('should accept legitimate URLs with low confidence', async () => {
      const result = await scanner.detectPhishing('https://www.example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isPhishing).toBe(false);
        expect(result.value.confidence).toBeLessThan(0.5);
      }
    });
  });

  describe('scanForPII', () => {
    it('should detect email addresses', async () => {
      const content = 'Contact us at support@example.com for assistance';
      const result = await scanner.scanForPII(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.hasPII).toBe(true);
        expect(result.value.detectedTypes).toContain('email');
        expect(result.value.locations.length).toBeGreaterThan(0);
      }
    });

    it('should detect SSN', async () => {
      const content = 'My SSN is 123-45-6789';
      const result = await scanner.scanForPII(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.hasPII).toBe(true);
        expect(result.value.detectedTypes).toContain('ssn');
      }
    });

    it('should detect phone numbers', async () => {
      const content = 'Call me at (555) 123-4567';
      const result = await scanner.scanForPII(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.hasPII).toBe(true);
        expect(result.value.detectedTypes).toContain('phone');
      }
    });

    it('should detect credit card numbers', async () => {
      const content = 'Card: 4532-1234-5678-9010';
      const result = await scanner.scanForPII(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.hasPII).toBe(true);
        expect(result.value.detectedTypes).toContain('credit-card');
      }
    });

    it('should return clean result for non-PII content', async () => {
      const content = 'This is just some regular text without any PII';
      const result = await scanner.scanForPII(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.hasPII).toBe(false);
        expect(result.value.detectedTypes).toHaveLength(0);
        expect(result.value.locations).toHaveLength(0);
      }
    });

    it('should provide location information for detected PII', async () => {
      const content = 'Email: test@example.com';
      const result = await scanner.scanForPII(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.locations.length).toBeGreaterThan(0);
        const location = result.value.locations[0];
        expect(location.type).toBe('email');
        expect(location.start).toBeGreaterThanOrEqual(0);
        expect(location.end).toBeGreaterThan(location.start);
      }
    });
  });

  describe('factory function', () => {
    it('should create scanner with custom config', async () => {
      const customScanner = createBrowserSecurityScanner({
        timeout: 10000,
        verbose: true,
      });
      await customScanner.initialize();
      expect(customScanner.isAvailable).toBeDefined();
    });

    it('should create scanner with default config', async () => {
      const defaultScanner = createBrowserSecurityScanner();
      await defaultScanner.initialize();
      expect(defaultScanner.isAvailable).toBeDefined();
    });
  });
});

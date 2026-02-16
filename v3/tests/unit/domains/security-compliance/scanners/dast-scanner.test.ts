/**
 * Unit Tests - DASTScanner
 * Tests for Dynamic Application Security Testing scanner
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DASTScanner } from '../../../../../src/domains/security-compliance/services/scanners/dast-scanner';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces';
import type {
  SecurityScannerConfig,
  AuthCredentials,
} from '../../../../../src/domains/security-compliance/services/scanners/scanner-types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock all DAST helper functions
vi.mock('../../../../../src/domains/security-compliance/services/scanners/dast-helpers.js', () => ({
  analyzeSecurityHeaders: vi.fn(),
  analyzeCookieSecurity: vi.fn(),
  analyzeServerHeaders: vi.fn(),
  scanSensitiveFiles: vi.fn().mockResolvedValue(1),
  analyzeCORS: vi.fn().mockResolvedValue(undefined),
  extractAndCrawlLinks: vi.fn().mockResolvedValue(1),
  testXSS: vi.fn().mockResolvedValue(undefined),
  testSQLi: vi.fn().mockResolvedValue(undefined),
  analyzeFormsForSecurityIssues: vi.fn(),
  testAuthorizationBypass: vi.fn().mockResolvedValue(1),
  testIDOR: vi.fn().mockResolvedValue(1),
  validateCredentials: vi.fn().mockReturnValue({ valid: true }),
  buildAuthHeaders: vi.fn().mockReturnValue({ Authorization: 'Bearer test-token' }),
  handleFetchError: vi.fn(),
  calculateSummary: vi.fn().mockReturnValue({
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
    totalFiles: 1,
    scanDurationMs: 100,
  }),
  storeScanResults: vi.fn().mockResolvedValue(undefined),
}));

const createMockMemory = (): MemoryBackend => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  exists: vi.fn().mockResolvedValue(false),
  search: vi.fn().mockResolvedValue([]),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
  getStats: vi.fn().mockResolvedValue({ entries: 0, memoryUsage: 0 }),
});

const createConfig = (overrides: Partial<SecurityScannerConfig> = {}): SecurityScannerConfig => ({
  defaultRuleSets: ['owasp-top-10'],
  maxConcurrentScans: 4,
  timeout: 30000,
  enableFalsePositiveDetection: true,
  dastMaxDepth: 5,
  dastActiveScanning: false,
  enableLLMAnalysis: false,
  llmModelTier: 4,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DASTScanner', () => {
  let scanner: DASTScanner;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMemory = createMockMemory();
    scanner = new DASTScanner(createConfig(), mockMemory);

    // Mock global fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        'content-type': 'text/html',
      }),
      clone: () => ({
        text: vi.fn().mockResolvedValue('<html><body>Hello</body></html>'),
      }),
    }));
  });

  // =========================================================================
  // scanUrl
  // =========================================================================

  describe('scanUrl', () => {
    it('should_returnSuccessResult_when_validUrlProvided', async () => {
      // Act
      const result = await scanner.scanUrl('https://example.com');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scanId).toBeDefined();
        expect(result.value.targetUrl).toBe('https://example.com');
        expect(result.value.vulnerabilities).toBeInstanceOf(Array);
        expect(result.value.summary).toBeDefined();
      }
    });

    it('should_reportInsecureProtocol_when_httpUsed', async () => {
      // Act
      const result = await scanner.scanUrl('http://example.com');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const httpVulns = result.value.vulnerabilities.filter(
          (v) => v.title === 'Insecure HTTP Protocol'
        );
        expect(httpVulns.length).toBe(1);
        expect(httpVulns[0].severity).toBe('high');
      }
    });

    it('should_reportInvalidUrl_when_malformedUrlProvided', async () => {
      // Act
      const result = await scanner.scanUrl('not-a-valid-url');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const invalidVulns = result.value.vulnerabilities.filter(
          (v) => v.title === 'Invalid Target URL'
        );
        expect(invalidVulns.length).toBe(1);
      }
    });

    it('should_handleFetchError_gracefully', async () => {
      // Arrange
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      // Act
      const result = await scanner.scanUrl('https://unreachable.example.com');

      // Assert
      expect(result.success).toBe(true);
      // handleFetchError helper is called
      const { handleFetchError } = await import(
        '../../../../../src/domains/security-compliance/services/scanners/dast-helpers.js'
      );
      expect(handleFetchError).toHaveBeenCalled();
    });

    it('should_storeResults_when_scanCompletes', async () => {
      // Act
      await scanner.scanUrl('https://example.com');

      // Assert
      const { storeScanResults } = await import(
        '../../../../../src/domains/security-compliance/services/scanners/dast-helpers.js'
      );
      expect(storeScanResults).toHaveBeenCalledWith(
        mockMemory,
        expect.any(String),
        'dast',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should_analyzeSecurityHeaders_onResponse', async () => {
      // Act
      await scanner.scanUrl('https://example.com');

      // Assert
      const { analyzeSecurityHeaders } = await import(
        '../../../../../src/domains/security-compliance/services/scanners/dast-helpers.js'
      );
      expect(analyzeSecurityHeaders).toHaveBeenCalledWith(
        expect.any(Headers),
        'https://example.com',
        expect.any(Array)
      );
    });

    it('should_useCustomOptions_when_provided', async () => {
      // Act
      const result = await scanner.scanUrl('https://example.com', {
        maxDepth: 10,
        activeScanning: false,
        timeout: 5000,
      });

      // Assert
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // scanAuthenticated
  // =========================================================================

  describe('scanAuthenticated', () => {
    it('should_returnSuccessResult_when_validCredentials', async () => {
      // Arrange
      const credentials: AuthCredentials = { type: 'bearer', token: 'test-token' };

      // Act
      const result = await scanner.scanAuthenticated('https://example.com/api', credentials);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scanId).toBeDefined();
        expect(result.value.targetUrl).toBe('https://example.com/api');
      }
    });

    it('should_returnError_when_credentialsInvalid', async () => {
      // Arrange
      const { validateCredentials } = await import(
        '../../../../../src/domains/security-compliance/services/scanners/dast-helpers.js'
      );
      (validateCredentials as ReturnType<typeof vi.fn>).mockReturnValue({
        valid: false,
        reason: 'Missing token for bearer authentication',
      });
      const credentials: AuthCredentials = { type: 'bearer' };

      // Act
      const result = await scanner.scanAuthenticated('https://example.com/api', credentials);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Missing token');
      }
    });

    it('should_detectTokenInUrl_when_queryParamsContainToken', async () => {
      // Arrange
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ 'content-type': 'text/html' }),
        clone: () => ({
          text: vi.fn().mockResolvedValue('<html></html>'),
        }),
      }));
      // Ensure validateCredentials returns valid (may have been overridden by previous test)
      const { validateCredentials } = await import(
        '../../../../../src/domains/security-compliance/services/scanners/dast-helpers.js'
      );
      (validateCredentials as ReturnType<typeof vi.fn>).mockReturnValue({ valid: true });
      const credentials: AuthCredentials = { type: 'bearer', token: 'tok123' };

      // Act
      const result = await scanner.scanAuthenticated(
        'https://example.com/api?token=secret123',
        credentials
      );

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const tokenVulns = result.value.vulnerabilities.filter(
          (v) => v.title === 'Session Token in URL'
        );
        expect(tokenVulns.length).toBe(1);
        expect(tokenVulns[0].severity).toBe('high');
      }
    });
  });

  // =========================================================================
  // getScanStatus
  // =========================================================================

  describe('getScanStatus', () => {
    it('should_returnPending_when_scanIdNotFound', async () => {
      // Act
      const status = await scanner.getScanStatus('nonexistent-scan');

      // Assert
      expect(status).toBe('pending');
    });
  });
});

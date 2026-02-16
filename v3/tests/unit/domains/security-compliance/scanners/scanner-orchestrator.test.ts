/**
 * Unit Tests - SecurityScannerService (Orchestrator)
 * Tests for the scanner orchestrator that coordinates SAST, DAST, and Dependency scanning
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SecurityScannerService } from '../../../../../src/domains/security-compliance/services/scanners/scanner-orchestrator';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces';
import type { FilePath } from '../../../../../src/shared/value-objects';
import type {
  SecurityScannerConfig,
  HybridRouter,
} from '../../../../../src/domains/security-compliance/services/scanners/scanner-types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('const x = 1;\n'),
}));

// Mock DAST helpers to avoid network calls
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
  buildAuthHeaders: vi.fn().mockReturnValue({ Authorization: 'Bearer tok' }),
  handleFetchError: vi.fn(),
  calculateSummary: vi.fn().mockReturnValue({
    critical: 0, high: 0, medium: 0, low: 0, informational: 0,
    totalFiles: 1, scanDurationMs: 50,
  }),
  storeScanResults: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../../src/shared/security/index.js', () => ({
  OSVClient: class MockOSVClient {
    scanNpmDependencies = vi.fn().mockResolvedValue([]);
    constructor() {}
  },
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

const createMockFilePath = (path: string): FilePath => ({
  value: path,
  filename: path.split('/').pop() || '',
  extension: path.split('.').pop() || '',
  directory: path.split('/').slice(0, -1).join('/'),
  isAbsolute: path.startsWith('/'),
  isRelative: !path.startsWith('/'),
  equals: (other: FilePath) => other.value === path,
  join: (segment: string) => createMockFilePath(`${path}/${segment}`),
  normalize: () => createMockFilePath(path),
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecurityScannerService (Orchestrator)', () => {
  let service: SecurityScannerService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMemory = createMockMemory();
    service = new SecurityScannerService({ memory: mockMemory }, {
      defaultRuleSets: ['owasp-top-10'],
      enableLLMAnalysis: false,
    });
  });

  // =========================================================================
  // Constructor
  // =========================================================================

  describe('constructor', () => {
    it('should_acceptMemoryBackendDirectly_forBackwardCompat', () => {
      // Act
      const svc = new SecurityScannerService(mockMemory);

      // Assert
      expect(svc).toBeDefined();
    });

    it('should_acceptDependenciesObject_withOptionalLLMRouter', () => {
      // Arrange
      const mockRouter = { chat: vi.fn() } as unknown as HybridRouter;

      // Act
      const svc = new SecurityScannerService({ memory: mockMemory, llmRouter: mockRouter });

      // Assert
      expect(svc.isLLMAnalysisAvailable()).toBe(true);
    });
  });

  // =========================================================================
  // SAST delegation
  // =========================================================================

  describe('scanFiles', () => {
    it('should_delegateToSASTScanner', async () => {
      // Arrange
      const files = [createMockFilePath('/src/app.ts')];

      // Act
      const result = await service.scanFiles(files);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scanId).toBeDefined();
        expect(result.value.coverage.filesScanned).toBe(1);
      }
    });
  });

  describe('scanWithRules', () => {
    it('should_returnError_when_emptyFiles', async () => {
      // Act
      const result = await service.scanWithRules([], ['owasp-top-10']);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  describe('getAvailableRuleSets', () => {
    it('should_returnRuleSets', async () => {
      // Act
      const ruleSets = await service.getAvailableRuleSets();

      // Assert
      expect(ruleSets.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // DAST delegation
  // =========================================================================

  describe('scanUrl', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        clone: () => ({ text: vi.fn().mockResolvedValue('<html></html>') }),
      }));
    });

    it('should_delegateToDASTScanner', async () => {
      // Act
      const result = await service.scanUrl('https://example.com');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.targetUrl).toBe('https://example.com');
      }
    });
  });

  // =========================================================================
  // Dependency delegation
  // =========================================================================

  describe('scanDependencies', () => {
    it('should_delegateToDependencyScanner', async () => {
      // Act
      const result = await service.scanDependencies({ express: '4.18.2' });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.packagesScanned).toBe(1);
      }
    });
  });

  // =========================================================================
  // getScanStatus
  // =========================================================================

  describe('getScanStatus', () => {
    it('should_returnPending_when_unknownScanId', async () => {
      // Act
      const status = await service.getScanStatus('unknown');

      // Assert
      expect(status).toBe('pending');
    });
  });

  // =========================================================================
  // runFullScan
  // =========================================================================

  describe('runFullScan', () => {
    it('should_runSASTOnly_when_noTargetUrl', async () => {
      // Arrange
      const files = [createMockFilePath('/src/app.ts')];

      // Act
      const result = await service.runFullScan(files);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.sastResult).toBeDefined();
        expect(result.value.dastResult).toBeUndefined();
        expect(result.value.combinedSummary).toBeDefined();
      }
    });

    it('should_combineSASTandDAST_when_targetUrlProvided', async () => {
      // Arrange
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers(),
        clone: () => ({ text: vi.fn().mockResolvedValue('<html></html>') }),
      }));
      const files = [createMockFilePath('/src/app.ts')];

      // Act
      const result = await service.runFullScan(files, 'https://example.com');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.sastResult).toBeDefined();
        expect(result.value.dastResult).toBeDefined();
        expect(result.value.combinedSummary).toBeDefined();
      }
    });

    it('should_returnError_when_SASTFails', async () => {
      // Arrange - empty files causes SAST error
      const files: FilePath[] = [];

      // Act
      const result = await service.runFullScan(files);

      // Assert
      expect(result.success).toBe(false);
    });
  });

  // =========================================================================
  // LLM delegation
  // =========================================================================

  describe('isLLMAnalysisAvailable', () => {
    it('should_returnFalse_when_noLLMRouter', () => {
      expect(service.isLLMAnalysisAvailable()).toBe(false);
    });
  });

  describe('getModelForTier', () => {
    it('should_delegateToSASTScanner', () => {
      const model = service.getModelForTier(1);
      expect(model).toContain('haiku');
    });
  });
});

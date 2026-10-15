/**
 * Unit Tests - DependencyScanner
 * Tests for OSV-based dependency vulnerability scanning
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DependencyScanner } from '../../../../../src/domains/security-compliance/services/scanners/dependency-scanner';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces';
import type { SecurityScannerConfig } from '../../../../../src/domains/security-compliance/services/scanners/scanner-types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// A complete OSV lookup (#1049 shape, keyed ecosystem:name@version) over the queried packages.
type Query = { name: string; ecosystem: string; version: string };
const completeLookup = (pkgs: Query[], vulns: Array<{ affectedPackage: string }> = []) => {
  const results = new Map<string, unknown[]>();
  for (const p of pkgs) {
    results.set(`${p.ecosystem}:${p.name}@${p.version}`, vulns.filter((v) => v.affectedPackage === p.name));
  }
  return { status: 'complete', results, packagesRequested: pkgs.length, packagesChecked: pkgs.length, unchecked: [], errors: [] };
};

// Shared mock function that tests can override
const mockLookupBatch = vi.fn(async (pkgs: Query[]) => completeLookup(pkgs));

vi.mock('../../../../../src/shared/security/index.js', () => ({
  OSVClient: class MockOSVClient {
    lookupBatch = mockLookupBatch;
    constructor() {}
  },
}));

vi.mock('fs/promises', () => ({
  // No pnpm-workspace.yaml / lockfile in this mocked filesystem.
  stat: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  // pnpm-workspace.yaml is probed with lstat; any error other than ENOENT counts as a workspace root.
  lstat: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  readFile: vi.fn(),
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
  timeout: 300000,
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

describe('DependencyScanner', () => {
  let scanner: DependencyScanner;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMemory = createMockMemory();
    scanner = new DependencyScanner(createConfig(), mockMemory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // scanDependencies
  // =========================================================================

  describe('scanDependencies', () => {
    it('should_returnError_when_noDependenciesProvided', async () => {
      // Arrange
      const deps: Record<string, string> = {};

      // Act
      const result = await scanner.scanDependencies(deps);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('No dependencies provided for scanning');
      }
    });

    it('should_returnSuccessResult_when_dependenciesProvided', async () => {
      // Arrange
      const deps = { lodash: '4.17.21', express: '4.18.2' };

      // Act
      const result = await scanner.scanDependencies(deps);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scanId).toBeDefined();
        expect(result.value.packagesScanned).toBe(2);
        expect(result.value.vulnerabilities).toBeInstanceOf(Array);
        expect(result.value.summary).toBeDefined();
      }
    });

    it('should_reportVulnerablePackages_when_osvFindsVulnerabilities', async () => {
      // Arrange - override the shared mock to return vulnerabilities
      mockLookupBatch.mockImplementationOnce(async (pkgs) => completeLookup(pkgs, [
        {
          id: 'GHSA-xxxx',
          summary: 'Prototype Pollution in lodash',
          details: 'Lodash is vulnerable to prototype pollution',
          severity: 'high',
          affectedPackage: 'lodash',
          affectedVersions: '<4.17.21',
          fixedVersions: ['4.17.21'],
          cveIds: ['CVE-2021-23337'],
          references: ['https://github.com/advisories/GHSA-xxxx'],
        },
      ]));

      // Act
      const result = await scanner.scanDependencies({ lodash: '4.17.20' });

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.vulnerablePackages).toBe(1);
        expect(result.value.vulnerabilities.length).toBe(1);
        expect(result.value.vulnerabilities[0].severity).toBe('high');
        expect(result.value.vulnerabilities[0].category).toBe('vulnerable-components');
      }
    });

    it('should_storeResultsInMemory_when_scanCompletes', async () => {
      // Arrange
      const deps = { express: '4.18.2' };

      // Act
      await scanner.scanDependencies(deps);

      // Assert
      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.stringMatching(/^security:scan:/),
        expect.objectContaining({ scanType: 'dependency' }),
        expect.objectContaining({ namespace: 'security-compliance' })
      );
    });

    it('should_includeScanDurationMs_inResult', async () => {
      // Arrange
      const deps = { express: '4.18.2' };

      // Act
      const result = await scanner.scanDependencies(deps);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scanDurationMs).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // =========================================================================
  // scanPackageJson
  // =========================================================================

  describe('scanPackageJson', () => {
    it('should_returnError_when_fileNotFound', async () => {
      // Arrange
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      );

      // Act
      const result = await scanner.scanPackageJson('/nonexistent/package.json');

      // Assert
      expect(result.success).toBe(false);
    });

    it('should_returnError_when_invalidJSON', async () => {
      // Arrange
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('not valid json{{{');

      // Act
      const result = await scanner.scanPackageJson('/project/package.json');

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Invalid JSON');
      }
    });

    it('should_returnCompleteEmptyScan_when_noDependenciesInPackageJson', async () => {
      // Arrange: #1049 — nothing to check is a measured zero, not an unmeasured scan
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({ name: 'test-pkg' }));

      // Act
      const result = await scanner.scanPackageJson('/project/package.json');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toMatchObject({ status: 'complete', measured: true, packagesScanned: 0, uncheckedPackages: [] });
      }
    });

    it('should_combineAllDependencyTypes_when_packageJsonHasMultiple', async () => {
      // Arrange
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({
        name: 'test-pkg',
        dependencies: { express: '4.18.2' },
        devDependencies: { vitest: '1.0.0' },
        peerDependencies: { react: '18.0.0' },
      }));

      // Act
      const result = await scanner.scanPackageJson('/project/package.json');

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.packagesScanned).toBe(3);
      }
    });
  });

  // =========================================================================
  // getScanStatus
  // =========================================================================

  describe('getScanStatus', () => {
    it('should_returnPending_when_scanIdNotFound', async () => {
      // Act
      const status = await scanner.getScanStatus('unknown-id');

      // Assert
      expect(status).toBe('pending');
    });
  });
});

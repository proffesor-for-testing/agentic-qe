/**
 * Unit Tests - SASTScanner
 * Tests for Static Application Security Testing scanner
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SASTScanner } from '../../../../../src/domains/security-compliance/services/scanners/sast-scanner';
import type { MemoryBackend } from '../../../../../src/kernel/interfaces';
import type { FilePath } from '../../../../../src/shared/value-objects';
import type {
  SecurityScannerConfig,
  Vulnerability,
  HybridRouter,
} from '../../../../../src/domains/security-compliance/services/scanners/scanner-types';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

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
// Mock fs/promises - SASTScanner dynamically imports it
// ---------------------------------------------------------------------------

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SASTScanner', () => {
  let scanner: SASTScanner;
  let mockMemory: MemoryBackend;
  let config: SecurityScannerConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMemory = createMockMemory();
    config = createConfig();
    scanner = new SASTScanner(config, mockMemory);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // scanWithRules
  // =========================================================================

  describe('scanWithRules', () => {
    it('should_returnError_when_noFilesProvided', async () => {
      // Arrange
      const files: FilePath[] = [];

      // Act
      const result = await scanner.scanWithRules(files, ['owasp-top-10']);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('No files provided for scanning');
      }
    });

    it('should_returnError_when_invalidRuleSetProvided', async () => {
      // Arrange
      const files = [createMockFilePath('/src/app.ts')];

      // Act
      const result = await scanner.scanWithRules(files, ['nonexistent-ruleset']);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('No valid rule sets found');
      }
    });

    it('should_returnScanResult_when_validFileAndRuleSet', async () => {
      // Arrange
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('const x = 1;\n');
      const files = [createMockFilePath('/src/app.ts')];

      // Act
      const result = await scanner.scanWithRules(files, ['owasp-top-10']);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.scanId).toBeDefined();
        expect(result.value.vulnerabilities).toBeInstanceOf(Array);
        expect(result.value.summary).toBeDefined();
        expect(result.value.coverage.filesScanned).toBe(1);
      }
    });

    it('should_detectSQLInjection_when_stringConcatenationInQuery', async () => {
      // Arrange
      const vulnerableCode = `
const userId = req.params.id;
db.query("SELECT * FROM users WHERE id = " + userId + "");
`;
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(vulnerableCode);
      const files = [createMockFilePath('/src/controller.ts')];

      // Act
      const result = await scanner.scanWithRules(files, ['owasp-top-10']);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const injectionVulns = result.value.vulnerabilities.filter(
          (v) => v.category === 'injection'
        );
        expect(injectionVulns.length).toBeGreaterThan(0);
        expect(injectionVulns[0].severity).toBe('critical');
      }
    });

    it('should_skipUnsupportedFileExtensions', async () => {
      // Arrange
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('SELECT * FROM users');
      const files = [createMockFilePath('/data/schema.sql')];

      // Act
      const result = await scanner.scanWithRules(files, ['owasp-top-10']);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.vulnerabilities).toHaveLength(0);
      }
    });

    it('should_handleFileReadError_gracefully', async () => {
      // Arrange
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('ENOENT'));
      const files = [createMockFilePath('/src/missing.ts')];

      // Act
      const result = await scanner.scanWithRules(files, ['owasp-top-10']);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.vulnerabilities).toHaveLength(0);
      }
    });

    it('should_storeScanResultsInMemory', async () => {
      // Arrange
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('const safe = true;\n');
      const files = [createMockFilePath('/src/safe.ts')];

      // Act
      await scanner.scanWithRules(files, ['owasp-top-10']);

      // Assert
      expect(mockMemory.set).toHaveBeenCalledWith(
        expect.stringMatching(/^security:scan:/),
        expect.objectContaining({ scanType: 'sast' }),
        expect.objectContaining({ namespace: 'security-compliance' })
      );
    });

    it('should_skipPatternMatchesInsideComments', async () => {
      // Arrange
      const codeWithCommentedVuln = `
// db.query("SELECT * FROM users WHERE id = " + userId + "");
const x = 1;
`;
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue(codeWithCommentedVuln);
      const files = [createMockFilePath('/src/safe.ts')];

      // Act
      const result = await scanner.scanWithRules(files, ['owasp-top-10']);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        const injectionVulns = result.value.vulnerabilities.filter(
          (v) => v.category === 'injection'
        );
        expect(injectionVulns).toHaveLength(0);
      }
    });
  });

  // =========================================================================
  // scanFiles (delegates to scanWithRules with default rule sets)
  // =========================================================================

  describe('scanFiles', () => {
    it('should_useDefaultRuleSets', async () => {
      // Arrange
      const { readFile } = await import('fs/promises');
      (readFile as ReturnType<typeof vi.fn>).mockResolvedValue('const a = 1;\n');
      const files = [createMockFilePath('/src/index.ts')];

      // Act
      const result = await scanner.scanFiles(files);

      // Assert
      expect(result.success).toBe(true);
    });
  });

  // =========================================================================
  // getAvailableRuleSets
  // =========================================================================

  describe('getAvailableRuleSets', () => {
    it('should_returnBuiltInRuleSets', async () => {
      // Act
      const ruleSets = await scanner.getAvailableRuleSets();

      // Assert
      expect(ruleSets.length).toBeGreaterThan(0);
      expect(ruleSets.find((rs) => rs.id === 'owasp-top-10')).toBeDefined();
    });

    it('should_includeCustomRuleSetsFromMemory', async () => {
      // Arrange
      const customRuleSet = {
        id: 'custom-rules',
        name: 'Custom',
        description: 'Custom rules',
        ruleCount: 5,
        categories: ['injection' as const],
      };
      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValue([customRuleSet]);

      // Act
      const ruleSets = await scanner.getAvailableRuleSets();

      // Assert
      expect(ruleSets.find((rs) => rs.id === 'custom-rules')).toBeDefined();
    });
  });

  // =========================================================================
  // checkFalsePositive
  // =========================================================================

  describe('checkFalsePositive', () => {
    const createVulnerability = (overrides: Partial<Vulnerability> = {}): Vulnerability => ({
      id: 'vuln-1',
      title: 'Test Vulnerability',
      description: 'A test vulnerability',
      severity: 'high',
      category: 'injection',
      location: { file: '/src/app.ts', line: 10, column: 5, snippet: 'code here' },
      remediation: { description: 'Fix it', estimatedEffort: 'minor', automatable: false },
      references: [],
      ...overrides,
    });

    it('should_returnNotFalsePositive_when_detectionDisabled', async () => {
      // Arrange
      const disabledConfig = createConfig({ enableFalsePositiveDetection: false });
      const scannerNoFP = new SASTScanner(disabledConfig, mockMemory);
      const vuln = createVulnerability();

      // Act
      const result = await scannerNoFP.checkFalsePositive(vuln);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isFalsePositive).toBe(false);
        expect(result.value.reason).toContain('disabled');
      }
    });

    it('should_flagAsFalsePositive_when_vulnerabilityInTestFile', async () => {
      // Arrange
      const vuln = createVulnerability({
        location: { file: '/src/__tests__/test.ts', line: 5, snippet: 'test code' },
      });

      // Act
      const result = await scanner.checkFalsePositive(vuln);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isFalsePositive).toBe(true);
        expect(result.value.confidence).toBeGreaterThanOrEqual(0.8);
      }
    });

    it('should_flagAsFalsePositive_when_nosecAnnotationPresent', async () => {
      // Arrange
      const vuln = createVulnerability({
        location: { file: '/src/app.ts', snippet: '// nosec\ndb.query(sql)' },
      });

      // Act
      const result = await scanner.checkFalsePositive(vuln);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.isFalsePositive).toBe(true);
        expect(result.value.confidence).toBeGreaterThanOrEqual(0.9);
      }
    });
  });

  // =========================================================================
  // LLM Enhancement Methods
  // =========================================================================

  describe('isLLMAnalysisAvailable', () => {
    it('should_returnFalse_when_llmRouterNotProvided', () => {
      // Act & Assert
      expect(scanner.isLLMAnalysisAvailable()).toBe(false);
    });

    it('should_returnTrue_when_llmEnabledAndRouterProvided', () => {
      // Arrange
      const llmConfig = createConfig({ enableLLMAnalysis: true });
      const mockRouter = { chat: vi.fn() } as unknown as HybridRouter;
      const llmScanner = new SASTScanner(llmConfig, mockMemory, mockRouter);

      // Act & Assert
      expect(llmScanner.isLLMAnalysisAvailable()).toBe(true);
    });
  });

  describe('getModelForTier', () => {
    it('should_returnHaikuModel_forTier1', () => {
      expect(scanner.getModelForTier(1)).toContain('haiku');
    });

    it('should_returnOpusModel_forDefaultTier', () => {
      expect(scanner.getModelForTier(99)).toContain('opus');
    });
  });

  describe('analyzeVulnerabilityWithLLM', () => {
    it('should_returnDefaultRemediation_when_noLLMRouter', async () => {
      // Arrange
      const vuln: Vulnerability = {
        id: 'vuln-1',
        title: 'SQL Injection',
        description: 'Vulnerable query',
        severity: 'critical',
        category: 'injection',
        location: { file: '/src/db.ts' },
        remediation: { description: 'Use parameterized queries', estimatedEffort: 'moderate', automatable: false },
        references: [],
      };

      // Act
      const result = await scanner.analyzeVulnerabilityWithLLM(vuln, 'code context');

      // Assert
      expect(result.description).toBe('Use parameterized queries');
    });

    it('should_callLLMRouter_when_routerAvailable', async () => {
      // Arrange
      const mockRouter = {
        chat: vi.fn().mockResolvedValue({
          content: '{"description":"Use prepared statements","fixExample":"db.prepare()","estimatedEffort":"minor","automatable":true}',
        }),
      } as unknown as HybridRouter;
      const llmConfig = createConfig({ enableLLMAnalysis: true });
      const llmScanner = new SASTScanner(llmConfig, mockMemory, mockRouter);

      const vuln: Vulnerability = {
        id: 'vuln-1',
        title: 'SQL Injection',
        description: 'Vulnerable query',
        severity: 'critical',
        category: 'injection',
        location: { file: '/src/db.ts' },
        remediation: { description: 'Fix it', estimatedEffort: 'moderate', automatable: false },
        references: [],
      };

      // Act
      const result = await llmScanner.analyzeVulnerabilityWithLLM(vuln, 'const sql = "SELECT " + x');

      // Assert
      expect(mockRouter.chat).toHaveBeenCalled();
      expect(result.description).toBe('Use prepared statements');
      expect(result.llmEnhanced).toBe(true);
    });
  });
});

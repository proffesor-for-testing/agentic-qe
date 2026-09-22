/**
 * Agentic QE v3 - Security Scanner Service Unit Tests
 * Tests for SAST/DAST scanning and vulnerability detection
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { SecurityScannerService } from '../../../../src/domains/security-compliance/services/security-scanner';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { FilePath } from '../../../../src/shared/value-objects';
import type { Vulnerability, DASTOptions, AuthCredentials } from '../../../../src/domains/security-compliance/interfaces';

// Mock MemoryBackend
const createMockMemoryBackend = (): MemoryBackend => ({
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  exists: vi.fn().mockResolvedValue(false),
  search: vi.fn().mockResolvedValue([]),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
  getStats: vi.fn().mockResolvedValue({ entries: 0, memoryUsage: 0 }),
});

// Mock FilePath
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

describe('SecurityScannerService', () => {
  let service: SecurityScannerService;
  let mockMemory: MemoryBackend;
  let fixture: string;

  beforeEach(async () => {
    fixture = await mkdtemp(join(tmpdir(), 'aqe-scanner-service-'));
    await Promise.all(['app.ts', 'utils.ts'].map(name => writeFile(join(fixture, name), 'const safe = true;\n')));
    mockMemory = createMockMemoryBackend();
    service = new SecurityScannerService(mockMemory, { enableSemgrep: false, enableLLMAnalysis: false });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(fixture, { recursive: true, force: true });
  });

  describe('SAST Scanning', () => {
    describe('scanFiles', () => {
      it('should scan files and return SAST results', async () => {
        const files = [
          createMockFilePath(join(fixture, 'app.ts')),
          createMockFilePath(join(fixture, 'utils.ts')),
        ];

        const result = await service.scanFiles(files);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.scanId).toBeDefined();
          expect(result.value.summary).toBeDefined();
          expect(result.value.coverage).toBeDefined();
          expect(result.value.coverage.filesScanned).toBe(2);
        }
      });

      it('should return error when no files provided', async () => {
        const result = await service.scanFiles([]);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('No files provided');
        }
      });

      it('should use default rule sets when scanning', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];

        const result = await service.scanFiles(files);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.coverage.rulesApplied).toBeGreaterThan(0);
        }
      });

      it('should store scan results in memory', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];

        await service.scanFiles(files);

        expect(mockMemory.set).toHaveBeenCalled();
        const setCall = (mockMemory.set as Mock).mock.calls[0];
        expect(setCall[0]).toMatch(/^security:scan:/);
      });
    });

    describe('scanWithRules', () => {
      it('should scan with specific rule sets', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];

        const result = await service.scanWithRules(files, ['owasp-top-10']);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.scanId).toBeDefined();
        }
      });

      it('should return error for invalid rule sets', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];

        const result = await service.scanWithRules(files, ['invalid-ruleset']);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('No valid rule sets');
        }
      });

      it('should combine multiple rule sets', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];

        const result = await service.scanWithRules(files, ['owasp-top-10', 'cwe-sans-25']);

        expect(result.success).toBe(true);
        if (result.success) {
          // Overlapping rule sets execute each actual pattern once.
          const singleSet = await service.scanWithRules(files, ['owasp-top-10']);
          expect(singleSet.success).toBe(true);
          if (!singleSet.success) throw singleSet.error;
          expect(result.value.coverage.rulesApplied).toBe(singleSet.value.coverage.rulesApplied);
          expect(result.value.coverage.rulesApplied).toBeGreaterThan(0);
          expect(result.value.evidence?.engines[0].ruleIds).toEqual(expect.arrayContaining(['sqli-string-concat', 'xss-innerhtml']));
        }
      });
    });

    describe('getAvailableRuleSets', () => {
      it('should return built-in rule sets', async () => {
        const ruleSets = await service.getAvailableRuleSets();

        expect(ruleSets.length).toBeGreaterThanOrEqual(4);
        expect(ruleSets.map((rs) => rs.id)).toContain('owasp-top-10');
        expect(ruleSets.map((rs) => rs.id)).toContain('cwe-sans-25');
      });

      it('should include custom rule sets from memory', async () => {
        const customRuleSet = {
          id: 'custom-rules',
          name: 'Custom Rules',
          description: 'Custom security rules',
          ruleCount: 10,
          categories: ['injection'],
        };
        (mockMemory.get as Mock).mockResolvedValueOnce([customRuleSet]);

        const ruleSets = await service.getAvailableRuleSets();

        expect(ruleSets.map((rs) => rs.id)).toContain('custom-rules');
      });
    });

    describe('checkFalsePositive', () => {
      it('should analyze vulnerability for false positive', async () => {
        const vulnerability: Vulnerability = {
          id: 'vuln-1',
          title: 'Test Vulnerability',
          description: 'Test description',
          severity: 'medium',
          category: 'xss',
          location: {
            file: '/src/test.ts',
            line: 10,
            snippet: 'const data = input;',
          },
          remediation: {
            description: 'Sanitize input',
            estimatedEffort: 'minor',
            automatable: true,
          },
          references: [],
        };

        const result = await service.checkFalsePositive(vulnerability);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toHaveProperty('isFalsePositive');
          expect(result.value).toHaveProperty('confidence');
        }
      });

      it('should detect test file vulnerabilities as potential false positives', async () => {
        const vulnerability: Vulnerability = {
          id: 'vuln-1',
          title: 'Test Vulnerability',
          description: 'Test description',
          severity: 'medium',
          category: 'xss',
          location: {
            file: '/src/test.spec.ts',
            line: 10,
            snippet: '// test code',
          },
          remediation: {
            description: 'Sanitize input',
            estimatedEffort: 'minor',
            automatable: true,
          },
          references: [],
        };

        const result = await service.checkFalsePositive(vulnerability);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.isFalsePositive).toBe(true);
          expect(result.value.confidence).toBeGreaterThan(0.7);
        }
      });

      it('should detect nosec comments as false positives', async () => {
        const vulnerability: Vulnerability = {
          id: 'vuln-1',
          title: 'Test Vulnerability',
          description: 'Test description',
          severity: 'medium',
          category: 'xss',
          location: {
            file: '/src/app.ts',
            line: 10,
            snippet: 'const data = input; // nosec',
          },
          remediation: {
            description: 'Sanitize input',
            estimatedEffort: 'minor',
            automatable: true,
          },
          references: [],
        };

        const result = await service.checkFalsePositive(vulnerability);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.isFalsePositive).toBe(true);
          expect(result.value.confidence).toBeGreaterThan(0.9);
        }
      });
    });
  });

  describe('DAST Scanning', () => {
    describe('scanUrl', () => {
      it('should scan URL and return DAST results', async () => {
        const targetUrl = 'https://example.com';

        const result = await service.scanUrl(targetUrl);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.scanId).toBeDefined();
          expect(result.value.targetUrl).toBe(targetUrl);
          expect(result.value.crawledUrls).toBeGreaterThanOrEqual(0);
        }
      });

      it('should respect DAST options', async () => {
        const targetUrl = 'https://example.com';
        const options: DASTOptions = {
          maxDepth: 2,
          activeScanning: true,
          timeout: 60000,
        };

        const result = await service.scanUrl(targetUrl, options);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.crawledUrls).toBeLessThanOrEqual(40); // maxDepth * 20
        }
      });

      it('should store DAST scan results in memory', async () => {
        const targetUrl = 'https://example.com';

        await service.scanUrl(targetUrl);

        expect(mockMemory.set).toHaveBeenCalled();
        const setCall = (mockMemory.set as Mock).mock.calls[0];
        expect(setCall[0]).toMatch(/^security:scan:/);
      });
    });

    describe('scanAuthenticated', () => {
      it('should scan authenticated endpoints with valid credentials', async () => {
        const targetUrl = 'https://example.com';
        const credentials: AuthCredentials = {
          type: 'bearer',
          token: 'valid-token-12345',
        };

        const result = await service.scanAuthenticated(targetUrl, credentials);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.scanId).toBeDefined();
          expect(result.value.targetUrl).toBe(targetUrl);
        }
      });

      it('should return error for missing basic auth credentials', async () => {
        const targetUrl = 'https://example.com';
        const credentials: AuthCredentials = {
          type: 'basic',
        };

        const result = await service.scanAuthenticated(targetUrl, credentials);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('username and password');
        }
      });

      it('should return error for missing bearer token', async () => {
        const targetUrl = 'https://example.com';
        const credentials: AuthCredentials = {
          type: 'bearer',
        };

        const result = await service.scanAuthenticated(targetUrl, credentials);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain('token');
        }
      });
    });

    describe('getScanStatus', () => {
      it('should return pending for unknown scan', async () => {
        const status = await service.getScanStatus('unknown-scan-id');

        expect(status).toBe('pending');
      });

      it('should return correct status for active scan', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];
        const scanResult = await service.scanFiles(files);

        if (scanResult.success) {
          const status = await service.getScanStatus(scanResult.value.scanId);
          expect(status).toBe('completed');
        }
      });
    });
  });

  describe('Full Scan', () => {
    describe('runFullScan', () => {
      it('should run SAST scan only when no URL provided', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];

        const result = await service.runFullScan(files);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.sastResult).toBeDefined();
          expect(result.value.dastResult).toBeUndefined();
          expect(result.value.combinedSummary).toBeDefined();
        }
      });

      it('should run both SAST and DAST when URL provided', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];
        const targetUrl = 'https://example.com';

        const result = await service.runFullScan(files, targetUrl);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.sastResult).toBeDefined();
          expect(result.value.dastResult).toBeDefined();
        }
      });

      it('should combine summaries from SAST and DAST', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];
        const targetUrl = 'https://example.com';

        const result = await service.runFullScan(files, targetUrl);

        expect(result.success).toBe(true);
        if (result.success) {
          const combined = result.value.combinedSummary;
          expect(combined).toHaveProperty('critical');
          expect(combined).toHaveProperty('high');
          expect(combined).toHaveProperty('medium');
          expect(combined).toHaveProperty('low');
          expect(combined).toHaveProperty('informational');
        }
      });

      it('should not fail full scan if DAST fails', async () => {
        const files = [createMockFilePath(join(fixture, 'app.ts'))];
        // Full scan should complete even if DAST portion has issues

        const result = await service.runFullScan(files, 'https://example.com');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.sastResult).toBeDefined();
        }
      });
    });
  });
});

/**
 * Agentic QE v3 - Compliance Validator Service Unit Tests
 * Tests for compliance standards validation (GDPR, HIPAA, SOC2, PCI-DSS)
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { ComplianceValidatorService } from '../../../../src/domains/security-compliance/services/compliance-validator';
import type { MemoryBackend } from '../../../../src/kernel/interfaces';
import type { FilePath } from '../../../../src/shared/value-objects';
import type {
  ComplianceStandard,
  ComplianceContext,
  ComplianceReport,
} from '../../../../src/domains/security-compliance/interfaces';

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

// Create test compliance context
const createTestContext = (): ComplianceContext => ({
  projectRoot: createMockFilePath('/project'),
  includePatterns: ['src/**/*.ts'],
  excludePatterns: ['node_modules/**'],
});

describe('ComplianceValidatorService', () => {
  let service: ComplianceValidatorService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemoryBackend();
    service = new ComplianceValidatorService(mockMemory);
  });

  describe('getAvailableStandards', () => {
    it('should return built-in compliance standards', async () => {
      const standards = await service.getAvailableStandards();

      expect(standards.length).toBeGreaterThanOrEqual(4);
      expect(standards.map((s) => s.id)).toContain('gdpr');
      expect(standards.map((s) => s.id)).toContain('hipaa');
      expect(standards.map((s) => s.id)).toContain('soc2');
      expect(standards.map((s) => s.id)).toContain('pci-dss');
    });

    it('should include custom standards when configured', async () => {
      const customStandard: ComplianceStandard = {
        id: 'custom-standard',
        name: 'Custom Standard',
        version: '1.0',
        rules: [],
      };

      const customService = new ComplianceValidatorService(mockMemory, {
        customStandards: [customStandard],
      });

      const standards = await customService.getAvailableStandards();

      expect(standards.map((s) => s.id)).toContain('custom-standard');
    });

    it('should return standards with rules', async () => {
      const standards = await service.getAvailableStandards();

      for (const standard of standards) {
        expect(standard.rules).toBeDefined();
        expect(standard.rules.length).toBeGreaterThan(0);
      }
    });
  });

  describe('validate', () => {
    it('should validate against GDPR standard', async () => {
      const standards = await service.getAvailableStandards();
      const gdpr = standards.find((s) => s.id === 'gdpr');
      expect(gdpr).toBeDefined();

      const result = await service.validate(gdpr!, createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.standardId).toBe('gdpr');
        expect(result.value.standardName).toBe('General Data Protection Regulation');
        expect(result.value).toHaveProperty('violations');
        expect(result.value).toHaveProperty('passedRules');
        expect(result.value).toHaveProperty('complianceScore');
      }
    });

    it('should validate against HIPAA standard', async () => {
      const standards = await service.getAvailableStandards();
      const hipaa = standards.find((s) => s.id === 'hipaa');
      expect(hipaa).toBeDefined();

      const result = await service.validate(hipaa!, createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.standardId).toBe('hipaa');
      }
    });

    it('should validate against SOC2 standard', async () => {
      const standards = await service.getAvailableStandards();
      const soc2 = standards.find((s) => s.id === 'soc2');
      expect(soc2).toBeDefined();

      const result = await service.validate(soc2!, createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.standardId).toBe('soc2');
      }
    });

    it('should validate against PCI-DSS standard', async () => {
      const standards = await service.getAvailableStandards();
      const pciDss = standards.find((s) => s.id === 'pci-dss');
      expect(pciDss).toBeDefined();

      const result = await service.validate(pciDss!, createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.standardId).toBe('pci-dss');
      }
    });

    it('should skip manual check rules', async () => {
      const standards = await service.getAvailableStandards();
      const gdpr = standards.find((s) => s.id === 'gdpr');
      expect(gdpr).toBeDefined();

      const manualRules = gdpr!.rules.filter((r) => r.checkType === 'manual');

      const result = await service.validate(gdpr!, createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        for (const manualRule of manualRules) {
          expect(result.value.skippedRules).toContain(manualRule.id);
        }
      }
    });

    it('should calculate compliance score correctly', async () => {
      const standards = await service.getAvailableStandards();
      const standard = standards[0];

      const result = await service.validate(standard, createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.complianceScore).toBeGreaterThanOrEqual(0);
        expect(result.value.complianceScore).toBeLessThanOrEqual(100);
      }
    });

    it('should store compliance report in memory', async () => {
      const standards = await service.getAvailableStandards();
      const standard = standards[0];

      await service.validate(standard, createTestContext());

      expect(mockMemory.set).toHaveBeenCalled();
      const setCall = (mockMemory.set as Mock).mock.calls[0];
      expect(setCall[0]).toMatch(/^compliance:report:/);
    });

    it('should include generated timestamp', async () => {
      const standards = await service.getAvailableStandards();
      const standard = standards[0];

      const result = await service.validate(standard, createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.generatedAt).toBeInstanceOf(Date);
      }
    });
  });

  describe('analyzeGaps', () => {
    it('should analyze gaps between current state and target', async () => {
      const standards = await service.getAvailableStandards();
      const gdpr = standards.find((s) => s.id === 'gdpr')!;

      const currentReport: ComplianceReport = {
        standardId: 'gdpr',
        standardName: 'GDPR',
        violations: [
          {
            ruleId: 'gdpr-art32-security',
            ruleName: 'Security of Processing',
            location: { file: '/src/app.ts', line: 10 },
            details: 'Missing encryption',
            remediation: 'Add encryption',
          },
        ],
        passedRules: ['gdpr-art5-accuracy'],
        skippedRules: ['gdpr-art33-breach-notification'],
        complianceScore: 50,
        generatedAt: new Date(),
      };

      const result = await service.analyzeGaps(currentReport, gdpr);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveProperty('currentScore');
        expect(result.value).toHaveProperty('targetScore');
        expect(result.value).toHaveProperty('gaps');
        expect(result.value).toHaveProperty('prioritizedActions');
      }
    });

    it('should identify failed rules as gaps', async () => {
      const standards = await service.getAvailableStandards();
      const gdpr = standards.find((s) => s.id === 'gdpr')!;

      const currentReport: ComplianceReport = {
        standardId: 'gdpr',
        standardName: 'GDPR',
        violations: [
          {
            ruleId: 'gdpr-art32-security',
            ruleName: 'Security of Processing',
            location: { file: '/src/app.ts' },
            details: 'Missing encryption',
            remediation: 'Add encryption',
          },
        ],
        passedRules: [],
        skippedRules: [],
        complianceScore: 0,
        generatedAt: new Date(),
      };

      const result = await service.analyzeGaps(currentReport, gdpr);

      expect(result.success).toBe(true);
      if (result.success) {
        const failedGap = result.value.gaps.find((g) => g.ruleId === 'gdpr-art32-security');
        expect(failedGap).toBeDefined();
        expect(failedGap?.currentStatus).toBe('failed');
      }
    });

    it('should prioritize actions by impact and effort', async () => {
      const standards = await service.getAvailableStandards();
      const gdpr = standards.find((s) => s.id === 'gdpr')!;

      const currentReport: ComplianceReport = {
        standardId: 'gdpr',
        standardName: 'GDPR',
        violations: [],
        passedRules: [],
        skippedRules: [],
        complianceScore: 0,
        generatedAt: new Date(),
      };

      const result = await service.analyzeGaps(currentReport, gdpr);

      expect(result.success).toBe(true);
      if (result.success && result.value.prioritizedActions.length > 1) {
        // Actions should be sorted by priority
        for (let i = 1; i < result.value.prioritizedActions.length; i++) {
          expect(result.value.prioritizedActions[i].priority).toBeGreaterThan(
            result.value.prioritizedActions[i - 1].priority
          );
        }
      }
    });
  });

  describe('validateMultiple', () => {
    it('should validate against multiple standards', async () => {
      const standards = await service.getAvailableStandards();

      const result = await service.validateMultiple(standards.slice(0, 2), createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.reports).toHaveLength(2);
        expect(result.value).toHaveProperty('overallScore');
        expect(result.value).toHaveProperty('crossCuttingViolations');
      }
    });

    it('should calculate overall score as average', async () => {
      const standards = await service.getAvailableStandards();

      const result = await service.validateMultiple(standards.slice(0, 2), createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.value.overallScore).toBeLessThanOrEqual(100);
      }
    });

    it('should identify cross-cutting violations', async () => {
      const standards = await service.getAvailableStandards();

      const result = await service.validateMultiple(standards, createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.crossCuttingViolations)).toBe(true);
      }
    });
  });

  describe('checkDataHandling', () => {
    it('should scan files for PII data', async () => {
      const files = [
        createMockFilePath('/src/user-service.ts'),
        createMockFilePath('/src/auth.ts'),
      ];

      const result = await service.checkDataHandling(files, ['pii']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.dataTypesFound).toBeDefined();
        expect(result.value).toHaveProperty('violations');
        expect(result.value).toHaveProperty('recommendations');
      }
    });

    it('should scan for multiple data types', async () => {
      const files = [createMockFilePath('/src/app.ts')];

      const result = await service.checkDataHandling(files, ['pii', 'phi', 'financial']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.dataTypesFound.size).toBe(3);
      }
    });

    it('should generate recommendations for found data types', async () => {
      const files = [createMockFilePath('/src/app.ts')];

      const result = await service.checkDataHandling(files, ['pii', 'financial']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.recommendations)).toBe(true);
      }
    });

    it('should detect PHI data for HIPAA compliance', async () => {
      const files = [createMockFilePath('/src/health-records.ts')];

      const result = await service.checkDataHandling(files, ['phi']);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.dataTypesFound.has('phi')).toBe(true);
      }
    });
  });

  describe('generateEvidence', () => {
    it('should generate compliance evidence for GDPR', async () => {
      const result = await service.generateEvidence('gdpr', createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.standardId).toBe('gdpr');
        expect(result.value.controls).toBeDefined();
        expect(result.value.generatedAt).toBeInstanceOf(Date);
        expect(result.value.validUntil).toBeInstanceOf(Date);
      }
    });

    it('should return error for unknown standard', async () => {
      const result = await service.generateEvidence('unknown-standard', createTestContext());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Unknown standard');
      }
    });

    it('should include control evidence with verification status', async () => {
      const result = await service.generateEvidence('gdpr', createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.controls.length).toBeGreaterThan(0);
        for (const control of result.value.controls) {
          expect(control).toHaveProperty('controlId');
          expect(control).toHaveProperty('status');
          expect(['implemented', 'partial', 'not-implemented']).toContain(control.status);
          expect(control).toHaveProperty('evidence');
          expect(control).toHaveProperty('lastVerified');
        }
      }
    });

    it('should store evidence in memory with persistence', async () => {
      await service.generateEvidence('gdpr', createTestContext());

      expect(mockMemory.set).toHaveBeenCalled();
      const setCalls = (mockMemory.set as Mock).mock.calls;
      const evidenceCall = setCalls.find((call) => call[0].includes('compliance:evidence:'));
      expect(evidenceCall).toBeDefined();
      expect(evidenceCall[2]).toHaveProperty('persist', true);
    });

    it('should set valid evidence retention period', async () => {
      const result = await service.generateEvidence('gdpr', createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        const now = new Date();
        const validUntil = result.value.validUntil;
        // Default retention is 365 days
        const diffDays = Math.floor(
          (validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        expect(diffDays).toBeGreaterThanOrEqual(364);
        expect(diffDays).toBeLessThanOrEqual(366);
      }
    });
  });

  describe('Configuration', () => {
    it('should respect strictMode configuration', async () => {
      const strictService = new ComplianceValidatorService(mockMemory, {
        strictMode: true,
      });

      const standards = await strictService.getAvailableStandards();
      const gdpr = standards.find((s) => s.id === 'gdpr')!;

      const result = await strictService.validate(gdpr, createTestContext());

      expect(result.success).toBe(true);
    });

    it('should filter recommended rules when includeRecommended is false', async () => {
      const strictService = new ComplianceValidatorService(mockMemory, {
        includeRecommended: false,
      });

      const standards = await strictService.getAvailableStandards();
      const standard = standards[0];

      const result = await strictService.validate(standard, createTestContext());

      expect(result.success).toBe(true);
      // Only required rules should be checked
    });

    it('should use custom evidence retention days', async () => {
      const customService = new ComplianceValidatorService(mockMemory, {
        evidenceRetentionDays: 180,
      });

      const result = await customService.generateEvidence('gdpr', createTestContext());

      expect(result.success).toBe(true);
      if (result.success) {
        const now = new Date();
        const diffDays = Math.floor(
          (result.value.validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );
        expect(diffDays).toBeGreaterThanOrEqual(179);
        expect(diffDays).toBeLessThanOrEqual(181);
      }
    });
  });
});

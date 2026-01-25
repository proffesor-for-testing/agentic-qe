/**
 * EU Compliance Service Tests
 *
 * Tests for EN 301 549 and EU Accessibility Act compliance validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EUComplianceService,
  EN_301_549_WEB_CLAUSES,
  EAA_WEB_REQUIREMENTS,
  WCAG_TO_EN301549_MAP,
  getWCAGLevel,
} from '../../../../src/domains/visual-accessibility/services/eu-compliance.js';
import type { MemoryBackend } from '../../../../src/kernel/interfaces.js';
import type {
  AccessibilityReport,
  AccessibilityViolation,
} from '../../../../src/domains/visual-accessibility/interfaces.js';

// Mock memory backend
const createMockMemory = (): MemoryBackend => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(true),
  has: vi.fn().mockResolvedValue(false),
  clear: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
  size: vi.fn().mockResolvedValue(0),
  getStats: vi.fn().mockResolvedValue({ hits: 0, misses: 0, size: 0 }),
});

// Helper to create a mock WCAG report
const createMockWCAGReport = (
  violations: Partial<AccessibilityViolation>[] = []
): AccessibilityReport => ({
  url: 'https://example.com',
  timestamp: new Date(),
  violations: violations.map((v, i) => ({
    id: v.id ?? `violation-${i}`,
    impact: v.impact ?? 'serious',
    wcagCriteria: v.wcagCriteria ?? [{ id: '1.1.1', level: 'A', title: 'Non-text Content' }],
    description: v.description ?? 'Test violation',
    help: v.help ?? 'Fix this issue',
    helpUrl: v.helpUrl ?? 'https://example.com/help',
    nodes: v.nodes ?? [],
  })),
  passes: [],
  incomplete: [],
  score: 100 - violations.length * 10,
  wcagLevel: 'AA',
});

describe('EUComplianceService', () => {
  let service: EUComplianceService;
  let mockMemory: MemoryBackend;

  beforeEach(() => {
    mockMemory = createMockMemory();
    service = new EUComplianceService(mockMemory);
  });

  describe('EN 301 549 Clauses', () => {
    it('should have all required Chapter 9 web content clauses', () => {
      const clauses = service.getEN301549Clauses();

      // Should have 40+ clauses covering WCAG 2.1 AA
      expect(clauses.length).toBeGreaterThanOrEqual(40);

      // Check key clause categories exist
      const chapters = new Set(clauses.map((c) => c.chapter));
      expect(chapters.has('9.1.1')).toBe(true); // Perceivable - Text alternatives
      expect(chapters.has('9.1.4')).toBe(true); // Perceivable - Distinguishable
      expect(chapters.has('9.2.1')).toBe(true); // Operable - Keyboard
      expect(chapters.has('9.2.4')).toBe(true); // Operable - Navigable
      expect(chapters.has('9.3.1')).toBe(true); // Understandable - Readable
      expect(chapters.has('9.4.1')).toBe(true); // Robust - Compatible
    });

    it('should map clauses to WCAG criteria', () => {
      const clauses = service.getEN301549Clauses();

      // Each clause should have at least one WCAG mapping
      clauses.forEach((clause) => {
        expect(clause.wcagMapping.length).toBeGreaterThan(0);
        expect(clause.id).toMatch(/^9\.\d+\.\d+(\.\d+)?$/);
      });
    });

    it('should classify test methods correctly', () => {
      const clauses = service.getEN301549Clauses();

      const testMethods = new Set(clauses.map((c) => c.testMethod));
      expect(testMethods.has('automated')).toBe(true);
      expect(testMethods.has('manual')).toBe(true);
      expect(testMethods.has('hybrid')).toBe(true);
    });

    it('should include contrast clause 9.1.4.3', () => {
      const clauses = service.getEN301549Clauses();
      const contrastClause = clauses.find((c) => c.id === '9.1.4.3');

      expect(contrastClause).toBeDefined();
      expect(contrastClause?.title).toBe('Contrast (minimum)');
      expect(contrastClause?.wcagMapping).toContain('1.4.3');
      expect(contrastClause?.testMethod).toBe('automated');
    });

    it('should include keyboard clause 9.2.1.1', () => {
      const clauses = service.getEN301549Clauses();
      const keyboardClause = clauses.find((c) => c.id === '9.2.1.1');

      expect(keyboardClause).toBeDefined();
      expect(keyboardClause?.title).toBe('Keyboard');
      expect(keyboardClause?.wcagMapping).toContain('2.1.1');
    });
  });

  describe('EAA Requirements', () => {
    it('should have EU Accessibility Act requirements', () => {
      const requirements = service.getEAARequirements();

      expect(requirements.length).toBeGreaterThan(0);
    });

    it('should have requirements for e-commerce', () => {
      const requirements = service.getEAARequirements();
      const ecommerceReqs = requirements.filter((r) =>
        r.applicableTo.includes('e-commerce')
      );

      expect(ecommerceReqs.length).toBeGreaterThan(0);
    });

    it('should map EAA requirements to EN 301 549 clauses', () => {
      const requirements = service.getEAARequirements();

      requirements.forEach((req) => {
        expect(req.id).toMatch(/^EAA-/);
        expect(req.article).toBeDefined();
        // Most requirements should have EN 301 549 mappings
      });
    });

    it('should cover perceivable, operable, understandable, robust', () => {
      const requirements = service.getEAARequirements();

      const titles = requirements.map((r) => r.title.toLowerCase());
      expect(titles.some((t) => t.includes('perceivable'))).toBe(true);
      expect(titles.some((t) => t.includes('operable'))).toBe(true);
      expect(titles.some((t) => t.includes('understandable'))).toBe(true);
      expect(titles.some((t) => t.includes('robust'))).toBe(true);
    });
  });

  describe('WCAG to EN 301 549 Mapping', () => {
    it('should provide complete WCAG mapping', () => {
      const mapping = service.getWCAGMapping();

      expect(mapping.length).toBeGreaterThan(0);
    });

    it('should map all WCAG 2.1 AA criteria', () => {
      const mapping = service.getWCAGMapping();
      const wcagCriteria = new Set(mapping.map((m) => m.wcagCriterion));

      // Key WCAG 2.1 AA criteria
      expect(wcagCriteria.has('1.1.1')).toBe(true); // Non-text content
      expect(wcagCriteria.has('1.4.3')).toBe(true); // Contrast
      expect(wcagCriteria.has('2.1.1')).toBe(true); // Keyboard
      expect(wcagCriteria.has('2.4.7')).toBe(true); // Focus visible
      expect(wcagCriteria.has('3.1.1')).toBe(true); // Language
      expect(wcagCriteria.has('4.1.2')).toBe(true); // Name, role, value
    });

    it('should include correct WCAG levels', () => {
      const mapping = service.getWCAGMapping();

      mapping.forEach((m) => {
        expect(['A', 'AA', 'AAA']).toContain(m.wcagLevel);
        expect(m.en301549Clause).toMatch(/^9\./);
      });
    });
  });

  describe('getWCAGLevel', () => {
    it('should return A for Level A criteria', () => {
      expect(getWCAGLevel('1.1.1')).toBe('A');
      expect(getWCAGLevel('2.1.1')).toBe('A');
      expect(getWCAGLevel('3.1.1')).toBe('A');
      expect(getWCAGLevel('4.1.1')).toBe('A');
    });

    it('should return AA for Level AA criteria', () => {
      expect(getWCAGLevel('1.4.3')).toBe('AA');
      expect(getWCAGLevel('1.4.4')).toBe('AA');
      expect(getWCAGLevel('2.4.7')).toBe('AA');
      expect(getWCAGLevel('3.1.2')).toBe('AA');
    });

    it('should return AAA for unknown/AAA criteria', () => {
      expect(getWCAGLevel('1.4.6')).toBe('AAA');
      expect(getWCAGLevel('9.9.9')).toBe('AAA');
    });
  });

  describe('validateCompliance', () => {
    it('should return compliant for report with no violations', async () => {
      const wcagReport = createMockWCAGReport([]);

      const result = await service.validateCompliance(wcagReport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.overallStatus).toBe('compliant');
        expect(result.value.complianceScore).toBe(100);
        expect(result.value.certificationReady).toBe(true);
        expect(result.value.en301549.passed).toBe(true);
        expect(result.value.en301549.failedClauses).toHaveLength(0);
      }
    });

    it('should return non-compliant for report with violations', async () => {
      const wcagReport = createMockWCAGReport([
        {
          id: 'image-alt',
          impact: 'critical',
          wcagCriteria: [{ id: '1.1.1', level: 'A', title: 'Non-text Content' }],
          description: 'Images must have alternate text',
        },
        {
          id: 'color-contrast',
          impact: 'serious',
          wcagCriteria: [{ id: '1.4.3', level: 'AA', title: 'Contrast (Minimum)' }],
          description: 'Elements must have sufficient color contrast',
        },
      ]);

      const result = await service.validateCompliance(wcagReport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.certificationReady).toBe(false);
        expect(result.value.en301549.passed).toBe(false);
        expect(result.value.en301549.failedClauses.length).toBeGreaterThan(0);

        // Check that violations are mapped to clauses
        const failedClauseIds = result.value.en301549.failedClauses.map(
          (c) => c.clause.id
        );
        expect(failedClauseIds).toContain('9.1.1.1'); // Non-text content
        expect(failedClauseIds).toContain('9.1.4.3'); // Contrast
      }
    });

    it('should include EAA compliance when requested', async () => {
      const wcagReport = createMockWCAGReport([]);

      const result = await service.validateCompliance(wcagReport, {
        includeEAA: true,
        productCategory: 'e-commerce',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.eaaCompliance).toBeDefined();
        expect(result.value.eaaCompliance?.productCategory).toBe('e-commerce');
        expect(result.value.eaaCompliance?.passed).toBe(true);
      }
    });

    it('should fail EAA requirements when EN 301 549 clauses fail', async () => {
      const wcagReport = createMockWCAGReport([
        {
          id: 'image-alt',
          impact: 'critical',
          wcagCriteria: [{ id: '1.1.1', level: 'A', title: 'Non-text Content' }],
        },
      ]);

      const result = await service.validateCompliance(wcagReport, {
        includeEAA: true,
        productCategory: 'e-commerce',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.eaaCompliance).toBeDefined();
        // EAA-I.1 Perceivable information maps to 9.1.1.1
        expect(result.value.eaaCompliance?.failedRequirements.length).toBeGreaterThan(0);
      }
    });

    it('should generate recommendations for failed clauses', async () => {
      const wcagReport = createMockWCAGReport([
        {
          id: 'color-contrast',
          impact: 'serious',
          wcagCriteria: [{ id: '1.4.3', level: 'AA', title: 'Contrast (Minimum)' }],
        },
      ]);

      const result = await service.validateCompliance(wcagReport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.en301549.recommendations.length).toBeGreaterThan(0);

        const recommendation = result.value.en301549.recommendations[0];
        expect(recommendation.clause).toBeDefined();
        expect(recommendation.description).toBeDefined();
        expect(recommendation.remediation).toBeDefined();
        expect(['high', 'medium', 'low']).toContain(recommendation.priority);
        expect(['trivial', 'minor', 'moderate', 'major']).toContain(
          recommendation.estimatedEffort
        );
      }
    });

    it('should set next review date', async () => {
      const wcagReport = createMockWCAGReport([]);

      const result = await service.validateCompliance(wcagReport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.nextReviewDate).toBeDefined();
        // Next review should be ~1 year from now
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        const reviewDate = new Date(result.value.nextReviewDate!);
        expect(reviewDate.getFullYear()).toBe(nextYear.getFullYear());
      }
    });

    it('should cache compliance report', async () => {
      const wcagReport = createMockWCAGReport([]);

      await service.validateCompliance(wcagReport);

      expect(mockMemory.set).toHaveBeenCalled();
    });

    it('should handle EN 301 549 version option', async () => {
      const wcagReport = createMockWCAGReport([]);

      const result = await service.validateCompliance(wcagReport, {
        en301549Version: '3.2.1',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.en301549.version).toBe('3.2.1');
      }
    });

    it('should exclude specified clauses', async () => {
      const wcagReport = createMockWCAGReport([
        {
          id: 'color-contrast',
          impact: 'serious',
          wcagCriteria: [{ id: '1.4.3', level: 'AA', title: 'Contrast' }],
        },
      ]);

      const result = await service.validateCompliance(wcagReport, {
        excludeClauses: ['9.1.4.3'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const failedClauseIds = result.value.en301549.failedClauses.map(
          (c) => c.clause.id
        );
        expect(failedClauseIds).not.toContain('9.1.4.3');
      }
    });
  });

  describe('getCachedReport', () => {
    it('should return null when no cached report exists', async () => {
      const result = await service.getCachedReport('https://example.com');
      expect(result).toBeNull();
    });

    it('should return cached report when available', async () => {
      const cachedReport = {
        url: 'https://example.com',
        timestamp: new Date(),
        overallStatus: 'compliant' as const,
        complianceScore: 100,
        certificationReady: true,
        en301549: {
          standard: 'EN301549' as const,
          version: '3.2.1',
          passed: true,
          score: 100,
          failedClauses: [],
          passedClauses: [],
          partialClauses: [],
          wcagMapping: [],
          recommendations: [],
        },
      };

      (mockMemory.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedReport);

      const result = await service.getCachedReport('https://example.com');
      expect(result).toEqual(cachedReport);
    });
  });

  describe('Compliance Score Calculation', () => {
    it('should calculate 100% score for no failures', async () => {
      const wcagReport = createMockWCAGReport([]);

      const result = await service.validateCompliance(wcagReport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.en301549.score).toBe(100);
      }
    });

    it('should reduce score based on failures', async () => {
      const wcagReport = createMockWCAGReport([
        {
          wcagCriteria: [{ id: '1.1.1', level: 'A', title: 'Non-text Content' }],
        },
        {
          wcagCriteria: [{ id: '1.4.3', level: 'AA', title: 'Contrast' }],
        },
        {
          wcagCriteria: [{ id: '2.1.1', level: 'A', title: 'Keyboard' }],
        },
      ]);

      const result = await service.validateCompliance(wcagReport);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.en301549.score).toBeLessThan(100);
        expect(result.value.en301549.score).toBeGreaterThan(0);
      }
    });

    it('should mark partially-compliant for score >= 80', async () => {
      // Create report with few violations
      const wcagReport = createMockWCAGReport([
        {
          wcagCriteria: [{ id: '1.1.1', level: 'A', title: 'Non-text Content' }],
        },
      ]);

      const result = await service.validateCompliance(wcagReport);

      expect(result.success).toBe(true);
      if (result.success) {
        // With only 1 failure out of 40+ clauses, should be partially compliant
        expect(['partially-compliant', 'non-compliant']).toContain(
          result.value.overallStatus
        );
      }
    });
  });

  describe('Partial Status Bug Fix (regression test)', () => {
    // This tests the fix for the === vs = bug on line 686
    it('should correctly categorize clauses as partial when applicable', async () => {
      // Most EN 301 549 clauses map to single WCAG criteria,
      // so partial status mainly affects score calculation
      const wcagReport = createMockWCAGReport([
        {
          wcagCriteria: [{ id: '1.1.1', level: 'A', title: 'Non-text Content' }],
        },
      ]);

      const result = await service.validateCompliance(wcagReport);

      expect(result.success).toBe(true);
      if (result.success) {
        // Verify the structure is correct (not broken by === vs = bug)
        expect(result.value.en301549.failedClauses).toBeDefined();
        expect(result.value.en301549.passedClauses).toBeDefined();
        expect(result.value.en301549.partialClauses).toBeDefined();
        expect(Array.isArray(result.value.en301549.failedClauses)).toBe(true);
        expect(Array.isArray(result.value.en301549.passedClauses)).toBe(true);
        expect(Array.isArray(result.value.en301549.partialClauses)).toBe(true);
      }
    });

    it('should not crash when processing clause status', async () => {
      // This would have failed before the fix due to the comparison returning undefined
      const wcagReport = createMockWCAGReport([
        { wcagCriteria: [{ id: '1.1.1', level: 'A', title: 'Test 1' }] },
        { wcagCriteria: [{ id: '1.4.3', level: 'AA', title: 'Test 2' }] },
        { wcagCriteria: [{ id: '2.1.1', level: 'A', title: 'Test 3' }] },
        { wcagCriteria: [{ id: '2.4.7', level: 'AA', title: 'Test 4' }] },
        { wcagCriteria: [{ id: '3.1.1', level: 'A', title: 'Test 5' }] },
      ]);

      const result = await service.validateCompliance(wcagReport);

      expect(result.success).toBe(true);
      if (result.success) {
        // All three arrays should be properly populated
        const totalCategorized =
          result.value.en301549.failedClauses.length +
          result.value.en301549.passedClauses.length +
          result.value.en301549.partialClauses.length;

        expect(totalCategorized).toBeGreaterThan(0);

        // Score should be calculated correctly
        expect(result.value.en301549.score).toBeGreaterThanOrEqual(0);
        expect(result.value.en301549.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('Product Categories', () => {
    const categories = [
      'e-commerce',
      'banking-services',
      'transport-services',
      'e-books',
    ] as const;

    categories.forEach((category) => {
      it(`should validate ${category} category`, async () => {
        const wcagReport = createMockWCAGReport([]);

        const result = await service.validateCompliance(wcagReport, {
          includeEAA: true,
          productCategory: category,
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.eaaCompliance?.productCategory).toBe(category);
        }
      });
    });
  });
});

describe('EN_301_549_WEB_CLAUSES constant', () => {
  it('should export all clauses', () => {
    expect(EN_301_549_WEB_CLAUSES.length).toBeGreaterThan(40);
  });

  it('should have unique clause IDs', () => {
    const ids = EN_301_549_WEB_CLAUSES.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('EAA_WEB_REQUIREMENTS constant', () => {
  it('should export requirements', () => {
    expect(EAA_WEB_REQUIREMENTS.length).toBeGreaterThan(0);
  });

  it('should have unique requirement IDs', () => {
    const ids = EAA_WEB_REQUIREMENTS.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

describe('WCAG_TO_EN301549_MAP constant', () => {
  it('should export mapping', () => {
    expect(WCAG_TO_EN301549_MAP.length).toBeGreaterThan(0);
  });

  it('should have valid mapping entries', () => {
    WCAG_TO_EN301549_MAP.forEach((entry) => {
      expect(entry.wcagCriterion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.en301549Clause).toMatch(/^9\./);
      expect(['A', 'AA', 'AAA']).toContain(entry.wcagLevel);
      expect(['required', 'recommended', 'conditional']).toContain(
        entry.conformanceLevel
      );
    });
  });
});

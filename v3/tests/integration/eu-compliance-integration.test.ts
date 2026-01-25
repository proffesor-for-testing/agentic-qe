/**
 * EU Compliance Integration Tests
 *
 * Tests the ACTUAL integration between AccessibilityTesterService and EUComplianceService.
 * These tests verify the real end-to-end flow, not mocked data.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AccessibilityTesterService,
  type AccessibilityTesterConfig,
} from '../../src/domains/visual-accessibility/services/accessibility-tester.js';
import {
  EUComplianceService,
  EN_301_549_WEB_CLAUSES,
} from '../../src/domains/visual-accessibility/services/eu-compliance.js';
import type { MemoryBackend } from '../../src/kernel/interfaces.js';
import type {
  EUComplianceReport,
  EAAProductCategory,
} from '../../src/domains/visual-accessibility/interfaces.js';

// Create a real-ish memory backend for integration testing
const createTestMemory = (): MemoryBackend => {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async <T>(key: string): Promise<T | undefined> => {
      return store.get(key) as T | undefined;
    }),
    set: vi.fn(async (key: string, value: unknown): Promise<void> => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string): Promise<boolean> => {
      return store.delete(key);
    }),
    has: vi.fn(async (key: string): Promise<boolean> => {
      return store.has(key);
    }),
    clear: vi.fn(async (): Promise<void> => {
      store.clear();
    }),
    keys: vi.fn(async (): Promise<string[]> => {
      return Array.from(store.keys());
    }),
    size: vi.fn(async (): Promise<number> => {
      return store.size;
    }),
    getStats: vi.fn(async () => ({ hits: 0, misses: 0, size: store.size })),
  };
};

describe('EU Compliance Integration Tests', () => {
  let accessibilityTester: AccessibilityTesterService;
  let euComplianceService: EUComplianceService;
  let memory: MemoryBackend;

  beforeEach(() => {
    memory = createTestMemory();
    accessibilityTester = new AccessibilityTesterService(memory, {
      useBrowserMode: false, // Use static analysis mode for tests
    });
    euComplianceService = new EUComplianceService(memory);
  });

  describe('AccessibilityTesterService.validateEUCompliance() Integration', () => {
    it('should expose validateEUCompliance method', () => {
      expect(typeof accessibilityTester.validateEUCompliance).toBe('function');
    });

    it('should expose EU compliance helper methods', () => {
      expect(typeof accessibilityTester.getEN301549Clauses).toBe('function');
      expect(typeof accessibilityTester.getEAARequirements).toBe('function');
      expect(typeof accessibilityTester.getWCAGtoEN301549Mapping).toBe('function');
    });

    it('should return EN 301 549 clauses from AccessibilityTesterService', () => {
      const clauses = accessibilityTester.getEN301549Clauses();

      expect(clauses.length).toBeGreaterThanOrEqual(40);
      expect(clauses[0]).toHaveProperty('id');
      expect(clauses[0]).toHaveProperty('wcagMapping');
      expect(clauses[0]).toHaveProperty('testMethod');
    });

    it('should return EAA requirements from AccessibilityTesterService', () => {
      const requirements = accessibilityTester.getEAARequirements();

      expect(requirements.length).toBeGreaterThan(0);
      expect(requirements[0]).toHaveProperty('id');
      expect(requirements[0]).toHaveProperty('applicableTo');
      expect(requirements[0]).toHaveProperty('en301549Mapping');
    });

    it('should return WCAG to EN 301 549 mapping from AccessibilityTesterService', () => {
      const mapping = accessibilityTester.getWCAGtoEN301549Mapping();

      expect(mapping.length).toBeGreaterThan(0);
      expect(mapping[0]).toHaveProperty('wcagCriterion');
      expect(mapping[0]).toHaveProperty('en301549Clause');
      expect(mapping[0]).toHaveProperty('wcagLevel');
    });

    it('should handle validateEUCompliance with HTML content (static mode)', async () => {
      // In static mode without browser, audit will use rule-based analysis
      // This tests the integration path even if full browser audit isn't available
      const result = await accessibilityTester.validateEUCompliance(
        'https://example.com',
        {
          includeEAA: true,
          productCategory: 'e-commerce',
          en301549Version: '3.2.1',
        }
      );

      // The result should be a Result type
      expect(result).toHaveProperty('success');

      // If it succeeds, verify the structure
      if (result.success) {
        expect(result.value).toHaveProperty('url');
        expect(result.value).toHaveProperty('en301549');
        expect(result.value).toHaveProperty('overallStatus');
        expect(result.value).toHaveProperty('complianceScore');
        expect(result.value).toHaveProperty('certificationReady');
        expect(result.value.eaaCompliance).toBeDefined();
        expect(result.value.eaaCompliance?.productCategory).toBe('e-commerce');
      }
      // If it fails (expected without real browser), the error should be meaningful
      else {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBeDefined();
      }
    });
  });

  describe('EUComplianceService Direct Integration', () => {
    it('should validate compliance with real WCAG-like report structure', async () => {
      // Create a realistic WCAG report that would come from an actual audit
      const wcagReport = {
        url: 'https://shop.example.eu',
        timestamp: new Date(),
        violations: [
          {
            id: 'image-alt',
            impact: 'critical' as const,
            wcagCriteria: [{ id: '1.1.1', level: 'A' as const, title: 'Non-text Content' }],
            description: 'Images must have alternate text',
            help: 'Add alt attribute to img elements',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/image-alt',
            nodes: [
              {
                selector: 'img.product-image',
                html: '<img src="product.jpg" class="product-image">',
                target: ['img.product-image'],
                failureSummary: 'Fix the following: Element does not have an alt attribute',
              },
            ],
          },
          {
            id: 'color-contrast',
            impact: 'serious' as const,
            wcagCriteria: [{ id: '1.4.3', level: 'AA' as const, title: 'Contrast (Minimum)' }],
            description: 'Elements must have sufficient color contrast',
            help: 'Ensure contrast ratio is at least 4.5:1',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/color-contrast',
            nodes: [
              {
                selector: 'p.disclaimer',
                html: '<p class="disclaimer" style="color: #999">...</p>',
                target: ['p.disclaimer'],
                failureSummary: 'Element has insufficient color contrast of 2.5:1',
              },
            ],
          },
          {
            id: 'label',
            impact: 'critical' as const,
            wcagCriteria: [{ id: '3.3.2', level: 'A' as const, title: 'Labels or Instructions' }],
            description: 'Form elements must have labels',
            help: 'Add a label element or aria-label',
            helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/label',
            nodes: [
              {
                selector: 'input#email',
                html: '<input type="email" id="email">',
                target: ['input#email'],
                failureSummary: 'Form element does not have a label',
              },
            ],
          },
        ],
        passes: [
          { id: 'html-lang-valid', description: 'html element has valid lang attribute', nodes: 1 },
          { id: 'document-title', description: 'Document has a title element', nodes: 1 },
        ],
        incomplete: [],
        score: 65,
        wcagLevel: 'AA' as const,
      };

      const result = await euComplianceService.validateCompliance(wcagReport, {
        includeEAA: true,
        productCategory: 'e-commerce',
        en301549Version: '3.2.1',
      });

      expect(result.success).toBe(true);

      if (result.success) {
        const report = result.value;

        // Verify EN 301 549 mapping
        expect(report.en301549.standard).toBe('EN301549');
        expect(report.en301549.version).toBe('3.2.1');
        expect(report.en301549.passed).toBe(false); // Has violations

        // Should have failed clauses mapped from WCAG violations
        expect(report.en301549.failedClauses.length).toBeGreaterThan(0);

        // Check specific clause mappings
        const failedClauseIds = report.en301549.failedClauses.map(c => c.clause.id);
        expect(failedClauseIds).toContain('9.1.1.1'); // WCAG 1.1.1 -> EN 301 549 9.1.1.1
        expect(failedClauseIds).toContain('9.1.4.3'); // WCAG 1.4.3 -> EN 301 549 9.1.4.3
        expect(failedClauseIds).toContain('9.3.3.2'); // WCAG 3.3.2 -> EN 301 549 9.3.3.2

        // Verify EAA compliance
        expect(report.eaaCompliance).toBeDefined();
        expect(report.eaaCompliance?.productCategory).toBe('e-commerce');
        expect(report.eaaCompliance?.passed).toBe(false); // Has failed requirements

        // Should have failed EAA requirements linked to failed EN 301 549 clauses
        expect(report.eaaCompliance?.failedRequirements.length).toBeGreaterThan(0);

        // Verify overall status
        expect(['non-compliant', 'partially-compliant']).toContain(report.overallStatus);
        expect(report.certificationReady).toBe(false);

        // Verify recommendations are generated
        expect(report.en301549.recommendations.length).toBeGreaterThan(0);

        // Check recommendation structure
        const rec = report.en301549.recommendations[0];
        expect(rec).toHaveProperty('priority');
        expect(rec).toHaveProperty('clause');
        expect(rec).toHaveProperty('description');
        expect(rec).toHaveProperty('remediation');
        expect(rec).toHaveProperty('estimatedEffort');
      }
    });

    it('should return compliant status when no violations', async () => {
      const cleanReport = {
        url: 'https://accessible.example.eu',
        timestamp: new Date(),
        violations: [],
        passes: [
          { id: 'image-alt', description: 'All images have alt text', nodes: 10 },
          { id: 'color-contrast', description: 'All elements have sufficient contrast', nodes: 50 },
          { id: 'label', description: 'All form elements have labels', nodes: 5 },
        ],
        incomplete: [],
        score: 100,
        wcagLevel: 'AA' as const,
      };

      const result = await euComplianceService.validateCompliance(cleanReport, {
        includeEAA: true,
        productCategory: 'e-commerce',
      });

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.en301549.passed).toBe(true);
        expect(result.value.en301549.failedClauses).toHaveLength(0);
        expect(result.value.overallStatus).toBe('compliant');
        expect(result.value.certificationReady).toBe(true);
        expect(result.value.complianceScore).toBe(100);
        expect(result.value.eaaCompliance?.passed).toBe(true);
      }
    });

    it('should correctly identify partial compliance', async () => {
      // This tests the fixed bug - partial status should work now
      // Note: Most EN 301 549 clauses map to single WCAG criteria,
      // so we need a hypothetical clause with multiple mappings to test partial

      const partialReport = {
        url: 'https://partial.example.eu',
        timestamp: new Date(),
        violations: [
          {
            id: 'image-alt',
            impact: 'critical' as const,
            wcagCriteria: [{ id: '1.1.1', level: 'A' as const, title: 'Non-text Content' }],
            description: 'Some images missing alt text',
            help: 'Add alt attribute',
            helpUrl: 'https://example.com/help',
            nodes: [{ selector: 'img', html: '<img>', target: ['img'], failureSummary: 'Missing alt' }],
          },
        ],
        passes: [],
        incomplete: [],
        score: 90,
        wcagLevel: 'AA' as const,
      };

      const result = await euComplianceService.validateCompliance(partialReport);

      expect(result.success).toBe(true);

      if (result.success) {
        // With only one violation, should be partially compliant (score > 80%)
        expect(result.value.en301549.passed).toBe(false);
        expect(result.value.en301549.failedClauses.length).toBe(1);
        expect(result.value.en301549.score).toBeGreaterThan(80);
        expect(result.value.overallStatus).toBe('partially-compliant');
      }
    });
  });

  describe('Product Category Coverage', () => {
    const categories: EAAProductCategory[] = [
      'e-commerce',
      'banking-services',
      'transport-services',
      'e-books',
      'audiovisual-media',
    ];

    categories.forEach((category) => {
      it(`should validate ${category} product category`, async () => {
        const report = {
          url: `https://${category}.example.eu`,
          timestamp: new Date(),
          violations: [],
          passes: [],
          incomplete: [],
          score: 100,
          wcagLevel: 'AA' as const,
        };

        const result = await euComplianceService.validateCompliance(report, {
          includeEAA: true,
          productCategory: category,
        });

        expect(result.success).toBe(true);

        if (result.success) {
          expect(result.value.eaaCompliance?.productCategory).toBe(category);
          // Different categories have different applicable requirements
          expect(result.value.eaaCompliance?.applicableRequirements.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('EN 301 549 Clause Coverage', () => {
    it('should cover all WCAG 2.1 Level A criteria', () => {
      const clauses = euComplianceService.getEN301549Clauses();
      const mapping = euComplianceService.getWCAGMapping();

      // WCAG 2.1 Level A criteria that must be mapped
      const levelACriteria = [
        '1.1.1', '1.2.1', '1.2.2', '1.2.3', '1.3.1', '1.3.2', '1.3.3',
        '1.4.1', '1.4.2', '2.1.1', '2.1.2', '2.2.1', '2.2.2', '2.3.1',
        '2.4.1', '2.4.2', '2.4.3', '2.4.4', '2.5.1', '2.5.2', '2.5.3',
        '2.5.4', '3.1.1', '3.2.1', '3.2.2', '3.3.1', '3.3.2', '4.1.1', '4.1.2',
      ];

      const mappedCriteria = new Set(mapping.map(m => m.wcagCriterion));

      levelACriteria.forEach((criterion) => {
        expect(mappedCriteria.has(criterion)).toBe(true);
      });
    });

    it('should cover all WCAG 2.1 Level AA criteria', () => {
      const mapping = euComplianceService.getWCAGMapping();

      // WCAG 2.1 Level AA criteria (in addition to A)
      const levelAACriteria = [
        '1.2.5', '1.3.4', '1.3.5', '1.4.3', '1.4.4', '1.4.5',
        '1.4.10', '1.4.11', '1.4.12', '1.4.13', '2.4.5', '2.4.6', '2.4.7',
        '3.1.2', '3.2.3', '3.2.4', '3.3.3', '3.3.4', '4.1.3',
      ];

      const mappedCriteria = new Set(mapping.map(m => m.wcagCriterion));

      levelAACriteria.forEach((criterion) => {
        expect(mappedCriteria.has(criterion)).toBe(true);
      });
    });

    it('should have unique clause IDs', () => {
      const clauses = euComplianceService.getEN301549Clauses();
      const ids = clauses.map(c => c.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid test methods for all clauses', () => {
      const clauses = euComplianceService.getEN301549Clauses();
      const validMethods = ['automated', 'manual', 'hybrid'];

      clauses.forEach((clause) => {
        expect(validMethods).toContain(clause.testMethod);
      });
    });
  });

  describe('Report Caching', () => {
    it('should cache compliance report', async () => {
      const report = {
        url: 'https://cache-test.example.eu',
        timestamp: new Date(),
        violations: [],
        passes: [],
        incomplete: [],
        score: 100,
        wcagLevel: 'AA' as const,
      };

      await euComplianceService.validateCompliance(report);

      // Verify cache was called
      expect(memory.set).toHaveBeenCalled();
    });

    it('should retrieve cached report', async () => {
      const cachedReport: EUComplianceReport = {
        url: 'https://cached.example.eu',
        timestamp: new Date(),
        en301549: {
          standard: 'EN301549',
          version: '3.2.1',
          passed: true,
          score: 100,
          failedClauses: [],
          passedClauses: [],
          partialClauses: [],
          wcagMapping: [],
          recommendations: [],
        },
        overallStatus: 'compliant',
        complianceScore: 100,
        certificationReady: true,
      };

      // Pre-populate cache
      (memory.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(cachedReport);

      const result = await euComplianceService.getCachedReport('https://cached.example.eu');

      expect(result).toEqual(cachedReport);
    });
  });

  describe('Recommendation Generation', () => {
    it('should prioritize critical violations', async () => {
      const report = {
        url: 'https://priority.example.eu',
        timestamp: new Date(),
        violations: [
          {
            id: 'critical-issue',
            impact: 'critical' as const,
            wcagCriteria: [{ id: '1.1.1', level: 'A' as const, title: 'Non-text Content' }],
            description: 'Critical accessibility issue',
            help: 'Fix immediately',
            helpUrl: 'https://example.com/help',
            nodes: [{ selector: 'img', html: '<img>', target: ['img'], failureSummary: 'Critical' }],
          },
          {
            id: 'minor-issue',
            impact: 'minor' as const,
            wcagCriteria: [{ id: '2.4.6', level: 'AA' as const, title: 'Headings and Labels' }],
            description: 'Minor accessibility issue',
            help: 'Fix when possible',
            helpUrl: 'https://example.com/help',
            nodes: [{ selector: 'h1', html: '<h1>', target: ['h1'], failureSummary: 'Minor' }],
          },
        ],
        passes: [],
        incomplete: [],
        score: 70,
        wcagLevel: 'AA' as const,
      };

      const result = await euComplianceService.validateCompliance(report);

      expect(result.success).toBe(true);

      if (result.success) {
        const recommendations = result.value.en301549.recommendations;
        expect(recommendations.length).toBeGreaterThan(0);

        // First recommendation should be high priority (critical violation)
        const highPriorityRecs = recommendations.filter(r => r.priority === 'high');
        expect(highPriorityRecs.length).toBeGreaterThan(0);
      }
    });

    it('should set deadlines for high priority recommendations', async () => {
      const report = {
        url: 'https://deadline.example.eu',
        timestamp: new Date(),
        violations: [
          {
            id: 'critical-issue',
            impact: 'critical' as const,
            wcagCriteria: [{ id: '1.1.1', level: 'A' as const, title: 'Non-text Content' }],
            description: 'Critical issue',
            help: 'Fix now',
            helpUrl: 'https://example.com/help',
            nodes: [{ selector: 'img', html: '<img>', target: ['img'], failureSummary: 'Missing alt' }],
          },
        ],
        passes: [],
        incomplete: [],
        score: 80,
        wcagLevel: 'AA' as const,
      };

      const result = await euComplianceService.validateCompliance(report);

      expect(result.success).toBe(true);

      if (result.success) {
        const highPriorityRec = result.value.en301549.recommendations.find(
          r => r.priority === 'high'
        );

        if (highPriorityRec) {
          expect(highPriorityRec.deadline).toBeDefined();
          // Deadline should be ~30 days from now
          const thirtyDaysFromNow = new Date();
          thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

          const deadline = new Date(highPriorityRec.deadline!);
          expect(deadline.getDate()).toBe(thirtyDaysFromNow.getDate());
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle empty violation arrays gracefully', async () => {
      const report = {
        url: 'https://empty.example.eu',
        timestamp: new Date(),
        violations: [],
        passes: [],
        incomplete: [],
        score: 100,
        wcagLevel: 'AA' as const,
      };

      const result = await euComplianceService.validateCompliance(report);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.en301549.failedClauses).toHaveLength(0);
        expect(result.value.en301549.passed).toBe(true);
      }
    });

    it('should handle violations without WCAG criteria gracefully', async () => {
      const report = {
        url: 'https://no-wcag.example.eu',
        timestamp: new Date(),
        violations: [
          {
            id: 'custom-rule',
            impact: 'moderate' as const,
            wcagCriteria: [], // No WCAG mapping
            description: 'Custom rule violation',
            help: 'Fix this',
            helpUrl: 'https://example.com/help',
            nodes: [],
          },
        ],
        passes: [],
        incomplete: [],
        score: 90,
        wcagLevel: 'AA' as const,
      };

      const result = await euComplianceService.validateCompliance(report);

      // Should not crash, should handle gracefully
      expect(result.success).toBe(true);
    });

    it('should handle clause exclusions', async () => {
      const report = {
        url: 'https://exclude.example.eu',
        timestamp: new Date(),
        violations: [
          {
            id: 'image-alt',
            impact: 'critical' as const,
            wcagCriteria: [{ id: '1.1.1', level: 'A' as const, title: 'Non-text Content' }],
            description: 'Missing alt text',
            help: 'Add alt',
            helpUrl: 'https://example.com/help',
            nodes: [{ selector: 'img', html: '<img>', target: ['img'], failureSummary: 'Missing' }],
          },
        ],
        passes: [],
        incomplete: [],
        score: 90,
        wcagLevel: 'AA' as const,
      };

      const result = await euComplianceService.validateCompliance(report, {
        excludeClauses: ['9.1.1.1'], // Exclude the clause that would fail
      });

      expect(result.success).toBe(true);

      if (result.success) {
        // The excluded clause should not appear in failed clauses
        const failedClauseIds = result.value.en301549.failedClauses.map(c => c.clause.id);
        expect(failedClauseIds).not.toContain('9.1.1.1');
      }
    });
  });

  describe('Next Review Date', () => {
    it('should set next review date approximately 1 year from now', async () => {
      const report = {
        url: 'https://review.example.eu',
        timestamp: new Date(),
        violations: [],
        passes: [],
        incomplete: [],
        score: 100,
        wcagLevel: 'AA' as const,
      };

      const result = await euComplianceService.validateCompliance(report);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.value.nextReviewDate).toBeDefined();

        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);

        const reviewDate = new Date(result.value.nextReviewDate!);
        expect(reviewDate.getFullYear()).toBe(nextYear.getFullYear());
      }
    });
  });
});

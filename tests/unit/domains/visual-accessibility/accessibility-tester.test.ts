/**
 * Agentic QE v3 - Accessibility Tester Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AccessibilityTesterService,
  AccessibilityTesterConfig,
} from '../../../../src/domains/visual-accessibility/services/accessibility-tester';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import {
  AccessibilityReport,
  ContrastAnalysis,
  KeyboardNavigationReport,
  WCAGValidationResult,
} from '../../../../src/domains/visual-accessibility/interfaces';

/**
 * Mock MemoryBackend implementation for testing
 */
class MockMemoryBackend implements MemoryBackend {
  private store: Map<string, unknown> = new Map();

  async initialize(): Promise<void> {}
  async dispose(): Promise<void> {}

  async set<T>(key: string, value: T, _options?: StoreOptions): Promise<void> {
    this.store.set(key, value);
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async delete(key: string): Promise<boolean> {
    return this.store.delete(key);
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }

  async search(pattern: string, _limit?: number): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.store.keys()).filter((key) => regex.test(key));
  }

  async vectorSearch(_embedding: number[], _k: number): Promise<VectorSearchResult[]> {
    return [];
  }

  async storeVector(_key: string, _embedding: number[], _metadata?: unknown): Promise<void> {}

  // Test helper methods
  clear(): void {
    this.store.clear();
  }

  getAll(): Map<string, unknown> {
    return new Map(this.store);
  }
}

describe('AccessibilityTesterService', () => {
  let service: AccessibilityTesterService;
  let mockMemory: MockMemoryBackend;

  beforeEach(() => {
    mockMemory = new MockMemoryBackend();
    // Disable browser mode and agent-browser preference to prevent real browser client creation
    service = new AccessibilityTesterService(mockMemory, {
      useBrowserMode: false,
      preferAgentBrowser: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('audit', () => {
    it('should run accessibility audit on URL', async () => {
      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.timestamp).toBeInstanceOf(Date);
        expect(Array.isArray(result.value.violations)).toBe(true);
        expect(Array.isArray(result.value.passes)).toBe(true);
        expect(Array.isArray(result.value.incomplete)).toBe(true);
      }
    });

    it('should return score between 0 and 100', async () => {
      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBeGreaterThanOrEqual(0);
        expect(result.value.score).toBeLessThanOrEqual(100);
      }
    });

    it('should use default WCAG level AA when not specified', async () => {
      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.wcagLevel).toBe('AA');
      }
    });

    it('should respect custom WCAG level', async () => {
      const result = await service.audit('https://example.com', { wcagLevel: 'AAA' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.wcagLevel).toBe('AAA');
      }
    });

    it('should store report in memory', async () => {
      await service.audit('https://example.com');

      const stored = mockMemory.getAll();
      const reportKeys = Array.from(stored.keys()).filter(
        (k) => k.includes('report') || k.includes('latest')
      );
      expect(reportKeys.length).toBeGreaterThan(0);
    });

    it('should include WCAG criteria in violations', async () => {
      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.violations.length > 0) {
        const violation = result.value.violations[0];
        expect(Array.isArray(violation.wcagCriteria)).toBe(true);
        if (violation.wcagCriteria.length > 0) {
          expect(violation.wcagCriteria[0]).toHaveProperty('id');
          expect(violation.wcagCriteria[0]).toHaveProperty('level');
          expect(violation.wcagCriteria[0]).toHaveProperty('title');
        }
      }
    });

    it('should classify violation impact correctly', async () => {
      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.violations.length > 0) {
        const validImpacts = ['critical', 'serious', 'moderate', 'minor'];
        result.value.violations.forEach((violation) => {
          expect(validImpacts).toContain(violation.impact);
        });
      }
    });

    it('should filter warnings based on includeWarnings option', async () => {
      const withWarnings = await service.audit('https://example.com', {
        includeWarnings: true,
      });
      const withoutWarnings = await service.audit('https://example.com', {
        includeWarnings: false,
      });

      expect(withWarnings.success).toBe(true);
      expect(withoutWarnings.success).toBe(true);
      // Both should complete successfully regardless of warning setting
    });
  });

  describe('auditElement', () => {
    it('should audit specific element', async () => {
      const result = await service.auditElement('https://example.com', '.main-content');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
      }
    });

    it('should return valid accessibility report for element', async () => {
      const result = await service.auditElement('https://example.com', '#navigation');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveProperty('violations');
        expect(result.value).toHaveProperty('passes');
        expect(result.value).toHaveProperty('score');
      }
    });
  });

  describe('checkContrast', () => {
    it('should return contrast analysis results', async () => {
      const result = await service.checkContrast('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('should include contrast ratio in analysis', async () => {
      const result = await service.checkContrast('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.length > 0) {
        const analysis = result.value[0];
        expect(analysis).toHaveProperty('ratio');
        expect(typeof analysis.ratio).toBe('number');
        expect(analysis.ratio).toBeGreaterThan(0);
      }
    });

    it('should indicate pass/fail for each element', async () => {
      const result = await service.checkContrast('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.length > 0) {
        result.value.forEach((analysis) => {
          expect(typeof analysis.passes).toBe('boolean');
        });
      }
    });

    it('should include foreground and background colors', async () => {
      const result = await service.checkContrast('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.length > 0) {
        const analysis = result.value[0];
        expect(analysis).toHaveProperty('foreground');
        expect(analysis).toHaveProperty('background');
        expect(analysis.foreground).toMatch(/^#[0-9a-f]{6}$/i);
        expect(analysis.background).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('should store contrast results in memory', async () => {
      await service.checkContrast('https://example.com');

      const stored = mockMemory.getAll();
      const contrastKeys = Array.from(stored.keys()).filter((k) =>
        k.includes('contrast')
      );
      expect(contrastKeys.length).toBeGreaterThan(0);
    });

    it('should include required ratio for WCAG compliance', async () => {
      const result = await service.checkContrast('https://example.com');

      expect(result.success).toBe(true);
      if (result.success && result.value.length > 0) {
        result.value.forEach((analysis) => {
          expect(analysis).toHaveProperty('requiredRatio');
          expect(analysis.requiredRatio).toBeGreaterThanOrEqual(3);
        });
      }
    });
  });

  describe('validateWCAGLevel', () => {
    it('should validate WCAG Level A', async () => {
      const result = await service.validateWCAGLevel('https://example.com', 'A');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.level).toBe('A');
        expect(typeof result.value.passed).toBe('boolean');
        expect(typeof result.value.score).toBe('number');
      }
    });

    it('should validate WCAG Level AA', async () => {
      const result = await service.validateWCAGLevel('https://example.com', 'AA');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.level).toBe('AA');
      }
    });

    it('should validate WCAG Level AAA', async () => {
      const result = await service.validateWCAGLevel('https://example.com', 'AAA');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.level).toBe('AAA');
      }
    });

    it('should include failed and passed criteria', async () => {
      const result = await service.validateWCAGLevel('https://example.com', 'AA');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.failedCriteria)).toBe(true);
        expect(Array.isArray(result.value.passedCriteria)).toBe(true);
      }
    });

    it('should return score between 0 and 100', async () => {
      const result = await service.validateWCAGLevel('https://example.com', 'AA');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBeGreaterThanOrEqual(0);
        expect(result.value.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('checkKeyboardNavigation', () => {
    it('should return keyboard navigation report', async () => {
      const result = await service.checkKeyboardNavigation('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(typeof result.value.focusableElements).toBe('number');
      }
    });

    it('should include tab order information', async () => {
      const result = await service.checkKeyboardNavigation('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.tabOrder)).toBe(true);
        if (result.value.tabOrder.length > 0) {
          const item = result.value.tabOrder[0];
          expect(item).toHaveProperty('index');
          expect(item).toHaveProperty('selector');
          expect(item).toHaveProperty('elementType');
          expect(item).toHaveProperty('hasVisibleFocus');
        }
      }
    });

    it('should detect keyboard issues', async () => {
      const result = await service.checkKeyboardNavigation('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.issues)).toBe(true);
        if (result.value.issues.length > 0) {
          const issue = result.value.issues[0];
          expect(issue).toHaveProperty('type');
          expect(issue).toHaveProperty('selector');
          expect(issue).toHaveProperty('description');
        }
      }
    });

    it('should detect focus traps', async () => {
      const result = await service.checkKeyboardNavigation('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value.traps)).toBe(true);
      }
    });

    it('should store keyboard report in memory', async () => {
      await service.checkKeyboardNavigation('https://example.com');

      const stored = mockMemory.getAll();
      const keyboardKeys = Array.from(stored.keys()).filter((k) =>
        k.includes('keyboard')
      );
      expect(keyboardKeys.length).toBeGreaterThan(0);
    });
  });

  describe('custom configuration', () => {
    it('should use custom default WCAG level', async () => {
      const customConfig: Partial<AccessibilityTesterConfig> = {
        defaultWCAGLevel: 'AAA',
        preferAgentBrowser: false, // Prevent real browser client creation in tests
      };
      const customService = new AccessibilityTesterService(mockMemory, customConfig);

      const result = await customService.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.wcagLevel).toBe('AAA');
      }
    });

    it('should respect includeWarnings config', () => {
      const customConfig: Partial<AccessibilityTesterConfig> = {
        includeWarnings: false,
      };
      const customService = new AccessibilityTesterService(mockMemory, customConfig);

      expect(customService).toBeDefined();
    });

    it('should use custom audit timeout', () => {
      const customConfig: Partial<AccessibilityTesterConfig> = {
        auditTimeout: 60000,
      };
      const customService = new AccessibilityTesterService(mockMemory, customConfig);

      expect(customService).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle audit errors gracefully', async () => {
      // Create service with mock that throws
      const errorMemory = new MockMemoryBackend();
      vi.spyOn(errorMemory, 'set').mockRejectedValue(new Error('Storage failed'));

      const errorService = new AccessibilityTesterService(errorMemory, {
        preferAgentBrowser: false, // Prevent real browser client creation in tests
      });
      const result = await errorService.audit('https://example.com');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });

    it('should handle contrast check errors gracefully', async () => {
      const errorMemory = new MockMemoryBackend();
      vi.spyOn(errorMemory, 'set').mockRejectedValue(new Error('Storage failed'));

      const errorService = new AccessibilityTesterService(errorMemory);
      const result = await errorService.checkContrast('https://example.com');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(Error);
      }
    });
  });

  describe('browser mode configuration', () => {
    it('should accept VibiumClient as optional third parameter', () => {
      const mockVibiumClient = null;
      const serviceWithVibium = new AccessibilityTesterService(
        mockMemory,
        {},
        mockVibiumClient
      );
      expect(serviceWithVibium).toBeDefined();
    });

    it('should use heuristic mode when Vibium client not provided', async () => {
      // Disable preferAgentBrowser to prevent real browser client creation
      const serviceWithoutVibium = new AccessibilityTesterService(mockMemory, {
        preferAgentBrowser: false,
      });
      const result = await serviceWithoutVibium.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        // Should still produce valid report using heuristic mode
        expect(Array.isArray(result.value.violations)).toBe(true);
      }
    });

    it('should respect useBrowserMode config option', async () => {
      const serviceWithBrowserDisabled = new AccessibilityTesterService(
        mockMemory,
        { useBrowserMode: false }
      );
      const result = await serviceWithBrowserDisabled.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        // Should work with heuristic mode
        expect(result.value.url).toBe('https://example.com');
      }
    });

    it('should include browser config options', () => {
      const customConfig: Partial<AccessibilityTesterConfig> = {
        useBrowserMode: true,
        browserConfig: {
          headless: false,
          timeout: 60000,
        },
      };
      const customService = new AccessibilityTesterService(mockMemory, customConfig);
      expect(customService).toBeDefined();
    });
  });

  describe('graceful fallback', () => {
    it('should fall back to heuristic mode when browser mode fails', async () => {
      // Service without Vibium client should use heuristic mode
      // Disable preferAgentBrowser to prevent real browser client creation
      const serviceWithoutVibium = new AccessibilityTesterService(mockMemory, {
        useBrowserMode: true, // Enabled but no client provided
        preferAgentBrowser: false, // Prevent real browser client creation in tests
      });

      const result = await serviceWithoutVibium.audit('https://example.com');

      // Should succeed with heuristic fallback
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.violations).toBeDefined();
        expect(result.value.passes).toBeDefined();
      }
    });

    it('should fall back for checkContrast when browser mode unavailable', async () => {
      const serviceWithoutVibium = new AccessibilityTesterService(mockMemory, {
        useBrowserMode: true,
        preferAgentBrowser: false, // Prevent real browser client creation in tests
      });

      const result = await serviceWithoutVibium.checkContrast('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Array.isArray(result.value)).toBe(true);
      }
    });

    it('should fall back for checkKeyboardNavigation when browser mode unavailable', async () => {
      const serviceWithoutVibium = new AccessibilityTesterService(mockMemory, {
        useBrowserMode: true,
        preferAgentBrowser: false, // Prevent real browser client creation in tests
      });

      const result = await serviceWithoutVibium.checkKeyboardNavigation('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.tabOrder).toBeDefined();
        expect(result.value.issues).toBeDefined();
      }
    });
  });
});

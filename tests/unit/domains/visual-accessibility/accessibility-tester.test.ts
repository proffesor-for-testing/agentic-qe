/**
 * Agentic QE v3 - Accessibility Tester Service Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AccessibilityTesterService,
  AccessibilityTesterConfig,
} from '../../../../src/domains/visual-accessibility/services/accessibility-tester';
import { MemoryBackend, StoreOptions, VectorSearchResult } from '../../../../src/kernel/interfaces';
import { ok, err } from '../../../../src/shared/types';
import type { IBrowserClient } from '../../../../src/integrations/browser';

/**
 * Browser client double: navigation succeeds and axe-core reports one
 * color-contrast violation, or navigation fails like an unresolvable host.
 */
function createBrowserClient(options: { navigationError?: string } = {}): IBrowserClient {
  const axeResult = {
    violations: [{
      id: 'color-contrast', impact: 'serious', description: 'Elements must have sufficient color contrast',
      help: 'Elements must meet minimum color contrast ratio thresholds',
      tags: ['wcag2aa', 'wcag143'],
      nodes: [{ selector: 'p.muted', html: '<p class="muted">', target: ['p.muted'], failureSummary: 'ratio 2.1:1' }],
    }],
    passes: ['html-has-lang', 'image-alt'],
    incomplete: [],
    inapplicable: [],
  };
  return {
    tool: 'vibium',
    launch: vi.fn().mockResolvedValue(ok({ id: 'session' })),
    navigate: vi.fn().mockResolvedValue(options.navigationError
      ? err(new Error(options.navigationError))
      : ok({ url: 'http://127.0.0.1/', title: 'page', statusCode: 200, loadTime: 1 })),
    evaluate: vi.fn().mockResolvedValue(ok(JSON.stringify(axeResult))),
    quit: vi.fn().mockResolvedValue(ok(undefined)),
    isAvailable: vi.fn().mockResolvedValue(true),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as IBrowserClient;
}

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

    it('should report score -1, not a 0-100 grade, when the page was not measured (#1145)', async () => {
      const result = await service.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.measured).toBe(false);
        expect(result.value.score).toBe(-1);
      }
    });

    it('should return a measured score between 0 and 100', async () => {
      const measuredService = new AccessibilityTesterService(mockMemory, {
        browserClient: createBrowserClient(), preferAgentBrowser: false,
      });
      const result = await measuredService.audit('http://127.0.0.1/');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.measured).toBe(true);
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

    it('should not store an unmeasured report as evidence (#1145)', async () => {
      await service.audit('https://example.com');

      const reportKeys = Array.from(mockMemory.getAll().keys()).filter(
        (k) => k.includes('report') || k.includes('latest')
      );
      expect(reportKeys).toEqual([]);
    });

    it('should store a measured report in memory', async () => {
      const measuredService = new AccessibilityTesterService(mockMemory, {
        browserClient: createBrowserClient(), preferAgentBrowser: false,
      });
      await measuredService.audit('http://127.0.0.1/');

      const reportKeys = Array.from(mockMemory.getAll().keys()).filter(
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
    it('should refuse with the reason when no browser measured contrast (#1145)', async () => {
      const result = await service.checkContrast('https://example.com');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('NOT MEASURED');
        expect(result.error.message).toContain('browser mode is disabled');
      }
    });

    it('should not cache anything when contrast was not measured', async () => {
      await service.checkContrast('https://example.com');

      const contrastKeys = Array.from(mockMemory.getAll().keys()).filter((k) => k.includes('contrast'));
      expect(contrastKeys).toEqual([]);
    });
  });

  describe('validateWCAGLevel', () => {
    it.each(['A', 'AA', 'AAA'] as const)(
      'should give no WCAG %s verdict when the page was not measured (#1145)',
      async (level) => {
        const result = await service.validateWCAGLevel('https://example.com', level);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.message).toContain(`WCAG ${level} validation NOT MEASURED`);
        }
      }
    );

    it('should give the same refusal for every URL instead of a URL-hash verdict', async () => {
      const a = await service.validateWCAGLevel('https://a.example', 'AA');
      const b = await service.validateWCAGLevel('https://b.example/dashboard', 'AA');

      expect(a.success).toBe(false);
      expect(b.success).toBe(false);
    });

    it('should derive failed criteria from measured axe-core violations', async () => {
      const measuredService = new AccessibilityTesterService(mockMemory, {
        browserClient: createBrowserClient(), preferAgentBrowser: false,
      });
      const result = await measuredService.validateWCAGLevel('http://127.0.0.1/', 'AA');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.measured).toBe(true);
        expect(result.value.passed).toBe(false);
        expect(result.value.failedCriteria.map((c) => c.id)).toEqual(['1.4.3']);
        expect(result.value.passedCriteria.map((c) => c.id)).not.toContain('1.4.3');
        expect(result.value.score).toBeGreaterThanOrEqual(0);
        expect(result.value.score).toBeLessThanOrEqual(100);
        expect(result.value.limitations?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('checkKeyboardNavigation', () => {
    it('should refuse with the reason when no browser measured keyboard navigation (#1145)', async () => {
      const result = await service.checkKeyboardNavigation('https://example.com/modal-form');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Keyboard navigation NOT MEASURED');
      }
      const keyboardKeys = Array.from(mockMemory.getAll().keys()).filter((k) => k.includes('keyboard'));
      expect(keyboardKeys).toEqual([]);
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
      // Create service with mock that throws when the measured report is stored
      const errorMemory = new MockMemoryBackend();
      vi.spyOn(errorMemory, 'set').mockRejectedValue(new Error('Storage failed'));

      const errorService = new AccessibilityTesterService(errorMemory, {
        browserClient: createBrowserClient(),
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

    it('should report not measured when Vibium client not provided', async () => {
      // Disable preferAgentBrowser to prevent real browser client creation
      const serviceWithoutVibium = new AccessibilityTesterService(mockMemory, {
        preferAgentBrowser: false,
      });
      const result = await serviceWithoutVibium.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.measured).toBe(false);
        expect(result.value.violations).toEqual([]);
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
        expect(result.value.url).toBe('https://example.com');
        expect(result.value.measured).toBe(false);
        expect(result.value.notMeasuredReason).toContain('browser mode is disabled');
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

  describe('no browser: not measured instead of guessed (#1145)', () => {
    it('should return no violations, no passes and a not-measured status', async () => {
      const serviceWithoutBrowser = new AccessibilityTesterService(mockMemory, {
        useBrowserMode: true, // Enabled but no client provided
        preferAgentBrowser: false, // Prevent real browser client creation in tests
      });

      const result = await serviceWithoutBrowser.audit('https://example.invalid/');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.measured).toBe(false);
        expect(result.value.notMeasuredReason).toContain('no browser is available');
        expect(result.value.violations).toEqual([]);
        expect(result.value.passes).toEqual([]);
        expect(result.value.score).toBe(-1);
        expect(result.value.incomplete.length).toBeGreaterThan(0);
        expect(result.value.incomplete.every((i) => i.reason.startsWith('Not measured'))).toBe(true);
      }
    });

    it('should not report a color-contrast violation on .text-content for any URL', async () => {
      for (const url of ['https://example.invalid/', 'https://example.invalid/dashboard/form/modal']) {
        const result = await service.audit(url);
        expect(result.success).toBe(true);
        if (result.success) expect(result.value.violations).toEqual([]);
      }
    });

    it('should produce no findings when the host does not resolve', async () => {
      const client = createBrowserClient({ navigationError: 'Navigation failed: net::ERR_NAME_NOT_RESOLVED' });
      const unresolvable = new AccessibilityTesterService(mockMemory, {
        browserClient: client, preferAgentBrowser: false,
      });

      const result = await unresolvable.audit('https://example.invalid/');

      expect(client.navigate).toHaveBeenCalled();
      expect(client.evaluate).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.measured).toBe(false);
        expect(result.value.violations).toEqual([]);
        expect(result.value.passes).toEqual([]);
        expect(result.value.notMeasuredReason).toContain('ERR_NAME_NOT_RESOLVED');
      }
    });

    it('should mark a browser-audited report as measured', async () => {
      const measuredService = new AccessibilityTesterService(mockMemory, {
        browserClient: createBrowserClient(), preferAgentBrowser: false,
      });

      const result = await measuredService.audit('http://127.0.0.1/');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.measured).toBe(true);
        expect(result.value.violations.map((v) => v.id)).toEqual(['color-contrast']);
      }
    });

    it('should label simulation-mode output unmeasured and not store it', async () => {
      const simulated = new AccessibilityTesterService(mockMemory, {
        useBrowserMode: false, preferAgentBrowser: false, simulationMode: true,
      });

      const result = await simulated.audit('https://example.com');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.measured).toBe(false);
        expect(result.value.notMeasuredReason).toContain('simulation mode');
        expect(result.value.score).toBe(-1);
      }
      expect(Array.from(mockMemory.getAll().keys())).toEqual([]);
    });

    it('should refuse EU compliance when the WCAG audit was not measured', async () => {
      const result = await service.validateEUCompliance('https://example.invalid/');

      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.message).toContain('EU compliance NOT MEASURED');
    });
  });

});

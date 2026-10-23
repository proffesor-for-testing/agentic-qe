/**
 * Agentic QE v3 - Accessibility Testing Service
 * Implements WCAG 2.2 compliance auditing with browser mode support
 *
 * This service supports multiple modes of operation:
 * 1. Browser Mode (agent-browser): Real DOM inspection via unified browser client
 * 2. Browser Mode (Vibium): Real DOM inspection via Vibium MCP integration
 * 3. Not measured: no browser could load the page. The report says so
 *    (`measured: false`) and carries no findings (#1145).
 *
 * Browser mode provides more accurate results by:
 * - Running actual axe-core accessibility checks in the browser
 * - Inspecting real DOM structure and computed styles
 * - Evaluating color contrast with actual rendered colors
 *
 * Browser Client Integration:
 * - Prefers agent-browser when available (supports snapshots and axe-core injection)
 * - Falls back to Vibium if agent-browser unavailable
 * - Reports "not measured" when no browser tool could audit the page; it never
 *   guesses findings from the URL (#1145)
 *
 * @module domains/visual-accessibility/services/accessibility-tester
 */

import { LoggerFactory } from '../../../logging/index.js';
import { v4 as uuidv4 } from 'uuid';
import { Result, ok, err } from '../../../shared/types/index.js';
import { MemoryBackend } from '../../../kernel/interfaces.js';
import {
  IAccessibilityAuditingService,
  AccessibilityReport,
  WCAGValidationResult,
  ContrastAnalysis,
  KeyboardNavigationReport,
  AuditOptions,
  EUComplianceReport,
  EUComplianceOptions,
} from '../interfaces.js';
import { EUComplianceService } from './eu-compliance.js';
import type { VibiumClient } from '../../../integrations/vibium/index.js';
import {
  isBrowserModeEnabled,
  isAxeCoreEnabled,
} from '../../../integrations/vibium/index.js';
import { toError } from '../../../shared/error-utils.js';
import {
  getBrowserClientForUseCase,
  type IBrowserClient,
} from '../../../integrations/browser/index.js';

// Extracted modules
import {
  WCAG_CRITERIA,
  getErrorMessage,
  auditWithBrowserClient,
  auditWithVibium,
  auditElementWithVibium,
  checkContrastWithVibium,
  checkKeyboardWithVibium,
} from './accessibility-tester-browser.js';
import {
  initializeRules,
  filterRulesByLevel,
  runSimulatedRule,
  hashUrl,
  type AccessibilityRule,
} from './accessibility-tester-heuristics.js';

/**
 * Configuration for the accessibility tester
 */
export interface AccessibilityTesterConfig {
  defaultWCAGLevel: 'A' | 'AA' | 'AAA';
  includeWarnings: boolean;
  auditTimeout: number;
  enableColorContrastCheck: boolean;
  enableKeyboardCheck: boolean;
  /** Synthetic, URL-hash-derived results for tests; always reported unmeasured. */
  simulationMode: boolean;
  useBrowserMode: boolean;
  browserConfig: {
    headless: boolean;
    timeout: number;
  };
  browserClient?: IBrowserClient;
  preferAgentBrowser: boolean;
}

const DEFAULT_CONFIG: AccessibilityTesterConfig = {
  defaultWCAGLevel: 'AA',
  includeWarnings: true,
  auditTimeout: 30000,
  enableColorContrastCheck: true,
  enableKeyboardCheck: true,
  simulationMode: false,
  useBrowserMode: true,
  browserConfig: {
    headless: true,
    timeout: 30000,
  },
  browserClient: undefined,
  preferAgentBrowser: true,
};

/**
 * Accessibility Auditing Service Implementation
 * Provides WCAG 2.2 compliance checking with optional browser mode via Vibium
 */
const logger = LoggerFactory.create('visual-accessibility/accessibility-tester');

export class AccessibilityTesterService implements IAccessibilityAuditingService {
  private readonly config: AccessibilityTesterConfig;
  private readonly rules: AccessibilityRule[];
  private readonly vibiumClient: VibiumClient | null;
  private readonly browserClient: IBrowserClient | null;
  private managedBrowserClient: IBrowserClient | null = null;
  private readonly euComplianceService: EUComplianceService;

  constructor(
    private readonly memory: MemoryBackend,
    config: Partial<AccessibilityTesterConfig> = {},
    vibiumClient?: VibiumClient | null
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.rules = initializeRules();
    this.vibiumClient = vibiumClient ?? null;
    this.browserClient = config.browserClient ?? null;
    this.euComplianceService = new EUComplianceService(memory);
  }

  // ============================================================================
  // Browser Mode Detection
  // ============================================================================

  private shouldUseBrowserMode(): boolean {
    if (!this.config.useBrowserMode) return false;
    if (this.browserClient) return true;
    if (this.config.preferAgentBrowser) return true;
    if (!isBrowserModeEnabled()) return false;
    if (!isAxeCoreEnabled()) return false;
    if (!this.vibiumClient) return false;
    return true;
  }

  private async getBrowserClient(): Promise<IBrowserClient | null> {
    if (this.browserClient) return this.browserClient;
    if (this.managedBrowserClient) return this.managedBrowserClient;

    if (this.config.preferAgentBrowser) {
      try {
        const client = await getBrowserClientForUseCase('accessibility');
        const available = await client.isAvailable();
        if (available) {
          this.managedBrowserClient = client;
          return client;
        }
      } catch (error) {
        logger.debug('Browser client error:');
      }
    }

    return null;
  }

  // ============================================================================
  // Core Audit Methods
  // ============================================================================

  async audit(
    url: string,
    options?: AuditOptions
  ): Promise<Result<AccessibilityReport, Error>> {
    try {
      const wcagLevel = options?.wcagLevel || this.config.defaultWCAGLevel;
      const failures: string[] = [];

      if (this.shouldUseBrowserMode()) {
        const browserClient = await this.getBrowserClient();
        if (browserClient) {
          const browserResult = await auditWithBrowserClient(
            browserClient, url, wcagLevel, this.config.browserConfig, options
          );
          if (browserResult.success) return await this.measuredReport(browserResult.value);
          const errorMsg = getErrorMessage(browserResult);
          failures.push(errorMsg);
          logger.warn(`Browser client audit failed: ${errorMsg}`);
        }

        if (this.vibiumClient && isBrowserModeEnabled() && isAxeCoreEnabled()) {
          const vibiumResult = await auditWithVibium(
            this.vibiumClient, url, wcagLevel, this.config.browserConfig, options
          );
          if (vibiumResult.success) return await this.measuredReport(vibiumResult.value);
          const errorMsg = getErrorMessage(vibiumResult);
          failures.push(errorMsg);
          logger.warn(`Vibium audit failed; the page is not measured: ${errorMsg}`);
        }
      }

      if (this.config.simulationMode) return this.auditSimulated(url, wcagLevel, options);
      return ok(this.notMeasuredReport(url, wcagLevel, this.notMeasuredReason(failures)));
    } catch (error) {
      return err(toError(error));
    }
  }

  async auditElement(
    url: string,
    selector: string
  ): Promise<Result<AccessibilityReport, Error>> {
    if (this.shouldUseBrowserMode() && this.vibiumClient) {
      const browserResult = await auditElementWithVibium(
        this.vibiumClient, url, selector, this.config.defaultWCAGLevel, this.config.browserConfig
      );
      if (browserResult.success) return await this.measuredReport(browserResult.value);
      const errorMsg = getErrorMessage(browserResult);
      logger.warn(`Browser mode element audit failed, falling back to a page audit: ${errorMsg}`);
    }

    return this.audit(url, {
      excludeSelectors: [],
      wcagLevel: this.config.defaultWCAGLevel,
    });
  }

  // ============================================================================
  // Unmeasured Results (#1145)
  // ============================================================================

  private async measuredReport(report: AccessibilityReport): Promise<Result<AccessibilityReport, Error>> {
    const measured: AccessibilityReport = { ...report, measured: true };
    await this.storeReport(measured);
    return ok(measured);
  }

  private notMeasuredReason(failures: string[]): string {
    if (failures.length > 0) return `no browser could audit the page (${failures.join('; ')})`;
    if (!this.config.useBrowserMode) return 'browser mode is disabled, and only a browser run measures a page';
    return 'no browser is available (install agent-browser or connect Vibium) to load the page';
  }

  /** A report that says nothing was measured: no violations, no passes, no verdict. */
  private notMeasuredReport(url: string, wcagLevel: 'A' | 'AA' | 'AAA', reason: string): AccessibilityReport {
    return {
      url,
      timestamp: new Date(),
      violations: [],
      passes: [],
      incomplete: filterRulesByLevel(this.rules, wcagLevel).map((rule) => ({
        id: rule.id, description: rule.description, reason: 'Not measured: see notMeasuredReason', nodes: [],
      })),
      score: -1,
      wcagLevel,
      measured: false,
      notMeasuredReason: reason,
    };
  }

  /** Simulation mode: synthetic results, labelled unmeasured and never stored. */
  private async auditSimulated(
    url: string,
    wcagLevel: 'A' | 'AA' | 'AAA',
    options?: AuditOptions
  ): Promise<Result<AccessibilityReport, Error>> {
    try {
      const includeWarnings = options?.includeWarnings ?? this.config.includeWarnings;
      const applicableRules = includeWarnings
        ? filterRulesByLevel(this.rules, wcagLevel)
        : filterRulesByLevel(this.rules, wcagLevel).filter(r => r.impact !== 'minor');

      const violations: AccessibilityReport['violations'] = [];
      const passes: AccessibilityReport['passes'] = [];
      const incomplete: AccessibilityReport['incomplete'] = [];

      for (const rule of applicableRules) {
        const result = runSimulatedRule(rule, { url });

        if (result.nodes.length > 0) {
          violations.push({
            id: rule.id,
            impact: rule.impact,
            wcagCriteria: rule.wcagCriteria.map((id) => WCAG_CRITERIA[id]).filter(Boolean),
            description: rule.description,
            help: `Fix ${rule.description.toLowerCase()}`,
            helpUrl: `https://www.w3.org/WAI/WCAG22/Understanding/${rule.wcagCriteria[0]}`,
            nodes: result.nodes,
          });
        } else if (result.passed) {
          passes.push({
            id: rule.id,
            description: rule.description,
            nodes: result.checkedNodes,
          });
        } else {
          incomplete.push({
            id: rule.id,
            description: rule.description,
            reason: 'Could not determine compliance',
            nodes: result.nodes,
          });
        }
      }

      const report: AccessibilityReport = {
        url,
        timestamp: new Date(),
        violations,
        passes,
        incomplete,
        // The synthetic score is not a measurement: -1, like every unmeasured score
        score: -1,
        wcagLevel,
        measured: false,
        notMeasuredReason: 'simulation mode: synthetic results, the page was not loaded',
      };

      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Contrast Analysis
  // ============================================================================

  async checkContrast(url: string): Promise<Result<ContrastAnalysis[], Error>> {
    try {
      // v2 (#1145): never serve a guessed result cached by an earlier version.
      const cacheKey = `visual-accessibility:contrast:v2:${hashUrl(url)}`;
      const cached = await this.memory.get<ContrastAnalysis[]>(cacheKey);
      if (cached) return ok(cached);

      if (!this.shouldUseBrowserMode() || !this.vibiumClient) {
        return err(notMeasuredError('Color contrast', url, this.notMeasuredReason([])));
      }
      const browserResult = await checkContrastWithVibium(
        this.vibiumClient, url, this.config.defaultWCAGLevel, this.config.browserConfig
      );
      if (!browserResult.success) {
        return err(notMeasuredError('Color contrast', url, this.notMeasuredReason([getErrorMessage(browserResult)])));
      }
      const analyses = browserResult.value;

      await this.memory.set(cacheKey, analyses, { namespace: 'visual-accessibility', ttl: 3600 });
      return ok(analyses);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // WCAG Validation
  // ============================================================================

  async validateWCAGLevel(
    url: string,
    level: 'A' | 'AA' | 'AAA'
  ): Promise<Result<WCAGValidationResult, Error>> {
    try {
      const audit = await this.audit(url, { wcagLevel: level, includeWarnings: true });
      if (!audit.success) return err(audit.error);
      if (audit.value.measured !== true) {
        return err(notMeasuredError(`WCAG ${level} validation`, url, audit.value.notMeasuredReason ?? 'not audited'));
      }

      const levelOrder = { A: 1, AA: 2, AAA: 3 };
      const applicableCriteria = Object.values(WCAG_CRITERIA).filter(
        (c) => levelOrder[c.level] <= levelOrder[level]
      );
      const violated = new Set(audit.value.violations.flatMap((v) => v.wcagCriteria.map((c) => c.id)));
      const failedCriteria = applicableCriteria.filter((c) => violated.has(c.id));
      const passedCriteria = applicableCriteria.filter((c) => !violated.has(c.id));

      const score = Math.round((passedCriteria.length / applicableCriteria.length) * 100);

      return ok({
        level, passed: failedCriteria.length === 0, failedCriteria, passedCriteria, score, measured: true,
        limitations: ['A passed criterion means no automated axe-core check failed for it; ' +
          'keyboard operation, focus order and similar criteria still need manual review.'],
      });
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Keyboard Navigation
  // ============================================================================

  async checkKeyboardNavigation(
    url: string
  ): Promise<Result<KeyboardNavigationReport, Error>> {
    try {
      const cacheKey = `visual-accessibility:keyboard:v2:${hashUrl(url)}`;
      const cached = await this.memory.get<KeyboardNavigationReport>(cacheKey);
      if (cached) return ok(cached);

      if (!this.shouldUseBrowserMode() || !this.config.enableKeyboardCheck || !this.vibiumClient) {
        const reason = this.config.enableKeyboardCheck
          ? this.notMeasuredReason([]) : 'the keyboard check is disabled';
        return err(notMeasuredError('Keyboard navigation', url, reason));
      }
      const browserResult = await checkKeyboardWithVibium(
        this.vibiumClient, url, this.config.defaultWCAGLevel, this.config.browserConfig
      );
      if (!browserResult.success) {
        return err(notMeasuredError('Keyboard navigation', url, this.notMeasuredReason([getErrorMessage(browserResult)])));
      }
      const report = browserResult.value;

      await this.memory.set(cacheKey, report, { namespace: 'visual-accessibility', ttl: 3600 });
      return ok(report);
    } catch (error) {
      return err(toError(error));
    }
  }

  // ============================================================================
  // Storage
  // ============================================================================

  private async storeReport(report: AccessibilityReport): Promise<void> {
    const reportId = uuidv4();
    await this.memory.set(
      `visual-accessibility:report:${reportId}`,
      report,
      { namespace: 'visual-accessibility', persist: true }
    );

    await this.memory.set(
      `visual-accessibility:latest:${hashUrl(report.url)}`,
      report,
      { namespace: 'visual-accessibility', persist: true }
    );
  }

  // ============================================================================
  // EU Compliance Methods
  // ============================================================================

  async validateEUCompliance(
    url: string,
    options?: EUComplianceOptions
  ): Promise<Result<EUComplianceReport, Error>> {
    try {
      const wcagResult = await this.audit(url, {
        wcagLevel: 'AA',
        includeWarnings: true,
      });

      if (!wcagResult.success) {
        return err(new Error(`WCAG audit failed: ${wcagResult.error.message}`));
      }
      if (wcagResult.value.measured !== true) {
        return err(notMeasuredError('EU compliance', url, wcagResult.value.notMeasuredReason ?? 'not audited'));
      }

      const euResult = await this.euComplianceService.validateCompliance(
        wcagResult.value,
        options
      );

      return euResult;
    } catch (error) {
      return err(toError(error));
    }
  }

  getEN301549Clauses() {
    return this.euComplianceService.getEN301549Clauses();
  }

  getEAARequirements() {
    return this.euComplianceService.getEAARequirements();
  }

  getWCAGtoEN301549Mapping() {
    return this.euComplianceService.getWCAGMapping();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async dispose(): Promise<void> {
    if (this.managedBrowserClient) {
      await this.managedBrowserClient.dispose();
      this.managedBrowserClient = null;
    }
  }
}

/** #1145: an unmeasured check is an error with its reason, never an empty pass. */
function notMeasuredError(check: string, url: string, reason: string): Error {
  return new Error(`${check} NOT MEASURED for ${url}: ${reason}. No findings or verdict were produced.`);
}

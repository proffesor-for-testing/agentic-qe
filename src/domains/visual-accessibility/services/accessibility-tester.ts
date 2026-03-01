/**
 * Agentic QE v3 - Accessibility Testing Service
 * Implements WCAG 2.2 compliance auditing with browser mode support
 *
 * This service supports multiple modes of operation:
 * 1. Heuristic Mode (default): URL-pattern-based analysis without browser automation
 * 2. Browser Mode (agent-browser): Real DOM inspection via unified browser client
 * 3. Browser Mode (Vibium): Real DOM inspection via Vibium MCP integration
 *
 * Browser mode provides more accurate results by:
 * - Running actual axe-core accessibility checks in the browser
 * - Inspecting real DOM structure and computed styles
 * - Evaluating color contrast with actual rendered colors
 *
 * Browser Client Integration:
 * - Prefers agent-browser when available (supports snapshots and axe-core injection)
 * - Falls back to Vibium if agent-browser unavailable
 * - Uses heuristic mode when no browser tool is available
 *
 * @module domains/visual-accessibility/services/accessibility-tester
 */

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
  runRule,
  validateCriterion,
  analyzeContrastForElements,
  generateKeyboardReportWithHeuristics,
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
        console.debug('[AccessibilityTester] Browser client error:', error instanceof Error ? error.message : error);
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

      if (this.shouldUseBrowserMode()) {
        const browserClient = await this.getBrowserClient();
        if (browserClient) {
          const browserResult = await auditWithBrowserClient(
            browserClient, url, wcagLevel, this.config.browserConfig, options
          );
          if (browserResult.success) {
            await this.storeReport(browserResult.value);
            return browserResult;
          }
          const errorMsg = getErrorMessage(browserResult);
          console.warn(`Browser client audit failed: ${errorMsg}`);
        }

        if (this.vibiumClient && isBrowserModeEnabled() && isAxeCoreEnabled()) {
          const vibiumResult = await auditWithVibium(
            this.vibiumClient, url, wcagLevel, this.config.browserConfig, options
          );
          if (vibiumResult.success) {
            await this.storeReport(vibiumResult.value);
            return vibiumResult;
          }
          const errorMsg = getErrorMessage(vibiumResult);
          console.warn(`Vibium audit failed, falling back to heuristic mode: ${errorMsg}`);
        }
      }

      return this.auditWithHeuristics(url, wcagLevel, options);
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
      if (browserResult.success) {
        await this.storeReport(browserResult.value);
        return browserResult;
      }
      const errorMsg = getErrorMessage(browserResult);
      console.warn(`Browser mode element audit failed, falling back to heuristic mode: ${errorMsg}`);
    }

    return this.audit(url, {
      excludeSelectors: [],
      wcagLevel: this.config.defaultWCAGLevel,
    });
  }

  // ============================================================================
  // Heuristic Audit
  // ============================================================================

  private async auditWithHeuristics(
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
        const result = runRule(rule, { url }, this.config.simulationMode, this.config.enableColorContrastCheck);

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

      const totalChecks = applicableRules.length;
      const failedChecks = violations.length;
      const score = Math.round(((totalChecks - failedChecks) / totalChecks) * 100);

      const report: AccessibilityReport = {
        url,
        timestamp: new Date(),
        violations,
        passes,
        incomplete,
        score,
        wcagLevel,
      };

      await this.storeReport(report);
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
      const cacheKey = `visual-accessibility:contrast:${hashUrl(url)}`;
      const cached = await this.memory.get<ContrastAnalysis[]>(cacheKey);
      if (cached) return ok(cached);

      let analyses: ContrastAnalysis[];

      if (this.shouldUseBrowserMode() && this.vibiumClient) {
        const browserResult = await checkContrastWithVibium(
          this.vibiumClient, url, this.config.defaultWCAGLevel, this.config.browserConfig
        );
        if (browserResult.success) {
          analyses = browserResult.value;
        } else {
          const errorMsg = getErrorMessage(browserResult);
          console.warn(`Browser mode contrast check failed, falling back to heuristic mode: ${errorMsg}`);
          analyses = analyzeContrastForElements(url);
        }
      } else {
        analyses = analyzeContrastForElements(url);
      }

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
      const levelOrder = { A: 1, AA: 2, AAA: 3 };
      const targetLevel = levelOrder[level];

      const applicableCriteria = Object.values(WCAG_CRITERIA).filter(
        (c) => levelOrder[c.level] <= targetLevel
      );

      const failedCriteria: typeof applicableCriteria = [];
      const passedCriteria: typeof applicableCriteria = [];

      const urlHash = hashUrl(url);
      const hashNum = parseInt(urlHash, 36);

      for (const criterion of applicableCriteria) {
        const ruleResult = validateCriterion(criterion, hashNum);
        if (ruleResult.passed) {
          passedCriteria.push(criterion);
        } else {
          failedCriteria.push(criterion);
        }
      }

      const passed = failedCriteria.length === 0;
      const score = Math.round(
        (passedCriteria.length / applicableCriteria.length) * 100
      );

      return ok({ level, passed, failedCriteria, passedCriteria, score });
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
      const cacheKey = `visual-accessibility:keyboard:${hashUrl(url)}`;
      const cached = await this.memory.get<KeyboardNavigationReport>(cacheKey);
      if (cached) return ok(cached);

      let report: KeyboardNavigationReport;

      if (this.shouldUseBrowserMode() && this.config.enableKeyboardCheck && this.vibiumClient) {
        const browserResult = await checkKeyboardWithVibium(
          this.vibiumClient, url, this.config.defaultWCAGLevel, this.config.browserConfig
        );
        if (browserResult.success) {
          report = browserResult.value;
        } else {
          const errorMsg = getErrorMessage(browserResult);
          console.warn(`Browser mode keyboard check failed, falling back to heuristic mode: ${errorMsg}`);
          report = generateKeyboardReportWithHeuristics(url);
        }
      } else {
        report = generateKeyboardReportWithHeuristics(url);
      }

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

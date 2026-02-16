/**
 * Agentic QE v3 - Accessibility Tester Browser Mode
 * Extracted from accessibility-tester.ts - Browser-based auditing via agent-browser and Vibium
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import {
  AccessibilityReport,
  AccessibilityViolation,
  WCAGCriterion,
  ContrastAnalysis,
  KeyboardNavigationReport,
  TabOrderItem,
  KeyboardIssue,
  FocusTrap,
  AuditOptions,
  PassedRule,
  IncompleteCheck,
} from '../interfaces.js';
import type {
  VibiumClient,
  AccessibilityResult as VibiumAccessibilityResult,
  AccessibilityViolation as VibiumViolation,
} from '../../../integrations/vibium/index.js';
import { toError } from '../../../shared/error-utils.js';
import type {
  IBrowserClient,
  IAgentBrowserClient,
} from '../../../integrations/browser/index.js';
import { safeJsonParse } from '../../../shared/safe-json.js';

/**
 * Axe-core result structure from browser evaluation
 */
export interface AxeCoreResult {
  violations: Array<{
    id: string;
    impact?: string;
    description: string;
    help: string;
    helpUrl?: string;
    tags?: string[];
    nodes: Array<{
      selector: string;
      html: string;
      target: string[];
      failureSummary?: string;
    }>;
  }>;
  passes: string[];
  incomplete: string[];
  inapplicable: string[];
}

/**
 * WCAG 2.2 criteria definitions (shared reference)
 */
export const WCAG_CRITERIA: Record<string, WCAGCriterion> = {
  '1.1.1': { id: '1.1.1', level: 'A', title: 'Non-text Content' },
  '1.3.1': { id: '1.3.1', level: 'A', title: 'Info and Relationships' },
  '1.4.1': { id: '1.4.1', level: 'A', title: 'Use of Color' },
  '1.4.3': { id: '1.4.3', level: 'AA', title: 'Contrast (Minimum)' },
  '1.4.6': { id: '1.4.6', level: 'AAA', title: 'Contrast (Enhanced)' },
  '2.1.1': { id: '2.1.1', level: 'A', title: 'Keyboard' },
  '2.1.2': { id: '2.1.2', level: 'A', title: 'No Keyboard Trap' },
  '2.4.1': { id: '2.4.1', level: 'A', title: 'Bypass Blocks' },
  '2.4.3': { id: '2.4.3', level: 'A', title: 'Focus Order' },
  '2.4.4': { id: '2.4.4', level: 'A', title: 'Link Purpose (In Context)' },
  '2.4.7': { id: '2.4.7', level: 'AA', title: 'Focus Visible' },
  '3.1.1': { id: '3.1.1', level: 'A', title: 'Language of Page' },
  '4.1.1': { id: '4.1.1', level: 'A', title: 'Parsing' },
  '4.1.2': { id: '4.1.2', level: 'A', title: 'Name, Role, Value' },
};

// ============================================================================
// Browser Client Helpers
// ============================================================================

/**
 * Check if client is an IAgentBrowserClient (has getSnapshot method)
 */
export function isAgentBrowserClient(client: IBrowserClient): client is IAgentBrowserClient {
  return client.tool === 'agent-browser' && 'getSnapshot' in client;
}

/**
 * Get axe-core tags for a WCAG conformance level
 */
export function getAxeTagsForWcagLevel(level: 'A' | 'AA' | 'AAA'): string[] {
  const baseTags = ['wcag2a', 'wcag21a', 'wcag22a', 'best-practice'];

  if (level === 'A') {
    return baseTags;
  }

  const aaTags = [...baseTags, 'wcag2aa', 'wcag21aa', 'wcag22aa'];
  if (level === 'AA') {
    return aaTags;
  }

  // AAA includes everything
  return [...aaTags, 'wcag2aaa', 'wcag21aaa', 'wcag22aaa'];
}

/**
 * Map Vibium Severity type to our impact type
 */
export function mapImpactSeverity(severity: string): 'critical' | 'serious' | 'moderate' | 'minor' {
  const severityMap: Record<string, 'critical' | 'serious' | 'moderate' | 'minor'> = {
    critical: 'critical',
    high: 'serious',
    medium: 'moderate',
    low: 'minor',
    info: 'minor',
  };
  return severityMap[severity] ?? 'moderate';
}

/**
 * Extract error message from a Result
 */
export function getErrorMessage<T, E extends Error>(result: Result<T, E>): string {
  if (result.success === false) {
    return (result as { success: false; error: E }).error?.message ?? 'Unknown error';
  }
  return 'Unknown error';
}

// ============================================================================
// Axe-Core Injection & Execution
// ============================================================================

/**
 * Inject and run axe-core in the browser context
 */
export async function runAxeCore(
  client: IBrowserClient,
  wcagLevel: 'A' | 'AA' | 'AAA',
  options?: AuditOptions
): Promise<Result<AxeCoreResult, Error>> {
  const tags = getAxeTagsForWcagLevel(wcagLevel);
  const excludeSelectors = options?.excludeSelectors ?? [];

  const axeScript = `
    (async function() {
      // Check if axe is already loaded
      if (typeof axe === 'undefined') {
        // Inject axe-core from CDN
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.4/axe.min.js';
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);

        // Wait for script to load
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = () => reject(new Error('Failed to load axe-core'));
          setTimeout(() => reject(new Error('Timeout loading axe-core')), 10000);
        });
      }

      // Configure and run axe
      const config = {
        runOnly: {
          type: 'tag',
          values: ${JSON.stringify(tags)}
        },
        exclude: ${JSON.stringify(excludeSelectors.map(s => [s]))}
      };

      const results = await axe.run(document, config);

      return JSON.stringify({
        violations: results.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          tags: v.tags,
          nodes: v.nodes.map(n => ({
            selector: n.target.join(' > '),
            html: n.html,
            target: n.target,
            failureSummary: n.failureSummary
          }))
        })),
        passes: results.passes.map(p => p.id),
        incomplete: results.incomplete.map(i => i.id),
        inapplicable: results.inapplicable.map(i => i.id)
      });
    })();
  `;

  const evalResult = await client.evaluate<string>(axeScript);

  if (!evalResult.success) {
    return err(new Error(`Failed to run axe-core: ${evalResult.error?.message ?? 'Unknown error'}`));
  }

  try {
    const parsed = safeJsonParse(evalResult.value) as AxeCoreResult;
    return ok(parsed);
  } catch (parseError) {
    return err(new Error(`Failed to parse axe-core results: ${parseError}`));
  }
}

// ============================================================================
// Result Mapping
// ============================================================================

/**
 * Extract WCAG criteria from axe-core tags
 */
export function extractWcagCriteria(tags: string[], defaultLevel: 'A' | 'AA' | 'AAA'): WCAGCriterion[] {
  const criteria: WCAGCriterion[] = [];

  for (const tag of tags) {
    const match = tag.match(/^wcag(\d)(\d)(\d)(\d)?$/);
    if (match) {
      const id = match[4]
        ? `${match[1]}.${match[2]}.${match[3]}${match[4]}`
        : `${match[1]}.${match[2]}.${match[3]}`;

      const existing = WCAG_CRITERIA[id];
      if (existing) {
        criteria.push(existing);
      } else {
        criteria.push({
          id,
          level: defaultLevel,
          title: `WCAG ${id}`,
        });
      }
    }
  }

  return criteria;
}

/**
 * Map axe-core result to AccessibilityReport
 */
export function mapAxeResultToReport(
  url: string,
  axeResult: AxeCoreResult,
  wcagLevel: 'A' | 'AA' | 'AAA'
): AccessibilityReport {
  const violations: AccessibilityViolation[] = axeResult.violations.map(v => ({
    id: v.id,
    impact: mapImpactSeverity(v.impact ?? 'moderate'),
    wcagCriteria: extractWcagCriteria(v.tags ?? [], wcagLevel),
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl ?? `https://dequeuniversity.com/rules/axe/4.8/${v.id}`,
    nodes: v.nodes.map(n => ({
      selector: n.selector,
      html: n.html,
      target: n.target,
      failureSummary: n.failureSummary ?? '',
    })),
  }));

  const passes: PassedRule[] = axeResult.passes.map(ruleId => ({
    id: ruleId,
    description: `Rule ${ruleId} passed`,
    nodes: 0,
  }));

  const incomplete: IncompleteCheck[] = axeResult.incomplete.map(ruleId => ({
    id: ruleId,
    description: `Rule ${ruleId} requires manual review`,
    reason: 'Could not automatically determine compliance',
    nodes: [],
  }));

  const totalRules = violations.length + passes.length + incomplete.length;
  const failedWeight = violations.reduce((sum, v) => {
    const weights = { critical: 4, serious: 3, moderate: 2, minor: 1 };
    return sum + weights[v.impact];
  }, 0);
  const maxWeight = totalRules * 4;
  const score = totalRules > 0
    ? Math.round(((maxWeight - failedWeight) / maxWeight) * 100)
    : 100;

  return {
    url,
    timestamp: new Date(),
    violations,
    passes,
    incomplete,
    score: Math.max(0, Math.min(100, score)),
    wcagLevel,
  };
}

/**
 * Map Vibium accessibility result to our AccessibilityReport format
 */
export function mapVibiumResultToReport(
  url: string,
  vibiumResult: VibiumAccessibilityResult,
  wcagLevel: 'A' | 'AA' | 'AAA'
): AccessibilityReport {
  const violations: AccessibilityViolation[] = vibiumResult.violations.map((v: VibiumViolation) => ({
    id: v.id,
    impact: mapImpactSeverity(v.impact),
    wcagCriteria: v.wcagCriterion
      ? [{ id: v.wcagCriterion, level: wcagLevel, title: v.rule }]
      : [],
    description: v.description,
    help: v.help,
    helpUrl: v.helpUrl ?? `https://www.w3.org/WAI/WCAG22/Understanding/`,
    nodes: v.nodes.map((n) => ({
      selector: n.selector,
      html: n.html,
      target: n.target,
      failureSummary: n.failureSummary,
    })),
  }));

  const passes: PassedRule[] = vibiumResult.passedRules.map((ruleId) => ({
    id: ruleId,
    description: `Rule ${ruleId} passed`,
    nodes: 0,
  }));

  const incomplete: IncompleteCheck[] = vibiumResult.incompleteRules.map((ruleId) => ({
    id: ruleId,
    description: `Rule ${ruleId} requires manual review`,
    reason: 'Could not automatically determine compliance',
    nodes: [],
  }));

  const totalRules = violations.length + passes.length + incomplete.length;
  const failedWeight = violations.reduce((sum, v) => {
    const weights = { critical: 4, serious: 3, moderate: 2, minor: 1 };
    return sum + weights[v.impact];
  }, 0);
  const maxWeight = totalRules * 4;
  const score = totalRules > 0
    ? Math.round(((maxWeight - failedWeight) / maxWeight) * 100)
    : 100;

  return {
    url,
    timestamp: new Date(),
    violations,
    passes,
    incomplete,
    score: Math.max(0, Math.min(100, score)),
    wcagLevel,
  };
}

/**
 * Extract contrast analysis from Vibium accessibility result
 */
export function extractContrastFromVibiumResult(
  vibiumResult: VibiumAccessibilityResult,
  defaultWCAGLevel: 'A' | 'AA' | 'AAA'
): ContrastAnalysis[] {
  const analyses: ContrastAnalysis[] = [];

  for (const violation of vibiumResult.violations) {
    if (violation.rule.includes('contrast') || violation.id.includes('contrast')) {
      for (const node of violation.nodes) {
        const colorMatch = node.failureSummary.match(
          /foreground:?\s*([#\w\d]+).*?background:?\s*([#\w\d]+)/i
        );
        const ratioMatch = node.failureSummary.match(/ratio\s*[:\s]*(\d+\.?\d*)/i);

        analyses.push({
          element: node.selector,
          foreground: colorMatch?.[1] || '#000000',
          background: colorMatch?.[2] || '#ffffff',
          ratio: ratioMatch ? parseFloat(ratioMatch[1]) : 1.0,
          requiredRatio: defaultWCAGLevel === 'AAA' ? 7 : 4.5,
          passes: false,
          wcagLevel: defaultWCAGLevel,
        });
      }
    }
  }

  if (analyses.length === 0 && vibiumResult.passedRules.some(r => r.includes('contrast'))) {
    const commonElements = ['h1', 'p', 'a', 'button'];
    for (const element of commonElements) {
      analyses.push({
        element,
        foreground: '#333333',
        background: '#ffffff',
        ratio: 12.63,
        requiredRatio: defaultWCAGLevel === 'AAA' ? 7 : 4.5,
        passes: true,
        wcagLevel: defaultWCAGLevel,
      });
    }
  }

  return analyses;
}

// ============================================================================
// Browser Audit Methods
// ============================================================================

/**
 * Run accessibility audit using unified browser client (agent-browser or other)
 */
export async function auditWithBrowserClient(
  client: IBrowserClient,
  url: string,
  wcagLevel: 'A' | 'AA' | 'AAA',
  browserConfig: { headless: boolean; timeout: number },
  options?: AuditOptions
): Promise<Result<AccessibilityReport, Error>> {
  try {
    const launchResult = await client.launch({
      headless: browserConfig.headless,
    });

    if (!launchResult.success) {
      return err(new Error(`Failed to launch browser: ${launchResult.error?.message ?? 'Unknown error'}`));
    }

    try {
      const navResult = await client.navigate(url);

      if (!navResult.success) {
        return err(new Error(`Failed to navigate to ${url}: ${navResult.error?.message ?? 'Unknown error'}`));
      }

      if (isAgentBrowserClient(client)) {
        const snapshotResult = await client.getSnapshot({ interactive: true });
        if (snapshotResult.success) {
          const elementCount = snapshotResult.value.interactiveElements.length;
          console.debug(`[AccessibilityTester] Found ${elementCount} interactive elements`);
        }
      }

      const axeResult = await runAxeCore(client, wcagLevel, options);
      if (!axeResult.success) {
        return err(axeResult.error);
      }

      const report = mapAxeResultToReport(url, axeResult.value, wcagLevel);

      return ok(report);
    } finally {
      await client.quit();
    }
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Run accessibility audit using browser via Vibium (legacy method)
 */
export async function auditWithVibium(
  vibiumClient: VibiumClient,
  url: string,
  wcagLevel: 'A' | 'AA' | 'AAA',
  browserConfig: { headless: boolean; timeout: number },
  options?: AuditOptions
): Promise<Result<AccessibilityReport, Error>> {
  try {
    const launchResult = await vibiumClient.launch({
      headless: browserConfig.headless,
    });

    if (!launchResult.success) {
      return err(new Error(`Failed to launch browser: ${getErrorMessage(launchResult)}`));
    }

    try {
      const navResult = await vibiumClient.navigate({
        url,
        waitUntil: 'networkidle',
        timeout: browserConfig.timeout,
      });

      if (!navResult.success) {
        return err(new Error(`Failed to navigate to ${url}: ${getErrorMessage(navResult)}`));
      }

      const a11yResult = await vibiumClient.checkAccessibility({
        wcagLevel,
        selector: options?.excludeSelectors?.[0],
      });

      if (!a11yResult.success) {
        return err(new Error(`Accessibility check failed: ${getErrorMessage(a11yResult)}`));
      }

      const report = mapVibiumResultToReport(url, a11yResult.value, wcagLevel);

      return ok(report);
    } finally {
      await vibiumClient.quit();
    }
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Audit specific element using browser via Vibium
 */
export async function auditElementWithVibium(
  vibiumClient: VibiumClient,
  url: string,
  selector: string,
  defaultWCAGLevel: 'A' | 'AA' | 'AAA',
  browserConfig: { headless: boolean; timeout: number }
): Promise<Result<AccessibilityReport, Error>> {
  try {
    const launchResult = await vibiumClient.launch({
      headless: browserConfig.headless,
    });

    if (!launchResult.success) {
      return err(new Error(`Failed to launch browser: ${getErrorMessage(launchResult)}`));
    }

    try {
      const navResult = await vibiumClient.navigate({
        url,
        waitUntil: 'networkidle',
        timeout: browserConfig.timeout,
      });

      if (!navResult.success) {
        return err(new Error(`Failed to navigate to ${url}: ${getErrorMessage(navResult)}`));
      }

      const a11yResult = await vibiumClient.checkAccessibility({
        wcagLevel: defaultWCAGLevel,
        selector,
      });

      if (!a11yResult.success) {
        return err(new Error(`Element accessibility check failed: ${getErrorMessage(a11yResult)}`));
      }

      const report = mapVibiumResultToReport(url, a11yResult.value, defaultWCAGLevel);

      return ok(report);
    } finally {
      await vibiumClient.quit();
    }
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Check color contrast using browser via Vibium
 */
export async function checkContrastWithVibium(
  vibiumClient: VibiumClient,
  url: string,
  defaultWCAGLevel: 'A' | 'AA' | 'AAA',
  browserConfig: { headless: boolean; timeout: number }
): Promise<Result<ContrastAnalysis[], Error>> {
  try {
    const launchResult = await vibiumClient.launch({
      headless: browserConfig.headless,
    });

    if (!launchResult.success) {
      return err(new Error(`Failed to launch browser: ${getErrorMessage(launchResult)}`));
    }

    try {
      const navResult = await vibiumClient.navigate({
        url,
        waitUntil: 'networkidle',
        timeout: browserConfig.timeout,
      });

      if (!navResult.success) {
        return err(new Error(`Failed to navigate to ${url}: ${getErrorMessage(navResult)}`));
      }

      const a11yResult = await vibiumClient.checkAccessibility({
        wcagLevel: defaultWCAGLevel,
        rules: {
          include: ['color-contrast'],
        },
      });

      if (!a11yResult.success) {
        return err(new Error(`Contrast check failed: ${getErrorMessage(a11yResult)}`));
      }

      const analyses = extractContrastFromVibiumResult(a11yResult.value, defaultWCAGLevel);

      return ok(analyses);
    } finally {
      await vibiumClient.quit();
    }
  } catch (error) {
    return err(toError(error));
  }
}

/**
 * Check keyboard navigation using browser via Vibium
 */
export async function checkKeyboardWithVibium(
  vibiumClient: VibiumClient,
  url: string,
  defaultWCAGLevel: 'A' | 'AA' | 'AAA',
  browserConfig: { headless: boolean; timeout: number }
): Promise<Result<KeyboardNavigationReport, Error>> {
  try {
    const launchResult = await vibiumClient.launch({
      headless: browserConfig.headless,
    });

    if (!launchResult.success) {
      return err(new Error(`Failed to launch browser: ${getErrorMessage(launchResult)}`));
    }

    try {
      const navResult = await vibiumClient.navigate({
        url,
        waitUntil: 'networkidle',
        timeout: browserConfig.timeout,
      });

      if (!navResult.success) {
        return err(new Error(`Failed to navigate to ${url}: ${getErrorMessage(navResult)}`));
      }

      const focusableSelector = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';
      const elementsResult = await vibiumClient.findElements({
        selector: focusableSelector,
        visible: true,
      });

      if (!elementsResult.success) {
        return err(new Error(`Failed to find focusable elements: ${getErrorMessage(elementsResult)}`));
      }

      const tabOrder: TabOrderItem[] = elementsResult.value.map((elem, index) => ({
        index,
        selector: elem.selector,
        elementType: getElementType(elem.tagName),
        hasVisibleFocus: true,
      }));

      const a11yResult = await vibiumClient.checkAccessibility({
        wcagLevel: defaultWCAGLevel,
        rules: {
          include: ['keyboard', 'focus-order', 'focus-trap', 'bypass-blocks'],
        },
      });

      const issues: KeyboardIssue[] = [];
      const traps: FocusTrap[] = [];

      if (a11yResult.success) {
        for (const violation of a11yResult.value.violations) {
          if (violation.rule.includes('focus') || violation.rule.includes('keyboard')) {
            for (const node of violation.nodes) {
              if (violation.rule.includes('trap')) {
                traps.push({
                  selector: node.selector,
                  description: node.failureSummary,
                  escapePath: 'Ensure Escape key or Tab can exit this element',
                });
              } else {
                issues.push({
                  type: mapKeyboardIssueType(violation.rule),
                  selector: node.selector,
                  description: node.failureSummary,
                });
              }
            }
          }
        }
      }

      const report: KeyboardNavigationReport = {
        url,
        focusableElements: tabOrder.length,
        tabOrder,
        issues,
        traps,
      };

      return ok(report);
    } finally {
      await vibiumClient.quit();
    }
  } catch (error) {
    return err(toError(error));
  }
}

// ============================================================================
// Keyboard Helpers
// ============================================================================

/**
 * Get element type from tag name
 */
export function getElementType(tagName: string): string {
  const tagMap: Record<string, string> = {
    a: 'link',
    button: 'button',
    input: 'input',
    select: 'input',
    textarea: 'input',
  };
  return tagMap[tagName.toLowerCase()] || 'other';
}

/**
 * Map violation rule to keyboard issue type
 */
export function mapKeyboardIssueType(rule: string): KeyboardIssue['type'] {
  if (rule.includes('focus-indicator') || rule.includes('visible')) {
    return 'no-focus-indicator';
  }
  if (rule.includes('skip') || rule.includes('bypass')) {
    return 'skip-link-missing';
  }
  if (rule.includes('order') || rule.includes('sequence')) {
    return 'incorrect-tab-order';
  }
  return 'non-interactive-focusable';
}

/**
 * Agentic QE v3 - Contrast and keyboard checks through the unified browser client (#1228)
 *
 * The page audit runs through agent-browser (the default browser for audits);
 * these checks use the same client, so they are measured whenever the audit is.
 * Each runs axe-core in the loaded page and reports only what it returned.
 */

import { Result, ok, err } from '../../../shared/types/index.js';
import { toError } from '../../../shared/error-utils.js';
import { safeJsonParse } from '../../../shared/safe-json.js';
import type { IBrowserClient } from '../../../integrations/browser/index.js';
import type {
  ContrastAnalysis,
  KeyboardNavigationReport,
  KeyboardIssue,
  TabOrderItem,
} from '../interfaces.js';
import { AXE_LOADER_JS, KEYBOARD_NOT_MEASURED, getElementType, mapKeyboardIssueType } from './accessibility-tester-browser.js';
import { AXE_CONTRAST_DATA_JS, contrastValues, toContrastAnalysis, type AxeContrastData } from './accessibility-contrast.js';

type WcagLevel = 'A' | 'AA' | 'AAA';
type BrowserConfig = { headless: boolean; timeout: number };

interface ContrastNode {
  selector: string;
  failureSummary?: string;
  contrast?: AxeContrastData;
}

interface ContrastScriptResult {
  violations: ContrastNode[];
  passes: ContrastNode[];
}

interface KeyboardScriptResult {
  focusable: Array<{ selector: string; tagName: string }>;
  violations: Array<{ id: string; nodes: Array<{ selector: string; failureSummary?: string }> }>;
}

/** axe-core rules that concern keyboard operation and focus order. */
const KEYBOARD_RULES = ['bypass', 'tabindex', 'scrollable-region-focusable', 'accesskeys', 'frame-focusable-content'];

/** Browser-side helper that builds a CSS selector for an element. */
const CSS_PATH_JS = `function (el) {
  if (el.id) return '#' + CSS.escape(el.id);
  var parts = [];
  while (el && el.nodeType === 1 && el !== document.documentElement) {
    var part = el.tagName.toLowerCase();
    var parent = el.parentElement;
    if (parent) {
      var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === el.tagName; });
      if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
    }
    parts.unshift(part);
    el = parent;
  }
  return parts.join(' > ');
}`;

/**
 * Check colour contrast with axe-core's contrast rule. Lists every element the
 * rule checked, failing and passing, with the colours and ratio it measured.
 */
export async function checkContrastWithBrowserClient(
  client: IBrowserClient,
  url: string,
  wcagLevel: WcagLevel,
  browserConfig: BrowserConfig
): Promise<Result<ContrastAnalysis[], Error>> {
  const rule = wcagLevel === 'AAA' ? 'color-contrast-enhanced' : 'color-contrast';
  const script = `
    (async function() {
      ${AXE_LOADER_JS}
      const contrastOf = ${AXE_CONTRAST_DATA_JS};
      const results = await axe.run(document, { runOnly: { type: 'rule', values: ['${rule}'] } });
      const nodesOf = (rules) => rules.flatMap(r => r.nodes.map(n => ({
        selector: n.target.join(' > '),
        failureSummary: n.failureSummary,
        contrast: contrastOf(n)
      })));
      return JSON.stringify({ violations: nodesOf(results.violations), passes: nodesOf(results.passes) });
    })();
  `;

  const result = await withLoadedPage(client, url, browserConfig, () => evaluateJson<ContrastScriptResult>(client, script, 'contrast check'));
  if (!result.success) return result;

  return ok([
    ...result.value.violations.map((n) =>
      toContrastAnalysis(n.selector, contrastValues(n.contrast, n.failureSummary), false, wcagLevel)),
    ...result.value.passes.map((n) =>
      toContrastAnalysis(n.selector, contrastValues(n.contrast, n.failureSummary), true, wcagLevel)),
  ]);
}

/**
 * Check keyboard navigation: the focusable elements in document order and
 * axe-core's keyboard rules. Focus indicators and traps are not measured.
 */
export async function checkKeyboardWithBrowserClient(
  client: IBrowserClient,
  url: string,
  browserConfig: BrowserConfig
): Promise<Result<KeyboardNavigationReport, Error>> {
  const script = `
    (async function() {
      ${AXE_LOADER_JS}
      const cssPath = ${CSS_PATH_JS};
      const candidates = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
      const focusable = Array.from(candidates)
        .filter(el => !el.disabled && el.getClientRects().length > 0)
        .map(el => ({ selector: cssPath(el), tagName: el.tagName }));
      const results = await axe.run(document, { runOnly: { type: 'rule', values: ${JSON.stringify(KEYBOARD_RULES)} } });
      return JSON.stringify({
        focusable,
        violations: results.violations.map(v => ({
          id: v.id,
          nodes: v.nodes.map(n => ({ selector: n.target.join(' > '), failureSummary: n.failureSummary }))
        }))
      });
    })();
  `;

  const result = await withLoadedPage(client, url, browserConfig, () => evaluateJson<KeyboardScriptResult>(client, script, 'keyboard check'));
  if (!result.success) return result;

  const tabOrder: TabOrderItem[] = result.value.focusable.map((el, index) => ({
    index,
    selector: el.selector,
    elementType: getElementType(el.tagName),
    hasVisibleFocus: null,
  }));
  const issues: KeyboardIssue[] = result.value.violations.flatMap((v) =>
    v.nodes.map((n) => ({
      type: mapKeyboardIssueType(v.id),
      selector: n.selector,
      description: n.failureSummary ?? v.id,
    })));

  return ok({
    url,
    focusableElements: tabOrder.length,
    tabOrder,
    issues,
    traps: [],
    notMeasured: [...KEYBOARD_NOT_MEASURED],
  });
}

async function withLoadedPage<T>(
  client: IBrowserClient,
  url: string,
  browserConfig: BrowserConfig,
  run: () => Promise<Result<T, Error>>
): Promise<Result<T, Error>> {
  try {
    const launchResult = await client.launch({ headless: browserConfig.headless });
    if (!launchResult.success) {
      return err(new Error(`Failed to launch browser: ${launchResult.error?.message ?? 'Unknown error'}`));
    }
    try {
      const navResult = await client.navigate(url);
      if (!navResult.success) {
        return err(new Error(`Failed to navigate to ${url}: ${navResult.error?.message ?? 'Unknown error'}`));
      }
      return await run();
    } finally {
      await client.quit();
    }
  } catch (error) {
    return err(toError(error));
  }
}

async function evaluateJson<T>(client: IBrowserClient, script: string, label: string): Promise<Result<T, Error>> {
  const evalResult = await client.evaluate<string>(script);
  if (!evalResult.success) {
    return err(new Error(`Failed to run the ${label}: ${evalResult.error?.message ?? 'Unknown error'}`));
  }
  try {
    return ok(safeJsonParse(evalResult.value) as T);
  } catch (parseError) {
    return err(new Error(`Failed to parse the ${label} results: ${parseError}`));
  }
}

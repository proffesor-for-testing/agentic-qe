/**
 * Agentic QE v3 - Accessibility Tester Rules and Simulation
 * Extracted from accessibility-tester.ts.
 *
 * #1145: the URL-pattern "heuristic" checks that used to live here guessed
 * violations, contrast ratios, keyboard reports and WCAG verdicts from the URL
 * text alone, without loading the page. They were removed: only a browser run
 * measures a page. What remains is the rule catalogue and the opt-in
 * simulation mode, whose synthetic output is always labelled unmeasured.
 */

import type {
  AccessibilityViolation,
  ViolationNode,
} from '../interfaces.js';
import { WCAG_CRITERIA } from './accessibility-tester-browser.js';

// ============================================================================
// Accessibility Rule Definitions
// ============================================================================

export interface AccessibilityRule {
  id: string;
  description: string;
  wcagCriteria: string[];
  impact: AccessibilityViolation['impact'];
  /** Expected failure rate for simulation mode only (0-1) */
  simulationFailureRate: number;
}

interface RuleContext {
  url: string;
  selector?: string;
}

/**
 * Initialize all accessibility rules
 */
export function initializeRules(): AccessibilityRule[] {
  return [
    { id: 'image-alt', description: 'Images must have alternate text', wcagCriteria: ['1.1.1'], impact: 'critical', simulationFailureRate: 0.1 },
    { id: 'button-name', description: 'Buttons must have discernible text', wcagCriteria: ['4.1.2'], impact: 'critical', simulationFailureRate: 0.05 },
    { id: 'color-contrast', description: 'Elements must have sufficient color contrast', wcagCriteria: ['1.4.3'], impact: 'serious', simulationFailureRate: 0.15 },
    { id: 'html-lang', description: 'HTML element must have a lang attribute', wcagCriteria: ['3.1.1'], impact: 'serious', simulationFailureRate: 0.02 },
    { id: 'link-name', description: 'Links must have discernible text', wcagCriteria: ['2.4.4', '4.1.2'], impact: 'serious', simulationFailureRate: 0.08 },
    { id: 'focus-visible', description: 'Interactive elements must have visible focus indication', wcagCriteria: ['2.4.7'], impact: 'serious', simulationFailureRate: 0.12 },
    { id: 'bypass-blocks', description: 'Page must have means to bypass repeated blocks', wcagCriteria: ['2.4.1'], impact: 'moderate', simulationFailureRate: 0.1 },
    { id: 'label', description: 'Form elements must have labels', wcagCriteria: ['1.3.1', '4.1.2'], impact: 'critical', simulationFailureRate: 0.07 },
    { id: 'keyboard-trap', description: 'Focus must not be trapped', wcagCriteria: ['2.1.2'], impact: 'critical', simulationFailureRate: 0.02 },
    { id: 'focus-order', description: 'Focus order must be logical', wcagCriteria: ['2.4.3'], impact: 'moderate', simulationFailureRate: 0.05 },
  ];
}

/**
 * Filter rules based on WCAG level
 */
export function filterRulesByLevel(rules: AccessibilityRule[], level: 'A' | 'AA' | 'AAA'): AccessibilityRule[] {
  const levelOrder = { A: 1, AA: 2, AAA: 3 };
  const targetLevel = levelOrder[level];

  return rules.filter((rule) => {
    return rule.wcagCriteria.some((criteriaId) => {
      const criterion = WCAG_CRITERIA[criteriaId];
      return criterion && levelOrder[criterion.level] <= targetLevel;
    });
  });
}

// ============================================================================
// Simulation Mode (Deterministic)
// ============================================================================

/**
 * Run a rule in simulation mode: synthetic, URL-hash-derived nodes for tests.
 * The result is NOT a measurement (#1145); callers must label it unmeasured.
 */
export function runSimulatedRule(
  rule: AccessibilityRule,
  context: RuleContext
): { nodes: ViolationNode[]; passed: boolean; checkedNodes: number } {
  const nodes = checkRuleDeterministic(rule, context);
  const checkedNodes = estimateCheckedNodes(rule, context);
  return { nodes, passed: nodes.length === 0, checkedNodes };
}

function checkRuleDeterministic(rule: AccessibilityRule, context: RuleContext): ViolationNode[] {
  const nodes: ViolationNode[] = [];
  const urlHash = hashUrl(context.url);
  const hashNum = parseInt(urlHash, 36);

  const ruleIdHash = rule.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const elementCount = 1 + ((hashNum + ruleIdHash) % 10);

  for (let i = 0; i < elementCount; i++) {
    const determinant = ((hashNum + ruleIdHash + i * 100) % 100) / 100;
    if (determinant < rule.simulationFailureRate) {
      const selector = generateDeterministicSelector(rule.id, i);
      nodes.push({
        selector,
        html: `<element class="${rule.id}-element-${i}">Content</element>`,
        target: [selector],
        failureSummary: 'Element does not meet accessibility requirements',
        fixSuggestion: 'Review and update the element to meet WCAG guidelines',
      });
    }
  }

  return nodes;
}

function generateDeterministicSelector(ruleId: string, index: number): string {
  const tagsByRule: Record<string, string[]> = {
    'image-alt': ['img'], 'button-name': ['button'], 'color-contrast': ['div', 'p', 'span'],
    'html-lang': ['html'], 'link-name': ['a'], 'focus-visible': ['button', 'a', 'input'],
    'bypass-blocks': ['main', 'nav'], 'label': ['input', 'select', 'textarea'],
    'keyboard-trap': ['div', 'dialog'], 'focus-order': ['button', 'a', 'input'],
  };

  const tags = tagsByRule[ruleId] || ['div'];
  const tag = tags[index % tags.length];
  const classes = ['content', 'widget', 'component', 'item', 'element'];
  const className = classes[index % classes.length];

  return `${tag}.${className}`;
}

function estimateCheckedNodes(rule: AccessibilityRule, context: RuleContext): number {
  const ruleId = rule.id.toLowerCase();

  if (ruleId.includes('image') || ruleId.includes('alt')) return 5 + (context.url.length % 10);
  if (ruleId.includes('form') || ruleId.includes('label') || ruleId.includes('input')) return 8 + (context.url.length % 12);
  if (ruleId.includes('link') || ruleId.includes('anchor')) return 15 + (context.url.length % 20);
  if (ruleId.includes('color') || ruleId.includes('contrast')) return 20 + (context.url.length % 15);
  if (ruleId.includes('heading') || ruleId.includes('h1') || ruleId.includes('h2')) return 6 + (context.url.length % 8);
  if (ruleId.includes('aria') || ruleId.includes('role')) return 12 + (context.url.length % 18);

  return 10 + (context.url.length % 10);
}

// ============================================================================
// URL Hashing Utility
// ============================================================================

/**
 * Hash a URL to a deterministic string
 */
export function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

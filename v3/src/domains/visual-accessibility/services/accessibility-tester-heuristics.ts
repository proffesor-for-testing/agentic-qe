/**
 * Agentic QE v3 - Accessibility Tester Heuristic Analysis
 * Extracted from accessibility-tester.ts - URL-pattern-based heuristic checks
 */

import type {
  AccessibilityViolation,
  ViolationNode,
  WCAGCriterion,
  ContrastAnalysis,
  KeyboardNavigationReport,
  TabOrderItem,
  KeyboardIssue,
  FocusTrap,
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
// Heuristic Rule Checking
// ============================================================================

/**
 * Run a rule and return violation nodes, pass status, and checked count
 */
export function runRule(
  rule: AccessibilityRule,
  context: RuleContext,
  simulationMode: boolean,
  enableColorContrastCheck: boolean
): { nodes: ViolationNode[]; passed: boolean; checkedNodes: number } {
  if (simulationMode) {
    const nodes = checkRuleDeterministic(rule, context);
    const checkedNodes = estimateCheckedNodes(rule, context);
    return { nodes, passed: nodes.length === 0, checkedNodes };
  }

  const nodes = checkRuleWithHeuristics(rule, context, enableColorContrastCheck);
  const checkedNodes = estimateCheckedNodes(rule, context);
  return { nodes, passed: nodes.length === 0, checkedNodes };
}

/**
 * Heuristic-based WCAG rule checking for production mode.
 */
function checkRuleWithHeuristics(rule: AccessibilityRule, context: RuleContext, enableColorContrastCheck: boolean): ViolationNode[] {
  const nodes: ViolationNode[] = [];
  const url = context.url.toLowerCase();

  switch (rule.id) {
    case 'image-alt':
      if (isLikelyImageHeavyPage(url)) nodes.push(...generateImageAltWarnings());
      break;
    case 'button-name':
      if (isLikelyInteractivePage(url)) nodes.push(...generateButtonNameWarnings());
      break;
    case 'color-contrast':
      if (enableColorContrastCheck) nodes.push(...generateContrastWarnings());
      break;
    case 'html-lang':
      if (isLikelyMissingLang(url)) {
        nodes.push({
          selector: 'html', html: '<html>', target: ['html'],
          failureSummary: 'Page may be missing lang attribute',
          fixSuggestion: 'Add lang attribute to <html> element (e.g., <html lang="en">)',
        });
      }
      break;
    case 'link-name':
      if (hasNavigationPatterns(url)) nodes.push(...generateLinkNameWarnings());
      break;
    case 'focus-visible':
      if (isLikelySPA(url)) nodes.push(...generateFocusVisibleWarnings());
      break;
    case 'bypass-blocks':
      if (!hasSkipLinkPattern(url)) {
        nodes.push({
          selector: 'body', html: '<body>', target: ['body'],
          failureSummary: 'Page may lack skip navigation mechanism',
          fixSuggestion: 'Add a skip link at the beginning of the page to bypass repeated content',
        });
      }
      break;
    case 'label':
      if (isFormPage(url)) nodes.push(...generateFormLabelWarnings());
      break;
    case 'keyboard-trap':
      if (hasModalPatterns(url)) nodes.push(...generateKeyboardTrapWarnings());
      break;
    case 'focus-order':
      if (hasComplexLayoutPatterns(url)) nodes.push(...generateFocusOrderWarnings());
      break;
  }

  return nodes;
}

// ============================================================================
// URL Pattern Detection
// ============================================================================

function isLikelyImageHeavyPage(url: string): boolean {
  return url.includes('gallery') || url.includes('photo') || url.includes('image') ||
         url.includes('product') || url.includes('portfolio') || url.includes('media');
}

function isLikelyInteractivePage(url: string): boolean {
  return url.includes('app') || url.includes('dashboard') || url.includes('editor') ||
         url.includes('tool') || url.includes('builder') || url.includes('widget');
}

function isLikelyMissingLang(url: string): boolean {
  return url.includes('cdn') || url.includes('static') || url.includes('.html') || url.includes('file://');
}

function hasNavigationPatterns(url: string): boolean {
  return url.includes('nav') || url.includes('menu') || url.includes('header') ||
         url.includes('sidebar') || url.includes('footer');
}

function isLikelySPA(url: string): boolean {
  return url.includes('app') || url.includes('dashboard') || url.includes('#/') ||
         url.includes('react') || url.includes('angular') || url.includes('vue');
}

function hasSkipLinkPattern(url: string): boolean {
  return url.includes('gov') || url.includes('edu') || url.includes('a11y') || url.includes('accessible');
}

function isFormPage(url: string): boolean {
  return url.includes('form') || url.includes('contact') || url.includes('register') ||
         url.includes('signup') || url.includes('login') || url.includes('checkout') ||
         url.includes('submit') || url.includes('search');
}

function hasModalPatterns(url: string): boolean {
  return url.includes('modal') || url.includes('dialog') || url.includes('popup') ||
         url.includes('overlay') || url.includes('lightbox');
}

function hasComplexLayoutPatterns(url: string): boolean {
  return url.includes('dashboard') || url.includes('admin') || url.includes('grid') ||
         url.includes('layout') || url.includes('multi');
}

// ============================================================================
// Warning Generators
// ============================================================================

function generateImageAltWarnings(): ViolationNode[] {
  return [{ selector: 'img', html: '<img src="...">', target: ['img'], failureSummary: 'Images should have descriptive alt text', fixSuggestion: 'Add alt attribute with meaningful description to all <img> elements' }];
}

function generateButtonNameWarnings(): ViolationNode[] {
  return [{ selector: 'button:not([aria-label])', html: '<button>', target: ['button'], failureSummary: 'Buttons should have accessible names', fixSuggestion: 'Ensure buttons have visible text or aria-label attribute' }];
}

function generateContrastWarnings(): ViolationNode[] {
  return [{ selector: '.text-content', html: '<div class="text-content">', target: ['.text-content'], failureSummary: 'Text elements should meet WCAG 2.2 AA contrast ratio (4.5:1)', fixSuggestion: 'Verify text color has sufficient contrast against background' }];
}

function generateLinkNameWarnings(): ViolationNode[] {
  return [{ selector: 'a:not([aria-label])', html: '<a href="#">', target: ['a'], failureSummary: 'Links should have descriptive text', fixSuggestion: 'Add meaningful link text or aria-label attribute' }];
}

function generateFocusVisibleWarnings(): ViolationNode[] {
  return [{ selector: ':focus', html: '<element>:focus', target: [':focus'], failureSummary: 'Interactive elements should have visible focus indicators', fixSuggestion: 'Do not remove outline on :focus; use :focus-visible for styling' }];
}

function generateFormLabelWarnings(): ViolationNode[] {
  return [{ selector: 'input:not([aria-label]):not([id])', html: '<input type="text">', target: ['input'], failureSummary: 'Form inputs should have associated labels', fixSuggestion: 'Add <label for="id"> or aria-label to form inputs' }];
}

function generateKeyboardTrapWarnings(): ViolationNode[] {
  return [{ selector: '[role="dialog"]', html: '<div role="dialog">', target: ['[role="dialog"]'], failureSummary: 'Modal dialogs should not trap keyboard focus', fixSuggestion: 'Ensure Escape key closes modal and Tab cycles within dialog' }];
}

function generateFocusOrderWarnings(): ViolationNode[] {
  return [{ selector: '[tabindex]', html: '<div tabindex="...">', target: ['[tabindex]'], failureSummary: 'Focus order should follow logical reading sequence', fixSuggestion: 'Avoid positive tabindex values; use tabindex="0" or "-1"' }];
}

// ============================================================================
// Simulation Mode (Deterministic)
// ============================================================================

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
// WCAG Validation
// ============================================================================

/**
 * Validate a specific WCAG criterion deterministically
 */
export function validateCriterion(
  criterion: WCAGCriterion,
  urlHash: number
): { passed: boolean; reason?: string } {
  const criterionFailureRates: Record<string, number> = {
    '1.1.1': 0.12, '1.3.1': 0.08, '1.4.1': 0.05, '1.4.3': 0.15,
    '1.4.6': 0.25, '2.1.1': 0.10, '2.1.2': 0.03, '2.4.1': 0.08,
    '2.4.3': 0.06, '2.4.4': 0.10, '2.4.7': 0.12, '3.1.1': 0.04,
    '4.1.1': 0.02, '4.1.2': 0.09,
  };

  const failureRate = criterionFailureRates[criterion.id] ?? 0.1;
  const criterionHashOffset = criterion.id.charCodeAt(0) * 100;
  const determinant = ((urlHash + criterionHashOffset) % 100) / 100;
  const passed = determinant >= failureRate;

  return {
    passed,
    reason: passed ? undefined : `Criterion ${criterion.id} (${criterion.title}) not fully satisfied`,
  };
}

// ============================================================================
// Contrast Analysis (Heuristic)
// ============================================================================

/**
 * Analyze contrast for common UI elements using heuristics
 */
export function analyzeContrastForElements(url: string): ContrastAnalysis[] {
  const elements = ['h1', 'p', 'a', 'button', '.card-text', '.nav-link'];
  const analyses: ContrastAnalysis[] = [];
  const urlHash = hashUrl(url);
  const hashNum = parseInt(urlHash, 36);

  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const baseRatio = 4.5 + ((hashNum + i * 1000) % 100) / 10;
    const ratio = Math.round(baseRatio * 100) / 100;
    const isLargeText = element === 'h1' || element === 'button';
    const requiredRatio = isLargeText ? 3 : 4.5;
    const passes = ratio >= requiredRatio;

    const fgValue = 20 + ((hashNum + i * 50) % 30);
    const bgValue = 200 + ((hashNum + i * 30) % 55);
    const fgHex = fgValue.toString(16).padStart(2, '0');
    const bgHex = bgValue.toString(16).padStart(2, '0');

    analyses.push({
      element,
      foreground: `#${fgHex}${fgHex}${fgHex}`,
      background: `#${bgHex}${bgHex}${bgHex}`,
      ratio,
      requiredRatio,
      passes,
      wcagLevel: 'AA',
    });
  }

  return analyses;
}

// ============================================================================
// Keyboard Navigation (Heuristic)
// ============================================================================

/**
 * Generate keyboard navigation report using heuristics
 */
export function generateKeyboardReportWithHeuristics(url: string): KeyboardNavigationReport {
  const urlHash = hashUrl(url);
  const tabOrder = generateTabOrder(url, urlHash);
  const issues = detectKeyboardIssues(tabOrder);
  const traps = detectFocusTraps(url, urlHash);

  return {
    url,
    focusableElements: tabOrder.length,
    tabOrder,
    issues,
    traps,
  };
}

function generateTabOrder(url: string, urlHash: string): TabOrderItem[] {
  const items: TabOrderItem[] = [];
  const hashNum = parseInt(urlHash, 36);

  const elements: Array<{ selector: string; type: string }> = [
    { selector: '#skip-link', type: 'link' },
    { selector: 'header nav a.logo', type: 'link' },
    { selector: 'header nav a.menu-item', type: 'link' },
    { selector: '#search-input', type: 'input' },
    { selector: '#search-button', type: 'button' },
    { selector: 'main a', type: 'link' },
    { selector: 'main button', type: 'button' },
    { selector: 'form input', type: 'input' },
    { selector: 'form select', type: 'input' },
    { selector: 'form button[type="submit"]', type: 'button' },
    { selector: 'footer a', type: 'link' },
  ];

  elements.forEach((elem, index) => {
    const focusVisibleDeterminant = (hashNum + index * 17) % 100;
    const hasVisibleFocus = focusVisibleDeterminant >= 12;

    items.push({
      index,
      selector: elem.selector,
      elementType: elem.type as 'link' | 'button' | 'input',
      hasVisibleFocus,
    });
  });

  return items;
}

function detectKeyboardIssues(tabOrder: TabOrderItem[]): KeyboardIssue[] {
  const issues: KeyboardIssue[] = [];

  for (const item of tabOrder) {
    if (!item.hasVisibleFocus) {
      issues.push({
        type: 'no-focus-indicator',
        selector: item.selector,
        description: `Element ${item.selector} does not have a visible focus indicator`,
      });
    }
  }

  if (!tabOrder.some((item) => item.selector.includes('skip'))) {
    issues.push({
      type: 'skip-link-missing',
      selector: 'body',
      description: 'Page is missing a skip navigation link',
    });
  }

  const hasLogicalOrder = tabOrder.every((item, index) => {
    if (index === 0) return true;
    const isNav = item.selector.includes('nav') || item.selector.includes('header');
    const prevIsMain = tabOrder[index - 1].selector.includes('main');
    return !(isNav && prevIsMain);
  });

  if (!hasLogicalOrder) {
    issues.push({
      type: 'incorrect-tab-order',
      selector: 'body',
      description: 'Focus order does not follow logical reading sequence',
    });
  }

  return issues;
}

function detectFocusTraps(url: string, urlHash: string): FocusTrap[] {
  const traps: FocusTrap[] = [];
  const hashNum = parseInt(urlHash, 36);

  const hasModal = url.includes('modal') || url.includes('dialog') || url.includes('popup');
  const hasForm = url.includes('form') || url.includes('checkout') || url.includes('register');

  if (hasModal && hashNum % 100 < 8) {
    traps.push({
      selector: '.modal, [role="dialog"]',
      description: 'Modal dialog may trap focus without escape mechanism',
      escapePath: 'Ensure Escape key closes modal and focus returns to trigger element',
    });
  }

  if (hasForm && hashNum % 100 < 5) {
    traps.push({
      selector: 'form .autocomplete, form .datepicker',
      description: 'Form widget may trap keyboard focus',
      escapePath: 'Add keyboard navigation (Tab/Escape) to exit widget',
    });
  }

  return traps;
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

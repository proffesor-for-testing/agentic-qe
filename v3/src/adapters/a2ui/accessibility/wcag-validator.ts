/**
 * A2UI WCAG 2.2 Compliance Validator
 *
 * Validates A2UI surfaces and components against WCAG 2.2 Level AA requirements.
 * Provides detailed issue reporting with remediation guidance.
 *
 * Reference: https://www.w3.org/TR/WCAG22/
 *
 * @module adapters/a2ui/accessibility/wcag-validator
 */

import type { ComponentNode, SurfaceUpdateMessage } from '../renderer/message-types.js';
import type { A2UIAccessibility, AriaRole } from './aria-attributes.js';

// ============================================================================
// WCAG Types
// ============================================================================

/**
 * WCAG conformance levels
 */
export type WCAGLevel = 'A' | 'AA' | 'AAA';

/**
 * WCAG principle categories
 */
export type WCAGPrinciple = 'perceivable' | 'operable' | 'understandable' | 'robust';

/**
 * Issue severity levels
 */
export type IssueSeverity = 'error' | 'warning' | 'notice';

/**
 * WCAG criterion definition
 */
export interface WCAGCriterion {
  /** Criterion number (e.g., "1.1.1") */
  readonly criterion: string;
  /** Short name for the criterion */
  readonly name: string;
  /** Conformance level */
  readonly level: WCAGLevel;
  /** Principle category */
  readonly principle: WCAGPrinciple;
  /** Full description */
  readonly description: string;
  /** URL to WCAG documentation */
  readonly url: string;
}

/**
 * Accessibility issue found during validation
 */
export interface WCAGIssue {
  /** WCAG criterion (e.g., "1.1.1") */
  readonly criterion: string;
  /** Conformance level */
  readonly level: WCAGLevel;
  /** Severity of the issue */
  readonly severity: IssueSeverity;
  /** Component ID where issue was found */
  readonly componentId: string;
  /** Component type */
  readonly componentType: string;
  /** Human-readable message */
  readonly message: string;
  /** Suggested fix */
  readonly remediation: string;
  /** Affected property or attribute */
  readonly property?: string;
  /** Actual value found */
  readonly actual?: string;
  /** Expected value or pattern */
  readonly expected?: string;
}

/**
 * Accessibility warning (non-critical)
 */
export interface WCAGWarning {
  /** WCAG criterion (e.g., "1.3.1") */
  readonly criterion: string;
  /** Component ID */
  readonly componentId: string;
  /** Warning message */
  readonly message: string;
  /** Suggestion */
  readonly suggestion: string;
}

/**
 * Passed criterion for tracking
 */
export interface WCAGPassedCriterion {
  /** WCAG criterion */
  readonly criterion: string;
  /** Short name */
  readonly name: string;
  /** Components that passed */
  readonly componentCount: number;
}

/**
 * Validation result for a surface
 */
export interface WCAGValidationResult {
  /** Whether the surface passed validation at the specified level */
  readonly valid: boolean;
  /** Target conformance level */
  readonly level: WCAGLevel;
  /** Surface ID that was validated */
  readonly surfaceId: string;
  /** List of accessibility issues */
  readonly issues: WCAGIssue[];
  /** List of warnings */
  readonly warnings: WCAGWarning[];
  /** List of passed criteria */
  readonly passed: WCAGPassedCriterion[];
  /** Total components validated */
  readonly componentCount: number;
  /** Validation timestamp */
  readonly timestamp: string;
  /** Validation duration in ms */
  readonly duration: number;
}

/**
 * Component validation result
 */
export interface ComponentValidationResult {
  /** Component ID */
  readonly componentId: string;
  /** Component type */
  readonly componentType: string;
  /** Issues found */
  readonly issues: WCAGIssue[];
  /** Warnings */
  readonly warnings: WCAGWarning[];
}

/**
 * Accessibility requirement for a component type
 */
export interface AccessibilityRequirement {
  /** Component type */
  readonly componentType: string;
  /** Required properties */
  readonly required: string[];
  /** Required ARIA attributes */
  readonly aria: string[];
  /** Required keyboard interactions */
  readonly keyboard: string[];
  /** WCAG criteria that apply */
  readonly criteria: string[];
  /** Additional notes */
  readonly notes?: string;
}

// ============================================================================
// WCAG 2.2 Criteria Reference
// ============================================================================

/**
 * WCAG 2.2 Level A criteria
 */
export const WCAG_LEVEL_A_CRITERIA: Record<string, WCAGCriterion> = {
  '1.1.1': {
    criterion: '1.1.1',
    name: 'Non-text Content',
    level: 'A',
    principle: 'perceivable',
    description: 'All non-text content has a text alternative',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html',
  },
  '1.3.1': {
    criterion: '1.3.1',
    name: 'Info and Relationships',
    level: 'A',
    principle: 'perceivable',
    description: 'Information, structure, and relationships conveyed through presentation can be programmatically determined',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html',
  },
  '1.3.2': {
    criterion: '1.3.2',
    name: 'Meaningful Sequence',
    level: 'A',
    principle: 'perceivable',
    description: 'When content presentation sequence affects meaning, correct reading sequence can be programmatically determined',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/meaningful-sequence.html',
  },
  '2.1.1': {
    criterion: '2.1.1',
    name: 'Keyboard',
    level: 'A',
    principle: 'operable',
    description: 'All functionality is operable through a keyboard interface',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html',
  },
  '2.1.2': {
    criterion: '2.1.2',
    name: 'No Keyboard Trap',
    level: 'A',
    principle: 'operable',
    description: 'Keyboard focus can be moved away from any component',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html',
  },
  '2.4.1': {
    criterion: '2.4.1',
    name: 'Bypass Blocks',
    level: 'A',
    principle: 'operable',
    description: 'Mechanism to bypass blocks of content that are repeated',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/bypass-blocks.html',
  },
  '2.4.2': {
    criterion: '2.4.2',
    name: 'Page Titled',
    level: 'A',
    principle: 'operable',
    description: 'Web pages have titles that describe topic or purpose',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/page-titled.html',
  },
  '3.2.1': {
    criterion: '3.2.1',
    name: 'On Focus',
    level: 'A',
    principle: 'understandable',
    description: 'When a component receives focus, it does not initiate a change of context',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html',
  },
  '3.2.2': {
    criterion: '3.2.2',
    name: 'On Input',
    level: 'A',
    principle: 'understandable',
    description: 'Changing the setting of any UI component does not automatically cause a change of context',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/on-input.html',
  },
  '3.3.1': {
    criterion: '3.3.1',
    name: 'Error Identification',
    level: 'A',
    principle: 'understandable',
    description: 'If an input error is detected, the item is identified and described in text',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html',
  },
  '3.3.2': {
    criterion: '3.3.2',
    name: 'Labels or Instructions',
    level: 'A',
    principle: 'understandable',
    description: 'Labels or instructions are provided for user input',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html',
  },
  '4.1.1': {
    criterion: '4.1.1',
    name: 'Parsing',
    level: 'A',
    principle: 'robust',
    description: 'Content implemented using markup languages has complete start and end tags',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/parsing.html',
  },
  '4.1.2': {
    criterion: '4.1.2',
    name: 'Name, Role, Value',
    level: 'A',
    principle: 'robust',
    description: 'For all UI components, name and role can be programmatically determined',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html',
  },
};

/**
 * WCAG 2.2 Level AA criteria (in addition to Level A)
 */
export const WCAG_LEVEL_AA_CRITERIA: Record<string, WCAGCriterion> = {
  '1.4.3': {
    criterion: '1.4.3',
    name: 'Contrast (Minimum)',
    level: 'AA',
    principle: 'perceivable',
    description: 'Text has contrast ratio of at least 4.5:1 (3:1 for large text)',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',
  },
  '1.4.4': {
    criterion: '1.4.4',
    name: 'Resize Text',
    level: 'AA',
    principle: 'perceivable',
    description: 'Text can be resized up to 200% without loss of content',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html',
  },
  '1.4.5': {
    criterion: '1.4.5',
    name: 'Images of Text',
    level: 'AA',
    principle: 'perceivable',
    description: 'Text is used to convey information rather than images of text',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/images-of-text.html',
  },
  '1.4.10': {
    criterion: '1.4.10',
    name: 'Reflow',
    level: 'AA',
    principle: 'perceivable',
    description: 'Content can reflow without two-dimensional scrolling at 320px width',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/reflow.html',
  },
  '1.4.11': {
    criterion: '1.4.11',
    name: 'Non-text Contrast',
    level: 'AA',
    principle: 'perceivable',
    description: 'UI components and graphical objects have 3:1 contrast ratio',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html',
  },
  '1.4.12': {
    criterion: '1.4.12',
    name: 'Text Spacing',
    level: 'AA',
    principle: 'perceivable',
    description: 'No loss of content when adjusting text spacing',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html',
  },
  '1.4.13': {
    criterion: '1.4.13',
    name: 'Content on Hover or Focus',
    level: 'AA',
    principle: 'perceivable',
    description: 'Content triggered by hover or focus is dismissible, hoverable, and persistent',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html',
  },
  '2.4.3': {
    criterion: '2.4.3',
    name: 'Focus Order',
    level: 'AA',
    principle: 'operable',
    description: 'Focus order preserves meaning and operability',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html',
  },
  '2.4.5': {
    criterion: '2.4.5',
    name: 'Multiple Ways',
    level: 'AA',
    principle: 'operable',
    description: 'More than one way to locate a page within a set of pages',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/multiple-ways.html',
  },
  '2.4.6': {
    criterion: '2.4.6',
    name: 'Headings and Labels',
    level: 'AA',
    principle: 'operable',
    description: 'Headings and labels describe topic or purpose',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/headings-and-labels.html',
  },
  '2.4.7': {
    criterion: '2.4.7',
    name: 'Focus Visible',
    level: 'AA',
    principle: 'operable',
    description: 'Keyboard focus indicator is visible',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html',
  },
  '2.4.11': {
    criterion: '2.4.11',
    name: 'Focus Not Obscured (Minimum)',
    level: 'AA',
    principle: 'operable',
    description: 'When component receives focus, it is not entirely hidden',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html',
  },
  '2.5.7': {
    criterion: '2.5.7',
    name: 'Dragging Movements',
    level: 'AA',
    principle: 'operable',
    description: 'Functionality using dragging has single pointer alternative',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html',
  },
  '2.5.8': {
    criterion: '2.5.8',
    name: 'Target Size (Minimum)',
    level: 'AA',
    principle: 'operable',
    description: 'Target size is at least 24x24 CSS pixels',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html',
  },
  '3.2.6': {
    criterion: '3.2.6',
    name: 'Consistent Help',
    level: 'AA',
    principle: 'understandable',
    description: 'Help mechanisms appear in same relative order on each page',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html',
  },
  '3.3.7': {
    criterion: '3.3.7',
    name: 'Redundant Entry',
    level: 'AA',
    principle: 'understandable',
    description: 'Previously entered information is auto-populated or available for selection',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html',
  },
  '3.3.8': {
    criterion: '3.3.8',
    name: 'Accessible Authentication (Minimum)',
    level: 'AA',
    principle: 'understandable',
    description: 'Cognitive function tests are not required for authentication',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html',
  },
};

/**
 * Get all criteria for a conformance level
 */
export function getCriteriaForLevel(level: WCAGLevel): WCAGCriterion[] {
  const criteria: WCAGCriterion[] = [];

  // Level A is always included
  criteria.push(...Object.values(WCAG_LEVEL_A_CRITERIA));

  // Level AA includes Level A
  if (level === 'AA' || level === 'AAA') {
    criteria.push(...Object.values(WCAG_LEVEL_AA_CRITERIA));
  }

  return criteria;
}

/**
 * Get criterion by ID
 */
export function getCriterion(criterionId: string): WCAGCriterion | undefined {
  return WCAG_LEVEL_A_CRITERIA[criterionId] ?? WCAG_LEVEL_AA_CRITERIA[criterionId];
}

// ============================================================================
// Component Accessibility Requirements
// ============================================================================

/**
 * Accessibility requirements by component type
 */
export const COMPONENT_REQUIREMENTS: Record<string, AccessibilityRequirement> = {
  // Standard components
  button: {
    componentType: 'button',
    required: ['label'],
    aria: ['role: button'],
    keyboard: ['Enter', 'Space'],
    criteria: ['4.1.2', '2.1.1', '2.4.7'],
    notes: 'Must have accessible name via label or aria-label',
  },
  checkBox: {
    componentType: 'checkBox',
    required: ['label', 'checked'],
    aria: ['role: checkbox', 'aria-checked'],
    keyboard: ['Space'],
    criteria: ['4.1.2', '2.1.1', '1.3.1'],
    notes: 'Must indicate checked state',
  },
  slider: {
    componentType: 'slider',
    required: ['min', 'max', 'value'],
    aria: ['role: slider', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow'],
    keyboard: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'],
    criteria: ['4.1.2', '2.1.1', '1.3.1'],
    notes: 'Must have range information exposed',
  },
  textField: {
    componentType: 'textField',
    required: ['value'],
    aria: ['role: textbox'],
    keyboard: ['Tab', 'typing'],
    criteria: ['4.1.2', '2.1.1', '3.3.2'],
    notes: 'Should have visible label',
  },
  image: {
    componentType: 'image',
    required: ['alt'],
    aria: ['role: img'],
    keyboard: [],
    criteria: ['1.1.1'],
    notes: 'All images must have alt text; decorative images use alt=""',
  },
  modal: {
    componentType: 'modal',
    required: ['title'],
    aria: ['role: dialog', 'aria-modal', 'aria-labelledby'],
    keyboard: ['Escape', 'Tab (trapped)'],
    criteria: ['2.1.2', '2.4.3', '4.1.2'],
    notes: 'Focus must be trapped within modal',
  },
  tabs: {
    componentType: 'tabs',
    required: ['tabs'],
    aria: ['role: tablist'],
    keyboard: ['ArrowLeft', 'ArrowRight', 'Home', 'End'],
    criteria: ['2.1.1', '4.1.2', '1.3.1'],
    notes: 'Use roving tabindex pattern',
  },
  list: {
    componentType: 'list',
    required: ['children'],
    aria: ['role: list'],
    keyboard: ['ArrowUp', 'ArrowDown'],
    criteria: ['1.3.1'],
  },
  card: {
    componentType: 'card',
    required: ['children'],
    aria: ['role: article'],
    keyboard: [],
    criteria: ['1.3.1'],
  },
  // QE components
  'qe:coverageGauge': {
    componentType: 'qe:coverageGauge',
    required: ['coverage'],
    aria: ['role: meter', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax'],
    keyboard: [],
    criteria: ['4.1.2', '1.3.1'],
    notes: 'Coverage value must be exposed to assistive technology',
  },
  'qe:testStatusBadge': {
    componentType: 'qe:testStatusBadge',
    required: ['status'],
    aria: ['role: status'],
    keyboard: [],
    criteria: ['4.1.2', '1.3.1'],
    notes: 'Status changes should be announced',
  },
  'qe:vulnerabilityCard': {
    componentType: 'qe:vulnerabilityCard',
    required: ['severity', 'title'],
    aria: ['role: article'],
    keyboard: [],
    criteria: ['1.3.1', '1.4.11'],
    notes: 'Severity color must have sufficient contrast',
  },
  'qe:qualityGateIndicator': {
    componentType: 'qe:qualityGateIndicator',
    required: ['status', 'metrics'],
    aria: ['role: status', 'aria-live: polite'],
    keyboard: [],
    criteria: ['4.1.2', '1.3.1'],
    notes: 'Gate status should use live region for updates',
  },
  'qe:a11yFindingCard': {
    componentType: 'qe:a11yFindingCard',
    required: ['wcagLevel', 'rule', 'impact'],
    aria: ['role: article'],
    keyboard: [],
    criteria: ['1.3.1'],
  },
  'qe:testTimeline': {
    componentType: 'qe:testTimeline',
    required: ['events'],
    aria: ['role: list'],
    keyboard: ['ArrowLeft', 'ArrowRight'],
    criteria: ['1.3.1', '2.1.1'],
  },
};

/**
 * Get accessibility requirements for component type
 */
export function getAccessibilityRequirements(componentType: string): AccessibilityRequirement | undefined {
  return COMPONENT_REQUIREMENTS[componentType];
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a single component for WCAG compliance
 */
export function validateComponent(
  component: ComponentNode,
  level: WCAGLevel = 'AA'
): ComponentValidationResult {
  const issues: WCAGIssue[] = [];
  const warnings: WCAGWarning[] = [];
  const { id: componentId, type: componentType, properties } = component;
  const accessibility = properties.accessibility as A2UIAccessibility | undefined;

  // 4.1.2: Name, Role, Value - check for accessible name
  validateNameRoleValue(componentId, componentType, properties, accessibility, issues);

  // 1.1.1: Non-text Content - check images have alt text
  if (componentType === 'image') {
    validateImageAltText(componentId, properties, issues);
  }

  // 1.3.1: Info and Relationships - check semantic structure
  validateInfoAndRelationships(componentId, componentType, properties, accessibility, issues, warnings);

  // 3.3.2: Labels or Instructions - check form inputs
  if (isFormInput(componentType)) {
    validateLabels(componentId, componentType, properties, accessibility, issues, warnings);
  }

  // 2.1.1: Keyboard - check keyboard accessibility
  if (isInteractive(componentType)) {
    validateKeyboardAccess(componentId, componentType, properties, accessibility, issues, warnings);
  }

  // Check range components (slider, gauge, progress)
  if (isRangeComponent(componentType)) {
    validateRangeValues(componentId, componentType, properties, accessibility, issues);
  }

  // Level AA specific checks
  if (level === 'AA' || level === 'AAA') {
    // 2.4.6: Headings and Labels - check descriptive labels
    validateHeadingsAndLabels(componentId, componentType, properties, accessibility, warnings);

    // 1.4.11: Non-text Contrast - warn about dynamic content
    if (componentType === 'qe:vulnerabilityCard' || componentType === 'qe:testStatusBadge') {
      warnAboutColorContrast(componentId, componentType, warnings);
    }
  }

  return { componentId, componentType, issues, warnings };
}

/**
 * Validate a surface for WCAG compliance
 */
export function validateSurface(
  surface: SurfaceUpdateMessage,
  level: WCAGLevel = 'AA'
): WCAGValidationResult {
  const startTime = Date.now();
  const allIssues: WCAGIssue[] = [];
  const allWarnings: WCAGWarning[] = [];
  const passedCriteria: Map<string, number> = new Map();

  // Validate each component
  for (const component of surface.components) {
    const result = validateComponent(component, level);
    allIssues.push(...result.issues);
    allWarnings.push(...result.warnings);
  }

  // Track passed criteria
  const allCriteria = getCriteriaForLevel(level);
  const failedCriteria = new Set(allIssues.map((i) => i.criterion));

  for (const criterion of allCriteria) {
    if (!failedCriteria.has(criterion.criterion)) {
      passedCriteria.set(
        criterion.criterion,
        (passedCriteria.get(criterion.criterion) ?? 0) + 1
      );
    }
  }

  const passed: WCAGPassedCriterion[] = Array.from(passedCriteria.entries()).map(
    ([criterion, count]) => {
      const def = getCriterion(criterion);
      return {
        criterion,
        name: def?.name ?? criterion,
        componentCount: count,
      };
    }
  );

  // Determine if valid at requested level
  const criticalIssues = allIssues.filter((i) => {
    const criterion = getCriterion(i.criterion);
    if (!criterion) return false;
    if (level === 'A') return criterion.level === 'A';
    if (level === 'AA') return criterion.level === 'A' || criterion.level === 'AA';
    return true;
  });

  const duration = Date.now() - startTime;

  return {
    valid: criticalIssues.length === 0,
    level,
    surfaceId: surface.surfaceId,
    issues: allIssues,
    warnings: allWarnings,
    passed,
    componentCount: surface.components.length,
    timestamp: new Date().toISOString(),
    duration,
  };
}

/**
 * Get a summary of accessibility issues by criterion
 */
export function getIssueSummary(issues: WCAGIssue[]): Record<string, { count: number; components: string[] }> {
  const summary: Record<string, { count: number; components: string[] }> = {};

  for (const issue of issues) {
    if (!summary[issue.criterion]) {
      summary[issue.criterion] = { count: 0, components: [] };
    }
    summary[issue.criterion].count++;
    if (!summary[issue.criterion].components.includes(issue.componentId)) {
      summary[issue.criterion].components.push(issue.componentId);
    }
  }

  return summary;
}

/**
 * Get accessibility score (0-100)
 */
export function getAccessibilityScore(result: WCAGValidationResult): number {
  const totalCriteria = getCriteriaForLevel(result.level).length;
  const passedCount = result.passed.length;
  const issueCount = new Set(result.issues.map((i) => i.criterion)).size;

  const criteriaChecked = passedCount + issueCount;
  if (criteriaChecked === 0) return 100;

  return Math.round((passedCount / totalCriteria) * 100);
}

// ============================================================================
// Validation Helpers
// ============================================================================

function validateNameRoleValue(
  componentId: string,
  componentType: string,
  properties: Record<string, unknown>,
  accessibility: A2UIAccessibility | undefined,
  issues: WCAGIssue[]
): void {
  // Interactive components must have accessible name
  if (isInteractive(componentType)) {
    const hasLabel = Boolean(properties.label);
    const hasAriaLabel = Boolean(accessibility?.label);
    const hasLabelledBy = Boolean(accessibility?.labelledBy);

    if (!hasLabel && !hasAriaLabel && !hasLabelledBy) {
      issues.push({
        criterion: '4.1.2',
        level: 'A',
        severity: 'error',
        componentId,
        componentType,
        message: `${componentType} component must have an accessible name`,
        remediation: 'Add a label property or aria-label/aria-labelledby via accessibility attributes',
        property: 'label',
      });
    }
  }

  // Check for required role
  const requirements = COMPONENT_REQUIREMENTS[componentType];
  if (requirements) {
    const expectedRole = requirements.aria.find((a) => a.startsWith('role:'));
    if (expectedRole && accessibility?.role) {
      const expected = expectedRole.split(': ')[1];
      if (accessibility.role !== expected) {
        issues.push({
          criterion: '4.1.2',
          level: 'A',
          severity: 'warning',
          componentId,
          componentType,
          message: `${componentType} has unexpected role`,
          remediation: `Use role="${expected}" for proper semantics`,
          property: 'role',
          expected,
          actual: accessibility.role,
        });
      }
    }
  }
}

function validateImageAltText(
  componentId: string,
  properties: Record<string, unknown>,
  issues: WCAGIssue[]
): void {
  const alt = properties.alt as string | undefined;

  if (alt === undefined || alt === null) {
    issues.push({
      criterion: '1.1.1',
      level: 'A',
      severity: 'error',
      componentId,
      componentType: 'image',
      message: 'Image is missing alt text',
      remediation: 'Add alt property with descriptive text, or empty string for decorative images',
      property: 'alt',
    });
  }
}

function validateInfoAndRelationships(
  componentId: string,
  componentType: string,
  properties: Record<string, unknown>,
  accessibility: A2UIAccessibility | undefined,
  issues: WCAGIssue[],
  warnings: WCAGWarning[]
): void {
  // Check headings have level
  if (componentType === 'text') {
    const usageHint = properties.usageHint as string | undefined;
    if (usageHint && usageHint.match(/^h[1-6]$/)) {
      if (!accessibility?.level) {
        warnings.push({
          criterion: '1.3.1',
          componentId,
          message: 'Heading element should have aria-level for programmatic access',
          suggestion: 'Add level property to accessibility attributes',
        });
      }
    }
  }

  // Check lists have proper structure
  if (componentType === 'list' || componentType === 'qe:testTimeline') {
    if (!accessibility?.role || accessibility.role !== 'list') {
      warnings.push({
        criterion: '1.3.1',
        componentId,
        message: 'List component should have role="list" for proper semantics',
        suggestion: 'Ensure list role is set in accessibility attributes',
      });
    }
  }
}

function validateLabels(
  componentId: string,
  componentType: string,
  properties: Record<string, unknown>,
  accessibility: A2UIAccessibility | undefined,
  issues: WCAGIssue[],
  warnings: WCAGWarning[]
): void {
  const hasLabel = Boolean(properties.label);
  const hasAriaLabel = Boolean(accessibility?.label);
  const hasLabelledBy = Boolean(accessibility?.labelledBy);
  const hasPlaceholder = Boolean(properties.placeholder);

  if (!hasLabel && !hasAriaLabel && !hasLabelledBy) {
    if (hasPlaceholder) {
      warnings.push({
        criterion: '3.3.2',
        componentId,
        message: 'Using placeholder as only label is not accessible',
        suggestion: 'Add a visible label or aria-label in addition to placeholder',
      });
    } else {
      issues.push({
        criterion: '3.3.2',
        level: 'A',
        severity: 'error',
        componentId,
        componentType,
        message: 'Form input is missing label',
        remediation: 'Add label property or aria-label/aria-labelledby',
        property: 'label',
      });
    }
  }

  // Check required fields are marked
  if (properties.required === true && !accessibility?.required) {
    warnings.push({
      criterion: '3.3.2',
      componentId,
      message: 'Required field should have aria-required=true',
      suggestion: 'Add required: true to accessibility attributes',
    });
  }
}

function validateKeyboardAccess(
  componentId: string,
  componentType: string,
  properties: Record<string, unknown>,
  accessibility: A2UIAccessibility | undefined,
  issues: WCAGIssue[],
  warnings: WCAGWarning[]
): void {
  const tabIndex = accessibility?.tabIndex;
  const disabled = Boolean(properties.disabled) || Boolean(accessibility?.disabled);

  // Focusable elements should have tabIndex
  if (!disabled && tabIndex === undefined) {
    warnings.push({
      criterion: '2.1.1',
      componentId,
      message: 'Interactive element should have explicit tabIndex',
      suggestion: 'Add tabIndex: 0 for focusable elements, -1 for programmatically focusable only',
    });
  }

  // Disabled elements should not be focusable
  if (disabled && tabIndex !== undefined && tabIndex >= 0) {
    issues.push({
      criterion: '2.1.1',
      level: 'A',
      severity: 'warning',
      componentId,
      componentType,
      message: 'Disabled element should not be in tab order',
      remediation: 'Set tabIndex: -1 for disabled elements',
      property: 'tabIndex',
      expected: '-1',
      actual: String(tabIndex),
    });
  }

  // Modal should trap focus
  if (componentType === 'modal') {
    const trapsFocus = properties.trapFocus;
    if (trapsFocus === false) {
      issues.push({
        criterion: '2.1.2',
        level: 'A',
        severity: 'error',
        componentId,
        componentType,
        message: 'Modal must trap focus to prevent keyboard trap',
        remediation: 'Enable focus trapping in modal or ensure proper focus management',
      });
    }
  }
}

function validateRangeValues(
  componentId: string,
  componentType: string,
  properties: Record<string, unknown>,
  accessibility: A2UIAccessibility | undefined,
  issues: WCAGIssue[]
): void {
  const value = properties.value ?? properties.coverage;
  const min = properties.min ?? 0;
  const max = properties.max ?? 100;

  // Check required range attributes
  if (accessibility) {
    if (accessibility.valueNow === undefined && value !== undefined) {
      issues.push({
        criterion: '4.1.2',
        level: 'A',
        severity: 'warning',
        componentId,
        componentType,
        message: 'Range component should expose current value via aria-valuenow',
        remediation: 'Add valueNow to accessibility attributes',
        property: 'valueNow',
      });
    }

    if (accessibility.valueMin === undefined && min !== undefined) {
      issues.push({
        criterion: '4.1.2',
        level: 'A',
        severity: 'warning',
        componentId,
        componentType,
        message: 'Range component should expose minimum value via aria-valuemin',
        remediation: 'Add valueMin to accessibility attributes',
        property: 'valueMin',
      });
    }

    if (accessibility.valueMax === undefined && max !== undefined) {
      issues.push({
        criterion: '4.1.2',
        level: 'A',
        severity: 'warning',
        componentId,
        componentType,
        message: 'Range component should expose maximum value via aria-valuemax',
        remediation: 'Add valueMax to accessibility attributes',
        property: 'valueMax',
      });
    }
  }
}

function validateHeadingsAndLabels(
  componentId: string,
  componentType: string,
  properties: Record<string, unknown>,
  accessibility: A2UIAccessibility | undefined,
  warnings: WCAGWarning[]
): void {
  // Check labels are descriptive (basic heuristics)
  const rawLabel = properties.label ?? accessibility?.label;
  // Extract string from BoundValue if needed
  const label = extractLabelString(rawLabel);

  if (label) {
    // Warn about generic labels
    const genericLabels = ['click here', 'submit', 'ok', 'cancel', 'button', 'link'];
    if (genericLabels.includes(label.toLowerCase())) {
      warnings.push({
        criterion: '2.4.6',
        componentId,
        message: `Label "${label}" is not descriptive enough`,
        suggestion: 'Use a more descriptive label that explains the action or purpose',
      });
    }

    // Warn about very short labels
    if (label.length < 3 && componentType !== 'icon') {
      warnings.push({
        criterion: '2.4.6',
        componentId,
        message: 'Label may be too short to be descriptive',
        suggestion: 'Consider using a more descriptive label',
      });
    }
  }
}

function warnAboutColorContrast(
  componentId: string,
  componentType: string,
  warnings: WCAGWarning[]
): void {
  warnings.push({
    criterion: '1.4.11',
    componentId,
    message: `${componentType} uses color to convey status - ensure sufficient contrast`,
    suggestion: 'Verify color contrast meets 3:1 ratio and consider adding icons or patterns for color-blind users',
  });
}

function isInteractive(componentType: string): boolean {
  const interactiveTypes = [
    'button', 'checkBox', 'slider', 'textField', 'dateTimeInput',
    'tabs', 'modal',
  ];
  return interactiveTypes.includes(componentType);
}

function isFormInput(componentType: string): boolean {
  const formTypes = ['textField', 'checkBox', 'slider', 'dateTimeInput'];
  return formTypes.includes(componentType);
}

function isRangeComponent(componentType: string): boolean {
  const rangeTypes = ['slider', 'qe:coverageGauge'];
  return rangeTypes.includes(componentType);
}

/**
 * Extract string value from raw label (handles BoundValue objects)
 */
function extractLabelString(rawLabel: unknown): string | undefined {
  if (typeof rawLabel === 'string') {
    return rawLabel;
  }
  if (typeof rawLabel === 'object' && rawLabel !== null) {
    // Handle BoundValue - literalString takes precedence
    const obj = rawLabel as Record<string, unknown>;
    if ('literalString' in obj && typeof obj.literalString === 'string') {
      return obj.literalString;
    }
  }
  return undefined;
}

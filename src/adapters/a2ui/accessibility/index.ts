/**
 * A2UI Accessibility Module
 *
 * Provides WCAG 2.2 Level AA accessibility support for A2UI components including:
 * - ARIA attribute utilities
 * - WCAG compliance validation
 * - Keyboard navigation patterns
 *
 * Reference: https://www.w3.org/TR/WCAG22/
 *
 * @module adapters/a2ui/accessibility
 */

// ============================================================================
// ARIA Attributes Exports
// ============================================================================

export {
  // ===== Types =====
  type AriaRole,
  type AriaLive,
  type AriaRelevant,
  type AriaAutocomplete,
  type AriaCurrent,
  type AriaDropeffect,
  type AriaHaspopup,
  type AriaOrientation,
  type AriaSort,
  type AriaChecked,
  type AriaPressed,
  type A2UIAccessibility,

  // ===== Type Guards =====
  isAriaRole,
  isAriaLive,
  isAriaRelevant,
  isAriaChecked,
  isAriaPressed,
  isA2UIAccessibility,

  // ===== Factory Functions =====
  createButtonAccessibility,
  createCheckboxAccessibility,
  createSliderAccessibility,
  createProgressAccessibility,
  createDialogAccessibility,
  createLiveRegionAccessibility,
  createTabAccessibility,
  createTabPanelAccessibility,
  createTextInputAccessibility,
  createImageAccessibility,
  createListAccessibility,
  createListItemAccessibility,
  createHeadingAccessibility,

  // ===== Utility Functions =====
  toAriaAttributes,
  mergeAccessibility,
  applyDefaultAccessibility,
  getDefaultAccessibility,
} from './aria-attributes.js';

// ============================================================================
// WCAG Validator Exports
// ============================================================================

export {
  // ===== Types =====
  type WCAGLevel,
  type WCAGPrinciple,
  type IssueSeverity,
  type WCAGCriterion,
  type WCAGIssue,
  type WCAGWarning,
  type WCAGPassedCriterion,
  type WCAGValidationResult,
  type ComponentValidationResult,
  type AccessibilityRequirement,

  // ===== WCAG Criteria Reference =====
  WCAG_LEVEL_A_CRITERIA,
  WCAG_LEVEL_AA_CRITERIA,
  getCriteriaForLevel,
  getCriterion,

  // ===== Component Requirements =====
  COMPONENT_REQUIREMENTS,
  getAccessibilityRequirements,

  // ===== Validation Functions =====
  validateComponent,
  validateSurface,
  getIssueSummary,
  getAccessibilityScore,
} from './wcag-validator.js';

// ============================================================================
// Keyboard Navigation Exports
// ============================================================================

export {
  // ===== Types =====
  type KeyboardKey,
  type ModifierKey,
  type KeyCombination,
  type KeyboardAction,
  type KeyboardNavigation,
  type KeyboardNavigationConfig,

  // ===== Keyboard Patterns =====
  KEYBOARD_PATTERNS,
  getKeyboardPattern,
  hasKeyboardPattern,
  getKeyboardActions,
  getDefaultAction,

  // ===== Pattern Helpers =====
  shouldTrapFocus,
  usesRovingTabIndex,
  supportsTypeAhead,
  getActionForKey,

  // ===== Factory Functions =====
  createKeyboardNavigation,
  mergeKeyboardNavigation,
  createFocusTrap,

  // ===== Validation & Inspection =====
  getKeyboardDescription,
  validateKeyboardNavigation,
  getAllKeyboardPatternTypes,
  getPatternsByCapability,
} from './keyboard-nav.js';

// ============================================================================
// Convenience Types
// ============================================================================

/**
 * Combined accessibility configuration for a component
 */
export interface ComponentAccessibilityConfig {
  /** ARIA attributes */
  aria: import('./aria-attributes.js').A2UIAccessibility;
  /** Keyboard navigation */
  keyboard?: import('./keyboard-nav.js').KeyboardNavigation;
}

/**
 * Accessibility audit result
 */
export interface AccessibilityAuditResult {
  /** WCAG validation result */
  wcag: import('./wcag-validator.js').WCAGValidationResult;
  /** Keyboard navigation validation */
  keyboardValidation: Array<{
    componentId: string;
    componentType: string;
    valid: boolean;
    missing: string[];
  }>;
  /** Accessibility score (0-100) */
  score: number;
  /** Summary by principle */
  principleBreakdown: {
    perceivable: { issues: number; passed: number };
    operable: { issues: number; passed: number };
    understandable: { issues: number; passed: number };
    robust: { issues: number; passed: number };
  };
}

// ============================================================================
// High-Level Functions
// ============================================================================

import type { SurfaceUpdateMessage, ComponentNode } from '../renderer/message-types.js';
import {
  validateSurface as wcagValidateSurface,
  getAccessibilityScore as getScore,
  WCAGLevel,
  WCAGIssue,
  COMPONENT_REQUIREMENTS,
} from './wcag-validator.js';
import {
  validateKeyboardNavigation,
  getKeyboardPattern,
  KeyboardNavigation,
} from './keyboard-nav.js';
import {
  A2UIAccessibility,
  applyDefaultAccessibility,
  getDefaultAccessibility,
  toAriaAttributes,
} from './aria-attributes.js';

/**
 * Run a full accessibility audit on a surface
 */
export function auditSurfaceAccessibility(
  surface: SurfaceUpdateMessage,
  level: WCAGLevel = 'AA'
): AccessibilityAuditResult {
  // Run WCAG validation
  const wcag = wcagValidateSurface(surface, level);

  // Validate keyboard navigation for each component
  const keyboardValidation = surface.components.map((component) => {
    const navigation = component.properties.keyboard as KeyboardNavigation | undefined;
    const result = validateKeyboardNavigation(component.type, navigation);
    return {
      componentId: component.id,
      componentType: component.type,
      valid: result.valid,
      missing: result.missing,
    };
  });

  // Calculate principle breakdown
  const principleBreakdown = calculatePrincipleBreakdown(wcag.issues, wcag.passed);

  return {
    wcag,
    keyboardValidation,
    score: getScore(wcag),
    principleBreakdown,
  };
}

/**
 * Apply accessibility to a component
 */
export function applyAccessibility(
  component: ComponentNode,
  accessibility: Partial<A2UIAccessibility>
): ComponentNode {
  const defaults = applyDefaultAccessibility(component.type, accessibility);
  return {
    ...component,
    properties: {
      ...component.properties,
      accessibility: defaults,
    },
  };
}

/**
 * Generate ARIA attribute map for a component
 */
export function getAriaAttributesForComponent(
  component: ComponentNode
): Record<string, string | number | boolean> {
  const accessibility = component.properties.accessibility as A2UIAccessibility | undefined;
  if (!accessibility) {
    const defaults = applyDefaultAccessibility(component.type);
    return toAriaAttributes(defaults);
  }
  return toAriaAttributes(accessibility);
}

/**
 * Get keyboard navigation description for accessibility documentation
 */
export function getAccessibilityDocumentation(componentType: string): {
  ariaRole: string | undefined;
  keyboardShortcuts: string[];
  wcagCriteria: string[];
} {
  const pattern = getKeyboardPattern(componentType);
  const defaults = getDefaultAccessibility(componentType);
  const requirements = COMPONENT_REQUIREMENTS[componentType];

  return {
    ariaRole: defaults.role,
    keyboardShortcuts: pattern?.actions.map((a) => {
      const mods = a.keys.modifiers?.join('+') ?? '';
      return `${mods ? mods + '+' : ''}${a.keys.key}: ${a.description}`;
    }) ?? [],
    wcagCriteria: requirements?.criteria ?? [],
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculatePrincipleBreakdown(
  issues: WCAGIssue[],
  passed: Array<{ criterion: string }>
): AccessibilityAuditResult['principleBreakdown'] {
  const breakdown = {
    perceivable: { issues: 0, passed: 0 },
    operable: { issues: 0, passed: 0 },
    understandable: { issues: 0, passed: 0 },
    robust: { issues: 0, passed: 0 },
  };

  // Categorize issues
  for (const issue of issues) {
    const principle = getPrincipleForCriterion(issue.criterion);
    if (principle) {
      breakdown[principle].issues++;
    }
  }

  // Categorize passed
  for (const pass of passed) {
    const principle = getPrincipleForCriterion(pass.criterion);
    if (principle) {
      breakdown[principle].passed++;
    }
  }

  return breakdown;
}

function getPrincipleForCriterion(criterion: string): keyof AccessibilityAuditResult['principleBreakdown'] | undefined {
  const first = criterion.charAt(0);
  switch (first) {
    case '1':
      return 'perceivable';
    case '2':
      return 'operable';
    case '3':
      return 'understandable';
    case '4':
      return 'robust';
    default:
      return undefined;
  }
}

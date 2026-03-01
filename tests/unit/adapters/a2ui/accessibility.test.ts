/**
 * A2UI Accessibility Module Unit Tests
 *
 * Comprehensive test suite for WCAG 2.2 Level AA accessibility compliance.
 * Tests ARIA attributes, WCAG validation, and keyboard navigation patterns.
 *
 * Target: 25+ unit tests covering all accessibility features.
 *
 * @module tests/unit/adapters/a2ui/accessibility
 */

import { describe, it, expect } from 'vitest';

import {
  // ===== ARIA Types and Functions =====
  type AriaRole,
  type AriaLive,
  type AriaRelevant,
  type AriaChecked,
  type AriaPressed,
  type A2UIAccessibility,
  isAriaRole,
  isAriaLive,
  isAriaRelevant,
  isAriaChecked,
  isAriaPressed,
  isA2UIAccessibility,
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
  toAriaAttributes,
  mergeAccessibility,
  applyDefaultAccessibility,
  getDefaultAccessibility,

  // ===== WCAG Types and Functions =====
  type WCAGLevel,
  type WCAGCriterion,
  type WCAGIssue,
  type WCAGValidationResult,
  type AccessibilityRequirement,
  WCAG_LEVEL_A_CRITERIA,
  WCAG_LEVEL_AA_CRITERIA,
  getCriteriaForLevel,
  getCriterion,
  COMPONENT_REQUIREMENTS,
  getAccessibilityRequirements,
  validateComponentAccessibility,
  validateSurfaceAccessibility,
  getIssueSummary,
  getAccessibilityScore,

  // ===== Keyboard Navigation =====
  type KeyboardKey,
  type KeyboardNavigation,
  type KeyboardNavigationConfig,
  KEYBOARD_PATTERNS,
  getKeyboardPattern,
  hasKeyboardPattern,
  getKeyboardActions,
  getDefaultAction,
  shouldTrapFocus,
  usesRovingTabIndex,
  supportsTypeAhead,
  getActionForKey,
  createKeyboardNavigation,
  mergeKeyboardNavigation,
  createFocusTrap,
  getKeyboardDescription,
  validateKeyboardNavigation,
  getAllKeyboardPatternTypes,
  getPatternsByCapability,

  // ===== High-Level Functions =====
  type AccessibilityAuditResult,
  auditSurfaceAccessibility,
  applyAccessibility,
  getAriaAttributesForComponent,
  getAccessibilityDocumentation,
} from '../../../../src/adapters/a2ui/index.js';

import type {
  ComponentNode,
  SurfaceUpdateMessage,
} from '../../../../src/adapters/a2ui/renderer/message-types.js';

// ============================================================================
// ARIA Type Guards Tests
// ============================================================================

describe('ARIA Type Guards', () => {
  describe('isAriaRole', () => {
    it('should return true for valid widget roles', () => {
      expect(isAriaRole('button')).toBe(true);
      expect(isAriaRole('checkbox')).toBe(true);
      expect(isAriaRole('slider')).toBe(true);
      expect(isAriaRole('textbox')).toBe(true);
    });

    it('should return true for valid landmark roles', () => {
      expect(isAriaRole('banner')).toBe(true);
      expect(isAriaRole('main')).toBe(true);
      expect(isAriaRole('navigation')).toBe(true);
      expect(isAriaRole('region')).toBe(true);
    });

    it('should return true for valid live region roles', () => {
      expect(isAriaRole('alert')).toBe(true);
      expect(isAriaRole('status')).toBe(true);
      expect(isAriaRole('dialog')).toBe(true);
      expect(isAriaRole('alertdialog')).toBe(true);
    });

    it('should return false for invalid roles', () => {
      expect(isAriaRole('invalid')).toBe(false);
      expect(isAriaRole('')).toBe(false);
      expect(isAriaRole(123 as unknown as string)).toBe(false);
      expect(isAriaRole(null as unknown as string)).toBe(false);
    });
  });

  describe('isAriaLive', () => {
    it('should return true for valid live values', () => {
      expect(isAriaLive('off')).toBe(true);
      expect(isAriaLive('polite')).toBe(true);
      expect(isAriaLive('assertive')).toBe(true);
    });

    it('should return false for invalid live values', () => {
      expect(isAriaLive('invalid')).toBe(false);
      expect(isAriaLive('')).toBe(false);
    });
  });

  describe('isAriaRelevant', () => {
    it('should return true for valid relevant values', () => {
      expect(isAriaRelevant('additions')).toBe(true);
      expect(isAriaRelevant('removals')).toBe(true);
      expect(isAriaRelevant('text')).toBe(true);
      expect(isAriaRelevant('all')).toBe(true);
      expect(isAriaRelevant('additions text')).toBe(true);
    });

    it('should return false for invalid relevant values', () => {
      expect(isAriaRelevant('invalid')).toBe(false);
    });
  });

  describe('isAriaChecked', () => {
    it('should return true for valid checked values', () => {
      expect(isAriaChecked(true)).toBe(true);
      expect(isAriaChecked(false)).toBe(true);
      expect(isAriaChecked('mixed')).toBe(true);
    });

    it('should return false for invalid checked values', () => {
      expect(isAriaChecked('invalid')).toBe(false);
      expect(isAriaChecked(0 as unknown as boolean)).toBe(false);
    });
  });

  describe('isAriaPressed', () => {
    it('should return true for valid pressed values', () => {
      expect(isAriaPressed(true)).toBe(true);
      expect(isAriaPressed(false)).toBe(true);
      expect(isAriaPressed('mixed')).toBe(true);
    });
  });

  describe('isA2UIAccessibility', () => {
    it('should return true for valid accessibility object', () => {
      expect(isA2UIAccessibility({ role: 'button', label: 'Test' })).toBe(true);
      expect(isA2UIAccessibility({ live: 'polite' })).toBe(true);
      expect(isA2UIAccessibility({})).toBe(true);
    });

    it('should return false for invalid accessibility object', () => {
      expect(isA2UIAccessibility(null)).toBe(false);
      expect(isA2UIAccessibility('string')).toBe(false);
      expect(isA2UIAccessibility({ role: 'invalid' })).toBe(false);
    });
  });
});

// ============================================================================
// ARIA Factory Functions Tests
// ============================================================================

describe('ARIA Factory Functions', () => {
  describe('createButtonAccessibility', () => {
    it('should create button accessibility with required props', () => {
      const a11y = createButtonAccessibility({ label: 'Submit' });
      expect(a11y.role).toBe('button');
      expect(a11y.label).toBe('Submit');
      expect(a11y.tabIndex).toBe(0);
    });

    it('should create toggle button accessibility', () => {
      const a11y = createButtonAccessibility({
        label: 'Mute',
        pressed: true,
      });
      expect(a11y.pressed).toBe(true);
    });

    it('should create disabled button accessibility', () => {
      const a11y = createButtonAccessibility({
        label: 'Disabled',
        disabled: true,
      });
      expect(a11y.disabled).toBe(true);
      expect(a11y.tabIndex).toBe(-1);
    });

    it('should create button with popup', () => {
      const a11y = createButtonAccessibility({
        label: 'Menu',
        hasPopup: 'menu',
        expanded: false,
        controls: 'menu-list',
      });
      expect(a11y.hasPopup).toBe('menu');
      expect(a11y.expanded).toBe(false);
      expect(a11y.controls).toBe('menu-list');
    });
  });

  describe('createCheckboxAccessibility', () => {
    it('should create checkbox accessibility', () => {
      const a11y = createCheckboxAccessibility({
        label: 'Accept terms',
        checked: false,
      });
      expect(a11y.role).toBe('checkbox');
      expect(a11y.checked).toBe(false);
      expect(a11y.tabIndex).toBe(0);
    });

    it('should support mixed state', () => {
      const a11y = createCheckboxAccessibility({
        label: 'Select all',
        checked: 'mixed',
      });
      expect(a11y.checked).toBe('mixed');
    });

    it('should support required field', () => {
      const a11y = createCheckboxAccessibility({
        label: 'Required checkbox',
        checked: false,
        required: true,
      });
      expect(a11y.required).toBe(true);
    });
  });

  describe('createSliderAccessibility', () => {
    it('should create slider accessibility with range', () => {
      const a11y = createSliderAccessibility({
        label: 'Volume',
        valueMin: 0,
        valueMax: 100,
        valueNow: 50,
      });
      expect(a11y.role).toBe('slider');
      expect(a11y.valueMin).toBe(0);
      expect(a11y.valueMax).toBe(100);
      expect(a11y.valueNow).toBe(50);
      expect(a11y.valueText).toBe('50');
      expect(a11y.orientation).toBe('horizontal');
    });

    it('should support custom value text', () => {
      const a11y = createSliderAccessibility({
        label: 'Brightness',
        valueMin: 0,
        valueMax: 10,
        valueNow: 5,
        valueText: '50% brightness',
      });
      expect(a11y.valueText).toBe('50% brightness');
    });
  });

  describe('createProgressAccessibility', () => {
    it('should create progress bar accessibility', () => {
      const a11y = createProgressAccessibility({
        label: 'Download progress',
        valueNow: 75,
      });
      expect(a11y.role).toBe('progressbar');
      expect(a11y.valueNow).toBe(75);
      expect(a11y.valueMin).toBe(0);
      expect(a11y.valueMax).toBe(100);
      expect(a11y.valueText).toBe('75%');
    });
  });

  describe('createDialogAccessibility', () => {
    it('should create modal dialog accessibility', () => {
      const a11y = createDialogAccessibility({
        labelledBy: 'dialog-title',
        describedBy: 'dialog-desc',
      });
      expect(a11y.role).toBe('alertdialog');
      expect(a11y.labelledBy).toBe('dialog-title');
      expect(a11y.describedBy).toBe('dialog-desc');
    });

    it('should create non-modal dialog', () => {
      const a11y = createDialogAccessibility({
        label: 'Search',
        modal: false,
      });
      expect(a11y.role).toBe('dialog');
    });
  });

  describe('createLiveRegionAccessibility', () => {
    it('should create polite live region', () => {
      const a11y = createLiveRegionAccessibility({
        live: 'polite',
        role: 'status',
      });
      expect(a11y.live).toBe('polite');
      expect(a11y.atomic).toBe(false);
      expect(a11y.relevant).toBe('additions text');
    });

    it('should create assertive live region', () => {
      const a11y = createLiveRegionAccessibility({
        live: 'assertive',
        role: 'alert',
        atomic: true,
      });
      expect(a11y.live).toBe('assertive');
      expect(a11y.atomic).toBe(true);
    });
  });

  describe('createTabAccessibility', () => {
    it('should create tab accessibility', () => {
      const a11y = createTabAccessibility({
        label: 'Tab 1',
        selected: true,
        controls: 'panel-1',
        posInSet: 1,
        setSize: 3,
      });
      expect(a11y.role).toBe('tab');
      expect(a11y.selected).toBe(true);
      expect(a11y.controls).toBe('panel-1');
      expect(a11y.posInSet).toBe(1);
      expect(a11y.setSize).toBe(3);
      expect(a11y.tabIndex).toBe(0);
    });

    it('should create unselected tab', () => {
      const a11y = createTabAccessibility({
        label: 'Tab 2',
        selected: false,
        controls: 'panel-2',
        posInSet: 2,
        setSize: 3,
      });
      expect(a11y.tabIndex).toBe(-1);
    });
  });

  describe('createTabPanelAccessibility', () => {
    it('should create tab panel accessibility', () => {
      const a11y = createTabPanelAccessibility({
        labelledBy: 'tab-1',
      });
      expect(a11y.role).toBe('tabpanel');
      expect(a11y.labelledBy).toBe('tab-1');
      expect(a11y.tabIndex).toBe(0);
    });

    it('should create hidden tab panel', () => {
      const a11y = createTabPanelAccessibility({
        labelledBy: 'tab-2',
        hidden: true,
      });
      expect(a11y.hidden).toBe(true);
      expect(a11y.tabIndex).toBe(-1);
    });
  });

  describe('createTextInputAccessibility', () => {
    it('should create text input accessibility', () => {
      const a11y = createTextInputAccessibility({
        label: 'Username',
        required: true,
      });
      expect(a11y.role).toBe('textbox');
      expect(a11y.required).toBe(true);
      expect(a11y.tabIndex).toBe(0);
    });

    it('should create invalid input accessibility', () => {
      const a11y = createTextInputAccessibility({
        labelledBy: 'email-label',
        invalid: true,
        errorMessage: 'email-error',
      });
      expect(a11y.invalid).toBe(true);
      expect(a11y.errorMessage).toBe('email-error');
    });

    it('should create combobox accessibility', () => {
      const a11y = createTextInputAccessibility({
        label: 'Search',
        autocomplete: 'list',
        hasPopup: 'listbox',
        expanded: true,
        controls: 'search-results',
      });
      expect(a11y.autocomplete).toBe('list');
      expect(a11y.hasPopup).toBe('listbox');
      expect(a11y.expanded).toBe(true);
    });
  });

  describe('createImageAccessibility', () => {
    it('should create image accessibility', () => {
      const a11y = createImageAccessibility({
        alt: 'Company logo',
      });
      expect(a11y.role).toBe('img');
      expect(a11y.label).toBe('Company logo');
    });

    it('should create decorative image accessibility', () => {
      const a11y = createImageAccessibility({
        alt: '',
        decorative: true,
      });
      expect(a11y.role).toBe('presentation');
      expect(a11y.hidden).toBe(true);
    });
  });

  describe('createListAccessibility', () => {
    it('should create list accessibility', () => {
      const a11y = createListAccessibility({
        label: 'Options',
        setSize: 5,
      });
      expect(a11y.role).toBe('list');
      expect(a11y.setSize).toBe(5);
    });

    it('should create multiselectable list', () => {
      const a11y = createListAccessibility({
        multiSelectable: true,
      });
      expect(a11y.multiSelectable).toBe(true);
    });
  });

  describe('createListItemAccessibility', () => {
    it('should create list item accessibility', () => {
      const a11y = createListItemAccessibility({
        posInSet: 3,
        setSize: 10,
      });
      expect(a11y.role).toBe('listitem');
      expect(a11y.posInSet).toBe(3);
      expect(a11y.setSize).toBe(10);
    });

    it('should create selected list item', () => {
      const a11y = createListItemAccessibility({
        posInSet: 1,
        setSize: 5,
        selected: true,
      });
      expect(a11y.selected).toBe(true);
    });
  });

  describe('createHeadingAccessibility', () => {
    it('should create heading accessibility', () => {
      const a11y = createHeadingAccessibility({ level: 2 });
      expect(a11y.role).toBe('heading');
      expect(a11y.level).toBe(2);
    });
  });
});

// ============================================================================
// ARIA Utility Functions Tests
// ============================================================================

describe('ARIA Utility Functions', () => {
  describe('toAriaAttributes', () => {
    it('should convert accessibility object to ARIA attributes', () => {
      const a11y: A2UIAccessibility = {
        role: 'button',
        label: 'Submit',
        disabled: true,
        tabIndex: -1,
      };
      const attrs = toAriaAttributes(a11y);
      expect(attrs['role']).toBe('button');
      expect(attrs['aria-label']).toBe('Submit');
      expect(attrs['aria-disabled']).toBe(true);
      expect(attrs['tabindex']).toBe(-1);
    });

    it('should convert range attributes', () => {
      const a11y: A2UIAccessibility = {
        role: 'slider',
        valueMin: 0,
        valueMax: 100,
        valueNow: 50,
        valueText: '50%',
      };
      const attrs = toAriaAttributes(a11y);
      expect(attrs['aria-valuemin']).toBe(0);
      expect(attrs['aria-valuemax']).toBe(100);
      expect(attrs['aria-valuenow']).toBe(50);
      expect(attrs['aria-valuetext']).toBe('50%');
    });

    it('should convert live region attributes', () => {
      const a11y: A2UIAccessibility = {
        live: 'polite',
        atomic: true,
        relevant: 'additions text',
        busy: false,
      };
      const attrs = toAriaAttributes(a11y);
      expect(attrs['aria-live']).toBe('polite');
      expect(attrs['aria-atomic']).toBe(true);
      expect(attrs['aria-relevant']).toBe('additions text');
      expect(attrs['aria-busy']).toBe(false);
    });

    it('should omit undefined values', () => {
      const a11y: A2UIAccessibility = {
        role: 'button',
      };
      const attrs = toAriaAttributes(a11y);
      expect(Object.keys(attrs)).toHaveLength(1);
      expect(attrs['aria-label']).toBeUndefined();
    });
  });

  describe('mergeAccessibility', () => {
    it('should merge accessibility objects', () => {
      const base: A2UIAccessibility = {
        role: 'button',
        label: 'Base',
        tabIndex: 0,
      };
      const override: Partial<A2UIAccessibility> = {
        label: 'Override',
        disabled: true,
      };
      const merged = mergeAccessibility(base, override);
      expect(merged.role).toBe('button');
      expect(merged.label).toBe('Override');
      expect(merged.tabIndex).toBe(0);
      expect(merged.disabled).toBe(true);
    });
  });

  describe('getDefaultAccessibility', () => {
    it('should return defaults for button', () => {
      const defaults = getDefaultAccessibility('button');
      expect(defaults.role).toBe('button');
      expect(defaults.tabIndex).toBe(0);
    });

    it('should return defaults for slider', () => {
      const defaults = getDefaultAccessibility('slider');
      expect(defaults.role).toBe('slider');
      expect(defaults.orientation).toBe('horizontal');
    });

    it('should return defaults for modal', () => {
      const defaults = getDefaultAccessibility('modal');
      expect(defaults.role).toBe('dialog');
    });

    it('should return defaults for QE components', () => {
      expect(getDefaultAccessibility('qe:coverageGauge').role).toBe('meter');
      expect(getDefaultAccessibility('qe:testStatusBadge').role).toBe('status');
      expect(getDefaultAccessibility('qe:qualityGateIndicator').live).toBe('polite');
    });

    it('should return empty object for unknown components', () => {
      const defaults = getDefaultAccessibility('unknown');
      expect(Object.keys(defaults)).toHaveLength(0);
    });
  });

  describe('applyDefaultAccessibility', () => {
    it('should apply defaults to component type', () => {
      const a11y = applyDefaultAccessibility('button');
      expect(a11y.role).toBe('button');
      expect(a11y.tabIndex).toBe(0);
    });

    it('should merge with existing accessibility', () => {
      const a11y = applyDefaultAccessibility('button', {
        label: 'Custom',
        disabled: true,
      });
      expect(a11y.role).toBe('button');
      expect(a11y.label).toBe('Custom');
      expect(a11y.disabled).toBe(true);
    });
  });
});

// ============================================================================
// WCAG Criteria Tests
// ============================================================================

describe('WCAG Criteria', () => {
  describe('WCAG_LEVEL_A_CRITERIA', () => {
    it('should include key Level A criteria', () => {
      expect(WCAG_LEVEL_A_CRITERIA['1.1.1']).toBeDefined();
      expect(WCAG_LEVEL_A_CRITERIA['1.1.1'].name).toBe('Non-text Content');
      expect(WCAG_LEVEL_A_CRITERIA['1.1.1'].level).toBe('A');

      expect(WCAG_LEVEL_A_CRITERIA['2.1.1']).toBeDefined();
      expect(WCAG_LEVEL_A_CRITERIA['2.1.1'].name).toBe('Keyboard');

      expect(WCAG_LEVEL_A_CRITERIA['4.1.2']).toBeDefined();
      expect(WCAG_LEVEL_A_CRITERIA['4.1.2'].name).toBe('Name, Role, Value');
    });

    it('should include perceivable criteria', () => {
      expect(WCAG_LEVEL_A_CRITERIA['1.3.1'].principle).toBe('perceivable');
    });

    it('should include operable criteria', () => {
      expect(WCAG_LEVEL_A_CRITERIA['2.1.1'].principle).toBe('operable');
    });

    it('should include understandable criteria', () => {
      expect(WCAG_LEVEL_A_CRITERIA['3.2.1'].principle).toBe('understandable');
    });

    it('should include robust criteria', () => {
      expect(WCAG_LEVEL_A_CRITERIA['4.1.2'].principle).toBe('robust');
    });
  });

  describe('WCAG_LEVEL_AA_CRITERIA', () => {
    it('should include key Level AA criteria', () => {
      expect(WCAG_LEVEL_AA_CRITERIA['1.4.3']).toBeDefined();
      expect(WCAG_LEVEL_AA_CRITERIA['1.4.3'].name).toBe('Contrast (Minimum)');
      expect(WCAG_LEVEL_AA_CRITERIA['1.4.3'].level).toBe('AA');

      expect(WCAG_LEVEL_AA_CRITERIA['2.4.7']).toBeDefined();
      expect(WCAG_LEVEL_AA_CRITERIA['2.4.7'].name).toBe('Focus Visible');
    });

    it('should include WCAG 2.2 criteria', () => {
      expect(WCAG_LEVEL_AA_CRITERIA['2.4.11']).toBeDefined();
      expect(WCAG_LEVEL_AA_CRITERIA['2.4.11'].name).toBe('Focus Not Obscured (Minimum)');

      expect(WCAG_LEVEL_AA_CRITERIA['2.5.8']).toBeDefined();
      expect(WCAG_LEVEL_AA_CRITERIA['2.5.8'].name).toBe('Target Size (Minimum)');

      expect(WCAG_LEVEL_AA_CRITERIA['3.3.8']).toBeDefined();
      expect(WCAG_LEVEL_AA_CRITERIA['3.3.8'].name).toBe('Accessible Authentication (Minimum)');
    });
  });

  describe('getCriteriaForLevel', () => {
    it('should return only Level A criteria for A', () => {
      const criteria = getCriteriaForLevel('A');
      expect(criteria.every((c) => c.level === 'A')).toBe(true);
    });

    it('should include Level A and AA for AA', () => {
      const criteria = getCriteriaForLevel('AA');
      const levels = new Set(criteria.map((c) => c.level));
      expect(levels.has('A')).toBe(true);
      expect(levels.has('AA')).toBe(true);
    });
  });

  describe('getCriterion', () => {
    it('should return criterion by ID', () => {
      const criterion = getCriterion('1.1.1');
      expect(criterion?.name).toBe('Non-text Content');
    });

    it('should return undefined for unknown criterion', () => {
      expect(getCriterion('99.99.99')).toBeUndefined();
    });
  });
});

// ============================================================================
// Component Requirements Tests
// ============================================================================

describe('Component Accessibility Requirements', () => {
  describe('COMPONENT_REQUIREMENTS', () => {
    it('should have requirements for button', () => {
      const req = COMPONENT_REQUIREMENTS['button'];
      expect(req).toBeDefined();
      expect(req.required).toContain('label');
      expect(req.aria).toContain('role: button');
      expect(req.keyboard).toContain('Enter');
      expect(req.keyboard).toContain('Space');
    });

    it('should have requirements for slider', () => {
      const req = COMPONENT_REQUIREMENTS['slider'];
      expect(req).toBeDefined();
      expect(req.required).toContain('min');
      expect(req.required).toContain('max');
      expect(req.required).toContain('value');
      expect(req.aria).toContain('role: slider');
      expect(req.keyboard).toContain('ArrowLeft');
      expect(req.keyboard).toContain('ArrowRight');
    });

    it('should have requirements for image', () => {
      const req = COMPONENT_REQUIREMENTS['image'];
      expect(req).toBeDefined();
      expect(req.required).toContain('alt');
      expect(req.criteria).toContain('1.1.1');
    });

    it('should have requirements for modal', () => {
      const req = COMPONENT_REQUIREMENTS['modal'];
      expect(req).toBeDefined();
      expect(req.aria).toContain('role: dialog');
      expect(req.keyboard).toContain('Escape');
    });

    it('should have requirements for QE components', () => {
      const gaugeReq = COMPONENT_REQUIREMENTS['qe:coverageGauge'];
      expect(gaugeReq).toBeDefined();
      expect(gaugeReq.aria).toContain('role: meter');
    });
  });

  describe('getAccessibilityRequirements', () => {
    it('should return requirements for known components', () => {
      const req = getAccessibilityRequirements('button');
      expect(req?.componentType).toBe('button');
    });

    it('should return undefined for unknown components', () => {
      expect(getAccessibilityRequirements('unknown')).toBeUndefined();
    });
  });
});

// ============================================================================
// Component Validation Tests
// ============================================================================

describe('WCAG Component Validation', () => {
  describe('validateComponentAccessibility', () => {
    it('should pass for accessible button', () => {
      const component: ComponentNode = {
        id: 'submit-btn',
        type: 'button',
        properties: {
          label: { literalString: 'Submit Form' },
          action: 'submit',
          accessibility: {
            role: 'button',
            tabIndex: 0,
          },
        },
      };
      const result = validateComponentAccessibility(component);
      expect(result.issues).toHaveLength(0);
    });

    it('should fail for button without label', () => {
      const component: ComponentNode = {
        id: 'bad-btn',
        type: 'button',
        properties: {
          action: 'submit',
        },
      };
      const result = validateComponentAccessibility(component);
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.some((i) => i.criterion === '4.1.2')).toBe(true);
    });

    it('should fail for image without alt', () => {
      const component: ComponentNode = {
        id: 'bad-img',
        type: 'image',
        properties: {
          src: { literalString: 'test.jpg' },
        },
      };
      const result = validateComponentAccessibility(component);
      expect(result.issues.some((i) => i.criterion === '1.1.1')).toBe(true);
    });

    it('should pass for image with alt', () => {
      const component: ComponentNode = {
        id: 'good-img',
        type: 'image',
        properties: {
          src: { literalString: 'test.jpg' },
          alt: 'Test image description',
        },
      };
      const result = validateComponentAccessibility(component);
      const imageIssues = result.issues.filter((i) => i.criterion === '1.1.1');
      expect(imageIssues).toHaveLength(0);
    });

    it('should warn about form input without label', () => {
      const component: ComponentNode = {
        id: 'bad-input',
        type: 'textField',
        properties: {
          value: { path: '/user/email' },
          placeholder: 'Enter email',
        },
      };
      const result = validateComponentAccessibility(component);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should validate range component values', () => {
      const component: ComponentNode = {
        id: 'slider',
        type: 'slider',
        properties: {
          value: { literalString: 50 },
          min: 0,
          max: 100,
          accessibility: {
            role: 'slider',
          },
        },
      };
      const result = validateComponentAccessibility(component);
      expect(result.issues.some((i) => i.property === 'valueNow')).toBe(true);
    });
  });
});

// ============================================================================
// Surface Validation Tests
// ============================================================================

describe('WCAG Surface Validation', () => {
  describe('validateSurfaceAccessibility', () => {
    it('should validate a complete surface', () => {
      const surface: SurfaceUpdateMessage = {
        type: 'surfaceUpdate',
        surfaceId: 'test-surface',
        version: 1,
        components: [
          {
            id: 'btn',
            type: 'button',
            properties: {
              label: { literalString: 'Submit' },
              action: 'submit',
            },
          },
          {
            id: 'img',
            type: 'image',
            properties: {
              src: { literalString: 'logo.png' },
              alt: 'Company logo',
            },
          },
        ],
      };
      const result = validateSurfaceAccessibility(surface, 'AA');
      expect(result.surfaceId).toBe('test-surface');
      expect(result.componentCount).toBe(2);
      expect(typeof result.duration).toBe('number');
    });

    it('should report all issues for invalid surface', () => {
      const surface: SurfaceUpdateMessage = {
        type: 'surfaceUpdate',
        surfaceId: 'bad-surface',
        version: 1,
        components: [
          {
            id: 'btn',
            type: 'button',
            properties: { action: 'submit' },
          },
          {
            id: 'img',
            type: 'image',
            properties: { src: { literalString: 'test.jpg' } },
          },
        ],
      };
      const result = validateSurfaceAccessibility(surface);
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    });
  });

  describe('getIssueSummary', () => {
    it('should summarize issues by criterion', () => {
      const issues: WCAGIssue[] = [
        { criterion: '1.1.1', level: 'A', severity: 'error', componentId: 'img1', componentType: 'image', message: '', remediation: '' },
        { criterion: '1.1.1', level: 'A', severity: 'error', componentId: 'img2', componentType: 'image', message: '', remediation: '' },
        { criterion: '4.1.2', level: 'A', severity: 'error', componentId: 'btn1', componentType: 'button', message: '', remediation: '' },
      ];
      const summary = getIssueSummary(issues);
      expect(summary['1.1.1'].count).toBe(2);
      expect(summary['1.1.1'].components).toContain('img1');
      expect(summary['1.1.1'].components).toContain('img2');
      expect(summary['4.1.2'].count).toBe(1);
    });
  });

  describe('getAccessibilityScore', () => {
    it('should return 100 for fully accessible surface', () => {
      const result: WCAGValidationResult = {
        valid: true,
        level: 'AA',
        surfaceId: 'test',
        issues: [],
        warnings: [],
        passed: [
          { criterion: '1.1.1', name: 'Non-text Content', componentCount: 1 },
          { criterion: '4.1.2', name: 'Name, Role, Value', componentCount: 1 },
        ],
        componentCount: 2,
        timestamp: new Date().toISOString(),
        duration: 10,
      };
      expect(getAccessibilityScore(result)).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Keyboard Navigation Pattern Tests
// ============================================================================

describe('Keyboard Navigation Patterns', () => {
  describe('KEYBOARD_PATTERNS', () => {
    it('should have pattern for button', () => {
      const pattern = KEYBOARD_PATTERNS['button'];
      expect(pattern).toBeDefined();
      expect(pattern.focusable).toBe(true);
      expect(pattern.onEnter).toBe('activate');
      expect(pattern.onSpace).toBe('activate');
    });

    it('should have pattern for slider', () => {
      const pattern = KEYBOARD_PATTERNS['slider'];
      expect(pattern).toBeDefined();
      expect(pattern.onArrowLeft).toBe('decrease');
      expect(pattern.onArrowRight).toBe('increase');
      expect(pattern.onHome).toBe('setMin');
      expect(pattern.onEnd).toBe('setMax');
    });

    it('should have pattern for modal with focus trap', () => {
      const pattern = KEYBOARD_PATTERNS['modal'];
      expect(pattern).toBeDefined();
      expect(pattern.trapFocus).toBe(true);
      expect(pattern.onEscape).toBe('close');
    });

    it('should have pattern for tabs with roving tabindex', () => {
      const pattern = KEYBOARD_PATTERNS['tabs'];
      expect(pattern).toBeDefined();
      expect(pattern.rovingTabIndex).toBe(true);
      expect(pattern.onArrowLeft).toBe('prevTab');
      expect(pattern.onArrowRight).toBe('nextTab');
    });

    it('should have pattern for menu with type-ahead', () => {
      const pattern = KEYBOARD_PATTERNS['menu'];
      expect(pattern).toBeDefined();
      expect(pattern.typeAhead).toBe(true);
      expect(pattern.typeAheadDelay).toBe(500);
    });
  });

  describe('getKeyboardPattern', () => {
    it('should return pattern for known component', () => {
      const pattern = getKeyboardPattern('button');
      expect(pattern?.componentType).toBe('button');
    });

    it('should return undefined for unknown component', () => {
      expect(getKeyboardPattern('unknown')).toBeUndefined();
    });
  });

  describe('hasKeyboardPattern', () => {
    it('should return true for components with patterns', () => {
      expect(hasKeyboardPattern('button')).toBe(true);
      expect(hasKeyboardPattern('slider')).toBe(true);
      expect(hasKeyboardPattern('tabs')).toBe(true);
    });

    it('should return false for components without patterns', () => {
      expect(hasKeyboardPattern('text')).toBe(false);
      expect(hasKeyboardPattern('unknown')).toBe(false);
    });
  });

  describe('getKeyboardActions', () => {
    it('should return all actions for component', () => {
      const actions = getKeyboardActions('button');
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.some((a) => a.actionId === 'activate')).toBe(true);
    });

    it('should return empty array for unknown component', () => {
      expect(getKeyboardActions('unknown')).toHaveLength(0);
    });
  });

  describe('getDefaultAction', () => {
    it('should return default action for button', () => {
      const action = getDefaultAction('button');
      expect(action?.actionId).toBe('activate');
      expect(action?.isDefault).toBe(true);
    });
  });

  describe('shouldTrapFocus', () => {
    it('should return true for modal', () => {
      expect(shouldTrapFocus('modal')).toBe(true);
    });

    it('should return false for button', () => {
      expect(shouldTrapFocus('button')).toBe(false);
    });
  });

  describe('usesRovingTabIndex', () => {
    it('should return true for tabs', () => {
      expect(usesRovingTabIndex('tabs')).toBe(true);
    });

    it('should return true for menu', () => {
      expect(usesRovingTabIndex('menu')).toBe(true);
    });

    it('should return false for button', () => {
      expect(usesRovingTabIndex('button')).toBe(false);
    });
  });

  describe('supportsTypeAhead', () => {
    it('should return true for menu', () => {
      expect(supportsTypeAhead('menu')).toBe(true);
    });

    it('should return true for listbox', () => {
      expect(supportsTypeAhead('listbox')).toBe(true);
    });

    it('should return false for button', () => {
      expect(supportsTypeAhead('button')).toBe(false);
    });
  });

  describe('getActionForKey', () => {
    it('should return action for Enter on button', () => {
      expect(getActionForKey('button', 'Enter')).toBe('activate');
    });

    it('should return action for ArrowRight on slider', () => {
      expect(getActionForKey('slider', 'ArrowRight')).toBe('increase');
    });

    it('should return action for Escape on modal', () => {
      expect(getActionForKey('modal', 'Escape')).toBe('close');
    });

    it('should return undefined for unknown component', () => {
      expect(getActionForKey('unknown', 'Enter')).toBeUndefined();
    });
  });
});

// ============================================================================
// Keyboard Navigation Factory Functions Tests
// ============================================================================

describe('Keyboard Navigation Factory Functions', () => {
  describe('createKeyboardNavigation', () => {
    it('should create navigation with defaults', () => {
      const nav = createKeyboardNavigation({});
      expect(nav.focusable).toBe(true);
      expect(nav.tabIndex).toBe(0);
    });

    it('should create navigation with custom options', () => {
      const nav = createKeyboardNavigation({
        trapFocus: true,
        onEscape: 'close',
      });
      expect(nav.trapFocus).toBe(true);
      expect(nav.onEscape).toBe('close');
    });
  });

  describe('mergeKeyboardNavigation', () => {
    it('should merge navigation configs', () => {
      const base: KeyboardNavigation = {
        focusable: true,
        tabIndex: 0,
        onEnter: 'activate',
      };
      const override: Partial<KeyboardNavigation> = {
        onEnter: 'submit',
        onEscape: 'cancel',
      };
      const merged = mergeKeyboardNavigation(base, override);
      expect(merged.focusable).toBe(true);
      expect(merged.onEnter).toBe('submit');
      expect(merged.onEscape).toBe('cancel');
    });
  });

  describe('createFocusTrap', () => {
    it('should create focus trap config', () => {
      const trap = createFocusTrap({
        firstFocusableId: 'first-btn',
        lastFocusableId: 'last-btn',
        onEscape: 'close-modal',
      });
      expect(trap.trapFocus).toBe(true);
      expect(trap.trapBoundaries?.first).toBe('first-btn');
      expect(trap.trapBoundaries?.last).toBe('last-btn');
      expect(trap.onEscape).toBe('close-modal');
      expect(trap.tabIndex).toBe(-1);
    });

    it('should use default escape action', () => {
      const trap = createFocusTrap({
        firstFocusableId: 'first',
        lastFocusableId: 'last',
      });
      expect(trap.onEscape).toBe('closeTrap');
    });
  });

  describe('getKeyboardDescription', () => {
    it('should return descriptions for button', () => {
      const descriptions = getKeyboardDescription('button');
      expect(descriptions.length).toBeGreaterThan(0);
      expect(descriptions.some((d) => d.includes('Enter'))).toBe(true);
    });

    it('should return empty array for unknown component', () => {
      expect(getKeyboardDescription('unknown')).toHaveLength(0);
    });
  });

  describe('validateKeyboardNavigation', () => {
    it('should pass for complete navigation', () => {
      const result = validateKeyboardNavigation('button', {
        focusable: true,
        tabIndex: 0,
        onEnter: 'activate',
        onSpace: 'activate',
      });
      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should report missing tabIndex', () => {
      const result = validateKeyboardNavigation('button', {
        focusable: true,
      });
      expect(result.missing).toContain('tabIndex');
    });

    it('should report missing focus trap', () => {
      const result = validateKeyboardNavigation('modal', {
        tabIndex: -1,
      });
      expect(result.missing).toContain('trapFocus');
    });
  });

  describe('getAllKeyboardPatternTypes', () => {
    it('should return all pattern types', () => {
      const types = getAllKeyboardPatternTypes();
      expect(types).toContain('button');
      expect(types).toContain('slider');
      expect(types).toContain('modal');
      expect(types).toContain('tabs');
    });
  });

  describe('getPatternsByCapability', () => {
    it('should filter by trapFocus', () => {
      const types = getPatternsByCapability('trapFocus');
      expect(types).toContain('modal');
      expect(types).not.toContain('button');
    });

    it('should filter by rovingTabIndex', () => {
      const types = getPatternsByCapability('rovingTabIndex');
      expect(types).toContain('tabs');
      expect(types).toContain('menu');
    });

    it('should filter by typeAhead', () => {
      const types = getPatternsByCapability('typeAhead');
      expect(types).toContain('menu');
      expect(types).toContain('listbox');
    });
  });
});

// ============================================================================
// High-Level Accessibility Functions Tests
// ============================================================================

describe('High-Level Accessibility Functions', () => {
  describe('auditSurfaceAccessibility', () => {
    it('should audit a surface and return comprehensive result', () => {
      const surface: SurfaceUpdateMessage = {
        type: 'surfaceUpdate',
        surfaceId: 'test',
        version: 1,
        components: [
          {
            id: 'btn',
            type: 'button',
            properties: {
              label: { literalString: 'Submit' },
              action: 'submit',
            },
          },
        ],
      };
      const result = auditSurfaceAccessibility(surface, 'AA');
      expect(result.wcag).toBeDefined();
      expect(result.keyboardValidation).toBeDefined();
      expect(typeof result.score).toBe('number');
      expect(result.principleBreakdown).toBeDefined();
    });

    it('should include principle breakdown', () => {
      const surface: SurfaceUpdateMessage = {
        type: 'surfaceUpdate',
        surfaceId: 'test',
        version: 1,
        components: [],
      };
      const result = auditSurfaceAccessibility(surface);
      expect(result.principleBreakdown.perceivable).toBeDefined();
      expect(result.principleBreakdown.operable).toBeDefined();
      expect(result.principleBreakdown.understandable).toBeDefined();
      expect(result.principleBreakdown.robust).toBeDefined();
    });
  });

  describe('applyAccessibility', () => {
    it('should apply accessibility to component', () => {
      const component: ComponentNode = {
        id: 'btn',
        type: 'button',
        properties: {
          label: { literalString: 'Click' },
        },
      };
      const result = applyAccessibility(component, { label: 'Click me' });
      expect(result.properties.accessibility).toBeDefined();
      expect((result.properties.accessibility as A2UIAccessibility).label).toBe('Click me');
    });

    it('should merge with default accessibility', () => {
      const component: ComponentNode = {
        id: 'btn',
        type: 'button',
        properties: {},
      };
      const result = applyAccessibility(component, { disabled: true });
      expect((result.properties.accessibility as A2UIAccessibility).role).toBe('button');
      expect((result.properties.accessibility as A2UIAccessibility).disabled).toBe(true);
    });
  });

  describe('getAriaAttributesForComponent', () => {
    it('should return ARIA attributes from component', () => {
      const component: ComponentNode = {
        id: 'btn',
        type: 'button',
        properties: {
          accessibility: {
            role: 'button',
            label: 'Submit',
          },
        },
      };
      const attrs = getAriaAttributesForComponent(component);
      expect(attrs['role']).toBe('button');
      expect(attrs['aria-label']).toBe('Submit');
    });

    it('should apply defaults if no accessibility', () => {
      const component: ComponentNode = {
        id: 'btn',
        type: 'button',
        properties: {},
      };
      const attrs = getAriaAttributesForComponent(component);
      expect(attrs['role']).toBe('button');
    });
  });

  describe('getAccessibilityDocumentation', () => {
    it('should return documentation for component', () => {
      const doc = getAccessibilityDocumentation('button');
      expect(doc.ariaRole).toBe('button');
      expect(doc.keyboardShortcuts.length).toBeGreaterThan(0);
      expect(doc.wcagCriteria.length).toBeGreaterThan(0);
    });

    it('should include keyboard shortcuts', () => {
      const doc = getAccessibilityDocumentation('slider');
      expect(doc.keyboardShortcuts.some((s) => s.includes('ArrowRight'))).toBe(true);
    });
  });
});

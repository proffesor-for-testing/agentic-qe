/**
 * A2UI Keyboard Navigation Patterns
 *
 * Defines keyboard navigation patterns for A2UI components following
 * WAI-ARIA Authoring Practices 1.2 guidelines.
 *
 * Reference: https://www.w3.org/WAI/ARIA/apg/patterns/
 *
 * @module adapters/a2ui/accessibility/keyboard-nav
 */

// ============================================================================
// Keyboard Navigation Types
// ============================================================================

/**
 * Standard keyboard key identifiers
 */
export type KeyboardKey =
  | 'Enter'
  | 'Space'
  | 'Escape'
  | 'Tab'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Home'
  | 'End'
  | 'PageUp'
  | 'PageDown'
  | 'Delete'
  | 'Backspace';

/**
 * Modifier keys
 */
export type ModifierKey = 'Shift' | 'Control' | 'Alt' | 'Meta';

/**
 * Key combination with optional modifiers
 */
export interface KeyCombination {
  /** Primary key */
  readonly key: KeyboardKey;
  /** Required modifier keys */
  readonly modifiers?: ModifierKey[];
}

/**
 * Keyboard action definition
 */
export interface KeyboardAction {
  /** Key combination that triggers action */
  readonly keys: KeyCombination;
  /** Action identifier */
  readonly actionId: string;
  /** Human-readable description */
  readonly description: string;
  /** Whether this is the default action */
  readonly isDefault?: boolean;
  /** Condition for when action is available */
  readonly condition?: string;
}

/**
 * Keyboard navigation pattern for a component
 */
export interface KeyboardNavigation {
  // ===== Focus Management =====
  /** Tab index for focus order */
  readonly tabIndex?: number;
  /** Whether the component is focusable */
  readonly focusable?: boolean;

  // ===== Key Handlers =====
  /** Action triggered on Enter key */
  readonly onEnter?: string;
  /** Action triggered on Space key */
  readonly onSpace?: string;
  /** Action triggered on Escape key */
  readonly onEscape?: string;
  /** Action triggered on Arrow Up key */
  readonly onArrowUp?: string;
  /** Action triggered on Arrow Down key */
  readonly onArrowDown?: string;
  /** Action triggered on Arrow Left key */
  readonly onArrowLeft?: string;
  /** Action triggered on Arrow Right key */
  readonly onArrowRight?: string;
  /** Action triggered on Home key */
  readonly onHome?: string;
  /** Action triggered on End key */
  readonly onEnd?: string;
  /** Action triggered on Page Up key */
  readonly onPageUp?: string;
  /** Action triggered on Page Down key */
  readonly onPageDown?: string;
  /** Action triggered on Delete key */
  readonly onDelete?: string;

  // ===== Focus Trap =====
  /** Whether focus should be trapped within this component */
  readonly trapFocus?: boolean;
  /** IDs of first and last focusable elements for trap */
  readonly trapBoundaries?: {
    first: string;
    last: string;
  };

  // ===== Skip Links =====
  /** Whether this is a skip link target */
  readonly skipLinkTarget?: boolean;
  /** ID for skip link reference */
  readonly skipLinkId?: string;

  // ===== Roving Tab Index =====
  /** Whether to use roving tabindex pattern */
  readonly rovingTabIndex?: boolean;
  /** Current active element ID in roving set */
  readonly activeDescendant?: string;

  // ===== Type-Ahead =====
  /** Whether type-ahead search is enabled */
  readonly typeAhead?: boolean;
  /** Delay before type-ahead resets (ms) */
  readonly typeAheadDelay?: number;
}

/**
 * Full keyboard navigation configuration
 */
export interface KeyboardNavigationConfig extends KeyboardNavigation {
  /** Component type this config applies to */
  readonly componentType: string;
  /** All supported keyboard actions */
  readonly actions: KeyboardAction[];
  /** Notes about keyboard behavior */
  readonly notes?: string;
}

// ============================================================================
// Standard Keyboard Patterns
// ============================================================================

/**
 * Predefined keyboard patterns for common component types
 */
export const KEYBOARD_PATTERNS: Record<string, KeyboardNavigationConfig> = {
  // ===== Button =====
  button: {
    componentType: 'button',
    focusable: true,
    tabIndex: 0,
    onEnter: 'activate',
    onSpace: 'activate',
    actions: [
      {
        keys: { key: 'Enter' },
        actionId: 'activate',
        description: 'Activate the button',
        isDefault: true,
      },
      {
        keys: { key: 'Space' },
        actionId: 'activate',
        description: 'Activate the button',
      },
    ],
  },

  // ===== Checkbox =====
  checkBox: {
    componentType: 'checkBox',
    focusable: true,
    tabIndex: 0,
    onSpace: 'toggle',
    actions: [
      {
        keys: { key: 'Space' },
        actionId: 'toggle',
        description: 'Toggle checkbox state',
        isDefault: true,
      },
    ],
    notes: 'Enter typically submits forms, so only Space toggles',
  },

  // ===== Slider =====
  slider: {
    componentType: 'slider',
    focusable: true,
    tabIndex: 0,
    onArrowLeft: 'decrease',
    onArrowRight: 'increase',
    onArrowUp: 'increase',
    onArrowDown: 'decrease',
    onHome: 'setMin',
    onEnd: 'setMax',
    onPageUp: 'increaseLarge',
    onPageDown: 'decreaseLarge',
    actions: [
      {
        keys: { key: 'ArrowRight' },
        actionId: 'increase',
        description: 'Increase value by one step',
      },
      {
        keys: { key: 'ArrowUp' },
        actionId: 'increase',
        description: 'Increase value by one step',
      },
      {
        keys: { key: 'ArrowLeft' },
        actionId: 'decrease',
        description: 'Decrease value by one step',
      },
      {
        keys: { key: 'ArrowDown' },
        actionId: 'decrease',
        description: 'Decrease value by one step',
      },
      {
        keys: { key: 'Home' },
        actionId: 'setMin',
        description: 'Set to minimum value',
      },
      {
        keys: { key: 'End' },
        actionId: 'setMax',
        description: 'Set to maximum value',
      },
      {
        keys: { key: 'PageUp' },
        actionId: 'increaseLarge',
        description: 'Increase value by large step',
      },
      {
        keys: { key: 'PageDown' },
        actionId: 'decreaseLarge',
        description: 'Decrease value by large step',
      },
    ],
    notes: 'Arrow keys adjust by step, Page keys adjust by 10x step',
  },

  // ===== Text Field =====
  textField: {
    componentType: 'textField',
    focusable: true,
    tabIndex: 0,
    onEscape: 'cancel',
    actions: [
      {
        keys: { key: 'Escape' },
        actionId: 'cancel',
        description: 'Cancel input or close autocomplete',
      },
    ],
    notes: 'Most key handling is native text input behavior',
  },

  // ===== Modal / Dialog =====
  modal: {
    componentType: 'modal',
    focusable: true,
    tabIndex: -1,
    trapFocus: true,
    onEscape: 'close',
    actions: [
      {
        keys: { key: 'Escape' },
        actionId: 'close',
        description: 'Close the dialog',
        isDefault: true,
      },
      {
        keys: { key: 'Tab' },
        actionId: 'focusNext',
        description: 'Move focus to next element (trapped)',
      },
      {
        keys: { key: 'Tab', modifiers: ['Shift'] },
        actionId: 'focusPrevious',
        description: 'Move focus to previous element (trapped)',
      },
    ],
    notes: 'Focus must be trapped within modal; Escape closes',
  },

  // ===== Tabs =====
  tabs: {
    componentType: 'tabs',
    focusable: true,
    tabIndex: 0,
    rovingTabIndex: true,
    onArrowLeft: 'prevTab',
    onArrowRight: 'nextTab',
    onHome: 'firstTab',
    onEnd: 'lastTab',
    onEnter: 'activateTab',
    onSpace: 'activateTab',
    actions: [
      {
        keys: { key: 'ArrowLeft' },
        actionId: 'prevTab',
        description: 'Focus previous tab',
      },
      {
        keys: { key: 'ArrowRight' },
        actionId: 'nextTab',
        description: 'Focus next tab',
      },
      {
        keys: { key: 'Home' },
        actionId: 'firstTab',
        description: 'Focus first tab',
      },
      {
        keys: { key: 'End' },
        actionId: 'lastTab',
        description: 'Focus last tab',
      },
      {
        keys: { key: 'Enter' },
        actionId: 'activateTab',
        description: 'Activate focused tab',
      },
      {
        keys: { key: 'Space' },
        actionId: 'activateTab',
        description: 'Activate focused tab',
      },
    ],
    notes: 'Uses roving tabindex; arrows move focus, Enter/Space activates',
  },

  // ===== Accordion =====
  accordion: {
    componentType: 'accordion',
    focusable: true,
    tabIndex: 0,
    onEnter: 'toggleSection',
    onSpace: 'toggleSection',
    onArrowUp: 'prevSection',
    onArrowDown: 'nextSection',
    onHome: 'firstSection',
    onEnd: 'lastSection',
    actions: [
      {
        keys: { key: 'Enter' },
        actionId: 'toggleSection',
        description: 'Toggle section expanded/collapsed',
      },
      {
        keys: { key: 'Space' },
        actionId: 'toggleSection',
        description: 'Toggle section expanded/collapsed',
      },
      {
        keys: { key: 'ArrowDown' },
        actionId: 'nextSection',
        description: 'Focus next section header',
      },
      {
        keys: { key: 'ArrowUp' },
        actionId: 'prevSection',
        description: 'Focus previous section header',
      },
      {
        keys: { key: 'Home' },
        actionId: 'firstSection',
        description: 'Focus first section header',
      },
      {
        keys: { key: 'End' },
        actionId: 'lastSection',
        description: 'Focus last section header',
      },
    ],
  },

  // ===== Menu =====
  menu: {
    componentType: 'menu',
    focusable: true,
    tabIndex: -1,
    rovingTabIndex: true,
    typeAhead: true,
    typeAheadDelay: 500,
    onArrowDown: 'nextItem',
    onArrowUp: 'prevItem',
    onHome: 'firstItem',
    onEnd: 'lastItem',
    onEnter: 'activateItem',
    onSpace: 'activateItem',
    onEscape: 'closeMenu',
    actions: [
      {
        keys: { key: 'ArrowDown' },
        actionId: 'nextItem',
        description: 'Focus next menu item',
      },
      {
        keys: { key: 'ArrowUp' },
        actionId: 'prevItem',
        description: 'Focus previous menu item',
      },
      {
        keys: { key: 'Home' },
        actionId: 'firstItem',
        description: 'Focus first menu item',
      },
      {
        keys: { key: 'End' },
        actionId: 'lastItem',
        description: 'Focus last menu item',
      },
      {
        keys: { key: 'Enter' },
        actionId: 'activateItem',
        description: 'Activate focused menu item',
      },
      {
        keys: { key: 'Space' },
        actionId: 'activateItem',
        description: 'Activate focused menu item',
      },
      {
        keys: { key: 'Escape' },
        actionId: 'closeMenu',
        description: 'Close menu and return focus',
      },
    ],
    notes: 'Supports type-ahead; letter keys focus matching items',
  },

  // ===== Listbox =====
  listbox: {
    componentType: 'listbox',
    focusable: true,
    tabIndex: 0,
    rovingTabIndex: true,
    typeAhead: true,
    typeAheadDelay: 500,
    onArrowDown: 'nextOption',
    onArrowUp: 'prevOption',
    onHome: 'firstOption',
    onEnd: 'lastOption',
    onEnter: 'selectOption',
    onSpace: 'selectOption',
    actions: [
      {
        keys: { key: 'ArrowDown' },
        actionId: 'nextOption',
        description: 'Focus next option',
      },
      {
        keys: { key: 'ArrowUp' },
        actionId: 'prevOption',
        description: 'Focus previous option',
      },
      {
        keys: { key: 'Home' },
        actionId: 'firstOption',
        description: 'Focus first option',
      },
      {
        keys: { key: 'End' },
        actionId: 'lastOption',
        description: 'Focus last option',
      },
      {
        keys: { key: 'Enter' },
        actionId: 'selectOption',
        description: 'Select focused option',
      },
      {
        keys: { key: 'Space' },
        actionId: 'selectOption',
        description: 'Select focused option',
      },
    ],
  },

  // ===== List (generic) =====
  list: {
    componentType: 'list',
    focusable: true,
    tabIndex: 0,
    onArrowDown: 'nextItem',
    onArrowUp: 'prevItem',
    onHome: 'firstItem',
    onEnd: 'lastItem',
    actions: [
      {
        keys: { key: 'ArrowDown' },
        actionId: 'nextItem',
        description: 'Focus next list item',
      },
      {
        keys: { key: 'ArrowUp' },
        actionId: 'prevItem',
        description: 'Focus previous list item',
      },
      {
        keys: { key: 'Home' },
        actionId: 'firstItem',
        description: 'Focus first list item',
      },
      {
        keys: { key: 'End' },
        actionId: 'lastItem',
        description: 'Focus last list item',
      },
    ],
  },

  // ===== Date/Time Input =====
  dateTimeInput: {
    componentType: 'dateTimeInput',
    focusable: true,
    tabIndex: 0,
    onArrowUp: 'incrementField',
    onArrowDown: 'decrementField',
    onArrowLeft: 'prevField',
    onArrowRight: 'nextField',
    actions: [
      {
        keys: { key: 'ArrowUp' },
        actionId: 'incrementField',
        description: 'Increment current field value',
      },
      {
        keys: { key: 'ArrowDown' },
        actionId: 'decrementField',
        description: 'Decrement current field value',
      },
      {
        keys: { key: 'ArrowLeft' },
        actionId: 'prevField',
        description: 'Move to previous field (month/day/year)',
      },
      {
        keys: { key: 'ArrowRight' },
        actionId: 'nextField',
        description: 'Move to next field (month/day/year)',
      },
    ],
    notes: 'Each date segment (day/month/year) is separately adjustable',
  },

  // ===== QE Components =====
  'qe:testTimeline': {
    componentType: 'qe:testTimeline',
    focusable: true,
    tabIndex: 0,
    onArrowLeft: 'prevEvent',
    onArrowRight: 'nextEvent',
    onHome: 'firstEvent',
    onEnd: 'lastEvent',
    onEnter: 'selectEvent',
    actions: [
      {
        keys: { key: 'ArrowLeft' },
        actionId: 'prevEvent',
        description: 'Focus previous timeline event',
      },
      {
        keys: { key: 'ArrowRight' },
        actionId: 'nextEvent',
        description: 'Focus next timeline event',
      },
      {
        keys: { key: 'Home' },
        actionId: 'firstEvent',
        description: 'Focus first timeline event',
      },
      {
        keys: { key: 'End' },
        actionId: 'lastEvent',
        description: 'Focus last timeline event',
      },
      {
        keys: { key: 'Enter' },
        actionId: 'selectEvent',
        description: 'Select focused event for details',
      },
    ],
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get keyboard navigation pattern for a component type
 */
export function getKeyboardPattern(componentType: string): KeyboardNavigationConfig | undefined {
  return KEYBOARD_PATTERNS[componentType];
}

/**
 * Check if a component type has keyboard navigation defined
 */
export function hasKeyboardPattern(componentType: string): boolean {
  return componentType in KEYBOARD_PATTERNS;
}

/**
 * Get all keyboard actions for a component type
 */
export function getKeyboardActions(componentType: string): KeyboardAction[] {
  const pattern = KEYBOARD_PATTERNS[componentType];
  return pattern?.actions ?? [];
}

/**
 * Get the default action for a component type
 */
export function getDefaultAction(componentType: string): KeyboardAction | undefined {
  const actions = getKeyboardActions(componentType);
  return actions.find((a) => a.isDefault);
}

/**
 * Check if a key should trigger focus trap handling
 */
export function shouldTrapFocus(componentType: string): boolean {
  const pattern = KEYBOARD_PATTERNS[componentType];
  return pattern?.trapFocus === true;
}

/**
 * Check if a component uses roving tabindex
 */
export function usesRovingTabIndex(componentType: string): boolean {
  const pattern = KEYBOARD_PATTERNS[componentType];
  return pattern?.rovingTabIndex === true;
}

/**
 * Check if a component supports type-ahead
 */
export function supportsTypeAhead(componentType: string): boolean {
  const pattern = KEYBOARD_PATTERNS[componentType];
  return pattern?.typeAhead === true;
}

/**
 * Get action ID for a specific key
 */
export function getActionForKey(
  componentType: string,
  key: KeyboardKey,
  modifiers?: ModifierKey[]
): string | undefined {
  const pattern = KEYBOARD_PATTERNS[componentType];
  if (!pattern) return undefined;

  // Check specific key handlers first
  switch (key) {
    case 'Enter':
      return pattern.onEnter;
    case 'Space':
      return pattern.onSpace;
    case 'Escape':
      return pattern.onEscape;
    case 'ArrowUp':
      return pattern.onArrowUp;
    case 'ArrowDown':
      return pattern.onArrowDown;
    case 'ArrowLeft':
      return pattern.onArrowLeft;
    case 'ArrowRight':
      return pattern.onArrowRight;
    case 'Home':
      return pattern.onHome;
    case 'End':
      return pattern.onEnd;
    case 'PageUp':
      return pattern.onPageUp;
    case 'PageDown':
      return pattern.onPageDown;
    case 'Delete':
      return pattern.onDelete;
    default:
      return undefined;
  }
}

/**
 * Create a keyboard navigation configuration
 */
export function createKeyboardNavigation(options: Partial<KeyboardNavigation>): KeyboardNavigation {
  return {
    focusable: options.focusable ?? true,
    tabIndex: options.tabIndex ?? 0,
    ...options,
  };
}

/**
 * Merge keyboard navigation configurations
 */
export function mergeKeyboardNavigation(
  base: KeyboardNavigation,
  override: Partial<KeyboardNavigation>
): KeyboardNavigation {
  return {
    ...base,
    ...override,
  };
}

/**
 * Create focus trap configuration
 */
export function createFocusTrap(options: {
  firstFocusableId: string;
  lastFocusableId: string;
  onEscape?: string;
}): KeyboardNavigation {
  return {
    trapFocus: true,
    trapBoundaries: {
      first: options.firstFocusableId,
      last: options.lastFocusableId,
    },
    onEscape: options.onEscape ?? 'closeTrap',
    tabIndex: -1,
    focusable: true,
  };
}

/**
 * Get description of keyboard navigation for a component
 */
export function getKeyboardDescription(componentType: string): string[] {
  const pattern = KEYBOARD_PATTERNS[componentType];
  if (!pattern) return [];

  const descriptions: string[] = [];

  for (const action of pattern.actions) {
    const modifierStr = action.keys.modifiers?.length
      ? `${action.keys.modifiers.join('+')}+`
      : '';
    descriptions.push(`${modifierStr}${action.keys.key}: ${action.description}`);
  }

  if (pattern.notes) {
    descriptions.push(`Note: ${pattern.notes}`);
  }

  return descriptions;
}

/**
 * Validate that required keyboard navigation is present
 */
export function validateKeyboardNavigation(
  componentType: string,
  navigation?: KeyboardNavigation
): { valid: boolean; missing: string[] } {
  const pattern = KEYBOARD_PATTERNS[componentType];
  if (!pattern) {
    return { valid: true, missing: [] };
  }

  const missing: string[] = [];

  // Check if focusable components have tabIndex
  if (pattern.focusable && navigation?.tabIndex === undefined) {
    missing.push('tabIndex');
  }

  // Check for required handlers
  const requiredHandlers: Array<keyof KeyboardNavigation> = [];

  if (pattern.onEnter) requiredHandlers.push('onEnter');
  if (pattern.onSpace) requiredHandlers.push('onSpace');
  if (pattern.onEscape) requiredHandlers.push('onEscape');

  for (const handler of requiredHandlers) {
    if (pattern[handler] && !navigation?.[handler]) {
      missing.push(handler);
    }
  }

  // Check focus trap configuration
  if (pattern.trapFocus && !navigation?.trapFocus) {
    missing.push('trapFocus');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get all component types with keyboard patterns
 */
export function getAllKeyboardPatternTypes(): string[] {
  return Object.keys(KEYBOARD_PATTERNS);
}

/**
 * Filter patterns by capability
 */
export function getPatternsByCapability(
  capability: 'trapFocus' | 'rovingTabIndex' | 'typeAhead'
): string[] {
  return Object.entries(KEYBOARD_PATTERNS)
    .filter(([_, pattern]) => pattern[capability] === true)
    .map(([type]) => type);
}

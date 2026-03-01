/**
 * A2UI ARIA Attributes Utilities
 *
 * Comprehensive ARIA attribute support for A2UI components following
 * WAI-ARIA 1.2 specification and WCAG 2.2 guidelines.
 *
 * Reference: https://www.w3.org/TR/wai-aria-1.2/
 *
 * @module adapters/a2ui/accessibility/aria-attributes
 */

// ============================================================================
// ARIA Role Types
// ============================================================================

/**
 * Standard ARIA roles for A2UI components
 */
export type AriaRole =
  // Widget roles
  | 'button'
  | 'checkbox'
  | 'gridcell'
  | 'link'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'option'
  | 'progressbar'
  | 'radio'
  | 'scrollbar'
  | 'searchbox'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'switch'
  | 'tab'
  | 'tabpanel'
  | 'textbox'
  | 'treeitem'
  // Composite widget roles
  | 'combobox'
  | 'grid'
  | 'listbox'
  | 'menu'
  | 'menubar'
  | 'radiogroup'
  | 'tablist'
  | 'tree'
  | 'treegrid'
  // Document structure roles
  | 'application'
  | 'article'
  | 'blockquote'
  | 'cell'
  | 'columnheader'
  | 'definition'
  | 'directory'
  | 'document'
  | 'feed'
  | 'figure'
  | 'group'
  | 'heading'
  | 'img'
  | 'list'
  | 'listitem'
  | 'math'
  | 'none'
  | 'note'
  | 'presentation'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'table'
  | 'term'
  | 'toolbar'
  | 'tooltip'
  // Landmark roles
  | 'banner'
  | 'complementary'
  | 'contentinfo'
  | 'form'
  | 'main'
  | 'navigation'
  | 'region'
  | 'search'
  // Live region roles
  | 'alert'
  | 'alertdialog'
  | 'dialog'
  | 'log'
  | 'marquee'
  | 'status'
  | 'timer'
  // Window roles
  | 'meter';

/**
 * ARIA live region modes
 */
export type AriaLive = 'off' | 'polite' | 'assertive';

/**
 * ARIA relevant changes for live regions
 */
export type AriaRelevant = 'additions' | 'removals' | 'text' | 'all' | 'additions text';

/**
 * ARIA auto-complete modes
 */
export type AriaAutocomplete = 'none' | 'inline' | 'list' | 'both';

/**
 * ARIA current values
 */
export type AriaCurrent = boolean | 'page' | 'step' | 'location' | 'date' | 'time';

/**
 * ARIA drop effect values
 */
export type AriaDropeffect = 'copy' | 'execute' | 'link' | 'move' | 'none' | 'popup';

/**
 * ARIA has-popup values
 */
export type AriaHaspopup = boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';

/**
 * ARIA orientation values
 */
export type AriaOrientation = 'horizontal' | 'vertical' | 'undefined';

/**
 * ARIA sort values
 */
export type AriaSort = 'ascending' | 'descending' | 'none' | 'other';

/**
 * Tri-state checked value (for checkboxes with mixed state)
 */
export type AriaChecked = boolean | 'mixed';

/**
 * Tri-state pressed value (for toggle buttons)
 */
export type AriaPressed = boolean | 'mixed';

// ============================================================================
// A2UI Accessibility Interface
// ============================================================================

/**
 * Comprehensive accessibility attributes for A2UI components
 * Following WCAG 2.2 Level AA requirements
 */
export interface A2UIAccessibility {
  // ===== Core ARIA Attributes =====
  /** ARIA role for the component */
  readonly role?: AriaRole;
  /** Accessible name (aria-label) */
  readonly label?: string;
  /** ID reference for labelling element (aria-labelledby) */
  readonly labelledBy?: string;
  /** ID reference for describing element (aria-describedby) */
  readonly describedBy?: string;

  // ===== Live Region Attributes =====
  /** Live region update mode */
  readonly live?: AriaLive;
  /** Whether the region is atomic */
  readonly atomic?: boolean;
  /** Types of changes relevant to live region */
  readonly relevant?: AriaRelevant;
  /** Whether the live region is busy */
  readonly busy?: boolean;

  // ===== State Attributes =====
  /** Whether the element is hidden from accessibility tree */
  readonly hidden?: boolean;
  /** Whether the element is disabled */
  readonly disabled?: boolean;
  /** Whether the element is expanded (for expandable widgets) */
  readonly expanded?: boolean;
  /** Whether the element is selected */
  readonly selected?: boolean;
  /** Whether the button is pressed (for toggle buttons) */
  readonly pressed?: AriaPressed;
  /** Whether the checkbox/switch is checked */
  readonly checked?: AriaChecked;
  /** Whether the element is required for form submission */
  readonly required?: boolean;
  /** Whether the element has an error */
  readonly invalid?: boolean;

  // ===== Range Attributes (for sliders, progress bars, etc.) =====
  /** Minimum allowed value */
  readonly valueMin?: number;
  /** Maximum allowed value */
  readonly valueMax?: number;
  /** Current value */
  readonly valueNow?: number;
  /** Human-readable text alternative for value */
  readonly valueText?: string;

  // ===== Relationship Attributes =====
  /** ID references for owned elements */
  readonly owns?: string;
  /** ID references for elements this controls */
  readonly controls?: string;
  /** ID references for flow-to elements */
  readonly flowTo?: string;
  /** ID reference for error message element */
  readonly errorMessage?: string;
  /** ID reference for details element */
  readonly details?: string;

  // ===== Widget Attributes =====
  /** Auto-complete behavior */
  readonly autocomplete?: AriaAutocomplete;
  /** Whether the element has a popup */
  readonly hasPopup?: AriaHaspopup;
  /** Level for headings and tree items */
  readonly level?: number;
  /** Whether the element can be selected */
  readonly multiSelectable?: boolean;
  /** Orientation of the element */
  readonly orientation?: AriaOrientation;
  /** Position in set (1-indexed) */
  readonly posInSet?: number;
  /** Total number in set */
  readonly setSize?: number;
  /** Sort direction */
  readonly sort?: AriaSort;

  // ===== Keyboard Navigation =====
  /** Tab index for focus order */
  readonly tabIndex?: number;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if value is a valid ARIA role
 */
export function isAriaRole(value: unknown): value is AriaRole {
  const validRoles = new Set<string>([
    'button', 'checkbox', 'gridcell', 'link', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'progressbar', 'radio', 'scrollbar', 'searchbox',
    'separator', 'slider', 'spinbutton', 'switch', 'tab', 'tabpanel', 'textbox',
    'treeitem', 'combobox', 'grid', 'listbox', 'menu', 'menubar', 'radiogroup',
    'tablist', 'tree', 'treegrid', 'application', 'article', 'blockquote', 'cell',
    'columnheader', 'definition', 'directory', 'document', 'feed', 'figure',
    'group', 'heading', 'img', 'list', 'listitem', 'math', 'none', 'note',
    'presentation', 'row', 'rowgroup', 'rowheader', 'table', 'term', 'toolbar',
    'tooltip', 'banner', 'complementary', 'contentinfo', 'form', 'main',
    'navigation', 'region', 'search', 'alert', 'alertdialog', 'dialog', 'log',
    'marquee', 'status', 'timer', 'meter',
  ]);
  return typeof value === 'string' && validRoles.has(value);
}

/**
 * Check if value is a valid ARIA live mode
 */
export function isAriaLive(value: unknown): value is AriaLive {
  return value === 'off' || value === 'polite' || value === 'assertive';
}

/**
 * Check if value is a valid ARIA relevant
 */
export function isAriaRelevant(value: unknown): value is AriaRelevant {
  return (
    value === 'additions' ||
    value === 'removals' ||
    value === 'text' ||
    value === 'all' ||
    value === 'additions text'
  );
}

/**
 * Check if value is a valid AriaChecked value
 */
export function isAriaChecked(value: unknown): value is AriaChecked {
  return typeof value === 'boolean' || value === 'mixed';
}

/**
 * Check if value is a valid AriaPressed value
 */
export function isAriaPressed(value: unknown): value is AriaPressed {
  return typeof value === 'boolean' || value === 'mixed';
}

/**
 * Check if value is a valid A2UIAccessibility object
 */
export function isA2UIAccessibility(value: unknown): value is A2UIAccessibility {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Check role if present
  if ('role' in obj && obj.role !== undefined && !isAriaRole(obj.role)) {
    return false;
  }

  // Check live if present
  if ('live' in obj && obj.live !== undefined && !isAriaLive(obj.live)) {
    return false;
  }

  return true;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create accessibility attributes for a button component
 */
export function createButtonAccessibility(options: {
  label: string;
  disabled?: boolean;
  pressed?: AriaPressed;
  hasPopup?: AriaHaspopup;
  expanded?: boolean;
  controls?: string;
}): A2UIAccessibility {
  return {
    role: 'button',
    label: options.label,
    disabled: options.disabled,
    pressed: options.pressed,
    hasPopup: options.hasPopup,
    expanded: options.expanded,
    controls: options.controls,
    tabIndex: options.disabled ? -1 : 0,
  };
}

/**
 * Create accessibility attributes for a checkbox component
 */
export function createCheckboxAccessibility(options: {
  label: string;
  checked: AriaChecked;
  disabled?: boolean;
  required?: boolean;
  describedBy?: string;
}): A2UIAccessibility {
  return {
    role: 'checkbox',
    label: options.label,
    checked: options.checked,
    disabled: options.disabled,
    required: options.required,
    describedBy: options.describedBy,
    tabIndex: options.disabled ? -1 : 0,
  };
}

/**
 * Create accessibility attributes for a slider component
 */
export function createSliderAccessibility(options: {
  label: string;
  valueMin: number;
  valueMax: number;
  valueNow: number;
  valueText?: string;
  disabled?: boolean;
  orientation?: AriaOrientation;
}): A2UIAccessibility {
  return {
    role: 'slider',
    label: options.label,
    valueMin: options.valueMin,
    valueMax: options.valueMax,
    valueNow: options.valueNow,
    valueText: options.valueText ?? `${options.valueNow}`,
    disabled: options.disabled,
    orientation: options.orientation ?? 'horizontal',
    tabIndex: options.disabled ? -1 : 0,
  };
}

/**
 * Create accessibility attributes for a progress bar component
 */
export function createProgressAccessibility(options: {
  label: string;
  valueNow: number;
  valueMin?: number;
  valueMax?: number;
  valueText?: string;
}): A2UIAccessibility {
  const min = options.valueMin ?? 0;
  const max = options.valueMax ?? 100;
  return {
    role: 'progressbar',
    label: options.label,
    valueMin: min,
    valueMax: max,
    valueNow: options.valueNow,
    valueText: options.valueText ?? `${Math.round((options.valueNow / max) * 100)}%`,
  };
}

/**
 * Create accessibility attributes for a dialog/modal component
 */
export function createDialogAccessibility(options: {
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  modal?: boolean;
}): A2UIAccessibility {
  return {
    role: options.modal !== false ? 'alertdialog' : 'dialog',
    label: options.label,
    labelledBy: options.labelledBy,
    describedBy: options.describedBy,
  };
}

/**
 * Create accessibility attributes for a live region
 */
export function createLiveRegionAccessibility(options: {
  live: AriaLive;
  atomic?: boolean;
  relevant?: AriaRelevant;
  role?: 'alert' | 'status' | 'log' | 'timer' | 'marquee';
}): A2UIAccessibility {
  return {
    role: options.role,
    live: options.live,
    atomic: options.atomic ?? (options.live === 'assertive'),
    relevant: options.relevant ?? 'additions text',
  };
}

/**
 * Create accessibility attributes for a tab
 */
export function createTabAccessibility(options: {
  label: string;
  selected: boolean;
  controls: string;
  posInSet: number;
  setSize: number;
  disabled?: boolean;
}): A2UIAccessibility {
  return {
    role: 'tab',
    label: options.label,
    selected: options.selected,
    controls: options.controls,
    posInSet: options.posInSet,
    setSize: options.setSize,
    disabled: options.disabled,
    tabIndex: options.selected ? 0 : -1,
  };
}

/**
 * Create accessibility attributes for a tabpanel
 */
export function createTabPanelAccessibility(options: {
  labelledBy: string;
  hidden?: boolean;
}): A2UIAccessibility {
  return {
    role: 'tabpanel',
    labelledBy: options.labelledBy,
    hidden: options.hidden,
    tabIndex: options.hidden ? -1 : 0,
  };
}

/**
 * Create accessibility attributes for a text input
 */
export function createTextInputAccessibility(options: {
  label?: string;
  labelledBy?: string;
  required?: boolean;
  invalid?: boolean;
  errorMessage?: string;
  describedBy?: string;
  disabled?: boolean;
  autocomplete?: AriaAutocomplete;
  hasPopup?: AriaHaspopup;
  expanded?: boolean;
  controls?: string;
}): A2UIAccessibility {
  return {
    role: 'textbox',
    label: options.label,
    labelledBy: options.labelledBy,
    required: options.required,
    invalid: options.invalid,
    errorMessage: options.errorMessage,
    describedBy: options.describedBy,
    disabled: options.disabled,
    autocomplete: options.autocomplete,
    hasPopup: options.hasPopup,
    expanded: options.expanded,
    controls: options.controls,
    tabIndex: options.disabled ? -1 : 0,
  };
}

/**
 * Create accessibility attributes for an image
 */
export function createImageAccessibility(options: {
  alt: string;
  decorative?: boolean;
}): A2UIAccessibility {
  if (options.decorative) {
    return {
      role: 'presentation',
      hidden: true,
    };
  }
  return {
    role: 'img',
    label: options.alt,
  };
}

/**
 * Create accessibility attributes for a list
 */
export function createListAccessibility(options: {
  label?: string;
  setSize?: number;
  multiSelectable?: boolean;
  orientation?: AriaOrientation;
}): A2UIAccessibility {
  return {
    role: 'list',
    label: options.label,
    setSize: options.setSize,
    multiSelectable: options.multiSelectable,
    orientation: options.orientation,
  };
}

/**
 * Create accessibility attributes for a list item
 */
export function createListItemAccessibility(options: {
  posInSet: number;
  setSize: number;
  selected?: boolean;
}): A2UIAccessibility {
  return {
    role: 'listitem',
    posInSet: options.posInSet,
    setSize: options.setSize,
    selected: options.selected,
  };
}

/**
 * Create accessibility attributes for a heading
 */
export function createHeadingAccessibility(options: {
  level: 1 | 2 | 3 | 4 | 5 | 6;
}): A2UIAccessibility {
  return {
    role: 'heading',
    level: options.level,
  };
}

// ============================================================================
// Attribute Application
// ============================================================================

/**
 * Convert A2UIAccessibility to ARIA attribute map
 */
export function toAriaAttributes(accessibility: A2UIAccessibility): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {};

  // Core attributes
  if (accessibility.role !== undefined) {
    attrs['role'] = accessibility.role;
  }
  if (accessibility.label !== undefined) {
    attrs['aria-label'] = accessibility.label;
  }
  if (accessibility.labelledBy !== undefined) {
    attrs['aria-labelledby'] = accessibility.labelledBy;
  }
  if (accessibility.describedBy !== undefined) {
    attrs['aria-describedby'] = accessibility.describedBy;
  }

  // Live region attributes
  if (accessibility.live !== undefined) {
    attrs['aria-live'] = accessibility.live;
  }
  if (accessibility.atomic !== undefined) {
    attrs['aria-atomic'] = accessibility.atomic;
  }
  if (accessibility.relevant !== undefined) {
    attrs['aria-relevant'] = accessibility.relevant;
  }
  if (accessibility.busy !== undefined) {
    attrs['aria-busy'] = accessibility.busy;
  }

  // State attributes
  if (accessibility.hidden !== undefined) {
    attrs['aria-hidden'] = accessibility.hidden;
  }
  if (accessibility.disabled !== undefined) {
    attrs['aria-disabled'] = accessibility.disabled;
  }
  if (accessibility.expanded !== undefined) {
    attrs['aria-expanded'] = accessibility.expanded;
  }
  if (accessibility.selected !== undefined) {
    attrs['aria-selected'] = accessibility.selected;
  }
  if (accessibility.pressed !== undefined) {
    attrs['aria-pressed'] = accessibility.pressed;
  }
  if (accessibility.checked !== undefined) {
    attrs['aria-checked'] = accessibility.checked;
  }
  if (accessibility.required !== undefined) {
    attrs['aria-required'] = accessibility.required;
  }
  if (accessibility.invalid !== undefined) {
    attrs['aria-invalid'] = accessibility.invalid;
  }

  // Range attributes
  if (accessibility.valueMin !== undefined) {
    attrs['aria-valuemin'] = accessibility.valueMin;
  }
  if (accessibility.valueMax !== undefined) {
    attrs['aria-valuemax'] = accessibility.valueMax;
  }
  if (accessibility.valueNow !== undefined) {
    attrs['aria-valuenow'] = accessibility.valueNow;
  }
  if (accessibility.valueText !== undefined) {
    attrs['aria-valuetext'] = accessibility.valueText;
  }

  // Relationship attributes
  if (accessibility.owns !== undefined) {
    attrs['aria-owns'] = accessibility.owns;
  }
  if (accessibility.controls !== undefined) {
    attrs['aria-controls'] = accessibility.controls;
  }
  if (accessibility.flowTo !== undefined) {
    attrs['aria-flowto'] = accessibility.flowTo;
  }
  if (accessibility.errorMessage !== undefined) {
    attrs['aria-errormessage'] = accessibility.errorMessage;
  }
  if (accessibility.details !== undefined) {
    attrs['aria-details'] = accessibility.details;
  }

  // Widget attributes
  if (accessibility.autocomplete !== undefined) {
    attrs['aria-autocomplete'] = accessibility.autocomplete;
  }
  if (accessibility.hasPopup !== undefined) {
    attrs['aria-haspopup'] = accessibility.hasPopup;
  }
  if (accessibility.level !== undefined) {
    attrs['aria-level'] = accessibility.level;
  }
  if (accessibility.multiSelectable !== undefined) {
    attrs['aria-multiselectable'] = accessibility.multiSelectable;
  }
  if (accessibility.orientation !== undefined) {
    attrs['aria-orientation'] = accessibility.orientation;
  }
  if (accessibility.posInSet !== undefined) {
    attrs['aria-posinset'] = accessibility.posInSet;
  }
  if (accessibility.setSize !== undefined) {
    attrs['aria-setsize'] = accessibility.setSize;
  }
  if (accessibility.sort !== undefined) {
    attrs['aria-sort'] = accessibility.sort;
  }

  // Keyboard navigation
  if (accessibility.tabIndex !== undefined) {
    attrs['tabindex'] = accessibility.tabIndex;
  }

  return attrs;
}

/**
 * Merge accessibility attributes, with override taking precedence
 */
export function mergeAccessibility(
  base: A2UIAccessibility,
  override: Partial<A2UIAccessibility>
): A2UIAccessibility {
  return {
    ...base,
    ...override,
  };
}

/**
 * Apply default accessibility to component if not provided
 */
export function applyDefaultAccessibility(
  componentType: string,
  existing?: Partial<A2UIAccessibility>
): A2UIAccessibility {
  const defaults = getDefaultAccessibility(componentType);
  return mergeAccessibility(defaults, existing ?? {});
}

/**
 * Get default accessibility attributes for component type
 */
export function getDefaultAccessibility(componentType: string): A2UIAccessibility {
  switch (componentType) {
    case 'button':
      return { role: 'button', tabIndex: 0 };
    case 'checkBox':
      return { role: 'checkbox', tabIndex: 0 };
    case 'slider':
      return { role: 'slider', tabIndex: 0, orientation: 'horizontal' };
    case 'textField':
      return { role: 'textbox', tabIndex: 0 };
    case 'modal':
      return { role: 'dialog' };
    case 'tabs':
      return { role: 'tablist' };
    case 'list':
      return { role: 'list' };
    case 'row':
    case 'column':
      return { role: 'group' };
    case 'text':
      return {};
    case 'image':
      return { role: 'img' };
    case 'icon':
      return { role: 'img', hidden: true };
    case 'divider':
      return { role: 'separator' };
    case 'card':
      return { role: 'article' };
    case 'dateTimeInput':
      return { role: 'textbox', tabIndex: 0 };
    // QE Components
    case 'qe:coverageGauge':
      return { role: 'meter' };
    case 'qe:testStatusBadge':
      return { role: 'status' };
    case 'qe:qualityGateIndicator':
      return { role: 'status', live: 'polite' };
    case 'qe:vulnerabilityCard':
      return { role: 'article' };
    case 'qe:a11yFindingCard':
      return { role: 'article' };
    case 'qe:testTimeline':
      return { role: 'list' };
    case 'qe:defectDensityChart':
      return { role: 'img' };
    case 'qe:flakySummary':
      return { role: 'status' };
    default:
      return {};
  }
}

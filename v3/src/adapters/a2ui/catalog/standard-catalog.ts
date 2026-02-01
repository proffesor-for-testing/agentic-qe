/**
 * A2UI Standard Component Catalog
 *
 * Defines the 15 standard A2UI v0.8 components for cross-platform UI generation.
 * Reference: https://a2ui.org/concepts/components/
 *
 * @module adapters/a2ui/catalog/standard-catalog
 */

// ============================================================================
// BoundValue Types (Data Binding)
// ============================================================================

/**
 * Static literal value
 */
export interface LiteralValue<T> {
  /** Static value */
  readonly literalString: T;
}

/**
 * Dynamic path binding (JSON Pointer RFC 6901)
 */
export interface PathValue {
  /** JSON Pointer path to data model */
  readonly path: string;
}

/**
 * Combined value with static default and dynamic binding
 */
export interface CombinedValue<T> {
  /** Static default value */
  readonly literalString: T;
  /** JSON Pointer path for dynamic updates */
  readonly path: string;
}

/**
 * BoundValue - supports static, dynamic, or combined data binding
 */
export type BoundValue<T> = LiteralValue<T> | PathValue | CombinedValue<T>;

// ============================================================================
// Children Types
// ============================================================================

/**
 * Explicit list of child component IDs
 */
export interface ExplicitListChildren {
  /** Static list of component IDs */
  readonly explicitList: string[];
}

/**
 * Template for dynamic children generation
 */
export interface TemplateChildren {
  /** Template configuration */
  readonly template: {
    /** JSON Pointer path to array data */
    readonly dataBinding: string;
    /** Component ID to use as template */
    readonly componentId: string;
  };
}

/**
 * ComponentChildren - supports static or dynamic child rendering
 */
export type ComponentChildren = ExplicitListChildren | TemplateChildren;

// ============================================================================
// Accessibility Types
// ============================================================================

/**
 * Accessibility attributes for components
 */
export interface A2UIAccessibility {
  /** ARIA role */
  readonly role?: string;
  /** Accessible label (aria-label) */
  readonly label?: string;
  /** ID of element describing this component (aria-describedby) */
  readonly describedBy?: string;
  /** Live region behavior for dynamic content */
  readonly live?: 'off' | 'polite' | 'assertive';
  /** Whether the element is expanded (aria-expanded) */
  readonly expanded?: boolean;
  /** Whether the element is selected (aria-selected) */
  readonly selected?: boolean;
  /** Whether the element is disabled (aria-disabled) */
  readonly disabled?: boolean;
  /** Tab index for keyboard navigation */
  readonly tabIndex?: number;
}

// ============================================================================
// Action Types
// ============================================================================

/**
 * Action configuration for interactive components
 */
export interface ComponentAction {
  /** Action name/identifier */
  readonly name: string;
  /** Optional action parameters */
  readonly parameters?: Record<string, BoundValue<unknown>>;
}

// ============================================================================
// Layout Components
// ============================================================================

/**
 * Row component - horizontal layout container
 */
export interface RowComponent {
  readonly type: 'row';
  /** Child component IDs */
  readonly children: ComponentChildren;
  /** Spacing between children in pixels */
  readonly spacing?: number;
  /** Cross-axis alignment */
  readonly alignment?: 'start' | 'center' | 'end' | 'stretch';
  /** Main-axis alignment */
  readonly justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
  /** Whether to wrap children */
  readonly wrap?: boolean;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * Column component - vertical layout container
 */
export interface ColumnComponent {
  readonly type: 'column';
  /** Child component IDs */
  readonly children: ComponentChildren;
  /** Spacing between children in pixels */
  readonly spacing?: number;
  /** Cross-axis alignment */
  readonly alignment?: 'start' | 'center' | 'end' | 'stretch';
  /** Main-axis alignment */
  readonly justifyContent?: 'start' | 'center' | 'end' | 'space-between' | 'space-around' | 'space-evenly';
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * List component - scrollable list container
 */
export interface ListComponent {
  readonly type: 'list';
  /** Child component IDs (static or template-based) */
  readonly children: ComponentChildren;
  /** Template component ID for dynamic rendering */
  readonly itemTemplate?: string;
  /** List orientation */
  readonly orientation?: 'vertical' | 'horizontal';
  /** Spacing between items */
  readonly spacing?: number;
  /** Whether to show dividers between items */
  readonly showDividers?: boolean;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

// ============================================================================
// Display Components
// ============================================================================

/**
 * Text style options
 */
export type TextStyle = 'body' | 'heading' | 'caption' | 'code' | 'label';

/**
 * Text weight options
 */
export type TextWeight = 'normal' | 'bold' | 'light';

/**
 * Text component - displays text content
 */
export interface TextComponent {
  readonly type: 'text';
  /** Text content (static or bound) */
  readonly text: BoundValue<string>;
  /** Text style/semantic role */
  readonly style?: TextStyle;
  /** Font weight */
  readonly weight?: TextWeight;
  /** Text color (CSS color value) */
  readonly color?: BoundValue<string>;
  /** Maximum number of lines before truncation */
  readonly maxLines?: number;
  /** Whether text is selectable */
  readonly selectable?: boolean;
  /** Usage hint for semantic meaning */
  readonly usageHint?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'span';
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * Image component - displays images
 */
export interface ImageComponent {
  readonly type: 'image';
  /** Image source URL */
  readonly src: BoundValue<string>;
  /** Alternative text for accessibility */
  readonly alt: string;
  /** Image width in pixels */
  readonly width?: number;
  /** Image height in pixels */
  readonly height?: number;
  /** Object fit mode */
  readonly fit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  /** Placeholder while loading */
  readonly placeholder?: string;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * Icon size options
 */
export type IconSize = 'small' | 'medium' | 'large';

/**
 * Icon component - displays icons
 */
export interface IconComponent {
  readonly type: 'icon';
  /** Icon name from the icon set */
  readonly name: string;
  /** Icon size */
  readonly size?: IconSize;
  /** Icon color (CSS color value) */
  readonly color?: string;
  /** Accessible label for the icon */
  readonly ariaLabel?: string;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * Divider component - visual separator
 */
export interface DividerComponent {
  readonly type: 'divider';
  /** Divider orientation */
  readonly orientation?: 'horizontal' | 'vertical';
  /** Divider thickness in pixels */
  readonly thickness?: number;
  /** Divider color */
  readonly color?: string;
  /** Margin around divider */
  readonly margin?: number;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

// ============================================================================
// Interactive Components
// ============================================================================

/**
 * Button variant options
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'outlined' | 'text';

/**
 * Button component - clickable action trigger
 */
export interface ButtonComponent {
  readonly type: 'button';
  /** Button label text */
  readonly label: BoundValue<string>;
  /** Action to trigger on click */
  readonly action: ComponentAction | string;
  /** Button variant/style */
  readonly variant?: ButtonVariant;
  /** Whether the button is disabled */
  readonly disabled?: BoundValue<boolean>;
  /** Whether the button shows a loading state */
  readonly loading?: BoundValue<boolean>;
  /** Optional icon name */
  readonly icon?: string;
  /** Icon position */
  readonly iconPosition?: 'start' | 'end';
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * TextField input type options
 */
export type TextFieldInputType = 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';

/**
 * TextField component - text input field
 */
export interface TextFieldComponent {
  readonly type: 'textField';
  /** Current input value */
  readonly value: BoundValue<string>;
  /** Input label */
  readonly label?: string;
  /** Placeholder text */
  readonly placeholder?: string;
  /** Action to trigger on value change */
  readonly onChange?: string;
  /** Input type */
  readonly inputType?: TextFieldInputType;
  /** Whether input is required */
  readonly required?: boolean;
  /** Whether to allow multiple lines */
  readonly multiline?: boolean;
  /** Number of rows for multiline */
  readonly rows?: number;
  /** Maximum character length */
  readonly maxLength?: number;
  /** Whether the field is disabled */
  readonly disabled?: BoundValue<boolean>;
  /** Validation pattern (regex) */
  readonly pattern?: string;
  /** Validation error message */
  readonly validationMessage?: string;
  /** Helper text shown below the field */
  readonly helperText?: string;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * CheckBox component - boolean toggle
 */
export interface CheckBoxComponent {
  readonly type: 'checkBox';
  /** Whether the checkbox is checked */
  readonly checked: BoundValue<boolean>;
  /** Checkbox label */
  readonly label?: string;
  /** Action to trigger on change */
  readonly onChange?: string;
  /** Whether the checkbox is disabled */
  readonly disabled?: BoundValue<boolean>;
  /** Whether the checkbox is in indeterminate state */
  readonly indeterminate?: BoundValue<boolean>;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * DateTimeInput mode options
 */
export type DateTimeMode = 'date' | 'time' | 'datetime';

/**
 * DateTimeInput component - date/time picker
 */
export interface DateTimeInputComponent {
  readonly type: 'dateTimeInput';
  /** Current value (ISO 8601 format) */
  readonly value: BoundValue<string>;
  /** Input mode */
  readonly mode?: DateTimeMode;
  /** Enable date selection */
  readonly enableDate?: boolean;
  /** Enable time selection */
  readonly enableTime?: boolean;
  /** Minimum allowed date/time (ISO 8601) */
  readonly minDate?: string;
  /** Maximum allowed date/time (ISO 8601) */
  readonly maxDate?: string;
  /** Input label */
  readonly label?: string;
  /** Action to trigger on change */
  readonly onChange?: string;
  /** Whether the input is disabled */
  readonly disabled?: BoundValue<boolean>;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * Slider component - range input
 */
export interface SliderComponent {
  readonly type: 'slider';
  /** Current value */
  readonly value: BoundValue<number>;
  /** Minimum value */
  readonly min: number;
  /** Maximum value */
  readonly max: number;
  /** Step increment */
  readonly step?: number;
  /** Input label */
  readonly label?: string;
  /** Action to trigger on change */
  readonly onChange?: string;
  /** Whether the slider is disabled */
  readonly disabled?: BoundValue<boolean>;
  /** Show tick marks */
  readonly showTicks?: boolean;
  /** Show current value label */
  readonly showValue?: boolean;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

// ============================================================================
// Container Components
// ============================================================================

/**
 * Card component - elevated container
 */
export interface CardComponent {
  readonly type: 'card';
  /** Child component IDs */
  readonly children: ComponentChildren;
  /** Card title */
  readonly title?: BoundValue<string>;
  /** Card subtitle */
  readonly subtitle?: BoundValue<string>;
  /** Elevation level (0-5) */
  readonly elevation?: number;
  /** Whether the card is clickable */
  readonly clickable?: boolean;
  /** Action to trigger on click */
  readonly onClick?: string;
  /** Header image URL */
  readonly headerImage?: BoundValue<string>;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * Tab configuration
 */
export interface TabConfig {
  /** Tab label */
  readonly label: string;
  /** Content component ID */
  readonly content: string;
  /** Tab icon */
  readonly icon?: string;
  /** Whether the tab is disabled */
  readonly disabled?: boolean;
}

/**
 * Tabs component - tabbed container
 */
export interface TabsComponent {
  readonly type: 'tabs';
  /** Tab configurations */
  readonly tabs: TabConfig[];
  /** Selected tab index */
  readonly selectedIndex?: BoundValue<number>;
  /** Tab orientation */
  readonly orientation?: 'horizontal' | 'vertical';
  /** Action to trigger on tab change */
  readonly onTabChange?: string;
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

/**
 * Modal component - overlay dialog
 */
export interface ModalComponent {
  readonly type: 'modal';
  /** Child component IDs */
  readonly children: ComponentChildren;
  /** Modal title */
  readonly title?: string;
  /** Whether the modal is open */
  readonly open: BoundValue<boolean>;
  /** Action to trigger on close */
  readonly onClose?: string;
  /** Whether clicking backdrop closes the modal */
  readonly dismissible?: boolean;
  /** Modal size */
  readonly size?: 'small' | 'medium' | 'large' | 'fullscreen';
  /** Accessibility attributes */
  readonly accessibility?: A2UIAccessibility;
}

// ============================================================================
// Standard Component Types Union
// ============================================================================

/**
 * All standard A2UI component type names
 */
export type StandardComponentType =
  | 'row'
  | 'column'
  | 'list'
  | 'text'
  | 'image'
  | 'icon'
  | 'divider'
  | 'button'
  | 'textField'
  | 'checkBox'
  | 'dateTimeInput'
  | 'slider'
  | 'card'
  | 'tabs'
  | 'modal';

/**
 * Union of all standard A2UI component definitions
 */
export type StandardComponent =
  | RowComponent
  | ColumnComponent
  | ListComponent
  | TextComponent
  | ImageComponent
  | IconComponent
  | DividerComponent
  | ButtonComponent
  | TextFieldComponent
  | CheckBoxComponent
  | DateTimeInputComponent
  | SliderComponent
  | CardComponent
  | TabsComponent
  | ModalComponent;

// ============================================================================
// Standard Catalog Definition
// ============================================================================

/**
 * Component metadata for catalog
 */
export interface ComponentMetadata {
  /** Component type name */
  readonly type: string;
  /** Human-readable display name */
  readonly displayName: string;
  /** Component description */
  readonly description: string;
  /** Component category */
  readonly category: 'layout' | 'display' | 'interactive' | 'container';
  /** Required properties */
  readonly requiredProps: string[];
  /** Optional properties */
  readonly optionalProps: string[];
  /** Whether the component can have children */
  readonly hasChildren: boolean;
  /** Whether the component supports accessibility attributes */
  readonly supportsAccessibility: boolean;
}

/**
 * Standard A2UI catalog with metadata for all 15 components
 */
export const STANDARD_CATALOG: Record<StandardComponentType, ComponentMetadata> = {
  // Layout Components
  row: {
    type: 'row',
    displayName: 'Row',
    description: 'Horizontal layout container for arranging children in a row',
    category: 'layout',
    requiredProps: ['children'],
    optionalProps: ['spacing', 'alignment', 'justifyContent', 'wrap', 'accessibility'],
    hasChildren: true,
    supportsAccessibility: true,
  },
  column: {
    type: 'column',
    displayName: 'Column',
    description: 'Vertical layout container for arranging children in a column',
    category: 'layout',
    requiredProps: ['children'],
    optionalProps: ['spacing', 'alignment', 'justifyContent', 'accessibility'],
    hasChildren: true,
    supportsAccessibility: true,
  },
  list: {
    type: 'list',
    displayName: 'List',
    description: 'Scrollable list container with optional template-based rendering',
    category: 'layout',
    requiredProps: ['children'],
    optionalProps: ['itemTemplate', 'orientation', 'spacing', 'showDividers', 'accessibility'],
    hasChildren: true,
    supportsAccessibility: true,
  },

  // Display Components
  text: {
    type: 'text',
    displayName: 'Text',
    description: 'Displays text content with configurable style and formatting',
    category: 'display',
    requiredProps: ['text'],
    optionalProps: ['style', 'weight', 'color', 'maxLines', 'selectable', 'usageHint', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
  },
  image: {
    type: 'image',
    displayName: 'Image',
    description: 'Displays an image from a URL with accessibility support',
    category: 'display',
    requiredProps: ['src', 'alt'],
    optionalProps: ['width', 'height', 'fit', 'placeholder', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
  },
  icon: {
    type: 'icon',
    displayName: 'Icon',
    description: 'Displays an icon from the configured icon set',
    category: 'display',
    requiredProps: ['name'],
    optionalProps: ['size', 'color', 'ariaLabel', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
  },
  divider: {
    type: 'divider',
    displayName: 'Divider',
    description: 'Visual separator between content sections',
    category: 'display',
    requiredProps: [],
    optionalProps: ['orientation', 'thickness', 'color', 'margin', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
  },

  // Interactive Components
  button: {
    type: 'button',
    displayName: 'Button',
    description: 'Clickable button that triggers an action',
    category: 'interactive',
    requiredProps: ['label', 'action'],
    optionalProps: ['variant', 'disabled', 'loading', 'icon', 'iconPosition', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
  },
  textField: {
    type: 'textField',
    displayName: 'Text Field',
    description: 'Text input field with validation support',
    category: 'interactive',
    requiredProps: ['value'],
    optionalProps: [
      'label',
      'placeholder',
      'onChange',
      'inputType',
      'required',
      'multiline',
      'rows',
      'maxLength',
      'disabled',
      'pattern',
      'validationMessage',
      'helperText',
      'accessibility',
    ],
    hasChildren: false,
    supportsAccessibility: true,
  },
  checkBox: {
    type: 'checkBox',
    displayName: 'Checkbox',
    description: 'Boolean toggle checkbox with optional label',
    category: 'interactive',
    requiredProps: ['checked'],
    optionalProps: ['label', 'onChange', 'disabled', 'indeterminate', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
  },
  dateTimeInput: {
    type: 'dateTimeInput',
    displayName: 'Date/Time Input',
    description: 'Date and/or time picker input',
    category: 'interactive',
    requiredProps: ['value'],
    optionalProps: ['mode', 'enableDate', 'enableTime', 'minDate', 'maxDate', 'label', 'onChange', 'disabled', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
  },
  slider: {
    type: 'slider',
    displayName: 'Slider',
    description: 'Range slider for numeric value selection',
    category: 'interactive',
    requiredProps: ['value', 'min', 'max'],
    optionalProps: ['step', 'label', 'onChange', 'disabled', 'showTicks', 'showValue', 'accessibility'],
    hasChildren: false,
    supportsAccessibility: true,
  },

  // Container Components
  card: {
    type: 'card',
    displayName: 'Card',
    description: 'Elevated container for grouping related content',
    category: 'container',
    requiredProps: ['children'],
    optionalProps: ['title', 'subtitle', 'elevation', 'clickable', 'onClick', 'headerImage', 'accessibility'],
    hasChildren: true,
    supportsAccessibility: true,
  },
  tabs: {
    type: 'tabs',
    displayName: 'Tabs',
    description: 'Tabbed container for organizing content into sections',
    category: 'container',
    requiredProps: ['tabs'],
    optionalProps: ['selectedIndex', 'orientation', 'onTabChange', 'accessibility'],
    hasChildren: true,
    supportsAccessibility: true,
  },
  modal: {
    type: 'modal',
    displayName: 'Modal',
    description: 'Overlay dialog for focused interactions',
    category: 'container',
    requiredProps: ['children', 'open'],
    optionalProps: ['title', 'onClose', 'dismissible', 'size', 'accessibility'],
    hasChildren: true,
    supportsAccessibility: true,
  },
};

/**
 * List of all standard component type names
 */
export const STANDARD_COMPONENT_TYPES: StandardComponentType[] = [
  'row',
  'column',
  'list',
  'text',
  'image',
  'icon',
  'divider',
  'button',
  'textField',
  'checkBox',
  'dateTimeInput',
  'slider',
  'card',
  'tabs',
  'modal',
];

/**
 * Components by category
 */
export const COMPONENTS_BY_CATEGORY: Record<string, StandardComponentType[]> = {
  layout: ['row', 'column', 'list'],
  display: ['text', 'image', 'icon', 'divider'],
  interactive: ['button', 'textField', 'checkBox', 'dateTimeInput', 'slider'],
  container: ['card', 'tabs', 'modal'],
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a LiteralValue
 */
export function isLiteralValue<T>(value: unknown): value is LiteralValue<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'literalString' in value &&
    !('path' in value)
  );
}

/**
 * Check if a value is a PathValue
 */
export function isPathValue(value: unknown): value is PathValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    !('literalString' in value)
  );
}

/**
 * Check if a value is a CombinedValue
 */
export function isCombinedValue<T>(value: unknown): value is CombinedValue<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'literalString' in value &&
    'path' in value
  );
}

/**
 * Check if a value is a BoundValue
 */
export function isBoundValue<T>(value: unknown): value is BoundValue<T> {
  return isLiteralValue(value) || isPathValue(value) || isCombinedValue(value);
}

/**
 * Check if children is an ExplicitListChildren
 */
export function isExplicitListChildren(children: unknown): children is ExplicitListChildren {
  return (
    typeof children === 'object' &&
    children !== null &&
    'explicitList' in children &&
    Array.isArray((children as ExplicitListChildren).explicitList)
  );
}

/**
 * Check if children is a TemplateChildren
 */
export function isTemplateChildren(children: unknown): children is TemplateChildren {
  return (
    typeof children === 'object' &&
    children !== null &&
    'template' in children &&
    typeof (children as TemplateChildren).template === 'object'
  );
}

/**
 * Check if a type is a standard component type
 */
export function isStandardComponentType(type: unknown): type is StandardComponentType {
  return typeof type === 'string' && STANDARD_COMPONENT_TYPES.includes(type as StandardComponentType);
}

/**
 * Check if a component is a layout component
 */
export function isLayoutComponent(type: string): boolean {
  return COMPONENTS_BY_CATEGORY.layout.includes(type as StandardComponentType);
}

/**
 * Check if a component is a display component
 */
export function isDisplayComponent(type: string): boolean {
  return COMPONENTS_BY_CATEGORY.display.includes(type as StandardComponentType);
}

/**
 * Check if a component is an interactive component
 */
export function isInteractiveComponent(type: string): boolean {
  return COMPONENTS_BY_CATEGORY.interactive.includes(type as StandardComponentType);
}

/**
 * Check if a component is a container component
 */
export function isContainerComponent(type: string): boolean {
  return COMPONENTS_BY_CATEGORY.container.includes(type as StandardComponentType);
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a static BoundValue
 */
export function createLiteralValue<T>(value: T): LiteralValue<T> {
  return { literalString: value };
}

/**
 * Create a dynamic BoundValue
 */
export function createPathValue(path: string): PathValue {
  return { path };
}

/**
 * Create a combined BoundValue with default and binding
 */
export function createCombinedValue<T>(defaultValue: T, path: string): CombinedValue<T> {
  return { literalString: defaultValue, path };
}

/**
 * Create ExplicitListChildren
 */
export function createExplicitListChildren(componentIds: string[]): ExplicitListChildren {
  return { explicitList: componentIds };
}

/**
 * Create TemplateChildren
 */
export function createTemplateChildren(dataBinding: string, componentId: string): TemplateChildren {
  return {
    template: {
      dataBinding,
      componentId,
    },
  };
}

/**
 * Create a ComponentAction
 */
export function createAction(name: string, parameters?: Record<string, BoundValue<unknown>>): ComponentAction {
  return parameters ? { name, parameters } : { name };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get component metadata by type
 */
export function getComponentMetadata(type: StandardComponentType): ComponentMetadata | undefined {
  return STANDARD_CATALOG[type];
}

/**
 * Get all components in a category
 */
export function getComponentsByCategory(category: string): StandardComponentType[] {
  return COMPONENTS_BY_CATEGORY[category] || [];
}

/**
 * Get component category by type
 */
export function getComponentCategory(type: StandardComponentType): string | undefined {
  const metadata = getComponentMetadata(type);
  return metadata?.category;
}

/**
 * Check if a component type supports children
 */
export function componentHasChildren(type: StandardComponentType): boolean {
  const metadata = getComponentMetadata(type);
  return metadata?.hasChildren ?? false;
}

/**
 * Get required properties for a component type
 */
export function getRequiredProps(type: StandardComponentType): string[] {
  const metadata = getComponentMetadata(type);
  return metadata?.requiredProps ?? [];
}

/**
 * Get optional properties for a component type
 */
export function getOptionalProps(type: StandardComponentType): string[] {
  const metadata = getComponentMetadata(type);
  return metadata?.optionalProps ?? [];
}

/**
 * Get all properties for a component type
 */
export function getAllProps(type: StandardComponentType): string[] {
  const metadata = getComponentMetadata(type);
  if (!metadata) return [];
  return [...metadata.requiredProps, ...metadata.optionalProps];
}

/**
 * Resolve a BoundValue to its static value (if available)
 */
export function getStaticValue<T>(boundValue: BoundValue<T>): T | undefined {
  if (isLiteralValue<T>(boundValue) || isCombinedValue<T>(boundValue)) {
    return boundValue.literalString as T;
  }
  return undefined;
}

/**
 * Get the path from a BoundValue (if available)
 */
export function getBindingPath(boundValue: BoundValue<unknown>): string | undefined {
  if (isPathValue(boundValue) || isCombinedValue(boundValue)) {
    return boundValue.path;
  }
  return undefined;
}

/**
 * A2UI Component JSON Schemas
 *
 * JSON Schema definitions for validating A2UI components.
 * Provides schema validation for both standard and QE-specific components.
 *
 * @module adapters/a2ui/catalog/component-schemas
 */

import type { StandardComponentType } from './standard-catalog.js';
import type { QEComponentType } from './qe-catalog.js';

// ============================================================================
// JSON Schema Types
// ============================================================================

/**
 * JSON Schema definition type
 */
export interface JSONSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly $ref?: string;
  readonly type?: string | string[];
  readonly properties?: Record<string, JSONSchema>;
  readonly required?: string[];
  readonly additionalProperties?: boolean | JSONSchema;
  readonly items?: JSONSchema | JSONSchema[];
  readonly oneOf?: JSONSchema[];
  readonly anyOf?: JSONSchema[];
  readonly allOf?: JSONSchema[];
  readonly enum?: unknown[];
  readonly const?: unknown;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly pattern?: string;
  readonly format?: string;
  readonly description?: string;
  readonly default?: unknown;
  readonly definitions?: Record<string, JSONSchema>;
  readonly $defs?: Record<string, JSONSchema>;
}

// ============================================================================
// Shared Schema Definitions
// ============================================================================

/**
 * BoundValue schema - supports static, dynamic, or combined binding
 */
export const BOUND_VALUE_SCHEMA: JSONSchema = {
  description: 'A value that can be static, dynamic (bound to data model), or combined',
  oneOf: [
    {
      type: 'object',
      description: 'Static literal value',
      properties: {
        literalString: {},
      },
      required: ['literalString'],
      additionalProperties: false,
    },
    {
      type: 'object',
      description: 'Dynamic path binding (JSON Pointer RFC 6901)',
      properties: {
        path: {
          type: 'string',
          pattern: '^/',
          description: 'JSON Pointer path to data model',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    {
      type: 'object',
      description: 'Combined value with default and dynamic binding',
      properties: {
        literalString: {},
        path: {
          type: 'string',
          pattern: '^/',
        },
      },
      required: ['literalString', 'path'],
      additionalProperties: false,
    },
  ],
};

/**
 * String BoundValue schema
 */
export const BOUND_STRING_SCHEMA: JSONSchema = {
  ...BOUND_VALUE_SCHEMA,
  description: 'A string value that can be static or dynamic',
};

/**
 * Number BoundValue schema
 */
export const BOUND_NUMBER_SCHEMA: JSONSchema = {
  ...BOUND_VALUE_SCHEMA,
  description: 'A number value that can be static or dynamic',
};

/**
 * Boolean BoundValue schema
 */
export const BOUND_BOOLEAN_SCHEMA: JSONSchema = {
  ...BOUND_VALUE_SCHEMA,
  description: 'A boolean value that can be static or dynamic',
};

/**
 * Component children schema
 */
export const COMPONENT_CHILDREN_SCHEMA: JSONSchema = {
  description: 'Component children - static list or dynamic template',
  oneOf: [
    {
      type: 'object',
      description: 'Explicit list of child component IDs',
      properties: {
        explicitList: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of component IDs',
        },
      },
      required: ['explicitList'],
      additionalProperties: false,
    },
    {
      type: 'object',
      description: 'Template for dynamic children generation',
      properties: {
        template: {
          type: 'object',
          properties: {
            dataBinding: {
              type: 'string',
              pattern: '^/',
              description: 'JSON Pointer path to array data',
            },
            componentId: {
              type: 'string',
              description: 'Component ID to use as template',
            },
          },
          required: ['dataBinding', 'componentId'],
          additionalProperties: false,
        },
      },
      required: ['template'],
      additionalProperties: false,
    },
  ],
};

/**
 * Accessibility attributes schema
 */
export const ACCESSIBILITY_SCHEMA: JSONSchema = {
  type: 'object',
  description: 'Accessibility attributes for components',
  properties: {
    role: { type: 'string', description: 'ARIA role' },
    label: { type: 'string', description: 'Accessible label (aria-label)' },
    describedBy: { type: 'string', description: 'ID of element describing this component' },
    live: {
      type: 'string',
      enum: ['off', 'polite', 'assertive'],
      description: 'Live region behavior',
    },
    expanded: { type: 'boolean', description: 'Whether the element is expanded' },
    selected: { type: 'boolean', description: 'Whether the element is selected' },
    disabled: { type: 'boolean', description: 'Whether the element is disabled' },
    tabIndex: { type: 'number', description: 'Tab index for keyboard navigation' },
  },
  additionalProperties: false,
};

/**
 * Component action schema
 */
export const ACTION_SCHEMA: JSONSchema = {
  description: 'Action configuration for interactive components',
  oneOf: [
    { type: 'string', description: 'Simple action name' },
    {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Action name' },
        parameters: {
          type: 'object',
          description: 'Action parameters',
          additionalProperties: BOUND_VALUE_SCHEMA,
        },
      },
      required: ['name'],
      additionalProperties: false,
    },
  ],
};

// ============================================================================
// Standard Component Schemas
// ============================================================================

/**
 * Row component schema
 */
export const ROW_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/row',
  type: 'object',
  description: 'Horizontal layout container',
  properties: {
    type: { const: 'row' },
    children: COMPONENT_CHILDREN_SCHEMA,
    spacing: { type: 'number', minimum: 0, description: 'Spacing between children in pixels' },
    alignment: {
      type: 'string',
      enum: ['start', 'center', 'end', 'stretch'],
      description: 'Cross-axis alignment',
    },
    justifyContent: {
      type: 'string',
      enum: ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'],
      description: 'Main-axis alignment',
    },
    wrap: { type: 'boolean', description: 'Whether to wrap children' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'children'],
  additionalProperties: false,
};

/**
 * Column component schema
 */
export const COLUMN_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/column',
  type: 'object',
  description: 'Vertical layout container',
  properties: {
    type: { const: 'column' },
    children: COMPONENT_CHILDREN_SCHEMA,
    spacing: { type: 'number', minimum: 0, description: 'Spacing between children in pixels' },
    alignment: {
      type: 'string',
      enum: ['start', 'center', 'end', 'stretch'],
      description: 'Cross-axis alignment',
    },
    justifyContent: {
      type: 'string',
      enum: ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'],
      description: 'Main-axis alignment',
    },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'children'],
  additionalProperties: false,
};

/**
 * List component schema
 */
export const LIST_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/list',
  type: 'object',
  description: 'Scrollable list container',
  properties: {
    type: { const: 'list' },
    children: COMPONENT_CHILDREN_SCHEMA,
    itemTemplate: { type: 'string', description: 'Template component ID' },
    orientation: {
      type: 'string',
      enum: ['vertical', 'horizontal'],
      default: 'vertical',
    },
    spacing: { type: 'number', minimum: 0 },
    showDividers: { type: 'boolean' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'children'],
  additionalProperties: false,
};

/**
 * Text component schema
 */
export const TEXT_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/text',
  type: 'object',
  description: 'Text display component',
  properties: {
    type: { const: 'text' },
    text: BOUND_STRING_SCHEMA,
    style: {
      type: 'string',
      enum: ['body', 'heading', 'caption', 'code', 'label'],
    },
    weight: {
      type: 'string',
      enum: ['normal', 'bold', 'light'],
    },
    color: BOUND_STRING_SCHEMA,
    maxLines: { type: 'number', minimum: 1 },
    selectable: { type: 'boolean' },
    usageHint: {
      type: 'string',
      enum: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'],
    },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'text'],
  additionalProperties: false,
};

/**
 * Image component schema
 */
export const IMAGE_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/image',
  type: 'object',
  description: 'Image display component',
  properties: {
    type: { const: 'image' },
    src: BOUND_STRING_SCHEMA,
    alt: { type: 'string', description: 'Alternative text for accessibility' },
    width: { type: 'number', minimum: 0 },
    height: { type: 'number', minimum: 0 },
    fit: {
      type: 'string',
      enum: ['contain', 'cover', 'fill', 'none', 'scale-down'],
    },
    placeholder: { type: 'string' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'src', 'alt'],
  additionalProperties: false,
};

/**
 * Icon component schema
 */
export const ICON_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/icon',
  type: 'object',
  description: 'Icon display component',
  properties: {
    type: { const: 'icon' },
    name: { type: 'string', description: 'Icon name from the icon set' },
    size: { type: 'string', enum: ['small', 'medium', 'large'] },
    color: { type: 'string' },
    ariaLabel: { type: 'string' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'name'],
  additionalProperties: false,
};

/**
 * Divider component schema
 */
export const DIVIDER_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/divider',
  type: 'object',
  description: 'Visual separator',
  properties: {
    type: { const: 'divider' },
    orientation: {
      type: 'string',
      enum: ['horizontal', 'vertical'],
      default: 'horizontal',
    },
    thickness: { type: 'number', minimum: 0 },
    color: { type: 'string' },
    margin: { type: 'number', minimum: 0 },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type'],
  additionalProperties: false,
};

/**
 * Button component schema
 */
export const BUTTON_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/button',
  type: 'object',
  description: 'Clickable button component',
  properties: {
    type: { const: 'button' },
    label: BOUND_STRING_SCHEMA,
    action: ACTION_SCHEMA,
    variant: {
      type: 'string',
      enum: ['primary', 'secondary', 'danger', 'outlined', 'text'],
    },
    disabled: BOUND_BOOLEAN_SCHEMA,
    loading: BOUND_BOOLEAN_SCHEMA,
    icon: { type: 'string' },
    iconPosition: { type: 'string', enum: ['start', 'end'] },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'label', 'action'],
  additionalProperties: false,
};

/**
 * TextField component schema
 */
export const TEXT_FIELD_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/textField',
  type: 'object',
  description: 'Text input field',
  properties: {
    type: { const: 'textField' },
    value: BOUND_STRING_SCHEMA,
    label: { type: 'string' },
    placeholder: { type: 'string' },
    onChange: { type: 'string' },
    inputType: {
      type: 'string',
      enum: ['text', 'email', 'password', 'number', 'tel', 'url', 'search'],
    },
    required: { type: 'boolean' },
    multiline: { type: 'boolean' },
    rows: { type: 'number', minimum: 1 },
    maxLength: { type: 'number', minimum: 0 },
    disabled: BOUND_BOOLEAN_SCHEMA,
    pattern: { type: 'string' },
    validationMessage: { type: 'string' },
    helperText: { type: 'string' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'value'],
  additionalProperties: false,
};

/**
 * CheckBox component schema
 */
export const CHECKBOX_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/checkBox',
  type: 'object',
  description: 'Boolean toggle checkbox',
  properties: {
    type: { const: 'checkBox' },
    checked: BOUND_BOOLEAN_SCHEMA,
    label: { type: 'string' },
    onChange: { type: 'string' },
    disabled: BOUND_BOOLEAN_SCHEMA,
    indeterminate: BOUND_BOOLEAN_SCHEMA,
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'checked'],
  additionalProperties: false,
};

/**
 * DateTimeInput component schema
 */
export const DATE_TIME_INPUT_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/dateTimeInput',
  type: 'object',
  description: 'Date/time picker input',
  properties: {
    type: { const: 'dateTimeInput' },
    value: BOUND_STRING_SCHEMA,
    mode: { type: 'string', enum: ['date', 'time', 'datetime'] },
    enableDate: { type: 'boolean' },
    enableTime: { type: 'boolean' },
    minDate: { type: 'string', format: 'date-time' },
    maxDate: { type: 'string', format: 'date-time' },
    label: { type: 'string' },
    onChange: { type: 'string' },
    disabled: BOUND_BOOLEAN_SCHEMA,
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'value'],
  additionalProperties: false,
};

/**
 * Slider component schema
 */
export const SLIDER_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/slider',
  type: 'object',
  description: 'Range slider input',
  properties: {
    type: { const: 'slider' },
    value: BOUND_NUMBER_SCHEMA,
    min: { type: 'number' },
    max: { type: 'number' },
    step: { type: 'number', minimum: 0 },
    label: { type: 'string' },
    onChange: { type: 'string' },
    disabled: BOUND_BOOLEAN_SCHEMA,
    showTicks: { type: 'boolean' },
    showValue: { type: 'boolean' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'value', 'min', 'max'],
  additionalProperties: false,
};

/**
 * Card component schema
 */
export const CARD_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/card',
  type: 'object',
  description: 'Elevated container card',
  properties: {
    type: { const: 'card' },
    children: COMPONENT_CHILDREN_SCHEMA,
    title: BOUND_STRING_SCHEMA,
    subtitle: BOUND_STRING_SCHEMA,
    elevation: { type: 'number', minimum: 0, maximum: 5 },
    clickable: { type: 'boolean' },
    onClick: { type: 'string' },
    headerImage: BOUND_STRING_SCHEMA,
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'children'],
  additionalProperties: false,
};

/**
 * Tab configuration schema
 */
export const TAB_CONFIG_SCHEMA: JSONSchema = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    content: { type: 'string' },
    icon: { type: 'string' },
    disabled: { type: 'boolean' },
  },
  required: ['label', 'content'],
  additionalProperties: false,
};

/**
 * Tabs component schema
 */
export const TABS_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/tabs',
  type: 'object',
  description: 'Tabbed container',
  properties: {
    type: { const: 'tabs' },
    tabs: {
      type: 'array',
      items: TAB_CONFIG_SCHEMA,
      minItems: 1,
    },
    selectedIndex: BOUND_NUMBER_SCHEMA,
    orientation: {
      type: 'string',
      enum: ['horizontal', 'vertical'],
    },
    onTabChange: { type: 'string' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'tabs'],
  additionalProperties: false,
};

/**
 * Modal component schema
 */
export const MODAL_SCHEMA: JSONSchema = {
  $id: 'https://a2ui.org/schemas/components/modal',
  type: 'object',
  description: 'Overlay dialog',
  properties: {
    type: { const: 'modal' },
    children: COMPONENT_CHILDREN_SCHEMA,
    title: { type: 'string' },
    open: BOUND_BOOLEAN_SCHEMA,
    onClose: { type: 'string' },
    dismissible: { type: 'boolean' },
    size: {
      type: 'string',
      enum: ['small', 'medium', 'large', 'fullscreen'],
    },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'children', 'open'],
  additionalProperties: false,
};

// ============================================================================
// QE Component Schemas
// ============================================================================

/**
 * CoverageGauge component schema
 */
export const COVERAGE_GAUGE_SCHEMA: JSONSchema = {
  $id: 'https://aqe.io/schemas/components/coverageGauge',
  type: 'object',
  description: 'Circular gauge showing coverage percentage',
  properties: {
    type: { const: 'qe:coverageGauge' },
    coverage: BOUND_NUMBER_SCHEMA,
    target: { type: 'number', minimum: 0, maximum: 100 },
    showLabel: { type: 'boolean' },
    size: { type: 'string', enum: ['small', 'medium', 'large'] },
    colorScheme: { type: 'string', enum: ['default', 'traffic-light', 'monochrome'] },
    label: BOUND_STRING_SCHEMA,
    coverageType: {
      type: 'string',
      enum: ['line', 'branch', 'function', 'statement', 'overall'],
    },
    animated: { type: 'boolean' },
    showTrend: { type: 'boolean' },
    previousCoverage: BOUND_NUMBER_SCHEMA,
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'coverage'],
  additionalProperties: false,
};

/**
 * TestStatusBadge component schema
 */
export const TEST_STATUS_BADGE_SCHEMA: JSONSchema = {
  $id: 'https://aqe.io/schemas/components/testStatusBadge',
  type: 'object',
  description: 'Badge showing test execution status',
  properties: {
    type: { const: 'qe:testStatusBadge' },
    status: {
      oneOf: [
        { type: 'string', enum: ['passed', 'failed', 'skipped', 'running', 'pending'] },
        BOUND_VALUE_SCHEMA,
      ],
    },
    count: BOUND_NUMBER_SCHEMA,
    duration: BOUND_NUMBER_SCHEMA,
    size: { type: 'string', enum: ['small', 'medium', 'large'] },
    showCount: { type: 'boolean' },
    showDuration: { type: 'boolean' },
    showIcon: { type: 'boolean' },
    onClick: { type: 'string' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'status'],
  additionalProperties: false,
};

/**
 * VulnerabilityCard component schema
 */
export const VULNERABILITY_CARD_SCHEMA: JSONSchema = {
  $id: 'https://aqe.io/schemas/components/vulnerabilityCard',
  type: 'object',
  description: 'Card displaying security vulnerability details',
  properties: {
    type: { const: 'qe:vulnerabilityCard' },
    severity: {
      oneOf: [
        { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
        BOUND_VALUE_SCHEMA,
      ],
    },
    title: BOUND_STRING_SCHEMA,
    cveId: BOUND_STRING_SCHEMA,
    description: BOUND_STRING_SCHEMA,
    details: BOUND_VALUE_SCHEMA,
    remediation: BOUND_STRING_SCHEMA,
    expandable: { type: 'boolean' },
    expanded: BOUND_BOOLEAN_SCHEMA,
    actionLabel: { type: 'string' },
    onAction: { type: 'string' },
    onDismiss: { type: 'string' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'severity', 'title'],
  additionalProperties: false,
};

/**
 * QualityGateIndicator component schema
 */
export const QUALITY_GATE_INDICATOR_SCHEMA: JSONSchema = {
  $id: 'https://aqe.io/schemas/components/qualityGateIndicator',
  type: 'object',
  description: 'Traffic light indicator for quality gates',
  properties: {
    type: { const: 'qe:qualityGateIndicator' },
    status: {
      oneOf: [
        { type: 'string', enum: ['passed', 'failed', 'warning', 'unknown'] },
        BOUND_VALUE_SCHEMA,
      ],
    },
    metrics: BOUND_VALUE_SCHEMA,
    name: BOUND_STRING_SCHEMA,
    showMetrics: { type: 'boolean' },
    showValues: { type: 'boolean' },
    style: { type: 'string', enum: ['traffic-light', 'badge', 'detailed'] },
    onClick: { type: 'string' },
    lastEvaluated: BOUND_STRING_SCHEMA,
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'status', 'metrics'],
  additionalProperties: false,
};

/**
 * A11yFindingCard component schema
 */
export const A11Y_FINDING_CARD_SCHEMA: JSONSchema = {
  $id: 'https://aqe.io/schemas/components/a11yFindingCard',
  type: 'object',
  description: 'Card for accessibility violations',
  properties: {
    type: { const: 'qe:a11yFindingCard' },
    wcagLevel: {
      oneOf: [{ type: 'string', enum: ['A', 'AA', 'AAA'] }, BOUND_VALUE_SCHEMA],
    },
    rule: BOUND_STRING_SCHEMA,
    element: BOUND_STRING_SCHEMA,
    impact: {
      oneOf: [
        { type: 'string', enum: ['critical', 'serious', 'moderate', 'minor'] },
        BOUND_VALUE_SCHEMA,
      ],
    },
    description: BOUND_STRING_SCHEMA,
    details: BOUND_VALUE_SCHEMA,
    expandable: { type: 'boolean' },
    expanded: BOUND_BOOLEAN_SCHEMA,
    suggestion: BOUND_STRING_SCHEMA,
    helpUrl: BOUND_STRING_SCHEMA,
    onAction: { type: 'string' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'wcagLevel', 'rule', 'impact'],
  additionalProperties: false,
};

/**
 * TestTimeline component schema
 */
export const TEST_TIMELINE_SCHEMA: JSONSchema = {
  $id: 'https://aqe.io/schemas/components/testTimeline',
  type: 'object',
  description: 'Timeline visualization of test execution',
  properties: {
    type: { const: 'qe:testTimeline' },
    events: BOUND_VALUE_SCHEMA,
    duration: BOUND_NUMBER_SCHEMA,
    startTime: BOUND_STRING_SCHEMA,
    endTime: BOUND_STRING_SCHEMA,
    showLabels: { type: 'boolean' },
    showDuration: { type: 'boolean' },
    orientation: { type: 'string', enum: ['horizontal', 'vertical'] },
    onEventClick: { type: 'string' },
    zoom: BOUND_NUMBER_SCHEMA,
    filterStatus: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['passed', 'failed', 'skipped', 'running', 'pending'],
      },
    },
    groupBySuite: { type: 'boolean' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'events'],
  additionalProperties: false,
};

/**
 * DefectDensityChart component schema
 */
export const DEFECT_DENSITY_CHART_SCHEMA: JSONSchema = {
  $id: 'https://aqe.io/schemas/components/defectDensityChart',
  type: 'object',
  description: 'Visualization of defect density metrics',
  properties: {
    type: { const: 'qe:defectDensityChart' },
    data: BOUND_VALUE_SCHEMA,
    chartType: { type: 'string', enum: ['bar', 'heatmap', 'treemap'] },
    title: BOUND_STRING_SCHEMA,
    colorScheme: { type: 'string', enum: ['default', 'severity', 'monochrome'] },
    showValues: { type: 'boolean' },
    onModuleClick: { type: 'string' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'data'],
  additionalProperties: false,
};

/**
 * FlakySummary component schema
 */
export const FLAKY_SUMMARY_SCHEMA: JSONSchema = {
  $id: 'https://aqe.io/schemas/components/flakySummary',
  type: 'object',
  description: 'Summary of flaky test analysis',
  properties: {
    type: { const: 'qe:flakySummary' },
    flakyCount: BOUND_NUMBER_SCHEMA,
    totalTests: BOUND_NUMBER_SCHEMA,
    topFlaky: BOUND_VALUE_SCHEMA,
    showTopFlaky: { type: 'boolean' },
    topCount: { type: 'number', minimum: 1 },
    onTestClick: { type: 'string' },
    accessibility: ACCESSIBILITY_SCHEMA,
  },
  required: ['type', 'flakyCount', 'totalTests'],
  additionalProperties: false,
};

// ============================================================================
// Schema Registry
// ============================================================================

/**
 * All standard component schemas
 */
export const STANDARD_COMPONENT_SCHEMAS: Record<StandardComponentType, JSONSchema> = {
  row: ROW_SCHEMA,
  column: COLUMN_SCHEMA,
  list: LIST_SCHEMA,
  text: TEXT_SCHEMA,
  image: IMAGE_SCHEMA,
  icon: ICON_SCHEMA,
  divider: DIVIDER_SCHEMA,
  button: BUTTON_SCHEMA,
  textField: TEXT_FIELD_SCHEMA,
  checkBox: CHECKBOX_SCHEMA,
  dateTimeInput: DATE_TIME_INPUT_SCHEMA,
  slider: SLIDER_SCHEMA,
  card: CARD_SCHEMA,
  tabs: TABS_SCHEMA,
  modal: MODAL_SCHEMA,
};

/**
 * All QE component schemas
 */
export const QE_COMPONENT_SCHEMAS: Record<QEComponentType, JSONSchema> = {
  'qe:coverageGauge': COVERAGE_GAUGE_SCHEMA,
  'qe:testStatusBadge': TEST_STATUS_BADGE_SCHEMA,
  'qe:vulnerabilityCard': VULNERABILITY_CARD_SCHEMA,
  'qe:qualityGateIndicator': QUALITY_GATE_INDICATOR_SCHEMA,
  'qe:a11yFindingCard': A11Y_FINDING_CARD_SCHEMA,
  'qe:testTimeline': TEST_TIMELINE_SCHEMA,
  'qe:defectDensityChart': DEFECT_DENSITY_CHART_SCHEMA,
  'qe:flakySummary': FLAKY_SUMMARY_SCHEMA,
};

/**
 * Combined catalog of all component schemas
 */
export const ALL_COMPONENT_SCHEMAS: Record<string, JSONSchema> = {
  ...STANDARD_COMPONENT_SCHEMAS,
  ...QE_COMPONENT_SCHEMAS,
};

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validation error details
 */
export interface ValidationError {
  /** Error path in the component */
  readonly path: string;
  /** Error message */
  readonly message: string;
  /** Error code */
  readonly code: string;
  /** Expected value/type */
  readonly expected?: string;
  /** Actual value/type */
  readonly actual?: string;
}

/**
 * Validation result
 */
export interface ComponentValidationResult {
  /** Whether the component is valid */
  readonly valid: boolean;
  /** List of validation errors */
  readonly errors: ValidationError[];
  /** Component type that was validated */
  readonly componentType: string;
}

/**
 * Check if a value matches a JSON schema type
 */
function matchesType(value: unknown, type: string | string[]): boolean {
  const actualType = typeof value;
  const types = Array.isArray(type) ? type : [type];

  return types.some((t) => {
    if (t === 'array') return Array.isArray(value);
    if (t === 'null') return value === null;
    if (t === 'integer') return Number.isInteger(value);
    return actualType === t;
  });
}

/**
 * Validate a BoundValue
 */
function validateBoundValue(value: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof value !== 'object' || value === null) {
    errors.push({
      path,
      message: 'BoundValue must be an object',
      code: 'INVALID_BOUND_VALUE',
      expected: 'object',
      actual: typeof value,
    });
    return errors;
  }

  const obj = value as Record<string, unknown>;
  const hasLiteralString = 'literalString' in obj;
  const hasPath = 'path' in obj;

  if (!hasLiteralString && !hasPath) {
    errors.push({
      path,
      message: 'BoundValue must have either literalString or path property',
      code: 'MISSING_BOUND_VALUE_PROPERTY',
    });
  }

  if (hasPath && typeof obj.path !== 'string') {
    errors.push({
      path: `${path}.path`,
      message: 'path must be a string',
      code: 'INVALID_PATH_TYPE',
      expected: 'string',
      actual: typeof obj.path,
    });
  }

  if (hasPath && typeof obj.path === 'string' && !obj.path.startsWith('/')) {
    errors.push({
      path: `${path}.path`,
      message: 'path must be a valid JSON Pointer starting with /',
      code: 'INVALID_JSON_POINTER',
      actual: obj.path,
    });
  }

  return errors;
}

/**
 * Validate component children
 */
function validateChildren(children: unknown, path: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof children !== 'object' || children === null) {
    errors.push({
      path,
      message: 'children must be an object',
      code: 'INVALID_CHILDREN',
      expected: 'object',
      actual: typeof children,
    });
    return errors;
  }

  const obj = children as Record<string, unknown>;

  if ('explicitList' in obj) {
    if (!Array.isArray(obj.explicitList)) {
      errors.push({
        path: `${path}.explicitList`,
        message: 'explicitList must be an array',
        code: 'INVALID_EXPLICIT_LIST',
        expected: 'array',
        actual: typeof obj.explicitList,
      });
    } else if (!obj.explicitList.every((id) => typeof id === 'string')) {
      errors.push({
        path: `${path}.explicitList`,
        message: 'explicitList items must be strings',
        code: 'INVALID_EXPLICIT_LIST_ITEM',
      });
    }
  } else if ('template' in obj) {
    const template = obj.template as Record<string, unknown>;
    if (typeof template !== 'object' || template === null) {
      errors.push({
        path: `${path}.template`,
        message: 'template must be an object',
        code: 'INVALID_TEMPLATE',
      });
    } else {
      if (typeof template.dataBinding !== 'string') {
        errors.push({
          path: `${path}.template.dataBinding`,
          message: 'dataBinding must be a string',
          code: 'INVALID_DATA_BINDING',
        });
      }
      if (typeof template.componentId !== 'string') {
        errors.push({
          path: `${path}.template.componentId`,
          message: 'componentId must be a string',
          code: 'INVALID_COMPONENT_ID',
        });
      }
    }
  } else {
    errors.push({
      path,
      message: 'children must have either explicitList or template property',
      code: 'MISSING_CHILDREN_PROPERTY',
    });
  }

  return errors;
}

/**
 * Validate a component against its schema
 */
export function validateComponent(
  component: unknown,
  componentType: string
): ComponentValidationResult {
  const errors: ValidationError[] = [];

  // Check if component is an object
  if (typeof component !== 'object' || component === null) {
    return {
      valid: false,
      errors: [
        {
          path: '',
          message: 'Component must be an object',
          code: 'INVALID_COMPONENT',
          expected: 'object',
          actual: typeof component,
        },
      ],
      componentType,
    };
  }

  const comp = component as Record<string, unknown>;
  const schema = ALL_COMPONENT_SCHEMAS[componentType];

  if (!schema) {
    return {
      valid: false,
      errors: [
        {
          path: 'type',
          message: `Unknown component type: ${componentType}`,
          code: 'UNKNOWN_COMPONENT_TYPE',
          actual: componentType,
        },
      ],
      componentType,
    };
  }

  // Check required properties
  if (schema.required) {
    for (const prop of schema.required) {
      if (!(prop in comp)) {
        errors.push({
          path: prop,
          message: `Missing required property: ${prop}`,
          code: 'MISSING_REQUIRED_PROPERTY',
          expected: prop,
        });
      }
    }
  }

  // Validate properties
  if (schema.properties) {
    for (const [propName, propValue] of Object.entries(comp)) {
      const propSchema = schema.properties[propName];

      if (!propSchema && schema.additionalProperties === false) {
        errors.push({
          path: propName,
          message: `Unknown property: ${propName}`,
          code: 'UNKNOWN_PROPERTY',
          actual: propName,
        });
        continue;
      }

      if (propSchema) {
        // Validate type
        if (propSchema.type && !matchesType(propValue, propSchema.type)) {
          errors.push({
            path: propName,
            message: `Invalid type for ${propName}`,
            code: 'INVALID_TYPE',
            expected: Array.isArray(propSchema.type) ? propSchema.type.join(' | ') : propSchema.type,
            actual: typeof propValue,
          });
        }

        // Validate enum
        if (propSchema.enum && !propSchema.enum.includes(propValue)) {
          errors.push({
            path: propName,
            message: `Invalid value for ${propName}`,
            code: 'INVALID_ENUM_VALUE',
            expected: propSchema.enum.join(' | '),
            actual: String(propValue),
          });
        }

        // Validate const
        if (propSchema.const !== undefined && propValue !== propSchema.const) {
          errors.push({
            path: propName,
            message: `Value must be ${propSchema.const}`,
            code: 'INVALID_CONST_VALUE',
            expected: String(propSchema.const),
            actual: String(propValue),
          });
        }

        // Validate number constraints
        if (typeof propValue === 'number') {
          if (propSchema.minimum !== undefined && propValue < propSchema.minimum) {
            errors.push({
              path: propName,
              message: `Value must be >= ${propSchema.minimum}`,
              code: 'VALUE_TOO_SMALL',
              expected: `>= ${propSchema.minimum}`,
              actual: String(propValue),
            });
          }
          if (propSchema.maximum !== undefined && propValue > propSchema.maximum) {
            errors.push({
              path: propName,
              message: `Value must be <= ${propSchema.maximum}`,
              code: 'VALUE_TOO_LARGE',
              expected: `<= ${propSchema.maximum}`,
              actual: String(propValue),
            });
          }
        }

        // Validate BoundValue properties
        if (propSchema.oneOf && propSchema.oneOf.some((s) => s.properties?.literalString || s.properties?.path)) {
          errors.push(...validateBoundValue(propValue, propName));
        }

        // Validate children
        if (propName === 'children') {
          errors.push(...validateChildren(propValue, propName));
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    componentType,
  };
}

/**
 * Get schema for a component type
 */
export function getComponentSchema(type: string): JSONSchema | undefined {
  return ALL_COMPONENT_SCHEMAS[type];
}

/**
 * Check if a component type has a schema
 */
export function hasComponentSchema(type: string): boolean {
  return type in ALL_COMPONENT_SCHEMAS;
}

/**
 * Get all registered component types
 */
export function getAllComponentTypes(): string[] {
  return Object.keys(ALL_COMPONENT_SCHEMAS);
}

/**
 * Get standard component types
 */
export function getStandardComponentTypes(): StandardComponentType[] {
  return Object.keys(STANDARD_COMPONENT_SCHEMAS) as StandardComponentType[];
}

/**
 * Get QE component types
 */
export function getQEComponentTypes(): QEComponentType[] {
  return Object.keys(QE_COMPONENT_SCHEMAS) as QEComponentType[];
}

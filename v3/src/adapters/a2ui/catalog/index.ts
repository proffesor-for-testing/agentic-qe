/**
 * A2UI Component Catalog
 *
 * Barrel export for A2UI component definitions, schemas, and validation.
 * Provides 15 standard A2UI components and 8 QE-specific components.
 *
 * @module adapters/a2ui/catalog
 */

// ============================================================================
// Standard Catalog Exports
// ============================================================================

export {
  // BoundValue Types
  type LiteralValue,
  type PathValue,
  type CombinedValue,
  type BoundValue,

  // Children Types
  type ExplicitListChildren,
  type TemplateChildren,
  type ComponentChildren,

  // Accessibility Types
  type A2UIAccessibility,

  // Action Types
  type ComponentAction,

  // Layout Component Types
  type RowComponent,
  type ColumnComponent,
  type ListComponent,

  // Display Component Types
  type TextComponent,
  type TextStyle,
  type TextWeight,
  type ImageComponent,
  type IconComponent,
  type IconSize,
  type DividerComponent,

  // Interactive Component Types
  type ButtonComponent,
  type ButtonVariant,
  type TextFieldComponent,
  type TextFieldInputType,
  type CheckBoxComponent,
  type DateTimeInputComponent,
  type DateTimeMode,
  type SliderComponent,

  // Container Component Types
  type CardComponent,
  type TabsComponent,
  type TabConfig,
  type ModalComponent,

  // Union Types
  type StandardComponentType,
  type StandardComponent,

  // Catalog
  type ComponentMetadata,
  STANDARD_CATALOG,
  STANDARD_COMPONENT_TYPES,
  COMPONENTS_BY_CATEGORY,

  // Type Guards
  isLiteralValue,
  isPathValue,
  isCombinedValue,
  isBoundValue,
  isExplicitListChildren,
  isTemplateChildren,
  isStandardComponentType,
  isLayoutComponent,
  isDisplayComponent,
  isInteractiveComponent,
  isContainerComponent,

  // Factory Functions
  createLiteralValue,
  createPathValue,
  createCombinedValue,
  createExplicitListChildren,
  createTemplateChildren,
  createAction,

  // Helper Functions
  getComponentMetadata,
  getComponentsByCategory,
  getComponentCategory,
  componentHasChildren,
  getRequiredProps,
  getOptionalProps,
  getAllProps,
  getStaticValue,
  getBindingPath,
} from './standard-catalog.js';

// ============================================================================
// QE Catalog Exports
// ============================================================================

export {
  // Domain Types
  type TestStatus,
  type VulnerabilitySeverity,
  type QualityGateStatus,
  type WCAGLevel,
  type A11yImpact,

  // Data Types
  type QualityMetric,
  type TestEvent,
  type CVSSScore,
  type VulnerabilityDetails,
  type A11yFindingDetails,

  // QE Component Types
  type CoverageGaugeComponent,
  type TestStatusBadgeComponent,
  type VulnerabilityCardComponent,
  type QualityGateIndicatorComponent,
  type A11yFindingCardComponent,
  type TestTimelineComponent,
  type DefectDensityChartComponent,
  type FlakySummaryComponent,

  // Union Types
  type QEComponentType,
  type QEComponent,

  // Catalog
  type QEComponentMetadata,
  QE_CATALOG,
  QE_COMPONENT_TYPES,
  QE_COMPONENTS_BY_DOMAIN,
  QE_DOMAINS,
  type QEDomain,

  // Type Guards
  isQEComponentType,
  hasQEPrefix,
  isTestStatus,
  isVulnerabilitySeverity,
  isQualityGateStatus,
  isWCAGLevel,
  isA11yImpact,
  isQEDomain,

  // Helper Functions
  getQEComponentMetadata,
  getQEComponentsByDomain,
  getQEDomain,
  isRealTimeComponent,
  getRelatedDomains,

  // Color Functions
  getSeverityColor,
  getTestStatusColor,
  getQualityGateColor,
  getA11yImpactColor,

  // Icon Functions
  getTestStatusIcon,
  getQualityGateIcon,
  getSeverityIcon,

  // Utility Functions
  getCoverageStatus,
  formatDuration,
  calculateFlakyRate,
} from './qe-catalog.js';

// ============================================================================
// Schema Exports
// ============================================================================

export {
  // JSON Schema Types
  type JSONSchema,

  // Shared Schemas
  BOUND_VALUE_SCHEMA,
  BOUND_STRING_SCHEMA,
  BOUND_NUMBER_SCHEMA,
  BOUND_BOOLEAN_SCHEMA,
  COMPONENT_CHILDREN_SCHEMA,
  ACCESSIBILITY_SCHEMA,
  ACTION_SCHEMA,

  // Standard Component Schemas
  ROW_SCHEMA,
  COLUMN_SCHEMA,
  LIST_SCHEMA,
  TEXT_SCHEMA,
  IMAGE_SCHEMA,
  ICON_SCHEMA,
  DIVIDER_SCHEMA,
  BUTTON_SCHEMA,
  TEXT_FIELD_SCHEMA,
  CHECKBOX_SCHEMA,
  DATE_TIME_INPUT_SCHEMA,
  SLIDER_SCHEMA,
  CARD_SCHEMA,
  TAB_CONFIG_SCHEMA,
  TABS_SCHEMA,
  MODAL_SCHEMA,

  // QE Component Schemas
  COVERAGE_GAUGE_SCHEMA,
  TEST_STATUS_BADGE_SCHEMA,
  VULNERABILITY_CARD_SCHEMA,
  QUALITY_GATE_INDICATOR_SCHEMA,
  A11Y_FINDING_CARD_SCHEMA,
  TEST_TIMELINE_SCHEMA,
  DEFECT_DENSITY_CHART_SCHEMA,
  FLAKY_SUMMARY_SCHEMA,

  // Schema Registry
  STANDARD_COMPONENT_SCHEMAS,
  QE_COMPONENT_SCHEMAS,
  ALL_COMPONENT_SCHEMAS,

  // Validation Types
  type ValidationError,
  type ComponentValidationResult,

  // Validation Functions
  validateComponent,
  getComponentSchema,
  hasComponentSchema,
  getAllComponentTypes,
  getStandardComponentTypes,
  getQEComponentTypes,
} from './component-schemas.js';

// ============================================================================
// Combined Catalog
// ============================================================================

import { STANDARD_CATALOG, STANDARD_COMPONENT_TYPES } from './standard-catalog.js';
import { QE_CATALOG, QE_COMPONENT_TYPES } from './qe-catalog.js';
import type { ComponentMetadata } from './standard-catalog.js';
import type { QEComponentMetadata } from './qe-catalog.js';

/**
 * All component types (standard + QE)
 */
export const ALL_COMPONENT_TYPES = [...STANDARD_COMPONENT_TYPES, ...QE_COMPONENT_TYPES] as const;

/**
 * Combined catalog of all components
 */
export const COMBINED_CATALOG: Record<string, ComponentMetadata | QEComponentMetadata> = {
  ...STANDARD_CATALOG,
  ...QE_CATALOG,
};

/**
 * A2UI catalog version
 */
export const A2UI_CATALOG_VERSION = '0.8.0';

/**
 * QE catalog version
 */
export const QE_CATALOG_VERSION = '3.0.0';

/**
 * Catalog info
 */
export const CATALOG_INFO = {
  /** A2UI protocol version */
  a2uiVersion: A2UI_CATALOG_VERSION,
  /** QE catalog version */
  qeVersion: QE_CATALOG_VERSION,
  /** Number of standard components */
  standardComponentCount: STANDARD_COMPONENT_TYPES.length,
  /** Number of QE components */
  qeComponentCount: QE_COMPONENT_TYPES.length,
  /** Total component count */
  totalComponentCount: ALL_COMPONENT_TYPES.length,
  /** Catalog ID for A2UI negotiation */
  catalogId: 'aqe-a2ui-v3',
} as const;

/**
 * Check if a type is any component type (standard or QE)
 */
export function isAnyComponentType(type: unknown): boolean {
  return typeof type === 'string' && (ALL_COMPONENT_TYPES as readonly string[]).includes(type);
}

/**
 * Get metadata for any component type
 */
export function getAnyComponentMetadata(type: string): ComponentMetadata | QEComponentMetadata | undefined {
  return COMBINED_CATALOG[type];
}

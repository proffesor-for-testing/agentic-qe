/**
 * A2UI Protocol Adapter
 *
 * Barrel export for A2UI v0.8 Declarative UI protocol implementation.
 * Provides component catalogs, schemas, and validation for QE-specific UI generation.
 *
 * Reference: https://a2ui.org/specification/v0.8-a2ui/
 * ADR: ADR-055 A2UI Declarative UI Strategy
 *
 * @module adapters/a2ui
 */

// ============================================================================
// Catalog Exports (Phase 3.1 - Component Catalog)
// ============================================================================

export {
  // ===== BoundValue Types =====
  type LiteralValue,
  type PathValue,
  type CombinedValue,
  type BoundValue,

  // ===== Children Types =====
  type ExplicitListChildren,
  type TemplateChildren,
  type ComponentChildren,

  // ===== Accessibility Types =====
  type A2UIAccessibility,

  // ===== Action Types =====
  type ComponentAction,

  // ===== Layout Component Types =====
  type RowComponent,
  type ColumnComponent,
  type ListComponent,

  // ===== Display Component Types =====
  type TextComponent,
  type TextStyle,
  type TextWeight,
  type ImageComponent,
  type IconComponent,
  type IconSize,
  type DividerComponent,

  // ===== Interactive Component Types =====
  type ButtonComponent,
  type ButtonVariant,
  type TextFieldComponent,
  type TextFieldInputType,
  type CheckBoxComponent,
  type DateTimeInputComponent,
  type DateTimeMode,
  type SliderComponent,

  // ===== Container Component Types =====
  type CardComponent,
  type TabsComponent,
  type TabConfig,
  type ModalComponent,

  // ===== Standard Component Union Types =====
  type StandardComponentType,
  type StandardComponent,

  // ===== Standard Catalog =====
  type ComponentMetadata,
  STANDARD_CATALOG,
  STANDARD_COMPONENT_TYPES,
  COMPONENTS_BY_CATEGORY,

  // ===== QE Domain Types =====
  type TestStatus,
  type VulnerabilitySeverity,
  type QualityGateStatus,
  type WCAGLevel,
  type A11yImpact,

  // ===== QE Data Types =====
  type QualityMetric,
  type TestEvent,
  type CVSSScore,
  type VulnerabilityDetails,
  type A11yFindingDetails,

  // ===== QE Component Types =====
  type CoverageGaugeComponent,
  type TestStatusBadgeComponent,
  type VulnerabilityCardComponent,
  type QualityGateIndicatorComponent,
  type A11yFindingCardComponent,
  type TestTimelineComponent,
  type DefectDensityChartComponent,
  type FlakySummaryComponent,

  // ===== QE Component Union Types =====
  type QEComponentType,
  type QEComponent,

  // ===== QE Catalog =====
  type QEComponentMetadata,
  QE_CATALOG,
  QE_COMPONENT_TYPES,
  QE_COMPONENTS_BY_DOMAIN,
  QE_DOMAINS,
  type QEDomain,

  // ===== Combined Catalog =====
  ALL_COMPONENT_TYPES,
  COMBINED_CATALOG,
  A2UI_CATALOG_VERSION,
  QE_CATALOG_VERSION,
  CATALOG_INFO,

  // ===== Type Guards - BoundValue =====
  isLiteralValue,
  isPathValue,
  isCombinedValue,
  isBoundValue,

  // ===== Type Guards - Children =====
  isExplicitListChildren,
  isTemplateChildren,

  // ===== Type Guards - Standard Components =====
  isStandardComponentType,
  isLayoutComponent,
  isDisplayComponent,
  isInteractiveComponent,
  isContainerComponent,

  // ===== Type Guards - QE Components =====
  isQEComponentType,
  hasQEPrefix,
  isTestStatus,
  isVulnerabilitySeverity,
  isQualityGateStatus,
  isWCAGLevel,
  isA11yImpact,
  isQEDomain,
  isAnyComponentType,

  // ===== Factory Functions =====
  createLiteralValue,
  createPathValue,
  createCombinedValue,
  createExplicitListChildren,
  createTemplateChildren,
  createAction,

  // ===== Standard Component Helpers =====
  getComponentMetadata,
  getComponentsByCategory,
  getComponentCategory,
  componentHasChildren,
  getRequiredProps,
  getOptionalProps,
  getAllProps,
  getStaticValue,
  getBindingPath,

  // ===== QE Component Helpers =====
  getQEComponentMetadata,
  getQEComponentsByDomain,
  getQEDomain,
  isRealTimeComponent,
  getRelatedDomains,
  getAnyComponentMetadata,

  // ===== Color Functions =====
  getSeverityColor,
  getTestStatusColor,
  getQualityGateColor,
  getA11yImpactColor,

  // ===== Icon Functions =====
  getTestStatusIcon,
  getQualityGateIcon,
  getSeverityIcon,

  // ===== Utility Functions =====
  getCoverageStatus,
  formatDuration,
  calculateFlakyRate,

  // ===== JSON Schema Types =====
  type JSONSchema,

  // ===== Shared Schemas =====
  BOUND_VALUE_SCHEMA,
  BOUND_STRING_SCHEMA,
  BOUND_NUMBER_SCHEMA,
  BOUND_BOOLEAN_SCHEMA,
  COMPONENT_CHILDREN_SCHEMA,
  ACCESSIBILITY_SCHEMA,
  ACTION_SCHEMA,

  // ===== Standard Component Schemas =====
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

  // ===== QE Component Schemas =====
  COVERAGE_GAUGE_SCHEMA,
  TEST_STATUS_BADGE_SCHEMA,
  VULNERABILITY_CARD_SCHEMA,
  QUALITY_GATE_INDICATOR_SCHEMA,
  A11Y_FINDING_CARD_SCHEMA,
  TEST_TIMELINE_SCHEMA,
  DEFECT_DENSITY_CHART_SCHEMA,
  FLAKY_SUMMARY_SCHEMA,

  // ===== Schema Registry =====
  STANDARD_COMPONENT_SCHEMAS,
  QE_COMPONENT_SCHEMAS,
  ALL_COMPONENT_SCHEMAS,

  // ===== Validation Types =====
  type ValidationError,
  type ComponentValidationResult,

  // ===== Validation Functions =====
  validateComponent,
  getComponentSchema,
  hasComponentSchema,
  getAllComponentTypes,
  getStandardComponentTypes,
  getQEComponentTypes,
} from './catalog/index.js';

// ============================================================================
// Renderer Exports (Phase 3.2 - Surface Rendering Engine)
// ============================================================================

export {
  // ===== Message Types =====
  type LiteralValue as RendererLiteralValue,
  type PathValue as RendererPathValue,
  type CombinedValue as RendererCombinedValue,
  type BoundValue as RendererBoundValue,
  type ExplicitList,
  type TemplateChildren as RendererTemplateChildren,
  type ComponentChildren as RendererComponentChildren,
  type AriaLive,
  type A2UIAccessibility as RendererA2UIAccessibility,
  type ComponentPropertyValue,
  type ComponentProperties,
  type ComponentDefinition,
  type ComponentNode,
  type A2UIComponent,
  type ComponentAction as RendererComponentAction,
  type SurfaceUpdateMessage,
  type DataModelUpdateMessage,
  type BeginRenderingMessage,
  type DeleteSurfaceMessage,
  type A2UIServerMessage,
  type UserActionMessage,
  type ClientErrorMessage,
  type A2UIClientMessage,
  type A2UIMessage,

  // ===== Message Type Guards =====
  isLiteralValue as isRendererLiteralValue,
  isPathValue as isRendererPathValue,
  isCombinedValue as isRendererCombinedValue,
  isBoundValue as isRendererBoundValue,
  isExplicitList,
  isTemplateChildren as isRendererTemplateChildren,
  isSurfaceUpdateMessage,
  isDataModelUpdateMessage,
  isBeginRenderingMessage,
  isDeleteSurfaceMessage,
  isUserActionMessage,
  isClientErrorMessage,
  isServerMessage,
  isClientMessage,

  // ===== Message Factory Functions =====
  literal,
  path,
  boundWithDefault,
  children,
  templateChildren,
  a11y,

  // ===== Component Builder =====
  ComponentBuilder,
  createComponentBuilder,
  type ComponentBuilderConfig,
  row,
  column,
  card,
  text,
  button,
  list,
  buildSurface,

  // ===== Surface Generator =====
  SurfaceGenerator,
  createSurfaceGenerator,
  type SurfaceState,
  type SurfaceGeneratorConfig,
  type SurfaceChangeEvent,

  // ===== QE Surface Templates =====
  // Coverage
  createCoverageSurface,
  createCoverageDataUpdate,
  createCoverageSummarySurface,
  type CoverageData,
  type FileCoverage,
  type CoverageGap,
  type ModuleCoverage,

  // Test Results
  createTestResultsSurface,
  createTestResultsDataUpdate,
  createTestSummarySurface,
  type TestResults,
  type TestResult,
  type TestSuite,
  type TestStatus as RendererTestStatus,

  // Security
  createSecuritySurface,
  createSecurityDataUpdate,
  createSecuritySummarySurface,
  type SecurityFindings,
  type SecurityFinding,
  type Severity,
  type OwaspCategory,
  type SeverityCount,
  type DependencyVulnerability,

  // Accessibility
  createAccessibilitySurface,
  createAccessibilityDataUpdate,
  createAccessibilitySummarySurface,
  type A11yAudit,
  type A11yFinding,
  type WcagLevel,
  type ImpactLevel,
  type WcagPrinciple,
  type ImpactCount,
  type LevelCount,
  type PrincipleBreakdown,
  type PageAudit,
} from './renderer/index.js';

// ============================================================================
// Data Binding Exports (Phase 3.3 - Data Binding with BoundValue Types)
// ============================================================================

export {
  // ===== JSON Pointer (RFC 6901) =====
  JsonPointerError,
  type JsonPointerErrorCode,
  type ResolveResult,
  escapeSegment,
  unescapeSegment,
  parseJsonPointer,
  buildJsonPointer,
  isValidPointer,
  resolvePointer,
  resolvePointerWithInfo,
  pointerExists,
  setAtPointer,
  deleteAtPointer,
  getAllPaths,
  isParentPointer,
  getParentPointer,
  getPointerKey,
  joinPointers,
  getRelativePath,

  // ===== BoundValue Types (Data Module) =====
  type LiteralValue as DataLiteralValue,
  type PathValue as DataPathValue,
  type CombinedValue as DataCombinedValue,
  type BoundValue as DataBoundValue,
  type ExplicitListChildren as DataExplicitListChildren,
  type TemplateChildrenConfig,
  type TemplateChildren as DataTemplateChildren,
  type ComponentChildren as DataComponentChildren,
  type ResolvedTemplateChild,
  type BoundValueResolverConfig,
  type IBoundValueResolver,

  // ===== BoundValue Type Guards (Data Module) =====
  isLiteralValue as isDataLiteralValue,
  isPathValue as isDataPathValue,
  isCombinedValue as isDataCombinedValue,
  isBoundValue as isDataBoundValue,
  isExplicitListChildren as isDataExplicitListChildren,
  isTemplateChildren as isDataTemplateChildren,

  // ===== BoundValue Factory Functions (Data Module) =====
  createLiteralValue as createDataLiteralValue,
  createPathValue as createDataPathValue,
  createCombinedValue as createDataCombinedValue,
  createExplicitListChildren as createDataExplicitListChildren,
  createTemplateChildren as createDataTemplateChildren,

  // ===== BoundValue Resolver =====
  BoundValueResolver,
  createBoundValueResolver,

  // ===== BoundValue Utilities =====
  getStaticValue as getDataStaticValue,
  getBindingPath as getDataBindingPath,
  hasDynamicBinding,
  hasStaticDefault,
  toBoundValue,
  extractBoundPaths,
  resolveAllBoundValues,

  // ===== Reactive Store =====
  type ChangeCallback,
  type GlobalChangeCallback,
  type StoreChange,
  type BatchUpdate,
  type Subscription,
  type ReactiveStoreConfig,
  type IReactiveStore,
  ReactiveStore,
  createReactiveStore,

  // ===== Reactive Store Utilities =====
  createComputed,
  createSelector,
  combineStores,
} from './data/index.js';

// ============================================================================
// Accessibility Exports (Phase 3.5 - WCAG 2.2 Accessibility Compliance)
// ============================================================================

export {
  // ===== ARIA Types =====
  type AriaRole,
  type AriaLive as AccessibilityAriaLive,
  type AriaRelevant,
  type AriaAutocomplete,
  type AriaCurrent,
  type AriaDropeffect,
  type AriaHaspopup,
  type AriaOrientation,
  type AriaSort,
  type AriaChecked,
  type AriaPressed,
  type A2UIAccessibility as AccessibilityA2UIAccessibility,

  // ===== ARIA Type Guards =====
  isAriaRole,
  isAriaLive,
  isAriaRelevant,
  isAriaChecked,
  isAriaPressed,
  isA2UIAccessibility,

  // ===== ARIA Factory Functions =====
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

  // ===== ARIA Utilities =====
  toAriaAttributes,
  mergeAccessibility,
  applyDefaultAccessibility,
  getDefaultAccessibility,

  // ===== WCAG Types =====
  type WCAGLevel as AccessibilityWCAGLevel,
  type WCAGPrinciple,
  type IssueSeverity,
  type WCAGCriterion,
  type WCAGIssue,
  type WCAGWarning,
  type WCAGPassedCriterion,
  type WCAGValidationResult,
  type ComponentValidationResult as AccessibilityComponentValidationResult,
  type AccessibilityRequirement,

  // ===== WCAG Criteria Reference =====
  WCAG_LEVEL_A_CRITERIA,
  WCAG_LEVEL_AA_CRITERIA,
  getCriteriaForLevel,
  getCriterion,

  // ===== Component Accessibility Requirements =====
  COMPONENT_REQUIREMENTS,
  getAccessibilityRequirements,

  // ===== WCAG Validation Functions =====
  validateComponent as validateComponentAccessibility,
  validateSurface as validateSurfaceAccessibility,
  getIssueSummary,
  getAccessibilityScore,

  // ===== Keyboard Navigation Types =====
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

  // ===== Keyboard Pattern Helpers =====
  shouldTrapFocus,
  usesRovingTabIndex,
  supportsTypeAhead,
  getActionForKey,

  // ===== Keyboard Factory Functions =====
  createKeyboardNavigation,
  mergeKeyboardNavigation,
  createFocusTrap,

  // ===== Keyboard Validation & Inspection =====
  getKeyboardDescription,
  validateKeyboardNavigation,
  getAllKeyboardPatternTypes,
  getPatternsByCapability,

  // ===== High-Level Accessibility Functions =====
  type ComponentAccessibilityConfig,
  type AccessibilityAuditResult,
  auditSurfaceAccessibility,
  applyAccessibility,
  getAriaAttributesForComponent,
  getAccessibilityDocumentation,
} from './accessibility/index.js';

// ============================================================================
// Integration Exports (Phase 3.4 - AG-UI State Integration)
// ============================================================================

export {
  // ===== AG-UI Sync Service =====
  AGUISyncService,
  createAGUISyncService,
  type PathMapping,
  type A2UICustomEventName,
  type A2UICustomEventPayload,
  type ActionStateMapping,
  type AGUISyncServiceConfig,
  type SyncServiceState,
  type SyncEvent,

  // ===== Surface State Bridge =====
  SurfaceStateBridge,
  createSurfaceStateBridge,
  type ComponentBinding,
  type BoundSurfaceConfig,
  type SurfaceStateBridgeConfig,
  type BridgeUpdateEvent,

  // ===== Convenience Builders =====
  boundSurface,
  binding,
} from './integration/index.js';

/**
 * A2UI Renderer Module
 *
 * Barrel export for A2UI surface rendering components including:
 * - Message type definitions
 * - Component builder
 * - Surface generator
 * - QE surface templates
 *
 * @module adapters/a2ui/renderer
 */

// ============================================================================
// Message Types
// ============================================================================

export {
  // BoundValue Types
  type LiteralValue,
  type PathValue,
  type CombinedValue,
  type BoundValue,

  // Type Guards for BoundValue
  isLiteralValue,
  isPathValue,
  isCombinedValue,
  isBoundValue,

  // Children Types
  type ExplicitList,
  type TemplateChildren,
  type ComponentChildren,
  isExplicitList,
  isTemplateChildren,

  // Accessibility Types
  type AriaLive,
  type A2UIAccessibility,

  // Component Types
  type ComponentPropertyValue,
  type ComponentProperties,
  type ComponentDefinition,
  type ComponentNode,
  type A2UIComponent,

  // Action Types
  type ComponentAction,

  // Server-to-Client Messages
  type SurfaceUpdateMessage,
  type DataModelUpdateMessage,
  type BeginRenderingMessage,
  type DeleteSurfaceMessage,
  type A2UIServerMessage,

  // Client-to-Server Messages
  type UserActionMessage,
  type ClientErrorMessage,
  type A2UIClientMessage,

  // All Messages
  type A2UIMessage,

  // Message Type Guards
  isSurfaceUpdateMessage,
  isDataModelUpdateMessage,
  isBeginRenderingMessage,
  isDeleteSurfaceMessage,
  isUserActionMessage,
  isClientErrorMessage,
  isServerMessage,
  isClientMessage,

  // Factory Functions
  literal,
  path,
  boundWithDefault,
  children,
  templateChildren,
  a11y,
} from './message-types.js';

// ============================================================================
// Component Builder
// ============================================================================

export {
  // Builder Class
  ComponentBuilder,
  createComponentBuilder,

  // Builder Configuration
  type ComponentBuilderConfig,

  // Component Helper Functions
  row,
  column,
  card,
  text,
  button,
  list,

  // Convenience Builder
  buildSurface,
} from './component-builder.js';

// ============================================================================
// Surface Generator
// ============================================================================

export {
  // Generator Class
  SurfaceGenerator,
  createSurfaceGenerator,

  // State Types
  type SurfaceState,
  type SurfaceGeneratorConfig,
  type SurfaceChangeEvent,
} from './surface-generator.js';

// ============================================================================
// QE Surface Templates
// ============================================================================

export {
  // Coverage Templates
  createCoverageSurface,
  createCoverageDataUpdate,
  createCoverageSummarySurface,
  type CoverageData,
  type FileCoverage,
  type CoverageGap,
  type ModuleCoverage,

  // Test Results Templates
  createTestResultsSurface,
  createTestResultsDataUpdate,
  createTestSummarySurface,
  type TestResults,
  type TestResult,
  type TestSuite,
  type TestStatus,

  // Security Templates
  createSecuritySurface,
  createSecurityDataUpdate,
  createSecuritySummarySurface,
  type SecurityFindings,
  type SecurityFinding,
  type Severity,
  type OwaspCategory,
  type SeverityCount,
  type DependencyVulnerability,

  // Accessibility Templates
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
} from './templates/index.js';

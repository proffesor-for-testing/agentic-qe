/**
 * Agentic QE v3 - Visual & Accessibility Testing Domain
 * Visual regression, accessibility auditing, and responsive design testing
 *
 * This module exports the public API for the visual-accessibility domain.
 */

// ============================================================================
// Domain Plugin (Primary Export)
// ============================================================================

export {
  VisualAccessibilityPlugin,
  createVisualAccessibilityPlugin,
  type VisualAccessibilityPluginConfig,
  type VisualAccessibilityAPI,
} from './plugin.js';

// ============================================================================
// Coordinator
// ============================================================================

export {
  VisualAccessibilityCoordinator,
  type IVisualAccessibilityCoordinatorExtended,
  type WorkflowStatus,
  type CoordinatorConfig,
} from './coordinator.js';

// ============================================================================
// Services
// ============================================================================

export {
  VisualTesterService,
  type VisualTesterConfig,
} from './services/visual-tester.js';

export {
  AccessibilityTesterService,
  type AccessibilityTesterConfig,
} from './services/accessibility-tester.js';

export {
  ResponsiveTesterService,
  DEVICE_VIEWPORTS,
  type IResponsiveTestingService,
  type ResponsiveTestConfig,
  type ResponsiveTestResult,
  type ViewportResult,
  type LayoutIssue,
  type LayoutIssueType,
  type BreakpointIssue,
  type BreakpointAnalysis,
  type ContentBreak,
} from './services/responsive-tester.js';

export {
  ViewportCaptureService,
  createViewportCaptureService,
  VIEWPORT_PRESETS,
  DEFAULT_BREAKPOINTS,
  type IViewportCaptureService,
  type ViewportPreset,
  type ViewportCaptureResult,
  type MultiViewportCaptureResult,
  type ResponsiveAnalysis as ViewportResponsiveAnalysis,
  type DetectedBreakpoint,
  type LayoutShift,
  type ScreenshotComparisonResult,
  type ViewportCaptureConfig,
  type CaptureAllOptions,
  type BreakpointCaptureOptions,
  type SingleCaptureOptions,
} from './services/viewport-capture.js';

export {
  VisualRegressionService,
  createVisualRegressionService,
  type VisualRegressionConfig,
  type BaselineMetadata,
  type VisualRegressionResult,
  type VisualRegressionTestOptions,
  type IVisualRegressionService,
} from './services/visual-regression.js';

// ============================================================================
// Interfaces (Types Only)
// ============================================================================

export type {
  // Visual Testing Types
  Screenshot,
  Viewport,
  ScreenshotMetadata,
  VisualDiff,
  DiffRegion,
  DiffStatus,
  CaptureOptions,
  IVisualTestingService,

  // Accessibility Types
  AccessibilityViolation,
  WCAGCriterion,
  ViolationNode,
  ContrastAnalysis,
  AccessibilityReport,
  PassedRule,
  IncompleteCheck,
  WCAGValidationResult,
  KeyboardNavigationReport,
  TabOrderItem,
  KeyboardIssue,
  FocusTrap,
  AuditOptions,
  IAccessibilityAuditingService,

  // Screenshot Diff Types
  IScreenshotDiffService,
  AIComparisonResult,
  DetectedChange,

  // Report Types
  VisualTestReport,
  VisualTestResult,
  AccessibilityAuditReport,
  TopAccessibilityIssue,
  RemediationPlan,
  ViolationRemediation,
  VisualTestingStatus,

  // Coordinator Interface
  IVisualAccessibilityCoordinator,

  // Repository Interfaces
  IScreenshotRepository,
  IVisualDiffRepository,
  IAccessibilityReportRepository,

  // Event Types
  VisualRegressionDetectedEvent,
  AccessibilityAuditCompletedEvent,
  BaselineUpdatedEvent,
  ContrastFailureEvent,
} from './interfaces.js';

// ============================================================================
// axe-core Integration
// ============================================================================

export {
  // Core Functions
  injectAxeCore,
  runAxeAudit,
  parseAxeResults,
  runCompleteAxeAudit,

  // Error Classes
  AxeCoreInjectionError,
  AxeCoreAuditError,

  // WCAG Mappings
  WCAG_TAG_MAP,
  WCAG_CRITERIA_MAP,
  FIX_SUGGESTIONS,

  // Configuration
  AXE_CORE_CDN_URL,
  DEFAULT_AXE_CONFIG,

  // Types
  type AxeOptions,
  type AxeResults,
  type AxeViolation,
  type AxePass,
  type AxeIncomplete,
  type AxeInapplicable,
  type AxeNode,
  type AxeCheck,
  type AxeRelatedNode,
  type AxeTestEnvironment,
  type AxeTestRunner,
  type AxeToolOptions,
  type AxeCoreConfig,
} from './services/axe-core-integration.js';

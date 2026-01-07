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

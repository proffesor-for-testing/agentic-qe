/**
 * Agentic QE v3 - Test Execution Domain Types
 * Public type exports for the test execution domain
 */

// ============================================================================
// E2E Step Types
// ============================================================================

export {
  // Step Type Enumeration
  E2EStepType,

  // Step Options
  type NavigateStepOptions,
  type ClickStepOptions,
  type TypeStepOptions,
  type WaitStepOptions,
  type WaitConditionType,
  type AssertStepOptions,
  type AssertionType,
  type ScreenshotStepOptions,
  type A11yCheckStepOptions,
  type StepOptions,

  // Step Interfaces
  type E2EStepBase,
  type NavigateStep,
  type ClickStep,
  type TypeStep,
  type WaitStep,
  type AssertStep,
  type ScreenshotStep,
  type A11yCheckStep,
  type E2EStep,

  // Step Result
  type E2EStepResult,

  // Test Case
  type Viewport,
  type BrowserContextOptions,
  type E2ETestHooks,
  type E2ETestCase,

  // Test Result
  type E2ETestResult,

  // Test Suite
  type E2ETestSuite,
  type E2ETestSuiteResult,

  // Factory Functions
  createNavigateStep,
  createClickStep,
  createTypeStep,
  createWaitStep,
  createAssertStep,
  createScreenshotStep,
  createA11yCheckStep,
  createE2ETestCase,

  // Type Guards
  isNavigateStep,
  isClickStep,
  isTypeStep,
  isWaitStep,
  isAssertStep,
  isScreenshotStep,
  isA11yCheckStep,

  // Utility Types
  type ExtractStepType,
  type StepOptionsFor,
  type E2EStepBuilder,
  type SerializableE2ETestCase,
} from './e2e-step.types';

// ============================================================================
// Flow Template Types
// ============================================================================

export {
  // Enumerations
  FlowCategory,
  FlowStatus,
  RecordedActionType,

  // Recorded Action Types
  type RecordedAction,
  type NavigateAction,
  type ClickAction,
  type TypeAction,
  type HoverAction,
  type ScrollAction,
  type SelectAction,
  type UploadAction,
  type DownloadAction,
  type DragDropAction,
  type KeyboardAction,
  type AssertionAction,
  type AnyRecordedAction,

  // Flow Template Types
  type FlowTemplateBase,
  type LoginFlowTemplate,
  type CheckoutFlowTemplate,
  type FormSubmissionFlowTemplate,
  type SearchFlowTemplate,
  type NavigationFlowTemplate,
  type FlowTemplate,

  // Recording Types
  type RecordingConfig,
  type RecordingSession,
  DEFAULT_RECORDING_CONFIG,

  // Generated Flow Types
  type UserFlow,
  type CodeGenerationOptions,
  type GeneratedTestCode,
  DEFAULT_CODE_GENERATION_OPTIONS,

  // Type Guards
  isNavigateAction,
  isClickAction,
  isTypeAction,
  isAssertionAction,
  isLoginFlowTemplate,
  isCheckoutFlowTemplate,
  isFormSubmissionFlowTemplate,
  isSearchFlowTemplate,
  isNavigationFlowTemplate,
} from './flow-templates.types';

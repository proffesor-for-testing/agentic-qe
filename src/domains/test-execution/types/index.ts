/**
 * Agentic QE v3 - Test Execution Domain Types
 * @deprecated This file has been merged into interfaces.ts - import from '../interfaces' instead
 *
 * Re-exports for backward compatibility
 */

export type {
  // E2E Step Types
  E2EStepType,
  NavigateStepOptions,
  ClickStepOptions,
  TypeStepOptions,
  WaitStepOptions,
  WaitConditionType,
  AssertStepOptions,
  AssertionType,
  ScreenshotStepOptions,
  A11yCheckStepOptions,
  StepOptions,
  E2EStepBase,
  NavigateStep,
  ClickStep,
  TypeStep,
  WaitStep,
  AssertStep,
  ScreenshotStep,
  A11yCheckStep,
  E2EStep,
  E2EStepResult,
  Viewport,
  BrowserContextOptions,
  E2ETestHooks,
  E2ETestCase,
  E2ETestResult,
  E2ETestSuite,
  E2ETestSuiteResult,
  ExtractStepType,
  StepOptionsFor,
  E2EStepBuilder,
  SerializableE2ETestCase,
} from './e2e-step.types';

export type {
  // Flow Template Types
  FlowCategory,
  FlowStatus,
  RecordedActionType,
  RecordedAction,
  NavigateAction,
  ClickAction,
  TypeAction,
  HoverAction,
  ScrollAction,
  SelectAction,
  UploadAction,
  DownloadAction,
  DragDropAction,
  KeyboardAction,
  AssertionAction,
  AnyRecordedAction,
  FlowTemplateBase,
  LoginFlowTemplate,
  CheckoutFlowTemplate,
  FormSubmissionFlowTemplate,
  SearchFlowTemplate,
  NavigationFlowTemplate,
  FlowTemplate,
  RecordingConfig,
  RecordingSession,
  UserFlow,
  CodeGenerationOptions,
  GeneratedTestCode,
} from './flow-templates.types';

export {
  // E2E Step Type Guards and Factories
  createNavigateStep,
  createClickStep,
  createTypeStep,
  createWaitStep,
  createAssertStep,
  createScreenshotStep,
  createA11yCheckStep,
  createE2ETestCase,
  isNavigateStep,
  isClickStep,
  isTypeStep,
  isWaitStep,
  isAssertStep,
  isScreenshotStep,
  isA11yCheckStep,
} from './e2e-step.types';

export {
  // Flow Template Type Guards and Constants
  isNavigateAction,
  isClickAction,
  isTypeAction,
  isAssertionAction,
  isLoginFlowTemplate,
  isCheckoutFlowTemplate,
  isFormSubmissionFlowTemplate,
  isSearchFlowTemplate,
  isNavigationFlowTemplate,
  DEFAULT_RECORDING_CONFIG,
  DEFAULT_CODE_GENERATION_OPTIONS,
} from './flow-templates.types';

/**
 * Agentic QE v3 - Adapters
 * Export all adapter implementations
 */

export { BrowserResultAdapter, createBrowserResultAdapter } from './browser-result-adapter.js';
export { TrajectoryAdapter, createTrajectoryAdapter } from './trajectory-adapter.js';

// Export browser trajectory types
export type {
  BrowserTrajectory,
  BrowserTrajectoryStep,
  BrowserContext,
  LearningOutcome,
  ActionSequence,
} from './trajectory-adapter.js';

// AG-UI Protocol Adapter (ADR-053)
export {
  // Adapter
  EventAdapter,
  createEventAdapter,

  // Event Type Enum
  AGUIEventType,

  // Type Guards
  isAQEToolProgress,
  isAQEToolResult,
  isAQEAgentStarted,
  isAQEAgentCompleted,
  isAQEAgentError,
  isAQEDomainEvent,

  // Category Helpers
  getEventCategory,
  getEventTypesForCategory,
} from './ag-ui/index.js';

// Export AG-UI types
export type {
  // Configuration
  EventAdapterConfig,
  IdMapping,
  RunContext,
  MessageState,
  ToolCallState,

  // AG-UI Events
  AGUIEvent,
  AGUIBaseEvent,
  AGUIEventCategory,

  // Lifecycle Events
  RunStartedEvent,
  RunFinishedEvent,
  RunErrorEvent,
  StepStartedEvent,
  StepFinishedEvent,
  RunOutcome,
  InterruptInfo,

  // Text Events
  TextMessageStartEvent,
  TextMessageContentEvent,
  TextMessageEndEvent,
  MessageRole,

  // Tool Events
  ToolCallStartEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,

  // State Events
  StateSnapshotEvent,
  StateDeltaEvent,
  MessagesSnapshotEvent,
  ActivitySnapshotEvent,
  ActivityDeltaEvent,
  JsonPatchOperation,
  ConversationMessage,
  ActivityMessage,

  // Special Events
  RawEvent,
  CustomEvent,

  // AQE Source Events
  AQEEvent,
  AQEToolProgress,
  AQEToolResult,
  AQEAgentStarted,
  AQEAgentCompleted,
  AQEAgentError,
  AQEDomainEvent,
} from './ag-ui/index.js';

// A2A Protocol Adapter (ADR-054)
export {
  // Schema Types
  type AgentProvider,
  type SecuritySchemeType,
  type ApiKeySecurityScheme,
  type HttpSecurityScheme,
  type OAuthFlow,
  type OAuth2SecurityScheme,
  type OpenIdConnectSecurityScheme,
  type MutualTLSSecurityScheme,
  type SecurityScheme,
  type AgentAuthentication,
  type AgentCapabilities,
  type AgentSkill,
  type InputMode,
  type OutputMode,
  type AgentCard,
  type ExtendedAgentCard,
  type QEAgentCard,

  // Type Guards
  isAgentCard,
  isAgentSkill,
  isSecurityScheme,
  isQEAgentCard,

  // Default Values
  DEFAULT_CAPABILITIES,
  DEFAULT_INPUT_MODES,
  DEFAULT_OUTPUT_MODES,
  DEFAULT_QE_PROVIDER,

  // Factory Functions
  createAgentSkill,
  createAgentCard,
  createQEAgentCard,

  // Generator
  AgentCardGenerator,
  createAgentCardGenerator,
  type AgentCardGeneratorConfig,
  DEFAULT_GENERATOR_CONFIG,
  type AgentFrontmatter,
  type ParsedAgentMarkdown,
  type GenerationResult,
  parseFrontmatter,
  extractSection,
  parseAgentMarkdown,
  extractExamples,
  extractMemoryNamespaces,
  extractImplementationStatus,

  // Validator
  AgentCardValidator,
  createAgentCardValidator,
  validateAgentCard,
  isValidAgentCard,
  type ValidationSeverity,
  type ValidationIssue,
  type ValidationResult,
  type ValidatorOptions,
  DEFAULT_VALIDATOR_OPTIONS,
  ValidationErrorCode,
  AGENT_CARD_JSON_SCHEMA,
  QE_AGENT_CARD_JSON_SCHEMA,

  // ===== JSON-RPC 2.0 Message Envelope (Phase 2.2) =====

  // Error Codes
  STANDARD_ERRORS,
  STANDARD_ERROR_MESSAGES,
  type StandardErrorCode,
  A2A_ERRORS,
  A2A_ERROR_MESSAGES,
  type A2AErrorCode,
  ALL_ERRORS,
  ALL_ERROR_MESSAGES,
  type JsonRpcErrorCode,

  // Error Classes
  JsonRpcError,
  type JsonRpcErrorObject,

  // Standard Error Factories
  createParseError,
  createInvalidRequestError,
  createMethodNotFoundError,
  createInvalidParamsError,
  createInternalError,

  // A2A Error Factories
  createTaskNotFoundError,
  createTaskNotCancelableError,
  createPushNotificationNotSupportedError,
  createUnsupportedOperationError,
  createContentTypeNotSupportedError,
  createInvalidAgentCardError,
  createAuthenticationRequiredError,
  createAuthorizationFailedError,
  createRateLimitExceededError,
  createAgentUnavailableError,
  createAgentBusyError,
  createTaskTimeoutError,

  // Error Utilities
  isStandardError,
  isA2AError,
  isValidErrorCode,
  getDefaultErrorMessage,
  getHttpStatusCode,
  getErrorCategory,

  // Method Names
  A2A_METHODS,
  A2A_METHOD_DESCRIPTIONS,
  type A2AMethodName,

  // Message Types
  type A2AMessageRole,
  type TextPart,
  type FilePart,
  type DataPart,
  type MessagePart,
  type A2AMessage,

  // Task Types
  type TaskStatus,
  TERMINAL_STATUSES,
  type A2AArtifact,
  type TaskError,
  type A2ATask,

  // Push Notification Types
  type PushNotificationConfig,

  // Method Parameters
  type MessageSendParams,
  type MessageStreamParams,
  type TasksGetParams,
  type TasksListParams,
  type TasksCancelParams,
  type TasksResubmitParams,
  type TasksPushNotificationSetParams,
  type TasksPushNotificationGetParams,
  type A2AMethodParams,

  // Method Results
  type MessageSendResult,
  type MessageStreamResult,
  type TasksGetResult,
  type TasksListResult,
  type TasksCancelResult,
  type TasksResubmitResult,
  type TasksPushNotificationSetResult,
  type TasksPushNotificationGetResult,
  type A2AMethodResult,

  // Method Metadata
  type MethodMetadata,
  METHOD_METADATA,

  // Method Validation
  isValidMethod,
  getMethodMetadata,
  methodRequiresParams,
  isStreamingMethod,
  getAllMethods,
  getMethodsByCategory,
  isTerminalStatus,
  isValidStatusTransition,

  // Message Part Type Guards
  isTextPart,
  isFilePart,
  isDataPart,
  extractTextFromParts,

  // Message Factories
  createTextMessage,
  createDataMessage,

  // Envelope Constants
  JSONRPC_VERSION,
  MAX_ID_LENGTH,
  MAX_METHOD_LENGTH,

  // Request Types
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcNotification,
  type A2ARequest,

  // Response Types
  type JsonRpcSuccessResponse,
  type JsonRpcErrorResponse,
  type JsonRpcResponse,
  type A2AResponse,

  // Batch Types
  type JsonRpcBatchRequest,
  type JsonRpcBatchResponse,

  // Result Type
  type JsonRpcResult,
  ok,
  err,

  // Request Creation
  generateRequestId,
  createRequest,
  createNotification,
  createA2ARequest,

  // Response Creation
  createSuccessResponse,
  createErrorResponse,
  createErrorResponseFromError,

  // Validation
  type JsonRpcValidationResult,
  validateId,
  validateMethod,
  validateParams,
  validateRequestStructure,
  validateA2AMethod,

  // Parsing
  parseRequest,
  parseA2ARequest,
  parseBatchRequest,
  parseResponse,

  // Serialization
  serializeRequest,
  serializeResponse,
  serializeBatchRequest,
  serializeBatchResponse,

  // Type Guards
  isSuccessResponse,
  isErrorResponse,
  isRequest,
  isNotification,
  isResponse,

  // Utilities
  extractRequestId,
  createResponseMatcher,
  formatRequestForLogging,
  formatResponseForLogging,
} from './a2a/index.js';

// A2UI Protocol Adapter (ADR-055)
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
  type ValidationError as A2UIValidationError,
  type ComponentValidationResult,

  // ===== Validation Functions =====
  validateComponent,
  getComponentSchema,
  hasComponentSchema,
  getAllComponentTypes as getA2UIComponentTypes,
  getStandardComponentTypes,
  getQEComponentTypes,
} from './a2ui/index.js';

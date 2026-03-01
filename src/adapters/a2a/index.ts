/**
 * A2A Protocol Adapter
 *
 * Barrel export for A2A v0.3 Agent Cards, generator, and validation.
 * Provides A2A Protocol compliance for AQE v3.
 *
 * @module adapters/a2a
 */

// ============================================================================
// Schema Types
// ============================================================================

export {
  // Provider
  type AgentProvider,

  // Security Schemes
  type SecuritySchemeType,
  type ApiKeySecurityScheme,
  type HttpSecurityScheme,
  type OAuthFlow,
  type OAuth2SecurityScheme,
  type OpenIdConnectSecurityScheme,
  type MutualTLSSecurityScheme,
  type SecurityScheme,
  type AgentAuthentication,

  // Capabilities
  type AgentCapabilities,

  // Skills
  type AgentSkill,

  // Input/Output Modes
  type InputMode,
  type OutputMode,

  // Agent Card
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
} from './agent-cards/schema.js';

// ============================================================================
// Generator
// ============================================================================

export {
  // Generator Class
  AgentCardGenerator,
  createAgentCardGenerator,

  // Configuration
  type AgentCardGeneratorConfig,
  DEFAULT_GENERATOR_CONFIG,

  // Parsed Types
  type AgentFrontmatter,
  type ParsedAgentMarkdown,
  type GenerationResult,

  // Parsing Functions
  parseFrontmatter,
  extractSection,
  parseAgentMarkdown,
  extractExamples,
  extractMemoryNamespaces,
  extractImplementationStatus,
} from './agent-cards/generator.js';

// ============================================================================
// Validator
// ============================================================================

export {
  // Validator Class
  AgentCardValidator,
  createAgentCardValidator,

  // Convenience Functions
  validateAgentCard,
  isValidAgentCard,

  // Validation Types
  type ValidationSeverity,
  type ValidationIssue,
  type ValidationResult,
  type ValidatorOptions,

  // Options
  DEFAULT_VALIDATOR_OPTIONS,

  // Error Codes
  ValidationErrorCode,

  // JSON Schemas
  AGENT_CARD_JSON_SCHEMA,
  QE_AGENT_CARD_JSON_SCHEMA,
} from './agent-cards/validator.js';

// ============================================================================
// JSON-RPC 2.0 Message Envelope (ADR-054 Phase 2)
// ============================================================================

export {
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
  type MessageRole as A2AMessageRole,
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
  type Result as JsonRpcResult,
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
  type ValidationResult as JsonRpcValidationResult,
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
} from './jsonrpc/index.js';

// ============================================================================
// Discovery Service (ADR-054 Phase 3)
// ============================================================================

export {
  // Discovery Service
  DiscoveryService,
  createDiscoveryService,

  // Configuration
  type DiscoveryServiceConfig,
  DEFAULT_DISCOVERY_CONFIG,

  // Search Types
  type AgentSearchCriteria,
  type AgentSearchResult,

  // Metrics Types
  type CardAccessMetrics,

  // Extended Card Types
  type RateLimitInfo,
  type UsageStats,
  type ExtendedCardData,

  // Express-Compatible Routes
  createDiscoveryRoutes,
  getDiscoveryRouteDefinitions,
  type DiscoveryRoutesConfig,
  DEFAULT_ROUTES_CONFIG,

  // HTTP Types (Express-compatible)
  type HttpRequest,
  type HttpResponse,
  type NextFunction as DiscoveryNextFunction,
  type HttpHandler,
  type RouteDefinition,

  // Auth Types
  type AuthMiddleware,
  type AuthenticatedRequest,
  type A2AErrorResponse,

  // Error Response Factories
  createAgentNotFoundResponse,
  createAuthRequiredResponse,
  createInternalErrorResponse,

  // Standalone Handlers
  createPlatformCardHandler,
  createAgentCardHandler,
  createExtendedCardHandler,
} from './discovery/index.js';

// ============================================================================
// Task Negotiation Protocol (ADR-054 Phase 4)
// ============================================================================

export {
  // Task Store
  TaskStore,
  createTaskStore,
  type TaskStoreConfig,
  DEFAULT_TASK_STORE_CONFIG,

  // Task Types (re-exported from task-store with different names to avoid conflicts)
  type A2ATask as A2ATaskFull,
  type TaskHistoryEntry,
  type TaskError as A2ATaskError,
  type TaskMetadata,
  type TaskQueryOptions,
  type TaskQueryResult,

  // Task Manager
  TaskManager,
  createTaskManager,
  type TaskManagerConfig,
  DEFAULT_TASK_MANAGER_CONFIG,

  // State Machine
  VALID_TRANSITIONS,
  TERMINAL_STATES,
  isTerminal,
  isValidTransition,

  // Task Creation Options
  type CreateTaskOptions,

  // Task Events
  type TaskStateChangeEvent,
  type TaskArtifactEvent,
  type TaskErrorEvent,

  // Task Router
  TaskRouter,
  createTaskRouter,
  type TaskRouterConfig,
  DEFAULT_ROUTER_CONFIG,

  // Routing Types
  type RoutingDecision,
  type RoutingRequest,
  type AlternativeAgent,

  // Load Balancing
  type AgentLoad,

  // Priority Queue
  type QueuedTask,
} from './tasks/index.js';

// ============================================================================
// OAuth 2.0 Authentication (ADR-054 Phase 5)
// ============================================================================

export {
  // Scope Definitions
  A2A_CORE_SCOPES,
  type A2ACoreScope,
  A2A_DOMAIN_SCOPES,
  type A2ADomainScope,
  A2A_SCOPES,
  type A2AScope,
  getScopeDescription,
  isValidScope,
  scopeHierarchy,
  expandScopes,
  validateScopes,
  getMissingScopes,
  normalizeScopes,
  parseScopeString,
  formatScopeString,
  getScopesByCategory,
  getQEDomainScopes,
  getCoreScopes,
  DEFAULT_CLIENT_SCOPES,
  ADMIN_SCOPES,

  // JWT Utilities
  type JWTPayload,
  type SignOptions,
  type VerifyOptions,
  type DecodedJWT,
  JWTError,
  type JWTErrorCode,
  signJWT,
  signAccessToken,
  signRefreshToken,
  verifyJWT,
  decodeJWT,
  isTokenExpired,
  getTokenTTL,
  extractScopesFromToken,
  tokenHasScope,
  generateTokenId,
  getCurrentTimestamp,

  // Token Store
  TokenStore,
  createTokenStore,
  type TokenStoreConfig,
  DEFAULT_TOKEN_STORE_CONFIG,
  type BaseTokenClaims,
  type AccessTokenClaims,
  type RefreshTokenClaims,
  type AuthorizationCodeClaims,
  type StoredTokenClaims,
  type TokenStoreStats,

  // OAuth 2.0 Provider
  OAuth2ProviderImpl,
  createOAuth2Provider,
  createTestOAuth2Provider,
  type OAuth2Config,
  DEFAULT_OAUTH2_CONFIG,
  type ClientCredentials,
  type AuthorizationCode,
  type TokenPair,
  OAuth2ProviderError,
  type OAuth2ProviderErrorResponse,
  type OAuth2ErrorCode,
  type OAuth2GrantType,

  // Middleware Types
  type TokenClaims,
  type JWTVerifier,
  type JWTAuthenticatedRequest,
  type JWTMiddlewareOptions,
  type ScopeOptions,
  type OAuthErrorType,
  type OAuthError,

  // Middleware Functions
  createOAuthError,
  extractBearerToken,
  parseScopes,
  createJWTMiddleware,
  jwtAuthMiddleware,
  requireScopes,
  hasScope,
  hasAnyScope,
  hasAllScopes,
  optionalAuth,
  mockAuthMiddleware,

  // Route Types
  type GrantType,
  type TokenRequest,
  type TokenResponse,
  type AuthorizationRequest,
  type RevokeRequest,
  type OpenIDConfiguration,
  type OAuth2Provider,
  type OAuthRouteDefinition,
  type OAuthRoutesConfig,

  // Route Configuration
  DEFAULT_OAUTH_ROUTES_CONFIG,

  // Route Factory
  getOAuthRouteDefinitions,
  createOAuthRoutes,

  // OAuth Utilities
  validateRedirectUri,
  generateCodeChallenge,
  verifyCodeChallenge,
} from './auth/index.js';

// ============================================================================
// Push Notifications (ADR-054 Phase 6)
// ============================================================================

export {
  // Signature Utilities
  SIGNATURE_HEADER,
  SIGNATURE_VERSION,
  DEFAULT_MAX_AGE_MS,
  MIN_TIMESTAMP,
  type ParsedSignature,
  type VerificationResult,
  generateSignature,
  generateSignatureHeader,
  parseSignatureHeader,
  verifySignature,
  isValidSignature,

  // Subscription Store
  type SubscriptionStatus,
  type Subscription,
  type CreateSubscriptionOptions,
  type UpdateSubscriptionOptions,
  type SubscriptionQueryOptions,
  type SubscriptionStats,
  type SubscriptionStoreConfig,
  DEFAULT_SUBSCRIPTION_STORE_CONFIG,
  SubscriptionStore,
  createSubscriptionStore,

  // Retry Queue
  type RetryConfig,
  type PendingDelivery,
  type DeliveryAttemptResult,
  type QueueStats,
  type RetryQueueConfig,
  DEFAULT_RETRY_CONFIG,
  DEFAULT_QUEUE_CONFIG,
  RetryQueue,
  createRetryQueue,

  // Webhook Service
  type WebhookEvent,
  type WebhookConfig,
  type WebhookPayload,
  type WebhookEventData,
  type DeliveryResult,
  type WebhookServiceConfig,
  type HttpClient as WebhookHttpClient,
  type HttpResponse as WebhookHttpResponse,
  type WebhookMetrics,
  DEFAULT_WEBHOOK_CONFIG,
  DEFAULT_SERVICE_CONFIG,
  statusToEvent,
  WebhookService,
  createWebhookService,

  // Convenience Constants
  WEBHOOK_EVENTS,
  STATE_CHANGE_EVENTS,
  TERMINAL_EVENTS,
} from './notifications/index.js';

// ============================================================================
// Discovery Enhancements (ADR-054 Phase 7)
// ============================================================================

export {
  // File Watcher
  AgentFileWatcher,
  createAgentFileWatcher,
  type FileWatcherConfig,
  DEFAULT_FILE_WATCHER_CONFIG,
  type FileEvent,
  type FileChangeEvent,
  type WatcherStatus,
  type FileWatcherEvents,

  // Hot Reload Service
  HotReloadService,
  createHotReloadService,
  type HotReloadServiceConfig,
  DEFAULT_HOT_RELOAD_CONFIG,
  type HotReloadEvent,
  type HotReloadStatus,
  type ReloadResult,
  type HotReloadEvents,

  // Agent Health Checker
  AgentHealthChecker,
  createAgentHealthChecker,
  type HealthCheckConfig,
  DEFAULT_HEALTH_CHECK_CONFIG,
  type HealthStatus,
  type AgentHealthStatus,
  type HealthCheckResult,
  type PeriodicCheckConfig,
  type HealthSummary,
  type HealthCheckerEvents,

  // Metrics
  MetricsCollector,
  createMetricsCollector,
  getGlobalMetrics,
  resetGlobalMetrics,
  type MetricsCollectorConfig,
  DEFAULT_METRICS_CONFIG,
  type MetricType,
  type MetricLabels,
  type DiscoveryMetrics,
} from './discovery/index.js';

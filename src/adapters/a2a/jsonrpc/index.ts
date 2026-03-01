/**
 * JSON-RPC 2.0 Implementation for A2A Protocol
 *
 * Barrel export for JSON-RPC message envelope, methods, and error handling.
 * Provides A2A v0.3 Protocol compliance for AQE v3.
 *
 * @module adapters/a2a/jsonrpc
 * @see https://www.jsonrpc.org/specification
 * @see https://a2a-protocol.org/latest/specification/
 */

// ============================================================================
// Error Codes and Error Handling
// ============================================================================

export {
  // Standard JSON-RPC 2.0 error codes
  STANDARD_ERRORS,
  STANDARD_ERROR_MESSAGES,
  type StandardErrorCode,

  // A2A-specific error codes
  A2A_ERRORS,
  A2A_ERROR_MESSAGES,
  type A2AErrorCode,

  // Combined error types
  ALL_ERRORS,
  ALL_ERROR_MESSAGES,
  type JsonRpcErrorCode,

  // Error classes and types
  JsonRpcError,
  type JsonRpcErrorObject,

  // Standard error factories
  createParseError,
  createInvalidRequestError,
  createMethodNotFoundError,
  createInvalidParamsError,
  createInternalError,

  // A2A error factories
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

  // Error utilities
  isStandardError,
  isA2AError,
  isValidErrorCode,
  getDefaultErrorMessage,
  getHttpStatusCode,
  getErrorCategory,
} from './errors.js';

// ============================================================================
// A2A Methods
// ============================================================================

export {
  // Method names
  A2A_METHODS,
  A2A_METHOD_DESCRIPTIONS,
  type A2AMethodName,

  // Message types
  type MessageRole,
  type TextPart,
  type FilePart,
  type DataPart,
  type MessagePart,
  type A2AMessage,

  // Task types
  type TaskStatus,
  TERMINAL_STATUSES,
  type A2AArtifact,
  type TaskError,
  type A2ATask,

  // Push notification types
  type PushNotificationConfig,

  // Method parameters
  type MessageSendParams,
  type MessageStreamParams,
  type TasksGetParams,
  type TasksListParams,
  type TasksCancelParams,
  type TasksResubmitParams,
  type TasksPushNotificationSetParams,
  type TasksPushNotificationGetParams,
  type A2AMethodParams,

  // Method results
  type MessageSendResult,
  type MessageStreamResult,
  type TasksGetResult,
  type TasksListResult,
  type TasksCancelResult,
  type TasksResubmitResult,
  type TasksPushNotificationSetResult,
  type TasksPushNotificationGetResult,
  type A2AMethodResult,

  // Method metadata
  type MethodMetadata,
  METHOD_METADATA,

  // Method validation utilities
  isValidMethod,
  getMethodMetadata,
  methodRequiresParams,
  isStreamingMethod,
  getAllMethods,
  getMethodsByCategory,
  isTerminalStatus,
  isValidStatusTransition,

  // Type guards for message parts
  isTextPart,
  isFilePart,
  isDataPart,
  extractTextFromParts,

  // Message factories
  createTextMessage,
  createDataMessage,
} from './methods.js';

// ============================================================================
// Message Envelope
// ============================================================================

export {
  // Constants
  JSONRPC_VERSION,
  MAX_ID_LENGTH,
  MAX_METHOD_LENGTH,

  // Request types
  type JsonRpcId,
  type JsonRpcRequest,
  type JsonRpcNotification,
  type A2ARequest,

  // Response types
  type JsonRpcSuccessResponse,
  type JsonRpcErrorResponse,
  type JsonRpcResponse,
  type A2AResponse,

  // Batch types
  type JsonRpcBatchRequest,
  type JsonRpcBatchResponse,

  // Result type for parsing
  type Result,
  ok,
  err,

  // Request creation
  generateRequestId,
  createRequest,
  createNotification,
  createA2ARequest,

  // Response creation
  createSuccessResponse,
  createErrorResponse,
  createErrorResponseFromError,

  // Validation
  type ValidationResult,
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

  // Type guards
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
} from './envelope.js';

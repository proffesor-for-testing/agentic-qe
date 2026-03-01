/**
 * JSON-RPC 2.0 Error Codes for A2A Protocol
 *
 * Implements standard JSON-RPC 2.0 error codes and A2A-specific error codes.
 * Error codes follow the JSON-RPC 2.0 specification:
 * - -32700 to -32600: Standard protocol errors
 * - -32099 to -32000: Server errors (reserved for implementation)
 * - -32001 to -32099: A2A-specific errors
 *
 * @module adapters/a2a/jsonrpc/errors
 * @see https://www.jsonrpc.org/specification
 * @see https://a2a-protocol.org/latest/specification/
 */

// ============================================================================
// Standard JSON-RPC 2.0 Error Codes
// ============================================================================

/**
 * Standard JSON-RPC 2.0 error codes as defined in the specification.
 */
export const STANDARD_ERRORS = {
  /** Invalid JSON was received by the server. */
  PARSE_ERROR: -32700,

  /** The JSON sent is not a valid Request object. */
  INVALID_REQUEST: -32600,

  /** The method does not exist / is not available. */
  METHOD_NOT_FOUND: -32601,

  /** Invalid method parameter(s). */
  INVALID_PARAMS: -32602,

  /** Internal JSON-RPC error. */
  INTERNAL_ERROR: -32603,
} as const;

/**
 * Type representing standard JSON-RPC 2.0 error codes.
 */
export type StandardErrorCode = (typeof STANDARD_ERRORS)[keyof typeof STANDARD_ERRORS];

/**
 * Human-readable messages for standard errors.
 */
export const STANDARD_ERROR_MESSAGES: Record<StandardErrorCode, string> = {
  [STANDARD_ERRORS.PARSE_ERROR]: 'Parse error: Invalid JSON',
  [STANDARD_ERRORS.INVALID_REQUEST]: 'Invalid Request: Not a valid JSON-RPC 2.0 request',
  [STANDARD_ERRORS.METHOD_NOT_FOUND]: 'Method not found',
  [STANDARD_ERRORS.INVALID_PARAMS]: 'Invalid params',
  [STANDARD_ERRORS.INTERNAL_ERROR]: 'Internal error',
};

// ============================================================================
// A2A-Specific Error Codes
// ============================================================================

/**
 * A2A-specific error codes for task and agent operations.
 * Range: -32001 to -32099
 */
export const A2A_ERRORS = {
  // Task errors (-32001 to -32009)
  /** The requested task was not found. */
  TASK_NOT_FOUND: -32001,

  /** The task cannot be canceled (already completed or in non-cancelable state). */
  TASK_NOT_CANCELABLE: -32002,

  /** Push notifications are not supported by this agent. */
  PUSH_NOTIFICATION_NOT_SUPPORTED: -32003,

  /** The requested operation is not supported by this agent. */
  UNSUPPORTED_OPERATION: -32004,

  /** The content type is not supported by this agent. */
  CONTENT_TYPE_NOT_SUPPORTED: -32005,

  // Agent card errors (-32010 to -32019)
  /** The agent card is invalid or malformed. */
  INVALID_AGENT_CARD: -32010,

  // Authentication errors (-32020 to -32029)
  /** Authentication is required to access this resource. */
  AUTHENTICATION_REQUIRED: -32020,

  /** Authorization failed - insufficient permissions. */
  AUTHORIZATION_FAILED: -32021,

  // Rate limiting errors (-32030 to -32039)
  /** Rate limit exceeded - too many requests. */
  RATE_LIMIT_EXCEEDED: -32030,

  // Agent availability errors (-32040 to -32049)
  /** The agent is currently unavailable. */
  AGENT_UNAVAILABLE: -32040,

  /** The agent is busy and cannot accept new tasks. */
  AGENT_BUSY: -32041,

  /** The task timed out while waiting for the agent. */
  TASK_TIMEOUT: -32042,
} as const;

/**
 * Type representing A2A-specific error codes.
 */
export type A2AErrorCode = (typeof A2A_ERRORS)[keyof typeof A2A_ERRORS];

/**
 * Human-readable messages for A2A errors.
 */
export const A2A_ERROR_MESSAGES: Record<A2AErrorCode, string> = {
  [A2A_ERRORS.TASK_NOT_FOUND]: 'Task not found',
  [A2A_ERRORS.TASK_NOT_CANCELABLE]: 'Task cannot be canceled',
  [A2A_ERRORS.PUSH_NOTIFICATION_NOT_SUPPORTED]: 'Push notifications not supported',
  [A2A_ERRORS.UNSUPPORTED_OPERATION]: 'Unsupported operation',
  [A2A_ERRORS.CONTENT_TYPE_NOT_SUPPORTED]: 'Content type not supported',
  [A2A_ERRORS.INVALID_AGENT_CARD]: 'Invalid agent card',
  [A2A_ERRORS.AUTHENTICATION_REQUIRED]: 'Authentication required',
  [A2A_ERRORS.AUTHORIZATION_FAILED]: 'Authorization failed',
  [A2A_ERRORS.RATE_LIMIT_EXCEEDED]: 'Rate limit exceeded',
  [A2A_ERRORS.AGENT_UNAVAILABLE]: 'Agent unavailable',
  [A2A_ERRORS.AGENT_BUSY]: 'Agent busy',
  [A2A_ERRORS.TASK_TIMEOUT]: 'Task timeout',
};

// ============================================================================
// Combined Error Types
// ============================================================================

/**
 * All valid JSON-RPC error codes (standard + A2A).
 */
export type JsonRpcErrorCode = StandardErrorCode | A2AErrorCode;

/**
 * All error constants combined.
 */
export const ALL_ERRORS = {
  ...STANDARD_ERRORS,
  ...A2A_ERRORS,
} as const;

/**
 * All error messages combined.
 */
export const ALL_ERROR_MESSAGES: Record<JsonRpcErrorCode, string> = {
  ...STANDARD_ERROR_MESSAGES,
  ...A2A_ERROR_MESSAGES,
};

// ============================================================================
// Error Classes
// ============================================================================

/**
 * JSON-RPC 2.0 Error object.
 */
export interface JsonRpcErrorObject {
  /** Error code (integer) */
  code: number;

  /** Human-readable error message */
  message: string;

  /** Additional error data (optional) */
  data?: unknown;
}

/**
 * Custom error class for JSON-RPC errors.
 */
export class JsonRpcError extends Error {
  /** Error code */
  public readonly code: number;

  /** Additional error data */
  public readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'JsonRpcError';
    this.code = code;
    this.data = data;

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, JsonRpcError);
    }
  }

  /**
   * Convert to JSON-RPC error object format.
   */
  toErrorObject(): JsonRpcErrorObject {
    const obj: JsonRpcErrorObject = {
      code: this.code,
      message: this.message,
    };

    if (this.data !== undefined) {
      obj.data = this.data;
    }

    return obj;
  }

  /**
   * Create from JSON-RPC error object.
   */
  static fromErrorObject(obj: JsonRpcErrorObject): JsonRpcError {
    return new JsonRpcError(obj.code, obj.message, obj.data);
  }
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create a parse error (-32700).
 */
export function createParseError(details?: string): JsonRpcError {
  const message = details
    ? `${STANDARD_ERROR_MESSAGES[STANDARD_ERRORS.PARSE_ERROR]}: ${details}`
    : STANDARD_ERROR_MESSAGES[STANDARD_ERRORS.PARSE_ERROR];
  return new JsonRpcError(STANDARD_ERRORS.PARSE_ERROR, message, details ? { details } : undefined);
}

/**
 * Create an invalid request error (-32600).
 */
export function createInvalidRequestError(details?: string): JsonRpcError {
  const message = details
    ? `${STANDARD_ERROR_MESSAGES[STANDARD_ERRORS.INVALID_REQUEST]}: ${details}`
    : STANDARD_ERROR_MESSAGES[STANDARD_ERRORS.INVALID_REQUEST];
  return new JsonRpcError(
    STANDARD_ERRORS.INVALID_REQUEST,
    message,
    details ? { details } : undefined
  );
}

/**
 * Create a method not found error (-32601).
 */
export function createMethodNotFoundError(method: string): JsonRpcError {
  return new JsonRpcError(
    STANDARD_ERRORS.METHOD_NOT_FOUND,
    `${STANDARD_ERROR_MESSAGES[STANDARD_ERRORS.METHOD_NOT_FOUND]}: ${method}`,
    { method }
  );
}

/**
 * Create an invalid params error (-32602).
 */
export function createInvalidParamsError(details?: string): JsonRpcError {
  const message = details
    ? `${STANDARD_ERROR_MESSAGES[STANDARD_ERRORS.INVALID_PARAMS]}: ${details}`
    : STANDARD_ERROR_MESSAGES[STANDARD_ERRORS.INVALID_PARAMS];
  return new JsonRpcError(
    STANDARD_ERRORS.INVALID_PARAMS,
    message,
    details ? { details } : undefined
  );
}

/**
 * Create an internal error (-32603).
 */
export function createInternalError(details?: string): JsonRpcError {
  const message = details
    ? `${STANDARD_ERROR_MESSAGES[STANDARD_ERRORS.INTERNAL_ERROR]}: ${details}`
    : STANDARD_ERROR_MESSAGES[STANDARD_ERRORS.INTERNAL_ERROR];
  return new JsonRpcError(
    STANDARD_ERRORS.INTERNAL_ERROR,
    message,
    details ? { details } : undefined
  );
}

/**
 * Create a task not found error (-32001).
 */
export function createTaskNotFoundError(taskId: string): JsonRpcError {
  return new JsonRpcError(
    A2A_ERRORS.TASK_NOT_FOUND,
    `${A2A_ERROR_MESSAGES[A2A_ERRORS.TASK_NOT_FOUND]}: ${taskId}`,
    { taskId }
  );
}

/**
 * Create a task not cancelable error (-32002).
 */
export function createTaskNotCancelableError(taskId: string, reason?: string): JsonRpcError {
  const message = reason
    ? `${A2A_ERROR_MESSAGES[A2A_ERRORS.TASK_NOT_CANCELABLE]}: ${reason}`
    : A2A_ERROR_MESSAGES[A2A_ERRORS.TASK_NOT_CANCELABLE];
  return new JsonRpcError(A2A_ERRORS.TASK_NOT_CANCELABLE, message, { taskId, reason });
}

/**
 * Create a push notification not supported error (-32003).
 */
export function createPushNotificationNotSupportedError(): JsonRpcError {
  return new JsonRpcError(
    A2A_ERRORS.PUSH_NOTIFICATION_NOT_SUPPORTED,
    A2A_ERROR_MESSAGES[A2A_ERRORS.PUSH_NOTIFICATION_NOT_SUPPORTED]
  );
}

/**
 * Create an unsupported operation error (-32004).
 */
export function createUnsupportedOperationError(operation: string): JsonRpcError {
  return new JsonRpcError(
    A2A_ERRORS.UNSUPPORTED_OPERATION,
    `${A2A_ERROR_MESSAGES[A2A_ERRORS.UNSUPPORTED_OPERATION]}: ${operation}`,
    { operation }
  );
}

/**
 * Create a content type not supported error (-32005).
 */
export function createContentTypeNotSupportedError(contentType: string): JsonRpcError {
  return new JsonRpcError(
    A2A_ERRORS.CONTENT_TYPE_NOT_SUPPORTED,
    `${A2A_ERROR_MESSAGES[A2A_ERRORS.CONTENT_TYPE_NOT_SUPPORTED]}: ${contentType}`,
    { contentType }
  );
}

/**
 * Create an invalid agent card error (-32010).
 */
export function createInvalidAgentCardError(details?: string): JsonRpcError {
  const message = details
    ? `${A2A_ERROR_MESSAGES[A2A_ERRORS.INVALID_AGENT_CARD]}: ${details}`
    : A2A_ERROR_MESSAGES[A2A_ERRORS.INVALID_AGENT_CARD];
  return new JsonRpcError(
    A2A_ERRORS.INVALID_AGENT_CARD,
    message,
    details ? { details } : undefined
  );
}

/**
 * Create an authentication required error (-32020).
 */
export function createAuthenticationRequiredError(realm?: string): JsonRpcError {
  return new JsonRpcError(
    A2A_ERRORS.AUTHENTICATION_REQUIRED,
    A2A_ERROR_MESSAGES[A2A_ERRORS.AUTHENTICATION_REQUIRED],
    realm ? { realm } : undefined
  );
}

/**
 * Create an authorization failed error (-32021).
 */
export function createAuthorizationFailedError(requiredScope?: string): JsonRpcError {
  return new JsonRpcError(
    A2A_ERRORS.AUTHORIZATION_FAILED,
    A2A_ERROR_MESSAGES[A2A_ERRORS.AUTHORIZATION_FAILED],
    requiredScope ? { requiredScope } : undefined
  );
}

/**
 * Create a rate limit exceeded error (-32030).
 */
export function createRateLimitExceededError(retryAfter?: number): JsonRpcError {
  return new JsonRpcError(
    A2A_ERRORS.RATE_LIMIT_EXCEEDED,
    A2A_ERROR_MESSAGES[A2A_ERRORS.RATE_LIMIT_EXCEEDED],
    retryAfter !== undefined ? { retryAfter } : undefined
  );
}

/**
 * Create an agent unavailable error (-32040).
 */
export function createAgentUnavailableError(agentId?: string): JsonRpcError {
  return new JsonRpcError(
    A2A_ERRORS.AGENT_UNAVAILABLE,
    A2A_ERROR_MESSAGES[A2A_ERRORS.AGENT_UNAVAILABLE],
    agentId ? { agentId } : undefined
  );
}

/**
 * Create an agent busy error (-32041).
 */
export function createAgentBusyError(agentId?: string, queuePosition?: number): JsonRpcError {
  return new JsonRpcError(A2A_ERRORS.AGENT_BUSY, A2A_ERROR_MESSAGES[A2A_ERRORS.AGENT_BUSY], {
    ...(agentId && { agentId }),
    ...(queuePosition !== undefined && { queuePosition }),
  });
}

/**
 * Create a task timeout error (-32042).
 */
export function createTaskTimeoutError(taskId: string, timeoutMs?: number): JsonRpcError {
  return new JsonRpcError(A2A_ERRORS.TASK_TIMEOUT, A2A_ERROR_MESSAGES[A2A_ERRORS.TASK_TIMEOUT], {
    taskId,
    ...(timeoutMs !== undefined && { timeoutMs }),
  });
}

// ============================================================================
// Error Utilities
// ============================================================================

/**
 * Check if an error code is a standard JSON-RPC 2.0 error.
 */
export function isStandardError(code: number): code is StandardErrorCode {
  return Object.values(STANDARD_ERRORS).includes(code as StandardErrorCode);
}

/**
 * Check if an error code is an A2A-specific error.
 */
export function isA2AError(code: number): code is A2AErrorCode {
  return Object.values(A2A_ERRORS).includes(code as A2AErrorCode);
}

/**
 * Check if an error code is valid (standard or A2A).
 */
export function isValidErrorCode(code: number): code is JsonRpcErrorCode {
  return isStandardError(code) || isA2AError(code);
}

/**
 * Get the default message for an error code.
 */
export function getDefaultErrorMessage(code: number): string {
  if (isValidErrorCode(code)) {
    return ALL_ERROR_MESSAGES[code];
  }
  return 'Unknown error';
}

/**
 * Get HTTP status code for a JSON-RPC error code.
 * Used for HTTP transport mapping.
 */
export function getHttpStatusCode(code: number): number {
  switch (code) {
    case STANDARD_ERRORS.PARSE_ERROR:
    case STANDARD_ERRORS.INVALID_REQUEST:
    case STANDARD_ERRORS.INVALID_PARAMS:
    case A2A_ERRORS.CONTENT_TYPE_NOT_SUPPORTED:
    case A2A_ERRORS.INVALID_AGENT_CARD:
      return 400; // Bad Request

    case A2A_ERRORS.AUTHENTICATION_REQUIRED:
      return 401; // Unauthorized

    case A2A_ERRORS.AUTHORIZATION_FAILED:
      return 403; // Forbidden

    case STANDARD_ERRORS.METHOD_NOT_FOUND:
    case A2A_ERRORS.TASK_NOT_FOUND:
      return 404; // Not Found

    case A2A_ERRORS.TASK_NOT_CANCELABLE:
    case A2A_ERRORS.UNSUPPORTED_OPERATION:
      return 409; // Conflict

    case A2A_ERRORS.RATE_LIMIT_EXCEEDED:
      return 429; // Too Many Requests

    case STANDARD_ERRORS.INTERNAL_ERROR:
    case A2A_ERRORS.AGENT_UNAVAILABLE:
    case A2A_ERRORS.AGENT_BUSY:
    case A2A_ERRORS.TASK_TIMEOUT:
    case A2A_ERRORS.PUSH_NOTIFICATION_NOT_SUPPORTED:
    default:
      return 500; // Internal Server Error
  }
}

/**
 * Get error category for classification.
 */
export function getErrorCategory(
  code: number
): 'parse' | 'request' | 'method' | 'params' | 'internal' | 'task' | 'auth' | 'rate' | 'agent' {
  if (code === STANDARD_ERRORS.PARSE_ERROR) return 'parse';
  if (code === STANDARD_ERRORS.INVALID_REQUEST) return 'request';
  if (code === STANDARD_ERRORS.METHOD_NOT_FOUND) return 'method';
  if (code === STANDARD_ERRORS.INVALID_PARAMS) return 'params';
  if (code === STANDARD_ERRORS.INTERNAL_ERROR) return 'internal';
  if (code >= -32009 && code <= -32001) return 'task';
  if (code >= -32029 && code <= -32020) return 'auth';
  if (code >= -32039 && code <= -32030) return 'rate';
  if (code >= -32049 && code <= -32040) return 'agent';
  return 'internal';
}

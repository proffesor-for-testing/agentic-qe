/**
 * JSON-RPC 2.0 Message Envelope for A2A Protocol
 *
 * Implements the JSON-RPC 2.0 message format for A2A communication.
 * Provides request/response creation, parsing, and validation.
 *
 * @module adapters/a2a/jsonrpc/envelope
 * @see https://www.jsonrpc.org/specification
 * @see https://a2a-protocol.org/latest/specification/
 */

import {
  JsonRpcError,
  STANDARD_ERRORS,
  createParseError,
  createInvalidRequestError,
  createMethodNotFoundError,
  createInvalidParamsError,
  type JsonRpcErrorObject,
} from './errors.js';
import {
  isValidMethod,
  methodRequiresParams,
  type A2AMethodName,
  type A2AMethodParams,
  type A2AMethodResult,
} from './methods.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * JSON-RPC 2.0 protocol version.
 */
export const JSONRPC_VERSION = '2.0' as const;

/**
 * Maximum request ID length.
 */
export const MAX_ID_LENGTH = 256;

/**
 * Maximum method name length.
 */
export const MAX_METHOD_LENGTH = 128;

// ============================================================================
// Request Types
// ============================================================================

/**
 * JSON-RPC 2.0 Request ID type.
 * Can be string, number, or null (for notifications).
 */
export type JsonRpcId = string | number | null;

/**
 * JSON-RPC 2.0 Request structure.
 */
export interface JsonRpcRequest<P = Record<string, unknown>> {
  /** Protocol version - MUST be exactly "2.0" */
  jsonrpc: typeof JSONRPC_VERSION;

  /** Request identifier */
  id: string | number;

  /** Method name to invoke */
  method: string;

  /** Method parameters (optional) */
  params?: P;
}

/**
 * JSON-RPC 2.0 Notification (request without id).
 */
export interface JsonRpcNotification<P = Record<string, unknown>> {
  /** Protocol version - MUST be exactly "2.0" */
  jsonrpc: typeof JSONRPC_VERSION;

  /** Method name to invoke */
  method: string;

  /** Method parameters (optional) */
  params?: P;
}

/**
 * Typed A2A Request with known method and params.
 */
export interface A2ARequest<M extends A2AMethodName = A2AMethodName, P = A2AMethodParams>
  extends JsonRpcRequest<P> {
  method: M;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * JSON-RPC 2.0 Success Response structure.
 */
export interface JsonRpcSuccessResponse<R = unknown> {
  /** Protocol version - MUST be exactly "2.0" */
  jsonrpc: typeof JSONRPC_VERSION;

  /** Request identifier (matches request id) */
  id: string | number | null;

  /** Result of the method invocation */
  result: R;
}

/**
 * JSON-RPC 2.0 Error Response structure.
 */
export interface JsonRpcErrorResponse {
  /** Protocol version - MUST be exactly "2.0" */
  jsonrpc: typeof JSONRPC_VERSION;

  /** Request identifier (null if request id couldn't be determined) */
  id: string | number | null;

  /** Error object */
  error: JsonRpcErrorObject;
}

/**
 * Union of success and error responses.
 */
export type JsonRpcResponse<R = unknown> = JsonRpcSuccessResponse<R> | JsonRpcErrorResponse;

/**
 * Typed A2A Response.
 */
export type A2AResponse<R = A2AMethodResult> = JsonRpcResponse<R>;

// ============================================================================
// Batch Types
// ============================================================================

/**
 * JSON-RPC 2.0 Batch Request.
 */
export type JsonRpcBatchRequest = JsonRpcRequest[];

/**
 * JSON-RPC 2.0 Batch Response.
 */
export type JsonRpcBatchResponse = JsonRpcResponse[];

// ============================================================================
// Result Type for Parsing
// ============================================================================

/**
 * Result type for operations that can fail.
 */
export type Result<T, E = JsonRpcError> =
  | { success: true; value: T }
  | { success: false; error: E };

/**
 * Create a success result.
 */
export function ok<T>(value: T): Result<T, never> {
  return { success: true, value };
}

/**
 * Create an error result.
 */
export function err<E>(error: E): Result<never, E> {
  return { success: false, error };
}

// ============================================================================
// Request Creation
// ============================================================================

let requestIdCounter = 0;

/**
 * Generate a unique request ID.
 */
export function generateRequestId(): string {
  return `req-${Date.now()}-${++requestIdCounter}`;
}

/**
 * Create a JSON-RPC 2.0 request.
 *
 * @param method - Method name to invoke
 * @param params - Method parameters (optional)
 * @param id - Request ID (auto-generated if not provided)
 * @returns JSON-RPC 2.0 request object
 */
export function createRequest<P = Record<string, unknown>>(
  method: string,
  params?: P,
  id?: string | number
): JsonRpcRequest<P> {
  const request: JsonRpcRequest<P> = {
    jsonrpc: JSONRPC_VERSION,
    id: id ?? generateRequestId(),
    method,
  };

  if (params !== undefined) {
    request.params = params;
  }

  return request;
}

/**
 * Create a JSON-RPC 2.0 notification (request without id).
 *
 * @param method - Method name to invoke
 * @param params - Method parameters (optional)
 * @returns JSON-RPC 2.0 notification object
 */
export function createNotification<P = Record<string, unknown>>(
  method: string,
  params?: P
): JsonRpcNotification<P> {
  const notification: JsonRpcNotification<P> = {
    jsonrpc: JSONRPC_VERSION,
    method,
  };

  if (params !== undefined) {
    notification.params = params;
  }

  return notification;
}

/**
 * Create a typed A2A request.
 *
 * @param method - A2A method name
 * @param params - Method parameters
 * @param id - Request ID (auto-generated if not provided)
 * @returns Typed A2A request object
 */
export function createA2ARequest<M extends A2AMethodName>(
  method: M,
  params?: A2AMethodParams,
  id?: string | number
): A2ARequest<M> {
  return createRequest(method, params, id) as A2ARequest<M>;
}

// ============================================================================
// Response Creation
// ============================================================================

/**
 * Create a JSON-RPC 2.0 success response.
 *
 * @param id - Request ID (from the original request)
 * @param result - Result value
 * @returns JSON-RPC 2.0 success response
 */
export function createSuccessResponse<R = unknown>(
  id: string | number | null,
  result: R
): JsonRpcSuccessResponse<R> {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

/**
 * Create a JSON-RPC 2.0 error response.
 *
 * @param id - Request ID (null if couldn't be determined)
 * @param code - Error code
 * @param message - Error message
 * @param data - Additional error data (optional)
 * @returns JSON-RPC 2.0 error response
 */
export function createErrorResponse(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcErrorResponse {
  const response: JsonRpcErrorResponse = {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: {
      code,
      message,
    },
  };

  if (data !== undefined) {
    response.error.data = data;
  }

  return response;
}

/**
 * Create an error response from a JsonRpcError.
 *
 * @param id - Request ID
 * @param error - JsonRpcError instance
 * @returns JSON-RPC 2.0 error response
 */
export function createErrorResponseFromError(
  id: string | number | null,
  error: JsonRpcError
): JsonRpcErrorResponse {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    error: error.toErrorObject(),
  };
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation result with detailed error information.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a JSON-RPC request ID.
 */
export function validateId(id: unknown): ValidationResult {
  const errors: string[] = [];

  if (id === undefined) {
    errors.push('id is required');
  } else if (typeof id !== 'string' && typeof id !== 'number') {
    errors.push('id must be a string or number');
  } else if (typeof id === 'string' && id.length > MAX_ID_LENGTH) {
    errors.push(`id length exceeds maximum (${MAX_ID_LENGTH})`);
  } else if (typeof id === 'number' && (!Number.isFinite(id) || Number.isNaN(id))) {
    errors.push('id must be a finite number');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a JSON-RPC method name.
 */
export function validateMethod(method: unknown): ValidationResult {
  const errors: string[] = [];

  if (method === undefined || method === null) {
    errors.push('method is required');
  } else if (typeof method !== 'string') {
    errors.push('method must be a string');
  } else if (method.length === 0) {
    errors.push('method cannot be empty');
  } else if (method.length > MAX_METHOD_LENGTH) {
    errors.push(`method length exceeds maximum (${MAX_METHOD_LENGTH})`);
  } else if (method.startsWith('rpc.')) {
    errors.push('method names starting with "rpc." are reserved');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a JSON-RPC params object.
 */
export function validateParams(params: unknown, method?: string): ValidationResult {
  const errors: string[] = [];

  if (params !== undefined) {
    if (typeof params !== 'object' || params === null || Array.isArray(params)) {
      errors.push('params must be an object (A2A uses named parameters only)');
    }
  }

  // Check if method requires params
  if (method && isValidMethod(method) && methodRequiresParams(method) && params === undefined) {
    errors.push(`params are required for method ${method}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a complete JSON-RPC 2.0 request structure.
 */
export function validateRequestStructure(request: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof request !== 'object' || request === null) {
    return { valid: false, errors: ['Request must be an object'] };
  }

  const req = request as Record<string, unknown>;

  // Validate jsonrpc version
  if (req.jsonrpc !== JSONRPC_VERSION) {
    errors.push(`jsonrpc must be exactly "${JSONRPC_VERSION}"`);
  }

  // Validate id
  const idResult = validateId(req.id);
  errors.push(...idResult.errors);

  // Validate method
  const methodResult = validateMethod(req.method);
  errors.push(...methodResult.errors);

  // Validate params
  const paramsResult = validateParams(req.params, req.method as string);
  errors.push(...paramsResult.errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that a method is a known A2A method.
 */
export function validateA2AMethod(method: string): ValidationResult {
  if (!isValidMethod(method)) {
    return {
      valid: false,
      errors: [`Unknown A2A method: ${method}`],
    };
  }
  return { valid: true, errors: [] };
}

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse a JSON string into a JSON-RPC request.
 *
 * @param json - JSON string to parse
 * @returns Result with parsed request or error
 */
export function parseRequest(json: string): Result<JsonRpcRequest, JsonRpcError> {
  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown parse error';
    return err(createParseError(message));
  }

  // Handle batch requests (return error for now - handle separately)
  if (Array.isArray(parsed)) {
    return err(createInvalidRequestError('Batch requests should use parseBatchRequest'));
  }

  // Validate structure
  const validation = validateRequestStructure(parsed);
  if (!validation.valid) {
    return err(createInvalidRequestError(validation.errors.join('; ')));
  }

  return ok(parsed as JsonRpcRequest);
}

/**
 * Parse and validate as an A2A request.
 *
 * @param json - JSON string to parse
 * @returns Result with parsed A2A request or error
 */
export function parseA2ARequest(json: string): Result<A2ARequest, JsonRpcError> {
  const result = parseRequest(json);

  if (result.success === false) {
    return err(result.error);
  }

  // Validate A2A method
  const methodValidation = validateA2AMethod(result.value.method);
  if (!methodValidation.valid) {
    return err(createMethodNotFoundError(result.value.method));
  }

  return ok(result.value as A2ARequest);
}

/**
 * Parse a batch of JSON-RPC requests.
 *
 * @param json - JSON string to parse
 * @returns Result with parsed requests or error
 */
export function parseBatchRequest(json: string): Result<JsonRpcRequest[], JsonRpcError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown parse error';
    return err(createParseError(message));
  }

  if (!Array.isArray(parsed)) {
    return err(createInvalidRequestError('Batch request must be an array'));
  }

  if (parsed.length === 0) {
    return err(createInvalidRequestError('Batch request cannot be empty'));
  }

  const requests: JsonRpcRequest[] = [];
  const errors: string[] = [];

  for (let i = 0; i < parsed.length; i++) {
    const validation = validateRequestStructure(parsed[i]);
    if (!validation.valid) {
      errors.push(`Request[${i}]: ${validation.errors.join('; ')}`);
    } else {
      requests.push(parsed[i] as JsonRpcRequest);
    }
  }

  if (errors.length > 0) {
    return err(createInvalidRequestError(errors.join('; ')));
  }

  return ok(requests);
}

/**
 * Parse a JSON-RPC response.
 *
 * @param json - JSON string to parse
 * @returns Result with parsed response or error
 */
export function parseResponse(json: string): Result<JsonRpcResponse, JsonRpcError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown parse error';
    return err(createParseError(message));
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return err(createInvalidRequestError('Response must be an object'));
  }

  const resp = parsed as Record<string, unknown>;

  // Validate jsonrpc version
  if (resp.jsonrpc !== JSONRPC_VERSION) {
    return err(createInvalidRequestError(`jsonrpc must be exactly "${JSONRPC_VERSION}"`));
  }

  // Must have either result or error, but not both
  const hasResult = 'result' in resp;
  const hasError = 'error' in resp;

  if (!hasResult && !hasError) {
    return err(createInvalidRequestError('Response must have either result or error'));
  }

  if (hasResult && hasError) {
    return err(createInvalidRequestError('Response cannot have both result and error'));
  }

  // Validate error object structure if present
  if (hasError) {
    const error = resp.error;
    if (typeof error !== 'object' || error === null) {
      return err(createInvalidRequestError('error must be an object'));
    }

    const errorObj = error as Record<string, unknown>;
    if (typeof errorObj.code !== 'number') {
      return err(createInvalidRequestError('error.code must be a number'));
    }
    if (typeof errorObj.message !== 'string') {
      return err(createInvalidRequestError('error.message must be a string'));
    }
  }

  return ok(parsed as JsonRpcResponse);
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize a JSON-RPC request to JSON string.
 *
 * @param request - Request object to serialize
 * @returns JSON string
 */
export function serializeRequest(request: JsonRpcRequest): string {
  return JSON.stringify(request);
}

/**
 * Serialize a JSON-RPC response to JSON string.
 *
 * @param response - Response object to serialize
 * @returns JSON string
 */
export function serializeResponse(response: JsonRpcResponse): string {
  return JSON.stringify(response);
}

/**
 * Serialize a batch of requests to JSON string.
 *
 * @param requests - Array of request objects
 * @returns JSON string
 */
export function serializeBatchRequest(requests: JsonRpcRequest[]): string {
  return JSON.stringify(requests);
}

/**
 * Serialize a batch of responses to JSON string.
 *
 * @param responses - Array of response objects
 * @returns JSON string
 */
export function serializeBatchResponse(responses: JsonRpcResponse[]): string {
  return JSON.stringify(responses);
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a response is a success response.
 */
export function isSuccessResponse<R = unknown>(
  response: JsonRpcResponse<R>
): response is JsonRpcSuccessResponse<R> {
  return 'result' in response;
}

/**
 * Check if a response is an error response.
 */
export function isErrorResponse(response: JsonRpcResponse): response is JsonRpcErrorResponse {
  return 'error' in response;
}

/**
 * Check if an object is a JSON-RPC request.
 */
export function isRequest(obj: unknown): obj is JsonRpcRequest {
  if (typeof obj !== 'object' || obj === null) return false;
  const req = obj as Record<string, unknown>;
  return req.jsonrpc === JSONRPC_VERSION && typeof req.method === 'string' && 'id' in req;
}

/**
 * Check if an object is a JSON-RPC notification.
 */
export function isNotification(obj: unknown): obj is JsonRpcNotification {
  if (typeof obj !== 'object' || obj === null) return false;
  const notif = obj as Record<string, unknown>;
  return notif.jsonrpc === JSONRPC_VERSION && typeof notif.method === 'string' && !('id' in notif);
}

/**
 * Check if an object is a JSON-RPC response.
 */
export function isResponse(obj: unknown): obj is JsonRpcResponse {
  if (typeof obj !== 'object' || obj === null) return false;
  const resp = obj as Record<string, unknown>;
  return resp.jsonrpc === JSONRPC_VERSION && ('result' in resp || 'error' in resp);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract the request ID from a request, handling parse errors gracefully.
 */
export function extractRequestId(json: string): string | number | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null) {
      const id = (parsed as Record<string, unknown>).id;
      if (typeof id === 'string' || typeof id === 'number') {
        return id;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Create a response matcher for correlating requests and responses.
 */
export function createResponseMatcher() {
  const pending = new Map<string | number, (response: JsonRpcResponse) => void>();

  return {
    /**
     * Register a pending request.
     */
    register(id: string | number): Promise<JsonRpcResponse> {
      return new Promise((resolve) => {
        pending.set(id, resolve);
      });
    },

    /**
     * Resolve a pending request with a response.
     */
    resolve(response: JsonRpcResponse): boolean {
      const resolver = pending.get(response.id as string | number);
      if (resolver) {
        pending.delete(response.id as string | number);
        resolver(response);
        return true;
      }
      return false;
    },

    /**
     * Cancel a pending request.
     */
    cancel(id: string | number): boolean {
      return pending.delete(id);
    },

    /**
     * Get count of pending requests.
     */
    get pendingCount(): number {
      return pending.size;
    },

    /**
     * Clear all pending requests.
     */
    clear(): void {
      pending.clear();
    },
  };
}

/**
 * Format a request for logging (redacts sensitive data).
 */
export function formatRequestForLogging(request: JsonRpcRequest): string {
  const summary = {
    id: request.id,
    method: request.method,
    hasParams: request.params !== undefined,
  };
  return JSON.stringify(summary);
}

/**
 * Format a response for logging.
 */
export function formatResponseForLogging(response: JsonRpcResponse): string {
  if (isErrorResponse(response)) {
    return JSON.stringify({
      id: response.id,
      error: {
        code: response.error.code,
        message: response.error.message,
      },
    });
  }
  return JSON.stringify({
    id: response.id,
    hasResult: true,
  });
}

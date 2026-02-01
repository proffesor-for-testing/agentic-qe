/**
 * JSON-RPC 2.0 A2A Protocol Unit Tests
 *
 * Comprehensive test suite covering:
 * - Error codes (standard and A2A-specific)
 * - Method definitions and validation
 * - Request/response creation and parsing
 * - Serialization and deserialization
 * - Type guards and utilities
 *
 * Target: 40+ tests with full coverage
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Error codes
  STANDARD_ERRORS,
  A2A_ERRORS,
  ALL_ERRORS,
  STANDARD_ERROR_MESSAGES,
  A2A_ERROR_MESSAGES,
  ALL_ERROR_MESSAGES,
  JsonRpcError,

  // Error factories
  createParseError,
  createInvalidRequestError,
  createMethodNotFoundError,
  createInvalidParamsError,
  createInternalError,
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

  // Methods
  A2A_METHODS,
  A2A_METHOD_DESCRIPTIONS,
  METHOD_METADATA,
  TERMINAL_STATUSES,
  isValidMethod,
  getMethodMetadata,
  methodRequiresParams,
  isStreamingMethod,
  getAllMethods,
  getMethodsByCategory,
  isTerminalStatus,
  isValidStatusTransition,
  isTextPart,
  isFilePart,
  isDataPart,
  extractTextFromParts,
  createTextMessage,
  createDataMessage,

  // Envelope
  JSONRPC_VERSION,
  MAX_ID_LENGTH,
  MAX_METHOD_LENGTH,
  generateRequestId,
  createRequest,
  createNotification,
  createA2ARequest,
  createSuccessResponse,
  createErrorResponse,
  createErrorResponseFromError,
  validateId,
  validateMethod,
  validateParams,
  validateRequestStructure,
  validateA2AMethod,
  parseRequest,
  parseA2ARequest,
  parseBatchRequest,
  parseResponse,
  serializeRequest,
  serializeResponse,
  serializeBatchRequest,
  serializeBatchResponse,
  isSuccessResponse,
  isErrorResponse,
  isRequest,
  isNotification,
  isResponse,
  extractRequestId,
  createResponseMatcher,
  formatRequestForLogging,
  formatResponseForLogging,
  ok,
  err,

  // Types
  type JsonRpcRequest,
  type JsonRpcResponse,
  type MessagePart,
  type TaskStatus,
} from '../../../../src/adapters/a2a/jsonrpc/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const validRequest: JsonRpcRequest = {
  jsonrpc: '2.0',
  id: 'req-001',
  method: 'message/send',
  params: {
    message: {
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    },
  },
};

const validSuccessResponse: JsonRpcResponse = {
  jsonrpc: '2.0',
  id: 'req-001',
  result: { task: { id: 'task-001', status: 'completed' } },
};

const validErrorResponse: JsonRpcResponse = {
  jsonrpc: '2.0',
  id: 'req-001',
  error: {
    code: -32600,
    message: 'Invalid Request',
  },
};

// ============================================================================
// Error Codes Tests
// ============================================================================

describe('Error Codes', () => {
  describe('Standard JSON-RPC 2.0 Errors', () => {
    it('should define all 5 standard error codes', () => {
      expect(STANDARD_ERRORS.PARSE_ERROR).toBe(-32700);
      expect(STANDARD_ERRORS.INVALID_REQUEST).toBe(-32600);
      expect(STANDARD_ERRORS.METHOD_NOT_FOUND).toBe(-32601);
      expect(STANDARD_ERRORS.INVALID_PARAMS).toBe(-32602);
      expect(STANDARD_ERRORS.INTERNAL_ERROR).toBe(-32603);
    });

    it('should provide messages for all standard errors', () => {
      expect(STANDARD_ERROR_MESSAGES[-32700]).toBeDefined();
      expect(STANDARD_ERROR_MESSAGES[-32600]).toBeDefined();
      expect(STANDARD_ERROR_MESSAGES[-32601]).toBeDefined();
      expect(STANDARD_ERROR_MESSAGES[-32602]).toBeDefined();
      expect(STANDARD_ERROR_MESSAGES[-32603]).toBeDefined();
    });
  });

  describe('A2A-Specific Errors', () => {
    it('should define all 12 A2A error codes', () => {
      expect(A2A_ERRORS.TASK_NOT_FOUND).toBe(-32001);
      expect(A2A_ERRORS.TASK_NOT_CANCELABLE).toBe(-32002);
      expect(A2A_ERRORS.PUSH_NOTIFICATION_NOT_SUPPORTED).toBe(-32003);
      expect(A2A_ERRORS.UNSUPPORTED_OPERATION).toBe(-32004);
      expect(A2A_ERRORS.CONTENT_TYPE_NOT_SUPPORTED).toBe(-32005);
      expect(A2A_ERRORS.INVALID_AGENT_CARD).toBe(-32010);
      expect(A2A_ERRORS.AUTHENTICATION_REQUIRED).toBe(-32020);
      expect(A2A_ERRORS.AUTHORIZATION_FAILED).toBe(-32021);
      expect(A2A_ERRORS.RATE_LIMIT_EXCEEDED).toBe(-32030);
      expect(A2A_ERRORS.AGENT_UNAVAILABLE).toBe(-32040);
      expect(A2A_ERRORS.AGENT_BUSY).toBe(-32041);
      expect(A2A_ERRORS.TASK_TIMEOUT).toBe(-32042);
    });

    it('should provide messages for all A2A errors', () => {
      Object.values(A2A_ERRORS).forEach((code) => {
        expect(A2A_ERROR_MESSAGES[code]).toBeDefined();
        expect(typeof A2A_ERROR_MESSAGES[code]).toBe('string');
      });
    });
  });

  describe('Combined Error Constants', () => {
    it('should combine all errors in ALL_ERRORS', () => {
      expect(Object.keys(ALL_ERRORS)).toHaveLength(17); // 5 standard + 12 A2A
    });

    it('should combine all messages in ALL_ERROR_MESSAGES', () => {
      expect(Object.keys(ALL_ERROR_MESSAGES)).toHaveLength(17);
    });
  });
});

// ============================================================================
// JsonRpcError Class Tests
// ============================================================================

describe('JsonRpcError Class', () => {
  it('should create error with code and message', () => {
    const error = new JsonRpcError(-32600, 'Invalid Request');
    expect(error.code).toBe(-32600);
    expect(error.message).toBe('Invalid Request');
    expect(error.data).toBeUndefined();
    expect(error.name).toBe('JsonRpcError');
  });

  it('should create error with data', () => {
    const error = new JsonRpcError(-32602, 'Invalid params', { field: 'message' });
    expect(error.data).toEqual({ field: 'message' });
  });

  it('should convert to error object', () => {
    const error = new JsonRpcError(-32600, 'Invalid Request', { details: 'test' });
    const obj = error.toErrorObject();

    expect(obj).toEqual({
      code: -32600,
      message: 'Invalid Request',
      data: { details: 'test' },
    });
  });

  it('should create from error object', () => {
    const obj = { code: -32601, message: 'Method not found', data: { method: 'unknown' } };
    const error = JsonRpcError.fromErrorObject(obj);

    expect(error.code).toBe(-32601);
    expect(error.message).toBe('Method not found');
    expect(error.data).toEqual({ method: 'unknown' });
  });
});

// ============================================================================
// Error Factory Tests
// ============================================================================

describe('Error Factories', () => {
  describe('Standard Error Factories', () => {
    it('should create parse error', () => {
      const error = createParseError('Unexpected token');
      expect(error.code).toBe(STANDARD_ERRORS.PARSE_ERROR);
      expect(error.message).toContain('Unexpected token');
    });

    it('should create invalid request error', () => {
      const error = createInvalidRequestError('Missing jsonrpc');
      expect(error.code).toBe(STANDARD_ERRORS.INVALID_REQUEST);
      expect(error.message).toContain('Missing jsonrpc');
    });

    it('should create method not found error', () => {
      const error = createMethodNotFoundError('unknown/method');
      expect(error.code).toBe(STANDARD_ERRORS.METHOD_NOT_FOUND);
      expect(error.message).toContain('unknown/method');
      expect(error.data).toEqual({ method: 'unknown/method' });
    });

    it('should create invalid params error', () => {
      const error = createInvalidParamsError('message is required');
      expect(error.code).toBe(STANDARD_ERRORS.INVALID_PARAMS);
      expect(error.message).toContain('message is required');
    });

    it('should create internal error', () => {
      const error = createInternalError('Database connection failed');
      expect(error.code).toBe(STANDARD_ERRORS.INTERNAL_ERROR);
      expect(error.message).toContain('Database connection failed');
    });
  });

  describe('A2A Error Factories', () => {
    it('should create task not found error', () => {
      const error = createTaskNotFoundError('task-123');
      expect(error.code).toBe(A2A_ERRORS.TASK_NOT_FOUND);
      expect(error.data).toEqual({ taskId: 'task-123' });
    });

    it('should create task not cancelable error', () => {
      const error = createTaskNotCancelableError('task-123', 'Already completed');
      expect(error.code).toBe(A2A_ERRORS.TASK_NOT_CANCELABLE);
      expect(error.data).toEqual({ taskId: 'task-123', reason: 'Already completed' });
    });

    it('should create push notification not supported error', () => {
      const error = createPushNotificationNotSupportedError();
      expect(error.code).toBe(A2A_ERRORS.PUSH_NOTIFICATION_NOT_SUPPORTED);
    });

    it('should create unsupported operation error', () => {
      const error = createUnsupportedOperationError('batch');
      expect(error.code).toBe(A2A_ERRORS.UNSUPPORTED_OPERATION);
      expect(error.data).toEqual({ operation: 'batch' });
    });

    it('should create content type not supported error', () => {
      const error = createContentTypeNotSupportedError('application/xml');
      expect(error.code).toBe(A2A_ERRORS.CONTENT_TYPE_NOT_SUPPORTED);
      expect(error.data).toEqual({ contentType: 'application/xml' });
    });

    it('should create invalid agent card error', () => {
      const error = createInvalidAgentCardError('Missing skills field');
      expect(error.code).toBe(A2A_ERRORS.INVALID_AGENT_CARD);
      expect(error.message).toContain('Missing skills field');
    });

    it('should create authentication required error', () => {
      const error = createAuthenticationRequiredError('api');
      expect(error.code).toBe(A2A_ERRORS.AUTHENTICATION_REQUIRED);
      expect(error.data).toEqual({ realm: 'api' });
    });

    it('should create authorization failed error', () => {
      const error = createAuthorizationFailedError('admin:write');
      expect(error.code).toBe(A2A_ERRORS.AUTHORIZATION_FAILED);
      expect(error.data).toEqual({ requiredScope: 'admin:write' });
    });

    it('should create rate limit exceeded error', () => {
      const error = createRateLimitExceededError(60);
      expect(error.code).toBe(A2A_ERRORS.RATE_LIMIT_EXCEEDED);
      expect(error.data).toEqual({ retryAfter: 60 });
    });

    it('should create agent unavailable error', () => {
      const error = createAgentUnavailableError('agent-001');
      expect(error.code).toBe(A2A_ERRORS.AGENT_UNAVAILABLE);
      expect(error.data).toEqual({ agentId: 'agent-001' });
    });

    it('should create agent busy error', () => {
      const error = createAgentBusyError('agent-001', 5);
      expect(error.code).toBe(A2A_ERRORS.AGENT_BUSY);
      expect(error.data).toEqual({ agentId: 'agent-001', queuePosition: 5 });
    });

    it('should create task timeout error', () => {
      const error = createTaskTimeoutError('task-123', 30000);
      expect(error.code).toBe(A2A_ERRORS.TASK_TIMEOUT);
      expect(error.data).toEqual({ taskId: 'task-123', timeoutMs: 30000 });
    });
  });
});

// ============================================================================
// Error Utility Tests
// ============================================================================

describe('Error Utilities', () => {
  it('should identify standard errors', () => {
    expect(isStandardError(-32700)).toBe(true);
    expect(isStandardError(-32600)).toBe(true);
    expect(isStandardError(-32001)).toBe(false);
    expect(isStandardError(-1000)).toBe(false);
  });

  it('should identify A2A errors', () => {
    expect(isA2AError(-32001)).toBe(true);
    expect(isA2AError(-32042)).toBe(true);
    expect(isA2AError(-32700)).toBe(false);
    expect(isA2AError(-1000)).toBe(false);
  });

  it('should identify valid error codes', () => {
    expect(isValidErrorCode(-32700)).toBe(true);
    expect(isValidErrorCode(-32001)).toBe(true);
    expect(isValidErrorCode(-1000)).toBe(false);
  });

  it('should get default error message', () => {
    expect(getDefaultErrorMessage(-32700)).toContain('Parse error');
    expect(getDefaultErrorMessage(-32001)).toContain('Task not found');
    expect(getDefaultErrorMessage(-1000)).toBe('Unknown error');
  });

  it('should map error codes to HTTP status codes', () => {
    expect(getHttpStatusCode(STANDARD_ERRORS.PARSE_ERROR)).toBe(400);
    expect(getHttpStatusCode(STANDARD_ERRORS.INVALID_REQUEST)).toBe(400);
    expect(getHttpStatusCode(STANDARD_ERRORS.METHOD_NOT_FOUND)).toBe(404);
    expect(getHttpStatusCode(A2A_ERRORS.AUTHENTICATION_REQUIRED)).toBe(401);
    expect(getHttpStatusCode(A2A_ERRORS.AUTHORIZATION_FAILED)).toBe(403);
    expect(getHttpStatusCode(A2A_ERRORS.RATE_LIMIT_EXCEEDED)).toBe(429);
    expect(getHttpStatusCode(A2A_ERRORS.TASK_NOT_FOUND)).toBe(404);
    expect(getHttpStatusCode(STANDARD_ERRORS.INTERNAL_ERROR)).toBe(500);
  });

  it('should categorize error codes', () => {
    expect(getErrorCategory(STANDARD_ERRORS.PARSE_ERROR)).toBe('parse');
    expect(getErrorCategory(STANDARD_ERRORS.INVALID_REQUEST)).toBe('request');
    expect(getErrorCategory(STANDARD_ERRORS.METHOD_NOT_FOUND)).toBe('method');
    expect(getErrorCategory(A2A_ERRORS.TASK_NOT_FOUND)).toBe('task');
    expect(getErrorCategory(A2A_ERRORS.AUTHENTICATION_REQUIRED)).toBe('auth');
    expect(getErrorCategory(A2A_ERRORS.RATE_LIMIT_EXCEEDED)).toBe('rate');
    expect(getErrorCategory(A2A_ERRORS.AGENT_UNAVAILABLE)).toBe('agent');
  });
});

// ============================================================================
// Method Definition Tests
// ============================================================================

describe('A2A Methods', () => {
  describe('Method Names', () => {
    it('should define all 8 A2A methods', () => {
      expect(A2A_METHODS.MESSAGE_SEND).toBe('message/send');
      expect(A2A_METHODS.MESSAGE_STREAM).toBe('message/stream');
      expect(A2A_METHODS.TASKS_GET).toBe('tasks/get');
      expect(A2A_METHODS.TASKS_LIST).toBe('tasks/list');
      expect(A2A_METHODS.TASKS_CANCEL).toBe('tasks/cancel');
      expect(A2A_METHODS.TASKS_RESUBMIT).toBe('tasks/resubmit');
      expect(A2A_METHODS.TASKS_PUSH_NOTIFICATION_SET).toBe('tasks/pushNotification/set');
      expect(A2A_METHODS.TASKS_PUSH_NOTIFICATION_GET).toBe('tasks/pushNotification/get');
    });

    it('should provide descriptions for all methods', () => {
      Object.values(A2A_METHODS).forEach((method) => {
        expect(A2A_METHOD_DESCRIPTIONS[method]).toBeDefined();
        expect(typeof A2A_METHOD_DESCRIPTIONS[method]).toBe('string');
      });
    });
  });

  describe('Method Metadata', () => {
    it('should provide metadata for all methods', () => {
      Object.values(A2A_METHODS).forEach((method) => {
        const metadata = METHOD_METADATA[method];
        expect(metadata).toBeDefined();
        expect(metadata.name).toBe(method);
        expect(typeof metadata.paramsRequired).toBe('boolean');
        expect(typeof metadata.streaming).toBe('boolean');
        expect(typeof metadata.authRequired).toBe('boolean');
      });
    });

    it('should identify streaming methods', () => {
      expect(METHOD_METADATA['message/stream'].streaming).toBe(true);
      expect(METHOD_METADATA['message/send'].streaming).toBe(false);
    });

    it('should identify methods requiring capabilities', () => {
      expect(METHOD_METADATA['message/stream'].requiredCapabilities).toContain('streaming');
      expect(METHOD_METADATA['tasks/pushNotification/set'].requiredCapabilities).toContain(
        'pushNotifications'
      );
    });
  });

  describe('Method Validation', () => {
    it('should validate known methods', () => {
      expect(isValidMethod('message/send')).toBe(true);
      expect(isValidMethod('tasks/get')).toBe(true);
      expect(isValidMethod('unknown/method')).toBe(false);
    });

    it('should get method metadata', () => {
      expect(getMethodMetadata('message/send')).toBeDefined();
      expect(getMethodMetadata('unknown/method')).toBeUndefined();
    });

    it('should check if method requires params', () => {
      expect(methodRequiresParams('message/send')).toBe(true);
      expect(methodRequiresParams('tasks/list')).toBe(false);
    });

    it('should identify streaming methods', () => {
      expect(isStreamingMethod('message/stream')).toBe(true);
      expect(isStreamingMethod('message/send')).toBe(false);
    });

    it('should get all methods', () => {
      const methods = getAllMethods();
      expect(methods).toHaveLength(8);
      expect(methods).toContain('message/send');
      expect(methods).toContain('tasks/cancel');
    });

    it('should get methods by category', () => {
      expect(getMethodsByCategory('messaging')).toEqual(['message/send', 'message/stream']);
      expect(getMethodsByCategory('tasks')).toHaveLength(4);
      expect(getMethodsByCategory('notifications')).toHaveLength(2);
    });
  });
});

// ============================================================================
// Task Status Tests
// ============================================================================

describe('Task Status', () => {
  it('should define terminal statuses', () => {
    expect(TERMINAL_STATUSES).toContain('completed');
    expect(TERMINAL_STATUSES).toContain('failed');
    expect(TERMINAL_STATUSES).toContain('canceled');
    expect(TERMINAL_STATUSES).toContain('rejected');
    expect(TERMINAL_STATUSES).not.toContain('working');
  });

  it('should identify terminal statuses', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('working')).toBe(false);
    expect(isTerminalStatus('submitted')).toBe(false);
  });

  it('should validate status transitions', () => {
    // Valid transitions
    expect(isValidStatusTransition('submitted', 'working')).toBe(true);
    expect(isValidStatusTransition('working', 'completed')).toBe(true);
    expect(isValidStatusTransition('working', 'failed')).toBe(true);
    expect(isValidStatusTransition('working', 'canceled')).toBe(true);

    // Invalid transitions from terminal states
    expect(isValidStatusTransition('completed', 'working')).toBe(false);
    expect(isValidStatusTransition('failed', 'completed')).toBe(false);

    // Invalid transitions
    expect(isValidStatusTransition('submitted', 'completed')).toBe(false);
  });
});

// ============================================================================
// Message Part Tests
// ============================================================================

describe('Message Parts', () => {
  const textPart: MessagePart = { type: 'text', text: 'Hello' };
  const filePart: MessagePart = {
    type: 'file',
    file: { name: 'test.txt', mimeType: 'text/plain' },
  };
  const dataPart: MessagePart = { type: 'data', data: { key: 'value' } };

  it('should identify text parts', () => {
    expect(isTextPart(textPart)).toBe(true);
    expect(isTextPart(filePart)).toBe(false);
    expect(isTextPart(dataPart)).toBe(false);
  });

  it('should identify file parts', () => {
    expect(isFilePart(filePart)).toBe(true);
    expect(isFilePart(textPart)).toBe(false);
    expect(isFilePart(dataPart)).toBe(false);
  });

  it('should identify data parts', () => {
    expect(isDataPart(dataPart)).toBe(true);
    expect(isDataPart(textPart)).toBe(false);
    expect(isDataPart(filePart)).toBe(false);
  });

  it('should extract text from parts', () => {
    const parts: MessagePart[] = [
      { type: 'text', text: 'Hello' },
      { type: 'data', data: {} },
      { type: 'text', text: 'World' },
    ];
    expect(extractTextFromParts(parts)).toBe('Hello\nWorld');
  });

  it('should create text message', () => {
    const message = createTextMessage('Hello, agent!');
    expect(message.role).toBe('user');
    expect(message.parts).toHaveLength(1);
    expect(message.parts[0]).toEqual({ type: 'text', text: 'Hello, agent!' });
  });

  it('should create text message with role', () => {
    const message = createTextMessage('Response', 'agent');
    expect(message.role).toBe('agent');
  });

  it('should create data message', () => {
    const message = createDataMessage({ action: 'search', query: 'flights' });
    expect(message.role).toBe('user');
    expect(message.parts).toHaveLength(1);
    expect(message.parts[0]).toEqual({
      type: 'data',
      data: { action: 'search', query: 'flights' },
    });
  });
});

// ============================================================================
// Request Creation Tests
// ============================================================================

describe('Request Creation', () => {
  it('should generate unique request IDs', () => {
    const id1 = generateRequestId();
    const id2 = generateRequestId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^req-\d+-\d+$/);
  });

  it('should create basic request', () => {
    const request = createRequest('message/send');
    expect(request.jsonrpc).toBe('2.0');
    expect(request.method).toBe('message/send');
    expect(request.id).toBeDefined();
    expect(request.params).toBeUndefined();
  });

  it('should create request with params', () => {
    const params = { message: { role: 'user', parts: [] } };
    const request = createRequest('message/send', params);
    expect(request.params).toEqual(params);
  });

  it('should create request with custom ID', () => {
    const request = createRequest('message/send', undefined, 'custom-id');
    expect(request.id).toBe('custom-id');
  });

  it('should create request with numeric ID', () => {
    const request = createRequest('message/send', undefined, 42);
    expect(request.id).toBe(42);
  });

  it('should create notification (no id)', () => {
    const notification = createNotification('message/send');
    expect(notification.jsonrpc).toBe('2.0');
    expect(notification.method).toBe('message/send');
    expect('id' in notification).toBe(false);
  });

  it('should create typed A2A request', () => {
    const request = createA2ARequest('message/send', {
      message: { role: 'user', parts: [{ type: 'text', text: 'Hello' }] },
    });
    expect(request.method).toBe('message/send');
  });
});

// ============================================================================
// Response Creation Tests
// ============================================================================

describe('Response Creation', () => {
  it('should create success response', () => {
    const response = createSuccessResponse('req-001', { status: 'ok' });
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe('req-001');
    expect(response.result).toEqual({ status: 'ok' });
  });

  it('should create success response with null id', () => {
    const response = createSuccessResponse(null, { status: 'ok' });
    expect(response.id).toBeNull();
  });

  it('should create error response', () => {
    const response = createErrorResponse('req-001', -32600, 'Invalid Request');
    expect(response.jsonrpc).toBe('2.0');
    expect(response.id).toBe('req-001');
    expect(response.error.code).toBe(-32600);
    expect(response.error.message).toBe('Invalid Request');
  });

  it('should create error response with data', () => {
    const response = createErrorResponse('req-001', -32602, 'Invalid params', { field: 'message' });
    expect(response.error.data).toEqual({ field: 'message' });
  });

  it('should create error response from JsonRpcError', () => {
    const error = new JsonRpcError(-32600, 'Invalid Request', { details: 'test' });
    const response = createErrorResponseFromError('req-001', error);
    expect(response.error).toEqual({
      code: -32600,
      message: 'Invalid Request',
      data: { details: 'test' },
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('Validation', () => {
  describe('ID Validation', () => {
    it('should accept valid string ID', () => {
      const result = validateId('req-001');
      expect(result.valid).toBe(true);
    });

    it('should accept valid numeric ID', () => {
      const result = validateId(42);
      expect(result.valid).toBe(true);
    });

    it('should reject undefined ID', () => {
      const result = validateId(undefined);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('id is required');
    });

    it('should reject non-string/number ID', () => {
      const result = validateId({ id: 1 });
      expect(result.valid).toBe(false);
    });

    it('should reject ID exceeding max length', () => {
      const result = validateId('a'.repeat(MAX_ID_LENGTH + 1));
      expect(result.valid).toBe(false);
    });

    it('should reject NaN ID', () => {
      const result = validateId(NaN);
      expect(result.valid).toBe(false);
    });

    it('should reject Infinity ID', () => {
      const result = validateId(Infinity);
      expect(result.valid).toBe(false);
    });
  });

  describe('Method Validation', () => {
    it('should accept valid method name', () => {
      const result = validateMethod('message/send');
      expect(result.valid).toBe(true);
    });

    it('should reject undefined method', () => {
      const result = validateMethod(undefined);
      expect(result.valid).toBe(false);
    });

    it('should reject empty method', () => {
      const result = validateMethod('');
      expect(result.valid).toBe(false);
    });

    it('should reject non-string method', () => {
      const result = validateMethod(123);
      expect(result.valid).toBe(false);
    });

    it('should reject method exceeding max length', () => {
      const result = validateMethod('a'.repeat(MAX_METHOD_LENGTH + 1));
      expect(result.valid).toBe(false);
    });

    it('should reject reserved rpc. prefix', () => {
      const result = validateMethod('rpc.custom');
      expect(result.valid).toBe(false);
    });
  });

  describe('Params Validation', () => {
    it('should accept valid params object', () => {
      const result = validateParams({ message: {} });
      expect(result.valid).toBe(true);
    });

    it('should accept undefined params', () => {
      const result = validateParams(undefined);
      expect(result.valid).toBe(true);
    });

    it('should reject array params (A2A uses named params only)', () => {
      const result = validateParams([1, 2, 3]);
      expect(result.valid).toBe(false);
    });

    it('should reject null params', () => {
      const result = validateParams(null);
      expect(result.valid).toBe(false);
    });

    it('should reject primitive params', () => {
      const result = validateParams('string');
      expect(result.valid).toBe(false);
    });

    it('should require params for methods that need them', () => {
      const result = validateParams(undefined, 'message/send');
      expect(result.valid).toBe(false);
    });
  });

  describe('Request Structure Validation', () => {
    it('should accept valid request', () => {
      const result = validateRequestStructure(validRequest);
      expect(result.valid).toBe(true);
    });

    it('should reject non-object request', () => {
      const result = validateRequestStructure('invalid');
      expect(result.valid).toBe(false);
    });

    it('should reject null request', () => {
      const result = validateRequestStructure(null);
      expect(result.valid).toBe(false);
    });

    it('should reject wrong jsonrpc version', () => {
      const result = validateRequestStructure({ ...validRequest, jsonrpc: '1.0' });
      expect(result.valid).toBe(false);
    });

    it('should reject missing method', () => {
      const { method: _, ...noMethod } = validRequest;
      const result = validateRequestStructure(noMethod);
      expect(result.valid).toBe(false);
    });
  });

  describe('A2A Method Validation', () => {
    it('should accept valid A2A method', () => {
      const result = validateA2AMethod('message/send');
      expect(result.valid).toBe(true);
    });

    it('should reject unknown method', () => {
      const result = validateA2AMethod('unknown/method');
      expect(result.valid).toBe(false);
    });
  });
});

// ============================================================================
// Parsing Tests
// ============================================================================

describe('Parsing', () => {
  describe('Request Parsing', () => {
    it('should parse valid request', () => {
      const json = JSON.stringify(validRequest);
      const result = parseRequest(json);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.method).toBe('message/send');
      }
    });

    it('should fail on invalid JSON', () => {
      const result = parseRequest('{ invalid json }');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(STANDARD_ERRORS.PARSE_ERROR);
      }
    });

    it('should fail on batch request', () => {
      const json = JSON.stringify([validRequest, validRequest]);
      const result = parseRequest(json);
      expect(result.success).toBe(false);
    });

    it('should fail on invalid structure', () => {
      const result = parseRequest(JSON.stringify({ foo: 'bar' }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(STANDARD_ERRORS.INVALID_REQUEST);
      }
    });
  });

  describe('A2A Request Parsing', () => {
    it('should parse valid A2A request', () => {
      const json = JSON.stringify(validRequest);
      const result = parseA2ARequest(json);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.method).toBe('message/send');
      }
    });

    it('should fail on unknown method', () => {
      const request = { ...validRequest, method: 'unknown/method' };
      const result = parseA2ARequest(JSON.stringify(request));

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(STANDARD_ERRORS.METHOD_NOT_FOUND);
      }
    });
  });

  describe('Batch Request Parsing', () => {
    it('should parse valid batch request', () => {
      const json = JSON.stringify([validRequest, { ...validRequest, id: 'req-002' }]);
      const result = parseBatchRequest(json);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(2);
      }
    });

    it('should fail on non-array', () => {
      const result = parseBatchRequest(JSON.stringify(validRequest));
      expect(result.success).toBe(false);
    });

    it('should fail on empty array', () => {
      const result = parseBatchRequest('[]');
      expect(result.success).toBe(false);
    });
  });

  describe('Response Parsing', () => {
    it('should parse success response', () => {
      const json = JSON.stringify(validSuccessResponse);
      const result = parseResponse(json);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(isSuccessResponse(result.value)).toBe(true);
      }
    });

    it('should parse error response', () => {
      const json = JSON.stringify(validErrorResponse);
      const result = parseResponse(json);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(isErrorResponse(result.value)).toBe(true);
      }
    });

    it('should fail on invalid JSON', () => {
      const result = parseResponse('invalid');
      expect(result.success).toBe(false);
    });

    it('should fail on response with both result and error', () => {
      const invalid = { ...validSuccessResponse, error: { code: -1, message: 'error' } };
      const result = parseResponse(JSON.stringify(invalid));
      expect(result.success).toBe(false);
    });

    it('should fail on response with neither result nor error', () => {
      const invalid = { jsonrpc: '2.0', id: 1 };
      const result = parseResponse(JSON.stringify(invalid));
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// Serialization Tests
// ============================================================================

describe('Serialization', () => {
  it('should serialize request', () => {
    const json = serializeRequest(validRequest);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(validRequest);
  });

  it('should serialize response', () => {
    const json = serializeResponse(validSuccessResponse);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(validSuccessResponse);
  });

  it('should serialize batch request', () => {
    const batch = [validRequest, { ...validRequest, id: 'req-002' }];
    const json = serializeBatchRequest(batch);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
  });

  it('should serialize batch response', () => {
    const batch = [validSuccessResponse, validErrorResponse];
    const json = serializeBatchResponse(batch);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
  });
});

// ============================================================================
// Type Guard Tests
// ============================================================================

describe('Type Guards', () => {
  it('should identify success response', () => {
    expect(isSuccessResponse(validSuccessResponse)).toBe(true);
    expect(isSuccessResponse(validErrorResponse)).toBe(false);
  });

  it('should identify error response', () => {
    expect(isErrorResponse(validErrorResponse)).toBe(true);
    expect(isErrorResponse(validSuccessResponse)).toBe(false);
  });

  it('should identify request', () => {
    expect(isRequest(validRequest)).toBe(true);
    expect(isRequest(validSuccessResponse)).toBe(false);
    expect(isRequest(null)).toBe(false);
  });

  it('should identify notification', () => {
    const notification = { jsonrpc: '2.0', method: 'test' };
    expect(isNotification(notification)).toBe(true);
    expect(isNotification(validRequest)).toBe(false);
  });

  it('should identify response', () => {
    expect(isResponse(validSuccessResponse)).toBe(true);
    expect(isResponse(validErrorResponse)).toBe(true);
    expect(isResponse(validRequest)).toBe(false);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('Utility Functions', () => {
  it('should extract request ID from JSON', () => {
    expect(extractRequestId('{"id": "req-001"}')).toBe('req-001');
    expect(extractRequestId('{"id": 42}')).toBe(42);
    expect(extractRequestId('{}')).toBeNull();
    expect(extractRequestId('invalid')).toBeNull();
  });

  it('should create ok result', () => {
    const result = ok('value');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toBe('value');
    }
  });

  it('should create err result', () => {
    const error = new Error('test');
    const result = err(error);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(error);
    }
  });

  it('should format request for logging', () => {
    const formatted = formatRequestForLogging(validRequest);
    const parsed = JSON.parse(formatted);
    expect(parsed.id).toBe('req-001');
    expect(parsed.method).toBe('message/send');
    expect(parsed.hasParams).toBe(true);
    expect(parsed.params).toBeUndefined(); // Should not include actual params
  });

  it('should format success response for logging', () => {
    const formatted = formatResponseForLogging(validSuccessResponse);
    const parsed = JSON.parse(formatted);
    expect(parsed.id).toBe('req-001');
    expect(parsed.hasResult).toBe(true);
  });

  it('should format error response for logging', () => {
    const formatted = formatResponseForLogging(validErrorResponse);
    const parsed = JSON.parse(formatted);
    expect(parsed.error.code).toBe(-32600);
  });
});

// ============================================================================
// Response Matcher Tests
// ============================================================================

describe('Response Matcher', () => {
  it('should track pending requests', async () => {
    const matcher = createResponseMatcher();

    // Register a pending request
    const promise = matcher.register('req-001');
    expect(matcher.pendingCount).toBe(1);

    // Resolve with response
    const resolved = matcher.resolve(validSuccessResponse);
    expect(resolved).toBe(true);

    // Wait for promise
    const response = await promise;
    expect(response).toEqual(validSuccessResponse);
    expect(matcher.pendingCount).toBe(0);
  });

  it('should not resolve unknown request', () => {
    const matcher = createResponseMatcher();
    const resolved = matcher.resolve(validSuccessResponse);
    expect(resolved).toBe(false);
  });

  it('should cancel pending request', () => {
    const matcher = createResponseMatcher();
    matcher.register('req-001');
    expect(matcher.pendingCount).toBe(1);

    const canceled = matcher.cancel('req-001');
    expect(canceled).toBe(true);
    expect(matcher.pendingCount).toBe(0);
  });

  it('should clear all pending requests', () => {
    const matcher = createResponseMatcher();
    matcher.register('req-001');
    matcher.register('req-002');
    expect(matcher.pendingCount).toBe(2);

    matcher.clear();
    expect(matcher.pendingCount).toBe(0);
  });
});

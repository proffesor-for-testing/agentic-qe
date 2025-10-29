/**
 * Tests for BaseHandler - MCP Foundation Class
 * Complete coverage for base handler functionality
 */

import { BaseHandler, HandlerResponse } from '@mcp/handlers/base-handler';

// Create a concrete implementation for testing
class TestHandler extends BaseHandler {
  async handle(args: any): Promise<HandlerResponse> {
    this.validateRequired(args, ['required1', 'required2']);
    return this.createSuccessResponse({ processed: true, args });
  }

  async handleWithError(args: any): Promise<HandlerResponse> {
    throw new Error('Test error message');
  }

  async handleWithMeasuredTime(args: any): Promise<HandlerResponse> {
    const { result, executionTime } = await this.measureExecutionTime(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return { computed: true };
    });

    return this.createSuccessResponse({ result, executionTime });
  }

  // Expose protected methods for testing
  public testValidateRequired(args: any, fields: string[]) {
    return this.validateRequired(args, fields);
  }

  public testGenerateRequestId() {
    return this.generateRequestId();
  }

  public testCreateSuccessResponse(data: any, requestId?: string) {
    return this.createSuccessResponse(data, requestId);
  }

  public testCreateErrorResponse(error: string, requestId?: string) {
    return this.createErrorResponse(error, requestId);
  }

  public testLog(level: 'info' | 'warn' | 'error', message: string, data?: any) {
    return this.log(level, message, data);
  }

  public testMeasureExecutionTime<T>(operation: () => Promise<T>) {
    return this.measureExecutionTime(operation);
  }
}

describe('BaseHandler', () => {
  let handler: TestHandler;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    handler = new TestHandler();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with request counter at 0', () => {
      expect(handler['requestCounter']).toBe(0);
    });

    it('should be an abstract class requiring handle implementation', () => {
      expect(handler.handle).toBeDefined();
      expect(typeof handler.handle).toBe('function');
    });
  });

  describe('Request ID Generation', () => {
    it('should generate unique request IDs', () => {
      const id1 = handler.testGenerateRequestId();
      const id2 = handler.testGenerateRequestId();

      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
    });

    it('should include timestamp, counter, and random component', () => {
      const id = handler.testGenerateRequestId();
      const parts = id.split('-');

      expect(parts.length).toBe(3);
      expect(parseInt(parts[0])).toBeGreaterThan(0); // Timestamp
      expect(parseInt(parts[1])).toBe(1); // Counter starts at 1
      expect(parts[2].length).toBe(9); // Random string length
    });

    it('should increment counter for each request', () => {
      const id1 = handler.testGenerateRequestId();
      const id2 = handler.testGenerateRequestId();

      const counter1 = parseInt(id1.split('-')[1]);
      const counter2 = parseInt(id2.split('-')[1]);

      expect(counter2).toBe(counter1 + 1);
    });
  });

  describe('Success Response Creation', () => {
    it('should create properly formatted success response', () => {
      const testData = { result: 'test' };
      const response = handler.testCreateSuccessResponse(testData);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(testData);
      expect(response.error).toBeUndefined();
      expect(response.metadata).toBeDefined();
    });

    it('should include metadata with execution time, timestamp, and request ID', () => {
      const testData = { result: 'test' };
      const response = handler.testCreateSuccessResponse(testData);

      expect(response.metadata).toBeDefined();
      expect(response.metadata!.executionTime).toBeGreaterThan(0);
      expect(response.metadata!.timestamp).toBeDefined();
      expect(response.metadata!.requestId).toBeDefined();

      // Validate timestamp format (ISO string)
      expect(() => new Date(response.metadata!.timestamp)).not.toThrow();
    });

    it('should use provided request ID when given', () => {
      const testData = { result: 'test' };
      const customRequestId = 'custom-request-123';
      const response = handler.testCreateSuccessResponse(testData, customRequestId);

      expect(response.metadata!.requestId).toBe(customRequestId);
    });

    it('should generate request ID when not provided', () => {
      const testData = { result: 'test' };
      const response = handler.testCreateSuccessResponse(testData);

      expect(response.metadata!.requestId).toBeDefined();
      expect(response.metadata!.requestId).toContain('-');
    });
  });

  describe('Error Response Creation', () => {
    it('should create properly formatted error response', () => {
      const errorMessage = 'Test error occurred';
      const response = handler.testCreateErrorResponse(errorMessage);

      expect(response.success).toBe(false);
      expect(response.error).toBe(errorMessage);
      expect(response.data).toBeUndefined();
      expect(response.metadata).toBeDefined();
    });

    it('should include metadata with execution time, timestamp, and request ID', () => {
      const errorMessage = 'Test error occurred';
      const response = handler.testCreateErrorResponse(errorMessage);

      expect(response.metadata).toBeDefined();
      expect(response.metadata!.executionTime).toBeGreaterThan(0);
      expect(response.metadata!.timestamp).toBeDefined();
      expect(response.metadata!.requestId).toBeDefined();
    });

    it('should use provided request ID when given', () => {
      const errorMessage = 'Test error occurred';
      const customRequestId = 'error-request-456';
      const response = handler.testCreateErrorResponse(errorMessage, customRequestId);

      expect(response.metadata!.requestId).toBe(customRequestId);
    });
  });

  describe('Parameter Validation', () => {
    it('should pass validation when all required fields are present', () => {
      const args = { required1: 'value1', required2: 'value2', optional: 'value3' };
      const requiredFields = ['required1', 'required2'];

      expect(() => handler.testValidateRequired(args, requiredFields)).not.toThrow();
    });

    it('should throw error when required fields are missing', () => {
      const args = { required1: 'value1', optional: 'value3' };
      const requiredFields = ['required1', 'required2'];

      expect(() => handler.testValidateRequired(args, requiredFields))
        .toThrow('Missing required fields: required2');
    });

    it('should throw error with all missing fields listed', () => {
      const args = { optional: 'value3' };
      const requiredFields = ['required1', 'required2', 'required3'];

      expect(() => handler.testValidateRequired(args, requiredFields))
        .toThrow('Missing required fields: required1, required2, required3');
    });

    it('should handle empty args object', () => {
      const args = {};
      const requiredFields = ['field1', 'field2'];

      expect(() => handler.testValidateRequired(args, requiredFields))
        .toThrow('Missing required fields: field1, field2');
    });

    it('should handle null/undefined values as missing', () => {
      const args = { field1: null, field2: undefined, field3: '' };
      const requiredFields = ['field1', 'field2', 'field3'];

      expect(() => handler.testValidateRequired(args, requiredFields))
        .toThrow('Missing required fields: field1, field2, field3');
    });

    it('should accept falsy but defined values (0, false)', () => {
      const args = { field1: 0, field2: false };
      const requiredFields = ['field1', 'field2'];

      expect(() => handler.testValidateRequired(args, requiredFields)).not.toThrow();
    });
  });

  describe('Logging Functionality', () => {
    it('should log info messages with proper format', () => {
      const message = 'Test info message';
      const data = { test: 'data' };

      handler.testLog('info', message, data);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO] TestHandler: Test info message'),
        data
      );
    });

    it('should log warning messages with proper format', () => {
      const message = 'Test warning message';

      handler.testLog('warn', message);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN] TestHandler: Test warning message'),
        ''
      );
    });

    it('should log error messages with proper format', () => {
      const message = 'Test error message';

      handler.testLog('error', message);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR] TestHandler: Test error message'),
        ''
      );
    });

    it('should include timestamp in log format', () => {
      const message = 'Test message';

      handler.testLog('info', message);

      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
    });

    it('should include class name in log format', () => {
      const message = 'Test message';

      handler.testLog('info', message);

      const logCall = consoleSpy.mock.calls[0][0];
      expect(logCall).toContain('TestHandler:');
    });
  });

  describe('Execution Time Measurement', () => {
    it('should measure execution time of async operations', async () => {
      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'completed';
      };

      const { result, executionTime } = await handler.testMeasureExecutionTime(operation);

      expect(result).toBe('completed');
      expect(executionTime).toBeGreaterThan(90); // Allow some variance
      expect(executionTime).toBeLessThan(150);
    });

    it('should measure very fast operations', async () => {
      const operation = async () => {
        return 'immediate';
      };

      const { result, executionTime } = await handler.testMeasureExecutionTime(operation);

      expect(result).toBe('immediate');
      expect(executionTime).toBeGreaterThanOrEqual(0);
      expect(executionTime).toBeLessThan(10);
    });

    it('should handle operations that throw errors', async () => {
      const operation = async () => {
        throw new Error('Operation failed');
      };

      await expect(handler.testMeasureExecutionTime(operation))
        .rejects.toThrow('Operation failed');
    });

    it('should return execution time in response metadata', async () => {
      const args = { test: 'data' };

      const response = await handler.handleWithMeasuredTime(args);

      expect(response.success).toBe(true);
      expect(response.data.executionTime).toBeGreaterThan(90);
      expect(response.data.result.computed).toBe(true);
    });
  });

  describe('Handle Method Integration', () => {
    it('should handle valid request successfully', async () => {
      const args = { required1: 'value1', required2: 'value2' };

      const response = await handler.handle(args);

      expect(response.success).toBe(true);
      expect(response.data.processed).toBe(true);
      expect(response.data.args).toEqual(args);
      expect(response.metadata).toBeDefined();
    });

    it('should handle invalid request with missing fields', async () => {
      const args = { required1: 'value1' }; // Missing required2

      const response = await handler.handle(args);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Missing required fields: required2');
      expect(response.metadata).toBeDefined();
    });

    it('should handle unexpected errors gracefully', async () => {
      const args = { test: 'data' };

      const response = await handler.handleWithError(args);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Test error message');
      expect(response.metadata).toBeDefined();
    });
  });

  describe('Response Format Consistency', () => {
    it('should maintain consistent response structure for success', async () => {
      const args = { required1: 'value1', required2: 'value2' };
      const response = await handler.handle(args);

      // Check required properties
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('metadata');

      // Check metadata structure
      expect(response.metadata).toHaveProperty('executionTime');
      expect(response.metadata).toHaveProperty('timestamp');
      expect(response.metadata).toHaveProperty('requestId');

      // Should not have error property for success
      expect(response).not.toHaveProperty('error');
    });

    it('should maintain consistent response structure for errors', async () => {
      const args = { required1: 'value1' }; // Missing required field
      const response = await handler.handle(args);

      // Check required properties
      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('error');
      expect(response).toHaveProperty('metadata');

      // Check metadata structure
      expect(response.metadata).toHaveProperty('executionTime');
      expect(response.metadata).toHaveProperty('timestamp');
      expect(response.metadata).toHaveProperty('requestId');

      // Should not have data property for errors
      expect(response).not.toHaveProperty('data');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple rapid requests efficiently', async () => {
      const args = { required1: 'value1', required2: 'value2' };
      const promises = Array(100).fill(null).map(() => handler.handle(args));

      const startTime = Date.now();
      const responses = await Promise.all(promises);
      const endTime = Date.now();

      // All requests should succeed
      responses.forEach(response => {
        expect(response.success).toBe(true);
      });

      // Should complete in reasonable time (less than 1 second for 100 requests)
      expect(endTime - startTime).toBeLessThan(1000);

      // All request IDs should be unique
      const requestIds = responses.map(r => r.metadata!.requestId);
      const uniqueIds = new Set(requestIds);
      expect(uniqueIds.size).toBe(responses.length);
    });

    it('should increment request counter correctly under load', async () => {
      const args = { required1: 'value1', required2: 'value2' };
      const numRequests = 50;

      const promises = Array(numRequests).fill(null).map(() => handler.handle(args));
      const responses = await Promise.all(promises);

      // Extract counter values from request IDs
      const counters = responses.map(r => {
        const requestId = r.metadata!.requestId;
        return parseInt(requestId.split('-')[1]);
      });

      // Should have consecutive counter values (may not be in order due to async)
      const sortedCounters = counters.sort((a, b) => a - b);
      for (let i = 0; i < sortedCounters.length; i++) {
        expect(sortedCounters[i]).toBe(i + 1);
      }
    });
  });

  describe('Edge Cases and Error Conditions', () => {
    it('should handle null args gracefully', async () => {
      const response = await handler.handle(null);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Missing required fields');
    });

    it('should handle undefined args gracefully', async () => {
      const response = await handler.handle(undefined);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Missing required fields');
    });

    it('should handle empty required fields array', () => {
      const args = { field1: 'value1' };

      expect(() => handler.testValidateRequired(args, [])).not.toThrow();
    });

    it('should handle very large data objects in responses', () => {
      const largeData = {
        array: Array(1000).fill(0).map((_, i) => ({ id: i, data: `data-${i}` })),
        text: 'x'.repeat(10000)
      };

      const response = handler.testCreateSuccessResponse(largeData);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(largeData);
      expect(response.metadata).toBeDefined();
    });
  });
});
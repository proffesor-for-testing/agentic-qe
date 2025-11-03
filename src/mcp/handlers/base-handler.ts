import { SecureRandom } from '../../utils/SecureRandom.js';

/**
 * Base Handler for Agentic QE MCP Tools
 * 
 * Provides common functionality and interface for all MCP tool handlers.
 * 
 * @version 1.0.0
 * @author Agentic QE Team
 */

export interface HandlerResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    executionTime: number;
    timestamp: string;
    requestId: string;
  };
}

export abstract class BaseHandler {
  protected requestCounter = 0;

  /**
   * Abstract method that must be implemented by all handlers
   */
  abstract handle(args: any): Promise<HandlerResponse>;

  /**
   * Wrapper that ensures all errors are caught and converted to HandlerResponse.
   *
   * This method provides consistent error handling across all MCP handlers by:
   * - Catching ALL thrown errors (including validation errors, runtime errors, etc.)
   * - Converting errors into properly formatted HandlerResponse objects
   * - Logging error details for debugging
   * - Ensuring the MCP server never crashes due to unhandled exceptions
   *
   * **When to use:**
   * - Wrap your entire `handle()` implementation with this method
   * - Use it as the outermost error boundary in your handler
   * - Ensures consistent error response format across all handlers
   *
   * **Example usage:**
   * ```typescript
   * async handle(args: any): Promise<HandlerResponse> {
   *   return this.safeHandle(async () => {
   *     // Your handler logic here
   *     this.validateRequired(args, ['requiredField']);
   *     const result = await this.doWork(args);
   *     return this.createSuccessResponse(result);
   *   });
   * }
   * ```
   *
   * @param handler - Async function containing your handler implementation
   * @returns HandlerResponse - Either success response from handler or error response if exception occurs
   */
  protected async safeHandle(
    handler: () => Promise<HandlerResponse>
  ): Promise<HandlerResponse> {
    const requestId = this.generateRequestId();
    try {
      return await handler();
    } catch (error) {
      this.log('error', 'Handler execution failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return this.createErrorResponse(
        error instanceof Error ? error.message : 'Handler execution failed',
        requestId
      );
    }
  }

  /**
   * Generate a unique request ID
   */
  protected generateRequestId(): string {
    return `${Date.now()}-${++this.requestCounter}-${SecureRandom.generateId(5)}`;
  }

  /**
   * Create a successful response
   */
  protected createSuccessResponse(data: any, requestId?: string): HandlerResponse {
    return {
      success: true,
      data,
      metadata: {
        executionTime: Date.now(),
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    };
  }

  /**
   * Create an error response
   */
  protected createErrorResponse(error: string, requestId?: string): HandlerResponse {
    return {
      success: false,
      error,
      metadata: {
        executionTime: Date.now(),
        timestamp: new Date().toISOString(),
        requestId: requestId || this.generateRequestId()
      }
    };
  }

  /**
   * Validate required parameters
   */
  protected validateRequired(args: any, requiredFields: string[]): void {
    if (args === null || args === undefined || typeof args !== 'object' || Array.isArray(args)) {
      throw new Error(`Invalid arguments: expected object, got ${args === null ? 'null' : typeof args}`);
    }
    const missing = requiredFields.filter(field => !(field in args) || args[field] === undefined || args[field] === null);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  /**
   * Log handler activity
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${this.constructor.name}: ${message}`, data || '');
  }

  /**
   * Measure execution time
   */
  protected async measureExecutionTime<T>(operation: () => Promise<T>): Promise<{ result: T; executionTime: number }> {
    const startTime = performance.now();
    const result = await operation();
    const executionTime = performance.now() - startTime;
    return { result, executionTime };
  }
}

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

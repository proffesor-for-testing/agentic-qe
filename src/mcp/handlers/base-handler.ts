import { SecureRandom } from '../../utils/SecureRandom.js';
import {
  OutputFormatterImpl,
  OutputModeDetector,
  OutputMode,
  OutputType,
} from '../../output';

/**
 * Base Handler for Agentic QE MCP Tools
 *
 * Provides common functionality and interface for all MCP tool handlers.
 * Includes AI-friendly output formatting for Claude Code integration.
 *
 * @version 1.1.0
 * @author Agentic QE Team
 */

export interface HandlerResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    executionTime: number;
    timestamp: string;
    requestId: string;
  };
}

export abstract class BaseHandler {
  protected requestCounter = 0;
  protected outputFormatter: OutputFormatterImpl;

  constructor() {
    this.outputFormatter = new OutputFormatterImpl();
  }

  /**
   * Abstract method that must be implemented by all handlers
   */
  abstract handle(args: unknown): Promise<HandlerResponse>;

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
   * async handle(args: unknown): Promise<HandlerResponse> {
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
  protected createSuccessResponse(data: unknown, requestId?: string): HandlerResponse {
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
  protected validateRequired(args: unknown, requiredFields: string[]): void {
    const argsRecord = args as Record<string, unknown>;
    if (argsRecord === null || argsRecord === undefined || typeof argsRecord !== 'object' || Array.isArray(argsRecord)) {
      throw new Error(`Invalid arguments: expected object, got ${argsRecord === null ? 'null' : typeof argsRecord}`);
    }
    const missing = requiredFields.filter(field => !(field in argsRecord) || argsRecord[field] === undefined || argsRecord[field] === null);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  /**
   * Log handler activity
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
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

  /**
   * Detect current output mode (AI vs Human)
   * Returns 'ai' when running in Claude Code context
   */
  protected detectOutputMode(): OutputMode {
    return OutputModeDetector.detectMode();
  }

  /**
   * Check if running in AI/Claude context
   */
  protected isAIMode(): boolean {
    return this.detectOutputMode() === OutputMode.AI;
  }

  /**
   * Format response for AI consumption with structured JSON and action suggestions
   * Use this when returning results that Claude will process
   *
   * @param data - The response data
   * @param outputType - Type of output (test_results, coverage, agent_status, etc.)
   * @returns Formatted string (JSON in AI mode, human-readable otherwise)
   */
  protected formatForAI(data: unknown, outputType: OutputType = 'agent_status'): string {
    return this.outputFormatter.format(data, outputType, OutputMode.AUTO);
  }

  /**
   * Create a success response with AI-friendly formatting
   * Automatically includes action suggestions when in AI mode
   */
  protected createAIFormattedResponse(data: Record<string, unknown>, requestId?: string): HandlerResponse {
    const formattedData = this.isAIMode()
      ? {
          ...data,
          _aiFormatted: true,
          _outputMode: 'ai',
          _schemaVersion: '1.0.0',
        }
      : data;

    return this.createSuccessResponse(formattedData, requestId);
  }
}

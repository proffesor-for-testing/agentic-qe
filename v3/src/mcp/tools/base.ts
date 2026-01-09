/**
 * Agentic QE v3 - MCP Tool Base Class
 *
 * Base infrastructure for MCP tools implementing ADR-010.
 * All domain tools extend this base class.
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainName } from '../../shared/types';
import { ToolResult, ToolResultMetadata } from '../types';

// ============================================================================
// Tool Schema Types (JSON Schema compatible)
// ============================================================================

/**
 * JSON Schema property definition for tool parameters
 */
export interface MCPSchemaProperty {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  default?: unknown;
  items?: MCPSchemaProperty;
  properties?: Record<string, MCPSchemaProperty>;
  required?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

/**
 * Complete JSON Schema for MCP tool
 */
export interface MCPToolSchema {
  type: 'object';
  properties: Record<string, MCPSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Tool configuration for registration
 */
export interface MCPToolConfig {
  name: string;
  description: string;
  domain: DomainName;
  schema: MCPToolSchema;
  streaming?: boolean;
  timeout?: number;
}

/**
 * Streaming callback for long-running operations
 */
export type StreamCallback = (chunk: unknown) => void;

/**
 * Tool execution context
 */
export interface MCPToolContext {
  requestId: string;
  startTime: number;
  streaming?: boolean;
  onStream?: StreamCallback;
  abortSignal?: AbortSignal;
}

// ============================================================================
// Base MCP Tool Class
// ============================================================================

/**
 * Abstract base class for all MCP tools
 *
 * @template TParams - Tool parameter type
 * @template TResult - Tool result type
 */
export abstract class MCPToolBase<
  TParams extends Record<string, unknown> = Record<string, unknown>,
  TResult = unknown
> {
  /**
   * Tool configuration
   */
  abstract readonly config: MCPToolConfig;

  /**
   * Execute the tool with parameters
   *
   * @param params - Tool parameters
   * @param context - Execution context
   * @returns Tool result
   */
  abstract execute(
    params: TParams,
    context: MCPToolContext
  ): Promise<ToolResult<TResult>>;

  /**
   * Validate parameters against schema
   *
   * @param params - Parameters to validate
   * @returns Validation result
   */
  validate(params: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof params !== 'object' || params === null) {
      return { valid: false, errors: ['Parameters must be an object'] };
    }

    const paramsObj = params as Record<string, unknown>;
    const { properties, required } = this.config.schema;

    // Check required fields
    if (required) {
      for (const field of required) {
        if (!(field in paramsObj)) {
          errors.push(`Missing required field: ${field}`);
        }
      }
    }

    // Type check each property
    for (const [key, value] of Object.entries(paramsObj)) {
      const schema = properties[key];
      if (!schema) {
        continue; // Allow additional properties by default
      }

      const typeError = this.validateType(key, value, schema);
      if (typeError) {
        errors.push(typeError);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate a single value against its schema
   */
  private validateType(
    key: string,
    value: unknown,
    schema: MCPSchemaProperty
  ): string | null {
    if (value === undefined || value === null) {
      return null; // Optional fields can be undefined
    }

    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (schema.type === 'array' && !Array.isArray(value)) {
      return `${key} must be an array`;
    }

    if (schema.type !== 'array' && actualType !== schema.type) {
      return `${key} must be of type ${schema.type}, got ${actualType}`;
    }

    if (schema.enum && !schema.enum.includes(value as string)) {
      return `${key} must be one of: ${schema.enum.join(', ')}`;
    }

    if (schema.type === 'number') {
      const num = value as number;
      if (schema.minimum !== undefined && num < schema.minimum) {
        return `${key} must be >= ${schema.minimum}`;
      }
      if (schema.maximum !== undefined && num > schema.maximum) {
        return `${key} must be <= ${schema.maximum}`;
      }
    }

    if (schema.type === 'string') {
      const str = value as string;
      if (schema.minLength !== undefined && str.length < schema.minLength) {
        return `${key} must be at least ${schema.minLength} characters`;
      }
      if (schema.maxLength !== undefined && str.length > schema.maxLength) {
        return `${key} must be at most ${schema.maxLength} characters`;
      }
    }

    return null;
  }

  /**
   * Invoke the tool (validate and execute)
   *
   * @param params - Tool parameters
   * @param options - Execution options
   * @returns Tool result with metadata
   */
  async invoke(
    params: TParams,
    options: {
      streaming?: boolean;
      onStream?: StreamCallback;
      abortSignal?: AbortSignal;
    } = {}
  ): Promise<ToolResult<TResult>> {
    const startTime = Date.now();
    const requestId = uuidv4();

    // Validate parameters
    const validation = this.validate(params);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join('; ')}`,
        metadata: this.createMetadata(startTime, requestId),
      };
    }

    // Create execution context
    const context: MCPToolContext = {
      requestId,
      startTime,
      streaming: options.streaming,
      onStream: options.onStream,
      abortSignal: options.abortSignal,
    };

    try {
      // Execute the tool
      const result = await this.execute(params, context);

      // Add metadata
      return {
        ...result,
        metadata: {
          ...result.metadata,
          ...this.createMetadata(startTime, requestId),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: this.createMetadata(startTime, requestId),
      };
    }
  }

  /**
   * Create result metadata
   */
  protected createMetadata(
    startTime: number,
    requestId: string
  ): ToolResultMetadata {
    return {
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
      requestId,
      domain: this.config.domain,
      toolName: this.config.name,
    };
  }

  /**
   * Helper to emit streaming data
   */
  protected emitStream(context: MCPToolContext, data: unknown): void {
    if (context.streaming && context.onStream) {
      context.onStream(data);
    }
  }

  /**
   * Helper to check if operation was aborted
   */
  protected isAborted(context: MCPToolContext): boolean {
    return context.abortSignal?.aborted ?? false;
  }

  /**
   * Get tool name for registration
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * Get tool description
   */
  get description(): string {
    return this.config.description;
  }

  /**
   * Get domain this tool belongs to
   */
  get domain(): DomainName {
    return this.config.domain;
  }

  /**
   * Get JSON schema for the tool
   */
  getSchema(): MCPToolSchema {
    return this.config.schema;
  }

  /**
   * Get tool timeout
   */
  get timeout(): number {
    return this.config.timeout ?? 60000;
  }

  /**
   * Check if tool supports streaming
   */
  get supportsStreaming(): boolean {
    return this.config.streaming ?? false;
  }
}

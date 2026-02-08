/**
 * Agentic QE v3 - MCP Tool Base Class
 *
 * Base infrastructure for MCP tools implementing ADR-010.
 * All domain tools extend this base class.
 */

import { v4 as uuidv4 } from 'uuid';
import { DomainName } from '../../shared/types';
import { ToolResult, ToolResultMetadata } from '../types';
import { MemoryBackend } from '../../kernel/interfaces';
import { HybridMemoryBackend } from '../../kernel/hybrid-backend';
import { findProjectRoot } from '../../kernel/unified-memory.js';
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Shared Memory Backend for MCP Tools
// ============================================================================

let sharedMemoryBackend: MemoryBackend | null = null;
let memoryInitPromise: Promise<MemoryBackend> | null = null;

/**
 * Get or create the shared memory backend for MCP tools.
 * All tools share the same backend to ensure data persistence.
 */
export async function getSharedMemoryBackend(): Promise<MemoryBackend> {
  // Return existing backend if available
  if (sharedMemoryBackend) {
    return sharedMemoryBackend;
  }

  // Wait for initialization if in progress
  if (memoryInitPromise) {
    return memoryInitPromise;
  }

  // Initialize new backend
  memoryInitPromise = (async () => {
    const projectRoot = findProjectRoot();
    const dataDir = path.join(projectRoot, '.agentic-qe');

    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // All data goes to unified memory.db via UnifiedMemoryManager
    const backend = new HybridMemoryBackend({
      sqlite: {
        path: path.join(dataDir, 'memory.db'),
        walMode: true,
        poolSize: 3,
        busyTimeout: 5000,
      },
      enableFallback: true,
      defaultNamespace: 'mcp-tools',
    });

    await backend.initialize();
    sharedMemoryBackend = backend;
    return backend;
  })();

  return memoryInitPromise;
}

/**
 * Reset the shared memory backend singleton.
 * Used in tests to ensure clean state between test runs.
 */
export function resetSharedMemoryBackend(): void {
  if (sharedMemoryBackend) {
    // Don't await dispose in reset - let tests handle cleanup
    sharedMemoryBackend = null;
  }
  memoryInitPromise = null;
}

/**
 * Get memory backend from context or create shared one
 */
export async function getMemoryBackend(context?: MCPToolContext): Promise<MemoryBackend> {
  if (context?.memory) {
    return context.memory;
  }
  return getSharedMemoryBackend();
}

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
  /** Explicit demo mode - when true, returns sample data without calling real services */
  demoMode?: boolean;
  /** Shared memory backend for persistent storage */
  memory?: import('../../kernel/interfaces').MemoryBackend;
}

/**
 * Data source tracking for audit/transparency
 */
export type DataSource = 'real' | 'demo' | 'fallback';

/**
 * Logger interface for tool operations
 */
export interface ToolLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Default console logger
 */
export const defaultToolLogger: ToolLogger = {
  info: (msg, data) => console.log(`[MCP-TOOL] ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`[MCP-TOOL] ⚠️ ${msg}`, data || ''),
  error: (msg, data) => console.error(`[MCP-TOOL] ❌ ${msg}`, data || ''),
};

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
   * Logger for tool operations
   */
  protected logger: ToolLogger = defaultToolLogger;

  /**
   * Track data source for current execution
   */
  protected currentDataSource: DataSource = 'real';

  /**
   * Set logger for this tool
   */
  setLogger(logger: ToolLogger): void {
    this.logger = logger;
  }

  /**
   * Mark result as coming from demo/sample data
   * MUST be called when returning sample data for transparency
   */
  protected markAsDemoData(context: MCPToolContext, reason: string): void {
    this.currentDataSource = context.demoMode ? 'demo' : 'fallback';
    this.logger.warn(`${this.config.name} returning ${this.currentDataSource} data`, {
      reason,
      requestId: context.requestId,
      demoMode: context.demoMode,
    });
  }

  /**
   * Mark result as coming from real service data
   */
  protected markAsRealData(): void {
    this.currentDataSource = 'real';
  }

  /**
   * Check if demo mode is explicitly requested
   */
  protected isDemoMode(context: MCPToolContext): boolean {
    return context.demoMode === true;
  }

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
      /** Explicit demo mode - returns sample data without calling real services */
      demoMode?: boolean;
    } = {}
  ): Promise<ToolResult<TResult>> {
    const startTime = Date.now();
    const requestId = uuidv4();

    // Reset data source tracking for this invocation
    this.currentDataSource = 'real';

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
      demoMode: options.demoMode,
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
      dataSource: this.currentDataSource,
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

  /**
   * Reset any instance-level service caches.
   * Override in tools that cache service instances to prevent
   * stale references after fleet disposal/reinitialization.
   *
   * This is called by disposeFleet() to ensure all tool caches
   * are cleared when the kernel/memory backend is disposed.
   */
  resetInstanceCache(): void {
    // Default implementation does nothing.
    // Override in tools that have instance-level service caches.
  }
}

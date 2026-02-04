/**
 * DeterministicToolGateway Integration for Agentic QE Fleet
 *
 * Wires tool idempotency enforcement to the AQE agent coordination.
 * Provides idempotency key generation, request deduplication, schema validation,
 * and response caching for idempotent operations.
 *
 * @module governance/deterministic-gateway-integration
 * @see ADR-058-guidance-governance-integration.md
 */

import { governanceFlags, isStrictMode, isDeterministicGatewayEnabled } from './feature-flags.js';
import type { GovernanceFeatureFlags } from './feature-flags.js';

/**
 * Gateway decision result for tool calls
 */
export interface GatewayDecision {
  allowed: boolean;
  reason?: string;
  cachedResult?: unknown;
  isDuplicate?: boolean;
  idempotencyKey?: string;
  validationErrors?: ValidationError[];
}

/**
 * Schema validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  expected?: string;
  received?: string;
}

/**
 * Tool schema definition
 */
export interface ToolSchema {
  toolName: string;
  params: Record<string, ParamSchema>;
  isIdempotent?: boolean;
  cacheableDurationMs?: number;
}

/**
 * Parameter schema for validation
 */
export interface ParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: unknown[];
  items?: ParamSchema;
  properties?: Record<string, ParamSchema>;
}

/**
 * Cached result entry
 */
interface CacheEntry {
  result: unknown;
  timestamp: number;
  toolName: string;
  expiresAt: number;
}

/**
 * Request tracking entry
 */
interface RequestEntry {
  idempotencyKey: string;
  toolName: string;
  params: unknown;
  timestamp: number;
  completed: boolean;
  result?: unknown;
}

// isDeterministicGatewayEnabled is imported from feature-flags.js

/**
 * Get deterministic gateway flags with defaults
 */
function getDeterministicFlags(): {
  enabled: boolean;
  deduplicationWindowMs: number;
  cacheResultsForIdempotent: boolean;
  validateSchemas: boolean;
} {
  const flags = governanceFlags.getFlags() as GovernanceFeatureFlags & {
    deterministicGateway?: {
      enabled: boolean;
      deduplicationWindowMs: number;
      cacheResultsForIdempotent: boolean;
      validateSchemas: boolean;
    };
  };

  return flags.deterministicGateway ?? {
    enabled: false,
    deduplicationWindowMs: 5000,
    cacheResultsForIdempotent: true,
    validateSchemas: true,
  };
}

/**
 * DeterministicGateway integration for AQE tool coordination
 */
export class DeterministicGatewayIntegration {
  private requestHistory: Map<string, RequestEntry> = new Map();
  private resultCache: Map<string, CacheEntry> = new Map();
  private toolSchemas: Map<string, ToolSchema> = new Map();
  private initialized = false;

  /**
   * Initialize the DeterministicGateway integration
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Register default tool schemas for common AQE operations
    this.registerDefaultSchemas();
    this.initialized = true;
  }

  /**
   * Register default schemas for AQE tools
   */
  private registerDefaultSchemas(): void {
    // Memory operations are idempotent
    this.registerToolSchema({
      toolName: 'memory_store',
      params: {
        key: { type: 'string', required: true, minLength: 1 },
        value: { type: 'object', required: true },
        namespace: { type: 'string', required: false },
      },
      isIdempotent: true,
      cacheableDurationMs: 60000, // 1 minute
    });

    this.registerToolSchema({
      toolName: 'memory_retrieve',
      params: {
        key: { type: 'string', required: true, minLength: 1 },
        namespace: { type: 'string', required: false },
      },
      isIdempotent: true,
      cacheableDurationMs: 30000, // 30 seconds
    });

    this.registerToolSchema({
      toolName: 'test_execute',
      params: {
        testFiles: { type: 'array', required: true },
        parallel: { type: 'boolean', required: false },
      },
      isIdempotent: false, // Test execution can have side effects
    });

    this.registerToolSchema({
      toolName: 'coverage_analyze',
      params: {
        target: { type: 'string', required: true },
        detectGaps: { type: 'boolean', required: false },
      },
      isIdempotent: true,
      cacheableDurationMs: 120000, // 2 minutes
    });

    this.registerToolSchema({
      toolName: 'quality_assess',
      params: {
        target: { type: 'string', required: true },
        metrics: { type: 'array', required: false },
      },
      isIdempotent: true,
      cacheableDurationMs: 60000,
    });
  }

  /**
   * Register a tool schema for validation
   */
  registerToolSchema(schema: ToolSchema): void {
    this.toolSchemas.set(schema.toolName, schema);
  }

  /**
   * Evaluate a tool call before execution
   * Returns decision about whether to proceed, use cache, or reject
   */
  async beforeToolCall(
    toolName: string,
    params: unknown,
    idempotencyKey?: string
  ): Promise<GatewayDecision> {
    if (!isDeterministicGatewayEnabled()) {
      return { allowed: true };
    }

    await this.initialize();

    const flags = getDeterministicFlags();
    const key = idempotencyKey || this.generateIdempotencyKey(toolName, params);

    // Clean up expired entries
    this.cleanupExpiredEntries();

    // Check for duplicate requests within deduplication window FIRST
    // This ensures idempotency is enforced regardless of validation outcome
    if (this.isDuplicate(key)) {
      const existing = this.requestHistory.get(key)!;

      if (existing.completed && flags.cacheResultsForIdempotent) {
        // Return cached result for completed duplicate
        this.logEvent(toolName, 'duplicate_with_cache', key);
        return {
          allowed: false,
          reason: 'Duplicate request - returning cached result',
          cachedResult: existing.result,
          isDuplicate: true,
          idempotencyKey: key,
        };
      }

      // Request is in-flight
      this.logEvent(toolName, 'duplicate_in_flight', key);
      return {
        allowed: !isStrictMode(),
        reason: 'Duplicate request in-flight',
        isDuplicate: true,
        idempotencyKey: key,
      };
    }

    // Track this request BEFORE validation so we detect duplicates
    // even if the first request had validation errors
    this.requestHistory.set(key, {
      idempotencyKey: key,
      toolName,
      params,
      timestamp: Date.now(),
      completed: false,
    });

    // Validate schema if enabled
    if (flags.validateSchemas) {
      const validationErrors = this.validateParams(toolName, params);

      if (validationErrors.length > 0) {
        this.logEvent(toolName, 'validation_failed', key, validationErrors);
        return {
          allowed: !isStrictMode(),
          reason: `Schema validation failed: ${validationErrors.map(e => e.message).join(', ')}`,
          validationErrors,
          idempotencyKey: key,
        };
      }
    }

    // Check result cache for idempotent operations
    if (flags.cacheResultsForIdempotent) {
      const cached = this.getCachedResult(key);
      if (cached !== null) {
        this.logEvent(toolName, 'cache_hit', key);
        return {
          allowed: false,
          reason: 'Returning cached result for idempotent operation',
          cachedResult: cached,
          idempotencyKey: key,
        };
      }
    }

    return {
      allowed: true,
      idempotencyKey: key,
    };
  }

  /**
   * Record tool call result after execution
   */
  async afterToolCall(
    toolName: string,
    result: unknown,
    idempotencyKey: string
  ): Promise<void> {
    if (!isDeterministicGatewayEnabled()) return;

    const flags = getDeterministicFlags();
    const entry = this.requestHistory.get(idempotencyKey);

    if (entry) {
      entry.completed = true;
      entry.result = result;
    }

    // Cache result for idempotent operations
    if (flags.cacheResultsForIdempotent) {
      const schema = this.toolSchemas.get(toolName);

      if (schema?.isIdempotent) {
        const cacheMs = schema.cacheableDurationMs || 60000;
        this.resultCache.set(idempotencyKey, {
          result,
          timestamp: Date.now(),
          toolName,
          expiresAt: Date.now() + cacheMs,
        });
      }
    }
  }

  /**
   * Generate a deterministic idempotency key from tool name and params
   */
  generateIdempotencyKey(toolName: string, params: unknown): string {
    const data = JSON.stringify({ toolName, params }, this.sortKeys);
    return this.hashString(data);
  }

  /**
   * Check if a request is a duplicate within the deduplication window
   */
  isDuplicate(idempotencyKey: string): boolean {
    const flags = getDeterministicFlags();
    const entry = this.requestHistory.get(idempotencyKey);

    if (!entry) return false;

    const age = Date.now() - entry.timestamp;
    return age < flags.deduplicationWindowMs;
  }

  /**
   * Get cached result for an idempotency key
   */
  getCachedResult(idempotencyKey: string): unknown | null {
    const entry = this.resultCache.get(idempotencyKey);

    if (!entry) return null;

    // Check if cache has expired
    if (Date.now() > entry.expiresAt) {
      this.resultCache.delete(idempotencyKey);
      return null;
    }

    return entry.result;
  }

  /**
   * Validate params against registered schema
   */
  validateParams(toolName: string, params: unknown): ValidationError[] {
    const schema = this.toolSchemas.get(toolName);

    if (!schema) {
      // No schema registered - allow by default
      return [];
    }

    const errors: ValidationError[] = [];
    const paramsObj = (typeof params === 'object' && params !== null)
      ? params as Record<string, unknown>
      : {};

    for (const [paramName, paramSchema] of Object.entries(schema.params)) {
      const value = paramsObj[paramName];
      const paramErrors = this.validateValue(value, paramSchema, paramName);
      errors.push(...paramErrors);
    }

    return errors;
  }

  /**
   * Validate a single value against its schema
   */
  private validateValue(
    value: unknown,
    schema: ParamSchema,
    path: string
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check required
    if (schema.required && (value === undefined || value === null)) {
      errors.push({
        path,
        message: `${path} is required`,
        expected: schema.type,
        received: 'undefined',
      });
      return errors;
    }

    // Skip validation if value is not provided and not required
    if (value === undefined || value === null) {
      return errors;
    }

    // Type checking
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== schema.type) {
      errors.push({
        path,
        message: `${path} must be of type ${schema.type}`,
        expected: schema.type,
        received: actualType,
      });
      return errors;
    }

    // String validations
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({
          path,
          message: `${path} must be at least ${schema.minLength} characters`,
          expected: `minLength: ${schema.minLength}`,
          received: `length: ${value.length}`,
        });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({
          path,
          message: `${path} must be at most ${schema.maxLength} characters`,
          expected: `maxLength: ${schema.maxLength}`,
          received: `length: ${value.length}`,
        });
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        errors.push({
          path,
          message: `${path} must match pattern ${schema.pattern}`,
          expected: `pattern: ${schema.pattern}`,
          received: value,
        });
      }
    }

    // Number validations
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        errors.push({
          path,
          message: `${path} must be at least ${schema.min}`,
          expected: `min: ${schema.min}`,
          received: `${value}`,
        });
      }
      if (schema.max !== undefined && value > schema.max) {
        errors.push({
          path,
          message: `${path} must be at most ${schema.max}`,
          expected: `max: ${schema.max}`,
          received: `${value}`,
        });
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({
        path,
        message: `${path} must be one of: ${schema.enum.join(', ')}`,
        expected: `enum: [${schema.enum.join(', ')}]`,
        received: String(value),
      });
    }

    // Array item validation
    if (schema.type === 'array' && Array.isArray(value) && schema.items) {
      value.forEach((item, index) => {
        const itemErrors = this.validateValue(item, schema.items!, `${path}[${index}]`);
        errors.push(...itemErrors);
      });
    }

    // Object property validation
    if (schema.type === 'object' && typeof value === 'object' && schema.properties) {
      const objValue = value as Record<string, unknown>;
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const propErrors = this.validateValue(objValue[propName], propSchema, `${path}.${propName}`);
        errors.push(...propErrors);
      }
    }

    return errors;
  }

  /**
   * Clean up expired entries from caches
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const flags = getDeterministicFlags();

    // Clean up request history
    for (const [key, entry] of this.requestHistory) {
      const age = now - entry.timestamp;
      // Keep completed entries longer for caching, but clean up old in-flight
      if (!entry.completed && age > flags.deduplicationWindowMs) {
        this.requestHistory.delete(key);
      } else if (entry.completed && age > flags.deduplicationWindowMs * 10) {
        // Clean up completed entries after 10x the deduplication window
        this.requestHistory.delete(key);
      }
    }

    // Clean up result cache
    for (const [key, entry] of this.resultCache) {
      if (now > entry.expiresAt) {
        this.resultCache.delete(key);
      }
    }
  }

  /**
   * Log governance event
   */
  private logEvent(
    toolName: string,
    eventType: string,
    idempotencyKey: string,
    details?: unknown
  ): void {
    if (!governanceFlags.getFlags().global.logViolations) return;

    console.info(`[DeterministicGateway] ${eventType}:`, {
      toolName,
      idempotencyKey: idempotencyKey.substring(0, 16) + '...',
      eventType,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * JSON stringify replacer to sort keys for deterministic hashing
   */
  private sortKeys = (key: string, value: unknown): unknown => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value as object).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  };

  /**
   * Simple hash function for idempotency keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Return as hex with prefix for readability
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    return `idem_${hex}`;
  }

  /**
   * Get statistics about the gateway
   */
  getStats(): {
    pendingRequests: number;
    cachedResults: number;
    registeredSchemas: number;
    duplicatesPrevented: number;
  } {
    const pendingRequests = [...this.requestHistory.values()]
      .filter(e => !e.completed).length;

    return {
      pendingRequests,
      cachedResults: this.resultCache.size,
      registeredSchemas: this.toolSchemas.size,
      duplicatesPrevented: [...this.requestHistory.values()]
        .filter(e => e.completed).length,
    };
  }

  /**
   * Clear a specific cache entry
   */
  clearCache(idempotencyKey: string): void {
    this.resultCache.delete(idempotencyKey);
    this.requestHistory.delete(idempotencyKey);
  }

  /**
   * Clear all caches
   */
  clearAllCaches(): void {
    this.resultCache.clear();
    this.requestHistory.clear();
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.requestHistory.clear();
    this.resultCache.clear();
    this.toolSchemas.clear();
    this.initialized = false;
  }

  /**
   * Get registered tool schema
   */
  getToolSchema(toolName: string): ToolSchema | undefined {
    return this.toolSchemas.get(toolName);
  }

  /**
   * Check if a tool is registered as idempotent
   */
  isToolIdempotent(toolName: string): boolean {
    const schema = this.toolSchemas.get(toolName);
    return schema?.isIdempotent ?? false;
  }
}

/**
 * Singleton instance
 */
export const deterministicGatewayIntegration = new DeterministicGatewayIntegration();

/**
 * Helper to wrap a tool call with deterministic gateway
 */
export async function withIdempotency<T>(
  toolName: string,
  params: unknown,
  execute: () => Promise<T>,
  idempotencyKey?: string
): Promise<T> {
  const decision = await deterministicGatewayIntegration.beforeToolCall(
    toolName,
    params,
    idempotencyKey
  );

  if (!decision.allowed) {
    if (decision.cachedResult !== undefined) {
      return decision.cachedResult as T;
    }
    throw new Error(decision.reason || 'Tool call not allowed');
  }

  try {
    const result = await execute();
    await deterministicGatewayIntegration.afterToolCall(
      toolName,
      result,
      decision.idempotencyKey!
    );
    return result;
  } catch (error) {
    // Clear from tracking on error
    if (decision.idempotencyKey) {
      deterministicGatewayIntegration.clearCache(decision.idempotencyKey);
    }
    throw error;
  }
}

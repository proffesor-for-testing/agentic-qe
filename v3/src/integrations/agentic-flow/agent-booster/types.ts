/**
 * Agentic QE v3 - Agent Booster Integration Types
 *
 * Agent Booster provides 352x faster mechanical code transforms
 * by using Rust/WASM instead of LLM API calls for simple patterns.
 *
 * Per ADR-051, Agent Booster becomes Tier 0 in the model routing:
 * - Tier 0: Agent Booster (mechanical transforms, <1ms, $0)
 * - Tier 1: Gemini Flash (simple tasks, free tier)
 * - Tier 2: Haiku (budget, ~500ms)
 * - Tier 3: GPT-4-mini (complex, ~1s)
 * - Tier 4: Opus (expert reasoning, ~3s)
 *
 * @module integrations/agentic-flow/agent-booster/types
 */

import type { Result, Severity } from '../../../shared/types';

// ============================================================================
// Transform Types
// ============================================================================

/**
 * Supported code transform types
 *
 * These are mechanical transformations that can be performed
 * without LLM reasoning - just pattern matching and AST manipulation.
 */
export type TransformType =
  | 'var-to-const'      // Convert var declarations to const/let
  | 'add-types'         // Add TypeScript type annotations
  | 'remove-console'    // Remove console.* statements
  | 'promise-to-async'  // Convert .then() chains to async/await
  | 'cjs-to-esm'        // Convert CommonJS to ES modules
  | 'func-to-arrow';    // Convert function declarations to arrow functions

/**
 * All available transform types
 */
export const ALL_TRANSFORM_TYPES: readonly TransformType[] = [
  'var-to-const',
  'add-types',
  'remove-console',
  'promise-to-async',
  'cjs-to-esm',
  'func-to-arrow',
] as const;

/**
 * Transform metadata
 */
export interface TransformMetadata {
  /** Transform type identifier */
  type: TransformType;
  /** Human-readable name */
  name: string;
  /** Description of what the transform does */
  description: string;
  /** Estimated complexity (affects confidence) */
  complexity: 'simple' | 'moderate' | 'complex';
  /** Whether WASM implementation is available */
  wasmAvailable: boolean;
  /** Typical execution time in milliseconds */
  typicalLatencyMs: number;
}

/**
 * Metadata for all supported transforms
 */
export const TRANSFORM_METADATA: Record<TransformType, TransformMetadata> = {
  'var-to-const': {
    type: 'var-to-const',
    name: 'Var to Const/Let',
    description: 'Convert var declarations to const (if not reassigned) or let (if reassigned)',
    complexity: 'simple',
    wasmAvailable: true,
    typicalLatencyMs: 1,
  },
  'add-types': {
    type: 'add-types',
    name: 'Add TypeScript Types',
    description: 'Add TypeScript type annotations to function parameters and return types',
    complexity: 'moderate',
    wasmAvailable: true,
    typicalLatencyMs: 5,
  },
  'remove-console': {
    type: 'remove-console',
    name: 'Remove Console Statements',
    description: 'Remove all console.log, console.warn, console.error, etc. statements',
    complexity: 'simple',
    wasmAvailable: true,
    typicalLatencyMs: 1,
  },
  'promise-to-async': {
    type: 'promise-to-async',
    name: 'Promise to Async/Await',
    description: 'Convert Promise .then()/.catch() chains to async/await syntax',
    complexity: 'complex',
    wasmAvailable: true,
    typicalLatencyMs: 10,
  },
  'cjs-to-esm': {
    type: 'cjs-to-esm',
    name: 'CommonJS to ES Modules',
    description: 'Convert require() calls to import statements and module.exports to export',
    complexity: 'moderate',
    wasmAvailable: true,
    typicalLatencyMs: 5,
  },
  'func-to-arrow': {
    type: 'func-to-arrow',
    name: 'Function to Arrow',
    description: 'Convert function declarations and expressions to arrow functions',
    complexity: 'moderate',
    wasmAvailable: true,
    typicalLatencyMs: 3,
  },
};

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Agent Booster adapter configuration
 */
export interface AgentBoosterConfig {
  /** Enable Agent Booster integration */
  enabled: boolean;

  /** Fall back to LLM when confidence is below threshold */
  fallbackToLLM: boolean;

  /**
   * Confidence threshold for applying transforms (0-1)
   * Below this threshold, will fall back to LLM if fallbackToLLM is true
   */
  confidenceThreshold: number;

  /** Transforms to enable (empty = all) */
  transforms: TransformType[];

  /** Path to WASM module (optional, auto-detected if not provided) */
  wasmPath?: string;

  /** Maximum file size in bytes to process (default: 1MB) */
  maxFileSizeBytes: number;

  /** Timeout for transform operations in milliseconds */
  timeoutMs: number;

  /** Enable caching of transform results */
  cacheEnabled: boolean;

  /** Cache TTL in milliseconds */
  cacheTtlMs: number;
}

/**
 * Default Agent Booster configuration
 */
export const DEFAULT_AGENT_BOOSTER_CONFIG: AgentBoosterConfig = {
  enabled: true,
  fallbackToLLM: true,
  confidenceThreshold: 0.7,
  transforms: [], // Empty = all transforms enabled
  maxFileSizeBytes: 1024 * 1024, // 1MB
  timeoutMs: 5000,
  cacheEnabled: true,
  cacheTtlMs: 5 * 60 * 1000, // 5 minutes
};

// ============================================================================
// Transform Result Types
// ============================================================================

/**
 * Location in source code
 */
export interface SourceLocation {
  /** Line number (1-indexed) */
  line: number;
  /** Column number (0-indexed) */
  column: number;
  /** Character offset from start */
  offset: number;
}

/**
 * A single code change/edit
 */
export interface CodeEdit {
  /** Start location of the edit */
  start: SourceLocation;
  /** End location of the edit */
  end: SourceLocation;
  /** Original text being replaced */
  oldText: string;
  /** New text to insert */
  newText: string;
  /** Description of the change */
  description: string;
}

/**
 * Result of a single transform operation
 */
export interface TransformResult {
  /** Whether the transform was successful */
  success: boolean;

  /** Transform type that was applied */
  transformType: TransformType;

  /** Original source code */
  originalCode: string;

  /** Transformed source code (if successful) */
  transformedCode: string;

  /** Individual edits that were made */
  edits: CodeEdit[];

  /** Number of changes made */
  changeCount: number;

  /**
   * Confidence score (0-1)
   * Higher = more confident the transform is correct
   */
  confidence: number;

  /** Execution time in milliseconds */
  durationMs: number;

  /** Which implementation was used */
  implementationUsed: 'wasm' | 'typescript' | 'llm';

  /** Whether this was a fallback from a higher-priority implementation */
  usedFallback: boolean;

  /** Error message if failed */
  error?: string;

  /** Warnings about potential issues */
  warnings: string[];
}

/**
 * Input file for batch processing
 */
export interface CodeFile {
  /** File path (relative or absolute) */
  path: string;
  /** File content */
  content: string;
  /** Programming language (inferred if not provided) */
  language?: 'typescript' | 'javascript' | 'jsx' | 'tsx';
}

/**
 * Result of a single file in batch processing
 */
export interface FileTransformResult {
  /** File path */
  path: string;
  /** Transform result */
  result: TransformResult;
}

/**
 * Result of batch transform operation
 */
export interface BatchTransformResult {
  /** Whether all transforms were successful */
  success: boolean;

  /** Transform type that was applied */
  transformType: TransformType;

  /** Individual file results */
  files: FileTransformResult[];

  /** Total files processed */
  totalFiles: number;

  /** Files successfully transformed */
  successCount: number;

  /** Files that failed transformation */
  failureCount: number;

  /** Files with no changes needed */
  noChangeCount: number;

  /** Total changes across all files */
  totalChanges: number;

  /** Total execution time in milliseconds */
  durationMs: number;

  /** Summary of errors */
  errors: Array<{ path: string; error: string }>;
}

// ============================================================================
// Transform Opportunity Types
// ============================================================================

/**
 * A detected opportunity for code transformation
 */
export interface TransformOpportunity {
  /** Transform type that could be applied */
  type: TransformType;

  /** Confidence that this transform is appropriate (0-1) */
  confidence: number;

  /** Location of the opportunity in source */
  location: SourceLocation;

  /** The code snippet that could be transformed */
  codeSnippet: string;

  /** Suggested transformed code */
  suggestedCode: string;

  /** Explanation of why this transform is suggested */
  reason: string;

  /** Risk level of applying this transform */
  risk: Severity;

  /** Estimated time to apply in milliseconds */
  estimatedDurationMs: number;
}

/**
 * Result of opportunity detection
 */
export interface OpportunityDetectionResult {
  /** Opportunities found */
  opportunities: TransformOpportunity[];

  /** Total opportunities found */
  totalCount: number;

  /** Grouped by transform type */
  byType: Record<TransformType, number>;

  /** Execution time in milliseconds */
  durationMs: number;

  /** Whether analysis completed fully */
  complete: boolean;

  /** Warnings during analysis */
  warnings: string[];
}

// ============================================================================
// Adapter Interface
// ============================================================================

/**
 * Agent Booster adapter interface
 * Provides fast mechanical code transforms using Rust/WASM or TypeScript fallback
 */
export interface IAgentBoosterAdapter {
  /**
   * Apply a single transform to code
   *
   * @param code - Source code to transform
   * @param type - Transform type to apply
   * @returns Transform result with confidence and changes
   */
  transform(code: string, type: TransformType): Promise<TransformResult>;

  /**
   * Apply a transform to multiple files
   *
   * @param files - Files to transform
   * @param type - Transform type to apply
   * @returns Batch result with per-file results
   */
  batchTransform(files: CodeFile[], type: TransformType): Promise<BatchTransformResult>;

  /**
   * Detect opportunities for code transformation
   *
   * @param code - Source code to analyze
   * @returns Detected opportunities with confidence scores
   */
  detectTransformOpportunities(code: string): Promise<OpportunityDetectionResult>;

  /**
   * Check if a specific transform is available
   *
   * @param type - Transform type to check
   * @returns True if transform is available
   */
  isTransformAvailable(type: TransformType): boolean;

  /**
   * Get metadata for a transform type
   *
   * @param type - Transform type
   * @returns Transform metadata
   */
  getTransformMetadata(type: TransformType): TransformMetadata;

  /**
   * Get all available transforms
   *
   * @returns List of available transform types
   */
  getAvailableTransforms(): TransformType[];

  /**
   * Check if WASM implementation is available
   *
   * @returns True if WASM is loaded and ready
   */
  isWasmAvailable(): boolean;

  /**
   * Get adapter health/status
   *
   * @returns Health check result
   */
  getHealth(): AgentBoosterHealth;

  /**
   * Initialize the adapter (load WASM, etc.)
   *
   * @returns Promise that resolves when ready
   */
  initialize(): Promise<void>;

  /**
   * Dispose of adapter resources
   */
  dispose(): Promise<void>;
}

/**
 * Health status for Agent Booster
 */
export interface AgentBoosterHealth {
  /** Whether adapter is ready */
  ready: boolean;

  /** Whether WASM is available */
  wasmAvailable: boolean;

  /** ADR-051: Whether transforms loaded from PatternLoader */
  patternsLoaded: boolean;

  /** Available transforms */
  availableTransforms: TransformType[];

  /** Last health check timestamp */
  lastChecked: Date;

  /** Any issues detected */
  issues: string[];

  /** Performance metrics */
  metrics: {
    totalTransforms: number;
    successfulTransforms: number;
    averageDurationMs: number;
    cacheHitRate: number;
  };
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error for Agent Booster operations
 */
export class AgentBoosterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'AgentBoosterError';
  }
}

/**
 * Error when transform fails
 */
export class TransformError extends AgentBoosterError {
  constructor(
    message: string,
    public readonly transformType: TransformType,
    cause?: Error
  ) {
    super(message, 'TRANSFORM_ERROR', cause);
    this.name = 'TransformError';
  }
}

/**
 * Error when WASM module is unavailable
 */
export class WasmUnavailableError extends AgentBoosterError {
  constructor(message: string = 'WASM module is not available', cause?: Error) {
    super(message, 'WASM_UNAVAILABLE', cause);
    this.name = 'WasmUnavailableError';
  }
}

/**
 * Error when transform times out
 */
export class TransformTimeoutError extends AgentBoosterError {
  constructor(
    message: string,
    public readonly transformType: TransformType,
    public readonly timeoutMs: number
  ) {
    super(message, 'TRANSFORM_TIMEOUT');
    this.name = 'TransformTimeoutError';
  }
}

/**
 * Error when file is too large
 */
export class FileTooLargeError extends AgentBoosterError {
  constructor(
    public readonly filePath: string,
    public readonly sizeBytes: number,
    public readonly maxSizeBytes: number
  ) {
    super(
      `File ${filePath} is too large (${sizeBytes} bytes, max ${maxSizeBytes} bytes)`,
      'FILE_TOO_LARGE'
    );
    this.name = 'FileTooLargeError';
  }
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Transform result wrapped in Result type
 */
export type TransformResultType = Result<TransformResult, AgentBoosterError>;

/**
 * Batch transform result wrapped in Result type
 */
export type BatchTransformResultType = Result<BatchTransformResult, AgentBoosterError>;

/**
 * Opportunity detection result wrapped in Result type
 */
export type OpportunityDetectionResultType = Result<OpportunityDetectionResult, AgentBoosterError>;

/**
 * Cache entry for transform results
 */
export interface TransformCacheEntry {
  /** Cache key (hash of code + transform type) */
  key: string;
  /** Cached result */
  result: TransformResult;
  /** Timestamp when cached */
  cachedAt: Date;
  /** Expiration timestamp */
  expiresAt: Date;
}

/**
 * Logger interface for Agent Booster operations
 */
export interface AgentBoosterLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

/**
 * Default no-op logger
 */
export const DEFAULT_LOGGER: AgentBoosterLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

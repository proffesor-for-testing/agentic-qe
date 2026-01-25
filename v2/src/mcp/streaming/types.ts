/**
 * Streaming MCP Types
 *
 * Type definitions for streaming support in MCP tools with real-time progress updates.
 * Supports AsyncGenerator pattern for progressive result emission.
 *
 * @version 1.0.5
 * @author Agentic QE Team
 */

/**
 * Base progress event for streaming operations
 */
export interface ToolProgress {
  type: 'progress';
  message: string;
  percent: number;
  currentItem?: string;
  itemsProcessed?: number;
  itemsTotal?: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

/**
 * Final result event for completed operations
 */
export interface ToolResult {
  type: 'result';
  data: any;
  timestamp: string;
  executionTime?: number;
  metadata?: Record<string, any>;
}

/**
 * Error event for failed operations
 */
export interface ToolError {
  type: 'error';
  error: string;
  details?: any;
  timestamp: string;
  recoverable?: boolean;
}

/**
 * Union type for all streaming events
 */
export type StreamEvent = ToolProgress | ToolResult | ToolError;

/**
 * Streaming session state for tracking active operations
 */
export interface StreamingSession {
  id: string;
  toolName: string;
  startedAt: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  progress: {
    percent: number;
    message: string;
    itemsProcessed: number;
    itemsTotal: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Configuration for streaming behavior
 */
export interface StreamingConfig {
  /** Minimum interval between progress updates (ms) */
  progressInterval: number;

  /** Whether to buffer events for batching */
  bufferEvents: boolean;

  /** Maximum buffer size before forcing flush */
  maxBufferSize: number;

  /** Timeout for streaming operations (ms) */
  timeout: number;

  /** Whether to persist session state to memory */
  persistSession: boolean;
}

/**
 * Default streaming configuration
 */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  progressInterval: 5000, // 5 seconds
  bufferEvents: false,
  maxBufferSize: 10,
  timeout: 600000, // 10 minutes
  persistSession: true
};

/**
 * Progress reporter interface for emitting progress updates
 */
export interface ProgressReporter {
  /** Report progress update */
  report(progress: Omit<ToolProgress, 'type' | 'timestamp'>): Promise<void>;

  /** Report completion */
  complete(result: Omit<ToolResult, 'type' | 'timestamp'>): Promise<void>;

  /** Report error */
  error(error: Omit<ToolError, 'type' | 'timestamp'>): Promise<void>;

  /** Get current progress */
  getProgress(): ToolProgress | null;

  /** Cancel streaming operation */
  cancel(): Promise<void>;
}

/**
 * Helper to create progress event
 */
export function createProgress(
  message: string,
  percent: number,
  options?: Partial<Omit<ToolProgress, 'type' | 'message' | 'percent' | 'timestamp'>>
): ToolProgress {
  return {
    type: 'progress',
    message,
    percent: Math.min(100, Math.max(0, percent)),
    timestamp: new Date().toISOString(),
    ...options
  };
}

/**
 * Helper to create result event
 */
export function createResult(
  data: any,
  options?: Partial<Omit<ToolResult, 'type' | 'data' | 'timestamp'>>
): ToolResult {
  return {
    type: 'result',
    data,
    timestamp: new Date().toISOString(),
    ...options
  };
}

/**
 * Helper to create error event
 */
export function createError(
  error: string,
  options?: Partial<Omit<ToolError, 'type' | 'error' | 'timestamp'>>
): ToolError {
  return {
    type: 'error',
    error,
    timestamp: new Date().toISOString(),
    recoverable: false,
    ...options
  };
}

/**
 * Calculate progress percentage based on items processed
 */
export function calculateProgress(processed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((processed / total) * 100);
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

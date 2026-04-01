/**
 * Agentic QE v3 - Batch Tool Executor
 *
 * IMP-02: Tool Concurrency Partitioning
 *
 * Enables parallel execution of concurrent-safe tool calls within internal
 * orchestration paths (task_orchestrate, fleet batch ops). Does NOT change
 * the MCP protocol contract — MCP still sends one tool call per request.
 *
 * Strategy:
 *   1. Partition consecutive isConcurrencySafe:true calls into batches
 *   2. Non-safe calls break the batch and run alone, sequentially
 *   3. Each safe batch runs via Promise.all() with a semaphore limiter
 *   4. Results are returned in original input order
 */

// ============================================================================
// Types
// ============================================================================

export interface BatchToolCall {
  name: string;
  handler: () => Promise<unknown>;
  isConcurrencySafe: boolean;
}

export interface BatchResult {
  results: unknown[];
  parallelBatches: number;
  sequentialCalls: number;
  totalWallTimeMs: number;
}

// ============================================================================
// Semaphore — simple concurrency limiter
// ============================================================================

export class Semaphore {
  private permits: number;
  private readonly waiting: Array<() => void> = [];

  constructor(permits: number) {
    if (permits < 1) {
      throw new Error('Semaphore permits must be >= 1');
    }
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    if (this.waiting.length > 0) {
      const next = this.waiting.shift()!;
      // Resolve on next microtick to avoid stack issues
      queueMicrotask(next);
    } else {
      this.permits++;
    }
  }

  /** Current number of available permits (useful for testing). */
  get available(): number {
    return this.permits;
  }
}

// ============================================================================
// Partition helper
// ============================================================================

interface Segment {
  kind: 'parallel' | 'sequential';
  /** Indices into the original calls array */
  indices: number[];
}

/**
 * Partition an array of calls into consecutive segments:
 *   - Consecutive safe calls → parallel segment
 *   - Each non-safe call → its own sequential segment
 */
function partitionCalls(calls: BatchToolCall[]): Segment[] {
  const segments: Segment[] = [];
  let currentSafe: number[] = [];

  for (let i = 0; i < calls.length; i++) {
    if (calls[i].isConcurrencySafe) {
      currentSafe.push(i);
    } else {
      // Flush any accumulated safe calls as a parallel batch
      if (currentSafe.length > 0) {
        segments.push({ kind: 'parallel', indices: currentSafe });
        currentSafe = [];
      }
      segments.push({ kind: 'sequential', indices: [i] });
    }
  }

  // Flush trailing safe calls
  if (currentSafe.length > 0) {
    segments.push({ kind: 'parallel', indices: currentSafe });
  }

  return segments;
}

// ============================================================================
// BatchToolExecutor
// ============================================================================

const DEFAULT_MAX_CONCURRENCY = 10;
const ENV_KEY = 'AQE_MAX_TOOL_CONCURRENCY';

export class BatchToolExecutor {
  private readonly maxConcurrency: number;

  constructor(maxConcurrency?: number) {
    if (maxConcurrency !== undefined) {
      this.maxConcurrency = maxConcurrency;
    } else {
      const envVal = process.env[ENV_KEY];
      this.maxConcurrency =
        envVal && !isNaN(Number(envVal)) && Number(envVal) >= 1
          ? Number(envVal)
          : DEFAULT_MAX_CONCURRENCY;
    }
  }

  /**
   * Execute a batch of tool calls respecting concurrency safety annotations.
   *
   * @returns BatchResult with results in the same order as the input calls.
   */
  async executeBatch(calls: BatchToolCall[]): Promise<BatchResult> {
    if (calls.length === 0) {
      return {
        results: [],
        parallelBatches: 0,
        sequentialCalls: 0,
        totalWallTimeMs: 0,
      };
    }

    const startTime = Date.now();
    const segments = partitionCalls(calls);
    const results: unknown[] = new Array(calls.length);

    let parallelBatches = 0;
    let sequentialCalls = 0;

    const semaphore = new Semaphore(this.maxConcurrency);

    for (const segment of segments) {
      if (segment.kind === 'parallel') {
        parallelBatches++;
        const batchResults = await Promise.all(
          segment.indices.map(async (idx) => {
            await semaphore.acquire();
            try {
              return await calls[idx].handler();
            } finally {
              semaphore.release();
            }
          })
        );

        // Place results back at original indices
        for (let j = 0; j < segment.indices.length; j++) {
          results[segment.indices[j]] = batchResults[j];
        }
      } else {
        // Sequential: exactly one call
        sequentialCalls++;
        const idx = segment.indices[0];
        results[idx] = await calls[idx].handler();
      }
    }

    return {
      results,
      parallelBatches,
      sequentialCalls,
      totalWallTimeMs: Date.now() - startTime,
    };
  }
}

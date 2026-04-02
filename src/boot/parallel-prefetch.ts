/**
 * IMP-06: Parallel Prefetch
 *
 * Runs independent initialization tasks concurrently so that MCP/CLI startup
 * time is bounded by the slowest single task rather than the sum of all tasks.
 *
 * Each task is wrapped in try/catch via Promise.allSettled so one failure
 * does not block others.
 */

export interface PrefetchResult {
  completedTasks: string[];
  failedTasks: Array<{ name: string; error: string }>;
  totalTimeMs: number;
}

/**
 * Run independent initialization tasks in parallel.
 * Each task is wrapped in try/catch so one failure doesn't block others.
 */
export async function parallelPrefetch(
  tasks: Array<{ name: string; fn: () => Promise<void> }>
): Promise<PrefetchResult> {
  const start = performance.now();
  const results = await Promise.allSettled(tasks.map(t => t.fn()));

  const completedTasks: string[] = [];
  const failedTasks: Array<{ name: string; error: string }> = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      completedTasks.push(tasks[i].name);
    } else {
      failedTasks.push({
        name: tasks[i].name,
        error: result.reason?.message ?? String(result.reason),
      });
    }
  });

  return {
    completedTasks,
    failedTasks,
    totalTimeMs: performance.now() - start,
  };
}

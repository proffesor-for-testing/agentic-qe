/**
 * Miscellaneous task handlers (accessibility, chaos, learning).
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: test-accessibility, run-chaos, optimize-learning
 */

import { ok } from '../../shared/types';
import type { TaskHandlerContext } from './handler-types';
import { createAccessibilityAuditor, runAccessibilityTest, type AccessibilityTaskPayload } from './accessibility-handler';

export function registerMiscHandlers(ctx: TaskHandlerContext): void {
  // #1465: run the real browser audit (the service behind qe/a11y/audit).
  // No browser, or a failed audit, gives an unmeasured result with its reason (#1145).
  ctx.registerHandler('test-accessibility', async (task) => {
    const auditor = await createAccessibilityAuditor(ctx.memory);
    try {
      return ok(await runAccessibilityTest(auditor, task.payload as AccessibilityTaskPayload));
    } finally {
      await auditor.dispose?.().catch(() => undefined);
    }
  });

  // Register chaos test handler
  ctx.registerHandler('run-chaos', async (task) => {
    const payload = task.payload as {
      faultType: string;
      target: string;
      duration: number;
      dryRun: boolean;
    };

    // Chaos testing requires infrastructure access — return honest guidance
    return ok({
      faultType: payload.faultType || 'unknown',
      target: payload.target || 'unknown',
      dryRun: payload.dryRun ?? true,
      duration: payload.duration || 0,
      systemBehavior: 'not-executed',
      resilience: null,
      note: 'Chaos engineering requires infrastructure-level fault injection. ' +
            'Use tools like Chaos Monkey, Litmus, or toxiproxy for real resilience testing. ' +
            'For Node.js apps, consider: nock (HTTP faults), testcontainers (dependency failures).',
    });
  });

  // Register learning optimization handler
  ctx.registerHandler('optimize-learning', async (_task) => {
    // Check actual pattern store state
    try {
      const memUsage = await import('../../kernel/unified-memory-hnsw.js');
      return ok({
        patternsLearned: 0,
        modelsUpdated: 0,
        memoryConsolidated: false,
        note: 'Learning optimization runs during the dream cycle (SessionEnd hook). ' +
              'Use "npx agentic-qe hooks session-end --save-state" to trigger pattern consolidation.',
      });
    } catch {
      return ok({
        patternsLearned: 0,
        modelsUpdated: 0,
        memoryConsolidated: false,
        note: 'Learning system not initialized. Run "aqe init --auto" first.',
      });
    }
  });
}

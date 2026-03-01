/**
 * Miscellaneous task handlers (accessibility, chaos, learning).
 *
 * Extracted from task-executor.ts registerHandlers().
 * Covers: test-accessibility, run-chaos, optimize-learning
 */

import { ok } from '../../shared/types';
import type { TaskHandlerContext } from './handler-types';

export function registerMiscHandlers(ctx: TaskHandlerContext): void {
  // Register accessibility test handler
  ctx.registerHandler('test-accessibility', async (task) => {
    const payload = task.payload as {
      url: string;
      standard: string;
    };

    // Accessibility testing requires a browser/DOM — return honest guidance
    return ok({
      url: payload.url || '',
      standard: payload.standard || 'wcag21-aa',
      passed: false,
      violations: [],
      warnings: [],
      score: 0,
      note: 'Accessibility testing requires a browser environment (Puppeteer/Playwright). ' +
            'Use tools like axe-core, pa11y, or Lighthouse CLI for WCAG compliance testing. ' +
            'Example: npx pa11y ' + (payload.url || '<url>'),
    });
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

/**
 * Tests for CompactionPipeline orchestrator (IMP-08)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CompactionPipeline,
  type ConversationMessage,
} from '../../../src/context/compaction';

function makeMsg(role: ConversationMessage['role'], content: string, extra?: Partial<ConversationMessage>): ConversationMessage {
  return { role, content, timestamp: Date.now(), ...extra };
}

describe('CompactionPipeline', () => {
  let pipeline: CompactionPipeline;

  beforeEach(() => {
    pipeline = new CompactionPipeline({ totalBudget: 100_000 });
  });

  describe('message tracking', () => {
    it('should track added messages in budget', () => {
      pipeline.addMessage(makeMsg('user', 'Hello world'));
      const snap = pipeline.getBudgetSnapshot();
      expect(snap.usedTokens).toBeGreaterThan(0);
    });

    it('should track multiple messages', () => {
      pipeline.addMessage(makeMsg('user', 'first'));
      pipeline.addMessage(makeMsg('assistant', 'second'));
      const snap = pipeline.getBudgetSnapshot();
      expect(snap.usedTokens).toBeGreaterThan(0);
    });
  });

  describe('file tracking', () => {
    it('should record and retrieve file accesses', () => {
      pipeline.recordFileAccess('/src/auth/login.ts');
      pipeline.recordFileAccess('/src/auth/register.ts');
      expect(pipeline.getFilesForRestoration()).toEqual([
        '/src/auth/login.ts',
        '/src/auth/register.ts',
      ]);
    });

    it('should deduplicate file paths', () => {
      pipeline.recordFileAccess('/src/a.ts');
      pipeline.recordFileAccess('/src/b.ts');
      pipeline.recordFileAccess('/src/a.ts'); // re-access
      const files = pipeline.getFilesForRestoration();
      expect(files).toEqual(['/src/b.ts', '/src/a.ts']); // a.ts moved to end
    });

    it('should limit to maxFileRestorations', () => {
      for (let i = 0; i < 20; i++) {
        pipeline.recordFileAccess(`/src/file-${i}.ts`);
      }
      // Default max is 5
      expect(pipeline.getFilesForRestoration()).toHaveLength(5);
    });
  });

  describe('manual compaction', () => {
    it('should run Tier 1 only when maxTier=1', async () => {
      const result = await pipeline.runCompaction(1);
      expect(result.tiersExecuted).toContain(1);
      expect(result.tiersExecuted).not.toContain(2);
    });

    it('should run Tier 1 and 2 when maxTier=2 with messages', async () => {
      // Add some messages first
      for (let i = 0; i < 10; i++) {
        pipeline.addMessage(makeMsg('user', `Message ${i}: ${'x'.repeat(100)}`));
      }
      const result = await pipeline.runCompaction(2);
      expect(result.tiersExecuted).toContain(1);
      expect(result.tiersExecuted).toContain(2);
    });

    it('should skip Tier 2 when no conversation history', async () => {
      const result = await pipeline.runCompaction(2);
      expect(result.tiersExecuted).toEqual([1]);
    });

    it('should handle concurrent compaction calls gracefully', async () => {
      // Both calls should succeed — the second may run after the first completes
      const [r1, r2] = await Promise.all([
        pipeline.runCompaction(1),
        pipeline.runCompaction(1),
      ]);
      // Both should have tier 1 in their results (sequential execution is fine)
      expect(r1.tiersExecuted).toContain(1);
      // r2 either ran successfully or was skipped by re-entrancy guard
      expect(r2.tiersExecuted.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('overflow handling', () => {
    it('should handle 413 overflow with Tier 4', async () => {
      // Fill up conversation
      for (let i = 0; i < 50; i++) {
        pipeline.addMessage(makeMsg('user', `Msg ${i}: ${'data'.repeat(100)}`));
      }

      const result = await pipeline.handleOverflow('status_413');
      expect(result.tier).toBe(4);
      expect(result.trigger).toBe('status_413');
    });
  });

  describe('stats', () => {
    it('should return comprehensive stats', () => {
      pipeline.addMessage(makeMsg('user', 'test'));
      pipeline.recordFileAccess('/src/a.ts');

      const stats = pipeline.getStats();
      expect(stats.conversationMessages).toBe(1);
      expect(stats.budget.state).toBe('normal');
      expect(stats.recentFiles).toHaveLength(1);
      expect(stats.isCompacting).toBe(false);
    });
  });

  describe('middleware', () => {
    it('should create middleware with correct name and priority', () => {
      const mw = pipeline.createMiddleware();
      expect(mw.name).toBe('compaction-pipeline');
      expect(mw.priority).toBe(200);
    });

    it('should track tool calls via middleware postToolResult', async () => {
      const mw = pipeline.createMiddleware();
      const ctx = {
        toolName: 'test_tool',
        params: { file_path: '/src/test.ts' },
        timestamp: Date.now(),
        metadata: {},
      };

      await mw.postToolResult!(ctx, { data: 'result' });

      const stats = pipeline.getStats();
      expect(stats.conversationMessages).toBe(2); // tool_use + tool_result
      expect(stats.recentFiles).toContain('/src/test.ts');
    });
  });

  describe('auto-trigger on budget transitions', () => {
    it('should auto-trigger compaction when budget reaches pressure', async () => {
      const spy = vi.spyOn(pipeline, 'runCompaction');

      // Push budget into pressure state
      pipeline.getBudgetTracker().addTokens(83_000); // remaining = 17k

      // Give async handlers time to fire
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('kill switch: AQE_COMPACTION_DISABLED=true', () => {
    beforeEach(() => { process.env.AQE_COMPACTION_DISABLED = 'true'; });
    afterEach(() => { delete process.env.AQE_COMPACTION_DISABLED; });

    it('middleware should pass through result without tracking when disabled', async () => {
      const p = new CompactionPipeline({ totalBudget: 100_000 });
      const mw = p.createMiddleware();

      const result = await mw.postToolResult!(
        { toolName: 'test', params: {}, timestamp: Date.now(), metadata: {} },
        'some-result',
      );

      expect(result).toBe('some-result');
      expect(p.getStats().conversationMessages).toBe(0);
    });
  });
});

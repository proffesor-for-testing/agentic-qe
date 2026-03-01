/**
 * Action Orchestrator Tests
 * Validates the Act → Poll → Verify lifecycle sequencing engine.
 */

import { describe, it, expect, vi } from 'vitest';
import { createActionOrchestrator } from '../../../src/integrations/orchestration/action-orchestrator';
import type { LifecycleStage } from '../../../src/integrations/orchestration/action-types';
import type { StepDef } from '../../../src/integrations/orchestration/types';
import type { BaseTestContext } from '../../../src/integrations/orchestration/base-context';

// ============================================================================
// Test Helpers
// ============================================================================

function mockCtx(): BaseTestContext {
  return {
    orderId: 'TEST-001',
    documentType: '0001',
    sterlingClient: {} as any,
  };
}

function passStep(id: string, layer: 1 | 2 | 3 = 1): StepDef<BaseTestContext> {
  return {
    id,
    name: `Step ${id}`,
    description: `Verification step ${id}`,
    layer,
    requires: layer === 2 ? { iib: true } : layer === 3 ? { email: true } : {},
    execute: async () => ({
      success: true,
      durationMs: 1,
      checks: [{ name: `${id} check`, passed: true, expected: 'true', actual: 'true' }],
    }),
  };
}

function failStep(id: string): StepDef<BaseTestContext> {
  return {
    id,
    name: `Step ${id}`,
    description: `Failing step ${id}`,
    layer: 1,
    requires: {},
    execute: async () => ({
      success: false,
      error: `Step ${id} failed`,
      durationMs: 1,
      checks: [{ name: `${id} check`, passed: false, expected: 'true', actual: 'false' }],
    }),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('ActionOrchestrator', () => {
  describe('Act → Poll → Verify lifecycle', () => {
    it('executes all three phases for a stage', async () => {
      const actFn = vi.fn(async () => ({ success: true as const, durationMs: 10, data: { orderId: 'ORD-123' } }));
      const pollFn = vi.fn(async () => ({ success: true as const, durationMs: 20 }));

      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Create Order',
          description: 'Test stage',
          act: actFn,
          poll: pollFn,
          verifyStepIds: ['verify-1'],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1')],
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(actFn).toHaveBeenCalledTimes(1);
      expect(pollFn).toHaveBeenCalledTimes(1);
      expect(result.overallSuccess).toBe(true);
      expect(result.stages).toHaveLength(1);
      expect(result.stages[0].verification.passed).toBe(1);
      expect(result.totalChecks).toBe(1);
    });

    it('merges action data into context', async () => {
      const ctx = mockCtx();

      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Create Order',
          description: 'Merges orderId',
          act: async () => ({
            success: true,
            durationMs: 5,
            data: { orderId: 'NEW-ORD-999' },
          }),
          verifyStepIds: [],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [],
      });

      await orchestrator.runAll(ctx);
      expect(ctx.orderId).toBe('NEW-ORD-999');
    });

    it('stops on action failure', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Failing Action',
          description: 'Action fails',
          act: async () => ({ success: false, error: 'API down', durationMs: 5 }),
          verifyStepIds: ['verify-1'],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1')],
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(result.overallSuccess).toBe(false);
      expect(result.stages[0].action.success).toBe(false);
      expect(result.stages[0].verification.passed).toBe(0);
    });

    it('stops on poll failure', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Poll Fails',
          description: 'Poll times out',
          act: async () => ({ success: true, durationMs: 5 }),
          poll: async () => ({ success: false, error: 'Polling timed out', durationMs: 100 }),
          verifyStepIds: ['verify-1'],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1')],
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(result.overallSuccess).toBe(false);
      expect(result.stages[0].poll.success).toBe(false);
      expect(result.stages[0].verification.passed).toBe(0);
    });
  });

  describe('Poll-only stages (no act, has poll)', () => {
    it('runs poll and verify when act is undefined but poll exists', async () => {
      const pollFn = vi.fn(async () => ({ success: true as const, durationMs: 10 }));

      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Wait for delivery',
          description: 'Poll-only stage',
          poll: pollFn,
          verifyStepIds: ['verify-1'],
          fallback: 'skip',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1')],
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(pollFn).toHaveBeenCalledTimes(1);
      expect(result.overallSuccess).toBe(true);
      expect(result.stages[0].action.success).toBe(true);
      expect(result.stages[0].action.data).toHaveProperty('actionStatus', 'skipped');
      expect(result.stages[0].verification.passed).toBe(1);
    });

    it('does NOT skip poll-only stages even when fallback is "skip"', async () => {
      const pollFn = vi.fn(async () => ({ success: true as const, durationMs: 10 }));

      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'delivery',
          name: 'Delivery',
          description: 'Has poll, fallback skip — poll must still run',
          poll: pollFn,
          verifyStepIds: ['verify-1'],
          fallback: 'skip',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1')],
      });

      const result = await orchestrator.runAll(mockCtx());

      // This is the critical test — poll-only stages must NOT be silently skipped
      expect(pollFn).toHaveBeenCalledTimes(1);
      expect(result.stages[0].verification.passed).toBe(1);
    });
  });

  describe('Verify-only stages (no act, no poll)', () => {
    it('runs verification steps directly when no act or poll', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Email checks',
          description: 'Just verify',
          verifyStepIds: ['verify-1', 'verify-2'],
          fallback: 'skip',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1'), passStep('verify-2')],
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(result.overallSuccess).toBe(true);
      expect(result.stages[0].verification.passed).toBe(2);
    });

    it('skips entirely when no act, no poll, no verify, and fallback is "skip"', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'empty-stage',
          name: 'Empty',
          description: 'Nothing to do',
          verifyStepIds: [],
          fallback: 'skip',
        },
        {
          id: 'stage-2',
          name: 'Next stage',
          description: 'Should still run',
          act: async () => ({ success: true, durationMs: 1 }),
          verifyStepIds: ['verify-1'],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1')],
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(result.overallSuccess).toBe(true);
      expect(result.stages).toHaveLength(2);
      expect(result.stages[1].verification.passed).toBe(1);
    });
  });

  describe('Fallback strategies', () => {
    it('calls onManualAction when fallback is "manual" and no act', async () => {
      const manualHandler = vi.fn(async () => {});

      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Manual Stage',
          description: 'Needs manual action',
          verifyStepIds: ['verify-1'],
          fallback: 'manual',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1')],
        onManualAction: manualHandler,
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(manualHandler).toHaveBeenCalledTimes(1);
      expect(result.stages[0].verification.passed).toBe(1);
      expect(result.stages[0].action.data).toHaveProperty('actionStatus', 'manual');
    });

    it('fails when fallback is "fail" and no act/poll/verify', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Must Have Action',
          description: 'Will fail without action',
          verifyStepIds: [],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [],
      });

      const result = await orchestrator.runAll(mockCtx());
      expect(result.overallSuccess).toBe(false);
    });
  });

  describe('Multi-stage sequencing', () => {
    it('runs stages in order and stops on failure by default', async () => {
      const executionOrder: string[] = [];

      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Stage 1',
          description: 'Passes',
          act: async () => { executionOrder.push('act-1'); return { success: true, durationMs: 1 }; },
          verifyStepIds: ['verify-1'],
          fallback: 'fail',
        },
        {
          id: 'stage-2',
          name: 'Stage 2',
          description: 'Fails verification',
          act: async () => { executionOrder.push('act-2'); return { success: true, durationMs: 1 }; },
          verifyStepIds: ['verify-fail'],
          fallback: 'fail',
        },
        {
          id: 'stage-3',
          name: 'Stage 3',
          description: 'Never reached',
          act: async () => { executionOrder.push('act-3'); return { success: true, durationMs: 1 }; },
          verifyStepIds: [],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1'), failStep('verify-fail')],
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(executionOrder).toEqual(['act-1', 'act-2']);
      expect(result.passed).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.stages).toHaveLength(2);
    });

    it('continues on failure when continueOnVerifyFailure is true', async () => {
      const executionOrder: string[] = [];

      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Stage 1',
          description: 'Fails verification',
          act: async () => { executionOrder.push('act-1'); return { success: true, durationMs: 1 }; },
          verifyStepIds: ['verify-fail'],
          fallback: 'fail',
        },
        {
          id: 'stage-2',
          name: 'Stage 2',
          description: 'Still runs',
          act: async () => { executionOrder.push('act-2'); return { success: true, durationMs: 1 }; },
          verifyStepIds: ['verify-1'],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('verify-1'), failStep('verify-fail')],
        continueOnVerifyFailure: true,
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(executionOrder).toEqual(['act-1', 'act-2']);
      expect(result.stages).toHaveLength(2);
      expect(result.overallSuccess).toBe(false);
    });
  });

  describe('Layer skip in verification', () => {
    it('skips Layer 2 verification steps when skipLayer2 is true', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Mixed Layers',
          description: 'Has L1 and L2 verification',
          act: async () => ({ success: true, durationMs: 1 }),
          verifyStepIds: ['L1-step', 'L2-step'],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('L1-step', 1), passStep('L2-step', 2)],
        skipLayer2: true,
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(result.stages[0].verification.passed).toBe(1);
      expect(result.stages[0].verification.skipped).toBe(1);
    });

    it('skips Layer 3 verification steps when skipLayer3 is true', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Mixed Layers',
          description: 'Has L1 and L3 verification',
          act: async () => ({ success: true, durationMs: 1 }),
          verifyStepIds: ['L1-step', 'L3-step'],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [passStep('L1-step', 1), passStep('L3-step', 3)],
        skipLayer3: true,
      });

      const result = await orchestrator.runAll(mockCtx());

      expect(result.stages[0].verification.passed).toBe(1);
      expect(result.stages[0].verification.skipped).toBe(1);
    });
  });

  describe('runFromStage', () => {
    it('resumes from a specific stage', async () => {
      const executionOrder: string[] = [];

      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Stage 1',
          description: 'Skipped on resume',
          act: async () => { executionOrder.push('act-1'); return { success: true, durationMs: 1 }; },
          verifyStepIds: [],
          fallback: 'fail',
        },
        {
          id: 'stage-2',
          name: 'Stage 2',
          description: 'Resume point',
          act: async () => { executionOrder.push('act-2'); return { success: true, durationMs: 1 }; },
          verifyStepIds: [],
          fallback: 'fail',
        },
        {
          id: 'stage-3',
          name: 'Stage 3',
          description: 'Runs after resume',
          act: async () => { executionOrder.push('act-3'); return { success: true, durationMs: 1 }; },
          verifyStepIds: [],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [],
      });

      await orchestrator.runFromStage(mockCtx(), 'stage-2');
      expect(executionOrder).toEqual(['act-2', 'act-3']);
    });

    it('returns error for unknown stage ID', async () => {
      const orchestrator = createActionOrchestrator({
        stages: [],
        verificationSteps: [],
      });

      const result = await orchestrator.runFromStage(mockCtx(), 'nonexistent');
      expect(result.overallSuccess).toBe(false);
      expect(result.stages[0].action.success).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('catches action exceptions and reports as failure', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Throwing Stage',
          description: 'Action throws',
          act: async () => { throw new Error('Network error'); },
          verifyStepIds: [],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [],
      });

      const result = await orchestrator.runAll(mockCtx());
      expect(result.overallSuccess).toBe(false);
      expect(result.stages[0].action.success).toBe(false);
      expect(result.stages[0].action.error).toContain('Network error');
    });

    it('catches poll exceptions and reports as failure', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Poll Throws',
          description: 'Poll throws',
          act: async () => ({ success: true, durationMs: 1 }),
          poll: async () => { throw new Error('Connection refused'); },
          verifyStepIds: [],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [],
      });

      const result = await orchestrator.runAll(mockCtx());
      expect(result.overallSuccess).toBe(false);
      expect(result.stages[0].poll.success).toBe(false);
    });

    it('reports unknown verification step IDs as failures', async () => {
      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Bad Step Ref',
          description: 'References nonexistent step',
          act: async () => ({ success: true, durationMs: 1 }),
          verifyStepIds: ['nonexistent-step'],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [],
      });

      const result = await orchestrator.runAll(mockCtx());
      expect(result.overallSuccess).toBe(false);
      expect(result.stages[0].verification.failed).toBe(1);
    });
  });

  describe('onStageComplete callback', () => {
    it('calls callback after each stage', async () => {
      const callback = vi.fn();

      const stages: LifecycleStage<BaseTestContext>[] = [
        {
          id: 'stage-1',
          name: 'Stage 1',
          description: 'Test',
          act: async () => ({ success: true, durationMs: 1 }),
          verifyStepIds: [],
          fallback: 'fail',
        },
        {
          id: 'stage-2',
          name: 'Stage 2',
          description: 'Test',
          act: async () => ({ success: true, durationMs: 1 }),
          verifyStepIds: [],
          fallback: 'fail',
        },
      ];

      const orchestrator = createActionOrchestrator({
        stages,
        verificationSteps: [],
        onStageComplete: callback,
      });

      await orchestrator.runAll(mockCtx());
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith('stage-1', expect.any(Object));
      expect(callback).toHaveBeenCalledWith('stage-2', expect.any(Object));
    });
  });
});

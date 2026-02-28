/**
 * Parallel Order Runner -- Adidas O2C Lifecycle (v3)
 * Runs N orders concurrently through the ActionOrchestrator,
 * each with its own independent context, orchestrator, and healing handler.
 */

import { Semaphore } from './semaphore';
import { createActionOrchestrator } from '../../integrations/orchestration/action-orchestrator';
import { buildTC01Lifecycle, type TC01TestData } from './tc01-lifecycle';
import { tc01Steps } from './tc01-steps';
import { createAdidasTestContext, type AdidasTestContext } from './context';
import { createHealingHandler } from './healing-handler';
import type { AdidasClientConfig } from './config';
import type { RunResult, StageResult } from '../../integrations/orchestration/action-types';
import type { PatternLookup } from './recovery-playbook';

export interface ParallelRunOptions {
  maxConcurrency?: number;  // Default: 5
  continueOnOrderFailure?: boolean;  // Default: true
  skipLayer2?: boolean;
  skipLayer3?: boolean;
  /** Cross-session pattern store — shared across all parallel orders. */
  patternStore?: PatternLookup;
  onOrderComplete?: (orderNo: string, result: RunResult, index: number) => void;
  onOrderStart?: (testData: TC01TestData, index: number) => void;
  onStageComplete?: (orderIndex: number, stageId: string, result: StageResult) => void;
}

export interface ParallelRunResult {
  orders: Array<{
    testData: TC01TestData;
    result: RunResult;
    orderId?: string;  // populated after create-order stage
    error?: string;    // populated if orchestrator threw
  }>;
  totalOrders: number;
  passed: number;
  failed: number;
  totalDurationMs: number;
  overallSuccess: boolean;
}

export async function runOrdersInParallel(
  orderInputs: TC01TestData[],
  config: AdidasClientConfig,
  options: ParallelRunOptions = {},
): Promise<ParallelRunResult> {
  const {
    maxConcurrency = 5,
    continueOnOrderFailure = true,
    skipLayer2,
    skipLayer3,
    patternStore,
    onOrderComplete,
    onOrderStart,
    onStageComplete,
  } = options;

  const semaphore = new Semaphore(maxConcurrency);
  const start = Date.now();

  const orderResults = await Promise.all(
    orderInputs.map((testData, index) =>
      semaphore.withPermit(async () => {
        onOrderStart?.(testData, index);

        const ctx = createAdidasTestContext(config);

        // Each order gets its own healing handler — recovery is per-order,
        // but they share the cross-session pattern store for learning.
        const healingHandler = createHealingHandler({
          enterpriseCode: config.enterpriseCode,
          patternStore,
          verbose: false, // suppress per-stage healing logs in parallel mode
        });

        const orchestrator = createActionOrchestrator<AdidasTestContext>({
          stages: buildTC01Lifecycle(testData),
          verificationSteps: tc01Steps,
          skipLayer2: skipLayer2 ?? (!config.mqBrowse.enabled && !config.epochDB.enabled),
          skipLayer3: skipLayer3 ?? !config.nshift.enabled,
          continueOnVerifyFailure: true,
          onStageFailed: healingHandler,
          maxStageRetries: 1,
          onStageComplete: onStageComplete
            ? (stageId, result) => onStageComplete(index, stageId, result)
            : undefined,
        });

        try {
          const result = await orchestrator.runAll(ctx);
          onOrderComplete?.(ctx.orderId || `order-${index}`, result, index);
          return {
            testData,
            result,
            orderId: ctx.orderId || undefined,
          };
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          const failResult: RunResult = {
            stages: [],
            passed: 0,
            failed: 1,
            totalChecks: 0,
            totalDurationMs: Date.now() - start,
            overallSuccess: false,
          };
          onOrderComplete?.(`order-${index}`, failResult, index);
          if (!continueOnOrderFailure) {
            throw e;
          }
          return {
            testData,
            result: failResult,
            error: errorMsg,
          };
        }
      })
    )
  );

  const passed = orderResults.filter(r => r.result.overallSuccess).length;
  const failed = orderResults.filter(r => !r.result.overallSuccess).length;

  return {
    orders: orderResults,
    totalOrders: orderInputs.length,
    passed,
    failed,
    totalDurationMs: Date.now() - start,
    overallSuccess: failed === 0,
  };
}

/**
 * Parallel Order Runner -- Adidas O2C Lifecycle (v3)
 * Runs N orders concurrently through the ActionOrchestrator,
 * each with its own independent context and orchestrator instance.
 */

import { Semaphore } from './semaphore';
import { createActionOrchestrator } from '../../integrations/orchestration/action-orchestrator';
import { buildTC01Lifecycle, type TC01TestData } from './tc01-lifecycle';
import { tc01Steps } from './tc01-steps';
import { createAdidasTestContext, type AdidasTestContext } from './context';
import type { AdidasClientConfig } from './config';
import type { RunResult } from '../../integrations/orchestration/action-types';

export interface ParallelRunOptions {
  maxConcurrency?: number;  // Default: 5
  continueOnOrderFailure?: boolean;  // Default: true
  skipLayer2?: boolean;
  skipLayer3?: boolean;
  onOrderComplete?: (orderNo: string, result: RunResult, index: number) => void;
  onOrderStart?: (testData: TC01TestData, index: number) => void;
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
    onOrderComplete,
    onOrderStart,
  } = options;

  const semaphore = new Semaphore(maxConcurrency);
  const start = Date.now();

  const orderResults = await Promise.all(
    orderInputs.map((testData, index) =>
      semaphore.withPermit(async () => {
        onOrderStart?.(testData, index);

        const ctx = createAdidasTestContext(config);
        const orchestrator = createActionOrchestrator<AdidasTestContext>({
          stages: buildTC01Lifecycle(testData),
          verificationSteps: tc01Steps,
          skipLayer2: skipLayer2 ?? (!config.mqBrowse.enabled && !config.epochDB.enabled),
          skipLayer3: skipLayer3 ?? !config.nshift.enabled,
          continueOnVerifyFailure: true,
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

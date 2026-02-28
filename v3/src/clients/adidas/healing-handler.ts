/**
 * Adidas O2C Healing Handler
 *
 * Connects the ActionOrchestrator's onStageFailed hook to the recovery playbook.
 * Pattern: detect failure signature → match playbook → execute recovery → retry.
 */

import type { StageResult } from '../../integrations/orchestration/action-types';
import type { AdidasTestContext } from './context';
import { recoverInvoiceGeneration } from './recovery-playbook';
import type { RecoverySterlingClient, ProcessOrderPaymentsParams, PatternLookup } from './recovery-playbook';
import type { SterlingApiError } from '../../integrations/sterling/types';
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';

// ============================================================================
// Failure Signature Matchers
// ============================================================================

function isInvoiceFailure(stageId: string, result: StageResult): boolean {
  // Stage 5 (forward-invoice) polls for invoices — fails when none generated
  if (stageId === 'forward-invoice') return true;

  // Verify steps 12/12a fail when invoice is missing
  const failedSteps = result.verification.steps
    .filter((s) => !s.result.success)
    .map((s) => s.stepId);

  return failedSteps.includes('step-12') || failedSteps.includes('step-12a');
}

function isHealthFailure(result: StageResult): boolean {
  const errorMsg = result.action.error ?? result.poll.error ?? '';
  return (
    errorMsg.includes('ECONNREFUSED') ||
    errorMsg.includes('ECONNRESET') ||
    errorMsg.includes('ETIMEDOUT') ||
    errorMsg.includes('fetch failed')
  );
}

// ============================================================================
// Recovery Client Adapter
// ============================================================================

/**
 * Wraps the standard SterlingClient with processOrderPayments.
 * Uses the REST /invoke/ endpoint since processOrderPayments is a simple API.
 */
function asRecoveryClient(ctx: AdidasTestContext): RecoverySterlingClient {
  const client = ctx.sterlingClient;

  return {
    ...client,
    async processOrderPayments(params: ProcessOrderPaymentsParams): Promise<Result<void, SterlingApiError>> {
      // processOrderPayments is available via XAPI (form-encoded XML)
      if (ctx.xapiClient) {
        const xml = `<Order OrderNo="${params.OrderNo}" EnterpriseCode="${params.EnterpriseCode}" DocumentType="${params.DocumentType ?? '0001'}"/>`;
        try {
          const response = await ctx.xapiClient.invokeOrThrow('processOrderPayments', xml);
          if (response.success) return ok(undefined);
          return err({ message: response.error ?? 'processOrderPayments failed', apiName: 'processOrderPayments' });
        } catch (e) {
          return err({ message: e instanceof Error ? e.message : String(e), apiName: 'processOrderPayments' });
        }
      }

      return err({ message: 'XAPI client not available — cannot call processOrderPayments', apiName: 'processOrderPayments' });
    },
  };
}

// ============================================================================
// Healing Handler
// ============================================================================

export interface HealingOptions {
  enterpriseCode: string;
  verbose?: boolean;
  /** Optional cross-session pattern store for learning-guided recovery. */
  patternStore?: PatternLookup;
}

/**
 * Create an onStageFailed handler for the Adidas O2C orchestrator.
 *
 * Returns a function that:
 *   1. Checks if the failure matches a known signature
 *   2. Executes the matching recovery playbook
 *   3. Returns 'retry' if recovery succeeded, 'continue' otherwise
 */
export function createHealingHandler(options: HealingOptions) {
  const { enterpriseCode, verbose = true, patternStore } = options;

  return async (
    stageId: string,
    result: StageResult,
    ctx: AdidasTestContext,
  ): Promise<'retry' | 'continue' | 'abort'> => {

    // --- Infrastructure failure: abort, no point retrying ---
    if (isHealthFailure(result)) {
      if (verbose) {
        console.log(`  [HEAL] ${stageId}: Infrastructure failure detected — aborting`);
      }
      return 'abort';
    }

    // --- Invoice delay: run manageTaskQueue recovery ---
    if (isInvoiceFailure(stageId, result)) {
      if (verbose) {
        console.log(`  [HEAL] ${stageId}: Invoice failure detected — running recovery playbook...`);
      }

      const recoveryClient = asRecoveryClient(ctx);
      const recoveryResult = await recoverInvoiceGeneration(
        recoveryClient,
        ctx.orderId,
        enterpriseCode,
        patternStore,
      );

      if (recoveryResult.success && recoveryResult.value.recovered) {
        if (verbose) {
          console.log(`  [HEAL] Recovery succeeded (${recoveryResult.value.duration}ms) — retrying stage`);
        }
        return 'retry';
      }

      if (verbose) {
        const detail = recoveryResult.success
          ? recoveryResult.value.details
          : recoveryResult.error.message;
        console.log(`  [HEAL] Recovery failed: ${detail} — continuing`);
      }
      return 'continue';
    }

    // --- Unknown failure: continue to next stage ---
    if (verbose) {
      console.log(`  [HEAL] ${stageId}: No matching recovery playbook — continuing`);
    }
    return 'continue';
  };
}

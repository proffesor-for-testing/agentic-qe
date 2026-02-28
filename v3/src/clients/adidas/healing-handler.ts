/**
 * Adidas O2C Healing Handler
 *
 * Connects the ActionOrchestrator's onStageFailed hook to the recovery playbook.
 * Pattern: detect failure signature → match playbook → execute recovery → retry.
 *
 * Architecture:
 *   - Hardcoded playbooks are ALWAYS primary (fast, reliable, proven)
 *   - Diagnostic probe runs on unknown failures (state-aware decision)
 *   - HNSW pattern search auto-activates as FALLBACK when 50+ outcomes recorded
 *   - Telemetry records every healing attempt for analytics + HNSW activation
 *
 * IMPORTANT: All recovery calls go through the XAPI client (Playwright JSP),
 * NOT through the REST SterlingClient. The REST path returns HTTP 400
 * for manageTaskQueue on this Sterling deployment.
 */

import type { StageResult } from '../../integrations/orchestration/action-types';
import type { AdidasTestContext } from './context';
import { recoverInvoiceGeneration } from './recovery-playbook';
import type { PatternLookup } from '../../shared/types/pattern-lookup';
import type { HealingTelemetry } from './healing-telemetry';
import { attemptAgenticHealing } from './agentic-healer';

// ============================================================================
// Failure Signature Matchers
// ============================================================================

function isInvoiceFailure(stageId: string, result: StageResult): boolean {
  // Stage 5 (forward-invoice) polls for invoices — fails when none generated
  if (stageId === 'forward-invoice') return true;

  // Stage 8 (return-delivery) needs CREDIT_MEMO invoice — same root cause
  // Sterling batch job hasn't generated the credit note yet.
  if (stageId === 'return-delivery') return true;

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
// Healing Handler
// ============================================================================

export interface HealingOptions {
  enterpriseCode: string;
  verbose?: boolean;
  /** Unique ID for this test run (used in telemetry). */
  runId?: string;
  /** Structured outcome recording + HNSW activation tracking. */
  telemetry?: HealingTelemetry;
  /** Optional pattern store — only used when HNSW auto-activates (50+ outcomes). */
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
  const {
    enterpriseCode,
    verbose = true,
    runId = `run-${Date.now()}`,
    telemetry,
    patternStore,
  } = options;

  // Check HNSW activation at handler creation (once per run, not per stage)
  const hnswActive = telemetry?.isHNSWActivated() ?? false;
  if (verbose && telemetry) {
    const stats = telemetry.getStats();
    console.log(`  Healing telemetry: ${stats.totalOutcomes} outcomes recorded, HNSW fallback: ${hnswActive ? 'active' : `dormant (need ${50 - stats.totalOutcomes} more)`}`);
  }

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
      telemetry?.recordOutcome({
        runId, stageId, decision: 'abort', success: false,
        errorSummary: result.action.error ?? result.poll.error ?? 'infrastructure failure',
      });
      return 'abort';
    }

    // --- Invoice delay: run manageTaskQueue recovery (Playwright XAPI) ---
    if (isInvoiceFailure(stageId, result)) {
      if (!ctx.xapiClient) {
        if (verbose) {
          console.log(`  [HEAL] ${stageId}: Invoice failure detected but no XAPI client — cannot run recovery`);
        }
        telemetry?.recordOutcome({
          runId, stageId, playbookName: 'fix-invoice-generation',
          patternMatched: 'invoice-delay-recovery',
          decision: 'continue', success: false, errorSummary: 'XAPI client not available',
        });
        return 'continue';
      }

      if (verbose) {
        console.log(`  [HEAL] ${stageId}: Invoice failure detected — running recovery playbook (Playwright XAPI)...`);
      }

      const recoveryResult = await recoverInvoiceGeneration(
        ctx.xapiClient,
        ctx.orderId,
        enterpriseCode,
      );

      if (recoveryResult.success && recoveryResult.value.recovered) {
        if (verbose) {
          console.log(`  [HEAL] Recovery succeeded (${recoveryResult.value.duration}ms) — retrying stage`);
        }
        telemetry?.recordOutcome({
          runId, stageId, playbookName: 'fix-invoice-generation',
          patternMatched: 'invoice-delay-recovery',
          decision: 'retry', success: true, durationMs: recoveryResult.value.duration,
        });
        return 'retry';
      }

      if (verbose) {
        const detail = recoveryResult.success
          ? recoveryResult.value.details
          : recoveryResult.error.message;
        console.log(`  [HEAL] Recovery failed: ${detail} — continuing`);
      }
      telemetry?.recordOutcome({
        runId, stageId, playbookName: 'fix-invoice-generation',
        patternMatched: 'invoice-delay-recovery',
        decision: 'continue', success: false,
        durationMs: recoveryResult.success ? recoveryResult.value.duration : undefined,
        errorSummary: recoveryResult.success ? recoveryResult.value.details.slice(0, 200) : recoveryResult.error.message,
      });
      return 'continue';
    }

    // --- Unknown failure: probe + hardcoded state rules + HNSW fallback ---
    // HNSW pattern search is only passed when auto-activated (50+ outcomes)
    const activePatternStore = hnswActive ? patternStore : undefined;
    const attempt = await attemptAgenticHealing(stageId, result, ctx, activePatternStore);

    if (verbose) {
      console.log(`  [AGENTIC] ${stageId}: ${attempt.diagnosis}`);
      console.log(`  [AGENTIC] Probe: status=${attempt.snapshot.maxStatus}, shipments=${attempt.snapshot.shipmentCount}, invoices=${attempt.snapshot.invoiceCount}, notes=[${attempt.snapshot.noteReasonCodes.join(',')}]`);
      if (attempt.matchedPatternId) {
        console.log(`  [AGENTIC] Matched pattern: ${attempt.recoveryAction} (id=${attempt.matchedPatternId})`);
      }
      if (hnswActive) {
        console.log(`  [AGENTIC] HNSW fallback: active`);
      }
      console.log(`  [AGENTIC] Decision: ${attempt.decision} (${attempt.durationMs}ms)`);
    }

    telemetry?.recordOutcome({
      runId, stageId,
      patternMatched: attempt.recoveryAction,
      decision: attempt.decision,
      success: attempt.decision === 'retry' || attempt.decision === 'continue',
      probeStatus: attempt.snapshot.maxStatus,
      probeShipments: attempt.snapshot.shipmentCount,
      probeInvoices: attempt.snapshot.invoiceCount,
      durationMs: attempt.durationMs,
      errorSummary: attempt.diagnosis.slice(0, 200),
    });

    return attempt.decision;
  };
}

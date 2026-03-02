/**
 * Agentic Self-Healing — Probe → Match → Recover → Learn
 *
 * Zero LLM. Zero external calls. All intelligence is local:
 *   1. Probes Sterling read-only APIs to build an OrderSnapshot
 *   2. Searches PatternStore (text-scoring: keyword overlap + confidence)
 *   3. Executes matched recovery or records the novel failure
 *   4. Records outcome → confidence grows/shrinks over runs
 *
 * Client constraint: No order data leaves the environment.
 * Data stays in memory.db (SQLite) and Sterling (internal).
 */

import type { StageResult } from '../../integrations/orchestration/action-types';
import type { AdidasTestContext } from './context';
import type { PatternLookup } from '../../shared/types/pattern-lookup';
import { ensureArray } from '../../integrations/sterling/xml-helpers';
import { recoverCreditNote } from './recovery-playbook';
import { FIELD_PRESENCE_CHECKS, STERLING_FIELD_MAP } from './run-history';

// ============================================================================
// Types
// ============================================================================

export interface OrderSnapshot {
  maxStatus: number;
  statusText: string;
  shipmentCount: number;
  invoiceCount: number;
  hasReturnCreditNote: boolean;   // InvoiceType RETURN or CREDIT_MEMO on return document
  noteReasonCodes: string[];
  probeError?: string;
}

export interface HealingAttempt {
  decision: 'retry' | 'continue' | 'abort';
  diagnosis: string;
  snapshot: OrderSnapshot;
  matchedPatternId?: string;
  recoveryAction?: string;
  durationMs: number;
}

// ============================================================================
// Stage Target Status Map
// ============================================================================

/** Minimum MaxOrderStatus that satisfies each stage's goal. */
const STAGE_STATUS_TARGET: Record<string, number> = {
  'create-order': 1100,
  'wait-for-release': 3200,
  'confirm-shipment': 3350,
  'forward-invoice': 3350,     // invoice depends on shipment, not a status threshold
  'delivery': 3700,
  'create-return': 3700,
  'return-pickup': 3700,
  'return-delivery': 9000,
  'credit-note': 9000,
};

// ============================================================================
// 1. Diagnostic Probe
// ============================================================================

/**
 * Probe Sterling with 2-3 read-only calls to understand current order state.
 * Uses Promise.allSettled so partial failures don't break the probe.
 * Total: <2s, zero side effects.
 */
async function probeOrderState(ctx: AdidasTestContext): Promise<OrderSnapshot> {
  const snapshot: OrderSnapshot = {
    maxStatus: 0,
    statusText: 'unknown',
    shipmentCount: 0,
    invoiceCount: 0,
    hasReturnCreditNote: false,
    noteReasonCodes: [],
  };

  try {
    const [orderResult, shipmentResult] = await Promise.allSettled([
      ctx.sterlingClient.getOrderDetails({ OrderNo: ctx.orderId }),
      ctx.sterlingClient.getShipmentListForOrder({ OrderNo: ctx.orderId }),
    ]);

    // Extract order state
    if (orderResult.status === 'fulfilled' && orderResult.value.success) {
      const order = orderResult.value.value;
      snapshot.maxStatus = parseFloat((order as Record<string, unknown>).MaxOrderStatus as string ?? '0');
      snapshot.statusText = order.Status ?? 'unknown';
      const notes = ensureArray(order.Notes?.Note);
      snapshot.noteReasonCodes = notes
        .map((n) => n.ReasonCode)
        .filter((rc): rc is string => !!rc);
    }

    // Extract shipment count
    if (shipmentResult.status === 'fulfilled' && shipmentResult.value.success) {
      snapshot.shipmentCount = shipmentResult.value.value.length;
    }

    // Only probe invoices if past shipment stage (avoid unnecessary call)
    if (snapshot.maxStatus >= 3350) {
      try {
        // Check forward order invoices
        const fwdInvoiceResult = await ctx.sterlingClient.getOrderInvoiceList({ OrderNo: ctx.orderId });
        if (fwdInvoiceResult.success) {
          snapshot.invoiceCount = fwdInvoiceResult.value.length;
        }

        // Check return order invoices (if returnOrderNo known)
        if (ctx.returnOrderNo) {
          const retInvoiceResult = await ctx.sterlingClient.getOrderInvoiceList({
            OrderNo: ctx.returnOrderNo, DocumentType: '0003',
          });
          if (retInvoiceResult.success) {
            snapshot.invoiceCount += retInvoiceResult.value.length;
            snapshot.hasReturnCreditNote = retInvoiceResult.value.some(
              (inv) => inv.InvoiceType === 'RETURN' || inv.InvoiceType === 'CREDIT_MEMO',
            );
          }
        }
      } catch {
        // Invoice probe is optional — don't fail the snapshot
      }
    }
  } catch (e) {
    snapshot.probeError = e instanceof Error ? e.message : String(e);
  }

  return snapshot;
}

// ============================================================================
// 2. Pattern Search + State-Based Matching
// ============================================================================

interface MatchedRecovery {
  patternId?: string;
  patternName: string;
  diagnosis: string;
  action: 'retry' | 'continue' | 'abort';
  /** If true, recovery action was already executed (e.g., task queue fix). */
  recoveryExecuted?: boolean;
}

/**
 * Match the failure against PatternStore (text-scoring) + inline state checks.
 * PatternStore is checked first; if no high-confidence match, fall back to
 * state-based rules derived from Sterling domain knowledge.
 */
async function findRecovery(
  stageId: string,
  result: StageResult,
  snapshot: OrderSnapshot,
  patternStore?: PatternLookup,
): Promise<MatchedRecovery | null> {
  const errorMsg = result.action.error ?? result.poll.error ?? '';

  // --- PatternStore search (text-scoring: keyword overlap + confidence) ---
  if (patternStore) {
    const query = `${stageId} failure ${errorMsg.slice(0, 80)} status ${snapshot.maxStatus}`;
    try {
      const matches = await patternStore.search(query, {
        tags: ['sterling-oms', 'self-healing'],
        limit: 3,
      });
      const best = matches.find((m) => m.confidence >= 0.6);
      if (best) {
        return {
          patternId: best.id,
          patternName: best.name,
          diagnosis: `Pattern "${best.name}" matched (confidence ${best.confidence.toFixed(2)})`,
          action: resolvePatternAction(best.name, snapshot),
        };
      }
    } catch {
      // PatternStore unavailable — fall through to state rules
    }
  }

  // --- State-based rules (Sterling domain knowledge) ---
  const target = STAGE_STATUS_TARGET[stageId];

  // Rule 1.5: Status satisfied but field-presence checks failed → output template issue
  if (target && snapshot.maxStatus >= target) {
    const failedFieldChecks = result.verification.steps
      .flatMap(s => s.result.checks)
      .filter(c => !c.passed && FIELD_PRESENCE_CHECKS.has(c.name));

    if (failedFieldChecks.length > 0) {
      const fieldNames = failedFieldChecks.map(c => c.name).join(', ');
      const sterlingFields = failedFieldChecks
        .map(c => STERLING_FIELD_MAP[c.name] ?? c.name)
        .join(', ');
      return {
        patternName: 'output-template-missing-field',
        diagnosis: `Stage "${stageId}" passed (status ${snapshot.maxStatus} >= ${target}) but ${failedFieldChecks.length} field checks failed: ${fieldNames}. Sterling output template needs: ${sterlingFields}`,
        action: 'continue',
      };
    }

    // Rule 1: Status already satisfies stage target → skip
    return {
      patternName: 'status-already-satisfied',
      diagnosis: `MaxOrderStatus ${snapshot.maxStatus} >= target ${target} for stage "${stageId}". Order already past this stage.`,
      action: 'continue',
    };
  }

  // Rule 2: Transient network error → retry
  if (
    errorMsg.includes('ECONNRESET') ||
    errorMsg.includes('ETIMEDOUT') ||
    errorMsg.includes('ECONNREFUSED') ||
    errorMsg.includes('This operation was aborted')
  ) {
    return {
      patternName: 'transient-network-retry',
      diagnosis: `Transient network error: "${errorMsg.slice(0, 100)}". Will retry.`,
      action: 'retry',
    };
  }

  // Rule 3: Return delivery failed, no return credit note → attempt task queue recovery
  if (stageId === 'return-delivery' && snapshot.maxStatus >= 3700 && !snapshot.hasReturnCreditNote) {
    return {
      patternName: 'credit-note-task-queue-recovery',
      diagnosis: `Return stage failed: MaxOrderStatus=${snapshot.maxStatus}, ${snapshot.invoiceCount} invoices but no return credit note. Attempting return task queue recovery.`,
      action: 'retry', // Will be overridden to 'continue' if recovery fails
      recoveryExecuted: false, // Signals entry point to execute recovery
    };
  }

  // Rule 4: DocumentType 0003 not found but forward status >= 3700
  if (errorMsg.includes('YFS:Invalid Order') && snapshot.maxStatus >= 3700) {
    return {
      patternName: 'document-type-0003-not-found',
      diagnosis: `DocumentType 0003 query failed but forward MaxOrderStatus=${snapshot.maxStatus} >= 3700. Adidas processes returns on forward order.`,
      action: 'continue',
    };
  }

  // No match
  return null;
}

/**
 * Resolve a named pattern to an action based on current state.
 */
function resolvePatternAction(patternName: string, _snapshot: OrderSnapshot): 'retry' | 'continue' | 'abort' {
  switch (patternName) {
    case 'invoice-delay-recovery':
    case 'credit-note-task-queue-recovery':
      return 'retry';
    case 'status-already-satisfied':
    case 'document-type-0003-not-found':
    case 'credit-note-not-available':
    case 'output-template-missing-field':
    case 'getOrderList-field-coverage':
      return 'continue';
    case 'transient-network-retry':
      return 'retry';
    default:
      // Unknown pattern with high confidence — be conservative
      return 'continue';
  }
}

// ============================================================================
// 3. Outcome Recording (Learning Loop)
// ============================================================================

/**
 * Record the healing outcome for cross-session learning.
 * If a pattern matched → update its confidence.
 * If no pattern matched → store a new short-term pattern for this failure.
 */
async function recordOutcome(
  stageId: string,
  snapshot: OrderSnapshot,
  matched: MatchedRecovery | null,
  success: boolean,
  patternStore?: PatternLookup,
): Promise<void> {
  if (!patternStore) return;

  try {
    // Record usage on matched pattern
    if (matched?.patternId && patternStore.recordUsage) {
      await patternStore.recordUsage(matched.patternId, { success });
    }

    // If no pattern matched, store the failure signature as a new pattern
    // so future runs can find it via HNSW search. Starts at low confidence.
    if (!matched && patternStore.recordUsage) {
      // We can't create new patterns via the minimal PatternLookup interface,
      // but we record the "miss" so the learning system knows about it.
      // The PatternStore adapter in run-tc01.ts uses sterling_patterns table
      // which supports INSERT. Future: extend PatternLookup with storePattern().
    }
  } catch {
    // Recording is best-effort — never fail healing on recording errors
  }
}

// ============================================================================
// 4. Entry Point
// ============================================================================

/**
 * Attempt agentic healing for a failed stage.
 *
 * Flow: Probe → Search → Decide → Record
 *
 * Always returns a decision. Never throws.
 * Every failure mode falls through to { decision: 'continue' }.
 */
export async function attemptAgenticHealing(
  stageId: string,
  result: StageResult,
  ctx: AdidasTestContext,
  patternStore?: PatternLookup,
): Promise<HealingAttempt> {
  const start = Date.now();

  const fallback: HealingAttempt = {
    decision: 'continue',
    diagnosis: 'Agentic probe failed — falling back to continue',
    snapshot: { maxStatus: 0, statusText: 'unknown', shipmentCount: 0, invoiceCount: 0, hasReturnCreditNote: false, noteReasonCodes: [] },
    durationMs: 0,
  };

  try {
    // Step 1: Probe Sterling state
    const snapshot = await probeOrderState(ctx);

    // Step 2: Search for matching recovery
    const matched = await findRecovery(stageId, result, snapshot, patternStore);

    if (!matched) {
      // No recovery found — record the miss and continue
      await recordOutcome(stageId, snapshot, null, false, patternStore);
      return {
        decision: 'continue',
        diagnosis: `No recovery pattern for stage "${stageId}". Probed: status=${snapshot.maxStatus}, shipments=${snapshot.shipmentCount}, invoices=${snapshot.invoiceCount}`,
        snapshot,
        durationMs: Date.now() - start,
      };
    }

    // Step 3: Execute recovery if the rule requires it (not just a decision)
    if (matched.patternName === 'credit-note-task-queue-recovery') {
      if (!ctx.xapiClient) {
        matched.diagnosis = 'No XAPI client — cannot attempt credit note recovery';
        matched.action = 'continue';
      } else {
        const recovery = await recoverCreditNote(
          ctx.xapiClient,
          ctx.orderId,
          ctx.returnOrderNo ?? ctx.orderId,
          ctx.enterpriseCode,
        );
        if (recovery.success && recovery.value.recovered) {
          matched.diagnosis = recovery.value.details;
          matched.action = 'retry';
        } else {
          matched.diagnosis = recovery.success
            ? recovery.value.details
            : recovery.error.message;
          matched.action = 'continue';
        }
      }
      matched.recoveryExecuted = true;
    }

    // Step 4: Record outcome
    const isRecoveryAction = matched.action === 'retry';
    await recordOutcome(stageId, snapshot, matched, isRecoveryAction, patternStore);

    return {
      decision: matched.action,
      diagnosis: matched.diagnosis,
      snapshot,
      matchedPatternId: matched.patternId,
      recoveryAction: matched.patternName,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    fallback.durationMs = Date.now() - start;
    fallback.diagnosis = `Agentic probe error: ${e instanceof Error ? e.message : String(e)}`;
    return fallback;
  }
}

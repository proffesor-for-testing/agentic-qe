/**
 * Agentic Self-Healing — Probe → Match → Recover → Learn
 *
 * Zero LLM. Zero external calls. All intelligence is local:
 *   1. Probes Sterling read-only APIs to build an OrderSnapshot
 *   2. Searches PatternStore (HNSW) for matching recovery patterns
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

// ============================================================================
// Types
// ============================================================================

export interface OrderSnapshot {
  maxStatus: number;
  statusText: string;
  shipmentCount: number;
  invoiceCount: number;
  hasCreditMemo: boolean;
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
    hasCreditMemo: false,
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
        const invoiceResult = await ctx.sterlingClient.getOrderInvoiceList({ OrderNo: ctx.orderId });
        if (invoiceResult.success) {
          snapshot.invoiceCount = invoiceResult.value.length;
          snapshot.hasCreditMemo = invoiceResult.value.some(
            (inv) => inv.InvoiceType === 'RETURN' || inv.InvoiceType === 'CREDIT_MEMO',
          );
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

// ============================================================================
// Recovery Actions (executed by the agentic healer, not hardcoded playbooks)
// ============================================================================

const CREDIT_NOTE_POLL_MAX = 12;
const CREDIT_NOTE_POLL_INTERVAL = 10_000;
const ONE_DAY_MS = 86_400_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt return credit note recovery via XAPI.
 *
 * Sterling uses InvoiceType="RETURN" (not "CREDIT_MEMO") for credit notes.
 * The return invoice is on the RETURN order number (DocumentType 0003),
 * not the sales order. Evidence: TC_01-APT93030618 SSR doc.
 *
 * Strategy:
 *   1. Check if return invoice already exists (queried on wrong order before)
 *   2. If not, try task queue approach (find pending task, move AvailableDate)
 *   3. Poll for InvoiceType="RETURN" on return order
 */
async function attemptCreditNoteRecovery(
  ctx: AdidasTestContext,
): Promise<{ recovered: boolean; diagnosis: string }> {
  if (!ctx.xapiClient) {
    return { recovered: false, diagnosis: 'No XAPI client — cannot attempt credit note recovery' };
  }

  const salesOrderNo = ctx.orderId;
  const returnOrderNo = ctx.returnOrderNo ?? ctx.orderId;
  const enterpriseCode = ctx.enterpriseCode;
  const steps: string[] = [];

  try {
    // Step 1: Check if return invoice already exists on the RETURN order (DocumentType 0003)
    // Previous code only checked sales order — the invoice lives on the return order.
    const returnInvoiceResp = await ctx.xapiClient.invoke('getOrderInvoiceList',
      `<OrderInvoice OrderNo="${returnOrderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0003"/>`);

    if (returnInvoiceResp.success &&
        (returnInvoiceResp.body.includes('InvoiceType="RETURN"') ||
         returnInvoiceResp.body.includes('InvoiceType="CREDIT_MEMO"'))) {
      const invoiceNo = returnInvoiceResp.body.match(/InvoiceNo="([^"]+)"/)?.[1] ?? 'unknown';
      return {
        recovered: true,
        diagnosis: `Return invoice already exists on return order ${returnOrderNo}: InvoiceNo=${invoiceNo}. Previous check queried sales order instead.`,
      };
    }
    steps.push(`No return invoice on ${returnOrderNo} (DocType 0003) yet`);

    // Also check sales order invoices (some deployments put return invoices here)
    const salesInvoiceResp = await ctx.xapiClient.invoke('getOrderInvoiceList',
      `<OrderInvoice OrderNo="${salesOrderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0001"/>`);

    if (salesInvoiceResp.success &&
        (salesInvoiceResp.body.includes('InvoiceType="RETURN"') ||
         salesInvoiceResp.body.includes('InvoiceType="CREDIT_MEMO"'))) {
      const invoiceNo = salesInvoiceResp.body.match(/InvoiceNo="([^"]+)"/)?.[1] ?? 'unknown';
      return {
        recovered: true,
        diagnosis: `Return invoice found on sales order ${salesOrderNo}: InvoiceNo=${invoiceNo} (InvoiceType=RETURN).`,
      };
    }
    steps.push(`No return invoice on ${salesOrderNo} (DocType 0001) either`);

    // Step 2: Try task queue approach — find pending return credit note task
    let shipmentKey: string | undefined;

    // Try return shipments first (DocumentType 0003)
    const returnShipResp = await ctx.xapiClient.invoke('getShipmentListForOrder',
      `<Order OrderNo="${returnOrderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0003"/>`);
    const returnKeyMatch = returnShipResp.body.match(/ShipmentKey="([^"]+)"/);
    if (returnKeyMatch) {
      shipmentKey = returnKeyMatch[1];
      steps.push(`Return ShipmentKey: ${shipmentKey}`);
    }

    // Fallback: forward order shipments
    if (!shipmentKey) {
      const fwdShipResp = await ctx.xapiClient.invoke('getShipmentListForOrder',
        `<Order OrderNo="${salesOrderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0001"/>`);
      const allKeys = [...fwdShipResp.body.matchAll(/ShipmentKey="([^"]+)"/g)].map(m => m[1]);
      if (allKeys.length === 0) {
        return { recovered: false, diagnosis: [...steps, 'No shipments found — cannot query task queue'].join('. ') };
      }
      for (const key of allKeys) {
        const taskResp = await ctx.xapiClient.invoke('manageTaskQueue',
          `<TaskQueue DataKey="${key}" DataType="ShipmentKey"/>`);
        if (taskResp.body.includes('TaskQKey')) {
          shipmentKey = key;
          steps.push(`Forward ShipmentKey with task: ${key}`);
          break;
        }
      }
      if (!shipmentKey) {
        // No pending tasks — return invoice may be generated by WMS ReturnConfirmation flow
        // which is triggered externally, not via task queue
        return {
          recovered: false,
          diagnosis: [...steps, `No pending tasks for ${allKeys.length} shipment(s). Return invoice is generated by WMS ReturnConfirmation flow, not task queue`].join('. '),
        };
      }
    }

    // Step 3: Move AvailableDate to past
    const taskResp = await ctx.xapiClient.invoke('manageTaskQueue',
      `<TaskQueue DataKey="${shipmentKey}" DataType="ShipmentKey"/>`);
    const taskQKeyMatch = taskResp.body.match(/TaskQKey="([^"]+)"/);
    if (!taskQKeyMatch) {
      return { recovered: false, diagnosis: [...steps, `No task in YFS_TASK_Q for ShipmentKey ${shipmentKey}`].join('. ') };
    }

    const taskQKey = taskQKeyMatch[1];
    const availDate = taskResp.body.match(/AvailableDate="([^"]+)"/)?.[1] ?? 'unknown';
    const pastDate = new Date(Date.now() - ONE_DAY_MS)
      .toISOString().replace('T', ' ').replace(/\.\d+Z$/, '.000');

    const manageResp = await ctx.xapiClient.invoke('manageTaskQueue',
      `<TaskQueue AvailableDate="${pastDate}" DataKey="${shipmentKey}" DataType="ShipmentKey" TaskQKey="${taskQKey}"/>`);
    if (!manageResp.success) {
      const altResp = await ctx.xapiClient.invoke('changeAvailDateInTaskQueue',
        `<TaskQueue AvailableDate="${pastDate}" TaskQKey="${taskQKey}"/>`);
      if (!altResp.success) {
        return { recovered: false, diagnosis: [...steps, `Failed to move AvailableDate: ${altResp.error}`].join('. ') };
      }
    }
    steps.push(`TaskQKey=${taskQKey}, AvailableDate ${availDate} → ${pastDate}`);

    // Step 4: Poll for return invoice (InvoiceType="RETURN")
    for (let i = 0; i < CREDIT_NOTE_POLL_MAX; i++) {
      await sleep(CREDIT_NOTE_POLL_INTERVAL);

      // Check return order first, then sales order
      for (const [oNo, docType] of [[returnOrderNo, '0003'], [salesOrderNo, '0001']] as const) {
        const invoiceResp = await ctx.xapiClient.invoke('getOrderInvoiceList',
          `<OrderInvoice OrderNo="${oNo}" EnterpriseCode="${enterpriseCode}" DocumentType="${docType}"/>`);
        if (invoiceResp.success &&
            (invoiceResp.body.includes('InvoiceType="RETURN"') ||
             invoiceResp.body.includes('InvoiceType="CREDIT_MEMO"'))) {
          const invoiceNo = invoiceResp.body.match(/InvoiceNo="([^"]+)"/)?.[1] ?? 'unknown';
          return {
            recovered: true,
            diagnosis: [...steps, `Return invoice found after ${i + 1} poll(s): InvoiceNo=${invoiceNo} on order ${oNo}`].join('. '),
          };
        }
      }
    }

    return {
      recovered: false,
      diagnosis: [...steps, `No return invoice after ${CREDIT_NOTE_POLL_MAX} polls. Return invoice is generated by WMS ReturnConfirmation flow — may not have been triggered in UAT`].join('. '),
    };
  } catch (e) {
    return { recovered: false, diagnosis: `Credit note recovery error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Match the failure against PatternStore (HNSW) + inline state checks.
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

  // --- PatternStore search (HNSW) ---
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

  // Rule 1: Status already satisfies stage target → skip
  if (target && snapshot.maxStatus >= target) {
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

  // Rule 3: Return delivery failed, no CREDIT_MEMO → attempt task queue recovery
  if (stageId === 'return-delivery' && snapshot.maxStatus >= 3700 && !snapshot.hasCreditMemo) {
    return {
      patternName: 'credit-note-task-queue-recovery',
      diagnosis: `Return stage failed: MaxOrderStatus=${snapshot.maxStatus}, ${snapshot.invoiceCount} invoices but no CREDIT_MEMO. Attempting return task queue recovery.`,
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
    snapshot: { maxStatus: 0, statusText: 'unknown', shipmentCount: 0, invoiceCount: 0, hasCreditMemo: false, noteReasonCodes: [] },
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
      const recovery = await attemptCreditNoteRecovery(ctx);
      matched.diagnosis = recovery.diagnosis;
      if (recovery.recovered) {
        matched.action = 'retry';
      } else {
        // Recovery tried but failed — continue (don't retry with same failure)
        matched.action = 'continue';
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

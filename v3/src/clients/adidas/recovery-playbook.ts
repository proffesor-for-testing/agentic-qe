/**
 * Recovery Playbook -- Adidas O2C Lifecycle (v3)
 *
 * Automated recovery strategies for the order lifecycle.
 * Used by the healing agent to self-recover when steps fail.
 *
 * Playbook #1: Invoice Not Generated (Step 9 timeout)
 * -------------------------------------------------------
 * Problem: After Ship Confirm (Step 8), Sterling queues an invoice
 *          task in YFS_TASK_Q. The AvailableDate is set ~10min in
 *          the future, so the Sterling job won't pick it up immediately.
 *          Result: No invoice -> Collected=0 -> Step 11 fails with NaN.
 *
 * Fix:     1. Get ShipmentKey via getShipmentListForOrder
 *          2. Use manageTaskQueue with DataKey=ShipmentKey to find task
 *          3. Call manageTaskQueue again to move AvailableDate to past
 *          4. Poll getOrderInvoiceList until invoice appears
 *          5. Call processOrderPayments to collect payment
 *          6. Verify PaymentStatus = INVOICED
 *
 * Evidence: Dev team fix on 2026-02-27 for order APT92045131.
 *           ShipmentKey=302602271501069280846466 had future AvailableDate.
 *           Confirmed on APT75174909: AvailableDate was 10min ahead.
 *
 * Key learning: manageTaskQueue with DataKey+DataType acts as both
 *               query AND update -- returns the task record with TaskQKey.
 */

import type {
  SterlingClient,
  SterlingApiError,
  OrderInvoice,
} from '../../integrations/sterling/types';
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';

// ============================================================================
// Cross-Session Learning Types
// ============================================================================

/**
 * Minimal interface for cross-session pattern lookup.
 * Implementations may wrap AgentDB, a local cache, or an in-memory store.
 * The interface is deliberately small so callers can inject any backend.
 */
export interface PatternLookup {
  search(
    query: string,
    options?: { tags?: string[]; limit?: number },
  ): Promise<Array<{ name: string; content: string; confidence: number; id?: string }>>;
  recordUsage?(patternId: string, outcome: { success: boolean }): Promise<void>;
}

// ============================================================================
// Recovery Types
// ============================================================================

export interface RecoveryResult {
  recovered: boolean;
  strategy: string;
  duration: number;
  details: string;
  /** Set when a cross-session pattern was used to guide recovery. */
  patternUsed?: string;
}

/**
 * Enriched recovery result returned by cross-session-aware recovery.
 * Alias kept for callers that want to be explicit about the shape.
 */
export type { RecoveryResult as CrossSessionRecoveryResult };

/**
 * Task queue record returned by Sterling's manageTaskQueue API.
 * Represents a row in YFS_TASK_Q. The generic SterlingClient returns
 * Result<unknown, ...> from manageTaskQueue; callers cast to this shape.
 */
export interface TaskQueueRecord {
  TaskQKey?: string;
  AvailableDate?: string;
  DataKey?: string;
  DataType?: string;
  TransactionId?: string;
  [key: string]: unknown;
}

export interface ProcessOrderPaymentsParams {
  OrderNo: string;
  EnterpriseCode: string;
  DocumentType?: string;
}

/**
 * Extension of SterlingClient with processOrderPayments.
 *
 * manageTaskQueue is already on the base SterlingClient interface
 * (returns Result<unknown, ...>). processOrderPayments is specific
 * to the invoice recovery workflow and not on the generic interface.
 *
 * Implementations should POST to /restapi/processOrderPayments.
 */
export interface RecoverySterlingClient extends SterlingClient {
  /**
   * Invoke Sterling processOrderPayments API.
   * Triggers payment collection for an order that has been invoiced.
   */
  processOrderPayments(params: ProcessOrderPaymentsParams): Promise<Result<void, SterlingApiError>>;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_POLL_MAX_ATTEMPTS = 18;
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const ONE_DAY_MS = 86_400_000;
const POST_PAYMENT_DELAY_MS = 3_000;

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a Date as Sterling-compatible timestamp: "YYYY-MM-DD HH:MM:SS.mmm"
 */
function toSterlingTimestamp(date: Date): string {
  const iso = date.toISOString(); // "2026-02-27T10:15:30.000Z"
  return iso.replace('T', ' ').replace(/Z$/, '');
}

// ============================================================================
// Poll for Invoice (exported independently)
// ============================================================================

/**
 * Poll Sterling's getOrderInvoiceList until at least one invoice
 * appears for the given order. Returns the invoice list on success,
 * or a timeout error after exhausting all attempts.
 *
 * Can be used independently from the full recovery flow -- for example,
 * to verify that an invoice was generated after a normal ship confirm
 * without needing the task-queue fix.
 *
 * @param client      - Any SterlingClient (does not need RecoverySterlingClient)
 * @param orderNo     - The order number to check
 * @param maxAttempts - Maximum poll iterations (default: 18)
 * @param intervalMs  - Delay between polls in ms (default: 10000)
 */
export async function pollForInvoice(
  client: SterlingClient,
  orderNo: string,
  maxAttempts: number = DEFAULT_POLL_MAX_ATTEMPTS,
  intervalMs: number = DEFAULT_POLL_INTERVAL_MS,
): Promise<Result<OrderInvoice[], SterlingApiError>> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(intervalMs);
    }

    const result = await client.getOrderInvoiceList({ OrderNo: orderNo });

    if (!result.success) {
      // Transient API errors during polling should not abort immediately.
      // Log and continue unless this is the last attempt.
      if (attempt === maxAttempts - 1) {
        return result;
      }
      continue;
    }

    const invoices = result.value;
    if (invoices.length > 0) {
      return ok(invoices);
    }
  }

  return err({
    message: `Invoice not generated after ${maxAttempts} attempts (${(maxAttempts * intervalMs) / 1000}s). Sterling job may not have run.`,
    apiName: 'getOrderInvoiceList',
  });
}

// ============================================================================
// Main Recovery: Invoice Generation Fix
// ============================================================================

/**
 * Recover invoice generation for an Adidas O2C order.
 *
 * This implements the proven self-healing playbook:
 *   1. getShipmentListForOrder -> extract ShipmentKey
 *   2. manageTaskQueue(DataKey=ShipmentKey) -> find task, get TaskQKey
 *   3. manageTaskQueue(TaskQKey, AvailableDate=yesterday) -> move date to past
 *   4. Poll getOrderInvoiceList until invoice appears (up to 3 min)
 *   5. processOrderPayments -> collect payment
 *   6. getOrderDetails -> verify PaymentStatus = INVOICED
 *
 * @param client         - Sterling client with processOrderPayments extension
 * @param orderNo        - The order number (e.g., "APT26149445")
 * @param enterpriseCode - The enterprise code (e.g., "adidas_DE")
 * @param patternStore   - Optional cross-session pattern store for learning
 */
export async function recoverInvoiceGeneration(
  client: RecoverySterlingClient,
  orderNo: string,
  enterpriseCode: string,
  patternStore?: PatternLookup,
): Promise<Result<RecoveryResult, SterlingApiError>> {
  const start = Date.now();
  const steps: string[] = [];
  let patternUsed: string | undefined;
  let matchedPatternId: string | undefined;

  // ---- Cross-session pattern lookup (optional) ------------------------------
  // Before falling through to the hardcoded playbook, check whether a previous
  // session already learned a recovery strategy for this failure mode.

  if (patternStore) {
    try {
      const patterns = await patternStore.search(
        'sterling invoice delay manageTaskQueue',
        { tags: ['sterling-oms', 'recovery'], limit: 3 },
      );

      const bestMatch = patterns.find((p) => p.confidence >= 0.7);

      if (bestMatch) {
        patternUsed = bestMatch.name;
        matchedPatternId = bestMatch.id;
        steps.push(`[cross-session] Using learned pattern: "${bestMatch.name}" (confidence: ${bestMatch.confidence})`);
      } else {
        steps.push('[cross-session] No pattern with confidence >= 0.7 found; falling back to hardcoded playbook');
      }
    } catch (lookupError) {
      // Pattern lookup is best-effort; never block recovery on it.
      steps.push(`[cross-session] Pattern lookup failed: ${String(lookupError)}; continuing with hardcoded playbook`);
    }
  }

  // ---- Step 1: Get ShipmentKey via getShipmentListForOrder ------------------

  const shipmentResult = await client.getShipmentListForOrder({
    OrderNo: orderNo,
    DocumentType: '0001',
  });

  if (!shipmentResult.success) {
    return err(shipmentResult.error);
  }

  const shipments = shipmentResult.value;
  if (shipments.length === 0) {
    return ok({
      recovered: false,
      strategy: 'fix-invoice-generation',
      duration: Date.now() - start,
      details: `No shipments found for order ${orderNo}. Ship Confirm may not have completed.`,
    });
  }

  // ShipmentKey is a first-class field on the Shipment type
  const shipmentKey = shipments[0].ShipmentKey;
  if (!shipmentKey) {
    return ok({
      recovered: false,
      strategy: 'fix-invoice-generation',
      duration: Date.now() - start,
      details: `Shipment found but ShipmentKey attribute missing for order ${orderNo}.`,
    });
  }

  steps.push(`ShipmentKey: ${shipmentKey}`);

  // ---- Step 2: Query task queue for pending invoice task --------------------
  // manageTaskQueue returns Result<unknown, ...>; cast to TaskQueueRecord

  const taskQueryResult = await client.manageTaskQueue({
    DataKey: shipmentKey,
    DataType: 'ShipmentKey',
  });

  if (!taskQueryResult.success) {
    return err(taskQueryResult.error);
  }

  const taskRecord = taskQueryResult.value as TaskQueueRecord;
  if (!taskRecord.TaskQKey) {
    return ok({
      recovered: false,
      strategy: 'fix-invoice-generation',
      duration: Date.now() - start,
      details: [
        ...steps,
        `No task found in YFS_TASK_Q for ShipmentKey ${shipmentKey}. Task may not have been created yet.`,
      ].join('\n'),
    });
  }

  steps.push(`TaskQKey: ${taskRecord.TaskQKey}`);
  steps.push(`Current AvailableDate: ${taskRecord.AvailableDate ?? 'unknown'}`);

  // ---- Step 3: Move AvailableDate to yesterday -----------------------------

  const yesterday = new Date(Date.now() - ONE_DAY_MS);
  const pastDate = toSterlingTimestamp(yesterday);

  const updateResult = await client.manageTaskQueue({
    TaskQKey: taskRecord.TaskQKey,
    DataKey: shipmentKey,
    DataType: 'ShipmentKey',
    AvailableDate: pastDate,
  });

  if (!updateResult.success) {
    return err(updateResult.error);
  }

  steps.push(`AvailableDate moved to: ${pastDate}`);

  // ---- Step 4: Poll for invoice (up to 3 minutes) --------------------------

  const invoiceResult = await pollForInvoice(
    client,
    orderNo,
    DEFAULT_POLL_MAX_ATTEMPTS,
    DEFAULT_POLL_INTERVAL_MS,
  );

  if (!invoiceResult.success) {
    return ok({
      recovered: false,
      strategy: 'fix-invoice-generation',
      duration: Date.now() - start,
      details: [
        ...steps,
        `Invoice polling failed: ${invoiceResult.error.message}`,
      ].join('\n'),
    });
  }

  const invoices = invoiceResult.value;
  steps.push(`Invoice generated: ${invoices[0]?.InvoiceNo ?? 'unknown'}`);

  // ---- Step 5: Process order payments ---------------------------------------

  const paymentResult = await client.processOrderPayments({
    OrderNo: orderNo,
    EnterpriseCode: enterpriseCode,
    DocumentType: '0001',
  });

  if (!paymentResult.success) {
    return ok({
      recovered: false,
      strategy: 'fix-invoice-generation',
      duration: Date.now() - start,
      details: [
        ...steps,
        `Invoice generated but processOrderPayments failed: ${paymentResult.error.message}`,
      ].join('\n'),
    });
  }

  steps.push('processOrderPayments: triggered');

  // ---- Step 6: Verify PaymentStatus = INVOICED ------------------------------

  await sleep(POST_PAYMENT_DELAY_MS);

  const verifyResult = await client.getOrderDetails({
    OrderNo: orderNo,
    DocumentType: '0001',
  });

  if (!verifyResult.success) {
    // Payment was triggered but verification failed -- still report partial success
    return ok({
      recovered: true,
      strategy: 'fix-invoice-generation',
      duration: Date.now() - start,
      details: [
        ...steps,
        `Payment triggered but verification call failed: ${verifyResult.error.message}`,
      ].join('\n'),
    });
  }

  const order = verifyResult.value;
  // PaymentStatus is not on the base Order type; access via index signature
  const paymentStatus = (order as Record<string, unknown>)['PaymentStatus'] as string | undefined;
  steps.push(`Final PaymentStatus: ${paymentStatus ?? 'unknown'}`);

  const isRecovered = paymentStatus === 'INVOICED' || paymentStatus === 'PAID';

  // ---- Record usage with cross-session pattern store (fire-and-forget) ------
  if (patternStore?.recordUsage && matchedPatternId) {
    patternStore.recordUsage(matchedPatternId, { success: isRecovered }).catch(() => {
      // Best-effort -- never fail recovery due to pattern recording
    });
  }

  return ok({
    recovered: isRecovered,
    strategy: 'fix-invoice-generation',
    duration: Date.now() - start,
    details: isRecovered
      ? steps.join('\n')
      : [...steps, `Expected PaymentStatus INVOICED or PAID, got: ${paymentStatus}`].join('\n'),
    patternUsed,
  });
}

// ============================================================================
// Playbook Registry
// ============================================================================

export interface PlaybookEntry {
  name: string;
  trigger: string;
  description: string;
}

export const RECOVERY_PLAYBOOKS: Record<string, PlaybookEntry> = {
  'invoice-not-generated': {
    name: 'Fix Invoice Generation',
    trigger: 'Step 9 times out or Step 11 fails with NaN/Collected=0',
    description:
      'Gets ShipmentKey, finds task via manageTaskQueue, moves AvailableDate to past, ' +
      'waits for invoice, runs processOrderPayments, verifies PaymentStatus=INVOICED',
  },
} as const;

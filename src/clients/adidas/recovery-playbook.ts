/**
 * Recovery Playbook -- Adidas O2C Lifecycle (v3)
 *
 * Automated recovery strategies for the order lifecycle.
 * Uses the XAPI client (Playwright JSP) for all recovery calls --
 * matching the proven MVP approach that achieved 15/15 PASS.
 *
 * Playbook #1: Invoice Not Generated
 * ─────────────────────────────────────
 * Problem: After Ship Confirm, Sterling queues an invoice task in
 *          YFS_TASK_Q with AvailableDate ~10min in the future.
 *          The Sterling job won't pick it up until then.
 *
 * Fix:     1. getShipmentListForOrder → extract ShipmentKey
 *          2. manageTaskQueue(DataKey=ShipmentKey) → find task, get TaskQKey
 *          3. manageTaskQueue(TaskQKey, AvailableDate=yesterday) → move to past
 *          4. Poll getOrderInvoiceList until invoice appears
 *          5. processOrderPayments → collect payment
 *          6. getOrderList → verify PaymentStatus = INVOICED
 *
 * IMPORTANT: All calls go through the XAPI JSP page via Playwright,
 * NOT through the REST JSON API. The REST path returns HTTP 400
 * for manageTaskQueue on this Sterling deployment.
 */

import type { XAPIClient } from '../../integrations/sterling/types';
import type { Result } from '../../shared/types';
import { ok, err } from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface RecoveryResult {
  recovered: boolean;
  strategy: string;
  duration: number;
  details: string;
}

export type CrossSessionRecoveryResult = RecoveryResult;

export interface RecoveryError {
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

const POLL_MAX_ATTEMPTS = 18;
const POLL_INTERVAL_MS = 10_000;
const ONE_DAY_MS = 86_400_000;

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Main Recovery: Invoice Generation Fix (Playwright XAPI)
// ============================================================================

/**
 * Recover invoice generation using the XAPI client (Playwright JSP).
 *
 * This is a direct port of the MVP's fixInvoiceGeneration which used
 * Playwright invokeAPI calls and achieved 15/15 PASS with 1 self-healed.
 *
 * Pure hardcoded 6-step playbook. No HNSW, no pattern lookup.
 * Telemetry (outcome recording) is handled by the caller (healing-handler).
 *
 * @param xapiClient     - Playwright-based XAPI client
 * @param orderNo        - The order number (e.g., "APT42679494")
 * @param enterpriseCode - The enterprise code (e.g., "adidas_PT")
 */
export async function recoverInvoiceGeneration(
  xapiClient: XAPIClient,
  orderNo: string,
  enterpriseCode: string,
): Promise<Result<RecoveryResult, RecoveryError>> {
  const start = Date.now();
  const steps: string[] = [];

  try {
    // ---- Step 1: Get ShipmentKey via getShipmentListForOrder ---------------
    const shipmentResponse = await xapiClient.invoke('getShipmentListForOrder',
      `<Order OrderNo="${orderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0001"/>`);

    if (!shipmentResponse.success) {
      return ok({
        recovered: false,
        strategy: 'fix-invoice-generation',
        duration: Date.now() - start,
        details: [...steps, `getShipmentListForOrder failed: ${shipmentResponse.error}`].join('\n'),
      });
    }

    const shipmentKeyMatch = shipmentResponse.body.match(/ShipmentKey="([^"]+)"/);
    if (!shipmentKeyMatch) {
      return ok({
        recovered: false,
        strategy: 'fix-invoice-generation',
        duration: Date.now() - start,
        details: [...steps, `No ShipmentKey found for order ${orderNo}. Ship Confirm may not have completed.`].join('\n'),
      });
    }

    const shipmentKey = shipmentKeyMatch[1];
    steps.push(`ShipmentKey: ${shipmentKey}`);

    // ---- Step 2: Query task queue for pending invoice task -----------------
    const queryResponse = await xapiClient.invoke('manageTaskQueue',
      `<TaskQueue DataKey="${shipmentKey}" DataType="ShipmentKey"/>`);

    const taskQKeyMatch = queryResponse.body.match(/TaskQKey="([^"]+)"/);
    const availDateMatch = queryResponse.body.match(/AvailableDate="([^"]+)"/);

    if (!taskQKeyMatch) {
      return ok({
        recovered: false,
        strategy: 'fix-invoice-generation',
        duration: Date.now() - start,
        details: [...steps, `No task found in YFS_TASK_Q for ShipmentKey ${shipmentKey}.`].join('\n'),
      });
    }

    const taskQKey = taskQKeyMatch[1];
    steps.push(`TaskQKey: ${taskQKey}`);
    steps.push(`Current AvailableDate: ${availDateMatch?.[1] ?? 'unknown'}`);

    // ---- Step 3: Move AvailableDate to yesterday --------------------------
    const pastDate = new Date(Date.now() - ONE_DAY_MS)
      .toISOString().replace('T', ' ').replace(/\.\d+Z$/, '.000');

    const manageResponse = await xapiClient.invoke('manageTaskQueue',
      `<TaskQueue AvailableDate="${pastDate}" DataKey="${shipmentKey}" DataType="ShipmentKey" TaskQKey="${taskQKey}"/>`);

    // Check for error — try fallback if manageTaskQueue update failed
    const manageHasError = !manageResponse.success;
    if (manageHasError) {
      const changeDateResponse = await xapiClient.invoke('changeAvailDateInTaskQueue',
        `<TaskQueue AvailableDate="${pastDate}" TaskQKey="${taskQKey}"/>`);
      if (!changeDateResponse.success) {
        return ok({
          recovered: false,
          strategy: 'fix-invoice-generation',
          duration: Date.now() - start,
          details: [...steps, `Failed to move AvailableDate: ${changeDateResponse.error}`].join('\n'),
        });
      }
    }

    steps.push(`AvailableDate moved to: ${pastDate}`);

    // ---- Step 4: Poll for invoice (up to 3 minutes) -----------------------
    let invoiceFound = false;
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS);

      const invoiceResponse = await xapiClient.invoke('getOrderInvoiceList',
        `<OrderInvoice OrderNo="${orderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0001"/>`);

      if (invoiceResponse.success &&
          invoiceResponse.body.includes('InvoiceNo') &&
          !invoiceResponse.body.includes('TotalNumberOfRecords="0"')) {
        invoiceFound = true;
        steps.push(`Invoice found after ${i + 1} poll(s)`);
        break;
      }
    }

    if (!invoiceFound) {
      return ok({
        recovered: false,
        strategy: 'fix-invoice-generation',
        duration: Date.now() - start,
        details: [...steps, `Invoice not generated after ${POLL_MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s. Sterling job may not have run.`].join('\n'),
      });
    }

    // ---- Step 5: Process order payments -----------------------------------
    await xapiClient.invoke('processOrderPayments',
      `<Order DocumentType="0001" EnterpriseCode="${enterpriseCode}" OrderHeaderKey="" OrderNo="${orderNo}"/>`);

    steps.push('processOrderPayments: triggered');

    // ---- Step 6: Verify PaymentStatus = INVOICED --------------------------
    await sleep(3_000);

    const verifyResponse = await xapiClient.invoke('getOrderList',
      `<Order OrderNo="${orderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0001"/>`);

    const paymentStatus = verifyResponse.body.match(/PaymentStatus="([^"]+)"/)?.[1] ?? 'unknown';
    steps.push(`Final PaymentStatus: ${paymentStatus}`);

    const isRecovered = paymentStatus === 'INVOICED' || paymentStatus === 'PAID';

    return ok({
      recovered: isRecovered,
      strategy: 'fix-invoice-generation',
      duration: Date.now() - start,
      details: isRecovered
        ? steps.join('\n')
        : [...steps, `Expected PaymentStatus INVOICED or PAID, got: ${paymentStatus}`].join('\n'),
    });
  } catch (e) {
    return ok({
      recovered: false,
      strategy: 'fix-invoice-generation',
      duration: Date.now() - start,
      details: [...steps, `Error: ${e instanceof Error ? e.message : String(e)}`].join('\n'),
    });
  }
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
    trigger: 'Forward invoice or return credit note times out',
    description:
      'Gets ShipmentKey, finds task via manageTaskQueue, moves AvailableDate to past, ' +
      'waits for invoice, runs processOrderPayments, verifies PaymentStatus=INVOICED',
  },
} as const;

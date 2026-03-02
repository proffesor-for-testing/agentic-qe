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
// Playbook #2: Credit Note Recovery (Return Invoice)
// ============================================================================

/**
 * Recover return credit note via XAPI.
 *
 * Sterling uses InvoiceType="RETURN" (not "CREDIT_MEMO") for credit notes.
 * The return invoice lives on the RETURN order (DocumentType 0003),
 * not the sales order. Evidence: TC_01-APT93030618 SSR doc.
 *
 * Strategy:
 *   1. Check if return invoice already exists (on return order, then sales order)
 *   2. If not, find ShipmentKey → query task queue → move AvailableDate to past
 *   3. Poll for InvoiceType="RETURN" on return order
 *
 * Same interface pattern as recoverInvoiceGeneration: clean args, no context leak.
 */
export async function recoverCreditNote(
  xapiClient: XAPIClient,
  salesOrderNo: string,
  returnOrderNo: string,
  enterpriseCode: string,
): Promise<Result<RecoveryResult, RecoveryError>> {
  const start = Date.now();
  const steps: string[] = [];

  try {
    // Step 1: Check if return invoice already exists on the RETURN order (DocumentType 0003)
    const returnInvoiceResp = await xapiClient.invoke('getOrderInvoiceList',
      `<OrderInvoice OrderNo="${returnOrderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0003"/>`);

    if (returnInvoiceResp.success &&
        (returnInvoiceResp.body.includes('InvoiceType="RETURN"') ||
         returnInvoiceResp.body.includes('InvoiceType="CREDIT_MEMO"'))) {
      const invoiceNo = returnInvoiceResp.body.match(/InvoiceNo="([^"]+)"/)?.[1] ?? 'unknown';
      return ok({
        recovered: true,
        strategy: 'fix-credit-note',
        duration: Date.now() - start,
        details: `Return invoice already exists on return order ${returnOrderNo}: InvoiceNo=${invoiceNo}`,
      });
    }
    steps.push(`No return invoice on ${returnOrderNo} (DocType 0003) yet`);

    // Also check sales order invoices (some deployments put return invoices here)
    const salesInvoiceResp = await xapiClient.invoke('getOrderInvoiceList',
      `<OrderInvoice OrderNo="${salesOrderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0001"/>`);

    if (salesInvoiceResp.success &&
        (salesInvoiceResp.body.includes('InvoiceType="RETURN"') ||
         salesInvoiceResp.body.includes('InvoiceType="CREDIT_MEMO"'))) {
      const invoiceNo = salesInvoiceResp.body.match(/InvoiceNo="([^"]+)"/)?.[1] ?? 'unknown';
      return ok({
        recovered: true,
        strategy: 'fix-credit-note',
        duration: Date.now() - start,
        details: `Return invoice found on sales order ${salesOrderNo}: InvoiceNo=${invoiceNo}`,
      });
    }
    steps.push(`No return invoice on ${salesOrderNo} (DocType 0001) either`);

    // Step 2: Find ShipmentKey and query task queue
    let shipmentKey: string | undefined;

    // Try return shipments first (DocumentType 0003)
    const returnShipResp = await xapiClient.invoke('getShipmentListForOrder',
      `<Order OrderNo="${returnOrderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0003"/>`);
    const returnKeyMatch = returnShipResp.body.match(/ShipmentKey="([^"]+)"/);
    if (returnKeyMatch) {
      shipmentKey = returnKeyMatch[1];
      steps.push(`Return ShipmentKey: ${shipmentKey}`);
    }

    // Fallback: forward order shipments
    if (!shipmentKey) {
      const fwdShipResp = await xapiClient.invoke('getShipmentListForOrder',
        `<Order OrderNo="${salesOrderNo}" EnterpriseCode="${enterpriseCode}" DocumentType="0001"/>`);
      const allKeys = [...fwdShipResp.body.matchAll(/ShipmentKey="([^"]+)"/g)].map(m => m[1]);
      if (allKeys.length === 0) {
        return ok({
          recovered: false, strategy: 'fix-credit-note', duration: Date.now() - start,
          details: [...steps, 'No shipments found — cannot query task queue'].join('. '),
        });
      }
      for (const key of allKeys) {
        const taskResp = await xapiClient.invoke('manageTaskQueue',
          `<TaskQueue DataKey="${key}" DataType="ShipmentKey"/>`);
        if (taskResp.body.includes('TaskQKey')) {
          shipmentKey = key;
          steps.push(`Forward ShipmentKey with task: ${key}`);
          break;
        }
      }
      if (!shipmentKey) {
        return ok({
          recovered: false, strategy: 'fix-credit-note', duration: Date.now() - start,
          details: [...steps, `No pending tasks for ${allKeys.length} shipment(s). Return invoice is generated by WMS ReturnConfirmation flow, not task queue`].join('. '),
        });
      }
    }

    // Step 3: Move AvailableDate to past
    const taskResp = await xapiClient.invoke('manageTaskQueue',
      `<TaskQueue DataKey="${shipmentKey}" DataType="ShipmentKey"/>`);
    const taskQKeyMatch = taskResp.body.match(/TaskQKey="([^"]+)"/);
    if (!taskQKeyMatch) {
      return ok({
        recovered: false, strategy: 'fix-credit-note', duration: Date.now() - start,
        details: [...steps, `No task in YFS_TASK_Q for ShipmentKey ${shipmentKey}`].join('. '),
      });
    }

    const taskQKey = taskQKeyMatch[1];
    const availDate = taskResp.body.match(/AvailableDate="([^"]+)"/)?.[1] ?? 'unknown';
    const pastDate = new Date(Date.now() - ONE_DAY_MS)
      .toISOString().replace('T', ' ').replace(/\.\d+Z$/, '.000');

    const manageResp = await xapiClient.invoke('manageTaskQueue',
      `<TaskQueue AvailableDate="${pastDate}" DataKey="${shipmentKey}" DataType="ShipmentKey" TaskQKey="${taskQKey}"/>`);
    if (!manageResp.success) {
      const altResp = await xapiClient.invoke('changeAvailDateInTaskQueue',
        `<TaskQueue AvailableDate="${pastDate}" TaskQKey="${taskQKey}"/>`);
      if (!altResp.success) {
        return ok({
          recovered: false, strategy: 'fix-credit-note', duration: Date.now() - start,
          details: [...steps, `Failed to move AvailableDate: ${altResp.error}`].join('. '),
        });
      }
    }
    steps.push(`TaskQKey=${taskQKey}, AvailableDate ${availDate} → ${pastDate}`);

    // Step 4: Poll for return invoice (InvoiceType="RETURN")
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await sleep(POLL_INTERVAL_MS);

      for (const [oNo, docType] of [[returnOrderNo, '0003'], [salesOrderNo, '0001']] as const) {
        const invoiceResp = await xapiClient.invoke('getOrderInvoiceList',
          `<OrderInvoice OrderNo="${oNo}" EnterpriseCode="${enterpriseCode}" DocumentType="${docType}"/>`);
        if (invoiceResp.success &&
            (invoiceResp.body.includes('InvoiceType="RETURN"') ||
             invoiceResp.body.includes('InvoiceType="CREDIT_MEMO"'))) {
          const invoiceNo = invoiceResp.body.match(/InvoiceNo="([^"]+)"/)?.[1] ?? 'unknown';
          return ok({
            recovered: true, strategy: 'fix-credit-note', duration: Date.now() - start,
            details: [...steps, `Return invoice found after ${i + 1} poll(s): InvoiceNo=${invoiceNo} on order ${oNo}`].join('. '),
          });
        }
      }
    }

    return ok({
      recovered: false, strategy: 'fix-credit-note', duration: Date.now() - start,
      details: [...steps, `No return invoice after ${POLL_MAX_ATTEMPTS} polls. Return invoice is generated by WMS ReturnConfirmation flow — may not have been triggered in UAT`].join('. '),
    });
  } catch (e) {
    return ok({
      recovered: false, strategy: 'fix-credit-note', duration: Date.now() - start,
      details: `Credit note recovery error: ${e instanceof Error ? e.message : String(e)}`,
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

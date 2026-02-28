/**
 * Agentic QE v3 - Adidas TC_01 Lifecycle Stages
 * Defines the Act → Poll → Verify sequence for the full O2C flow.
 *
 * Write routing (proven path from POC):
 *   XAPI JSP → XML templates → Adidas custom flows (IsFlow=Y)
 *   Used for: createOrder, shipConfirm, POD, returns, etc.
 *
 * Read routing:
 *   REST JSON → POST /invoke/{apiName}
 *   Used for: getOrderDetails, getShipmentListForOrder, getOrderInvoiceList, etc.
 *
 * When XAPI is not available, write stages fall back to REST JSON with a warning.
 * REST writes may not work for Adidas custom flows (adidasWE_*) — see sterling-patterns.ts.
 *
 * Stage types:
 *   - Action stages: XAPI write + REST poll + verify
 *   - Poll-only stages: REST poll + verify (or XAPI-driven in create-from-scratch mode)
 *   - Verify-only stages: just run verification checks
 */

import type { LifecycleStage } from '../../integrations/orchestration/action-types';
import type { AdidasTestContext } from './context';
import type { CreateOrderInput } from '../../integrations/sterling/types';
import { ensureArray } from '../../integrations/sterling/xml-helpers';
import {
  step1_CreateOrder,
  step2_StampShipNode,
  step3_ResolveHold,
  step4_ProcessPayment,
  step5_ScheduleOrder,
  step6_ReleaseOrder,
  step7_Ship,
  step8_ShipConfirm,
  step10_Deliver,
  step11_CreateReturn,
  step12_ReturnPickedUp,
  step13_ReturnInTransit,
  step14_ReturnDelivered,
  step15_ReturnComplete,
  generateOrderNo,
  type OrderContext,
} from './lifecycle-xml-templates';

// ============================================================================
// Test Data Defaults (override via context or config)
// ============================================================================

export interface TC01TestData {
  enterpriseCode: string;
  sellerOrganizationCode: string;
  items: Array<{
    itemId: string;
    quantity: string;
    shipNode?: string;
  }>;
  shipTo: {
    firstName: string;
    lastName: string;
    addressLine1: string;
    city: string;
    zipCode: string;
    country: string;
  };
  paymentType?: string;
}

const DEFAULT_TEST_DATA: TC01TestData = {
  enterpriseCode: 'ADIDAS',
  sellerOrganizationCode: 'ADIDAS_WE',
  items: [
    { itemId: 'TEST-ITEM-001', quantity: '1' },
  ],
  shipTo: {
    firstName: 'QE',
    lastName: 'Automation',
    addressLine1: '1 Test Street',
    city: 'Amsterdam',
    zipCode: '1012AB',
    country: 'NL',
  },
  paymentType: 'CREDIT_CARD',
};

// ============================================================================
// Helpers
// ============================================================================

/** Build an OrderContext for XML templates from the current test context. */
function buildOrderCtx(ctx: AdidasTestContext): OrderContext {
  return {
    orderNo: ctx.orderId,
    enterpriseCode: ctx.enterpriseCode,
    documentType: ctx.documentType || '0001',
    shipNode: ctx.shipNode || 'IT33',
    releaseNo: ctx.releaseNo || '0001',
    todayISO: new Date().toISOString(),
  };
}

// ============================================================================
// TC_01 Lifecycle Stages
// ============================================================================

/**
 * Build the TC_01 lifecycle stages for Adidas O2C.
 * Pass test data to customise the order payload. Defaults are safe for staging.
 */
export function buildTC01Lifecycle(
  testData: TC01TestData = DEFAULT_TEST_DATA
): LifecycleStage<AdidasTestContext>[] {
  return [
    // =========================================================================
    // Stage 1: Create Order (XAPI: steps 1-4 from POC)
    // =========================================================================
    {
      id: 'create-order',
      name: 'Create Sales Order',
      description: 'Place a new sales order via XAPI (adidasWE_CreateOrderSync) + setup steps',
      act: async (ctx) => {
        const start = Date.now();

        // --order mode: order already exists, skip creation
        if (ctx.orderId) {
          return { success: true, durationMs: 0, data: { actionStatus: 'skipped', reason: 'Order already exists (--order mode)' } };
        }

        // ---- XAPI path (proven) ----
        if (ctx.xapiClient) {
          try {
            const orderCtx: OrderContext = {
              orderNo: generateOrderNo(),
              enterpriseCode: ctx.enterpriseCode,
              documentType: '0001',
              shipNode: 'IT33',
              releaseNo: '',
              todayISO: new Date().toISOString(),
            };

            // Step 1: Create order via Adidas custom flow
            const tmpl1 = step1_CreateOrder(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl1.service, tmpl1.xml);

            // Step 2: Stamp ShipNode
            const tmpl2 = step2_StampShipNode(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl2.api, tmpl2.xml);

            // Step 3: Resolve Buyer's Remorse Hold
            const tmpl3 = step3_ResolveHold(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl3.api, tmpl3.xml);

            // Step 4: Process Adyen Payment
            const tmpl4 = step4_ProcessPayment(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl4.service, tmpl4.xml);

            return {
              success: true,
              data: { orderId: orderCtx.orderNo, documentType: '0001', shipNode: orderCtx.shipNode },
              durationMs: Date.now() - start,
            };
          } catch (e) {
            return { success: false, error: `XAPI create order failed: ${e instanceof Error ? e.message : String(e)}`, durationMs: Date.now() - start };
          }
        }

        // ---- REST fallback (may not work for Adidas custom flows) ----
        console.warn('  [WARN] XAPI not available — falling back to REST JSON for createOrder. Adidas custom flows may not work.');
        const payload: CreateOrderInput = {
          DocumentType: '0001',
          EnterpriseCode: testData.enterpriseCode,
          SellerOrganizationCode: testData.sellerOrganizationCode,
          OrderLines: {
            OrderLine: testData.items.map((item) => ({
              ItemID: item.itemId,
              OrderedQty: item.quantity,
              ...(item.shipNode ? { ShipNode: item.shipNode } : {}),
            })),
          },
          PersonInfoShipTo: testData.shipTo,
          PaymentMethods: testData.paymentType
            ? { PaymentMethod: [{ PaymentType: testData.paymentType }] }
            : undefined,
        };

        const result = await ctx.sterlingClient.createOrder(payload);

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        return {
          success: true,
          data: { orderId: result.value.OrderNo, documentType: result.value.DocumentType },
          durationMs: Date.now() - start,
        };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrderDetails({ OrderNo: ctx.orderId }),
          (order) => !!order.OrderNo && !!order.Status,
          { maxAttempts: 10, intervalMs: 3000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        // Enrich context with shipNode from order lines
        const order = result.value;
        const lines = ensureArray(order.OrderLines?.OrderLine);
        const data: Record<string, unknown> = {};
        if (lines.length > 0 && lines[0].ShipNode) {
          data.shipNode = lines[0].ShipNode;
        }

        return { success: true, data, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-01'],
      fallback: 'manual',
    },

    // =========================================================================
    // Stage 2: Schedule + Release (XAPI if creating, poll-only if --order)
    // =========================================================================
    {
      id: 'wait-for-release',
      name: 'Wait for Order Release',
      description: 'Schedule and release order via XAPI, or poll until status >= 3200',
      act: async (ctx) => {
        const start = Date.now();

        // If XAPI available and we created the order (not --order mode),
        // actively schedule + release instead of waiting for Sterling batch jobs
        if (ctx.xapiClient && !ctx.shipNode) {
          // shipNode not yet set means we likely just created — enrich first
        }

        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);

            // Step 5: Schedule Order
            const tmpl5 = step5_ScheduleOrder(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl5.api, tmpl5.xml);

            // Step 6: Release Order
            const tmpl6 = step6_ReleaseOrder(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl6.api, tmpl6.xml);

            return { success: true, durationMs: Date.now() - start };
          } catch (e) {
            // Schedule/release may fail if order is already released — that's OK
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('already') || msg.includes('Released')) {
              return { success: true, durationMs: Date.now() - start, data: { actionStatus: 'skipped', reason: 'Order already released' } };
            }
            return { success: false, error: `XAPI schedule/release failed: ${msg}`, durationMs: Date.now() - start };
          }
        }

        // No XAPI → skip act, rely on poll to wait for auto-release
        return { success: true, durationMs: 0, data: { actionStatus: 'skipped', reason: 'No XAPI — polling for release' } };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrderDetails({ OrderNo: ctx.orderId }),
          (order) => order.Status >= '3200',
          { maxAttempts: 20, intervalMs: 5000 }
        );

        if (!result.success) {
          return { success: false, error: `Release poll failed: ${result.error.message}`, durationMs: Date.now() - start };
        }

        // Capture payment, total, shipNode, and releaseNo for later stages
        const order = result.value;
        const payments = ensureArray(order.PaymentMethods?.PaymentMethod);
        const lines = ensureArray(order.OrderLines?.OrderLine);
        const data: Record<string, unknown> = {};

        if (payments.length > 0) {
          data.paymentMethod = payments[0].PaymentType ?? '';
        }
        data.originalOrderTotal = (order.TotalAmount as string) ?? '';

        // Enrich shipNode from order line
        if (lines.length > 0 && lines[0].ShipNode) {
          data.shipNode = lines[0].ShipNode;
        }

        // Enrich releaseNo from order releases
        const relResult = await ctx.sterlingClient.getOrderReleaseList({ OrderNo: ctx.orderId });
        if (relResult.success && relResult.value.length > 0) {
          data.releaseNo = relResult.value[0].ReleaseNo;
        }

        return { success: true, data, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-02'],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 3: Confirm Shipment (XAPI: steps 7-8 from POC)
    // =========================================================================
    {
      id: 'confirm-shipment',
      name: 'Confirm Shipment',
      description: 'Ship confirm via XAPI (adidasWE_ProcessSHPConfirmation + SOAcknowledgment)',
      act: async (ctx) => {
        const start = Date.now();

        // ---- XAPI path (proven) ----
        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);

            // Step 7: Ship (ProcessSHPConfirmation flow)
            const tmpl7 = step7_Ship(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl7.service, tmpl7.xml);

            // Step 8: Ship Confirmed (SO Acknowledgment flow)
            const tmpl8 = step8_ShipConfirm(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl8.service, tmpl8.xml);

            return { success: true, durationMs: Date.now() - start };
          } catch (e) {
            return { success: false, error: `XAPI ship confirm failed: ${e instanceof Error ? e.message : String(e)}`, durationMs: Date.now() - start };
          }
        }

        // ---- REST fallback ----
        console.warn('  [WARN] XAPI not available — falling back to REST JSON for ship confirm. Adidas custom flows may not work.');
        const shipResult = await ctx.sterlingClient.changeOrder({
          OrderNo: ctx.orderId,
          Action: 'CONFIRM_SHIPMENT',
          Modifications: {
            ConfirmShipment: 'Y',
          },
        });

        if (!shipResult.success) {
          return { success: false, error: `Confirm shipment failed: ${shipResult.error.message}`, durationMs: Date.now() - start };
        }

        return { success: true, durationMs: Date.now() - start };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getShipmentListForOrder({ OrderNo: ctx.orderId }),
          (shipments) => shipments.length > 0 && !!shipments[0]?.TrackingNo,
          { maxAttempts: 20, intervalMs: 5000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        return { success: true, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-03', 'step-04', 'step-05', 'step-06', 'step-07', 'step-08', 'step-09'],
      fallback: 'manual',
    },

    // =========================================================================
    // Stage 4: Delivery (XAPI POD if available, otherwise poll-only)
    // =========================================================================
    {
      id: 'delivery',
      name: 'Delivery & POD Events',
      description: 'Deliver via XAPI (adidasWE_ProcessPODUpdate) or wait for carrier events',
      act: async (ctx) => {
        const start = Date.now();

        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);
            const tmpl = step10_Deliver(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl.service, tmpl.xml);
            return { success: true, durationMs: Date.now() - start };
          } catch (e) {
            // POD may already exist (--order mode) — treat as non-fatal
            const msg = e instanceof Error ? e.message : String(e);
            return { success: true, durationMs: Date.now() - start, data: { actionStatus: 'skipped', reason: `POD trigger: ${msg}` } };
          }
        }

        return { success: true, durationMs: 0, data: { actionStatus: 'skipped', reason: 'No XAPI — polling for delivery' } };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrderDetails({ OrderNo: ctx.orderId }),
          (order) => {
            const notes = ensureArray(order.Notes?.Note);
            return notes.some((n) => n.NoteText?.includes('DL') || n.ReasonCode === 'DL');
          },
          { maxAttempts: 30, intervalMs: 10000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        return { success: true, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-10', 'step-11'],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 5: Forward Invoice (poll-only — auto-generated by Sterling)
    // =========================================================================
    {
      id: 'forward-invoice',
      name: 'Forward Invoice & Reconciliation',
      description: 'Verify forward invoice generation and financial reconciliation',
      poll: async (ctx) => {
        const start = Date.now();
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrderInvoiceList({ OrderNo: ctx.orderId }),
          (invoices) => invoices.some((inv: { InvoiceType?: string }) => inv.InvoiceType !== 'CREDIT_MEMO'),
          { maxAttempts: 15, intervalMs: 5000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        return { success: true, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-12', 'step-12a'],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 6: Forward Flow Email + PDF Verification (verify-only)
    // =========================================================================
    {
      id: 'forward-comms',
      name: 'Forward Flow Email & PDF Verification',
      description: 'Verify order confirmation emails, shipping labels, and delivery notifications',
      verifyStepIds: [
        'step-03a',    // Email: Order confirmation
        'step-07a',    // PDF: Forward shipping label
        'step-14a',    // Email: Out for delivery
        'step-16a',    // Email: Order delivered
      ],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 7: Create Return (XAPI: step 11 from POC)
    // =========================================================================
    {
      id: 'create-return',
      name: 'Create Return Order',
      description: 'Initiate return via XAPI (adidasWE_CreateReturnFromSSRSvc)',
      act: async (ctx) => {
        const start = Date.now();

        // ---- XAPI path (proven) ----
        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);
            const tmpl = step11_CreateReturn(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl.service, tmpl.xml);

            return {
              success: true,
              data: { returnOrderNo: ctx.orderId },
              durationMs: Date.now() - start,
            };
          } catch (e) {
            return { success: false, error: `XAPI create return failed: ${e instanceof Error ? e.message : String(e)}`, durationMs: Date.now() - start };
          }
        }

        // ---- REST fallback ----
        console.warn('  [WARN] XAPI not available — falling back to REST JSON for create return.');
        const result = await ctx.sterlingClient.changeOrder({
          OrderNo: ctx.orderId,
          Action: 'CREATE_RETURN',
          DocumentType: '0001',
          Modifications: {
            ReturnReason: 'QUALITY_ISSUE',
            ReturnAllLines: 'Y',
          },
        });

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        const returnOrderNo = result.value.OrderNo;
        return {
          success: true,
          data: { returnOrderNo },
          durationMs: Date.now() - start,
        };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const returnOrderNo = ctx.returnOrderNo ?? ctx.orderId;
        const result = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrderDetails({ OrderNo: returnOrderNo, DocumentType: '0003' }),
          (order) => !!order.OrderNo && order.DocumentType === '0003',
          { maxAttempts: 15, intervalMs: 5000 }
        );

        if (!result.success) {
          return { success: false, error: result.error.message, durationMs: Date.now() - start };
        }

        return { success: true, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-15', 'step-16'],
      fallback: 'manual',
    },

    // =========================================================================
    // Stage 8: Return Delivery (XAPI: steps 12-15 from POC)
    // =========================================================================
    {
      id: 'return-delivery',
      name: 'Return Delivery & Credit Note',
      description: 'Drive return POD events via XAPI or wait for carrier events',
      act: async (ctx) => {
        const start = Date.now();

        if (ctx.xapiClient) {
          try {
            const orderCtx = buildOrderCtx(ctx);

            // Step 12: Return Picked Up
            const tmpl12 = step12_ReturnPickedUp(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl12.service, tmpl12.xml);

            // Step 13: Return In Transit
            const tmpl13 = step13_ReturnInTransit(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl13.service, tmpl13.xml);

            // Step 14: Return Delivered to Warehouse
            const tmpl14 = step14_ReturnDelivered(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl14.service, tmpl14.xml);

            // Step 15: Return Completion (Receipt)
            const tmpl15 = step15_ReturnComplete(orderCtx);
            await ctx.xapiClient.invokeOrThrow(tmpl15.service, tmpl15.xml);

            return { success: true, durationMs: Date.now() - start };
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { success: true, durationMs: Date.now() - start, data: { actionStatus: 'skipped', reason: `Return POD trigger: ${msg}` } };
          }
        }

        return { success: true, durationMs: 0, data: { actionStatus: 'skipped', reason: 'No XAPI — polling for return delivery' } };
      },
      poll: async (ctx) => {
        const start = Date.now();
        const returnOrderNo = ctx.returnOrderNo ?? ctx.orderId;

        const trackingResult = await ctx.sterlingClient.pollUntil(
          () => ctx.sterlingClient.getOrderDetails({ OrderNo: returnOrderNo, DocumentType: '0003' }),
          (order) => {
            const notes = ensureArray(order.Notes?.Note);
            return notes.some((n) =>
              n.ReasonCode === 'RT' || n.ReasonCode === 'RP' || n.ReasonCode === 'RD'
            );
          },
          { maxAttempts: 30, intervalMs: 10000 }
        );

        if (!trackingResult.success) {
          return { success: false, error: trackingResult.error.message, durationMs: Date.now() - start };
        }

        return { success: true, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-24', 'step-25', 'step-26'],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 9: Return Email, PDF & Browser Verification (verify-only)
    // =========================================================================
    {
      id: 'return-comms',
      name: 'Return Email, PDF & Browser Verification',
      description: 'Verify return emails, credit note PDF, and browser portal',
      verifyStepIds: [
        'step-21a',    // Email: Return created
        'step-26a',    // Email: Return pickup
        'step-31a',    // Email: Refund confirmation
        'step-20a',    // PDF: Return shipping label
        'step-32',     // PDF: Credit note (Nota de Credito)
        'step-17a',    // Browser: Return initiation page
        'step-18a',    // Browser: Return confirmation page
      ],
      fallback: 'skip',
    },
  ];
}

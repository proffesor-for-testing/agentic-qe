/**
 * Agentic QE v3 - Adidas TC_01 Lifecycle Stages
 * Defines the Act → Poll → Verify sequence for the full O2C flow.
 *
 * Each stage:
 *   1. Triggers a Sterling API action (createOrder, changeOrder for shipment/return)
 *   2. Polls until the order reaches expected state
 *   3. Runs the verification step IDs relevant to that lifecycle phase
 *
 * Stage types:
 *   - Action stages: have act + poll + verify (create-order, confirm-shipment, create-return)
 *   - Poll-only stages: have poll + verify, no act (wait-for-release, delivery, forward-invoice, return-delivery)
 *   - Verify-only stages: just run verification checks (forward-email, return-verification)
 *
 * Fallback strategy:
 *   - Action stages: fallback 'manual' — if write API unavailable, prompt for manual
 *   - Poll-only stages: fallback 'skip' — but orchestrator runs poll regardless (see action-types.ts)
 *   - Verify-only stages: fallback 'skip' — skips if no checks available
 */

import type { LifecycleStage } from '../../integrations/orchestration/action-types';
import type { AdidasTestContext } from './context';
import type { CreateOrderInput } from '../../integrations/sterling/types';
import { ensureArray } from '../../integrations/sterling/xml-helpers';

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
    // Stage 1: Create Order
    // =========================================================================
    {
      id: 'create-order',
      name: 'Create Sales Order',
      description: 'Place a new sales order via Sterling createOrder API',
      act: async (ctx) => {
        const start = Date.now();

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

        return { success: true, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-01'],
      fallback: 'manual',
    },

    // =========================================================================
    // Stage 2: Wait for Release (poll-only — Sterling auto-schedules)
    // =========================================================================
    {
      id: 'wait-for-release',
      name: 'Wait for Order Release',
      description: 'Poll until Sterling auto-releases order (status >= 3200)',
      // No act — Sterling handles scheduling/release internally
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

        // Capture payment and total for later validation
        const order = result.value;
        const payments = ensureArray(order.PaymentMethods?.PaymentMethod);
        const data: Record<string, unknown> = {};
        if (payments.length > 0) {
          data.paymentMethod = payments[0].PaymentType ?? '';
        }
        data.originalOrderTotal = (order.TotalAmount as string) ?? '';

        return { success: true, data, durationMs: Date.now() - start };
      },
      verifyStepIds: ['step-02'],
      fallback: 'skip',
    },

    // =========================================================================
    // Stage 3: Confirm Shipment (action stage)
    // =========================================================================
    {
      id: 'confirm-shipment',
      name: 'Confirm Shipment',
      description: 'Confirm shipment via Sterling changeOrder API',
      act: async (ctx) => {
        const start = Date.now();

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
          () => ctx.sterlingClient.getShipmentList({ OrderNo: ctx.orderId }),
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
    // Stage 4: Delivery (poll-only — carrier events from external systems)
    // =========================================================================
    {
      id: 'delivery',
      name: 'Delivery & POD Events',
      description: 'Wait for In-Transit and Delivered carrier events',
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
          () => ctx.sterlingClient.getOrderInvoiceDetails({ OrderNo: ctx.orderId }),
          (invoices) => invoices.some((inv) => inv.InvoiceType !== 'CREDIT_MEMO'),
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
    // Stage 7: Create Return (action stage)
    // =========================================================================
    {
      id: 'create-return',
      name: 'Create Return Order',
      description: 'Initiate return via Sterling changeOrder API',
      act: async (ctx) => {
        const start = Date.now();

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
    // Stage 8: Return Delivery & Credit Note (poll-only)
    // =========================================================================
    {
      id: 'return-delivery',
      name: 'Return Delivery & Credit Note',
      description: 'Wait for return carrier events and credit note generation',
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

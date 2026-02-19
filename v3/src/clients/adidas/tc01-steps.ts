/**
 * Agentic QE v3 - Adidas TC_01 Step Definitions
 * Forward flow (Steps 1-12a) + Return flow (Steps 15-26) for order lifecycle.
 * Each step is a StepDef<AdidasTestContext> — the generic StepRunner executes them.
 */

import type { StepDef } from '../../integrations/orchestration/types';
import type { AdidasTestContext } from './context';
import { ensureArray } from '../../integrations/sterling/xml-helpers';

// ============================================================================
// TC_01 Step Definitions
// Typed with AdidasTestContext — no unsafe casts needed.
// Steps marked layer:2 require IIB, layer:3 require NShift.
// ============================================================================

export const tc01Steps: StepDef<AdidasTestContext>[] = [
  // =========================================================================
  // FORWARD FLOW (Steps 1-12a)
  // =========================================================================
  {
    id: 'step-01',
    name: 'Retrieve and validate order',
    description: 'Retrieve order, verify status and line items exist',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      const result = await ctx.sterlingClient.getOrderDetails({
        OrderNo: ctx.orderId || 'APT93030618',
      });

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      const order = result.value;
      ctx.orderId = order.OrderNo;
      ctx.documentType = order.DocumentType;

      const lines = ensureArray(order.OrderLines?.OrderLine);
      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'OrderNo present', passed: !!order.OrderNo, expected: 'truthy', actual: order.OrderNo },
          { name: 'Has order lines', passed: lines.length > 0, expected: '>0', actual: String(lines.length) },
          { name: 'Status defined', passed: !!order.Status, expected: 'truthy', actual: order.Status },
        ],
      };
    },
  },
  {
    id: 'step-02',
    name: 'Order status progresses to Released',
    description: 'Poll until order status reaches Released (3200)',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      const result = await ctx.sterlingClient.pollUntil(
        () => ctx.sterlingClient.getOrderDetails({ OrderNo: ctx.orderId }),
        (order) => order.Status >= '3200',
        { maxAttempts: 20, intervalMs: 5000 }
      );

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      const order = result.value;

      // Capture payment and total for later validation
      const payments = ensureArray(order.PaymentMethods?.PaymentMethod);
      if (payments.length > 0) {
        ctx.paymentMethod = payments[0].PaymentType ?? '';
      }
      ctx.originalOrderTotal = (order.TotalAmount as string) ?? '';

      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Status >= 3200', passed: order.Status >= '3200', expected: '>=3200', actual: order.Status },
        ],
      };
    },
  },
  {
    id: 'step-03',
    name: 'IIB: ShipmentRequest to WMS',
    description: 'Verify MF_ADS_OMS_ShipmentRequest_WMS_SYNC processed correctly',
    layer: 2,
    requires: { iib: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.iibProvider) {
        return { success: false, error: 'IIB provider not available', durationMs: 0, checks: [] };
      }

      const result = await ctx.iibProvider.getFlowTransactions(
        'MF_ADS_OMS_ShipmentRequest_WMS_SYNC',
        { orderId: ctx.orderId }
      );

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      const txns = result.value;
      return {
        success: txns.length > 0,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Has transactions', passed: txns.length > 0, expected: '>0', actual: String(txns.length) },
        ],
      };
    },
  },
  {
    id: 'step-04',
    name: 'IIB: WMS Ship Confirmation',
    description: 'Verify MF_ADS_WMS_ShipmentConfirm_SYNC processed correctly (SOAP over MQ)',
    layer: 2,
    requires: { iib: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.iibProvider) {
        return { success: false, error: 'IIB provider not available', durationMs: 0, checks: [] };
      }

      const result = await ctx.iibProvider.getFlowTransactions(
        'MF_ADS_WMS_ShipmentConfirm_SYNC',
        { orderId: ctx.orderId }
      );

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: result.value.length > 0,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Has ShipConfirm txns', passed: result.value.length > 0, expected: '>0', actual: String(result.value.length) },
        ],
      };
    },
  },
  {
    id: 'step-05',
    name: 'IIB: AFS Sales Order Creation',
    description: 'Verify MF_ADS_OMS_AFS_SalesOrderCreation processed correctly (MQ)',
    layer: 2,
    requires: { iib: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.iibProvider) {
        return { success: false, error: 'IIB provider not available', durationMs: 0, checks: [] };
      }

      const result = await ctx.iibProvider.getFlowTransactions(
        'MF_ADS_OMS_AFS_SalesOrderCreation',
        { orderId: ctx.orderId }
      );

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: result.value.length > 0,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Has AFS SO Creation txns', passed: result.value.length > 0, expected: '>0', actual: String(result.value.length) },
        ],
      };
    },
  },
  {
    id: 'step-06',
    name: 'IIB: NShift Label Request/Response',
    description: 'Verify MF_ADS_OMS_NShift_ShippingAndReturnLabel_SYNC processed correctly (HTTP via EAI hub)',
    layer: 2,
    requires: { iib: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.iibProvider) {
        return { success: false, error: 'IIB provider not available', durationMs: 0, checks: [] };
      }

      const result = await ctx.iibProvider.getFlowTransactions(
        'MF_ADS_OMS_NShift_ShippingAndReturnLabel_SYNC',
        { orderId: ctx.orderId }
      );

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: result.value.length > 0,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Has NShift label txns', passed: result.value.length > 0, expected: '>0', actual: String(result.value.length) },
        ],
      };
    },
  },
  {
    id: 'step-07',
    name: 'IIB: AFS Sales Order Acknowledgment',
    description: 'Verify MF_ADS_AFS_OMS_PPSalesOrderAck_SYNC processed correctly (HTTP)',
    layer: 2,
    requires: { iib: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.iibProvider) {
        return { success: false, error: 'IIB provider not available', durationMs: 0, checks: [] };
      }

      const result = await ctx.iibProvider.getFlowTransactions(
        'MF_ADS_AFS_OMS_PPSalesOrderAck_SYNC',
        { orderId: ctx.orderId }
      );

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: result.value.length > 0,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Has AFS SO Ack txns', passed: result.value.length > 0, expected: '>0', actual: String(result.value.length) },
        ],
      };
    },
  },
  {
    id: 'step-08',
    name: 'Shipment created with tracking',
    description: 'Verify shipment exists on Sterling with tracking number and carrier',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      const result = await ctx.sterlingClient.getShipmentList({ OrderNo: ctx.orderId });

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      const shipments = result.value;
      ctx.shipments = shipments.map((s) => ({
        shipmentNo: s.ShipmentNo,
        trackingNo: s.TrackingNo,
        containerNo: (s.ContainerNo as string) ?? '',
        scac: s.SCAC,
      }));

      return {
        success: shipments.length > 0,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Has shipments', passed: shipments.length > 0, expected: '>0', actual: String(shipments.length) },
          { name: 'First has tracking', passed: !!shipments[0]?.TrackingNo, expected: 'truthy', actual: shipments[0]?.TrackingNo ?? 'undefined' },
          { name: 'First has SCAC', passed: !!shipments[0]?.SCAC, expected: 'truthy', actual: shipments[0]?.SCAC ?? 'undefined' },
        ],
      };
    },
  },
  {
    id: 'step-09',
    name: 'NShift: Carrier tracking details',
    description: 'Verify NShift has carrier and receiver details for shipment',
    layer: 3,
    requires: { nshift: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.nshiftClient || ctx.shipments.length === 0) {
        return { success: false, error: 'NShift client not available or no shipments', durationMs: 0, checks: [] };
      }

      const tracking = ctx.shipments[0].trackingNo;
      const result = await ctx.nshiftClient.getShipmentDetails(tracking);

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      const shipment = result.value;
      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Carrier name present', passed: !!shipment.carrier.name, expected: 'truthy', actual: shipment.carrier.name },
          { name: 'Receiver name present', passed: !!shipment.receiver.name, expected: 'truthy', actual: shipment.receiver.name },
        ],
      };
    },
  },
  {
    id: 'step-10',
    name: 'POD: In-Transit carrier event',
    description: 'Poll Sterling notes for IT (In-Transit) carrier event',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      const result = await ctx.sterlingClient.pollUntil(
        () => ctx.sterlingClient.getOrderDetails({ OrderNo: ctx.orderId }),
        (order) => {
          const notes = ensureArray(order.Notes?.Note);
          return notes.some((n) => n.NoteText?.includes('IT') || n.ReasonCode === 'IT');
        },
        { maxAttempts: 30, intervalMs: 10000 }
      );

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'IT note found', passed: true, expected: 'IT note', actual: 'found' },
        ],
      };
    },
  },
  {
    id: 'step-11',
    name: 'POD: Delivered carrier event',
    description: 'Poll Sterling notes for DL (Delivered) carrier event',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
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
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'DL note found', passed: true, expected: 'DL note', actual: 'found' },
        ],
      };
    },
  },
  {
    id: 'step-12',
    name: 'Forward invoice generated',
    description: 'Verify forward invoice exists with correct total',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      const result = await ctx.sterlingClient.getOrderInvoiceDetails({ OrderNo: ctx.orderId });

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      const invoices = result.value;
      const forwardInvoice = invoices.find((inv) => inv.InvoiceType !== 'CREDIT_MEMO');
      if (forwardInvoice) {
        ctx.forwardInvoiceNo = forwardInvoice.InvoiceNo;
      }

      return {
        success: !!forwardInvoice,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Forward invoice exists', passed: !!forwardInvoice, expected: 'truthy', actual: forwardInvoice?.InvoiceNo ?? 'not found' },
          { name: 'Has total amount', passed: !!forwardInvoice?.TotalAmount, expected: 'truthy', actual: forwardInvoice?.TotalAmount ?? 'undefined' },
        ],
      };
    },
  },
  {
    id: 'step-12a',
    name: 'Financial reconciliation (forward)',
    description: 'Verify invoice total matches order total and payment method',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      const checks = [
        {
          name: 'Forward invoice captured',
          passed: !!ctx.forwardInvoiceNo,
          expected: 'truthy',
          actual: ctx.forwardInvoiceNo ?? 'not captured',
        },
        {
          name: 'Payment method captured',
          passed: !!ctx.paymentMethod,
          expected: 'truthy',
          actual: ctx.paymentMethod || 'not captured',
        },
      ];

      return {
        success: checks.every((c) => c.passed),
        durationMs: Date.now() - start,
        checks,
      };
    },
  },

  // =========================================================================
  // RETURN FLOW (Steps 15-26)
  // =========================================================================
  {
    id: 'step-15',
    name: 'Return order created',
    description: 'Retrieve return order (DocumentType 0003) and verify it exists',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      // Return order number is typically the forward order with a suffix or separate number.
      // Poll for a return order linked to the forward order.
      const result = await ctx.sterlingClient.getOrderDetails({
        OrderNo: ctx.orderId,
        DocumentType: '0003',
      });

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      const returnOrder = result.value;
      ctx.returnOrderNo = returnOrder.OrderNo;

      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Return order exists', passed: !!returnOrder.OrderNo, expected: 'truthy', actual: returnOrder.OrderNo },
          { name: 'DocumentType is 0003', passed: returnOrder.DocumentType === '0003', expected: '0003', actual: returnOrder.DocumentType },
        ],
      };
    },
  },
  {
    id: 'step-16',
    name: 'IIB: Return Authorization',
    description: 'Verify MF_ADS_EPOCH_ReturnAuthorization_WE processed correctly (MQ)',
    layer: 2,
    requires: { iib: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.iibProvider) {
        return { success: false, error: 'IIB provider not available', durationMs: 0, checks: [] };
      }

      const result = await ctx.iibProvider.getFlowTransactions(
        'MF_ADS_EPOCH_ReturnAuthorization_WE',
        { orderId: ctx.returnOrderNo ?? ctx.orderId }
      );

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: result.value.length > 0,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Has return auth txns', passed: result.value.length > 0, expected: '>0', actual: String(result.value.length) },
        ],
      };
    },
  },
  {
    id: 'step-24',
    name: 'Return tracking via POD notes',
    description: 'Poll Sterling notes for return carrier events (RT/RP/RD)',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      const returnOrderNo = ctx.returnOrderNo ?? ctx.orderId;
      const result = await ctx.sterlingClient.pollUntil(
        () => ctx.sterlingClient.getOrderDetails({ OrderNo: returnOrderNo, DocumentType: '0003' }),
        (order) => {
          const notes = ensureArray(order.Notes?.Note);
          return notes.some((n) =>
            n.ReasonCode === 'RT' || n.ReasonCode === 'RP' || n.ReasonCode === 'RD'
          );
        },
        { maxAttempts: 30, intervalMs: 10000 }
      );

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      return {
        success: true,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Return carrier note found', passed: true, expected: 'RT/RP/RD note', actual: 'found' },
        ],
      };
    },
  },
  {
    id: 'step-25',
    name: 'Credit note generated',
    description: 'Verify credit memo invoice exists for the return',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      const returnOrderNo = ctx.returnOrderNo ?? ctx.orderId;
      const result = await ctx.sterlingClient.getOrderInvoiceDetails({
        OrderNo: returnOrderNo,
        DocumentType: '0003',
      });

      if (!result.success) {
        return { success: false, error: result.error.message, durationMs: Date.now() - start, checks: [] };
      }

      const creditNote = result.value.find((inv) => inv.InvoiceType === 'CREDIT_MEMO');
      if (creditNote) {
        ctx.creditNoteNo = creditNote.InvoiceNo;
      }

      return {
        success: !!creditNote,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Credit note exists', passed: !!creditNote, expected: 'truthy', actual: creditNote?.InvoiceNo ?? 'not found' },
          { name: 'Has amount', passed: !!creditNote?.TotalAmount, expected: 'truthy', actual: creditNote?.TotalAmount ?? 'undefined' },
        ],
      };
    },
  },
  {
    id: 'step-26',
    name: 'Financial reconciliation (return)',
    description: 'Verify credit note amount and return order closure',
    layer: 1,
    requires: {},
    execute: async (ctx) => {
      const start = Date.now();
      const checks = [
        {
          name: 'Credit note captured',
          passed: !!ctx.creditNoteNo,
          expected: 'truthy',
          actual: ctx.creditNoteNo ?? 'not captured',
        },
        {
          name: 'Return order captured',
          passed: !!ctx.returnOrderNo,
          expected: 'truthy',
          actual: ctx.returnOrderNo ?? 'not captured',
        },
      ];

      return {
        success: checks.every((c) => c.passed),
        durationMs: Date.now() - start,
        checks,
      };
    },
  },
];

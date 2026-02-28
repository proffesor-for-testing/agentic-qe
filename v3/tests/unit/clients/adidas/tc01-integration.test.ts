/**
 * TC_01 Integration Test — Fix #6
 * Validates that buildTC01Lifecycle() + tc01Steps wire together correctly
 * through the ActionOrchestrator with a mocked Sterling client.
 *
 * This is the test that catches step ID mismatches, missing wiring, and
 * silent skip bugs at the integration seam.
 */

import { describe, it, expect, vi } from 'vitest';
import { createActionOrchestrator } from '../../../../src/integrations/orchestration/action-orchestrator';
import { buildTC01Lifecycle } from '../../../../src/clients/adidas/tc01-lifecycle';
import { tc01Steps } from '../../../../src/clients/adidas/tc01-steps';
import type { AdidasTestContext } from '../../../../src/clients/adidas/context';
import type { SterlingClient, Order, Shipment, OrderInvoice, OrderAudit } from '../../../../src/integrations/sterling/types';
import type { Result } from '../../../../src/shared/types/index';
import type { SterlingApiError } from '../../../../src/integrations/sterling/types';

// ============================================================================
// Mock Sterling Client — returns canned data for each API call
// ============================================================================

function mockSterlingClient(): SterlingClient {
  const baseOrder: Order = {
    OrderNo: 'TEST-ORD-001',
    DocumentType: '0001',
    Status: '3200',
    SCAC: 'DHL',
    CarrierServiceCode: 'EXPRESS',
    ShipNode: 'WH-NL-01',
    OrderLines: {
      OrderLine: [
        { ItemID: 'TEST-ITEM-001', OrderedQty: '1', SCAC: 'DHL', CarrierServiceCode: 'EXPRESS', ShipNode: 'WH-NL-01' },
      ],
    },
    Shipments: {
      Shipment: [
        { ShipmentNo: 'SHP-001', Status: '1100', SCAC: 'DHL', TrackingNo: 'TRK-12345', ShipNode: 'WH-NL-01' },
      ],
    },
    Notes: {
      Note: [
        { NoteText: 'IT - In Transit', ReasonCode: 'IT' },
        { NoteText: 'DL - Delivered', ReasonCode: 'DL' },
      ],
    },
    PaymentMethods: {
      PaymentMethod: [{ PaymentType: 'CREDIT_CARD', MaxChargeAmount: '220.00' }],
    },
    PersonInfoShipTo: {
      FirstName: 'QE',
      LastName: 'Automation',
      AddressLine1: '1 Test Street',
      City: 'Amsterdam',
      ZipCode: '1012AB',
      Country: 'NL',
    },
    TotalAmount: '220.00',
  };

  const returnOrder: Order = {
    ...baseOrder,
    OrderNo: 'TEST-ORD-001',
    DocumentType: '0003',
    Notes: {
      Note: [
        { NoteText: 'RT - Return Transit', ReasonCode: 'RT' },
        { NoteText: 'RD - Return Delivered', ReasonCode: 'RD' },
      ],
    },
  };

  const ok = <T>(value: T): Result<T, SterlingApiError> => ({ success: true, value });

  return {
    getOrderDetails: vi.fn(async (params) => {
      if (params.DocumentType === '0003') return ok(returnOrder);
      return ok(baseOrder);
    }),
    createOrder: vi.fn(async () => ok(baseOrder)),
    changeOrder: vi.fn(async () => ok(baseOrder)),
    getShipmentList: vi.fn(async () => ok(baseOrder.Shipments!.Shipment)),
    getShipmentListForOrder: vi.fn(async () => ok([
      { ShipmentKey: 'SK-001', ShipmentNo: 'SHP-001', Status: '3700', SCAC: 'DHL', TrackingNo: 'TRK-12345', ShipNode: 'WH-NL-01' },
    ])),
    getOrderInvoiceList: vi.fn(async () => ok([
      { InvoiceNo: 'INV-001', InvoiceType: 'STANDARD', TotalAmount: '220.00' },
    ] as OrderInvoice[])),
    getOrderInvoiceDetails: vi.fn(async () => ok([
      { InvoiceNo: 'INV-001', InvoiceType: 'STANDARD', TotalAmount: '220.00' },
    ] as OrderInvoice[])),
    getOrderReleaseList: vi.fn(async () => ok([
      { ReleaseNo: '0001', Status: '3200' },
    ])),
    getOrderLineList: vi.fn(async () => ok(baseOrder.OrderLines!.OrderLine)),
    getOrderAuditList: vi.fn(async () => ok([] as OrderAudit[])),
    getShipmentDetails: vi.fn(async () => ok(baseOrder.Shipments!.Shipment[0])),
    scheduleOrder: vi.fn(async () => ok(baseOrder)),
    releaseOrder: vi.fn(async () => ok(baseOrder)),
    manageTaskQueue: vi.fn(async () => ok({})),
    healthCheck: vi.fn(async () => true),
    pollUntil: vi.fn(async (fn, predicate) => {
      // Immediately resolve — in tests we don't actually wait
      const result = await fn();
      return result;
    }),
  };
}

// ============================================================================
// Mock Adidas Test Context
// ============================================================================

function mockAdidasCtx(): AdidasTestContext {
  return {
    orderId: '',
    documentType: '0001',
    sterlingClient: mockSterlingClient(),
    shipments: [],
    originalOrderTotal: '',
    paymentMethod: '',
    enterpriseCode: 'adidas_PT',
    // Layer 2/3 providers not available — steps will be skipped
    // No xapiClient → XAPI-driven stages will gracefully skip their act
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('TC_01 Integration: Lifecycle + Steps + Orchestrator', () => {
  it('wires lifecycle stages to real tc01Steps without step-not-found errors', async () => {
    const ctx = mockAdidasCtx();
    const stages = buildTC01Lifecycle();

    const orchestrator = createActionOrchestrator<AdidasTestContext>({
      stages,
      verificationSteps: tc01Steps,
      skipLayer2: true,
      skipLayer3: true,
      continueOnVerifyFailure: true,
    });

    const result = await orchestrator.runAll(ctx);

    // Verify no "step not found" errors — this catches Fix #4 regressions
    for (const stage of result.stages) {
      for (const step of stage.verification.steps) {
        if (step.result.error) {
          expect(
            step.result.error,
            `Stage '${stage.stageId}' references step '${step.stepId}' which is not found`
          ).not.toContain('not found');
        }
      }
    }
  });

  it('action stages (create-order, confirm-shipment, create-return) execute act()', async () => {
    const ctx = mockAdidasCtx();
    const stages = buildTC01Lifecycle();

    const orchestrator = createActionOrchestrator<AdidasTestContext>({
      stages,
      verificationSteps: tc01Steps,
      skipLayer2: true,
      skipLayer3: true,
      continueOnVerifyFailure: true,
    });

    const result = await orchestrator.runAll(ctx);

    const createOrder = result.stages.find((s) => s.stageId === 'create-order');
    const confirmShipment = result.stages.find((s) => s.stageId === 'confirm-shipment');
    const createReturn = result.stages.find((s) => s.stageId === 'create-return');

    expect(createOrder?.action.success, 'create-order action').toBe(true);
    expect(confirmShipment?.action.success, 'confirm-shipment action').toBe(true);
    expect(createReturn?.action.success, 'create-return action').toBe(true);

    // Sterling API was called
    expect(ctx.sterlingClient.createOrder).toHaveBeenCalled();
    expect(ctx.sterlingClient.changeOrder).toHaveBeenCalled();
  });

  it('poll-only stage (forward-invoice) runs poll without act', async () => {
    const ctx = mockAdidasCtx();
    const stages = buildTC01Lifecycle();

    const orchestrator = createActionOrchestrator<AdidasTestContext>({
      stages,
      verificationSteps: tc01Steps,
      skipLayer2: true,
      skipLayer3: true,
      continueOnVerifyFailure: true,
    });

    const result = await orchestrator.runAll(ctx);

    // forward-invoice is the only true poll-only stage (invoice is auto-generated)
    const forwardInvoice = result.stages.find((s) => s.stageId === 'forward-invoice');
    expect(forwardInvoice, 'forward-invoice should be in results').toBeDefined();
    expect(forwardInvoice!.action.success, 'forward-invoice action should be success (skipped)').toBe(true);
    expect(forwardInvoice!.action.data?.actionStatus, 'forward-invoice should show action was skipped').toBe('skipped');
    expect(forwardInvoice!.poll.success, 'forward-invoice poll should have run').toBe(true);
  });

  it('XAPI-driven stages run act (skipped without XAPI) then poll', async () => {
    const ctx = mockAdidasCtx();
    // No xapiClient set → act functions will skip, then poll runs
    const stages = buildTC01Lifecycle();

    const orchestrator = createActionOrchestrator<AdidasTestContext>({
      stages,
      verificationSteps: tc01Steps,
      skipLayer2: true,
      skipLayer3: true,
      continueOnVerifyFailure: true,
    });

    const result = await orchestrator.runAll(ctx);

    const xapiDrivenIds = ['wait-for-release', 'delivery', 'return-delivery'];
    for (const id of xapiDrivenIds) {
      const stage = result.stages.find((s) => s.stageId === id);
      expect(stage, `Stage '${id}' should be in results`).toBeDefined();
      // Without xapiClient, act runs but returns success with 'skipped' status
      expect(stage!.action.success, `${id} action should succeed (graceful skip)`).toBe(true);
      // Poll should have run
      expect(stage!.poll.success, `${id} poll should have run`).toBe(true);
    }
  });

  it('verify-only stages run their verification steps', async () => {
    const ctx = mockAdidasCtx();
    // Pre-populate context so steps have data to work with
    ctx.orderId = 'TEST-ORD-001';
    ctx.shipments = [{ shipmentNo: 'SHP-001', trackingNo: 'TRK-12345', containerNo: '', scac: 'DHL' }];

    const stages = buildTC01Lifecycle();

    const orchestrator = createActionOrchestrator<AdidasTestContext>({
      stages,
      verificationSteps: tc01Steps,
      skipLayer2: true,
      skipLayer3: true,
      continueOnVerifyFailure: true,
    });

    const result = await orchestrator.runAll(ctx);

    const forwardComms = result.stages.find((s) => s.stageId === 'forward-comms');
    const returnComms = result.stages.find((s) => s.stageId === 'return-comms');

    expect(forwardComms, 'forward-comms stage should exist').toBeDefined();
    expect(returnComms, 'return-comms stage should exist').toBeDefined();

    // With L3 skipped, all email/PDF/browser steps should be skipped (not "not found")
    expect(forwardComms!.verification.skipped).toBeGreaterThan(0);
    expect(forwardComms!.verification.failed, 'forward-comms should have 0 failures (all skipped, none missing)').toBe(0);
    expect(returnComms!.verification.skipped).toBeGreaterThan(0);
    expect(returnComms!.verification.failed, 'return-comms should have 0 failures (all skipped, none missing)').toBe(0);
  });

  it('all 9 stages appear in results', async () => {
    const ctx = mockAdidasCtx();
    const stages = buildTC01Lifecycle();

    const orchestrator = createActionOrchestrator<AdidasTestContext>({
      stages,
      verificationSteps: tc01Steps,
      skipLayer2: true,
      skipLayer3: true,
      continueOnVerifyFailure: true,
    });

    const result = await orchestrator.runAll(ctx);

    expect(result.stages).toHaveLength(9);

    const stageIds = result.stages.map((s) => s.stageId);
    expect(stageIds).toEqual([
      'create-order',
      'wait-for-release',
      'confirm-shipment',
      'delivery',
      'forward-invoice',
      'forward-comms',
      'create-return',
      'return-delivery',
      'return-comms',
    ]);
  });

  it('context flows through stages (orderId set by create-order, used by later stages)', async () => {
    const ctx = mockAdidasCtx();
    expect(ctx.orderId).toBe('');

    const stages = buildTC01Lifecycle();
    const orchestrator = createActionOrchestrator<AdidasTestContext>({
      stages,
      verificationSteps: tc01Steps,
      skipLayer2: true,
      skipLayer3: true,
      continueOnVerifyFailure: true,
    });

    await orchestrator.runAll(ctx);

    // create-order should have set orderId from Sterling response
    expect(ctx.orderId).toBe('TEST-ORD-001');
  });
});

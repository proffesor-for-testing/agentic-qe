/**
 * Healing Handler Unit Tests
 * Verifies failure signature matching and recovery dispatch.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHealingHandler } from '../../../../src/clients/adidas/healing-handler';
import type { StageResult } from '../../../../src/integrations/orchestration/action-types';
import type { AdidasTestContext } from '../../../../src/clients/adidas/context';

// ============================================================================
// Helpers
// ============================================================================

function makeStageResult(overrides: Partial<StageResult> = {}): StageResult {
  return {
    stageId: 'test-stage',
    stageName: 'Test Stage',
    action: { success: true, durationMs: 0 },
    poll: { success: true, durationMs: 0 },
    verification: { steps: [], passed: 0, failed: 0, skipped: 0 },
    overallSuccess: false,
    durationMs: 0,
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AdidasTestContext> = {}): AdidasTestContext {
  return {
    orderId: 'APT12345678',
    documentType: '0001',
    sterlingClient: {} as AdidasTestContext['sterlingClient'],
    shipments: [],
    originalOrderTotal: '120.00',
    paymentMethod: 'CREDIT_CARD',
    enterpriseCode: 'adidas_PT',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('createHealingHandler', () => {
  describe('infrastructure failure detection', () => {
    it('returns abort on ECONNREFUSED', async () => {
      const handler = createHealingHandler({ enterpriseCode: 'adidas_PT', verbose: false });
      const result = makeStageResult({
        action: { success: false, error: 'ECONNREFUSED 10.0.0.1:443', durationMs: 100 },
      });

      const decision = await handler('create-order', result, makeCtx());
      expect(decision).toBe('abort');
    });

    it('returns abort on ETIMEDOUT', async () => {
      const handler = createHealingHandler({ enterpriseCode: 'adidas_PT', verbose: false });
      const result = makeStageResult({
        poll: { success: false, error: 'ETIMEDOUT', durationMs: 30000 },
      });

      const decision = await handler('confirm-shipment', result, makeCtx());
      expect(decision).toBe('abort');
    });

    it('returns abort on fetch failed', async () => {
      const handler = createHealingHandler({ enterpriseCode: 'adidas_PT', verbose: false });
      const result = makeStageResult({
        action: { success: false, error: 'fetch failed: network error', durationMs: 0 },
      });

      const decision = await handler('delivery', result, makeCtx());
      expect(decision).toBe('abort');
    });
  });

  describe('invoice failure detection', () => {
    it('detects forward-invoice stage failure', async () => {
      const handler = createHealingHandler({ enterpriseCode: 'adidas_PT', verbose: false });
      const result = makeStageResult({
        stageId: 'forward-invoice',
        poll: { success: false, error: 'Polling timed out', durationMs: 75000 },
      });

      // Will attempt recovery (which will fail because sterlingClient is mocked)
      // but the key test is that it doesn't return 'abort' — it tries recovery
      const ctx = makeCtx({
        sterlingClient: {
          getShipmentListForOrder: vi.fn().mockResolvedValue({ success: false, error: { message: 'mock', apiName: 'test' } }),
        } as unknown as AdidasTestContext['sterlingClient'],
      });

      const decision = await handler('forward-invoice', result, ctx);
      // Recovery fails because mock client → returns 'continue'
      expect(decision).toBe('continue');
    });

    it('detects step-12 verification failure', async () => {
      const handler = createHealingHandler({ enterpriseCode: 'adidas_PT', verbose: false });
      const result = makeStageResult({
        verification: {
          steps: [
            { stepId: 'step-12', result: { success: false, error: 'No invoice', durationMs: 0, checks: [] } },
          ],
          passed: 0,
          failed: 1,
          skipped: 0,
        },
      });

      const ctx = makeCtx({
        sterlingClient: {
          getShipmentListForOrder: vi.fn().mockResolvedValue({ success: false, error: { message: 'mock', apiName: 'test' } }),
        } as unknown as AdidasTestContext['sterlingClient'],
      });

      const decision = await handler('verify-invoice', result, ctx);
      expect(decision).toBe('continue');
    });
  });

  describe('unknown failure', () => {
    it('returns continue for unrecognized failure signatures', async () => {
      const handler = createHealingHandler({ enterpriseCode: 'adidas_PT', verbose: false });
      const result = makeStageResult({
        action: { success: false, error: 'Some random error', durationMs: 100 },
      });

      const decision = await handler('create-order', result, makeCtx());
      expect(decision).toBe('continue');
    });
  });

  describe('patternStore integration', () => {
    it('passes patternStore to recovery playbook', async () => {
      const mockPatternStore = {
        search: vi.fn().mockResolvedValue([]),
      };

      const handler = createHealingHandler({
        enterpriseCode: 'adidas_PT',
        verbose: false,
        patternStore: mockPatternStore,
      });

      const result = makeStageResult({
        stageId: 'forward-invoice',
        poll: { success: false, error: 'timeout', durationMs: 75000 },
      });

      const ctx = makeCtx({
        sterlingClient: {
          getShipmentListForOrder: vi.fn().mockResolvedValue({
            success: true,
            value: [{ ShipmentKey: 'SK123', ShipmentNo: 'SN1', Status: '3700', SCAC: 'COR', TrackingNo: 'TR1', ShipNode: 'IT33' }],
          }),
          manageTaskQueue: vi.fn()
            .mockResolvedValueOnce({ success: true, value: { TaskQKey: 'TQ1', AvailableDate: '2099-01-01', DataKey: 'SK123' } })
            .mockResolvedValueOnce({ success: true, value: {} }),
          getOrderInvoiceList: vi.fn().mockResolvedValue({
            success: true,
            value: [{ InvoiceNo: 'INV-001', InvoiceType: 'INVOICE', TotalAmount: '120.00' }],
          }),
          getOrderDetails: vi.fn().mockResolvedValue({
            success: true,
            value: { OrderNo: 'APT12345678', Status: '3700', DocumentType: '0001', PaymentStatus: 'INVOICED', OrderLines: { OrderLine: [] } },
          }),
        } as unknown as AdidasTestContext['sterlingClient'],
        // xapiClient needed by asRecoveryClient for processOrderPayments
        xapiClient: {
          invokeOrThrow: vi.fn().mockResolvedValue({ success: true }),
        } as unknown as AdidasTestContext['xapiClient'],
      });

      await handler('forward-invoice', result, ctx);

      // Verify patternStore.search was called during recovery
      expect(mockPatternStore.search).toHaveBeenCalledWith(
        'sterling invoice delay manageTaskQueue',
        expect.objectContaining({ tags: ['sterling-oms', 'recovery'] }),
      );
    }, 15_000);
  });
});

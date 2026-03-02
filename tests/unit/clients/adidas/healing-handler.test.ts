/**
 * Healing Handler Unit Tests
 * Verifies failure signature matching and recovery dispatch.
 *
 * The healing handler routes failures to:
 *   1. 'abort' — infrastructure failures (ECONNREFUSED, ETIMEDOUT, fetch failed)
 *   2. invoice recovery via XAPI — forward-invoice or step-12 failures
 *   3. agentic healer — unknown failures (probes Sterling state)
 */
import { describe, it, expect, vi } from 'vitest';
import { createHealingHandler } from '../../../../src/clients/adidas/healing-handler';
import type { StageResult } from '../../../../src/integrations/orchestration/action-types';
import type { AdidasTestContext } from '../../../../src/clients/adidas/context';
import type { XAPIResponse } from '../../../../src/integrations/sterling/types';

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

function xapiOk(body: string): XAPIResponse {
  return { success: true, body, status: 200, duration: 50, retries: 0 };
}

function xapiErr(error: string): XAPIResponse {
  return { success: false, body: '', status: 500, duration: 50, retries: 0, error };
}

function makeCtx(overrides: Partial<AdidasTestContext> = {}): AdidasTestContext {
  return {
    orderId: 'APT12345678',
    documentType: '0001',
    sterlingClient: {
      getOrderDetails: vi.fn().mockResolvedValue({ success: false, error: { message: 'mock', apiName: 'test' } }),
      getShipmentListForOrder: vi.fn().mockResolvedValue({ success: false, error: { message: 'mock', apiName: 'test' } }),
      getOrderInvoiceList: vi.fn().mockResolvedValue({ success: false, error: { message: 'mock', apiName: 'test' } }),
    } as unknown as AdidasTestContext['sterlingClient'],
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
    it('returns continue when forward-invoice fails and no xapiClient', async () => {
      const handler = createHealingHandler({ enterpriseCode: 'adidas_PT', verbose: false });
      const result = makeStageResult({
        stageId: 'forward-invoice',
        poll: { success: false, error: 'Polling timed out', durationMs: 75000 },
      });

      // No xapiClient → cannot run recovery → returns continue
      const ctx = makeCtx();
      const decision = await handler('forward-invoice', result, ctx);
      expect(decision).toBe('continue');
    });

    it('attempts recovery when xapiClient is available', async () => {
      const handler = createHealingHandler({ enterpriseCode: 'adidas_PT', verbose: false });
      const result = makeStageResult({
        stageId: 'forward-invoice',
        poll: { success: false, error: 'Polling timed out', durationMs: 75000 },
      });

      // xapiClient returns failure for getShipmentListForOrder → recovery fails → continue
      const xapiInvoke = vi.fn().mockResolvedValue(xapiErr('no shipments'));
      const ctx = makeCtx({
        xapiClient: { invoke: xapiInvoke, invokeOrThrow: xapiInvoke },
      });

      const decision = await handler('forward-invoice', result, ctx);
      // Recovery attempted but failed → continue
      expect(decision).toBe('continue');
      expect(xapiInvoke).toHaveBeenCalled();
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

      // No xapiClient → cannot run recovery → returns continue
      const ctx = makeCtx();
      const decision = await handler('verify-invoice', result, ctx);
      expect(decision).toBe('continue');
    });
  });

  describe('unknown failure (agentic healer)', () => {
    it('returns continue for unrecognized failure signatures', async () => {
      const handler = createHealingHandler({ enterpriseCode: 'adidas_PT', verbose: false });
      const result = makeStageResult({
        action: { success: false, error: 'Some random error', durationMs: 100 },
      });

      // Agentic healer probes Sterling state — mocked to return failures
      // so no recovery pattern matches → returns continue
      const decision = await handler('create-order', result, makeCtx());
      expect(decision).toBe('continue');
    });
  });
});

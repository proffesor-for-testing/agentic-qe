/**
 * Regression test: Pattern store is passed to attemptAgenticHealing
 * even when HNSW is NOT active. Guards against the gating bug where
 * text-scoring was blocked behind HNSW activation threshold.
 */

import { describe, it, expect, vi } from 'vitest';

describe('healing-handler pattern store ungating', () => {
  it('passes pattern store to attemptAgenticHealing even when HNSW is inactive', async () => {
    // Mock the agentic healer to capture what patternStore argument it receives
    const capturedCalls: unknown[] = [];
    vi.doMock('../../../../src/clients/adidas/agentic-healer', () => ({
      attemptAgenticHealing: async (
        _stageId: string,
        _result: unknown,
        _ctx: unknown,
        patternStore: unknown,
      ) => {
        capturedCalls.push(patternStore);
        return {
          decision: 'continue' as const,
          diagnosis: 'test',
          snapshot: {
            maxStatus: 0, statusText: 'unknown', shipmentCount: 0,
            invoiceCount: 0, hasReturnCreditNote: false,
            noteReasonCodes: [],
          },
          durationMs: 1,
        };
      },
    }));

    // Mock recovery-playbook to prevent actual recovery attempts
    vi.doMock('../../../../src/clients/adidas/recovery-playbook', () => ({
      recoverInvoiceGeneration: async () => ({
        success: true,
        value: { recovered: false, strategy: 'test', duration: 0, details: 'test' },
      }),
    }));

    // Mock healing-telemetry with HNSW NOT activated (under threshold)
    vi.doMock('../../../../src/clients/adidas/healing-telemetry', () => ({
      HNSW_ACTIVATION_THRESHOLD: 20,
      initHealingTelemetry: async () => null,
    }));

    const { createHealingHandler } = await import('../../../../src/clients/adidas/healing-handler');

    // Create a fake pattern store (non-undefined)
    const fakePatternStore = {
      search: async () => [],
      recordUsage: async () => {},
    };

    // Create handler with pattern store but NO active HNSW
    const handler = createHealingHandler({
      enterpriseCode: 'adidas_PT',
      verbose: false,
      patternStore: fakePatternStore,
      // telemetry is null → HNSW is NOT activated
    });

    // Simulate a failed stage that doesn't match invoice failure
    const fakeResult = {
      stageId: 'some-stage',
      stageName: 'Some Stage',
      action: { success: false, error: 'Something failed', durationMs: 100, data: {} },
      poll: { success: true, durationMs: 0, data: {} },
      verification: {
        steps: [],
        passed: 0,
        failed: 0,
        skipped: 0,
      },
      overallSuccess: false,
      durationMs: 100,
    };

    const fakeCtx = {
      orderId: 'TEST-001',
      documentType: '0001',
      sterlingClient: {
        getOrder: async () => ({ success: false, error: 'test' }),
        getShipmentListForOrder: async () => ({ success: false, error: 'test' }),
      },
      enterpriseCode: 'adidas_PT',
      shipments: [],
      originalOrderTotal: '',
      paymentMethod: '',
    } as any;

    await handler('some-stage', fakeResult, fakeCtx);

    // The critical assertion: pattern store was passed through, not gated
    expect(capturedCalls.length).toBe(1);
    expect(capturedCalls[0]).toBe(fakePatternStore);
  });
});

/**
 * Tests for Rule 1.5 in agentic-healer.ts:
 * When maxStatus >= target AND field-presence checks fail,
 * the healer returns 'output-template-missing-field' pattern.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Rule 1.5: output-template-missing-field', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('diagnoses output template gap when status satisfied but field checks fail', async () => {
    // Mock sterlingClient for the probe — status 3700 (past create-order target 1100)
    const mockSterlingClient = {
      getOrder: async () => ({
        success: true as const,
        value: { MaxOrderStatus: '3700', Status: 'Shipped', Notes: {} },
      }),
      getShipmentListForOrder: async () => ({
        success: true as const,
        value: [{ ShipmentKey: 'SK1' }],
      }),
      getOrderInvoiceList: async () => ({
        success: true as const,
        value: [{ InvoiceNo: 'INV1', InvoiceType: 'STANDARD' }],
      }),
    };

    const { attemptAgenticHealing } = await import(
      '../../../../src/clients/adidas/agentic-healer'
    );

    // StageResult where status is satisfied (3700 >= 1100 for create-order)
    // but field-presence checks fail
    const fakeResult = {
      stageId: 'create-order',
      stageName: 'Create Order',
      action: { success: false, error: 'Check failed', durationMs: 100, data: {} },
      poll: { success: true, durationMs: 0, data: {} },
      verification: {
        steps: [{
          stepId: 'step-1',
          result: {
            success: false,
            durationMs: 5,
            checks: [
              { name: 'ShipTo FirstName present', passed: false, expected: 'present', actual: 'missing' },
              { name: 'ShipTo LastName present', passed: false, expected: 'present', actual: 'missing' },
              { name: 'Has order lines', passed: true, expected: 'present', actual: 'present' },
            ],
          },
        }],
        passed: 0,
        failed: 1,
        skipped: 0,
      },
      overallSuccess: false,
      durationMs: 105,
    };

    const fakeCtx = {
      orderId: 'TEST-001',
      documentType: '0001',
      sterlingClient: mockSterlingClient,
      enterpriseCode: 'adidas_PT',
      shipments: [],
      originalOrderTotal: '',
      paymentMethod: '',
    } as any;

    const attempt = await attemptAgenticHealing('create-order', fakeResult, fakeCtx, undefined);

    expect(attempt.decision).toBe('continue');
    expect(attempt.recoveryAction).toBe('output-template-missing-field');
    expect(attempt.diagnosis).toContain('field checks failed');
    expect(attempt.diagnosis).toContain('ShipTo FirstName present');
    expect(attempt.diagnosis).toContain('ShipTo LastName present');
    expect(attempt.diagnosis).toContain('PersonInfoShipTo.FirstName');
    expect(attempt.diagnosis).toContain('PersonInfoShipTo.LastName');
  });

  it('falls back to status-already-satisfied when no field checks fail', async () => {
    const mockSterlingClient = {
      getOrder: async () => ({
        success: true as const,
        value: { MaxOrderStatus: '3700', Status: 'Shipped', Notes: {} },
      }),
      getShipmentListForOrder: async () => ({
        success: true as const,
        value: [{ ShipmentKey: 'SK1' }],
      }),
      getOrderInvoiceList: async () => ({
        success: true as const,
        value: [],
      }),
    };

    const { attemptAgenticHealing } = await import(
      '../../../../src/clients/adidas/agentic-healer'
    );

    // All checks pass — status is satisfied and field checks all pass
    const fakeResult = {
      stageId: 'create-order',
      stageName: 'Create Order',
      action: { success: false, error: 'Timeout', durationMs: 100, data: {} },
      poll: { success: true, durationMs: 0, data: {} },
      verification: {
        steps: [{
          stepId: 'step-1',
          result: {
            success: true,
            durationMs: 5,
            checks: [
              { name: 'ShipTo FirstName present', passed: true, expected: 'present', actual: 'present' },
            ],
          },
        }],
        passed: 1,
        failed: 0,
        skipped: 0,
      },
      overallSuccess: false,
      durationMs: 105,
    };

    const fakeCtx = {
      orderId: 'TEST-002',
      documentType: '0001',
      sterlingClient: mockSterlingClient,
      enterpriseCode: 'adidas_PT',
      shipments: [],
      originalOrderTotal: '',
      paymentMethod: '',
    } as any;

    const attempt = await attemptAgenticHealing('create-order', fakeResult, fakeCtx, undefined);

    expect(attempt.decision).toBe('continue');
    expect(attempt.recoveryAction).toBe('status-already-satisfied');
  });

  it('does not trigger Rule 1.5 for non-field-presence check failures', async () => {
    const mockSterlingClient = {
      getOrder: async () => ({
        success: true as const,
        value: { MaxOrderStatus: '3700', Status: 'Shipped', Notes: {} },
      }),
      getShipmentListForOrder: async () => ({
        success: true as const,
        value: [],
      }),
      getOrderInvoiceList: async () => ({
        success: true as const,
        value: [],
      }),
    };

    const { attemptAgenticHealing } = await import(
      '../../../../src/clients/adidas/agentic-healer'
    );

    // A non-field-presence check fails (not in STERLING_FIELD_MAP)
    const fakeResult = {
      stageId: 'create-order',
      stageName: 'Create Order',
      action: { success: false, error: 'Some error', durationMs: 100, data: {} },
      poll: { success: true, durationMs: 0, data: {} },
      verification: {
        steps: [{
          stepId: 'step-1',
          result: {
            success: false,
            durationMs: 5,
            checks: [
              { name: 'Custom Check XYZ', passed: false, expected: 'true', actual: 'false' },
            ],
          },
        }],
        passed: 0,
        failed: 1,
        skipped: 0,
      },
      overallSuccess: false,
      durationMs: 105,
    };

    const fakeCtx = {
      orderId: 'TEST-003',
      documentType: '0001',
      sterlingClient: mockSterlingClient,
      enterpriseCode: 'adidas_PT',
      shipments: [],
      originalOrderTotal: '',
      paymentMethod: '',
    } as any;

    const attempt = await attemptAgenticHealing('create-order', fakeResult, fakeCtx, undefined);

    // Should be status-already-satisfied, NOT output-template-missing-field
    expect(attempt.decision).toBe('continue');
    expect(attempt.recoveryAction).toBe('status-already-satisfied');
  });
});

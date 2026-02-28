/**
 * Recovery Playbook Unit Tests
 * Tests the invoice delay recovery with mocked SterlingClient.
 */
import { describe, it, expect, vi } from 'vitest';
import { recoverInvoiceGeneration, pollForInvoice } from '../../../../src/clients/adidas/recovery-playbook';
import type { RecoverySterlingClient } from '../../../../src/clients/adidas/recovery-playbook';

// ============================================================================
// Mock Builder
// ============================================================================

function mockSterlingClient(overrides: Partial<Record<string, unknown>> = {}): RecoverySterlingClient {
  return {
    getOrderDetails: vi.fn().mockResolvedValue({ success: true, value: { OrderNo: 'APT123', Status: '3700', DocumentType: '0001', OrderLines: { OrderLine: [] } } }),
    getShipmentListForOrder: vi.fn().mockResolvedValue({
      success: true,
      value: [{ ShipmentKey: 'SK-001', ShipmentNo: 'SN-001', Status: '3700', SCAC: 'COR', TrackingNo: 'TR-001', ShipNode: 'IT33' }],
    }),
    manageTaskQueue: vi.fn()
      .mockResolvedValueOnce({ success: true, value: { TaskQKey: 'TQ-001', AvailableDate: '2099-01-01 00:00:00.000', DataKey: 'SK-001' } })
      .mockResolvedValueOnce({ success: true, value: {} }),
    getOrderInvoiceList: vi.fn().mockResolvedValue({
      success: true,
      value: [{ InvoiceNo: 'INV-001', InvoiceType: 'INVOICE', TotalAmount: '120.00' }],
    }),
    processOrderPayments: vi.fn().mockResolvedValue({ success: true, value: undefined }),
    // Fill remaining interface methods as no-ops
    createOrder: vi.fn(),
    changeOrder: vi.fn(),
    getOrderList: vi.fn(),
    getOrderLineList: vi.fn(),
    getOrderReleaseList: vi.fn(),
    getOrderAuditList: vi.fn(),
    getShipmentDetails: vi.fn(),
    scheduleOrder: vi.fn(),
    releaseOrder: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
    pollUntil: vi.fn(),
    ...overrides,
  } as unknown as RecoverySterlingClient;
}

// ============================================================================
// Tests: recoverInvoiceGeneration
// ============================================================================

describe('recoverInvoiceGeneration', () => {
  it('succeeds when full 6-step flow completes', async () => {
    const client = mockSterlingClient({
      getOrderDetails: vi.fn().mockResolvedValue({
        success: true,
        value: { OrderNo: 'APT123', Status: '3700', DocumentType: '0001', PaymentStatus: 'INVOICED', OrderLines: { OrderLine: [] } },
      }),
    });

    const result = await recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');

    expect(result.success).toBe(true);
    expect(result.value.recovered).toBe(true);
    expect(result.value.strategy).toBe('fix-invoice-generation');
    expect(result.value.details).toContain('ShipmentKey: SK-001');
    expect(result.value.details).toContain('TaskQKey: TQ-001');
    expect(result.value.details).toContain('processOrderPayments: triggered');
  });

  it('fails gracefully when no shipments found', async () => {
    const client = mockSterlingClient({
      getShipmentListForOrder: vi.fn().mockResolvedValue({ success: true, value: [] }),
    });

    const result = await recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');

    expect(result.success).toBe(true);
    expect(result.value.recovered).toBe(false);
    expect(result.value.details).toContain('No shipments found');
  });

  it('fails gracefully when ShipmentKey missing', async () => {
    const client = mockSterlingClient({
      getShipmentListForOrder: vi.fn().mockResolvedValue({
        success: true,
        value: [{ ShipmentNo: 'SN-001', Status: '3700', SCAC: 'COR', TrackingNo: 'TR-001', ShipNode: 'IT33' }],
      }),
    });

    const result = await recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');

    expect(result.success).toBe(true);
    expect(result.value.recovered).toBe(false);
    expect(result.value.details).toContain('ShipmentKey attribute missing');
  });

  it('fails gracefully when no task found in queue', async () => {
    const client = mockSterlingClient({
      manageTaskQueue: vi.fn().mockResolvedValue({ success: true, value: {} }),
    });

    const result = await recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');

    expect(result.success).toBe(true);
    expect(result.value.recovered).toBe(false);
    expect(result.value.details).toContain('No task found');
  });

  it('propagates API errors from getShipmentListForOrder', async () => {
    const client = mockSterlingClient({
      getShipmentListForOrder: vi.fn().mockResolvedValue({
        success: false,
        error: { message: 'Connection refused', apiName: 'getShipmentListForOrder' },
      }),
    });

    const result = await recoverInvoiceGeneration(client, 'APT123', 'adidas_PT');

    expect(result.success).toBe(false);
    expect(result.error.message).toBe('Connection refused');
  });

  it('uses cross-session pattern when available', async () => {
    const client = mockSterlingClient({
      getOrderDetails: vi.fn().mockResolvedValue({
        success: true,
        value: { OrderNo: 'APT123', Status: '3700', DocumentType: '0001', PaymentStatus: 'INVOICED', OrderLines: { OrderLine: [] } },
      }),
    });

    const mockStore = {
      search: vi.fn().mockResolvedValue([
        { name: 'invoice-delay-fix', content: 'use manageTaskQueue', confidence: 0.9, id: 'p1' },
      ]),
      recordUsage: vi.fn().mockResolvedValue(undefined),
    };

    const result = await recoverInvoiceGeneration(client, 'APT123', 'adidas_PT', mockStore);

    expect(result.success).toBe(true);
    expect(result.value.patternUsed).toBe('invoice-delay-fix');
    expect(mockStore.search).toHaveBeenCalled();
    expect(mockStore.recordUsage).toHaveBeenCalledWith('p1', { success: true });
  });
});

// ============================================================================
// Tests: pollForInvoice
// ============================================================================

describe('pollForInvoice', () => {
  it('returns invoices when found on first attempt', async () => {
    const client = mockSterlingClient();

    const result = await pollForInvoice(client, 'APT123', 3, 10);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toHaveLength(1);
      expect(result.value[0].InvoiceNo).toBe('INV-001');
    }
  });

  it('retries and succeeds when invoice appears on later attempt', async () => {
    const getInvoices = vi.fn()
      .mockResolvedValueOnce({ success: true, value: [] })
      .mockResolvedValueOnce({ success: true, value: [] })
      .mockResolvedValueOnce({
        success: true,
        value: [{ InvoiceNo: 'INV-002', InvoiceType: 'INVOICE', TotalAmount: '99.00' }],
      });

    const client = mockSterlingClient({ getOrderInvoiceList: getInvoices });

    const result = await pollForInvoice(client, 'APT123', 5, 10);

    expect(result.success).toBe(true);
    expect(getInvoices).toHaveBeenCalledTimes(3);
  });

  it('times out when no invoice appears', async () => {
    const client = mockSterlingClient({
      getOrderInvoiceList: vi.fn().mockResolvedValue({ success: true, value: [] }),
    });

    const result = await pollForInvoice(client, 'APT123', 2, 10);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain('Invoice not generated');
    }
  });
});

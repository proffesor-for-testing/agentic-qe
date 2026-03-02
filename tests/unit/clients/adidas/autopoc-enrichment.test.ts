/**
 * Tests for AutoPOC enrichment in the Adidas O2C lifecycle.
 *
 * Covers:
 *   1. Dynamic field population from AutoPOC XAPI responses (step 7 + 8)
 *   2. Graceful degradation when AutoPOC services fail
 *   3. Malformed XML returns → hardcoded defaults used
 *   4. InvoiceStatus_AutoPOC wired in forward-invoice stage
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal mock XAPI client */
function makeMockXapi(handler: (service: string, xml: string) => Promise<{ body: string; status: number; duration: number; retries: number; success: boolean }>) {
  return {
    invoke: vi.fn(),
    invokeOrThrow: vi.fn().mockImplementation(handler),
  };
}

/** Minimal mock Sterling client — order status below ship threshold (3200) */
function makeMockSterling(maxOrderStatus = '3200') {
  return {
    getOrderDetails: vi.fn().mockResolvedValue({
      success: true,
      value: { OrderNo: 'APT99999999', Status: maxOrderStatus, MaxOrderStatus: maxOrderStatus },
    }),
    pollUntil: vi.fn().mockResolvedValue({
      success: true,
      value: [{ InvoiceNo: 'INV-001', InvoiceType: 'INVOICE', TotalAmount: '120.00' }],
    }),
  };
}

/** Build a minimal AdidasTestContext for lifecycle stage tests */
function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 'APT99999999',
    documentType: '0001',
    enterpriseCode: 'adidas_PT',
    shipNode: 'IT33',
    releaseNo: '0001',
    shipments: [],
    originalOrderTotal: '',
    paymentMethod: '',
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// 1. AutoPOC enrichment populates dynamic fields in confirm-shipment
// ---------------------------------------------------------------------------

describe('AutoPOC enrichment in confirm-shipment', () => {
  it('populates dynamic fields from AutoPOC responses into step 7 and step 8 XML', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const confirmShipment = stages.find(s => s.id === 'confirm-shipment')!;

    const xapiCalls: Array<{ service: string; xml: string }> = [];

    const mockXapi = makeMockXapi(async (service, xml) => {
      if (service === 'ReleaseStatus_AutoPOC') {
        return {
          body: '<OrderRelease SCAC="DHL" CarrierServiceCode="EXPRESS" ReleaseNo="0002" ShipNode="DE01"/>',
          status: 200, duration: 50, retries: 0, success: true,
        };
      }
      if (service === 'OrderStatus_AutoPOC') {
        return {
          body: '<OrderLine ItemID="FX1234_700" OrderedQty="3" SellerOrganizationCode="adidas_DE"/>',
          status: 200, duration: 50, retries: 0, success: true,
        };
      }
      if (service === 'ShipmentStatus_AutoPOC') {
        return {
          body: '<Shipment ShipAdviceNo="999888777"/>',
          status: 200, duration: 50, retries: 0, success: true,
        };
      }
      // Step 7 and 8 — capture and succeed
      xapiCalls.push({ service, xml });
      return { body: '<OK/>', status: 200, duration: 100, retries: 0, success: true };
    });

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: makeMockSterling() });
    const result = await confirmShipment.act!(ctx);

    expect(result.success).toBe(true);

    // Step 7: dynamic values injected
    const step7 = xapiCalls.find(c => c.service === 'adidasWE_ProcessSHPConfirmation')!;
    expect(step7).toBeDefined();
    expect(step7.xml).toContain('SCAC="DHL"');
    expect(step7.xml).toContain('CarrierServiceCode="EXPRESS"');
    expect(step7.xml).toContain('ItemID="FX1234_700"');
    expect(step7.xml).toContain('Quantity="3"');

    // Step 8: dynamic ShipAdviceNo + ItemID injected
    const step8 = xapiCalls.find(c => c.service === 'adidas_UpdateSOAcknowledgmentSvc')!;
    expect(step8).toBeDefined();
    expect(step8.xml).toContain('ShipAdviceNo="999888777"');
    expect(step8.xml).toContain('ItemID="FX1234_700"');
    expect(step8.xml).toContain('Quantity="3"');
  });

  it('uses hardcoded defaults when AutoPOC enrichment fails', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const confirmShipment = stages.find(s => s.id === 'confirm-shipment')!;

    const xapiCalls: Array<{ service: string; xml: string }> = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async (service, xml) => {
      if (service.endsWith('_AutoPOC')) {
        throw new Error(`Service ${service} not deployed`);
      }
      xapiCalls.push({ service, xml });
      return { body: '<OK/>', status: 200, duration: 100, retries: 0, success: true };
    });

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: makeMockSterling() });
    const result = await confirmShipment.act!(ctx);

    expect(result.success).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    // Step 7: hardcoded defaults
    const step7 = xapiCalls.find(c => c.service === 'adidasWE_ProcessSHPConfirmation')!;
    expect(step7.xml).toContain('SCAC="COR"');
    expect(step7.xml).toContain('CarrierServiceCode="STRD_INLINE"');
    expect(step7.xml).toContain('ItemID="EE6464_530"');

    // Step 8: hardcoded defaults
    const step8 = xapiCalls.find(c => c.service === 'adidas_UpdateSOAcknowledgmentSvc')!;
    expect(step8.xml).toContain('ShipAdviceNo="320614239"');
    expect(step8.xml).toContain('ItemID="EE6464_530"');

    warnSpy.mockRestore();
  });

  it('handles malformed AutoPOC XML (no matching attributes) → defaults used', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const confirmShipment = stages.find(s => s.id === 'confirm-shipment')!;

    const xapiCalls: Array<{ service: string; xml: string }> = [];

    const mockXapi = makeMockXapi(async (service, xml) => {
      if (service.endsWith('_AutoPOC')) {
        // Return XML without any relevant attributes — regex won't match
        return { body: '<Response Status="OK"/>', status: 200, duration: 50, retries: 0, success: true };
      }
      xapiCalls.push({ service, xml });
      return { body: '<OK/>', status: 200, duration: 100, retries: 0, success: true };
    });

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: makeMockSterling() });
    const result = await confirmShipment.act!(ctx);

    expect(result.success).toBe(true);

    // Step 7: defaults because regex didn't match
    const step7 = xapiCalls.find(c => c.service === 'adidasWE_ProcessSHPConfirmation')!;
    expect(step7.xml).toContain('SCAC="COR"');
    expect(step7.xml).toContain('ItemID="EE6464_530"');

    // Step 8: defaults
    const step8 = xapiCalls.find(c => c.service === 'adidas_UpdateSOAcknowledgmentSvc')!;
    expect(step8.xml).toContain('ShipAdviceNo="320614239"');
    expect(step8.xml).toContain('ItemID="EE6464_530"');
  });
});

// ---------------------------------------------------------------------------
// 2. AutoPOC InvoiceStatus wired in forward-invoice stage
// ---------------------------------------------------------------------------

describe('AutoPOC InvoiceStatus in forward-invoice', () => {
  it('calls InvoiceStatus_AutoPOC after poll succeeds when XAPI is available', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const forwardInvoice = stages.find(s => s.id === 'forward-invoice')!;

    const xapiCalls: string[] = [];

    const mockXapi = makeMockXapi(async (service) => {
      xapiCalls.push(service);
      return { body: '<Invoice Status="01"/>', status: 200, duration: 50, retries: 0, success: true };
    });

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: makeMockSterling() });
    const result = await forwardInvoice.poll!(ctx);

    expect(result.success).toBe(true);
    expect(xapiCalls).toContain('InvoiceStatus_AutoPOC');

    logSpy.mockRestore();
  });

  it('does not call InvoiceStatus_AutoPOC when XAPI is not available', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const forwardInvoice = stages.find(s => s.id === 'forward-invoice')!;

    // No xapiClient on context
    const ctx = makeCtx({ sterlingClient: makeMockSterling() });
    const result = await forwardInvoice.poll!(ctx);

    expect(result.success).toBe(true);
    // No XAPI calls since client is undefined — just verifies no crash
  });

  it('gracefully degrades when InvoiceStatus_AutoPOC fails', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const forwardInvoice = stages.find(s => s.id === 'forward-invoice')!;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async (service) => {
      throw new Error('InvoiceStatus_AutoPOC not deployed');
    });

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: makeMockSterling() });
    const result = await forwardInvoice.poll!(ctx);

    // Stage still succeeds — InvoiceStatus_AutoPOC failure is non-fatal
    expect(result.success).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('InvoiceStatus_AutoPOC failed'));

    warnSpy.mockRestore();
  });
});

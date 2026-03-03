/**
 * Tests for AutoPOC enrichment in the Adidas O2C lifecycle.
 *
 * Covers:
 *   1. Dynamic field population from AutoPOC XAPI responses (step 7 + 8)
 *   2. Graceful degradation when AutoPOC services fail
 *   3. Malformed XML returns → hardcoded defaults used
 *   4. InvoiceStatus_AutoPOC wired in forward-invoice stage
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { setAutoPOCDelay } from '../../../../src/clients/adidas/tc01-lifecycle';

beforeAll(() => { setAutoPOCDelay(0); });

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
    getOrder: vi.fn().mockResolvedValue({
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

  it('stores autoPocForwardInvoiceXml on context after poll enrichment', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const forwardInvoice = stages.find(s => s.id === 'forward-invoice')!;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async () => {
      return {
        body: '<OrderInvoice InvoiceNo="INV-002" InvoiceType="INVOICE" TotalAmount="120.00" DateInvoiced="2026-03-01" AmountCollected="120.00" Status="01"/>',
        status: 200, duration: 50, retries: 0, success: true,
      };
    });

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: makeMockSterling() });
    const result = await forwardInvoice.poll!(ctx);

    expect(result.success).toBe(true);
    // Forward invoice XML stored in dedicated field (not shared with credit note)
    expect(result.data?.autoPocForwardInvoiceXml).toContain('InvoiceNo="INV-002"');
    expect(result.data?.autoPocForwardInvoiceXml).toContain('DateInvoiced="2026-03-01"');

    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 3. AutoPOC poll enrichment stores XML on context for all stages
// ---------------------------------------------------------------------------

describe('AutoPOC poll-phase enrichment', () => {
  it('create-order poll stores autoPocOrderXml', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const createOrder = stages.find(s => s.id === 'create-order')!;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async (service) => {
      if (service === 'OrderStatus_AutoPOC') {
        return {
          body: '<Order OrderNo="APT99999999" PersonInfoShipTo FirstName="sunil" LastName="kumar" City="Lisboa" Country="PT"/>',
          status: 200, duration: 50, retries: 0, success: true,
        };
      }
      return { body: '<OK/>', status: 200, duration: 50, retries: 0, success: true };
    });

    const mockSterling = {
      ...makeMockSterling(),
      pollUntil: vi.fn().mockResolvedValue({
        success: true,
        value: { OrderNo: 'APT99999999', Status: '1100', OrderLines: { OrderLine: [] } },
      }),
    };

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: mockSterling });
    const result = await createOrder.poll!(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.autoPocOrderXml).toContain('OrderNo="APT99999999"');

    logSpy.mockRestore();
  });

  it('wait-for-release poll stores autoPocOrderXml and autoPocReleaseXml', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const waitForRelease = stages.find(s => s.id === 'wait-for-release')!;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async (service) => {
      if (service === 'OrderStatus_AutoPOC') {
        return { body: '<Order ShipNode="IT33"/>', status: 200, duration: 50, retries: 0, success: true };
      }
      if (service === 'ReleaseStatus_AutoPOC') {
        return { body: '<OrderRelease ReleaseNo="0001" ShipNode="IT33" SCAC="COR"/>', status: 200, duration: 50, retries: 0, success: true };
      }
      return { body: '<OK/>', status: 200, duration: 50, retries: 0, success: true };
    });

    const mockSterling = {
      ...makeMockSterling(),
      pollUntil: vi.fn().mockResolvedValue({
        success: true,
        value: { OrderNo: 'APT99999999', Status: '3200', TotalAmount: '120.00', PaymentMethods: { PaymentMethod: [{ PaymentType: 'CREDIT_CARD' }] }, OrderLines: { OrderLine: [{ ShipNode: 'IT33' }] } },
      }),
      getOrderReleaseList: vi.fn().mockResolvedValue({ success: true, value: [{ ReleaseNo: '0001' }] }),
    };

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: mockSterling });
    const result = await waitForRelease.poll!(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.autoPocOrderXml).toContain('ShipNode="IT33"');
    expect(result.data?.autoPocReleaseXml).toContain('ReleaseNo="0001"');

    logSpy.mockRestore();
  });

  it('confirm-shipment poll stores autoPocShipmentXml', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const confirmShipment = stages.find(s => s.id === 'confirm-shipment')!;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async (service) => {
      if (service === 'ShipmentStatus_AutoPOC') {
        return {
          body: '<Shipment ShipmentNo="SHP-001" TrackingNo="TRK-123" SCAC="DHL" Status="1100"/>',
          status: 200, duration: 50, retries: 0, success: true,
        };
      }
      return { body: '<OK/>', status: 200, duration: 50, retries: 0, success: true };
    });

    const mockSterling = {
      ...makeMockSterling('3350'),
      pollUntil: vi.fn().mockResolvedValue({
        success: true,
        value: [{ ShipmentNo: 'SHP-001', TrackingNo: 'TRK-123', SCAC: 'DHL' }],
      }),
    };

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: mockSterling });
    const result = await confirmShipment.poll!(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.autoPocShipmentXml).toContain('TrackingNo="TRK-123"');
    expect(result.data?.autoPocShipmentXml).toContain('SCAC="DHL"');

    logSpy.mockRestore();
  });

  it('delivery poll stores autoPocOrderXml for carrier note checks', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const delivery = stages.find(s => s.id === 'delivery')!;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async (service) => {
      if (service === 'OrderStatus_AutoPOC') {
        return {
          body: '<Order MaxOrderStatus="3700"><Notes><Note ReasonCode="IT"/><Note ReasonCode="DL"/></Notes></Order>',
          status: 200, duration: 50, retries: 0, success: true,
        };
      }
      return { body: '<OK/>', status: 200, duration: 50, retries: 0, success: true };
    });

    const mockSterling = {
      ...makeMockSterling('3700'),
      pollUntil: vi.fn().mockResolvedValue({
        success: true,
        value: { OrderNo: 'APT99999999', MaxOrderStatus: '3700', Notes: { Note: [{ ReasonCode: 'DL' }] } },
      }),
    };

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: mockSterling });
    const result = await delivery.poll!(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.autoPocOrderXml).toContain('ReasonCode="IT"');
    expect(result.data?.autoPocOrderXml).toContain('ReasonCode="DL"');

    logSpy.mockRestore();
  });

  it('poll enrichment is non-fatal — stage succeeds even when AutoPOC fails', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const createOrder = stages.find(s => s.id === 'create-order')!;

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async () => {
      throw new Error('AutoPOC service unavailable');
    });

    const mockSterling = {
      ...makeMockSterling(),
      pollUntil: vi.fn().mockResolvedValue({
        success: true,
        value: { OrderNo: 'APT99999999', Status: '1100', OrderLines: { OrderLine: [] } },
      }),
    };

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: mockSterling });
    const result = await createOrder.poll!(ctx);

    expect(result.success).toBe(true);
    // autoPocOrderXml should NOT be set since AutoPOC failed
    expect(result.data?.autoPocOrderXml).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('return-delivery poll stores autoPocCreditNoteInvoiceXml (normal path)', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const returnDelivery = stages.find(s => s.id === 'return-delivery')!;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async (service) => {
      if (service === 'InvoiceStatus_AutoPOC') {
        return {
          body: '<OrderInvoice InvoiceNo="CN-001" InvoiceType="RETURN" TotalAmount="55.00" DateInvoiced="2026-03-03"/>',
          status: 200, duration: 50, retries: 0, success: true,
        };
      }
      return { body: '<OK/>', status: 200, duration: 50, retries: 0, success: true };
    });

    // maxOrderStatus below 3700 so normal poll path runs (not shortcut)
    const mockSterling = {
      ...makeMockSterling('3200'),
      pollUntil: vi.fn().mockResolvedValue({
        success: true,
        value: { OrderNo: 'APT99999999', MaxOrderStatus: '3700', Notes: { Note: [{ ReasonCode: 'RD' }] } },
      }),
    };

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: mockSterling });
    const result = await returnDelivery.poll!(ctx);

    expect(result.success).toBe(true);
    expect(result.data?.autoPocCreditNoteInvoiceXml).toContain('InvoiceNo="CN-001"');
    expect(result.data?.autoPocCreditNoteInvoiceXml).toContain('InvoiceType="RETURN"');

    logSpy.mockRestore();
  });

  it('return-delivery poll status shortcut stores autoPocCreditNoteInvoiceXml', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const returnDelivery = stages.find(s => s.id === 'return-delivery')!;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async (service) => {
      if (service === 'InvoiceStatus_AutoPOC') {
        return {
          body: '<OrderInvoice InvoiceNo="CN-002" InvoiceType="RETURN" TotalAmount="99.00" DateInvoiced="2026-03-03" AmountCollected="99.00"/>',
          status: 200, duration: 50, retries: 0, success: true,
        };
      }
      return { body: '<OK/>', status: 200, duration: 50, retries: 0, success: true };
    });

    // maxOrderStatus >= 3700 triggers the shortcut path
    const mockSterling = makeMockSterling('3700');

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: mockSterling });
    const result = await returnDelivery.poll!(ctx);

    expect(result.success).toBe(true);
    // Credit note enrichment should fire even on shortcut path
    expect(result.data?.autoPocCreditNoteInvoiceXml).toContain('InvoiceNo="CN-002"');
    expect(result.data?.autoPocCreditNoteInvoiceXml).toContain('TotalAmount="99.00"');
    // Should also have returnDelivered flag from shortcut
    expect(result.data?.returnDelivered).toBe(true);

    logSpy.mockRestore();
  });

  it('forward and credit note invoice XML use separate fields (no clobbering)', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const forwardInvoice = stages.find(s => s.id === 'forward-invoice')!;
    const returnDelivery = stages.find(s => s.id === 'return-delivery')!;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    let callCount = 0;
    const mockXapi = makeMockXapi(async (service) => {
      if (service === 'InvoiceStatus_AutoPOC') {
        callCount++;
        if (callCount === 1) {
          // First call: forward invoice poll
          return {
            body: '<OrderInvoice InvoiceNo="FWD-001" InvoiceType="INVOICE" TotalAmount="200.00"/>',
            status: 200, duration: 50, retries: 0, success: true,
          };
        }
        // Second call: return delivery poll
        return {
          body: '<OrderInvoice InvoiceNo="CN-001" InvoiceType="RETURN" TotalAmount="200.00"/>',
          status: 200, duration: 50, retries: 0, success: true,
        };
      }
      return { body: '<OK/>', status: 200, duration: 50, retries: 0, success: true };
    });

    const mockSterling = {
      ...makeMockSterling('3200'),
      pollUntil: vi.fn()
        .mockResolvedValueOnce({
          success: true,
          value: [{ InvoiceNo: 'FWD-001', InvoiceType: 'INVOICE', TotalAmount: '200.00' }],
        })
        .mockResolvedValueOnce({
          success: true,
          value: { OrderNo: 'APT99999999', MaxOrderStatus: '3700', Notes: { Note: [{ ReasonCode: 'RD' }] } },
        }),
    };

    const ctx = makeCtx({ xapiClient: mockXapi, sterlingClient: mockSterling });

    // Run forward-invoice poll first
    const fwdResult = await forwardInvoice.poll!(ctx);
    expect(fwdResult.success).toBe(true);
    expect(fwdResult.data?.autoPocForwardInvoiceXml).toContain('InvoiceType="INVOICE"');

    // Run return-delivery poll second
    const retResult = await returnDelivery.poll!(ctx);
    expect(retResult.success).toBe(true);
    expect(retResult.data?.autoPocCreditNoteInvoiceXml).toContain('InvoiceType="RETURN"');

    // The two fields are distinct — forward invoice data was NOT overwritten
    expect(fwdResult.data?.autoPocForwardInvoiceXml).toContain('FWD-001');
    expect(retResult.data?.autoPocCreditNoteInvoiceXml).toContain('CN-001');
    // Cross-check: neither field exists on the wrong result
    expect(fwdResult.data?.autoPocCreditNoteInvoiceXml).toBeUndefined();
    expect(retResult.data?.autoPocForwardInvoiceXml).toBeUndefined();

    logSpy.mockRestore();
  });
});

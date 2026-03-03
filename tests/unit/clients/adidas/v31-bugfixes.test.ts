/**
 * Tests for v3.1 bug fixes identified in the brutal honesty review:
 *
 * BUG 1: AutoPOC root elements — ReleaseStatus uses <OrderRelease>, ShipmentStatus uses <Shipment>
 * BUG 2: Step 5.6 backorder detection must BLOCK (return error), not just warn
 * BUG 4-6: Step 1 template includes orderTrackData, CartId, image, ivsReservationID
 * BUG 9: normalizeReleaseNo strips leading zeros for TrackingNo/ShipmentNo
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { setAutoPOCDelay } from '../../../../src/clients/adidas/tc01-lifecycle';

beforeAll(() => { setAutoPOCDelay(0); });

// ---------------------------------------------------------------------------
// BUG 1: AutoPOC root elements match v3.1 doc header
// ---------------------------------------------------------------------------

describe('AutoPOC root elements (BUG 1)', () => {
  it('ReleaseStatus_AutoPOC uses <OrderRelease> root element', async () => {
    const { autoPOC_ReleaseStatus } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT12345678', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = autoPOC_ReleaseStatus(ctx);

    expect(result.xml).toMatch(/^<OrderRelease /);
    expect(result.xml).not.toMatch(/^<Order /);
    expect(result.service).toBe('ReleaseStatus_AutoPOC');
  });

  it('ShipmentStatus_AutoPOC uses <Shipment> root element', async () => {
    const { autoPOC_ShipmentStatus } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT12345678', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = autoPOC_ShipmentStatus(ctx);

    expect(result.xml).toMatch(/^<Shipment /);
    expect(result.xml).not.toMatch(/^<Order /);
    expect(result.service).toBe('ShipmentStatus_AutoPOC');
  });

  it('OrderStatus_AutoPOC still uses <Order> root element', async () => {
    const { autoPOC_OrderStatus } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT12345678', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = autoPOC_OrderStatus(ctx);

    expect(result.xml).toMatch(/^<Order /);
    expect(result.service).toBe('OrderStatus_AutoPOC');
  });

  it('InvoiceStatus_AutoPOC still uses <OrderInvoice> root element', async () => {
    const { autoPOC_InvoiceStatus } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT12345678', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = autoPOC_InvoiceStatus(ctx);

    expect(result.xml).toMatch(/^<OrderInvoice /);
    expect(result.service).toBe('InvoiceStatus_AutoPOC');
  });
});

// ---------------------------------------------------------------------------
// BUG 2: Step 5.6 backorder detection must block
// ---------------------------------------------------------------------------

describe('Step 5.6 backorder blocking (BUG 2)', () => {
  function makeMockXapi(handler: (service: string, xml: string) => Promise<{ body: string; status: number; duration: number; retries: number; success: boolean }>) {
    return {
      invoke: vi.fn().mockImplementation(handler),
      invokeOrThrow: vi.fn().mockImplementation(handler),
    };
  }

  function makeMockSterling(maxOrderStatus = '3200') {
    return {
      getOrder: vi.fn().mockResolvedValue({
        success: true,
        value: { OrderNo: 'APT99999999', Status: maxOrderStatus, MaxOrderStatus: maxOrderStatus },
      }),
      pollUntil: vi.fn().mockResolvedValue({
        success: true,
        value: { OrderNo: 'APT99999999', Status: '3200', MaxOrderStatus: '3200', PaymentMethods: {}, OrderLines: { OrderLine: [{ ShipNode: 'IT33' }] } },
      }),
      getOrderReleaseList: vi.fn().mockResolvedValue({ success: true, value: [{ ReleaseNo: '1' }] }),
    };
  }

  it('returns error and stops when SchedFailureReasonCode is present (backorder)', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const waitForRelease = stages.find(s => s.id === 'wait-for-release')!;

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    let step = 0;
    const mockXapi = makeMockXapi(async (service, xml) => {
      // Step 5.1 getATP — has stock
      if (service === 'getATP') {
        return { body: '<Available Quantity="50"/>', status: 200, duration: 10, retries: 0, success: true };
      }
      // Step 5.3 getInventoryNodeControlList — no lock
      if (service === 'getInventoryNodeControlList') {
        return { body: '<InventoryNodeControl/>', status: 200, duration: 10, retries: 0, success: true };
      }
      // Step 5.5 scheduleOrder — OK
      if (service === 'scheduleOrder') {
        return { body: '<Order Status="Scheduled"/>', status: 200, duration: 10, retries: 0, success: true };
      }
      // Step 5.6 OrderStatus_AutoPOC — BACKORDER with SchedFailureReasonCode
      if (service === 'OrderStatus_AutoPOC') {
        return {
          body: '<Order Status="Backorder"><OrderLines><OrderLine SchedFailureReasonCode="INV_NOT_AVAIL"/></OrderLines></Order>',
          status: 200, duration: 10, retries: 0, success: true,
        };
      }
      // Default
      return { body: '<OK/>', status: 200, duration: 10, retries: 0, success: true };
    });

    const ctx = {
      orderId: 'APT99999999',
      documentType: '0001',
      enterpriseCode: 'adidas_PT',
      shipNode: 'IT33',
      releaseNo: '1',
      itemId: 'EE6464_530',
      unitOfMeasure: 'PIECE',
      shipments: [],
      originalOrderTotal: '',
      paymentMethod: '',
      xapiClient: mockXapi,
      sterlingClient: makeMockSterling(),
    } as any;

    const result = await waitForRelease.act!(ctx);

    // Must return failure — NOT proceed to releaseOrder
    expect(result.success).toBe(false);
    expect(result.error).toContain('BACKORDER');
    expect(result.error).toContain('INV_NOT_AVAIL');

    // releaseOrder should NEVER have been called
    const releaseCall = mockXapi.invokeOrThrow.mock.calls.find(
      ([svc]: [string]) => svc === 'releaseOrder'
    );
    expect(releaseCall).toBeUndefined();

    errorSpy.mockRestore();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('proceeds to releaseOrder when no SchedFailureReasonCode (no backorder)', async () => {
    const { buildTC01Lifecycle } = await import('../../../../src/clients/adidas/tc01-lifecycle');
    const stages = buildTC01Lifecycle();
    const waitForRelease = stages.find(s => s.id === 'wait-for-release')!;

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mockXapi = makeMockXapi(async (service) => {
      if (service === 'getATP') {
        return { body: '<Available Quantity="50"/>', status: 200, duration: 10, retries: 0, success: true };
      }
      if (service === 'getInventoryNodeControlList') {
        return { body: '<InventoryNodeControl/>', status: 200, duration: 10, retries: 0, success: true };
      }
      if (service === 'OrderStatus_AutoPOC') {
        return { body: '<Order Status="Scheduled"/>', status: 200, duration: 10, retries: 0, success: true };
      }
      return { body: '<OK/>', status: 200, duration: 10, retries: 0, success: true };
    });

    const ctx = {
      orderId: 'APT99999999',
      documentType: '0001',
      enterpriseCode: 'adidas_PT',
      shipNode: 'IT33',
      releaseNo: '1',
      itemId: 'EE6464_530',
      unitOfMeasure: 'PIECE',
      shipments: [],
      originalOrderTotal: '',
      paymentMethod: '',
      xapiClient: mockXapi,
      sterlingClient: makeMockSterling(),
    } as any;

    const result = await waitForRelease.act!(ctx);

    // Should succeed — no backorder
    expect(result.success).toBe(true);

    // releaseOrder SHOULD have been called
    const releaseCall = mockXapi.invokeOrThrow.mock.calls.find(
      ([svc]: [string]) => svc === 'releaseOrder'
    );
    expect(releaseCall).toBeDefined();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// BUG 9: normalizeReleaseNo — TrackingNo/ShipmentNo format
// ---------------------------------------------------------------------------

describe('TrackingNo/ShipmentNo format with releaseNo normalization (BUG 9)', () => {
  it('step7_Ship produces TrackingNo with stripped leading zeros', async () => {
    const { step7_Ship } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT93034236', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '0001', todayISO: new Date().toISOString() };
    const result = step7_Ship(ctx);

    // v3.1 doc: TrackingNo = APT93034236TR1 (not TR0001)
    expect(result.xml).toContain('TrackingNo="APT93034236TR1"');
    expect(result.xml).toContain('ShipmentNo="APT93034236-1"');
    expect(result.xml).not.toContain('TR0001');
    expect(result.xml).not.toContain('-0001');
  });

  it('step8_ShipConfirm produces ShipmentNo with stripped leading zeros', async () => {
    const { step8_ShipConfirm } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT93034236', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '0001', todayISO: new Date().toISOString() };
    const result = step8_ShipConfirm(ctx);

    // step8 (SO Acknowledgment) uses ShipmentNo but not TrackingNo in its XML
    expect(result.xml).toContain('ShipmentNo="APT93034236-1"');
    expect(result.xml).not.toContain('-0001');
  });

  it('step10_Deliver produces TrackingNo with stripped leading zeros', async () => {
    const { step10_Deliver } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT93034236', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '0001', todayISO: new Date().toISOString() };
    const result = step10_Deliver(ctx);

    expect(result.xml).toContain('TrackingNo="APT93034236TR1"');
    expect(result.xml).not.toContain('TR0001');
  });

  it('handles releaseNo "1" without change', async () => {
    const { step7_Ship } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT93034236', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = step7_Ship(ctx);

    expect(result.xml).toContain('TrackingNo="APT93034236TR1"');
    expect(result.xml).toContain('ShipmentNo="APT93034236-1"');
  });

  it('handles releaseNo "2" for multi-release orders', async () => {
    const { step7_Ship } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT93034236', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '0002', todayISO: new Date().toISOString() };
    const result = step7_Ship(ctx);

    expect(result.xml).toContain('TrackingNo="APT93034236TR2"');
    expect(result.xml).toContain('ShipmentNo="APT93034236-2"');
  });
});

// ---------------------------------------------------------------------------
// BUGs 4-6: Step 1 template includes missing fields
// ---------------------------------------------------------------------------

describe('Step 1 template v3.1 field completeness (BUGs 4-6)', () => {
  it('includes orderTrackData ADSHeaderDetail', async () => {
    const { step1_CreateOrder } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT12345678', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = step1_CreateOrder(ctx);

    expect(result.xml).toContain('CustomAttributeKey="orderTrackData"');
    expect(result.xml).toContain('CustomAttributeHeader="custom-attributes"');
  });

  it('includes CartId ADSHeaderDetail with UUID', async () => {
    const { step1_CreateOrder } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT12345678', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = step1_CreateOrder(ctx);

    expect(result.xml).toContain('CustomAttributeKey="CartId"');
    // CartId value should be non-empty (UUID or fallback)
    const cartIdMatch = result.xml.match(/CustomAttributeKey="CartId"[^/]*CustomAttributeValue="([^"]*)"/);
    // Try reverse order too (Value before Key)
    const cartIdMatch2 = result.xml.match(/CustomAttributeValue="([^"]*)"[^/]*CustomAttributeKey="CartId"/);
    const cartId = cartIdMatch?.[1] ?? cartIdMatch2?.[1];
    expect(cartId).toBeTruthy();
  });

  it('includes image Reference in OrderLine', async () => {
    const { step1_CreateOrder } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT12345678', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = step1_CreateOrder(ctx);

    expect(result.xml).toContain('Reference Name="image"');
    expect(result.xml).toContain('assets.adidas.com');
  });

  it('includes ivsReservationID Reference in OrderLine', async () => {
    const { step1_CreateOrder } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT12345678', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = step1_CreateOrder(ctx);

    expect(result.xml).toContain('Reference Name="ivsReservationID"');
    // ivsReservationID value should end with +ShipNode
    expect(result.xml).toContain('+IT33');
  });

  it('preserves all previously existing ADSHeaderDetails', async () => {
    const { step1_CreateOrder } = await import('../../../../src/clients/adidas/lifecycle-xml-templates');
    const ctx = { orderNo: 'APT12345678', enterpriseCode: 'adidas_PT', documentType: '0001', shipNode: 'IT33', releaseNo: '1', todayISO: new Date().toISOString() };
    const result = step1_CreateOrder(ctx);

    // Verify key fields that were already there
    const requiredKeys = [
      'agreeForSubscription', 'billingAddressSanity', 'carrierStatus',
      'shippingAddressSanity', 'TierID', 'subOrderNo', 'carrierName',
      'carrierCode', 'carrierServiceCode', 'shippingMethod',
      'deliveryMessage', 'collectionPeriod', 'city', 'node',
      'leadTime', 'taxClassID', 'deliveryPeriod', 'siteId',
      'isCCOrder', 'invoiceNumber', 'orderSource',
      'taxCalculationMissing', 'customerEUCI', 'ChannelNo',
      'paymentMethod', 'paymentMethodName', 'brand',
      'isPostamatDelivery', 'isHypeOrder', 'isTransactionHub',
      'SettlementComplete', 'codiceFiscale', 'ThubOrderDate',
      // New v3.1 additions
      'orderTrackData', 'CartId',
    ];

    for (const key of requiredKeys) {
      expect(result.xml, `Missing ADSHeaderDetail: ${key}`).toContain(`CustomAttributeKey="${key}"`);
    }
  });
});

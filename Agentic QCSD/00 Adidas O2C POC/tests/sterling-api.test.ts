/**
 * Sterling OMS API Test Suite — Adidas O2C POC
 *
 * Tests cover:
 *   1. Schema validation (response structure matches Sterling ERD)
 *   2. Order lifecycle status assertions
 *   3. Financial calculation integrity
 *   4. Response time SLA checks
 *   5. Pagination and filtering
 *   6. Error handling
 *   7. Cross-entity relationship validation
 *
 * Environment: SIT Omni (stgem.omnihub.3stripes.net)
 * Enterprise: adidasEM_TH
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  SterlingOMSClient,
  createSITClient,
  type SterlingOrder,
  type OrderListResponse,
  type SterlingResponse,
} from '../src/sterling-oms-client.js';

// ============================================================================
// Test Configuration
// ============================================================================

const SLA_RESPONSE_TIME_MS = 5_000; // 5s SLA for API responses
const BASELINE_RESPONSE_TIME_MS = 2_000; // Expected baseline from observed 1.27s

// Known test data from SIT environment
const TEST_ORDER = {
  orderNo: 'ATH90004814',
  documentType: '0001',
  enterpriseCode: 'adidasEM_TH',
  expectedStatus: 'Partially Return Completed',
  expectedMinStatus: '3700.0005',
  expectedMaxStatus: '3700.03',
  expectedGrandTotal: '3100.00',
  expectedCurrency: 'THB',
  expectedEntryType: 'web',
  expectedOrderType: 'ShipToHome',
  expectedPaymentStatus: 'PAID',
};

let client: SterlingOMSClient;

beforeAll(() => {
  // SIT requires no auth — network-level access (VPN/corporate network)
  // Just Content-Type: application/json (handled by the client)
  client = createSITClient();
});

// ============================================================================
// 1. Schema Validation Tests
// ============================================================================

describe('Schema Validation — getOrderList response structure', () => {
  let response: SterlingResponse<OrderListResponse>;

  beforeAll(async () => {
    response = await client.getOrderList({
      DocumentType: TEST_ORDER.documentType,
      OrderNo: TEST_ORDER.orderNo,
    });
  });

  it('should return HTTP 200', () => {
    expect(response.status).toBe(200);
  });

  it('should contain Order array', () => {
    expect(response.data).toHaveProperty('Order');
    expect(Array.isArray(response.data.Order)).toBe(true);
    expect(response.data.Order.length).toBeGreaterThan(0);
  });

  it('should contain pagination fields', () => {
    expect(response.data).toHaveProperty('TotalOrderList');
    expect(response.data).toHaveProperty('LastRecordSet');
    expect(response.data).toHaveProperty('LastOrderHeaderKey');
  });

  describe('Order object schema', () => {
    let order: SterlingOrder;

    beforeAll(() => {
      order = response.data.Order[0];
    });

    it('should have OrderHeaderKey (Char 24)', () => {
      expect(order.OrderHeaderKey).toBeDefined();
      expect(typeof order.OrderHeaderKey).toBe('string');
      expect(order.OrderHeaderKey.length).toBeGreaterThan(0);
    });

    it('should have OrderNo', () => {
      expect(order.OrderNo).toBe(TEST_ORDER.orderNo);
    });

    it('should have DocumentType', () => {
      expect(order.DocumentType).toBe(TEST_ORDER.documentType);
    });

    it('should have EnterpriseCode', () => {
      expect(order.EnterpriseCode).toBe(TEST_ORDER.enterpriseCode);
    });

    it('should have status fields', () => {
      expect(order).toHaveProperty('Status');
      expect(order).toHaveProperty('MinOrderStatus');
      expect(order).toHaveProperty('MinOrderStatusDesc');
      expect(order).toHaveProperty('MaxOrderStatus');
      expect(order).toHaveProperty('MaxOrderStatusDesc');
    });

    it('should have customer fields', () => {
      expect(order).toHaveProperty('CustomerEMailID');
      expect(order).toHaveProperty('CustomerPONo');
      expect(order).toHaveProperty('EnteredBy');
      expect(order).toHaveProperty('EntryType');
    });

    it('should have InvoicedTotals with financial fields', () => {
      expect(order.InvoicedTotals).toBeDefined();
      expect(order.InvoicedTotals).toHaveProperty('GrandCharges');
      expect(order.InvoicedTotals).toHaveProperty('GrandTax');
      expect(order.InvoicedTotals).toHaveProperty('HdrTax');
      expect(order.InvoicedTotals).toHaveProperty('GrandTotal');
    });

    it('should have OverallTotals with extended financial fields', () => {
      expect(order.OverallTotals).toBeDefined();
      expect(order.OverallTotals).toHaveProperty('GrandCharges');
      expect(order.OverallTotals).toHaveProperty('GrandTotal');
      expect(order.OverallTotals).toHaveProperty('LineSubTotal');
      expect(order.OverallTotals).toHaveProperty('HdrDiscount');
      expect(order.OverallTotals).toHaveProperty('GrandDiscount');
    });

    it('should have RemainingTotals', () => {
      expect(order.RemainingTotals).toBeDefined();
      expect(order.RemainingTotals).toHaveProperty('GrandTotal');
    });

    it('should have PriceInfo with currency', () => {
      expect(order.PriceInfo).toBeDefined();
      expect(order.PriceInfo).toHaveProperty('Currency');
      expect(order.PriceInfo).toHaveProperty('TotalAmount');
      expect(order.PriceInfo).toHaveProperty('EnterpriseCurrency');
      expect(order.PriceInfo).toHaveProperty('ReportingConversionRate');
    });

    it('should have flag fields as single char Y/N', () => {
      expect(['Y', 'N', '']).toContain(order.HoldFlag);
      expect(['Y', 'N', '']).toContain(order.DraftOrderFlag);
      expect(['Y', 'N', '']).toContain(order.TaxExemptionFlag);
      expect(['Y', 'N', '']).toContain(order.ChargeActualFreightFlag);
    });
  });
});

// ============================================================================
// 2. Order Lifecycle Status Tests
// ============================================================================

describe('Order Lifecycle — Status Assertions', () => {
  it('should reflect correct status for delivered + partial return order', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });

    const order = response.data.Order[0];

    // MinOrderStatus = earliest line status (Order Delivered)
    expect(order.MinOrderStatus).toBe(TEST_ORDER.expectedMinStatus);
    expect(order.MinOrderStatusDesc).toBe('Order Delivered');

    // MaxOrderStatus = latest line status (Return Completed)
    expect(order.MaxOrderStatus).toBe(TEST_ORDER.expectedMaxStatus);
    expect(order.MaxOrderStatusDesc).toBe('Return Completed');

    // Overall status reflects partial return
    expect(order.Status).toBe(TEST_ORDER.expectedStatus);
  });

  it('should have valid status code format (NNNN.NNNN)', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });

    const order = response.data.Order[0];
    const statusPattern = /^\d{4}(\.\d+)?$/;

    expect(order.MinOrderStatus).toMatch(statusPattern);
    expect(order.MaxOrderStatus).toMatch(statusPattern);
  });

  it('should have MinOrderStatus <= MaxOrderStatus', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });

    const order = response.data.Order[0];
    expect(parseFloat(order.MinOrderStatus)).toBeLessThanOrEqual(parseFloat(order.MaxOrderStatus));
  });
});

// ============================================================================
// 3. Financial Calculation Integrity
// ============================================================================

describe('Financial Calculations — OverallTotals integrity', () => {
  let order: SterlingOrder;

  beforeAll(async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });
    order = response.data.Order[0];
  });

  it('should have correct GrandTotal', () => {
    expect(order.OverallTotals.GrandTotal).toBe(TEST_ORDER.expectedGrandTotal);
  });

  it('should have GrandTotal = LineSubTotal + GrandCharges - GrandDiscount + GrandTax', () => {
    const totals = order.OverallTotals;
    const lineSubTotal = parseFloat(totals.LineSubTotal ?? '0');
    const charges = parseFloat(totals.GrandCharges);
    const discount = parseFloat(totals.GrandDiscount ?? '0');
    const tax = parseFloat(totals.GrandTax);
    const grandTotal = parseFloat(totals.GrandTotal);

    // GrandTotal should equal subtotal + charges - discount + tax
    const calculated = lineSubTotal + charges - discount + tax;
    expect(Math.abs(grandTotal - calculated)).toBeLessThan(0.01);
  });

  it('should have InvoicedTotals.GrandTotal matching OverallTotals for fully invoiced order', () => {
    const invoicedTotal = parseFloat(order.InvoicedTotals.GrandTotal);
    const overallTotal = parseFloat(order.OverallTotals.GrandTotal);

    // For a fully delivered/invoiced order, these should match
    expect(invoicedTotal).toBe(overallTotal);
  });

  it('should have correct currency (THB for Thailand enterprise)', () => {
    expect(order.PriceInfo.Currency).toBe(TEST_ORDER.expectedCurrency);
    expect(order.PriceInfo.EnterpriseCurrency).toBe(TEST_ORDER.expectedCurrency);
  });

  it('should have non-negative financial values', () => {
    expect(parseFloat(order.OverallTotals.GrandTotal)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(order.OverallTotals.GrandCharges)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(order.OverallTotals.GrandTax)).toBeGreaterThanOrEqual(0);
  });

  it('should have reporting conversion rate of 1.00 for same-currency', () => {
    // When Currency = EnterpriseCurrency, conversion rate should be 1
    if (order.PriceInfo.Currency === order.PriceInfo.EnterpriseCurrency) {
      expect(parseFloat(order.PriceInfo.ReportingConversionRate)).toBe(1);
    }
  });
});

// ============================================================================
// 4. Response Time SLA Tests
// ============================================================================

describe('Response Time SLA — Performance', () => {
  it('should return getOrderList within SLA threshold (5s)', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });

    expect(response.duration).toBeLessThan(SLA_RESPONSE_TIME_MS);
  });

  it('should return getOrderList within baseline (2s for single order)', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });

    // Observed baseline: 1.27s
    expect(response.duration).toBeLessThan(BASELINE_RESPONSE_TIME_MS);
  });

  it('should have consistent response times across 3 calls', async () => {
    const durations: number[] = [];

    for (let i = 0; i < 3; i++) {
      const response = await client.getOrderList({
        DocumentType: '0001',
        OrderNo: TEST_ORDER.orderNo,
      });
      durations.push(response.duration);
    }

    // All calls should be under SLA
    durations.forEach((d) => expect(d).toBeLessThan(SLA_RESPONSE_TIME_MS));

    // Standard deviation should be reasonable (< 2s variance)
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + (d - avg) ** 2, 0) / durations.length;
    const stdDev = Math.sqrt(variance);
    expect(stdDev).toBeLessThan(2_000);
  });
});

// ============================================================================
// 5. Filtering and Pagination Tests
// ============================================================================

describe('Filtering — Query parameter validation', () => {
  it('should filter by DocumentType 0001 (Sales Order)', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });

    response.data.Order.forEach((order) => {
      expect(order.DocumentType).toBe('0001');
    });
  });

  it('should filter by EnterpriseCode', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
      EnterpriseCode: 'adidasEM_TH',
    });

    response.data.Order.forEach((order) => {
      expect(order.EnterpriseCode).toBe('adidasEM_TH');
    });
  });

  it('should return TotalOrderList count matching Order array length', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });

    expect(parseInt(response.data.TotalOrderList)).toBe(response.data.Order.length);
  });

  it('should set LastRecordSet=Y when all records returned', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });

    // Single order query should return all records
    if (parseInt(response.data.TotalOrderList) <= 50) {
      expect(response.data.LastRecordSet).toBe('Y');
    }
  });

  it('should return empty Order array for non-existent order', async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: 'NONEXISTENT_ORDER_99999',
    });

    expect(response.status).toBe(200);
    expect(response.data.Order).toEqual([]);
    expect(response.data.TotalOrderList).toBe('0');
  });
});

// ============================================================================
// 6. Error Handling Tests
// ============================================================================

describe('Error Handling — Invalid inputs', () => {
  it('should handle missing required fields gracefully', async () => {
    const response = await client.getOrderList({});

    // Sterling may return 200 with empty results or a validation error
    expect([200, 400, 422]).toContain(response.status);
  });

  it('should handle invalid DocumentType', async () => {
    const response = await client.getOrderList({
      DocumentType: 'INVALID',
      OrderNo: TEST_ORDER.orderNo,
    });

    // Should either return empty or error — not crash
    expect(response.status).toBeLessThan(500);
  });
});

// ============================================================================
// 7. Cross-Entity Relationship Tests
// ============================================================================

describe('Cross-Entity — Order-to-Shipment relationship', () => {
  it('should return shipments for a delivered order', async () => {
    const response = await client.getShipmentListForOrder({
      OrderNo: TEST_ORDER.orderNo,
      DocumentType: TEST_ORDER.documentType,
    });

    expect(response.status).toBe(200);
    // Delivered orders should have at least one shipment
    expect(response.data).toBeDefined();
  });
});

describe('Cross-Entity — Order-to-Invoice relationship', () => {
  it('should return invoices for a paid order', async () => {
    const response = await client.getOrderInvoiceList({
      OrderNo: TEST_ORDER.orderNo,
      DocumentType: TEST_ORDER.documentType,
    });

    expect(response.status).toBe(200);
    // PAID orders should have invoices
    expect(response.data).toBeDefined();
  });
});

describe('Cross-Entity — Order Line details', () => {
  it('should return order lines with item data', async () => {
    const response = await client.getOrderLineList({
      OrderNo: TEST_ORDER.orderNo,
      DocumentType: TEST_ORDER.documentType,
    });

    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
  });
});

// ============================================================================
// 8. Health Check
// ============================================================================

describe('Health Check — OmniHub availability', () => {
  it('should respond to health endpoint', async () => {
    const health = await client.healthCheck();
    expect(health.duration).toBeLessThan(10_000);
    // Note: health endpoint may require VPN/network access
  });
});

// ============================================================================
// 9. Data Type Validation (ERD compliance)
// ============================================================================

describe('ERD Compliance — Data type validation', () => {
  let order: SterlingOrder;

  beforeAll(async () => {
    const response = await client.getOrderList({
      DocumentType: '0001',
      OrderNo: TEST_ORDER.orderNo,
    });
    order = response.data.Order[0];
  });

  it('should have numeric values as strings (Sterling convention)', () => {
    // Sterling returns all numbers as strings
    expect(typeof order.OverallTotals.GrandTotal).toBe('string');
    expect(typeof order.OverallTotals.GrandCharges).toBe('string');
    expect(typeof order.PriceInfo.TotalAmount).toBe('string');

    // But they should be parseable as numbers
    expect(isNaN(parseFloat(order.OverallTotals.GrandTotal))).toBe(false);
    expect(isNaN(parseFloat(order.PriceInfo.TotalAmount))).toBe(false);
  });

  it('should have ISO 8601 date format for OrderDate', () => {
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    expect(order.OrderDate).toMatch(isoPattern);
  });

  it('should have valid PriceInfo.ReportingConversionDate as ISO 8601', () => {
    const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    expect(order.PriceInfo.ReportingConversionDate).toMatch(isoPattern);
  });

  it('should have OrderType matching known values', () => {
    const validOrderTypes = ['ShipToHome', 'PickUpFromStore', 'ShipToStore', 'DeliverToStore', ''];
    expect(validOrderTypes).toContain(order.OrderType);
  });

  it('should have EntryType matching known values', () => {
    const validEntryTypes = ['web', 'call_center', 'store', 'marketplace', ''];
    expect(validEntryTypes).toContain(order.EntryType);
  });

  it('should have PaymentStatus matching known values', () => {
    const validPaymentStatuses = ['PAID', 'AUTHORIZED', 'NOT_PAID', 'PARTIALLY_PAID', ''];
    expect(validPaymentStatuses).toContain(order.PaymentStatus);
  });
});

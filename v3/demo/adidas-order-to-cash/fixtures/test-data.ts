/**
 * Test Data Fixtures for Adidas Order-to-Cash E2E Demo
 *
 * Provides:
 * - Static product catalog (Adidas-specific)
 * - Dynamic customer generation via TestDataGeneratorService (v3)
 * - Static customer fallbacks
 * - Order payload builder
 * - Expected response fixtures for each system
 */

import { TestDataGeneratorService } from '../../../src/domains/test-generation/services/test-data-generator.js';

// ============================================================================
// TestDataGeneratorService (Agentic QE v3)
// ============================================================================

const dataGenerator = new TestDataGeneratorService();

/** Adidas customer schema — used by TestDataGeneratorService */
const ADIDAS_CUSTOMER_SCHEMA: Record<string, unknown> = {
  name: 'fullname',
  email: 'email',
  address: 'address',
  phone: 'phone',
};

/**
 * Generate a realistic Adidas customer using TestDataGeneratorService.
 * Uses German locale by default for Adidas HQ realism.
 */
export async function generateAdidasCustomer(locale = 'de'): Promise<{
  name: string;
  email: string;
  address: string;
  phone: string;
}> {
  const result = await dataGenerator.generateTestData({
    schema: ADIDAS_CUSTOMER_SCHEMA,
    count: 1,
    locale,
  });

  const record = result.records[0] as Record<string, unknown>;
  const addr = record.address as Record<string, string> | string;

  // Address can be object or string depending on faker output
  const addressStr = typeof addr === 'string'
    ? addr
    : `${addr.street}, ${addr.zipCode} ${addr.city}`;

  return {
    name: String(record.name),
    email: String(record.email),
    address: addressStr,
    phone: String(record.phone),
  };
}

// ============================================================================
// Products (Static Catalog — Adidas-specific, not generated)
// ============================================================================

export const PRODUCTS = [
  { id: 'ULTRA-23', name: 'Ultraboost 23', price: 180, currency: 'EUR', category: 'Running' },
  { id: 'JERSEY-H', name: 'Home Jersey 2025', price: 90, currency: 'EUR', category: 'Football' },
  { id: 'BAG-DFL', name: 'Duffle Bag', price: 65, currency: 'EUR', category: 'Accessories' },
] as const;

// ============================================================================
// Customer Fixtures (static fallbacks — use generateAdidasCustomer() for dynamic)
// ============================================================================

export const CUSTOMERS = {
  default: {
    name: 'Max Mustermann',
    email: 'max.mustermann@example.de',
    address: 'Adi-Dassler-Str. 1, 91074 Herzogenaurach',
    phone: '+49 9132 84-0',
  },
  premium: {
    name: 'Anna Schmidt',
    email: 'anna.schmidt@enterprise.de',
    address: 'Leopoldstr. 28, 80802 Munich',
    phone: '+49 89 1234567',
  },
  international: {
    name: 'John Smith',
    email: 'john.smith@example.com',
    address: '1600 Pennsylvania Ave, Washington DC 20500',
    phone: '+1 202 456 1111',
  },
} as const;

// ============================================================================
// Order Builder
// ============================================================================

export interface OrderPayload {
  customer: { name: string; email: string; address: string };
  items: Array<{ id: string; productId: string; name: string; price: number; quantity: number }>;
  totalAmount: number;
}

export function buildOrder(
  customerKey: keyof typeof CUSTOMERS = 'default',
  productIds: string[] = ['ULTRA-23'],
  quantities: number[] = [1],
): OrderPayload {
  const customer = CUSTOMERS[customerKey];
  const items = productIds.map((id, i) => {
    const product = PRODUCTS.find(p => p.id === id);
    if (!product) throw new Error(`Unknown product: ${id}`);
    const quantity = quantities[i] || 1;
    return { id: product.id, productId: product.id, name: product.name, price: product.price, quantity };
  });
  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    customer: { name: customer.name, email: customer.email, address: customer.address },
    items,
    totalAmount,
  };
}

/** Build the "full cart" order — one of each product */
export function buildFullCartOrder(customerKey: keyof typeof CUSTOMERS = 'default'): OrderPayload {
  return buildOrder(customerKey, ['ULTRA-23', 'JERSEY-H', 'BAG-DFL'], [1, 1, 1]);
}

/**
 * Build an order with dynamically generated customer via TestDataGeneratorService.
 * Products remain from the static Adidas catalog.
 */
export async function buildGeneratedOrder(
  productIds: string[] = ['ULTRA-23', 'JERSEY-H', 'BAG-DFL'],
  quantities: number[] = [1, 1, 1],
  locale = 'de',
): Promise<OrderPayload> {
  const customer = await generateAdidasCustomer(locale);
  const items = productIds.map((id, i) => {
    const product = PRODUCTS.find(p => p.id === id);
    if (!product) throw new Error(`Unknown product: ${id}`);
    const quantity = quantities[i] || 1;
    return { id: product.id, productId: product.id, name: product.name, price: product.price, quantity };
  });
  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    customer: { name: customer.name, email: customer.email, address: customer.address },
    items,
    totalAmount,
  };
}

// ============================================================================
// Expected Response Fixtures
// ============================================================================

/** Expected shape from IIB ESB /iib/transform */
export const EXPECTED_IIB_RESPONSE = {
  esbHeader: {
    sourceSystem: 'OMNI',
    targetSystem: 'SAP-S4',
    protocol: 'REST-to-OData',
    version: '1.0',
  },
  payload: {
    sapClient: '100',
    salesOrg: '1000',
    distributionChannel: '10',
    division: '00',
    orderType: 'ZOR',
  },
};

/** Expected shape from WMS /wms/allocate */
export const EXPECTED_WMS_RESPONSE = {
  warehouse: 'EU-CENTRAL-1',
  allocations: [
    { sku: 'ULTRA-23', allocated: true, warehouse: 'EU-CENTRAL-1', zone: 'A3' },
  ],
};

/** Expected shape from SAP S/4 /sap/opu/odata/ORDER_SRV/OrderSet */
export const EXPECTED_SAP_RESPONSE = {
  d: {
    Currency: 'EUR',
    Status: 'Created',
    SalesOrg: '1000',
    DistChannel: '10',
    Division: '00',
  },
};

/** Expected shape from WMS IDoc /wms/idoc/generate */
export const EXPECTED_WMS_IDOC_RESPONSE = {
  idocType: 'WMMBID01',
  messageType: 'WMMBID',
  status: 'generated',
};

/** Expected shape from SAP IDoc /sap/idoc/inbound */
export const EXPECTED_SAP_IDOC_RESPONSE = {
  statusCode: '03',
  status: 'posted',
};

/** Expected shape from Kibana /kibana/api/ingest */
export const EXPECTED_KIBANA_RESPONSE = {
  indexed: true,
};

// ============================================================================
// Test Output Scenarios (for infra healing demo)
// ============================================================================

export const TEST_OUTPUT_SCENARIOS = {
  /** All 8 systems healthy — tests pass */
  allHealthy: [
    'PASS tests/order-to-cash.e2e.ts',
    '  Product grid displays 3 items',
    '  Add to cart works',
    '  Checkout flow completes',
    '  Order pipeline shows all 8 systems green',
    '  IDoc WMMBID01 generated and posted to SAP',
    '  Broker audit trail: 5 messages published',
    'Tests: 1 passed, 1 total',
    'Time: 8.2s',
  ].join('\n'),

  /** SAP S/4 down — test fails at SAP step */
  sapDown: [
    'FAIL tests/order-to-cash.e2e.ts',
    '  Product grid displays 3 items ... PASSED',
    '  Add to cart works ... PASSED',
    '  Checkout flow completes:',
    '    Error: connect ECONNREFUSED 127.0.0.1:3006',
    '    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141:16)',
    '  Expected pipeline step "SAP S/4" to be "success" but got "failed"',
    'Tests: 1 failed, 1 total',
    'Time: 12.4s',
  ].join('\n'),

  /** WMS down — test fails at inventory allocation */
  wmsDown: [
    'FAIL tests/order-to-cash.e2e.ts',
    '  Checkout flow:',
    '    Error: connect ECONNREFUSED 127.0.0.1:3005',
    '    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141:16)',
    '  Expected pipeline step "WMS" to be "success" but got "failed"',
    'Tests: 1 failed, 1 total',
  ].join('\n'),

  /** IIB ESB down — test fails at message transformation */
  iibDown: [
    'FAIL tests/order-to-cash.e2e.ts',
    '  Checkout flow:',
    '    Error: connect ECONNREFUSED 127.0.0.1:3004',
    '    at TCPConnectWrap.afterConnect [as oncomplete] (net.js:1141:16)',
    '  Expected pipeline step "IIB ESB" to be "success" but got "failed"',
    'Tests: 1 failed, 1 total',
  ].join('\n'),

  /** Multiple services down */
  multiDown: [
    'FAIL tests/order-to-cash.e2e.ts',
    '  Error: connect ECONNREFUSED 127.0.0.1:3005',
    '  Error: connect ECONNREFUSED 127.0.0.1:3006',
    '  Error: 503 Service Unavailable from wms',
    'Tests: 1 failed, 1 total',
  ].join('\n'),

  /** Message broker down — orders still work but no audit trail */
  brokerDown: [
    'PASS tests/order-to-cash.e2e.ts',
    '  Checkout flow completes',
    '  Warning: connect ECONNREFUSED 127.0.0.1:3008',
    '  Broker audit trail: unavailable (non-blocking)',
    'Tests: 1 passed, 1 total',
  ].join('\n'),

  /** IDoc rejection — SAP returns status 51 */
  idocRejected: [
    'FAIL tests/order-to-cash.e2e.ts',
    '  IDoc WMMBID01 submitted to SAP',
    '  IDoc status 51: application error — Missing E1MBXYI item segments',
    '  Expected IDoc statusCode "03" but got "51"',
    'Tests: 1 failed, 1 total',
  ].join('\n'),

  /** SOAP fault — invalid order via SOAP endpoint */
  soapFault: [
    'FAIL tests/order-to-cash.e2e.ts',
    '  SOAP ValidateOrder returned fault:',
    '    <soap:Fault><faultcode>soap:Client</faultcode>',
    '    <faultstring>Missing &lt;customer&gt; element</faultstring>',
    '  Expected SOAP response <valid>true</valid> but got fault',
    'Tests: 1 failed, 1 total',
  ].join('\n'),
};

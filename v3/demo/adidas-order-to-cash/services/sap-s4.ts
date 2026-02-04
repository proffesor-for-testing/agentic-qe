/**
 * SAP S/4HANA Mock — OData-style sales order API
 * Port: 3006
 */

import { BaseMockService } from './base-mock-service.js';

let orderCounter = 1000;

export function createSapS4Service(): BaseMockService {
  const service = new BaseMockService({ name: 'sap-s4', port: 3006 });
  const orders: Array<Record<string, unknown>> = [];

  // SAP ICM ping (used by recovery playbook health check)
  service.route('GET', '/sap/bc/ping', (_req, res) => {
    service['json'](res, { status: 'ok', system: 'S4H', client: '100' });
  });

  // OData-style: Create Sales Order
  service.route('POST', '/sap/opu/odata/ORDER_SRV/OrderSet', (_req, res, body) => {
    const order = body as Record<string, unknown> | null;
    const orderId = `SO-${++orderCounter}`;
    const sapOrder = {
      d: {
        OrderID: orderId,
        CustomerID: order?.customerId || 'C000001',
        OrderDate: `/Date(${Date.now()})/`,
        NetAmount: order?.totalAmount || '0.00',
        Currency: 'EUR',
        Status: 'Created',
        SalesOrg: '1000',
        DistChannel: '10',
        Division: '00',
        items: order?.items || [],
      },
    };
    orders.push(sapOrder.d);
    console.log(`  [SAP] Sales order ${orderId} created`);
    service['json'](res, sapOrder, 201);
  });

  // OData-style: Get Sales Order
  service.route('GET', '/sap/opu/odata/ORDER_SRV/OrderSet', (_req, res) => {
    service['json'](res, { d: { results: orders } });
  });

  // ATP Check (Available-to-Promise)
  service.route('POST', '/sap/atp/check', (_req, res, body) => {
    const req = body as Record<string, unknown> | null;
    service['json'](res, {
      materialId: req?.materialId || 'MAT-001',
      available: true,
      quantity: req?.quantity || 1,
      plant: '1000',
      storageLocation: '0001',
    });
  });

  return service;
}

// Run standalone
if (process.argv[1]?.endsWith('sap-s4.ts') || process.argv[1]?.endsWith('sap-s4.js')) {
  createSapS4Service().start();
}

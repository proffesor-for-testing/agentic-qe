/**
 * WMS Mock — Warehouse Management System for inventory allocation
 * Port: 3005
 */

import { BaseMockService } from './base-mock-service.js';

const inventory: Record<string, number> = {
  'ULTRA-23': 150,
  'JERSEY-H': 300,
  'BAG-DFL': 500,
};

export function createWmsService(): BaseMockService {
  const service = new BaseMockService({ name: 'wms', port: 3005 });

  // Allocate inventory
  service.route('POST', '/wms/allocate', (_req, res, body) => {
    const order = body as Record<string, unknown> | null;
    const items = (order?.items || order?.payload?.items || []) as Array<{ id?: string; productId?: string; quantity?: number }>;

    const allocations = items.map(item => {
      const sku = item.id || item.productId || 'UNKNOWN';
      const qty = item.quantity || 1;
      const available = inventory[sku] || 0;
      const allocated = available >= qty;

      if (allocated && inventory[sku] !== undefined) {
        inventory[sku] -= qty;
      }

      return {
        sku,
        requestedQty: qty,
        allocatedQty: allocated ? qty : 0,
        remainingStock: inventory[sku] || 0,
        warehouse: 'EU-CENTRAL-1',
        zone: 'A3',
        allocated,
      };
    });

    const allAllocated = allocations.every(a => a.allocated);

    console.log(`  [WMS] Allocation: ${allAllocated ? 'FULL' : 'PARTIAL'} (${allocations.length} items)`);

    service['json'](res, {
      allocationId: `ALLOC-${Date.now().toString(36)}`,
      orderId: order?.orderId,
      status: allAllocated ? 'ALLOCATED' : 'PARTIAL',
      warehouse: 'EU-CENTRAL-1',
      allocations,
      estimatedShipDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
    });
  });

  // Ship order
  service.route('POST', '/wms/ship', (_req, res, body) => {
    const order = body as Record<string, unknown> | null;
    service['json'](res, {
      shipmentId: `SHIP-${Date.now().toString(36)}`,
      orderId: order?.orderId,
      carrier: 'DHL',
      trackingNumber: `DE${Math.random().toString().slice(2, 14)}`,
      status: 'SHIPPED',
      shippedAt: new Date().toISOString(),
    });
  });

  return service;
}

if (process.argv[1]?.endsWith('wms.ts') || process.argv[1]?.endsWith('wms.js')) {
  createWmsService().start();
}

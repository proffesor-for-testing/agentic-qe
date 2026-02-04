/**
 * WMS Mock — Warehouse Management System with IDoc generation
 * Port: 3005
 *
 * Endpoints:
 *   POST /wms/allocate         — Allocate inventory for order
 *   POST /wms/ship             — Generate shipment
 *   POST /wms/idoc/generate    — Generate SAP IDoc from allocation
 *   GET  /wms/idoc/history     — View generated IDocs
 */

import { BaseMockService } from './base-mock-service.js';

const inventory: Record<string, number> = {
  'ULTRA-23': 150,
  'JERSEY-H': 300,
  'BAG-DFL': 500,
};

let idocCounter = 4000000000;
const idocHistory: Array<Record<string, unknown>> = [];

// ── IDoc Helpers ─────────────────────────────────────────────────────────

function generateIDocNumber(): string {
  return String(++idocCounter);
}

function formatSapDate(date: Date): string {
  // SAP DATS format: YYYYMMDD
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

function formatSapTime(date: Date): string {
  // SAP TIMS format: HHMMSS
  return date.toISOString().slice(11, 19).replace(/:/g, '');
}

/**
 * Generate a WMMBID01 IDoc (Goods Movement for Warehouse)
 * This is a simplified but structurally accurate IDoc flat-file format.
 */
function generateWmmbid01(allocation: Record<string, unknown>): string {
  const now = new Date();
  const idocNumber = generateIDocNumber();
  const lines: string[] = [];

  // EDI_DC40 — Control Record (all segment types padded to 8 chars)
  lines.push([
    padRight('EDI_DC40', 8),                 // Record type (8 chars)
    padRight(idocNumber, 16),                // IDoc number
    padRight('WMMBID01', 30),                // IDoc type
    padRight('WMMBID', 8),                   // Message type
    padRight('LS', 2),                       // Direction (1=outbound, 2=inbound)
    padRight('WMS_SENDER', 10),              // Sender port
    padRight('LS', 2),                       // Sender partner type
    padRight('ADIWMS001', 10),               // Sender partner number
    padRight('SAP_RECV', 10),                // Receiver port
    padRight('LS', 2),                       // Receiver partner type
    padRight('ADIS4H001', 10),               // Receiver partner number
    formatSapDate(now),                      // Created date
    formatSapTime(now),                      // Created time
  ].join(''));

  // E1MBXYJ — Header segment
  const orderId = String(allocation.orderId || 'UNKNOWN');
  const allocationId = String(allocation.allocationId || 'UNKNOWN');
  lines.push([
    padRight('E1MBXYJ', 8),
    padRight(orderId, 35),                   // Reference document
    padRight(allocationId, 16),              // Allocation reference
    padRight('601', 3),                      // Movement type (601 = goods issue delivery)
    padRight(formatSapDate(now), 8),         // Posting date
    padRight('1000', 4),                     // Plant
    padRight('0001', 4),                     // Storage location
  ].join(''));

  // E1MBXYI — Item segments (one per allocated item)
  const allocations = (allocation.allocations || []) as Array<Record<string, unknown>>;
  let itemNo = 0;
  for (const item of allocations) {
    if (!item.allocated) continue;
    itemNo += 10;
    lines.push([
      padRight('E1MBXYI', 8),
      padRight(String(itemNo).padStart(6, '0'), 6),    // Item number
      padRight(String(item.sku || ''), 18),              // Material number
      padRight(String(item.allocatedQty || 0), 13),      // Quantity
      padRight('EA', 3),                                 // Unit of measure
      padRight(String(item.warehouse || 'EU-CENTRAL-1'), 10), // Warehouse
      padRight(String(item.zone || 'A3'), 6),            // Storage zone
    ].join(''));
  }

  // E1MBXYK — Status segment
  lines.push([
    padRight('E1MBXYK', 8),
    padRight('03', 2),                       // Status code (03 = posted)
    padRight(formatSapDate(now), 8),         // Status date
    padRight(formatSapTime(now), 6),         // Status time
    padRight('Goods movement posted', 40),   // Status text
  ].join(''));

  const idocContent = lines.join('\n');
  const idocRecord = {
    idocNumber,
    idocType: 'WMMBID01',
    messageType: 'WMMBID',
    direction: 'outbound',
    senderPartner: 'ADIWMS001',
    receiverPartner: 'ADIS4H001',
    createdAt: now.toISOString(),
    orderId,
    allocationId,
    itemCount: itemNo / 10,
    status: 'generated',
    flatFile: idocContent,
  };
  idocHistory.push(idocRecord);
  return idocContent;
}

/**
 * Generate a SHPMNT05 IDoc (Shipment Notification)
 */
function generateShpmnt05(shipment: Record<string, unknown>): string {
  const now = new Date();
  const idocNumber = generateIDocNumber();
  const lines: string[] = [];

  // EDI_DC40 — Control Record
  lines.push([
    padRight('EDI_DC40', 8),
    padRight(idocNumber, 16),
    padRight('SHPMNT05', 30),
    padRight('SHPMNT', 8),
    padRight('LS', 2),
    padRight('WMS_SENDER', 10),
    padRight('LS', 2),
    padRight('ADIWMS001', 10),
    padRight('SAP_RECV', 10),
    padRight('LS', 2),
    padRight('ADIS4H001', 10),
    formatSapDate(now),
    formatSapTime(now),
  ].join(''));

  // E1EDT20 — Shipment header
  lines.push([
    padRight('E1EDT20', 8),
    padRight(String(shipment.shipmentId || ''), 10),
    padRight(String(shipment.carrier || 'DHL'), 10),
    padRight(String(shipment.trackingNumber || ''), 20),
    padRight(formatSapDate(now), 8),
    padRight('SHIPPED', 10),
  ].join(''));

  // E1EDK14 — Reference
  lines.push([
    padRight('E1EDK14', 8),
    padRight(String(shipment.orderId || ''), 35),
    padRight('012', 3),  // Qualifier: delivery reference
  ].join(''));

  const idocContent = lines.join('\n');
  idocHistory.push({
    idocNumber,
    idocType: 'SHPMNT05',
    messageType: 'SHPMNT',
    direction: 'outbound',
    senderPartner: 'ADIWMS001',
    receiverPartner: 'ADIS4H001',
    createdAt: now.toISOString(),
    orderId: shipment.orderId,
    shipmentId: shipment.shipmentId,
    status: 'generated',
    flatFile: idocContent,
  });
  return idocContent;
}

function padRight(s: string, len: number): string {
  return s.slice(0, len).padEnd(len, ' ');
}

// ── Service Factory ──────────────────────────────────────────────────────

export function createWmsService(): BaseMockService {
  const service = new BaseMockService({ name: 'wms', port: 3005 });

  // ── Allocate inventory ─────────────────────────────────────────────
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

  // ── Ship order ─────────────────────────────────────────────────────
  service.route('POST', '/wms/ship', (_req, res, body) => {
    const order = body as Record<string, unknown> | null;
    const shipment = {
      shipmentId: `SHIP-${Date.now().toString(36)}`,
      orderId: order?.orderId,
      carrier: 'DHL',
      trackingNumber: `DE${Math.random().toString().slice(2, 14)}`,
      status: 'SHIPPED',
      shippedAt: new Date().toISOString(),
    };

    // Auto-generate SHPMNT05 IDoc for the shipment
    const idocContent = generateShpmnt05(shipment);
    console.log(`  [WMS] Shipment ${shipment.shipmentId} + SHPMNT05 IDoc generated`);

    service['json'](res, { ...shipment, idocGenerated: true });
  });

  // ── Generate IDoc from allocation ──────────────────────────────────
  service.route('POST', '/wms/idoc/generate', (_req, res, body) => {
    const allocation = body as Record<string, unknown> | null;

    if (!allocation) {
      service['json'](res, { error: 'Allocation data required' }, 400);
      return;
    }

    const idocContent = generateWmmbid01(allocation);
    const latest = idocHistory[idocHistory.length - 1];

    console.log(`  [WMS] Generated WMMBID01 IDoc ${latest.idocNumber} for order ${allocation.orderId}`);

    service['json'](res, {
      idocNumber: latest.idocNumber,
      idocType: 'WMMBID01',
      messageType: 'WMMBID',
      orderId: allocation.orderId,
      allocationId: allocation.allocationId,
      status: 'generated',
      segmentCount: idocContent.split('\n').length,
      flatFile: idocContent,
    });
  });

  // ── IDoc history ───────────────────────────────────────────────────
  service.route('GET', '/wms/idoc/history', (_req, res) => {
    service['json'](res, {
      count: idocHistory.length,
      idocs: idocHistory.map(d => ({
        idocNumber: d.idocNumber,
        idocType: d.idocType,
        messageType: d.messageType,
        orderId: d.orderId,
        status: d.status,
        createdAt: d.createdAt,
      })),
    });
  });

  return service;
}

if (process.argv[1]?.endsWith('wms.ts') || process.argv[1]?.endsWith('wms.js')) {
  createWmsService().start();
}

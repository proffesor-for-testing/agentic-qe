/**
 * SAP S/4HANA Mock — OData sales order API + IDoc inbound processing
 * Port: 3006
 *
 * Endpoints:
 *   GET  /sap/bc/ping                             — SAP ICM health check
 *   POST /sap/opu/odata/ORDER_SRV/OrderSet        — OData: Create sales order
 *   GET  /sap/opu/odata/ORDER_SRV/OrderSet        — OData: Query sales orders
 *   POST /sap/atp/check                           — Available-to-Promise check
 *   POST /sap/idoc/inbound                        — IDoc inbound processing
 *   GET  /sap/idoc/status                         — IDoc processing history
 */

import { BaseMockService } from './base-mock-service.js';

let orderCounter = 1000;
const idocLog: Array<Record<string, unknown>> = [];

// ── IDoc Parser ──────────────────────────────────────────────────────────

interface ParsedIDoc {
  controlRecord: {
    idocNumber: string;
    idocType: string;
    messageType: string;
    senderPartner: string;
    receiverPartner: string;
    createdDate: string;
    createdTime: string;
  };
  segments: Array<{
    segmentType: string;
    fields: Record<string, string>;
    raw: string;
  }>;
}

function parseIDocFlatFile(content: string): ParsedIDoc | null {
  const lines = content.trim().split('\n');
  if (lines.length === 0) return null;

  const segments: ParsedIDoc['segments'] = [];
  let controlRecord: ParsedIDoc['controlRecord'] | null = null;

  // All segment types are padded to 8 chars in flat-file format
  const SEG_LEN = 8;

  for (const line of lines) {
    const segType = line.slice(0, SEG_LEN).trim();

    if (segType === 'EDI_DC40') {
      // Control record
      controlRecord = {
        idocNumber: line.slice(SEG_LEN, SEG_LEN + 16).trim(),
        idocType: line.slice(SEG_LEN + 16, SEG_LEN + 46).trim(),
        messageType: line.slice(SEG_LEN + 46, SEG_LEN + 54).trim(),
        senderPartner: line.slice(SEG_LEN + 68, SEG_LEN + 78).trim(),
        receiverPartner: line.slice(SEG_LEN + 90, SEG_LEN + 100).trim(),
        createdDate: line.slice(SEG_LEN + 100, SEG_LEN + 108).trim(),
        createdTime: line.slice(SEG_LEN + 108, SEG_LEN + 114).trim(),
      };
    } else if (segType === 'E1MBXYJ') {
      // Goods movement header
      segments.push({
        segmentType: 'E1MBXYJ',
        fields: {
          referenceDoc: line.slice(SEG_LEN, SEG_LEN + 35).trim(),
          allocationRef: line.slice(SEG_LEN + 35, SEG_LEN + 51).trim(),
          movementType: line.slice(SEG_LEN + 51, SEG_LEN + 54).trim(),
          postingDate: line.slice(SEG_LEN + 54, SEG_LEN + 62).trim(),
          plant: line.slice(SEG_LEN + 62, SEG_LEN + 66).trim(),
          storageLocation: line.slice(SEG_LEN + 66, SEG_LEN + 70).trim(),
        },
        raw: line,
      });
    } else if (segType === 'E1MBXYI') {
      // Goods movement item
      segments.push({
        segmentType: 'E1MBXYI',
        fields: {
          itemNumber: line.slice(SEG_LEN, SEG_LEN + 6).trim(),
          material: line.slice(SEG_LEN + 6, SEG_LEN + 24).trim(),
          quantity: line.slice(SEG_LEN + 24, SEG_LEN + 37).trim(),
          unitOfMeasure: line.slice(SEG_LEN + 37, SEG_LEN + 40).trim(),
          warehouse: line.slice(SEG_LEN + 40, SEG_LEN + 50).trim(),
          storageZone: line.slice(SEG_LEN + 50, SEG_LEN + 56).trim(),
        },
        raw: line,
      });
    } else if (segType === 'E1MBXYK') {
      // Status segment
      segments.push({
        segmentType: 'E1MBXYK',
        fields: {
          statusCode: line.slice(SEG_LEN, SEG_LEN + 2).trim(),
          statusDate: line.slice(SEG_LEN + 2, SEG_LEN + 10).trim(),
          statusTime: line.slice(SEG_LEN + 10, SEG_LEN + 16).trim(),
          statusText: line.slice(SEG_LEN + 16, SEG_LEN + 56).trim(),
        },
        raw: line,
      });
    } else if (segType === 'E1EDT20') {
      // Shipment header
      segments.push({
        segmentType: 'E1EDT20',
        fields: {
          shipmentId: line.slice(SEG_LEN, SEG_LEN + 10).trim(),
          carrier: line.slice(SEG_LEN + 10, SEG_LEN + 20).trim(),
          trackingNumber: line.slice(SEG_LEN + 20, SEG_LEN + 40).trim(),
          shippingDate: line.slice(SEG_LEN + 40, SEG_LEN + 48).trim(),
          status: line.slice(SEG_LEN + 48, SEG_LEN + 58).trim(),
        },
        raw: line,
      });
    } else if (segType === 'E1EDK14') {
      // Reference segment
      segments.push({
        segmentType: 'E1EDK14',
        fields: {
          referenceDoc: line.slice(SEG_LEN, SEG_LEN + 35).trim(),
          qualifier: line.slice(SEG_LEN + 35, SEG_LEN + 38).trim(),
        },
        raw: line,
      });
    } else if (segType.length > 0) {
      // Unknown segment
      segments.push({
        segmentType: segType,
        fields: { raw: line.slice(SEG_LEN).trim() },
        raw: line,
      });
    }
  }

  if (!controlRecord) return null;

  return { controlRecord, segments };
}

function validateIDoc(parsed: ParsedIDoc): { valid: boolean; errors: string[]; statusCode: string } {
  const errors: string[] = [];

  // Validate control record
  if (!parsed.controlRecord.idocNumber) errors.push('Missing IDoc number in control record');
  if (!parsed.controlRecord.idocType) errors.push('Missing IDoc type in control record');
  if (!parsed.controlRecord.receiverPartner) errors.push('Missing receiver partner');

  // Validate receiver is us
  if (parsed.controlRecord.receiverPartner !== 'ADIS4H001') {
    errors.push(`Wrong receiver: ${parsed.controlRecord.receiverPartner} (expected ADIS4H001)`);
  }

  // Must have at least one data segment
  const dataSegments = parsed.segments.filter(s => s.segmentType !== 'E1MBXYK');
  if (dataSegments.length === 0) errors.push('No data segments found');

  // Validate WMMBID01 specifics
  if (parsed.controlRecord.idocType === 'WMMBID01') {
    const header = parsed.segments.find(s => s.segmentType === 'E1MBXYJ');
    if (!header) errors.push('Missing E1MBXYJ header segment');
    if (header && !header.fields.movementType) errors.push('Missing movement type in header');

    const items = parsed.segments.filter(s => s.segmentType === 'E1MBXYI');
    if (items.length === 0) errors.push('No E1MBXYI item segments');
    for (const item of items) {
      if (!item.fields.material) errors.push(`Item ${item.fields.itemNumber}: missing material`);
      const qty = parseFloat(item.fields.quantity || '0');
      if (qty <= 0) errors.push(`Item ${item.fields.itemNumber}: invalid quantity ${qty}`);
    }
  }

  // Validate SHPMNT05 specifics
  if (parsed.controlRecord.idocType === 'SHPMNT05') {
    const shipHeader = parsed.segments.find(s => s.segmentType === 'E1EDT20');
    if (!shipHeader) errors.push('Missing E1EDT20 shipment header');
  }

  // Status codes: 3=posted, 51=application error, 53=posted (ALE), 64=ready for dispatch
  const statusCode = errors.length === 0 ? '03' : '51';
  return { valid: errors.length === 0, errors, statusCode };
}

// ── Service Factory ──────────────────────────────────────────────────────

export function createSapS4Service(): BaseMockService {
  const service = new BaseMockService({ name: 'sap-s4', port: 3006 });
  const orders: Array<Record<string, unknown>> = [];

  // ── SAP ICM ping ───────────────────────────────────────────────────
  service.route('GET', '/sap/bc/ping', (_req, res) => {
    service['json'](res, { status: 'ok', system: 'S4H', client: '100' });
  });

  // ── OData: Create Sales Order ──────────────────────────────────────
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

  // ── OData: Get Sales Orders ────────────────────────────────────────
  service.route('GET', '/sap/opu/odata/ORDER_SRV/OrderSet', (_req, res) => {
    service['json'](res, { d: { results: orders } });
  });

  // ── ATP Check ──────────────────────────────────────────────────────
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

  // ── IDoc: Inbound Processing ───────────────────────────────────────
  service.route('POST', '/sap/idoc/inbound', (_req, res, body) => {
    // Body can be flat-file string or JSON with flatFile field
    let flatFileContent: string;

    if (typeof body === 'string') {
      flatFileContent = body;
    } else if (body && typeof body === 'object' && 'flatFile' in (body as Record<string, unknown>)) {
      flatFileContent = String((body as Record<string, unknown>).flatFile);
    } else {
      service['json'](res, {
        status: 'error',
        statusCode: '56',  // 56 = IDoc syntax error
        message: 'IDoc content required (flat-file string or { flatFile: string })',
      }, 400);
      return;
    }

    // Parse
    const parsed = parseIDocFlatFile(flatFileContent);
    if (!parsed) {
      const errorRecord = {
        receivedAt: new Date().toISOString(),
        statusCode: '56',
        status: 'error',
        error: 'Failed to parse IDoc — invalid flat-file format',
      };
      idocLog.push(errorRecord);
      service['json'](res, errorRecord, 400);
      return;
    }

    // Validate
    const validation = validateIDoc(parsed);

    const logEntry = {
      idocNumber: parsed.controlRecord.idocNumber,
      idocType: parsed.controlRecord.idocType,
      messageType: parsed.controlRecord.messageType,
      senderPartner: parsed.controlRecord.senderPartner,
      receiverPartner: parsed.controlRecord.receiverPartner,
      receivedAt: new Date().toISOString(),
      segmentCount: parsed.segments.length,
      statusCode: validation.statusCode,
      status: validation.valid ? 'posted' : 'error',
      errors: validation.errors,
    };
    idocLog.push(logEntry);

    if (validation.valid) {
      console.log(`  [SAP] IDoc ${parsed.controlRecord.idocNumber} (${parsed.controlRecord.idocType}) posted — status ${validation.statusCode}`);
    } else {
      console.log(`  [SAP] IDoc ${parsed.controlRecord.idocNumber} REJECTED: ${validation.errors.join(', ')}`);
    }

    service['json'](res, logEntry, validation.valid ? 200 : 422);
  });

  // ── IDoc: Processing History ───────────────────────────────────────
  service.route('GET', '/sap/idoc/status', (_req, res) => {
    service['json'](res, {
      count: idocLog.length,
      posted: idocLog.filter(l => l.status === 'posted').length,
      errors: idocLog.filter(l => l.status === 'error').length,
      entries: idocLog,
    });
  });

  return service;
}

// Run standalone
if (process.argv[1]?.endsWith('sap-s4.ts') || process.argv[1]?.endsWith('sap-s4.js')) {
  createSapS4Service().start();
}

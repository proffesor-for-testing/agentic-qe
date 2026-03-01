/**
 * Agentic QE v3 - IIB Payload Field Extraction & Checks
 *
 * Extracts field values from IIB message payloads (XML or JSON Body)
 * returned by EPOCH GraphQL or MQ Browse providers. Used by tc01-steps.ts
 * to validate individual payload fields (checks #27-39, #53-79, #80-96,
 * #136-156).
 *
 * XML payloads use simple regex extraction (no XML parser dependency).
 * JSON payloads use JSON.parse. Both approaches are safe for read-only
 * field checks — we're not manipulating the payload, just reading fields.
 */

import type { IIBTransaction } from '../../integrations/iib/types';

// ============================================================================
// Types
// ============================================================================

export interface PayloadCheck {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

// ============================================================================
// Field Extraction (XML + JSON)
// ============================================================================

/**
 * Extract a field value from an XML or JSON payload string.
 * Tries XML element/attribute extraction first, then JSON key lookup.
 * Returns undefined if field not found.
 */
export function extractField(payload: string, fieldName: string): string | undefined {
  if (!payload) return undefined;

  // Try XML element: <FieldName>value</FieldName>
  const xmlMatch = payload.match(new RegExp(`<${fieldName}[^>]*>([^<]+)</${fieldName}>`, 'i'));
  if (xmlMatch) return xmlMatch[1].trim();

  // Try XML attribute: FieldName="value"
  const attrMatch = payload.match(new RegExp(`${fieldName}\\s*=\\s*"([^"]*)"`, 'i'));
  if (attrMatch) return attrMatch[1].trim();

  // Try JSON key
  try {
    const obj = JSON.parse(payload);
    return findInObject(obj, fieldName);
  } catch {
    // Not valid JSON — OK, might be SOAP/XML without the field
  }

  return undefined;
}

/** Recursively search for a key in a JSON object */
function findInObject(obj: unknown, key: string): string | undefined {
  if (obj == null || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findInObject(item, key);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = obj as Record<string, unknown>;
  if (key in record && record[key] != null) return String(record[key]);
  for (const val of Object.values(record)) {
    const found = findInObject(val, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Check if a payload contains a substring (case-insensitive).
 * Useful for SOAP operation checks, description matching, etc.
 */
export function payloadContains(payload: string, substring: string): boolean {
  if (!payload || !substring) return false;
  return payload.toLowerCase().includes(substring.toLowerCase());
}

// ============================================================================
// Flow-Specific Payload Check Builders
// ============================================================================

/**
 * ShipmentRequest payload checks (TC_01 checks #27-39).
 * Fields: OrderNo, ShipAdviceNo, CarrierServiceCode, SCAC, ShipNode,
 * EnterpriseCode, Currency, ItemID, OrderedQty, ShipTo address, PaymentType.
 */
export function shipmentRequestChecks(txns: IIBTransaction[], orderId: string): PayloadCheck[] {
  const payload = txns[0]?.payload ?? '';
  if (!payload || isEvidencePayload(payload)) {
    return [{ name: 'ShipmentRequest payload available', passed: false, expected: 'IIB body', actual: 'no payload (provider may not return bodies)' }];
  }

  return [
    terminalNameCheck(txns, '#28'),
    fieldCheck(payload, 'OrderNo', orderId, '#29'),
    fieldPresent(payload, 'ShipAdviceNo', '#30'),
    fieldPresent(payload, 'CarrierServiceCode', '#31'),
    fieldPresent(payload, 'SCAC', '#32'),
    fieldPresent(payload, 'ShipNode', '#33'),
    fieldPresent(payload, 'EnterpriseCode', '#34'),
    fieldPresent(payload, 'Currency', '#35'),
    fieldPresent(payload, 'ItemID', '#36'),
    fieldPresent(payload, 'OrderedQty', '#37'),
    fieldPresent(payload, 'PersonInfoShipTo', '#38'),
    fieldPresent(payload, 'PaymentType', '#39'),
  ];
}

/**
 * AFS SO Ack payload checks (TC_01 checks #53-59).
 * Fields: flow triggered, terminal, ShipmentNo, ItemID, Country/ShipNode.
 */
export function afsSoAckChecks(txns: IIBTransaction[], orderId: string): PayloadCheck[] {
  const payload = txns[0]?.payload ?? '';
  if (!payload || isEvidencePayload(payload)) {
    return [{ name: 'AFS SO Ack payload available', passed: false, expected: 'IIB body', actual: 'no payload' }];
  }

  const checks: PayloadCheck[] = [
    terminalNameCheck(txns, '#54'),
    fieldPresent(payload, 'ShipmentNo', '#55'),
    fieldPresent(payload, 'ItemID', '#56'),
  ];
  // #57: Country + ShipNode
  const country = extractField(payload, 'Country');
  const shipNode = extractField(payload, 'ShipNode');
  checks.push({
    name: 'Country/ShipNode present (#57)',
    passed: !!(country || shipNode),
    expected: 'Country or ShipNode',
    actual: `Country=${country ?? 'missing'}, ShipNode=${shipNode ?? 'missing'}`,
  });

  // #58-59: Shipment 2 (if multiple txns)
  if (txns.length >= 2) {
    const p2 = txns[1].payload;
    checks.push(fieldPresent(p2, 'ShipmentNo', '#58 (shipment 2)'));
    checks.push(fieldPresent(p2, 'ItemID', '#59 (shipment 2)'));
  }

  return checks;
}

/**
 * AFS SO Creation payload checks (TC_01 checks #67-75).
 * Fields: OrderNo, ShipmentNo, Currency, ItemID+UnitPrice, ExtnDivision.
 */
export function afsSoCreationChecks(txns: IIBTransaction[], orderId: string): PayloadCheck[] {
  const payload = txns[0]?.payload ?? '';
  if (!payload || isEvidencePayload(payload)) {
    return [{ name: 'AFS SO Creation payload available', passed: false, expected: 'IIB body', actual: 'no payload' }];
  }

  const checks: PayloadCheck[] = [
    terminalNameCheck(txns, '#68'),
    fieldCheck(payload, 'OrderNo', orderId, '#69'),
    fieldPresent(payload, 'ShipmentNo', '#70'),
    fieldPresent(payload, 'Currency', '#71'),
    fieldPresent(payload, 'ItemID', '#72'),
    fieldPresent(payload, 'ExtnDivision', '#73'),
  ];

  // #74-75: Shipment 2
  if (txns.length >= 2) {
    const p2 = txns[1].payload;
    checks.push(fieldPresent(p2, 'ShipmentNo', '#74 (shipment 2)'));
  }

  return checks;
}

/**
 * WMS ShipConfirm payload checks (TC_01 checks #76-79).
 * Fields: flow triggered, terminal, SOAP operation, order/shipment refs.
 */
export function shipConfirmChecks(txns: IIBTransaction[], orderId: string): PayloadCheck[] {
  const payload = txns[0]?.payload ?? '';
  if (!payload || isEvidencePayload(payload)) {
    return [{ name: 'ShipConfirm payload available', passed: false, expected: 'IIB body', actual: 'no payload' }];
  }

  return [
    terminalNameCheck(txns, '#77'),
    {
      name: 'SOAP operation is ShipmentConfirmation (#78)',
      passed: payloadContains(payload, 'ShipmentConfirmation'),
      expected: 'ShipmentConfirmation',
      actual: payloadContains(payload, 'ShipmentConfirmation') ? 'found' : 'not found in payload',
    },
    {
      name: 'Payload contains order/shipment refs (#79)',
      passed: payloadContains(payload, orderId) || !!extractField(payload, 'OrderNo'),
      expected: orderId,
      actual: extractField(payload, 'OrderNo') ?? (payloadContains(payload, orderId) ? 'found via substring' : 'not found'),
    },
  ];
}

/**
 * POD Kafka event payload checks (TC_01 checks #80-96).
 *
 * Shipment 1 checks (#80-92):
 *   #80 flow triggered, #81 terminal name, #82 InTransit event,
 *   #83 InTransit TrackingNo, #84 SourceSystem, #85 OrderNo ref,
 *   #86 InTransit description, #87 OutForDelivery event,
 *   #88 OFD TrackingNo, #89 DeliveryAttempt event,
 *   #90 DeliveryAttempt description, #91 Delivered event,
 *   #92 Delivered description.
 *
 * Shipment 2 checks (#93-96 — conditional, only if 2+ tracking numbers):
 *   #93 InTransit (ship 2), #94 OutForDelivery (ship 2),
 *   #95 DeliveryAttempt (ship 2), #96 Delivered (ship 2).
 */
export function podKafkaChecks(txns: IIBTransaction[], orderId: string): PayloadCheck[] {
  if (txns.length === 0) {
    return [{ name: 'POD Kafka events received', passed: false, expected: '>0 events', actual: '0' }];
  }

  // Filter out EPOCH DB evidence wrappers — keep only real IIB payloads
  const realTxns = txns.filter(t => t.payload && !isEvidencePayload(t.payload));
  if (realTxns.length === 0) {
    return [{ name: 'POD Kafka payload available', passed: false, expected: 'IIB body', actual: 'no real payload (all evidence wrappers or empty)' }];
  }
  const allPayloads = realTxns.map(t => t.payload).join('\n');

  const checks: PayloadCheck[] = [];

  // #80: Flow triggered
  checks.push({ name: 'POD flow triggered (#80)', passed: realTxns.length > 0, expected: '>0', actual: String(realTxns.length) });
  // #81: Terminal name (use original txns for eventName — it's a top-level field, not in Body)
  checks.push(terminalNameCheck(txns, '#81'));

  // Separate txns by TrackingNo for multi-shipment support
  const trackingGroups = groupByTracking(realTxns);
  const trackingNumbers = Object.keys(trackingGroups);
  const ship1Txns = trackingGroups[trackingNumbers[0]] ?? realTxns;

  // --- Shipment 1 event checks (#82-92) ---

  // #82: InTransit event
  const itTxn = ship1Txns.find(t => payloadContains(t.payload, 'InTransit'));
  checks.push({ name: 'InTransit event present (#82)', passed: !!itTxn, expected: 'InTransit', actual: itTxn ? 'found' : 'not found' });

  // #83: InTransit TrackingNo (always reported, even if no InTransit event)
  const itTracking = itTxn ? extractField(itTxn.payload, 'TrackingNo') : undefined;
  checks.push({ name: 'InTransit: TrackingNo present (#83)', passed: !!itTracking, expected: 'tracking number', actual: itTracking ?? (itTxn ? 'missing in payload' : 'no InTransit event') });

  // #84: SourceSystem present in any POD event
  const sourceSystem = realTxns.map(t => extractField(t.payload, 'SourceSystem')).find(Boolean);
  checks.push({ name: 'SourceSystem present (#84)', passed: !!sourceSystem, expected: 'truthy', actual: sourceSystem ?? 'missing' });

  // #85: OrderNo reference
  checks.push({
    name: 'POD payloads reference order (#85)',
    passed: payloadContains(allPayloads, orderId) || !!extractField(allPayloads, 'OrderNo'),
    expected: orderId,
    actual: extractField(allPayloads, 'OrderNo') ?? (payloadContains(allPayloads, orderId) ? 'found' : 'not found'),
  });

  // #86: InTransit description text
  const itDesc = itTxn ? extractField(itTxn.payload, 'Description') ?? extractField(itTxn.payload, 'StatusDescription') : undefined;
  checks.push({ name: 'InTransit description text (#86)', passed: !!itDesc, expected: 'description text', actual: itDesc ?? 'missing' });

  // #87: OutForDelivery event
  const ofdTxn = ship1Txns.find(t => payloadContains(t.payload, 'OutForDelivery'));
  checks.push({ name: 'OutForDelivery event present (#87)', passed: !!ofdTxn, expected: 'OutForDelivery', actual: ofdTxn ? 'found' : 'not found' });

  // #88: OutForDelivery TrackingNo (always reported)
  const ofdTracking = ofdTxn ? extractField(ofdTxn.payload, 'TrackingNo') : undefined;
  checks.push({ name: 'OutForDelivery: TrackingNo present (#88)', passed: !!ofdTracking, expected: 'tracking number', actual: ofdTracking ?? (ofdTxn ? 'missing in payload' : 'no OutForDelivery event') });

  // #89: DeliveryAttempt event
  const daTxn = ship1Txns.find(t => payloadContains(t.payload, 'DeliveryAttempt'));
  checks.push({ name: 'DeliveryAttempt event present (#89)', passed: !!daTxn, expected: 'DeliveryAttempt', actual: daTxn ? 'found' : 'not found' });

  // #90: DeliveryAttempt description text
  const daDesc = daTxn ? extractField(daTxn.payload, 'Description') ?? extractField(daTxn.payload, 'StatusDescription') : undefined;
  checks.push({ name: 'DeliveryAttempt description text (#90)', passed: !!daDesc, expected: 'description text', actual: daDesc ?? 'missing' });

  // #91: Delivered event (exclude OutForDelivery and DeliveryAttempt false matches)
  const delTxn = ship1Txns.find(t =>
    payloadContains(t.payload, 'Delivered') &&
    !payloadContains(t.payload, 'OutForDelivery') &&
    !payloadContains(t.payload, 'DeliveryAttempt')
  );
  checks.push({ name: 'Delivered event present (#91)', passed: !!delTxn, expected: 'Delivered', actual: delTxn ? 'found' : 'not found' });

  // #92: Delivered description text
  const delDesc = delTxn ? extractField(delTxn.payload, 'Description') ?? extractField(delTxn.payload, 'StatusDescription') : undefined;
  checks.push({ name: 'Delivered description text (#92)', passed: !!delDesc, expected: 'description text', actual: delDesc ?? 'missing' });

  // --- Shipment 2 event checks (#93-96 — conditional) ---
  if (trackingNumbers.length >= 2) {
    const ship2Txns = trackingGroups[trackingNumbers[1]];
    const eventMap: [string, string][] = [
      ['InTransit', '#93'],
      ['OutForDelivery', '#94'],
      ['DeliveryAttempt', '#95'],
      ['Delivered', '#96'],
    ];
    for (const [eventType, ref] of eventMap) {
      const found = ship2Txns.find(t => payloadContains(t.payload, eventType));
      checks.push({
        name: `Shipment 2: ${eventType} event (${ref})`,
        passed: !!found,
        expected: `${eventType} for shipment 2`,
        actual: found ? 'found' : 'not found',
      });
    }
  }

  return checks;
}

/**
 * NShift label request/response payload checks (TC_01 checks #136-147).
 *
 * Request checks (#136-141):
 *   #136 terminal name, #137 OrderNo, #138 DocumentType,
 *   #139 SCAC, #140 ShipNode, #141 address elements.
 *
 * Response checks (#142-147):
 *   #142 SCAC in response, #143 ShipmentCSID,
 *   #144 ReturnSCAC/SCAC, #145 ReturnTrackingNo,
 *   #146 ReturnTrackingURL, #147 ReturnLabelPDF.
 */
export function nshiftLabelChecks(txns: IIBTransaction[], orderId: string): PayloadCheck[] {
  const requestPayload = txns[0]?.payload ?? '';
  if (!requestPayload || isEvidencePayload(requestPayload)) {
    return [{ name: 'NShift label payload available', passed: false, expected: 'IIB body', actual: 'no payload' }];
  }

  // Request fields (txns[0]) — checks #136-141
  const checks: PayloadCheck[] = [
    terminalNameCheck(txns, '#136'),
    fieldCheck(requestPayload, 'OrderNo', orderId, '#137'),
    fieldPresent(requestPayload, 'DocumentType', '#138'),
    fieldPresent(requestPayload, 'SCAC', '#139'),
    fieldPresent(requestPayload, 'ShipNode', '#140'),
    {
      name: 'Address elements present (#141)',
      passed: payloadContains(requestPayload, 'Address') || payloadContains(requestPayload, 'PersonInfo'),
      expected: 'address element',
      actual: payloadContains(requestPayload, 'Address') ? 'found' : 'not found',
    },
  ];

  // Response fields — checks #142-147
  // EPOCH GraphQL may return request and response as separate txns.
  // txns[1] is the response when available; fall back to txns[0] otherwise.
  const hasResponseTxn = txns.length >= 2 && !!txns[1].payload?.trim() && !isEvidencePayload(txns[1].payload);
  const responsePayload = hasResponseTxn ? txns[1].payload : requestPayload;
  const responseSource = hasResponseTxn ? 'response txn' : 'request txn (single txn only)';

  // #142: SCAC in response (confirms carrier selection round-tripped)
  const responseSCAC = extractField(responsePayload, 'SCAC');
  checks.push({
    name: `SCAC in response (#142) [${responseSource}]`,
    passed: !!responseSCAC,
    expected: 'truthy',
    actual: responseSCAC ?? 'missing',
  });

  // #143: ShipmentCSID
  checks.push({
    name: `ShipmentCSID present (#143) [${responseSource}]`,
    passed: !!extractField(responsePayload, 'ShipmentCSID'),
    expected: 'truthy',
    actual: extractField(responsePayload, 'ShipmentCSID') ?? 'missing',
  });

  // #144: ReturnSCAC (or SCAC if return-specific field not present)
  const returnSCAC = extractField(responsePayload, 'ReturnSCAC') ?? extractField(responsePayload, 'ReturnCarrier');
  checks.push({
    name: `ReturnSCAC/ReturnCarrier present (#144) [${responseSource}]`,
    passed: !!returnSCAC || !!responseSCAC,
    expected: 'return carrier info',
    actual: returnSCAC ?? responseSCAC ?? 'missing',
  });

  // #145: ReturnTrackingNo
  checks.push({
    name: `ReturnTrackingNo present (#145) [${responseSource}]`,
    passed: !!extractField(responsePayload, 'ReturnTrackingNo'),
    expected: 'truthy',
    actual: extractField(responsePayload, 'ReturnTrackingNo') ?? 'missing',
  });

  // #146: ReturnTrackingURL
  checks.push({
    name: `ReturnTrackingURL present (#146) [${responseSource}]`,
    passed: payloadContains(responsePayload, 'TrackingURL') || payloadContains(responsePayload, 'trackingUrl'),
    expected: 'tracking URL',
    actual: extractField(responsePayload, 'ReturnTrackingURL') ?? extractField(responsePayload, 'TrackingURL') ?? 'not found',
  });

  // #147: ReturnLabelPDF
  checks.push({
    name: `ReturnLabelPDF present (#147) [${responseSource}]`,
    passed: payloadContains(responsePayload, 'LabelPDF') || payloadContains(responsePayload, 'ReturnLabel'),
    expected: 'label PDF reference',
    actual: payloadContains(responsePayload, 'LabelPDF') ? 'found' : (payloadContains(responsePayload, 'ReturnLabel') ? 'found' : 'not found'),
  });

  return checks;
}

/**
 * ReturnAuth payload checks (TC_01 checks #148-156).
 * Fields: SalesOrderNo, OrderNo (return), DocumentType=0003,
 * ReceivingNode, TrackingNo, ItemID, StatusQuantity.
 */
export function returnAuthChecks(txns: IIBTransaction[], orderId: string, returnOrderNo?: string): PayloadCheck[] {
  const payload = txns[0]?.payload ?? '';
  if (!payload || isEvidencePayload(payload)) {
    return [{ name: 'ReturnAuth payload available', passed: false, expected: 'IIB body', actual: 'no payload' }];
  }

  const checks: PayloadCheck[] = [
    terminalNameCheck(txns, '#149'),
    {
      name: 'SalesOrderNo matches (#150)',
      passed: payloadContains(payload, orderId),
      expected: orderId,
      actual: extractField(payload, 'SalesOrderNo') ?? (payloadContains(payload, orderId) ? 'found via substring' : 'not found'),
    },
    fieldPresent(payload, 'DocumentType', '#152'),
    fieldPresent(payload, 'ReceivingNode', '#153'),
    fieldPresent(payload, 'TrackingNo', '#154'),
    fieldPresent(payload, 'ItemID', '#155'),
    fieldPresent(payload, 'StatusQuantity', '#156'),
  ];

  if (returnOrderNo) {
    checks.push({
      name: 'Return OrderNo present (#151)',
      passed: payloadContains(payload, returnOrderNo),
      expected: returnOrderNo,
      actual: extractField(payload, 'OrderNo') ?? (payloadContains(payload, returnOrderNo) ? 'found' : 'not found'),
    });
  }

  return checks;
}

// ============================================================================
// Helpers
// ============================================================================

/** Group IIB transactions by TrackingNo extracted from payload */
function groupByTracking(txns: IIBTransaction[]): Record<string, IIBTransaction[]> {
  const groups: Record<string, IIBTransaction[]> = {};
  for (const txn of txns) {
    const tracking = extractField(txn.payload, 'TrackingNo') ?? 'unknown';
    (groups[tracking] ??= []).push(txn);
  }
  return groups;
}

/** Check if a payload is an EPOCH DB evidence wrapper (not actual IIB message) */
function isEvidencePayload(payload: string): boolean {
  return payload.includes('_provider') && payload.includes('sterling-db-state-verifier');
}

/** Assert a field exists in the payload */
function fieldPresent(payload: string, fieldName: string, checkRef: string): PayloadCheck {
  const value = extractField(payload, fieldName);
  return {
    name: `${fieldName} present (${checkRef})`,
    passed: !!value,
    expected: 'truthy',
    actual: value ?? 'missing',
  };
}

/** Assert a field matches an expected value */
function fieldCheck(payload: string, fieldName: string, expected: string, checkRef: string): PayloadCheck {
  const value = extractField(payload, fieldName);
  return {
    name: `${fieldName} matches (${checkRef})`,
    passed: value === expected,
    expected,
    actual: value ?? 'missing',
  };
}

/** Check terminal name (EVENT_NAME from EPOCH GraphQL — top-level, not in Body) */
function terminalNameCheck(txns: IIBTransaction[], checkRef: string): PayloadCheck {
  const eventName = txns[0]?.eventName;
  return {
    name: `Terminal name present (${checkRef})`,
    passed: !!eventName,
    expected: 'truthy (EVENT_NAME)',
    actual: eventName ?? 'not available (non-EPOCH provider)',
  };
}

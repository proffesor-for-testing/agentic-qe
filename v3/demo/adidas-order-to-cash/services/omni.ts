/**
 * OMNI Mock — Omni-channel orchestrator with broker integration and IDoc support
 * Port: 3003
 *
 * Pipeline (6 steps):
 *   1. IIB ESB — message transformation (REST → OData format)
 *   2. WMS — inventory allocation
 *   3. WMS IDoc — generate WMMBID01 IDoc from allocation
 *   4. SAP IDoc — inbound IDoc processing
 *   5. SAP OData — create sales order
 *   6. Kibana — event ingestion
 *
 * Broker integration:
 *   - Publishes audit events to message broker (non-blocking)
 *   - Topics: order.transform, order.allocate, order.idoc, order.create, order.ingest
 */

import { BaseMockService } from './base-mock-service.js';

interface SystemResult {
  system: string;
  status: 'success' | 'failed';
  data?: unknown;
  error?: string;
  durationMs: number;
}

async function callService(url: string, body: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

/** Fire-and-forget publish to message broker (non-blocking) */
function publishToBroker(topic: string, payload: unknown, correlationId: string): void {
  fetch('http://localhost:3008/broker/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, payload, correlationId }),
  }).catch(() => {
    // Broker unavailable — non-blocking, just log
    console.log(`  [OMNI] Broker publish to ${topic} failed (non-blocking)`);
  });
}

export function createOmniService(): BaseMockService {
  const service = new BaseMockService({ name: 'omni', port: 3003 });

  // Orchestrate the full order flow
  service.route('POST', '/omni/orchestrate', async (_req, res, body) => {
    const order = body as Record<string, unknown>;
    const results: SystemResult[] = [];
    const correlationId = String(order.orderId || `COR-${Date.now().toString(36)}`);

    // Publish order received event
    publishToBroker('order.received', { orderId: order.orderId, receivedAt: new Date().toISOString() }, correlationId);

    // ── Step 1: IIB ESB Transform ────────────────────────────────────
    const iibResult = await executeStep('iib-esb', 'IIB ESB', 'http://localhost:3004/iib/transform', order, results);
    if (!iibResult) return sendResponse(service, res, order, results, true);
    publishToBroker('order.transform', { orderId: order.orderId, messageId: (iibResult as Record<string, unknown>)?.esbHeader }, correlationId);

    let enrichedOrder = { ...order, iibResponse: iibResult };

    // ── Step 2: WMS Allocate ─────────────────────────────────────────
    const wmsResult = await executeStep('wms', 'WMS', 'http://localhost:3005/wms/allocate', enrichedOrder, results);
    if (!wmsResult) return sendResponse(service, res, order, results, true);
    publishToBroker('order.allocate', { orderId: order.orderId, allocationId: (wmsResult as Record<string, unknown>)?.allocationId }, correlationId);

    enrichedOrder = { ...enrichedOrder, wmsResponse: wmsResult };

    // ── Step 3: WMS IDoc Generate ────────────────────────────────────
    const idocGenResult = await executeStep('wms-idoc', 'WMS IDoc', 'http://localhost:3005/wms/idoc/generate', wmsResult, results);
    if (!idocGenResult) return sendResponse(service, res, order, results, true);

    enrichedOrder = { ...enrichedOrder, idocGenResponse: idocGenResult };

    // ── Step 4: SAP IDoc Inbound ─────────────────────────────────────
    const idocInResult = await executeStep('sap-idoc', 'SAP IDoc', 'http://localhost:3006/sap/idoc/inbound', idocGenResult, results);
    if (!idocInResult) return sendResponse(service, res, order, results, true);
    publishToBroker('order.idoc', { orderId: order.orderId, idocNumber: (idocGenResult as Record<string, unknown>)?.idocNumber }, correlationId);

    enrichedOrder = { ...enrichedOrder, idocInResponse: idocInResult };

    // ── Step 5: SAP OData Create Order ───────────────────────────────
    const sapResult = await executeStep('sap-s4', 'SAP S/4', 'http://localhost:3006/sap/opu/odata/ORDER_SRV/OrderSet', enrichedOrder, results);
    if (!sapResult) return sendResponse(service, res, order, results, true);
    publishToBroker('order.create', { orderId: order.orderId, sapOrderId: (sapResult as Record<string, unknown>)?.d }, correlationId);

    enrichedOrder = { ...enrichedOrder, sapResponse: sapResult };

    // ── Step 6: Kibana Ingest ────────────────────────────────────────
    const kibanaResult = await executeStep('kibana', 'Kibana', 'http://localhost:3007/kibana/api/ingest', enrichedOrder, results);
    if (!kibanaResult) return sendResponse(service, res, order, results, true);
    publishToBroker('order.ingest', { orderId: order.orderId, status: 'COMPLETED' }, correlationId);

    // All steps succeeded
    sendResponse(service, res, order, results, false);
  });

  return service;
}

async function executeStep(
  system: string,
  label: string,
  url: string,
  payload: unknown,
  results: SystemResult[],
): Promise<unknown | null> {
  const start = Date.now();
  try {
    console.log(`  [OMNI] Calling ${label}...`);
    const result = await callService(url, payload);
    const duration = Date.now() - start;

    if (result.ok) {
      results.push({ system, status: 'success', data: result.data, durationMs: duration });
      console.log(`  [OMNI] ${label} OK (${duration}ms)`);
      return result.data;
    } else {
      results.push({ system, status: 'failed', error: `HTTP ${result.status}`, durationMs: duration });
      console.error(`  [OMNI] ${label} FAILED: HTTP ${result.status} (${duration}ms)`);
      return null;
    }
  } catch (err) {
    const duration = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    results.push({ system, status: 'failed', error: message, durationMs: duration });
    console.error(`  [OMNI] ${label} ERROR: ${message} (${duration}ms)`);
    return null;
  }
}

function sendResponse(
  service: BaseMockService,
  res: import('http').ServerResponse,
  order: Record<string, unknown>,
  results: SystemResult[],
  failed: boolean,
): void {
  // Always ingest to Kibana for full audit trail (even on failure)
  if (failed) {
    const failedSystem = results.find(r => r.status === 'failed')?.system || 'unknown';
    fetch('http://localhost:3007/kibana/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.orderId,
        status: 'FAILED',
        customer: order.customer,
        totalAmount: order.totalAmount,
        failedAt: failedSystem,
      }),
    }).catch(() => {
      console.log('  [OMNI] Kibana ingest for failed order skipped (service unavailable)');
    });
  }

  const response = {
    orderId: order.orderId,
    status: failed ? 'FAILED' : 'COMPLETED',
    systemTrace: results,
    completedSystems: results.filter(r => r.status === 'success').length,
    totalSystems: 6,
    totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
  };
  service['json'](res, response, failed ? 502 : 200);
}

if (process.argv[1]?.endsWith('omni.ts') || process.argv[1]?.endsWith('omni.js')) {
  createOmniService().start();
}

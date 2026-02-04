/**
 * OMNI Mock — Omni-channel orchestrator that calls IIB → WMS → SAP → Kibana
 * Port: 3003
 *
 * This is the heart of the demo — it chains all downstream services in sequence.
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
  const start = Date.now();
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { ok: response.ok, status: response.status, data };
}

export function createOmniService(): BaseMockService {
  const service = new BaseMockService({ name: 'omni', port: 3003 });

  // Orchestrate the full order flow: IIB → WMS → SAP → Kibana
  service.route('POST', '/omni/orchestrate', async (_req, res, body) => {
    const order = body as Record<string, unknown>;
    const results: SystemResult[] = [];
    const pipeline = [
      { system: 'iib-esb', url: 'http://localhost:3004/iib/transform', label: 'IIB ESB' },
      { system: 'wms', url: 'http://localhost:3005/wms/allocate', label: 'WMS' },
      { system: 'sap-s4', url: 'http://localhost:3006/sap/opu/odata/ORDER_SRV/OrderSet', label: 'SAP S/4' },
      { system: 'kibana', url: 'http://localhost:3007/kibana/api/ingest', label: 'Kibana' },
    ];

    let enrichedOrder = { ...order };
    let failed = false;

    for (const step of pipeline) {
      const start = Date.now();
      try {
        console.log(`  [OMNI] Calling ${step.label}...`);
        const result = await callService(step.url, enrichedOrder);
        const duration = Date.now() - start;

        if (result.ok) {
          results.push({ system: step.system, status: 'success', data: result.data, durationMs: duration });
          // Enrich order with response data for next step
          enrichedOrder = { ...enrichedOrder, [`${step.system}Response`]: result.data };
          console.log(`  [OMNI] ${step.label} OK (${duration}ms)`);
        } else {
          results.push({ system: step.system, status: 'failed', error: `HTTP ${result.status}`, durationMs: duration });
          console.error(`  [OMNI] ${step.label} FAILED: HTTP ${result.status} (${duration}ms)`);
          failed = true;
          break; // Stop pipeline on first failure
        }
      } catch (err) {
        const duration = Date.now() - start;
        const message = err instanceof Error ? err.message : String(err);
        results.push({ system: step.system, status: 'failed', error: message, durationMs: duration });
        console.error(`  [OMNI] ${step.label} ERROR: ${message} (${duration}ms)`);
        failed = true;
        break;
      }
    }

    const response = {
      orderId: order.orderId,
      status: failed ? 'FAILED' : 'COMPLETED',
      systemTrace: results,
      completedSystems: results.filter(r => r.status === 'success').length,
      totalSystems: pipeline.length,
      totalDurationMs: results.reduce((sum, r) => sum + r.durationMs, 0),
    };

    service['json'](res, response, failed ? 502 : 200);
  });

  return service;
}

if (process.argv[1]?.endsWith('omni.ts') || process.argv[1]?.endsWith('omni.js')) {
  createOmniService().start();
}

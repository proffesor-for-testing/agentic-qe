/**
 * Kibana Mock — Analytics dashboard and event ingestion
 * Port: 3007
 */

import { BaseMockService } from './base-mock-service.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface OrderEvent {
  orderId: string;
  status: string;
  timestamp: string;
  systems: number;
  totalAmount?: number;
  customer?: string;
}

const events: OrderEvent[] = [];

export function createKibanaService(): BaseMockService {
  const service = new BaseMockService({ name: 'kibana', port: 3007 });

  // Serve dashboard HTML
  service.route('GET', '/', (_req, res) => {
    try {
      const html = readFileSync(join(__dirname, '../ui/dashboard.html'), 'utf-8');
      service['html'](res, html);
    } catch {
      service['html'](res, '<h1>Kibana Dashboard</h1><p>Dashboard file not found</p>');
    }
  });

  // Ingest order event (called by OMNI at end of pipeline)
  service.route('POST', '/kibana/api/ingest', (_req, res, body) => {
    const order = body as Record<string, unknown> | null;
    const event: OrderEvent = {
      orderId: (order?.orderId as string) || `ORD-${Date.now()}`,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      systems: 7,
      totalAmount: (order?.totalAmount as number) || 0,
      customer: (order?.customer as Record<string, string>)?.email || 'unknown',
    };
    events.push(event);
    console.log(`  [Kibana] Event ingested: ${event.orderId}`);
    service['json'](res, { indexed: true, eventId: `EVT-${events.length}`, event });
  });

  // Get all order events (polled by dashboard and integrator)
  service.route('GET', '/kibana/api/orders', (_req, res) => {
    service['json'](res, { total: events.length, orders: events });
  });

  return service;
}

if (process.argv[1]?.endsWith('kibana.ts') || process.argv[1]?.endsWith('kibana.js')) {
  createKibanaService().start();
}

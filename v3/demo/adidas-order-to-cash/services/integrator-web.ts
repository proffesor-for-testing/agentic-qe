/**
 * Integrator Web Mock — Storefront serving HTML + proxying to API Tester
 * Port: 3001
 */

import { BaseMockService } from './base-mock-service.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createIntegratorWebService(): BaseMockService {
  const service = new BaseMockService({ name: 'integrator-web', port: 3001 });

  // Serve storefront HTML
  service.route('GET', '/', (_req, res) => {
    try {
      const html = readFileSync(join(__dirname, '../ui/storefront.html'), 'utf-8');
      service['html'](res, html);
    } catch {
      service['html'](res, '<h1>Storefront loading...</h1><p>UI file not found</p>');
    }
  });

  // Proxy checkout to API Tester (port 3002)
  service.route('POST', '/api/checkout', async (_req, res, body) => {
    try {
      const response = await fetch('http://localhost:3002/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      service['json'](res, data, response.status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [Integrator] API Tester call failed: ${message}`);
      service['json'](res, {
        error: 'Downstream service unavailable',
        service: 'api-tester',
        details: message,
      }, 502);
    }
  });

  // ── Demo control proxy (same-origin access to other services) ──────────

  service.route('POST', '/demo/fail-sap', async (_req, res) => {
    try {
      await fetch('http://localhost:3006/admin/fail', { method: 'POST' });
      service['json'](res, { status: 'sap_failure_injected' });
    } catch {
      service['json'](res, { error: 'SAP service unreachable' }, 502);
    }
  });

  service.route('POST', '/demo/recover-sap', async (_req, res) => {
    try {
      await fetch('http://localhost:3006/admin/recover', { method: 'POST' });
      service['json'](res, { status: 'sap_recovered' });
    } catch {
      service['json'](res, { error: 'SAP service unreachable' }, 502);
    }
  });

  service.route('POST', '/demo/reset-all', async (_req, res) => {
    const services = [3002, 3003, 3004, 3005, 3006, 3007, 3008];
    await Promise.allSettled(
      services.map(port => fetch(`http://localhost:${port}/admin/recover`, { method: 'POST' }))
    );
    service['json'](res, { status: 'all_services_recovered' });
  });

  // Order status polling (aggregates from Kibana)
  service.route('GET', '/api/order-status', async (_req, res) => {
    try {
      const response = await fetch('http://localhost:3007/kibana/api/orders');
      const data = await response.json();
      service['json'](res, data);
    } catch {
      service['json'](res, { orders: [], error: 'Kibana unavailable' });
    }
  });

  return service;
}

if (process.argv[1]?.endsWith('integrator-web.ts') || process.argv[1]?.endsWith('integrator-web.js')) {
  createIntegratorWebService().start();
}

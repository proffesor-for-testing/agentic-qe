/**
 * API Tester Mock — REST API gateway that validates and forwards to OMNI
 * Port: 3002
 */

import { BaseMockService } from './base-mock-service.js';

export function createApiTesterService(): BaseMockService {
  const service = new BaseMockService({ name: 'api-tester', port: 3002 });

  // Product catalog
  service.route('GET', '/api/products', (_req, res) => {
    service['json'](res, {
      products: [
        { id: 'ULTRA-23', name: 'Ultraboost 23', price: 180, currency: 'EUR', category: 'Running' },
        { id: 'JERSEY-H', name: 'Home Jersey 2025', price: 90, currency: 'EUR', category: 'Football' },
        { id: 'BAG-DFL', name: 'Duffle Bag', price: 65, currency: 'EUR', category: 'Accessories' },
      ],
    });
  });

  // Create order — validates then forwards to OMNI
  service.route('POST', '/api/orders', async (_req, res, body) => {
    const order = body as Record<string, unknown> | null;

    // Validate required fields
    if (!order?.customer || !order?.items) {
      service['json'](res, {
        error: 'Validation failed',
        details: 'customer and items are required',
      }, 400);
      return;
    }

    console.log('  [API Tester] Order validated, forwarding to OMNI...');

    try {
      const response = await fetch('http://localhost:3003/omni/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: `ORD-${Date.now().toString(36)}`,
          ...order,
          validatedAt: new Date().toISOString(),
          validatedBy: 'api-tester',
        }),
      });
      const data = await response.json();
      service['json'](res, data, response.status);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [API Tester] OMNI call failed: ${message}`);
      service['json'](res, {
        error: 'Orchestration service unavailable',
        service: 'omni',
        details: message,
      }, 502);
    }
  });

  return service;
}

if (process.argv[1]?.endsWith('api-tester.ts') || process.argv[1]?.endsWith('api-tester.js')) {
  createApiTesterService().start();
}

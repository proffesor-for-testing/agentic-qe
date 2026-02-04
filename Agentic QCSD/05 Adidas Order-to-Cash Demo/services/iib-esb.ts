/**
 * IIB ESB Mock — Integration Bus that transforms message formats
 * Port: 3004
 */

import { BaseMockService } from './base-mock-service.js';

export function createIibEsbService(): BaseMockService {
  const service = new BaseMockService({ name: 'iib-esb', port: 3004 });

  // Transform order message (JSON → enriched JSON with ESB headers)
  service.route('POST', '/iib/transform', (_req, res, body) => {
    const order = body as Record<string, unknown> | null;

    const transformed = {
      esbHeader: {
        messageId: `MSG-${Date.now().toString(36)}`,
        correlationId: order?.orderId || 'unknown',
        sourceSystem: 'OMNI',
        targetSystem: 'SAP-S4',
        transformedAt: new Date().toISOString(),
        protocol: 'REST-to-OData',
        version: '1.0',
      },
      payload: {
        ...order,
        // IIB adds SAP-specific fields
        sapClient: '100',
        salesOrg: '1000',
        distributionChannel: '10',
        division: '00',
        orderType: 'ZOR',
      },
      routing: {
        primaryTarget: 'sap-s4:3006',
        fallbackTarget: null,
        retryPolicy: 'exponential-backoff',
        maxRetries: 3,
      },
    };

    console.log(`  [IIB] Transformed message ${transformed.esbHeader.messageId}`);
    service['json'](res, transformed);
  });

  return service;
}

if (process.argv[1]?.endsWith('iib-esb.ts') || process.argv[1]?.endsWith('iib-esb.js')) {
  createIibEsbService().start();
}

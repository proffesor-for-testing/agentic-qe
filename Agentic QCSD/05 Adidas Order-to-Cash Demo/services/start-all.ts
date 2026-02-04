#!/usr/bin/env npx tsx
/**
 * Start all 7 mock services in a single process.
 * Useful for local development without Docker.
 *
 * Run: npx tsx services/start-all.ts
 */

import { createIntegratorWebService } from './integrator-web.js';
import { createApiTesterService } from './api-tester.js';
import { createOmniService } from './omni.js';
import { createIibEsbService } from './iib-esb.js';
import { createWmsService } from './wms.js';
import { createSapS4Service } from './sap-s4.js';
import { createKibanaService } from './kibana.js';

async function main() {
  console.log('Starting Adidas Order-to-Cash mock services...\n');

  const services = [
    createIntegratorWebService(),  // 3001
    createApiTesterService(),      // 3002
    createOmniService(),           // 3003
    createIibEsbService(),         // 3004
    createWmsService(),            // 3005
    createSapS4Service(),          // 3006
    createKibanaService(),         // 3007
  ];

  await Promise.all(services.map(s => s.start()));

  console.log('\nAll services started. Press Ctrl+C to stop.\n');
  console.log('  Storefront:  http://localhost:3001');
  console.log('  API Tester:  http://localhost:3002');
  console.log('  OMNI:        http://localhost:3003');
  console.log('  IIB ESB:     http://localhost:3004');
  console.log('  WMS:         http://localhost:3005');
  console.log('  SAP S/4:     http://localhost:3006');
  console.log('  Kibana:      http://localhost:3007');
  console.log('');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nStopping all services...');
    await Promise.all(services.map(s => s.stop()));
    process.exit(0);
  });
}

main().catch(console.error);

#!/usr/bin/env npx tsx
/**
 * Start all 8 mock services in a single process.
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
import { createMessageBrokerService } from './message-broker.js';

async function main() {
  console.log('Starting Adidas Order-to-Cash mock services...\n');

  const services = [
    createMessageBrokerService(),  // 3008 — start broker first so OMNI can publish
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
  console.log('  Storefront:      http://localhost:3001');
  console.log('  API Tester:      http://localhost:3002  (REST + SOAP/WSDL)');
  console.log('  OMNI:            http://localhost:3003');
  console.log('  IIB ESB:         http://localhost:3004');
  console.log('  WMS:             http://localhost:3005  (+ IDoc generation)');
  console.log('  SAP S/4:         http://localhost:3006  (OData + IDoc inbound)');
  console.log('  Kibana:          http://localhost:3007');
  const brokerMode = process.env.BROKER_MODE || 'memory';
  console.log(`  Message Broker:  http://localhost:3008  (${brokerMode === 'rabbitmq' ? 'RabbitMQ AMQP' : 'in-memory'} + DLQ)`);
  console.log('');
  if (brokerMode === 'rabbitmq') {
    console.log(`  Broker backend:  RabbitMQ at ${process.env.RABBITMQ_URL || 'amqp://localhost:5672'}`);
    console.log('');
  }
  console.log('New endpoints:');
  console.log('  GET  http://localhost:3002/api/wsdl              — WSDL definition');
  console.log('  POST http://localhost:3002/api/soap/validate     — SOAP order validation');
  console.log('  POST http://localhost:3005/wms/idoc/generate     — Generate WMMBID01 IDoc');
  console.log('  GET  http://localhost:3005/wms/idoc/history      — IDoc generation history');
  console.log('  POST http://localhost:3006/sap/idoc/inbound      — SAP IDoc inbound');
  console.log('  GET  http://localhost:3006/sap/idoc/status       — IDoc processing log');
  console.log('  POST http://localhost:3008/broker/publish        — Publish message');
  console.log('  POST http://localhost:3008/broker/consume        — Consume messages');
  console.log('  GET  http://localhost:3008/broker/dlq            — Dead letter queue');
  console.log('  GET  http://localhost:3008/broker/stats          — Broker statistics');
  console.log('  GET  http://localhost:3008/broker/mode           — Active broker mode');
  console.log('');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nStopping all services...');
    await Promise.all(services.map(s => s.stop()));
    process.exit(0);
  });
}

main().catch(console.error);

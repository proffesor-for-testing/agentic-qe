/** Actual HTTP embedder/client/pipeline + EventBus, isolated from developer state. */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const source = process.env.AQE_SOURCE_ROOT;
if (!source) throw new Error('AQE_SOURCE_ROOT is required');
let failing = false;
let succeeded = 0;
let failed = 0;
const endpoint = createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    if (failing) {
      failed++;
      res.writeHead(503);
      res.end('SECRET-PROVIDER-ERROR');
      return;
    }
    succeeded++;
    const { input } = JSON.parse(body);
    const inputs = Array.isArray(input) ? input : [input];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: inputs.map((_, index) => ({ index, embedding: [1, ...Array(383).fill(0)] })) }));
  });
});
await new Promise(resolve => endpoint.listen(0, '127.0.0.1', resolve));
process.env.AQE_EMBEDDER_ENDPOINT = `http://127.0.0.1:${endpoint.address().port}`;
process.env.AQE_MEMORY_PATH = ':memory:';
const { SemanticAntiDriftMiddleware } = await import(pathToFileURL(join(source, 'src/kernel/anti-drift-middleware.ts')));
const { InMemoryEventBus } = await import(pathToFileURL(join(source, 'src/kernel/event-bus.ts')));
const mw = new SemanticAntiDriftMiddleware();
const bus = new InMemoryEventBus();
bus.registerMiddleware(mw);
const delivered = [];
bus.subscribe('TaskCompleted', async event => { delivered.push(event.id); });
const event = id => ({ id, type: 'TaskCompleted', source: 'quality-assessment', timestamp: new Date(),
  payload: { description: `A unique meaningful test completion result for ${id}` } });
const receipt = { errors: [], delivered };
try {
  // Warm up the real endpoint pipeline and the middleware's availability probe.
  await bus.publish(event('healthy-before-outage'));
  receipt.healthyStats = mw.getStats();
  failing = true;
  try { await bus.publish(event('emit-during-outage')); }
  catch (error) { receipt.errors.push({ stage: 'emit', name: error.name }); }
  failing = false;
  const emitted = await mw.onEmit(event('receive-during-outage'));
  emitted.payload = { description: 'Distinct payload text forces a real HTTP cache miss during receive' };
  failing = true;
  try { receipt.receiveDelivered = (await mw.onReceive(emitted)) !== null; }
  catch (error) { receipt.errors.push({ stage: 'receive', name: error.name }); }
  receipt.outageStats = mw.getStats();
  failing = false;
  await bus.publish(event('healthy-after-recovery'));
  receipt.recoveryStats = mw.getStats();
  receipt.requests = { succeeded, failed };
  console.log('OUTAGE_RECEIPT ' + JSON.stringify(receipt));
} finally {
  endpoint.closeAllConnections();
  await new Promise(resolve => endpoint.close(resolve));
}

import { access, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';

const source = process.env.AQE_SOURCE_ROOT;
if (!source) throw new Error('AQE_SOURCE_ROOT is required');
const fixture = await realpath(await mkdtemp(join(tmpdir(), 'aqe-cancel-mcp-')));
await mkdir(join(fixture, 'tmp'));
for (const key of Object.keys(process.env)) {
  if (/(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN)$/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  AQE_PROJECT_ROOT: fixture,
  TMPDIR: join(fixture, 'tmp'),
  AQE_MEMORY_BACKEND: 'memory',
  AQE_SESSION_CACHE: 'off',
  AQE_LOOP_DETECTION_ENABLED: 'false',
  AQE_LLM_ROUTER_DISABLED: 'true',
  AQE_TRAJECTORY_JUDGE: '0',
  npm_config_offline: 'true',
});
process.chdir(fixture);
await symlink(join(source, 'node_modules'), join(fixture, 'node_modules'), 'dir');
await writeFile(join(fixture, 'package.json'), JSON.stringify({ type: 'module', private: true }));
await writeFile(join(fixture, 'vitest.config.mjs'), 'export default {test:{maxWorkers:1,minWorkers:1,fileParallelism:false}};');
await writeFile(join(fixture, 'slow.test.js'),
  "import { it, expect } from 'vitest'; import { writeFileSync } from 'node:fs'; " +
  "it('slow effect', async () => { writeFileSync('slow-started', String(process.pid)); " +
  "await new Promise(resolve => setTimeout(resolve, 1000)); " +
  "writeFileSync('slow-effect', String(process.pid)); expect(true).toBe(true); });");
await writeFile(join(fixture, 'healthy.test.js'),
  "import { it, expect } from 'vitest'; it('healthy control', () => expect(true).toBe(true));");

const embedder = createServer((req, res) => {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}');
    const input = Array.isArray(parsed.input) ? parsed.input : [parsed.input];
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: input.map((_, index) => ({ index, embedding: [1, ...Array(383).fill(0)] })) }));
  });
});
await new Promise(resolve => embedder.listen(0, '127.0.0.1', resolve));
process.env.AQE_EMBEDDER_ENDPOINT = 'http://127.0.0.1:' + embedder.address().port;
globalThis.require = createRequire(join(source, 'package.json'));

let server;
const receipt = { events: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function until(fn, message) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const value = await fn();
    if (value) return value;
    await sleep(20);
  }
  throw new Error(message);
}
let id = 0;
async function call(name, args) {
  const response = await server.handleRequest({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } });
  if (!response.content) throw new Error(JSON.stringify(response));
  return JSON.parse(response.content[0].text);
}

try {
  const { createMCPProtocolServer } = await import(pathToFileURL(join(source, 'src/mcp/protocol-server.ts')).href);
  const core = await import(pathToFileURL(join(source, 'src/mcp/handlers/core-handlers.ts')).href);
  server = createMCPProtocolServer();
  const fleet = await call('fleet_init', { memoryBackend: 'memory', maxAgents: 2 });
  if (!fleet.success) throw new Error(JSON.stringify(fleet));
  core.getFleetState().kernel.eventBus.subscribe('*', event => {
    if (event.type.includes('Task')) receipt.events.push({ type: event.type, taskId: event.payload?.taskId });
  });

  const started = await call('task_submit', {
    type: 'execute-tests', payload: { testFiles: [join(fixture, 'slow.test.js')], parallel: false, timeout: 10000 },
  });
  if (!started.success) throw new Error(JSON.stringify(started));
  const taskId = started.data.taskId;
  await until(() => exists(join(fixture, 'slow-started')), 'Runner did not start');
  receipt.cancel = await call('task_cancel', { taskId });
  receipt.immediate = await call('task_status', { taskId });
  receipt.final = await until(async () => {
    const status = await call('task_status', { taskId });
    return status.data?.status === 'completed' || status.data?.cancellationResultPending === false ? status : null;
  }, 'Cancellation callback did not settle');
  receipt.effectObserved = await exists(join(fixture, 'slow-effect'));
  receipt.repeat = await call('task_cancel', { taskId });
  receipt.afterRepeat = await call('task_status', { taskId });
  receipt.cancelledTaskId = taskId;

  const healthy = await call('task_submit', {
    type: 'execute-tests', payload: { testFiles: [join(fixture, 'healthy.test.js')], parallel: false, timeout: 10000 },
  });
  if (!healthy.success) throw new Error(JSON.stringify(healthy));
  receipt.healthyTaskId = healthy.data.taskId;
  receipt.healthyFinal = await until(async () => {
    const status = await call('task_status', { taskId: healthy.data.taskId });
    return status.data?.status === 'completed' ? status : null;
  }, 'Healthy control did not complete');
  await until(() => receipt.events.some(event =>
    event.type === 'QueenTaskCancelled' && event.taskId === taskId),
  'Cancellation event was not delivered');
  await until(() => receipt.events.some(event =>
    event.type === 'QueenTaskCompleted' && event.taskId === healthy.data.taskId),
  'Healthy completion event was not delivered');
  receipt.metrics = core.getFleetState().queen.getMetrics();
  console.log('CANCEL_RECEIPT ' + JSON.stringify(receipt));
} finally {
  if (server) await server.stop();
  await new Promise(resolve => embedder.close(resolve));
  await rm(fixture, { recursive: true, force: true });
}

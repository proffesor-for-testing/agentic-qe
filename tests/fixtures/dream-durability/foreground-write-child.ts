/**
 * Child process for tests/integration/learning/dream-foreground-write-durability.test.ts (#1060).
 *
 * Starts a real DreamEngine dream on the process-wide shared SQLite connection,
 * performs an acknowledged foreground `memory_store` through the real MCP
 * handler while the dream is in flight, then ends the dream according to the
 * mode argument:
 *
 *   cancel   - cancel the dream; on main this takes the discard/rollback path
 *   shutdown - run the MCP shutdown store-closers and exit mid-dream, like a
 *              client closing stdin
 *   engine-close - close the engine mid-dream (what MCP fleet dispose does
 *              before the store closers run), then shut down and exit
 *   complete - let the dream finish normally (control)
 *
 * Writes the acknowledgment to ack.json in the cwd. The parent reopens the
 * database on its own connection to check what is on disk.
 */

import { writeFileSync } from 'node:fs';
import { createMemoryBackend } from '../../../src/kernel/memory-factory.js';
import { getUnifiedMemory } from '../../../src/kernel/unified-memory.js';
import { createDreamEngine } from '../../../src/learning/dream/dream-engine.js';
import { closeRegisteredStores } from '../../../src/kernel/process-lifecycle.js';
import {
  setStandaloneMemoryBackend,
  handleMemoryStore,
} from '../../../src/mcp/handlers/memory-handlers.js';

const mode = process.argv[2];
if (!['cancel', 'shutdown', 'engine-close', 'complete'].includes(mode)) {
  throw new Error(`unknown mode: ${mode}`);
}

const dbPath = process.env.AQE_MEMORY_PATH;
if (!dbPath) throw new Error('AQE_MEMORY_PATH is required');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const { backend } = await createMemoryBackend(
  { type: 'sqlite', sqlite: { path: dbPath, walMode: true } },
  true,
);
const db = getUnifiedMemory().getDatabase();

const engine = createDreamEngine({ minConceptsRequired: 3, maxDurationMs: 1500 });
await engine.initialize();
await engine.loadPatternsAsConcepts(
  Array.from({ length: 12 }, (_, i) => ({
    id: `p-${i}`,
    name: `pattern ${i}`,
    description: `synthetic pattern ${i} for durability test`,
    domain: i % 2 === 0 ? 'test-generation' : 'coverage-analysis',
    confidence: 0.8,
    successRate: 0.9,
  })),
);

// Start the dream and do not await it: the MCP server keeps dispatching
// requests while a dream is in flight.
const dreaming = engine.dream(1500).then(
  () => 'completed',
  (err: unknown) => `rejected: ${err instanceof Error ? err.message : String(err)}`,
);

// Yield real macrotasks so the dream is inside its activation loop.
await sleep(300);
const dreamingAtWrite = engine.isDreaming();

setStandaloneMemoryBackend(backend);
const response = await handleMemoryStore({
  key: 'fg-marker',
  namespace: 'repro-1060',
  value: { acknowledged: true },
});
const ack = {
  success: response.success,
  persisted: response.success ? response.data?.persisted : undefined,
  inTransaction: db.inTransaction,
  dreamingAtWrite,
};
writeFileSync('ack.json', JSON.stringify(ack));

if (mode === 'cancel') {
  await engine.cancelDream();
  writeFileSync('dream.json', JSON.stringify({ outcome: await dreaming }));
} else if (mode === 'complete') {
  writeFileSync('dream.json', JSON.stringify({ outcome: await dreaming }));
} else if (mode === 'engine-close') {
  await engine.close();
  closeRegisteredStores();
  process.exit(0);
} else {
  // What the MCP server does on stdin EOF: run the registered store closers
  // (memory.db closes last), then exit without waiting for the dream.
  closeRegisteredStores();
  process.exit(0);
}

setStandaloneMemoryBackend(null);
await backend.dispose();
closeRegisteredStores();
process.exit(0);

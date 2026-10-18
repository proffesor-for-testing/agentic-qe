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
 *   commit-error - make the dream's single commit transaction fail (a TEMP
 *              trigger aborts the final cycle update): nothing of the dream
 *              may be written, the foreground write must stay
 *   branching - like complete, with the deprecated enableBranching: true
 *   abrupt   - SIGKILL the process mid-dream (no closers run)
 *   concurrent - start a second dream while the first runs; it must be refused
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
if (!['cancel', 'shutdown', 'engine-close', 'complete', 'commit-error', 'branching', 'abrupt', 'concurrent'].includes(mode)) {
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

const engine = createDreamEngine({
  minConceptsRequired: 3,
  maxDurationMs: 1500,
  ...(mode === 'branching' ? { enableBranching: true } : {}),
});
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

// What the dream may change, as it was before the dream (#1060 atomicity).
writeFileSync('before.json', JSON.stringify(
  db.prepare('SELECT id, activation_level, last_activated FROM concept_nodes ORDER BY id').all(),
));
if (mode === 'commit-error') {
  db.exec(`CREATE TEMP TRIGGER fail_dream_commit BEFORE UPDATE OF status ON dream_cycles
           WHEN NEW.status = 'completed' BEGIN SELECT RAISE(ABORT, 'injected commit failure'); END`);
}

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

if (mode === 'concurrent') {
  const second = await engine.dream(500).then(() => 'completed', (err: unknown) => (err as Error).name);
  writeFileSync('dream.json', JSON.stringify({ second, outcome: await dreaming }));
} else if (mode === 'abrupt') {
  process.kill(process.pid, 'SIGKILL');
}

if (mode === 'cancel') {
  const cancelledAt = Date.now();
  await engine.cancelDream();
  const outcome = await dreaming;
  writeFileSync('dream.json', JSON.stringify({ outcome, stopMs: Date.now() - cancelledAt }));
} else if (mode === 'complete' || mode === 'commit-error' || mode === 'branching') {
  writeFileSync('dream.json', JSON.stringify({ outcome: await dreaming }));
} else if (mode === 'engine-close') {
  await engine.close();
  closeRegisteredStores();
  process.exit(0);
} else if (mode === 'concurrent') {
  // dream.json already written
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

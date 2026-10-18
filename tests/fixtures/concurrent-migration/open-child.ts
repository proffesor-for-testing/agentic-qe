/**
 * Child process for tests/integration/migration/concurrent-migration-1116.test.ts.
 * Opens the database at argv[2] through UnifiedMemoryManager, which runs the
 * schema migration, and prints the outcome as one JSON line. `migration` says
 * what this process's migrate() did, from its log: 'applied' (it migrated),
 * 'waited' (another process had migrated by the time it held the lock) or
 * 'none' (the database was already current when it opened).
 */
import { existsSync } from 'node:fs';
import { getUnifiedMemory } from '../../../src/kernel/unified-memory.js';

const dbPath = process.argv[2];
// Start barrier: say "ready" once loaded, then wait for the parent's start
// file so every child opens the database at about the same moment.
const startFile = process.argv[3];
let migration: 'applied' | 'waited' | 'none' = 'none';
const log = console.log;
console.log = (...args: unknown[]) => {
  const line = args.map(String).join(' ');
  if (line.includes('[UnifiedMemory] Migration complete')) migration = 'applied';
  if (line.includes('[UnifiedMemory] Another process completed the migration')) migration = 'waited';
  log(...args);
};

if (startFile) {
  process.stdout.write('ready\n');
  const deadline = Date.now() + 60_000;
  while (!existsSync(startFile)) {
    if (Date.now() > deadline) throw new Error('start barrier timed out');
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
}

try {
  const manager = getUnifiedMemory({ dbPath });
  await manager.initialize();
  const version = (manager.getDatabase().prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number }).version;
  manager.close();
  log(JSON.stringify({ ok: true, version, migration }));
} catch (error) {
  log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}

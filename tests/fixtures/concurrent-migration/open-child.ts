/**
 * Child process for tests/integration/migration/concurrent-migration-1116.test.ts.
 * Opens the database at argv[2] through UnifiedMemoryManager, which runs the
 * schema migration, and prints the outcome as one JSON line.
 */
import { getUnifiedMemory } from '../../../src/kernel/unified-memory.js';

const dbPath = process.argv[2];
try {
  const manager = getUnifiedMemory({ dbPath });
  await manager.initialize();
  const version = (manager.getDatabase().prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number }).version;
  manager.close();
  console.log(JSON.stringify({ ok: true, version }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
}

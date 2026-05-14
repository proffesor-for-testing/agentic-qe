/**
 * Issue #482 — integration test that catches the regression where the bridge
 * publishes events but no domain plugin is listening because lazy loading
 * leaves them un-initialized.
 *
 * This is exactly the test Jordi recommended as the missing coverage:
 *   - real QEKernelImpl
 *   - real captured_experiences row inserted
 *   - run one bridge drain
 *   - assert kv_store contains a learning:experience:* key
 *
 * The pre-fix v3.9.27 build fails this test: bridge cursor advances, but
 * no kv key appears because learning-optimization's subscribeToEvents()
 * has never run (lazyLoading: true + nothing called getDomainAPI).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { QEKernelImpl } from '../../../src/kernel/kernel';
import {
  initializeUnifiedMemory,
  resetUnifiedMemory,
  getUnifiedMemory,
} from '../../../src/kernel/unified-memory';

function freshDataDir(): string {
  return path.join(
    os.tmpdir(),
    `aqe-bridge-e2e-${Date.now()}-${randomUUID().slice(0, 8)}`
  );
}

function createExperiencesTable() {
  const db = getUnifiedMemory().getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS captured_experiences (
      id TEXT PRIMARY KEY,
      task TEXT,
      agent TEXT,
      domain TEXT NOT NULL DEFAULT '',
      success INTEGER NOT NULL DEFAULT 0,
      quality REAL NOT NULL DEFAULT 0.5,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      source TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function insertRow(domain: string, id: string) {
  const db = getUnifiedMemory().getDatabase();
  db.prepare(`
    INSERT INTO captured_experiences
      (id, task, agent, domain, success, quality, duration_ms, source)
    VALUES (?, 'test task', 'test-agent', ?, 1, 0.85, 100, 'cli-hook-post-task')
  `).run(id, domain);
}

describe('Issue #482 — bridge end-to-end with real kernel + domain plugins', () => {
  let dataDir: string;
  let kernel: QEKernelImpl;

  beforeEach(async () => {
    dataDir = freshDataDir();
    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(path.join(dataDir, '.agentic-qe'), { recursive: true });
    await initializeUnifiedMemory({ dbPath: path.join(dataDir, '.agentic-qe', 'memory.db') });
    createExperiencesTable();

    kernel = new QEKernelImpl({
      memoryBackend: 'hybrid',
      dataDir: path.join(dataDir, '.agentic-qe'),
      enabledDomains: ['learning-optimization'],
    });
    await kernel.initialize();
  });

  afterEach(async () => {
    if (kernel) await kernel.dispose();
    resetUnifiedMemory();
    if (fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  // Parametrized over a domain that has fan-out AND domains that don't,
  // per Jordi #484. The v3.9.28 test passed only because `test-execution`
  // had a fan-out path that wrote a kv key via a different handler,
  // masking the universal-event path being broken. Domains without a
  // fan-out path exercise the universal handler exclusively.
  describe.each([
    'test-execution',          // has fan-out — passes via two paths in v3.9.28
    'requirements-validation', // no fan-out — universal-only path
    'security-compliance',     // no fan-out — universal-only path
  ])(
    'learning-optimization handler fires recordExperience for domain=%s',
    (domain) => {
      it('writes a learning:experience:* kv key after one bridge drain', async () => {
        insertRow(domain, `e1-${domain}`);

        const bridge = (kernel as unknown as {
          _experienceBridge?: { drainOnce: () => Promise<number> };
        })._experienceBridge;
        expect(bridge).toBeDefined();
        const published = await bridge!.drainOnce();
        expect(published).toBeGreaterThan(0);

        // Give async event handlers a tick + scheduled timer to run.
        await new Promise((resolve) => setImmediate(resolve));
        await new Promise((resolve) => setTimeout(resolve, 50));

        const db = getUnifiedMemory().getDatabase();
        const row = db
          .prepare("SELECT COUNT(*) AS n FROM kv_store WHERE key LIKE 'learning:experience:%'")
          .get() as { n: number };

        expect(row.n).toBeGreaterThan(0);
      }, 30_000);
    }
  );
});

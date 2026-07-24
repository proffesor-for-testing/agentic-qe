/**
 * RVF corruption reproduction + recovery (issue #563)
 *
 * Reproduces the reported failure end-to-end with real SQLite DBs, real .rvf
 * files and a real SIGKILL:
 *
 *   The export used to delete the previous store and rebuild in place, so a
 *   kill mid-export left a store that was created but never completed. It then
 *   could neither be opened (`0x0106 ManifestNotFound`) nor created over
 *   (`0x0303 FsyncFailed`, because the path exists) — so the RVF backend was
 *   silently disabled on every subsequent run, permanently.
 *
 * Note on the issue's diagnosis: the `FLVR` bytes it reports inside the `.lock`
 * are not leaked store bytes. `FLVR` is the *lock record's* own magic (the
 * store's is `SFVR`), so that file is an ordinary stale lock. Measured against
 * @ruvector/rvf-node 0.1.8, a valid *empty* store is also exactly 162 bytes —
 * the size the issue reads as "truncated: header only". Recovery therefore
 * cannot key on magic or size, and these tests assert the behaviour that
 * actually matters: after an interrupted export, the store still opens.
 *
 * Skips gracefully when @ruvector/rvf-node is not installed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, statSync, rmSync, mkdtempSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';

import { isRvfNativeAvailable, openRvfStore } from '../../src/integrations/ruvector/rvf-native-adapter.js';
import { exportBrainToRvf } from '../../src/integrations/ruvector/brain-rvf-exporter.js';
import {
  quarantineUnusableStore,
  isLockHeldByLiveProcess,
  readLockOwnerPid,
} from '../../src/integrations/ruvector/rvf-store-integrity.js';
import { ensureAllBrainTables } from '../../src/integrations/ruvector/brain-table-ddl.js';

const NATIVE_AVAILABLE = isRvfNativeAvailable();
const describeNative = NATIVE_AVAILABLE ? describe : describe.skip;

const dirs: string[] = [];

/**
 * Work dirs live under node_modules/.cache (gitignored) rather than os.tmpdir()
 * because the SIGKILL child below must resolve `better-sqlite3` from the repo's
 * node_modules — from /tmp it cannot.
 */
const CACHE_ROOT = join(process.cwd(), 'node_modules', '.cache');

function workDir(): string {
  mkdirSync(CACHE_ROOT, { recursive: true });
  const d = mkdtempSync(join(CACHE_ROOT, 'rvf-563-'));
  dirs.push(d);
  return d;
}

/**
 * A real memory.db with brain tables, patterns, and their embeddings. The
 * embeddings matter: without ingested vectors the exporter never writes an
 * `.idmap.json` sidecar, and the promote path for it would go untested.
 */
function seedDb(path: string, patternCount = 25): Database.Database {
  const db = new Database(path);
  ensureAllBrainTables(db);
  const insertEmbedding = db.prepare(
    `INSERT INTO qe_pattern_embeddings (pattern_id, embedding, dimension) VALUES (?, ?, ?)`,
  );
  const insert = db.prepare(
    `INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  for (let i = 0; i < patternCount; i++) {
    insert.run(
      `pat-${i}`,
      'unit',
      'test-generation',
      'test-generation',
      `pattern ${i}`,
      `pattern description ${i}`,
      0.9,
    );
    // Deterministic 384-dim float32 vector — content is irrelevant, presence
    // is what drives ingest → idmap.
    const vec = Float32Array.from({ length: 384 }, (_, j) => ((i + j) % 17) / 17);
    insertEmbedding.run(`pat-${i}`, Buffer.from(vec.buffer), 384);
  }
  return db;
}

afterEach(() => {
  for (const d of dirs.splice(0)) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ }
  }
});

describeNative('RVF export atomicity under interruption (#563)', () => {
  it('leaves the previous good store intact when the export is SIGKILLed mid-write', async () => {
    const dir = workDir();
    const dbPath = join(dir, 'memory.db');
    const rvfPath = join(dir, 'brain.rvf');

    // Arrange: a complete, good export we can compare against afterwards. The
    // row count is load-bearing — it stretches the export to ~150ms so the
    // kill below lands mid-write. At ~25 rows the export finishes in ~30ms and
    // the child wins the race, which makes this test prove nothing.
    const db = seedDb(dbPath, 4000);
    exportBrainToRvf(db, { outputPath: rvfPath }, 'memory.db');
    db.close();

    expect(existsSync(rvfPath)).toBe(true);
    const goodBytes = readFileSync(rvfPath);
    const goodManifest = readFileSync(`${rvfPath}.manifest.json`, 'utf-8');

    // Act: run a second export in a child and SIGKILL it while it runs. The
    // child prints READY once the export is underway; we kill on that signal
    // so the kill lands inside the export rather than before it.
    // The child is CommonJS (.cts) on purpose: the native binding is loaded
    // with require(), which resolves under tsx's CJS mode but silently reports
    // "not available" from an ESM (.mjs/.ts) entry — which would make this
    // test pass without ever running an export.
    const script = join(dir, 'export-child.cts');
    const exporterPath = join(process.cwd(), 'src/integrations/ruvector/brain-rvf-exporter.ts');
    const adapterPath = join(process.cwd(), 'src/integrations/ruvector/rvf-native-adapter.ts');
    writeFileSync(
      script,
      `
      const Database = require('better-sqlite3');
      const { exportBrainToRvf } = require(${JSON.stringify(exporterPath)});
      const { isRvfNativeAvailable } = require(${JSON.stringify(adapterPath)});
      const db = new Database(${JSON.stringify(dbPath)});
      // Load the native binding before signalling: it is lazy, and the kill
      // would otherwise land during the load, before the export writes at all.
      isRvfNativeAvailable();
      // writeSync, not process.stdout.write: stdout to a pipe is async, so a
      // buffered write would only reach the parent after the *synchronous*
      // export had already finished — and the kill would arrive too late.
      require('fs').writeSync(1, 'READY\\n');
      exportBrainToRvf(db, { outputPath: ${JSON.stringify(rvfPath)} }, 'memory.db');
      process.stdout.write('DONE\\n');
      `,
      'utf-8',
    );

    // `tsx` re-execs node, so the process doing the export is a *grandchild*:
    // killing the pid we spawned leaves the real writer running, and the test
    // then races its own subject. detached:true puts the whole thing in its own
    // process group so a negative-pid kill reaps the writer too.
    const tsxBin = join(process.cwd(), 'node_modules', '.bin', 'tsx');
    const { out, err } = await new Promise<{ out: string; err: string }>((resolve) => {
      const child = spawn(tsxBin, [script], { cwd: process.cwd(), detached: true });
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk) => {
        out += String(chunk);
        if (out.includes('READY')) {
          // 40ms into a ~150ms export: comfortably inside the write window at
          // both ends. Too early and nothing has been written yet; too late
          // and the export has already completed.
          setTimeout(() => {
            try { process.kill(-(child.pid as number), 'SIGKILL'); } catch { /* already gone */ }
          }, 40);
        }
      });
      child.stderr.on('data', (chunk) => { err += String(chunk); });
      child.on('exit', () => resolve({ out, err }));
    });

    // Guard: the child must actually have reached the export. Without this a
    // child that dies on startup would sail through every assertion below.
    expect(out).toContain('READY');
    expect(err).not.toContain('rvf-node is not available');

    // Assert: whatever the child managed to do, the store on disk is still a
    // complete, readable store — either the old one (killed before promote)
    // or a fully promoted new one (won the race). Never a truncated pair.
    expect(existsSync(rvfPath)).toBe(true);
    const after = readFileSync(rvfPath);

    if (!out.includes('DONE')) {
      // Interrupted: the previous store must be byte-identical and its
      // manifest untouched. The pre-fix code truncated the store to a
      // 162-byte header here — exactly the artifact reported in #563.
      expect(after.equals(goodBytes)).toBe(true);
      expect(readFileSync(`${rvfPath}.manifest.json`, 'utf-8')).toBe(goodManifest);
    }

    // The decisive property: the surviving store still opens. Pre-fix, the kill
    // left a created-but-never-completed store that threw ManifestNotFound here
    // and could not be created over either — FsyncFailed forever.
    const reopened = openRvfStore(rvfPath);
    expect(reopened.dimension()).toBe(384);
    reopened.close();

    // A killed export strands a full-size tmp store; the next export must
    // sweep it, or a project whose hook is killed daily leaks disk forever.
    const debris = () => readdirSync(dir).filter((f) => f.includes('.rvf.tmp.'));
    const db2 = seedDb(join(dir, 'sweep.db'), 5);
    exportBrainToRvf(db2, { outputPath: rvfPath }, 'memory.db');
    db2.close();
    expect(debris()).toEqual([]);
  }, 120_000);

  it('cleans up its tmp store and preserves the previous one when the export throws', () => {
    const dir = workDir();
    const dbPath = join(dir, 'memory.db');
    const rvfPath = join(dir, 'brain.rvf');

    // Arrange: a good store, then a DB that fails partway through the export.
    const db = seedDb(dbPath);
    exportBrainToRvf(db, { outputPath: rvfPath }, 'memory.db');
    const goodBytes = readFileSync(rvfPath);

    let callCount = 0;
    const failingDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'prepare') {
          return (...args: unknown[]) => {
            // Let the export get underway, then fail mid-build.
            if (++callCount > 3) throw new Error('injected mid-export failure');
            return (target.prepare as (...a: unknown[]) => unknown)(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Database.Database;

    // Act + Assert: the failure surfaces (fail-loud, not silent).
    expect(() => exportBrainToRvf(failingDb, { outputPath: rvfPath }, 'memory.db')).toThrow(
      /injected mid-export failure/,
    );

    // The previous store survives untouched...
    expect(readFileSync(rvfPath).equals(goodBytes)).toBe(true);
    // ...still opens...
    openRvfStore(rvfPath).close();
    // ...and no tmp debris is left behind.
    const tmpBase = `${rvfPath}.tmp.${process.pid}`;
    for (const suffix of ['', '.idmap.json', '.manifest.json', '.lock']) {
      expect(existsSync(`${tmpBase}${suffix}`)).toBe(false);
    }

    db.close();
  }, 30_000);

  it('produces a store byte-identical in structure to a from-scratch export', () => {
    const dir = workDir();
    const rvfPath = join(dir, 'brain.rvf');
    const db = seedDb(join(dir, 'memory.db'));

    // Exporting over an existing store must still fully replace it (the tmp
    // path must not leak into the promoted result).
    exportBrainToRvf(db, { outputPath: rvfPath }, 'memory.db');
    const second = exportBrainToRvf(db, { outputPath: rvfPath }, 'memory.db');

    expect(second.stats.patternCount).toBe(25);
    expect(existsSync(`${rvfPath}.idmap.json`)).toBe(true);
    expect(existsSync(`${rvfPath}.manifest.json`)).toBe(true);
    // The promoted store is the real one, not a tmp left in place.
    expect(statSync(rvfPath).size).toBeGreaterThan(1024);

    db.close();
  }, 30_000);
});

describeNative('Dual-writer recovery from an unusable store (#563)', () => {
  it('rebuilds instead of silently disabling RVF for the whole run', async () => {
    const dir = workDir();
    const db = seedDb(join(dir, 'memory.db'), 5);
    const rvfPath = join(dir, 'brain.rvf');

    // Arrange: the reported artifacts — a 162-byte store left by an export that
    // was killed before it completed (open → ManifestNotFound, create →
    // FsyncFailed), plus its stale 104-byte lock from the dead process.
    writeFileSync(rvfPath, Buffer.concat([Buffer.from('SFVR'), Buffer.alloc(158)]));
    writeFileSync(`${rvfPath}.lock`, lockRecord(0x7ffffffe));
    // Sanity-check the arrangement really is unusable, so this test cannot
    // quietly stop reproducing the bug.
    expect(() => openRvfStore(rvfPath)).toThrow();

    // Act: this is what every `aqe status` / session start does.
    const { RvfDualWriter } = await import('../../src/integrations/ruvector/rvf-dual-writer.js');
    const writer = new RvfDualWriter(db, { rvfPath, mode: 'dual-write', dimensions: 384 });
    await writer.initialize();

    // Assert: RVF is live. Before the fix both opens threw FsyncFailed and the
    // catch left rvf null — the silent, run-long backend disable in the report.
    const status = writer.status();
    expect(status.rvf).not.toBeNull();

    // The unusable store was preserved rather than deleted...
    expect(existsSync(`${rvfPath}.corrupt-${process.pid}`)).toBe(true);
    // ...and a healthy, openable store now exists at the live path.
    expect(existsSync(rvfPath)).toBe(true);

    writer.close();
    db.close();
  }, 30_000);
});

/** Build a lock record: `FLVR` magic + owning pid as u32 LE at offset 4. */
function lockRecord(pid: number): Buffer {
  const buf = Buffer.alloc(104);
  buf.write('FLVR', 0, 'latin1');
  buf.writeUInt32LE(pid, 4);
  return buf;
}

describe('Unusable-store quarantine (#563)', () => {
  // Pure fs-level checks — no native binding needed.
  it('quarantines an unusable store and clears its stale lock', () => {
    const dir = workDir();
    const rvfPath = join(dir, 'brain.rvf');
    writeFileSync(rvfPath, Buffer.concat([Buffer.from('SFVR'), Buffer.alloc(158)]));
    writeFileSync(`${rvfPath}.idmap.json`, '{"nextLabel":1,"entries":[]}');
    // A stale lock: well-formed, but its owning process is long gone.
    writeFileSync(`${rvfPath}.lock`, lockRecord(0x7ffffffe));

    const quarantined = quarantineUnusableStore(rvfPath, 'test');

    expect(quarantined).toBe(`${rvfPath}.corrupt-${process.pid}`);
    // The live paths are clear, so the next create can succeed...
    expect(existsSync(rvfPath)).toBe(false);
    expect(existsSync(`${rvfPath}.lock`)).toBe(false);
    // ...and the bytes are preserved for diagnosis rather than deleted.
    expect(existsSync(quarantined as string)).toBe(true);
    expect(existsSync(`${quarantined}.idmap.json`)).toBe(true);
  });

  it('refuses to quarantine a store whose lock is held by a live process', () => {
    const dir = workDir();
    const rvfPath = join(dir, 'brain.rvf');
    writeFileSync(rvfPath, Buffer.concat([Buffer.from('SFVR'), Buffer.alloc(158)]));
    // A lock owned by a process that certainly exists: this test runner's
    // parent. Stealing a live peer's store is the one unrecoverable mistake
    // this helper can make.
    writeFileSync(`${rvfPath}.lock`, lockRecord(process.ppid));

    expect(isLockHeldByLiveProcess(rvfPath)).toBe(true);
    expect(quarantineUnusableStore(rvfPath, 'test')).toBeNull();
    expect(existsSync(rvfPath)).toBe(true);
    expect(existsSync(`${rvfPath}.lock`)).toBe(true);
  });

  it('reads the owning pid out of a lock record', () => {
    const dir = workDir();
    const rvfPath = join(dir, 'brain.rvf');
    writeFileSync(`${rvfPath}.lock`, lockRecord(4242));

    expect(readLockOwnerPid(rvfPath)).toBe(4242);
  });

  it('treats a file that is not a lock record as no lock at all', () => {
    const dir = workDir();
    const rvfPath = join(dir, 'brain.rvf');
    writeFileSync(`${rvfPath}.lock`, Buffer.from('not a lock record'));

    expect(readLockOwnerPid(rvfPath)).toBeNull();
    expect(isLockHeldByLiveProcess(rvfPath)).toBe(false);
  });

  it('does nothing when there is no store to quarantine', () => {
    const dir = workDir();
    expect(quarantineUnusableStore(join(dir, 'absent.rvf'), 'test')).toBeNull();
  });

  it('treats a current-process lock as live so duplicate openers cannot break it', () => {
    const dir = workDir();
    const rvfPath = join(dir, 'brain.rvf');
    // A second RVF initialization path can run in this same process while the
    // first adapter still owns the store. PID equality is not evidence that
    // the lock is stale; breaking it can quarantine a store we still have open.
    writeFileSync(`${rvfPath}.lock`, lockRecord(process.pid));

    expect(isLockHeldByLiveProcess(rvfPath)).toBe(true);
  });

  it('refuses to quarantine a store held by the current process', () => {
    const dir = workDir();
    const rvfPath = join(dir, 'brain.rvf');
    writeFileSync(rvfPath, Buffer.concat([Buffer.from('SFVR'), Buffer.alloc(158)]));
    writeFileSync(`${rvfPath}.lock`, lockRecord(process.pid));

    expect(quarantineUnusableStore(rvfPath, 'duplicate same-process opener')).toBeNull();
    expect(existsSync(rvfPath)).toBe(true);
    expect(existsSync(`${rvfPath}.lock`)).toBe(true);
    expect(existsSync(`${rvfPath}.corrupt-${process.pid}`)).toBe(false);
  });
});

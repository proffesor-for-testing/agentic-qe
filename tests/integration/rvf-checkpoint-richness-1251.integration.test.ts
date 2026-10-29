/**
 * #1251: the Stop-hook checkpoint exports to a temp path, then renames it over
 * aqe.rvf. `compareWithPath` names the published checkpoint so the #629 guard
 * compares against it; the `checkpoint` policy refuses a collapsed table and
 * tolerates routine retention. Real SQLite and real .rvf files in a tmp dir.
 *
 * Skips gracefully when @ruvector/rvf-node is not installed.
 */

import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

import { isRvfNativeAvailable } from '../../src/integrations/ruvector/rvf-native-adapter.js';
import { exportBrainToRvf } from '../../src/integrations/ruvector/brain-rvf-exporter.js';
import { ensureAllBrainTables } from '../../src/integrations/ruvector/brain-table-ddl.js';

const describeNative = isRvfNativeAvailable() ? describe : describe.skip;
const CACHE_ROOT = join(process.cwd(), 'node_modules', '.cache');
const dirs: string[] = [];

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function workDir(): string {
  mkdirSync(CACHE_ROOT, { recursive: true });
  const d = mkdtempSync(join(CACHE_ROOT, 'rvf-1251-'));
  dirs.push(d);
  return d;
}

function seedDb(path: string, patterns: number, routingOutcomes: number): Database.Database {
  const db = new Database(path);
  ensureAllBrainTables(db);
  const pattern = db.prepare(`INSERT INTO qe_patterns (id, pattern_type, qe_domain, domain, name)
    VALUES (?, 'unit', 'test-generation', 'test-generation', ?)`);
  for (let i = 0; i < patterns; i++) pattern.run(`pat-${i}`, `pattern ${i}`);
  const outcome = db.prepare(`INSERT INTO routing_outcomes (id, task_json, decision_json, used_agent,
    followed_recommendation, success, quality_score, duration_ms) VALUES (?, '{}', '{}', 'a', 1, 1, 0.9, 1)`);
  for (let i = 0; i < routingOutcomes; i++) outcome.run(`r-${i}`);
  return db;
}

/** A published checkpoint of a rich DB, and a temp path the hook would export to. */
function checkpoint(): { dir: string; rvf: string; tmp: string; bytes: Buffer } {
  const dir = workDir();
  const rvf = join(dir, 'aqe.rvf');
  const rich = seedDb(join(dir, 'rich.db'), 25, 100);
  try { exportBrainToRvf(rich, { outputPath: rvf }); } finally { rich.close(); }
  return { dir, rvf, tmp: join(dir, 'aqe.rvf.tmp-1'), bytes: readFileSync(rvf) };
}

describeNative('checkpoint richness guard (#1251)', { timeout: 60_000 }, () => {
  it('should_replaceARicherCheckpoint_when_theTempExportIsNotComparedWithIt', () => {
    // The pre-#1251 hook: nothing exists at the temp path, so nothing is compared.
    const c = checkpoint();
    const seed = seedDb(join(c.dir, 'seed.db'), 5, 0);
    try {
      expect(exportBrainToRvf(seed, { outputPath: c.tmp }).stats.patternCount).toBe(5);
    } finally {
      seed.close();
    }
  });

  it('should_refuseAndWriteNoStore_when_theSeedDbIsComparedWithTheCheckpoint', () => {
    const c = checkpoint();
    const seed = seedDb(join(c.dir, 'seed.db'), 5, 0);
    try {
      expect(() => exportBrainToRvf(seed, { outputPath: c.tmp, compareWithPath: c.rvf, richnessPolicy: 'checkpoint' }))
        .toThrow(/RVF_MIRROR_RICHER.*qe_patterns 25 -> 5.*routing_outcomes 100 -> 0/);
    } finally {
      seed.close();
    }
    expect(existsSync(c.tmp)).toBe(false);
    expect(readFileSync(c.rvf).equals(c.bytes)).toBe(true);
  });

  it('should_export_when_retentionTrimmedRoutingOutcomes', () => {
    const c = checkpoint();
    const trimmed = seedDb(join(c.dir, 'trimmed.db'), 25, 90);
    try {
      const manifest = exportBrainToRvf(trimmed, { outputPath: c.tmp, compareWithPath: c.rvf, richnessPolicy: 'checkpoint' });
      expect(manifest.stats.tableCounts?.routing_outcomes).toBe(90);
    } finally {
      trimmed.close();
    }
    expect(existsSync(c.tmp)).toBe(true);
  });

  it('should_refuseTheSameTrim_when_thePolicyIsStrict', () => {
    const c = checkpoint();
    const trimmed = seedDb(join(c.dir, 'trimmed.db'), 25, 90);
    try {
      expect(() => exportBrainToRvf(trimmed, { outputPath: c.tmp, compareWithPath: c.rvf }))
        .toThrow(/RVF_MIRROR_RICHER.*routing_outcomes 100 -> 90/);
    } finally {
      trimmed.close();
    }
  });
});

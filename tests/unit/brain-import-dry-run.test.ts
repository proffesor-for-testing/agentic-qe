import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportBrain, importBrain } from '../../src/integrations/ruvector/brain-exporter.js';
import { exportBrainToRvf, importBrainFromRvf } from '../../src/integrations/ruvector/brain-rvf-exporter.js';
import { ensureTargetTables } from '../../src/integrations/ruvector/brain-shared.js';
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
function snapshot(db: Database.Database) {
  const schema = db.prepare(`SELECT type, name, sql FROM sqlite_master ORDER BY type, name`).all();
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as {name: string}[];
  return { schema, rows: tables.map(({name}) => [name, db.prepare(`SELECT * FROM "${name}"`).all()]) };
}
for (const format of ['jsonl', 'rvf'] as const) {
  describe(`${format} dry run`, () => {
    it.each(['skip-conflicts', 'latest-wins', 'highest-confidence'] as const)('predicts %s and rolls back rows and schema', (strategy) => {
      const source = new Database(':memory:');
      const target = new Database(':memory:');
      const dir = mkdtempSync(join(tmpdir(), 'aqe-dry-run-')); dirs.push(dir);
      try {
        ensureTargetTables(source);
        source.prepare(`INSERT INTO qe_patterns(id,name,pattern_type,qe_domain,domain,confidence,updated_at)
          VALUES ('same', 'Same ID', 'test-template', 'test-generation', 'test-generation', 0.9, '2026-09-01')`).run();
        source.prepare(`INSERT INTO witness_chain(prev_hash,action_hash,action_type,timestamp,actor)
          VALUES ('parent','hash','PATTERN_CREATE','2026-09-01','test')`).run();
        // A partially initialized target: every table absent here must remain absent.
        target.exec((source.prepare("SELECT sql FROM sqlite_master WHERE name='qe_patterns'").get() as {sql:string}).sql);
        target.prepare(`INSERT INTO qe_patterns(id,name,pattern_type,qe_domain,domain,confidence,updated_at)
          VALUES ('same', 'Same ID', 'test-template', 'test-generation', 'test-generation', 0.4, '2025-01-01')`).run();
        target.exec('CREATE TABLE unrelated (value TEXT); INSERT INTO unrelated VALUES (\'preserved\')');
        const outputPath = join(dir, format === 'rvf' ? 'brain.rvf' : 'export');
        if (format === 'jsonl') exportBrain(source, { outputPath });
        else exportBrainToRvf(source, { outputPath, dimension: 2 });
        const run = (dryRun: boolean) => format === 'jsonl'
          ? importBrain(target, outputPath, { mergeStrategy: strategy, dryRun })
          : importBrainFromRvf(target, outputPath, { mergeStrategy: strategy, dryRun });
        const before = snapshot(target);
        const fileBefore = format === 'rvf' ? readFileSync(outputPath) : null;
        const projected = run(true);
        expect(snapshot(target)).toEqual(before);
        if (fileBefore) expect(readFileSync(outputPath)).toEqual(fileBefore);
        expect(projected.conflicts).toBe(1);
        expect(projected.imported).toBe(strategy === 'skip-conflicts' ? 1 : 2);
        expect(projected.skipped).toBe(strategy === 'skip-conflicts' ? 2 : 1); // includes source witness row
        expect(run(false)).toEqual(projected);
        expect(target.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
      } finally { source.close(); target.close(); }
    });
  });
}


it('does not count skipped RVF vectors and rolls back inside a caller transaction', () => {
  const source = new Database(':memory:');
  const target = new Database(':memory:');
  const dir = mkdtempSync(join(tmpdir(), 'aqe-dry-vectors-')); dirs.push(dir);
  try {
    for (const db of [source, target]) {
      ensureTargetTables(db);
      db.prepare(`INSERT INTO qe_patterns(id,name,pattern_type,qe_domain,domain)
        VALUES ('same','Same','test-template','test-generation','test-generation')`).run();
      db.prepare('INSERT INTO qe_pattern_embeddings(pattern_id,embedding,dimension) VALUES (?,?,2)')
        .run('same', Buffer.from(new Float32Array(db === source ? [1,0] : [0,1]).buffer));
    }
    const outputPath = join(dir, 'brain.rvf');
    exportBrainToRvf(source, { outputPath, dimension: 2 });
    target.transaction(() => {
      target.exec("CREATE TABLE outer_write(value TEXT); INSERT INTO outer_write VALUES ('retained')");
      const before = snapshot(target);
      const dry = importBrainFromRvf(target, outputPath, { mergeStrategy: 'skip-conflicts', dryRun: true });
      expect(dry).toMatchObject({ imported: 1, skipped: 2, conflicts: 2, embeddingsRestored: 0 });
      expect(snapshot(target)).toEqual(before);
      expect(target.inTransaction).toBe(true);
    })();
    expect(target.prepare('SELECT * FROM outer_write').all()).toEqual([{value: 'retained'}]);
    expect(importBrainFromRvf(target, outputPath, { mergeStrategy: 'skip-conflicts' }).embeddingsRestored).toBe(0);
  } finally { source.close(); target.close(); }
});

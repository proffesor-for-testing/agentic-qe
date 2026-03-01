/**
 * Direct RVF import — bypasses tsx/TS adapter issues.
 * Uses @ruvector/rvf-node native binding directly.
 * Run with: node scripts/rvf-import-direct.mjs
 */
import { createRequire } from 'module';
import Database from 'better-sqlite3';
import { resolve } from 'path';

const require = createRequire(import.meta.url);

const dbPath = resolve('.agentic-qe/memory.db');
const rvfPath = resolve("data/Dragan's aqe.rvf");

// Load native binding
let rvfNode;
try {
  rvfNode = require('@ruvector/rvf-node');
  if (!rvfNode.RvfDatabase && rvfNode.default?.RvfDatabase) {
    rvfNode = rvfNode.default;
  }
} catch (e) {
  console.error('Cannot load @ruvector/rvf-node:', e.message);
  process.exit(1);
}

console.log('Opening RVF file:', rvfPath);
const rvfDb = rvfNode.RvfDatabase.openReadonly(rvfPath);

// Extract kernel (embedded JSON brain data)
const kernel = rvfDb.extractKernel();
if (!kernel || !kernel.image) {
  console.error('No brain data found in RVF file');
  rvfDb.close();
  process.exit(1);
}

const brainData = JSON.parse(kernel.image.toString('utf-8'));
console.log('Brain data version:', brainData.version);
console.log('Patterns:', brainData.patterns?.length ?? 0);
console.log('Q-values:', brainData.qValues?.length ?? 0);
console.log('Dream insights:', brainData.dreamInsights?.length ?? 0);
console.log('Witness chain:', brainData.witnessChain?.length ?? 0);
console.log('Domains:', brainData.domains?.join(', ') ?? 'none');

rvfDb.close();

// Open SQLite
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF');

// Pre-import counts
const preCounts = {
  qe_patterns: db.prepare('SELECT COUNT(*) as c FROM qe_patterns').get().c,
  rl_q_values: db.prepare('SELECT COUNT(*) as c FROM rl_q_values').get().c,
};
console.log('\nPre-import counts:', JSON.stringify(preCounts));

// Ensure tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS dream_insights (
    id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL, insight_type TEXT NOT NULL,
    source_concepts TEXT NOT NULL, description TEXT NOT NULL,
    novelty_score REAL DEFAULT 0.5, confidence_score REAL DEFAULT 0.5,
    actionable INTEGER DEFAULT 0, applied INTEGER DEFAULT 0,
    suggested_action TEXT, pattern_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS witness_chain (
    id INTEGER PRIMARY KEY AUTOINCREMENT, prev_hash TEXT NOT NULL,
    action_hash TEXT NOT NULL, action_type TEXT NOT NULL,
    action_data TEXT, timestamp TEXT NOT NULL, actor TEXT NOT NULL
  );
`);

// Import with skip-conflicts strategy (don't overwrite existing)
let imported = 0;
let skipped = 0;

// -- Patterns --
if (brainData.patterns?.length) {
  const checkStmt = db.prepare('SELECT id FROM qe_patterns WHERE id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO qe_patterns (
      id, pattern_type, qe_domain, domain, name, description,
      confidence, usage_count, success_rate, quality_score, tier,
      template_json, context_json, created_at, updated_at, last_used_at,
      successful_uses, tokens_used, input_tokens, output_tokens,
      latency_ms, reusable, reuse_count, average_token_savings, total_tokens_saved
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((patterns) => {
    for (const p of patterns) {
      if (checkStmt.get(p.id)) { skipped++; continue; }
      insertStmt.run(
        p.id, p.pattern_type, p.qe_domain, p.domain, p.name, p.description ?? null,
        p.confidence ?? 0.5, p.usage_count ?? 0, p.success_rate ?? 0, p.quality_score ?? 0, p.tier ?? 'short-term',
        p.template_json ?? null, p.context_json ?? null, p.created_at ?? null, p.updated_at ?? null, p.last_used_at ?? null,
        p.successful_uses ?? 0, p.tokens_used ?? null, p.input_tokens ?? null, p.output_tokens ?? null,
        p.latency_ms ?? null, p.reusable ?? 0, p.reuse_count ?? 0, p.average_token_savings ?? 0, p.total_tokens_saved ?? null
      );
      imported++;
    }
  });
  insertMany(brainData.patterns);
  console.log(`Patterns: ${imported} imported, ${skipped} skipped (already exist)`);
}

// -- Q-values --
let qImported = 0, qSkipped = 0;
if (brainData.qValues?.length) {
  const checkStmt = db.prepare('SELECT id FROM rl_q_values WHERE id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value, visits, last_reward, domain, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((qValues) => {
    for (const qv of qValues) {
      if (checkStmt.get(qv.id)) { qSkipped++; continue; }
      insertStmt.run(qv.id, qv.algorithm, qv.agent_id, qv.state_key, qv.action_key,
        qv.q_value, qv.visits, qv.last_reward ?? null, qv.domain ?? null, qv.created_at ?? null, qv.updated_at ?? null);
      qImported++;
    }
  });
  insertMany(brainData.qValues);
  console.log(`Q-values: ${qImported} imported, ${qSkipped} skipped`);
}

// -- Dream insights --
let dImported = 0, dSkipped = 0;
if (brainData.dreamInsights?.length) {
  const checkStmt = db.prepare('SELECT id FROM dream_insights WHERE id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO dream_insights (id, cycle_id, insight_type, source_concepts, description,
      novelty_score, confidence_score, actionable, applied, suggested_action, pattern_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((insights) => {
    for (const ins of insights) {
      if (checkStmt.get(ins.id)) { dSkipped++; continue; }
      insertStmt.run(ins.id, ins.cycle_id, ins.insight_type, ins.source_concepts, ins.description,
        ins.novelty_score ?? 0.5, ins.confidence_score ?? 0.5, ins.actionable ?? 0, ins.applied ?? 0,
        ins.suggested_action ?? null, ins.pattern_id ?? null, ins.created_at ?? null);
      dImported++;
    }
  });
  insertMany(brainData.dreamInsights);
  console.log(`Dream insights: ${dImported} imported, ${dSkipped} skipped`);
}

// -- Witness chain --
let wImported = 0, wSkipped = 0;
if (brainData.witnessChain?.length) {
  const checkStmt = db.prepare('SELECT id FROM witness_chain WHERE action_hash = ? AND timestamp = ?');
  const insertStmt = db.prepare(`
    INSERT INTO witness_chain (prev_hash, action_hash, action_type, action_data, timestamp, actor)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((entries) => {
    for (const e of entries) {
      if (checkStmt.get(e.action_hash, e.timestamp)) { wSkipped++; continue; }
      insertStmt.run(e.prev_hash, e.action_hash, e.action_type, e.action_data ?? null, e.timestamp, e.actor);
      wImported++;
    }
  });
  insertMany(brainData.witnessChain);
  console.log(`Witness chain: ${wImported} imported, ${wSkipped} skipped`);
}

// Post-import verification
const postCounts = {
  qe_patterns: db.prepare('SELECT COUNT(*) as c FROM qe_patterns').get().c,
  rl_q_values: db.prepare('SELECT COUNT(*) as c FROM rl_q_values').get().c,
  dream_insights: db.prepare('SELECT COUNT(*) as c FROM dream_insights').get().c,
  witness_chain: db.prepare('SELECT COUNT(*) as c FROM witness_chain').get().c,
};
console.log('\nPost-import counts:', JSON.stringify(postCounts, null, 2));
console.log(`\nTotal imported: ${imported + qImported + dImported + wImported}`);
console.log(`Total skipped: ${skipped + qSkipped + dSkipped + wSkipped}`);

// Integrity check
const integrity = db.prepare('PRAGMA integrity_check').get();
console.log('Integrity:', integrity.integrity_check);

db.close();

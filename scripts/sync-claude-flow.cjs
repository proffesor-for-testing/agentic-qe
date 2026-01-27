#!/usr/bin/env node
/**
 * Sync Claude Flow memories to AQE V3 database
 */
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const claudeFlowPath = path.join(projectRoot, '.claude-flow', 'memory', 'store.json');
const aqeDbPath = path.join(projectRoot, 'v3', '.agentic-qe', 'memory.db');

console.log('Claude Flow:', claudeFlowPath);
console.log('AQE DB:', aqeDbPath);

if (!fs.existsSync(claudeFlowPath)) {
  console.error('Claude Flow store not found');
  process.exit(1);
}

if (!fs.existsSync(aqeDbPath)) {
  console.error('AQE DB not found');
  process.exit(1);
}

const store = JSON.parse(fs.readFileSync(claudeFlowPath, 'utf-8'));
const entries = store.entries || store;
const keys = Object.keys(entries).filter(k => !k.startsWith('_') && k !== 'version');
console.log('Entries to sync:', keys.length);

const Database = require('better-sqlite3');
const db = new Database(aqeDbPath);
db.pragma('journal_mode = WAL');

const insert = db.prepare(`
  INSERT OR REPLACE INTO kv_store (key, namespace, value, created_at)
  VALUES (?, ?, ?, ?)
`);

let count = 0;
let learning = 0;

// Also insert into sona_patterns for learning-related entries
const insertSona = db.prepare(`
  INSERT OR REPLACE INTO sona_patterns
  (id, type, domain, action_type, outcome_reward, outcome_success, metadata, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);

for (const key of keys) {
  const value = entries[key];

  // Always store in kv_store
  insert.run(
    'cf:' + key,
    'claude-flow',
    JSON.stringify(value),
    Date.now()
  );
  count++;

  // Store learning-relevant entries in sona_patterns too
  const keyLower = key.toLowerCase();
  if (keyLower.includes('pattern') || keyLower.includes('analysis') ||
      keyLower.includes('learning') || keyLower.includes('agent') ||
      keyLower.includes('outcome') || keyLower.includes('quality')) {

    // Determine domain
    let domain = 'general';
    const domains = ['test-generation', 'coverage-analysis', 'security-compliance',
                     'quality-assessment', 'code-intelligence'];
    for (const d of domains) {
      if (keyLower.includes(d.replace('-', ''))) {
        domain = d;
        break;
      }
    }

    const id = 'cf-' + key.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 60);

    try {
      insertSona.run(
        id,
        'claude-flow-import',
        domain,
        'learn-from-session',
        0.7, // Assume successful since it was stored
        1,
        JSON.stringify({ sourceKey: key, importedAt: new Date().toISOString() })
      );
      learning++;
    } catch (e) {
      // Ignore duplicate errors
    }
  }
}

db.close();
console.log('Synced to kv_store:', count, 'entries');
console.log('Synced to sona_patterns:', learning, 'learning entries');

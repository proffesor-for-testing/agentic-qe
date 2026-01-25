#!/usr/bin/env node
/**
 * Intelligence Sync Worker
 *
 * Syncs data between AQE memory.db and RuVector intelligence.json
 * Can be triggered by hooks or run as a background worker.
 *
 * Events that trigger sync:
 * - Stop (session end)
 * - PreCompact (before context compression)
 * - Manual via: node scripts/workers/sync-intelligence.js
 */

const Database = require('better-sqlite3');
const fs = require('fs');

const MEMORY_DB = '.agentic-qe/memory.db';
const INTELLIGENCE_FILE = '.ruvector/intelligence.json';
const SYNC_STATE_FILE = '.ruvector/sync-state.json';

// Load sync state
function loadSyncState() {
  if (fs.existsSync(SYNC_STATE_FILE)) {
    return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
  }
  return { lastSync: 0, syncCount: 0 };
}

function saveSyncState(state) {
  fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
}

async function syncIntelligence(options = {}) {
  const { verbose = false, force = false } = options;
  const startTime = Date.now();

  if (verbose) console.log('🔄 Intelligence Sync Worker\n');

  // Check files exist
  if (!fs.existsSync(MEMORY_DB)) {
    if (verbose) console.log('⚠️  Memory DB not found, skipping sync');
    return { synced: 0, skipped: true };
  }

  if (!fs.existsSync(INTELLIGENCE_FILE)) {
    if (verbose) console.log('⚠️  Intelligence file not found, skipping sync');
    return { synced: 0, skipped: true };
  }

  const syncState = loadSyncState();
  const db = new Database(MEMORY_DB, { readonly: true });
  let intelligence = JSON.parse(fs.readFileSync(INTELLIGENCE_FILE, 'utf8'));

  // Initialize structures
  intelligence.patterns = intelligence.patterns || {};
  intelligence.memories = intelligence.memories || [];
  intelligence.learning = intelligence.learning || { qTables: {}, rewardHistory: [] };

  const stats = { newExperiences: 0, newPatterns: 0, newQValues: 0 };

  // 1. Sync new captured_experiences since last sync
  if (verbose) console.log('📋 Syncing new experiences...');
  const newExperiences = db.prepare(`
    SELECT id, agent_type, task_type, outcome, created_at
    FROM captured_experiences
    WHERE created_at > ?
    ORDER BY created_at ASC
  `).all(syncState.lastSync);

  newExperiences.forEach(exp => {
    let outcome;
    try { outcome = JSON.parse(exp.outcome); } catch(e) { outcome = {}; }

    // Add to trajectories
    intelligence.trajectories = intelligence.trajectories || [];
    const exists = intelligence.trajectories.some(t => t.id === `exp_${exp.id}`);
    if (!exists) {
      intelligence.trajectories.push({
        id: `exp_${exp.id}`,
        agent: exp.agent_type,
        task: exp.task_type,
        outcome: outcome.success ? 'success' : 'unknown',
        quality: outcome.quality_score || 0.7,
        created: exp.created_at,
        source: 'sync'
      });
      stats.newExperiences++;
    }
  });

  // 2. Sync new patterns
  if (verbose) console.log('📋 Syncing new patterns...');
  const newPatterns = db.prepare(`
    SELECT pattern, confidence, domain, agent_id
    FROM patterns
    WHERE created_at > ?
  `).all(syncState.lastSync);

  newPatterns.forEach(p => {
    const state = `qe:${p.domain || 'general'}:${p.pattern.substring(0, 40)}`;
    const agent = p.agent_id || 'qe-agent';

    if (!intelligence.patterns[state]) {
      intelligence.patterns[state] = {};
    }
    intelligence.patterns[state][agent] = (intelligence.patterns[state][agent] || 0) + p.confidence * 10;
    stats.newPatterns++;
  });

  // 3. Sync new Q-values
  if (verbose) console.log('📋 Syncing Q-values...');
  const newQValues = db.prepare(`
    SELECT state_key, action_key, q_value
    FROM q_values
    WHERE last_updated > datetime(?, 'unixepoch', 'localtime')
  `).all(Math.floor(syncState.lastSync / 1000));

  newQValues.forEach(qv => {
    const state = `qe:${qv.state_key}`;
    if (!intelligence.learning.qTables[state]) {
      intelligence.learning.qTables[state] = {};
    }
    intelligence.learning.qTables[state][qv.action_key] = qv.q_value;
    stats.newQValues++;
  });

  // 4. Update stats
  intelligence.stats = intelligence.stats || {};
  intelligence.stats.total_patterns = Object.keys(intelligence.patterns).length;
  intelligence.stats.total_memories = intelligence.memories.length;
  intelligence.stats.total_trajectories = (intelligence.trajectories || []).length;
  intelligence.stats.last_sync = new Date().toISOString();

  db.close();

  // Save if there were changes
  const totalSynced = stats.newExperiences + stats.newPatterns + stats.newQValues;
  if (totalSynced > 0 || force) {
    fs.writeFileSync(INTELLIGENCE_FILE, JSON.stringify(intelligence, null, 2));

    // Update sync state
    syncState.lastSync = startTime;
    syncState.syncCount++;
    syncState.lastSyncStats = stats;
    saveSyncState(syncState);
  }

  const duration = Date.now() - startTime;

  if (verbose) {
    console.log(`\n✅ Sync complete in ${duration}ms`);
    console.log(`   New experiences: ${stats.newExperiences}`);
    console.log(`   New patterns: ${stats.newPatterns}`);
    console.log(`   New Q-values: ${stats.newQValues}`);
  }

  return { synced: totalSynced, stats, duration };
}

// Run if called directly
if (require.main === module) {
  syncIntelligence({ verbose: true })
    .then(result => {
      process.exit(result.synced >= 0 ? 0 : 1);
    })
    .catch(err => {
      console.error('❌ Sync failed:', err.message);
      process.exit(1);
    });
}

module.exports = { syncIntelligence };

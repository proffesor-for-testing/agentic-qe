#!/usr/bin/env node
/**
 * Migration Script: .swarm/memory.db → ruvector intelligence.json
 *
 * Migrates swarm coordination data and testing patterns.
 */

const Database = require('better-sqlite3');
const fs = require('fs');

const SWARM_DB_PATH = '.swarm/memory.db';
const INTELLIGENCE_PATH = '.ruvector/intelligence.json';

console.log('🔄 .swarm/memory.db → RuVector Migration\n');

// Check files exist
if (!fs.existsSync(SWARM_DB_PATH)) {
  console.error('❌ Swarm database not found: ' + SWARM_DB_PATH);
  process.exit(1);
}

if (!fs.existsSync(INTELLIGENCE_PATH)) {
  console.error('❌ Intelligence file not found: ' + INTELLIGENCE_PATH);
  process.exit(1);
}

// Backup
const backupPath = INTELLIGENCE_PATH + '.backup.' + Date.now();
fs.copyFileSync(INTELLIGENCE_PATH, backupPath);
console.log('📦 Backup created: ' + backupPath + '\n');

const db = new Database(SWARM_DB_PATH, { readonly: true });
let intelligence = JSON.parse(fs.readFileSync(INTELLIGENCE_PATH, 'utf8'));

// Initialize if needed
intelligence.patterns = intelligence.patterns || {};
intelligence.memories = intelligence.memories || [];
intelligence.trajectories = intelligence.trajectories || [];
intelligence.agents = intelligence.agents || {};
intelligence.learning = intelligence.learning || {
  qTables: {},
  qTables2: {},
  rewardHistory: [],
  trajectories: []
};

const stats = { patterns: 0, memories: 0, metrics: 0, tasks: 0 };

// 1. Migrate patterns (high-value testing patterns)
console.log('📋 Migrating testing patterns...');
const patterns = db.prepare(`
  SELECT id, pattern, confidence, usage_count, metadata
  FROM patterns
  ORDER BY confidence DESC
`).all();

patterns.forEach(p => {
  const state = 'swarm:testing:' + p.pattern.substring(0, 40);
  const agent = 'test-engineer';
  const score = p.confidence * 10;

  // Add to patterns for agent routing
  if (!intelligence.patterns[state]) {
    intelligence.patterns[state] = {};
  }
  intelligence.patterns[state][agent] = (intelligence.patterns[state][agent] || 0) + score;

  // Add to qTables for learning
  if (!intelligence.learning.qTables[state]) {
    intelligence.learning.qTables[state] = {};
  }
  intelligence.learning.qTables[state][agent] = p.confidence;

  // Store as memory too for recall
  intelligence.memories.push({
    id: 'swarm_pattern_' + p.id,
    memory_type: 'testing-pattern',
    content: '[Testing Pattern] ' + p.pattern,
    metadata: {
      confidence: p.confidence,
      usage_count: p.usage_count,
      source: '.swarm/memory.db'
    },
    timestamp: Date.now()
  });

  stats.patterns++;
});
console.log('   ✓ ' + stats.patterns + ' testing patterns migrated');

// 2. Migrate memory_entries (coordination data)
console.log('📋 Migrating coordination entries...');
const entries = db.prepare(`
  SELECT key, partition, value, created_at
  FROM memory_entries
  ORDER BY created_at DESC
`).all();

entries.forEach(mem => {
  let value;
  try {
    value = JSON.parse(mem.value);
  } catch(e) {
    value = { raw: mem.value };
  }

  // Add as memory
  intelligence.memories.push({
    id: 'swarm_coord_' + mem.created_at + '_' + stats.memories,
    memory_type: 'swarm-coordination',
    content: '[' + mem.partition + '] ' + mem.key + ': ' + JSON.stringify(value).substring(0, 300),
    metadata: {
      key: mem.key,
      partition: mem.partition,
      source: '.swarm/memory.db'
    },
    timestamp: mem.created_at
  });

  // Extract task results as trajectories
  if (mem.key.includes('results') || mem.key.includes('/status')) {
    intelligence.trajectories.push({
      id: 'swarm_task_' + stats.tasks,
      agent: value.agent || 'swarm-coordinator',
      task: mem.key,
      steps: [{
        action: mem.key.split('/').pop(),
        result: value,
        timestamp: mem.created_at
      }],
      outcome: value.status === 'completed' ? 'success' : 'unknown',
      quality: value.passRate ? value.passRate / 100 : 0.7,
      source: '.swarm/memory.db',
      created: mem.created_at
    });
    stats.tasks++;
  }

  stats.memories++;
});
console.log('   ✓ ' + stats.memories + ' coordination entries migrated');
console.log('   ✓ ' + stats.tasks + ' task trajectories extracted');

// 3. Migrate performance_metrics
console.log('📋 Migrating performance metrics...');
const metrics = db.prepare(`
  SELECT metric, value, unit, timestamp
  FROM performance_metrics
  ORDER BY timestamp DESC
`).all();

metrics.forEach(m => {
  intelligence.memories.push({
    id: 'swarm_metric_' + m.timestamp + '_' + stats.metrics,
    memory_type: 'performance-baseline',
    content: '[Baseline] ' + m.metric + ': ' + m.value + ' ' + m.unit,
    metadata: {
      metric: m.metric,
      value: m.value,
      unit: m.unit,
      source: '.swarm/memory.db'
    },
    timestamp: m.timestamp
  });
  stats.metrics++;
});
console.log('   ✓ ' + stats.metrics + ' performance metrics migrated');

// 4. Migrate agent_registry
console.log('📋 Migrating agent registry...');
const agents = db.prepare(`
  SELECT id, type, capabilities, status, performance
  FROM agent_registry
`).all();

let agentCount = 0;
agents.forEach(a => {
  let caps, perf;
  try { caps = JSON.parse(a.capabilities); } catch(e) { caps = [a.capabilities]; }
  try { perf = JSON.parse(a.performance); } catch(e) { perf = {}; }

  intelligence.agents['swarm_' + a.id] = {
    type: a.type,
    capabilities: caps,
    status: a.status,
    performance: perf,
    source: '.swarm/memory.db'
  };
  agentCount++;
});
console.log('   ✓ ' + agentCount + ' agents migrated');

// Update stats
intelligence.stats = intelligence.stats || {};
intelligence.stats.total_patterns = Object.keys(intelligence.patterns).length;
intelligence.stats.total_memories = intelligence.memories.length;
intelligence.stats.total_trajectories = intelligence.trajectories.length;
intelligence.stats.swarm_migration_date = new Date().toISOString();

db.close();

// Save
fs.writeFileSync(INTELLIGENCE_PATH, JSON.stringify(intelligence, null, 2));

console.log('\n✅ Migration complete!\n');
console.log('📊 Summary:');
console.log('   Testing patterns:     ' + stats.patterns);
console.log('   Coordination entries: ' + stats.memories);
console.log('   Task trajectories:    ' + stats.tasks);
console.log('   Performance metrics:  ' + stats.metrics);
console.log('   Agents:               ' + agentCount);
console.log('   ─────────────────────────');
console.log('   Total items:          ' + (stats.patterns + stats.memories + stats.metrics + agentCount));
console.log('\n🔍 Verify with: npx ruvector hooks stats');

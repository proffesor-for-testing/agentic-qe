#!/usr/bin/env node
/**
 * Migration Script: memory.db → ruvector intelligence.json
 *
 * Migrates existing QE learning data from .agentic-qe/memory.db
 * into ruvector's .ruvector/intelligence.json format.
 *
 * Usage: node scripts/migrate-memory-to-ruvector.js [--dry-run] [--backup]
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const MEMORY_DB_PATH = '.agentic-qe/memory.db';
const INTELLIGENCE_PATH = '.ruvector/intelligence.json';

// CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const createBackup = args.includes('--backup');

console.log('🔄 Memory.db → RuVector Migration\n');

if (dryRun) {
  console.log('⚠️  DRY RUN MODE - No changes will be made\n');
}

// Check files exist
if (!fs.existsSync(MEMORY_DB_PATH)) {
  console.error(`❌ Memory database not found: ${MEMORY_DB_PATH}`);
  process.exit(1);
}

if (!fs.existsSync(INTELLIGENCE_PATH)) {
  console.error(`❌ Intelligence file not found: ${INTELLIGENCE_PATH}`);
  console.log('   Run: npx ruvector hooks init');
  process.exit(1);
}

// Backup if requested
if (createBackup && !dryRun) {
  const backupPath = `${INTELLIGENCE_PATH}.backup.${Date.now()}`;
  fs.copyFileSync(INTELLIGENCE_PATH, backupPath);
  console.log(`📦 Backup created: ${backupPath}\n`);
}

// Open database
const db = new Database(MEMORY_DB_PATH, { readonly: true });

// Load existing intelligence
let intelligence = JSON.parse(fs.readFileSync(INTELLIGENCE_PATH, 'utf8'));

// Initialize structures if missing
intelligence.patterns = intelligence.patterns || {};
intelligence.memories = intelligence.memories || [];
intelligence.trajectories = intelligence.trajectories || [];
intelligence.errors = intelligence.errors || [];
intelligence.agents = intelligence.agents || {};
intelligence.edges = intelligence.edges || [];
intelligence.learning = intelligence.learning || {
  qTables: {},
  qTables2: {},
  criticValues: {},
  rewardHistory: [],
  trajectories: [],
  configs: {},
  stats: {}
};

const stats = {
  patterns: 0,
  experiences: 0,
  qValues: 0,
  agents: 0,
  memories: 0,
  concepts: 0,
  insights: 0
};

// ============================================
// 1. Migrate patterns → patterns (agent routing)
// ============================================
console.log('📋 Migrating patterns...');
const patterns = db.prepare(`
  SELECT pattern, domain, confidence, agent_id, success_rate, usage_count
  FROM patterns
  ORDER BY confidence DESC
`).all();

patterns.forEach(p => {
  // Convert to ruvector pattern format: state → agent → score
  const state = `qe:${p.domain}:${p.pattern.substring(0, 50)}`;
  const agent = p.agent_id || 'qe-agent';
  const score = p.confidence * (p.success_rate || 1) * 10;

  if (!intelligence.patterns[state]) {
    intelligence.patterns[state] = {};
  }
  intelligence.patterns[state][agent] = (intelligence.patterns[state][agent] || 0) + score;
  stats.patterns++;
});
console.log(`   ✓ ${stats.patterns} patterns migrated`);

// ============================================
// 2. Migrate captured_experiences → trajectories
// ============================================
console.log('📋 Migrating captured experiences...');
const experiences = db.prepare(`
  SELECT id, agent_id, agent_type, task_type, execution, context, outcome, created_at
  FROM captured_experiences
  ORDER BY created_at DESC
`).all();

experiences.forEach(exp => {
  let execution, context, outcome;
  try {
    execution = JSON.parse(exp.execution);
    context = JSON.parse(exp.context);
    outcome = JSON.parse(exp.outcome);
  } catch (e) {
    execution = { raw: exp.execution };
    context = { raw: exp.context };
    outcome = { raw: exp.outcome };
  }

  // Add to trajectories
  intelligence.trajectories.push({
    id: `migrated_${exp.id}`,
    agent: exp.agent_type,
    task: exp.task_type,
    steps: [{
      action: exp.task_type,
      context: context,
      result: outcome,
      timestamp: exp.created_at
    }],
    outcome: outcome.success ? 'success' : (outcome.error ? 'error' : 'unknown'),
    quality: outcome.quality_score || outcome.confidence || 0.7,
    source: 'memory.db',
    created: exp.created_at
  });

  // Add to learning trajectories
  intelligence.learning.trajectories.push({
    context: exp.agent_type,
    agent: exp.agent_id,
    steps: [{ action: exp.task_type, reward: outcome.success ? 1 : 0 }],
    finalReward: outcome.quality_score || (outcome.success ? 1 : 0),
    timestamp: exp.created_at
  });

  stats.experiences++;
});
console.log(`   ✓ ${stats.experiences} experiences migrated`);

// ============================================
// 3. Migrate q_values → learning.qTables
// ============================================
console.log('📋 Migrating Q-values...');
const qValues = db.prepare(`
  SELECT agent_id, state_key, action_key, q_value, update_count
  FROM q_values
  ORDER BY q_value DESC
`).all();

qValues.forEach(qv => {
  const state = `qe:${qv.state_key}`;
  const action = qv.action_key;
  const value = qv.q_value;

  // Add to qTables (double Q-learning uses qTables and qTables2)
  if (!intelligence.learning.qTables[state]) {
    intelligence.learning.qTables[state] = {};
  }
  intelligence.learning.qTables[state][action] =
    (intelligence.learning.qTables[state][action] || 0) + value;

  stats.qValues++;
});
console.log(`   ✓ ${stats.qValues} Q-values migrated`);

// ============================================
// 4. Migrate learning_experiences → rewardHistory
// ============================================
console.log('📋 Migrating learning experiences...');
const learningExp = db.prepare(`
  SELECT agent_id, task_type, state, action, reward, next_state, episode_id, created_at
  FROM learning_experiences
  ORDER BY created_at DESC
  LIMIT 1000
`).all();

learningExp.forEach(le => {
  intelligence.learning.rewardHistory.push({
    agent: le.agent_id,
    state: le.state,
    action: le.action,
    reward: le.reward,
    nextState: le.next_state,
    episode: le.episode_id,
    timestamp: new Date(le.created_at).getTime()
  });
});
console.log(`   ✓ ${learningExp.length} learning experiences migrated`);

// ============================================
// 5. Migrate agent_registry → agents
// ============================================
console.log('📋 Migrating agent registry...');
const agents = db.prepare(`
  SELECT id, type, capabilities, status, performance
  FROM agent_registry
`).all();

agents.forEach(agent => {
  let capabilities, performance;
  try {
    capabilities = JSON.parse(agent.capabilities);
    performance = JSON.parse(agent.performance);
  } catch (e) {
    capabilities = [agent.capabilities];
    performance = { raw: agent.performance };
  }

  intelligence.agents[agent.id] = {
    type: agent.type,
    capabilities: capabilities,
    status: agent.status,
    performance: performance,
    source: 'memory.db'
  };
  stats.agents++;
});
console.log(`   ✓ ${stats.agents} agents migrated`);

// ============================================
// 6. Migrate key memory_entries → memories
// ============================================
console.log('📋 Migrating memory entries...');
const memories = db.prepare(`
  SELECT key, partition, value, metadata, created_at
  FROM memory_entries
  WHERE partition IN ('learning', 'patterns', 'agents', 'qe')
  OR key LIKE '%pattern%' OR key LIKE '%learn%' OR key LIKE '%agent%'
  ORDER BY created_at DESC
  LIMIT 500
`).all();

memories.forEach(mem => {
  let value;
  try {
    value = JSON.parse(mem.value);
  } catch (e) {
    value = mem.value;
  }

  intelligence.memories.push({
    id: `mem_migrated_${mem.created_at}`,
    memory_type: mem.partition,
    content: typeof value === 'string' ? value : JSON.stringify(value).substring(0, 500),
    metadata: { key: mem.key, source: 'memory.db' },
    timestamp: mem.created_at
  });
  stats.memories++;
});
console.log(`   ✓ ${stats.memories} memory entries migrated`);

// ============================================
// 7. Migrate concept_nodes → memories (knowledge)
// ============================================
console.log('📋 Migrating concept nodes...');
const concepts = db.prepare(`
  SELECT id, name, type, domain, properties, activation_level
  FROM concept_nodes
  WHERE activation_level > 0.3
  ORDER BY activation_level DESC
  LIMIT 100
`).all();

concepts.forEach(concept => {
  let properties;
  try {
    properties = JSON.parse(concept.properties);
  } catch (e) {
    properties = {};
  }

  intelligence.memories.push({
    id: `concept_${concept.id}`,
    memory_type: 'concept',
    content: `[${concept.type}] ${concept.name}: ${concept.domain || 'general'}`,
    metadata: {
      conceptType: concept.type,
      domain: concept.domain,
      properties: properties,
      activation: concept.activation_level,
      source: 'memory.db'
    },
    timestamp: Date.now()
  });
  stats.concepts++;
});
console.log(`   ✓ ${stats.concepts} concepts migrated`);

// ============================================
// 8. Migrate dream_insights → memories
// ============================================
console.log('📋 Migrating dream insights...');
const insights = db.prepare(`
  SELECT id, type, title, description, content, confidence, novelty_score, actionable
  FROM dream_insights
  WHERE confidence > 0.5
  ORDER BY confidence DESC
`).all();

insights.forEach(insight => {
  intelligence.memories.push({
    id: `insight_${insight.id}`,
    memory_type: 'insight',
    content: `[${insight.type}] ${insight.title || ''}: ${insight.description || insight.content}`.substring(0, 500),
    metadata: {
      insightType: insight.type,
      confidence: insight.confidence,
      novelty: insight.novelty_score,
      actionable: insight.actionable,
      source: 'memory.db'
    },
    timestamp: Date.now()
  });
  stats.insights++;
});
console.log(`   ✓ ${stats.insights} insights migrated`);

// ============================================
// 9. Update stats
// ============================================
intelligence.stats = intelligence.stats || {};
intelligence.stats.total_patterns = Object.keys(intelligence.patterns).length;
intelligence.stats.total_memories = intelligence.memories.length;
intelligence.stats.total_trajectories = intelligence.trajectories.length;
intelligence.stats.total_errors = intelligence.errors.length;
intelligence.stats.migration_date = new Date().toISOString();
intelligence.stats.migration_source = 'memory.db';

// Close database
db.close();

// ============================================
// Save results
// ============================================
if (!dryRun) {
  fs.writeFileSync(INTELLIGENCE_PATH, JSON.stringify(intelligence, null, 2));
  console.log(`\n✅ Migration complete! Saved to ${INTELLIGENCE_PATH}`);
} else {
  console.log('\n✅ Dry run complete! No changes made.');
}

console.log('\n📊 Migration Summary:');
console.log(`   Patterns:     ${stats.patterns}`);
console.log(`   Experiences:  ${stats.experiences}`);
console.log(`   Q-values:     ${stats.qValues}`);
console.log(`   Agents:       ${stats.agents}`);
console.log(`   Memories:     ${stats.memories}`);
console.log(`   Concepts:     ${stats.concepts}`);
console.log(`   Insights:     ${stats.insights}`);
console.log(`\n   Total items migrated: ${Object.values(stats).reduce((a, b) => a + b, 0)}`);

if (!dryRun) {
  console.log('\n🔍 Verify with: npx ruvector hooks stats');
}

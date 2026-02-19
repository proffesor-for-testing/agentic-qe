#!/usr/bin/env node
/**
 * Migrate v2 root memory.db data into v3 schema.
 *
 * Source: /workspaces/agentic-qe/.agentic-qe/memory.db (v2)
 * Target: /workspaces/agentic-qe/v3/.agentic-qe/memory.db (v3)
 *
 * Table mappings:
 *   v2 kv_store (279)           → v3 kv_store (INSERT OR IGNORE)
 *   v2 memory_entries (80)      → v3 kv_store (partition→namespace)
 *   v2 dream_cycles (2)         → v3 dream_cycles (timestamps INT→TEXT)
 *   v2 goap_actions (61)        → v3 goap_actions (column remapping)
 *   v2 learning_experiences (188) → v3 captured_experiences (field extraction)
 *   v2 mincut_history (264)     → v3 mincut_history (direct copy)
 *   v2 mincut_snapshots (266)   → v3 mincut_snapshots (INSERT OR IGNORE)
 *   v2 patterns (8)             → v3 qe_patterns (field mapping)
 */

const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');

const V2_PATH = path.resolve(__dirname, '../.agentic-qe/memory.db');
const V3_PATH = path.resolve(__dirname, '../v3/.agentic-qe/memory.db');

function toISO(ts) {
  if (!ts) return null;
  if (typeof ts === 'string') {
    // Already a string — return as-is if it looks like a date
    if (ts.includes('T') || ts.includes('-')) return ts;
    // Try parsing as number
    const n = Number(ts);
    if (!isNaN(n)) return new Date(n).toISOString();
    return ts;
  }
  if (typeof ts === 'number') {
    // Unix seconds vs milliseconds
    if (ts < 1e12) return new Date(ts * 1000).toISOString();
    return new Date(ts).toISOString();
  }
  return null;
}

function uuid() {
  return crypto.randomUUID();
}

console.log('=== v2 → v3 Memory Migration ===\n');

const v2 = new Database(V2_PATH, { readonly: true });
v2.pragma('busy_timeout = 5000');
const v3 = new Database(V3_PATH);
v3.pragma('busy_timeout = 5000');

// Enable WAL mode for performance
v3.pragma('journal_mode = WAL');

const stats = {};

// ─────────────────────────────────────────────
// 1. kv_store → kv_store (direct copy)
// ─────────────────────────────────────────────
function migrateKvStore() {
  const label = 'kv_store → kv_store';
  const rows = v2.prepare('SELECT * FROM kv_store').all();
  const insert = v3.prepare(`
    INSERT OR IGNORE INTO kv_store (key, namespace, value, expires_at, created_at)
    VALUES (@key, @namespace, @value, @expires_at, @created_at)
  `);

  let migrated = 0;
  const txn = v3.transaction(() => {
    for (const row of rows) {
      const result = insert.run({
        key: row.key,
        namespace: row.namespace,
        value: row.value,
        expires_at: row.expires_at,
        created_at: row.created_at,
      });
      if (result.changes > 0) migrated++;
    }
  });
  txn();
  stats[label] = { total: rows.length, migrated };
  console.log(`  ${label}: ${migrated}/${rows.length} rows`);
}

// ─────────────────────────────────────────────
// 2. memory_entries → kv_store (partition→namespace)
// ─────────────────────────────────────────────
function migrateMemoryEntries() {
  const label = 'memory_entries → kv_store';
  const rows = v2.prepare('SELECT * FROM memory_entries').all();
  const insert = v3.prepare(`
    INSERT OR IGNORE INTO kv_store (key, namespace, value, expires_at, created_at)
    VALUES (@key, @namespace, @value, @expires_at, @created_at)
  `);

  let migrated = 0;
  const txn = v3.transaction(() => {
    for (const row of rows) {
      // Wrap value with metadata if metadata exists
      let value = row.value;
      if (row.metadata || row.owner || row.access_level) {
        try {
          const parsed = JSON.parse(row.value);
          value = JSON.stringify({
            ...parsed,
            _v2_metadata: {
              owner: row.owner,
              access_level: row.access_level,
              team_id: row.team_id,
              swarm_id: row.swarm_id,
            },
          });
        } catch {
          // value isn't JSON, wrap it
          value = JSON.stringify({
            value: row.value,
            _v2_metadata: {
              owner: row.owner,
              access_level: row.access_level,
              team_id: row.team_id,
              swarm_id: row.swarm_id,
            },
          });
        }
      }

      const namespace = row.partition === 'default' ? 'v2-memory' : `v2-${row.partition}`;
      const result = insert.run({
        key: row.key,
        namespace,
        value,
        expires_at: row.expires_at,
        created_at: row.created_at,
      });
      if (result.changes > 0) migrated++;
    }
  });
  txn();
  stats[label] = { total: rows.length, migrated };
  console.log(`  ${label}: ${migrated}/${rows.length} rows`);
}

// ─────────────────────────────────────────────
// 3. dream_cycles → dream_cycles (timestamps)
// ─────────────────────────────────────────────
function migrateDreamCycles() {
  const label = 'dream_cycles → dream_cycles';
  const rows = v2.prepare('SELECT * FROM dream_cycles').all();
  const insert = v3.prepare(`
    INSERT OR IGNORE INTO dream_cycles (id, start_time, end_time, duration_ms, concepts_processed,
      associations_found, insights_generated, status, error, created_at)
    VALUES (@id, @start_time, @end_time, @duration_ms, @concepts_processed,
      @associations_found, @insights_generated, @status, @error, @created_at)
  `);

  let migrated = 0;
  const txn = v3.transaction(() => {
    for (const row of rows) {
      const result = insert.run({
        id: row.id,
        start_time: toISO(row.start_time),
        end_time: toISO(row.end_time),
        duration_ms: row.duration,
        concepts_processed: row.concepts_processed,
        associations_found: row.associations_found,
        insights_generated: row.insights_generated,
        status: row.status,
        error: row.error,
        created_at: toISO(row.created_at),
      });
      if (result.changes > 0) migrated++;
    }
  });
  txn();
  stats[label] = { total: rows.length, migrated };
  console.log(`  ${label}: ${migrated}/${rows.length} rows`);
}

// ─────────────────────────────────────────────
// 4. goap_actions → goap_actions (column mapping)
// ─────────────────────────────────────────────
function migrateGoapActions() {
  const label = 'goap_actions → goap_actions';
  const rows = v2.prepare('SELECT * FROM goap_actions').all();
  const insert = v3.prepare(`
    INSERT OR IGNORE INTO goap_actions (id, name, description, agent_type, preconditions, effects,
      cost, estimated_duration_ms, success_rate, execution_count, category, qe_domain, created_at, updated_at)
    VALUES (@id, @name, @description, @agent_type, @preconditions, @effects,
      @cost, @estimated_duration_ms, @success_rate, @execution_count, @category, @qe_domain, @created_at, @updated_at)
  `);

  let migrated = 0;
  const txn = v3.transaction(() => {
    for (const row of rows) {
      // Infer qe_domain from agent_type or category
      let qe_domain = null;
      if (row.agent_type) {
        const agentToDomain = {
          'qe-test-executor': 'test-execution',
          'qe-integration-tester': 'test-execution',
          'qe-test-architect': 'test-generation',
          'qe-coverage-specialist': 'coverage-analysis',
          'qe-quality-gate': 'quality-assessment',
          'qe-security-scanner': 'security-compliance',
          'qe-chaos-engineer': 'chaos-resilience',
          'qe-defect-predictor': 'defect-intelligence',
          'qe-pattern-learner': 'learning-optimization',
        };
        qe_domain = agentToDomain[row.agent_type] || null;
      }

      const result = insert.run({
        id: row.id,
        name: row.name || row.id,
        description: row.description || null,
        agent_type: row.agent_type,
        preconditions: row.preconditions,
        effects: row.effects,
        cost: typeof row.cost === 'number' ? row.cost : 1.0,
        estimated_duration_ms: row.duration_estimate || null,
        success_rate: row.success_rate || 1.0,
        execution_count: row.execution_count || 0,
        category: row.category || 'general',
        qe_domain,
        created_at: toISO(row.created_at),
        updated_at: toISO(row.updated_at) || toISO(row.created_at),
      });
      if (result.changes > 0) migrated++;
    }
  });
  txn();
  stats[label] = { total: rows.length, migrated };
  console.log(`  ${label}: ${migrated}/${rows.length} rows`);
}

// ─────────────────────────────────────────────
// 5. learning_experiences → captured_experiences
// ─────────────────────────────────────────────
function migrateLearningExperiences() {
  const label = 'learning_experiences → captured_experiences';
  const rows = v2.prepare('SELECT * FROM learning_experiences').all();
  const insert = v3.prepare(`
    INSERT OR IGNORE INTO captured_experiences (id, task, agent, domain, success, quality,
      duration_ms, model_tier, routing_json, steps_json, result_json, error, started_at, completed_at, source)
    VALUES (@id, @task, @agent, @domain, @success, @quality,
      @duration_ms, @model_tier, @routing_json, @steps_json, @result_json, @error, @started_at, @completed_at, @source)
  `);

  let migrated = 0;
  const txn = v3.transaction(() => {
    for (const row of rows) {
      let metadata = {};
      try { metadata = JSON.parse(row.metadata || '{}'); } catch {}

      let actionData = {};
      try { actionData = JSON.parse(row.action || '{}'); } catch {}

      const taskDesc = metadata.taskDescription || row.task_type || 'unknown';
      const durationMs = metadata.durationMs || 0;
      const success = row.reward >= 0.5 ? 1 : 0;
      const quality = row.reward || 0.5;
      const agent = row.agent_id || 'unknown';

      // Map agent_id to domain
      const agentToDomain = {
        'qx-partner': 'quality-assessment',
        'qe-test-architect': 'test-generation',
        'qe-coverage-specialist': 'coverage-analysis',
        'qe-quality-gate': 'quality-assessment',
        'qe-security-scanner': 'security-compliance',
        'qe-chaos-engineer': 'chaos-resilience',
        'qe-defect-predictor': 'defect-intelligence',
        'qe-pattern-learner': 'learning-optimization',
        'qe-flaky-hunter': 'test-execution',
        'qe-parallel-executor': 'test-execution',
      };
      const domain = agentToDomain[row.agent_id] || row.task_type || 'general';

      const startedAt = toISO(row.timestamp || row.created_at) || new Date().toISOString();

      const result = insert.run({
        id: `v2-exp-${row.id}`,
        task: taskDesc,
        agent,
        domain,
        success,
        quality,
        duration_ms: durationMs,
        model_tier: null,
        routing_json: JSON.stringify({
          v2_state: row.state,
          v2_action: row.action,
          v2_episode: row.episode_id,
        }),
        steps_json: null,
        result_json: JSON.stringify({
          reward: row.reward,
          next_state: row.next_state,
          v2_metadata: metadata,
        }),
        error: metadata.success === false ? (metadata.outputSummary || null) : null,
        started_at: startedAt,
        completed_at: startedAt,
        source: 'v2-migration',
      });
      if (result.changes > 0) migrated++;
    }
  });
  txn();
  stats[label] = { total: rows.length, migrated };
  console.log(`  ${label}: ${migrated}/${rows.length} rows`);
}

// ─────────────────────────────────────────────
// 6. mincut_history → mincut_history (direct)
// ─────────────────────────────────────────────
function migrateMincutHistory() {
  const label = 'mincut_history → mincut_history';
  const rows = v2.prepare('SELECT * FROM mincut_history').all();

  // Get max existing ID in v3 to avoid conflicts
  const maxId = v3.prepare('SELECT MAX(id) as m FROM mincut_history').get().m || 0;

  const insert = v3.prepare(`
    INSERT OR IGNORE INTO mincut_history (id, timestamp, mincut_value, vertex_count, edge_count,
      algorithm, duration_ms, snapshot_id, created_at)
    VALUES (@id, @timestamp, @mincut_value, @vertex_count, @edge_count,
      @algorithm, @duration_ms, @snapshot_id, @created_at)
  `);

  let migrated = 0;
  const txn = v3.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const result = insert.run({
        id: maxId + row.id,
        timestamp: row.timestamp,
        mincut_value: row.mincut_value,
        vertex_count: row.vertex_count,
        edge_count: row.edge_count,
        algorithm: row.algorithm || 'weighted-degree',
        duration_ms: row.duration_ms,
        snapshot_id: row.snapshot_id,
        created_at: row.created_at || row.timestamp,
      });
      if (result.changes > 0) migrated++;
    }
  });
  txn();
  stats[label] = { total: rows.length, migrated };
  console.log(`  ${label}: ${migrated}/${rows.length} rows`);
}

// ─────────────────────────────────────────────
// 7. mincut_snapshots → mincut_snapshots
// ─────────────────────────────────────────────
function migrateMincutSnapshots() {
  const label = 'mincut_snapshots → mincut_snapshots';
  const rows = v2.prepare('SELECT * FROM mincut_snapshots').all();
  const insert = v3.prepare(`
    INSERT OR IGNORE INTO mincut_snapshots (id, timestamp, vertex_count, edge_count, total_weight,
      is_connected, component_count, vertices_json, edges_json, created_at)
    VALUES (@id, @timestamp, @vertex_count, @edge_count, @total_weight,
      @is_connected, @component_count, @vertices_json, @edges_json, @created_at)
  `);

  let migrated = 0;
  const txn = v3.transaction(() => {
    for (const row of rows) {
      const result = insert.run({
        id: row.id,
        timestamp: row.timestamp,
        vertex_count: row.vertex_count,
        edge_count: row.edge_count,
        total_weight: row.total_weight || 0,
        is_connected: row.is_connected != null ? row.is_connected : 1,
        component_count: row.component_count || 1,
        vertices_json: row.vertices_json,
        edges_json: row.edges_json,
        created_at: row.created_at || row.timestamp,
      });
      if (result.changes > 0) migrated++;
    }
  });
  txn();
  stats[label] = { total: rows.length, migrated };
  console.log(`  ${label}: ${migrated}/${rows.length} rows`);
}

// ─────────────────────────────────────────────
// 8. patterns → qe_patterns
// ─────────────────────────────────────────────
function migratePatterns() {
  const label = 'patterns → qe_patterns';
  const rows = v2.prepare('SELECT * FROM patterns').all();
  const insert = v3.prepare(`
    INSERT OR IGNORE INTO qe_patterns (id, pattern_type, qe_domain, domain, name, description,
      confidence, usage_count, success_rate, quality_score, tier, template_json, context_json,
      created_at, updated_at, last_used_at, successful_uses, reusable, reuse_count)
    VALUES (@id, @pattern_type, @qe_domain, @domain, @name, @description,
      @confidence, @usage_count, @success_rate, @quality_score, @tier, @template_json, @context_json,
      @created_at, @updated_at, @last_used_at, @successful_uses, @reusable, @reuse_count)
  `);

  let migrated = 0;
  const txn = v3.transaction(() => {
    for (const row of rows) {
      let metadata = {};
      try { metadata = JSON.parse(row.metadata || '{}'); } catch {}

      // Extract pattern_type from metadata or ID
      let patternType = 'learned-pattern';
      if (metadata.oracleType) patternType = 'oracle-pattern';
      else if (metadata.stakeholderType) patternType = 'stakeholder-pattern';
      else if (metadata.epic || metadata.file) patternType = 'sfdipot-pattern';
      else if (row.id.startsWith('sfdipot')) patternType = 'sfdipot-pattern';

      // Extract a short name from the pattern text
      const patternText = typeof row.pattern === 'string' ? row.pattern : JSON.stringify(row.pattern);
      let name = patternText.substring(0, 80);
      if (patternText.length > 80) name += '...';

      // Try to extract epic name for SFDIPOT patterns
      if (patternType === 'sfdipot-pattern') {
        try {
          const parsed = JSON.parse(patternText);
          if (parsed.epic) name = parsed.epic;
        } catch {}
      }

      const domain = row.domain || 'general';

      const result = insert.run({
        id: row.id,
        pattern_type: patternType,
        qe_domain: domain,
        domain,
        name,
        description: patternText,
        confidence: row.confidence || 0.5,
        usage_count: row.usage_count || 0,
        success_rate: row.success_rate || 0.0,
        quality_score: row.confidence || 0.5,
        tier: 'long-term',
        template_json: null,
        context_json: row.metadata,
        created_at: toISO(row.created_at),
        updated_at: toISO(row.created_at),
        last_used_at: null,
        successful_uses: row.usage_count || 0,
        reusable: 1,
        reuse_count: 0,
      });
      if (result.changes > 0) migrated++;
    }
  });
  txn();
  stats[label] = { total: rows.length, migrated };
  console.log(`  ${label}: ${migrated}/${rows.length} rows`);
}

// ─────────────────────────────────────────────
// 9. learning_experiences → rl_q_values (extract RL data)
// ─────────────────────────────────────────────
function migrateRlQValues() {
  const label = 'learning_experiences → rl_q_values';
  const rows = v2.prepare('SELECT DISTINCT agent_id, task_type, AVG(reward) as avg_reward, COUNT(*) as cnt FROM learning_experiences GROUP BY agent_id, task_type').all();
  const insert = v3.prepare(`
    INSERT OR IGNORE INTO rl_q_values (id, algorithm, agent_id, state_key, action_key, q_value,
      visits, last_reward, domain, created_at, updated_at)
    VALUES (@id, @algorithm, @agent_id, @state_key, @action_key, @q_value,
      @visits, @last_reward, @domain, @created_at, @updated_at)
  `);

  const agentToDomain = {
    'qx-partner': 'quality-assessment',
    'qe-test-architect': 'test-generation',
    'qe-coverage-specialist': 'coverage-analysis',
    'qe-quality-gate': 'quality-assessment',
  };

  let migrated = 0;
  const now = new Date().toISOString();
  const txn = v3.transaction(() => {
    for (const row of rows) {
      const result = insert.run({
        id: `v2-rl-${row.agent_id}-${row.task_type}`,
        algorithm: 'q-learning',
        agent_id: row.agent_id,
        state_key: `task_type:${row.task_type}`,
        action_key: 'execute-task',
        q_value: row.avg_reward || 0,
        visits: row.cnt,
        last_reward: row.avg_reward,
        domain: agentToDomain[row.agent_id] || 'general',
        created_at: now,
        updated_at: now,
      });
      if (result.changes > 0) migrated++;
    }
  });
  txn();
  stats[label] = { total: rows.length, migrated };
  console.log(`  ${label}: ${migrated}/${rows.length} rows`);
}

// ─────────────────────────────────────────────
// Run all migrations
// ─────────────────────────────────────────────
console.log('Source: ' + V2_PATH);
console.log('Target: ' + V3_PATH);
console.log('');

try {
  migrateKvStore();
  migrateMemoryEntries();
  migrateDreamCycles();
  migrateGoapActions();
  migrateLearningExperiences();
  migrateMincutHistory();
  migrateMincutSnapshots();
  migratePatterns();
  migrateRlQValues();

  console.log('\n=== Migration Summary ===');
  let totalMigrated = 0;
  let totalSource = 0;
  for (const [label, { total, migrated }] of Object.entries(stats)) {
    console.log(`  ${label}: ${migrated}/${total}`);
    totalMigrated += migrated;
    totalSource += total;
  }
  console.log(`\n  TOTAL: ${totalMigrated} rows migrated from ${totalSource} source rows`);

  // Final counts
  console.log('\n=== v3 Table Counts (post-migration) ===');
  const tables = v3.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  for (const t of tables) {
    const cnt = v3.prepare('SELECT COUNT(*) as c FROM ' + t.name).get().c;
    if (cnt > 0) console.log(`  ${t.name}: ${cnt} rows`);
  }
} catch (err) {
  console.error('Migration failed:', err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  v2.close();
  v3.close();
}

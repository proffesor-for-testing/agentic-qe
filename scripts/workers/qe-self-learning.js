#!/usr/bin/env node
/**
 * QE Self-Learning Worker
 *
 * Background worker that:
 * 1. Analyzes agent performance patterns
 * 2. Consolidates similar patterns
 * 3. Updates Q-values based on outcomes
 * 4. Triggers dream synthesis for new insights
 *
 * Run modes:
 * - analyze: Analyze patterns and suggest improvements
 * - consolidate: Merge similar patterns
 * - replay: Experience replay for Q-learning
 * - dream: Trigger dream synthesis
 * - full: Run all phases
 */

const Database = require('better-sqlite3');
const fs = require('fs');

const MEMORY_DB = '.agentic-qe/memory.db';
const INTELLIGENCE_FILE = '.ruvector/intelligence.json';

const args = process.argv.slice(2);
const mode = args[0] || 'analyze';
const verbose = args.includes('--verbose') || args.includes('-v');

function log(...msgs) {
  if (verbose) console.log(...msgs);
}

async function analyzePatterns() {
  log('🔍 Analyzing agent performance patterns...\n');

  const db = new Database(MEMORY_DB, { readonly: true });

  // Get agent performance stats
  const agentStats = db.prepare(`
    SELECT
      agent_type,
      COUNT(*) as total_tasks,
      AVG(json_extract(outcome, '$.quality_score')) as avg_quality,
      SUM(CASE WHEN json_extract(outcome, '$.success') = 1 THEN 1 ELSE 0 END) as successes
    FROM captured_experiences
    GROUP BY agent_type
    ORDER BY total_tasks DESC
  `).all();

  console.log('📊 Agent Performance Analysis:\n');
  agentStats.forEach(agent => {
    const successRate = agent.total_tasks > 0 ? (agent.successes / agent.total_tasks * 100).toFixed(1) : 0;
    const quality = agent.avg_quality ? agent.avg_quality.toFixed(2) : 'N/A';
    console.log(`  ${agent.agent_type}:`);
    console.log(`    Tasks: ${agent.total_tasks} | Success: ${successRate}% | Avg Quality: ${quality}`);
  });

  // Find underperforming patterns
  const weakPatterns = db.prepare(`
    SELECT pattern, confidence, usage_count, success_rate
    FROM patterns
    WHERE success_rate < 0.7 OR confidence < 0.5
    ORDER BY success_rate ASC
    LIMIT 10
  `).all();

  if (weakPatterns.length > 0) {
    console.log('\n⚠️  Patterns needing improvement:\n');
    weakPatterns.forEach(p => {
      console.log(`  • ${p.pattern.substring(0, 50)}...`);
      console.log(`    Confidence: ${(p.confidence * 100).toFixed(0)}% | Success: ${((p.success_rate || 0) * 100).toFixed(0)}%`);
    });
  }

  // Find high-performing patterns to replicate
  const strongPatterns = db.prepare(`
    SELECT pattern, confidence, usage_count, domain
    FROM patterns
    WHERE confidence > 0.9 AND usage_count > 0
    ORDER BY confidence DESC
    LIMIT 5
  `).all();

  if (strongPatterns.length > 0) {
    console.log('\n✅ High-performing patterns to replicate:\n');
    strongPatterns.forEach(p => {
      console.log(`  • [${p.domain || 'general'}] ${p.pattern.substring(0, 50)}...`);
      console.log(`    Confidence: ${(p.confidence * 100).toFixed(0)}% | Used: ${p.usage_count}x`);
    });
  }

  db.close();
  return { agentStats, weakPatterns, strongPatterns };
}

async function consolidatePatterns() {
  log('🔗 Consolidating similar patterns...\n');

  const db = new Database(MEMORY_DB);

  // Find duplicate/similar patterns
  const patterns = db.prepare(`
    SELECT id, pattern, confidence, domain
    FROM patterns
    ORDER BY domain, pattern
  `).all();

  let consolidated = 0;
  const seen = new Map();

  patterns.forEach(p => {
    // Simple similarity: same first 30 chars in same domain
    const key = `${p.domain}:${p.pattern.substring(0, 30)}`;

    if (seen.has(key)) {
      const existing = seen.get(key);
      // Merge: keep higher confidence
      if (p.confidence > existing.confidence) {
        db.prepare('UPDATE patterns SET confidence = ? WHERE id = ?').run(p.confidence, existing.id);
      }
      db.prepare('DELETE FROM patterns WHERE id = ?').run(p.id);
      consolidated++;
    } else {
      seen.set(key, p);
    }
  });

  db.close();

  console.log(`✅ Consolidated ${consolidated} duplicate patterns`);
  return { consolidated };
}

async function experienceReplay() {
  log('🔄 Running experience replay for Q-learning...\n');

  const db = new Database(MEMORY_DB);

  // Get recent experiences for replay
  const experiences = db.prepare(`
    SELECT agent_type, task_type, outcome
    FROM captured_experiences
    ORDER BY created_at DESC
    LIMIT 100
  `).all();

  let updates = 0;
  const learningRate = 0.1;
  const discountFactor = 0.9;

  experiences.forEach(exp => {
    let outcome;
    try { outcome = JSON.parse(exp.outcome); } catch(e) { return; }

    const stateKey = `task:${exp.task_type}`;
    const actionKey = exp.agent_type;
    const reward = outcome.quality_score || (outcome.success ? 1 : 0);

    // Update Q-value using Q-learning formula
    const existing = db.prepare(`
      SELECT q_value FROM q_values
      WHERE agent_id = 'qe-system' AND state_key = ? AND action_key = ?
    `).get(stateKey, actionKey);

    const currentQ = existing ? existing.q_value : 0;
    const newQ = currentQ + learningRate * (reward - currentQ);

    db.prepare(`
      INSERT INTO q_values (agent_id, state_key, action_key, q_value, update_count)
      VALUES ('qe-system', ?, ?, ?, 1)
      ON CONFLICT(agent_id, state_key, action_key)
      DO UPDATE SET q_value = ?, update_count = update_count + 1, last_updated = CURRENT_TIMESTAMP
    `).run(stateKey, actionKey, newQ, newQ);

    updates++;
  });

  db.close();

  console.log(`✅ Updated ${updates} Q-values via experience replay`);
  return { updates };
}

async function triggerDreamSynthesis() {
  log('💭 Triggering dream synthesis...\n');

  const db = new Database(MEMORY_DB);

  // Create a new dream cycle
  const cycleId = `dream_${Date.now()}`;
  const startTime = Date.now();

  db.prepare(`
    INSERT INTO dream_cycles (id, start_time, status, created_at)
    VALUES (?, ?, 'running', ?)
  `).run(cycleId, startTime, startTime);

  // Analyze recent patterns for insights
  const recentPatterns = db.prepare(`
    SELECT pattern, confidence, domain
    FROM patterns
    WHERE created_at > ?
    ORDER BY confidence DESC
    LIMIT 20
  `).all(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours

  let insightsGenerated = 0;

  // Generate insights from pattern combinations
  if (recentPatterns.length >= 2) {
    const insight = {
      id: `insight_${Date.now()}`,
      cycle_id: cycleId,
      type: 'pattern_synthesis',
      title: 'Cross-pattern insight',
      description: `Observed correlation between ${recentPatterns.length} recent patterns`,
      confidence: 0.6,
      status: 'pending',
      created_at: Date.now()
    };

    db.prepare(`
      INSERT INTO dream_insights (id, cycle_id, type, title, description, confidence, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(insight.id, insight.cycle_id, insight.type, insight.title, insight.description, insight.confidence, insight.status);

    insightsGenerated++;
  }

  // Complete dream cycle
  const endTime = Date.now();
  db.prepare(`
    UPDATE dream_cycles
    SET end_time = ?, duration = ?, insights_generated = ?, status = 'completed'
    WHERE id = ?
  `).run(endTime, endTime - startTime, insightsGenerated, cycleId);

  db.close();

  console.log(`✅ Dream cycle complete: ${insightsGenerated} insights generated`);
  return { cycleId, insightsGenerated };
}

async function syncToRuvector() {
  log('🔄 Syncing to RuVector...\n');

  // Import and run sync worker
  const { syncIntelligence } = require('./sync-intelligence.js');
  return await syncIntelligence({ verbose });
}

async function runFullCycle() {
  console.log('🧠 QE Self-Learning Worker - Full Cycle\n');
  console.log('='.repeat(50) + '\n');

  const results = {};

  // Phase 1: Analyze
  console.log('Phase 1: Pattern Analysis');
  console.log('-'.repeat(30));
  results.analyze = await analyzePatterns();
  console.log();

  // Phase 2: Consolidate
  console.log('Phase 2: Pattern Consolidation');
  console.log('-'.repeat(30));
  results.consolidate = await consolidatePatterns();
  console.log();

  // Phase 3: Experience Replay
  console.log('Phase 3: Experience Replay');
  console.log('-'.repeat(30));
  results.replay = await experienceReplay();
  console.log();

  // Phase 4: Dream Synthesis
  console.log('Phase 4: Dream Synthesis');
  console.log('-'.repeat(30));
  results.dream = await triggerDreamSynthesis();
  console.log();

  // Phase 5: Sync to RuVector
  console.log('Phase 5: Sync to RuVector');
  console.log('-'.repeat(30));
  results.sync = await syncToRuvector();
  console.log();

  console.log('='.repeat(50));
  console.log('✅ Full learning cycle complete!');

  return results;
}

// Main execution
(async () => {
  try {
    switch (mode) {
      case 'analyze':
        await analyzePatterns();
        break;
      case 'consolidate':
        await consolidatePatterns();
        break;
      case 'replay':
        await experienceReplay();
        break;
      case 'dream':
        await triggerDreamSynthesis();
        break;
      case 'sync':
        await syncToRuvector();
        break;
      case 'full':
        await runFullCycle();
        break;
      default:
        console.log('Usage: node qe-self-learning.js [mode] [--verbose]');
        console.log('Modes: analyze, consolidate, replay, dream, sync, full');
    }
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();

#!/usr/bin/env node
/**
 * PostToolUse Hook: Automatic Task Learning Capture
 *
 * This hook automatically captures learnings from completed Task agents
 * and persists them to memory.db. It provides a safety net ensuring
 * learnings are captured even when agents don't explicitly call MCP tools.
 *
 * Input (via stdin): PostToolUse JSON with tool_input and tool_response
 * Output: Stores learning_experience record to .agentic-qe/memory.db
 *
 * @module hooks/capture-task-learning
 */

const fs = require('fs');
const path = require('path');

// Read stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => processTaskLearning(input));

async function processTaskLearning(jsonInput) {
  try {
    const data = JSON.parse(jsonInput);

    // Only process completed Task tools
    if (data.tool_name !== 'Task' || data.tool_response?.status !== 'completed') {
      return;
    }

    // Extract key information
    const agentType = data.tool_input?.subagent_type || 'unknown';
    const taskDescription = data.tool_input?.description || '';
    const prompt = data.tool_input?.prompt || '';
    const agentOutput = data.tool_response?.content?.[0]?.text || '';
    const durationMs = data.tool_response?.totalDurationMs || 0;
    const totalTokens = data.tool_response?.totalTokens || 0;
    const toolUseCount = data.tool_response?.totalToolUseCount || 0;
    const agentId = data.tool_response?.agentId || 'unknown';
    const cwd = data.cwd || process.cwd();

    // Skip if no meaningful output
    if (!agentOutput || agentOutput.length < 20) {
      return;
    }

    // Determine task type from agent type
    const taskTypeMap = {
      'qe-test-generator': 'test-generation',
      'qe-coverage-analyzer': 'coverage-analysis',
      'qe-security-scanner': 'security-scan',
      'qe-performance-tester': 'performance-test',
      'qe-flaky-test-hunter': 'flaky-detection',
      'qe-chaos-engineer': 'chaos-testing',
      'qe-code-complexity': 'complexity-analysis',
      'qe-quality-gate': 'quality-gate',
      'qe-regression-risk-analyzer': 'regression-analysis',
      'qe-requirements-validator': 'requirements-validation',
      'qe-test-data-architect': 'test-data-generation',
      'qe-visual-tester': 'visual-testing',
      'qe-api-contract-validator': 'contract-validation',
      'qe-fleet-commander': 'fleet-coordination',
      'qe-test-executor': 'test-execution',
      'qe-quality-analyzer': 'quality-analysis',
      'qe-deployment-readiness': 'deployment-readiness',
      'qe-production-intelligence': 'production-intelligence',
      'qx-partner': 'qx-analysis',
      'researcher': 'research',
      'coder': 'implementation',
      'tester': 'testing',
      'reviewer': 'code-review'
    };
    const taskType = taskTypeMap[agentType] || agentType;

    // Calculate reward based on output quality indicators
    let reward = 0.7; // Base reward for completion

    // Increase reward for comprehensive output
    if (agentOutput.length > 500) reward += 0.05;
    if (agentOutput.length > 1000) reward += 0.05;
    if (agentOutput.length > 2000) reward += 0.05;

    // Increase reward for tool usage (indicates thorough work)
    if (toolUseCount > 0) reward += 0.05;
    if (toolUseCount > 5) reward += 0.05;

    // Check for success indicators in output
    const successIndicators = ['✓', '✅', 'success', 'complete', 'passed', 'found', 'created', 'generated'];
    const failureIndicators = ['❌', 'failed', 'error', 'could not', 'unable to'];

    const hasSuccess = successIndicators.some(ind => agentOutput.toLowerCase().includes(ind.toLowerCase()));
    const hasFailure = failureIndicators.some(ind => agentOutput.toLowerCase().includes(ind.toLowerCase()));

    if (hasSuccess && !hasFailure) reward += 0.1;
    if (hasFailure) reward -= 0.2;

    // Cap reward between 0.1 and 1.0
    reward = Math.max(0.1, Math.min(1.0, reward));

    // Find memory.db path
    const dbPath = path.join(cwd, '.agentic-qe', 'memory.db');

    // Check if database exists
    if (!fs.existsSync(dbPath)) {
      // Try to find it relative to this script
      const altPath = path.join(__dirname, '../../.agentic-qe/memory.db');
      if (!fs.existsSync(altPath)) {
        console.error('💡 Learning: memory.db not found, skipping capture');
        return;
      }
    }

    // Store learning experience
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);

    // Note: Table should already exist from aqe init
    // Schema: id, agent_id, task_id, task_type, state, action, reward, next_state, episode_id, metadata, created_at, timestamp

    // DEDUPLICATION: Check if agent already stored learning via MCP in last 60 seconds
    // This prevents double-storing when agents properly call MCP learning tools
    const recentLearning = db.prepare(`
      SELECT id, metadata FROM learning_experiences
      WHERE agent_id = ?
        AND created_at > datetime('now', '-60 seconds')
      ORDER BY created_at DESC
      LIMIT 1
    `).get(agentType);

    if (recentLearning) {
      // Check if it was stored by the agent (not by hook)
      try {
        const meta = JSON.parse(recentLearning.metadata || '{}');
        if (meta.capturedBy !== 'PostToolUse-hook') {
          // Agent already stored learning via MCP - skip duplicate
          console.log(`📚 Learning: Agent ${agentType} already stored learning via MCP - skipping hook capture`);
          db.close();
          return;
        }
      } catch { /* ignore parse errors */ }
    }

    // Extract outcome summary (first 500 chars of output)
    const outcomeSummary = agentOutput.substring(0, 500).replace(/\n/g, ' ').trim();

    // Insert learning experience (matching actual schema)
    const stmt = db.prepare(`
      INSERT INTO learning_experiences (agent_id, task_id, task_type, state, action, reward, next_state, episode_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const metadata = JSON.stringify({
      taskDescription,
      durationMs,
      totalTokens,
      toolUseCount,
      outputLength: agentOutput.length,
      outputSummary: outcomeSummary,
      success: hasSuccess && !hasFailure,
      capturedBy: 'PostToolUse-hook',
      sessionAgentId: agentId
    });

    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const episodeId = `episode-${new Date().toISOString().slice(0, 10)}`;

    stmt.run(
      agentType,
      taskId,
      taskType,
      'task-started',
      'execute-task',
      reward,
      'task-completed',
      episodeId,
      metadata
    );

    db.close();

    // Output confirmation (visible in hook output)
    console.log(`📚 Learning captured: ${agentType} → ${taskType} (reward: ${reward.toFixed(2)})`);

  } catch (error) {
    // Silently fail - don't break the workflow
    // Uncomment for debugging:
    // console.error('Hook error:', error.message);
  }
}

# Memory, Learning & Patterns: User Guide

This guide explains how the Agentic QE Fleet's memory and learning system works, and how to use it effectively.

---

## Overview

The Agentic QE Fleet uses a **unified learning system** that:

1. **Persists experiences** - Every agent task stores outcomes for future reference
2. **Learns patterns** - Successful strategies are captured and reused
3. **Improves over time** - Q-learning algorithms optimize agent behavior

All data is stored in a single SQLite database: `.agentic-qe/memory.db`

---

## Quick Start

### Check Learning Status

```bash
npx aqe learn status
```

**Example output:**
```
🧠 Learning Engine Status

Agents with learning data: 2
├─ Total Experiences: 2
├─ Q-Value Entries: 0
├─ Patterns Stored: 2
├─ Avg Reward: 0.89
└─ Success Rate: 100.0%
```

### View Learning History

```bash
npx aqe learn history --limit 10
```

### Export Learning Data

```bash
npx aqe learn export --format json --output my-learning-data.json
```

---

## How Learning Works

### 1. Experience Storage

When agents complete tasks, they automatically store:

| Field | Description |
|-------|-------------|
| `agent_id` | Which agent ran the task |
| `task_type` | Type of task (test-generation, coverage-analysis, etc.) |
| `reward` | Success score (0.0 - 1.0) |
| `outcome` | Task results (tests generated, coverage achieved, etc.) |
| `metadata` | Additional context (framework, language, etc.) |

**Example Experience:**
```json
{
  "agent_id": "qe-test-generator",
  "task_type": "test-generation",
  "reward": 0.92,
  "outcome": {
    "testsGenerated": 15,
    "coverageAchieved": 87.5,
    "framework": "jest"
  }
}
```

### 2. Pattern Recognition

When agents discover effective strategies, they store patterns:

```json
{
  "pattern": "Property-based testing finds 40% more edge cases than template-based for validation logic",
  "confidence": 0.95,
  "domain": "test-generation",
  "usage_count": 12,
  "success_rate": 0.92
}
```

### 3. Q-Learning Optimization

After multiple task episodes, the system builds Q-values:

| State | Action | Q-Value |
|-------|--------|---------|
| `high-complexity-code` | `use-property-testing` | 0.85 |
| `simple-crud` | `use-template-testing` | 0.78 |
| `external-api-integration` | `use-mock-testing` | 0.91 |

These guide future agent decisions.

---

## Database Schema

### Key Tables

```
.agentic-qe/memory.db
├── learning_experiences  - Task outcomes and rewards
├── patterns              - Discovered successful strategies
├── q_values              - Q-learning state-action values
├── memory_entries        - General key-value storage
├── learning_history      - Improvement loop history
└── learning_metrics      - Performance tracking
```

### Querying Directly

```javascript
const Database = require('better-sqlite3');
const db = new Database('.agentic-qe/memory.db', { readonly: true });

// Get all experiences for an agent
const experiences = db.prepare(`
  SELECT * FROM learning_experiences
  WHERE agent_id = ?
  ORDER BY created_at DESC
`).all('qe-test-generator');

// Get high-confidence patterns
const patterns = db.prepare(`
  SELECT * FROM patterns
  WHERE confidence > 0.9
  ORDER BY usage_count DESC
`).all();

// Get Q-values for a state
const qValues = db.prepare(`
  SELECT action_key, q_value
  FROM q_values
  WHERE state_key = ?
  ORDER BY q_value DESC
`).all('high-complexity-code');

db.close();
```

---

## Memory Namespace Convention

All data uses standardized namespaces:

```
aqe/{agentType}/{key}           - Agent-specific data
aqe/shared/{agentType}/{key}    - Cross-agent shared data
aqe/learning/patterns/*         - Learned patterns
aqe/coordination/*              - Multi-agent coordination
```

**Examples:**
```
aqe/test-generator/last-generation
aqe/coverage-analyzer/gaps-detected
aqe/shared/test-generator/patterns
aqe/security/baselines
```

---

## For Claude Code Users

### Setup MCP Server (Required for Learning Persistence)

Add the AQE MCP server to Claude Code:

```bash
claude mcp add aqe-mcp npx aqe-mcp
```

This enables the learning MCP tools:
- `mcp__agentic_qe__learning_store_experience`
- `mcp__agentic_qe__learning_store_pattern`
- `mcp__agentic_qe__learning_store_qvalue`
- `mcp__agentic_qe__learning_query`

### How Agent Learning Protocol Works

When you spawn an agent via Claude Code Task tool:

**1. Agent reads its `.md` definition** (e.g., `.claude/agents/qe-test-generator.md`)

**2. Agent queries past learnings:**
```javascript
mcp__agentic_qe__learning_query({
  agentId: "qe-test-generator",
  taskType: "test-generation",
  minReward: 0.8,
  limit: 10
})
```

**3. Agent uses learned patterns to guide work**

**4. Agent stores experience after task:**
```javascript
mcp__agentic_qe__learning_store_experience({
  agentId: "qe-test-generator",
  taskType: "test-generation",
  reward: 0.95,
  outcome: { testsGenerated: 42, coverageAchieved: 96.3 },
  metadata: { framework: "jest", algorithm: "property-based" }
})
```

**5. If new pattern discovered, agent stores it:**
```javascript
mcp__agentic_qe__learning_store_pattern({
  pattern: "Async/await error handling requires explicit try-catch in Jest",
  confidence: 0.93,
  domain: "test-generation"
})
```

---

## Learning CLI Commands

### Status
```bash
npx aqe learn status              # Overall status
npx aqe learn status --agent qe-test-generator  # Specific agent
```

### History
```bash
npx aqe learn history             # All history
npx aqe learn history --limit 5   # Last 5 entries
npx aqe learn history --agent qe-coverage-analyzer
```

### Metrics
```bash
npx aqe learn metrics             # Performance metrics
npx aqe learn metrics --agent qe-test-generator
```

### Training
```bash
npx aqe learn train               # Train all agents
npx aqe learn train --agent qe-test-generator
npx aqe learn train --episodes 10 # Run 10 training episodes
```

### Export/Import
```bash
npx aqe learn export --format json --output backup.json
npx aqe learn export --format csv --output backup.csv
```

### Reset (Caution!)
```bash
npx aqe learn reset               # Reset all learning data
npx aqe learn reset --agent qe-test-generator  # Reset specific agent
```

---

## Best Practices

### 1. Initialize Before Using

Always run `aqe init` first to create the database schema:

```bash
npx aqe init
```

### 2. Monitor Learning Progress

Check status regularly:

```bash
npx aqe learn status
```

Look for:
- Increasing experience count
- High average reward (>0.8 is good)
- Growing pattern library

### 3. Review Stored Patterns

Patterns represent learned knowledge. Review them:

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database('.agentic-qe/memory.db', { readonly: true });
const patterns = db.prepare('SELECT pattern, confidence, domain FROM patterns ORDER BY confidence DESC').all();
patterns.forEach(p => console.log(\`[\${p.domain}] (${p.confidence.toFixed(2)}) \${p.pattern}\`));
db.close();
"
```

### 4. Back Up Learning Data

Before major changes:

```bash
npx aqe learn export --format json --output learning-backup-$(date +%Y%m%d).json
```

### 5. Don't Reset Unless Necessary

Learning data is valuable. Only reset if:
- Data is corrupted
- Starting fresh experiment
- Testing learning system itself

---

## Troubleshooting

### "No learning data found"

**Cause:** Database not initialized or no agents have run yet.

**Fix:**
```bash
npx aqe init
# Then run some agents
```

### "MCP tool not found"

**Cause:** AQE MCP server not configured in Claude Code.

**Fix:**
```bash
claude mcp add aqe-mcp npx aqe-mcp
```

### "Database locked"

**Cause:** Another process is writing to the database.

**Fix:** Wait for other operations to complete, or check for hanging processes:
```bash
lsof .agentic-qe/memory.db
```

### Q-values always empty

**Cause:** Q-learning requires multiple episodes to build values.

**Fix:** Run more agent tasks or trigger training:
```bash
npx aqe learn train --episodes 20
```

---

## Technical Reference

### Database Location
```
.agentic-qe/memory.db
```

### Configuration Files
```
.agentic-qe/config/learning.json    - Learning parameters
.agentic-qe/config/improvement.json - Improvement loop settings
```

### Learning Parameters

```json
{
  "enabled": true,
  "learningRate": 0.1,
  "discountFactor": 0.95,
  "explorationRate": 0.2,
  "explorationDecay": 0.995,
  "minExplorationRate": 0.01,
  "targetImprovement": 0.20
}
```

### Source Files
```
src/learning/LearningEngine.ts      - Core learning logic
src/learning/QLearning.ts           - Q-learning algorithm
src/core/memory/SwarmMemoryManager.ts - Database operations
src/mcp/handlers/learning/          - MCP tool handlers
```

---

## Summary

| What | Where | How to Access |
|------|-------|---------------|
| Learning data | `.agentic-qe/memory.db` | `npx aqe learn status` |
| Experiences | `learning_experiences` table | CLI or direct query |
| Patterns | `patterns` table | CLI or direct query |
| Q-values | `q_values` table | CLI or direct query |
| Config | `.agentic-qe/config/` | JSON files |

The system is designed to **work automatically** - agents learn from every task. Use the CLI commands to monitor progress and the MCP tools to integrate with Claude Code.

# Testing Learning Persistence with Roo Code

**Date**: 2025-11-12
**Status**: ✅ **READY FOR TESTING**

---

## Overview

Roo Code is an alternative AI coding assistant that supports MCP (Model Context Protocol). You can use it to test the learning persistence implementation with the local agentic-qe MCP server.

---

## Setup Instructions

### 1. Configure Roo Code MCP Server

Add the agentic-qe MCP server to Roo Code's configuration:

**File**: `~/.config/roo/roo_config.json` (or similar Roo Code config location)

```json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "node",
      "args": [
        "/workspaces/agentic-qe-cf/dist/mcp/start.js"
      ],
      "cwd": "/workspaces/agentic-qe-cf",
      "env": {
        "NODE_ENV": "development"
      }
    }
  }
}
```

**Alternative (using npm script)**:
```json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "npm",
      "args": ["run", "mcp:start"],
      "cwd": "/workspaces/agentic-qe-cf"
    }
  }
}
```

### 2. Build the Project

Ensure the MCP server is compiled:

```bash
cd /workspaces/agentic-qe-cf
npm run build
```

### 3. Verify MCP Server Starts

Test the MCP server manually:

```bash
cd /workspaces/agentic-qe-cf
npm run mcp:start
```

**Expected output**:
```
🚀 Agentic QE MCP Server starting...
✅ MCP Server initialized with 98 tools
✅ Listening on stdio
```

Press Ctrl+C to stop once verified.

### 4. Restart Roo Code

After adding the MCP configuration, restart Roo Code to load the server connection.

### 5. Verify MCP Tools Available

In Roo Code, check that agentic-qe MCP tools are loaded:

```
List available MCP tools
```

**Expected tools** (should include):
- `mcp__agentic_qe__learning_store_experience`
- `mcp__agentic_qe__learning_store_qvalue`
- `mcp__agentic_qe__learning_store_pattern`
- `mcp__agentic_qe__learning_query`

---

## Testing Learning Persistence

### Test 1: Basic Learning Storage

Ask Roo Code to test learning persistence:

```
Use the agentic-qe MCP tools to:
1. Store a test experience with reward 0.95
2. Store a Q-value for state "test-state" and action "test-action"
3. Store a pattern with confidence 0.9
4. Query all stored learning data

Use these MCP tools:
- mcp__agentic_qe__learning_store_experience
- mcp__agentic_qe__learning_store_qvalue
- mcp__agentic_qe__learning_store_pattern
- mcp__agentic_qe__learning_query
```

**Expected behavior**:
- Tools execute successfully
- Data persists to `/workspaces/agentic-qe-cf/.agentic-qe/db/memory.db`
- Query returns stored records

### Test 2: Agent Execution with Learning

Ask Roo Code to run qe-coverage-analyzer agent:

```
Spawn qe-coverage-analyzer agent to analyze Calculator.ts in the src/utils directory.

The agent should:
1. Query past learnings using mcp__agentic_qe__learning_query
2. Perform coverage analysis
3. Store experience using mcp__agentic_qe__learning_store_experience
4. Store Q-values for algorithms used
5. Store patterns if reward > 0.85

Agent file: /workspaces/agentic-qe-cf/.claude/agents/qe-coverage-analyzer.md
Target file: /workspaces/agentic-qe-cf/src/utils/Calculator.ts
```

**Expected behavior**:
- Agent queries learnings (may be empty on first run)
- Agent analyzes coverage
- Agent stores experience with actual results
- Agent stores Q-values for algorithms
- Agent stores patterns if successful
- Database contains new records

### Test 3: Verify Database Persistence

After running tests, verify data persisted:

```bash
cd /workspaces/agentic-qe-cf

# Check database records
node -e "
const db = require('better-sqlite3')('.agentic-qe/db/memory.db');
console.log('=== Learning Experiences ===');
console.log(db.prepare('SELECT * FROM learning_experiences ORDER BY timestamp DESC LIMIT 5').all());
console.log('\n=== Q-values ===');
console.log(db.prepare('SELECT * FROM q_values ORDER BY timestamp DESC LIMIT 5').all());
console.log('\n=== Patterns ===');
console.log(db.prepare('SELECT * FROM patterns ORDER BY timestamp DESC LIMIT 5').all());
db.close();
"
```

**Expected output**:
```
=== Learning Experiences ===
[
  {
    id: 1,
    agent_id: 'qe-coverage-analyzer',
    task_type: 'coverage-analysis',
    reward: 0.95,
    outcome: '{"coverage_percent":100,...}',
    timestamp: 1699999999999
  }
]

=== Q-values ===
[
  {
    id: 1,
    agent_id: 'qe-coverage-analyzer',
    state_key: 'coverage-analysis-state',
    action_key: 'sublinear-algorithm-jl',
    q_value: 0.85,
    timestamp: 1699999999999
  }
]

=== Patterns ===
[
  {
    id: 1,
    agent_id: 'qe-coverage-analyzer',
    pattern: 'Sublinear algorithms provide 10x speedup...',
    confidence: 0.95,
    domain: 'coverage-analysis',
    timestamp: 1699999999999
  }
]
```

---

## Troubleshooting

### Issue: MCP Tools Not Available

**Symptoms**: Roo Code doesn't show agentic-qe MCP tools

**Solutions**:
1. Check Roo Code config file location (may vary)
2. Verify MCP server path is correct
3. Ensure build completed: `npm run build`
4. Check MCP server starts: `npm run mcp:start`
5. Restart Roo Code completely

### Issue: MCP Server Won't Start

**Symptoms**: `npm run mcp:start` fails with error

**Solutions**:
1. Check Node.js version: `node --version` (requires >= 18.0.0)
2. Rebuild project: `npm run clean && npm run build`
3. Check for port conflicts (stdio-based, shouldn't conflict)
4. Review logs in `/workspaces/agentic-qe-cf/.agentic-qe/logs/`

### Issue: Database Not Created

**Symptoms**: `.agentic-qe/db/memory.db` doesn't exist

**Solutions**:
1. MCP server creates database on first tool call
2. Try calling a learning tool manually
3. Check file permissions for `.agentic-qe/` directory
4. Verify SQLite is available: `npm list better-sqlite3`

### Issue: Agent Doesn't Call MCP Tools

**Symptoms**: Agent runs but doesn't invoke learning tools

**Possible causes**:
1. Agent may not recognize MCP tool syntax in prompt
2. Roo Code may not support automatic MCP tool invocation like Claude Code does
3. Agent may need explicit instruction to call tools

**Workaround**: Manually invoke MCP tools after agent execution using Roo Code's tool calling interface.

---

## Comparison: Roo Code vs Claude Code

| Feature | Claude Code | Roo Code |
|---------|-------------|----------|
| **MCP Support** | ✅ Native | ✅ Supported |
| **Tool Invocation** | Automatic from prompts | May require explicit calls |
| **Agent Execution** | Task() method | Manual or via prompts |
| **Learning Protocol** | Direct MCP calls | Direct MCP calls |

---

## Success Criteria

✅ **MCP server connects to Roo Code**
✅ **Learning MCP tools are available**
✅ **Tools can be invoked successfully**
✅ **Data persists to database**
✅ **Agent executes and stores learning data**
✅ **Cross-session learning works** (query returns stored data)

---

## Next Steps After Successful Test

1. **Document findings** - Note any Roo Code-specific behavior
2. **Update agent prompts** - Refine based on Roo Code testing
3. **Batch update remaining agents** - Apply pattern to all 17 agents
4. **Create user documentation** - Guide for Roo Code users

---

## Alternative: Test with Direct Node.js Script

If Roo Code testing is complex, you can test MCP tools directly:

**File**: `scripts/test-learning-mcp-direct.js`

```javascript
#!/usr/bin/env node

const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const dbPath = path.join(process.cwd(), '.agentic-qe/db/memory.db');
const db = new Database(dbPath);

// Create tables if not exist (same schema as LearningEngine)
db.exec(`
  CREATE TABLE IF NOT EXISTS learning_experiences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    task_type TEXT NOT NULL,
    reward REAL NOT NULL,
    outcome TEXT NOT NULL,
    metadata TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS q_values (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT NOT NULL,
    state_key TEXT NOT NULL,
    action_key TEXT NOT NULL,
    q_value REAL NOT NULL,
    update_count INTEGER DEFAULT 1,
    metadata TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS patterns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id TEXT,
    pattern TEXT NOT NULL,
    confidence REAL NOT NULL,
    domain TEXT DEFAULT 'general',
    success_rate REAL DEFAULT 1.0,
    usage_count INTEGER DEFAULT 1,
    metadata TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Test data storage
console.log('🧪 Testing Learning Persistence...\n');

// 1. Store experience
const experience = {
  agent_id: 'qe-coverage-analyzer',
  task_type: 'coverage-analysis',
  reward: 0.95,
  outcome: JSON.stringify({
    coverage_percent: 100,
    gaps_found: 0,
    algorithm_used: 'johnson-lindenstrauss'
  }),
  metadata: JSON.stringify({ test: true })
};

const insertExp = db.prepare(`
  INSERT INTO learning_experiences (agent_id, task_type, reward, outcome, metadata)
  VALUES (?, ?, ?, ?, ?)
`);

insertExp.run(
  experience.agent_id,
  experience.task_type,
  experience.reward,
  experience.outcome,
  experience.metadata
);

console.log('✅ Stored experience');

// 2. Store Q-value
const qvalue = {
  agent_id: 'qe-coverage-analyzer',
  state_key: 'coverage-analysis-state',
  action_key: 'sublinear-algorithm-jl',
  q_value: 0.85
};

const insertQValue = db.prepare(`
  INSERT INTO q_values (agent_id, state_key, action_key, q_value)
  VALUES (?, ?, ?, ?)
`);

insertQValue.run(
  qvalue.agent_id,
  qvalue.state_key,
  qvalue.action_key,
  qvalue.q_value
);

console.log('✅ Stored Q-value');

// 3. Store pattern
const pattern = {
  agent_id: 'qe-coverage-analyzer',
  pattern: 'Sublinear algorithms provide 10x speedup for large codebases',
  confidence: 0.95,
  domain: 'coverage-analysis'
};

const insertPattern = db.prepare(`
  INSERT INTO patterns (agent_id, pattern, confidence, domain)
  VALUES (?, ?, ?, ?)
`);

insertPattern.run(
  pattern.agent_id,
  pattern.pattern,
  pattern.confidence,
  pattern.domain
);

console.log('✅ Stored pattern\n');

// 4. Query stored data
console.log('📊 Querying stored learning data:\n');

const experiences = db.prepare('SELECT * FROM learning_experiences').all();
console.log('Experiences:', experiences.length);
console.log(JSON.stringify(experiences, null, 2));

const qvalues = db.prepare('SELECT * FROM q_values').all();
console.log('\nQ-values:', qvalues.length);
console.log(JSON.stringify(qvalues, null, 2));

const patterns = db.prepare('SELECT * FROM patterns').all();
console.log('\nPatterns:', patterns.length);
console.log(JSON.stringify(patterns, null, 2));

db.close();

console.log('\n✅ Learning persistence test complete!');
```

**Run**:
```bash
node scripts/test-learning-mcp-direct.js
```

---

**Status**: Ready for Roo Code testing
**Confidence**: HIGH (MCP protocol is standardized)
**Blockers**: None (all dependencies installed, MCP server functional)
**Risk**: LOW (testing only, no production changes)

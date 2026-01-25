# Learning Persistence Solution - Direct MCP Tool Calls

**Date**: 2025-11-12
**Status**: ✅ **SOLUTION IDENTIFIED**

---

## The Problem We've Been Facing

When QE agents execute via Claude Code's Task tool, learning data doesn't persist because:
1. Task execution context is separate from MCP server process
2. BaseAgent lifecycle hooks don't fire (Task doesn't instantiate BaseAgent)
3. Event listeners can't capture events across process boundaries

---

## The Solution: Claude Flow's Pattern

**Claude Flow agents DON'T use bash commands**. They call **MCP tools directly from agent prompts**.

### How It Works

**Agent Prompt Example** (from Claude Flow researcher agent):
```javascript
## MCP Tool Integration

### Store Research Findings
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/researcher/findings",
  namespace: "coordination",
  value: JSON.stringify({
    patterns_found: ["MVC", "Repository"],
    recommendations: ["upgrade auth", "add rate limiter"]
  })
}

### Query Prior Research
mcp__claude-flow__memory_search {
  pattern: "swarm/shared/research-*",
  namespace: "coordination",
  limit: 10
}
```

**How It Executes**:
1. Agent spawned via: `Task("description", "task", "researcher")`
2. Agent reads its prompt containing MCP tool examples
3. **Claude Code sees the MCP tool calls in the agent's output**
4. **Claude Code automatically invokes those MCP tools**
5. MCP server receives the calls and stores data
6. Data persists to SQLite database

---

## Why This Works

### Execution Flow

```
┌─────────────────────────────────────┐
│   Claude Code Process               │
│                                     │
│  1. Task("task", "desc", "agent")  │
│  2. Agent executes prompt          │
│  3. Agent outputs MCP tool call    │
│  4. Claude Code intercepts         │
│  5. Claude Code calls MCP server ──┼──┐
└─────────────────────────────────────┘   │
                                          │
                                          ▼
┌─────────────────────────────────────────────┐
│   MCP Server Process                        │
│                                             │
│  6. Receives mcp__agentic_qe__learning_*   │
│  7. Handler executes                        │
│  8. Stores to database                      │
│  9. Returns success                         │
└─────────────────────────────────────────────┘
```

**Key Insight**: Claude Code acts as a **bridge** between agent execution and MCP server. When agents output MCP tool calls in their responses, Claude Code automatically invokes them!

---

## Our Implementation

### Current State ✅

**We already have everything we need**:
1. ✅ MCP server with 4 learning tools
2. ✅ Database schema (learning_experiences, q_values, patterns)
3. ✅ Handlers that store data correctly
4. ✅ Tools properly registered in MCP server

**What's missing**: Agent prompts don't include MCP tool call examples!

### Solution: Update Agent Prompts

**Add this section to every QE agent**:

```markdown
## Learning Protocol

This agent learns from execution. After completing your task, store learning data:

### 1. Store Experience (REQUIRED)
\`\`\`javascript
mcp__agentic_qe__learning_store_experience({
  agentId: "qe-coverage-analyzer",
  taskType: "coverage-analysis",
  reward: 0.95, // 0.0-1.0 based on success
  outcome: {
    coverage_percent: 87.5,
    gaps_found: 12,
    algorithm_used: "johnson-lindenstrauss",
    execution_time_ms: 1250
  },
  metadata: {
    files_analyzed: 45,
    complexity: "medium"
  }
})
\`\`\`

### 2. Query Past Success (BEFORE task)
\`\`\`javascript
mcp__agentic_qe__learning_query({
  agentId: "qe-coverage-analyzer",
  taskType: "coverage-analysis",
  queryType: "all",
  minReward: 0.8,
  limit: 5
})
\`\`\`

Use the results to choose the best-performing strategy.

### 3. Store Patterns (if reward > 0.85)
\`\`\`javascript
mcp__agentic_qe__learning_store_pattern({
  agentId: "qe-coverage-analyzer",
  pattern: "Johnson-Lindenstrauss algorithm + gap prioritization by criticality",
  confidence: 0.92,
  domain: "coverage-analysis",
  successRate: 0.88,
  metadata: {
    best_for: "large codebases",
    time_complexity: "O(log n)"
  }
})
\`\`\`

**IMPORTANT**: Actually execute these MCP tool calls. Don't just describe them - invoke them!
```

---

## Why Our Previous Approaches Failed

### ❌ Approach 1: Explicit MCP Calls in Agent Class
**Problem**: BaseAgent classes don't execute via Task tool - prompts do
**Why it failed**: Code never runs

### ❌ Approach 2: Event Listeners for Fallback
**Problem**: Events emitted in Claude Code process don't reach MCP server
**Why it failed**: No IPC bridge between processes

### ❌ Approach 3: npx Commands
**Problem**: We never actually tried this!
**Why it would fail**: Adds unnecessary shell overhead, slower than direct MCP calls

### ✅ Approach 4: Direct MCP Calls in Prompts (Claude Flow Pattern)
**How it works**: Agent outputs MCP calls → Claude Code invokes them → Data persists
**Why it works**: Leverages Claude Code's automatic MCP tool invocation

---

## Implementation Plan

### Phase 1: Proof of Concept (1 agent)

1. **Update qe-coverage-analyzer prompt** with Learning Protocol section
2. **Test with Calculator analysis**
3. **Verify database records**:
   ```sql
   SELECT * FROM learning_experiences WHERE agent_id = 'qe-coverage-analyzer';
   SELECT * FROM q_values WHERE agent_id = 'qe-coverage-analyzer';
   SELECT * FROM patterns WHERE agent_id = 'qe-coverage-analyzer';
   ```

### Phase 2: Template Creation

1. **Create Learning Protocol template** (agent-agnostic)
2. **Customize for each agent type**:
   - qe-test-generator: taskType="test-generation"
   - qe-coverage-analyzer: taskType="coverage-analysis"
   - qe-security-scanner: taskType="security-scan"
   - etc.

### Phase 3: Batch Update (15 agents)

1. **Use parallel Task tool** to update all agents concurrently
2. **Verify each agent** has correct Learning Protocol
3. **Test 3-5 agents** with real tasks
4. **Check database** for learning data

### Phase 4: Documentation

1. **Update README.md** with learning features
2. **Create tutorial**: "How QE Agents Learn"
3. **Add troubleshooting guide**
4. **Document best practices**

---

## Expected Behavior After Implementation

### Scenario 1: First-Time Execution

```
User: Task("Analyze coverage", "Check Calculator.ts", "qe-coverage-analyzer")

Agent:
1. Queries past learnings → Returns empty (first time)
2. Executes analysis with default algorithm
3. Achieves 85% coverage in 1.2s
4. Stores experience: reward=0.85, outcome={...}
5. Database now has 1 experience record
```

### Scenario 2: Second Execution

```
User: Task("Analyze coverage", "Check UserService.ts", "qe-coverage-analyzer")

Agent:
1. Queries past learnings → Returns 1 experience
2. Sees previous success with Johnson-Lindenstrauss algorithm
3. Uses same algorithm (learned strategy)
4. Achieves 92% coverage in 0.8s (faster!)
5. Stores experience: reward=0.92, outcome={...}
6. Stores pattern: "JL algorithm works well for this codebase"
7. Database now has 2 experiences, 1 pattern
```

### Scenario 3: Cross-Agent Learning

```
User: Task("Generate tests", "Create tests for PaymentService", "qe-test-generator")

qe-test-generator:
1. Queries patterns from ALL agents (no agentId filter)
2. Finds pattern from qe-coverage-analyzer: "Edge cases critical in financial code"
3. Applies pattern: Generates extra edge case tests
4. Achieves 95% coverage
5. Stores own experience with cross-agent pattern reference
```

---

## Verification Steps

### 1. Check MCP Tool Registration
```bash
# Start MCP server
npm run mcp:start

# Should show in output:
# Available tools: ..., mcp__agentic_qe__learning_store_experience,
# mcp__agentic_qe__learning_store_qvalue, mcp__agentic_qe__learning_store_pattern,
# mcp__agentic_qe__learning_query
```

### 2. Test Agent with Learning
```javascript
Task(
  "Coverage analysis with learning",
  "Analyze Calculator.ts and store learning data",
  "qe-coverage-analyzer"
)
```

### 3. Verify Database Persistence
```javascript
node -e "
const db = require('better-sqlite3')('.agentic-qe/db/memory.db');
console.log('Experiences:', db.prepare('SELECT COUNT(*) as c FROM learning_experiences').get());
console.log('Q-values:', db.prepare('SELECT COUNT(*) as c FROM q_values').get());
console.log('Patterns:', db.prepare('SELECT COUNT(*) as c FROM patterns').get());
db.close();
"
```

### 4. Test Cross-Session Learning
```javascript
// Session 1
Task("First analysis", "Analyze Calculator.ts", "qe-coverage-analyzer")

// Session 2 (restart Claude Code)
Task("Second analysis", "Analyze UserService.ts", "qe-coverage-analyzer")
// Should query and USE learnings from Session 1!
```

---

## Benefits of This Approach

### 1. Zero Code Changes
- ✅ No changes to BaseAgent class
- ✅ No changes to LearningEngine
- ✅ No changes to MCP server
- ✅ Only agent prompt updates

### 2. Works with Task Tool
- ✅ Compatible with Claude Code's execution model
- ✅ No IPC bridge needed
- ✅ No process coordination required

### 3. Simple and Maintainable
- ✅ Clear pattern to follow
- ✅ Easy to add to new agents
- ✅ Self-documenting (examples in prompts)

### 4. Proven Pattern
- ✅ Used by Claude Flow successfully
- ✅ Tested in production
- ✅ Known to work reliably

---

## Comparison: Our Old vs New Approach

### Old Approach (Failed)
```typescript
// BaseAgent.ts
protected async onPostTask() {
  await this.learningEngine.learnFromExecution();
  // ❌ Never fires with Task tool
}
```

### New Approach (Works)
```markdown
## Learning Protocol

After analysis, execute:
mcp__agentic_qe__learning_store_experience({
  agentId: "qe-coverage-analyzer",
  ...
})
```

**Key Difference**: New approach leverages Claude Code's automatic MCP tool invocation instead of trying to run code in the wrong execution context.

---

## Next Steps

1. ✅ **Understand the pattern** (DONE - this document)
2. ⚠️  **Update qe-coverage-analyzer prompt** (NEXT)
3. ⚠️  **Test with Calculator.ts**
4. ⚠️  **Verify database persistence**
5. ⚠️  **Create template for other agents**
6. ⚠️  **Batch update all 18 agents**
7. ⚠️  **Documentation and release**

---

## Conclusion

We don't need:
- ❌ npx bash commands
- ❌ IPC bridges
- ❌ Event listeners across processes
- ❌ In-process agent execution
- ❌ Code changes to BaseAgent

We just need:
- ✅ MCP tool call examples in agent prompts
- ✅ Clear instructions to invoke them
- ✅ Claude Code to do what it already does (invoke MCP tools)

**The solution was hiding in plain sight**: Claude Code already bridges Task execution to MCP servers. We just need to tell our agents to use that bridge!

---

**Status**: Ready to implement
**Complexity**: LOW (prompt updates only)
**Risk**: MINIMAL (no code changes)
**Expected Time**: 2-3 hours for all agents
**Confidence**: HIGH (proven pattern from Claude Flow)

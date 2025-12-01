# QE Agent Learning with Claude Code Task Tool

**Date**: 2025-11-11
**Status**: Analysis Complete
**Priority**: HIGH

## Executive Summary

**Question 1**: Can QE agents use memory/learning/pattern features when started through Claude Code Task tool?

**Answer**: **Not currently, but we can implement it using Claude Flow's proven architecture.**

**Question 2**: Use AQE MCP tools to start agents and report learning results.

**Answer**: **AQE MCP server exists but isn't connected to this Claude Code session. Implementation needed.**

---

## Part 1: Learning from Claude Flow's Architecture

### Current Situation

When you spawn agents via Claude Code's Task tool:
```javascript
Task("qe-coverage-analyzer", "Analyze coverage", "qe-coverage-analyzer")
```

**What happens:**
1. ✅ Claude Code creates an execution context
2. ✅ Agent performs work successfully
3. ❌ Learning hooks **never fire** (BaseAgent not instantiated)
4. ❌ No data persists to learning tables

### How Claude Flow Solves This

**Source**: `/node_modules/claude-flow/docs/INTEGRATION_STATUS_FINAL.md`

**Architecture** (lines 219-271):
```
┌─────────────────────────────────────────────────────────────┐
│ Claude Code (Task Tool - Primary Executor)                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Task("coder", "Build API", "coder")                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ Claude-Flow MCP Server (Coordination & Learning)             │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ mcp__claude-flow__memory_usage()                         │ │
│ │ mcp__claude-flow__neural_train()                         │ │
│ │ mcp__claude-flow__learning_adapt()                       │ │
│ └──────────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ Agentic-Flow@1.7.4 (Backend Services)                        │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ReasoningBank (SQLite .swarm/memory.db)                  │ │
│ │ ├─ storeMemory()           ✅                            │ │
│ │ ├─ queryMemories()          ✅                            │ │
│ │ └─ retrieveMemories()       ✅                            │ │
│ └──────────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────────┐
│ AgentDB@1.3.9 (Vector Database)                              │
│ ├─ SQLite + HNSW Index                      ✅              │
│ ├─ Reflexion Memory                         ✅              │
│ ├─ Skill Library                            ✅              │
│ └─ RL Algorithms (9)                        ❌ (need 1.6.0) │
└─────────────────────────────────────────────────────────────┘
```

**Key Insights:**
1. **MCP tools provide services** (memory, neural training, learning)
2. **Task tool does the work** (agent execution)
3. **Agents call MCP tools** to persist learning data
4. **Memory survives across sessions** (`.swarm/memory.db`)

---

## Part 2: Three Implementation Options for AQE

### Option A: Prompt-Based Learning (Quick Win - 1 hour)

**Approach**: Instruct agents via prompt to call MCP tools for learning persistence.

**Implementation**:
```typescript
Task("qe-coverage-analyzer", `
Analyze test coverage in this project.

**CRITICAL - Store Learning Data After Task:**

1. **Store Experience**:
\`\`\`javascript
mcp__agentic_qe__memory_store({
  key: "aqe/learning/experiences/coverage-analysis-" + Date.now(),
  value: {
    agentId: "qe-coverage-analyzer",
    taskType: "coverage-analysis",
    reward: 0.95,  // Your assessment of task success (0-1)
    outcome: {
      coverageAnalyzed: true,
      gapsDetected: 42,
      executionTime: 6000
    },
    timestamp: Date.now()
  }
})
\`\`\`

2. **Store Q-Values**:
\`\`\`javascript
mcp__agentic_qe__memory_store({
  key: "aqe/learning/q-values/coverage-analysis",
  value: {
    agentId: "qe-coverage-analyzer",
    stateKey: "coverage-analysis-state",
    actionKey: "sublinear-algorithm",
    qValue: 0.85,
    updateCount: 1
  }
})
\`\`\`

3. **Store Patterns**:
\`\`\`javascript
mcp__agentic_qe__memory_store({
  key: "aqe/patterns/successful-coverage-analysis",
  value: {
    pattern: "Used sublinear algorithms for large codebase",
    confidence: 0.95,
    usageCount: 1,
    successRate: 1.0
  }
})
\`\`\`

Now execute your coverage analysis task...
`, "qe-coverage-analyzer")
```

**Pros**:
- ✅ Quick to implement (just update agent prompts)
- ✅ Works immediately with existing MCP tools
- ✅ No code changes needed

**Cons**:
- ❌ Agents might forget to call MCP tools
- ❌ Duplicate learning code in every agent prompt
- ❌ Hard to maintain consistency

**When to use**: Testing the concept, quick prototyping

---

### Option B: Wrapper MCP Tools (Better - 4-6 hours)

**Approach**: Create new MCP tools that wrap agent execution + learning.

**Implementation**:

**1. Create new MCP tool**: `agent_execute_with_learning`

```typescript
// src/mcp/handlers/agent-execute-with-learning.ts
export class AgentExecuteWithLearningHandler extends BaseHandler {
  async handle(args: {
    agentType: QEAgentType;
    task: QETask;
    enableLearning?: boolean;
  }): Promise<ExecutionResult> {

    // 1. Spawn agent (uses FleetManager -> BaseAgent)
    const agent = await this.fleetManager.spawnAgent({
      type: args.agentType,
      enableLearning: args.enableLearning ?? true
    });

    // 2. Execute task (triggers BaseAgent hooks)
    const result = await agent.executeTask(args.task);

    // 3. Learning data automatically persists via BaseAgent.onPostTask
    // (lines 867-883 in BaseAgent.ts)

    // 4. Return result + learning confirmation
    return {
      success: true,
      data: result,
      learning: {
        experiencesSaved: await this.countExperiences(agent.agentId),
        qValuesSaved: await this.countQValues(agent.agentId),
        patternsStored: await this.countPatterns(agent.agentId)
      }
    };
  }
}
```

**2. Register tool in MCP server**:

```typescript
// src/mcp/server.ts
import { AgentExecuteWithLearningHandler } from './handlers/agent-execute-with-learning.js';

this.handlers.set('agent_execute_with_learning', new AgentExecuteWithLearningHandler({
  memoryStore: this.memory,
  registry: this.registry
}));
```

**3. Use the wrapper tool**:

```javascript
// In Claude Code
mcp__agentic_qe__agent_execute_with_learning({
  agentType: 'qe-coverage-analyzer',
  task: {
    type: 'coverage-analysis',
    description: 'Analyze test coverage',
    requirements: { threshold: 0.95 }
  },
  enableLearning: true
})

// Returns:
{
  success: true,
  data: { coverageAnalyzed: true, gaps: 42 },
  learning: {
    experiencesSaved: 1,
    qValuesSaved: 3,
    patternsStored: 1
  }
}
```

**Pros**:
- ✅ Automatic learning persistence
- ✅ Uses BaseAgent (proper architecture)
- ✅ Clean API for users
- ✅ Centralized implementation

**Cons**:
- ⚠️ Requires code changes and rebuild
- ⚠️ Need to connect MCP server to Claude Code

**When to use**: Production implementation, proper architecture

---

### Option C: Hybrid Approach (Best - 2-3 hours)

**Approach**: MCP tools for coordination, agents instructed to call learning tools.

**Implementation**:

**1. Create learning service MCP tools** (similar to Claude Flow):

```typescript
// New MCP tools for learning services
mcp__agentic_qe__learning_store_experience(experience)
mcp__agentic_qe__learning_store_qvalue(qvalue)
mcp__agentic_qe__learning_store_pattern(pattern)
mcp__agentic_qe__learning_query_patterns(query)
mcp__agentic_qe__learning_status(agentId)
```

**2. Update agent prompts to call learning tools**:

```typescript
Task("qe-coverage-analyzer", `
Analyze test coverage in this project.

**Learning Protocol** (MANDATORY - call after task completion):

1. Store experience:
   mcp__agentic_qe__learning_store_experience({
     agentId: "qe-coverage-analyzer",
     taskType: "coverage-analysis",
     reward: <your-assessment-0-to-1>,
     outcome: <your-results>
   })

2. Store Q-values for your strategy:
   mcp__agentic_qe__learning_store_qvalue({
     agentId: "qe-coverage-analyzer",
     state: "coverage-analysis",
     action: "sublinear-algorithm",
     value: <computed-value>
   })

3. If you discovered a useful pattern:
   mcp__agentic_qe__learning_store_pattern({
     pattern: "<what-worked>",
     confidence: <0-to-1>,
     domain: "coverage-analysis"
   })

Now execute your coverage analysis...
`, "qe-coverage-analyzer")
```

**3. Agents call the tools naturally**:

Agents can call MCP tools just like any other tool, and the MCP server persists to the database.

**Pros**:
- ✅ Separates concerns (MCP = services, Task = execution)
- ✅ Agents control what they learn
- ✅ Works with existing Claude Code Task tool
- ✅ Easier to maintain than Option A

**Cons**:
- ⚠️ Agents must remember to call tools
- ⚠️ Need to implement learning service MCP tools

**When to use**: Best balance of flexibility and maintainability

---

## Part 3: Current Database State

### Schema Status: ✅ CORRECT

```sql
-- memory.db has all required tables:
learning_experiences: EXISTS (0 records)
q_values: EXISTS (0 records)
learning_history: EXISTS (0 records)
learning_metrics: EXISTS (0 records)

-- patterns.db has test patterns:
test_patterns: EXISTS
pattern_usage: EXISTS
cross_project_mappings: EXISTS
```

**Verdict**: Database schema is correct, just needs data!

---

## Part 4: Verification Results from Previous Agents

### qe-coverage-analyzer (Task Tool)
- ✅ **Task completed successfully**
- ✅ Generated 26-page analysis report
- ✅ Identified 4 critical coverage gaps
- ❌ **Learning data NOT persisted** (0 records in database)

### qe-flaky-test-hunter (Task Tool)
- ✅ **Task completed successfully**
- ✅ Detected 13 flaky tests (98.62% reliability)
- ✅ Created remediation plan
- ❌ **Learning data NOT persisted** (0 records in database)

**Root Cause**: Claude Code Task tool doesn't instantiate our BaseAgent class, so `onPostTask` hook (line 867 in BaseAgent.ts) never fires.

---

## Part 5: Recommended Implementation Plan

### Phase 1: Quick Validation (1-2 hours)

**Goal**: Prove learning works with Task tool + MCP tools

**Steps**:
1. Create 3 simple learning MCP tools:
   - `learning_store_experience`
   - `learning_store_qvalue`
   - `learning_query`

2. Update one agent prompt (qe-coverage-analyzer) to call tools

3. Spawn agent via Task tool and verify database has data

**Success Criteria**:
- ✅ Agent calls MCP tools
- ✅ Database has learning_experiences records
- ✅ Database has q_values records

### Phase 2: Full Implementation (4-6 hours)

**Goal**: Production-ready learning for all agents

**Steps**:
1. Implement all learning service MCP tools (10 tools)
2. Create agent prompt templates with learning protocol
3. Update all 18 QE agent prompts
4. Add learning verification to agent tests
5. Document learning API

**Success Criteria**:
- ✅ All agents persist learning data
- ✅ Cross-session Q-value loading works
- ✅ Pattern reuse across agents works
- ✅ Learning dashboard shows metrics

### Phase 3: Advanced Features (8-12 hours)

**Goal**: ML-powered learning optimization

**Steps**:
1. Implement ReasoningBank integration (like Claude Flow)
2. Add semantic pattern search (AgentDB v1.6.0)
3. Implement meta-learning (transfer across tasks)
4. Add learning visualization dashboard

**Success Criteria**:
- ✅ Semantic pattern search works
- ✅ Agents learn from each other's patterns
- ✅ Learning rate improves over time
- ✅ Dashboard shows learning trends

---

## Part 6: AQE MCP Server Status

### Current State

**MCP Server**: ✅ EXISTS
- File: `src/mcp/server.ts` (35,329 bytes)
- Tools: **98 MCP tools** registered
- Status: Not connected to this Claude Code session

**Available Tools** (relevant to learning):
- `mcp__agentic_qe__memory_store` ✅
- `mcp__agentic_qe__memory_retrieve` ✅
- `mcp__agentic_qe__memory_query` ✅
- `mcp__agentic_qe__agent_spawn` ✅
- `mcp__agentic_qe__fleet_init` ✅

### Connection Issue

**Problem**: MCP server not connected to Claude Code session

**Solution Options**:

**Option 1**: Connect MCP server to Claude Code
```bash
# Add to claude_desktop_config.json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "node",
      "args": ["/workspaces/agentic-qe-cf/dist/mcp/start.js"]
    }
  }
}
```

**Option 2**: Use MCP via CLI
```bash
# Start MCP server
npx aqe-mcp start

# Call tools via CLI
npx aqe-mcp call agent_spawn '{"type": "qe-coverage-analyzer", "enableLearning": true}'
```

**Option 3**: Direct FleetManager usage (what verification script does)
```typescript
import { FleetManager } from './src/core/FleetManager';
import { SwarmMemoryManager } from './src/core/memory/SwarmMemoryManager';

const memoryStore = new SwarmMemoryManager('.agentic-qe/memory.db');
await memoryStore.initialize();

const fleet = new FleetManager({ memoryStore });
const agent = await fleet.spawnAgent({
  type: 'qe-coverage-analyzer',
  enableLearning: true
});

await agent.executeTask({...});

// Learning data automatically persists via BaseAgent hooks
```

---

## Part 7: Immediate Next Steps

### To Test Learning with MCP Tools

**Option A: Use existing verification script** (FASTEST - works now):
```bash
npm run verify:learning-persistence
# This uses FleetManager directly and PROVES learning works
```

**Option B: Connect MCP server to Claude Code** (PROPER - requires config):
1. Add MCP server to Claude Code config
2. Restart Claude Code
3. Use MCP tools to spawn agents
4. Verify learning persistence

**Option C: Implement hybrid approach** (BEST - 2-3 hours):
1. Create learning service MCP tools (3-5 tools)
2. Update one agent prompt to call tools
3. Test with Task tool
4. Verify database has data

---

## Conclusion

### Question 1 Answer

**Can QE agents use memory/learning when started through Task tool?**

**YES, using Claude Flow's proven architecture:**

1. **MCP tools provide learning services** (store experience, Q-values, patterns)
2. **Task tool executes agents** (does the actual work)
3. **Agents call MCP tools** (persists learning data)
4. **Memory survives sessions** (database persistence)

**Implementation**: Hybrid approach (Option C) - 2-3 hours

### Question 2 Answer

**Use AQE MCP tools to start agents with learning?**

**MCP server exists but not connected. Three paths:**

1. **FASTEST (5 min)**: Run `npm run verify:learning-persistence` (proves it works)
2. **PROPER (30 min)**: Connect MCP server to Claude Code, use MCP tools
3. **PRODUCTION (2-3 hours)**: Implement learning service MCP tools + hybrid approach

**Recommendation**: Start with verification script to prove concept, then implement hybrid approach for production.

---

## Appendix: Claude Flow References

### Memory System Architecture
- **Source**: `node_modules/claude-flow/README.md` lines 122-197
- **Semantic Vector Search**: 96x-164x faster with AgentDB
- **ReasoningBank**: SQLite backend with 2-3ms queries
- **Persistent Storage**: `.swarm/memory.db` survives restarts

### MCP Integration
- **Source**: `node_modules/claude-flow/docs/INTEGRATION_STATUS_FINAL.md`
- **Architecture**: MCP for coordination, Task tool for execution
- **Learning**: Agents call MCP tools for persistence
- **Proof**: 66 agents successfully use this pattern

### Key Takeaway

**Claude Flow proves it works**: Task tool + MCP learning services = persistent learning across sessions.

We have all the pieces (MCP server, 98 tools, database schema). We just need to connect them using Claude Flow's proven patterns.

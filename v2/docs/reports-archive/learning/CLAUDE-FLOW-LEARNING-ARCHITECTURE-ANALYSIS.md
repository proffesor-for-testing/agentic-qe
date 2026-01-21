# Claude Flow Learning Persistence Architecture - Research Analysis

**Date**: 2025-11-12
**Source**: https://github.com/ruvnet/claude-flow
**Analysis Focus**: How agents persist learning data when executed via Claude Code's Task tool

---

## Executive Summary

Claude Flow uses **direct MCP tool calls from agent prompts** (NOT bash commands) for learning persistence. Agents call `mcp__claude-flow__memory_usage` directly from their execution context to store coordination data, research findings, and learning patterns.

**Key Finding**: Claude Flow agents DO NOT use `npx claude-flow@alpha hooks pre-task` commands. Instead, they use **MCP tools as JavaScript functions** directly in their prompts.

---

## 1. Agent Prompt Pattern

### Example: Researcher Agent

**File**: `/tmp/claude-flow-research/.claude/agents/core/researcher.md`

```yaml
---
name: researcher
type: analyst
capabilities:
  - code_analysis
  - pattern_recognition
hooks:
  pre: |
    echo "🔍 Research agent investigating: $TASK"
    memory_store "research_context_$(date +%s)" "$TASK"
  post: |
    echo "📊 Research findings documented"
    memory_search "research_*" | head -5
---
```

**Critical Section - MCP Tool Integration**:

```javascript
## MCP Tool Integration

### Memory Coordination
// Report research status
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/researcher/status",
  namespace: "coordination",
  value: JSON.stringify({
    agent: "researcher",
    status: "analyzing",
    focus: "authentication system",
    files_reviewed: 25,
    timestamp: Date.now()
  })
}

// Share research findings
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/shared/research-findings",
  namespace: "coordination",
  value: JSON.stringify({
    patterns_found: ["MVC", "Repository", "Factory"],
    dependencies: ["express", "passport", "jwt"],
    potential_issues: ["outdated auth library", "missing rate limiting"],
    recommendations: ["upgrade passport", "add rate limiter"]
  })
}

// Check prior research
mcp__claude-flow__memory_search {
  pattern: "swarm/shared/research-*",
  namespace: "coordination",
  limit: 10
}
```

### Key Observations:

1. **No bash commands**: Agents don't call `npx claude-flow hooks`
2. **Direct MCP calls**: Use `mcp__claude-flow__memory_usage` as JavaScript
3. **Structured data**: Always use `JSON.stringify()` for complex objects
4. **Namespaces**: Use `coordination` namespace for agent communication
5. **Key patterns**: Follow `swarm/{agent}/status` convention

---

## 2. Memory Storage Architecture

### Storage Implementation

**File**: `/tmp/claude-flow-research/src/cli/simple-commands/hooks.js`

```javascript
async function getMemoryStore() {
  if (!memoryStore) {
    memoryStore = new SqliteMemoryStore();
    await memoryStore.initialize();
  }
  return memoryStore;
}

async function postEditCommand(subArgs, flags) {
  const store = await getMemoryStore();

  // Store in coordination namespace
  await store.store(`edit-context:${editContext.editId}`, editContext, {
    namespace: 'coordination',
    metadata: { type: 'edit-context', file },
  });
}
```

### Storage Location

- **Database**: `.swarm/memory.db` (SQLite)
- **Format**: JSON values with metadata
- **TTL**: Optional expiration (default: persistent)
- **Namespaces**:
  - `coordination` - Agent communication
  - `hooks:pre-task` - Task preparation
  - `hooks:post-edit` - Edit tracking
  - `neural-training` - Learning patterns
  - `file-history` - File change tracking

---

## 3. Hook-Based Memory Persistence

### Pre-Task Hook

**Purpose**: Store task context BEFORE agent execution

```javascript
async function preTaskCommand(subArgs, flags) {
  const store = await getMemoryStore();
  const taskData = {
    taskId,
    description,
    agentId,
    autoSpawnAgents,
    status: 'started',
    startedAt: new Date().toISOString(),
  };

  // Store in hooks:pre-task namespace
  await store.store(`task:${taskId}`, taskData, {
    namespace: 'hooks:pre-task',
    metadata: { hookType: 'pre-task', agentId },
  });

  // Store in task index for quick lookup
  await store.store(
    `task-index:${Date.now()}`,
    {
      taskId,
      description,
      timestamp: new Date().toISOString(),
    },
    { namespace: 'task-index' },
  );
}
```

### Post-Edit Hook

**Purpose**: Track file edits and train neural patterns

```javascript
async function postEditCommand(subArgs, flags) {
  const store = await getMemoryStore();

  // Update memory with edit context
  if (updateMemory) {
    const editContext = {
      file,
      editedAt: new Date().toISOString(),
      editId: generateId('edit'),
      formatted: formatResult?.attempted || false,
      fileSize: fs.existsSync(file) ? fs.statSync(file).size : 0,
      directory: path.dirname(file),
      basename: path.basename(file),
    };

    // Store in coordination namespace for agent access
    await store.store(`edit-context:${editContext.editId}`, editContext, {
      namespace: 'coordination',
      metadata: { type: 'edit-context', file },
    });
  }

  // Train neural patterns if requested
  if (trainNeural) {
    const patterns = {
      fileType: ext,
      fileName: basename,
      editTime,
      confidence: Math.random() * 0.5 + 0.5,
      patterns: [
        `${ext}_edit_pattern`,
        `${basename}_modification`,
        `edit_${Date.now()}_sequence`,
      ],
    };

    await store.store(`neural-pattern:${generateId('pattern')}`, patterns, {
      namespace: 'neural-training',
      metadata: { type: 'edit-pattern', file, extension: ext },
    });
  }
}
```

---

## 4. MCP Tool Integration Architecture

### Memory Hook System

**File**: `/tmp/claude-flow-research/src/services/agentic-flow-hooks/memory-hooks.ts`

```typescript
export const postMemoryStoreHook = {
  id: 'agentic-post-memory-store',
  type: 'post-memory-store' as const,
  priority: 100,
  handler: async (
    payload: MemoryHookPayload,
    context: AgenticHookContext
  ): Promise<HookHandlerResult> => {
    const { namespace, key, value, crossProvider, syncTargets } = payload;

    const sideEffects: SideEffect[] = [];

    // Cross-provider sync if enabled
    if (crossProvider && syncTargets && syncTargets.length > 0) {
      for (const target of syncTargets) {
        sideEffects.push({
          type: 'memory',
          action: 'sync',
          data: {
            source: payload.provider,
            target,
            namespace,
            key,
            value,
          },
        });
      }
    }

    // Update memory index for search
    await updateMemoryIndex(namespace, key, value, context);

    // Neural pattern detection
    const patterns = await detectMemoryPatterns(namespace, key, value, context);
    if (patterns.length > 0) {
      sideEffects.push({
        type: 'neural',
        action: 'analyze',
        data: {
          patterns,
          context: { namespace, key },
        },
      });
    }

    return {
      continue: true,
      sideEffects,
    };
  },
};
```

### Key Features:

1. **Automatic compression**: Large values compressed before storage
2. **Cross-provider sync**: Sync to multiple memory backends
3. **Neural pattern detection**: Automatic learning from memory patterns
4. **Memory index**: Search optimization
5. **Metrics tracking**: Usage and performance monitoring

---

## 5. Data Flow: Task Tool → Memory → Learning

### Step 1: Claude Code Task Tool Spawns Agent

```javascript
Task("Research agent", "Analyze authentication patterns", "researcher")
```

### Step 2: Agent Prompt Executes with Context

**Agent has access to MCP tools via prompt**:
- `mcp__claude-flow__memory_usage` - Store/retrieve
- `mcp__claude-flow__memory_search` - Query patterns
- `mcp__claude-flow__neural_train` - Train patterns
- `mcp__claude-flow__agent_metrics` - Track performance

### Step 3: Agent Calls MCP Tools Directly

```javascript
// DURING task execution, agent prompt calls:
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/researcher/findings",
  namespace: "coordination",
  value: JSON.stringify({
    patterns: ["singleton", "factory"],
    risks: ["missing auth check"],
    recommendations: ["add rate limiting"]
  })
}
```

### Step 4: MCP Server Persists to Database

```javascript
// MCP tool handler (executed by MCP server)
async function memoryUsageHandler(params) {
  const store = await getMemoryStore(); // SQLite connection

  if (params.action === "store") {
    await store.store(params.key, params.value, {
      namespace: params.namespace,
      metadata: { agent: context.agentId, timestamp: Date.now() }
    });
  }
}
```

### Step 5: Data Persists to `.swarm/memory.db`

**SQLite Schema**:
```sql
CREATE TABLE memory (
  key TEXT PRIMARY KEY,
  value TEXT,
  namespace TEXT,
  metadata TEXT,
  created_at INTEGER,
  ttl INTEGER
);
```

### Step 6: Neural Hooks Detect Patterns

```typescript
// Post-memory-store hook triggers
const patterns = await detectMemoryPatterns(namespace, key, value, context);

if (patterns.length > 0) {
  // Store pattern for future learning
  await store.store(`pattern:${Date.now()}`, {
    type: 'sequential',
    confidence: 0.8,
    suggestion: 'prefetch-next'
  }, {
    namespace: 'neural-training'
  });
}
```

---

## 6. Key Differences from Agentic QE Architecture

### Claude Flow Pattern

```javascript
// Agent prompt contains MCP tool calls
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/agent/data",
  value: JSON.stringify(data)
}
```

**Execution Context**: Agent runs in Claude Code Task tool context with direct MCP access

### Agentic QE Pattern (Current)

```javascript
// Agent extends BaseAgent, calls methods
await this.memoryStore.store('aqe/agent/data', data, {
  partition: 'coordination',
  ttl: 86400
});
```

**Execution Context**: Agent is TypeScript class with memory dependency injected

---

## 7. Implications for Agentic QE Learning

### What Works in Claude Flow

1. **Direct MCP access**: Agents can call MCP tools from prompts
2. **Persistent SQLite**: Data survives across sessions
3. **Automatic hooks**: Pre/post operations trigger learning
4. **Pattern detection**: Neural hooks analyze memory patterns
5. **Cross-session state**: Session restore from `.swarm/memory.db`

### What Needs Adaptation for Agentic QE

1. **MCP tool integration**: Need to expose learning MCP tools
2. **Agent prompt updates**: Add MCP tool calls to agent `.md` files
3. **Hook registration**: Implement pre/post task hooks
4. **Database migration**: Migrate from in-memory to SQLite
5. **Pattern training**: Implement neural pattern detection

---

## 8. Recommended Architecture for Agentic QE

### Option A: Hybrid (Recommended)

**Combine TypeScript classes + MCP tools**

```typescript
// BaseAgent.ts
class BaseAgent {
  async executeTask(task: Task): Promise<void> {
    // Pre-task hook: Store via MCP
    await this.callMCPTool('mcp__agentic-qe__learning_store_experience', {
      agentId: this.agentId,
      taskType: task.type,
      reward: 0, // Will update post-task
      outcome: {}
    });

    // Execute task logic
    const result = await this.performTask(task);

    // Post-task hook: Update with results
    await this.callMCPTool('mcp__agentic-qe__learning_store_experience', {
      agentId: this.agentId,
      taskType: task.type,
      reward: result.success ? 1 : 0,
      outcome: result
    });
  }
}
```

### Option B: Pure MCP (Claude Flow Style)

**Agent prompts call MCP directly**

```markdown
## QE Test Generator Agent

When executing tasks, use these MCP tools:

```javascript
// Store learning experience
mcp__agentic-qe__learning_store_experience {
  agentId: "test-generator",
  taskType: "unit-test-generation",
  reward: 1.0,
  outcome: {
    tests_generated: 15,
    coverage: 0.87,
    patterns_used: ["AAA", "Given-When-Then"]
  }
}

// Query similar patterns
mcp__agentic-qe__learning_query {
  queryType: "patterns",
  taskType: "unit-test-generation",
  minReward: 0.8,
  limit: 5
}
```

---

## 9. Implementation Roadmap

### Phase 1: Enable MCP Learning Tools (Done ✅)

- ✅ `learning_store_experience` MCP tool
- ✅ `learning_store_qvalue` MCP tool
- ✅ `learning_store_pattern` MCP tool
- ✅ `learning_query` MCP tool

### Phase 2: Update Agent Prompts

```markdown
# File: .claude/agents/qe-test-generator.md

## Learning Integration

After generating tests, store learning data:

```javascript
mcp__agentic-qe__learning_store_experience {
  agentId: "qe-test-generator",
  taskType: "unit-test-generation",
  reward: <success_score_0_to_1>,
  outcome: {
    tests_generated: <count>,
    coverage: <percentage>,
    patterns: [<patterns_used>]
  }
}
```

Query successful patterns:

```javascript
mcp__agentic-qe__learning_query {
  queryType: "patterns",
  taskType: "unit-test-generation",
  minReward: 0.8
}
```
```

### Phase 3: Implement Hooks

```typescript
// src/hooks/learning-hooks.ts
export async function preTaskHook(task: Task): Promise<void> {
  // Store task start
  await mcpClient.call('mcp__agentic-qe__learning_store_experience', {
    agentId: task.agentId,
    taskType: task.type,
    reward: 0,
    outcome: { status: 'started' }
  });
}

export async function postTaskHook(task: Task, result: any): Promise<void> {
  // Store task completion
  await mcpClient.call('mcp__agentic-qe__learning_store_experience', {
    agentId: task.agentId,
    taskType: task.type,
    reward: calculateReward(result),
    outcome: result
  });
}
```

### Phase 4: Add Pattern Detection

```typescript
// Detect successful patterns after task completion
const patterns = await detectSuccessfulPatterns(result);
for (const pattern of patterns) {
  await mcpClient.call('mcp__agentic-qe__learning_store_pattern', {
    pattern: pattern.description,
    confidence: pattern.confidence,
    domain: task.type
  });
}
```

---

## 10. Concrete Examples from Claude Flow

### Researcher Agent Storage

```javascript
// Store research findings
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/shared/research-findings",
  namespace: "coordination",
  value: JSON.stringify({
    patterns_found: ["MVC", "Repository", "Factory"],
    dependencies: ["express", "passport", "jwt"],
    potential_issues: ["outdated auth library", "missing rate limiting"],
    recommendations: ["upgrade passport", "add rate limiter"]
  })
}
```

### Coder Agent Storage

```javascript
// Store implementation decisions
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/shared/implementation",
  namespace: "coordination",
  value: JSON.stringify({
    type: "code",
    patterns: ["singleton", "factory"],
    dependencies: ["express", "jwt"],
    api_endpoints: ["/auth/login", "/auth/logout"]
  })
}
```

### Tester Agent Storage

```javascript
// Store test results
mcp__claude-flow__memory_usage {
  action: "store",
  key: "swarm/shared/test-results",
  namespace: "coordination",
  value: JSON.stringify({
    passed: 145,
    failed: 2,
    coverage: "87%",
    failures: ["auth.test.ts:45", "api.test.ts:123"]
  })
}
```

---

## 11. Conclusion

**Key Takeaway**: Claude Flow agents persist learning by calling **MCP tools directly from agent prompts** using JavaScript-like syntax. The MCP server handles persistence to SQLite (`.swarm/memory.db`), and hooks trigger automatic pattern detection.

**For Agentic QE**: We need to:
1. ✅ Expose learning MCP tools (DONE)
2. ⏳ Update agent prompts to include MCP tool examples
3. ⏳ Implement pre/post task hooks
4. ⏳ Add pattern detection to learning system

**Next Steps**:
1. Add MCP tool integration examples to all 18 QE agent `.md` files
2. Implement `preTask` and `postTask` hooks in `BaseAgent`
3. Test end-to-end learning flow with Calculator example
4. Document learning protocol for users

---

**Research Complete**: 2025-11-12
**Files Analyzed**: 15+ from https://github.com/ruvnet/claude-flow
**Key Insight**: Direct MCP tool calls from agent prompts enable learning persistence across Task tool executions.

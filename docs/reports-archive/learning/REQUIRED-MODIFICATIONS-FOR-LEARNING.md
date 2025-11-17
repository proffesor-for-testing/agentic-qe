# Required Modifications for QE Agent Learning/Memory/Patterns

**Date**: 2025-11-03
**Priority**: 🚨 **CRITICAL**
**Status**: ⚠️ **Learning NOT Enabled** - Requires Fix

---

## 🚨 CRITICAL ISSUE DISCOVERED

### Agent Learning is NOT Enabled

**Root Cause**: `AgentRegistry` does not pass `enableLearning: true` when creating agents.

**Evidence**:
```
✅ Agent spawned successfully!
   Has learningEngine: false  ❌ ← PROBLEM
```

**Code Location**: `src/agents/BaseAgent.ts:168`
```typescript
if (this.enableLearning && this.memoryStore instanceof SwarmMemoryManager) {
  this.learningEngine = new LearningEngine(...);  // ← NEVER EXECUTES
}
```

---

## 🔍 Why Learning is Disabled

### AgentRegistry Missing Configuration

**File**: `src/mcp/services/AgentRegistry.ts:175-183`

**Current Code**:
```typescript
const fullConfig: BaseAgentConfig = {
  type: agentType,
  capabilities: config.capabilities ? this.mapCapabilities(config.capabilities) : [],
  context: this.createAgentContext(mcpType, agentId),
  memoryStore: this.memoryStore as unknown as MemoryStore,
  eventBus: this.eventBus
  // ❌ MISSING: enableLearning: true
  // ❌ MISSING: learningConfig: { enabled: true }
};
```

**Result**: Learning engine never gets created → No Q-values, experiences, or patterns persisted.

---

## ✅ REQUIRED MODIFICATIONS

### 1. Fix AgentRegistry to Enable Learning (CRITICAL)

**File**: `src/mcp/services/AgentRegistry.ts`

**Line 175-183** - Add learning configuration:

```typescript
const fullConfig: BaseAgentConfig = {
  type: agentType,
  capabilities: config.capabilities ? this.mapCapabilities(config.capabilities) : [],
  context: this.createAgentContext(mcpType, agentId),
  memoryStore: this.memoryStore as unknown as MemoryStore,
  eventBus: this.eventBus,

  // ✅ ADD THESE LINES:
  enableLearning: true,  // Enable Q-learning and pattern discovery
  learningConfig: {
    enabled: true,
    learningRate: 0.1,
    discountFactor: 0.95,
    explorationRate: 0.3,
    minExplorationRate: 0.01,
    explorationDecay: 0.995
  }
};
```

### 2. Optional: Make Learning Configurable (RECOMMENDED)

Allow users to control learning via AgentSpawnConfig:

```typescript
// src/mcp/services/AgentRegistry.ts - Update interface
export interface AgentSpawnConfig {
  name?: string;
  description?: string;
  capabilities?: string[];
  resources?: {
    memory?: number;
    cpu?: number;
    storage?: number;
  };
  fleetId?: string;

  // ✅ ADD THESE:
  enableLearning?: boolean;  // Default: true
  learningConfig?: {
    enabled?: boolean;
    learningRate?: number;
    discountFactor?: number;
    explorationRate?: number;
  };
}

// Then in spawnAgent():
const fullConfig: BaseAgentConfig = {
  // ...existing config
  enableLearning: config.enableLearning !== false,  // Default true
  learningConfig: {
    enabled: config.learningConfig?.enabled !== false,
    learningRate: config.learningConfig?.learningRate || 0.1,
    discountFactor: config.learningConfig?.discountFactor || 0.95,
    explorationRate: config.learningConfig?.explorationRate || 0.3,
    minExplorationRate: 0.01,
    explorationDecay: 0.995
  }
};
```

### 3. Update MCP Tool Definition (OPTIONAL)

**File**: `src/mcp/tools.ts`

Add learning configuration to AgentSpec:

```typescript
export interface AgentSpec {
  type: 'test-generator' | 'coverage-analyzer' | ...;
  name?: string;
  capabilities: string[];
  resources?: {
    memory: number;
    cpu: number;
    storage: number;
  };

  // ✅ ADD THIS:
  enableLearning?: boolean;  // Enable Q-learning and pattern discovery
  learningConfig?: {
    enabled?: boolean;
    learningRate?: number;  // 0.0 - 1.0
    explorationRate?: number;  // 0.0 - 1.0
  };
}
```

### 4. Add Learning Status to Agent Responses (USER VISIBILITY)

**File**: `src/mcp/handlers/agent-spawn.ts`

**Line 207-220** - Add learning info to response:

```typescript
const agentInstance: AgentInstance = {
  id,
  type: spec.type,
  name: spec.name || `${spec.type}-${id.split('-').pop()}`,
  capabilities,
  status: instanceStatus,
  resources,
  fleetId,
  spawnedAt: new Date().toISOString(),
  lastActivity: new Date().toISOString(),
  metrics: {
    tasksCompleted: metrics?.tasksCompleted || 0,
    averageExecutionTime: metrics?.averageExecutionTime || 0,
    successRate: metrics?.successRate || 1.0
  },

  // ✅ ADD THESE:
  learning: {
    enabled: !!agent.learningEngine,
    qValuesCount: 0,  // Will increase as agent learns
    experiencesCount: 0,
    patternsDiscovered: 0
  }
};
```

---

## 🎯 USER-FACING CHANGES

### Current User Experience (BROKEN)

```typescript
// User spawns agent
mcp__agentic_qe__agent_spawn({
  spec: {
    type: 'test-generator',
    capabilities: ['unit-test-generation']
  }
})

// Agent executes task
mcp__agentic_qe__test_generate({ ... })

// ❌ NO LEARNING HAPPENS
// ❌ Database remains empty
// ❌ No Q-values, experiences, or patterns
```

### Proposed User Experience (AFTER FIX)

```typescript
// User spawns agent (learning enabled by default)
mcp__agentic_qe__agent_spawn({
  spec: {
    type: 'test-generator',
    capabilities: ['unit-test-generation']
    // enableLearning: true  ← Default, can be disabled if needed
  }
})

// Response includes learning status
{
  id: 'agent-test-generator-...',
  learning: {
    enabled: true,  ✅
    qValuesCount: 0,
    experiencesCount: 0,
    patternsDiscovered: 0
  }
}

// Agent executes task
mcp__agentic_qe__test_generate({ ... })

// ✅ Learning happens automatically via BaseAgent.onPostTask()
// ✅ Q-values persisted to .agentic-qe/memory.db
// ✅ Experiences recorded
// ✅ Patterns discovered

// User can query learning data
mcp__agentic_qe__agent_learning_status({
  agentId: 'agent-test-generator-...'
})

// Response:
{
  qValues: 15,
  experiences: 5,
  patterns: 2,
  avgReward: 1.35,
  improvementRate: 0.12
}
```

---

## 📊 Additional Tools Needed for User Access

### 1. Learning Status Tool

**New MCP Tool**: `mcp__agentic_qe__agent_learning_status`

```typescript
{
  name: 'mcp__agentic_qe__agent_learning_status',
  description: 'Get learning statistics for a specific agent',
  inputSchema: {
    type: 'object',
    properties: {
      agentId: {
        type: 'string',
        description: 'Agent ID to get learning stats for'
      }
    },
    required: ['agentId']
  }
}
```

**Handler**: Returns Q-values count, experiences count, patterns, avg reward, improvement rate.

### 2. Pattern Discovery Tool

**New MCP Tool**: `mcp__agentic_qe__patterns_discover`

```typescript
{
  name: 'mcp__agentic_qe__patterns_discover',
  description: 'Get discovered patterns for agent type',
  inputSchema: {
    type: 'object',
    properties: {
      agentType: {
        type: 'string',
        enum: ['test-generator', 'coverage-analyzer', 'quality-gate', ...]
      },
      minConfidence: {
        type: 'number',
        default: 0.5,
        description: 'Minimum pattern confidence (0.0 - 1.0)'
      }
    },
    required: ['agentType']
  }
}
```

**Handler**: Queries `.agentic-qe/memory.db` patterns table, returns successful strategies.

### 3. Learning Export Tool

**New MCP Tool**: `mcp__agentic_qe__learning_export`

```typescript
{
  name: 'mcp__agentic_qe__learning_export',
  description: 'Export learning data for analysis or transfer',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['json', 'csv', 'markdown'],
        default: 'json'
      },
      includeQValues: { type: 'boolean', default: true },
      includeExperiences: { type: 'boolean', default: true },
      includePatterns: { type: 'boolean', default: true }
    }
  }
}
```

---

## 🛠️ Implementation Plan

### Phase 1: Fix Core Issue (IMMEDIATE)
**Estimated Time**: 30 minutes

1. ✅ Update `AgentRegistry.ts` to pass `enableLearning: true`
2. ✅ Update `AgentRegistry.ts` to pass `learningConfig`
3. ✅ Test agent spawning → Verify `learningEngine` is created
4. ✅ Test task execution → Verify data persists to database

### Phase 2: Add User Visibility (SHORT TERM)
**Estimated Time**: 2-3 hours

1. ✅ Add learning status to agent spawn response
2. ✅ Create `mcp__agentic_qe__agent_learning_status` tool
3. ✅ Create handler for learning status queries
4. ✅ Update documentation with learning examples

### Phase 3: Advanced Features (MEDIUM TERM)
**Estimated Time**: 4-6 hours

1. ✅ Create `mcp__agentic_qe__patterns_discover` tool
2. ✅ Create `mcp__agentic_qe__learning_export` tool
3. ✅ Add learning configuration to MCP tool definitions
4. ✅ Create visualization tools for learning progress

---

## ✅ Testing Plan

### 1. Unit Tests
```typescript
// tests/unit/mcp/AgentRegistry.learning.test.ts
describe('AgentRegistry Learning', () => {
  it('should create agents with learning enabled by default', async () => {
    const registry = new AgentRegistry();
    const { agent } = await registry.spawnAgent('test-generator', {});

    expect(agent.learningEngine).toBeDefined();
    expect(agent.learningEngine.isEnabled()).toBe(true);
  });

  it('should respect enableLearning: false', async () => {
    const registry = new AgentRegistry();
    const { agent } = await registry.spawnAgent('test-generator', {
      enableLearning: false
    });

    expect(agent.learningEngine).toBeUndefined();
  });
});
```

### 2. Integration Tests
```typescript
// tests/integration/agent-learning-persistence.test.ts
describe('Agent Learning Persistence', () => {
  it('should persist Q-values after task execution', async () => {
    const registry = new AgentRegistry();
    const { id, agent } = await registry.spawnAgent('test-generator', {});

    // Execute task
    await registry.executeTask(id, { type: 'unit-test-generation', ... });

    // Check database
    const db = new Database('.agentic-qe/memory.db');
    const qValues = await db.getAllQValues(agent.agentId.id);

    expect(qValues.length).toBeGreaterThan(0);
  });
});
```

### 3. Manual E2E Test
```bash
# 1. Spawn agent
mcp__agentic_qe__agent_spawn({
  spec: { type: 'test-generator', capabilities: ['unit-test-generation'] }
})

# 2. Execute task
mcp__agentic_qe__test_generate({ ... })

# 3. Check database
node -e "
const db = require('better-sqlite3')('.agentic-qe/memory.db');
console.log('Q-values:', db.prepare('SELECT COUNT(*) FROM q_values').get());
console.log('Experiences:', db.prepare('SELECT COUNT(*) FROM learning_experiences').get());
db.close();
"
```

---

## 📝 Documentation Updates Needed

### 1. README.md
- Add section on "Learning and Adaptation"
- Document learning configuration options
- Show example of querying learning data

### 2. CLAUDE.md
- Update agent descriptions to mention learning
- Add examples of using learning tools
- Document memory/pattern persistence

### 3. New Doc: LEARNING-GUIDE.md
- Comprehensive guide to learning system
- How agents learn from tasks
- How to query and use learned patterns
- Troubleshooting learning issues

---

## 🎯 Success Criteria

After implementing these modifications:

✅ **Agents spawn with learning enabled by default**
✅ **Q-values persist after every task execution**
✅ **Learning experiences recorded with rewards**
✅ **Patterns discovered when success rate > 70%**
✅ **Users can query learning status via MCP tools**
✅ **Users can export learning data**
✅ **Documentation clearly explains learning system**
✅ **Integration tests verify persistence**

---

## 🚀 Example Usage After Fix

```typescript
// 1. Spawn agent (learning enabled automatically)
const agent = await mcp__agentic_qe__agent_spawn({
  spec: { type: 'test-generator', capabilities: ['unit-test-generation'] }
});
// Response: { id: '...', learning: { enabled: true, ... } }

// 2. Execute multiple tasks (agent learns)
for (let i = 0; i < 10; i++) {
  await mcp__agentic_qe__test_generate({
    agentId: agent.id,
    targetFile: `src/module${i}.ts`,
    framework: 'jest'
  });
}

// 3. Check learning progress
const stats = await mcp__agentic_qe__agent_learning_status({
  agentId: agent.id
});
// Response: { qValues: 45, experiences: 10, patterns: 3, avgReward: 1.42 }

// 4. Get discovered patterns
const patterns = await mcp__agentic_qe__patterns_discover({
  agentType: 'test-generator',
  minConfidence: 0.7
});
// Response: [
//   { strategy: 'template-based', confidence: 0.85, usageCount: 15 },
//   { strategy: 'property-based', confidence: 0.72, usageCount: 8 }
// ]

// 5. Agent automatically improves over time
// - Uses learned Q-values to select best actions
// - Applies discovered patterns
// - Gets better rewards (faster tests, higher coverage)
```

---

## 💡 Additional Recommendations

### 1. Learning Dashboard (Future Enhancement)

Create a visual dashboard showing:
- Q-value heatmaps
- Learning curves over time
- Pattern effectiveness comparison
- Agent improvement metrics

### 2. Cross-Agent Learning (Future Enhancement)

Allow agents to share learned patterns:
```typescript
mcp__agentic_qe__patterns_share({
  sourceAgentId: 'agent-1',
  targetAgentIds: ['agent-2', 'agent-3'],
  patternType: 'test-generation-strategy'
})
```

### 3. Learning Rate Tuning (Future Enhancement)

Auto-tune learning parameters based on task success:
```typescript
{
  learningConfig: {
    autoTune: true,  // Adjust learning rate based on performance
    targetSuccessRate: 0.85
  }
}
```

---

**Generated**: 2025-11-03T11:30:00Z
**Priority**: 🚨 CRITICAL FIX REQUIRED
**Est. Implementation Time**: 30 minutes (Phase 1)
**Impact**: 🎯 **HIGH** - Enables core learning feature advertised in documentation

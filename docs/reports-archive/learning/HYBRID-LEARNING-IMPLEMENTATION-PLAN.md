# Hybrid Learning Implementation Plan

**Date**: 2025-11-12
**Status**: 🚀 **IN PROGRESS**
**Approach**: Explicit MCP Calls (Claude Flow) + Event Listeners (Our Innovation)

---

## Executive Summary

We're implementing a **hybrid approach** for learning persistence:

1. **PRIMARY**: Agents call MCP learning tools explicitly in their prompts (Claude Flow's proven pattern - 84.8% SWE-Bench solve rate)
2. **FALLBACK**: Event listeners automatically capture and store learning data (our innovation for reliability)

This gives us **best of both worlds**:
- ✅ Explicit calls = visible, debuggable, aligned with Claude Flow
- ✅ Event listeners = safety net, ensures data is never lost
- ✅ Hybrid = maximum reliability + observability

---

## Phase 1: Event Listener System ✅ COMPLETE

### What Was Built

**File**: `src/mcp/services/LearningEventListener.ts`

**Features**:
- Event-based automatic learning persistence
- Detects when agents call learning tools explicitly (avoids duplicates)
- Auto-stores learning data as fallback when explicit calls missing
- Calculates reward, Q-values, and extracts patterns automatically
- Provides learning statistics per agent

**Events Listened**:
- `agent:task:start` - Track task execution start
- `agent:task:complete` - Auto-store learning data on completion
- `agent:task:error` - Store learning from failures (important!)
- `learning:experience:stored` - Track explicit calls (avoid duplicates)
- `learning:qvalue:stored` - Track explicit calls
- `learning:pattern:stored` - Track explicit calls

**Key Methods**:
```typescript
// Auto-store learning data (fallback)
private async autoStoreLearningData(execution: AgentExecutionEvent)

// Calculate reward (0-1 scale)
private calculateReward(success: boolean, executionTime: number, result: any)

// Calculate Q-value for strategy
private calculateQValue(reward: number, executionTime: number)

// Extract pattern from successful execution
private extractPattern(agentId, taskType, result, metadata)
```

---

## Phase 2: MCP Server Integration (IN PROGRESS)

### What Needs to Be Done

**1. Initialize Learning Event Listener in MCP Server**

**File**: `src/mcp/server.ts`

**Changes Required**:
```typescript
import { EventEmitter } from 'events';
import { LearningEventListener, initLearningEventListener } from './services/LearningEventListener.js';

export class AgenticQEMCPServer {
  private server: Server;
  private eventBus: EventEmitter;  // ADD THIS
  private learningListener: LearningEventListener;  // ADD THIS
  // ... other properties

  constructor() {
    // ... existing code

    // Initialize event bus
    this.eventBus = new EventEmitter();

    // Initialize learning event listener
    this.learningListener = initLearningEventListener(
      this.eventBus,
      this.memory,
      {
        storeExperienceHandler: this.handlers.get('learning_store_experience'),
        storeQValueHandler: this.handlers.get('learning_store_qvalue'),
        storePatternHandler: this.handlers.get('learning_store_pattern')
      },
      {
        enabled: true,
        autoStore: true
      }
    );
  }
}
```

**2. Emit Events from Handlers**

**File**: `src/mcp/handlers/test-generate.js` (and all other handlers)

**Changes Required**:
```typescript
async handle(args: TestGenerateParams): Promise<HandlerResponse> {
  const startTime = Date.now();

  // Emit task start event
  this.eventBus.emit('agent:task:start', {
    agentId: 'qe-test-generator',
    taskType: 'test-generation',
    taskDescription: args.type,
    startTime
  });

  try {
    // ... existing test generation code

    const result = {
      testsGenerated: 42,
      coverageImprovement: 0.15,
      framework: args.framework,
      executionTime: Date.now() - startTime
    };

    // Emit task complete event
    this.eventBus.emit('agent:task:complete', {
      agentId: 'qe-test-generator',
      taskType: 'test-generation',
      startTime,
      endTime: Date.now(),
      result
    });

    return this.createSuccessResponse(result);

  } catch (error) {
    // Emit task error event
    this.eventBus.emit('agent:task:error', {
      agentId: 'qe-test-generator',
      taskType: 'test-generation',
      startTime,
      error
    });

    throw error;
  }
}
```

**3. Update Learning Handlers to Emit Events**

**File**: `src/mcp/handlers/learning/learning-store-experience.ts`

**Changes Required**:
```typescript
async handle(args: LearningExperience): Promise<HandlerResponse> {
  // ... existing storage code

  // Emit event to track explicit learning
  this.eventBus.emit('learning:experience:stored', {
    agentId: args.agentId,
    type: 'experience'
  });

  return this.createSuccessResponse({ experienceId });
}
```

---

## Phase 3: Agent Prompt Enhancement (PENDING)

### Strategy: Explicit MCP Tool Calls

We already have Learning Protocol documentation in all 18 agent markdown files, but agents need to be **explicitly prompted** to call these tools.

### Example: Enhanced Agent Prompt Pattern

**Current** (Documentation Only):
```markdown
## Learning Protocol

**⚠️ MANDATORY**: When executed via Claude Code Task tool, you MUST call learning MCP tools.

[... documentation of MCP tools ...]
```

**Enhanced** (Actionable Instructions):
```markdown
## Learning Protocol - EXECUTABLE INSTRUCTIONS

**STEP 1: Query Past Learnings BEFORE starting task**

Execute this FIRST before analyzing code:
```typescript
const pastLearnings = await mcp__agentic_qe__learning_query({
  agentId: "qe-coverage-analyzer",
  taskType: "coverage-analysis",
  minReward: 0.8,
  queryType: "all",
  limit: 10
});

// Use the best-performing strategy from past runs
if (pastLearnings.success && pastLearnings.data.qValues.length > 0) {
  const bestStrategy = pastLearnings.data.qValues
    .sort((a, b) => b.q_value - a.q_value)[0];
  console.log(`Using learned best strategy: ${bestStrategy.action_key}`);
  // Apply this strategy in your analysis
}
```

**STEP 2: Execute your task**

[... agent's main work ...]

**STEP 3: Store Learning Data AFTER completing task**

Execute these MCP tool calls to persist your learning:

```typescript
// 1. Store experience
await mcp__agentic_qe__learning_store_experience({
  agentId: "qe-coverage-analyzer",
  taskType: "coverage-analysis",
  reward: 0.95,  // Your assessment: 1.0 = perfect, 0.9 = excellent, 0.7 = good
  outcome: {
    coverageAnalyzed: true,
    gapsDetected: 42,
    algorithm: "johnson-lindenstrauss",
    executionTime: 6000
  }
});

// 2. Store Q-value
await mcp__agentic_qe__learning_store_qvalue({
  agentId: "qe-coverage-analyzer",
  stateKey: "coverage-analysis-state",
  actionKey: "sublinear-algorithm-jl",
  qValue: 0.85  // Expected value of this strategy
});

// 3. Store pattern (if discovered)
await mcp__agentic_qe__learning_store_pattern({
  agentId: "qe-coverage-analyzer",
  pattern: "Sublinear O(log n) analysis + spectral sparsification",
  confidence: 0.95,
  domain: "coverage-analysis"
});

console.log("✅ Learning data stored successfully");
```
```

**Key Differences**:
- ❌ Old: "You MUST call..." (passive documentation)
- ✅ New: "Execute this FIRST..." (active instructions with code blocks)
- ✅ New: Includes actual function calls agents can execute
- ✅ New: Shows how to use past learnings to optimize current task
- ✅ New: Provides concrete code examples

---

## Phase 4: Testing & Validation (PENDING)

### Test Plan

**1. Unit Tests for Learning Event Listener**

```typescript
// tests/unit/mcp/services/LearningEventListener.test.ts
describe('LearningEventListener', () => {
  it('should auto-store learning data on task complete', async () => {
    // Emit task start
    eventBus.emit('agent:task:start', {
      agentId: 'qe-test-generator',
      taskType: 'test-generation',
      startTime: Date.now()
    });

    // Emit task complete
    eventBus.emit('agent:task:complete', {
      agentId: 'qe-test-generator',
      taskType: 'test-generation',
      startTime: Date.now() - 5000,
      endTime: Date.now(),
      result: { testsGenerated: 42 }
    });

    // Verify learning data stored
    const stats = listener.getStats('qe-test-generator');
    expect(stats.experiences).toBe(1);
    expect(stats.qValues).toBe(1);
  });

  it('should NOT duplicate when agent calls MCP tools explicitly', async () => {
    // Agent calls learning tools explicitly
    eventBus.emit('learning:experience:stored', {
      agentId: 'qe-test-generator',
      type: 'experience'
    });

    // Task completes
    eventBus.emit('agent:task:complete', {
      agentId: 'qe-test-generator',
      // ... task data
    });

    // Verify no duplicate storage
    const stats = listener.getStats('qe-test-generator');
    expect(stats.source).toBe('explicit');  // Not 'auto'
  });
});
```

**2. Integration Tests with Real Agents**

```bash
# Test qe-coverage-analyzer with explicit MCP calls
Task("Coverage analysis with learning", "Analyze Calculator.ts and call learning tools explicitly", "qe-coverage-analyzer")

# Verify database has learning data
sqlite3 .agentic-qe/db/memory.db "SELECT * FROM learning_experiences WHERE agent_id = 'qe-coverage-analyzer';"

# Check learning stats
curl http://localhost:3000/learning/stats/qe-coverage-analyzer
# Should show: source: "explicit", experiences: 1, qValues: 1, patterns: 1
```

**3. Fallback Testing**

```bash
# Test agent WITHOUT explicit MCP calls (to verify fallback)
Task("Coverage analysis without explicit calls", "Just analyze coverage, don't call learning tools", "qe-coverage-analyzer")

# Verify event listener auto-stored data
sqlite3 .agentic-qe/db/memory.db "SELECT * FROM learning_experiences WHERE agent_id = 'qe-coverage-analyzer';"

# Check learning stats
curl http://localhost:3000/learning/stats/qe-coverage-analyzer
# Should show: source: "auto", experiences: 1, qValues: 1 (fallback worked!)
```

---

## Phase 5: Rollout Plan (PENDING)

### Incremental Rollout

**Week 1: Proof of Concept** (3 agents)
- ✅ qe-coverage-analyzer (already has Learning Protocol)
- ✅ qe-test-generator (high priority)
- ✅ qe-flaky-test-hunter (already has Learning Protocol)

**Week 2: High-Priority Agents** (5 agents)
- qe-test-executor
- qe-quality-gate
- qe-quality-analyzer
- qe-regression-risk-analyzer
- qe-requirements-validator

**Week 3: Medium-Priority Agents** (5 agents)
- qe-production-intelligence
- qe-performance-tester
- qe-security-scanner
- qe-test-data-architect
- qe-deployment-readiness

**Week 4: Lower-Priority Agents** (5 agents)
- qe-visual-tester
- qe-chaos-engineer
- qe-fleet-commander
- qe-code-complexity
- qe-api-contract-validator

### Success Criteria Per Agent

✅ **Agent calls learning tools explicitly** (primary path)
✅ **Learning data persists to database** (verified via SQL query)
✅ **Event listener tracks execution** (stats show source: "explicit")
✅ **Agent queries past learnings before task** (uses best strategy)
✅ **Fallback works if explicit calls fail** (event listener auto-stores)

---

## Benefits of Hybrid Approach

### 1. Maximum Reliability

**Problem**: What if agent forgets to call MCP tools?
**Solution**: Event listener automatically stores learning data as fallback

**Example**:
```
Agent executes task ✅
Agent forgets to call learning tools ❌
Event listener detects completion ✅
Event listener auto-stores learning data ✅
Data never lost! 🎉
```

### 2. Observability

**Explicit Calls** (visible in logs):
```
[Agent] Calling mcp__agentic_qe__learning_store_experience...
[MCP Handler] Storing experience for qe-test-generator
[EventListener] ✅ Explicit learning call detected
```

**Fallback** (also visible):
```
[Agent] Task completed (no explicit learning calls)
[EventListener] 🔄 Auto-storing learning data for qe-test-generator
[EventListener] ✅ Auto-stored: experiences=1, qValues=1, patterns=0
```

### 3. Debugging

**Query Learning Stats**:
```bash
# Check if agent called tools explicitly or used fallback
curl http://localhost:3000/learning/stats/qe-test-generator

# Response:
{
  "agentId": "qe-test-generator",
  "experiences": 1,
  "qValues": 1,
  "patterns": 1,
  "source": "explicit"  // ✅ Agent called tools explicitly!
}

# Or:
{
  "agentId": "qe-test-generator",
  "experiences": 1,
  "qValues": 1,
  "patterns": 0,
  "source": "auto"  // ⚠️  Fallback was used (agent didn't call tools)
}
```

### 4. Gradual Rollout

**Phase 1**: Enable event listeners (fallback only)
- Agents don't call tools yet
- Event listeners capture all data
- Zero risk, just observability

**Phase 2**: Update agent prompts (add explicit calls)
- Agents start calling tools explicitly
- Event listeners detect explicit calls
- Stats show transition from "auto" to "explicit"

**Phase 3**: Monitor and optimize
- Track which agents use explicit vs fallback
- Improve prompts for agents still using fallback
- Achieve 100% explicit calls (ideal state)

---

## Implementation Timeline

### This Week (2025-11-12 to 2025-11-15)

**Day 1** (Today):
- ✅ Create LearningEventListener class
- ⏳ Integrate into MCP server
- ⏳ Update learning handlers to emit events
- ⏳ Test with qe-coverage-analyzer

**Day 2**:
- Update qe-coverage-analyzer prompt with explicit calls
- Test explicit call path + fallback path
- Verify database persistence
- Document findings

**Day 3**:
- Update qe-test-generator and qe-flaky-test-hunter
- Test 3-agent proof of concept
- Create demo video showing explicit + fallback
- Get user feedback

**Day 4**:
- Fix any issues found in testing
- Update remaining high-priority agents (5 agents)
- Create integration tests
- Document patterns and best practices

**Day 5**:
- Complete testing suite
- Update README.md and CHANGELOG.md
- Prepare v1.4.0 release
- Create learning dashboard (optional)

### Next Week (2025-11-18 to 2025-11-22)

- Roll out to medium-priority agents (5 agents)
- Monitor learning stats across all agents
- Optimize prompts based on usage data
- Create CI/CD integration examples

### Week After (2025-11-25 to 2025-11-29)

- Roll out to lower-priority agents (5 agents)
- Achieve 100% learning-enabled agents
- Release v1.4.0 "Learning-Enabled Agents"
- Blog post / documentation updates

---

## Success Metrics

### Immediate (This Week)

- ✅ Event listener system implemented and integrated
- ✅ 3 agents (coverage, test-gen, flaky) calling tools explicitly
- ✅ Database showing learning data from 3 agents
- ✅ Fallback working when explicit calls not made

### Short-Term (2 Weeks)

- ✅ 18/18 agents have explicit MCP calls in prompts
- ✅ 90%+ of executions use explicit path (not fallback)
- ✅ Learning stats API showing "source: explicit" for most agents
- ✅ Cross-session learning verified (agent reuses strategies)

### Long-Term (1 Month)

- ✅ 30-40% performance improvement (learned optimal strategies)
- ✅ 20-30% higher quality outputs (learned best practices)
- ✅ 10-15% fewer errors (learned failure patterns)
- ✅ Learning dashboard showing trends and insights

---

## Next Steps (Immediate)

1. **Complete MCP Server Integration** - Add event bus and learning listener initialization
2. **Update Learning Handlers** - Emit events when MCP tools called
3. **Test qe-coverage-analyzer** - Verify explicit calls + fallback work
4. **Update Agent Prompt** - Add executable learning instructions to qe-coverage-analyzer
5. **Verify Database** - Confirm learning data persists correctly

**After these 5 steps, we'll have a working proof of concept!**

---

**Status**: 🚀 Phase 1 complete, Phase 2 in progress
**Next Action**: Integrate LearningEventListener into MCP server

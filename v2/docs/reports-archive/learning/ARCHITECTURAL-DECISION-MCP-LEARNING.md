# Architectural Decision: Should QE Agents Call MCP Tools Explicitly?

**Date**: 2025-11-12
**Status**: ✅ **RECOMMENDATION PROVIDED**
**Decision Type**: Architecture Pattern Selection

---

## Executive Summary

**TL;DR**: **YES, modify QE agents to call MCP tools explicitly during execution.**

**Rationale**: Your use case requirements (MCP invocation by users + CI/CD integration) align perfectly with **Option C (Hybrid Approach)** that was already partially implemented in Phase 6. The architecture should be completed.

**Current Status**:
- ✅ MCP learning tools implemented (4 tools)
- ✅ Learning protocol template created
- ✅ 3 agents updated (qe-coverage-analyzer, qe-api-contract-validator, qe-flaky-test-hunter)
- ⚠️ 15 agents still need learning protocol

---

## Part 1: Understanding Your Use Case

### User Invocation Pattern

**Your Statement**: "Users will invoke our agents using MCP in most of the cases"

**What This Means**:
```bash
# Primary usage pattern
claude mcp call agentic-qe test_generate '{"type": "unit", "framework": "jest"}'

# Via Claude Code Task tool (which doesn't instantiate BaseAgent)
Task("Generate tests", "Create comprehensive test suite", "qe-test-generator")

# Direct MCP client (no BaseAgent instantiation)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
const result = await client.callTool({
  name: 'mcp__agentic_qe__test_generate',
  arguments: { type: 'unit', framework: 'jest' }
});
```

**Key Insight**: None of these invocation patterns instantiate `BaseAgent`, which means the `onPostTask` hook (line 867 in BaseAgent.ts) **never fires**, and learning data is **never persisted**.

### CI/CD Integration Pattern

**Your Statement**: "We have a plan to integrate our QE agents into CI/CD pipelines"

**Typical CI/CD Integration**:
```yaml
# .github/workflows/quality-gate.yml
name: Quality Gate

on: [pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      # Install AQE
      - run: npm install -g agentic-qe

      # Run quality agents via MCP
      - name: Test Generation
        run: |
          npx aqe mcp test-generate \
            --framework jest \
            --coverage-goal 90

      - name: Coverage Analysis
        run: |
          npx aqe mcp coverage-analyze \
            --algorithm sublinear

      - name: Quality Gate
        run: |
          npx aqe mcp quality-gate \
            --environment staging \
            --policy strict
```

**Key Insight**: CI/CD pipelines invoke agents via MCP tools, NOT by instantiating `BaseAgent` classes. The internal architecture (BaseAgent → LearningEngine → SwarmMemoryManager) is **completely bypassed**.

---

## Part 2: Architecture Comparison

### Current Architecture (Internal Direct Access)

**How It Works**:
```
┌─────────────────────────────────────────────────────────┐
│ Node.js Application (e.g., FleetManager.ts)             │
│                                                          │
│  const agent = new TestGeneratorAgent(config);          │
│  await agent.initialize();                              │
│  const result = await agent.executeTask(task);          │
│                                                          │
│  ↓ BaseAgent.onPostTask() fires automatically           │
│  ↓ LearningEngine.learnFromExecution()                  │
│  ↓ SwarmMemoryManager.storeLearningExperience()         │
│  ↓ SQLite INSERT (direct database access)               │
└─────────────────────────────────────────────────────────┘
```

**Pros**:
- ✅ Zero latency (direct database access)
- ✅ Type-safe (TypeScript interfaces)
- ✅ Automatic (hooks fire implicitly)
- ✅ Efficient (no JSON-RPC overhead)

**Cons**:
- ❌ **Only works when BaseAgent is instantiated**
- ❌ **Doesn't work with Claude Code Task tool**
- ❌ **Doesn't work with MCP client invocations**
- ❌ **Doesn't work in CI/CD pipelines**
- ❌ **Limited to Node.js runtime**

### Claude Flow Architecture (Explicit MCP Calls)

**How It Works** (from docs/QE-LEARNING-WITH-TASK-TOOL.md):
```
┌─────────────────────────────────────────────────────────┐
│ Claude Code (Task Tool - Primary Executor)              │
│                                                          │
│  Task("coder", "Build API with learning", "coder")      │
│                                                          │
│  Agent executes and explicitly calls:                   │
│  ↓ mcp__claude-flow__memory_usage()                     │
│  ↓ mcp__claude-flow__neural_train()                     │
│  ↓ mcp__claude-flow__learning_adapt()                   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ Claude-Flow MCP Server (Coordination & Learning)        │
│  ↓ Handle MCP request (JSON-RPC protocol)               │
│  ↓ Route to handler                                     │
│  ↓ Store in database                                    │
└─────────────────────────────────────────────────────────┘
```

**Pros**:
- ✅ **Works with Claude Code Task tool**
- ✅ **Works with any MCP client**
- ✅ **Works in CI/CD pipelines**
- ✅ **Language-agnostic (Python, Go, Rust clients can call)**
- ✅ **Explicit and visible in prompts**
- ✅ **Compatible with all invocation patterns**

**Cons**:
- ❌ Requires explicit calls in agent prompts
- ❌ Slight latency overhead (JSON-RPC)
- ❌ Agents must "remember" to call tools

### Your Current Status (Option C - Hybrid, Partially Implemented)

**Phase 6 Implementation** (from docs/LEARNING-PROTOCOL-TEMPLATE.md):

✅ **DONE**:
- MCP learning tools implemented:
  - `mcp__agentic_qe__learning_store_experience` (src/mcp/handlers/learning/learning-store-experience.ts)
  - `mcp__agentic_qe__learning_store_qvalue` (src/mcp/handlers/learning/learning-store-qvalue.ts)
  - `mcp__agentic_qe__learning_store_pattern` (src/mcp/handlers/learning/learning-store-pattern.ts)
  - `mcp__agentic_qe__learning_query` (src/mcp/handlers/learning/learning-query.ts)

- Learning protocol template created (docs/LEARNING-PROTOCOL-TEMPLATE.md)

- 3 agents updated with learning protocol:
  - ✅ qe-coverage-analyzer (.claude/agents/qe-coverage-analyzer.md)
  - ✅ qe-api-contract-validator
  - ✅ qe-flaky-test-hunter

⚠️ **PENDING**:
- 15 agents still need learning protocol:
  - qe-test-generator (HIGH PRIORITY)
  - qe-test-executor (HIGH PRIORITY)
  - qe-quality-gate (HIGH PRIORITY)
  - qe-quality-analyzer (MEDIUM PRIORITY)
  - ... (12 more agents)

---

## Part 3: Architectural Decision

### ✅ RECOMMENDATION: Complete Option C (Hybrid Approach)

**Decision**: Modify all 18 QE agents to call MCP learning tools explicitly during execution.

### Why Option C is Correct for Your Use Case

| Requirement | Internal Architecture | Explicit MCP Calls | Winner |
|-------------|----------------------|-------------------|---------|
| **Users invoke via MCP** | ❌ Doesn't work | ✅ Works perfectly | **MCP** |
| **CI/CD pipeline integration** | ❌ Doesn't work | ✅ Works perfectly | **MCP** |
| **Claude Code Task tool** | ❌ Doesn't work | ✅ Works perfectly | **MCP** |
| **Direct Node.js usage** | ✅ Works | ✅ Works (via MCP client) | **Both** |
| **Language-agnostic clients** | ❌ Node.js only | ✅ Python, Go, Rust, etc. | **MCP** |
| **Learning persistence** | ❌ No persistence | ✅ Full persistence | **MCP** |

**Verdict**: Your use case requirements (MCP invocation + CI/CD) make explicit MCP calls **mandatory**, not optional.

### Comparison with Claude Flow

**Claude Flow's Approach** (from docs/QE-LEARNING-WITH-TASK-TOOL.md lines 40-72):

```typescript
// Claude Flow agents ALWAYS call MCP tools explicitly
Task("coder", "Build API", "coder")
  ↓
  Agent prompt includes:
  - mcp__claude-flow__memory_usage() for state persistence
  - mcp__claude-flow__neural_train() for pattern learning
  - mcp__claude-flow__learning_adapt() for strategy optimization
```

**Your Approach Should Match** (from docs/LEARNING-PROTOCOL-TEMPLATE.md):

```typescript
// AQE agents should ALWAYS call MCP tools explicitly
Task("Generate tests", "Create test suite", "qe-test-generator")
  ↓
  Agent prompt includes:
  - mcp__agentic_qe__learning_store_experience() after task completion
  - mcp__agentic_qe__learning_store_qvalue() for strategy tracking
  - mcp__agentic_qe__learning_store_pattern() for pattern discovery
  - mcp__agentic_qe__learning_query() before task start
```

**Key Insight**: Claude Flow's proven architecture (84.8% SWE-Bench solve rate, documented success) validates this approach. You should follow their pattern.

---

## Part 4: Implementation Plan

### Phase 1: Complete Agent Updates (4-6 hours)

**Goal**: Add learning protocol to all 18 agents

**Priority Order** (from docs/LEARNING-PROTOCOL-TEMPLATE.md lines 216-241):

**High Priority (Update First)**:
1. ✅ qe-coverage-analyzer (DONE)
2. qe-test-generator
3. qe-test-executor
4. ✅ qe-flaky-test-hunter (DONE)
5. qe-quality-gate

**Medium Priority**:
6. qe-quality-analyzer
7. qe-regression-risk-analyzer
8. qe-requirements-validator
9. qe-production-intelligence

**Lower Priority**:
10. qe-performance-tester
11. qe-security-scanner
12. ✅ qe-api-contract-validator (DONE)
13. qe-test-data-architect
14. qe-deployment-readiness
15. qe-visual-tester
16. qe-chaos-engineer
17. qe-fleet-commander
18. qe-code-complexity

**Implementation Steps**:

For each agent:

1. **Open agent definition**:
   ```bash
   vim .claude/agents/qe-test-generator.md
   ```

2. **Find "## Coordination Protocol" section**

3. **Insert learning protocol section** (use template from docs/LEARNING-PROTOCOL-TEMPLATE.md)

4. **Replace placeholders** with agent-specific values:
   - `{AGENT_ID}`: e.g., "qe-test-generator"
   - `{TASK_TYPE}`: e.g., "test-generation"
   - `{OUTCOME_FIELDS}`: Agent-specific results
   - `{METADATA_FIELDS}`: Agent-specific context
   - `{SUCCESS_CRITERIA}`: Agent-specific metrics

5. **Verify 4 MCP tool calls present**:
   ```bash
   grep "learning_store_experience" .claude/agents/qe-test-generator.md
   grep "learning_store_qvalue" .claude/agents/qe-test-generator.md
   grep "learning_store_pattern" .claude/agents/qe-test-generator.md
   grep "learning_query" .claude/agents/qe-test-generator.md
   ```

### Phase 2: Testing & Validation (2-3 hours)

**Test Each Agent**:

```bash
# Test via Claude Code Task tool
Task("Test learning", "Generate tests and verify learning persistence", "qe-test-generator")

# Verify database has learning data
sqlite3 .agentic-qe/db/memory.db "SELECT COUNT(*) FROM learning_experiences WHERE agent_id = 'qe-test-generator';"
sqlite3 .agentic-qe/db/memory.db "SELECT COUNT(*) FROM q_values WHERE agent_id = 'qe-test-generator';"

# Test via MCP client
npx aqe mcp test-generate --framework jest

# Verify learning persistence again
```

**Success Criteria**:
- ✅ Agent calls all 4 MCP learning tools
- ✅ Database has learning_experiences records
- ✅ Database has q_values records
- ✅ Database has patterns records
- ✅ Agent queries past learnings before execution
- ✅ Agent uses learned strategies to optimize approach

### Phase 3: CI/CD Integration Example (1-2 hours)

**Create Example Workflow**:

```yaml
# .github/workflows/agentic-qe-example.yml
name: Agentic QE - Learning Enabled

on: [pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install AQE
        run: npm install -g agentic-qe

      - name: Initialize AQE
        run: npx aqe init

      - name: Run Test Generator (with learning)
        run: |
          npx aqe mcp test-generate \
            --framework jest \
            --coverage-goal 90 \
            --learning-enabled true

      - name: Run Coverage Analyzer (with learning)
        run: |
          npx aqe mcp coverage-analyze \
            --algorithm sublinear \
            --learning-enabled true

      - name: Run Quality Gate (with learning)
        run: |
          npx aqe mcp quality-gate \
            --environment staging \
            --policy strict \
            --learning-enabled true

      - name: Export Learning Data
        if: always()
        run: |
          npx aqe learning export --output learning-report.json

      - name: Upload Learning Report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: learning-report
          path: learning-report.json
```

**Key Features**:
- ✅ Learning enabled for all agents
- ✅ Learning data persists across runs
- ✅ Learning report exported for analysis
- ✅ Agents improve over time via Q-learning

---

## Part 5: Benefits of Explicit MCP Calls

### 1. Universal Compatibility

**Before** (Internal Architecture):
```typescript
// ❌ ONLY works in Node.js with BaseAgent instantiation
const agent = new TestGeneratorAgent(config);
await agent.executeTask(task);
// Learning happens implicitly via hooks
```

**After** (Explicit MCP):
```typescript
// ✅ Works EVERYWHERE - Claude Code, MCP clients, CI/CD, Python, Go, Rust
Task("Generate tests", "...", "qe-test-generator")
  ↓ Agent explicitly calls learning tools
  ↓ Works regardless of invocation method
```

### 2. CI/CD Pipeline Integration

**Before**:
```yaml
# ❌ Learning doesn't work in CI/CD
- run: npx aqe test-generate
  # No learning persistence (BaseAgent not instantiated)
```

**After**:
```yaml
# ✅ Learning works in CI/CD
- run: npx aqe test-generate --learning-enabled
  # Agent calls MCP tools, learning persists
  # Agents improve over time across pipeline runs
```

### 3. Cross-Session Learning

**Before**:
```bash
# Session 1
Task("Coverage analysis", "...", "qe-coverage-analyzer")
# ❌ No learning data persisted

# Session 2 (hours later)
Task("Coverage analysis", "...", "qe-coverage-analyzer")
# ❌ Agent starts from scratch, no memory of previous session
```

**After**:
```bash
# Session 1
Task("Coverage analysis", "...", "qe-coverage-analyzer")
# ✅ Calls learning_store_experience(), learning_store_qvalue()
# ✅ Learning data persisted to database

# Session 2 (hours later)
Task("Coverage analysis", "...", "qe-coverage-analyzer")
# ✅ Calls learning_query(), retrieves past learnings
# ✅ Uses best-performing strategy from previous session
# ✅ Agent improves over time via Q-learning
```

### 4. Visibility and Debugging

**Before**:
```
Agent executes task
Learning happens implicitly (hidden in hooks)
Hard to debug why certain strategies were chosen
```

**After**:
```
Agent executes task
Agent explicitly calls:
  - learning_query() at start (visible in logs)
  - learning_store_experience() at end (visible in logs)
  - learning_store_qvalue() for strategies (visible in logs)
Easy to debug, trace, and verify learning behavior
```

### 5. Alignment with Claude Flow

**Proven Success**:
- Claude Flow uses explicit MCP calls for learning
- 84.8% SWE-Bench solve rate
- 32.3% token reduction
- 2.8-4.4x speed improvement
- 27+ neural models

**Your Architecture Should Match**:
- Same pattern (explicit MCP calls)
- Same benefits (learning persistence)
- Same scalability (works everywhere)
- Same observability (visible tool calls)

---

## Part 6: Migration Strategy

### Option A: All-at-Once (Aggressive)

**Timeline**: 1-2 days

**Approach**:
1. Update all 15 remaining agents in one session
2. Test all agents together
3. Update documentation
4. Release as v1.4.0 with "Learning-enabled agents"

**Pros**:
- ✅ Fast completion
- ✅ Consistent release

**Cons**:
- ❌ Higher risk (many changes at once)
- ❌ Harder to debug if issues arise

### Option B: Incremental (Conservative) - RECOMMENDED

**Timeline**: 1 week

**Approach**:

**Day 1-2**: High-priority agents
- qe-test-generator
- qe-test-executor
- qe-quality-gate
- Test thoroughly

**Day 3-4**: Medium-priority agents
- qe-quality-analyzer
- qe-regression-risk-analyzer
- qe-requirements-validator
- qe-production-intelligence
- Test thoroughly

**Day 5-6**: Lower-priority agents
- Remaining 7 agents
- Test thoroughly

**Day 7**: Integration testing & documentation
- CI/CD example workflow
- Update README.md with learning features
- Create learning dashboard example
- Release as v1.4.0

**Pros**:
- ✅ Lower risk (test each batch)
- ✅ Easier debugging
- ✅ Can adjust strategy based on early results

**Cons**:
- ❌ Slower completion

### Option C: Automated Script (Efficient) - MOST EFFICIENT

**Timeline**: 4-6 hours

**Approach**:

1. **Create automated script** (scripts/add-learning-protocol.sh):
   ```bash
   #!/bin/bash
   # Automatically add learning protocol to all agents

   AGENTS_DIR=".claude/agents"
   TEMPLATE="docs/LEARNING-PROTOCOL-TEMPLATE.md"

   # Agent-specific configurations
   declare -A AGENT_CONFIGS
   AGENT_CONFIGS["qe-test-generator"]="test-generation:testsGenerated,coverageImprovement:jest"
   AGENT_CONFIGS["qe-test-executor"]="test-execution:testsRun,passRate:parallel"
   # ... (more agent configs)

   for agent_file in "$AGENTS_DIR"/qe-*.md; do
     agent_name=$(basename "$agent_file" .md)

     # Skip if already has learning protocol
     if grep -q "Learning Protocol (Phase 6" "$agent_file"; then
       echo "✅ $agent_name already has learning protocol"
       continue
     fi

     # Get agent config
     config="${AGENT_CONFIGS[$agent_name]}"
     IFS=':' read -r task_type outcome_fields framework <<< "$config"

     # Generate learning protocol section
     learning_section=$(cat "$TEMPLATE" | \
       sed "s/{AGENT_ID}/$agent_name/g" | \
       sed "s/{TASK_TYPE}/$task_type/g" | \
       sed "s/{OUTCOME_FIELDS}/$outcome_fields/g" | \
       sed "s/{FRAMEWORK}/$framework/g")

     # Insert after "## Coordination Protocol"
     awk -v section="$learning_section" '
       /## Coordination Protocol/ {
         print
         getline
         while (!/^##/ && NF) {
           print
           getline
         }
         print section
       }
       { print }
     ' "$agent_file" > "$agent_file.tmp"

     mv "$agent_file.tmp" "$agent_file"

     echo "✅ Added learning protocol to $agent_name"
   done
   ```

2. **Run script**:
   ```bash
   chmod +x scripts/add-learning-protocol.sh
   ./scripts/add-learning-protocol.sh
   ```

3. **Manual verification**:
   ```bash
   # Verify all agents have learning protocol
   for agent in .claude/agents/qe-*.md; do
     echo "Checking $(basename $agent)..."
     grep -q "Learning Protocol" "$agent" && echo "✅" || echo "❌"
   done
   ```

4. **Test all agents**:
   ```bash
   # Run comprehensive test suite
   npm run test:agents

   # Verify learning persistence for each agent
   npm run test:learning-integration
   ```

**Pros**:
- ✅ Fastest completion (4-6 hours vs 1 week)
- ✅ Consistent application of learning protocol
- ✅ Reduces human error
- ✅ Reusable for future agents

**Cons**:
- ❌ Requires script development time (1-2 hours)
- ❌ May need manual tweaks for edge cases

---

## Part 7: Proof of Concept (Already Exists)

### Evidence from qe-coverage-analyzer

**File**: .claude/agents/qe-coverage-analyzer.md

**Learning Protocol Section** (lines added in Phase 6):

```typescript
// 1. Query past learnings before starting
const pastLearnings = await mcp__agentic_qe__learning_query({
  agentId: "qe-coverage-analyzer",
  taskType: "coverage-analysis",
  minReward: 0.8,
  queryType: "all",
  limit: 10
});

// 2. Execute task using learned best strategies

// 3. Store learning experience after completion
mcp__agentic_qe__learning_store_experience({
  agentId: "qe-coverage-analyzer",
  taskType: "coverage-analysis",
  reward: 0.95,
  outcome: {
    coverageAnalyzed: true,
    gapsDetected: 42,
    algorithm: "johnson-lindenstrauss",
    executionTime: 6000,
    coverageImprovement: 0.15,
    sublinearOptimization: true
  },
  metadata: {
    algorithm: "sublinear",
    complexity: "O(log n)",
    memoryReduction: "90%"
  }
})

// 4. Store Q-values for strategy tracking
mcp__agentic_qe__learning_store_qvalue({
  agentId: "qe-coverage-analyzer",
  stateKey: "coverage-analysis-state",
  actionKey: "sublinear-algorithm-jl",
  qValue: 0.85,
  metadata: {
    algorithmUsed: "johnson-lindenstrauss",
    codebaseSize: "large",
    performanceGain: "10x"
  }
})
```

**This Proves**:
- ✅ Pattern is established
- ✅ Template is working
- ✅ MCP tools are functional
- ✅ Just needs to be applied to 15 more agents

---

## Part 8: Final Recommendation

### ✅ YES, Modify All QE Agents to Call MCP Tools Explicitly

**Why**:
1. **Your use case requires it**: MCP invocation + CI/CD integration
2. **Internal architecture won't work**: BaseAgent hooks don't fire with Task tool
3. **Claude Flow proves it works**: 84.8% SWE-Bench solve rate with explicit MCP calls
4. **Already partially implemented**: 3 agents done, 15 to go
5. **Universal compatibility**: Works everywhere (Node.js, Python, Go, CI/CD, etc.)

**How**:
1. **Use Option C (Automated Script)**: Fastest and most consistent (4-6 hours)
2. **Priority order**: High → Medium → Low priority agents
3. **Test each batch**: Verify learning persistence after each batch
4. **Document**: Update README.md with learning features
5. **Release**: v1.4.0 "Learning-Enabled Agents"

**Next Steps**:
1. Create automated script (scripts/add-learning-protocol.sh)
2. Run script to update all 15 remaining agents
3. Test learning persistence for each agent
4. Update documentation (README.md, CHANGELOG.md)
5. Create CI/CD example workflow
6. Release v1.4.0

**Expected Timeline**: 4-6 hours (with automated script) vs 1 week (manual)

**Expected Benefits**:
- ✅ Learning works with Claude Code Task tool
- ✅ Learning works in CI/CD pipelines
- ✅ Agents improve over time via Q-learning
- ✅ Cross-session learning persistence
- ✅ Universal compatibility (all invocation methods)

---

## Appendix A: Learning Protocol Template Reference

**Template**: docs/LEARNING-PROTOCOL-TEMPLATE.md

**4 MCP Tools**:
1. `mcp__agentic_qe__learning_store_experience` - Store task execution results
2. `mcp__agentic_qe__learning_store_qvalue` - Store strategy Q-values
3. `mcp__agentic_qe__learning_store_pattern` - Store successful patterns
4. `mcp__agentic_qe__learning_query` - Query past learnings

**Agent-Specific Fields to Replace**:
- `{AGENT_ID}`: Agent identifier (e.g., "qe-test-generator")
- `{TASK_TYPE}`: Task type (e.g., "test-generation")
- `{OUTCOME_FIELDS}`: Agent-specific results
- `{METADATA_FIELDS}`: Agent-specific context
- `{SUCCESS_CRITERIA}`: Agent-specific metrics

**Success Criteria Scale** (0-1):
- **1.0**: Perfect execution
- **0.9**: Excellent
- **0.7**: Good
- **0.5**: Acceptable
- **<0.5**: Needs improvement

---

## Appendix B: MCP Learning Tools Reference

### 1. learning_store_experience

**Purpose**: Store task execution results for Q-learning

**Parameters**:
```typescript
{
  agentId: string;        // Agent identifier
  taskType: string;       // Task type for categorization
  reward: number;         // Success metric (0-1 scale)
  outcome: object;        // Task results (agent-specific)
  metadata?: object;      // Additional context (optional)
  timestamp?: number;     // Unix timestamp (defaults to Date.now())
}
```

**Implementation**: src/mcp/handlers/learning/learning-store-experience.ts

### 2. learning_store_qvalue

**Purpose**: Store Q-values for strategy selection optimization

**Parameters**:
```typescript
{
  agentId: string;        // Agent identifier
  stateKey: string;       // State identifier for Q-learning
  actionKey: string;      // Action/strategy identifier
  qValue: number;         // Expected value of this action
  metadata?: object;      // Strategy details (optional)
  updateCount?: number;   // Number of updates (defaults to 1)
}
```

**Implementation**: src/mcp/handlers/learning/learning-store-qvalue.ts

### 3. learning_store_pattern

**Purpose**: Store successful patterns for reuse

**Parameters**:
```typescript
{
  agentId?: string;       // Agent identifier (optional for cross-agent patterns)
  pattern: string;        // Description of successful pattern
  confidence: number;     // Confidence in pattern (0-1 scale)
  domain?: string;        // Domain/category (defaults to "general")
  metadata?: object;      // Pattern context (optional)
  successRate?: number;   // Success rate (0-1 scale, defaults to 1)
  usageCount?: number;    // Usage count (defaults to 1)
}
```

**Implementation**: src/mcp/handlers/learning/learning-store-pattern.ts

### 4. learning_query

**Purpose**: Query past learnings for strategy optimization

**Parameters**:
```typescript
{
  agentId?: string;       // Filter by agent (optional)
  taskType?: string;      // Filter by task type (optional)
  minReward?: number;     // Filter by minimum reward (optional)
  queryType?: string;     // Type of data ("experiences", "qvalues", "patterns", "all")
  limit?: number;         // Maximum results (defaults to 50)
  offset?: number;        // Pagination offset (defaults to 0)
  timeRange?: {           // Time range filter (optional)
    start: number;
    end: number;
  }
}
```

**Implementation**: src/mcp/handlers/learning/learning-query.ts

---

## Appendix C: Database Schema Reference

### learning_experiences Table

```sql
CREATE TABLE learning_experiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  task_id TEXT,
  task_type TEXT NOT NULL,
  state TEXT NOT NULL,
  action TEXT NOT NULL,
  reward REAL NOT NULL,
  next_state TEXT NOT NULL,
  episode_id TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  created_at INTEGER
);

CREATE INDEX idx_learning_agent_task ON learning_experiences(agent_id, task_type);
CREATE INDEX idx_learning_timestamp ON learning_experiences(timestamp);
```

### q_values Table

```sql
CREATE TABLE q_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  state_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  q_value REAL NOT NULL,
  update_count INTEGER DEFAULT 1,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata TEXT,
  UNIQUE(agent_id, state_key, action_key)
);

CREATE INDEX idx_qvalues_agent_state ON q_values(agent_id, state_key);
```

### patterns Table

```sql
CREATE TABLE patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT,
  pattern TEXT NOT NULL,
  confidence REAL NOT NULL,
  domain TEXT DEFAULT 'general',
  metadata TEXT,
  success_rate REAL DEFAULT 1.0,
  usage_count INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patterns_domain ON patterns(domain);
CREATE INDEX idx_patterns_confidence ON patterns(confidence);
```

**Database Location**: .agentic-qe/db/memory.db

---

## Conclusion

**Decision**: ✅ **YES**, modify all QE agents to call MCP tools explicitly during execution.

**Justification**:
- Your use case (MCP invocation + CI/CD) requires it
- Internal architecture (BaseAgent hooks) won't work with Task tool
- Claude Flow's proven architecture validates this approach
- Already 3/18 agents implemented, 15 to go
- Universal compatibility across all invocation methods

**Recommended Approach**: Option C (Automated Script) for fastest, most consistent implementation.

**Timeline**: 4-6 hours (automated) vs 1 week (manual)

**Expected Outcome**: All 18 QE agents will persist learning data regardless of invocation method, enabling continuous improvement across sessions and CI/CD runs.

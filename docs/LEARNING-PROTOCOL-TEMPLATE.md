# Learning Protocol Template for QE Agents

**Purpose**: Reusable template to add to any QE agent definition for learning persistence.

## Section to Add to Agent Definitions

Add this section after the "Coordination Protocol" section in each agent's markdown file.

---

## Learning Protocol (Phase 6 - Option C Implementation)

**⚠️ MANDATORY**: When executed via Claude Code Task tool, you MUST call learning MCP tools to persist learning data.

### Required Learning Actions (Call AFTER Task Completion)

**1. Store Learning Experience:**
```typescript
// Call this MCP tool after completing your task
mcp__agentic_qe__learning_store_experience({
  agentId: "{AGENT_ID}",  // e.g., "qe-test-generator", "qe-flaky-test-hunter"
  taskType: "{TASK_TYPE}",  // e.g., "test-generation", "flaky-detection"
  reward: 0.95,  // Your assessment of task success (0-1 scale)
  outcome: {
    // Your actual results (agent-specific)
    {OUTCOME_FIELDS}
  },
  metadata: {
    // Additional context (agent-specific)
    {METADATA_FIELDS}
  }
})
```

**2. Store Q-Values for Your Strategy:**
```typescript
// Store Q-value for the strategy you used
mcp__agentic_qe__learning_store_qvalue({
  agentId: "{AGENT_ID}",
  stateKey: "{STATE_KEY}",  // e.g., "test-generation-state", "flaky-detection-state"
  actionKey: "{ACTION_KEY}",  // e.g., "ml-algorithm", "statistical-analysis"
  qValue: 0.85,  // Expected value of this approach (based on results)
  metadata: {
    // Strategy details (agent-specific)
    {STRATEGY_METADATA}
  }
})
```

**3. Store Successful Patterns:**
```typescript
// If you discovered a useful pattern, store it
mcp__agentic_qe__learning_store_pattern({
  agentId: "{AGENT_ID}",
  pattern: "{PATTERN_DESCRIPTION}",  // What worked well
  confidence: 0.95,  // How confident you are (0-1)
  domain: "{DOMAIN}",  // e.g., "test-generation", "flaky-detection"
  metadata: {
    // Pattern context (agent-specific)
    {PATTERN_METADATA}
  }
})
```

### Learning Query (Use at Task Start)

**Before starting your task**, query for past learnings:

```typescript
// Query for successful experiences
const pastLearnings = await mcp__agentic_qe__learning_query({
  agentId: "{AGENT_ID}",
  taskType: "{TASK_TYPE}",
  minReward: 0.8,  // Only get successful experiences
  queryType: "all",
  limit: 10
});

// Use the insights to optimize your current approach
if (pastLearnings.success && pastLearnings.data) {
  const { experiences, qValues, patterns } = pastLearnings.data;

  // Find best-performing strategy
  const bestStrategy = qValues
    .filter(qv => qv.state_key === "{STATE_KEY}")
    .sort((a, b) => b.q_value - a.q_value)[0];

  console.log(`Using learned best strategy: ${bestStrategy.action_key} (Q-value: ${bestStrategy.q_value})`);

  // Check for relevant patterns
  const relevantPatterns = patterns
    .filter(p => p.domain === "{DOMAIN}")
    .sort((a, b) => b.confidence * b.success_rate - a.confidence * a.success_rate);

  if (relevantPatterns.length > 0) {
    console.log(`Applying pattern: ${relevantPatterns[0].pattern}`);
  }
}
```

### Success Criteria for Learning

**Reward Assessment (0-1 scale):**
- **1.0**: Perfect execution ({PERFECT_CRITERIA})
- **0.9**: Excellent ({EXCELLENT_CRITERIA})
- **0.7**: Good ({GOOD_CRITERIA})
- **0.5**: Acceptable ({ACCEPTABLE_CRITERIA})
- **<0.5**: Needs improvement ({NEEDS_IMPROVEMENT_CRITERIA})

**When to Call Learning Tools:**
- ✅ **ALWAYS** after completing main task
- ✅ **ALWAYS** after detecting significant findings
- ✅ **ALWAYS** after generating recommendations
- ✅ When discovering new effective strategies
- ✅ When achieving exceptional performance metrics

---

## Agent-Specific Replacements

When adding this template to an agent, replace these placeholders:

### General Placeholders

| Placeholder | Example Value | Description |
|-------------|---------------|-------------|
| `{AGENT_ID}` | `qe-test-generator` | Agent identifier |
| `{TASK_TYPE}` | `test-generation` | Primary task type |
| `{DOMAIN}` | `test-generation` | Knowledge domain |
| `{STATE_KEY}` | `test-generation-state` | State identifier for Q-learning |
| `{ACTION_KEY}` | `ml-property-based` | Action/strategy identifier |

### Outcome Placeholders (Agent-Specific)

#### For Test Generator
```typescript
{OUTCOME_FIELDS}:
  testsGenerated: 42,
  coverageImprovement: 0.15,
  framework: "jest",
  executionTime: 8000
```

#### For Flaky Test Hunter
```typescript
{OUTCOME_FIELDS}:
  flakyTestsDetected: 13,
  reliability: 0.9862,
  autoStabilized: 8,
  executionTime: 12000
```

#### For Coverage Analyzer
```typescript
{OUTCOME_FIELDS}:
  coverageAnalyzed: true,
  gapsDetected: 42,
  algorithm: "johnson-lindenstrauss",
  executionTime: 6000,
  coverageImprovement: 0.15
```

#### For Performance Tester
```typescript
{OUTCOME_FIELDS}:
  benchmarksRun: 25,
  bottlenecksFound: 7,
  performanceGain: "2.5x",
  executionTime: 15000
```

### Metadata Placeholders (Agent-Specific)

#### For Test Generator
```typescript
{METADATA_FIELDS}:
  algorithm: "ml-property-based",
  framework: "jest",
  testTypes: ["unit", "integration"]

{STRATEGY_METADATA}:
  algorithmUsed: "ml-property-based",
  successRate: "95%",
  testQuality: "high"
```

#### For Flaky Test Hunter
```typescript
{METADATA_FIELDS}:
  algorithm: "statistical-analysis",
  confidenceLevel: 0.99,
  method: "ml-pattern-matching"

{STRATEGY_METADATA}:
  detectionMethod: "statistical-analysis",
  falsePositiveRate: "2%",
  stabilizationSuccess: "80%"
```

### Success Criteria Placeholders

#### For Test Generator
- `{PERFECT_CRITERIA}`: 95%+ coverage, 0 errors, <5s generation time
- `{EXCELLENT_CRITERIA}`: 90%+ coverage, <10s generation time, minor issues
- `{GOOD_CRITERIA}`: 80%+ coverage, <20s generation time, few issues
- `{ACCEPTABLE_CRITERIA}`: 70%+ coverage, completed successfully
- `{NEEDS_IMPROVEMENT_CRITERIA}`: Low coverage, errors, slow

#### For Flaky Test Hunter
- `{PERFECT_CRITERIA}`: 100% detection accuracy, 0 false positives, <5s analysis
- `{EXCELLENT_CRITERIA}`: 98%+ detection accuracy, <2% false positives
- `{GOOD_CRITERIA}`: 95%+ detection accuracy, <5% false positives
- `{ACCEPTABLE_CRITERIA}`: 90%+ detection accuracy, completed successfully
- `{NEEDS_IMPROVEMENT_CRITERIA}`: Low accuracy, many false positives

## Priority Order for Agent Updates

### High Priority (Core Testing) - Update First
1. ✅ **qe-coverage-analyzer** (DONE)
2. **qe-test-generator**
3. **qe-test-executor**
4. **qe-flaky-test-hunter**
5. **qe-quality-gate**

### Medium Priority (Analysis & Planning)
6. **qe-quality-analyzer**
7. **qe-regression-risk-analyzer**
8. **qe-requirements-validator**
9. **qe-production-intelligence**

### Lower Priority (Specialized)
10. **qe-performance-tester**
11. **qe-security-scanner**
12. **qe-api-contract-validator**
13. **qe-test-data-architect**
14. **qe-deployment-readiness**
15. **qe-visual-tester**
16. **qe-chaos-engineer**
17. **qe-fleet-commander**
18. **qe-code-complexity**

## Automated Update Script (Future Enhancement)

```bash
#!/bin/bash
# scripts/add-learning-protocol-to-agents.sh

AGENTS_DIR=".claude/agents"
TEMPLATE="docs/LEARNING-PROTOCOL-TEMPLATE.md"

for agent_file in "$AGENTS_DIR"/qe-*.md; do
  agent_name=$(basename "$agent_file" .md)

  # Check if learning protocol already exists
  if grep -q "Learning Protocol (Phase 6" "$agent_file"; then
    echo "✅ $agent_name already has learning protocol"
    continue
  fi

  # Insert learning protocol after Coordination Protocol
  # (Implementation details...)

  echo "✅ Added learning protocol to $agent_name"
done
```

## Quick Add Command

For manual updates, use this pattern:

```bash
# Open agent file
vim .claude/agents/qe-test-generator.md

# Find "## Coordination Protocol" section
# After it, add the learning protocol section with agent-specific values
```

## Verification

After adding learning protocol to an agent:

```bash
# Check the agent has the learning section
grep -A 5 "Learning Protocol" .claude/agents/qe-test-generator.md

# Verify all 4 MCP tool calls are present
grep "learning_store_experience" .claude/agents/qe-test-generator.md
grep "learning_store_qvalue" .claude/agents/qe-test-generator.md
grep "learning_store_pattern" .claude/agents/qe-test-generator.md
grep "learning_query" .claude/agents/qe-test-generator.md
```

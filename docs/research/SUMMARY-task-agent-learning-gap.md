# Executive Summary: Task Agent Learning Gap

**Critical Finding**: Claude Code's Task tool does NOT automatically capture agent output for learning persistence.

---

## The Problem

When you spawn agents using Claude Code's Task tool:
```javascript
Task("Generate tests", "Create test suite...", "qe-test-generator")
```

**What happens**:
- ✅ Agent executes successfully
- ✅ Output visible to user in conversation
- ❌ **Learnings are NEVER persisted**
- ❌ **No automatic hook integration**

---

## Root Cause

### Claude Flow's ReasoningBank Requires Trajectories

ReasoningBank exists but expects **manual trajectory files**:

```json
{
  "steps": [
    { "action": "analyze", "result": "..." },
    { "action": "implement", "result": "..." }
  ],
  "query": "Task description",
  "metadata": { "agent": "test-gen" }
}
```

**Problem**: Nobody creates these trajectories for Task agents!

### Hook System Limitation

Hooks work for `Bash`, `Write`, `Edit` but **NOT for Task tool**:
- Task agents run in **separate threads**
- No parent-child data flow
- Agent output stays **internal to Claude Code**

---

## Current State Analysis

### ✅ What EXISTS in Claude Flow:

1. **ReasoningBank** - Learning system with judge + distill algorithms
2. **Post-Task Hook** - Script that processes trajectories
3. **Memory Storage** - SQLite database with embeddings
4. **Retrieval API** - Semantic search for memories

### ❌ What's MISSING:

1. **Automatic trajectory capture** from Task agents
2. **Hook integration** for Task tool
3. **Structured output** from agent conversations
4. **Agent instrumentation** for step tracking

---

## Recommended Solution: Hybrid Self-Reporting

### Architecture:

```
Agent Work
    ↓
Agent uses memory_store with "learning/*" key
    ↓
Background processor watches "learning/*"
    ↓
Converts to trajectory format
    ↓
Calls ReasoningBank judge + distill
    ↓
Persisted as reusable patterns
```

### Implementation (3 parts):

#### 1. Agent Learning API
```typescript
// BaseAgent.ts
protected async recordLearning(learning: {
  type: 'pattern' | 'finding' | 'failure' | 'success',
  title: string,
  description: string,
  confidence: number
}): Promise<void> {
  await this.memory.store({
    key: `learning/${this.agentId}/${Date.now()}`,
    value: JSON.stringify(learning),
    namespace: "learnings",
    persist: true
  });
}
```

#### 2. Updated Agent Instructions
```markdown
## Learning Protocol

Record key learnings using:

mcp__agentic-qe__memory_store({
  key: "learning/[agent]/[timestamp]",
  value: JSON.stringify({
    type: "pattern",
    title: "Edge case handling",
    description: "Always validate null inputs...",
    confidence: 0.85
  }),
  namespace: "learnings",
  persist: true
});
```

#### 3. Background Processor
```bash
# Process learnings periodically
aqe learn process

# Or automatic via cron
*/30 * * * * cd /project && aqe learn process
```

---

## Why This Works

1. ✅ **Works TODAY** - No waiting for hook system changes
2. ✅ **Explicit but simple** - Clear protocol for agents
3. ✅ **Integrates with MCP** - Uses existing memory tools
4. ✅ **Gradual rollout** - Start with 1-2 agents, expand
5. ✅ **Measurable** - Can track learning coverage per agent

---

## Timeline

### Week 1: Foundation
- Implement `BaseAgent.recordLearning()`
- Update 2 agent instructions (test-gen, flaky-hunter)
- Test learning capture

### Week 2: Automation
- Build `LearningProcessor` service
- Add CLI command `aqe learn process`
- Integrate with ReasoningBank

### Week 3: Rollout
- Update all 19 QE agents
- Document learning protocol
- Monitor learning quality

---

## Alternative Approaches (Not Recommended)

### ❌ Wait for Hook System Changes
- **Timeline**: Unknown, depends on Anthropic
- **Risk**: May never happen
- **Blocker**: Prevents all learning

### ❌ Parse Conversation History
- **Challenge**: Unstructured text parsing
- **Accuracy**: ~60-70% (lots of false positives)
- **Maintenance**: High (conversation format changes)

### ❌ Wrapper Scripts
- **Complexity**: High
- **Adoption**: Low (agents must use wrapper)
- **Debugging**: Difficult

---

## Success Metrics

**After implementing learning protocol:**

1. **Learning Coverage**: % of agents recording learnings
   - Target: 80%+ within 1 month

2. **Learning Quality**: Avg confidence score of recorded patterns
   - Target: >0.75

3. **Learning Reuse**: % of tasks using retrieved memories
   - Target: 40%+ within 2 months

4. **Time to Convergence**: Iterations needed for pattern reuse
   - Target: <3 iterations per task type

---

## Next Steps

1. **Read**: Full analysis in `claude-flow-task-agent-learning-analysis.md`
2. **Decide**: Approve hybrid self-reporting approach?
3. **Build**: Start with BaseAgent.recordLearning() implementation
4. **Test**: Pilot with qe-test-generator agent
5. **Scale**: Roll out to all agents

---

## Key Takeaway

**Claude Flow's ReasoningBank is powerful but requires intentional integration**. The Task tool won't automatically persist learnings. We must build an explicit learning protocol that agents follow.

**This is achievable** and **worth doing** - the learning system will compound value over time.

---

**Full Analysis**: See `claude-flow-task-agent-learning-analysis.md` (12 sections, 800+ lines)
**Generated**: 2025-12-08
**Status**: ✅ Research Complete - Ready for Implementation

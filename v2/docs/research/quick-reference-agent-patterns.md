# Quick Reference: AI Agent Implementation Patterns

## 🎯 When to Use Which Pattern

### Sequential Pattern
```
Use when: Tasks have clear step-by-step dependencies
Example: Data pipeline → Transform → Validate → Store
Benefits: Predictable, easy to debug
```

### Parallel Pattern
```
Use when: Independent tasks can run simultaneously
Example: Test suite execution across different modules
Benefits: 2.8-4.4x speed improvement
Implementation: Spawn 3-5 agents in single message
```

### Supervisor Pattern
```
Use when: Need centralized control and coordination
Example: Complex workflow with dynamic task allocation
Benefits: Clear accountability, easy monitoring
Anthropic tip: "Teach orchestrator how to delegate"
```

### Network/Mesh Pattern
```
Use when: Peer collaboration without hierarchy
Example: Distributed consensus, collaborative research
Benefits: No single point of failure, self-organizing
```

### Hierarchical Pattern
```
Use when: Enterprise-scale with domain specialization
Example: Multi-team development with specialized supervisors
Benefits: Scalable coordination, clear hierarchy
```

---

## 💾 Memory Patterns Cheat Sheet

### Short-Term Memory
```javascript
// Use for: Current session context
mcp__claude-flow__memory_usage({
  action: "store",
  key: "session/current-task",
  namespace: "temp",
  ttl: 3600 // 1 hour
})
```

### Long-Term Memory
```javascript
// Use for: Persistent knowledge
mcp__claude-flow__memory_usage({
  action: "store",
  key: "knowledge/api-patterns",
  namespace: "persistent"
  // No TTL = permanent
})
```

### Shared Agent Memory
```javascript
// Use for: Cross-agent coordination
mcp__claude-flow__memory_usage({
  action: "store",
  key: "swarm/agent-1/results",
  namespace: "coordination"
})

// Other agents retrieve:
mcp__claude-flow__memory_search({
  pattern: "swarm/*/results",
  namespace: "coordination"
})
```

### Consensus Memory
```javascript
// Use for: Critical decisions requiring agreement
// Agent 1 proposes
mcp__claude-flow__memory_usage({
  action: "store",
  key: "consensus/architecture-decision",
  value: JSON.stringify({
    proposal: "microservices",
    votes: { agent1: "yes" }
  })
})

// Agent 2 votes
// Agent 3 votes
// Check consensus threshold (e.g., 67%)
```

---

## 🧪 Test Automation Patterns

### Multi-Stage Pipeline
```yaml
stages:
  - name: preparation
    agent: qe-data-prep
    outputs: ["test-data", "fixtures"]

  - name: extraction
    agent: qe-requirements
    inputs: ["specs", "docs"]
    outputs: ["requirements-list"]

  - name: generation
    agent: qe-test-generator
    inputs: ["requirements-list"]
    outputs: ["test-suite"]

  - name: execution
    agent: qe-test-executor
    inputs: ["test-suite"]
    outputs: ["results", "coverage"]

  - name: refinement
    agent: qe-coverage-analyzer
    inputs: ["coverage"]
    outputs: ["gap-report", "new-tests"]
```

### Coverage-Driven Refinement
```bash
# Step 1: Run initial tests
npm test -- --coverage

# Step 2: Analyze gaps
npx aqe coverage --analyze

# Step 3: Generate targeted tests for gaps
npx aqe test generate --focus uncovered-modules

# Step 4: Re-run and verify
npm test -- --coverage
```

### Self-Healing Tests
```javascript
// Pattern: Monitor → Detect → Adapt → Re-run
const selfHealingAgent = {
  monitor: async (testResults) => {
    const failures = testResults.filter(t => t.status === 'failed')
    return failures
  },

  detect: async (failures) => {
    // Use AI to identify root cause
    const analysis = await analyzeFailures(failures)
    return analysis
  },

  adapt: async (analysis) => {
    // Auto-fix common issues
    if (analysis.cause === 'ui-change') {
      await updateSelectors(analysis.elements)
    }
  },

  rerun: async (tests) => {
    return await executeTests(tests)
  }
}
```

---

## 🚀 Claude Code Workflow Patterns

### Explore-Plan-Code-Commit
```markdown
## Workflow
1. **Explore**: Read files, understand context
   - Use: Read, Glob, Grep tools
   - No coding yet!

2. **Plan**: Use thinking mode
   - Command: "Let's think step by step..."
   - Create implementation plan

3. **Code**: Implement solution
   - Verify during coding
   - Run tests frequently

4. **Commit**: Document changes
   - Clear commit messages
   - Reference issues/PRs
```

### Test-Driven Development
```javascript
// 1. Write failing test
describe('calculateTotal', () => {
  it('should sum all items', () => {
    expect(calculateTotal([10, 20, 30])).toBe(60) // FAILS
  })
})

// 2. Implement minimal code
function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item, 0)
}

// 3. Verify test passes
// 4. Use subagent to verify no overfitting
```

### Visual Iteration
```bash
# 1. Get design reference
# Save screenshot: design-mockup.png

# 2. Implement initial version
# Take screenshot: iteration-1.png

# 3. Compare and improve
# Take screenshot: iteration-2.png

# 4. Repeat until matches
```

---

## 🏗️ MCP Server Patterns

### Resource Server
```typescript
// Pattern: Expose data as resources
server.setResourceTemplates([
  {
    uriTemplate: "test-results://{run-id}",
    name: "Test Results",
    mimeType: "application/json"
  }
])

// Clients can read:
// test-results://latest
// test-results://run-12345
```

### Tool Server
```typescript
// Pattern: Expose functions as tools
server.setToolHandler(async (request) => {
  if (request.name === "analyze-coverage") {
    const coverage = await analyzeCoverage(request.arguments)
    return {
      content: [{ type: "text", text: JSON.stringify(coverage) }]
    }
  }
})
```

### Prompt Template Server
```typescript
// Pattern: Reusable prompt templates
server.setPromptHandler(async (request) => {
  if (request.name === "generate-tests") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Generate comprehensive tests for: ${request.arguments.module}`
          }
        }
      ]
    }
  }
})
```

---

## 🎨 Agent Coordination Recipes

### Recipe 1: Parallel Research
```javascript
// Single message spawns all agents
[
  Task("Market research", "Analyze competitors", "researcher"),
  Task("Tech research", "Evaluate frameworks", "researcher"),
  Task("User research", "Interview users", "researcher")
]

// Aggregate results
const insights = await aggregateFromMemory("research/*")
```

### Recipe 2: Handoff Chain
```javascript
// Agent 1 → Agent 2 → Agent 3
Task("Requirements", "Extract specs, handoff to design", "planner")
  // Planner stores results, signals designer

Task("Design", "Create mockups, handoff to coder", "designer")
  // Designer retrieves requirements, creates designs

Task("Implementation", "Build features, handoff to tester", "coder")
  // Coder retrieves designs, implements
```

### Recipe 3: Consensus Building
```javascript
// All agents vote on decision
const agents = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"]

agents.forEach(agent => {
  Task(`Vote: ${agent}`, "Evaluate proposal and vote", agent)
})

// Collect votes
const votes = await getVotes()
const consensus = votes.filter(v => v === 'yes').length / votes.length
if (consensus >= 0.67) {
  // Decision approved
}
```

---

## 📊 Performance Optimization Patterns

### Token Optimization
```javascript
// Pattern: Hierarchical Summarization
const phases = ['research', 'design', 'implementation']

for (const phase of phases) {
  // Do work
  const results = await executePhase(phase)

  // Summarize before next phase
  const summary = await summarize(results)

  // Store only summary
  await storeInMemory(`${phase}/summary`, summary)

  // Clear detailed context
  await clearContextWindow()
}
```

### Context Window Management
```javascript
// Pattern: Fresh Context Spawning
if (contextTokens > threshold) {
  // Summarize essential info
  const essentialContext = await summarize(currentContext)

  // Terminate current agent
  await terminateAgent(currentAgentId)

  // Spawn fresh agent with summary
  await spawnAgent({
    type: 'coder',
    context: essentialContext
  })
}
```

### Embedding-Based Retrieval
```javascript
// Pattern: Semantic Context Selection
// Store with embeddings
await storeWithEmbedding({
  key: "feature/auth-implementation",
  content: authCode,
  embedding: await generateEmbedding(authCode)
})

// Retrieve semantically similar
const relevant = await searchByEmbedding(
  currentTaskEmbedding,
  { limit: 5, threshold: 0.8 }
)
```

---

## 🛡️ Error Handling Patterns

### Retry with Backoff
```javascript
async function executeWithRetry(agent, task, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await agent.execute(task)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      await sleep(Math.pow(2, i) * 1000) // Exponential backoff
    }
  }
}
```

### Circuit Breaker
```javascript
class AgentCircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failures = 0
    this.threshold = threshold
    this.timeout = timeout
    this.state = 'closed' // closed, open, half-open
  }

  async execute(fn) {
    if (this.state === 'open') {
      throw new Error('Circuit breaker open')
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  onFailure() {
    this.failures++
    if (this.failures >= this.threshold) {
      this.state = 'open'
      setTimeout(() => { this.state = 'half-open' }, this.timeout)
    }
  }

  onSuccess() {
    this.failures = 0
    this.state = 'closed'
  }
}
```

### Graceful Degradation
```javascript
async function executeWithFallback(primaryAgent, fallbackAgent, task) {
  try {
    return await primaryAgent.execute(task)
  } catch (error) {
    console.warn('Primary agent failed, using fallback')
    return await fallbackAgent.execute(task)
  }
}
```

---

## 📈 Metrics & Monitoring

### Performance Tracking
```javascript
const metrics = {
  agentExecutionTime: {},
  tokenUsage: {},
  successRate: {},

  track: async (agentId, fn) => {
    const start = Date.now()
    const startTokens = getCurrentTokenCount()

    try {
      const result = await fn()
      const duration = Date.now() - start
      const tokens = getCurrentTokenCount() - startTokens

      metrics.agentExecutionTime[agentId] = duration
      metrics.tokenUsage[agentId] = tokens
      metrics.successRate[agentId] = (metrics.successRate[agentId] || 0) + 1

      return result
    } catch (error) {
      metrics.successRate[agentId] = (metrics.successRate[agentId] || 0) - 1
      throw error
    }
  }
}
```

### LLM-as-Judge Evaluation
```javascript
async function evaluateAgentOutput(output, criteria) {
  const evaluationPrompt = `
Evaluate the following agent output based on these criteria:
${criteria.map(c => `- ${c}`).join('\n')}

Output:
${output}

Provide scores (0-10) for each criterion and overall assessment.
`

  const evaluation = await llm.evaluate(evaluationPrompt)
  return evaluation
}
```

---

## 🔑 Key Takeaways

### Top 5 Patterns for Success
1. **Memory-First Coordination** - Store everything in shared memory
2. **Parallel Agent Spawning** - 3-5 agents in single message
3. **Hierarchical Summarization** - Compress context at phase boundaries
4. **LLM-as-Judge** - Scalable quality evaluation
5. **Circuit Breaker** - Prevent cascading failures

### Top 5 Anti-Patterns to Avoid
1. ❌ Sequential agent spawning (1 per message)
2. ❌ No shared memory (agents duplicate work)
3. ❌ Unbounded context windows (token waste)
4. ❌ No error handling (cascading failures)
5. ❌ Micromanaging agents (reduces autonomy)

### Performance Benchmarks
- **Speed:** 2.8-4.4x with parallel agents
- **Time Savings:** 90% for complex queries
- **Token Efficiency:** 32.3% reduction
- **Cost Savings:** 45% with proper patterns
- **Quality:** 50% coverage improvement

---

*Quick Reference Guide - AI Agent Implementation Patterns*
*Based on research synthesis: October 6, 2025*

# Claude Code Configuration - Agentic QE Fleet

## 🤖 Agentic Quality Engineering Fleet

This project uses the **Agentic QE Fleet** - a distributed swarm of 18 AI agents for comprehensive software testing and quality assurance.

### Available Agents

#### Core Testing (5 agents)
- **qe-test-generator**: AI-powered test generation with sublinear optimization
- **qe-test-executor**: Multi-framework test execution with parallel processing
- **qe-coverage-analyzer**: Real-time gap detection with O(log n) algorithms
- **qe-quality-gate**: Intelligent quality gate with risk assessment
- **qe-quality-analyzer**: Comprehensive quality metrics analysis

#### Performance & Security (2 agents)
- **qe-performance-tester**: Load testing with k6, JMeter, Gatling integration
- **qe-security-scanner**: Multi-layer security with SAST/DAST scanning

#### Strategic Planning (3 agents)
- **qe-requirements-validator**: INVEST criteria validation and BDD generation
- **qe-production-intelligence**: Production data to test scenarios conversion
- **qe-fleet-commander**: Hierarchical fleet coordination (50+ agents)

#### Deployment (1 agent)
- **qe-deployment-readiness**: Multi-factor risk assessment for deployments

#### Advanced Testing (4 agents)
- **qe-regression-risk-analyzer**: Smart test selection with ML patterns
- **qe-test-data-architect**: High-speed realistic data generation (10k+ records/sec)
- **qe-api-contract-validator**: Breaking change detection across API versions
- **qe-flaky-test-hunter**: Statistical flakiness detection and auto-stabilization

#### Specialized (2 agents)
- **qe-visual-tester**: Visual regression with AI-powered comparison
- **qe-chaos-engineer**: Resilience testing with controlled fault injection

## 🚀 Quick Start

### Using Agents via Claude Code Task Tool (Recommended)

\`\`\`javascript
// Spawn agents directly in Claude Code
Task("Generate tests", "Create comprehensive test suite for UserService", "qe-test-generator")
Task("Analyze coverage", "Find gaps using O(log n) algorithms", "qe-coverage-analyzer")
Task("Quality check", "Run quality gate validation", "qe-quality-gate")
\`\`\`

### Using MCP Tools

\`\`\`bash
# Check MCP connection
claude mcp list
# Should show: agentic-qe: npm run mcp:start - ✓ Connected

# Use MCP tools in Claude Code
mcp__agentic_qe__test_generate({ type: "unit", framework: "jest" })
mcp__agentic_qe__test_execute({ parallel: true, coverage: true })
mcp__agentic_qe__quality_analyze({ scope: "full" })
\`\`\`

### Using CLI

\`\`\`bash
# Quick commands
aqe test <module-name>        # Generate tests
aqe coverage                   # Analyze coverage
aqe quality                    # Run quality gate
aqe status                     # Check fleet status
\`\`\`

## 🔄 Agent Coordination

All agents coordinate through **AQE hooks** (Agentic QE native hooks - zero external dependencies, 100-500x faster):

### Automatic Lifecycle Hooks

Agents extend \`BaseAgent\` and override lifecycle methods:

\`\`\`typescript
protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
  // Load context before task execution
  const context = await this.memoryStore.retrieve('aqe/context', {
    partition: 'coordination'
  });

  this.logger.info('Pre-task hook complete');
}

protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
  // Store results after task completion
  await this.memoryStore.store('aqe/' + this.agentId.type + '/results', data.result, {
    partition: 'agent_results',
    ttl: 86400 // 24 hours
  });

  // Emit completion event
  this.eventBus.emit('task:completed', {
    agentId: this.agentId,
    result: data.result
  });

  this.logger.info('Post-task hook complete');
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Handle task errors
  await this.memoryStore.store('aqe/errors/' + data.assignment.id, {
    error: data.error.message,
    stack: data.error.stack,
    timestamp: Date.now()
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  this.logger.error('Task failed', { error: data.error });
}
\`\`\`

### Performance Comparison

| Feature | AQE Hooks | External Hooks |
|---------|-----------|----------------|
| **Speed** | <1ms | 100-500ms |
| **Dependencies** | Zero | External package |
| **Type Safety** | Full TypeScript | Shell strings |
| **Integration** | Direct API | Shell commands |
| **Performance** | 100-500x faster | Baseline |

## 📋 Memory Namespace

Agents share state through the **\`aqe/*\` memory namespace**:

- \`aqe/test-plan/*\` - Test planning and requirements
- \`aqe/coverage/*\` - Coverage analysis and gaps
- \`aqe/quality/*\` - Quality metrics and gates
- \`aqe/performance/*\` - Performance test results
- \`aqe/security/*\` - Security scan findings
- \`aqe/swarm/coordination\` - Cross-agent coordination

## 🎯 Fleet Configuration

**Topology**: hierarchical
**Max Agents**: 10
**Testing Focus**: unit, integration
**Environments**: development
**Frameworks**: jest

## 💰 Multi-Model Router (v1.3.1)

**Status**: ⚠️  Disabled (opt-in)

The Multi-Model Router provides **70-81% cost savings** by intelligently selecting AI models based on task complexity.

### Features

- ✅ Intelligent model selection (GPT-3.5, GPT-4, Claude Sonnet 4.5, Claude Haiku)
- ✅ Real-time cost tracking and aggregation
- ✅ Automatic fallback chains for resilience
- ✅ Feature flags for safe rollout
- ✅ Zero breaking changes (disabled by default)

### Enabling Routing

**Option 1: Via Configuration**
\`\`\`json
// .agentic-qe/config/routing.json
{
  "multiModelRouter": {
    "enabled": true
  }
}
\`\`\`

**Option 2: Via Environment Variable**
\`\`\`bash
export AQE_ROUTING_ENABLED=true
\`\`\`

### Model Selection Rules

| Task Complexity | Model | Est. Cost | Use Case |
|----------------|-------|-----------|----------|
| **Simple** | GPT-3.5 | $0.0004 | Unit tests, basic validation |
| **Moderate** | GPT-3.5 | $0.0008 | Integration tests, mocks |
| **Complex** | GPT-4 | $0.0048 | Property-based, edge cases |
| **Critical** | Claude Sonnet 4.5 | $0.0065 | Security, architecture review |

### Cost Savings Example

**Before Routing** (always GPT-4):
- 100 simple tasks: $0.48
- 50 complex tasks: $0.24
- **Total**: $0.72

**After Routing**:
- 100 simple → GPT-3.5: $0.04
- 50 complex → GPT-4: $0.24
- **Total**: $0.28
- **Savings**: $0.44 (61%)

### Monitoring Costs

\`\`\`bash
# View cost dashboard
aqe routing dashboard

# Export cost report
aqe routing report --format json

# Check savings
aqe routing stats
\`\`\`

## 📊 Streaming Progress (v1.3.1)

**Status**: ✅ Enabled

Real-time progress updates for long-running operations using AsyncGenerator pattern.

### Features

- ✅ Real-time progress percentage
- ✅ Current operation visibility
- ✅ for-await-of compatibility
- ✅ Backward compatible (non-streaming still works)

### Example Usage

\`\`\`javascript
// Using streaming MCP tool
const handler = new TestExecuteStreamHandler();

for await (const event of handler.execute(params)) {
  if (event.type === 'progress') {
    console.log(\`Progress: \${event.percent}% - \${event.message}\`);
  } else if (event.type === 'result') {
    console.log('Completed:', event.data);
  }
}
\`\`\`

### Supported Operations

- ✅ Test execution (test-by-test progress)
- ✅ Coverage analysis (incremental gap detection)
- ⚠️  Test generation (coming in v1.1.0)
- ⚠️  Security scanning (coming in v1.1.0)

## 🎯 Claude Code Skills Integration

This fleet includes **35 specialized QE skills** that agents can use:

### Quality Engineering Skills (10 skills)
- **agentic-quality-engineering**: Using AI agents as force multipliers in quality work - autonomous testing systems, PACT principles, scaling quality engineering with intelligent agents
- **api-testing-patterns**: Comprehensive API testing patterns including contract testing, REST/GraphQL testing, and integration testing
- **bug-reporting-excellence**: Write high-quality bug reports that get fixed quickly - includes templates, examples, and best practices
- **context-driven-testing**: Apply context-driven testing principles where practices are chosen based on project context, not universal "best practices"
- **exploratory-testing-advanced**: Advanced exploratory testing techniques with Session-Based Test Management (SBTM), RST heuristics, and test tours
- **holistic-testing-pact**: Apply the Holistic Testing Model evolved with PACT (Proactive, Autonomous, Collaborative, Targeted) principles
- **tdd-london-chicago**: Apply both London and Chicago school TDD approaches - understanding different TDD philosophies and choosing the right testing style
- **pair-programming**: AI-assisted pair programming with multiple modes (driver/navigator/switch), real-time verification, quality monitoring
- **verification-quality**: Comprehensive truth scoring, code quality verification, and automatic rollback system with 0.95 accuracy threshold
- **xp-practices**: Apply XP practices including pair programming, ensemble programming, continuous integration, and sustainable pace

### AgentDB Skills (5 skills)
- **agentdb-advanced**: Master advanced AgentDB features including QUIC synchronization, multi-database management, custom distance metrics, hybrid search
- **agentdb-learning**: Create and train AI learning plugins with AgentDB's 9 reinforcement learning algorithms (Decision Transformer, Q-Learning, SARSA, Actor-Critic)
- **agentdb-memory-patterns**: Implement persistent memory patterns for AI agents using AgentDB (session memory, long-term storage, pattern learning)
- **agentdb-optimization**: Optimize AgentDB performance with quantization (4-32x memory reduction), HNSW indexing (150x faster search), caching
- **agentdb-vector-search**: Implement semantic vector search with AgentDB for intelligent document retrieval, similarity matching, and context-aware querying

### Using Skills

#### Via CLI
\`\`\`bash
# List all available skills
aqe skills list

# Search for specific skills
aqe skills search "testing"

# Show skill details
aqe skills show agentic-quality-engineering

# Show skill statistics
aqe skills stats
\`\`\`

#### Via Skill Tool in Claude Code
\`\`\`javascript
// Execute a skill
Skill("agentic-quality-engineering")
Skill("tdd-london-chicago")
Skill("api-testing-patterns")
\`\`\`

#### Integration with Agents
All QE agents automatically have access to relevant skills based on their specialization:
- **Test generators** use: agentic-quality-engineering, api-testing-patterns, tdd-london-chicago
- **Coverage analyzers** use: agentic-quality-engineering, quality-metrics, risk-based-testing
- **Flaky test hunters** use: agentic-quality-engineering, exploratory-testing-advanced
- **Performance testers** use: agentic-quality-engineering, performance-testing, quality-metrics
- **Security scanners** use: agentic-quality-engineering, security-testing, risk-based-testing

## 🧠 Q-Learning Integration (Phase 2)

All agents automatically learn from task execution through Q-learning:

### Observability
\`\`\`bash
# Check learning status
aqe learn status --agent test-gen

# View learned patterns
aqe learn history --agent test-gen --limit 50

# Export learning data
aqe learn export --agent test-gen --output learning.json
\`\`\`

### Pattern Management
\`\`\`bash
# List test patterns
aqe patterns list --framework jest

# Search patterns
aqe patterns search "api validation"

# Extract patterns from tests
aqe patterns extract ./tests --framework jest
\`\`\`

### Improvement Loop
\`\`\`bash
# Start continuous improvement
aqe improve start

# Check improvement status
aqe improve status

# Run single improvement cycle
aqe improve cycle
\`\`\`

## 📚 Documentation

- **Agent Definitions**: \`.claude/agents/\` - 18 specialized QE agents
- **Skills**: \`.claude/skills/\` - 17 specialized QE skills for agents
- **Fleet Config**: \`.agentic-qe/config/fleet.json\`
- **Routing Config**: \`.agentic-qe/config/routing.json\` (Multi-Model Router settings)
- **AQE Hooks Config**: \`.agentic-qe/config/aqe-hooks.json\` (zero dependencies, 100-500x faster)

## 🔧 Advanced Usage

### Parallel Agent Execution

\`\`\`javascript
// Execute multiple agents concurrently
Task("Test Generation", "Generate unit tests", "qe-test-generator")
Task("Coverage Analysis", "Analyze current coverage", "qe-coverage-analyzer")
Task("Security Scan", "Run security checks", "qe-security-scanner")
Task("Performance Test", "Load test critical paths", "qe-performance-tester")
\`\`\`

### Agent Coordination Example

\`\`\`javascript
// Test generator stores results
Task("Generate tests", "Create tests and store in memory at aqe/test-plan/generated", "qe-test-generator")

// Test executor reads from memory
Task("Execute tests", "Read test plan from aqe/test-plan/generated and execute", "qe-test-executor")

// Coverage analyzer processes results
Task("Analyze coverage", "Check coverage from aqe/coverage/results", "qe-coverage-analyzer")
\`\`\`

## 💡 Best Practices

1. **Use Task Tool**: Claude Code's Task tool is the primary way to spawn agents
2. **Batch Operations**: Always spawn multiple related agents in a single message
3. **Memory Keys**: Use the \`aqe/*\` namespace for agent coordination
4. **AQE Hooks**: Agents automatically use native AQE hooks for coordination (100-500x faster)
5. **Parallel Execution**: Leverage concurrent agent execution for speed

## 🆘 Troubleshooting

### Check MCP Connection
\`\`\`bash
claude mcp list
\`\`\`

### View Agent Definitions
\`\`\`bash
ls -la .claude/agents/
\`\`\`

### Check Fleet Status
\`\`\`bash
aqe status --verbose
\`\`\`

### View Logs
\`\`\`bash
tail -f .agentic-qe/logs/fleet.log
\`\`\`

---

**Generated by**: Agentic QE Fleet v1.3.1
**Initialization Date**: 2025-10-24T13:08:19.486Z
**Fleet Topology**: hierarchical

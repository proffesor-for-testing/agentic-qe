# Agentic QE Fleet - Usage Guide

Complete guide for using the Agentic QE Fleet in your projects.

## Quick Start

### Installation

```bash
npm install agentic-qe-cf --save-dev
```

### Initialization

```bash
# Initialize AQE in your project
npx aqe init

# This creates:
# - .claude/agents/       (19 QE agents)
# - .claude/skills/       (41 QE skills)
# - .claude/commands/     (8 slash commands)
# - .agentic-qe/config/   (fleet configuration)
# - .agentic-qe/db/       (learning databases)
# - CLAUDE.md             (project configuration)
```

---

## Using Agents via Claude Code Task Tool

**Recommended Method:** Use Claude Code's Task tool for spawning agents.

### Single Agent Execution

```javascript
Task("Generate tests", "Create comprehensive test suite for UserService", "qe-test-generator")
```

### Parallel Agent Execution

```javascript
// Execute multiple agents concurrently
Task("Test Generation", "Generate unit tests", "qe-test-generator")
Task("Coverage Analysis", "Analyze current coverage", "qe-coverage-analyzer")
Task("Security Scan", "Run security checks", "qe-security-scanner")
Task("Performance Test", "Load test critical paths", "qe-performance-tester")
```

### Agent Coordination Example

```javascript
// Step 1: Test generator stores results
Task("Generate tests", "Create tests and store in memory at aqe/test-plan/generated", "qe-test-generator")

// Step 2: Test executor reads from memory
Task("Execute tests", "Read test plan from aqe/test-plan/generated and execute", "qe-test-executor")

// Step 3: Coverage analyzer processes results
Task("Analyze coverage", "Check coverage from aqe/coverage/results", "qe-coverage-analyzer")
```

---

## Using MCP Tools

### Check MCP Connection

```bash
claude mcp list
# Should show: agentic-qe: npm run mcp:start - ✓ Connected
```

### Tool Discovery System (New in v2.1.0)

The MCP server uses **lazy loading** to reduce initial context by 87%.

#### Discover Available Domains

```javascript
// List all available tool domains
mcp__agentic_qe__tools_discover()

// Returns:
// {
//   domains: [
//     "security", "coverage", "test-generation", "test-execution",
//     "quality-gates", "fleet-management", "memory", "learning",
//     "patterns", "reporting"
//   ]
// }
```

#### Load Domain-Specific Tools

```javascript
// Load security tools (4 tools)
mcp__agentic_qe__tools_load_domain({ domain: "security" })

// Load coverage tools (3 tools)
mcp__agentic_qe__tools_load_domain({ domain: "coverage" })

// Load test generation tools (2 tools)
mcp__agentic_qe__tools_load_domain({ domain: "test-generation" })
```

#### Automatic Loading

Tools are **auto-loaded based on keywords** in agent instructions:

```javascript
// Keyword "security" triggers auto-load of security domain
Task("Security scan", "Run security checks for vulnerabilities", "qe-security-scanner")

// Keyword "coverage" triggers auto-load of coverage domain
Task("Coverage analysis", "Find coverage gaps in UserService", "qe-coverage-analyzer")

// Keyword "generate" triggers auto-load of test-generation domain
Task("Generate tests", "Create unit tests for API endpoints", "qe-test-generator")
```

**Recognized Keywords:**
- **security**: security, vulnerability, sast, dast, owasp
- **coverage**: coverage, gaps, untested, branches
- **test-generation**: generate, create tests, test suite
- **test-execution**: execute, run tests, parallel
- **quality-gates**: quality, gate, threshold, deployment
- **fleet-management**: fleet, agents, orchestrate, swarm
- **memory**: memory, store, retrieve, namespace
- **learning**: learn, patterns, q-learning, improve
- **patterns**: patterns, extract, search, templates
- **reporting**: report, metrics, dashboard, export

### Using MCP Tools in Claude Code

```javascript
// Test generation
mcp__agentic_qe__test_generate({ type: "unit", framework: "jest" })

// Test execution
mcp__agentic_qe__test_execute({ parallel: true, coverage: true })

// Quality analysis
mcp__agentic_qe__quality_analyze({ scope: "full" })
```

---

## Using CLI Commands

### Quick Commands

```bash
# Generate tests
aqe test <module-name>

# Analyze coverage
aqe coverage

# Run quality gate
aqe quality

# Check fleet status
aqe status
```

### Learning System Commands

```bash
# Check learning status
aqe learn status --agent test-gen

# View learned patterns
aqe learn history --agent test-gen --limit 50

# Export learning data
aqe learn export --agent test-gen --output learning.json
```

### Pattern Management

```bash
# List test patterns
aqe patterns list --framework jest

# Search patterns
aqe patterns search "api validation"

# Extract patterns from tests
aqe patterns extract ./tests --framework jest
```

### Improvement Loop

```bash
# Start continuous improvement
aqe improve start

# Check improvement status
aqe improve status

# Run single improvement cycle
aqe improve cycle
```

---

## Using Slash Commands

### Available Commands

- `/aqe-execute` - Execute test suites with parallel orchestration
- `/aqe-generate` - Generate comprehensive test suites
- `/aqe-coverage` - Analyze test coverage
- `/aqe-quality` - Run quality gate validation
- `/aqe-optimize` - Optimize test suites using sublinear algorithms
- `/aqe-report` - Generate quality engineering reports
- `/aqe-analyze` - Analyze coverage gaps
- `/aqe-fleet-status` - Display fleet health and metrics

### Example Usage

```bash
# In Claude Code chat
/aqe-generate
/aqe-execute
/aqe-coverage
```

---

## Using Skills

### Via CLI

```bash
# List all available skills
aqe skills list

# Search for specific skills
aqe skills search "testing"

# Show skill details
aqe skills show agentic-quality-engineering

# Show skill statistics
aqe skills stats
```

### Via Skill Tool in Claude Code

```javascript
// Execute a skill
Skill("agentic-quality-engineering")
Skill("tdd-london-chicago")
Skill("api-testing-patterns")
```

---

## Agent Coordination

All agents coordinate through **AQE hooks** (zero external dependencies, 100-500x faster than shell hooks).

### Automatic Lifecycle Hooks

Agents extend `BaseAgent` and override lifecycle methods:

```typescript
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
```

### Performance Comparison

| Feature | AQE Hooks | External Hooks |
|---------|-----------|----------------|
| **Speed** | <1ms | 100-500ms |
| **Dependencies** | Zero | External package |
| **Type Safety** | Full TypeScript | Shell strings |
| **Integration** | Direct API | Shell commands |
| **Performance** | 100-500x faster | Baseline |

---

## Memory Namespace

Agents share state through the **`aqe/*` memory namespace**:

- `aqe/test-plan/*` - Test planning and requirements
- `aqe/coverage/*` - Coverage analysis and gaps
- `aqe/quality/*` - Quality metrics and gates
- `aqe/performance/*` - Performance test results
- `aqe/security/*` - Security scan findings
- `aqe/swarm/coordination` - Cross-agent coordination

---

## Fleet Configuration

Configuration is stored in `.agentic-qe/config/fleet.json`:

```json
{
  "topology": "hierarchical",
  "maxAgents": 10,
  "testingFocus": ["unit", "integration"],
  "environments": ["development"],
  "frameworks": ["jest"]
}
```

### Topology Options

- **hierarchical** - Queen-led coordination with specialized workers
- **mesh** - Peer-to-peer with distributed decision making
- **ring** - Circular coordination pattern
- **star** - Centralized hub-and-spoke

---

## Multi-Model Router

**Status:** Disabled by default (opt-in)

Provides **70-81% cost savings** by intelligently selecting AI models based on task complexity.

### Enabling Routing

**Option 1: Via Configuration**
```json
// .agentic-qe/config/routing.json
{
  "multiModelRouter": {
    "enabled": true
  }
}
```

**Option 2: Via Environment Variable**
```bash
export AQE_ROUTING_ENABLED=true
```

### Model Selection Rules

| Task Complexity | Model | Est. Cost | Use Case |
|----------------|-------|-----------|----------|
| **Simple** | GPT-3.5 | $0.0004 | Unit tests, basic validation |
| **Moderate** | GPT-3.5 | $0.0008 | Integration tests, mocks |
| **Complex** | GPT-4 | $0.0048 | Property-based, edge cases |
| **Critical** | Claude Sonnet 4.5 | $0.0065 | Security, architecture review |

### Monitoring Costs

```bash
# View cost dashboard
aqe routing dashboard

# Export cost report
aqe routing report --format json

# Check savings
aqe routing stats
```

---

## Streaming Progress

**Status:** Enabled by default

Real-time progress updates for long-running operations using AsyncGenerator pattern.

### Example Usage

```javascript
// Using streaming MCP tool
const handler = new TestExecuteStreamHandler();

for await (const event of handler.execute(params)) {
  if (event.type === 'progress') {
    console.log(`Progress: ${event.percent}% - ${event.message}`);
  } else if (event.type === 'result') {
    console.log('Completed:', event.data);
  }
}
```

### Supported Operations

- ✅ Test execution (test-by-test progress)
- ✅ Coverage analysis (incremental gap detection)
- ⚠️  Test generation (coming soon)
- ⚠️  Security scanning (coming soon)

---

## Q-Learning Integration

All agents automatically learn from task execution through Q-learning.

### Observability

```bash
# Check learning status
aqe learn status --agent test-gen

# View learned patterns
aqe learn history --agent test-gen --limit 50

# Export learning data
aqe learn export --agent test-gen --output learning.json
```

### Pattern Management

```bash
# List test patterns
aqe patterns list --framework jest

# Search patterns
aqe patterns search "api validation"

# Extract patterns from tests
aqe patterns extract ./tests --framework jest
```

### Improvement Loop

```bash
# Start continuous improvement
aqe improve start

# Check improvement status
aqe improve status

# Run single improvement cycle
aqe improve cycle
```

---

## Best Practices

1. **Use Task Tool**: Claude Code's Task tool is the primary way to spawn agents
2. **Batch Operations**: Always spawn multiple related agents in a single message
3. **Memory Keys**: Use the `aqe/*` namespace for agent coordination
4. **AQE Hooks**: Agents automatically use native AQE hooks for coordination (100-500x faster)
5. **Parallel Execution**: Leverage concurrent agent execution for speed

---

## Troubleshooting

### Check MCP Connection

```bash
claude mcp list
# Should show: agentic-qe: npm run mcp:start - ✓ Connected
```

### View Agent Definitions

```bash
ls -la .claude/agents/
# Should show 18 agent markdown files
```

### Check Fleet Status

```bash
aqe status --verbose
```

### View Logs

```bash
tail -f .agentic-qe/logs/fleet.log
```

### Verify Databases

```bash
# Check database files exist
ls -la .agentic-qe/db/

# Query database
node -e "const db = require('better-sqlite3')('.agentic-qe/db/memory.db'); console.log('Tables:', db.prepare('SELECT name FROM sqlite_master WHERE type=\"table\"').all()); db.close();"
```

---

## Common Workflows

### Full Test Generation and Execution

```javascript
// 1. Generate tests
Task("Generate tests", "Create comprehensive test suite for UserService", "qe-test-generator")

// 2. Execute tests
Task("Execute tests", "Run generated tests with coverage", "qe-test-executor")

// 3. Analyze coverage
Task("Analyze coverage", "Find coverage gaps", "qe-coverage-analyzer")

// 4. Run quality gate
Task("Quality check", "Validate against quality thresholds", "qe-quality-gate")
```

### Security and Performance Validation

```javascript
// Run in parallel
Task("Security scan", "SAST/DAST security checks", "qe-security-scanner")
Task("Performance test", "Load test with 1000 users", "qe-performance-tester")
Task("API contract check", "Validate API contracts", "qe-api-contract-validator")
```

### Flaky Test Detection and Stabilization

```javascript
Task("Hunt flaky tests", "Detect and stabilize flaky tests with ML", "qe-flaky-test-hunter")
```

---

**Related Documentation:**
- [Agent Reference](agents.md) - All 19 QE agents
- [Skills Reference](skills.md) - All 41 QE skills

**Related Policies:**
- [Release Verification Policy](../policies/release-verification.md)
- [Test Execution Policy](../policies/test-execution.md)
- [Git Operations Policy](../policies/git-operations.md)

# MCP Integration Guide - Agentic QE with Claude Code

This guide shows how to integrate Agentic QE with Claude Code via the Model Context Protocol (MCP), enabling you to orchestrate QE agents directly from Claude Code's CLI.

## What is MCP Integration?

**Model Context Protocol (MCP)** connects Agentic QE with Claude Code, allowing Claude to:
- Spawn and coordinate QE agents
- Execute test generation, analysis, and validation tasks
- Access real-time fleet status and metrics
- Orchestrate complex testing workflows

## Prerequisites

### Required
- **Claude Code**: Install from [claude.ai/code](https://claude.ai/code)
- **Agentic QE**: `npm install -g agentic-qe`
- **Node.js**: 18.0 or higher

### Optional (Advanced Coordination)
- **Claude Flow**: `npm install -g @claude/flow`

## Installation & Setup

### Step 1: Install Agentic QE

```bash
# Global installation (recommended)
npm install -g agentic-qe

# Or local development
git clone https://github.com/proffesor-for-testing/agentic-qe.git
cd agentic-qe
npm install
npm run build
npm link
```

### Step 2: Add MCP Server to Claude Code

Add the Agentic QE MCP server to your Claude Code configuration:

```bash
# Using npx (recommended)
claude mcp add agentic-qe npx -y agentic-qe mcp:start

# Or using global installation
claude mcp add agentic-qe agentic-qe mcp:start

# Or for local development
claude mcp add agentic-qe node /path/to/agentic-qe/dist/mcp/start.js
```

### Step 3: Verify MCP Connection

```bash
# Check MCP servers
claude mcp list

# You should see:
# - agentic-qe (connected)
```

### Step 4: Initialize AQE in Your Project

```bash
cd your-project
aqe init
```

This creates:
- `.claude/agents/` - 16 specialized QE agent definitions
- `.claude/commands/` - 8 AQE slash commands
- `.agentic-qe/` - Configuration directory
- `CLAUDE.md` - Integration documentation

## Using AQE from Claude Code CLI

### Basic Workflow Example

```bash
# Start Claude Code in your project
cd your-project

# Ask Claude to use AQE agents
claude "Initialize AQE fleet with mesh topology and generate comprehensive tests for src/services/user-service.ts"
```

**What happens:**
1. Claude Code connects to AQE MCP server
2. MCP server initializes fleet with mesh topology
3. Test generator agent analyzes user-service.ts
4. Generates comprehensive test suite
5. Returns results to Claude Code

### Available MCP Tools

When Claude Code connects to AQE, it gets access to these MCP tools:

#### Fleet Management
- `mcp__agentic_qe__fleet_init` - Initialize QE fleet with topology
- `mcp__agentic_qe__fleet_status` - Get fleet health and agent status
- `mcp__agentic_qe__agent_spawn` - Spawn specialized QE agent
- `mcp__agentic_qe__agent_list` - List active agents

#### Test Operations
- `mcp__agentic_qe__test_generate` - Generate test suites
- `mcp__agentic_qe__test_execute` - Execute tests with orchestration
- `mcp__agentic_qe__optimize_tests` - Optimize test suites (O(log n))

#### Quality Analysis
- `mcp__agentic_qe__quality_analyze` - Analyze quality metrics
- `mcp__agentic_qe__predict_defects` - AI-powered defect prediction

#### Task Orchestration
- `mcp__agentic_qe__task_orchestrate` - Orchestrate complex QE tasks

## Real-World Use Cases

### Use Case 1: Complete Test Suite Generation

**Goal**: Generate comprehensive tests for a new feature

```bash
claude "
Initialize AQE fleet with hierarchical topology.
Generate comprehensive test suite for src/features/payment-processing.ts including:
- Unit tests with 95% coverage
- Integration tests for payment gateway
- Edge cases (network failures, invalid cards, refunds)
- Performance tests for high-volume transactions
Execute tests and provide quality report.
"
```

**Behind the scenes:**
1. MCP tool: `fleet_init` → Creates hierarchical fleet
2. MCP tool: `agent_spawn` → Spawns test-generator agent
3. MCP tool: `test_generate` → Generates test suites
4. MCP tool: `test_execute` → Runs tests in parallel
5. MCP tool: `quality_analyze` → Analyzes results

**Expected output:**
```
🚀 Fleet initialized: hierarchical topology, 8 agents
🧠 Test Generator analyzing payment-processing.ts...

📝 Generated Test Suites:
   ✓ Unit tests: 32 tests (97% coverage)
   ✓ Integration tests: 12 tests
   ✓ Edge cases: 18 tests
   ✓ Performance tests: 5 scenarios

🧪 Executing 67 tests across 4 workers...
   ✓ All tests passed (8.3s)

📊 Quality Report:
   Coverage: 97%
   Quality Score: 95/100
   Risk Level: LOW
   ✅ Ready for deployment
```

### Use Case 2: CI/CD Quality Gate

**Goal**: Validate pull request before merge

```bash
claude "
Initialize AQE fleet.
For the current PR:
1. Generate tests for changed files
2. Execute full test suite with coverage
3. Run security scan
4. Analyze code quality
5. Provide go/no-go decision with quality gate
"
```

**Behind the scenes:**
1. MCP tool: `fleet_init` → Initializes fleet
2. MCP tool: `test_generate` → Tests for changed files
3. MCP tool: `test_execute` → Full test execution
4. MCP tool: `agent_spawn` (security-scanner) → Security scan
5. MCP tool: `quality_analyze` → Comprehensive analysis
6. MCP tool: `agent_spawn` (quality-gate) → Final decision

**Expected output:**
```
🚀 Fleet initialized: 12 agents active

📋 PR Analysis: feat/user-authentication
   Changed files: 8

🧪 Test Results:
   ✓ 156 tests passed (12.4s)
   Coverage: 94% (target: 95%)

🔒 Security Scan:
   ✓ No critical vulnerabilities
   ⚠ 2 medium vulnerabilities (dependencies)

📊 Quality Analysis:
   Code Quality: 88/100
   Complexity: Low
   Maintainability: High

🚦 Quality Gate Decision: ⚠ WARNING
   Recommendation: Address coverage gap in auth-service.ts
   Action: Request changes
```

### Use Case 3: Flaky Test Detection

**Goal**: Identify and fix flaky tests

```bash
claude "
Initialize AQE fleet.
Spawn flaky-test-hunter agent.
Analyze test suite for flaky tests by running each test 50 times.
For detected flaky tests:
- Identify root causes
- Suggest fixes
- Generate stabilized versions
"
```

**Behind the scenes:**
1. MCP tool: `fleet_init` → Initializes fleet
2. MCP tool: `agent_spawn` (flaky-test-hunter) → Specialized agent
3. MCP tool: `test_execute` → 50 iterations per test
4. Agent analyzes timing patterns, dependencies, race conditions
5. Agent generates fix recommendations

**Expected output:**
```
🚀 Fleet initialized
🕵️ Flaky Test Hunter: Analyzing 234 tests...

🔍 Running stability analysis (50 iterations each)...
   Progress: 234/234 tests analyzed

📊 Flaky Test Report:

   FLAKY TEST 1: user-service.test.ts:42
   ├─ Failure rate: 12% (6/50 runs)
   ├─ Root cause: Race condition in async mock
   ├─ Pattern: Fails when test runs < 50ms
   └─ Fix: Add await + flush promises

   FLAKY TEST 2: api-integration.test.ts:78
   ├─ Failure rate: 8% (4/50 runs)
   ├─ Root cause: Shared test database state
   ├─ Pattern: Fails after cart-service tests
   └─ Fix: Isolate database per test

   FLAKY TEST 3: payment.test.ts:156
   ├─ Failure rate: 4% (2/50 runs)
   ├─ Root cause: Network timeout (mock server)
   ├─ Pattern: Fails on slow CI runners
   └─ Fix: Increase timeout from 1s to 5s

✅ Generated stabilized versions in tests/stabilized/

📈 Stability Improvement:
   Before: 87% reliable
   After: 100% reliable (projected)
```

### Use Case 4: Performance Testing & Optimization

**Goal**: Load test API and identify bottlenecks

```bash
claude "
Initialize AQE fleet.
Spawn performance-tester agent.
Load test API endpoints:
- /api/users (GET): 1000 RPS for 5 minutes
- /api/orders (POST): 500 RPS for 5 minutes
Identify performance bottlenecks.
Provide optimization recommendations.
"
```

**Expected output:**
```
🚀 Fleet initialized
⚡ Performance Tester: Configuring load tests...

📊 Load Test Configuration:
   Duration: 5 minutes
   Scenarios:
   - GET /api/users: 1000 RPS (300k requests)
   - POST /api/orders: 500 RPS (150k requests)

🧪 Running load tests...

   GET /api/users:
   ├─ Requests: 300,000
   ├─ Success: 99.8%
   ├─ Avg latency: 45ms
   ├─ P95 latency: 120ms
   ├─ P99 latency: 380ms
   └─ Throughput: 998 RPS

   POST /api/orders:
   ├─ Requests: 150,000
   ├─ Success: 97.2%
   ├─ Avg latency: 230ms
   ├─ P95 latency: 890ms
   ├─ P99 latency: 2.4s ⚠
   └─ Throughput: 486 RPS

🔍 Bottleneck Analysis:

   CRITICAL: Database connection pool saturation
   ├─ Location: orders-service.ts:78
   ├─ Issue: Pool size (10) insufficient for load
   ├─ Impact: 2.8% request failures, high P99 latency
   └─ Fix: Increase pool size to 50

   WARNING: N+1 query in user lookup
   ├─ Location: orders-service.ts:124
   ├─ Issue: 1 query per order item (avg 4 items)
   ├─ Impact: 180ms added latency
   └─ Fix: Use JOIN or dataloader pattern

💡 Optimization Recommendations:
   1. Increase DB pool: 10 → 50 connections
      Expected improvement: -60% P99 latency
   2. Fix N+1 query with batch loading
      Expected improvement: -78% avg latency
   3. Add Redis cache for user lookups
      Expected improvement: +40% throughput
```

### Use Case 5: AI-Powered Defect Prediction

**Goal**: Predict which files are most likely to have bugs

```bash
claude "
Initialize AQE fleet.
Analyze recent commits and predict defect probability for all changed files.
Focus on files with >70% defect probability.
Generate additional tests for high-risk files.
"
```

**Expected output:**
```
🚀 Fleet initialized
🤖 Defect Prediction: Analyzing git history...

📊 Defect Probability Analysis:

   HIGH RISK (>70% probability):

   ├─ payment-gateway.ts (87% probability)
   │  ├─ Reasons: Complex logic, 12 recent changes, low test coverage
   │  ├─ Historical bugs: 5 in last 3 months
   │  └─ Recommendation: Add 15+ tests

   ├─ user-auth.ts (76% probability)
   │  ├─ Reasons: Security-critical, async complexity
   │  ├─ Historical bugs: 3 in last 2 months
   │  └─ Recommendation: Add edge case tests

   MEDIUM RISK (40-70%):

   ├─ order-service.ts (58%)
   ├─ email-sender.ts (45%)

   LOW RISK (<40%):

   ├─ utils/logger.ts (12%)
   ├─ config/constants.ts (5%)

🧪 Generating additional tests for high-risk files...
   ✓ payment-gateway.test.ts: +18 tests
   ✓ user-auth.test.ts: +12 tests

📈 Risk Reduction:
   Before: 2 files at HIGH risk
   After: 0 files at HIGH risk
   Coverage: 74% → 92%
```

## Claude Code CLI Commands

### Initialize Fleet
```bash
claude "Initialize AQE fleet with mesh topology and 20 max agents"
```

### Generate Tests
```bash
claude "Generate comprehensive tests for src/services/ with 95% coverage target"
```

### Run Quality Analysis
```bash
claude "Analyze code quality for current PR and provide detailed report"
```

### Execute Test Suite
```bash
claude "Execute all tests with parallel workers and generate coverage report"
```

### Orchestrate Complex Workflow
```bash
claude "
1. Generate tests for changed files in current PR
2. Execute full test suite with coverage
3. Run security scan
4. Analyze performance impact
5. Provide comprehensive quality gate decision
"
```

## MCP Tools Reference

### Fleet Management

#### fleet_init
```typescript
{
  topology: "hierarchical" | "mesh" | "ring" | "star",
  maxAgents: number, // default: 50
  config: {
    environments: string[],  // ["node", "browser"]
    frameworks: string[],    // ["jest", "mocha", "cypress"]
    testingFocus: string[]   // ["unit", "integration", "e2e"]
  }
}
```

#### agent_spawn
```typescript
{
  type: "test-generator" | "coverage-analyzer" | "quality-gate" | ...,
  capabilities: string[],  // ["jest", "typescript", "async"]
  fleetId?: string
}
```

### Test Operations

#### test_generate
```typescript
{
  spec: {
    type: "unit" | "integration" | "e2e",
    sourceCode: {
      repositoryUrl: string,
      language: string,
      testPatterns: string[]  // ["**/*.ts"]
    },
    coverageTarget: number,  // 95
    synthesizeData: boolean,  // true
    frameworks: string[]     // ["jest"]
  }
}
```

#### test_execute
```typescript
{
  spec: {
    testSuites: string[],  // ["./tests/**/*.test.ts"]
    parallelExecution: boolean,  // true
    retryCount: number,         // 3
    timeoutSeconds: number,     // 300
    environments: string[],     // ["node"]
    reportFormat: "junit" | "tap" | "json"
  }
}
```

### Quality Analysis

#### quality_analyze
```typescript
{
  params: {
    scope: "code" | "tests" | "performance" | "security" | "all",
    metrics: string[],  // ["coverage", "complexity", "duplication"]
    thresholds: {
      coverage: number,      // 95
      complexity: number,    // 10
      duplication: number    // 3
    }
  },
  dataSource: {
    testResults: string,
    codeMetrics: string,
    performanceData: string
  }
}
```

## Troubleshooting

### MCP Server Not Connecting

```bash
# Check if MCP server is registered
claude mcp list

# Remove and re-add
claude mcp remove agentic-qe
claude mcp add agentic-qe npx -y agentic-qe mcp:start

# Check logs
tail -f ~/.claude/logs/mcp-agentic-qe.log
```

### Agents Not Spawning

```bash
# Verify AQE initialization
aqe init

# Check agent definitions exist
ls .claude/agents/

# Test agent spawn manually
aqe status
```

### Build Issues

```bash
# Rebuild MCP server
cd agentic-qe
npm run clean
npm run build

# Verify dist/mcp/start.js exists
ls -la dist/mcp/start.js
```

## Advanced Configuration

### Custom MCP Server Config

Create `.agentic-qe/mcp-config.json`:

```json
{
  "server": {
    "name": "agentic-qe",
    "version": "1.0.0",
    "logLevel": "info",
    "maxConnections": 10
  },
  "fleet": {
    "defaultTopology": "mesh",
    "maxAgents": 50,
    "agentTimeout": 300000,
    "retryAttempts": 3
  },
  "capabilities": {
    "frameworks": ["jest", "mocha", "cypress", "playwright"],
    "languages": ["typescript", "javascript"],
    "testTypes": ["unit", "integration", "e2e", "performance"]
  }
}
```

### Environment Variables

```bash
# MCP Server Configuration
export AQE_MCP_LOG_LEVEL=debug
export AQE_MCP_MAX_AGENTS=100
export AQE_MCP_TIMEOUT=600000

# Test Execution
export AQE_PARALLEL_WORKERS=8
export AQE_TEST_TIMEOUT=60000
export AQE_COVERAGE_THRESHOLD=95
```

## Best Practices

### 1. Fleet Topology Selection

- **Mesh**: Best for distributed teams, high reliability
- **Hierarchical**: Best for large fleets (20+ agents), clear structure
- **Ring**: Best for sequential workflows, event chains
- **Star**: Best for centralized control, single coordinator

### 2. Agent Spawning

- Spawn agents on-demand, not preemptively
- Reuse agents for similar tasks
- Set appropriate timeouts for long-running tasks

### 3. Test Execution

- Use parallel execution for large test suites
- Enable retry logic for flaky tests
- Set realistic coverage targets (95% recommended)

### 4. Memory Management

- Fleet scales automatically based on load
- Each agent has 512MB default memory limit
- Monitor fleet status for resource bottlenecks

## Resources

- **Documentation**: [docs/](../README.md)
- **API Reference**: [docs/api/](../api/index.html)
- **Examples**: [examples/](../../examples/)
- **GitHub**: [github.com/proffesor-for-testing/agentic-qe](https://github.com/proffesor-for-testing/agentic-qe)
- **MCP Specification**: [modelcontextprotocol.io](https://modelcontextprotocol.io)

## Next Steps

1. ✅ [Complete this MCP integration guide](MCP-INTEGRATION.md)
2. 📖 [Read Test Generation Guide](TEST-GENERATION.md)
3. 🚀 [Learn about Fleet Coordination](../architecture/FLEET-ARCHITECTURE.md)
4. 🔧 [Configure CI/CD Integration](../development/CI-CD-INTEGRATION.md)
5. 💬 [Join Community Discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)

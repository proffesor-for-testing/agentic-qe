# Getting Started with Agentic QE

Welcome! This guide will help you get up and running with Agentic Quality Engineering (AQE) in minutes.

## What is Agentic QE?

Agentic QE is an AI-powered testing system that automatically generates, executes, and optimizes your test suites. It uses intelligent agents to achieve high coverage with minimal manual effort.

**Key Benefits:**
- 🤖 AI-powered test generation
- ⚡ Parallel test execution
- 📊 Real-time coverage analysis
- 🎯 95% coverage target (automatically)
- 🚀 O(log n) performance algorithms

## Prerequisites

Before using Agentic QE, you must have:

### Required
- **Claude Code**: Install from [claude.ai/code](https://claude.ai/code)
- **Node.js**: 18.0 or higher
- **npm**: 8.0 or higher

### Installation Steps
1. Install Claude Code globally or in your workspace
2. Install Agentic QE:
   ```bash
   npm install -g agentic-qe
   ```
3. Add AQE MCP server to Claude Code:
   ```bash
   claude mcp add agentic-qe npx -y agentic-qe mcp:start
   ```
4. (Optional) Install Claude Flow for advanced coordination:
   ```bash
   npm install -g @claude/flow
   ```
5. Verify MCP connection:
   ```bash
   claude mcp list
   # You should see: agentic-qe (connected)
   ```

**Agent Execution:**
- Agents are executed through Claude Code's Task tool OR via MCP tools
- Agent definitions are located in `.claude/agents/`
- MCP integration enables Claude to orchestrate agents directly

📖 **For detailed MCP setup and examples, see [MCP Integration Guide](MCP-INTEGRATION.md)**

---

## Quick Start (5 Minutes)

### Step 1: Install

From your project root:

```bash
cd agentic-qe
npm install
npm run build
```

### Step 2: Initialize AQE Fleet

```bash
aqe init
```

This sets up the AI agent fleet that powers automated testing.

**What it does:**
- Creates `.claude/agents/` with 16 specialized QE agent definitions
- Creates `.claude/commands/` with 8 AQE slash commands
- Creates `.agentic-qe/` configuration directory
- Updates or creates `CLAUDE.md` with integration documentation
- **Note**: Agents are executed through Claude Code's Task tool, not as standalone processes

**Agent Execution Model:**
- Agents are Claude Code agent definitions (markdown files in `.claude/agents/`)
- Executed via Claude Code's Task tool: `Task("description", "prompt", "agent-type")`
- NOT standalone Node.js processes
- Integration with Claude Code via MCP (Model Context Protocol)

### Step 3: Generate Your First Tests

Let's generate tests for a file:

```bash
aqe generate src/services/user-service.ts
```

**What happens:**
- AI analyzes your code
- Generates comprehensive test cases
- Creates tests for edge cases automatically
- Outputs to `./tests/unit/services/user-service.test.ts`

**Expected output:**
```
🚀 Initializing test generation for src/services/user-service.ts...
🧠 Analyzing source code...
📝 Generating test cases...
   ✓ Generated 12 unit tests
   ✓ Generated 5 integration tests
   ✓ Generated 3 edge case tests
✅ Test generation completed successfully!
   Tests: 20
   Coverage: 96%
   Output: ./tests/unit
```

### Step 4: Run Your Tests

```bash
aqe run
```

**What happens:**
- Executes all tests in parallel
- Collects coverage data
- Retries flaky tests automatically
- Shows real-time progress

**Expected output:**
```
🧪 Executing test suite: ./tests
⚡ Using 8 parallel workers
🚀 Starting test execution...

Running tests:
  ✓ tests/unit/user-service.test.ts (20 tests)

📊 Execution Summary:
   Total: 20
   Passed: 20
   Failed: 0
   Coverage: 96%
   Duration: 3.2s

✅ All tests passed!
```

### Step 5: Check Coverage

```bash
aqe analyze coverage
```

**What happens:**
- Analyzes test coverage using AI
- Identifies gaps in coverage
- Suggests improvements
- Uses O(log n) algorithms for speed

**Expected output:**
```
📊 Analyzing coverage...
🔍 Running sublinear coverage analysis...

📈 Coverage Analysis Results:
   Current Coverage: 96%
   Threshold: 95%
   Total Gaps: 2
   Critical Gaps: 0

🎯 Coverage Gaps:
   - src/services/user-service.ts:142-148 (error handling)

💡 Recommendations:
   1. Add error handling test for edge case

✅ Coverage above threshold! Excellent work.
```

## Your First Workflow

Here's a complete workflow for a new feature:

### Scenario: Adding Authentication

**Step 1: Write your code**
```bash
# Create your new feature file
touch src/services/auth-service.ts
# (implement your authentication logic)
```

**Step 2: Generate tests automatically**
```bash
aqe generate src/services/auth-service.ts --coverage 95
```

**Step 3: Run tests**
```bash
aqe run tests/unit/services/auth-service.test.ts --coverage
```

**Step 4: Check for gaps**
```bash
aqe analyze gaps --path src/services/auth-service.ts
```

**Step 5: Fill gaps automatically**
```bash
# AQE will suggest specific tests to add
aqe generate src/services/auth-service.ts --coverage 98
```

**Step 6: Optimize (optional)**
```bash
# Remove redundant tests, improve efficiency
aqe optimize suite --path tests/unit/services
```

## Common Commands

### Test Generation
```bash
# Generate unit tests
aqe generate src/services/payment.ts

# Generate E2E tests from API spec
aqe generate src/api --type e2e --swagger api-spec.yaml

# Generate with property-based testing
aqe generate src/utils --property-based
```

### Test Execution
```bash
# Run all tests
aqe run

# Run specific suite with 8 workers
aqe run tests/integration --parallel 8

# Watch mode (for TDD)
aqe run --watch
```

### Coverage Analysis
```bash
# Basic coverage check
aqe analyze coverage

# Find gaps
aqe analyze gaps --threshold 95

# Show trends over time
aqe analyze trends --baseline coverage-baseline.json
```

### Fleet Management
```bash
# Check agent status
aqe status

# Detailed metrics
aqe status --detailed

# Watch mode (live monitoring)
aqe status --watch
```

## Understanding Test Types

### Unit Tests
Tests individual functions/methods in isolation.

```bash
aqe generate src/utils/validators.ts --type unit
```

**When to use:** Testing business logic, utilities, pure functions

### Integration Tests
Tests how components work together.

```bash
aqe generate src/services --type integration
```

**When to use:** Testing API endpoints, database interactions, service layers

### E2E Tests
Tests complete user workflows.

```bash
aqe generate src/features --type e2e --framework cypress
```

**When to use:** Testing critical user journeys, UI flows

## Troubleshooting

### Tests Not Generating

**Problem:** `aqe generate` returns no tests

**Solutions:**
1. Check file path exists: `ls src/services/your-file.ts`
2. Ensure file has exported functions/classes
3. Try with explicit framework: `--framework jest`

### Low Coverage

**Problem:** Coverage below target

**Solutions:**
1. Analyze gaps: `aqe analyze gaps`
2. Generate missing tests: `aqe generate <file> --coverage 98`
3. Check for untested error paths

### Tests Failing

**Problem:** Generated tests are failing

**Solutions:**
1. Review test logic in generated files
2. Update mocks/fixtures if needed
3. Re-generate with more context: `aqe generate --type unit --property-based`

### Slow Execution

**Problem:** Tests take too long

**Solutions:**
1. Use parallel execution: `aqe run --parallel 8`
2. Optimize suite: `aqe optimize performance --budget 300`
3. Run specific suites: `aqe run tests/unit`

## Next Steps

Now that you're up and running:

1. **Learn test generation patterns** → Read [TEST-GENERATION.md](./TEST-GENERATION.md)
2. **Master parallel execution** → Read [TEST-EXECUTION.md](./TEST-EXECUTION.md)
3. **Deep dive into coverage** → Read [COVERAGE-ANALYSIS.md](./COVERAGE-ANALYSIS.md)
4. **Set up quality gates** → Read [QUALITY-GATES.md](./QUALITY-GATES.md)
5. **Performance testing** → Read [PERFORMANCE-TESTING.md](./PERFORMANCE-TESTING.md)

## Need Help?

- **Documentation:** `/workspaces/agentic-qe-cf/agentic-qe/docs/`
- **Examples:** `/workspaces/agentic-qe-cf/agentic-qe/examples/`
- **Agent Definitions:** `/workspaces/agentic-qe-cf/.claude/agents/qe-*.md`

## Quick Reference Card

```bash
# Initialize
aqe init                    # Set up AQE fleet

# Generate Tests
aqe generate <file>         # Generate tests for file
aqe generate <dir>          # Generate tests for directory

# Execute Tests
aqe run                     # Run all tests
aqe run <suite>             # Run specific suite
aqe run --watch             # Watch mode

# Analyze Coverage
aqe analyze coverage        # Check coverage
aqe analyze gaps            # Find coverage gaps

# Optimize
aqe optimize suite          # Optimize test suite

# Monitor
aqe status                  # Check fleet status
aqe status --detailed       # Detailed metrics

# Help
aqe help                    # Show all commands
```

Happy testing! 🚀

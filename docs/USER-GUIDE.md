# Agentic QE Fleet - User Guide

## Getting Started

This guide will help you get up and running with Agentic QE Fleet quickly.

### Prerequisites

- **Node.js** 18.0 or higher
- **npm** 8.0 or higher
- **Claude Code** (optional, for MCP integration)

### Installation

```bash
# Global installation (recommended)
npm install -g agentic-qe

# Verify installation
aqe --version
```

### Initialize Your Project

```bash
cd your-project
aqe init
```

This creates:
- `.claude/agents/` - 16 specialized QE agent definitions
- `.claude/commands/` - 8 AQE slash commands
- `.agentic-qe/` - Configuration directory
- `CLAUDE.md` - Integration documentation

## Basic Workflows

### 1. Test Generation

Generate comprehensive test suites for your code:

```bash
# Generate tests for a single file
aqe test src/services/user-service.ts

# Generate tests with specific coverage target
aqe test src/services/user-service.ts --coverage 95

# Generate tests with specific framework
aqe test src/services/*.ts --framework jest --coverage 90
```

**What happens:**
1. The `qe-test-generator` agent analyzes your code
2. AI-powered test creation identifies edge cases
3. Property-based tests are generated automatically
4. Tests are saved to `tests/` directory

### 2. Test Execution

Run tests with intelligent orchestration:

```bash
# Execute all tests
aqe execute

# Execute with parallel processing
aqe execute --parallel --workers 4

# Execute with coverage
aqe execute --coverage --threshold 90
```

**Features:**
- Parallel test execution across multiple workers
- Retry logic for flaky tests (3 retries by default)
- Real-time progress reporting
- Comprehensive result summaries

### 3. Coverage Analysis

Analyze and optimize test coverage:

```bash
# Analyze coverage with gap detection
aqe coverage

# Analyze with specific threshold
aqe coverage --threshold 95

# Generate detailed coverage report
aqe coverage --report html
```

**Output includes:**
- Overall coverage percentage
- Coverage gaps by file
- Prioritized gap recommendations
- Visual coverage reports

### 4. Quality Gates

Run comprehensive quality validation:

```bash
# Run quality gate check
aqe quality

# With custom thresholds
aqe quality --coverage 90 --complexity 10

# Export quality report
aqe quality --export report.json
```

**Quality checks include:**
- Code coverage thresholds
- Cyclomatic complexity
- Security vulnerabilities
- Performance benchmarks
- Test reliability

### 5. Fleet Management

Monitor and manage your QE agent fleet:

```bash
# Check fleet status
aqe status

# View detailed fleet information
aqe fleet status --verbose

# Monitor fleet in real-time
aqe fleet monitor --interval 5s
```

## Common Use Cases

### Use Case 1: Adding Tests to Legacy Code

```bash
# Step 1: Initialize AQE in your project
cd legacy-project
aqe init

# Step 2: Generate tests for high-risk modules first
aqe test src/core/payment-processor.ts --coverage 95

# Step 3: Review generated tests
cat tests/core/payment-processor.test.ts

# Step 4: Execute tests to verify
aqe execute tests/core/payment-processor.test.ts

# Step 5: Iterate on coverage gaps
aqe coverage src/core/payment-processor.ts
```

### Use Case 2: CI/CD Integration

```yaml
# .github/workflows/quality-check.yml
name: Quality Check

on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install AQE
        run: npm install -g agentic-qe

      - name: Initialize AQE
        run: aqe init

      - name: Run Quality Gate
        run: aqe quality --coverage 90 --exit-code

      - name: Upload Coverage Report
        uses: actions/upload-artifact@v3
        with:
          name: coverage-report
          path: coverage/
```

### Use Case 3: Performance Testing

```bash
# Run performance benchmarks
aqe benchmark --suite load-test

# Performance test with custom configuration
aqe benchmark \
  --type load \
  --users 100 \
  --duration 300s \
  --ramp-up 30s
```

### Use Case 4: Security Scanning

```bash
# Run comprehensive security scan
aqe security scan --depth deep

# Scan with specific focus
aqe security scan --type sast,dast,dependency
```

## Advanced Features

### Multi-Agent Coordination

Use multiple agents for complex workflows:

```bash
# Orchestrate comprehensive QE workflow
aqe fleet orchestrate \
  --agents test-generator,test-executor,coverage-analyzer \
  --task "comprehensive-qa-pipeline"
```

### Custom Agent Configuration

Create custom agent configurations in `.agentic-qe/config.json`:

```json
{
  "fleet": {
    "maxAgents": 20,
    "topology": "mesh"
  },
  "agents": {
    "test-generator": {
      "targetCoverage": 95,
      "framework": "jest",
      "testStyle": "property-based"
    },
    "test-executor": {
      "maxParallelTests": 8,
      "retryCount": 3,
      "timeout": 300000
    }
  }
}
```

### Memory System

Agents share state and learning via the memory system:

```bash
# View shared memory
aqe memory query --namespace aqe

# Store custom configuration
aqe memory store --key "aqe/config/coverage-target" --value "95"

# Backup memory state
aqe memory backup --export memory-backup.json
```

## Troubleshooting

### Common Issues

#### Issue: Tests are not being generated

**Symptoms:**
- `aqe test` command completes but no tests are created
- Error: "No testable code found"

**Solutions:**
1. Verify file paths are correct
2. Check that files contain exportable functions/classes
3. Ensure supported file extensions (.ts, .js, .jsx, .tsx)

```bash
# Debug mode for more information
aqe test src/service.ts --verbose
```

#### Issue: Agent execution failures

**Symptoms:**
- "Agent failed to start" errors
- Timeout errors

**Solutions:**
1. Check system resources (memory, CPU)
2. Reduce concurrent agents: `aqe config set --key fleet.maxAgents --value 10`
3. Increase timeouts: `aqe config set --key agent.timeout --value 600000`

#### Issue: MCP connection problems

**Symptoms:**
- "Cannot connect to MCP server"
- Claude Code integration not working

**Solutions:**
1. Verify MCP server is added: `claude mcp list`
2. Restart Claude Code
3. Check MCP server logs: `~/.claude/logs/mcp-agentic-qe.log`
4. Re-add MCP server: `claude mcp add agentic-qe npx -y agentic-qe mcp:start`

#### Issue: High memory usage

**Symptoms:**
- Process running out of memory
- "JavaScript heap out of memory" errors

**Solutions:**
1. Reduce parallel workers: `aqe execute --workers 1`
2. Execute tests in batches: `aqe execute tests/unit/ && aqe execute tests/integration/`
3. Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096" aqe execute`

## Best Practices

### 1. Start with Critical Modules

Focus test generation on high-risk code first:
- Payment processing
- Authentication/authorization
- Data validation
- API endpoints

### 2. Set Realistic Coverage Targets

Don't aim for 100% coverage immediately:
- **Critical modules**: 95%+
- **Business logic**: 85%+
- **Utilities**: 80%+
- **UI components**: 70%+

### 3. Use Quality Gates in CI/CD

Enforce quality standards automatically:
```bash
aqe quality --coverage 85 --exit-code
```

### 4. Monitor Fleet Health

Regularly check agent performance:
```bash
aqe fleet status --export metrics.json
```

### 5. Leverage AI Insights

Review AI-generated recommendations:
- Test case suggestions
- Coverage gap priorities
- Security vulnerability patterns

## Next Steps

- **Configuration Guide**: [CONFIGURATION.md](./CONFIGURATION.md)
- **Troubleshooting Guide**: [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- **API Reference**: [API.md](./API.md)
- **MCP Integration**: [guides/MCP-INTEGRATION.md](./guides/MCP-INTEGRATION.md)

## Getting Help

- **GitHub Issues**: [Report bugs or request features](https://github.com/proffesor-for-testing/agentic-qe/issues)
- **Discussions**: [Ask questions and share experiences](https://github.com/proffesor-for-testing/agentic-qe/discussions)
- **Documentation**: [Complete docs](https://github.com/proffesor-for-testing/agentic-qe#readme)

## Quick Reference

### Essential Commands

```bash
aqe init                    # Initialize AQE in project
aqe test <file>             # Generate tests
aqe execute                 # Run tests
aqe coverage                # Analyze coverage
aqe quality                 # Run quality gate
aqe status                  # Check fleet status
aqe help                    # Show all commands
```

### Common Options

```bash
--verbose                   # Detailed output
--coverage <number>         # Coverage target (0-100)
--parallel                  # Enable parallel execution
--workers <number>          # Number of parallel workers
--timeout <ms>              # Operation timeout
--exit-code                 # Exit with code 1 on failure
```

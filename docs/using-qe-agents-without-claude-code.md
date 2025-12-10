# Using QE Agents Without Claude Code

This guide explains how to use Agentic QE agents independently of Claude Code through CLI, MCP server, or programmatic APIs.

---

## Overview

QE agents can be used **without Claude Code** in 4 main ways:

1. **CLI Interface** - Command-line operations
2. **MCP Server** - For any MCP-compatible client
3. **Programmatic API** - TypeScript/JavaScript integration
4. **Direct Agent Import** - Most granular control

---

## 1. CLI Interface (Standalone)

The `aqe` CLI provides full fleet management without Claude Code:

```bash
# Start the fleet daemon
aqe start --daemon

# Check fleet status
aqe status

# Manage workflows
aqe workflow list
aqe workflow pause <workflow-id>
aqe workflow cancel <workflow-id>

# Manage learning
aqe learn status
aqe patterns list

# Run memory operations
aqe memory query --namespace "qe/patterns"

# Configuration management
aqe config show
aqe config set <key> <value>

# Debug and troubleshoot
aqe debug logs
aqe debug agents
```

### Available CLI Commands

| Command | Description |
|---------|-------------|
| `aqe init` | Initialize the AQE Fleet |
| `aqe start` | Start the AQE Fleet |
| `aqe status` | Show fleet status |
| `aqe workflow` | Manage QE workflows |
| `aqe config` | Manage configuration |
| `aqe debug` | Debug and troubleshoot |
| `aqe memory` | Manage memory state |
| `aqe routing` | Multi-Model Router management |
| `aqe learn` | Agent learning management |
| `aqe patterns` | Test patterns in QEReasoningBank |
| `aqe skills` | Manage Claude Code Skills |
| `aqe improve` | Continuous improvement loop |
| `aqe telemetry` | Query telemetry data |
| `aqe quantization` | Vector quantization settings |
| `aqe constitution` | Quality constitutions |

---

## 2. MCP Server (For Any MCP-Compatible Client)

Start the MCP server standalone to expose 50+ QE tools:

```bash
# Start MCP server standalone
aqe-mcp

# Or with npx
npx agentic-qe mcp
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `QE_FLEET_INIT` | Initialize the fleet |
| `QE_AGENT_SPAWN` | Spawn specific agents |
| `QE_TEST_GENERATE` | Generate tests |
| `QE_TEST_EXECUTE` | Execute tests |
| `QE_TEST_EXECUTE_PARALLEL` | Parallel test execution |
| `QE_COVERAGE_ANALYZE` | Analyze coverage |
| `QE_COVERAGE_GAPS_DETECT` | Detect coverage gaps |
| `QE_QUALITY_GATE_EVALUATE` | Quality gate decisions |
| `QE_FLAKY_TEST_DETECT` | Detect flaky tests |
| `QE_SECURITY_SCAN` | Security scanning |
| `QE_PERFORMANCE_BENCHMARK` | Performance testing |
| `QE_DEPLOYMENT_READINESS` | Deployment decisions |
| `QE_API_CONTRACT_VALIDATE` | Contract validation |
| `QE_MEMORY_STORE` | Store in memory |
| `QE_MEMORY_RETRIEVE` | Retrieve from memory |
| `QE_MEMORY_QUERY` | Query memory |
| `QE_WORKFLOW_CREATE` | Create workflows |
| `QE_WORKFLOW_EXECUTE` | Execute workflows |

### Using with Other MCP Clients

Any MCP-compatible client can connect to the AQE MCP server:

```json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "npx",
      "args": ["agentic-qe", "mcp"]
    }
  }
}
```

---

## 3. Programmatic TypeScript/JavaScript API

### Option A: FleetManager for Full Orchestration

```typescript
import { FleetManager } from 'agentic-qe/core/FleetManager';
import { Task, TaskPriority } from 'agentic-qe/core/Task';
import { Config } from 'agentic-qe/utils/Config';
import { Logger } from 'agentic-qe/utils/Logger';

async function useFleetManager() {
  const logger = Logger.getInstance();
  const config = await Config.load();

  // Create and initialize fleet
  const fleetManager = new FleetManager(config);
  await fleetManager.initialize();
  await fleetManager.start();

  // Submit tasks
  const tasks = [
    new Task(
      'unit-test',
      'Run Unit Tests',
      {
        testPath: './tests/unit',
        framework: 'jest',
        pattern: '**/*.test.js'
      },
      {},
      TaskPriority.HIGH
    ),
    new Task(
      'code-analysis',
      'Analyze Code Quality',
      {
        sourcePath: './src',
        language: 'typescript'
      },
      {},
      TaskPriority.MEDIUM
    ),
    new Task(
      'security-scan',
      'Security Vulnerability Scan',
      {
        sourcePath: './src',
        depth: 'comprehensive'
      },
      {},
      TaskPriority.HIGH
    )
  ];

  for (const task of tasks) {
    await fleetManager.submitTask(task);
    logger.info(`Submitted task: ${task.getName()}`);
  }

  // Monitor status
  const status = fleetManager.getStatus();
  console.log('Fleet Status:', {
    activeAgents: status.activeAgents,
    totalAgents: status.totalAgents,
    runningTasks: status.runningTasks,
    completedTasks: status.completedTasks
  });

  // Cleanup
  await fleetManager.stop();
}
```

### Option B: QEAgentFactory for Individual Agents

```typescript
import { QEAgentFactory } from 'agentic-qe/agents';
import { EventBus } from 'agentic-qe/core/EventBus';
import { MemoryManager } from 'agentic-qe/core/MemoryManager';

async function useAgentFactory() {
  const eventBus = new EventBus();
  const memoryStore = new MemoryManager();

  const factory = new QEAgentFactory({
    eventBus,
    memoryStore,
    context: { projectRoot: process.cwd() }
  });

  // Create specific agent
  const testGenerator = await factory.createAgent('test-generator', {
    frameworks: ['jest', 'playwright'],
    coverageTarget: 80
  });

  // Execute agent task
  const result = await testGenerator.execute({
    type: 'generate-tests',
    target: './src/services/UserService.ts'
  });

  console.log('Generated tests:', result);
}
```

---

## 4. Direct Agent Import (Most Granular)

Import and use agents directly for maximum control:

```typescript
import { TestGeneratorAgent } from 'agentic-qe/agents/TestGeneratorAgent';
import { TestExecutorAgent } from 'agentic-qe/agents/TestExecutorAgent';
import { CoverageAnalyzerAgent } from 'agentic-qe/agents/CoverageAnalyzerAgent';
import { QualityGateAgent } from 'agentic-qe/agents/QualityGateAgent';
import { FlakyTestHunterAgent } from 'agentic-qe/agents/FlakyTestHunterAgent';
import { SecurityScannerAgent } from 'agentic-qe/agents/SecurityScannerAgent';
import { EventBus } from 'agentic-qe/core/EventBus';
import { getSharedMemoryManager } from 'agentic-qe/core/memory/MemoryManagerFactory';

async function useAgentDirectly() {
  const memoryStore = await getSharedMemoryManager('.agentic-qe/memory.db');
  const eventBus = new EventBus();

  // Create TestExecutor agent
  const executor = new TestExecutorAgent({
    type: 'test-executor',
    capabilities: ['jest', 'mocha', 'playwright'],
    context: { projectRoot: process.cwd() },
    memoryStore,
    eventBus,
    frameworks: ['jest'],
    maxParallelTests: 8,
    timeout: 300000,
    retryAttempts: 3,
    enableLearning: true
  });

  // Execute tests
  const result = await executor.execute({
    type: 'execute-tests',
    testPath: './tests',
    pattern: '**/*.test.ts'
  });

  console.log('Test Results:', result);
}
```

---

## Available Agents (19 Total)

| Agent Class | Type | Use Case |
|-------------|------|----------|
| `TestGeneratorAgent` | test-generator | Generate tests with AI |
| `TestExecutorAgent` | test-executor | Run tests in parallel |
| `CoverageAnalyzerAgent` | coverage-analyzer | Sublinear coverage analysis |
| `QualityGateAgent` | quality-gate | Pass/fail decisions |
| `QualityAnalyzerAgent` | quality-analyzer | Code quality metrics |
| `FleetCommanderAgent` | fleet-commander | Coordinate 50+ agents |
| `FlakyTestHunterAgent` | flaky-test-hunter | Detect flaky tests |
| `RegressionRiskAnalyzerAgent` | regression-risk | Predict regressions |
| `SecurityScannerAgent` | security-scanner | SAST/DAST scanning |
| `PerformanceTesterAgent` | performance-tester | Load testing |
| `DeploymentReadinessAgent` | deployment-readiness | Go/no-go decisions |
| `ApiContractValidatorAgent` | api-contract | Contract testing |
| `TestDataArchitectAgent` | test-data | Generate test data |
| `RequirementsValidatorAgent` | requirements | Testability scoring |
| `ProductionIntelligenceAgent` | production-intel | RUM analysis |
| `QXPartnerAgent` | qx-partner | Quality experience |

---

## Complete Example: Standalone Test Runner

Create a file `standalone-test-runner.ts`:

```typescript
#!/usr/bin/env npx tsx

/**
 * Standalone Test Runner - No Claude Code Required
 *
 * Run with: npx tsx standalone-test-runner.ts
 */

import { TestExecutorAgent } from 'agentic-qe/agents';
import { CoverageAnalyzerAgent } from 'agentic-qe/agents';
import { QualityGateAgent } from 'agentic-qe/agents';
import { EventBus } from 'agentic-qe/core/EventBus';
import { getSharedMemoryManager } from 'agentic-qe/core/memory/MemoryManagerFactory';

async function runTestsStandalone() {
  console.log('🚀 Starting Standalone QE Test Runner\n');

  // Initialize shared resources
  const memoryStore = await getSharedMemoryManager('.agentic-qe/memory.db');
  const eventBus = new EventBus();

  const baseConfig = {
    context: { projectRoot: process.cwd() },
    memoryStore,
    eventBus,
    enableLearning: true
  };

  // 1. Execute Tests
  console.log('📋 Phase 1: Executing Tests...');
  const executor = new TestExecutorAgent({
    ...baseConfig,
    type: 'test-executor',
    capabilities: ['jest'],
    frameworks: ['jest'],
    maxParallelTests: 8,
    timeout: 300000,
    retryAttempts: 3
  });

  const testResults = await executor.execute({
    type: 'execute-tests',
    testPath: './tests',
    pattern: '**/*.test.ts'
  });
  console.log('✅ Tests completed:', testResults.summary);

  // 2. Analyze Coverage
  console.log('\n📊 Phase 2: Analyzing Coverage...');
  const coverageAgent = new CoverageAnalyzerAgent(
    { id: 'coverage-1', type: 'coverage-analyzer', created: new Date() },
    memoryStore
  );

  const coverageResults = await coverageAgent.analyze({
    sourcePath: './src',
    coverageData: testResults.coverage
  });
  console.log('✅ Coverage:', coverageResults.summary);

  // 3. Quality Gate
  console.log('\n🚦 Phase 3: Quality Gate Evaluation...');
  const qualityGate = new QualityGateAgent(
    { id: 'gate-1', type: 'quality-gate', created: new Date() },
    memoryStore
  );

  const gateResult = await qualityGate.evaluate({
    testResults,
    coverageResults,
    thresholds: {
      coverage: 80,
      passRate: 95,
      maxFlaky: 5
    }
  });

  console.log('\n' + '='.repeat(50));
  console.log(`Quality Gate: ${gateResult.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('='.repeat(50));

  return gateResult;
}

// Run
runTestsStandalone()
  .then(result => process.exit(result.passed ? 0 : 1))
  .catch(err => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
```

Run with:
```bash
npx tsx standalone-test-runner.ts
```

---

## Feature Comparison: Claude Code vs Standalone

| Feature | With Claude Code | Standalone |
|---------|-----------------|------------|
| LLM reasoning | Full AI reasoning | Rule-based only |
| Test generation | AI-generated | Template-based |
| Pattern learning | AI-enhanced | Statistical only |
| Natural language | Supported | Not supported |
| MCP tools | All 50+ tools | All 50+ tools |
| Agent coordination | AI-orchestrated | Manual/scripted |
| Memory/Learning | Full ReasoningBank | Full ReasoningBank |
| Fleet management | Automatic | Manual |

### Key Insight

The agents work fully without Claude Code, but **AI-powered features** (like intelligent test generation, natural language processing, and adaptive learning) require an LLM backend. The core functionality—test execution, coverage analysis, quality gates—works entirely standalone.

---

## Integration Examples

### CI/CD Pipeline (GitHub Actions)

```yaml
name: QE Pipeline
on: [push, pull_request]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Initialize AQE Fleet
        run: npx agentic-qe init -y

      - name: Start Fleet
        run: npx agentic-qe start --daemon

      - name: Run Tests with QE
        run: npx tsx scripts/qe-test-runner.ts

      - name: Check Quality Gate
        run: npx agentic-qe status --json | jq '.qualityGate'
```

### Docker Container

```dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Install AQE globally
RUN npm install -g agentic-qe

# Initialize fleet
RUN aqe init -y

COPY . .

# Run QE pipeline
CMD ["aqe", "start"]
```

---

## Learn More

- **Examples**: `/examples/` directory in the repository
- **API Reference**: `/docs/API.md`
- **MCP Tools**: `/docs/MCP-TOOLS.md`
- **Agent Architecture**: `/docs/Agentic-QE-Fleet-Specification.md`

---

**Version**: 2.3.3
**Last Updated**: 2025-12-10

# Agentic QE Framework

> AI-powered Quality Engineering framework with autonomous testing agents built on top of Claude Code and Claude-Flow

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Required-purple.svg)](https://claude.ai/code)
[![Claude Flow](https://img.shields.io/badge/Claude%20Flow-Required-orange.svg)](https://github.com/ruvnet/claude-flow)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Overview

The Agentic QE Framework is a cutting-edge quality engineering platform that leverages AI-powered autonomous agents to revolutionize software testing. Built with TypeScript and following Claude-Flow's architectural patterns, it provides intelligent test automation, execution, and analysis capabilities.

## 🚀 Features

- **Autonomous AI Agents**: Specialized testing agents for different quality dimensions
- **Smart Test Orchestration**: Intelligent distribution and parallel execution
- **Memory Management**: Persistent session and cross-agent memory
- **Event-Driven Hooks**: Extensible lifecycle and event handling
- **Multi-Environment Support**: Flexible configuration for different test environments
- **Comprehensive Reporting**: Rich reporting with multiple output formats
- **CLI Integration**: Full command-line interface for automation
- **TypeScript First**: Fully typed with comprehensive type definitions

## 🏗️ Architecture

```
├── src/
│   ├── agents/           # AI testing agents
│   ├── cli/              # Command-line interface
│   ├── commands/         # CLI commands
│   ├── hooks/            # Event-driven hooks system
│   ├── memory/           # Memory management
│   ├── types/            # TypeScript definitions
│   ├── utils/            # Utility functions
│   └── index.ts          # Main framework entry
├── tests/                # Test suites
├── docs/                 # Documentation
├── scripts/              # Utility scripts
├── bin/                  # CLI binary
└── examples/             # Usage examples
```

## 📋 Prerequisites

### 1. Claude Code (Required)
The Agentic QE Framework requires Claude Code for AI agent execution:
- Install Claude desktop app from [claude.ai](https://claude.ai)
- Create a `CLAUDE.md` file in your project root to configure Claude Code
- This file enables Claude Code features for your project

### 2. Claude-Flow (Required)
Claude-Flow provides the orchestration and coordination layer:
```bash
# Install Claude-Flow MCP server
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Verify installation
npx claude-flow@alpha --version
```

### 3. Node.js 18+
```bash
node --version  # Should be v18.0.0 or higher
```

## 🛠️ Installation

### Option 1: NPM Package (Recommended)
```bash
# Install globally
npm install -g agentic-qe

# Or use with npx (no installation needed)
npx agentic-qe --version

# Now you can use aqe anywhere
aqe --version
```

### Option 2: Install from GitHub
```bash
# Clone the repository
git clone https://github.com/proffesor-for-testing/agentic-qe.git
cd agentic-qe

# Install dependencies and build
npm install
npm run build

# Link globally for development
npm link

# Now you can use aqe anywhere
aqe --version
```

## 🎉 Breaking News: Agents Now Fully Working!

**✅ AI-powered agents are now providing real analysis!** The framework has been fixed to properly execute agents through Claude Code, delivering:
- Real risk assessments with scoring and predictions
- Comprehensive test strategies and prioritization
- Security vulnerability detection
- Code quality analysis
- And much more!

**✅ Automatic output capture implemented!** All agent outputs are saved as:
- JSON reports in `reports/agents/[agent-name]/`
- Markdown reports for human review
- Execution logs in `logs/executions/`

See the [Agent Execution Success Guide](./docs/AGENT_EXECUTION_SUCCESS.md) and [Output Capture Guide](./docs/OUTPUT_CAPTURE_GUIDE.md) for details.

## 🎯 Quick Start

### Step 1: Verify Prerequisites
```bash
# Check prerequisites (if installed from npm)
aqe check

# Or run the check script (if cloned from GitHub)
./scripts/check-prerequisites.sh

# Verify Claude-Flow is installed:
npx claude-flow@alpha --version
# If not installed, run: claude mcp add claude-flow npx claude-flow@alpha mcp start

# Initialize Claude-Flow swarm (one-time setup)
npx claude-flow@alpha swarm init --topology mesh --max-agents 10
```

### Step 2: Initialize AQE Framework
```bash
# Create a new project directory
mkdir my-qe-project
cd my-qe-project

# Create CLAUDE.md to enable Claude Code (optional but recommended)
echo "# Claude Code Configuration" > CLAUDE.md

# Initialize the framework (copies 48 agents to your project)
aqe init

# Or with interactive setup
aqe init -i
```

**What `aqe init` does:**
- ✅ Copies 48 pre-built QE agents to your `agents/` directory
- 📁 Creates `.claude/` integration directory with agent docs
- 📖 Adds documentation to `docs/` folder
- ⚙️ Creates `qe.config.json` configuration file

### Step 3: Verify Installation
```bash
# Check complete system status
aqe status

# List all 48 available agents
aqe list

# Run your first agent
aqe spawn --agents risk-oracle --task "Analyze my project"
```

### Basic Usage

```typescript
import { QEFramework, TestSuite } from 'agentic-qe';

// Initialize framework
const framework = new QEFramework();
await framework.initialize();

// Create test session
const sessionId = await framework.createSession({
  name: 'API Testing Session',
  environment: 'staging'
});

// Define test suite
const testSuite: TestSuite = {
  id: 'api-tests',
  name: 'API Test Suite',
  tests: [
    {
      id: 'health-check',
      name: 'API Health Check',
      type: 'api',
      priority: 'high',
      steps: [
        {
          id: 'step-1',
          order: 1,
          action: 'GET /health',
          expectedResult: 'Status 200'
        }
      ],
      expectedResults: [],
      status: 'pending',
      retryCount: 0,
      tags: ['api', 'health']
    }
  ],
  // ... configuration
};

// Execute tests with AI agents
await framework.executeTestSuite(sessionId, testSuite, {
  agentTypes: ['api-tester'],
  parallel: 2
});
```

### CLI Commands

```bash
# Run tests
aqe run --suite api-tests --env staging

# Manage agents
aqe agent list
aqe agent spawn --type performance-tester

# Generate reports
aqe report --type html --session <session-id>

# Health check
aqe doctor
```

## 🤖 Available Agent Types

| Agent Type | Capabilities | Use Case |
|------------|-------------|----------|
| `test-planner` | Test generation, Risk assessment | Test strategy and planning |
| `test-executor` | Test execution, Bug detection | General test execution |
| `api-tester` | API validation, Contract testing | REST/GraphQL API testing |
| `ui-tester` | UI automation, Visual comparison | Web/Mobile UI testing |
| `performance-tester` | Load simulation, Performance monitoring | Performance and load testing |
| `security-tester` | Security scanning, Vulnerability assessment | Security testing |
| `accessibility-tester` | Accessibility validation | A11y compliance testing |
| `chaos-tester` | Chaos engineering | Resilience testing |

## 📊 Memory System

The framework includes a sophisticated memory system for agent coordination:

```typescript
// Store test data
await memory.store({
  key: 'test-data',
  value: { apiKey: 'secret', baseUrl: 'https://api.example.com' },
  type: 'test-data',
  sessionId: 'session-123',
  tags: ['api', 'credentials']
});

// Query memory
const results = await memory.query({
  sessionId: 'session-123',
  type: 'test-data',
  tags: ['api']
});
```

## 🪝 Hooks System

Extend functionality with lifecycle hooks:

```typescript
import { createHook } from 'agentic-qe';

// Custom hook for Slack notifications
const slackNotifier = createHook(
  'slack-notifier',
  ['test-end', 'session-end'],
  async (event) => {
    if (event.type === 'test-end') {
      await sendSlackMessage(`Test ${event.testId} completed`);
    }
  }
);

hooks.register(slackNotifier);
```

## 🔧 Configuration

Create a `qe.config.js` file:

```javascript
module.exports = {
  environment: {
    name: 'development',
    baseUrl: 'http://localhost:3000'
  },
  agents: {
    maxConcurrent: 5,
    timeout: 30000
  },
  memory: {
    persistPath: '.qe-memory',
    maxEntries: 10000
  },
  reporting: {
    formats: ['html', 'json'],
    outputDir: './reports'
  },
  hooks: {
    enabled: true
  }
};
```

## 📈 Reporting

Generate comprehensive test reports:

```bash
# HTML report
aqe report --type html --output ./reports/test-report.html

# JSON for CI/CD integration
aqe report --type json --output ./reports/results.json

# PDF executive summary
aqe report --type pdf --output ./reports/executive-summary.pdf
```

## 🧪 Testing

```bash
# Run framework tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

## 🏗️ Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Development mode
npm run dev

# Lint code
npm run lint

# Type check
npm run typecheck
```

## 🔧 Troubleshooting

### Common Issues

#### "Command not found: aqe"
- Ensure you've run `npm link` in the agentic-qe directory
- Try using the full path: `/path/to/agentic-qe/bin/aqe`

#### "No agents found"
- Run `aqe init` first to copy all agents to your project
- Check that `agents/` directory exists with 48 agent folders
- Run `aqe status` to verify your setup

### "Claude Code not configured"
- Create a `CLAUDE.md` file in your project root
- This file enables Claude Code features for your project

### "Claude-Flow initialization failed"
- Install Claude-Flow MCP: `claude mcp add claude-flow npx claude-flow@alpha mcp start`
- Initialize swarm: `npx claude-flow@alpha swarm init --topology mesh`

#### "No agents found"
- Run `aqe init` first to create the agents directory
- Check that agent YAML files are in the `agents/` directory

#### "Task execution timeout"
- Ensure Claude Code is running and accessible
- Check that Claude-Flow MCP server is active
- Verify with: `npx claude-flow@alpha swarm status`

## 🤝 How It Works

The Agentic QE Framework operates as a three-layer system:

1. **Claude Code Layer** (Execution Engine)
   - Provides the AI agent runtime
   - Executes agent tasks using LLM capabilities
   - Handles tool calls and file operations

2. **Claude-Flow Layer** (Orchestration)
   - Manages swarm coordination
   - Handles parallel agent execution
   - Provides memory persistence and hooks
   - Enables inter-agent communication

3. **AQE Framework Layer** (Quality Engineering)
   - Defines specialized QE agents
   - Provides CLI interface
   - Manages test workflows
   - Generates reports and metrics

```
┌─────────────────────────────────┐
│     Agentic QE Framework        │  <- QE-specific agents & workflows
├─────────────────────────────────┤
│       Claude-Flow MCP           │  <- Orchestration & coordination
├─────────────────────────────────┤
│        Claude Code              │  <- AI agent execution engine
└─────────────────────────────────┘
```

## 📚 Documentation

- [Installation Guide](./docs/INSTALLATION_GUIDE.md) - Detailed setup instructions
- [Agent Execution Success Guide](./docs/AGENT_EXECUTION_SUCCESS.md) - **✅ AGENTS WORKING!** See real examples
- [Output Capture Guide](./docs/OUTPUT_CAPTURE_GUIDE.md) - How to find agent outputs
- [API Documentation](./docs/api.md)
- [Agent Development Guide](./docs/agents.md)
- [Hook System Guide](./docs/hooks.md)
- [Configuration Reference](./docs/configuration.md)
- [Examples](./examples/)
- [Evidence of Agent Runs](./docs/EVIDENCE_OF_AGENT_RUNS.md) - Test results and logs

## 🗺️ Roadmap

- [ ] Visual testing with AI image comparison
- [ ] Natural language test generation
- [ ] Integration with popular testing frameworks
- [ ] Cloud-based agent orchestration
- [ ] Advanced analytics and ML insights
- [ ] Multi-language support (Python, Java)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Claude-Flow](https://github.com/ruvnet/claude-flow) architecture patterns
- Powered by [Winston](https://github.com/winstonjs/winston) for logging
- Uses [Commander.js](https://github.com/tj/commander.js) for CLI
- TypeScript definitions inspired by modern testing frameworks

---

**Made with ❤️ by the Agentic QE Team**
# Agentic QE Framework

> AI-powered Quality Engineering framework with autonomous testing agents built on top of Claude Code and Claude-Flow

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Required-purple.svg)](https://claude.ai/code)
[![Claude Flow](https://img.shields.io/badge/Claude%20Flow-Enhanced-orange.svg)](https://github.com/ruvnet/claude-flow)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](./tests/)
[![Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)](./docs/PERFORMANCE_GUIDE.md)
[![Performance](https://img.shields.io/badge/performance-2--3x%20faster-green.svg)](./docs/ENHANCED_FEATURES.md)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

## Overview

The Agentic QE Framework is a cutting-edge quality engineering platform that leverages AI-powered autonomous agents to revolutionize software testing. Built with TypeScript and enhanced with Claude-Flow's architectural patterns, it provides intelligent test automation, execution, and analysis capabilities with **2-3x performance improvements** through advanced coordination and parallel processing.

## 🚀 Enhanced Features

### Core Capabilities
- **48 Autonomous AI Agents**: Specialized testing agents for comprehensive quality dimensions
- **Enhanced Test Orchestration**: AsyncOperationQueue for 2-3x faster parallel execution
- **Advanced Memory System**: Distributed memory with cross-session persistence
- **Event-Driven Hooks**: Extensible lifecycle with Claude-Flow integration
- **Multi-Environment Support**: Flexible configuration with environment-specific optimizations
- **Intelligent Reporting**: AI-generated insights with stakeholder-specific views
- **Full CLI Integration**: Complete command-line interface with interactive modes
- **TypeScript First**: Fully typed with comprehensive type definitions

### Performance Enhancements
- **AsyncOperationQueue**: Batched operations for optimal throughput
- **BatchProcessor**: Bulk operation handling with intelligent queuing
- **QE Coordinator**: Phase-based execution with quality gates
- **Performance Monitoring**: Real-time metrics and bottleneck detection
- **Resource Optimization**: Smart memory management and cleanup

### Advanced Coordination
- **Claude-Flow Integration**: Seamless swarm coordination and neural patterns
- **Neural AI Training**: Pattern learning from test execution history
- **Quality Gates**: Automated quality enforcement with configurable thresholds
- **Risk Assessment**: Predictive analysis with ML-based risk scoring
- **Session Management**: Persistent sessions with checkpoint/restore capabilities

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

## 🎉 Enhanced Performance & Features!

**✅ 2-3x Performance Improvement!** The framework now includes Claude-Flow enhancements delivering:
- AsyncOperationQueue for batched parallel execution
- BatchProcessor for optimized bulk operations
- Enhanced memory system with distributed coordination
- QE Coordinator with intelligent phase management
- Performance monitoring with real-time bottleneck detection

**✅ Advanced AI Capabilities!** Enhanced agents now provide:
- Neural pattern training from execution history
- Predictive risk assessment with ML scoring
- Quality gates with automated enforcement
- Session management with checkpoint/restore
- Cross-agent coordination with shared context

**✅ Production-Ready Features!** Now includes:
- Comprehensive error handling and retry logic
- Resource optimization and cleanup automation
- Real-time performance metrics and alerts
- Stakeholder-specific reporting with AI insights
- CI/CD integration with quality gate enforcement

See the [Enhanced Features Guide](./docs/ENHANCED_FEATURES.md) and [Performance Guide](./docs/PERFORMANCE_GUIDE.md) for details.

## 🎯 Quick Start

### Step 1: Verify Prerequisites & Performance Setup
```bash
# Check prerequisites and performance features
aqe check --include-performance

# Or run the comprehensive check script
./scripts/check-prerequisites.sh --enhanced

# Verify Claude-Flow with enhanced features:
npx claude-flow@alpha --version
# If not installed: claude mcp add claude-flow npx claude-flow@alpha mcp start

# Initialize enhanced Claude-Flow swarm with performance optimizations
npx claude-flow@alpha swarm init --topology mesh --max-agents 10 --enable-neural

# Verify performance features are available
aqe status --performance-check
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
- ✅ Copies 48 enhanced QE agents with Claude-Flow integration
- 📁 Creates `.claude/` directory with enhanced hooks and configs
- 📖 Adds comprehensive documentation with performance guides
- ⚙️ Creates `qe.config.json` with performance optimizations
- 🚀 Sets up AsyncOperationQueue and BatchProcessor
- 🧠 Initializes neural pattern training capabilities
- 📊 Configures performance monitoring and quality gates

### Step 3: Verify Enhanced Installation
```bash
# Check complete system status with performance metrics
aqe status --enhanced

# List all 48 agents with performance capabilities
aqe list --show-performance

# Test performance with parallel agent execution
aqe spawn --agents risk-oracle,test-planner --task "Analyze project performance" --parallel

# Run performance benchmark
aqe benchmark --quick
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
- Check `$PATH` includes npm global bin directory

#### "Performance features not available"
- Run `aqe status --performance-check` to verify enhanced features
- Update to latest Claude-Flow: `npm update claude-flow@alpha`
- Restart Claude-Flow MCP server: `claude mcp restart claude-flow`

#### "AsyncOperationQueue errors"
- Check system resources: `aqe system --resources`
- Adjust queue size: `aqe config set queue.maxSize 100`
- Monitor queue status: `aqe monitor --queue-status`

#### "Neural training failures"
- Verify training data: `aqe neural --check-data`
- Reset neural patterns: `aqe neural --reset-patterns`
- Check memory usage: `aqe system --memory-check`

### Performance Issues

#### "Slow agent execution"
- Enable parallel processing: `aqe config set execution.parallel true`
- Increase batch size: `aqe config set batch.size 50`
- Check bottlenecks: `aqe performance --analyze-bottlenecks`

#### "Memory usage high"
- Enable cleanup automation: `aqe config set cleanup.auto true`
- Run manual cleanup: `aqe cleanup --force`
- Monitor memory trends: `aqe monitor --memory-trends`

#### "Quality gates failing"
- Review thresholds: `aqe gates --show-config`
- Adjust thresholds: `aqe gates --set coverage.threshold 75`
- Check gate history: `aqe gates --history`

### System Health

#### "Claude-Flow enhanced features not working"
- Check MCP server: `npx claude-flow@alpha status --detailed`
- Verify neural features: `npx claude-flow@alpha neural --status`
- Test swarm coordination: `npx claude-flow@alpha swarm --health-check`

#### "Session persistence issues"
- Check filesystem permissions: `ls -la .claude/sessions/`
- Verify memory access: `aqe memory --test-access`
- Clear corrupted sessions: `aqe sessions --cleanup-corrupted`

### Getting Help

```bash
# Comprehensive system diagnosis
aqe doctor --full-check

# Performance analysis
aqe performance --detailed-report

# Export system information for support
aqe support --export-system-info

# Check integration status
aqe integrations --verify-all
```

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

## 📚 Enhanced Documentation

### Core Documentation
- [Installation Guide](./docs/INSTALLATION_GUIDE.md) - Detailed setup with performance optimization
- [Enhanced Features Guide](./docs/ENHANCED_FEATURES.md) - **✅ NEW!** Claude-Flow enhancements
- [Performance Guide](./docs/PERFORMANCE_GUIDE.md) - **✅ NEW!** Performance optimization tips
- [API Reference](./docs/API_REFERENCE.md) - **✅ UPDATED!** Complete API documentation

### Performance & Optimization
- [AsyncOperationQueue Usage](./docs/ENHANCED_FEATURES.md#asyncoperationqueue) - Batched operation patterns
- [BatchProcessor Guide](./docs/ENHANCED_FEATURES.md#batchprocessor) - Bulk operation optimization
- [Performance Monitoring](./docs/PERFORMANCE_GUIDE.md#monitoring) - Real-time metrics
- [Bottleneck Analysis](./docs/PERFORMANCE_GUIDE.md#bottlenecks) - Performance troubleshooting

### Advanced Features
- [Neural Training Guide](./docs/ENHANCED_FEATURES.md#neural-training) - AI pattern learning
- [Quality Gates Configuration](./docs/ENHANCED_FEATURES.md#quality-gates) - Automated enforcement
- [Session Management](./docs/ENHANCED_FEATURES.md#session-management) - Persistent sessions
- [Memory System](./docs/ENHANCED_FEATURES.md#memory-system) - Distributed coordination

### Development
- [Agent Development Guide](./docs/agents.md) - Creating custom agents
- [Hook System Guide](./docs/hooks.md) - Lifecycle extension
- [Configuration Reference](./docs/configuration.md) - Complete config options
- [Contributing Guide](./CONTRIBUTING.md) - **✅ UPDATED!** Development workflow

### Examples & Evidence
- [Performance Examples](./examples/performance/) - Optimization demonstrations
- [Advanced Workflows](./examples/workflows/) - Complex automation patterns
- [Integration Examples](./examples/integrations/) - CI/CD and tool integrations

## 🗺️ Enhanced Roadmap

### Performance & Scalability (Q1 2025)
- [x] AsyncOperationQueue implementation
- [x] BatchProcessor optimization
- [x] Performance monitoring system
- [ ] Distributed agent execution
- [ ] Auto-scaling capabilities
- [ ] Resource usage optimization

### AI & Neural Features (Q2 2025)
- [x] Neural pattern training
- [x] Predictive risk assessment
- [ ] Visual testing with AI image comparison
- [ ] Natural language test generation
- [ ] Advanced ML insights and predictions
- [ ] Automated test case optimization

### Integration & Platform (Q3 2025)
- [x] Enhanced Claude-Flow integration
- [x] Quality gates automation
- [ ] Cloud-based agent orchestration
- [ ] Enterprise authentication systems
- [ ] Multi-cloud deployment support
- [ ] Advanced CI/CD pipeline integration

### Extensibility (Q4 2025)
- [ ] Plugin architecture for custom agents
- [ ] Multi-language support (Python, Java, Go)
- [ ] Custom neural model training
- [ ] Third-party tool ecosystem
- [ ] Community marketplace for agents
- [ ] Enterprise governance features

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
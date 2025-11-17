# Agentic QE Fleet - Codebase Architecture Map

**Last Updated**: November 7, 2025 | **Version**: 1.4.4

Quick navigation guide for understanding and integrating with the Agentic QE Fleet.

---

## Directory Structure

```
/workspaces/agentic-qe-cf/
├── src/                          # Main source code (TypeScript)
│   ├── agents/                   # 18 QE agents (BaseAgent + 17 implementations)
│   ├── cli/                      # CLI implementation (Commander.js)
│   ├── core/                     # Core fleet systems
│   ├── mcp/                      # Model Context Protocol (54 tools)
│   ├── learning/                 # Q-learning + performance tracking
│   ├── reasoning/                # Pattern recognition + inference
│   ├── types/                    # TypeScript type definitions
│   └── utils/                    # Utilities (Config, Logger, Database)
│
├── tests/                        # Test suites (Jest)
│   ├── unit/                     # Unit tests (isolated)
│   ├── integration/              # Integration tests (batched)
│   ├── mcp/                      # MCP tool tests
│   ├── agents/                   # Agent-specific tests
│   ├── cli/                      # CLI command tests
│   ├── performance/              # Performance tests
│   └── e2e/                      # End-to-end tests
│
├── .claude/                      # Claude Code integration
│   ├── agents/                   # 18 agent definitions
│   ├── skills/                   # 34 QE skills
│   └── commands/                 # 8 slash commands
│
├── .agentic-qe/                  # Runtime data
│   ├── config/                   # Configuration files
│   └── db/                       # SQLite databases
│
├── .github/workflows/            # GitHub Actions CI/CD
├── docs/                         # Documentation
├── package.json                  # Dependencies & npm scripts
└── jest.config.js               # Jest configuration
```

---

## Core Architecture

### 1. Agent System

**Purpose**: Autonomous QE agents that execute tasks

**Location**: `src/agents/`

**Base Class**: `BaseAgent.ts` (40KB)
- Event-driven architecture
- Lifecycle hooks (onPreTask, onPostTask, onTaskError)
- Performance tracking
- Memory integration
- Learning engine support

**18 Concrete Agents**:
```
Testing Domain:
  ├── TestGeneratorAgent (57KB)      - AI-powered test generation
  ├── TestExecutorAgent (32KB)        - Multi-framework test execution
  └── CoverageAnalyzerAgent (39KB)    - Coverage gap detection

Quality Domain:
  ├── QualityGateAgent (24KB)         - Risk assessment gates
  ├── QualityAnalyzerAgent (17KB)     - Quality metrics
  └── FlakyTestHunterAgent (54KB)     - Flaky test detection + stabilization

Performance & Security:
  ├── PerformanceTesterAgent (45KB)   - Load/stress testing
  └── SecurityScannerAgent (32KB)     - Multi-layer scanning

Advanced Analysis:
  ├── RegressionRiskAnalyzerAgent (47KB)  - Smart test selection
  ├── ApiContractValidatorAgent (34KB)    - API breaking changes
  ├── TestDataArchitectAgent (57KB)       - Data generation
  └── (4 more specialized agents)
```

**How Agents Work**:
```
┌─────────────────────────────────────────┐
│ 1. Instantiation                        │
│    new AgentClass(config)               │
├─────────────────────────────────────────┤
│ 2. Initialization                       │
│    await agent.initialize()             │
├─────────────────────────────────────────┤
│ 3. Task Execution                       │
│    await agent.executeTask(assignment)  │
│    ├── onPreTask (load context)         │
│    ├── executeTask (core logic)         │
│    └── onPostTask (store results)       │
├─────────────────────────────────────────┤
│ 4. Results                              │
│    { success, data, metrics }           │
└─────────────────────────────────────────┘
```

---

### 2. Fleet Management

**Purpose**: Coordinate multiple agents

**Location**: `src/core/FleetManager.ts` (16KB)

**Key Methods**:
```typescript
class FleetManager {
  async initialize()              // Setup fleet infrastructure
  async start()                   // Start fleet operations
  async spawnAgent(type, config)  // Create new agent instance
  async submitTask(task)          // Queue task for execution
  getStatus()                     // Get fleet status
}
```

**Responsibilities**:
- Agent lifecycle (spawn, monitor, terminate)
- Task distribution
- Event coordination
- Memory management

---

### 3. CLI Implementation

**Purpose**: Command-line interface for AQE

**Location**: `src/cli/`

**Framework**: Commander.js (modern CLI library)

**23 Command Groups**:
- `init` - Initialize fleet (✅ CI-ready)
- `agent` - Spawn/manage agents
- `test` - Test operations
- `fleet` - Fleet management
- `quality` - Quality gates
- `coverage` - Coverage analysis
- `memory` - Memory operations
- `patterns` - Pattern management
- `learn` - Learning system
- `config` - Configuration
- `workflow` - Workflow management
- + 12 more

**Current Status**:
- ✅ `init` command fully supports `--non-interactive` and exit codes
- ⚠️  Other commands mostly interactive
- ⚠️  Some support `--json` flag
- ❌ Consistent exit codes missing

---

### 4. MCP (Model Context Protocol)

**Purpose**: Claude Code integration for AI assistance

**Location**: `src/mcp/`

**Components**:
- **Server** (`server.ts`, 57KB) - MCP server implementation
- **Tools** (`tools.ts`, 57KB) - 54 tool definitions
- **Handlers** (`handlers/`) - Tool implementation

**54 Tools Organized As**:
- Fleet Management (7 tools)
- Testing (8 tools)
- Quality (7 tools)
- Memory & Coordination (12 tools)
- Analysis (8+ tools)
- + Specialized tools

**Tool Pattern**:
```typescript
interface ToolInput {
  params: Record<string, any>;
}

interface ToolOutput {
  success: boolean;
  data?: any;
  error?: string;
  requestId: string;
  executionTime?: number;
}
```

**Key Advantages**:
- ✅ Structured JSON I/O
- ✅ No prompts
- ✅ Execution time tracking
- ✅ Error information

---

### 5. Configuration System

**Purpose**: Manage fleet and agent configuration

**Location**: `src/utils/Config.ts`

**Configuration Sources** (precedence):
1. Environment variables
2. Configuration file (YAML/JSON)
3. CLI arguments
4. Defaults

**Configuration Files Created by Init**:
```
.agentic-qe/config/
├── fleet.json          # Main fleet configuration
├── routing.json        # Multi-Model Router settings
└── aqe-hooks.json      # Native hooks configuration

.agentic-qe/db/
├── memory.db          # Agent memory (SQLite)
└── patterns.db        # Pattern bank (SQLite)
```

---

### 6. Memory System

**Purpose**: Persistent state and inter-agent coordination

**Location**: `src/core/memory/`

**Components**:
- `SwarmMemoryManager` - Distributed memory
- `AgentDBManager` - Vector database integration
- `MemoryStoreAdapter` - Compatibility layer

**Memory Namespace** (`aqe/*`):
```
aqe/test-plan/*           - Test plans
aqe/coverage/*            - Coverage analysis
aqe/quality/*             - Quality metrics
aqe/performance/*         - Performance results
aqe/security/*            - Security findings
aqe/swarm/coordination    - Cross-agent coordination
```

---

### 7. Learning System

**Purpose**: Continuous improvement through Q-learning

**Location**: `src/learning/`

**Components**:
- `LearningEngine` - Q-learning implementation
- `PerformanceTracker` - Metrics collection
- `PatternExtractor` - Pattern identification
- `FlakyTestDetector` - ML-based flakiness detection

**Features**:
- Q-learning for strategy optimization
- Pattern bank for test reuse
- Flaky test detection
- Cost optimization tracking

---

### 8. Test Infrastructure

**Purpose**: Comprehensive testing for 959 test cases

**Location**: `tests/`

**Test Organization**:
```
Unit Tests         (512MB limit)     - Isolated component tests
Integration Tests  (batched)         - Component interaction
MCP Tests         (512MB limit)      - Tool testing
Agent Tests       (512MB limit)      - Agent-specific tests
CLI Tests         (512MB limit)      - Command testing
Performance Tests (1536MB limit)     - Benchmark tests
AgentDB Tests     (1024MB limit)     - Database tests
```

**Jest Configuration** (`jest.config.js`):
- Sequential execution (`maxWorkers: 1`)
- 30s timeout per test
- Memory tracking
- Coverage thresholds (70%)

**Test Scripts** (from package.json):
```bash
npm run test:unit              # Unit tests
npm run test:integration       # Integration (batched)
npm run test:agents            # Agent tests
npm run test:mcp               # MCP tests
npm run test:ci                # CI-optimized
npm run test:coverage          # Coverage report
```

---

## Key Files Quick Reference

### Entry Points
| File | Purpose | Size |
|------|---------|------|
| `src/cli/index.ts` | Main CLI | 31KB |
| `src/index.ts` | Library export | 4KB |
| `bin/aqe` | Executable | Symlink |

### Agent System
| File | Purpose | Size |
|------|---------|------|
| `src/agents/BaseAgent.ts` | Base class | 40KB |
| `src/agents/TestGeneratorAgent.ts` | Test generation | 57KB |
| `src/agents/index.ts` | Agent factory | 28KB |

### Core Systems
| File | Purpose | Size |
|------|---------|------|
| `src/core/FleetManager.ts` | Fleet coordination | 16KB |
| `src/core/Task.ts` | Task definition | 10KB |
| `src/core/Agent.ts` | Legacy agent base | 10KB |

### Configuration
| File | Purpose | Size |
|------|---------|------|
| `src/utils/Config.ts` | Config loading | 80+ lines |
| `.agentic-qe/config/fleet.json` | Fleet config | ~2KB |

### Testing
| File | Purpose | Scope |
|------|---------|-------|
| `jest.config.js` | Jest config | All tests |
| `jest.setup.ts` | Setup hooks | All tests |
| `scripts/test-integration-batched.sh` | Integration batching | Integration tests |

---

## Current CI/CD Status

### What Works ✅
- **Init command**: Full `--non-interactive` support
- **Programmatic access**: Can use agents directly in Node.js
- **MCP tools**: Structured JSON output
- **Test infrastructure**: Optimized for CI (batched execution)

### What's Missing ❌
- **Non-interactive CLI**: Most agent commands require prompts
- **Consistent JSON output**: Only some commands support `--json`
- **Proper exit codes**: Not consistently implemented
- **Batch operations**: No batch spawn API
- **CI/CD layer**: No dedicated CI integration layer

### Readiness Score
- **Agents**: 100% (fully operational)
- **Configuration**: 80% (mostly done)
- **CLI**: 30% (mostly interactive)
- **MCP Tools**: 90% (structured output)
- **Tests**: 100% (optimized for CI)
- **Overall**: ~50% (works with workarounds)

---

## How to Navigate the Code

### To Understand Agent System
1. Start with `src/agents/BaseAgent.ts` (core lifecycle)
2. Look at `src/agents/TestGeneratorAgent.ts` (concrete example)
3. Check `src/core/Task.ts` (task definition)

### To Add a New Agent
1. Copy `src/agents/BaseAgent.ts`
2. Extend with `executeTask(assignment)` implementation
3. Add to `src/agents/index.ts`
4. Create `.claude/agents/your-agent.md` (Claude Code)

### To Integrate with CI/CD
1. Read `CI-CD-IMPLEMENTATION-GUIDE.md` (quick start)
2. Study `src/cli/commands/init.ts` (best CLI example)
3. Use `src/core/FleetManager.ts` (programmatic API)
4. Check `src/mcp/handlers/agent-spawn.ts` (MCP pattern)

### To Understand Tests
1. Look at `tests/unit/agents/` (agent tests)
2. Check `jest.config.js` (Jest configuration)
3. Study `scripts/test-integration-batched.sh` (batching strategy)

### To Add a CLI Command
1. Create file in `src/cli/commands/`
2. Export command function
3. Import and register in `src/cli/index.ts`
4. Add to `.claude/commands/` for Claude Code

---

## Development Workflow

### Build
```bash
npm run build          # Compile TypeScript to dist/
npm run typecheck      # Type checking without compilation
```

### Testing
```bash
npm run test:unit       # Unit tests (fast, memory-safe)
npm run test:integration # Integration tests (batched)
npm run test:coverage   # With coverage report
npm run test:ci        # CI-optimized mode
```

### CLI Development
```bash
npm run dev            # Dev mode: ts-node src/cli/index.ts
npm run start          # Production: node dist/cli/index.js
aqe --help            # See all commands
```

### MCP Development
```bash
npm run build          # Build first
npm run mcp:start      # Start MCP server
npm run mcp:validate   # Validate all tools
npm run mcp:report     # Generate MCP report
```

---

## Common Tasks

### Spawn an Agent (Programmatically)
```typescript
import { FleetManager } from './src/core/FleetManager';
import { Config } from './src/utils/Config';

const config = await Config.load();
const fleet = new FleetManager(config);
await fleet.initialize();
const agent = await fleet.spawnAgent('test-generator');
```

### Execute a Task
```typescript
const result = await agent.executeTask({
  id: 'task-1',
  type: 'test-generation',
  payload: { /* ... */ }
});
```

### Add a CLI Command
```typescript
// src/cli/index.ts
program
  .command('mycommand <arg>')
  .description('My command description')
  .option('--json', 'Output as JSON')
  .action(async (arg, options) => {
    const result = await executeMyCommand(arg);
    if (options.json) {
      console.log(JSON.stringify(result));
    } else {
      console.log(result);
    }
  });
```

### Add a New Agent Type
```typescript
// src/agents/MyNewAgent.ts
export class MyNewAgent extends BaseAgent {
  async executeTask(assignment: TaskAssignment): Promise<any> {
    // Your agent logic
    return { success: true, data: {...} };
  }
}

// src/agents/index.ts
export { MyNewAgent } from './MyNewAgent';
```

---

## Performance Characteristics

### Agent Execution
- **Spawn time**: 100-300ms per agent
- **Task execution**: 1-10s typical (depends on task)
- **Memory per agent**: 50-150MB

### Memory Management
- **Sequential execution**: `maxWorkers: 1` (Jest)
- **Test timeout**: 30s per test
- **Memory limits**: 512MB-1536MB depending on test type
- **Batching**: Integration tests run in batches of 5

### Scalability
- **Max agents**: 10 (configured in fleet.json)
- **Typical fleet**: 3-5 agents
- **Test parallelization**: Limited by memory (sequential mode)

---

## Documentation

### Quick Guides
- `CI-CD-IMPLEMENTATION-GUIDE.md` - CI/CD integration (recommended start)
- `ci-cd-readiness-analysis.md` - Detailed architecture analysis

### Code Documentation
- TSDoc comments in source files
- Type definitions in `src/types/`
- `.claude/` files for Claude Code integration

### External Resources
- **Commander.js**: CLI library docs
- **Jest**: Testing framework docs
- **TypeScript**: Type system docs
- **MCP**: Model Context Protocol docs

---

## Quick Answers

**Q: How do I run an agent?**
A: Use `FleetManager.spawnAgent()` then call `agent.executeTask()`

**Q: How do I add CI/CD support?**
A: See `CI-CD-IMPLEMENTATION-GUIDE.md` - use programmatic approach

**Q: How do I add a CLI command?**
A: Create file in `src/cli/commands/`, register in `src/cli/index.ts`

**Q: Why are tests batched?**
A: Memory constraints in DevPod/Codespaces (explained in CLAUDE.md)

**Q: How do I debug an agent?**
A: Enable logging, use `--debug` flag, check `.agentic-qe/logs/`

**Q: Where is agent state stored?**
A: `.agentic-qe/db/memory.db` (SQLite), organized by `aqe/*` namespace

---

**Generated**: November 7, 2025  
**For Questions**: See `ci-cd-readiness-analysis.md` (comprehensive analysis)


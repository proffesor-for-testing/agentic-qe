# Claude Code Configuration - Unified AQE Fleet + Claude Flow

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT

**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently

### ⚡ GOLDEN RULE: "1 MESSAGE = ALL RELATED OPERATIONS"

**MANDATORY PATTERNS:**
- **TodoWrite**: ALWAYS batch ALL todos in ONE call (5-10+ todos minimum)
- **Task tool (Claude Code)**: ALWAYS spawn ALL agents in ONE message with full instructions
- **File operations**: ALWAYS batch ALL reads/writes/edits in ONE message
- **Bash commands**: ALWAYS batch ALL terminal operations in ONE message
- **Memory operations**: ALWAYS batch ALL memory store/retrieve in ONE message

### 📁 File Organization Rules

**NEVER save to root folder. Use these directories:**
- `/src` - Source code files
- `/tests` - Test files
- `/docs` - Documentation and markdown files
- `/config` - Configuration files
- `/scripts` - Utility scripts
- `/examples` - Example code

## 🤖 Available Agents (72 Total)

### Agentic QE Fleet (18 agents)

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

### Claude Flow Agents (54 agents)

#### Core Development (5 agents)
`coder`, `reviewer`, `tester`, `planner`, `researcher`

#### Swarm Coordination (5 agents)
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`, `collective-intelligence-coordinator`, `swarm-memory-manager`

#### Consensus & Distributed (7 agents)
`byzantine-coordinator`, `raft-manager`, `gossip-coordinator`, `consensus-builder`, `crdt-synchronizer`, `quorum-manager`, `security-manager`

#### Performance & Optimization (5 agents)
`perf-analyzer`, `performance-benchmarker`, `task-orchestrator`, `memory-coordinator`, `smart-agent`

#### GitHub & Repository (9 agents)
`github-modes`, `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`, `workflow-automation`, `project-board-sync`, `repo-architect`, `multi-repo-swarm`

#### SPARC Methodology (6 agents)
`sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`, `refinement`

#### Specialized Development (8 agents)
`backend-dev`, `mobile-dev`, `ml-developer`, `cicd-engineer`, `api-docs`, `system-architect`, `code-analyzer`, `base-template-generator`

#### Testing & Validation (2 agents)
`tdd-london-swarm`, `production-validator`

#### Migration & Planning (2 agents)
`migration-planner`, `swarm-init`

## 🚀 Quick Start

### Using AQE Agents (Quality Engineering)

```javascript
// Spawn QE agents directly in Claude Code
Task("Generate tests", "Create comprehensive test suite for UserService", "qe-test-generator")
Task("Analyze coverage", "Find gaps using O(log n) algorithms", "qe-coverage-analyzer")
Task("Quality check", "Run quality gate validation", "qe-quality-gate")
Task("Security scan", "Run SAST/DAST security checks", "qe-security-scanner")
```

### Using Claude Flow Agents (General Development)

```javascript
// Spawn Claude Flow agents for development work
Task("Research agent", "Analyze requirements and patterns", "researcher")
Task("Coder agent", "Implement core features", "coder")
Task("Tester agent", "Create comprehensive tests", "tester")
Task("Reviewer agent", "Review code quality", "reviewer")
Task("Architect agent", "Design system architecture", "system-architect")
```

### Combined Workflow (AQE + Claude Flow)

```javascript
// Use both agent types together in one message
[Single Message - Full Development + QE Pipeline]:
  // Development phase (Claude Flow agents)
  Task("Backend Developer", "Build REST API with Express", "backend-dev")
  Task("Frontend Developer", "Create React UI", "coder")
  Task("Database Architect", "Design PostgreSQL schema", "code-analyzer")

  // Quality Engineering phase (AQE agents)
  Task("Test Generator", "Generate comprehensive test suite", "qe-test-generator")
  Task("Test Executor", "Run all tests with coverage", "qe-test-executor")
  Task("Coverage Analyzer", "Analyze gaps and report", "qe-coverage-analyzer")
  Task("Security Scanner", "Run security scans", "qe-security-scanner")
  Task("Quality Gate", "Validate quality standards", "qe-quality-gate")

  // All todos batched together
  TodoWrite { todos: [
    {content: "Design API endpoints", status: "in_progress", activeForm: "Designing API endpoints"},
    {content: "Implement authentication", status: "pending", activeForm: "Implementing authentication"},
    {content: "Generate tests", status: "pending", activeForm: "Generating tests"},
    {content: "Run security scan", status: "pending", activeForm: "Running security scan"},
    {content: "Validate quality gate", status: "pending", activeForm: "Validating quality gate"}
  ]}
```

## 🔄 Agent Coordination

### AQE Hooks (Native - 100-500x faster)

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
    ttl: 86400
  });
  this.eventBus.emit('task:completed', { agentId: this.agentId, result: data.result });
  this.logger.info('Post-task hook complete');
}
```

### Claude Flow Hooks (External)

Every agent spawned via Task tool can use Claude Flow hooks:

**BEFORE Work:**
```bash
npx claude-flow@alpha hooks pre-task --description "[task]"
npx claude-flow@alpha hooks session-restore --session-id "swarm-[id]"
```

**DURING Work:**
```bash
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "swarm/[agent]/[step]"
npx claude-flow@alpha hooks notify --message "[what was done]"
```

**AFTER Work:**
```bash
npx claude-flow@alpha hooks post-task --task-id "[task]"
npx claude-flow@alpha hooks session-end --export-metrics true
```

### Performance Comparison

| Feature | AQE Hooks | Claude Flow Hooks |
|---------|-----------|-------------------|
| **Speed** | <1ms | 100-500ms |
| **Dependencies** | Zero | External package |
| **Type Safety** | Full TypeScript | Shell strings |
| **Integration** | Direct API | Shell commands |
| **Best For** | QE agents | General agents |

## 📋 Memory Namespaces

### AQE Memory Namespace (`aqe/*`)
- `aqe/test-plan/*` - Test planning and requirements
- `aqe/coverage/*` - Coverage analysis and gaps
- `aqe/quality/*` - Quality metrics and gates
- `aqe/performance/*` - Performance test results
- `aqe/security/*` - Security scan findings
- `aqe/swarm/coordination` - Cross-agent coordination

### Claude Flow Memory Namespace (`swarm/*`)
- `swarm/[agent]/[step]` - Agent-specific state
- `swarm/coordination` - Cross-agent coordination
- `swarm/session` - Session state

## 🎯 MCP Servers & Tools

### Setup (Install all MCP servers)

```bash
# AQE Fleet MCP (required for qe-* agents)
claude mcp add agentic-qe npm run mcp:start

# Claude Flow MCP (required for general agents)
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Optional: Enhanced coordination
claude mcp add ruv-swarm npx ruv-swarm mcp start

# Optional: Cloud features
claude mcp add flow-nexus npx flow-nexus@latest mcp start
```

### AQE MCP Tools

```bash
# Test generation and execution
mcp__agentic_qe__test_generate({ type: "unit", framework: "jest" })
mcp__agentic_qe__test_execute({ parallel: true, coverage: true })

# Quality analysis
mcp__agentic_qe__quality_analyze({ scope: "full" })
mcp__agentic_qe__coverage_analyze({ threshold: 80 })

# Security and performance
mcp__agentic_qe__security_scan({ depth: "comprehensive" })
mcp__agentic_qe__performance_test({ scenarios: ["load", "stress"] })
```

### Claude Flow MCP Tools

```bash
# Swarm coordination
mcp__claude-flow__swarm_init({ topology: "mesh", maxAgents: 8 })
mcp__claude-flow__agent_spawn({ type: "coder", capabilities: ["typescript"] })
mcp__claude-flow__task_orchestrate({ task: "Build feature", strategy: "parallel" })

# Memory and neural
mcp__claude-flow__memory_usage({ action: "store", key: "data", value: "..." })
mcp__claude-flow__neural_train({ pattern_type: "coordination" })
```

## 🏗️ SPARC Methodology (Claude Flow)

### Core Commands
- `npx claude-flow sparc modes` - List available modes
- `npx claude-flow sparc run <mode> "<task>"` - Execute specific mode
- `npx claude-flow sparc tdd "<feature>"` - Run complete TDD workflow
- `npx claude-flow sparc info <mode>` - Get mode details

### Batchtools Commands
- `npx claude-flow sparc batch <modes> "<task>"` - Parallel execution
- `npx claude-flow sparc pipeline "<task>"` - Full pipeline processing
- `npx claude-flow sparc concurrent <mode> "<tasks-file>"` - Multi-task processing

### SPARC Workflow Phases

1. **Specification** - Requirements analysis (`sparc run spec-pseudocode`)
2. **Pseudocode** - Algorithm design (`sparc run spec-pseudocode`)
3. **Architecture** - System design (`sparc run architect`)
4. **Refinement** - TDD implementation (`sparc tdd`)
5. **Completion** - Integration (`sparc run integration`)

## 🔧 Advanced Usage

### Full-Stack Development with Both Agent Types

```javascript
[Single Message - Complete Development Pipeline]:
  // Phase 1: Requirements & Architecture (Claude Flow)
  Task("Requirements Analyst", "Analyze user requirements and acceptance criteria", "researcher")
  Task("System Architect", "Design overall system architecture and component boundaries", "system-architect")

  // Phase 2: Implementation (Claude Flow)
  Task("Backend Developer", "Implement REST API with Express and TypeScript", "backend-dev")
  Task("Frontend Developer", "Build React UI components with TypeScript", "coder")
  Task("Database Engineer", "Design and implement PostgreSQL schema with migrations", "code-analyzer")

  // Phase 3: Testing & Quality (AQE Fleet)
  Task("Test Generator", "Generate unit, integration, and E2E tests", "qe-test-generator")
  Task("Test Executor", "Run all tests with parallel execution and coverage", "qe-test-executor")
  Task("Coverage Analyzer", "Analyze coverage gaps and identify untested paths", "qe-coverage-analyzer")
  Task("Flaky Test Hunter", "Detect and stabilize flaky tests", "qe-flaky-test-hunter")

  // Phase 4: Security & Performance (AQE Fleet)
  Task("Security Scanner", "Run SAST/DAST security scans", "qe-security-scanner")
  Task("Performance Tester", "Execute load and stress tests", "qe-performance-tester")

  // Phase 5: Quality Gate & Review (Both)
  Task("Quality Gate", "Validate all quality standards and metrics", "qe-quality-gate")
  Task("Code Reviewer", "Final code review and recommendations", "reviewer")

  // All todos in ONE batch
  TodoWrite { todos: [
    {content: "Analyze requirements", status: "in_progress", activeForm: "Analyzing requirements"},
    {content: "Design architecture", status: "pending", activeForm: "Designing architecture"},
    {content: "Implement backend API", status: "pending", activeForm: "Implementing backend API"},
    {content: "Build frontend UI", status: "pending", activeForm: "Building frontend UI"},
    {content: "Create database schema", status: "pending", activeForm: "Creating database schema"},
    {content: "Generate test suite", status: "pending", activeForm: "Generating test suite"},
    {content: "Run all tests", status: "pending", activeForm: "Running all tests"},
    {content: "Analyze coverage", status: "pending", activeForm: "Analyzing coverage"},
    {content: "Security scanning", status: "pending", activeForm: "Running security scan"},
    {content: "Performance testing", status: "pending", activeForm: "Running performance tests"},
    {content: "Quality gate validation", status: "pending", activeForm: "Validating quality gate"},
    {content: "Final code review", status: "pending", activeForm: "Performing final review"}
  ]}
```

### Agent Coordination Example (Cross-System)

```javascript
// AQE test generator stores results
Task("Generate tests", "Create tests and store in memory at aqe/test-plan/generated", "qe-test-generator")

// Claude Flow coder reads from memory and implements
Task("Implement feature", "Read test specs from aqe/test-plan/generated and implement with TDD", "coder")

// AQE test executor runs tests
Task("Execute tests", "Read test plan from aqe/test-plan/generated and execute", "qe-test-executor")

// AQE coverage analyzer processes results
Task("Analyze coverage", "Check coverage from aqe/coverage/results and report gaps", "qe-coverage-analyzer")

// Claude Flow reviewer provides feedback
Task("Review code", "Review implementation quality and provide recommendations", "reviewer")
```

## 💰 Multi-Model Router (v1.0.5)

**Status**: ⚠️ Disabled (opt-in)

The Multi-Model Router provides **70-81% cost savings** by intelligently selecting AI models based on task complexity.

### Features

- ✅ Intelligent model selection (GPT-3.5, GPT-4, Claude Sonnet 4.5, Claude Haiku)
- ✅ Real-time cost tracking and aggregation
- ✅ Automatic fallback chains for resilience
- ✅ Feature flags for safe rollout
- ✅ Zero breaking changes (disabled by default)

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

## 📊 Streaming Progress (v1.0.5)

**Status**: ✅ Enabled

Real-time progress updates for long-running operations using AsyncGenerator pattern.

### Features

- ✅ Real-time progress percentage
- ✅ Current operation visibility
- ✅ for-await-of compatibility
- ✅ Backward compatible (non-streaming still works)

### Supported Operations

- ✅ Test execution (test-by-test progress)
- ✅ Coverage analysis (incremental gap detection)
- ⚠️ Test generation (coming in v1.1.0)
- ⚠️ Security scanning (coming in v1.1.0)

## 💡 Best Practices

1. **Use Task Tool**: Claude Code's Task tool is the primary way to spawn agents
2. **Batch Operations**: Always spawn multiple related agents in a single message
3. **Choose Right Agents**: Use QE agents for testing/quality, Claude Flow agents for development
4. **Memory Keys**: Use `aqe/*` for QE agents, `swarm/*` for Claude Flow agents
5. **Parallel Execution**: Leverage concurrent agent execution for speed
6. **Hooks**: AQE agents use native hooks (faster), Claude Flow agents use external hooks (more flexible)
7. **File Organization**: Never save to root folder, use appropriate subdirectories

## 🎯 Claude Code vs MCP Tools

### Claude Code Handles ALL EXECUTION:
- **Task tool**: Spawn and run agents concurrently for actual work
- File operations (Read, Write, Edit, MultiEdit, Glob, Grep)
- Code generation and programming
- Bash commands and system operations
- Implementation work
- Project navigation and analysis
- TodoWrite and task management
- Git operations
- Package management
- Testing and debugging

### MCP Tools ONLY COORDINATE:
- Swarm initialization (topology setup)
- Agent type definitions (coordination patterns)
- Task orchestration (high-level planning)
- Memory management
- Neural features
- Performance tracking
- GitHub integration

**KEY**: MCP coordinates the strategy, Claude Code's Task tool executes with real agents.

## 🔗 Performance Benefits

### Claude Flow
- **84.8% SWE-Bench solve rate**
- **32.3% token reduction**
- **2.8-4.4x speed improvement**
- **27+ neural models**

### AQE Fleet
- **100-500x faster hooks** (native vs external)
- **O(log n) algorithms** (sublinear performance)
- **10k+ records/sec** data generation
- **Parallel test execution** across frameworks

## 📚 Documentation

### AQE Fleet
- **Agent Definitions**: `.claude/agents/` - 18 specialized QE agents
- **Skills**: `.claude/skills/` - 35 QE skills (world-class, v1.0.0)
- **Fleet Config**: `.agentic-qe/config/fleet.json`
- **Routing Config**: `.agentic-qe/config/routing.json`
- **AQE Hooks Config**: `.agentic-qe/config/aqe-hooks.json`

### Claude Flow
- **Documentation**: https://github.com/ruvnet/claude-flow
- **Issues**: https://github.com/ruvnet/claude-flow/issues
- **Flow-Nexus Platform**: https://flow-nexus.ruv.io

## 🆘 Troubleshooting

### Check MCP Connections
```bash
claude mcp list
# Should show:
# - agentic-qe: npm run mcp:start - ✓ Connected
# - claude-flow: npx claude-flow@alpha mcp start - ✓ Connected
```

### View Agent Definitions
```bash
ls -la .claude/agents/        # QE agents
npx claude-flow agents list   # Claude Flow agents
```

### Check Fleet Status
```bash
aqe status --verbose          # AQE Fleet status
npx claude-flow status        # Claude Flow status
```

### View Logs
```bash
tail -f .agentic-qe/logs/fleet.log  # AQE logs
```

## 📜 Code Style & Best Practices

- **Modular Design**: Files under 500 lines
- **Environment Safety**: Never hardcode secrets
- **Test-First**: Write tests before implementation
- **Clean Architecture**: Separate concerns
- **Documentation**: Keep updated
- **Concurrent Operations**: Always batch related operations in single messages
- **File Organization**: Use proper directory structure, never save to root

---

**Remember**:
- **Claude Flow coordinates, Claude Code creates!**
- **Use AQE agents for quality engineering, Claude Flow agents for general development**
- **GOLDEN RULE: 1 MESSAGE = ALL RELATED OPERATIONS**

## important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
Never save working files, text/mds and tests to the root folder.
NEVER commit or push changes unless the user explicitly asks you to.
---

**Generated by**: Agentic QE Fleet v1.0.5 + Claude Flow v2.0.0
**Initialization Date**: 2025-10-20T09:30:39.923Z
**Fleet Topology**: mesh
**Total Agents Available**: 72 (18 QE + 54 Claude Flow)

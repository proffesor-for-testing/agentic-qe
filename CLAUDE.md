# Claude Code Configuration - SPARC Development Environment

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT

**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently, not just MCP

### ⚡ GOLDEN RULE: "1 MESSAGE = ALL RELATED OPERATIONS"

**MANDATORY PATTERNS:**
- **TodoWrite**: ALWAYS batch ALL todos in ONE call (5-10+ todos minimum)
- **Task tool (Claude Code)**: ALWAYS spawn ALL agents in ONE message with full instructions
- **File operations**: ALWAYS batch ALL reads/writes/edits in ONE message
- **Bash commands**: ALWAYS batch ALL terminal operations in ONE message
- **Memory operations**: ALWAYS batch ALL memory store/retrieve in ONE message

### 🎯 CRITICAL: Claude Code Task Tool for Agent Execution

**Claude Code's Task tool is the PRIMARY way to spawn agents:**
```javascript
// ✅ CORRECT: Use Claude Code's Task tool for parallel agent execution
[Single Message]:
  Task("Research agent", "Analyze requirements and patterns...", "researcher")
  Task("Coder agent", "Implement core features...", "coder")
  Task("Tester agent", "Create comprehensive tests...", "tester")
  Task("Reviewer agent", "Review code quality...", "reviewer")
  Task("Architect agent", "Design system architecture...", "system-architect")
```

**MCP tools are ONLY for coordination setup:**
- `mcp__claude-flow__swarm_init` - Initialize coordination topology
- `mcp__claude-flow__agent_spawn` - Define agent types for coordination
- `mcp__claude-flow__task_orchestrate` - Orchestrate high-level workflows

### 📁 File Organization Rules

**NEVER save to root folder. Use these directories:**
- `/src` - Source code files
- `/tests` - Test files
- `/docs` - Documentation and markdown files
- `/config` - Configuration files
- `/scripts` - Utility scripts
- `/examples` - Example code

## Project Overview

This project combines two powerful frameworks:
1. **SPARC Methodology**: Specification, Pseudocode, Architecture, Refinement, Completion with Claude-Flow orchestration
2. **AQE Framework**: 48 specialized Quality Engineering agents using Anthropic API for real AI-powered testing and analysis

## SPARC Commands

### Core Commands
- `npx claude-flow sparc modes` - List available modes
- `npx claude-flow sparc run <mode> "<task>"` - Execute specific mode
- `npx claude-flow sparc tdd "<feature>"` - Run complete TDD workflow
- `npx claude-flow sparc info <mode>` - Get mode details

### Batchtools Commands
- `npx claude-flow sparc batch <modes> "<task>"` - Parallel execution
- `npx claude-flow sparc pipeline "<task>"` - Full pipeline processing
- `npx claude-flow sparc concurrent <mode> "<tasks-file>"` - Multi-task processing

### Build Commands
- `npm run build` - Build project
- `npm run test` - Run tests
- `npm run lint` - Linting
- `npm run typecheck` - Type checking

## AQE Framework Commands

### Core QE Commands
- `aqe spawn <agent> --task "<description>"` - Spawn a single QE agent
- `aqe spawn --agents <agent1> <agent2> --task "<description>"` - Spawn multiple agents
- `aqe spawn --interactive` - Interactive agent selection
- `aqe list` - List all 48 available QE agents
- `aqe status` - Check swarm status
- `aqe init` - Initialize QE framework

## SPARC Workflow Phases

1. **Specification** - Requirements analysis (`sparc run spec-pseudocode`)
2. **Pseudocode** - Algorithm design (`sparc run spec-pseudocode`)
3. **Architecture** - System design (`sparc run architect`)
4. **Refinement** - TDD implementation (`sparc tdd`)
5. **Completion** - Integration (`sparc run integration`)

## Code Style & Best Practices

- **Modular Design**: Files under 500 lines
- **Environment Safety**: Never hardcode secrets
- **Test-First**: Write tests before implementation
- **Clean Architecture**: Separate concerns
- **Documentation**: Keep updated

## 🚀 Optimized QE Framework Agents (35 Total)

### Core QE Testing (12 agents)
`exploratory-testing-navigator`, `functional-flow-validator`, `functional-negative`, `functional-positive`, `functional-stateful`, `mutation-testing-swarm`, `regression-guardian`, `test-analyzer`, `test-generator`, `test-planner`, `test-runner`, `tdd-pair-programmer`

### Requirements & Design (4 agents)
`requirements-explorer`, `design-challenger`, `spec-linter`, `accessibility-advocate`

### Risk & Security (4 agents)
`risk-oracle`, `security-sentinel`, `security-injection`, `security-auth`

### Performance & Reliability (4 agents)
`performance-analyzer`, `performance-hunter`, `performance-planner`, `resilience-challenger`

### Production & Monitoring (3 agents)
`production-observer`, `deployment-guardian`, `chaos-engineer`

### Coordination & Orchestration (4 agents)
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`, `context-orchestrator`

### Knowledge & Reporting (4 agents)
`knowledge-curator`, `quality-storyteller`, `test-strategist`, `mocking-agent`

## 🎯 SDLC-Aligned Testing Swarms (8 Pre-configured)

### 1. Requirements & Design Phase (`requirements-design`)
**Agents**: requirements-explorer, design-challenger, spec-linter, test-planner
**Purpose**: Early quality gates, testability assessment

### 2. Development & TDD (`development-tdd`)
**Agents**: tdd-pair-programmer, test-generator, mocking-agent, functional-positive
**Purpose**: Test-first development, unit testing

### 3. Integration & API Testing (`integration-api`)
**Agents**: functional-flow-validator, test-runner, security-auth, performance-analyzer
**Purpose**: Integration testing, API validation

### 4. Security & Compliance (`security-compliance`)
**Agents**: security-sentinel, security-injection, accessibility-advocate, risk-oracle
**Purpose**: Security assessment, compliance validation

### 5. Performance & Scalability (`performance-scalability`)
**Agents**: performance-hunter, performance-planner, resilience-challenger, chaos-engineer
**Purpose**: Performance testing, chaos engineering

### 6. E2E & User Journey (`e2e-journey`)
**Agents**: exploratory-testing-navigator, functional-stateful, functional-negative, test-analyzer
**Purpose**: End-to-end testing, edge cases

### 7. Production Readiness (`production-readiness`)
**Agents**: deployment-guardian, production-observer, regression-guardian, quality-storyteller
**Purpose**: Pre-production validation, monitoring

### 8. Continuous Quality (`continuous-quality`)
**Agents**: test-strategist, knowledge-curator, mutation-testing-swarm, test-analyzer
**Purpose**: Continuous improvement, knowledge management

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

## 🚀 Quick Setup

```bash
# Add MCP servers (Claude Flow required, others optional)
claude mcp add claude-flow npx claude-flow@alpha mcp start
claude mcp add ruv-swarm npx ruv-swarm mcp start  # Optional: Enhanced coordination
claude mcp add flow-nexus npx flow-nexus@latest mcp start  # Optional: Cloud features
```

## MCP Tool Categories

### Coordination
`swarm_init`, `agent_spawn`, `task_orchestrate`

### Monitoring
`swarm_status`, `agent_list`, `agent_metrics`, `task_status`, `task_results`

### Memory & Neural
`memory_usage`, `neural_status`, `neural_train`, `neural_patterns`

### GitHub Integration
`github_swarm`, `repo_analyze`, `pr_enhance`, `issue_triage`, `code_review`

### System
`benchmark_run`, `features_detect`, `swarm_monitor`

### Flow-Nexus MCP Tools (Optional Advanced Features)
Flow-Nexus extends MCP capabilities with 70+ cloud-based orchestration tools:

**Key MCP Tool Categories:**
- **Swarm & Agents**: `swarm_init`, `swarm_scale`, `agent_spawn`, `task_orchestrate`
- **Sandboxes**: `sandbox_create`, `sandbox_execute`, `sandbox_upload` (cloud execution)
- **Templates**: `template_list`, `template_deploy` (pre-built project templates)
- **Neural AI**: `neural_train`, `neural_patterns`, `seraphina_chat` (AI assistant)
- **GitHub**: `github_repo_analyze`, `github_pr_manage` (repository management)
- **Real-time**: `execution_stream_subscribe`, `realtime_subscribe` (live monitoring)
- **Storage**: `storage_upload`, `storage_list` (cloud file management)

**Authentication Required:**
- Register: `mcp__flow-nexus__user_register` or `npx flow-nexus@latest register`
- Login: `mcp__flow-nexus__user_login` or `npx flow-nexus@latest login`
- Access 70+ specialized MCP tools for advanced orchestration

## 🚀 Agent Execution Flow with Claude Code

### The Correct Pattern:

1. **Optional**: Use MCP tools to set up coordination topology
2. **REQUIRED**: Use Claude Code's Task tool to spawn agents that do actual work
3. **REQUIRED**: Each agent runs hooks for coordination
4. **REQUIRED**: Batch all operations in single messages

### Example Full-Stack Development:

```javascript
// Single message with all agent spawning via Claude Code's Task tool
[Parallel Agent Execution]:
  Task("Backend Developer", "Build REST API with Express. Use hooks for coordination.", "backend-dev")
  Task("Frontend Developer", "Create React UI. Coordinate with backend via memory.", "coder")
  Task("Database Architect", "Design PostgreSQL schema. Store schema in memory.", "code-analyzer")
  Task("Test Engineer", "Write Jest tests. Check memory for API contracts.", "tester")
  Task("DevOps Engineer", "Setup Docker and CI/CD. Document in memory.", "cicd-engineer")
  Task("Security Auditor", "Review authentication. Report findings via hooks.", "reviewer")
  
  // All todos batched together
  TodoWrite { todos: [...8-10 todos...] }
  
  // All file operations together
  Write "backend/server.js"
  Write "frontend/App.jsx"
  Write "database/schema.sql"
```

## 📋 Agent Coordination Protocol

### Every Agent Spawned via Task Tool MUST:

**1️⃣ BEFORE Work:**
```bash
npx claude-flow@alpha hooks pre-task --description "[task]"
npx claude-flow@alpha hooks session-restore --session-id "swarm-[id]"
```

**2️⃣ DURING Work:**
```bash
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "swarm/[agent]/[step]"
npx claude-flow@alpha hooks notify --message "[what was done]"
```

**3️⃣ AFTER Work:**
```bash
npx claude-flow@alpha hooks post-task --task-id "[task]"
npx claude-flow@alpha hooks session-end --export-metrics true
```

## 📋 QE Framework Agent Rules

### Agent Selection Guidelines
1. **Start with swarms, not individual agents** - Use pre-configured swarms for common scenarios
2. **Follow SDLC phases** - Select agents based on current development phase
3. **Risk-based prioritization** - Always run risk-oracle early to prioritize testing
4. **Parallel execution preferred** - Run independent agents concurrently
5. **Memory sharing mandatory** - All agents must share findings via EnhancedQEMemory

### Agent Coordination Protocol
1. **Phase-based execution** - Follow QECoordinator's 5-phase workflow
2. **Quality gates** - Each phase must pass quality gates before proceeding
3. **Cross-agent communication** - Use mesh coordination for peer collaboration
4. **Result aggregation** - Hierarchical coordinators aggregate swarm results
5. **Continuous feedback** - Knowledge-curator captures learnings

### Swarm Execution Patterns
```bash
# Pattern 1: Phase-based testing
aqe orchestrate --phase requirements  # Start with requirements
aqe orchestrate --phase development   # Move to dev/TDD
aqe orchestrate --phase testing      # Comprehensive testing
aqe orchestrate --phase deployment   # Production readiness

# Pattern 2: Risk-driven testing
aqe spawn risk-oracle --task "Assess system risks"
aqe orchestrate --swarm <high-risk-swarm> --priority critical

# Pattern 3: Continuous quality
aqe spawn --swarm continuous-quality --mode background
```

### Memory Keys Convention
- `{agent}_context_{timestamp}` - Agent task context
- `{agent}_findings_{phase}` - Agent findings by phase
- `{agent}_metrics_{date}` - Daily metrics
- `swarm_{name}_results` - Swarm aggregated results
- `session_{id}_state` - Session state persistence

### Quality Gate Criteria
- **Requirements Phase**: 100% testable requirements
- **Development Phase**: 80% unit test coverage
- **Integration Phase**: All APIs contract tested
- **Testing Phase**: Zero critical bugs
- **Deployment Phase**: All smoke tests pass
- **Production Phase**: Monitoring configured

## 🎯 QE Agent Examples

### Risk Analysis with Risk Oracle
```bash
aqe spawn risk-oracle --task "Analyze authentication system for security vulnerabilities"
```

### TDD Development with Pair Programmer
```bash
aqe spawn tdd-pair-programmer --task "Implement user registration with full test coverage"
```

### Multi-Agent Quality Assessment
```bash
aqe spawn --agents risk-oracle test-architect security-sentinel \
  --task "Comprehensive security and quality assessment" \
  --parallel
```

### Exploratory Testing
```bash
aqe spawn exploratory-tester --task "Explore edge cases in payment processing flow"
```

## 🎯 Concurrent Execution Examples

### ✅ CORRECT WORKFLOW: MCP Coordinates, Claude Code Executes

```javascript
// Step 1: MCP tools set up coordination (optional, for complex tasks)
[Single Message - Coordination Setup]:
  mcp__claude-flow__swarm_init { topology: "mesh", maxAgents: 6 }
  mcp__claude-flow__agent_spawn { type: "researcher" }
  mcp__claude-flow__agent_spawn { type: "coder" }
  mcp__claude-flow__agent_spawn { type: "tester" }

// Step 2: Claude Code Task tool spawns ACTUAL agents that do the work
[Single Message - Parallel Agent Execution]:
  // Claude Code's Task tool spawns real agents concurrently
  Task("Research agent", "Analyze API requirements and best practices. Check memory for prior decisions.", "researcher")
  Task("Coder agent", "Implement REST endpoints with authentication. Coordinate via hooks.", "coder")
  Task("Database agent", "Design and implement database schema. Store decisions in memory.", "code-analyzer")
  Task("Tester agent", "Create comprehensive test suite with 90% coverage.", "tester")
  Task("Reviewer agent", "Review code quality and security. Document findings.", "reviewer")
  
  // Batch ALL todos in ONE call
  TodoWrite { todos: [
    {id: "1", content: "Research API patterns", status: "in_progress", priority: "high"},
    {id: "2", content: "Design database schema", status: "in_progress", priority: "high"},
    {id: "3", content: "Implement authentication", status: "pending", priority: "high"},
    {id: "4", content: "Build REST endpoints", status: "pending", priority: "high"},
    {id: "5", content: "Write unit tests", status: "pending", priority: "medium"},
    {id: "6", content: "Integration tests", status: "pending", priority: "medium"},
    {id: "7", content: "API documentation", status: "pending", priority: "low"},
    {id: "8", content: "Performance optimization", status: "pending", priority: "low"}
  ]}
  
  // Parallel file operations
  Bash "mkdir -p app/{src,tests,docs,config}"
  Write "app/package.json"
  Write "app/src/server.js"
  Write "app/tests/server.test.js"
  Write "app/docs/API.md"
```

### ❌ WRONG (Multiple Messages):
```javascript
Message 1: mcp__claude-flow__swarm_init
Message 2: Task("agent 1")
Message 3: TodoWrite { todos: [single todo] }
Message 4: Write "file.js"
// This breaks parallel coordination!
```

## Performance Benefits

- **84.8% SWE-Bench solve rate**
- **32.3% token reduction**
- **2.8-4.4x speed improvement**
- **27+ neural models**

## Hooks Integration

### Pre-Operation
- Auto-assign agents by file type
- Validate commands for safety
- Prepare resources automatically
- Optimize topology by complexity
- Cache searches

### Post-Operation
- Auto-format code
- Train neural patterns
- Update memory
- Analyze performance
- Track token usage

### Session Management
- Generate summaries
- Persist state
- Track metrics
- Restore context
- Export workflows

## Advanced Features (v2.0.0)

- 🚀 Automatic Topology Selection
- ⚡ Parallel Execution (2.8-4.4x speed)
- 🧠 Neural Training
- 📊 Bottleneck Analysis
- 🤖 Smart Auto-Spawning
- 🛡️ Self-Healing Workflows
- 💾 Cross-Session Memory
- 🔗 GitHub Integration

## Integration Tips

1. Start with basic swarm init
2. Scale agents gradually
3. Use memory for context
4. Monitor progress regularly
5. Train patterns from success
6. Enable hooks automation
7. Use GitHub tools first

## 🚀 NEW: MCP Server for Deep Project Analysis

The AQE Framework now includes an MCP (Model Context Protocol) server that gives QE agents **full access to analyze your project files and structure**. This solves the shallow analysis problem!

### Setting Up MCP Server

1. **Add QE MCP Server to Claude Code (Global - Works in ALL Projects):**
```bash
claude mcp add qe-framework "cd /Users/profa/coding/agentic-qe && npm run mcp"
```

2. **Start the MCP Server:**
```bash
npm run mcp:start
```

3. **Available MCP Tools in Claude Code:**
- `qe_risk_oracle` - Risk and vulnerability assessment with file access
- `qe_test_architect` - Design test strategies based on actual code
- `qe_tdd_pair_programmer` - TDD guidance with code analysis
- `qe_analyze_project` - Multi-agent comprehensive analysis
- `qe_swarm` - Coordinate multiple agents for deep testing
- ... and 45+ more specialized QE agent tools!

### Using QE Agents via MCP

When the MCP server is running, Claude Code can call QE agents with full project context:

```javascript
// In Claude Code, use the MCP tools:
qe_risk_oracle({
  task: "Analyze authentication system",
  projectPath: "/path/to/project",
  analysisDepth: "deep"
})

qe_swarm({
  objective: "Comprehensive security audit",
  strategy: "risk-based",
  maxAgents: 5
})
```

## Environment Setup for QE Agents

### Required: Anthropic API Key (for direct CLI usage)
```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

### Optional: Additional Configuration
```bash
export QE_LOG_LEVEL=info  # Logging verbosity
export QE_AGENTS_PATH=agents  # Custom agents directory
export QE_MAX_AGENTS=10  # Max concurrent agents
```

## Support

- Claude-Flow Documentation: https://github.com/ruvnet/claude-flow
- Claude-Flow Issues: https://github.com/ruvnet/claude-flow/issues
- Flow-Nexus Platform: https://flow-nexus.ruv.io (registration required for cloud features)
- AQE Framework: See local `docs/` directory

---

Remember: **Claude Flow coordinates, Claude Code creates!**

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
Never save working files, text/mds and tests to the root folder.

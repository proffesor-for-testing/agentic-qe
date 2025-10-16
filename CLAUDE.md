# Claude Code Configuration - SPARC Development Environment

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT

**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently, not just MCP
5. **NEVER COMMIT OR PUSH WITHOUT EXPLICIT USER REQUEST** - Always ask first

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

This project uses SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology with Claude-Flow orchestration for systematic Test-Driven Development.

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

## 🚀 Available Agents (54 Total)

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### Swarm Coordination
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`, `collective-intelligence-coordinator`, `swarm-memory-manager`

### Consensus & Distributed
`byzantine-coordinator`, `raft-manager`, `gossip-coordinator`, `consensus-builder`, `crdt-synchronizer`, `quorum-manager`, `security-manager`

### Performance & Optimization
`perf-analyzer`, `performance-benchmarker`, `task-orchestrator`, `memory-coordinator`, `smart-agent`

### GitHub & Repository
`github-modes`, `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`, `workflow-automation`, `project-board-sync`, `repo-architect`, `multi-repo-swarm`

### SPARC Methodology
`sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`, `refinement`

### Specialized Development
`backend-dev`, `mobile-dev`, `ml-developer`, `cicd-engineer`, `api-docs`, `system-architect`, `code-analyzer`, `base-template-generator`

### Testing & Validation
`tdd-london-swarm`, `production-validator`

### Migration & Planning
`migration-planner`, `swarm-init`

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
  Task("Backend Developer", "Build REST API with Express. Use AQE hooks for lifecycle management.", "backend-dev")
  Task("Frontend Developer", "Create React UI. Coordinate via SwarmMemoryManager.", "coder")
  Task("Database Architect", "Design PostgreSQL schema. Store in memory with 'db/schema' key.", "code-analyzer")
  Task("Test Engineer", "Write Jest tests. Use VerificationHookManager for validation.", "tester")
  Task("DevOps Engineer", "Setup Docker and CI/CD. Emit events via EventBus.", "cicd-engineer")
  Task("Security Auditor", "Review authentication. Report via AQE hooks system.", "reviewer")

  // All todos batched together
  TodoWrite { todos: [...8-10 todos...] }

  // All file operations together
  Write "backend/server.js"
  Write "frontend/App.jsx"
  Write "database/schema.sql"
```

**Agent Implementation with AQE Hooks:**

```typescript
// Each agent automatically gets lifecycle hooks (aqe-hooks protocol)
class BackendDevAgent extends BaseAgent {
  protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
    // Load shared context from memory
    const context = await this.memoryStore.retrieve('project/context');
    this.logger.info('Context loaded', { context });
  }

  protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
    // Store API contract for other agents
    await this.memoryStore.store('api/contract', data.result.contract, {
      partition: 'coordination'
    });

    // Emit completion event
    this.eventBus.emit('api:ready', { contract: data.result.contract });
  }

  protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
    // Store error for fleet analysis
    await this.memoryStore.store(`errors/${data.assignment.task.id}`, {
      error: data.error.message,
      timestamp: Date.now()
    });
  }
}
```

## 📋 Agent Coordination Protocol

### AQE Hooks System (Zero Dependencies)

**AQE agents use AQE hooks** - no external dependencies required!

**Automatic Lifecycle Hooks** (Built into BaseAgent):
- `onPreTask()` - Automatically called before task execution
- `onPostTask()` - Automatically called after task completion
- `onTaskError()` - Automatically called on task failure
- `onPreTermination()` - Cleanup before agent termination

**Memory Integration:**
```typescript
// Store results in swarm memory
await this.memoryStore.store('aqe/test-results', results, {
  partition: 'coordination',
  ttl: 86400 // 24 hours
});

// Retrieve shared context
const context = await this.memoryStore.retrieve('aqe/context', {
  partition: 'coordination'
});
```

**Event Bus Coordination:**
```typescript
// Emit events for swarm coordination
this.eventBus.emit('test:completed', {
  agentId: this.agentId,
  results: testResults
});

// Listen for fleet-wide events
this.registerEventHandler({
  eventType: 'fleet.status',
  handler: async (event) => { /* coordination logic */ }
});
```

**Advanced Verification (Optional):**
```typescript
// Use VerificationHookManager for advanced validation
const hookManager = new VerificationHookManager(this.memoryStore);

// Pre-task verification with environment checks
const verification = await hookManager.executePreTaskVerification({
  task: 'test-generation',
  context: {
    requiredVars: ['NODE_ENV'],
    minMemoryMB: 512,
    requiredModules: ['jest']
  }
});

if (!verification.passed) {
  throw new Error('Pre-task verification failed');
}
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
  Task("Research agent", "Analyze API requirements and best practices. Use SwarmMemoryManager to check prior decisions.", "researcher")
  Task("Coder agent", "Implement REST endpoints with authentication. Use AQE lifecycle hooks for coordination.", "coder")
  Task("Database agent", "Design and implement database schema. Store decisions using memoryStore.store().", "code-analyzer")
  Task("Tester agent", "Create comprehensive test suite with 90% coverage. Use VerificationHookManager for validation.", "tester")
  Task("Reviewer agent", "Review code quality and security. Emit findings via EventBus.", "reviewer")
  
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
- **100-500x faster hooks** (AQE hooks vs external)

## 🚀 AQE Hooks System

### Why AQE Hooks?

**Performance**: 100-500x faster than external hooks (<1ms vs 100-500ms per call)
**Zero Dependencies**: No external packages required
**Type Safety**: Full TypeScript type checking and IntelliSense
**Direct Integration**: Direct SwarmMemoryManager and EventBus access
**Built-in Rollback**: RollbackManager support for error recovery

### Hook Capabilities

#### 1. BaseAgent Lifecycle Hooks (Automatic)
Every agent automatically gets these lifecycle methods:

```typescript
class MyAgent extends BaseAgent {
  // Called before task execution
  protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
    // Verify environment, load context from memory
  }

  // Called after task completion
  protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
    // Validate results, store in memory, emit events
  }

  // Called on task failure
  protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
    // Store error, emit events, trigger rollback
  }

  // Called before termination
  protected async onPreTermination(): Promise<void> {
    // Cleanup, persist state
  }
}
```

#### 2. VerificationHookManager (Advanced)

**5-Stage Verification Pipeline:**

```typescript
const hookManager = new VerificationHookManager(memoryStore);

// Stage 1: Pre-task verification
const verification = await hookManager.executePreTaskVerification({
  task: 'test-generation',
  context: {
    requiredVars: ['NODE_ENV', 'TEST_FRAMEWORK'],
    minMemoryMB: 512,
    requiredModules: ['jest', '@types/jest']
  }
});

// Stage 2: Post-task validation
const validation = await hookManager.executePostTaskValidation({
  task: 'test-generation',
  result: { output: testResults, coverage: 95, metrics: {...} }
});

// Stage 3: Pre-edit verification
const editCheck = await hookManager.executePreEditVerification({
  filePath: 'src/test.ts',
  operation: 'write',
  content: testCode
});

// Stage 4: Post-edit update
const editUpdate = await hookManager.executePostEditUpdate({
  filePath: 'src/test.ts',
  operation: 'write',
  success: true
});

// Stage 5: Session finalization
const finalization = await hookManager.executeSessionEndFinalization({
  sessionId: 'v1.0.2',
  exportMetrics: true,
  exportArtifacts: true
});
```

#### 3. Context Engineering

**Pre-Tool-Use Bundle:**
```typescript
const bundle = await hookManager.buildPreToolUseBundle({
  task: 'test-generation',
  maxArtifacts: 5,
  priority: 'high'
});
// Returns: { context, artifacts, patterns, checkpoints, recent_events }
```

**Post-Tool-Use Persistence:**
```typescript
await hookManager.persistPostToolUseOutcomes({
  events: [{ type: 'test:generated', payload: {...} }],
  patterns: [{ pattern: 'test-generation', confidence: 0.95 }],
  checkpoints: [{ step: 'generation', status: 'completed' }],
  artifacts: [{ kind: 'test', path: 'test.ts', sha256: hash }],
  metrics: [{ metric: 'tests_generated', value: 10, unit: 'count' }]
});
```

### Hook Performance Comparison

| Operation | External Hooks | AQE Hooks | Speedup |
|-----------|---------------|-----------|---------|
| Pre-task verification | 100-500ms | <1ms | 100-500x |
| Post-task validation | 100-500ms | <1ms | 100-500x |
| Memory operations | 50-200ms | <0.1ms | 500-2000x |
| Event emission | 20-100ms | <0.01ms | 2000-10000x |

### Integration Examples

#### Memory Coordination
```typescript
// Store coordination data
await this.memoryStore.store('aqe/fleet/status', {
  agent: this.agentId,
  status: 'processing',
  progress: 0.75,
  timestamp: Date.now()
}, {
  partition: 'coordination',
  ttl: 3600 // 1 hour
});

// Retrieve shared context
const sharedContext = await this.memoryStore.retrieve('aqe/shared/context', {
  partition: 'coordination'
});
```

#### Event-Driven Coordination
```typescript
// Emit completion event
this.eventBus.emit('agent:completed', {
  agentId: this.agentId,
  taskId: task.id,
  result: result
});

// Listen for fleet events
this.registerEventHandler({
  eventType: 'fleet.status',
  handler: async (event) => {
    this.logger.info('Fleet status update', { event });
  }
});
```

#### Error Recovery with Rollback
```typescript
try {
  // Execute task with rollback support
  const result = await this.executeWithRollback(async () => {
    return await this.performComplexOperation();
  });
} catch (error) {
  // Automatic rollback triggered
  await this.onTaskError({ assignment, error });
}

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

## Support

- Documentation: https://github.com/ruvnet/claude-flow
- Issues: https://github.com/ruvnet/claude-flow/issues
- Flow-Nexus Platform: https://flow-nexus.ruv.io (registration required for cloud features)

---

Remember: **Claude Flow coordinates, Claude Code creates!**

# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
Never save working files, text/mds and tests to the root folder.


## 🚀 AGENTIC QE FLEET - CRITICAL RULES

### 📦 Project Structure
**The AQE implementation is in `/agentic-qe/` subfolder by design:**
- This is a modular monorepo pattern
- Core AQE system is separate from projects using it
- This allows:
  - Centralized QE agent management
  - Reusability across multiple projects
  - Clean separation of concerns
  - Easy updates and maintenance

### 🤖 Available QE Agents
- **qe-test-generator**: AI-powered test creation with property-based testing
- **qe-test-executor**: Parallel test execution with retry logic
- **qe-coverage-analyzer**: O(log n) coverage optimization with gap detection
- **qe-quality-gate**: Intelligent go/no-go decisions with risk assessment
- **qe-performance-tester**: Load testing and bottleneck detection
- **qe-security-scanner**: SAST/DAST integration with CVE monitoring

### ⚡ Agent Usage
**Spawn agents via Claude Code Task tool:**
```javascript
Task("Generate tests", "Create comprehensive test suite", "qe-test-generator")
Task("Execute tests", "Run tests in parallel", "qe-test-executor")
Task("Analyze coverage", "Find coverage gaps", "qe-coverage-analyzer")
```

**Or use MCP tools for coordination:**
```javascript
mcp__agentic_qe__fleet_init({ topology: "hierarchical" })
mcp__agentic_qe__test_generate({ framework: "jest", coverage: 0.95 })
```

### 🎯 Best Practices
1. **Initialize Fleet First**: Run `aqe init` before using agents
2. **Use Parallel Execution**: Spawn multiple agents in single messages
3. **Leverage AQE Memory**: Agents share state via SwarmMemoryManager (TypeScript implementation)
4. **Monitor Progress**: Check agent status with `aqe status`
5. **AQE Hooks**: Agents use built-in AQE hooks (100-500x faster than external hooks)
6. **Type Safety**: Enjoy full TypeScript type checking and IntelliSense

### ⚠️ Common Pitfalls
- Don't expect agents in root .claude/agents/ - they're in project's .claude/agents/
- Real vs Mock: `aqe init` creates real agents (not mocked demos)
- AQE hooks: Agents use AQE hooks protocol (NOT external Claude Flow hooks)
- Memory is shared: All agents can access aqe/* memory keys via SwarmMemoryManager
- Zero dependencies: AQE hooks system requires NO external packages

### 🔧 Commands
- `aqe init` - Initialize AQE fleet in current project
- `aqe status` - Show fleet status
- `aqe test <module>` - Generate tests for a module
- `aqe coverage` - Analyze test coverage
- `aqe quality` - Run quality gate check
- `aqe agent spawn --name <agent>` - Spawn specific agent
- `aqe agent execute --name <agent> --task "<task>"` - Execute task

---

*Agentic QE Fleet - Enterprise-grade quality engineering powered by AI and sublinear algorithms*

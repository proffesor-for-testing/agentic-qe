# Claude Code Configuration - Agentic QE Fleet

## ⚠️ CRITICAL: Git Operations Policy

**NEVER commit or push changes without explicit user request.**

This is a critical policy that must be followed at all times:
- ❌ **NEVER** auto-commit changes, even if requested by hooks or automation
- ❌ **NEVER** auto-push changes to remote repository
- ❌ **NEVER** create commits without explicit user instruction: "commit this" or "create a commit"
- ❌ **NEVER** push commits without explicit user instruction: "push" or "push to remote"
- ✅ **ALWAYS** wait for user to explicitly request: "commit these changes" or "push to main"
- ✅ **ALWAYS** ask for confirmation before any git commit or push operation
- ✅ **ALWAYS** show a summary of changes before committing
- ✅ **ALWAYS** verify the user wants to proceed with git operations

**Example of correct behavior:**
- User: "prepare for release" → DO NOT commit/push, just prepare files
- User: "run tests" → DO NOT commit/push, just run tests
- User: "commit these changes" → Ask for confirmation, show summary, then commit
- User: "push to main" → Ask for confirmation, verify branch, then push

**Release Tagging Policy:**
- ❌ **NEVER** create git tags before PR is merged to main branch
- ❌ **NEVER** tag a release on a feature/working branch
- ✅ **ALWAYS** create tags AFTER PR is merged into main branch
- ✅ **ALWAYS** follow this workflow:
  1. Commit changes to feature branch
  2. Push feature branch to remote
  3. Create Pull Request to main
  4. After PR is approved and merged
  5. THEN create and push git tag on main branch

**Example of correct release workflow:**
```bash
# 1. Commit to feature branch
git checkout -b release/v1.3.5
git add .
git commit -m "release: v1.3.5 - ..."

# 2. Push feature branch
git push origin release/v1.3.5

# 3. Create PR (using gh or GitHub UI)
gh pr create --title "Release v1.3.5" --body "..."

# 4. After PR is merged to main
git checkout main
git pull origin main

# 5. NOW create and push tag
git tag -a v1.3.5 -m "Release v1.3.5"
git push origin v1.3.5
```

This policy applies to all agents, hooks, automation, and CI/CD workflows.

## ⚠️ CRITICAL: Release Verification Policy

**ALWAYS verify release candidates with full initialization test BEFORE committing any release.**

This is a critical policy to ensure release quality:
- ❌ **NEVER** commit a release candidate (RC) without running `aqe init` verification
- ❌ **NEVER** tag a version without testing agent functionality
- ✅ **ALWAYS** create a fresh test project and run `aqe init` before any release
- ✅ **ALWAYS** verify all agents/commands/skills/config/CLAUDE.md are initialized properly
- ✅ **ALWAYS** test at least one QE agent to verify claimed features work
- ✅ **ALWAYS** document verification results before proceeding with release

**Release Verification Checklist**:
```bash
# 1. Create clean test project
mkdir /tmp/aqe-test-release && cd /tmp/aqe-test-release
npm init -y

# 2. Install release candidate
npm install /path/to/agentic-qe-cf  # or npm install agentic-qe@latest

# 3. Initialize AQE
npx aqe init

# 4. Verify initialization
ls -la .claude/agents/        # Should show all 17 QE agents
ls -la .claude/skills/        # Should show all QE skills
cat .claude/CLAUDE.md        # Should contain fleet configuration
cat .agentic-qe/config/fleet.json  # Should contain fleet config

# 5. Test agent functionality
npx aqe agent spawn qe-test-generator --task "Generate unit test for simple function"
# OR use Claude Code Task tool with qe-test-generator

# 6. Verify claimed features
# - Multi-Model Router: Check routing configuration
# - Learning System: Test aqe learn status
# - Pattern Bank: Test aqe patterns list
# - Flaky Detection: Verify agent has ML capabilities
```

**Verification Success Criteria**:
- ✅ All 17 QE agents present in `.claude/agents/`
- ✅ All QE skills present in `.claude/skills/`
- ✅ CLAUDE.md contains fleet configuration with agent descriptions
- ✅ Fleet config file exists and is valid JSON
- ✅ At least one agent successfully executes a task
- ✅ Agent uses claimed features (Learning, Pattern Bank, Multi-Model Router, etc.)
- ✅ No initialization errors or missing files

**Example of correct behavior**:
- User: "prepare release 1.3.5" → Run full verification checklist FIRST, then prepare
- User: "commit RC 1.3.5" → STOP, verify "Have you run aqe init verification?"
- User: "tag v1.3.5" → STOP, verify "Have you completed release verification checklist?"

This policy prevents releasing broken initialization or non-functional agents to users.

## ⚠️ CRITICAL: Test Execution Policy

**ALWAYS run tests in batches to avoid memory overload in constrained environments (DevPod, Codespaces, etc.).**

This is a critical policy to prevent workspace crashes:
- ❌ **NEVER** run all tests in parallel without memory constraints
- ❌ **NEVER** use `npm test` without understanding memory impact
- ✅ **ALWAYS** use batched test scripts: `npm run test:unit`, `npm run test:integration`, `npm run test:agents`, etc.
- ✅ **ALWAYS** run tests sequentially with `--runInBand` in memory-constrained environments
- ✅ **ALWAYS** monitor memory usage before running large test suites

**Example of correct behavior:**
- User: "run all tests" → Run batched: `npm run test:unit && npm run test:integration && npm run test:agents`
- User: "test everything" → Use sequential batched execution with memory limits
- ❌ BAD: `npm test` (runs all 206 tests in parallel, causes OOM)
- ✅ GOOD: `npm run test:unit` then `npm run test:integration` (batched with memory limits)

**Available Batched Test Scripts** (see package.json):
```bash
npm run test:unit              # Unit tests only (512MB limit)
npm run test:integration       # Integration tests (768MB limit)
npm run test:agents            # Agent tests (512MB limit)
npm run test:cli               # CLI tests (512MB limit)
npm run test:mcp               # MCP tests (512MB limit)
npm run test:performance       # Performance tests (1536MB limit)
npm run test:agentdb           # AgentDB tests (1024MB limit)
```

This policy prevents workspace crashes that occurred in previous sessions due to running all 206 tests simultaneously.

## 🤖 Agentic Quality Engineering Fleet

This project uses the **Agentic QE Fleet** - a distributed swarm of 17 AI agents for comprehensive software testing and quality assurance.

### Available Agents

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

## 🚀 Quick Start

### Using Agents via Claude Code Task Tool (Recommended)

\`\`\`javascript
// Spawn agents directly in Claude Code
Task("Generate tests", "Create comprehensive test suite for UserService", "qe-test-generator")
Task("Analyze coverage", "Find gaps using O(log n) algorithms", "qe-coverage-analyzer")
Task("Quality check", "Run quality gate validation", "qe-quality-gate")
\`\`\`

### Using MCP Tools

\`\`\`bash
# Check MCP connection
claude mcp list
# Should show: agentic-qe: npm run mcp:start - ✓ Connected

# Use MCP tools in Claude Code
mcp__agentic_qe__test_generate({ type: "unit", framework: "jest" })
mcp__agentic_qe__test_execute({ parallel: true, coverage: true })
mcp__agentic_qe__quality_analyze({ scope: "full" })
\`\`\`

### Using CLI

\`\`\`bash
# Quick commands
aqe test <module-name>        # Generate tests
aqe coverage                   # Analyze coverage
aqe quality                    # Run quality gate
aqe status                     # Check fleet status
\`\`\`

## 🔄 Agent Coordination

All agents coordinate through **AQE hooks** (Agentic QE native hooks - zero external dependencies, 100-500x faster):

### Automatic Lifecycle Hooks

Agents extend \`BaseAgent\` and override lifecycle methods:

\`\`\`typescript
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
    ttl: 86400 // 24 hours
  });

  // Emit completion event
  this.eventBus.emit('task:completed', {
    agentId: this.agentId,
    result: data.result
  });

  this.logger.info('Post-task hook complete');
}

protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
  // Handle task errors
  await this.memoryStore.store('aqe/errors/' + data.assignment.id, {
    error: data.error.message,
    stack: data.error.stack,
    timestamp: Date.now()
  }, {
    partition: 'errors',
    ttl: 604800 // 7 days
  });

  this.logger.error('Task failed', { error: data.error });
}
\`\`\`

### Performance Comparison

| Feature | AQE Hooks | External Hooks |
|---------|-----------|----------------|
| **Speed** | <1ms | 100-500ms |
| **Dependencies** | Zero | External package |
| **Type Safety** | Full TypeScript | Shell strings |
| **Integration** | Direct API | Shell commands |
| **Performance** | 100-500x faster | Baseline |

## 📋 Memory Namespace

Agents share state through the **\`aqe/*\` memory namespace**:

- \`aqe/test-plan/*\` - Test planning and requirements
- \`aqe/coverage/*\` - Coverage analysis and gaps
- \`aqe/quality/*\` - Quality metrics and gates
- \`aqe/performance/*\` - Performance test results
- \`aqe/security/*\` - Security scan findings
- \`aqe/swarm/coordination\` - Cross-agent coordination

## 🎯 Fleet Configuration

**Topology**: hierarchical
**Max Agents**: 10
**Testing Focus**: unit, integration
**Environments**: development
**Frameworks**: jest

## 💰 Multi-Model Router (v1.3.3)

**Status**: ⚠️  Disabled (opt-in)

The Multi-Model Router provides **70-81% cost savings** by intelligently selecting AI models based on task complexity.

### Features

- ✅ Intelligent model selection (GPT-3.5, GPT-4, Claude Sonnet 4.5, Claude Haiku)
- ✅ Real-time cost tracking and aggregation
- ✅ Automatic fallback chains for resilience
- ✅ Feature flags for safe rollout
- ✅ Zero breaking changes (disabled by default)

### Enabling Routing

**Option 1: Via Configuration**
\`\`\`json
// .agentic-qe/config/routing.json
{
  "multiModelRouter": {
    "enabled": true
  }
}
\`\`\`

**Option 2: Via Environment Variable**
\`\`\`bash
export AQE_ROUTING_ENABLED=true
\`\`\`

### Model Selection Rules

| Task Complexity | Model | Est. Cost | Use Case |
|----------------|-------|-----------|----------|
| **Simple** | GPT-3.5 | $0.0004 | Unit tests, basic validation |
| **Moderate** | GPT-3.5 | $0.0008 | Integration tests, mocks |
| **Complex** | GPT-4 | $0.0048 | Property-based, edge cases |
| **Critical** | Claude Sonnet 4.5 | $0.0065 | Security, architecture review |

### Cost Savings Example

**Before Routing** (always GPT-4):
- 100 simple tasks: $0.48
- 50 complex tasks: $0.24
- **Total**: $0.72

**After Routing**:
- 100 simple → GPT-3.5: $0.04
- 50 complex → GPT-4: $0.24
- **Total**: $0.28
- **Savings**: $0.44 (61%)

### Monitoring Costs

\`\`\`bash
# View cost dashboard
aqe routing dashboard

# Export cost report
aqe routing report --format json

# Check savings
aqe routing stats
\`\`\`

## 📊 Streaming Progress (v1.3.3)

**Status**: ✅ Enabled

Real-time progress updates for long-running operations using AsyncGenerator pattern.

### Features

- ✅ Real-time progress percentage
- ✅ Current operation visibility
- ✅ for-await-of compatibility
- ✅ Backward compatible (non-streaming still works)

### Example Usage

\`\`\`javascript
// Using streaming MCP tool
const handler = new TestExecuteStreamHandler();

for await (const event of handler.execute(params)) {
  if (event.type === 'progress') {
    console.log(\`Progress: \${event.percent}% - \${event.message}\`);
  } else if (event.type === 'result') {
    console.log('Completed:', event.data);
  }
}
\`\`\`

### Supported Operations

- ✅ Test execution (test-by-test progress)
- ✅ Coverage analysis (incremental gap detection)
- ⚠️  Test generation (coming in v1.1.0)
- ⚠️  Security scanning (coming in v1.1.0)

## 🎯 Claude Code Skills Integration

This fleet includes **34 specialized QE skills** that agents can use:

### Phase 1: Original Quality Engineering Skills (18 skills)

#### Core Testing (3 skills)
- **agentic-quality-engineering**: Using AI agents as force multipliers in quality work - autonomous testing systems, PACT principles, scaling quality engineering with intelligent agents
- **context-driven-testing**: Apply context-driven testing principles where practices are chosen based on project context, not universal "best practices"
- **holistic-testing-pact**: Apply the Holistic Testing Model evolved with PACT (Proactive, Autonomous, Collaborative, Targeted) principles

#### Testing Methodologies (4 skills)
- **tdd-london-chicago**: Apply both London and Chicago school TDD approaches - understanding different TDD philosophies and choosing the right testing style
- **xp-practices**: Apply XP practices including pair programming, ensemble programming, continuous integration, and sustainable pace
- **risk-based-testing**: Focus testing effort on highest-risk areas using risk assessment and prioritization
- **test-automation-strategy**: Design and implement comprehensive test automation strategies

#### Testing Techniques (4 skills)
- **api-testing-patterns**: Comprehensive API testing patterns including contract testing, REST/GraphQL testing, and integration testing
- **exploratory-testing-advanced**: Advanced exploratory testing techniques with Session-Based Test Management (SBTM), RST heuristics, and test tours
- **performance-testing**: Test application performance, scalability, and resilience with load testing and stress testing
- **security-testing**: Test for security vulnerabilities using OWASP principles and security testing techniques

#### Code Quality (3 skills)
- **code-review-quality**: Conduct context-driven code reviews focusing on quality, testability, and maintainability
- **refactoring-patterns**: Apply safe refactoring patterns to improve code structure without changing behavior
- **quality-metrics**: Measure quality effectively with actionable metrics and KPIs

#### Communication (3 skills)
- **bug-reporting-excellence**: Write high-quality bug reports that get fixed quickly - includes templates, examples, and best practices
- **technical-writing**: Create clear, concise technical documentation
- **consultancy-practices**: Apply effective software quality consultancy practices

### Phase 2: Expanded QE Skills Library (16 skills)

#### Testing Methodologies (6 skills)
- **regression-testing**: Strategic regression testing with test selection, impact analysis, and continuous regression management
- **shift-left-testing**: Move testing activities earlier in development lifecycle with TDD, BDD, and design for testability
- **shift-right-testing**: Testing in production with feature flags, canary deployments, synthetic monitoring, and chaos engineering
- **test-design-techniques**: Advanced test design using equivalence partitioning, boundary value analysis, and decision tables
- **mutation-testing**: Test quality validation through mutation testing and measuring test suite effectiveness
- **test-data-management**: Realistic test data generation, GDPR compliance, and data masking strategies

#### Specialized Testing (9 skills)
- **accessibility-testing**: WCAG 2.2 compliance testing, screen reader validation, and inclusive design verification
- **mobile-testing**: Comprehensive mobile testing for iOS and Android including gestures, sensors, and device fragmentation
- **database-testing**: Database schema validation, data integrity testing, migration testing, and query performance
- **contract-testing**: Consumer-driven contract testing for microservices using Pact and API versioning
- **chaos-engineering-resilience**: Chaos engineering principles, controlled failure injection, and resilience testing
- **compatibility-testing**: Cross-browser, cross-platform, and cross-device compatibility testing
- **localization-testing**: Internationalization (i18n) and localization (l10n) testing for global products
- **compliance-testing**: Regulatory compliance testing for GDPR, CCPA, HIPAA, SOC2, and PCI-DSS
- **visual-testing-advanced**: Advanced visual regression testing with AI-powered screenshot comparison and UI validation

#### Testing Infrastructure (2 skills)
- **test-environment-management**: Manage test environments, infrastructure as code, and environment provisioning
- **test-reporting-analytics**: Comprehensive test reporting with metrics, trends, and actionable insights

### Using Skills

#### Via CLI
\`\`\`bash
# List all available skills
aqe skills list

# Search for specific skills
aqe skills search "testing"

# Show skill details
aqe skills show agentic-quality-engineering

# Show skill statistics
aqe skills stats
\`\`\`

#### Via Skill Tool in Claude Code
\`\`\`javascript
// Execute a skill
Skill("agentic-quality-engineering")
Skill("tdd-london-chicago")
Skill("api-testing-patterns")
\`\`\`

#### Integration with Agents
All QE agents automatically have access to relevant skills based on their specialization:
- **Test generators** use: agentic-quality-engineering, api-testing-patterns, tdd-london-chicago
- **Coverage analyzers** use: agentic-quality-engineering, quality-metrics, risk-based-testing
- **Flaky test hunters** use: agentic-quality-engineering, exploratory-testing-advanced
- **Performance testers** use: agentic-quality-engineering, performance-testing, quality-metrics
- **Security scanners** use: agentic-quality-engineering, security-testing, risk-based-testing

## 🧠 Q-Learning Integration (Phase 2)

All agents automatically learn from task execution through Q-learning:

### Observability
\`\`\`bash
# Check learning status
aqe learn status --agent test-gen

# View learned patterns
aqe learn history --agent test-gen --limit 50

# Export learning data
aqe learn export --agent test-gen --output learning.json
\`\`\`

### Pattern Management
\`\`\`bash
# List test patterns
aqe patterns list --framework jest

# Search patterns
aqe patterns search "api validation"

# Extract patterns from tests
aqe patterns extract ./tests --framework jest
\`\`\`

### Improvement Loop
\`\`\`bash
# Start continuous improvement
aqe improve start

# Check improvement status
aqe improve status

# Run single improvement cycle
aqe improve cycle
\`\`\`

## 📚 Documentation

- **Agent Definitions**: \`.claude/agents/\` - 17 specialized QE agents
- **Skills**: \`.claude/skills/\` - 34 specialized QE skills for agents (Phase 1: 18 + Phase 2: 16)
- **Fleet Config**: \`.agentic-qe/config/fleet.json\`
- **Routing Config**: \`.agentic-qe/config/routing.json\` (Multi-Model Router settings)
- **AQE Hooks Config**: \`.agentic-qe/config/aqe-hooks.json\` (zero dependencies, 100-500x faster)

## 🔧 Advanced Usage

### Parallel Agent Execution

\`\`\`javascript
// Execute multiple agents concurrently
Task("Test Generation", "Generate unit tests", "qe-test-generator")
Task("Coverage Analysis", "Analyze current coverage", "qe-coverage-analyzer")
Task("Security Scan", "Run security checks", "qe-security-scanner")
Task("Performance Test", "Load test critical paths", "qe-performance-tester")
\`\`\`

### Agent Coordination Example

\`\`\`javascript
// Test generator stores results
Task("Generate tests", "Create tests and store in memory at aqe/test-plan/generated", "qe-test-generator")

// Test executor reads from memory
Task("Execute tests", "Read test plan from aqe/test-plan/generated and execute", "qe-test-executor")

// Coverage analyzer processes results
Task("Analyze coverage", "Check coverage from aqe/coverage/results", "qe-coverage-analyzer")
\`\`\`

## 💡 Best Practices

1. **Use Task Tool**: Claude Code's Task tool is the primary way to spawn agents
2. **Batch Operations**: Always spawn multiple related agents in a single message
3. **Memory Keys**: Use the \`aqe/*\` namespace for agent coordination
4. **AQE Hooks**: Agents automatically use native AQE hooks for coordination (100-500x faster)
5. **Parallel Execution**: Leverage concurrent agent execution for speed

## 🆘 Troubleshooting

### Check MCP Connection
\`\`\`bash
claude mcp list
\`\`\`

### View Agent Definitions
\`\`\`bash
ls -la .claude/agents/
\`\`\`

### Check Fleet Status
\`\`\`bash
aqe status --verbose
\`\`\`

### View Logs
\`\`\`bash
tail -f .agentic-qe/logs/fleet.log
\`\`\`

---

**Generated by**: Agentic QE Fleet v1.3.3
**Initialization Date**: 2025-10-26T08:08:10.902Z
**Fleet Topology**: hierarchical

---

# Claude Flow Integration (Preserved from original CLAUDE.md)

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

## 🚀 Available Claude Flow Agents (54 Total)

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

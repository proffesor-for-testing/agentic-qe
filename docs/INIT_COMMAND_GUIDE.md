# AQE Init Command - Complete Guide

## What `aqe init` Actually Does

When you run `aqe init` in your project, it performs the following actions:

### 1. Prerequisites Check
- Verifies Node.js version (18+)
- Checks if Claude-Flow is installed
- Shows warnings if Claude Code environment isn't detected (informational only)

### 2. Creates Project Structure
```
your-project/
├── agents/                      # 48 pre-built QE agent definitions
│   ├── risk-oracle/
│   │   └── agent.yaml
│   ├── exploratory-testing-navigator/
│   │   └── agent.yaml
│   ├── tdd-pair-programmer/
│   │   └── agent.yaml
│   └── ... (45 more agents)
├── .claude/                     # Claude Code integration
│   ├── agents/qe/              # Agent markdown definitions for Claude
│   │   ├── test-planner.md
│   │   ├── test-generator.md
│   │   ├── test-runner.md
│   │   └── ... (more agent docs)
│   ├── commands/qe/            # Command integrations
│   │   ├── qe-commands.yaml
│   │   └── integration.md
│   ├── configs/qe/             # Configuration files
│   └── hooks/qe/               # Lifecycle hooks
├── docs/                       # Documentation
│   ├── INSTALLATION_GUIDE.md
│   └── EVIDENCE_OF_AGENT_RUNS.md
└── qe.config.json              # Framework configuration
```

### 3. Copies All Agent Definitions
- **48 pre-built agents** are copied to your project's `agents/` directory
- Each agent includes:
  - YAML configuration
  - System prompts
  - Capabilities
  - PACT level definitions
  - Tools and permissions

### 4. Sets Up Claude Integration
- Copies `.claude/agents/qe/` with agent markdown documentation
- Copies `.claude/commands/qe/` with command mappings
- Copies `.claude/configs/qe/` with configurations
- Copies `.claude/hooks/qe/` with lifecycle hooks

### 5. Creates Configuration File
Creates `qe.config.json` with:
```json
{
  "version": "1.0.0",
  "agentsPath": "agents",
  "claudeAgentsPath": ".claude/agents/qe",
  "claudeCommandsPath": ".claude/commands/qe",
  "swarm": {
    "topology": "mesh",
    "strategy": "balanced",
    "maxAgents": 10
  },
  "logging": {
    "level": "info",
    "file": "qe.log"
  },
  "claude_flow": {
    "enabled": false,
    "auto_spawn": true,
    "coordination_hooks": true
  }
}
```

## After Running `aqe init`

### You Can Immediately:
```bash
# List all 48 available agents
aqe list

# See agent statistics
aqe list --stats

# Run any agent
aqe spawn --agents risk-oracle --task "Analyze my project"
aqe spawn --agents tdd-pair-programmer --task "Create unit tests"
aqe spawn --agents exploratory-testing-navigator --task "Test user flows"

# Run multiple agents in parallel
aqe spawn --agents risk-oracle --agents code-review-swarm --parallel --task "Complete analysis"
```

### Available Agents Include:

#### Quality Engineering Agents (24):
- `risk-oracle` - Risk assessment and prediction
- `exploratory-testing-navigator` - Exploratory testing with RST methodology
- `tdd-pair-programmer` - Test-driven development assistant
- `requirements-explorer` - Requirements analysis
- `deployment-guardian` - Deployment safety checks
- `production-observer` - Production monitoring
- And 18 more...

#### Development Agents (6):
- `code-review-swarm` - Multi-agent code review
- `pr-manager` - Pull request management
- `issue-tracker` - Issue management
- `release-manager` - Release coordination
- `workflow-automation` - CI/CD automation
- `github-modes` - GitHub integration

#### Coordination Agents (5):
- `adaptive-coordinator` - Dynamic swarm coordination
- `hierarchical-coordinator` - Hierarchical swarm management
- `mesh-coordinator` - Peer-to-peer coordination
- `swarm-init` - Swarm initialization
- `task-orchestrator` - Task orchestration

#### Consensus Agents (5):
- `byzantine-coordinator` - Byzantine fault tolerance
- `raft-manager` - Raft consensus
- `gossip-coordinator` - Gossip protocol
- `quorum-manager` - Quorum management
- `crdt-synchronizer` - CRDT synchronization

## Common Issues and Solutions

### "No agents found"
This means `aqe init` wasn't run or didn't complete successfully:
```bash
# Re-run init with force flag
aqe init --force

# Verify agents were copied
ls agents/
# Should show 48 agent directories
```

### "Claude Code environment not detected"
This is just a warning. The framework will still work, but agent execution requires Claude Code to be running.

### "Claude-Flow disabled"
This means Claude-Flow isn't enabled in the config. To enable:
1. Install Claude-Flow: `claude mcp add claude-flow npx claude-flow@alpha mcp start`
2. Initialize swarm: `npx claude-flow@alpha swarm init --topology mesh`
3. Edit `qe.config.json` and set `claude_flow.enabled: true`

## Interactive Mode
For guided setup:
```bash
aqe init -i
```
This will prompt you for:
- Agents directory path
- Swarm topology
- Maximum agents
- Claude-Flow integration
- Logging configuration

## Force Reinitialize
To override existing configuration:
```bash
aqe init --force
```

## Custom Paths
```bash
aqe init \
  --agents-path "./my-agents" \
  --swarm-topology hierarchical \
  --max-agents 20
```

## What You Get Out of the Box

After running `aqe init`, you have:
1. **48 fully-configured QE agents** ready to use
2. **Claude Code integration** for AI-powered execution
3. **Complete documentation** in the docs folder
4. **Example usage scripts** to get started
5. **Full CLI commands** for agent management

No additional setup needed - just run `aqe spawn` to start using agents!
# Agentic QE Framework - Installation & Usage Guide

## 🔴 IMPORTANT: Prerequisites Required

The Agentic QE Framework is built on top of two essential components:

### 1. Claude Code (REQUIRED)
Claude Code provides the AI agent execution engine. Without it, agents cannot run.
- **Install**: Download Claude desktop app from [claude.ai](https://claude.ai)
- **Verify**: Ensure Claude Code is active in your Claude desktop app
- **Purpose**: Executes AI agents using LLM capabilities

### 2. Claude-Flow (REQUIRED)
Claude-Flow provides orchestration and coordination for multi-agent swarms.
- **Install**:
  ```bash
  # Add Claude-Flow MCP server
  claude mcp add claude-flow npx claude-flow@alpha mcp start

  # Verify installation
  npx claude-flow@alpha --version

  # Initialize swarm (one-time setup)
  npx claude-flow@alpha swarm init --topology mesh --max-agents 10
  ```
- **Purpose**: Manages parallel agent execution, memory, and coordination

### 3. Node.js 18+
```bash
node --version  # Should be v18.0.0 or higher
```

## ⚠️ Without These Prerequisites
- **Without Claude Code**: Agents will not execute (no AI engine)
- **Without Claude-Flow**: No parallel execution, coordination, or swarm features
- **Without proper setup**: `aqe init` may timeout or fail

## 🚀 Installation Steps

### Step 1: Verify Prerequisites
```bash
# Use the built-in status command to check everything
aqe status

# Or use the prerequisites check script
./scripts/check-prerequisites.sh

# Manual checks:
node --version  # Must be v18+
npx claude-flow@alpha --version
npx claude-flow@alpha swarm status
```

### Step 2: Install Agentic QE Framework

#### Option A: NPM Installation (Recommended)
```bash
# Install globally
npm install -g agentic-qe

# Or use with npx (no installation needed)
npx agentic-qe init

# Verify installation
aqe --version
```

#### Option B: Install from GitHub
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

### Step 3: Use in Any Project
Now you can use it anywhere:
```bash
cd /path/to/your/project
aqe init              # Initialize QE framework
aqe list              # List available agents
aqe spawn --agents risk-oracle --task "Test my API"
```

## Alternative Installation Options

### Option 1: Link to Specific Project
From the agentic-qe source directory:
```bash
cd /path/to/agentic-qe
npm link

# In your target project:
cd /path/to/your/project
npm link agentic-qe
npx aqe init
```

### Option 2: Install from Local Path
In your project's package.json:
```json
{
  "dependencies": {
    "agentic-qe": "file:../path/to/agentic-qe"
  }
}
```

Then:
```bash
npm install
npx aqe init
```

## Option 4: Install from Git (Once Published)

```bash
npm install github:yourusername/agentic-qe
npx aqe init
```

## 🎯 What `aqe init` Does

### Prerequisites Check
Before initialization, `aqe init` will:
1. Check if CLAUDE.md exists (Claude Code configuration)
2. Check if AQE is already initialized in the project
3. Check if Claude-Flow is installed and accessible
4. Verify Node.js version is 18+
5. Display project status and installation instructions if needed

### Initialization Process

When you run `aqe init`, it will:

1. **Create Configuration File** (`qe.config.json`)
   - Sets up agents path (default: `agents/`)
   - Configures Claude integration paths
   - Sets swarm topology and settings
   - Configures logging

2. **Create Complete Project Structure**
   ```
   your-project/
   ├── CLAUDE.md                # Claude Code configuration (create this first)
   ├── agents/                  # 48 QE agent definitions (copied from framework)
   │   ├── risk-oracle/
   │   ├── exploratory-testing-navigator/
   │   ├── tdd-pair-programmer/
   │   └── ... (45 more agents)
   ├── .claude/                 # Claude Code integration
   │   ├── agents/qe/          # Agent documentation
   │   ├── commands/qe/        # Command mappings
   │   └── hooks/qe/           # Lifecycle hooks
   ├── docs/                    # Documentation
   └── qe.config.json          # Configuration file
   ```

3. **Initialize Claude-Flow Integration** (if available)
   - Sets up swarm topology (mesh, hierarchical, ring, or star)
   - Configures max agents
   - Enables coordination hooks

4. **Create Example Agent**
   - Creates `agents/example-tester/agent.yaml`
   - Provides a working template

5. **Generate Usage Examples**
   - Creates `examples.sh` with common commands

## Expected Output

### Successful Initialization:
```
📋 Project Status:
  ✅ Claude Code is configured in this project
  ✅ 48 agents found in project

✔ Checking prerequisites
✔ Copying agent definitions and Claude integration
✔ QE Framework initialized successfully

✅ QE Framework initialized successfully
📊 Summary:
  Agents loaded: 48
  Claude-Flow: Disabled (can be enabled in config)
  Configuration: qe.config.json
```

### Interactive Mode:
```bash
aqe init -i
```
This will prompt you for:
- Agents directory path
- Swarm topology (mesh, hierarchical, ring, star)
- Swarm strategy (balanced, specialized, adaptive)
- Maximum agents
- Claude-Flow integration
- Neural features
- Logging level

### Force Reinitialize:
```bash
aqe init --force
```

### With Custom Paths:
```bash
aqe init \
  --agents-path "./my-agents" \
  --claude-agents-path "./.claude/agents/custom" \
  --swarm-topology mesh \
  --max-agents 20
```

## 🔧 Troubleshooting

### "Prerequisites not met"
This means Claude-Flow or other dependencies are missing:
```bash
# Install Claude-Flow MCP
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Initialize Claude-Flow swarm
npx claude-flow@alpha swarm init --topology mesh

# Retry initialization
aqe init
```

### "Command not found: aqe"
- Run `npm link` in the agentic-qe directory first
- Or use the full path: `/Users/profa/coding/agentic-qe/bin/aqe init`

### "QE Framework already initialized"
- Use `--force` flag to override
- Or delete `qe.config.json` and try again

### No Agents Loading
- Ensure the agents directory exists
- Check that agent YAML files are valid
- Run `aqe list` to see available agents

### Claude-Flow Initialization Fails
- This is optional and won't block initialization
- Install Claude-Flow separately: `npm install -g @alpha/claude-flow`

## Quick Test After Init

```bash
# 1. Check complete system status
aqe status
# Shows: Claude Code config, agents loaded, Claude-Flow status, etc.

# 2. List all 48 available agents
aqe list

# 3. Run your first agent
aqe spawn --agents risk-oracle --task "Analyze my project"

# 4. Run multiple agents in parallel
aqe spawn --agents risk-oracle --agents tdd-pair-programmer --parallel --task "Complete QE analysis"
```

## Publishing to NPM (For Maintainers)

To make this package available via `npx` globally:

1. Create npm account and login:
```bash
npm login
```

2. Update package.json with your scope:
```json
{
  "name": "@yourscope/agentic-qe",
  "publishConfig": {
    "access": "public"
  }
}
```

3. Publish:
```bash
npm publish
```

Then users can run:
```bash
npx @yourscope/agentic-qe init
```

## 🎯 Complete Setup Guide

### Full Installation from Scratch:
```bash
# 1. Install Claude desktop app
# Visit: https://claude.ai and download the desktop app

# 2. Install Claude-Flow MCP
claude mcp add claude-flow npx claude-flow@alpha mcp start

# 3. Initialize Claude-Flow swarm
npx claude-flow@alpha swarm init --topology mesh --max-agents 10

# 4. Clone and install Agentic QE
git clone https://github.com/yourusername/agentic-qe.git
cd agentic-qe
npm install
npm run build
npm link

# 5. Verify installation
aqe --version

# 6. Create a new project and initialize
mkdir my-qe-project
cd my-qe-project
aqe init

# 7. Test with an agent
aqe spawn --agents example-tester --task "Test my application"
```

## 📝 Important Notes

1. **Claude Code Requirement**: The framework requires Claude Code to execute agents. Without it, agent spawning will fail.

2. **Claude-Flow Requirement**: Claude-Flow provides the orchestration layer. Without it:
   - No parallel agent execution
   - No swarm coordination
   - No memory persistence
   - Limited to sequential execution only

3. **Order of Installation**:
   1. First: Claude Code (desktop app)
   2. Second: Claude-Flow MCP server
   3. Third: Agentic QE Framework

4. **Verification**: Always run `aqe init` with the `-i` flag for interactive setup if you encounter issues.
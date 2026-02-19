# Claude Code Configuration - Claude Flow V3

## Behavioral Rules (Always Enforced)

- Do what has been asked; nothing more, nothing less
- NEVER create files unless they're absolutely necessary for achieving your goal
- ALWAYS prefer editing an existing file to creating a new one
- NEVER proactively create documentation files (*.md) or README files unless explicitly requested
- NEVER save working files, text/mds, or tests to the root folder
- Never continuously check status after spawning a swarm — wait for results
- ALWAYS read a file before editing it
- NEVER commit secrets, credentials, or .env files

## File Organization

- NEVER save to root folder — use the directories below
- Use `/src` for source code files
- Use `/tests` for test files
- Use `/docs` for documentation and markdown files
- Use `/config` for configuration files
- Use `/scripts` for utility scripts
- Use `/examples` for example code

## Project Architecture

- Follow Domain-Driven Design with bounded contexts
- Keep files under 500 lines
- Use typed interfaces for all public APIs
- Prefer TDD London School (mock-first) for new code
- Use event sourcing for state changes
- Ensure input validation at system boundaries

### Project Config

- **Topology**: hierarchical-mesh
- **Max Agents**: 15
- **Memory**: hybrid
- **HNSW**: Enabled
- **Neural**: Enabled

## AQE Project Scope

- This project contains ~75 AQE/QE skills and separate Claude Flow platform skills
- When working with skills, ALWAYS distinguish between AQE/QE skills and Claude Flow platform skills
- Only count/modify AQE skills unless explicitly told otherwise — do NOT include Claude Flow platform skills
- AQE skills live under `.claude/skills/` but exclude platform infrastructure skills (v3-*, flow-nexus-*, agentdb-*, reasoningbank-*, swarm-*)

## Database Architecture

- v2 database tables are LEGACY — do NOT use them. All work must target v3 tables only
- Unified persistence system: all data goes through v3 SQLite (better-sqlite3) — one DB, one schema
- If you encounter v2 table references in code, flag them for migration to v3

## Build & Test

```bash
# Build
npm run build

# Test
npm test

# Lint
npm run lint
```

- ALWAYS run tests after making code changes
- ALWAYS verify build succeeds before committing
- NEVER simulate or mock tests when asked to run tests — always run real commands against the actual codebase unless explicitly told to simulate
- When debugging, always reproduce with real commands first — do not guess at root causes
- Use `/debug-loop` skill for hypothesis-driven autonomous debugging

## Production Safety

- Before modifying adapter code or any module used in production, explain the change and its production impact before applying it
- Wait for user confirmation on changes that could affect live users or published packages
- When fixing bugs, grep for ALL instances of the problematic pattern across the entire codebase before patching — never assume a value only appears in one place

## Bug Fix Verification (Mandatory)

- **Reproduction-First**: Before closing any bug, run the **exact reproduction steps** from the issue on a real project — not just unit tests
- **MCP-CLI Parity**: Every fix that touches a CLI code path MUST also be verified via MCP (and vice versa). The two paths diverge frequently.
- **No Batch-Close Without Per-Issue Verification**: A single commit can fix multiple issues, but each issue needs its own reproduction test
- **Smoke Test Before Release**: Run the top MCP tools and CLI commands against a fixture project before tagging a release. If any crash or return empty/fabricated data, block the release.
- **Never Claim Fixed Without Evidence**: Post the actual output (command + result) in the issue/PR before marking fixed
- **Integration Tests Required for MCP**: Unit tests of handler functions are insufficient. MCP fixes must be verified by making real MCP tool calls through the protocol server.

## Releases & Publishing

- When bumping versions or referencing version strings, grep the entire codebase for hardcoded version numbers (e.g., '3.0.0', '3.5.0') and update ALL occurrences
- Never assume version is only in package.json — always read version from package.json as the source of truth
- Use `/release` skill for the full release workflow

### npm Publish Process (MUST FOLLOW)

1. **Merge PR** to main
2. **Checkout main** and pull latest
3. **Build** (`npm run build`) — verify success
4. **Create GitHub Release** with `gh release create vX.Y.Z --target main` — this triggers the `npm-publish.yml` workflow automatically
5. **Monitor** `npm-publish.yml` workflow (NOT `publish-v3-alpha.yml` — that is for alpha/beta only)
6. **Verify** on npmjs.com after workflow succeeds

- **CRITICAL**: The production publish workflow is `.github/workflows/npm-publish.yml` — triggered by `on: release: [published]`
- **DO NOT** use `publish-v3-alpha.yml` for production releases — it publishes `@agentic-qe/v3` (scoped alpha), not `agentic-qe` (root package)
- **DO NOT** run `npm publish` locally or attempt manual publish steps
- **DO NOT** run local tests in Codespace if they OOM — CI tests in the workflow are sufficient
- If publish fails due to test assertions, fix tests, push to main, delete release + tag, recreate both

## PR & Git Conventions

- PR descriptions should be user-friendly and outcome-focused, not overly technical
- Focus on what changed and why, not implementation internals
- Trust tier assignments: tier 3 = has eval infrastructure, tier 2 = tested but no eval, tier 1 = untested
- Use `/pr-review` skill for structured PR reviews

## Security Rules

- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit .env files or any file containing secrets
- Always validate user input at system boundaries
- Always sanitize file paths to prevent directory traversal
- Run `npx @claude-flow/cli@latest security scan` after security-related changes

## Concurrency: 1 MESSAGE = ALL RELATED OPERATIONS

- All operations MUST be concurrent/parallel in a single message
- Use Claude Code's Task tool for spawning agents, not just MCP
- ALWAYS batch ALL todos in ONE TodoWrite call (5-10+ minimum)
- ALWAYS spawn ALL agents in ONE message with full instructions via Task tool
- ALWAYS batch ALL file reads/writes/edits in ONE message
- ALWAYS batch ALL Bash commands in ONE message

## Swarm Orchestration

- MUST initialize the swarm using CLI tools when starting complex tasks
- MUST spawn concurrent agents using Claude Code's Task tool
- Never use CLI tools alone for execution — Task tool agents do the actual work
- MUST call CLI tools AND Task tool in ONE message for complex work

### 3-Tier Model Routing (ADR-026)

| Tier | Handler | Latency | Cost | Use Cases |
|------|---------|---------|------|-----------|
| **1** | Agent Booster (WASM) | <1ms | $0 | Simple transforms (var→const, add types) — Skip LLM |
| **2** | Haiku | ~500ms | $0.0002 | Simple tasks, low complexity (<30%) |
| **3** | Sonnet/Opus | 2-5s | $0.003-0.015 | Complex reasoning, architecture, security (>30%) |

- Always check for `[AGENT_BOOSTER_AVAILABLE]` or `[TASK_MODEL_RECOMMENDATION]` before spawning agents
- Use Edit tool directly when `[AGENT_BOOSTER_AVAILABLE]`

## Swarm Configuration & Anti-Drift

- ALWAYS use hierarchical topology for coding swarms
- Keep maxAgents at 6-8 for tight coordination
- Use specialized strategy for clear role boundaries
- Use `raft` consensus for hive-mind (leader maintains authoritative state)
- Run frequent checkpoints via `post-task` hooks
- Keep shared memory namespace for all agents

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

## Swarm Execution Rules

- ALWAYS use `run_in_background: true` for all agent Task calls
- ALWAYS put ALL agent Task calls in ONE message for parallel execution
- After spawning, STOP — do NOT add more tool calls or check status
- Never poll TaskOutput or check swarm status — trust agents to return
- When agent results arrive, review ALL results before proceeding

## V3 CLI Commands

### Core Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `init` | 4 | Project initialization |
| `agent` | 8 | Agent lifecycle management |
| `swarm` | 6 | Multi-agent swarm coordination |
| `memory` | 11 | AgentDB memory with HNSW search |
| `task` | 6 | Task creation and lifecycle |
| `session` | 7 | Session state management |
| `hooks` | 17 | Self-learning hooks + 12 workers |
| `hive-mind` | 6 | Byzantine fault-tolerant consensus |

### Quick CLI Examples

```bash
npx @claude-flow/cli@latest init --wizard
npx @claude-flow/cli@latest agent spawn -t coder --name my-coder
npx @claude-flow/cli@latest swarm init --v3-mode
npx @claude-flow/cli@latest memory search --query "authentication patterns"
npx @claude-flow/cli@latest doctor --fix
```

## Available Agents (60+ Types)

### Core Development
`coder`, `reviewer`, `tester`, `planner`, `researcher`

### Specialized
`security-architect`, `security-auditor`, `memory-specialist`, `performance-engineer`

### Swarm Coordination
`hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator`

### GitHub & Repository
`pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager`

### SPARC Methodology
`sparc-coord`, `sparc-coder`, `specification`, `pseudocode`, `architecture`

## Memory Commands Reference

```bash
# Store (REQUIRED: --key, --value; OPTIONAL: --namespace, --ttl, --tags)
npx @claude-flow/cli@latest memory store --key "pattern-auth" --value "JWT with refresh" --namespace patterns

# Search (REQUIRED: --query; OPTIONAL: --namespace, --limit, --threshold)
npx @claude-flow/cli@latest memory search --query "authentication patterns"

# List (OPTIONAL: --namespace, --limit)
npx @claude-flow/cli@latest memory list --namespace patterns --limit 10

# Retrieve (REQUIRED: --key; OPTIONAL: --namespace)
npx @claude-flow/cli@latest memory retrieve --key "pattern-auth" --namespace patterns
```

## Quick Setup

```bash
claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
npx @claude-flow/cli@latest daemon start
npx @claude-flow/cli@latest doctor --fix
```

## Claude Code vs CLI Tools

- Claude Code's Task tool handles ALL execution: agents, file ops, code generation, git
- CLI tools handle coordination via Bash: swarm init, memory, hooks, routing
- NEVER use CLI tools as a substitute for Task tool agents

## Support

- Documentation: https://github.com/ruvnet/claude-flow
- Issues: https://github.com/ruvnet/claude-flow/issues

# V3 Init Requirements Analysis

**Date:** 2026-01-11
**Purpose:** Deep analysis of what V3 `aqe init` must create vs V2

## Executive Summary

V3 has fundamentally different architecture than V2:
- **V3 uses MCP tools** instead of slash commands
- **V3 uses DDD bounded contexts** (12 domains) instead of flat agent definitions
- **V3 uses HNSW vector search** instead of linear SQLite search
- **V3 uses background workers** instead of one-time helper scripts

This means many V2 components are **obsolete** and should NOT be created by V3 init.

---

## V2 vs V3 Init Comparison

### Directory Structure Created

| Component | V2 Creates | V3 Creates | V3 Needs |
|-----------|------------|------------|----------|
| `.agentic-qe/config.yaml` | ❌ | ✅ | ✅ Yes |
| `.agentic-qe/memory.db` | ✅ | ❌ | ✅ Yes (patterns.db) |
| `.agentic-qe/data/` | ✅ | ✅ | ✅ Yes |
| `.agentic-qe/data/hnsw/` | ❌ | ✅ | ✅ Yes |
| `.agentic-qe/workers/` | ❌ | ✅ | ✅ Yes |
| `.agentic-qe/docs/` | ✅ | ❌ | ❌ No (skills have docs) |
| `.agentic-qe/agents/` | ✅ | ❌ | ❌ No (uses DDD domains) |
| `.claude/settings.json` | ✅ | ✅ | ✅ Yes |
| `.claude/mcp.json` | ✅ | ❌ | ✅ Yes |
| `.claude/agents/v3/` | ❌ | ✅ (59 files) | ✅ Yes (V3 QE agents) |
| `.claude/agents/` (v2) | ✅ (24 files) | ❌ | ❌ No (replaced by v3) |
| `.claude/commands/` | ✅ (9 files) | ❌ | ❌ No (MCP tools replace) |
| `.claude/helpers/` | ✅ (38 files) | ❌ | ⚠️ Partial (few still useful) |
| `.claude/skills/` | ✅ (46 files) | ✅ (64 files) | ✅ Yes |
| `CLAUDE.md` | ✅ | ❌ | ✅ Yes |

### Component Analysis

#### 1. Slash Commands (V2: 9 commands) → **OBSOLETE**

V2 slash commands are replaced by MCP tools:

| V2 Command | V3 Replacement |
|------------|----------------|
| `/aqe-execute` | `mcp__agentic-qe-v3__test_execute_parallel` |
| `/aqe-generate` | `mcp__agentic-qe-v3__test_generate_enhanced` |
| `/aqe-coverage` | `mcp__agentic-qe-v3__coverage_analyze_sublinear` |
| `/aqe-analyze` | `mcp__agentic-qe-v3__quality_assess` |
| `/aqe-report` | `mcp__agentic-qe-v3__test_report_comprehensive` |
| `/aqe-chaos` | `mcp__agentic-qe-v3__chaos_test` |
| `/aqe-fleet-status` | `mcp__agentic-qe-v3__fleet_status` |
| `/aqe-optimize` | V3 quality-assessment domain |
| `/aqe-benchmark` | V3 performance testing |
| `/aqe-costs` | V3 metrics |

**Conclusion:** V3 does NOT need `.claude/commands/` directory.

#### 2. Agent Definitions (V2: 24 agents vs V3: 59 agents)

V2 created agent markdown files in `.claude/agents/`. **V3 also needs agents** but with a new structure:

**V2 Agents (OBSOLETE):** 24 flat agent definitions
**V3 QE Agents (REQUIRED):** V3 QE agents (v3-qe-*) in `.claude/agents/v3/`

**V3 Agent Categories:**
- **40 V3 QE Domain Agents:** Mapped to 12 DDD bounded contexts (v3-qe-*)
- **7 V3 Subagents:** TDD (red/green/refactor) and code review specialists (v3-qe-*)

**NOT Installed (Claude-Flow Agents):**
Core agents like `adr-architect`, `claims-authorizer`, `memory-specialist`, `security-architect`, etc. are **claude-flow** agents, not AQE agents. They use `mcp__claude-flow__*` tools and are available via claude-flow separately.

**V3 Agents by Domain:**
```
test-generation:     v3-qe-test-architect, v3-qe-bdd-generator, v3-qe-property-tester, v3-qe-mutation-tester
test-execution:      v3-qe-parallel-executor, v3-qe-flaky-hunter, v3-qe-retry-handler
coverage-analysis:   v3-qe-coverage-specialist, v3-qe-gap-detector
quality-assessment:  v3-qe-quality-gate, v3-qe-code-complexity, v3-qe-deployment-advisor, v3-qe-risk-assessor
defect-intelligence: v3-qe-defect-predictor, v3-qe-regression-analyzer, v3-qe-root-cause-analyzer
code-intelligence:   v3-qe-code-intelligence, v3-qe-kg-builder, v3-qe-dependency-mapper
security-compliance: v3-qe-security-scanner, v3-qe-security-auditor
contract-testing:    v3-qe-contract-validator, v3-qe-graphql-tester
visual-accessibility: v3-qe-visual-tester, v3-qe-accessibility-auditor, v3-qe-responsive-tester
chaos-resilience:    v3-qe-chaos-engineer, v3-qe-load-tester, v3-qe-performance-tester
learning-optimization: v3-qe-learning-coordinator, v3-qe-pattern-learner, v3-qe-metrics-optimizer
(+ fleet coordination, TDD specialist, etc.)
```

**Conclusion:** V3 DOES need `.claude/agents/v3/` directory with V3 QE agents. These are used via:
1. Task tool with subagent_type (e.g., `v3-qe-test-architect`)
2. MCP tools for specific functions
3. Skills for methodology guidance

#### 3. Helper Scripts (V2: 38 scripts) → **MOSTLY OBSOLETE**

| Helper | V2 Purpose | V3 Status |
|--------|------------|-----------|
| `statusline*.js/cjs` | Status display | ✅ Keep (useful) |
| `learning-*.sh/mjs` | Learning hooks | ❌ Replaced by workers |
| `router.js` | Task routing | ❌ Replaced by V3 routing |
| `memory.js` | Memory operations | ❌ Replaced by V3 backend |
| `session.js` | Session management | ⚠️ May need equivalent |
| `daemon-manager.sh` | Background daemon | ❌ Replaced by V3 workers |
| `swarm-*.sh` | Swarm coordination | ❌ Replaced by MCP tools |
| `health-monitor.sh` | Health checks | ⚠️ May need equivalent |
| `pre-commit/post-commit` | Git hooks | ✅ Keep (if CI enabled) |
| `github-*.sh/js` | GitHub ops | ❌ Use gh CLI directly |
| `*-v3-*.sh` | V3 specific | ❌ Development only |

**Helpers to Keep:**
1. `statusline.js` - Status display in terminal
2. `pre-commit` / `post-commit` - Git hooks (optional)

**Conclusion:** V3 needs minimal helpers (2-3 vs 38).

#### 4. CLAUDE.md → **REQUIRED**

V3 MUST create a `CLAUDE.md` file that:
1. Documents the V3 architecture (12 DDD domains)
2. Lists available MCP tools
3. Documents memory namespace conventions
4. Provides quick-start examples

---

## What V3 Init MUST Create

### Critical (Required)

1. **`.agentic-qe/config.yaml`** ✅ Already implemented
   - Project configuration
   - Learning settings
   - Worker configuration
   - Domain enablement

2. **`.agentic-qe/data/patterns.db`** ❌ MISSING
   - SQLite database for pattern storage
   - HNSW index for vector search
   - Must be initialized with schema

3. **`.agentic-qe/data/hnsw/`** ✅ Already created (empty)
   - Directory for HNSW index files
   - Populated at runtime

4. **`.agentic-qe/workers/`** ✅ Already implemented
   - Worker registry
   - Worker configurations
   - Daemon start script

5. **`.claude/settings.json`** ✅ Already implemented
   - Hook configurations
   - AQE metadata

6. **`.claude/mcp.json`** ❌ MISSING
   - MCP server definition for V3
   - Tool endpoint configuration

7. **`CLAUDE.md`** ❌ MISSING
   - Project-specific V3 configuration
   - Quick reference for agents/tools

8. **`.claude/skills/`** ✅ Already implemented
   - V2 methodology skills (best practices)
   - V3 domain skills (implementation guides)
   - Platform skills (framework-specific)

### Optional (Based on Configuration)

1. **Git hooks** (if `hooks.preCommit: true`)
   - `.git/hooks/pre-commit`
   - `.git/hooks/post-commit`

2. **CI integration** (if `hooks.ciIntegration: true`)
   - GitHub Actions workflow file
   - Quality gate configuration

---

## V3 Init Modes

### Auto Mode (`aqe init --auto` or `-y`)

Quick initialization with intelligent defaults:
1. Analyze project (frameworks, languages, tests)
2. Apply configuration rules (14 rules)
3. Create all required files
4. Start background workers

### Interactive Mode (`aqe init`)

Step-by-step wizard:
1. Welcome
2. Project type selection
3. Learning mode selection
4. Pre-trained patterns confirmation
5. Hooks configuration
6. Workers configuration
7. Skills installation
8. Summary

**Both modes should create identical output** - only the configuration values may differ.

---

## Implementation Gaps

### 1. Database Initialization (HIGH PRIORITY)

V3 init creates `learning-config.json` but NOT the actual database.

**Required:** Create `patterns.db` with schema:
```sql
CREATE TABLE patterns (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,  -- For HNSW
  confidence REAL DEFAULT 0.5,
  usage_count INTEGER DEFAULT 0,
  success_rate REAL DEFAULT 0.0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE routing_history (
  id TEXT PRIMARY KEY,
  task TEXT NOT NULL,
  agent TEXT NOT NULL,
  success INTEGER,
  feedback TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_patterns_domain ON patterns(domain);
CREATE INDEX idx_patterns_confidence ON patterns(confidence);
```

### 2. CLAUDE.md Generation (HIGH PRIORITY)

V3 needs project-specific `CLAUDE.md` with:

```markdown
# Agentic QE v3 Configuration

## Quick Reference

**Domains Enabled:** test-generation, coverage-analysis, ...
**MCP Tools:** 25 tools available
**Skills:** 64 skills installed

## MCP Tools

### Test Generation
- `mcp__agentic-qe-v3__test_generate_enhanced`
- `mcp__agentic-qe-v3__test_execute_parallel`

### Coverage Analysis
- `mcp__agentic-qe-v3__coverage_analyze_sublinear`

...

## Memory Namespace

- `aqe/patterns/*` - Learned patterns
- `aqe/coverage/*` - Coverage data
- `aqe/quality/*` - Quality metrics

## Agent Spawn Examples

```javascript
Task("Generate tests", "...", "v3-qe-test-generator")
Task("Analyze coverage", "...", "v3-qe-coverage-analyzer")
```
```

### 3. MCP Configuration (MEDIUM PRIORITY)

Create `.claude/mcp.json`:
```json
{
  "servers": {
    "agentic-qe-v3": {
      "command": "npx",
      "args": ["@agentic-qe/v3", "mcp", "serve"],
      "env": {
        "AQE_PROJECT_ROOT": "${workspaceRoot}"
      }
    }
  }
}
```

---

## Recommendations

### Do NOT Implement

1. ❌ `.claude/commands/` - MCP tools replace slash commands
2. ❌ `.claude/agents/` - Task tool uses built-in agents
3. ❌ `.claude/helpers/` (most) - Workers replace helpers
4. ❌ `.agentic-qe/docs/` - Skills have embedded docs
5. ❌ V2-style flat agent definitions

### DO Implement

1. ✅ Database initialization with proper schema
2. ✅ CLAUDE.md with V3-specific content
3. ✅ MCP configuration file
4. ✅ Optional statusline helper (for terminal)
5. ✅ Optional git hooks (if enabled)

---

## Summary

V3 init should be **simpler** than V2:
- Fewer files (no commands, agents, most helpers)
- More intelligent (self-configuration, project analysis)
- DDD-aligned (domains instead of flat agents)
- MCP-native (tools instead of commands)

**Missing implementations:**
1. Database initialization
2. CLAUDE.md generation
3. MCP configuration

**Files created by proper V3 init:**
```
.agentic-qe/
├── config.yaml           # Configuration
├── data/
│   ├── patterns.db       # Pattern database (MISSING)
│   ├── learning-config.json
│   └── hnsw/            # HNSW index directory
└── workers/
    ├── registry.json
    ├── *.json           # Worker configs
    └── start-daemon.sh

.claude/
├── settings.json        # Hook configuration
├── mcp.json             # MCP server config (MISSING)
└── skills/              # Installed skills
    ├── README.md
    └── [skill-dirs]/

CLAUDE.md                # Project config (MISSING)
```

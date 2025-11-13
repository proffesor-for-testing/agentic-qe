# Release Verification Policy

**ALWAYS verify release candidates with full initialization test BEFORE committing any release.**

## Critical Requirements

This is a critical policy to ensure release quality:
- ❌ **NEVER** commit a release candidate (RC) without running `aqe init` verification
- ❌ **NEVER** tag a version without testing agent functionality
- ✅ **ALWAYS** create a fresh test project and run `aqe init` before any release
- ✅ **ALWAYS** verify all agents/commands/skills/config/CLAUDE.md are initialized properly
- ✅ **ALWAYS** test at least one QE agent to verify claimed features work
- ✅ **ALWAYS** document verification results before proceeding with release

## Release Verification Checklist

```bash
# 1. Create clean test project
mkdir /tmp/aqe-test-release && cd /tmp/aqe-test-release
npm init -y

# 2. Install release candidate
npm install /path/to/agentic-qe-cf  # or npm install agentic-qe@latest

# 3. Initialize AQE
npx aqe init

# 4. Verify initialization (CRITICAL - CHECK EVERYTHING)
ls -la .claude/agents/        # Should show all 18 QE agents
ls -la .claude/skills/        # Should show all 34 QE skills
ls -la .claude/commands/      # Should show all 8 AQE slash commands
cat .claude/CLAUDE.md         # Should contain fleet configuration
ls -la .agentic-qe/config/    # Should show configuration files
cat .agentic-qe/config/fleet.json  # Should contain fleet config (valid JSON)
ls -la .agentic-qe/db/        # Should show database files (memory.db, patterns.db)

# 5. Verify databases are created and accessible
file .agentic-qe/db/memory.db      # Should show SQLite 3.x database
file .agentic-qe/db/patterns.db    # Should show SQLite 3.x database
# Note: We use better-sqlite3, so use 'file' command to verify
# Or use Node.js to query:
node -e "const db = require('better-sqlite3')('.agentic-qe/db/memory.db'); console.log('Tables:', db.prepare('SELECT name FROM sqlite_master WHERE type=\"table\"').all()); db.close();"
node -e "const db = require('better-sqlite3')('.agentic-qe/db/patterns.db'); console.log('Tables:', db.prepare('SELECT name FROM sqlite_master WHERE type=\"table\"').all()); db.close();"

# 6. Test agent functionality (CRITICAL - MUST TEST AT LEAST ONE AGENT)
npx aqe agent spawn qe-test-generator --task "Generate unit test for simple function"
# OR use Claude Code Task tool with qe-test-generator
# Verify agent spawns, executes task, and returns results

# 7. Verify claimed features work
# - Multi-Model Router: aqe routing status
# - Learning System: aqe learn status
# - Pattern Bank: aqe patterns list
# - Flaky Detection: Verify qe-flaky-test-hunter agent exists and has ML capabilities
# - AgentDB: Verify databases created and accessible

# 8. Count verification (MUST MATCH CLAIMS)
find .claude/agents -name "*.md" | wc -l    # Should show 18 agents
find .claude/skills -name "*.md" | wc -l    # Should show 34 skills
find .claude/commands -name "*.md" | wc -l  # Should show 8 commands
```

## Verification Success Criteria

- ✅ All 18 QE agents present in `.claude/agents/` (exact count verified)
- ✅ All 34 QE skills present in `.claude/skills/` (exact count verified)
- ✅ All 8 AQE slash commands present in `.claude/commands/` (exact count verified)
- ✅ CLAUDE.md contains fleet configuration with agent descriptions
- ✅ Fleet config file exists at `.agentic-qe/config/fleet.json` and is valid JSON
- ✅ Configuration directory `.agentic-qe/config/` contains all config files
- ✅ Database files exist: `.agentic-qe/db/memory.db` and `.agentic-qe/db/patterns.db`
- ✅ Databases are valid SQLite files with proper schema/tables
- ✅ At least one agent successfully executes a task (qe-test-generator tested)
- ✅ Agent uses claimed features (Learning, Pattern Bank, Multi-Model Router, AgentDB)
- ✅ No initialization errors or missing files
- ✅ File counts match documentation claims (18 agents, 34 skills, 8 commands)

## Version Update Policy (CRITICAL)

- ❌ **NEVER** create release PR without updating version numbers in ALL documentation
- ✅ **ALWAYS** update version numbers BEFORE creating release PR
- ✅ **ALWAYS** check and update these files:
  - `README.md` (line ~10: "**Version X.X.X**")
  - `README.md` (Recent Changes section)
  - `package.json` (already updated by npm version or manually)
  - Any other docs referencing current version
- ✅ **ALWAYS** search for old version: `grep -r "v1.x.x" README.md docs/`

## Version Update Workflow

```bash
# 1. Search for old version references (excluding historical docs)
grep -r "v1.3.4\|Version 1.3.4" README.md --exclude-dir=docs/releases

# 2. Update all found references to new version
# - README.md header: Version X.X.X
# - README.md tagline: Update cost savings if changed
# - README.md Recent Changes: Add new version section

# 3. THEN run release verification and create PR
```

## Examples of Correct Behavior

- User: "prepare release 1.3.5" → Update versions FIRST, verify, then prepare
- User: "commit RC 1.3.5" → STOP, verify "Have you updated README.md version?"
- User: "create PR" → STOP, verify "README.md shows correct version?"
- User: "commit RC 1.3.5" → STOP, verify "Have you run aqe init verification?"
- User: "tag v1.3.5" → STOP, verify "Have you completed release verification checklist?"

## Purpose

This policy prevents releasing broken initialization, non-functional agents, or incorrect version numbers to users.

---

**Related Policies:**
- [Git Operations Policy](git-operations.md)
- [Test Execution Policy](test-execution.md)

**Related Documentation:**
- [Testing with Roo Code](../TESTING-WITH-ROO-CODE.md)
- [MCP Learning Tools Fixes](../MCP-LEARNING-TOOLS-FIXES.md)

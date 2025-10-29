# AQE Database & MCP Server Fixes - October 25, 2024

## Issues Reported by User (Lyle)

### Issue 1: Missing `memory_store` Database Table
**Symptom**: `aqe start` was failing with error:
```
SqliteError: no such table: memory_store
```

**Root Cause**: The `Database.ts` file's `createTables()` method was missing the `memory_store` table definition. The `MemoryManager` was trying to use this table for persistent memory storage, but it was never created during database initialization.

**Fix Applied**:
- Added `memory_store` table to `/workspaces/agentic-qe-cf/src/utils/Database.ts` at line 235-245:
```typescript
// Memory store for persistent agent memory
`CREATE TABLE IF NOT EXISTS memory_store (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  namespace TEXT NOT NULL DEFAULT 'default',
  ttl INTEGER DEFAULT 0,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  UNIQUE(key, namespace)
)`
```

- Added indexes for performance:
```typescript
'CREATE INDEX IF NOT EXISTS idx_memory_store_namespace ON memory_store (namespace)',
'CREATE INDEX IF NOT EXISTS idx_memory_store_expires_at ON memory_store (expires_at)'
```

**Location**: `src/utils/Database.ts:235-245` and `src/utils/Database.ts:267-268`

---

### Issue 2: MCP Server Startup Failure
**Symptom**: Claude Code MCP connection failing with:
```
Status: ✘ failed
Command: npx
Args: agentic-qe mcp:start
```

**Root Cause**: The command `npx agentic-qe mcp:start` was incorrect. The `agentic-qe` binary doesn't have an `mcp:start` command. The MCP server is meant to be started via `npm run mcp:start` or directly with the standalone binary.

**Fix Applied**:
1. Created new standalone MCP binary: `/workspaces/agentic-qe-cf/bin/aqe-mcp`
2. Updated `package.json` to include the new binary:
```json
"bin": {
  "agentic-qe": "./bin/agentic-qe",
  "aqe": "./bin/aqe",
  "aqe-mcp": "./bin/aqe-mcp"
}
```
3. Fixed `mcp:start` script to use compiled JavaScript instead of ts-node:
```json
"mcp:start": "node dist/mcp/start.js"
```
This resolves module resolution issues with ESM imports in CommonJS mode.

---

## How to Apply Fixes

### For Local Development (Your Environment)

1. **Pull the latest changes** (if using git):
```bash
git pull origin testing-with-qe
```

2. **Rebuild the project**:
```bash
npm run build
```

3. **Clean old databases** (IMPORTANT - this will reset your fleet):
```bash
rm -rf ./data/*.db ./.agentic-qe/*.db
```

4. **Reinitialize AQE**:
```bash
aqe init
```

5. **Test the fleet**:
```bash
aqe start
```

You should NO LONGER see the `no such table: memory_store` error!

---

### For Users Installing from NPM

Once version 1.3.3 is published (which includes these fixes), users should:

1. **Update to the latest version**:
```bash
npm install -g agentic-qe@latest
```

2. **Clean old configuration**:
```bash
rm -rf ./.agentic-qe
```

3. **Reinitialize**:
```bash
aqe init
```

---

## MCP Server Configuration for Claude Code

### Option 1: Using the Standalone Binary (Recommended)

Update your `.claude.json` (or `claude_desktop_config.json`) to use the new standalone binary:

```json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "aqe-mcp",
      "args": []
    }
  }
}
```

### Option 2: Using NPM Script

If you prefer to use the npm script:

```json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "npm",
      "args": ["--prefix", "/path/to/agentic-qe-project", "run", "mcp:start"]
    }
  }
}
```

### Option 3: Using npx with the Binary

```json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "npx",
      "args": ["aqe-mcp"]
    }
  }
}
```

---

## Testing the Fixes

### 1. Test Database Initialization

```bash
# Clean slate
rm -rf ./data ./agentic-qe

# Initialize
aqe init

# Start the fleet
aqe start
```

**Expected**: No `memory_store` table errors. You should see:
```
✅ Fleet Manager initialized successfully
✅ MemoryManager initialized successfully
```

### 2. Test MCP Server

```bash
# Start the MCP server standalone
aqe-mcp
```

**Expected**: MCP server starts and listens for connections from Claude Code.

### 3. Test Memory Persistence

```bash
# Start fleet
aqe start

# In another terminal, check memory
aqe memory stats
```

**Expected**: Should show memory statistics without errors.

---

## Files Changed

1. **src/utils/Database.ts**
   - Added `memory_store` table definition (line 235-245)
   - Added indexes for `memory_store` (line 267-268)

2. **bin/aqe-mcp** (NEW FILE)
   - Standalone MCP server binary
   - Handles Claude Code MCP connections

3. **package.json**
   - Added `aqe-mcp` to `bin` section (line 10)
   - Fixed `mcp:start` script to use compiled JS (line 67)
   - Fixed `mcp:dev` script for development (line 68)

4. **dist/** (rebuilt)
   - All compiled JavaScript with the fixes

---

## Known Limitations

### User's Local Environment Issue

Based on your error logs, there appears to be a separate issue with your local environment:
```
❌ Your local node_modules are broken due to missing workspace dependencies
❌ npm install is failing because workspace dependencies aren't resolved
```

This is **NOT** an agentic-qe issue. This is a workspace configuration problem in your project. To fix:

1. **If you're using npm workspaces**:
```bash
rm -rf node_modules package-lock.json
npm install --workspaces --include-workspace-root
```

2. **If that fails**:
```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

3. **Check for broken workspace packages**:
```bash
npm ls @saasgen/api @saasgen/auth @saasgen/database
```

---

## Version History

- **v1.3.2** (current): Has the database schema bug
- **v1.3.3** (upcoming): Will include these fixes

---

## Support

If you continue to experience issues:

1. Check the troubleshooting section above
2. Enable debug mode: `DEBUG=1 aqe start`
3. Report issues at: https://github.com/proffesor-for-testing/agentic-qe/issues

---

## Summary

✅ **Fixed**: Missing `memory_store` database table
✅ **Fixed**: MCP server startup with new `aqe-mcp` binary
✅ **Fixed**: Database schema now complete and matches MemoryManager expectations
📋 **Action Required**: Users need to rebuild and reinitialize after updating

---

## MCP Server Verification

The MCP server has been tested and is working correctly. It exposes **52 tools** including:

### Core Fleet Tools (9 tools)
- `mcp__agentic_qe__fleet_init` - Initialize QE fleet with topology
- `mcp__agentic_qe__fleet_status` - Get fleet status and health
- `mcp__agentic_qe__agent_spawn` - Spawn specialized QE agents
- `mcp__agentic_qe__task_orchestrate` - Orchestrate tasks across agents
- And more...

### Test Tools (14 tools)
- `mcp__agentic_qe__test_generate` - Generate comprehensive tests
- `mcp__agentic_qe__test_execute` - Execute test suites
- `mcp__agentic_qe__test_execute_stream` - Streaming test execution
- `mcp__agentic_qe__coverage_analyze_stream` - Real-time coverage analysis
- And more...

### Quality Tools (10 tools)
- `mcp__agentic_qe__quality_gate_execute` - Execute quality gates
- `mcp__agentic_qe__quality_risk_assess` - Risk assessment
- `mcp__agentic_qe__deployment_readiness_check` - Deployment validation
- And more...

### Memory & Coordination (10 tools)
- `mcp__agentic_qe__memory_store` - Store agent memory
- `mcp__agentic_qe__memory_retrieve` - Retrieve shared memory
- `mcp__agentic_qe__blackboard_post` - Post to coordination blackboard
- `mcp__agentic_qe__workflow_create` - Create multi-agent workflows
- And more...

### Advanced QE (9 tools)
- `mcp__agentic_qe__flaky_test_detect` - ML-based flaky test detection
- `mcp__agentic_qe__predict_defects_ai` - AI defect prediction
- `mcp__agentic_qe__mutation_test_execute` - Mutation testing
- `mcp__agentic_qe__api_breaking_changes` - API contract validation
- And more...

**Verified**: All 52 tools are loading and available for Claude Code to use!

---

*Generated: October 25, 2024*
*Fixed by: Claude Code*
*Version: 1.3.3-rc*

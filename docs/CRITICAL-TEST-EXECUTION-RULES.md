# ⚠️ CRITICAL: Test Execution Rules

**DO NOT RUN FULL INTEGRATION TESTS - WORKSPACE WILL CRASH**

## The Problem

Running all integration tests at once causes **Out of Memory (OOM)** errors that crash the DevPod workspace.

- **46 integration test files** (40 main + 6 phase2)
- **Each creates Database instances, agents, FleetManagers**
- **Running all 46 at once exceeds 768MB memory limit**
- **Result: Workspace crash, lost work, productivity loss**

## ✅ ALWAYS Use These Commands

### For Integration Tests
```bash
# ✅ CORRECT: Use batched execution
npm run test:integration

# This runs scripts/test-integration-batched.sh which:
# - Runs main tests in batches of 5 files
# - Runs phase2 tests individually
# - Includes cleanup between batches
```

### For Other Test Types
```bash
# ✅ Unit tests (safe)
npm run test:unit

# ✅ Agent tests (safe)
npm run test:agents

# ✅ MCP tests (safe)
npm run test:mcp

# ✅ CLI tests (safe)
npm run test:cli

# ✅ Performance tests (safe, uses 1536MB limit)
npm run test:performance

# ✅ AgentDB tests (safe, uses 1024MB limit)
npm run test:agentdb

# ✅ Sequential execution (safe, runs one suite at a time)
npm run test:sequential
```

## ❌ NEVER Use These Commands

```bash
# ❌ DANGEROUS: Runs all 959 tests in parallel, causes OOM
npm test

# ❌ DANGEROUS: Loads all 46 integration files at once, causes OOM
npm run test:integration-unsafe

# ❌ DANGEROUS: Direct Jest execution without batching
jest tests/integration

# ❌ DANGEROUS: Direct Node execution without memory limits
node_modules/.bin/jest tests/integration
```

## Why Batching Is Required

### Memory Usage Per Test File
- Each integration test creates multiple objects:
  - Database instances (SQLite connections)
  - FleetManager instances
  - Multiple agent instances
  - Memory stores
  - Event buses
  - Logger instances

### Without Batching
```
46 files × ~30MB per file = ~1,380MB
DevPod limit: 768MB
Result: OOM crash ❌
```

### With Batching
```
5 files × ~30MB per file = ~150MB per batch
+ Cleanup between batches
= Stays under 768MB limit ✅
```

## For Agent Developers

When working on code that requires integration testing:

1. **Development/Testing**: Test your specific file only
   ```bash
   # Test a single file
   npm run test -- tests/integration/your-file.test.ts
   ```

2. **Before Commit**: Use batched integration tests
   ```bash
   npm run test:integration
   ```

3. **CI/CD**: Already configured to use batched approach

## For Code Reviews

**Red flags to watch for:**
- Direct `jest tests/integration` commands
- `npm test` without context
- `test:integration-unsafe` usage
- Missing memory limits in test commands

## Monitoring Memory

If you need to check memory before running tests:

```bash
# Check available memory
free -h

# Check Node.js heap usage
node -e 'console.log(process.memoryUsage())'

# Run with memory tracking
npm run test:memory-track
```

## Emergency Recovery

If workspace crashes:

1. Restart DevPod workspace
2. Don't run integration tests immediately
3. Check memory: `free -h`
4. Use batched approach: `npm run test:integration`

## Questions?

- See: `scripts/test-integration-batched.sh` for batch implementation
- See: `package.json` scripts section for all test commands
- See: `CLAUDE.md` for full test execution policy

---

**Last Updated**: 2025-11-07
**Status**: CRITICAL - Must be followed by all agents and developers

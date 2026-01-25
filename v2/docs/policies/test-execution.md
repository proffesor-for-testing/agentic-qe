# Test Execution Policy

**ALWAYS run tests in batches to avoid memory overload in constrained environments (DevPod, Codespaces, etc.).**

## Critical Requirements

This is a critical policy to prevent workspace crashes:
- ❌ **NEVER** run all tests in parallel without memory constraints
- ❌ **NEVER** use `npm test` without understanding memory impact
- ❌ **NEVER** run `npm run test:integration-unsafe` (direct Jest execution)
- ✅ **ALWAYS** use batched test scripts: `npm run test:unit`, `npm run test:integration`, `npm run test:agents`, etc.
- ✅ **ALWAYS** run tests sequentially with `--runInBand` in memory-constrained environments
- ✅ **ALWAYS** monitor memory usage before running large test suites
- ✅ **INTEGRATION TESTS**: Always use `npm run test:integration` which runs `scripts/test-integration-batched.sh`

## Examples of Correct Behavior

- User: "run all tests" → Run batched: `npm run test:unit && npm run test:integration && npm run test:agents`
- User: "test everything" → Use sequential batched execution with memory limits
- User: "run integration tests" → Use `npm run test:integration` (runs batched script)
- ❌ **BAD**: `npm test` (runs all 959 tests in parallel, causes OOM)
- ❌ **BAD**: `npm run test:integration-unsafe` (loads 46 files, causes OOM)
- ✅ **GOOD**: `npm run test:unit` then `npm run test:integration` (batched with memory limits)

## Available Batched Test Scripts

See `package.json` for all available scripts:

```bash
npm run test:unit              # Unit tests only (512MB limit)
npm run test:integration       # Integration tests BATCHED (scripts/test-integration-batched.sh)
npm run test:agents            # Agent tests (512MB limit)
npm run test:cli               # CLI tests (512MB limit)
npm run test:mcp               # MCP tests (512MB limit)
npm run test:performance       # Performance tests (1536MB limit)
npm run test:agentdb           # AgentDB tests (1024MB limit)
```

## Why Integration Tests Need Batching

- **46 integration test files** (40 main + 6 phase2)
- Each file creates Database instances, agents, FleetManagers
- Running all 46 at once exceeds 768MB memory limit
- `scripts/test-integration-batched.sh` runs in batches of 5 files with cleanup between batches
- Phase2 tests run individually (heavier memory usage)

## Background

This policy prevents workspace crashes that occurred in previous sessions due to running all tests simultaneously. The workspace has limited memory (typically 768MB-2GB in DevPod/Codespaces), and running 959 tests in parallel can exceed this limit.

## Memory Profiling

If you need to check memory usage:

```bash
# Check available memory
free -h

# Monitor memory during test execution
watch -n 1 free -h

# Run tests with memory profiling
NODE_OPTIONS="--max-old-space-size=512" npm run test:unit
```

---

**Related Policies:**
- [Git Operations Policy](git-operations.md)
- [Release Verification Policy](release-verification.md)

**Related Scripts:**
- `scripts/test-integration-batched.sh` - Batched integration test runner

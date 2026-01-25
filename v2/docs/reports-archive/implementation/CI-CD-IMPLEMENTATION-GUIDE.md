# CI/CD Integration Guide - Implementation Priority

## Quick Summary

The Agentic QE Fleet is **50% CI/CD ready**:
- ✅ **Agents** are fully operational and can be programmatically invoked
- ✅ **Configuration system** exists and supports non-interactive mode
- ✅ **MCP tools** provide structured JSON output
- ✅ **Test infrastructure** is memory-optimized for CI
- ❌ **CLI** is mostly interactive without JSON output
- ❌ **Exit codes** are not consistently implemented
- ❌ **Batch operations** don't exist
- ❌ **CI/CD layer** needs to be created

---

## What Works Today for CI/CD

### 1. Init Command (Only Fully CI-Ready Command)
```bash
aqe init --yes --non-interactive --config ./fleet.json
```
- ✅ Non-interactive mode
- ✅ Config file loading
- ✅ Exit codes on success/failure
- ✅ Creates all necessary artifacts

### 2. MCP Tools (Structured Output)
```javascript
await mcp_call('agentic_qe/agent_spawn', {
  spec: { type: 'test-generator' },
  fleetId: 'ci-fleet-1'
});
// Returns JSON: { success, data, executionTime, requestId }
```
- ✅ No prompts
- ✅ Structured JSON output
- ✅ Execution time tracking
- ✅ Error information

### 3. Programmatic Access (Best Option)
```typescript
import { FleetManager } from 'agentic-qe/core';

const fleet = new FleetManager(config);
await fleet.initialize();
const agent = await fleet.spawnAgent('test-generator', {...});
const result = await agent.executeTask({...});
process.exit(result.success ? 0 : 1);
```
- ✅ Full control
- ✅ Proper exit codes
- ✅ Structured data
- ✅ No MCP dependency

---

## Critical Missing Pieces

### 1. Non-Interactive Agent Commands
**Impact**: HIGH - Blocks most CI workflows

**Current State**:
```bash
$ aqe agent spawn test-generator
# Prompts for: Agent ID, Config, Learning enabled
```

**Needed**:
```bash
aqe agent spawn test-generator \
  --config ./agent-config.json \
  --json \
  --non-interactive
```

**Implementation**: 2-3 days

---

### 2. JSON Output for All Commands
**Impact**: HIGH - Needed for parsing results

Most commands output colored console text (Chalk):
```
✅ Fleet Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fleet ID: fleet-001
Active Agents: 5/10
```

Need to add `--json` flag everywhere:
```bash
aqe fleet status --json
# Output: { "fleetId": "fleet-001", "activeAgents": 5, ... }
```

**Implementation**: 2-3 days

---

### 3. Proper Exit Codes
**Impact**: CRITICAL - CI systems rely on this

Current: Always 0 or 1

Needed:
- `0` - Success
- `1` - Execution error
- `2` - Configuration error  
- `3` - Resource exhaustion
- `4` - Timeout

**Implementation**: 1-2 days

---

### 4. Batch Agent Operations
**Impact**: MEDIUM - Enables parallelization

Current: Spawn agents one at a time

Needed:
```bash
aqe agent spawn batch \
  --agents test-gen:2,test-exec:4,coverage:1 \
  --json
```

**Implementation**: 4-5 days

---

## Recommended CI/CD Approach (Today)

### Option 1: Use Programmatic Access (Recommended)
Create CI scripts in Node.js directly using the AQE APIs:

```typescript
// scripts/ci-run.ts
import { FleetManager } from './src/core/FleetManager';
import { Config } from './src/utils/Config';
import { TestGeneratorAgent } from './src/agents';
import * as fs from 'fs';

async function main() {
  try {
    // 1. Load configuration
    const config = await Config.load('.agentic-qe/config/fleet.json');
    
    // 2. Initialize fleet
    const fleet = new FleetManager(config);
    await fleet.initialize();
    console.log('Fleet initialized');
    
    // 3. Spawn agents
    const testGen = await fleet.spawnAgent('test-generator', {
      taskId: process.env.CI_TASK_ID || 'ci-1'
    });
    console.log(`Spawned agent: ${testGen.id}`);
    
    // 4. Execute task
    const result = await testGen.executeTask({
      id: 'task-1',
      type: 'test-generation',
      payload: {
        sourceFiles: ['src/**/*.ts'],
        framework: 'jest'
      }
    });
    
    // 5. Output results as JSON
    console.log(JSON.stringify({
      success: result.success,
      testsGenerated: result.testSuite?.tests.length || 0,
      coverage: result.coverageProjection || 0
    }, null, 2));
    
    // 6. Exit with proper code
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }));
    process.exit(1);
  }
}

main();
```

Usage in GitHub Actions:
```yaml
- name: Run AQE Tests
  run: npx ts-node scripts/ci-run.ts
  env:
    CI_TASK_ID: ${{ github.run_id }}
    AQE_LOG_LEVEL: info
```

**Advantages**:
- ✅ No MCP server needed
- ✅ Full type safety
- ✅ Proper error handling
- ✅ Can parallelize with Promise.all()
- ✅ Works today, no code changes needed

**Effort**: 2-3 hours to create template

---

### Option 2: Use MCP Tools (If MCP available)
Start the MCP server and call tools:

```bash
# In CI pipeline
npm run mcp:start &

# In script
curl -X POST http://localhost:3000/tools/agentic_qe/agent_spawn \
  -H "Content-Type: application/json" \
  -d '{"spec": {"type": "test-generator"}}'
```

**Advantages**:
- ✅ Existing MCP infrastructure
- ✅ Structured output

**Disadvantages**:
- ❌ Requires MCP server running
- ❌ Additional complexity
- ❌ Less direct access

---

### Option 3: Extend CLI (Best Long-term)
Implement Phase 1 changes to CLI commands.

**Advantages**:
- ✅ Clean CLI interface
- ✅ Works in any shell
- ✅ Good for scripting

**Disadvantages**:
- ❌ Takes 1-2 weeks to implement
- ❌ Blocks other features

---

## Quickstart: Enable CI/CD This Week

### Step 1: Create CI Configuration (15 minutes)
```yaml
# .agentic-qe/config/ci.json
{
  "fleet": {
    "id": "ci-fleet-1",
    "name": "CI/CD Fleet",
    "maxAgents": 5
  },
  "agents": [
    { "type": "test-generator", "count": 1 },
    { "type": "test-executor", "count": 2 },
    { "type": "coverage-analyzer", "count": 1 }
  ]
}
```

### Step 2: Create CI Run Script (1 hour)
```typescript
// scripts/ci-test-generator.ts
import { FleetManager } from './src/core/FleetManager';
import { Config } from './src/utils/Config';
import * as fs from 'fs';

async function runCITask() {
  const config = await Config.load('.agentic-qe/config/ci.json');
  const fleet = new FleetManager(config);
  await fleet.initialize();
  
  const agent = await fleet.spawnAgent('test-generator');
  const result = await agent.executeTask({
    id: `ci-${Date.now()}`,
    type: 'test-generation',
    payload: {
      sourceFiles: process.env.SOURCE_FILES?.split(',') || ['src/**/*.ts'],
      framework: process.env.TEST_FRAMEWORK || 'jest',
      constraints: { maxTests: 100 }
    }
  });
  
  // Write results
  fs.writeFileSync('ci-results.json', JSON.stringify({
    success: result.success,
    testsGenerated: result.testSuite?.tests.length || 0,
    coverage: result.generationMetrics?.coverageProjection || 0,
    executionTime: result.generationMetrics?.generationTime || 0
  }, null, 2));
  
  process.exit(result.success ? 0 : 1);
}

runCITask().catch(err => {
  console.error('CI task failed:', err);
  process.exit(1);
});
```

### Step 3: Add GitHub Actions Workflow (30 minutes)
```yaml
# .github/workflows/agentic-qe-ci.yml
name: Agentic QE CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test-generation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build
        run: npm run build
      
      - name: Initialize AQE
        run: npx ts-node scripts/ci-init.ts
      
      - name: Run AQE Test Generation
        run: npx ts-node scripts/ci-test-generator.ts
        env:
          SOURCE_FILES: 'src/**/*.ts'
          TEST_FRAMEWORK: 'jest'
      
      - name: Upload Results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: ci-results
          path: ci-results.json
```

**Total Time**: 2-3 hours

---

## Implementation Priority

### Week 1: Enable Basic CI/CD
1. Create CI configuration template
2. Create 2-3 CI run scripts
3. Test with GitHub Actions
4. Document in README

**Result**: CI/CD is working via programmatic API

### Week 2: Improve CLI
1. Add `--non-interactive` to all agent commands
2. Add `--json` output to all commands
3. Add proper exit codes

**Result**: CLI is CI-friendly

### Week 3: Add Batch Operations
1. Implement batch spawning API
2. Create batch CLI command
3. Document usage

**Result**: Can spawn multiple agents efficiently

### Week 4: Polish & Document
1. Create comprehensive CI/CD guide
2. Provide workflow templates (GitHub, GitLab, Jenkins)
3. Performance optimization

**Result**: Production-ready CI/CD integration

---

## File Locations Reference

### Key Files for CI/CD
- **CLI Entry**: `src/cli/index.ts` (31KB)
- **Init Command**: `src/cli/commands/init.ts` (85KB) ← Best example
- **FleetManager**: `src/core/FleetManager.ts` (16KB)
- **BaseAgent**: `src/agents/BaseAgent.ts` (40KB)
- **Config**: `src/utils/Config.ts` (80+ lines)
- **MCP Server**: `src/mcp/server.ts` (57KB)

### Configuration Files
- **Fleet Config**: `.agentic-qe/config/fleet.json`
- **Routing Config**: `.agentic-qe/config/routing.json`
- **Hooks Config**: `.agentic-qe/config/aqe-hooks.json`
- **Jest Config**: `jest.config.js` (119 lines)

### Test Infrastructure
- **Test Script**: `npm run test:ci` (optimized for CI)
- **Integration Batching**: `scripts/test-integration-batched.sh`
- **Coverage**: `coverage/` (HTML reports)

---

## Success Metrics

### After Week 1
- [ ] Can spawn agents programmatically from CI script
- [ ] Can run test generation in GitHub Actions
- [ ] Results output as JSON
- [ ] Proper exit codes

### After Week 2
- [ ] All CLI commands support `--json`
- [ ] All CLI commands support `--non-interactive`
- [ ] Exit codes are consistent
- [ ] Environment variables control config

### After Week 3
- [ ] Can spawn 5+ agents in parallel
- [ ] Batch operations API exists
- [ ] Performance comparable to manual

### After Week 4
- [ ] Full CI/CD workflow templates provided
- [ ] Documentation complete
- [ ] Production-ready

---

## Questions? Need Help?

See the comprehensive analysis at:
`docs/ci-cd-readiness-analysis.md`

Key sections:
- Section 1-3: Current architecture
- Section 7-8: Execution models and output formats
- Section 9-10: Gaps and integration architecture
- Section 12-13: Implementation roadmap and file modifications
- Section 14-16: Test infrastructure and recommendations


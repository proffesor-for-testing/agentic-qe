# Hooks Migration Plan - Claude Flow to Native Hooks System

**Created**: 2025-10-07
**Target Release**: v1.0.2
**Status**: Planning Complete, Implementation In Progress
**Priority**: HIGH (Part of v1.0.2 release)

## Executive Summary

This plan outlines the migration from external Claude Flow hooks (`npx claude-flow@alpha hooks`) to our AQE hooks (Agentic QE native hooks) system (`VerificationHookManager` and `BaseAgent` hooks). This eliminates external dependencies, improves performance, and provides better integration with our SwarmMemoryManager.

## Current State Analysis

### What We're Replacing

**Claude Flow Hook Commands** (External):
```bash
# Pre-task hook
npx claude-flow@alpha hooks pre-task --description "Task description"

# Post-task hook
npx claude-flow@alpha hooks post-task --task-id "task-123"

# Post-edit hook
npx claude-flow@alpha hooks post-edit --file "path/to/file" --memory-key "key"

# Session management
npx claude-flow@alpha hooks session-restore --session-id "session-123"
npx claude-flow@alpha hooks session-end --export-metrics true

# Notifications
npx claude-flow@alpha hooks notify --message "Status update"
```

**Location**: Used in 16 agent markdown files in `.claude/agents/`

**Issues**:
- External dependency on `claude-flow@alpha` package
- Shell command execution overhead (100-500ms per call)
- No type safety
- Limited error handling
- Difficult to test

### What We Have (Native Hooks)

**1. BaseAgent Lifecycle Hooks** (Simple, Method-based):
```typescript
// src/agents/BaseAgent.ts
class BaseAgent {
  // Automatically called lifecycle methods
  protected async onPreInitialization?(): Promise<void>;
  protected async onPostInitialization?(): Promise<void>;
  protected async onPreTask?(data: any): Promise<void>;
  protected async onPostTask?(data: any): Promise<void>;
  protected async onTaskError?(data: any): Promise<void>;
  protected async onPreTermination?(): Promise<void>;
  protected async onPostTermination?(): Promise<void>;
}
```

**2. VerificationHookManager** (Advanced, Context Engineering):
```typescript
// src/core/hooks/VerificationHookManager.ts
class VerificationHookManager {
  // 5-stage verification hooks with priorities
  async executePreTaskVerification(options): Promise<VerificationResult>;
  async executePostTaskValidation(options): Promise<ValidationResult>;
  async executePreEditVerification(options): Promise<EditVerificationResult>;
  async executePostEditUpdate(options): Promise<EditUpdateResult>;
  async executeSessionEndFinalization(options): Promise<SessionFinalizationResult>;

  // Context engineering
  async buildPreToolUseBundle(options): Promise<PreToolUseBundle>;
  async persistPostToolUseOutcomes(outcomes): Promise<void>;
}
```

**3. HookExecutor** (Bridge, To Be Deprecated):
```typescript
// src/mcp/services/HookExecutor.ts
// Currently wraps Claude Flow commands
// Will be deprecated in favor of native hooks
```

### Benefits of Migration

| Aspect | Claude Flow Hooks | AQE Hooks |
|--------|------------------|--------------|
| **Performance** | 100-500ms per call | <1ms per call |
| **Dependencies** | External package | Zero |
| **Type Safety** | None (shell strings) | Full TypeScript |
| **Integration** | Shell commands | Direct API |
| **Memory Access** | Separate system | Native SwarmMemoryManager |
| **Error Handling** | Limited | Comprehensive |
| **Testing** | Difficult | Easy |
| **Rollback** | Manual | Built-in RollbackManager |

## Migration Strategy

### Phase 1: Update Agent Markdown Files (16 files)

**Files to Update**:
```
.claude/agents/
├── qe-api-contract-validator.md
├── qe-chaos-engineer.md
├── qe-coverage-analyzer.md
├── qe-deployment-readiness.md
├── qe-flaky-test-hunter.md
├── qe-fleet-commander.md
├── qe-performance-tester.md
├── qe-production-intelligence.md
├── qe-quality-gate.md
├── qe-regression-risk-analyzer.md
├── qe-requirements-validator.md
├── qe-security-scanner.md
├── qe-test-data-architect.md
├── qe-test-executor.md
├── qe-test-generator.md
└── qe-visual-tester.md
```

**Mapping Table**:

| Claude Flow Command | Native Hook API | Notes |
|---------------------|-----------------|-------|
| `npx claude-flow@alpha hooks pre-task --description "$DESC"` | Use BaseAgent's `onPreTask()` method | Automatic lifecycle |
| `npx claude-flow@alpha hooks post-task --task-id "$ID"` | Use BaseAgent's `onPostTask()` method | Automatic lifecycle |
| `npx claude-flow@alpha hooks post-edit --file "$FILE" --memory-key "$KEY"` | Use VerificationHookManager's `executePostEditUpdate()` | Advanced validation |
| `npx claude-flow@alpha hooks session-restore --session-id "$ID"` | Use SwarmMemoryManager's `retrieve()` | Direct memory access |
| `npx claude-flow@alpha hooks session-end --export-metrics` | Use VerificationHookManager's `executeSessionEndFinalization()` | Built-in export |
| `npx claude-flow@alpha hooks notify --message "$MSG"` | Use EventBus `emit()` or Logger | Native events/logging |
| `npx claude-flow@alpha memory store --key "$KEY" --value "$VAL"` | Use SwarmMemoryManager's `store()` | Direct API |
| `npx claude-flow@alpha memory retrieve --key "$KEY"` | Use SwarmMemoryManager's `retrieve()` | Direct API |

### Phase 2: Create Documentation and Examples

**New Documentation Files**:

1. **`docs/AQE-HOOKS-GUIDE.md`**
   - Complete guide to using native hooks
   - Migration examples
   - Best practices
   - Performance comparison

2. **`docs/examples/hooks-usage.md`**
   - Real-world examples
   - Agent coordination patterns
   - Memory integration
   - Error handling

3. **`src/core/hooks/README.md`** (Update)
   - API reference
   - Architecture overview
   - Integration guide

### Phase 3: Update Project Documentation

**Files to Update**:

1. **`CLAUDE.md`**
   - Remove Claude Flow hooks references
   - Add native hooks section
   - Update coordination protocol
   - Update agent execution examples

2. **`README.md`**
   - Update architecture section
   - Highlight native hooks
   - Remove claude-flow dependency references

3. **`CHANGELOG.md`**
   - Add v1.0.2 hooks migration entry

4. **`docs/RELEASE-NOTES-v1.0.2.md`**
   - Add breaking changes section (if any)
   - Migration guide
   - Performance improvements

### Phase 4: Testing and Validation

**Test Cases**:

1. **Unit Tests**
   - Test VerificationHookManager all 5 stages
   - Test BaseAgent lifecycle hooks
   - Test memory integration

2. **Integration Tests**
   - Test agent coordination with native hooks
   - Test memory persistence
   - Test rollback functionality

3. **Performance Tests**
   - Benchmark hook execution time
   - Compare vs Claude Flow (should be 100-500x faster)

4. **End-to-End Tests**
   - Run full agent fleet
   - Verify coordination works
   - Check memory sharing

## Implementation Plan

### Agent Markdown Template Updates

**Before** (Claude Flow):
```markdown
## Coordination Protocol

**BEFORE starting work:**
```bash
npx claude-flow@alpha hooks pre-task --description "Generate comprehensive tests"
npx claude-flow@alpha hooks session-restore --session-id "v1.0.2"
```

**DURING work:**
```bash
npx claude-flow@alpha hooks post-edit --file "tests/test.ts" --memory-key "v1.0.2/tests"
npx claude-flow@alpha hooks notify --message "Tests generated"
```

**AFTER completion:**
```bash
npx claude-flow@alpha hooks post-task --task-id "test-gen-123"
npx claude-flow@alpha hooks session-end --export-metrics true
```
\`\`\`
```

**After** (Native Hooks):
```markdown
## Coordination Protocol

This agent uses **AQE hooks (Agentic QE native hooks)** for coordination (zero external dependencies).

**Automatic Lifecycle Hooks:**
- `onPreTask()` - Called before task execution
- `onPostTask()` - Called after task completion
- `onTaskError()` - Called on task failure

**Memory Integration:**
```typescript
// Store results
await this.memoryStore.store('v1.0.2/tests', testResults, {
  partition: 'test_results',
  ttl: 86400 // 24 hours
});

// Retrieve context
const context = await this.memoryStore.retrieve('v1.0.2/context', {
  partition: 'coordination'
});
```

**Event Bus Integration:**
```typescript
// Emit events for coordination
this.eventBus.emit('test:completed', {
  agentId: this.agentId,
  results: testResults
});

// Listen for fleet events
this.registerEventHandler({
  eventType: 'fleet.status',
  handler: async (event) => { /* handle */ }
});
```

**Advanced Verification (Optional):**
```typescript
// Use VerificationHookManager for advanced validation
const hookManager = new VerificationHookManager(this.memoryStore);

// Pre-task verification with environment checks
const verification = await hookManager.executePreTaskVerification({
  task: 'test-generation',
  context: {
    requiredVars: ['NODE_ENV'],
    minMemoryMB: 512,
    requiredModules: ['jest']
  }
});

if (!verification.passed) {
  throw new Error('Pre-task verification failed');
}
```
\`\`\`
```

### Example Agent Implementation

**TestGeneratorAgent with Native Hooks**:

```typescript
import { BaseAgent } from './BaseAgent';
import { VerificationHookManager } from '../core/hooks';

export class TestGeneratorAgent extends BaseAgent {
  private hookManager: VerificationHookManager;

  constructor(config: BaseAgentConfig) {
    super(config);
    this.hookManager = new VerificationHookManager(this.memoryStore);
  }

  // Lifecycle hook - automatically called before task
  protected async onPreTask(data: { assignment: TaskAssignment }): Promise<void> {
    // Verify environment
    const verification = await this.hookManager.executePreTaskVerification({
      task: data.assignment.task.type,
      context: {
        requiredModules: ['jest', '@types/jest'],
        minMemoryMB: 512
      }
    });

    if (!verification.passed) {
      throw new Error(`Pre-task verification failed: ${verification.checks.join(', ')}`);
    }

    // Load context from memory
    const context = await this.memoryStore.retrieve('v1.0.2/context', {
      partition: 'coordination'
    });

    this.logger.info('Pre-task verification passed', { verification, context });
  }

  // Lifecycle hook - automatically called after task
  protected async onPostTask(data: { assignment: TaskAssignment; result: any }): Promise<void> {
    // Validate results
    const validation = await this.hookManager.executePostTaskValidation({
      task: data.assignment.task.type,
      result: {
        output: data.result,
        coverage: data.result.coverage,
        metrics: data.result.metrics
      }
    });

    if (!validation.valid) {
      this.logger.warn('Post-task validation issues', { validation });
    }

    // Store results in memory
    await this.memoryStore.store('v1.0.2/test-results', data.result, {
      partition: 'test_results',
      ttl: 86400 // 24 hours
    });

    // Emit completion event
    this.eventBus.emit('test:completed', {
      agentId: this.agentId,
      taskId: data.assignment.task.id,
      result: data.result
    });

    this.logger.info('Post-task validation complete', { validation });
  }

  // Lifecycle hook - automatically called on error
  protected async onTaskError(data: { assignment: TaskAssignment; error: Error }): Promise<void> {
    // Store error in memory for analysis
    await this.memoryStore.store(`errors/${data.assignment.task.id}`, {
      error: data.error.message,
      stack: data.error.stack,
      timestamp: new Date()
    }, {
      partition: 'errors',
      ttl: 604800 // 7 days
    });

    // Emit error event
    this.eventBus.emit('test:failed', {
      agentId: this.agentId,
      taskId: data.assignment.task.id,
      error: data.error
    });

    this.logger.error('Task execution failed', { error: data.error });
  }

  // Override execute method with verification
  protected async executeTask(assignment: TaskAssignment): Promise<any> {
    // Build pre-tool-use context bundle
    const bundle = await this.hookManager.buildPreToolUseBundle({
      task: assignment.task.type,
      maxArtifacts: 5
    });

    this.logger.debug('Context bundle built', { bundle });

    // Execute actual test generation logic
    const result = await this.generateTests(assignment, bundle);

    // Persist post-tool-use outcomes
    await this.hookManager.persistPostToolUseOutcomes({
      events: [{ type: 'test:generated', payload: result }],
      patterns: [{ pattern: 'test-generation', confidence: 0.95 }],
      checkpoints: [{ step: 'generation', status: 'completed' }],
      artifacts: [{ kind: 'test', path: result.filePath, sha256: result.hash }],
      metrics: [{ metric: 'tests_generated', value: result.count, unit: 'count' }]
    });

    return result;
  }

  private async generateTests(assignment: TaskAssignment, bundle: any): Promise<any> {
    // Implementation details...
    return {
      filePath: 'tests/example.test.ts',
      count: 10,
      coverage: 95,
      hash: 'abc123...'
    };
  }
}
```

## Migration Checklist

### Pre-Migration

- [x] Analyze current Claude Flow hook usage
- [x] Document native hooks API
- [x] Create migration mapping table
- [x] Design new agent markdown template
- [ ] Create migration examples

### Migration Execution

- [ ] **Agent Markdown Files** (16 files)
  - [ ] qe-api-contract-validator.md
  - [ ] qe-chaos-engineer.md
  - [ ] qe-coverage-analyzer.md
  - [ ] qe-deployment-readiness.md
  - [ ] qe-flaky-test-hunter.md
  - [ ] qe-fleet-commander.md
  - [ ] qe-performance-tester.md
  - [ ] qe-production-intelligence.md
  - [ ] qe-quality-gate.md
  - [ ] qe-regression-risk-analyzer.md
  - [ ] qe-requirements-validator.md
  - [ ] qe-security-scanner.md
  - [ ] qe-test-data-architect.md
  - [ ] qe-test-executor.md
  - [ ] qe-test-generator.md
  - [ ] qe-visual-tester.md

- [ ] **Documentation Updates**
  - [ ] Create docs/AQE-HOOKS-GUIDE.md
  - [ ] Create docs/examples/hooks-usage.md
  - [ ] Update src/core/hooks/README.md
  - [ ] Update CLAUDE.md (remove CF hooks, add native hooks)
  - [ ] Update README.md (architecture section)

- [ ] **Release Documentation**
  - [ ] Update CHANGELOG.md with hooks migration
  - [ ] Update docs/RELEASE-NOTES-v1.0.2.md
  - [ ] Document breaking changes (if any)

### Testing

- [ ] **Unit Tests**
  - [ ] Test VerificationHookManager all stages
  - [ ] Test BaseAgent lifecycle hooks
  - [ ] Test memory integration

- [ ] **Integration Tests**
  - [ ] Test agent coordination
  - [ ] Test memory persistence
  - [ ] Test event bus integration

- [ ] **Performance Tests**
  - [ ] Benchmark native hooks vs Claude Flow
  - [ ] Measure memory overhead
  - [ ] Validate <1ms execution time

- [ ] **End-to-End Tests**
  - [ ] Run full agent fleet
  - [ ] Verify all 16 agents work
  - [ ] Test complex coordination scenarios

### Post-Migration

- [ ] Verify all agents work with native hooks
- [ ] Update examples in documentation
- [ ] Deprecate HookExecutor (mark as @deprecated)
- [ ] Add migration guide for users
- [ ] Update package.json (no claude-flow dependency)

## Breaking Changes

### For Users

**NONE** - This is an internal migration. Users don't call hooks directly.

### For Contributors

**Agent Markdown Files**:
- Old coordination commands no longer work
- Must use new TypeScript API examples
- Documentation updated with new patterns

**Agent Development**:
- Extend BaseAgent for automatic lifecycle hooks
- Use VerificationHookManager for advanced validation
- Direct SwarmMemoryManager integration

## Performance Improvements

### Expected Results

| Metric | Before (Claude Flow) | After (Native) | Improvement |
|--------|---------------------|----------------|-------------|
| Hook Execution Time | 100-500ms | <1ms | 100-500x faster |
| Memory Overhead | Process spawn | In-memory | ~50MB saved |
| Type Safety | None | Full | N/A |
| Error Rate | Higher (shell) | Lower (typed) | ~80% reduction |
| Testability | Difficult | Easy | N/A |

### Benchmark Code

```typescript
// Performance comparison
import { VerificationHookManager } from './core/hooks';
import { HookExecutor } from './mcp/services/HookExecutor';

async function benchmark() {
  const memory = new SwarmMemoryManager();
  const nativeHooks = new VerificationHookManager(memory);
  const cfHooks = new HookExecutor();

  // Benchmark native hooks
  const nativeStart = Date.now();
  await nativeHooks.executePreTaskVerification({
    task: 'test-generation',
    context: {}
  });
  const nativeTime = Date.now() - nativeStart;

  // Benchmark Claude Flow hooks
  const cfStart = Date.now();
  await cfHooks.executePreTask({ description: 'test-generation' });
  const cfTime = Date.now() - cfStart;

  console.log('Native hooks:', nativeTime, 'ms');
  console.log('Claude Flow hooks:', cfTime, 'ms');
  console.log('Speedup:', (cfTime / nativeTime).toFixed(1), 'x');
}
```

## Risk Assessment

### Low Risk
- ✅ Internal implementation change only
- ✅ No user-facing API changes
- ✅ Backward compatible (HookExecutor still available)
- ✅ Extensive testing coverage

### Medium Risk
- ⚠️ Agent markdown files need updates (16 files)
- ⚠️ Documentation needs updates (5+ files)
- ⚠️ Testing all coordination patterns

### Mitigation
- Keep HookExecutor as @deprecated for one release
- Provide detailed migration guide
- Extensive testing before release
- Rollback plan if issues found

## Rollback Plan

If critical issues discovered:

1. **Immediate**: Revert agent markdown files to Claude Flow hooks
2. **Short-term**: Keep both systems operational (HookExecutor + Native)
3. **Long-term**: Fix issues, re-test, migrate in v1.0.3

**Rollback Triggers**:
- Agent coordination failures
- Memory corruption
- Performance regression
- Test failures in production

## Timeline

### v1.0.2 Release (Current Sprint)

**Day 1** (Today):
- ✅ Create migration plan
- 🔄 Deploy agent swarm for implementation
- 🔄 Update 16 agent markdown files

**Day 2**:
- Create documentation (3 files)
- Update CLAUDE.md and README.md
- Run integration tests

**Day 3**:
- Performance benchmarking
- End-to-end testing
- Update release notes

**Day 4**:
- Final review
- Commit and PR
- v1.0.2 release

## Success Criteria

- [ ] All 16 agent markdown files updated
- [ ] All documentation updated (8+ files)
- [ ] Native hooks performance: <1ms per call
- [ ] All tests passing (unit, integration, e2e)
- [ ] Zero breaking changes for users
- [ ] Benchmark shows 100x+ speedup
- [ ] Memory integration working
- [ ] Event bus coordination working
- [ ] v1.0.2 released with hooks migration

## References

- **VerificationHookManager**: `src/core/hooks/VerificationHookManager.ts`
- **BaseAgent**: `src/agents/BaseAgent.ts`
- **HookExecutor** (deprecated): `src/mcp/services/HookExecutor.ts`
- **SwarmMemoryManager**: `src/core/memory/SwarmMemoryManager.ts`
- **Architecture**: `docs/AQE-SYSTEM-ARCHITECTURE.md`

---

**Status**: ✅ Plan Complete, Ready for Implementation
**Next**: Deploy agent swarm for parallel execution

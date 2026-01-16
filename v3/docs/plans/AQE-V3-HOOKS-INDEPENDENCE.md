# Plan: AQE V3 Hooks Independence from Claude-Flow

## Summary

AQE v3 currently generates `.claude/settings.json` that references `@claude-flow/cli` for hooks. This creates an unnecessary dependency on claude-flow for users who don't want/need it.

**Key Finding**: V3 ALREADY HAS its own hooks system in `qe-hooks.ts` - it just needs CLI commands to expose it.

## Current State

### What V3 Has (Native)
- `QEHookRegistry` class in `v3/src/learning/qe-hooks.ts`
- `QE_HOOK_EVENTS` - 13 hook event types
- `QEHookHandler` type for hook functions
- `QEReasoningBank` for pattern storage and learning
- Full learning infrastructure (patterns, routing, outcomes)

### What V2 Had (Independent)
- `HookExecutor` with Claude Flow detection and AQE fallback
- `VerificationHookManager` for native hooks
- `SwarmMemoryManager` for memory operations
- Graceful degradation: uses AQE when claude-flow unavailable

### The Problem (claude-flow Coupling)
`v3/src/init/init-wizard.ts` lines 484-553 hardcode claude-flow CLI:

```javascript
// Current (BAD - requires claude-flow)
command: `npx @claude-flow/cli@latest hooks pre-edit --file "$AQE_FILE"`
command: `npx @claude-flow/cli@latest hooks session-start`
```

## Implementation Plan

### Phase 1: Add Hooks Commands to AQE V3 CLI

**File**: `v3/src/cli/index.ts`

Add new `hooks` command group with subcommands:

```typescript
// hooks command group
program
  .command('hooks')
  .description('QE learning hooks for Claude Code integration')

// Subcommands needed:
hooks.command('pre-edit')
  .option('--file <path>', 'File being edited')
  .option('--operation <type>', 'Edit operation type')
  .action(async (options) => {
    const registry = await getOrCreateHookRegistry();
    await registry.emit(QE_HOOK_EVENTS.PreTestGeneration, {
      targetFile: options.file,
      operation: options.operation,
    });
  });

hooks.command('post-edit')
  .option('--file <path>', 'File edited')
  .option('--success <bool>', 'Whether edit succeeded')
  .action(async (options) => {
    const registry = await getOrCreateHookRegistry();
    await registry.emit(QE_HOOK_EVENTS.PostTestGeneration, {
      targetFile: options.file,
      success: options.success === 'true',
    });
  });

hooks.command('pre-command')
  .option('--command <cmd>', 'Command to execute')
  .action(async (options) => {
    // Route task based on command
    const registry = await getOrCreateHookRegistry();
    await registry.emit(QE_HOOK_EVENTS.QEAgentRouting, {
      task: options.command,
      taskType: 'command-execution',
    });
  });

hooks.command('post-command')
  .option('--command <cmd>', 'Executed command')
  .option('--exit-code <code>', 'Command exit code')
  .action(async (options) => {
    const registry = await getOrCreateHookRegistry();
    await registry.emit(QE_HOOK_EVENTS.QEAgentCompletion, {
      task: options.command,
      success: options.exitCode === '0',
    });
  });

hooks.command('session-start')
  .option('--session-id <id>', 'Session identifier')
  .action(async (options) => {
    // Initialize hook registry and reasoning bank
    const registry = await initializeSession(options.sessionId);
    console.log(JSON.stringify({ success: true, sessionId: options.sessionId }));
  });

hooks.command('session-end')
  .option('--save-state', 'Save session state')
  .option('--export-metrics', 'Export learning metrics')
  .action(async (options) => {
    // Finalize patterns, save state
    const registry = getHookRegistry();
    if (options.saveState) {
      await registry.saveState();
    }
    console.log(JSON.stringify({ success: true }));
  });
```

### Phase 2: Update init-wizard.ts

**Change from**:
```javascript
command: `npx @claude-flow/cli@latest hooks pre-edit --file "$AQE_FILE"`
```

**To**:
```javascript
command: `npx aqe hooks pre-edit --file "$AQE_FILE"`
```

Full changes needed in `configureHooks()` method (lines 484-553):

```javascript
const hooks: Record<string, unknown> = {
  PreToolUse: [
    {
      matcher: 'Edit|Write|MultiEdit',
      hooks: [
        {
          type: 'command',
          command: `npx aqe hooks pre-edit --file "$AQE_FILE"`,
        },
      ],
    },
    {
      matcher: 'Bash',
      hooks: [
        {
          type: 'command',
          command: `npx aqe hooks pre-command --command "$AQE_COMMAND"`,
        },
      ],
    },
  ],

  PostToolUse: [
    {
      matcher: 'Edit|Write|MultiEdit',
      hooks: [
        {
          type: 'command',
          command: `npx aqe hooks post-edit --file "$AQE_FILE" --success "$AQE_SUCCESS"`,
        },
      ],
    },
    {
      matcher: 'Bash',
      hooks: [
        {
          type: 'command',
          command: `npx aqe hooks post-command --command "$AQE_COMMAND" --exit-code "$AQE_EXIT_CODE"`,
        },
      ],
    },
  ],

  SessionStart: [
    {
      matcher: {},
      hooks: [
        {
          type: 'command',
          command: `npx aqe hooks session-start`,
        },
      ],
    },
  ],

  SessionEnd: [
    {
      matcher: {},
      hooks: [
        {
          type: 'command',
          command: `npx aqe hooks session-end --save-state`,
        },
      ],
    },
  ],
};
```

### Phase 3: Create Hooks Module

**New File**: `v3/src/cli/commands/hooks.ts`

```typescript
import { Command } from 'commander';
import { setupQEHooks, QE_HOOK_EVENTS, QEHookRegistry } from '../../learning/qe-hooks.js';
import { createQEReasoningBank } from '../../learning/qe-reasoning-bank.js';

let hookRegistry: QEHookRegistry | null = null;

async function getOrCreateHookRegistry(): Promise<QEHookRegistry> {
  if (!hookRegistry) {
    const reasoningBank = await createQEReasoningBank({
      projectRoot: process.cwd(),
    });
    hookRegistry = setupQEHooks(reasoningBank);
  }
  return hookRegistry;
}

export function registerHooksCommand(program: Command): void {
  const hooks = program
    .command('hooks')
    .description('QE learning hooks for pattern recognition and Claude Code integration');

  hooks
    .command('pre-edit')
    .description('Hook called before file edits')
    .option('--file <path>', 'File being edited')
    .option('--operation <type>', 'Edit operation type')
    .action(async (options) => {
      const registry = await getOrCreateHookRegistry();
      const results = await registry.emit(QE_HOOK_EVENTS.PreTestGeneration, {
        targetFile: options.file,
        operation: options.operation,
      });
      console.log(JSON.stringify({ success: true, results }));
    });

  // ... (other subcommands)
}
```

### Phase 4: Remove Remaining claude-flow References

1. **`v3/src/cli/index.ts` line 1193**: Change suggestion from claude-flow to aqe
2. **`v3/src/cli/wizards/fleet-wizard.ts` line 616**: Change `.claude-flow/patterns` to `.agentic-qe/patterns`
3. **`v3/src/init/init-wizard.ts` line 847**: Remove claude-flow daemon start suggestion

## Files to Modify

| File | Action | Lines | Description |
|------|--------|-------|-------------|
| `v3/src/cli/index.ts` | ADD | new | Add hooks command import |
| `v3/src/cli/commands/hooks.ts` | CREATE | new | Hooks CLI commands |
| `v3/src/init/init-wizard.ts` | MODIFY | 492-548 | Change claude-flow to aqe |
| `v3/src/init/init-wizard.ts` | MODIFY | 847 | Remove claude-flow daemon |
| `v3/src/cli/index.ts` | MODIFY | 1193 | Change suggestion |
| `v3/src/cli/wizards/fleet-wizard.ts` | MODIFY | 616 | Change path |

## Testing

```bash
# After implementation, verify:

# 1. Hooks commands work
npx aqe hooks pre-edit --file test.ts
npx aqe hooks session-start

# 2. Init generates correct settings.json
cd /tmp && mkdir test && cd test
npx aqe init --auto
cat .claude/settings.json | grep -v claude-flow  # Should show aqe-v3 commands

# 3. Hooks work without claude-flow installed
npm uninstall -g @claude-flow/cli
npx aqe hooks session-start  # Should work

# 4. Pattern learning works
npx aqe hooks post-edit --file test.ts --success true
# Should store pattern in .agentic-qe/data/
```

## Benefits

1. **Independence**: AQE v3 works without claude-flow
2. **Simplified Install**: Users only need `npm install -g @agentic-qe/v3`
3. **Consistency**: Uses V3's native learning system
4. **Optional Integration**: Claude-flow can still be used alongside if desired
5. **V2 Parity**: Matches V2's fallback architecture

## Timeline

- Phase 1: ~2-3 hours (CLI commands)
- Phase 2: ~30 minutes (init-wizard updates)
- Phase 3: ~1 hour (hooks module)
- Phase 4: ~30 minutes (cleanup)
- Testing: ~1 hour

**Total: ~5-6 hours**

---
*Generated: 2026-01-15*

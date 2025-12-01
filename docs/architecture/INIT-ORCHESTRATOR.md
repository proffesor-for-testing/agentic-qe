# Init Orchestrator Architecture

**Status**: ✅ Complete (Orchestrator + Stubs)  
**Version**: v1.9.0  
**Location**: `/src/cli/init/`

## Overview

The Init Orchestrator coordinates all initialization steps for the Agentic QE Fleet with:
- **Modular design**: Each phase in its own module (25-73 lines each)
- **Error handling**: Critical vs non-critical phases with rollback
- **Progress tracking**: User-friendly spinners and messages
- **Extensibility**: Easy to add new phases

## Architecture

### Main Orchestrator (`index.ts` - 278 lines)

**Responsibilities**:
1. Validate and prepare configuration
2. Execute phases in correct order
3. Handle errors and rollback
4. Display progress and results

**Key Features**:
```typescript
interface InitPhase {
  name: string;
  description: string;
  execute: (config: FleetConfig, options: InitOptions) => Promise<void>;
  critical: boolean;  // If true, failure stops initialization
  rollback?: (config: FleetConfig) => Promise<void>;
}
```

### Phase Modules

| Module | Lines | Status | Critical |
|--------|-------|--------|----------|
| `directory-structure.ts` | 73 | 🟡 Stub | Yes |
| `database-init.ts` | 32 | 🟡 Stub | Yes |
| `claude-config.ts` | 46 | 🟡 Stub | Yes |
| `documentation.ts` | 26 | 🟡 Stub | No |
| `bash-wrapper.ts` | 25 | 🟡 Stub | No |

## Execution Flow

```
┌─────────────────────────────────────────┐
│  1. Validate Options                    │
│     • Parse CLI arguments               │
│     • Validate topology, agents, etc.   │
│     • Create FleetConfig                │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  2. Execute Phases (Sequential)         │
│     ┌─────────────────────────────────┐ │
│     │ Phase 1: Directory Structure    │ │ ✅ Critical
│     │ • Create .agentic-qe/          │ │
│     │ • Create test directories      │ │
│     └───────────┬─────────────────────┘ │
│                 │ Success                │
│     ┌───────────▼─────────────────────┐ │
│     │ Phase 2: Databases              │ │ ✅ Critical
│     │ • Initialize AgentDB            │ │
│     │ • Initialize memory DB          │ │
│     └───────────┬─────────────────────┘ │
│                 │ Success                │
│     ┌───────────▼─────────────────────┐ │
│     │ Phase 3: Claude Configuration   │ │ ✅ Critical
│     │ • Generate .claude/settings     │ │
│     │ • Setup MCP server              │ │
│     └───────────┬─────────────────────┘ │
│                 │ Success                │
│     ┌───────────▼─────────────────────┐ │
│     │ Phase 4: Documentation          │ │ ⚠️  Non-critical
│     │ • Copy reference docs           │ │
│     └───────────┬─────────────────────┘ │
│                 │ Success/Warning        │
│     ┌───────────▼─────────────────────┐ │
│     │ Phase 5: Bash Wrapper           │ │ ⚠️  Non-critical
│     │ • Create aqe command            │ │
│     └───────────┬─────────────────────┘ │
└─────────────────┼───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  3. Display Results                     │
│     • Show configuration summary        │
│     • Display next steps                │
│     • Show enabled features             │
└─────────────────────────────────────────┘
```

## Error Handling

### Critical Phase Failure

```
┌──────────────────────────────────────┐
│ Critical Phase Failed                │
└─────────────┬────────────────────────┘
              │
┌─────────────▼────────────────────────┐
│ Trigger Rollback                     │
│ • Call rollback() for each phase     │
│ • In reverse order                   │
│ • Log rollback status                │
└─────────────┬────────────────────────┘
              │
┌─────────────▼────────────────────────┐
│ Exit with Error                      │
│ • Display error message              │
│ • Exit code 1                        │
└──────────────────────────────────────┘
```

### Non-Critical Phase Failure

```
┌──────────────────────────────────────┐
│ Non-Critical Phase Failed            │
└─────────────┬────────────────────────┘
              │
┌─────────────▼────────────────────────┐
│ Log Warning                          │
│ • Display warning message            │
│ • Continue to next phase             │
└─────────────┬────────────────────────┘
              │
┌─────────────▼────────────────────────┐
│ Continue Execution                   │
│ • Success message mentions warnings  │
└──────────────────────────────────────┘
```

## Design Decisions

### 1. Why Separate Modules?

**Problem**: Original `init.ts` is 2809 lines - impossible to maintain

**Solution**: Break into 5 modules of 25-73 lines each
- Each module has single responsibility
- Easy to test independently
- Easy to add new phases
- Clear separation of concerns

### 2. Why Critical vs Non-Critical?

**Problem**: What if documentation copy fails? Should we stop?

**Solution**: Two-tier error handling
- **Critical phases**: Stop and rollback (database, config)
- **Non-critical phases**: Warn and continue (docs, wrapper)

### 3. Why Rollback Support?

**Problem**: If Phase 3 fails, Phase 1-2 may have created files/databases

**Solution**: Optional rollback functions
- Called in reverse order
- Best-effort cleanup
- Prevents half-initialized state

### 4. Why Phase Order Matters?

Dependencies:
1. Directory → Must exist before database writes
2. Database → Must exist before agent files
3. Claude Config → Must exist for learning system
4. Documentation → Can happen anytime
5. Bash Wrapper → Must happen after directory

## Adding New Phases

Example: Add CI/CD integration phase

```typescript
// 1. Create module: src/cli/init/ci-integration.ts
export async function setupCIIntegration(config: FleetConfig): Promise<void> {
  console.log(chalk.gray('  • Setting up CI/CD integration'));
  // ... implementation
  console.log(chalk.green('  ✓ CI/CD integration configured'));
}

// 2. Import in index.ts
import { setupCIIntegration } from './ci-integration';

// 3. Add to phases array
const phases: InitPhase[] = [
  // ... existing phases
  {
    name: 'CI/CD Integration',
    description: 'Setting up CI/CD integration',
    execute: async (cfg) => setupCIIntegration(cfg),
    critical: false,
    rollback: async () => {
      // Remove CI config files
    }
  }
];

// 4. Export for testing
export { setupCIIntegration };
```

## Module Extraction Plan

### Phase 1: Directory Structure

**Extract from**: Lines ~250-270 of `commands/init.ts`

**Implementation**:
```typescript
const directories = [
  '.agentic-qe',
  '.agentic-qe/data',
  '.agentic-qe/data/learning',
  // ... all directories
];

for (const dir of directories) {
  await fs.ensureDir(path.join(baseDir, dir));
}
```

### Phase 2: Database Init

**Extract from**: Lines ~176-186 of `commands/init.ts`

**Implementation**:
```typescript
// Initialize AgentDB
await AgentDB.initialize({ dbPath: '...' });

// Initialize memory database
await memoryStore.initialize();

// Initialize learning database
await learningSystem.initialize();
```

### Phase 3: Claude Config

**Extract from**: Lines ~2218-2245 of `commands/init.ts`

**CRITICAL**: This configures the MCP server for learning!

**Implementation**:
```typescript
const settings = {
  mcpServers: {
    'aqe-learning': {
      command: 'npx',
      args: ['-y', 'aqe', 'learn', 'server']
    }
  }
};

await fs.writeJSON('.claude/settings.json', settings);
```

### Phase 4: Documentation

**Extract from**: Documentation copy logic

**Implementation**:
```typescript
const docs = ['agents.md', 'skills.md', 'usage.md'];
for (const doc of docs) {
  await fs.copy(
    path.join(__dirname, '../../../docs/reference', doc),
    path.join(baseDir, '.agentic-qe/docs', doc)
  );
}
```

### Phase 5: Bash Wrapper

**Extract from**: Bash wrapper creation logic

**Implementation**:
```typescript
const wrapper = `#!/bin/bash
npx aqe "$@"
`;

await fs.writeFile('aqe', wrapper);
await fs.chmod('aqe', 0o755);
```

## Testing Strategy

### Unit Tests

Each module independently:
```typescript
describe('Directory Structure', () => {
  it('creates all directories', async () => {
    await createDirectoryStructure(false);
    expect(fs.existsSync('.agentic-qe')).toBe(true);
  });

  it('respects force flag', async () => {
    await createDirectoryStructure(true);
    // verify overwrite
  });
});
```

### Integration Tests

Full orchestrator:
```typescript
describe('Init Orchestrator', () => {
  it('executes all phases in order', async () => {
    const config = { /* ... */ };
    await initCommand(config);
    // verify all phases completed
  });

  it('rolls back on critical failure', async () => {
    // mock phase 2 to fail
    await expect(initCommand(config)).rejects.toThrow();
    // verify phase 1 rolled back
  });
});
```

## Benefits

### Before (Original init.ts)
- ❌ 2809 lines in one file
- ❌ Hard to understand flow
- ❌ Hard to test
- ❌ Hard to extend
- ❌ All-or-nothing error handling

### After (Modular init/)
- ✅ 6 modules of 25-278 lines
- ✅ Clear phase structure
- ✅ Easy to test each phase
- ✅ Easy to add new phases
- ✅ Granular error handling with rollback

## Next Steps

1. **Extract each phase** from `commands/init.ts` to stub modules
2. **Add rollback logic** for critical phases
3. **Update main CLI** to use new `initCommand()` from `init/index.ts`
4. **Add unit tests** for each module
5. **Add integration test** for full flow
6. **Update documentation** with examples

## File Locations

```
/workspaces/agentic-qe-cf/
├── src/cli/
│   ├── init/                          # ✅ NEW MODULAR ARCHITECTURE
│   │   ├── index.ts                   # Main orchestrator (278 lines)
│   │   ├── directory-structure.ts     # Phase 1 (73 lines)
│   │   ├── database-init.ts           # Phase 2 (32 lines)
│   │   ├── claude-config.ts           # Phase 3 (46 lines) CRITICAL!
│   │   ├── documentation.ts           # Phase 4 (26 lines)
│   │   ├── bash-wrapper.ts            # Phase 5 (25 lines)
│   │   └── README.md                  # Module documentation
│   └── commands/
│       └── init.ts                    # ❌ OLD MONOLITH (2809 lines)
└── docs/architecture/
    └── INIT-ORCHESTRATOR.md           # This file
```

## Success Metrics

- ✅ Main orchestrator under 300 lines (278/300)
- ✅ Each module under 100 lines (max 73/100)
- ✅ Clear phase boundaries
- ✅ Rollback support for critical phases
- ✅ Easy to add new phases
- ✅ Comprehensive documentation
- 🟡 Extract implementations (TODO)
- 🟡 Add unit tests (TODO)
- 🟡 Add integration tests (TODO)

---

**Created**: 2025-11-22  
**Architect**: System Architecture Designer Agent  
**Version**: 1.0.0

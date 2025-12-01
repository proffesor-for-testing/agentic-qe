# Init Module Architecture

This directory contains the modular initialization system for Agentic QE Fleet.

## Architecture Overview

The initialization system is designed with:
- **Separation of Concerns**: Each phase is in its own module
- **Error Handling**: Critical vs non-critical phases with rollback support
- **Extensibility**: Easy to add new phases
- **Testability**: Each module can be tested independently
- **Progress Tracking**: User-friendly spinner feedback

## Module Structure

```
src/cli/init/
├── index.ts                 # Main orchestrator (coordinates all phases)
├── directory-structure.ts   # Phase 1: Create project directories
├── database-init.ts         # Phase 2: Initialize databases
├── claude-config.ts         # Phase 3: Claude Code configuration (CRITICAL!)
├── documentation.ts         # Phase 4: Copy documentation
├── bash-wrapper.ts          # Phase 5: Create aqe command wrapper
└── README.md               # This file
```

## Phase Execution Order

1. **Directory Structure** (Critical)
   - Creates `.agentic-qe/` structure
   - Creates test directories
   - Sets up `.gitignore`

2. **Databases** (Critical)
   - Initializes AgentDB
   - Initializes memory database
   - Initializes learning database
   - Initializes patterns database

3. **Claude Configuration** (Critical)
   - Generates `.claude/settings.json`
   - Configures MCP server
   - **CRITICAL for learning system!**

4. **Documentation** (Non-critical)
   - Copies agent reference
   - Copies skills reference
   - Copies usage guide

5. **Bash Wrapper** (Non-critical)
   - Creates `aqe` command wrapper
   - Sets executable permissions

## Adding a New Phase

To add a new initialization phase:

1. **Create the module**: `src/cli/init/your-phase.ts`
   ```typescript
   import chalk from 'chalk';
   import { FleetConfig } from '../../types';
   
   export async function yourPhaseFunction(config: FleetConfig): Promise<void> {
     console.log(chalk.gray('  • Doing something...'));
     // Your implementation
     console.log(chalk.green('  ✓ Something done'));
   }
   ```

2. **Import in orchestrator**: `src/cli/init/index.ts`
   ```typescript
   import { yourPhaseFunction } from './your-phase';
   ```

3. **Add to phases array**: `src/cli/init/index.ts`
   ```typescript
   const phases: InitPhase[] = [
     // ... existing phases
     {
       name: 'Your Phase',
       description: 'Doing your phase',
       execute: async (cfg) => yourPhaseFunction(cfg),
       critical: false,  // or true if failure should stop init
       rollback: async () => {
         // Optional: rollback logic
       }
     }
   ];
   ```

4. **Export for testing**: `src/cli/init/index.ts`
   ```typescript
   export {
     // ... existing exports
     yourPhaseFunction
   };
   ```

## Rollback System

Critical phases can define rollback functions:

```typescript
{
  name: 'My Phase',
  description: 'Doing important stuff',
  execute: async (cfg) => { /* ... */ },
  critical: true,
  rollback: async (cfg) => {
    // Undo what execute did
    console.log(chalk.yellow('Rolling back My Phase...'));
  }
}
```

When a critical phase fails:
1. Orchestrator stops execution
2. Calls `rollback()` for all completed phases in reverse order
3. Exits with error code

## Error Handling

### Critical Phases
- Failure stops initialization
- Triggers rollback of completed phases
- Exits with error code 1

### Non-Critical Phases
- Failure is logged as warning
- Initialization continues
- Success message still shows

## Testing

Each module can be tested independently:

```typescript
import { createDirectoryStructure } from './directory-structure';

describe('Directory Structure', () => {
  it('should create all directories', async () => {
    await createDirectoryStructure(false);
    // assertions
  });
});
```

## Current Implementation Status

| Module | Status | Notes |
|--------|--------|-------|
| `index.ts` | ✅ Complete | Orchestrator with rollback support |
| `directory-structure.ts` | 🟡 Stub | Needs extraction from init.ts |
| `database-init.ts` | 🟡 Stub | Needs extraction from init.ts |
| `claude-config.ts` | 🟡 Stub | Needs extraction from init.ts (CRITICAL!) |
| `documentation.ts` | 🟡 Stub | Needs extraction from init.ts |
| `bash-wrapper.ts` | 🟡 Stub | Needs extraction from init.ts |

## Next Steps

1. Extract `createDirectoryStructure()` from `/src/cli/commands/init.ts`
2. Extract `initializeDatabases()` from `/src/cli/commands/init.ts`
3. Extract `generateClaudeSettings()` from `/src/cli/commands/init.ts`
4. Extract `copyDocumentation()` from `/src/cli/commands/init.ts`
5. Extract `createBashWrapper()` from `/src/cli/commands/init.ts`
6. Update main CLI to use new modular init: `/src/cli/commands/init.ts`
7. Add comprehensive unit tests for each module
8. Add integration test for full initialization flow

## Design Principles

1. **Each module under 200 lines**
   - Easy to understand and maintain
   - Focused responsibility

2. **No side effects between modules**
   - Each phase is independent
   - Clear dependencies

3. **User-friendly feedback**
   - Spinners for long operations
   - Clear success/failure messages
   - Helpful error messages

4. **Fail-safe**
   - Critical phases stop on error
   - Non-critical phases continue on error
   - Rollback on critical failure

5. **Extensible**
   - Easy to add new phases
   - Clear phase interface
   - Minimal changes to orchestrator

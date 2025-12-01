# Init Command Refactoring Plan

## Current State
- **File**: `src/cli/commands/init.ts`
- **Size**: ~2,700 lines (TOO LARGE)
- **Issues**:
  - Hard to maintain
  - Missing `.claude/settings.json` generation
  - Missing MCP auto-setup
  - No bash wrapper for user projects

## Target State (Following claude-flow Pattern)

### New Structure: `src/cli/init/`

```
src/cli/init/
├── index.ts                    # Main orchestrator (export initCommand function)
├── claude-config.ts            # .claude/settings.json + MCP setup
├── directory-structure.ts      # Directory creation logic
├── database-init.ts            # AgentDB + Memory database initialization
├── documentation.ts            # CLAUDE.md template copying
├── agents.ts                   # Agent template copying
├── fleet-config.ts             # Fleet configuration
└── utils.ts                    # Shared utilities
```

### File Responsibilities

#### 1. **index.ts** (Main Orchestrator)
```typescript
export async function initCommand(options: InitOptions): Promise<void> {
  // Orchestrate initialization phases
  await createDirectoryStructure(options);
  await initializeDatabases(options);
  await createClaudeConfig(options);      // NEW: settings.json + MCP
  await copyDocumentation(options);       // NEW: CLAUDE.md
  await createBashWrapper(options);       // NEW: aqe wrapper
  await copyAgentTemplates(options);
  await createFleetConfig(options);
  await displaySummary(options);
}
```

#### 2. **claude-config.ts** (CRITICAL - Missing Functionality)
```typescript
export async function createClaudeConfig(options: InitOptions): Promise<void> {
  // Generate/merge .claude/settings.json with AgentDB hooks
  await generateClaudeSettings();

  // Setup MCP server integration
  await setupMCPServer();
}
```

**Functions**:
- `generateClaudeSettings()` - Create/merge settings.json with hooks
- `setupMCPServer()` - Auto-add MCP via `claude mcp add`
- `mergeHooks()` - Merge AQE hooks with existing hooks
- `getAQEHooks()` - Return AQE hook configuration

#### 3. **directory-structure.ts**
```typescript
export async function createDirectoryStructure(force: boolean): Promise<void> {
  // Create .agentic-qe/, .claude/, tests/ directories
}
```

#### 4. **database-init.ts**
```typescript
export async function initializeDatabases(config: FleetConfig): Promise<void> {
  await initializeAgentDB(config);
  await initializeMemoryDatabase();
  await initializeLearningSystem(config);
}
```

#### 5. **documentation.ts** (NEW)
```typescript
export async function copyDocumentation(): Promise<void> {
  await copyCLAUDEMdTemplate();
  await generateMinimalClaudeMd();  // Fallback if template not found
}
```

#### 6. **bash-wrapper.ts** (NEW)
```typescript
export async function createBashWrapper(): Promise<void> {
  // Create 'aqe' bash wrapper in project root
  // Similar to claude-flow wrapper
}
```

---

## Bash Wrapper Decision

### Option 1: Create `aqe` wrapper (RECOMMENDED)
**Pros**:
- Ensures commands run from project directory
- Matches claude-flow pattern
- Better UX - users just type `./aqe` instead of `npx aqe`
- Handles local vs global installations

**Cons**:
- Another file in project root

### Option 2: Skip bash wrapper
**Pros**:
- Cleaner project root
- Users already know `npx aqe`

**Cons**:
- Missing parity with claude-flow
- No guarantee of correct working directory

**DECISION**: **Create `aqe` wrapper** for consistency with claude-flow

---

## Implementation Steps

### Phase 1: Create Modular Structure (Non-Breaking)
1. ✅ Create `src/cli/init/` directory
2. ✅ Create module files with extracted functions
3. ✅ Keep old `init.ts` functional during migration

### Phase 2: Extract Functions
1. ✅ Move directory creation → `directory-structure.ts`
2. ✅ Move database init → `database-init.ts`
3. ✅ Move agent copying → `agents.ts`
4. ✅ Move fleet config → `fleet-config.ts`
5. ✅ NEW: Create `claude-config.ts` with hooks
6. ✅ NEW: Create `documentation.ts`
7. ✅ NEW: Create `bash-wrapper.ts`

### Phase 3: Create Orchestrator
1. ✅ Create `src/cli/init/index.ts`
2. ✅ Import and sequence all modules
3. ✅ Add error handling and logging

### Phase 4: Update Entry Point
1. ✅ Update `src/cli/commands/init.ts` to call new orchestrator
2. ✅ OR: Update `src/cli/index.ts` to import from new location
3. ✅ Deprecate old command

### Phase 5: Test & Verify
1. ✅ Test `aqe init` in new project
2. ✅ Verify `.claude/settings.json` created with hooks
3. ✅ Verify MCP server auto-added
4. ✅ Verify `aqe` bash wrapper created
5. ✅ Verify CLAUDE.md copied

---

## Files to Create

### 1. `aqe` bash wrapper template
Location: `templates/aqe.sh`

```bash
#!/usr/bin/env bash
# AQE local wrapper
# Ensures aqe runs from your project directory

PROJECT_DIR="${PWD}"
export PWD="${PROJECT_DIR}"
export AQE_WORKING_DIR="${PROJECT_DIR}"

# Try to find aqe binary
if [ -f "${PROJECT_DIR}/node_modules/.bin/aqe" ]; then
  cd "${PROJECT_DIR}"
  exec "${PROJECT_DIR}/node_modules/.bin/aqe" "$@"
elif [ -f "${PROJECT_DIR}/../node_modules/.bin/aqe" ]; then
  cd "${PROJECT_DIR}"
  exec "${PROJECT_DIR}/../node_modules/.bin/aqe" "$@"
elif command -v aqe &> /dev/null; then
  cd "${PROJECT_DIR}"
  exec aqe "$@"
else
  cd "${PROJECT_DIR}"
  exec npx aqe@latest "$@"
fi
```

---

## Benefits of Refactoring

1. **Maintainability**: ~400 lines per file instead of 2,700
2. **Testability**: Can test each module independently
3. **Readability**: Clear separation of concerns
4. **Extensibility**: Easy to add new init steps
5. **Parity**: Matches claude-flow's proven architecture
6. **Fixes**: Includes missing settings.json + MCP setup

---

## Breaking Changes

**NONE** - This is a pure refactoring with new features added.

Existing `aqe init` command works identically, but now:
- ✅ Creates `.claude/settings.json` with learning hooks
- ✅ Auto-adds MCP server
- ✅ Copies CLAUDE.md documentation
- ✅ Creates `aqe` bash wrapper

---

## Timeline

- **Phase 1-2**: 2-3 hours (module extraction)
- **Phase 3**: 1 hour (orchestrator)
- **Phase 4**: 30 mins (entry point update)
- **Phase 5**: 1 hour (testing)

**Total**: ~5 hours

---

## Success Criteria

After `aqe init` in a new project:

```bash
$ aqe init --yes
✅ Created directory structure
✅ Initialized databases (agentdb.db + memory.db)
✅ Created .claude/settings.json with learning hooks
✅ Added MCP server to Claude Code
✅ Copied CLAUDE.md documentation
✅ Created aqe bash wrapper
✅ Fleet initialization completed!

$ ls -la
-rwxr-xr-x  aqe                    # NEW: Bash wrapper
drwxr-xr-x  .agentic-qe/
drwxr-xr-x  .claude/
-rw-r--r--  CLAUDE.md              # NEW: Documentation

$ ls -la .claude/
-rw-r--r--  settings.json          # NEW: With AgentDB hooks!

$ claude mcp list
agentic-qe    npx aqe-mcp          # NEW: Auto-added!

$ ./aqe learn status
✅ Learning system operational
📊 Patterns: 0 (ready to learn!)
```

**All requirements met!** ✅

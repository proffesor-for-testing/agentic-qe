# AQE Test CLI Commands

This document describes the 10 advanced test CLI commands available in the Agentic QE framework.

## Overview

The AQE test commands provide comprehensive test execution, debugging, profiling, and management capabilities.

## Commands

### 1. `aqe test retry`

Retry failed tests with configurable attempts and backoff strategies.

**Usage:**
```bash
aqe test retry [options]
```

**Options:**
- `-m, --max-attempts <number>` - Maximum retry attempts (default: 3)
- `-b, --backoff <type>` - Backoff strategy: linear or exponential (default: linear)
- `-p, --pattern <pattern>` - Test file pattern to retry
- `--fail-on-none` - Fail if no tests to retry

**Examples:**
```bash
# Retry with default settings
aqe test retry

# Retry with exponential backoff
aqe test retry --backoff exponential --max-attempts 5

# Retry specific pattern
aqe test retry --pattern "*.integration.test.ts"
```

---

### 2. `aqe test parallel`

Execute tests in parallel with worker management.

**Usage:**
```bash
aqe test parallel [options]
```

**Options:**
- `-w, --workers <number>` - Number of worker threads (default: CPU count)
- `-s, --strategy <type>` - Distribution strategy: file, suite, or test (default: file)
- `--show-workers` - Show worker status
- `--fail-fast <boolean>` - Stop on first failure (default: true)

**Examples:**
```bash
# Run with default workers
aqe test parallel

# Run with 8 workers using suite strategy
aqe test parallel --workers 8 --strategy suite

# Show worker status
aqe test parallel --show-workers
```

---

### 3. `aqe test queue`

Manage test queue for scheduled execution.

**Usage:**
```bash
aqe test queue <subcommand> [options]
```

**Subcommands:**
- `status` - Show current queue status
- `add <pattern>` - Add tests to queue
- `remove <pattern>` - Remove tests from queue
- `clear` - Clear entire queue
- `process` - Process queued tests
- `stats` - Show queue statistics

**Examples:**
```bash
# Add tests to queue
aqe test queue add "tests/integration/*.test.ts" --priority high

# Show queue status
aqe test queue status

# Process high priority tests
aqe test queue process --priority high

# Clear queue
aqe test queue clear
```

---

### 4. `aqe test watch`

Watch mode for continuous testing on file changes.

**Usage:**
```bash
aqe test watch [options]
```

**Options:**
- `-p, --pattern <pattern>` - File pattern to watch (default: `**/*.{ts,tsx,js,jsx}`)
- `--changed-only` - Run only changed tests
- `--related` - Run tests related to changed files
- `--no-interactive` - Disable interactive mode

**Interactive Commands:**
- `a` - Run all tests
- `f` - Run failed tests
- `q` - Quit watch mode

**Examples:**
```bash
# Start watch mode
aqe test watch

# Watch specific pattern
aqe test watch --pattern "src/**/*.ts"

# Run only changed tests
aqe test watch --changed-only
```

---

### 5. `aqe test clean`

Clean test artifacts and temporary files.

**Usage:**
```bash
aqe test clean [options]
```

**Options:**
- `--coverage` - Clean coverage reports only
- `--snapshots` - Clean snapshot files only
- `--cache` - Clean test cache only
- `--dry-run` - Show what would be cleaned without deleting
- `--show-size` - Show size of files to be cleaned

**Examples:**
```bash
# Clean all artifacts
aqe test clean

# Clean coverage only
aqe test clean --coverage

# Dry run to see what would be cleaned
aqe test clean --dry-run --show-size
```

---

### 6. `aqe test debug`

Debug test failures with detailed diagnostics.

**Usage:**
```bash
aqe test debug [testFile] [options]
```

**Options:**
- `--break-on-failure` - Attach debugger on failure
- `-v, --verbose` - Show detailed error traces
- `--screenshots` - Capture screenshots on failure
- `--save-logs` - Save debug logs to file
- `--replay <testId>` - Replay specific test execution

**Examples:**
```bash
# Debug specific test
aqe test debug tests/integration/api.test.ts

# Debug with verbose output and screenshots
aqe test debug --verbose --screenshots

# Replay failed test
aqe test debug --replay test-id-123
```

---

### 7. `aqe test profile`

Profile test performance and resource usage.

**Usage:**
```bash
aqe test profile [options]
```

**Options:**
- `--cpu` - Show CPU profiling
- `--memory` - Show memory profiling
- `--slowest <count>` - Show N slowest tests
- `--export <file>` - Export profile data to file
- `--flame-graph` - Generate flame graph

**Examples:**
```bash
# Profile tests
aqe test profile

# Show CPU and memory profiling
aqe test profile --cpu --memory

# Show 10 slowest tests
aqe test profile --slowest 10

# Export and generate flame graph
aqe test profile --export profile.json --flame-graph
```

---

### 8. `aqe test trace`

Trace test execution flow and timing.

**Usage:**
```bash
aqe test trace [testFile] [options]
```

**Options:**
- `--timeline` - Show execution timeline
- `--save <file>` - Save trace data to file
- `--call-stack` - Show call stack for each step

**Examples:**
```bash
# Trace all tests
aqe test trace

# Trace specific test with timeline
aqe test trace tests/unit/auth.test.ts --timeline

# Save trace with call stack
aqe test trace --call-stack --save trace.json
```

---

### 9. `aqe test snapshot`

Snapshot testing management and updates.

**Usage:**
```bash
aqe test snapshot [options]
```

**Options:**
- `-u, --update` - Update snapshots
- `-p, --pattern <pattern>` - Update only matching snapshots
- `--diff` - Show snapshot differences
- `--clean` - Remove obsolete snapshots
- `--list` - List all snapshots
- `--coverage` - Show snapshot coverage

**Examples:**
```bash
# Update all snapshots
aqe test snapshot --update

# Update specific snapshots
aqe test snapshot --update --pattern "Component*.test.ts"

# Show snapshot diff
aqe test snapshot --diff

# List all snapshots
aqe test snapshot --list

# Clean obsolete snapshots
aqe test snapshot --clean
```

---

### 10. `aqe test diff`

Compare test results between runs.

**Usage:**
```bash
aqe test diff [run1] [run2] [options]
```

**Options:**
- `--detailed` - Show detailed differences
- `--coverage` - Compare coverage reports
- `--performance` - Compare performance metrics
- `--show-regression` - Highlight regressions
- `--export <file>` - Export diff report to file

**Examples:**
```bash
# Compare latest two runs
aqe test diff

# Compare specific runs
aqe test diff run-123 run-124

# Show detailed diff with regression
aqe test diff --detailed --show-regression

# Compare coverage and performance
aqe test diff --coverage --performance

# Export diff report
aqe test diff --export diff-report.json
```

---

## Coordination with Other Agents

These test commands coordinate with:

- **Agent 1 (MCP Tools)** - Backend test execution integration
- **Memory System** - Shared state via `aqe/swarm/test-cli-commands/*`
- **Claude Flow Hooks** - Automatic coordination and notification

## Architecture

```
src/cli/commands/test/
├── index.ts         # Main test command aggregator
├── retry.ts         # Retry failed tests
├── parallel.ts      # Parallel execution
├── queue.ts         # Queue management
├── watch.ts         # Watch mode
├── clean.ts         # Cleanup artifacts
├── debug.ts         # Debug failures
├── profile.ts       # Performance profiling
├── trace.ts         # Execution tracing
├── snapshot.ts      # Snapshot testing
└── diff.ts          # Result comparison
```

## Testing

Comprehensive test suite with 50+ tests:

```bash
npm test tests/cli/test.test.ts
```

## Implementation Notes

1. **TDD First**: Tests written before implementation
2. **Parallel Operations**: All commands support concurrent execution
3. **Memory Integration**: Shared state via Claude Flow memory
4. **Hook Integration**: Pre/post task hooks for coordination
5. **Error Handling**: Comprehensive error messages and recovery

---

**Total Commands**: 10
**Total Tests**: 50+
**Test Coverage Target**: 95%+
**Coordination**: Claude Flow + Memory System

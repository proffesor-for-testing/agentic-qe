# CLAUDE.md Integration for Agentic QE Fleet

## Overview

The Agentic QE Fleet now includes automatic CLAUDE.md integration. When initializing AQE agents in any project, the system automatically updates or creates the project's CLAUDE.md file with essential AQE rules and best practices.

## Features

### Automatic CLAUDE.md Management

1. **New Projects**: Creates CLAUDE.md with complete AQE configuration
2. **Existing Projects**: Appends AQE rules while preserving existing content
3. **Idempotent Updates**: Running init multiple times won't duplicate rules
4. **Target Directory Support**: Initialize AQE in any project directory

### What Gets Added

The following sections are automatically added to CLAUDE.md:

- **🚀 AGENTIC QE FLEET - CRITICAL RULES**
  - Project structure explanation
  - Available QE agents and their capabilities
  - Agent usage examples
  - Best practices
  - Common pitfalls
  - Command reference

## Usage

### Initialize in Current Directory

```bash
aqe init
```

This will:
1. Create `.claude/agents/` directory with 6 QE agents
2. Create/update `CLAUDE.md` with AQE rules
3. Initialize Claude Flow hooks
4. Store fleet configuration

### Initialize in Target Directory

```bash
aqe init /path/to/project
```

This will initialize AQE in the specified project directory.

### Using the Shorthand Command

```bash
aqe init [directory]
```

The `aqe` command is the recommended shorthand for all AQE operations. It's easier to type and remember.

## CLAUDE.md Structure

The AQE section added to CLAUDE.md includes:

### 📦 Project Structure
Explains why AQE is in a subfolder and the modular monorepo pattern.

### 🤖 Available QE Agents
Lists all 6 QE agents with their key capabilities:
- `qe-test-generator`: AI-powered test creation
- `qe-test-executor`: Parallel test execution
- `qe-coverage-analyzer`: O(log n) coverage optimization
- `qe-quality-gate`: Intelligent go/no-go decisions
- `qe-performance-tester`: Load testing and bottleneck detection
- `qe-security-scanner`: SAST/DAST integration

### ⚡ Agent Usage
Shows how to spawn agents using:
- Claude Code Task tool
- MCP tools for coordination

### 🎯 Best Practices
Key recommendations for effective AQE usage.

### ⚠️ Common Pitfalls
Warns about common mistakes and misconceptions.

### 🔧 Commands
Quick reference for essential AQE commands.

## Implementation Details

### Update Logic

The `updateClaudeMD()` function in `bin/agentic-qe-real`:

1. **Checks for existing CLAUDE.md**
   - If exists: Appends or updates AQE section
   - If not exists: Creates new file with AQE rules

2. **Prevents Duplication**
   - Detects existing AQE sections
   - Replaces old sections with updated content
   - Uses markers to identify AQE content boundaries

3. **Preserves Existing Content**
   - Never removes non-AQE content
   - Maintains project-specific configurations
   - Appends AQE rules at the end if not present

### Integration Points

The CLAUDE.md update happens during:

1. **Fleet Initialization** (`aqe init`)
   - Automatically updates CLAUDE.md
   - No additional command needed

2. **Agent Registration**
   - Creates agent definitions in `.claude/agents/`
   - References in CLAUDE.md for visibility

3. **Claude Flow Integration**
   - Hooks are documented in CLAUDE.md
   - Memory patterns explained for coordination

## Testing

### Test Coverage

The `tests/test-claude-md-update.js` script validates:

1. **New CLAUDE.md Creation**
   - Verifies file creation in empty projects
   - Confirms AQE rules are present

2. **Existing CLAUDE.md Update**
   - Tests appending to existing files
   - Preserves original content

3. **Idempotency**
   - Running init twice doesn't duplicate rules
   - Updates replace old AQE sections cleanly

### Running Tests

```bash
node tests/test-claude-md-update.js
```

Expected output:
- ✅ Test 1 PASSED: CLAUDE.md created with AQE rules
- ✅ Test 2 PASSED: Existing CLAUDE.md updated with AQE rules
- ✅ Test 3 PASSED: AQE rules not duplicated on second run

## Benefits

### For Developers

1. **Instant Documentation**: No manual CLAUDE.md setup required
2. **Consistent Configuration**: All projects get the same AQE rules
3. **Best Practices Built-in**: Automatically includes tips and warnings
4. **Version Control Friendly**: Changes tracked in Git

### For Claude Code

1. **Context Awareness**: Claude Code understands AQE configuration
2. **Agent Discovery**: Agents visible in `.claude/agents/`
3. **Command Reference**: Quick access to AQE commands
4. **Integration Points**: Hooks and memory patterns documented

## Troubleshooting

### CLAUDE.md Not Updated

If CLAUDE.md isn't updated:
1. Check write permissions in target directory
2. Verify `aqe` is in PATH
3. Run with explicit target: `aqe init .`

### Duplicate AQE Sections

If you see duplicate sections:
1. Manually remove one section
2. Run `agentic-qe init` again
3. The update logic will handle it correctly

### Agents Not Visible

If agents aren't in `.claude/agents/`:
1. Check the target directory is correct
2. Verify initialization completed successfully
3. Look for `.claude/aqe-fleet.json` configuration

## Future Enhancements

Potential improvements for CLAUDE.md integration:

1. **Custom Templates**: Allow projects to define their own AQE templates
2. **Version Tracking**: Track AQE version in CLAUDE.md
3. **Auto-Update**: Update CLAUDE.md when agents are modified
4. **Validation**: Verify CLAUDE.md syntax after updates
5. **Backup**: Create backups before modifying existing files

## Conclusion

The CLAUDE.md integration ensures every project using Agentic QE Fleet has proper documentation and configuration. This automatic setup reduces onboarding time and ensures consistency across all projects using the QE agents.

For questions or issues, refer to the main [Agentic QE documentation](../README.md) or open an issue on GitHub.
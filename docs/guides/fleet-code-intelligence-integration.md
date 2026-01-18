# Fleet + Code Intelligence Integration Guide

## Overview

Fleet initialization now includes automatic code intelligence checks to ensure agents have access to semantic search capabilities before being spawned.

## Quick Start

### Standard Fleet Init (Recommended)
```bash
# Run with wizard for best experience
aqe fleet init --wizard

# The wizard will:
# 1. Check for code intelligence index
# 2. Prompt to scan if missing
# 3. Guide you through fleet configuration
```

### Skip Code Intelligence Check
```bash
# For CI/automated scenarios
aqe fleet init --skip-code-scan

# Or non-interactive mode
aqe fleet init --topology hierarchical --max-agents 15 --skip-code-scan
```

## When to Use Code Intelligence

**Use code intelligence when:**
- Testing complex codebases (>1000 files)
- Need semantic code search
- Want improved agent accuracy (up to 80% better)
- Long-term project (index is reusable)

**Skip code intelligence when:**
- Quick testing/demos
- Small codebases (<100 files)
- CI/CD pipelines with time constraints
- Already have index from previous init

## Building the Index

If fleet init detects no index, it will recommend:

```bash
aqe code-intelligence index
```

This command:
- Scans all source files (`.ts`, `.js`, `.tsx`, `.jsx`, `.py`)
- Builds knowledge graph in `.agentic-qe/memory.db`
- Takes ~30s for typical project (1000 files)
- Only needs to run once per project

## Index Status

Check if you have an index:

```bash
# Part of fleet init output
aqe fleet init
# Shows: "✓ Code intelligence index found (X entries)"

# Or check memory backend directly
ls -la .agentic-qe/memory.db
```

## Agent Benefits

Agents spawned with code intelligence have access to:

### Semantic Search
```typescript
// Find code by meaning, not just keywords
"Find authentication logic"
→ Returns: auth.service.ts, jwt.utils.ts, user.middleware.ts
```

### Context-Aware Analysis
```typescript
// Understand relationships between modules
"What calls the payment processor?"
→ Returns: Full call chain with context
```

### Intelligent Test Generation
```typescript
// Generate tests based on actual code patterns
"Generate tests for order service"
→ Returns: Tests covering all public methods + edge cases
```

## Integration with AQE Init

The code intelligence check is shared between:
- `aqe init` - Runs scan as part of full initialization
- `aqe fleet init` - Checks for existing index, prompts if missing

**Best Practice:**
```bash
# Full setup (recommended for new projects)
aqe init --wizard

# Later, spawn fleet (will reuse index)
aqe fleet init --wizard
```

## Troubleshooting

### Index Not Found
```bash
# Check database exists
ls .agentic-qe/memory.db

# Rebuild index
aqe code-intelligence index

# Try fleet init again
aqe fleet init
```

### Index Too Large
```bash
# Exclude directories from indexing
# Edit .agentic-qe/config.yaml:
domains:
  code-intelligence:
    indexing:
      exclude:
        - "test/**"
        - "build/**"
        - "dist/**"
```

### Slow Indexing
```bash
# For large projects (>10k files)
# Use incremental indexing
aqe code-intelligence index --incremental

# Or skip for now
aqe fleet init --skip-code-scan
```

## CI/CD Integration

```yaml
# GitHub Actions example
- name: Initialize AQE Fleet
  run: |
    # Skip scan in CI (use pre-built index or skip)
    aqe fleet init --skip-code-scan --topology hierarchical
```

## Examples

### Example 1: New Project
```bash
# First time setup
aqe init --wizard
# Includes code intelligence scan

# Later, spawn fleet
aqe fleet init
# Reuses existing index, no scan needed
```

### Example 2: Existing Project (No Index)
```bash
# Start fleet init
aqe fleet init --wizard

# Prompted:
#   ⚠ No code intelligence index found
#   Run scan now? [Y/n]:

# Choose 'y', then:
aqe code-intelligence index

# Re-run fleet init
aqe fleet init
# Now shows: ✓ Code intelligence index found
```

### Example 3: Skip for Speed
```bash
# Quick test without index
aqe fleet init --skip-code-scan --max-agents 5
```

## Performance

| Project Size | Index Time | Agents Benefit |
|--------------|------------|----------------|
| <100 files   | ~5s        | Minimal        |
| 100-1k files | ~15s       | Moderate (+40%)|
| 1k-10k files | ~45s       | Significant (+70%)|
| >10k files   | ~2min      | Maximum (+80%) |

## FAQ

**Q: Do I need to rebuild the index after code changes?**
A: No, agents work with the snapshot. Rebuild periodically (weekly) for best accuracy.

**Q: Can I use fleet without code intelligence?**
A: Yes! Use `--skip-code-scan` or choose 'n' when prompted. Agents will use basic analysis.

**Q: What's stored in the index?**
A: AST nodes, relationships, function signatures, imports. No secrets or credentials.

**Q: How much disk space does it use?**
A: Typically 5-10 MB for 1000 files. Stored in SQLite `.agentic-qe/memory.db`.

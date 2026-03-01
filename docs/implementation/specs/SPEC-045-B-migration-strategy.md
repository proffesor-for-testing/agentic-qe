# SPEC-045-B: Migration Strategy and Scripts

| Field | Value |
|-------|-------|
| **Specification ID** | SPEC-045-B |
| **Parent ADR** | [ADR-045](../adrs/ADR-045-version-agnostic-naming.md) |
| **Version** | 1.0 |
| **Status** | Implemented |
| **Last Updated** | 2026-01-14 |
| **Author** | Migration Analysis Agent |

---

## Overview

This specification documents the migration strategy, scripts, and procedures for renaming v3-prefixed assets to version-agnostic names.

---

## Migration Phases

### Original Plan vs Actual Execution

| Phase | Original Plan | Actual Execution | Notes |
|-------|---------------|------------------|-------|
| **Phase 1: Create Aliases** | Week 1 - Add v3-* aliases | Skipped | User decided backward compat not needed |
| **Phase 2: Rename Files** | Week 2-3 - Rename all files | Completed Day 1 | 47 agents, 12 skill dirs |
| **Phase 3: CLI Updates** | Week 3-4 - Binary + paths | Completed Day 1 | aqe, aqe-mcp, .aqe/ |
| **Phase 4: Remove Old** | Week 6+ - Post transition | Completed Day 1 | No transition period |

---

## Agent File Renaming Script

```bash
#!/bin/bash
# rename-agents.sh
# Renames v3-prefixed agent files to version-agnostic names

set -e

cd .claude/agents/v3/

echo "Renaming agent files..."

for file in v3-*.md; do
  if [[ -f "$file" ]]; then
    newname="${file/v3-/}"
    echo "  $file -> $newname"
    git mv "$file" "$newname"
    # Update internal references
    sed -i 's/v3-qe-/qe-/g' "$newname"
  fi
done

# Subagents
if [[ -d "subagents" ]]; then
  cd subagents/
  echo "Renaming subagent files..."
  for file in v3-*.md; do
    if [[ -f "$file" ]]; then
      newname="${file/v3-/}"
      echo "  $file -> $newname"
      git mv "$file" "$newname"
      sed -i 's/v3-qe-/qe-/g' "$newname"
    fi
  done
fi

echo "Agent rename complete."
```

---

## Skill Directory Renaming Script

```bash
#!/bin/bash
# rename-skills.sh
# Renames v3-prefixed skill directories to version-agnostic names

set -e

cd .claude/skills/

echo "Renaming skill directories..."

for dir in v3-qe-*/; do
  if [[ -d "$dir" ]]; then
    newname="${dir/v3-qe-/qe-}"
    newname="${newname%/}"  # Remove trailing slash
    echo "  ${dir%/} -> $newname"
    git mv "${dir%/}" "$newname"

    # Update SKILL.md frontmatter
    if [[ -f "$newname/SKILL.md" ]]; then
      sed -i 's/v3-qe-/qe-/g' "$newname/SKILL.md"
    fi
  fi
done

echo "Skill rename complete."
```

---

## Files Modified

### Core Source Files

| File | Changes |
|------|---------|
| `v3/package.json` | bin entries: `aqe`, `aqe-mcp` (removed `aqe-v3`, `aqe-v3-mcp`) |
| `v3/src/cli/index.ts` | Removed deprecation warning, updated config paths |
| `v3/src/cli/completions/index.ts` | Shell completions for `aqe` only |
| `v3/src/cli/config/cli-config.ts` | Config dir path `.aqe` |
| `v3/src/cli/scheduler/persistent-scheduler.ts` | Scheduler path `.aqe` |
| `v3/scripts/prepare-assets.sh` | Agent/skill copy patterns |

### Package.json Changes

```json
{
  "bin": {
    "aqe": "./dist/cli/bundle.js",
    "aqe-mcp": "./dist/mcp/bundle.js"
  }
}
```

**Removed entries:**
- `"aqe-v3": "./dist/cli/bundle.js"`
- `"aqe-v3-mcp": "./dist/mcp/bundle.js"`

### Config Path Changes

```typescript
// Before
const CONFIG_DIR = '.aqe-v3';

// After
const CONFIG_DIR = '.aqe';
```

---

## Risk Assessment

### High Risk Items

| Item | Risk | Mitigation |
|------|------|------------|
| CLI binary rename | Breaks existing scripts | Keep `aqe-v3` as symlink (not implemented per user) |
| Config path change | Loses user data | Auto-migrate on first run (not needed - no existing users) |
| Agent name conflicts | v2/v3 collision | Use explicit routing |

### Medium Risk Items

| Item | Risk | Mitigation |
|------|------|------------|
| Skill name changes | Breaks skill triggers | Add aliases (not needed) |
| Completion scripts | Users need to regenerate | Auto-detect and warn |
| Documentation | Outdated references | Batch update |

### Low Risk Items

| Item | Risk | Mitigation |
|------|------|------------|
| MCP tool names | Already version-agnostic | None needed |
| Internal file references | Localized changes | Automated sed |

---

## Execution Order

Tasks must run in this order due to dependencies:

1. **Update index.yaml** (before file renaming)
2. **Rename agent files** (after index.yaml updated)
3. **Rename skill directories** (parallel with agents)
4. **Update CLI binary name** (after files renamed)
5. **Update config paths** (after CLI renamed)
6. **Update tests** (after all renames)
7. **Run test suite** (validation)

### Parallel Tasks

These can run simultaneously:
- Agent file renaming (all 47 files independent)
- Skill directory renaming (all 12 directories independent)
- Documentation updates

---

## Validation Checklist

```bash
#!/bin/bash
# validate-rename.sh
# Validates the naming migration was successful

echo "Validating naming migration..."

# Check no v3-prefixed agent files remain
v3_agents=$(find .claude/agents/v3 -name "v3-*.md" 2>/dev/null | wc -l)
if [[ $v3_agents -gt 0 ]]; then
  echo "ERROR: Found $v3_agents v3-prefixed agent files"
  exit 1
fi

# Check no v3-prefixed skill directories remain
v3_skills=$(find .claude/skills -type d -name "v3-*" 2>/dev/null | wc -l)
if [[ $v3_skills -gt 0 ]]; then
  echo "ERROR: Found $v3_skills v3-prefixed skill directories"
  exit 1
fi

# Check CLI binary exists
if ! command -v aqe &> /dev/null; then
  echo "WARNING: aqe binary not in PATH"
fi

# Check config directory
if [[ -d ".aqe-v3" && ! -d ".aqe" ]]; then
  echo "WARNING: Old .aqe-v3 directory exists but no .aqe"
fi

echo "Validation complete."
```

---

## Rollback Procedure

If migration fails:

```bash
#!/bin/bash
# rollback-rename.sh
# Reverts naming changes (requires git)

git checkout HEAD -- .claude/agents/
git checkout HEAD -- .claude/skills/
git checkout HEAD -- v3/package.json
git checkout HEAD -- v3/src/cli/

echo "Rollback complete. Run 'git status' to verify."
```

---

## Related Specifications

| Spec ID | Title | Relationship |
|---------|-------|--------------|
| [SPEC-045-A](./SPEC-045-A-agent-rename-mapping.md) | Agent Mapping | Complete mapping reference |
| [SPEC-045-C](./SPEC-045-C-v2-compatibility.md) | V2 Compatibility | Legacy alias definitions |

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-14 | Migration Agent | Initial implementation |
| 1.0 | 2026-01-20 | Architecture Team | Extracted from ADR-045 |

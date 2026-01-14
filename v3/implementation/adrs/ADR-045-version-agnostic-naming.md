# ADR-045: Version-Agnostic Naming Migration Plan

**Status:** Implemented
**Date:** 2026-01-14
**Implemented:** 2026-01-14
**Author:** Migration Analysis Agent
**Supersedes:** None

---

## Implementation Status

### What Was Implemented

| Component | Planned | Actual | Notes |
|-----------|---------|--------|-------|
| Agent files (47) | Rename v3-qe-* → qe-* | ✅ Done | All 47 files in v3/assets/agents/v3/ renamed |
| Skill directories (12) | Rename v3-qe-* → qe-* | ✅ Done | All 12 directories renamed |
| CLI binary | aqe-v3 → aqe | ✅ Done | package.json bin updated |
| MCP binary | aqe-v3-mcp → aqe-mcp | ✅ Done | package.json bin updated |
| Config directory | .aqe-v3/ → .aqe/ | ✅ Done | All paths updated |
| Shell completions | Both names | ⚠️ Modified | Only `aqe` (backward compat removed per user) |
| Backward compat aliases | Keep old names | ❌ Skipped | User decided not needed |
| Deprecation warnings | Add warnings | ❌ Skipped | User decided not needed |
| prepare-assets.sh | Update patterns | ✅ Done | Now copies only QE skills |

### Phase Execution vs Plan

| Phase | Plan | Actual |
|-------|------|--------|
| **Phase 1: Create Aliases** | Add v3-* aliases | ❌ Skipped - User said backward compat not needed |
| **Phase 2: Rename Files** | Rename all files | ✅ Completed - 47 agents, 12 skill dirs |
| **Phase 3: CLI Updates** | Binary + paths | ✅ Completed - aqe, aqe-mcp, .aqe/ |
| **Phase 4: Remove Old** | Post transition | ✅ Done immediately - no transition period |

### Files Modified

**Core Changes:**
- `v3/package.json` - bin entries: `aqe`, `aqe-mcp` (removed aqe-v3, aqe-v3-mcp)
- `v3/src/cli/index.ts` - Removed deprecation warning, updated config paths
- `v3/src/cli/completions/index.ts` - Shell completions for aqe only
- `v3/src/cli/config/cli-config.ts` - Config dir path .aqe
- `v3/src/cli/scheduler/persistent-scheduler.ts` - Scheduler path .aqe
- `v3/scripts/prepare-assets.sh` - Agent/skill copy patterns

**Assets Renamed:**
- 47 agent files: `.claude/agents/v3/v3-qe-*.md` → `qe-*.md`
- 12 skill dirs: `.claude/skills/v3-qe-*` → `qe-*`
- Copied to v3/assets for npm publish

**Tests Updated:**
- `v3/tests/unit/cli/completions.test.ts` - Assertions for aqe

### Deviations from Plan

1. **No Backward Compatibility Period**: Plan called for 6-week transition with aliases. User decision: "we do not need this: aqe (with deprecation warning for aqe-v3), I only have a couple of friends who tried this"

2. **No Deprecation Warnings**: Plan called for console warnings when using old names. Not implemented per user request.

3. **Skills Cleanup**: Additional work not in plan - removed 69 non-QE skills from v3/assets, keeping only 51 QE-related skills.

4. **V2 QE Skills Added**: Plan didn't mention including v2 QE skills (accessibility-testing, tdd-london-chicago, etc.). Added 36 v2 QE skills with generic names.

### Test Results

- **4027 tests passing** (6 flaky timing tests pre-existing)
- CLI verified working: `aqe init --minimal`
- MCP verified working: 13 domains initialized
- Shell completions verified for bash, zsh, fish, powershell

---

## Context

The current Agentic QE v3 implementation uses `v3-` prefixes extensively in:
- Agent names (e.g., `v3-qe-test-architect`)
- Skill names (e.g., `v3-qe-test-generation`)
- CLI command name (`aqe-v3`)
- Directory paths (e.g., `.aqe-v3/`)

This creates maintenance challenges:
1. **Version Lock-in**: What happens when v4 is released? Do we rename everything again?
2. **User Confusion**: Multiple naming conventions (v2 `qe-*` vs v3 `v3-qe-*`)
3. **Documentation Debt**: Every version bump requires documentation updates
4. **Breaking Changes**: Renaming forces users to update their scripts and configurations

## Decision

Adopt **semantic, version-agnostic naming** that describes function rather than version.

---

## Inventory of Items Requiring Renaming

### 1. V3 Agents (47 total, 40 with v3-prefix)

**Location:** `.claude/agents/v3/`

| Current Name | Proposed Name | Category |
|-------------|---------------|----------|
| `v3-qe-queen-coordinator` | `qe-queen-coordinator` | Coordinator |
| `v3-qe-test-architect` | `qe-test-architect` | Test Generation |
| `v3-qe-tdd-specialist` | `qe-tdd-specialist` | Test Generation |
| `v3-qe-integration-tester` | `qe-integration-tester` | Test Generation |
| `v3-qe-property-tester` | `qe-property-tester` | Test Generation |
| `v3-qe-parallel-executor` | `qe-parallel-executor` | Test Execution |
| `v3-qe-flaky-hunter` | `qe-flaky-hunter` | Test Execution |
| `v3-qe-retry-handler` | `qe-retry-handler` | Test Execution |
| `v3-qe-coverage-specialist` | `qe-coverage-specialist` | Coverage Analysis |
| `v3-qe-gap-detector` | `qe-gap-detector` | Coverage Analysis |
| `v3-qe-mutation-tester` | `qe-mutation-tester` | Coverage Analysis |
| `v3-qe-quality-gate` | `qe-quality-gate` | Quality Assessment |
| `v3-qe-deployment-advisor` | `qe-deployment-advisor` | Quality Assessment |
| `v3-qe-code-complexity` | `qe-code-complexity` | Quality Assessment |
| `v3-qe-defect-predictor` | `qe-defect-predictor` | Defect Intelligence |
| `v3-qe-pattern-learner` | `qe-pattern-learner` | Defect Intelligence |
| `v3-qe-root-cause-analyzer` | `qe-root-cause-analyzer` | Defect Intelligence |
| `v3-qe-regression-analyzer` | `qe-regression-analyzer` | Defect Intelligence |
| `v3-qe-requirements-validator` | `qe-requirements-validator` | Requirements |
| `v3-qe-bdd-generator` | `qe-bdd-generator` | Requirements |
| `v3-qe-code-intelligence` | `qe-code-intelligence` | Code Intelligence |
| `v3-qe-dependency-mapper` | `qe-dependency-mapper` | Code Intelligence |
| `v3-qe-kg-builder` | `qe-kg-builder` | Code Intelligence |
| `v3-qe-impact-analyzer` | `qe-impact-analyzer` | Code Intelligence |
| `v3-qe-security-scanner` | `qe-security-scanner` | Security |
| `v3-qe-security-auditor` | `qe-security-auditor` | Security |
| `v3-qe-contract-validator` | `qe-contract-validator` | Contract Testing |
| `v3-qe-graphql-tester` | `qe-graphql-tester` | Contract Testing |
| `v3-qe-visual-tester` | `qe-visual-tester` | Visual/A11y |
| `v3-qe-accessibility-auditor` | `qe-accessibility-auditor` | Visual/A11y |
| `v3-qe-responsive-tester` | `qe-responsive-tester` | Visual/A11y |
| `v3-qe-chaos-engineer` | `qe-chaos-engineer` | Chaos/Resilience |
| `v3-qe-load-tester` | `qe-load-tester` | Chaos/Resilience |
| `v3-qe-performance-tester` | `qe-performance-tester` | Chaos/Resilience |
| `v3-qe-learning-coordinator` | `qe-learning-coordinator` | Learning |
| `v3-qe-transfer-specialist` | `qe-transfer-specialist` | Learning |
| `v3-qe-metrics-optimizer` | `qe-metrics-optimizer` | Learning |
| `v3-qe-qx-partner` | `qe-qx-partner` | Specialized |
| `v3-qe-fleet-commander` | `qe-fleet-commander` | Specialized |
| `v3-qe-risk-assessor` | `qe-risk-assessor` | Quality Assessment |
| `v3-integration-architect` | `qe-integration-architect` | Architecture |

**Subagents (7 total):**

| Current Name | Proposed Name |
|-------------|---------------|
| `v3-qe-tdd-red` | `qe-tdd-red` |
| `v3-qe-tdd-green` | `qe-tdd-green` |
| `v3-qe-tdd-refactor` | `qe-tdd-refactor` |
| `v3-qe-code-reviewer` | `qe-code-reviewer` |
| `v3-qe-integration-reviewer` | `qe-integration-reviewer` |
| `v3-qe-performance-reviewer` | `qe-performance-reviewer` |
| `v3-qe-security-reviewer` | `qe-security-reviewer` |

**Non-prefixed agents (already version-agnostic - 11 total):**
- `adr-architect.md`
- `claims-authorizer.md`
- `collective-intelligence-coordinator.md`
- `ddd-domain-expert.md`
- `memory-specialist.md`
- `performance-engineer.md`
- `reasoningbank-learner.md`
- `security-architect.md`
- `security-auditor.md`
- `sparc-orchestrator.md`
- `swarm-memory-manager.md`

### 2. V3 Skills (12 domain skills)

**Location:** `.claude/skills/`

| Current Name | Proposed Name |
|-------------|---------------|
| `v3-qe-test-generation` | `qe-test-generation` |
| `v3-qe-test-execution` | `qe-test-execution` |
| `v3-qe-coverage-analysis` | `qe-coverage-analysis` |
| `v3-qe-quality-assessment` | `qe-quality-assessment` |
| `v3-qe-defect-intelligence` | `qe-defect-intelligence` |
| `v3-qe-requirements-validation` | `qe-requirements-validation` |
| `v3-qe-code-intelligence` | `qe-code-intelligence` |
| `v3-qe-security-compliance` | `qe-security-compliance` |
| `v3-qe-contract-testing` | `qe-contract-testing` |
| `v3-qe-visual-accessibility` | `qe-visual-accessibility` |
| `v3-qe-chaos-resilience` | `qe-chaos-resilience` |
| `v3-qe-learning-optimization` | `qe-learning-optimization` |

### 3. CLI Commands & Binary Name

**Current:** `aqe-v3`
**Proposed:** `aqe` (with version flag: `aqe --version`)

| Current | Proposed | Notes |
|---------|----------|-------|
| `aqe-v3` | `aqe` | Main binary |
| `aqe-v3 init` | `aqe init` | Same subcommands |
| `aqe-v3-mcp` | `aqe-mcp` | MCP server |
| `.aqe-v3/` | `.aqe/` | Config directory |
| `~/.aqe-v3/` | `~/.aqe/` | User config |

### 4. MCP Tools (Already Version-Agnostic!)

**Good news:** MCP tools already use semantic naming:

```typescript
// Already version-agnostic - NO CHANGE NEEDED
'qe/tests/generate'
'qe/tests/execute'
'qe/coverage/analyze'
'qe/coverage/gaps'
'qe/quality/evaluate'
'qe/defects/predict'
'qe/requirements/validate'
'qe/code/analyze'
'qe/security/scan'
'qe/contracts/validate'
'qe/visual/compare'
'qe/a11y/audit'
'qe/chaos/inject'
'qe/learning/optimize'
```

### 5. V2 Legacy Agents (20 agents - for reference)

These use the `qe-` prefix (already version-agnostic):

| V2 Agent | Status |
|----------|--------|
| `qe-test-generator` | Keep as alias for `qe-test-architect` |
| `qe-coverage-analyzer` | Keep as alias for `qe-coverage-specialist` |
| `qe-quality-gate` | Conflicts - rename v3 to inherit |
| `qe-quality-analyzer` | Keep as alias |
| `qe-flaky-test-hunter` | Keep as alias for `qe-flaky-hunter` |
| `qe-test-executor` | Keep as alias for `qe-parallel-executor` |
| `qe-deployment-readiness` | Keep as alias for `qe-deployment-advisor` |
| `qe-security-scanner` | Conflicts - rename v3 to inherit |
| `qe-chaos-engineer` | Conflicts - rename v3 to inherit |
| `qe-visual-tester` | Conflicts - rename v3 to inherit |
| `qe-code-intelligence` | Conflicts - rename v3 to inherit |
| `qe-requirements-validator` | Conflicts - rename v3 to inherit |
| `qe-api-contract-validator` | Keep as alias for `qe-contract-validator` |
| `qe-regression-risk-analyzer` | Keep as alias for `qe-regression-analyzer` |
| `qe-code-complexity` | Conflicts - rename v3 to inherit |
| `qe-performance-tester` | Conflicts - rename v3 to inherit |
| `qe-production-intelligence` | Keep as alias |
| `qe-test-data-architect` | New agent needed |
| `qe-fleet-commander` | Conflicts - rename v3 to inherit |
| `qe-a11y-ally` | Keep as alias for `qe-accessibility-auditor` |

---

## Naming Convention

### Proposed Standard

```
<prefix>-<domain>-<function>

Where:
- prefix: 'qe' for Quality Engineering agents
- domain: Optional domain hint (test, coverage, security, etc.)
- function: What it does (generator, analyzer, validator, etc.)
```

### Examples

| Type | Pattern | Example |
|------|---------|---------|
| Agent | `qe-<function>` | `qe-test-architect` |
| Skill | `qe-<domain>` | `qe-test-generation` |
| Tool | `qe/<domain>/<action>` | `qe/tests/generate` |
| CLI | `aqe <command>` | `aqe test generate` |

### Version Indicator Strategy

Instead of version in names, use:
1. **Capability flags** in agent metadata
2. **Feature detection** at runtime
3. **API versions** in MCP protocol
4. **Explicit version command**: `aqe --version`

---

## Migration Strategy

### Phase 1: Create Aliases (Week 1) - LOW RISK

**Goal:** Support both old and new names without breaking changes

```yaml
# In index.yaml, add alias support
aliases:
  v3-qe-test-architect: qe-test-architect
  v3-qe-coverage-specialist: qe-coverage-specialist
  # ... etc
```

**Files to modify:**
- `.claude/agents/v3/index.yaml` - Add aliases section
- `v3/src/cli/completions/index.ts` - Add both names to completion
- `v3/src/coordination/agent-registry.ts` - Support alias resolution

**Deprecation warnings:**
```typescript
if (agentName.startsWith('v3-')) {
  console.warn(`Warning: '${agentName}' is deprecated. Use '${agentName.replace('v3-', '')}' instead.`);
}
```

### Phase 2: Rename Files & Update References (Week 2-3) - MEDIUM RISK

**Goal:** Rename all files to version-agnostic names

**Order of operations:**
1. Rename agent files (`.md`)
2. Update internal references in agent files
3. Rename skill directories
4. Update skill YAML frontmatter
5. Update CLI binary name (package.json)
6. Update directory paths

**Agent file renaming script:**
```bash
#!/bin/bash
# rename-agents.sh

cd .claude/agents/v3/

for file in v3-*.md; do
  if [[ -f "$file" ]]; then
    newname="${file/v3-/}"
    git mv "$file" "$newname"
    # Update internal references
    sed -i 's/v3-qe-/qe-/g' "$newname"
  fi
done

# Subagents
cd subagents/
for file in v3-*.md; do
  if [[ -f "$file" ]]; then
    newname="${file/v3-/}"
    git mv "$file" "$newname"
    sed -i 's/v3-qe-/qe-/g' "$newname"
  fi
done
```

**Files requiring updates:**

| File | Changes Needed |
|------|----------------|
| `.claude/agents/v3/index.yaml` | Update all agent names |
| `v3/src/cli/completions/index.ts` | Update `V3_QE_AGENTS` array |
| `v3/src/cli/index.ts` | Update program name to `aqe` |
| `v3/package.json` | Update `bin` entry |
| `CLAUDE.md` | Update documentation |
| All 12 skill directories | Rename and update content |
| All 47+ agent files | Update internal references |

### Phase 3: Update CLI & Configuration (Week 3-4) - MEDIUM RISK

**Binary name change:**
```json
// v3/package.json
{
  "bin": {
    "aqe": "./dist/cli/index.js",
    "aqe-v3": "./dist/cli/index.js"  // Keep for backward compat
  }
}
```

**Directory migration:**
```bash
# Support both paths during transition
if [[ -d ".aqe-v3" && ! -d ".aqe" ]]; then
  ln -s .aqe-v3 .aqe
fi
```

### Phase 4: Remove Old Names (Week 6+) - HIGH RISK

**Goal:** Remove deprecated aliases after transition period

**Timeline:**
- Week 1-2: Aliases active, deprecation warnings
- Week 3-5: New names are default, old names still work
- Week 6+: Old names removed (breaking change)

**Version bump:** This phase requires a major version bump (v3 -> v4)

---

## Parallel vs Sequential Tasks

### Can Run in Parallel:
- [ ] Agent file renaming (all 47 files independent)
- [ ] Skill directory renaming (all 12 directories independent)
- [ ] Documentation updates
- [ ] Test updates

### Must Run Sequentially:
1. Create aliases first (before any renaming)
2. Update index.yaml (before file renaming)
3. Rename files (after index.yaml updated)
4. Update CLI binary name (after files renamed)
5. Update paths (after CLI renamed)
6. Remove old aliases (after transition period)

---

## Risk Assessment

### High Risk Items

| Item | Risk | Mitigation |
|------|------|------------|
| CLI binary rename | Breaks existing scripts | Keep `aqe-v3` as symlink |
| Config path change | Loses user data | Auto-migrate on first run |
| Agent name conflicts | v2/v3 collision | Use explicit routing |

### Medium Risk Items

| Item | Risk | Mitigation |
|------|------|------------|
| Skill name changes | Breaks skill triggers | Add aliases |
| Completion scripts | Users need to regenerate | Auto-detect and warn |
| Documentation | Outdated references | Batch update |

### Low Risk Items

| Item | Risk | Mitigation |
|------|------|------------|
| MCP tool names | Already version-agnostic | None needed |
| Internal file references | Localized changes | Automated sed |

---

## File Change Summary

### Files to Rename (59 files)

```
.claude/agents/v3/v3-qe-*.md (40 files)
.claude/agents/v3/subagents/v3-qe-*.md (7 files)
.claude/skills/v3-qe-*/ (12 directories)
```

### Files to Modify (15+ files)

```
.claude/agents/v3/index.yaml
v3/src/cli/index.ts
v3/src/cli/completions/index.ts
v3/package.json
CLAUDE.md
docs/policies/*.md
.claude/skills/aqe-v2-v3-migration/SKILL.md
v3/src/coordination/agent-registry.ts (if exists)
v3/tests/**/*.test.ts (multiple)
```

### Files to Create (2-3 files)

```
scripts/migrate-naming.sh
docs/migration/naming-migration-guide.md
.claude/agents/v3/aliases.yaml (optional)
```

---

## Migration Tool Recommendation

### Option A: Standalone Script

Create `/scripts/migrate-to-semantic-naming.sh`:
- Handles file renaming
- Updates internal references
- Creates symlinks for backward compat
- Validates changes

### Option B: New Skill

Create `/aqe-naming-migration` skill:
- Interactive wizard
- Rollback support
- Progress tracking
- Validation checks

**Recommendation:** Option A (script) for initial migration, Option B (skill) for user-facing migrations.

---

## Success Criteria

1. All v3-prefixed items renamed to semantic names
2. Backward compatibility maintained via aliases
3. Zero data loss during migration
4. All tests passing with new names
5. Documentation fully updated
6. CLI completions work with new names
7. MCP tools continue to function (no changes needed)

---

## Timeline

| Week | Phase | Deliverables |
|------|-------|--------------|
| 1 | Alias Creation | Deprecation warnings active |
| 2-3 | File Renaming | All files renamed |
| 3-4 | CLI Updates | Binary renamed, paths updated |
| 5 | Documentation | All docs updated |
| 6+ | Cleanup | Old names removed (next major version) |

---

## Appendix A: Complete Agent Mapping

### V3 Agents with v3- Prefix (to rename)

```yaml
test-generation:
  - v3-qe-test-architect -> qe-test-architect
  - v3-qe-tdd-specialist -> qe-tdd-specialist
  - v3-qe-integration-tester -> qe-integration-tester
  - v3-qe-property-tester -> qe-property-tester

test-execution:
  - v3-qe-parallel-executor -> qe-parallel-executor
  - v3-qe-flaky-hunter -> qe-flaky-hunter
  - v3-qe-retry-handler -> qe-retry-handler

coverage-analysis:
  - v3-qe-coverage-specialist -> qe-coverage-specialist
  - v3-qe-gap-detector -> qe-gap-detector
  - v3-qe-mutation-tester -> qe-mutation-tester

quality-assessment:
  - v3-qe-quality-gate -> qe-quality-gate
  - v3-qe-deployment-advisor -> qe-deployment-advisor
  - v3-qe-code-complexity -> qe-code-complexity
  - v3-qe-risk-assessor -> qe-risk-assessor

defect-intelligence:
  - v3-qe-defect-predictor -> qe-defect-predictor
  - v3-qe-pattern-learner -> qe-pattern-learner
  - v3-qe-root-cause-analyzer -> qe-root-cause-analyzer
  - v3-qe-regression-analyzer -> qe-regression-analyzer

requirements-validation:
  - v3-qe-requirements-validator -> qe-requirements-validator
  - v3-qe-bdd-generator -> qe-bdd-generator

code-intelligence:
  - v3-qe-code-intelligence -> qe-code-intelligence
  - v3-qe-dependency-mapper -> qe-dependency-mapper
  - v3-qe-kg-builder -> qe-kg-builder
  - v3-qe-impact-analyzer -> qe-impact-analyzer

security-compliance:
  - v3-qe-security-scanner -> qe-security-scanner
  - v3-qe-security-auditor -> qe-security-auditor

contract-testing:
  - v3-qe-contract-validator -> qe-contract-validator
  - v3-qe-graphql-tester -> qe-graphql-tester

visual-accessibility:
  - v3-qe-visual-tester -> qe-visual-tester
  - v3-qe-accessibility-auditor -> qe-accessibility-auditor
  - v3-qe-responsive-tester -> qe-responsive-tester

chaos-resilience:
  - v3-qe-chaos-engineer -> qe-chaos-engineer
  - v3-qe-load-tester -> qe-load-tester
  - v3-qe-performance-tester -> qe-performance-tester

learning-optimization:
  - v3-qe-learning-coordinator -> qe-learning-coordinator
  - v3-qe-transfer-specialist -> qe-transfer-specialist
  - v3-qe-metrics-optimizer -> qe-metrics-optimizer

specialized:
  - v3-qe-qx-partner -> qe-qx-partner
  - v3-qe-fleet-commander -> qe-fleet-commander
  - v3-qe-queen-coordinator -> qe-queen-coordinator

subagents:
  - v3-qe-tdd-red -> qe-tdd-red
  - v3-qe-tdd-green -> qe-tdd-green
  - v3-qe-tdd-refactor -> qe-tdd-refactor
  - v3-qe-code-reviewer -> qe-code-reviewer
  - v3-qe-integration-reviewer -> qe-integration-reviewer
  - v3-qe-performance-reviewer -> qe-performance-reviewer
  - v3-qe-security-reviewer -> qe-security-reviewer

architecture:
  - v3-integration-architect -> qe-integration-architect
```

### V3 Agents Without Prefix (no change needed)

```yaml
no-change:
  - adr-architect
  - claims-authorizer
  - collective-intelligence-coordinator
  - ddd-domain-expert
  - memory-specialist
  - performance-engineer
  - reasoningbank-learner
  - security-architect
  - security-auditor
  - sparc-orchestrator
  - swarm-memory-manager
```

---

## Appendix B: V2 to New Name Mapping (Aliases)

For backward compatibility, map v2 names to new semantic names:

```yaml
v2-aliases:
  qe-test-generator: qe-test-architect
  qe-coverage-analyzer: qe-coverage-specialist
  qe-flaky-test-hunter: qe-flaky-hunter
  qe-test-executor: qe-parallel-executor
  qe-deployment-readiness: qe-deployment-advisor
  qe-api-contract-validator: qe-contract-validator
  qe-regression-risk-analyzer: qe-regression-analyzer
  qe-a11y-ally: qe-accessibility-auditor
  qe-quality-analyzer: qe-quality-gate  # or keep separate
  qe-production-intelligence: qe-learning-coordinator  # or keep separate
```

---

## Appendix C: Implementation Checklist

### Phase 1 Checklist
- [ ] Add aliases to index.yaml
- [ ] Implement alias resolution in agent registry
- [ ] Add deprecation warnings to CLI
- [ ] Update completions to include both names
- [ ] Test backward compatibility

### Phase 2 Checklist
- [ ] Create rename script
- [ ] Backup all files
- [ ] Run rename script
- [ ] Update all internal references
- [ ] Run tests
- [ ] Update index.yaml with new names
- [ ] Verify agent spawning works

### Phase 3 Checklist
- [ ] Update package.json bin entries
- [ ] Create aqe symlink
- [ ] Update config path detection
- [ ] Add migration for .aqe-v3 -> .aqe
- [ ] Update CLAUDE.md
- [ ] Update all documentation

### Phase 4 Checklist
- [ ] Remove deprecated aliases
- [ ] Update error messages
- [ ] Bump major version
- [ ] Update changelog
- [ ] Announce breaking changes

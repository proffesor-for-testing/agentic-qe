# Migration Consistency Review - Quick Fix Summary

**Date:** 2026-01-17
**Issues Found:** 9 (6 critical, 2 major, 1 minor)
**Full Report:** `/workspaces/agentic-qe/docs/reviews/MIGRATION-CONSISTENCY-REVIEW.md`

---

## Critical Fixes Required

### 1. Standardize v2_compat Field Format

**Choose this format for all documents:**

```yaml
v2_compat:
  name: qe-test-generator
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
```

**Files to update:**
- ADR-048: Line 121 (keep format 2, remove format 1 from line 58)
- MIGRATION-PLAN: Line 164 (add missing fields)

---

### 2. Resolve Agent Mapping Conflicts

**Tier 1 vs Tier 2 Conflict - qe-coverage-analyzer:**

Current state:
- ADR-048 says: Tier 1 (same name, qe-coverage-analyzer)
- MIGRATION-PLAN says: Tier 2 (rename to qe-coverage-specialist)

**Decision:** Use MIGRATION-PLAN approach (rename with v2_compat)

**Update ADR-048:**
- Remove `qe-coverage-analyzer` from Tier 1 list (line 44)
- Add to Tier 2: `qe-coverage-analyzer → qe-coverage-specialist`

---

### 3. Fix qe-test-generator Tier Assignment

**Current state:**
- ADR-048 says: Tier 1 (same name)
- MIGRATION-PLAN says: Tier 2 (rename to qe-test-architect)

**Decision:** Use MIGRATION-PLAN approach (rename with v2_compat)

**Update ADR-048:**
- Remove `qe-test-generator` from Tier 1 list (line 45)
- Move to Tier 2: `qe-test-generator → qe-test-architect`

---

### 4. Fix CLI References

**Issue:** MIGRATION-PLAN line 457 says "npx aqe-v3 test"

**Fix:** Change to:
```bash
Run 'aqe test' to verify
```

**File:** MIGRATION-PLAN, line 457

---

### 5. Add Granular Migrate Flags to ADR

**Current:** ADR shows only basic migrate commands
**Required:** Add --target flags from MIGRATION-PLAN

**Add to ADR-048, Phase 3 CLI section:**

```bash
# Migrate specific components
aqe migrate run --target agents
aqe migrate run --target skills
aqe migrate run --target config
aqe migrate run --target memory
```

---

### 6. Document Complex Migrations in ADR

**Issue:** MIGRATION-PLAN shows qe-quality-analyzer splits into 2 agents
**Missing from:** ADR-048

**Add to ADR-048, new "Tier 2b" section:**

```yaml
#### Tier 2b: Complex Migrations (One V2 Agent → Multiple V3 Agents)

| V2 Agent | V3 Agents | Reason |
|----------|-----------|--------|
| qe-quality-analyzer | qe-quality-gate, qe-metrics-optimizer | Functionality split |
```

---

## Major Fixes (Should Do)

### 7. Add Subagent Consolidation Details to ADR

**Move detailed mapping from MIGRATION-PLAN to ADR-048:**

| V2 Subagent | V3 Location | Phase |
|------------|-------------|-------|
| qe-test-writer | qe-tdd-red | TDD Red phase |
| qe-test-implementer | qe-tdd-green | TDD Green phase |
| qe-test-refactorer | qe-tdd-refactor | TDD Refactor phase |

---

### 8. Update SKILL with v2_compat Examples

**Add to Migration Skill examples section:**

```yaml
# Example v3 agent with v2_compat
v2_compat:
  name: qe-test-generator
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
```

---

## Quick Implementation Checklist

```
CRITICAL (Fix before release):
  [ ] Standardize v2_compat format to nested object
  [ ] Move qe-coverage-analyzer from Tier 1 to Tier 2
  [ ] Move qe-test-generator from Tier 1 to Tier 2
  [ ] Fix "aqe-v3" → "aqe" in MIGRATION-PLAN line 457
  [ ] Add --target flags to ADR-048
  [ ] Add Tier 2b complex migrations section

MAJOR (Fix before release):
  [ ] Add subagent consolidation details to ADR
  [ ] Update skill with v2_compat examples

MINOR (Nice to have):
  [ ] Align qe-visual-tester naming (keep as-is or rename?)

VALIDATION:
  [ ] All three docs use same v2_compat format
  [ ] All agent mappings consistent across docs
  [ ] All CLI examples use 'aqe' (not 'aqe-v3')
  [ ] v2_compat field in all renamed agents
```

---

## File Locations

| Document | Path |
|----------|------|
| ADR-048 | `/workspaces/agentic-qe/v3/implementation/adrs/ADR-048-v2-v3-agent-migration.md` |
| Migration Plan | `/workspaces/agentic-qe/docs/plans/AQE-V2-V3-MIGRATION-PLAN.md` |
| Migration Skill | `/workspaces/agentic-qe/.claude/skills/aqe-v2-v3-migration/skill.md` |
| Full Review | `/workspaces/agentic-qe/docs/reviews/MIGRATION-CONSISTENCY-REVIEW.md` |

---

## Impact Analysis

| Issue | Impact if Not Fixed | Effort to Fix |
|-------|-------------------|--------------|
| v2_compat format | Implementation confusion | 30 min |
| Agent mapping conflicts | User migration failures | 45 min |
| CLI references | Users use wrong commands | 15 min |
| Missing details in ADR | Outdated reference docs | 45 min |
| Subagent docs missing | Incomplete mapping | 30 min |

**Total effort to fix all: 2.5-3 hours**

---

## Verification Steps

After making fixes, verify:

1. **Consistency Check:**
   ```bash
   grep -r "v2_compat" /workspaces/agentic-qe/v3/ --include="*.md"
   # Should show only nested object format

   grep -r "aqe-v3" /workspaces/agentic-qe/docs/ --include="*.md"
   # Should return 0 results (all changed to 'aqe')
   ```

2. **Agent Mapping Check:**
   Compare all agent lists across three documents - should match

3. **Link Check:**
   All cross-references between documents should be valid

---

## Next Steps

1. **Assign:** Assign fixes to appropriate team member
2. **Review:** Have team lead review fixes against this checklist
3. **Merge:** Once verified consistent, merge to main branch
4. **Test:** Validate with test migration run
5. **Document:** Update user migration guide if needed

---

*Summary prepared: 2026-01-17*
*Status: Ready for action*

# Migration Consistency Review Report

**Date:** 2026-01-17
**Status:** Complete
**Issues Found:** 9 (6 Critical, 2 Major, 1 Minor)

---

## Overview

Comprehensive review of migration-related documentation for AQE v2-to-v3 upgrade. Review identified inconsistencies in agent name mappings, v2_compat field formats, CLI command references, and documentation completeness.

**Recommendation:** Fix all critical issues before v3 release (estimated 4.5-6 hours).

---

## Review Documents

### 1. MIGRATION-CONSISTENCY-REVIEW.md (Primary Report)
**Size:** 450+ lines
**Purpose:** Detailed analysis of all 9 issues

**Contains:**
- Complete description of each issue
- Impact assessment (HIGH/MEDIUM/MAJOR/MINOR)
- Root cause analysis
- Recommended fixes
- Corrected mapping table
- Success criteria checklist
- Detailed recommendations by category

**Read this for:** Full context and detailed analysis

---

### 2. MIGRATION-FIXES-SUMMARY.md (Quick Reference)
**Size:** 300+ lines
**Purpose:** Actionable fix guide for team

**Contains:**
- Quick fix for each critical issue
- Exact files to update
- Code/text to change
- Line numbers where applicable
- Verification steps
- Implementation checklist

**Read this for:** Quick action items and fixes

---

### 3. UNIFIED-AGENT-MAPPING-TABLE.md (Source of Truth)
**Size:** 400+ lines
**Purpose:** Comprehensive agent migration reference

**Contains:**
- All 4 migration tiers documented
- Complete agent mappings (32 v2 → 48 v3)
- v2_compat implementation examples
- Statistics and summary
- Migration compatibility API
- Validation checklist

**Read this for:** Agent migration reference and implementation guide

---

## Issues Found

### Critical Issues (Must Fix Before Release)

1. **v2_compat Format Inconsistency**
   - ADR-048 has two different formats (simple string + nested object)
   - Impact: Implementation confusion

2. **Agent Mapping Conflict: qe-coverage-analyzer**
   - ADR says Tier 1 (same name), Plan says Tier 2 (rename)
   - Impact: User confusion about upgrade path

3. **Agent Mapping Conflict: qe-test-generator**
   - ADR says Tier 1 (same name), Plan says Tier 2 (rename)
   - Impact: User confusion about upgrade path

4. **v2_compat Field Naming Mismatch**
   - ADR uses `deprecated_in`/`removed_in`
   - Plan uses `v2_api_support`/`v2_removal_version`
   - Impact: Inconsistent field names across codebase

5. **CLI Command Reference Error**
   - MIGRATION-PLAN says "npx aqe-v3 test" (wrong)
   - Should be "aqe test"
   - Impact: Users use wrong commands, migration fails

6. **Migrate CLI Flags Divergence**
   - ADR: Basic commands only
   - Plan: Adds granular --target flags
   - Impact: Different CLI designs, unclear requirements

### Major Issues (Should Fix Before Release)

7. **Complex Agent Migrations Not in ADR**
   - qe-quality-analyzer splits into 2 agents (only in Plan)
   - Impact: Incomplete reference documentation

8. **Subagent Consolidation Details Missing from ADR**
   - TDD phase mapping only in Plan
   - Impact: Incomplete reference documentation

### Minor Issues (Nice to Fix)

9. **Visual Tester Naming Inconsistency**
   - ADR: rename to qe-visual-accessibility
   - Plan: keep as qe-visual-tester
   - Impact: Minor naming inconsistency

---

## Consistency Checklist

### Agent Name Mappings
- [ ] All renamed agents documented
- [ ] Tier 1 vs Tier 2 conflicts resolved
- [ ] Complex 1-to-many mappings added to ADR
- [ ] v2_compat field format finalized
- [ ] All three documents aligned

### CLI Naming
- [ ] Package name: `agentic-qe` ✓
- [ ] CLI name: `aqe` (fix "npx aqe-v3" references)
- [ ] Migrate flags: granular vs full approach decided
- [ ] Migration commands documented consistently

### v2_compat Fields
- [ ] Single format chosen (recommend: nested object)
- [ ] Field names standardized (recommend: ADR format)
- [ ] deprecated_in: "3.0.0" ✓
- [ ] removed_in: "4.0.0" ✓
- [ ] All v3 agents have field

---

## Documents Reviewed

1. **ADR-048-v2-v3-agent-migration.md**
   - Path: `/workspaces/agentic-qe/v3/implementation/adrs/ADR-048-v2-v3-agent-migration.md`
   - Status: Draft
   - Issues: 4 critical, 1 major

2. **AQE-V2-V3-MIGRATION-PLAN.md**
   - Path: `/workspaces/agentic-qe/docs/plans/AQE-V2-V3-MIGRATION-PLAN.md`
   - Status: Draft
   - Issues: 3 critical, 1 major, 1 minor

3. **aqe-v2-v3-migration/skill.md**
   - Path: `/workspaces/agentic-qe/.claude/skills/aqe-v2-v3-migration/skill.md`
   - Status: Draft
   - Issues: 2 references, 0 inconsistencies

---

## Key Findings

### Agent Statistics
- **v2 Agents:** 32 total (12 Tier 1 + 10 Tier 2 + 1 Tier 2b + 11 Tier 4 subagents)
- **v3 Agents:** 48 total (12 Tier 1 + 10 Tier 2 + 2 Tier 2b + 21 Tier 3 + 7 Tier 4)
- **Net Change:** +16 agents (21 new, 11 consolidated)

### Mapping Tiers
- **Tier 1:** 12 agents (same name, upgrade in place)
- **Tier 2:** 10 agents (different name, need v2_compat)
- **Tier 2b:** 1 complex mapping (qe-quality-analyzer → 2 agents)
- **Tier 3:** 21 new agents (v3 only, no v2 equivalent)
- **Tier 4:** 11 → 7 subagents (consolidated)

---

## Recommendations

### Immediate Actions (Before Release)
1. Fix v2_compat format inconsistency (use nested object)
2. Resolve agent mapping conflicts
3. Fix "aqe-v3" CLI references
4. Standardize v2_compat field names
5. Decide on granular migrate flags
6. Document complex migrations in ADR

### Before Release
7. Update all three documents for consistency
8. Add v2_compat examples to skill
9. Verify all CLI commands correct

### After Release
10. Monitor migration issues
11. Update docs based on user feedback
12. Track deprecated API usage

---

## Effort Estimation

| Task | Effort |
|------|--------|
| Fix critical issues | 2.5 - 3 hours |
| Update documents | 1 hour |
| Testing/validation | 1 - 2 hours |
| **Total** | **4.5 - 6 hours** |

---

## Risk Assessment

### If Not Fixed

| Risk | Impact | Probability |
|------|--------|-------------|
| Users confused about upgrade path | HIGH | HIGH |
| Migration failures from wrong CLI commands | HIGH | HIGH |
| Inconsistent implementation across team | MEDIUM | MEDIUM |
| Support burden from user confusion | MEDIUM | MEDIUM |
| ADR becomes outdated | MEDIUM | MEDIUM |

### Mitigation

- Use UNIFIED-AGENT-MAPPING-TABLE.md as single source of truth
- Update all documents to reference unified table
- Test migration with real v2 installation before release
- Create user migration guide based on unified table

---

## How to Use These Documents

### For Developers Implementing Migration
1. Start with **MIGRATION-FIXES-SUMMARY.md** for quick action items
2. Reference **UNIFIED-AGENT-MAPPING-TABLE.md** while coding
3. Use checklist to verify all agents have correct v2_compat

### For Reviewers
1. Use **MIGRATION-CONSISTENCY-REVIEW.md** to understand issues
2. Check **MIGRATION-FIXES-SUMMARY.md** for verification steps
3. Ensure all critical issues are addressed

### For Project Managers
1. Review **MIGRATION-CONSISTENCY-REVIEW.md** executive summary
2. Use effort estimation for scheduling
3. Track action items from **MIGRATION-FIXES-SUMMARY.md**

---

## Next Steps

1. Schedule review meeting with core team
2. Assign fixes to team members using MIGRATION-FIXES-SUMMARY.md
3. Use UNIFIED-AGENT-MAPPING-TABLE.md as reference
4. Verify fixes before merge
5. Test migration with real v2 installation
6. Update user-facing documentation if needed

---

## Document Maintenance

### When to Update
- After applying fixes from MIGRATION-FIXES-SUMMARY.md
- Before v3 release (final verification)
- After migration testing (add learnings)
- If new migration requirements emerge

### Who Should Update
- Lead reviewer: Mark issues as fixed
- Implementation team: Update when changes complete
- QA team: Add test results and validation

---

## Appendix: File Locations

### Review Documents (This Folder)
```
/workspaces/agentic-qe/docs/reviews/
├── README.md (you are here)
├── MIGRATION-CONSISTENCY-REVIEW.md
├── MIGRATION-FIXES-SUMMARY.md
└── UNIFIED-AGENT-MAPPING-TABLE.md
```

### Source Documents (Reviewed)
```
/workspaces/agentic-qe/
├── v3/implementation/adrs/
│   └── ADR-048-v2-v3-agent-migration.md
├── docs/plans/
│   └── AQE-V2-V3-MIGRATION-PLAN.md
└── .claude/skills/aqe-v2-v3-migration/
    └── skill.md
```

---

## Contact & Questions

For questions about this review:
1. Read the full report: MIGRATION-CONSISTENCY-REVIEW.md
2. Check the mapping table: UNIFIED-AGENT-MAPPING-TABLE.md
3. Follow the fixes: MIGRATION-FIXES-SUMMARY.md

---

*Review prepared by: Code Review Agent*
*Date: 2026-01-17*
*Status: Ready for team review and action*

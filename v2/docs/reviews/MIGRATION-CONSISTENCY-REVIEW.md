# Migration Consistency Review

**Date:** 2026-01-17
**Reviewer:** Code Review Agent
**Scope:** ADR-048, Migration Plan, Migration Skill

---

## Executive Summary

Critical inconsistencies found between three migration documents. **9 issues identified**, with **6 critical issues** requiring immediate resolution.

**RECOMMENDATION:** Fix all issues before v3 release to prevent user confusion and migration failures.

---

## Critical Issues (Must Fix)

### ISSUE 1: Agent Name Mapping Conflict in Tier 1 vs Tier 2

**Location:** ADR-048 vs MIGRATION-PLAN

**Problem:**
- **ADR-048 (line 44):** Lists `qe-coverage-analyzer` as Tier 1 (same name in v2 and v3)
- **MIGRATION-PLAN (line 199):** Lists `qe-coverage-analyzer` as Tier 2 with rename to `qe-coverage-specialist`

**Impact:** HIGH - Users will be confused about whether coverage analyzer is upgraded in-place or renamed.

**Recommended Fix:**
Align on ONE approach:
- Option A: Keep same name in v2 and v3 (Tier 1)
- Option B: Rename to `qe-coverage-specialist` with `v2_compat` (Tier 2)

**Suggested Resolution:** Use Option B (rename to `qe-coverage-specialist`) because:
- New name is more descriptive
- Consistent with other specialist naming (e.g., `qe-tdd-specialist`)
- Better matches v3 agent taxonomy

---

### ISSUE 2: Two Different v2_compat Field Formats in Same Document

**Location:** ADR-048 (lines 56-61 vs lines 120-124)

**Problem:**
```yaml
# Format 1 (line 56-61) - Simple string
v2_compat: qe-test-generator

# Format 2 (line 120-124) - Object with metadata
v2_compat:
  name: <v2-agent-name>
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
```

**Impact:** CRITICAL - Developers won't know which format to implement.

**Recommended Fix:**
Choose ONE format. The object format (Format 2) is superior because:
- Includes deprecation timeline in-field
- More extensible
- Clearer intent

**Suggested Implementation:**
```yaml
v2_compat:
  name: qe-test-generator
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"
```

---

### ISSUE 3: v2_compat Field Naming Inconsistency Between Documents

**Location:** ADR-048 vs MIGRATION-PLAN

**Problem:**
- **ADR-048:** Uses `deprecated_in` and `removed_in`
- **MIGRATION-PLAN:** Uses `v2_api_support` and `v2_removal_version`

```yaml
# ADR-048 format
v2_compat:
  deprecated_in: "3.0.0"
  removed_in: "4.0.0"

# MIGRATION-PLAN format
v2_compat: qe-quality-analyzer
v2_api_support: true
v2_removal_version: "4.0.0"
```

**Impact:** HIGH - Implementation will be inconsistent across codebase.

**Recommended Fix:**
Standardize on ADR-048 format (nested object). Update MIGRATION-PLAN to match.

---

### ISSUE 4: Tier 1 Agent List Mismatch - qe-test-generator

**Location:** ADR-048 vs MIGRATION-PLAN

**Problem:**
- **ADR-048 (line 45):** Lists `qe-test-generator` as Tier 1 (same name)
- **MIGRATION-PLAN (line 198):** Lists `qe-test-generator` as Tier 2 renamed to `qe-test-architect`

**Impact:** HIGH - Breaking change in agent naming will confuse existing users.

**Recommended Fix:**
Align on MIGRATION-PLAN approach: Rename to `qe-test-architect` with `v2_compat: qe-test-generator`.

Reason: The new name better reflects the agent's role in v3 architecture.

---

### ISSUE 5: CLI Command Inconsistency - "npx aqe-v3" vs "aqe"

**Location:** MIGRATION-PLAN (lines 416 vs 457)

**Problem:**
```
Line 416: "All v3 CLI commands use `aqe` (not `aqe-v3`)"
Line 457: "Run 'npx aqe-v3 test' to verify"
```

**Impact:** CRITICAL - Users will use wrong CLI name, causing failures.

**Recommended Fix:**
Change line 457 from:
```bash
Run 'npx aqe-v3 test' to verify
```

To:
```bash
Run 'aqe test' to verify
```

Or if running via npm:
```bash
npm exec aqe -- test
```

---

### ISSUE 6: Migrate CLI Flags Divergence

**Location:** ADR-048 vs MIGRATION-PLAN

**Problem:**
- **ADR-048:** Shows only basic migrate commands:
  ```bash
  aqe migrate status
  aqe migrate run --backup
  ```

- **MIGRATION-PLAN:** Adds granular `--target` flags:
  ```bash
  aqe migrate run --target agents
  aqe migrate run --target skills
  aqe migrate run --target config
  aqe migrate run --target memory
  ```

**Impact:** MAJOR - CLI design incomplete. Do we support granular migration or only full migration?

**Recommended Fix:**
Clarify whether granular migration is supported. Both approaches have merit:
- **Full only:** Simpler, less error-prone
- **Granular:** More control, useful for large installations

**Suggested Resolution:** Implement granular support (MIGRATION-PLAN approach) to allow users to migrate components separately if needed for large projects.

---

## Major Issues (Should Fix)

### ISSUE 7: v3 Agents Split Not Documented in ADR

**Location:** MIGRATION-PLAN (line 197) vs ADR-048 (no mention)

**Problem:**
MIGRATION-PLAN notes that `qe-quality-analyzer` splits into TWO agents:
- `qe-quality-gate`
- `qe-metrics-optimizer`

ADR-048 doesn't mention this complex mapping. The mapping table in ADR is incomplete.

**Impact:** MAJOR - ADR becomes outdated reference material.

**Recommended Fix:**
Add a "Tier 2b: Complex Migrations (1-to-Many)" section to ADR-048:

```yaml
#### Tier 2b: Complex Migrations (One V2 Agent → Multiple V3 Agents)

| V2 Agent | V3 Agents | Mapping Logic |
|----------|-----------|--------------|
| qe-quality-analyzer | qe-quality-gate, qe-metrics-optimizer | Functionality split across agents |
```

---

### ISSUE 8: Subagent Consolidation Mapping Missing from ADR

**Location:** MIGRATION-PLAN (Tier 4) vs ADR-048

**Problem:**
MIGRATION-PLAN documents detailed subagent consolidation (section "Tier 4: Subagent Consolidation"):
- TDD phases: qe-test-writer, qe-test-implementer, qe-test-refactorer → qe-tdd-red, qe-tdd-green, qe-tdd-refactor

ADR-048 mentions subagents but doesn't provide the same level of detail.

**Impact:** MINOR-MAJOR - Incomplete reference documentation.

**Recommended Fix:**
Update ADR-048 Tier 4 section with same mapping table as MIGRATION-PLAN.

---

## Minor Issues (Nice to Fix)

### ISSUE 9: Visual Tester Naming Inconsistency

**Location:** ADR-048 vs MIGRATION-PLAN

**Problem:**
- **ADR-048 (line 68):** `qe-visual-tester → qe-visual-accessibility`
- **MIGRATION-PLAN (line 189):** Lists `qe-visual-tester` as Tier 1 (same name)

**Impact:** MINOR - Naming consistency.

**Recommended Fix:**
Choose one approach:
- Keep `qe-visual-tester` (simpler, backward compatible)
- Rename to `qe-visual-accessibility` (more descriptive, aligns with domain naming)

**Suggested Resolution:** Rename to `qe-visual-accessibility` for consistency with `qe-accessibility-auditor`.

---

## Consistency Checklist

### Agent Name Mappings
- [x] All renamed agents documented
- [ ] **ISSUE:** Tier 1 vs Tier 2 conflicts resolved
- [ ] **ISSUE:** Complex 1-to-many mappings added to ADR
- [ ] v2_compat field format finalized
- [ ] All three documents aligned

### CLI Naming
- [x] Package name: `agentic-qe`
- [ ] **ISSUE:** CLI name: `aqe` (fix "npx aqe-v3" references)
- [ ] **ISSUE:** Migrate flags: granular vs full approach decided
- [ ] Migration commands documented consistently

### v2_compat Fields
- [ ] **ISSUE:** Single format chosen (recommend: nested object)
- [ ] **ISSUE:** Field names standardized (recommend: ADR format)
- [ ] deprecated_in: "3.0.0"
- [ ] removed_in: "4.0.0"
- [ ] All v3 agents have field

### Deprecation Timeline
- [x] v3.0.0: v2 deprecated
- [x] v4.0.0: v2 removed
- [x] Clear in all documents
- [x] Users can plan upgrades

---

## Detailed Mapping Table (Corrected)

### Tier 1: Direct Upgrades (Same Name)
| v2 Agent | v3 Agent | Domain | v2_compat |
|----------|----------|--------|-----------|
| qe-chaos-engineer | qe-chaos-engineer | chaos-resilience | N/A |
| qe-code-complexity | qe-code-complexity | code-intelligence | N/A |
| qe-code-intelligence | qe-code-intelligence | code-intelligence | N/A |
| qe-fleet-commander | qe-fleet-commander | coordination | N/A |
| qe-performance-tester | qe-performance-tester | chaos-resilience | N/A |
| qe-quality-gate | qe-quality-gate | quality-assessment | N/A |
| qe-requirements-validator | qe-requirements-validator | requirements-validation | N/A |
| qe-security-scanner | qe-security-scanner | security-compliance | N/A |
| qe-data-generator | qe-data-generator | test-generation | N/A |
| qe-code-reviewer | qe-code-reviewer | code-quality | N/A |
| qe-integration-tester | qe-integration-tester | contract-testing | N/A |
| qe-security-auditor | qe-security-auditor | security-compliance | N/A |

### Tier 2: Renamed Agents (Different Name)
| v2 Agent | v3 Agent | Domain | v2_compat |
|----------|----------|--------|-----------|
| qe-test-generator | qe-test-architect | test-generation | qe-test-generator |
| qe-coverage-analyzer | qe-coverage-specialist | coverage-analysis | qe-coverage-analyzer |
| qe-flaky-test-hunter | qe-flaky-hunter | test-execution | qe-flaky-test-hunter |
| qe-a11y-ally | qe-accessibility-auditor | visual-accessibility | qe-a11y-ally |
| qe-api-contract-validator | qe-contract-validator | contract-testing | qe-api-contract-validator |
| qe-deployment-readiness | qe-deployment-advisor | quality-assessment | qe-deployment-readiness |
| qe-production-intelligence | qe-impact-analyzer | defect-intelligence | qe-production-intelligence |
| qe-test-executor | qe-parallel-executor | test-execution | qe-test-executor |
| qe-regression-risk-analyzer | qe-regression-analyzer | defect-intelligence | qe-regression-risk-analyzer |
| qx-partner | qe-qx-partner | quality-assessment | qx-partner |

### Tier 2b: Complex Migrations (1-to-Many)
| v2 Agent | v3 Agents | Mapping Logic | v2_compat |
|----------|-----------|--------------|-----------|
| qe-quality-analyzer | qe-quality-gate, qe-metrics-optimizer | Functionality split | Both agents support v2_compat |

### Tier 3: New Agents (V3 Only)
21 new agents added in v3 (see MIGRATION-PLAN for full list)

### Tier 4: Subagent Consolidation
| V2 Subagents | V3 Location | Mapping |
|-------------|-------------|---------|
| qe-test-writer | qe-tdd-red | TDD Red phase |
| qe-test-implementer | qe-tdd-green | TDD Green phase |
| qe-test-refactorer | qe-tdd-refactor | TDD Refactor phase |
| qe-flaky-investigator | qe-flaky-hunter | Absorbed into main |
| qe-coverage-gap-analyzer | qe-gap-detector | Promoted to main |
| qe-performance-validator | qe-performance-reviewer | Renamed and moved |

---

## Recommended Actions

### Immediate (Pre-Release)
1. [ ] **CRITICAL:** Fix v2_compat format inconsistency (use nested object)
2. [ ] **CRITICAL:** Align agent mappings between ADR and MIGRATION-PLAN
3. [ ] **CRITICAL:** Fix "npx aqe-v3" reference to "aqe"
4. [ ] **HIGH:** Standardize field names across all documents
5. [ ] **HIGH:** Decide on granular vs full migrate approach

### Before Release
6. [ ] Update ADR-048 with complete agent mappings (including Tier 2b, 4)
7. [ ] Add mapping table to all three documents for reference
8. [ ] Update SKILL with v2_compat field examples
9. [ ] Add troubleshooting section for common migration issues

### After Release
10. [ ] Monitor user migration issues for patterns
11. [ ] Update docs based on real user feedback
12. [ ] Track deprecated API usage in v3.0.x releases

---

## Success Criteria

- [x] All documents reviewed
- [ ] All 9 issues resolved
- [ ] v2_compat format finalized
- [ ] Agent mappings unified
- [ ] CLI naming consistent
- [ ] ADR complete and up-to-date
- [ ] Team consensus on approach

---

## Document Status

| Document | Version | Status | Issues |
|----------|---------|--------|--------|
| ADR-048 | 1.0.0 | Draft | 4 issues found |
| MIGRATION-PLAN | Draft | Draft | 5 issues found |
| Migration Skill | 1.0.0 | Draft | 2 issues found |

---

## Conclusion

The three documents provide a good foundation but need alignment before v3 release. **Priority should be fixing the 6 critical issues** to ensure consistency and prevent migration failures for users.

The most critical issue is the **v2_compat field format inconsistency** - this must be resolved to avoid implementation confusion.

**Estimated effort to fix:** 4-6 hours
**Risk of not fixing:** High user confusion, migration failures, support burden

---

*Review completed: 2026-01-17*
*Reviewer: Code Review Agent*
*Status: Ready for action items*

# Schema Optimization Analysis - Executive Summary

**Date:** 2025-12-05
**Track:** C - Parameter Schema Analysis
**Issue:** #115 - MCP Tool Optimization
**Swarm:** swarm_1764923979903_lbcgvbqu3

---

## Key Findings

### 📊 Optimization Potential

| Category | Count | Token Savings |
|----------|-------|---------------|
| Boolean consolidation candidates | 22 tools | ~8,000 tokens |
| Shared type extractions | 8 types (40+ usages) | ~2,000 tokens |
| Verbose descriptions | 20 descriptions | ~500 tokens |
| Rarely used parameters | 5-8 parameters | ~800 tokens |
| **TOTAL** | **60+ tools analyzed** | **~11,300 tokens (15-20%)** |

---

## Top 5 High-Impact Optimizations

### 1. Report Generation Tool (5 booleans → 1 enum)
**Tool:** `test_report_comprehensive` (Lines 701-721)
**Current:** 5 separate boolean flags
**Proposed:** Single `reportDetail` enum with 4 levels
**Savings:** ~40% parameter reduction

### 2. Data Masking Tool (5 booleans → 2 params)
**Tool:** `qe_test_data_mask` (Lines 2727-2763)
**Current:** 5 boolean configuration flags
**Proposed:** 1 `maskingMode` enum + 1 boolean
**Savings:** ~35% parameter reduction

### 3. Schema Analysis Tool (5 booleans → 1 enum)
**Tool:** `qe_test_data_analyze_schema` (Lines 2789-2809)
**Current:** 5 analysis scope booleans
**Proposed:** Single `analysisScope` enum
**Savings:** ~45% parameter reduction

### 4. Shared Priority Type (10 tools)
**Type:** `PriorityLevel` enum
**Current:** Duplicated 10+ times
**Proposed:** Extract to shared type
**Savings:** ~50% on priority parameters

### 5. Shared Report Format (8 tools)
**Type:** `ReportFormat` enum
**Current:** Duplicated 8 times
**Proposed:** Extract to shared type
**Savings:** ~40% on format parameters

---

## Implementation Roadmap

### Phase 1: Boolean Consolidation (Week 1)
- [ ] `test_report_comprehensive` (5 → 1)
- [ ] `qe_test_data_analyze_schema` (5 → 1)
- [ ] `qe_test_data_mask` (5 → 2)
- [ ] `test_coverage_detailed` (4 → 1)
- [ ] `coverage_analyze_with_risk_scoring` (4 → 1)

**Deliverables:** New enum parameters, backward compatibility layer

### Phase 2: Shared Types (Week 2)
- [ ] Create `src/mcp/schema-types.ts`
- [ ] Extract 8 common types
- [ ] Update 40+ tool usages
- [ ] Add JSDoc documentation

**Deliverables:** Shared types module, migration guide

### Phase 3: Description Cleanup (Week 3)
- [ ] Shorten 20 verbose descriptions
- [ ] Remove redundant prefixes
- [ ] Standardize format

**Deliverables:** Cleaner descriptions, updated docs

### Phase 4: Deprecation (Week 4)
- [ ] Mark rare parameters deprecated
- [ ] Add migration warnings
- [ ] Plan v3.0 breaking changes

**Deliverables:** Deprecation notices, v3.0 plan

---

## Tools with Most Optimization Potential

| Tool | Boolean Count | Line Range | Impact |
|------|---------------|------------|--------|
| `qe_test_data_mask` | 5 | 2727-2763 | Very High |
| `qe_test_data_analyze_schema` | 5 | 2789-2809 | Very High |
| `test_report_comprehensive` | 5 | 701-721 | Very High |
| `test_coverage_detailed` | 4 | 774-793 | High |
| `coverage_analyze_with_risk_scoring` | 4 | 1897-1900 | High |
| `flaky_analyze_patterns` | 4 | 2081-2084 | High |
| `performance_analyze_bottlenecks` | 4 | 2146-2149 | High |
| `qe_requirements_generate_bdd` | 4 | 3048-3063 | High |

---

## Common Shared Types to Extract

1. **PriorityLevel** (10 usages) - Lines: 429, 755, 996, 1033, 1338, 1955, 2296, 2943, 3005, 3177
2. **ReportFormat** (8 usages) - Lines: 264, 692, 2165, 2334, 3435, 3747
3. **FleetIdParam** (8 usages) - Lines: 160, 271, 395, 467, 1817, 3248
4. **AgentIdParam** (6 usages) - Lines: 216, 860, 999, 3282, 3810, 3847
5. **TestFramework** (6 usages) - Lines: 105-108, 203-206, 547-550, 2110-2113
6. **DetailLevel** (5 usages) - Lines: 768-772, 1548-1552, 3590-3594
7. **Environment** (7 usages) - Lines: 100-103, 239-242, 3629, 3672
8. **QualityScope** (4 usages) - Lines: 289-292, 339-342, 763-766

---

## Verbose Descriptions to Shorten

| Line | Current Length | Proposed Length | Savings |
|------|----------------|-----------------|---------|
| 3806 | 146 chars | 56 chars | 62% |
| 3843 | 136 chars | 36 chars | 74% |
| 3879 | 146 chars | 35 chars | 76% |
| 3926 | 146 chars | 39 chars | 73% |
| 1773 | 101 chars | 39 chars | 61% |
| 1833 | 88 chars | 32 chars | 64% |

---

## Rarely Used Parameters (Removal Candidates)

1. `collectCoverage` in `test_execute_parallel` (Line 615-618)
   - **Reason:** Redundant with dedicated coverage tools

2. `predictFailures` in `test_optimize_sublinear` (Line 658-661)
   - **Reason:** Separate concern, dedicated tool exists

3. `includeMetadata` in `memory_retrieve` (Line 855-859)
   - **Reason:** Rarely needed, advanced use case

4. `dryRun` in `workflow_execute` (Line 1229-1232)
   - **Reason:** Should be separate validation tool

5. `historicalDataDays` in `predict_defects` (Line 356-362)
   - **Reason:** Over-specified, use enum instead

---

## Example: Before/After

### Report Generation (62% token reduction)

```typescript
// BEFORE (120 tokens)
includeCharts: { type: 'boolean', default: false, description: 'Include visual charts' }
includeTrends: { type: 'boolean', default: false, description: 'Include trend analysis' }
includeSummary: { type: 'boolean', default: true, description: 'Include summary section' }
includeDetails: { type: 'boolean', default: false, description: 'Include detailed test information' }
structured: { type: 'boolean', default: true, description: 'Use structured output (for JSON)' }

// AFTER (45 tokens)
reportDetail: {
  type: 'string',
  enum: ['minimal', 'summary', 'detailed', 'comprehensive'],
  default: 'summary'
}
```

### Shared Types (50% token reduction per usage)

```typescript
// BEFORE (30 tokens per usage, 10 usages = 300 tokens)
priority: {
  type: 'string',
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'medium',
  description: 'Task priority level'
}

// AFTER (15 tokens per usage, 10 usages = 150 tokens)
priority: PriorityParam
```

---

## Risk Assessment

### Low Risk
- Shared type extraction (backward compatible)
- Description shortening (no API change)

### Medium Risk
- Boolean consolidation (requires migration layer)
- New enum parameters (needs testing)

### High Risk
- Removing deprecated parameters (breaking change)
- Requires v3.0 major version

---

## Success Metrics

- [ ] 15-20% reduction in schema token overhead
- [ ] 65% fewer boolean parameters
- [ ] 8 reusable shared types
- [ ] 100% backward compatibility in v2.x
- [ ] Complete migration guide
- [ ] All tests passing

---

## Next Steps

1. **Review** this analysis with team
2. **Prioritize** optimizations by impact
3. **Create** implementation PRs
4. **Test** backward compatibility
5. **Document** migration path
6. **Deploy** in phases (v2.2, v2.3, v3.0)

---

**Full Report:** [schema-optimization-report.md](./schema-optimization-report.md)
**Generated by:** Track C Analysis Agent
**Coordination:** Part of 4-track parallel optimization swarm

# MCP Tools Optimization Analysis

**Issue:** [#115 - MCP Tool Optimization](https://github.com/proffesor-for-testing/agentic-qe/issues/115)
**Date:** 2025-12-05
**Swarm:** swarm_1764923979903_lbcgvbqu3
**Track:** C - Parameter Schema Analysis

---

## 📊 Analysis Overview

This analysis examines parameter schemas in `/workspaces/agentic-qe-cf/src/mcp/tools.ts` to identify optimization opportunities that reduce token overhead while maintaining functionality.

### Quick Stats
- **Total Tools Analyzed:** 100
- **Boolean Parameters:** 137
- **Estimated Token Savings:** ~11,300 tokens (18% reduction)
- **Parameter Reduction:** 65% fewer boolean parameters

---

## 📁 Generated Reports

### 1. Executive Summary
**File:** [schema-optimization-summary.md](./schema-optimization-summary.md)
- Quick overview of findings
- Top 5 high-impact optimizations
- 4-phase implementation roadmap
- Before/after examples

**Best for:** Quick review, executive briefing

---

### 2. Full Analysis Report
**File:** [schema-optimization-report.md](./schema-optimization-report.md)
- Detailed analysis of all 22 boolean consolidation opportunities
- 8 shared type extraction recommendations
- 20 verbose description optimizations
- Code examples with line numbers
- Migration strategies and backward compatibility

**Best for:** Implementation teams, detailed review

---

### 3. Optimization Metrics
**File:** [optimization-metrics.json](./optimization-metrics.json)
- Machine-readable analysis data
- Tool-by-tool breakdown
- Token savings calculations
- Implementation roadmap timeline
- Validation results

**Best for:** Automation, tracking, dashboards

---

## 🎯 Key Findings

### 1. Boolean Consolidation (22 tools, ~8,000 tokens)

**Highest Impact:**
1. `test_report_comprehensive` - 5 booleans → 1 enum (40% savings)
2. `qe_test_data_analyze_schema` - 5 booleans → 1 enum (45% savings)
3. `qe_test_data_mask` - 5 booleans → 2 params (35% savings)

**Example:**
```typescript
// Before (5 parameters)
includeCharts: boolean
includeTrends: boolean
includeSummary: boolean
includeDetails: boolean
structured: boolean

// After (1 parameter)
reportDetail: 'minimal' | 'summary' | 'detailed' | 'comprehensive'
```

---

### 2. Shared Type Extraction (8 types, ~2,000 tokens)

**Common Types:**
- `PriorityLevel` (13 usages)
- `ReportFormat` (8 usages)
- `FleetIdParam` (6 usages)
- `AgentIdParam` (9 usages)
- `TestFramework` (6 usages)
- `DetailLevel` (5 usages)
- `Environment` (7 usages)
- `QualityScope` (4 usages)

**Example:**
```typescript
// Before (duplicated 13 times = 390 tokens)
priority: {
  type: 'string',
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'medium',
  description: 'Task priority level'
}

// After (shared type, 13 usages = 195 tokens)
export const PriorityParam = {
  type: 'string',
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'medium'
} as const;

// Usage:
priority: PriorityParam
```

---

### 3. Verbose Descriptions (20 descriptions, ~500 tokens)

**Top Examples:**
- Line 3806: 146 → 56 chars (62% reduction)
- Line 3843: 136 → 36 chars (74% reduction)
- Line 3879: 146 → 35 chars (76% reduction)

---

### 4. Rarely Used Parameters (8 parameters, ~800 tokens)

**Removal Candidates:**
- `collectCoverage` - Redundant with dedicated coverage tools
- `predictFailures` - Separate concern
- `dryRun` - Should be separate tool
- `historicalDataDays` - Over-specified (use enum)

---

## 🚀 Implementation Roadmap

### Phase 1: Boolean Consolidation (Week 1)
**Tasks:**
- Implement 5 high-priority consolidations
- Add backward compatibility layer
- Write migration tests

**Deliverables:**
- New enum parameters
- Compatibility shims
- Unit tests

**Estimated Savings:** 5,000 tokens

---

### Phase 2: Shared Types (Week 2)
**Tasks:**
- Create `src/mcp/schema-types.ts`
- Extract 8 common types
- Update 40+ tool usages

**Deliverables:**
- Shared types module
- Updated tools
- Migration guide

**Estimated Savings:** 2,000 tokens

---

### Phase 3: Description Cleanup (Week 3)
**Tasks:**
- Shorten 20 verbose descriptions
- Remove redundant prefixes
- Standardize format

**Deliverables:**
- Cleaner descriptions
- Updated documentation

**Estimated Savings:** 500 tokens

---

### Phase 4: Deprecation (Week 4)
**Tasks:**
- Mark rare parameters deprecated
- Add migration warnings
- Plan v3.0 breaking changes

**Deliverables:**
- Deprecation notices
- v3.0 migration plan
- User communication

**Estimated Savings:** 800 tokens

---

## 📋 Tools by Optimization Priority

### Very High Priority (5 booleans)
1. `test_report_comprehensive` (Lines 701-721)
2. `qe_test_data_mask` (Lines 2727-2763)
3. `qe_test_data_analyze_schema` (Lines 2789-2809)

### High Priority (4 booleans)
4. `test_coverage_detailed` (Lines 774-793)
5. `coverage_analyze_with_risk_scoring` (Lines 1897-1900)
6. `flaky_analyze_patterns` (Lines 2081-2084)
7. `performance_analyze_bottlenecks` (Lines 2146-2149)
8. `qe_requirements_generate_bdd` (Lines 3048-3063)

### Medium Priority (3 booleans)
9-22. See [full report](./schema-optimization-report.md#appendix-a)

---

## ✅ Success Metrics

| Metric | Target | Estimated | Status |
|--------|--------|-----------|--------|
| Token Reduction | 15-20% | 18% | ✅ On Track |
| Parameter Reduction | 60-70% | 65% | ✅ On Track |
| Backward Compatibility | 100% | 100% | ✅ On Track |
| Shared Types | 6-8 | 8 | ✅ On Track |

---

## 🔍 Validation Results

**File Analyzed:** `/workspaces/agentic-qe-cf/src/mcp/tools.ts`
- Total Lines: 4,168
- Total Tools: 100
- Boolean Parameters: 137
- Priority Usages: 13
- FleetId Usages: 6
- AgentId Usages: 9

**Reports Generated:**
- ✅ Full Report (881 lines)
- ✅ Summary (230 lines)
- ✅ Metrics JSON (validated)

---

## 📖 Next Steps

1. **Review** findings with team
2. **Prioritize** optimizations by impact
3. **Create** implementation PRs:
   - Phase 1: Boolean consolidation
   - Phase 2: Shared types
   - Phase 3: Description cleanup
   - Phase 4: Deprecation
4. **Test** backward compatibility
5. **Document** migration path
6. **Deploy** in phases (v2.2, v2.3, v3.0)

---

## 🤝 Swarm Coordination

This analysis is part of a **4-track parallel optimization effort**:

- **Track A:** Tool categorization and dependency analysis
- **Track B:** Common pattern identification
- **Track C:** Parameter schema simplification (this track)
- **Track D:** Documentation and usage optimization

All tracks coordinate through the shared swarm memory namespace.

---

## 📚 Additional Resources

- [GitHub Issue #115](https://github.com/proffesor-for-testing/agentic-qe/issues/115)
- [MCP Tools Source](../../src/mcp/tools.ts)
- [Migration Guide](./schema-optimization-report.md#6-code-examples) (in full report)
- [Backward Compatibility Tests](./schema-optimization-report.md#8-validation--testing) (in full report)

---

**Generated by:** Code Quality Analyzer (Track C)
**Swarm ID:** swarm_1764923979903_lbcgvbqu3
**Analysis Date:** 2025-12-05

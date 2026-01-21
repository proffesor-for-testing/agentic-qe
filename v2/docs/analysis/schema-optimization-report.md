# MCP Tools Parameter Schema Optimization Report

**Analysis Date:** 2025-12-05
**File Analyzed:** `/workspaces/agentic-qe-cf/src/mcp/tools.ts`
**Total Lines:** 4168
**Swarm ID:** swarm_1764923979903_lbcgvbqu3
**Track:** C - Parameter Schema Analysis

---

## Executive Summary

Analysis of 60+ MCP tools identified significant optimization opportunities:
- **22 tools** with 3+ boolean parameters (consolidation candidates)
- **8 repeated schema patterns** (shared type extraction)
- **20 verbose descriptions** exceeding 80 characters
- **15+ rarely used optional parameters** adding complexity

**Estimated Token Savings:** ~15-25% reduction in schema token overhead

---

## 1. Boolean Consolidation Opportunities

### 1.1 High Priority - Report Generation Tools (5 booleans → 1 enum)

#### Tool: `mcp__agentic_qe__test_report_comprehensive` (Lines 701-721)
**Current:**
```typescript
includeCharts: { type: 'boolean', default: false }      // Line 701
includeTrends: { type: 'boolean', default: false }      // Line 706
includeSummary: { type: 'boolean', default: true }      // Line 711
includeDetails: { type: 'boolean', default: false }     // Line 716
structured: { type: 'boolean', default: true }          // Line 721
```

**Proposed:**
```typescript
reportDetail: {
  type: 'string',
  enum: ['minimal', 'summary', 'detailed', 'comprehensive'],
  default: 'summary',
  description: 'Report detail level (minimal=no extras, summary=basic+charts, detailed=+trends, comprehensive=all)'
}
```
**Token Savings:** ~40% (5 params → 1 param)

---

#### Tool: `mcp__agentic_qe__qe_test_data_mask` (Lines 2727-2763)
**Current:**
```typescript
caseSensitive: { type: 'boolean' }                     // Line 2727
preserveFormat: { type: 'boolean' }                    // Line 2728
gdprCompliant: { type: 'boolean', default: true }      // Line 2740
auditLog: { type: 'boolean', default: false }          // Line 2745
preserveIntegrity: { type: 'boolean', default: false } // Line 2763
```

**Proposed:**
```typescript
maskingMode: {
  type: 'string',
  enum: ['basic', 'gdpr-compliant', 'strict', 'audit'],
  default: 'gdpr-compliant',
  description: 'Masking mode (basic=simple mask, gdpr-compliant=preserve format+GDPR, strict=+integrity, audit=+logging)'
}
caseSensitive: { type: 'boolean', default: false }  // Keep as separate concern
```
**Token Savings:** ~35% (5 params → 2 params)

---

#### Tool: `mcp__agentic_qe__qe_test_data_analyze_schema` (Lines 2789-2809)
**Current:**
```typescript
analyzeConstraints: { type: 'boolean', default: true }     // Line 2789
analyzeRelationships: { type: 'boolean', default: true }   // Line 2794
analyzeIndexes: { type: 'boolean', default: true }         // Line 2799
analyzeDataQuality: { type: 'boolean', default: true }     // Line 2804
includeRecommendations: { type: 'boolean', default: true } // Line 2809
```

**Proposed:**
```typescript
analysisScope: {
  type: 'string',
  enum: ['structure-only', 'standard', 'comprehensive', 'recommendations'],
  default: 'comprehensive',
  description: 'Analysis scope (structure-only=constraints+indexes, standard=+relationships, comprehensive=+quality, recommendations=+suggestions)'
}
```
**Token Savings:** ~45% (5 params → 1 param)

---

### 1.2 Medium Priority - Coverage Analysis Tools (4 booleans → 1 enum)

#### Tool: `mcp__agentic_qe__test_coverage_detailed` (Lines 774-793)
**Current:**
```typescript
identifyGaps: { type: 'boolean', default: true }        // Line 774
prioritizeGaps: { type: 'boolean', default: true }      // Line 779
generateSuggestions: { type: 'boolean', default: true } // Line 784
comparePrevious: { type: 'boolean', default: false }    // Line 789
```

**Proposed:**
```typescript
analysisDepth: {
  type: 'string',
  enum: ['basic', 'gaps', 'prioritized', 'suggested', 'historical'],
  default: 'suggested',
  description: 'Coverage analysis depth (basic=report only, gaps=+gap detection, prioritized=+ranking, suggested=+recommendations, historical=+trends)'
}
```
**Token Savings:** ~35% (4 params → 1 param)

---

#### Tool: `mcp__agentic_qe__coverage_analyze_with_risk_scoring` (Lines 1897-1900)
**Current:**
```typescript
complexity: { type: 'boolean', default: true }          // Line 1897
changeFrequency: { type: 'boolean', default: true }     // Line 1898
criticalPaths: { type: 'boolean', default: true }       // Line 1899
historicalDefects: { type: 'boolean', default: false }  // Line 1900
```

**Proposed:**
```typescript
riskFactors: {
  type: 'array',
  items: { type: 'string', enum: ['complexity', 'change-frequency', 'critical-paths', 'historical-defects'] },
  default: ['complexity', 'change-frequency', 'critical-paths'],
  description: 'Risk factors to include in scoring'
}
```
**Token Savings:** ~30% (4 params → 1 array param with better flexibility)

---

### 1.3 Analysis-Specific Tools (4 booleans → 1 enum)

#### Tool: `mcp__agentic_qe__flaky_analyze_patterns` (Lines 2081-2084)
**Current:**
```typescript
analyzeTiming: { type: 'boolean', default: true }       // Line 2081
analyzeEnvironment: { type: 'boolean', default: true }  // Line 2082
analyzeDependencies: { type: 'boolean', default: true } // Line 2083
clusterSimilar: { type: 'boolean', default: false }     // Line 2084
```

**Proposed:**
```typescript
analysisMode: {
  type: 'string',
  enum: ['timing-only', 'environment-only', 'dependencies-only', 'comprehensive', 'clustered'],
  default: 'comprehensive',
  description: 'Flaky test analysis mode (timing/environment/dependencies=single factor, comprehensive=all factors, clustered=comprehensive+grouping)'
}
```
**Token Savings:** ~35% (4 params → 1 param)

---

#### Tool: `mcp__agentic_qe__performance_analyze_bottlenecks` (Lines 2146-2149)
**Current:**
```typescript
analyzeMemory: { type: 'boolean', default: true }              // Line 2146
analyzeCPU: { type: 'boolean', default: true }                 // Line 2147
analyzeIO: { type: 'boolean', default: false }                 // Line 2148
generateRecommendations: { type: 'boolean', default: true }    // Line 2149
```

**Proposed:**
```typescript
analysisMode: {
  type: 'string',
  enum: ['cpu-only', 'memory-only', 'io-only', 'standard', 'comprehensive'],
  default: 'comprehensive',
  description: 'Bottleneck analysis mode (cpu/memory/io=single metric, standard=cpu+memory+recommendations, comprehensive=all+recommendations)'
}
```
**Token Savings:** ~35% (4 params → 1 param)

---

### 1.4 BDD Generation Tools (4 booleans → 2 enums)

#### Tool: `mcp__agentic_qe__qe_requirements_generate_bdd` (Lines 3048-3063)
**Current:**
```typescript
includeBackground: { type: 'boolean', default: true }         // Line 3048
includeScenarioOutlines: { type: 'boolean', default: true }   // Line 3053
includeNegativeCases: { type: 'boolean', default: true }      // Line 3058
includeEdgeCases: { type: 'boolean', default: true }          // Line 3063
```

**Proposed:**
```typescript
scenarioDepth: {
  type: 'string',
  enum: ['basic', 'outlined', 'comprehensive'],
  default: 'comprehensive',
  description: 'Scenario generation depth (basic=happy path, outlined=+data tables, comprehensive=+background)'
}
testCoverage: {
  type: 'string',
  enum: ['happy-path', 'negative', 'full'],
  default: 'full',
  description: 'Test coverage scope (happy-path=success cases, negative=+failures, full=+edge cases)'
}
```
**Token Savings:** ~30% (4 params → 2 params with better clarity)

---

## 2. Common Schema Types to Extract

### 2.1 Repeated Type Definitions

#### **ReportFormat** (Used in 8 tools)
**Current locations:** Lines 264, 692, 2165, 2334, 3435, 3747
```typescript
// Currently duplicated 8+ times:
format: {
  type: 'string',
  enum: ['junit', 'tap', 'json', 'html'],
  default: 'json',
  description: 'Test report format'
}
```

**Proposed shared type:**
```typescript
export type ReportFormat = 'junit' | 'tap' | 'json' | 'html' | 'markdown' | 'pdf';

// Usage in tools:
format: {
  type: 'string',
  enum: ['junit', 'tap', 'json', 'html'],
  default: 'json'
}
```

---

#### **PriorityLevel** (Used in 10+ tools)
**Current locations:** Lines 429, 755, 996, 1033, 1338, 1955, 2296, 2943, 3005, 3177
```typescript
// Currently duplicated 10+ times:
priority: {
  type: 'string',
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'medium',
  description: 'Task priority level'
}
```

**Proposed shared type:**
```typescript
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

// Usage in tools:
priority: {
  type: 'string',
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'medium'
}
```

---

#### **FleetIdParameter** (Used in 8+ tools)
**Current locations:** Lines 160, 271, 395, 467, 1817, 3248
```typescript
// Currently duplicated 8+ times:
fleetId: {
  type: 'string',
  description: 'ID of the fleet to spawn the agent in'
}
// or
fleetId: {
  type: 'string',
  description: 'Fleet ID for coordinated execution'
}
```

**Proposed shared parameter:**
```typescript
const FleetIdParam = {
  type: 'string',
  description: 'Fleet identifier'
} as const;

// Usage in tools:
fleetId: FleetIdParam
```
**Token Savings:** ~20 tokens per usage (8 usages = 160 tokens)

---

#### **AgentIdParameter** (Used in 6+ tools)
**Current locations:** Lines 216, 860, 999, 3282, 3810, 3847
```typescript
// Currently duplicated 6+ times:
agentId: {
  type: 'string',
  description: 'ID of the test generator agent to use'
}
// or
agentId: {
  type: 'string',
  description: 'Agent ID for access tracking'
}
```

**Proposed shared parameter:**
```typescript
const AgentIdParam = {
  type: 'string',
  description: 'Agent identifier'
} as const;

// Usage in tools:
agentId: AgentIdParam
```
**Token Savings:** ~18 tokens per usage (6 usages = 108 tokens)

---

#### **DetailLevel** (Used in 5+ tools)
**Current locations:** Lines 768-772, 1548-1552, 3590-3594
```typescript
// Currently duplicated 5+ times:
detailLevel: {
  type: 'string',
  enum: ['basic', 'detailed', 'comprehensive'],
  default: 'detailed',
  description: 'Level of detail in analysis'
}
```

**Proposed shared type:**
```typescript
export type DetailLevel = 'basic' | 'detailed' | 'comprehensive';

const DetailLevelParam = {
  type: 'string',
  enum: ['basic', 'detailed', 'comprehensive'],
  default: 'detailed'
} as const;
```

---

#### **EnvironmentName** (Used in 7+ tools)
**Current locations:** Lines 100-103, 239-242, 3629, 3672
```typescript
// Currently duplicated 7+ times:
environments: {
  type: 'array',
  items: { type: 'string' },
  description: 'Target environments for testing'
}
// or
environment: {
  type: 'string',
  enum: ['development', 'staging', 'production'],
  description: 'Target deployment environment'
}
```

**Proposed shared type:**
```typescript
export type Environment = 'development' | 'staging' | 'production' | 'test' | 'local';

const EnvironmentArrayParam = {
  type: 'array',
  items: { type: 'string' }
} as const;

const EnvironmentParam = {
  type: 'string',
  enum: ['development', 'staging', 'production']
} as const;
```

---

#### **TestFramework** (Used in 6+ tools)
**Current locations:** Lines 105-108, 203-206, 547-550, 2110-2113
```typescript
// Currently duplicated 6+ times:
frameworks: {
  type: 'array',
  items: { type: 'string' },
  description: 'Testing frameworks to support'
}
// or
framework: {
  type: 'string',
  enum: ['jest', 'mocha', 'jasmine', 'cypress', 'playwright'],
  default: 'jest'
}
```

**Proposed shared type:**
```typescript
export type TestFramework = 'jest' | 'mocha' | 'jasmine' | 'vitest' | 'cypress' | 'playwright';

const TestFrameworkParam = {
  type: 'string',
  enum: ['jest', 'mocha', 'jasmine', 'vitest'],
  default: 'jest'
} as const;
```

---

#### **AnalysisScope** (Used in 4+ tools)
**Current locations:** Lines 289-292, 339-342, 763-766
```typescript
// Currently duplicated 4+ times:
scope: {
  type: 'string',
  enum: ['code', 'tests', 'performance', 'security', 'all'],
  description: 'Scope of quality analysis'
}
// or
analysisType: {
  type: 'string',
  enum: ['file', 'function', 'line', 'module'],
  description: 'Granularity of defect prediction'
}
```

**Proposed shared types:**
```typescript
export type QualityScope = 'code' | 'tests' | 'performance' | 'security' | 'all';
export type AnalysisGranularity = 'file' | 'function' | 'line' | 'module';

const QualityScopeParam = {
  type: 'string',
  enum: ['code', 'tests', 'performance', 'security', 'all']
} as const;
```

---

## 3. Verbose Parameter Descriptions

### 3.1 Excessively Long Descriptions (>100 characters)

| Line | Tool | Parameter | Current Description | Length | Proposed |
|------|------|-----------|---------------------|---------|----------|
| 3806 | `learning_store_experience` | *description* | "Store a learning experience for an agent (reward, outcome, task execution details). Enables learning persistence with Claude Code Task tool." | 146 chars | "Store agent learning experience with reward and outcome" (56 chars) |
| 3843 | `learning_store_qvalue` | *description* | "Store or update a Q-value for a state-action pair. Q-values represent expected reward for taking a specific action in a given state." | 136 chars | "Store Q-value for state-action pair" (36 chars) |
| 3879 | `learning_store_pattern` | *description* | "Store a successful pattern for an agent. Patterns capture proven approaches, strategies, and techniques that worked well and should be reused." | 146 chars | "Store successful pattern for reuse" (35 chars) |
| 3926 | `learning_query` | *description* | "Query learning data (experiences, Q-values, patterns) for an agent. Supports filtering by agent ID, task type, time range, and minimum reward." | 146 chars | "Query agent learning data with filters" (39 chars) |
| 1773 | `test_execute_stream` | *description* | "Execute tests with real-time streaming progress updates (recommended for long-running tests >30s)" | 101 chars | "Execute tests with real-time streaming" (39 chars) |
| 1833 | `coverage_analyze_stream` | *description* | "Analyze coverage with real-time streaming progress (recommended for large codebases)" | 88 chars | "Analyze coverage with streaming" (32 chars) |

**Token Savings:** ~60-70% reduction per description (500+ tokens total)

---

### 3.2 Redundant Description Content

Many descriptions repeat information already in the parameter name:

| Line | Parameter | Current Description | Proposed |
|------|-----------|---------------------|----------|
| 209 | `synthesizeData` | "Whether to synthesize realistic test data" | "Generate realistic test data" |
| 245 | `parallelExecution` | "Enable parallel test execution" | "Execute tests in parallel" |
| 305 | `generateRecommendations` | "Generate improvement recommendations" | "Include recommendations" |
| 400 | `includeMetrics` | "Include performance metrics" | "Add performance data" |
| 616 | `collectCoverage` | "Collect coverage data during execution" | "Gather coverage data" |
| 774 | `identifyGaps` | "Identify coverage gaps" | "Find coverage gaps" |
| 2081 | `analyzeTiming` | "Analyze timing patterns" | "Check timing" |

**Pattern:** Remove "Enable/Include/Generate" prefixes when parameter name already implies action.

---

## 4. Rarely Used Optional Parameters

### 4.1 Parameters with Low Utilization (candidates for removal)

#### Tool: `mcp__agentic_qe__test_execute_parallel` (Line 615-618)
```typescript
collectCoverage: {
  type: 'boolean',
  default: false,
  description: 'Collect coverage data during execution'
}
```
**Analysis:** Coverage collection is handled by dedicated `coverage_analyze` tools. This adds complexity to test execution.
**Recommendation:** Remove. Users should use dedicated coverage tools.

---

#### Tool: `mcp__agentic_qe__test_optimize_sublinear` (Line 658-661)
```typescript
predictFailures: {
  type: 'boolean',
  default: false,
  description: 'Enable failure prediction'
}
```
**Analysis:** Failure prediction is a separate concern handled by `predict_defects` tool.
**Recommendation:** Remove or move to dedicated predictive analysis tool.

---

#### Tool: `mcp__agentic_qe__memory_retrieve` (Line 855-859)
```typescript
includeMetadata: {
  type: 'boolean',
  default: false,
  description: 'Include metadata in response'
}
```
**Analysis:** Metadata is rarely needed. Most retrievals only need the value.
**Recommendation:** Keep but document as advanced use case.

---

#### Tool: `mcp__agentic_qe__workflow_execute` (Line 1229-1232)
```typescript
dryRun: {
  type: 'boolean',
  default: false,
  description: 'Execute in dry-run mode'
}
```
**Analysis:** Dry-run mode adds complexity. Consider workflow validation as separate tool.
**Recommendation:** Extract to `workflow_validate` tool.

---

### 4.2 Over-Specified Optional Parameters

#### Tool: `mcp__agentic_qe__predict_defects` (Line 356-362)
```typescript
historicalDataDays: {
  type: 'number',
  minimum: 7,
  maximum: 365,
  default: 90,
  description: 'Days of historical data to consider'
}
```
**Analysis:** Very specific constraint. Most users will use default.
**Recommendation:** Simplify to enum: `timeWindow: 'week' | 'month' | 'quarter' | 'year'`

---

#### Tool: `mcp__agentic_qe__flaky_detect_statistical` (Line 2046-2050)
```typescript
confidenceLevel: {
  type: 'number',
  default: 0.95,
  minimum: 0.9,
  maximum: 0.99
}
```
**Analysis:** Statistical detail unnecessary for most users.
**Recommendation:** Use enum: `confidence: 'normal' | 'high' | 'very-high'` mapping to 0.90, 0.95, 0.99

---

## 5. Consolidation Summary

### 5.1 High-Impact Optimizations

| Optimization | Tools Affected | Token Savings | Complexity Reduction |
|--------------|----------------|---------------|---------------------|
| Boolean → Enum consolidation | 22 tools | ~8,000 tokens | 65% fewer parameters |
| Extract shared types | 40+ usages | ~2,000 tokens | DRY principle |
| Shorten descriptions | 20 descriptions | ~500 tokens | Better readability |
| Remove rare parameters | 5-8 parameters | ~800 tokens | Simplified API |

**Total Estimated Savings:** ~11,300 tokens (~15-20% of schema overhead)

---

### 5.2 Implementation Priority

#### Phase 1: High-Impact Boolean Consolidation (Week 1)
1. `test_report_comprehensive` (5 bools → 1 enum)
2. `qe_test_data_analyze_schema` (5 bools → 1 enum)
3. `qe_test_data_mask` (5 bools → 2 params)
4. `test_coverage_detailed` (4 bools → 1 enum)
5. `coverage_analyze_with_risk_scoring` (4 bools → 1 array)

**Expected Savings:** ~5,000 tokens

---

#### Phase 2: Shared Type Extraction (Week 2)
1. Extract `PriorityLevel` type (10 usages)
2. Extract `ReportFormat` type (8 usages)
3. Extract `FleetIdParam` constant (8 usages)
4. Extract `AgentIdParam` constant (6 usages)
5. Extract `TestFramework` type (6 usages)

**Expected Savings:** ~2,000 tokens

---

#### Phase 3: Description Optimization (Week 3)
1. Shorten learning tool descriptions (4 tools, 400 tokens)
2. Remove redundant prefixes (15 params, 100 tokens)
3. Simplify streaming descriptions (2 tools, 50 tokens)

**Expected Savings:** ~550 tokens

---

#### Phase 4: Remove Rarely Used Parameters (Week 4)
1. Review usage analytics for 8 identified parameters
2. Deprecate with warning (v2.2)
3. Remove in v3.0 (breaking change)

**Expected Savings:** ~800 tokens

---

## 6. Code Examples

### 6.1 Before/After Comparison

#### Example 1: Report Generation
```typescript
// BEFORE (120 tokens)
{
  name: 'mcp__agentic_qe__test_report_comprehensive',
  inputSchema: {
    properties: {
      includeCharts: { type: 'boolean', default: false, description: 'Include visual charts' },
      includeTrends: { type: 'boolean', default: false, description: 'Include trend analysis' },
      includeSummary: { type: 'boolean', default: true, description: 'Include summary section' },
      includeDetails: { type: 'boolean', default: false, description: 'Include detailed test information' },
      structured: { type: 'boolean', default: true, description: 'Use structured output (for JSON)' }
    }
  }
}

// AFTER (45 tokens) - 62% reduction
{
  name: 'mcp__agentic_qe__test_report_comprehensive',
  inputSchema: {
    properties: {
      reportDetail: {
        type: 'string',
        enum: ['minimal', 'summary', 'detailed', 'comprehensive'],
        default: 'summary'
      }
    }
  }
}
```

---

#### Example 2: Shared Types
```typescript
// BEFORE (duplicated 10 times = 300 tokens)
priority: {
  type: 'string',
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'medium',
  description: 'Task priority level'
}

// AFTER (10 usages = 150 tokens) - 50% reduction
// In types.ts:
export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';
export const PriorityParam = {
  type: 'string',
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'medium'
} as const;

// In tools.ts:
priority: PriorityParam
```

---

## 7. Recommendations

### 7.1 Immediate Actions

1. **Create shared types module** (`src/mcp/schema-types.ts`)
   - Extract 8 common types
   - Define reusable parameter constants
   - Add JSDoc documentation

2. **Implement boolean consolidation** for top 5 tools
   - Use semantic enum values
   - Maintain backward compatibility with v2.x
   - Add migration guide

3. **Shorten descriptions** by 30-40%
   - Remove redundant prefixes
   - Keep only essential information
   - Move details to documentation

4. **Mark rare parameters as deprecated**
   - Add deprecation warnings in v2.2
   - Plan removal for v3.0
   - Provide migration path

---

### 7.2 Long-Term Strategy

1. **Versioning Strategy:**
   - v2.2: Add new consolidated parameters with deprecation warnings
   - v2.3: Default to new parameters, warn on old usage
   - v3.0: Remove deprecated parameters (breaking change)

2. **Usage Analytics:**
   - Track parameter usage in production
   - Identify rarely used parameters
   - Make data-driven removal decisions

3. **Documentation:**
   - Create parameter migration guide
   - Update API reference with new consolidated params
   - Add best practices section

---

## 8. Validation & Testing

### 8.1 Backward Compatibility Tests

```typescript
// Test that old boolean parameters still work (deprecated but functional)
test('backward compatibility for includeCharts', () => {
  const oldStyle = { includeCharts: true, includeTrends: true };
  const newStyle = { reportDetail: 'detailed' };

  expect(convertOldToNew(oldStyle)).toEqual(newStyle);
});
```

### 8.2 Schema Validation

```typescript
// Ensure new enums map correctly to old boolean combinations
test('enum mapping preserves functionality', () => {
  const minimal = { reportDetail: 'minimal' };
  const comprehensive = { reportDetail: 'comprehensive' };

  expect(expandToOldFormat(minimal)).toEqual({
    includeCharts: false,
    includeTrends: false,
    includeSummary: false,
    includeDetails: false
  });

  expect(expandToOldFormat(comprehensive)).toEqual({
    includeCharts: true,
    includeTrends: true,
    includeSummary: true,
    includeDetails: true
  });
});
```

---

## Appendix A: Complete Tool List with Boolean Counts

| Tool Name | Boolean Count | Priority |
|-----------|---------------|----------|
| `qe_test_data_mask` | 5 | High |
| `qe_test_data_analyze_schema` | 5 | High |
| `test_report_comprehensive` | 5 | High |
| `test_coverage_detailed` | 4 | High |
| `coverage_analyze_with_risk_scoring` | 4 | High |
| `flaky_analyze_patterns` | 4 | High |
| `performance_analyze_bottlenecks` | 4 | High |
| `qe_requirements_generate_bdd` | 4 | Medium |
| `test_execute_parallel` | 3 | Medium |
| `test_optimize_sublinear` | 3 | Medium |
| `workflow_execute` | 3 | Medium |
| `requirements_generate_bdd` | 3 | Medium |
| `production_incident_replay` | 3 | Medium |
| `production_rum_analyze` | 3 | Medium |
| `security_generate_report` | 3 | Medium |
| `qe_api_contract_validate` | 3 | Low |
| `qe_api_contract_breaking_changes` | 3 | Low |
| `qe_requirements_validate` | 3 | Low |
| `qe_fleet_coordinate` | 3 | Low |
| `qe_testgen_analyze_quality` | 3 | Low |
| `qe_qualitygate_generate_report` | 3 | Low |
| `fleet_status` | 2 | Low |

---

## Appendix B: Shared Type Definitions

```typescript
// src/mcp/schema-types.ts

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';
export type ReportFormat = 'junit' | 'tap' | 'json' | 'html' | 'markdown' | 'pdf';
export type DetailLevel = 'basic' | 'detailed' | 'comprehensive';
export type Environment = 'development' | 'staging' | 'production' | 'test' | 'local';
export type TestFramework = 'jest' | 'mocha' | 'jasmine' | 'vitest' | 'cypress' | 'playwright';
export type QualityScope = 'code' | 'tests' | 'performance' | 'security' | 'all';
export type AnalysisGranularity = 'file' | 'function' | 'line' | 'module';

export const PriorityParam = {
  type: 'string',
  enum: ['low', 'medium', 'high', 'critical'],
  default: 'medium'
} as const;

export const ReportFormatParam = {
  type: 'string',
  enum: ['junit', 'tap', 'json', 'html'],
  default: 'json'
} as const;

export const FleetIdParam = {
  type: 'string',
  description: 'Fleet identifier'
} as const;

export const AgentIdParam = {
  type: 'string',
  description: 'Agent identifier'
} as const;

export const DetailLevelParam = {
  type: 'string',
  enum: ['basic', 'detailed', 'comprehensive'],
  default: 'detailed'
} as const;
```

---

## Appendix C: Migration Examples

### Example 1: Migrating Report Tool

```typescript
// OLD API (deprecated in v2.2, removed in v3.0)
{
  includeCharts: true,
  includeTrends: true,
  includeSummary: true,
  includeDetails: false,
  structured: true
}

// NEW API (recommended v2.2+)
{
  reportDetail: 'detailed'  // Includes charts, trends, summary but not full details
}

// Mapping:
// minimal: All false
// summary: includeSummary=true only
// detailed: includeSummary=true, includeCharts=true, includeTrends=true
// comprehensive: All true
```

---

**Report Generated by:** Code Quality Analyzer (Track C)
**Swarm Coordination:** Track A, B, D running in parallel
**Next Steps:** Review findings, prioritize implementations, create PRs

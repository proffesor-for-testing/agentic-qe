# Phase 3: Domain-Specific Tool Refactoring - Analysis

**Date**: 2025-11-07
**Task**: Analyze current MCP tools and plan domain-specific refactoring
**Status**: **IN PROGRESS**

---

## Current Tool Inventory

### Existing MCP Tools (54 total)

#### Core Fleet Management (9 tools)
1. `mcp__agentic_qe__fleet_init` - Initialize QE fleet
2. `mcp__agentic_qe__agent_spawn` - Spawn new agent
3. `mcp__agentic_qe__fleet_status` - Get fleet status
4. `mcp__agentic_qe__task_orchestrate` - Orchestrate tasks
5. `mcp__agentic_qe__task_status` - Get task status
6. `mcp__agentic_qe__event_emit` - Emit events
7. `mcp__agentic_qe__workflow_create` - Create workflow
8. `mcp__agentic_qe__workflow_execute` - Execute workflow
9. `mcp__agentic_qe__workflow_checkpoint` - Checkpoint workflow

#### Test Generation (8 tools) ✅ Already domain-specific
- `mcp__agentic_qe__test_generate` - Generic test generation
- `mcp__agentic_qe__test_generate_enhanced` - Enhanced generation
- **Domain-specific handlers exist**:
  - `src/mcp/handlers/test/generate-unit-tests.ts`
  - `src/mcp/handlers/test/generate-integration-tests.ts`
  - `src/mcp/handlers/test/test-generate-enhanced.ts`

#### Test Execution (5 tools) ✅ Partially domain-specific
- `mcp__agentic_qe__test_execute` - Generic execution
- `mcp__agentic_qe__test_execute_parallel` - Parallel execution
- **Handlers**:
  - `src/mcp/handlers/test-execute.ts`
  - `src/mcp/handlers/test/test-execute-parallel.ts`

#### Test Optimization (3 tools) ✅ Partially domain-specific
- `mcp__agentic_qe__optimize_tests` - Generic optimization
- `mcp__agentic_qe__test_optimize_sublinear` - Sublinear optimization
- **Handlers**:
  - `src/mcp/handlers/optimize-tests.ts`
  - `src/mcp/handlers/test/optimize-test-suite.ts`
  - `src/mcp/handlers/test/test-optimize-sublinear.ts`

#### Coverage Analysis (2 tools) ❌ NEEDS REFACTORING
- `mcp__agentic_qe__test_coverage_detailed` - Detailed coverage
- **Handlers exist**:
  - `src/mcp/handlers/test/test-coverage-detailed.ts`
  - `src/mcp/handlers/analysis/coverage-analyze-sublinear-handler.ts`
  - `src/mcp/handlers/analysis/coverage-gaps-detect-handler.ts`

#### Quality Analysis (7 tools) ❌ NEEDS REFACTORING
- `mcp__agentic_qe__quality_analyze` - Generic quality analysis
- **Handlers exist**:
  - `src/mcp/handlers/quality-analyze.ts`
  - `src/mcp/handlers/quality/quality-gate-execute.ts`
  - `src/mcp/handlers/quality/quality-policy-check.ts`
  - `src/mcp/handlers/quality/quality-risk-assess.ts`
  - `src/mcp/handlers/quality/quality-validate-metrics.ts`
  - `src/mcp/handlers/quality/quality-decision-make.ts`

#### Performance Testing (2 tools) ❌ NEEDS REFACTORING
- **Handlers exist**:
  - `src/mcp/handlers/analysis/performance-benchmark-run-handler.ts`
  - `src/mcp/handlers/analysis/performance-monitor-realtime-handler.ts`

#### Security Scanning (1 tool) ❌ NEEDS REFACTORING
- **Handlers exist**:
  - `src/mcp/handlers/analysis/security-scan-comprehensive-handler.ts`

#### Chaos Engineering (3 tools) ✅ Domain-specific
- **Handlers exist**:
  - `src/mcp/handlers/chaos/chaos-inject-failure.ts`
  - `src/mcp/handlers/chaos/chaos-inject-latency.ts`
  - `src/mcp/handlers/chaos/chaos-resilience-test.ts`

#### Flaky Test Detection (1 tool) ❌ NEEDS REFACTORING
- **Handlers exist**:
  - `src/mcp/handlers/prediction/flaky-test-detect.ts`

#### Visual Testing (1 tool) ❌ NEEDS REFACTORING
- **Handlers exist**:
  - `src/mcp/handlers/prediction/visual-test-regression.ts`

#### Memory & Coordination (9 tools) ✅ Already specific
- `mcp__agentic_qe__memory_store`
- `mcp__agentic_qe__memory_retrieve`
- `mcp__agentic_qe__memory_query`
- `mcp__agentic_qe__memory_share`
- `mcp__agentic_qe__memory_backup`
- `mcp__agentic_qe__blackboard_post`
- `mcp__agentic_qe__blackboard_read`
- `mcp__agentic_qe__consensus_propose`
- `mcp__agentic_qe__consensus_vote`

#### Advanced Testing (3 tools) ✅ Domain-specific
- **Handlers exist**:
  - `src/mcp/handlers/advanced/mutation-test-execute.ts`
  - `src/mcp/handlers/advanced/requirements-validate.ts`
  - `src/mcp/handlers/advanced/requirements-generate-bdd.ts`

---

## Gap Analysis

### Tools That Need Domain-Specific Refactoring

#### 1. Coverage Domain (Need 6 tools)

**Current State**: 2 generic tools
**Target**: 6 domain-specific tools

**New Tools Needed**:
1. ✅ `analyze_coverage_with_risk_scoring` (handler exists: coverage-analyze-sublinear-handler.ts)
2. ✅ `detect_coverage_gaps_ml` (handler exists: coverage-gaps-detect-handler.ts)
3. ❌ `recommend_tests_for_gaps` - NEW
4. ❌ `analyze_critical_paths` - NEW
5. ❌ `calculate_coverage_trends` - NEW
6. ❌ `export_coverage_report` - NEW

#### 2. Quality Gates Domain (Need 5 tools)

**Current State**: 1 generic tool (quality_analyze)
**Target**: 5 domain-specific tools

**New Tools Needed**:
1. ✅ `validate_deployment_readiness` (handler exists: quality-gate-execute.ts)
2. ✅ `assess_deployment_risk` (handler exists: quality-risk-assess.ts)
3. ✅ `check_quality_policies` (handler exists: quality-policy-check.ts)
4. ✅ `validate_quality_metrics` (handler exists: quality-validate-metrics.ts)
5. ✅ `make_quality_decision` (handler exists: quality-decision-make.ts)

#### 3. Flaky Detection Domain (Need 4 tools)

**Current State**: 1 generic tool
**Target**: 4 domain-specific tools

**New Tools Needed**:
1. ✅ `detect_flaky_tests_statistical` (handler exists: flaky-test-detect.ts)
2. ❌ `analyze_flaky_test_patterns` - NEW
3. ❌ `stabilize_flaky_test_auto` - NEW
4. ❌ `track_flaky_test_history` - NEW

#### 4. Performance Domain (Need 4 tools)

**Current State**: 2 handlers
**Target**: 4 domain-specific tools

**New Tools Needed**:
1. ✅ `run_performance_benchmark` (handler exists: performance-benchmark-run-handler.ts)
2. ✅ `monitor_performance_realtime` (handler exists: performance-monitor-realtime-handler.ts)
3. ❌ `analyze_performance_bottlenecks` - NEW
4. ❌ `generate_performance_report` - NEW

#### 5. Security Domain (Need 5 tools)

**Current State**: 1 handler
**Target**: 5 domain-specific tools

**New Tools Needed**:
1. ✅ `scan_security_comprehensive` (handler exists: security-scan-comprehensive-handler.ts)
2. ❌ `validate_authentication_flow` - NEW
3. ❌ `check_authorization_rules` - NEW
4. ❌ `scan_dependencies_vulnerabilities` - NEW
5. ❌ `generate_security_report` - NEW

#### 6. Visual Testing Domain (Need 3 tools)

**Current State**: 1 handler
**Target**: 3 domain-specific tools

**New Tools Needed**:
1. ✅ `detect_visual_regression` (handler exists: visual-test-regression.ts)
2. ❌ `compare_screenshots_ai` - NEW
3. ❌ `validate_accessibility_wcag` - NEW

---

## Proposed Domain-Specific Tool Organization

### Directory Structure

```
src/mcp/tools/qe/
├── test-generation/          # 8 tools (✅ mostly complete)
│   ├── generate-unit-tests.ts
│   ├── generate-integration-tests.ts
│   ├── generate-property-tests.ts
│   ├── generate-api-tests.ts
│   ├── generate-e2e-tests.ts
│   ├── optimize-test-suite.ts
│   ├── generate-test-data.ts
│   └── index.ts
│
├── coverage/                 # 6 tools (⚠️  2 exist, 4 needed)
│   ├── analyze-with-risk-scoring.ts ✅
│   ├── detect-gaps-ml.ts ✅
│   ├── recommend-tests.ts ❌
│   ├── analyze-critical-paths.ts ❌
│   ├── calculate-trends.ts ❌
│   ├── export-report.ts ❌
│   └── index.ts
│
├── quality-gates/           # 5 tools (✅ all exist)
│   ├── validate-readiness.ts ✅
│   ├── assess-risk.ts ✅
│   ├── check-policies.ts ✅
│   ├── validate-metrics.ts ✅
│   ├── make-decision.ts ✅
│   └── index.ts
│
├── flaky-detection/         # 4 tools (⚠️  1 exists, 3 needed)
│   ├── detect-statistical.ts ✅
│   ├── analyze-patterns.ts ❌
│   ├── stabilize-auto.ts ❌
│   ├── track-history.ts ❌
│   └── index.ts
│
├── performance/             # 4 tools (⚠️  2 exist, 2 needed)
│   ├── run-benchmark.ts ✅
│   ├── monitor-realtime.ts ✅
│   ├── analyze-bottlenecks.ts ❌
│   ├── generate-report.ts ❌
│   └── index.ts
│
├── security/                # 5 tools (⚠️  1 exists, 4 needed)
│   ├── scan-comprehensive.ts ✅
│   ├── validate-auth.ts ❌
│   ├── check-authz.ts ❌
│   ├── scan-dependencies.ts ❌
│   ├── generate-report.ts ❌
│   └── index.ts
│
├── visual/                  # 3 tools (⚠️  1 exists, 2 needed)
│   ├── detect-regression.ts ✅
│   ├── compare-screenshots.ts ❌
│   ├── validate-accessibility.ts ❌
│   └── index.ts
│
└── shared/
    ├── types.ts ✅
    ├── validators.ts
    └── index.ts
```

---

## Naming Convention

### Pattern: `[action]_[domain]_[specificity]`

**Examples**:
- ✅ `generate_unit_test_suite_for_class` - Very specific
- ✅ `detect_coverage_gaps_ml` - ML-based detection
- ✅ `analyze_performance_bottlenecks` - Domain-specific analysis
- ✅ `validate_deployment_readiness_comprehensive` - Comprehensive validation
- ❌ `generate_test` - Too generic
- ❌ `analyze_data` - Too generic

---

## Implementation Strategy

### Phase 3.1: Organize Existing Tools (Week 3, Day 1-2)

1. Create domain directories under `src/mcp/tools/qe/`
2. Move existing handlers to domain directories
3. Update imports and exports
4. Create domain index files

### Phase 3.2: Create Missing Tools (Week 3, Day 3-5)

1. **Coverage domain** (4 new tools)
2. **Flaky detection domain** (3 new tools)
3. **Performance domain** (2 new tools)
4. **Security domain** (4 new tools)
5. **Visual domain** (2 new tools)

**Total**: 15 new domain-specific tools

### Phase 3.3: Backward Compatibility (Week 4, Day 1-2)

1. Create deprecated wrapper functions
2. Add console.warn messages
3. Set deprecation timeline (3 months → v3.0.0)
4. Update MCP tool registry

### Phase 3.4: Migration & Documentation (Week 4, Day 3-5)

1. Create migration guide
2. Update agent code execution examples
3. Update CLAUDE.md
4. Test all tools
5. Document completion

---

## Backward Compatibility Strategy

### Example Deprecation Wrapper

```typescript
/**
 * @deprecated Use analyze_coverage_with_risk_scoring() instead
 * Will be removed in v3.0.0 (scheduled for February 2026)
 */
export async function test_coverage_detailed(params: any) {
  console.warn(
    '⚠️  test_coverage_detailed() is deprecated.\n' +
    '   Use analyze_coverage_with_risk_scoring() instead.\n' +
    '   This function will be removed in v3.0.0 (3 months).\n' +
    '   See migration guide: docs/migration/phase3-tools.md'
  );

  return analyzeCoverageWithRiskScoring(params);
}
```

---

## Success Metrics

### Must Have
- ✅ All existing tools mapped to domain-specific equivalents
- ✅ 15 new domain-specific tools created
- ✅ 100% backward compatibility maintained
- ✅ All tests pass

### Should Have
- ✅ Better type safety (no `any` types)
- ✅ Clear naming conventions
- ✅ Comprehensive JSDoc documentation
- ✅ Migration guide created

### Nice to Have
- ✅ Auto-generated tool catalog
- ✅ Interactive tool selector
- ✅ Usage analytics

---

## Risk Assessment

### Risk: Breaking existing workflows
**Mitigation**: Maintain backward compatibility with deprecation warnings

### Risk: Confusion during migration
**Mitigation**: Clear migration guide, console warnings with suggestions

### Risk: Incomplete coverage of use cases
**Mitigation**: Incremental rollout, user feedback loop

---

## Next Steps

1. ✅ Review and approve this analysis
2. 🚀 Create domain directory structure
3. 🚀 Start with high-impact domains (coverage, flaky-detection)
4. 🚀 Implement missing tools
5. 🚀 Add backward compatibility
6. 🚀 Test and document

---

**Status**: Analysis Complete, Ready for Implementation
**Approval Required**: Yes
**Estimated Effort**: 2 weeks (as per original plan)

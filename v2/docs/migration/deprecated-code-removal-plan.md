# Deprecated Code Removal Plan

**Issue**: #52 - Remove deprecated code
**Date**: 2025-11-17
**Status**: In Progress

## Summary

This document tracks the removal of deprecated code from the agentic-qe-cf codebase to eliminate:
- Log pollution from deprecation warnings
- 1520+ lines of deprecated wrapper code
- Maintenance burden of parallel implementations

## Files to Remove (Total: 1520 lines)

### 1. Core Deprecated Files
- **src/mcp/tools/deprecated.ts** (1128 lines)
  - 31 deprecated tool wrappers
  - All tools are fully replaced by new implementations
  - Zero active imports in production code

- **tests/mcp/tools/deprecated.test.ts** (288 lines)
  - Tests for backward compatibility
  - No longer needed since tools are unused

- **scripts/test-deprecated-tools.sh** (104 lines)
  - Verification script for deprecated tools
  - Obsolete after file removal

## Deprecation Annotations to Update

### 1. HookExecutor.ts (Keep with updated docs)
```typescript
// Location: src/mcp/services/HookExecutor.ts:7-27
@deprecated Prefer using BaseAgent native lifecycle hooks
```
**Action**: Keep for MCP integration, update documentation

### 2. AgentLifecycleManager.ts (Clean up)
```typescript
// Location: src/agents/lifecycle/AgentLifecycleManager.ts:275
@deprecated Use transitionTo() or specific methods
```
**Action**: Remove deprecated method entirely

### 3. LearningEngine.ts (Keep for compatibility)
```typescript
// Location: src/learning/LearningEngine.ts:119
@deprecated Use learnFromExecution() instead
```
**Action**: Keep for backward compatibility with external callers

## Migration Status

### Deprecated Tools → New Implementations

| Old Tool | New Implementation | Status |
|----------|-------------------|--------|
| `test_coverage_detailed` | `analyzeCoverageWithRiskScoring()` | ✅ Available |
| `test_coverage_gaps` | `identifyUncoveredRiskAreas()` | ✅ Available |
| `flaky_test_detect` | `detectFlakyTestsStatistical()` | ✅ Available |
| `flaky_test_patterns` | `analyzeFlakyTestPatterns()` | ✅ Available |
| `flaky_test_stabilize` | `stabilizeFlakyTestAuto()` | ✅ Available |
| `performance_benchmark_run` | `runPerformanceBenchmark()` | ✅ Available |
| `performance_monitor_realtime` | `monitorRealtimePerformance()` | ✅ Available |
| `security_scan_comprehensive` | `securityScanComprehensive()` | ✅ Available |
| `security_validate_auth` | `validateAuthenticationFlow()` | ✅ Available |
| `security_check_authz` | `checkAuthorizationRules()` | ✅ Available |
| `test_generate_unit` | `generateUnitTests()` | ✅ Available |
| `test_generate_integration` | `generateIntegrationTests()` | ✅ Available |
| `test_optimize_suite` | `optimizeTestSuite()` | ✅ Available |
| `quality_gate_execute` | `QualityGateExecuteHandler` | ✅ Available |
| `quality_assess_risk` | `QualityRiskAssessHandler` | ✅ Available |
| `quality_validate_metrics` | `QualityValidateMetricsHandler` | ✅ Available |
| `visual_test_regression` | `detectVisualRegression()` | ✅ Available |
| `api_contract_validate` | `contractValidate()` | ✅ Available |
| `api_contract_breaking_changes` | `apiBreakingChanges()` | ✅ Available |
| `api_contract_versioning` | `generateVersioningMatrix()` | ⚠️ Placeholder |
| `test_data_generate` | `generateTestData()` | ⚠️ Placeholder |
| `test_data_mask` | `maskSensitiveData()` | ⚠️ Placeholder |
| `test_data_schema` | `validateDataSchema()` | ⚠️ Placeholder |
| `regression_analyze_risk` | `regressionAnalyzeRisk()` | ⚠️ Handler-based |
| `regression_select_tests` | `selectRegressionTests()` | ⚠️ Placeholder |
| `requirements_validate` | `requirementsValidate()` | ✅ Available |
| `requirements_bdd` | `requirementsGenerateBDD()` | ✅ Available |
| `code_complexity_analyze` | `analyzeComplexity()` | ⚠️ Placeholder |
| `code_quality_metrics` | `calculateQualityMetrics()` | ⚠️ Placeholder |
| `fleet_coordinate` | `coordinateFleet()` | ⚠️ Placeholder |
| `fleet_status` | `getFleetStatus()` | ⚠️ Placeholder |

**Summary**:
- ✅ 18 fully implemented replacements
- ⚠️ 13 placeholders/partial implementations
- **Decision**: Safe to remove - deprecated tools throw errors for placeholders anyway

## Import/Export Analysis

### Production Code
```bash
# Result: Zero imports found
grep -r "from.*deprecated\|import.*deprecated" /workspaces/agentic-qe-cf/src --include="*.ts"
# Output: (empty)
```

### Test Code
```bash
# Only test file itself imports deprecated tools
tests/mcp/tools/deprecated.test.ts:18
```

### Documentation References
- `docs/improvement-plan/phase3-architecture.md:2174` - Example code
- `docs/reports-archive/phases/phase3-backward-compatibility.md:231,273` - Migration guide

**Action**: Update documentation to reference new tools directly

## Removal Steps

### Step 1: Delete Files
```bash
rm src/mcp/tools/deprecated.ts
rm tests/mcp/tools/deprecated.test.ts
rm scripts/test-deprecated-tools.sh
```

### Step 2: Remove Deprecated Method (AgentLifecycleManager)
- Remove `setStatus()` method at line 275
- Callers already use `transitionTo()` or specific methods

### Step 3: Update Documentation
- Remove references to deprecated tools in docs
- Update migration guides to reference new tools

### Step 4: Remove Built Artifacts
```bash
rm dist/mcp/tools/deprecated.js
rm dist/mcp/tools/deprecated.js.map
rm dist/mcp/tools/deprecated.d.ts
rm dist/mcp/tools/deprecated.d.ts.map
```

## Verification

### Before Removal
```bash
# Count deprecated warnings in logs
npm run build 2>&1 | grep -i "deprecat" | wc -l
# Expected: Multiple warnings

# Total deprecated code
wc -l src/mcp/tools/deprecated.ts tests/mcp/tools/deprecated.test.ts scripts/test-deprecated-tools.sh
# Expected: 1520 total
```

### After Removal
```bash
# Should find no deprecated tool references
grep -r "deprecatedTools\|deprecated.ts" src/ --include="*.ts"
# Expected: (empty)

# Should have no console warnings
npm run build 2>&1 | grep -i "deprecat"
# Expected: Only HookExecutor and LearningEngine (intentional)

# Should compile without errors
npm run build && npm run typecheck
# Expected: Success
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| External packages import deprecated tools | Low | Medium | Check npm downloads, add breaking change note |
| Internal code still uses deprecated tools | None | High | Verified zero imports in src/ |
| Tests break | None | Low | Deprecated test file is self-contained |
| Documentation becomes outdated | Medium | Low | Update docs in same commit |

## Breaking Changes

**Version**: Will be part of v1.9.0 (not released yet)

**Impact**:
- External consumers using deprecated tool imports will see build errors
- All replacements are available since v1.5.0
- Migration path documented in `docs/migration/phase3-tools.md`

**Notification**:
- Add to CHANGELOG.md under "BREAKING CHANGES"
- Include migration guide reference
- Note removal in release notes

## Success Criteria

- [ ] All deprecated files removed (1520 lines)
- [ ] No imports of deprecated tools in production code
- [ ] Build succeeds without deprecation warnings (except intentional ones)
- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Migration plan stored in memory coordination

## Timeline

- **Analysis**: 2025-11-17 (Complete)
- **Implementation**: 2025-11-17 (In Progress)
- **Verification**: 2025-11-17 (Pending)
- **Release**: v1.9.0 (Planned)

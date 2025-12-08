# MCP Tools Fix Plan (Issues #116 & #120)

## Executive Summary

**Current Status:** CRITICAL - Validation has degraded from 26% to 5%

| Metric | Issue #120 Reported | Current Status | Change |
|--------|---------------------|----------------|--------|
| Total Tools | 82 | 82 | 0 |
| Valid Tools | 21 | 4 | -17 |
| Invalid Tools | 61 | 78 | +17 |
| Coverage | 26% | 5% | -21% |

The situation has worsened due to changes in the codebase architecture without corresponding updates to the validation script.

---

## Root Cause Analysis

### Problem 1: Validation Script Architecture Mismatch

The `scripts/validate-mcp-tools.js` was designed for a 1:1 handler model but the codebase evolved to use **composite handlers**:

```
OLD MODEL (validation expects):
  tool: fleet_init → handler: fleet-init.ts → test: fleet-init.test.ts

NEW MODEL (actual architecture):
  tool: coverage_analyze_with_risk_scoring
    → handler: Phase3DomainToolsHandler (composite)
    → test: (may be in various test files)
```

**Impact:** 40 tools show "Missing handler implementation" when they actually have handlers via Phase3DomainToolsHandler.

### Problem 2: Test File Discovery Failure

The validation script searches for tool names literally in test files:
```javascript
if (content.includes(toolName) || content.includes(`'${toolName}'`))
```

But tests don't reference tools by their full MCP name (`mcp__agentic_qe__fleet_init`), they test handlers directly.

**Impact:** 74 tools show "Missing unit tests" even when tests exist.

### Problem 3: Genuine Missing Implementations

Some tools have definitions but no working handlers:
- Streaming tools (`test_execute_stream`, `coverage_analyze_stream`)
- Some Phase 3 tools aren't fully routed in the Phase3DomainToolsHandler

---

## Tool Categorization

### Category A: Fully Valid (4 tools) ✅
| Tool | Handler | Test |
|------|---------|------|
| `fleet_init` | `fleet-init.ts` | `fleet-init.test.ts` |
| `agent_spawn` | `agent-spawn.ts` | `agent-spawn.test.ts` |
| `fleet_status` | `fleet-status.ts` | `fleet-status.test.ts` |
| `task_orchestrate` | `task-orchestrate.ts` | `task-orchestrate.test.ts` |

### Category B: Has Composite Handler, Missing Test Recognition (37 tools)
These use `Phase3DomainToolsHandler` but validation script can't find them:

| Domain | Tools | Handler |
|--------|-------|---------|
| Coverage | `coverage_analyze_with_risk_scoring`, `coverage_detect_gaps_ml`, `coverage_recommend_tests`, `coverage_calculate_trends` | Phase3DomainToolsHandler |
| Flaky | `flaky_detect_statistical`, `flaky_analyze_patterns`, `flaky_stabilize_auto` | Phase3DomainToolsHandler |
| Performance | `performance_analyze_bottlenecks`, `performance_generate_report`, `performance_run_benchmark` | Phase3DomainToolsHandler |
| Security | `security_generate_report`, `qe_security_*` (3 tools) | Phase3DomainToolsHandler |
| Visual | `visual_compare_screenshots`, `visual_validate_accessibility`, `visual_detect_regression` | Phase3DomainToolsHandler |
| Test Gen | `qe_testgen_*` (4 tools) | Phase3DomainToolsHandler |
| Quality Gates | `qe_qualitygate_*` (4 tools) | Phase3DomainToolsHandler |
| Fleet | `qe_fleet_*` (2 tools) | Phase3DomainToolsHandler |
| API Contract | `qe_api_contract_*` (3 tools) | Phase3DomainToolsHandler |
| Test Data | `qe_test_data_*` (3 tools) | Phase3DomainToolsHandler |
| Regression | `qe_regression_*` (2 tools) | Phase3DomainToolsHandler |
| Requirements | `qe_requirements_*` (2 tools) | Phase3DomainToolsHandler |
| Code Quality | `qe_code_quality_*` (2 tools) | Phase3DomainToolsHandler |

### Category C: Has Individual Handler, Missing Test Recognition (30 tools)
These have dedicated handlers but tests don't reference tool names:

| Tool | Handler File | Test Exists? |
|------|-------------|--------------|
| `test_execute` | `test-execute.ts` | ❌ No direct test |
| `test_generate_enhanced` | `test/test-generate-enhanced.ts` | ✅ `test-generate-enhanced.test.ts` |
| `test_execute_parallel` | `test/test-execute-parallel.ts` | ❌ Missing |
| `test_optimize_sublinear` | `test/test-optimize-sublinear.ts` | ❌ Missing |
| `test_report_comprehensive` | `test/test-report-comprehensive.ts` | ❌ Missing |
| `test_coverage_detailed` | `test/test-coverage-detailed.ts` | ✅ `test-coverage-detailed.test.ts` |
| `memory_store` | `memory/memory-store.ts` | ✅ `memory-store.test.ts` |
| `memory_retrieve` | `memory/memory-retrieve.ts` | ✅ `memory-retrieve.test.ts` |
| `memory_query` | `memory/memory-query.ts` | ✅ `memory-query.test.ts` |
| `memory_share` | `memory/memory-share.ts` | ❌ Missing |
| `memory_backup` | `memory/memory-backup.ts` | ❌ Missing |
| `blackboard_post` | `memory/blackboard-post.ts` | ❌ Missing |
| `blackboard_read` | `memory/blackboard-read.ts` | ❌ Missing |
| `consensus_propose` | `memory/consensus-propose.ts` | ❌ Missing |
| `consensus_vote` | `memory/consensus-vote.ts` | ❌ Missing |
| `artifact_manifest` | `memory/artifact-manifest.ts` | ❌ Missing |
| `workflow_create` | `coordination/workflow-create.ts` | ❌ Missing |
| `workflow_execute` | `coordination/workflow-execute.ts` | ❌ Missing |
| `workflow_checkpoint` | `coordination/workflow-checkpoint.ts` | ❌ Missing |
| `workflow_resume` | `coordination/workflow-resume.ts` | ❌ Missing |
| `task_status` | `coordination/task-status.ts` | ❌ Missing |
| `event_emit` | `coordination/event-emit.ts` | ❌ Missing |
| `event_subscribe` | `coordination/event-subscribe.ts` | ❌ Missing |
| `predict_defects_ai` | `prediction/predict-defects-ai.ts` | ✅ `predict-defects.test.ts` |
| `visual_test_regression` | `prediction/visual-test-regression.ts` | ✅ `visual-test-regression.test.ts` |
| `deployment_readiness_check` | `prediction/deployment-readiness-check.ts` | ❌ Missing |
| `coverage_analyze_sublinear` | `analysis/coverage-analyze-sublinear-handler.ts` | ✅ |
| `coverage_gaps_detect` | `analysis/coverage-gaps-detect-handler.ts` | ✅ |
| `performance_monitor_realtime` | `analysis/performance-monitor-realtime-handler.ts` | ✅ |
| `learning_*` (4 tools) | `learning/*.ts` | ❌ Missing |

### Category D: Missing Handler Implementation (2 tools)
These have tool definitions and are registered but handlers return "not implemented":

| Tool | Issue |
|------|-------|
| `test_execute_stream` | StreamingHandler exists but not properly registered |
| `coverage_analyze_stream` | StreamingHandler exists but not properly registered |

---

## Fix Plan

### Phase 1: Fix Validation Script (HIGH PRIORITY)

**Goal:** Make validation script understand the actual codebase architecture

**Changes to `scripts/validate-mcp-tools.js`:**

1. **Support Composite Handlers**
   ```javascript
   const COMPOSITE_HANDLERS = {
     'Phase3DomainToolsHandler': [
       'coverage_analyze_with_risk_scoring',
       'coverage_detect_gaps_ml',
       // ... list all tools handled by Phase3
     ],
     'Phase2ToolsHandler': [
       'learning_status',
       'learning_train',
       // ... list all Phase2 tools
     ]
   };
   ```

2. **Improve Test Discovery**
   ```javascript
   // Instead of searching for full tool name, search for:
   // - Handler class name
   // - Function name (e.g., 'handleCoverageAnalyzeWithRiskScoring')
   // - Partial tool name (e.g., 'coverage-analyze')
   ```

3. **Add Handler Registration Verification**
   - Check `server.ts` for `this.handlers.set(TOOL_NAMES.X, handler)`
   - Verify the handler is actually instantiated

**Files to modify:**
- `scripts/validate-mcp-tools.js`

**Estimated effort:** 4-6 hours

### Phase 2: Create Missing Test Files (MEDIUM PRIORITY)

**Goal:** Add unit tests for tools that genuinely lack coverage

**Tests to create (19 files):**

```
tests/mcp/handlers/
├── memory/
│   ├── memory-share.test.ts
│   ├── memory-backup.test.ts
│   ├── blackboard-post.test.ts
│   ├── blackboard-read.test.ts
│   ├── consensus-propose.test.ts
│   └── consensus-vote.test.ts
├── coordination/
│   ├── workflow-create.test.ts
│   ├── workflow-execute.test.ts
│   ├── workflow-checkpoint.test.ts
│   ├── workflow-resume.test.ts
│   ├── task-status.test.ts
│   ├── event-emit.test.ts
│   └── event-subscribe.test.ts
├── test/
│   ├── test-execute.test.ts
│   ├── test-execute-parallel.test.ts
│   ├── test-optimize-sublinear.test.ts
│   └── test-report-comprehensive.test.ts
├── prediction/
│   └── deployment-readiness-check.test.ts
└── learning/
    └── learning-handlers.test.ts (covers all 4 learning tools)
```

**Estimated effort:** 8-12 hours

### Phase 3: Fix Streaming Handler Registration (LOW PRIORITY)

**Goal:** Ensure streaming tools work correctly

**Changes:**
1. Verify `TestExecuteStreamHandler` is properly instantiated
2. Verify `CoverageAnalyzeStreamHandler` is properly instantiated
3. Add tests for streaming functionality

**Files to modify:**
- `src/mcp/server.ts` (lines 259-262)
- `tests/mcp/streaming/StreamingMCPTools.test.ts`

**Estimated effort:** 2-3 hours

### Phase 4: Issue #116 Optimizations (FUTURE)

**From Issue #116:**

1. **Boolean Parameter Consolidation** (Medium Priority)
   - Consolidate `aiAnalysis`, `patternDetection`, `clusteringEnabled` → `analysisMode` enum
   - Token savings: ~8,000

2. **Shared Type Extraction** (Low Priority)
   - Create `PaginationParams`, `FilterParams`, `OutputFormatParams`
   - Token savings: ~2,000

3. **Usage Analytics Integration** (Medium Priority)
   - Persist `LazyToolLoader` usage stats
   - Add `tools_usage_stats` tool

4. **Tool Deprecation Cleanup** (v3.0.0)
   - Remove deprecated tools:
     - `flaky_test_detect` → `flaky_detect_statistical`
     - `coverage_analyze_sublinear` → `coverage_analyze_with_risk_scoring`
     - `coverage_gaps_detect` → `coverage_detect_gaps_ml`
     - `performance_monitor_realtime` → `performance_analyze_bottlenecks`

---

## Success Criteria

### Phase 1 Complete
- [ ] Validation script recognizes composite handlers
- [ ] Validation coverage increases from 5% to >60%
- [ ] False positives for "Missing handler" eliminated

### Phase 2 Complete
- [ ] All 19 missing test files created
- [ ] Tests pass in CI
- [ ] Validation coverage reaches >85%

### Phase 3 Complete
- [ ] Streaming handlers work correctly
- [ ] Validation coverage reaches 95%

### Overall Success
- [ ] CI MCP validation passes (>80% coverage threshold)
- [ ] No false positives in validation report
- [ ] Clear documentation for adding new tools

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Phase 1 changes break CI | Medium | High | Run validation locally first, add to PR |
| New tests discover bugs | High | Medium | Fix bugs as found, don't skip |
| Composite handler pattern unclear | Low | Medium | Document pattern in architecture docs |

---

## Implementation Order

```
Week 1: Phase 1 (Validation Script)
   ├── Update findHandler() for composite handlers
   ├── Update findTests() for better discovery
   └── Test locally, create PR

Week 2: Phase 2 (Missing Tests - Part 1)
   ├── Memory handlers tests (6 files)
   └── Coordination handlers tests (6 files)

Week 3: Phase 2 (Missing Tests - Part 2)
   ├── Test handlers tests (4 files)
   ├── Prediction handlers tests (1 file)
   └── Learning handlers tests (1 file)

Week 4: Phase 3 + Phase 4 Planning
   ├── Streaming handler fixes
   └── Prioritize Issue #116 items for v3.0.0
```

---

## Related Issues

- #115 - MCP Tools Context Optimization (completed, caused some handler changes)
- #116 - MCP Tools Continued Optimization (ongoing enhancements)
- #120 - MCP Tools Test Validation (this plan addresses)
- #51 - MCP Server Performance Optimization

---

## Appendix: Current Test Coverage Map

### Existing Test Files (25 files)

| Test File | Tools Covered |
|-----------|---------------|
| `fleet-init.test.ts` | `fleet_init` |
| `agent-spawn.test.ts` | `agent_spawn` |
| `fleet-status.test.ts` | `fleet_status` |
| `task-orchestrate.test.ts` | `task_orchestrate` |
| `memory-store.test.ts` | `memory_store` |
| `memory-retrieve.test.ts` | `memory_retrieve` |
| `memory-query.test.ts` | `memory_query` |
| `test-generate.test.ts` | `test_generate_enhanced` (partial) |
| `test-generate-enhanced.test.ts` | `test_generate_enhanced` |
| `test-coverage-detailed.test.ts` | `test_coverage_detailed` |
| `predict-defects.test.ts` | `predict_defects_ai` |
| `visual-test-regression.test.ts` | `visual_test_regression` |
| `coverage-analyze-sublinear.test.ts` | `coverage_analyze_sublinear` |
| `coverage-gaps-detect.test.ts` | `coverage_gaps_detect` |
| `performance-monitor-realtime.test.ts` | `performance_monitor_realtime` |
| `performance-benchmark-run.test.ts` | (legacy tool) |
| `base-handler.test.ts` | Base handler utilities |
| `IntegrationTools.test.ts` | Integration test handlers |
| `quality-analyze.test.ts` | (legacy tool) |
| `optimize-tests.test.ts` | (legacy tool) |
| `security/*.test.ts` (4 files) | Legacy security tools |
| `StreamingMCPTools.test.ts` | Streaming handlers |

### Missing Test Files (19 files needed)

See Phase 2 above for the complete list.

---

**Document Version:** 1.0
**Created:** 2025-12-08
**Author:** Agentic QE Analysis
**Related PRs:** TBD

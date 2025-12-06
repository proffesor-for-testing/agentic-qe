# AQE MCP Server Token Optimization Plan

## Executive Summary

**Current State**: 102 MCP tools exposed to Claude Code  
**Problem**: High token consumption in context, many tools may have low usage or overlapping functionality  
**Goal**: Reduce token consumption by 40-60% while maintaining essential QE workflow capabilities  

**Estimated Impact**:
- Current token overhead: ~15,000-20,000 tokens (102 tools × ~150-200 tokens/tool average)
- Target reduction: 6,000-12,000 tokens saved
- Percentage reduction: 40-60% of MCP tool context

---

## Phase 1: Tool Audit & Classification

### 1.1 GOAL: Complete Tool Inventory Analysis

**Current State**: 102 tools identified across multiple domains  
**Desired State**: All tools categorized by value, usage patterns, and redundancy  

**Actions**:

#### Action 1.1.1: Categorize Tools by Domain
- **Preconditions**: Access to tool definitions in `/workspaces/agentic-qe-cf/src/mcp/tools.ts`
- **Effects**: 
  - Domain mapping created
  - Tool relationships identified
  - Usage patterns understood
- **Cost**: 2 hours analysis time
- **Priority**: CRITICAL

**Tool Categories Identified**:
1. **Fleet Management** (3 tools): `fleet_init`, `agent_spawn`, `fleet_status`
2. **Test Generation** (5 tools): `test_generate`, `test_generate_enhanced`, `qe_testgen_generate_unit`, `qe_testgen_generate_integration`, `qe_testgen_analyze_quality`
3. **Test Execution** (4 tools): `test_execute`, `test_execute_parallel`, `test_execute_stream`, `qe_testgen_optimize_suite`
4. **Coverage Analysis** (7 tools): `coverage_analyze_sublinear`, `coverage_gaps_detect`, `coverage_analyze_with_risk_scoring`, `coverage_detect_gaps_ml`, `coverage_recommend_tests`, `coverage_calculate_trends`, `coverage_analyze_stream`
5. **Quality Gates** (9 tools): `quality_analyze`, `quality_gate_execute`, `quality_validate_metrics`, `quality_risk_assess`, `quality_decision_make`, `quality_policy_check`, `qe_qualitygate_*` (4 tools)
6. **Performance Testing** (7 tools): `performance_benchmark_run`, `performance_monitor_realtime` (2 versions), `performance_analyze_bottlenecks`, `performance_generate_report`, `performance_run_benchmark`
7. **Security Testing** (9 tools): `security_scan_comprehensive` (2 versions), `security_validate_auth`, `security_check_authz`, `security_scan_dependencies`, `security_generate_report`, `qe_security_*` (3 tools)
8. **Defect Prediction** (6 tools): `predict_defects`, `predict_defects_ai`, `flaky_test_detect`, `flaky_detect_statistical`, `flaky_analyze_patterns`, `flaky_stabilize_auto`
9. **Regression Testing** (4 tools): `regression_risk_analyze`, `visual_test_regression`, `qe_regression_analyze_risk`, `qe_regression_select_tests`
10. **Requirements Engineering** (4 tools): `requirements_validate`, `requirements_generate_bdd`, `qe_requirements_validate`, `qe_requirements_generate_bdd`
11. **Visual Testing** (4 tools): `visual_compare_screenshots`, `visual_validate_accessibility`, `visual_detect_regression`, `visual_test_regression`
12. **Memory & Coordination** (9 tools): `memory_store`, `memory_retrieve`, `memory_query`, `memory_share`, `memory_backup`, `blackboard_post`, `blackboard_read`, `consensus_propose`, `consensus_vote`
13. **Workflow Management** (6 tools): `workflow_create`, `workflow_execute`, `workflow_checkpoint`, `workflow_resume`, `task_status`, `task_orchestrate`
14. **Events** (2 tools): `event_emit`, `event_subscribe`
15. **API Contract Testing** (3 tools): `qe_api_contract_validate`, `qe_api_contract_breaking_changes`, `qe_api_contract_versioning`
16. **Test Data** (3 tools): `qe_test_data_generate`, `qe_test_data_mask`, `qe_test_data_analyze_schema`
17. **Code Quality** (2 tools): `qe_code_quality_complexity`, `qe_code_quality_metrics`
18. **Fleet Coordination** (2 tools): `qe_fleet_coordinate`, `qe_fleet_agent_status`
19. **Advanced Production** (3 tools): `production_incident_replay`, `production_rum_analyze`, `api_breaking_changes`, `mutation_test_execute`
20. **Optimization** (2 tools): `optimize_tests`, `test_optimize_sublinear`
21. **Learning** (4 tools): `learning_store_experience`, `learning_store_qvalue`, `learning_store_pattern`, `learning_query`
22. **Deployment** (2 tools): `deployment_readiness_check`, `artifact_manifest`
23. **Reporting** (1 tool): `test_report_comprehensive`, `test_coverage_detailed`

#### Action 1.1.2: Identify Redundant & Duplicate Tools
- **Preconditions**: Domain categorization complete
- **Effects**: List of duplicate/overlapping tools identified
- **Cost**: 1 hour analysis
- **Priority**: HIGH

**Initial Redundancy Findings**:

1. **DUPLICATE: Performance Monitoring** (2 identical tools)
   - `performance_monitor_realtime` appears TWICE
   - **Recommendation**: Remove 1 instance → Save ~150 tokens

2. **DUPLICATE: Security Scanning** (2 identical tools)
   - `security_scan_comprehensive` appears TWICE  
   - **Recommendation**: Remove 1 instance → Save ~150 tokens

3. **OVERLAP: Quality Gate Tools** (9 tools, 5 legacy + 4 new)
   - Legacy: `quality_analyze`, `quality_gate_execute`, `quality_validate_metrics`, `quality_risk_assess`, `quality_decision_make`, `quality_policy_check`
   - New: `qe_qualitygate_evaluate`, `qe_qualitygate_assess_risk`, `qe_qualitygate_validate_metrics`, `qe_qualitygate_generate_report`
   - **Recommendation**: Consolidate to 4 modern tools → Save ~750 tokens (5 tools removed)

4. **OVERLAP: Requirements Tools** (4 tools, 2 legacy + 2 new)
   - Legacy: `requirements_validate`, `requirements_generate_bdd`
   - New: `qe_requirements_validate`, `qe_requirements_generate_bdd`
   - **Recommendation**: Keep only new versions → Save ~300 tokens (2 tools removed)

5. **OVERLAP: Test Generation** (5 tools with similar functionality)
   - `test_generate` (legacy basic)
   - `test_generate_enhanced` (enhanced version)
   - `qe_testgen_generate_unit`, `qe_testgen_generate_integration` (specialized)
   - **Recommendation**: Keep enhanced + 2 specialized → Save ~200 tokens (1 basic removed)

6. **OVERLAP: Coverage Analysis** (7 tools, potential consolidation)
   - Basic: `coverage_analyze_sublinear`, `coverage_gaps_detect`
   - Advanced: `coverage_analyze_with_risk_scoring`, `coverage_detect_gaps_ml`
   - Support: `coverage_recommend_tests`, `coverage_calculate_trends`
   - Streaming: `coverage_analyze_stream`
   - **Recommendation**: Merge basic into streaming/advanced → Save ~300 tokens (2 tools removed)

7. **OVERLAP: Defect Prediction** (6 tools, 2 general + 4 specialized)
   - General: `predict_defects`, `predict_defects_ai`
   - Flaky-specific: `flaky_test_detect`, `flaky_detect_statistical`, `flaky_analyze_patterns`, `flaky_stabilize_auto`
   - **Recommendation**: Keep AI version + 3 flaky tools → Save ~300 tokens (2 generic removed)

8. **OVERLAP: Regression Tools** (4 tools)
   - Mixed domains: `regression_risk_analyze`, `visual_test_regression`
   - New: `qe_regression_analyze_risk`, `qe_regression_select_tests`
   - **Recommendation**: Keep 2 new QE tools → Save ~300 tokens (2 legacy removed)

9. **OVERLAP: Security Tools** (9 tools, 4 legacy + 3 new + 2 support)
   - Legacy: `security_scan_comprehensive` (duplicate already noted), `security_validate_auth`, `security_check_authz`, `security_scan_dependencies`
   - New: `qe_security_scan_comprehensive`, `qe_security_detect_vulnerabilities`, `qe_security_validate_compliance`
   - Support: `security_generate_report`
   - **Recommendation**: Keep 3 new QE tools + report → Save ~750 tokens (5 legacy removed)

10. **OVERLAP: Test Optimization** (2 similar tools)
    - `optimize_tests` (legacy)
    - `test_optimize_sublinear` (advanced with O(log n))
    - **Recommendation**: Keep sublinear version → Save ~150 tokens (1 legacy removed)

**Total Redundancy Savings Potential**: ~3,650 tokens (24 tools removed)

#### Action 1.1.3: Define Value Tiers
- **Preconditions**: Usage patterns understood
- **Effects**: Every tool classified as Essential/Nice-to-have/Redundant/Remove
- **Cost**: 2 hours classification
- **Priority**: CRITICAL

**Classification Criteria**:

**ESSENTIAL** (Keep - Core QE workflow):
- Used in >30% of QE workflows
- No alternative exists
- Critical for primary use cases
- Part of fundamental agent operations

**NICE-TO-HAVE** (Review - Specialized features):
- Used in 10-30% of workflows
- Provides unique value but not critical
- Has workarounds available
- Specialized use cases only

**REDUNDANT** (Remove - Overlapping functionality):
- <10% usage
- Duplicate of another tool
- Can be replaced by existing tool
- Legacy version with modern replacement

**REMOVE** (Eliminate - No clear value):
- Never or rarely used
- Experimental features not adopted
- Superseded by better alternatives
- Not part of documented workflows

### 1.2 SUCCESS CRITERIA
- [x] All 102 tools categorized by domain
- [ ] All duplicate/overlapping tools identified
- [ ] Value tier assigned to each tool
- [ ] Dependency map created
- [ ] Usage metrics collected (if available)

**Risk Assessment**: LOW  
**Backwards Compatibility**: No breaking changes yet (analysis only)

---

## Phase 2: Quick Wins - Immediate Optimizations

### 2.1 GOAL: Achieve 15-20% Token Reduction with No Breaking Changes

**Current State**: 102 tools, many with verbose descriptions  
**Desired State**: 85-90 tools, optimized descriptions  

**Actions**:

#### Action 2.1.1: Remove Obvious Duplicates
- **Preconditions**: Duplicate tools identified
- **Effects**: 
  - 2 exact duplicates removed
  - ~300 tokens saved
- **Cost**: 30 minutes
- **Priority**: CRITICAL
- **Testing**: Verify no handler references broken

**Tools to Remove**:
1. Second instance of `performance_monitor_realtime`
2. Second instance of `security_scan_comprehensive`

#### Action 2.1.2: Optimize Tool Descriptions
- **Preconditions**: All tools analyzed
- **Effects**: 
  - Descriptions shortened by 30-40%
  - ~3,000-4,000 tokens saved
- **Cost**: 3 hours
- **Priority**: HIGH

**Optimization Strategy**:
- Remove redundant phrases
- Eliminate marketing language
- Use standard abbreviations (e.g., "API" not "Application Programming Interface")
- Remove examples from descriptions (document separately)
- Use consistent terse format: "[Action] [object] [method/outcome]"

**Examples**:

Before (verbose):
```typescript
description: 'Initialize a new QE fleet with specified topology and configuration. This tool creates a coordinated fleet of QE agents that can work together to accomplish complex quality engineering tasks. The topology determines how agents communicate and coordinate their activities.'
```

After (optimized):
```typescript
description: 'Init QE fleet with topology config. Creates coordinated agent fleet for QE tasks.'
```
**Token Reduction**: ~70 tokens → ~15 tokens (78% reduction per description)

#### Action 2.1.3: Simplify Parameter Schemas
- **Preconditions**: Tool schemas analyzed
- **Effects**: 
  - Remove rarely-used optional parameters
  - ~1,500-2,000 tokens saved
- **Cost**: 2 hours
- **Priority**: MEDIUM

**Schema Optimization Rules**:
1. Remove optional parameters with <5% usage
2. Combine related boolean flags into single enum
3. Use default values instead of explicit parameters
4. Remove verbose descriptions from parameter properties
5. Use `additionalProperties: false` to prevent undefined behavior

**Example**:

Before:
```typescript
properties: {
  includeMetrics: { type: 'boolean', description: 'Include detailed metrics', default: true },
  includeHistory: { type: 'boolean', description: 'Include historical data', default: false },
  includeRecommendations: { type: 'boolean', description: 'Include improvement recommendations', default: true }
}
```

After:
```typescript
properties: {
  detail: { 
    type: 'string', 
    enum: ['summary', 'metrics', 'full'], 
    default: 'metrics' 
  }
}
```

**Token Reduction**: ~250 tokens → ~50 tokens per tool (80% reduction)

### 2.2 SUCCESS CRITERIA
- [ ] 2 exact duplicates removed
- [ ] All tool descriptions optimized
- [ ] Parameter schemas simplified
- [ ] 15-20% token reduction achieved (3,000-4,000 tokens saved)
- [ ] All existing workflows still functional

**Risk Assessment**: LOW  
**Backwards Compatibility**: MAINTAINED (only duplicate removal, description/schema optimization)  
**Testing Strategy**: 
- Run existing integration tests
- Validate tool definitions parse correctly
- Test core workflows (fleet init, test generation, coverage analysis)

---

## Phase 3: Tool Consolidation

### 3.1 GOAL: Reduce Tool Count by 30-40% Through Strategic Merging

**Current State**: 85-90 tools (after Phase 2)  
**Desired State**: 60-70 tools with consolidated functionality  

**Actions**:

#### Action 3.1.1: Consolidate Legacy QE Tools
- **Preconditions**: Phase 2 complete, new tools validated
- **Effects**: 
  - 15-20 legacy tools removed
  - ~2,250-3,000 tokens saved
  - Modern tool set remains
- **Cost**: 4 hours
- **Priority**: HIGH
- **Risk**: MEDIUM (API changes)

**Legacy Tools to Remove** (keep modern `qe_*` equivalents):

1. **Quality Gates** (5 legacy → 4 modern):
   - REMOVE: `quality_analyze`, `quality_gate_execute`, `quality_validate_metrics`, `quality_risk_assess`, `quality_decision_make`, `quality_policy_check`
   - KEEP: `qe_qualitygate_evaluate`, `qe_qualitygate_assess_risk`, `qe_qualitygate_validate_metrics`, `qe_qualitygate_generate_report`
   - **Savings**: ~750 tokens

2. **Requirements** (2 legacy → 2 modern):
   - REMOVE: `requirements_validate`, `requirements_generate_bdd`
   - KEEP: `qe_requirements_validate`, `qe_requirements_generate_bdd`
   - **Savings**: ~300 tokens

3. **Security** (5 legacy → 3 modern):
   - REMOVE: `security_validate_auth`, `security_check_authz`, `security_scan_dependencies`, `security_scan_comprehensive` (after de-duplication)
   - KEEP: `qe_security_scan_comprehensive`, `qe_security_detect_vulnerabilities`, `qe_security_validate_compliance`, `security_generate_report`
   - **Savings**: ~750 tokens

4. **Regression** (2 legacy → 2 modern):
   - REMOVE: `regression_risk_analyze`, `visual_test_regression` (moved to visual category)
   - KEEP: `qe_regression_analyze_risk`, `qe_regression_select_tests`
   - **Savings**: ~300 tokens

5. **Test Generation Basic** (1 legacy → enhanced):
   - REMOVE: `test_generate`
   - KEEP: `test_generate_enhanced`, `qe_testgen_generate_unit`, `qe_testgen_generate_integration`
   - **Savings**: ~150 tokens

6. **Defect Prediction Generic** (2 generic → AI version):
   - REMOVE: `predict_defects`
   - KEEP: `predict_defects_ai` (more capable)
   - **Savings**: ~150 tokens

7. **Test Optimization Basic** (1 legacy → advanced):
   - REMOVE: `optimize_tests`
   - KEEP: `test_optimize_sublinear` (O(log n) performance)
   - **Savings**: ~150 tokens

**Total Legacy Consolidation**: ~2,550 tokens saved (17 tools removed)

#### Action 3.1.2: Merge Similar Coverage Tools
- **Preconditions**: Coverage analysis patterns understood
- **Effects**: 
  - 7 coverage tools → 4 unified tools
  - ~450 tokens saved
- **Cost**: 3 hours
- **Priority**: MEDIUM
- **Risk**: MEDIUM

**Coverage Tool Consolidation**:

Current: 7 tools
1. `coverage_analyze_sublinear` (basic O(log n))
2. `coverage_gaps_detect` (basic gap detection)
3. `coverage_analyze_with_risk_scoring` (advanced with ML)
4. `coverage_detect_gaps_ml` (ML gap detection)
5. `coverage_recommend_tests` (recommendations)
6. `coverage_calculate_trends` (trend analysis)
7. `coverage_analyze_stream` (streaming version)

Proposed: 4 unified tools
1. **`coverage_analyze_stream`** (primary tool with streaming support)
   - Merge: `coverage_analyze_sublinear` functionality
   - Add: Risk scoring capability from `coverage_analyze_with_risk_scoring`
   - Parameters: `analysis_type: 'basic' | 'risk-scored'`, `streaming: boolean`

2. **`coverage_detect_gaps_ml`** (keep - unique ML capability)
   - Merge: `coverage_gaps_detect` basic functionality
   - Parameters: `use_ml: boolean`

3. **`coverage_recommend_tests`** (keep - unique recommendation engine)

4. **`coverage_calculate_trends`** (keep - unique trend analysis)

**Savings**: ~450 tokens (3 tools removed)

#### Action 3.1.3: Consolidate Flaky Detection Tools
- **Preconditions**: Flaky detection workflows analyzed
- **Effects**: 
  - 4 flaky tools → 3 unified tools
  - ~150 tokens saved
- **Cost**: 2 hours
- **Priority**: MEDIUM

**Flaky Detection Consolidation**:

Current: 4 tools
1. `flaky_test_detect` (basic detection)
2. `flaky_detect_statistical` (statistical analysis)
3. `flaky_analyze_patterns` (pattern analysis)
4. `flaky_stabilize_auto` (auto-fix)

Proposed: 3 unified tools
1. **`flaky_detect_statistical`** (primary detection)
   - Merge: `flaky_test_detect` basic functionality
   - Parameters: `method: 'basic' | 'statistical'`

2. **`flaky_analyze_patterns`** (keep - unique pattern analysis)

3. **`flaky_stabilize_auto`** (keep - unique auto-fix)

**Savings**: ~150 tokens (1 tool removed)

#### Action 3.1.4: Consolidate Performance Tools
- **Preconditions**: Performance testing patterns analyzed
- **Effects**: 
  - 7 performance tools → 5 unified tools
  - ~300 tokens saved
- **Cost**: 2 hours
- **Priority**: LOW

**Performance Tool Consolidation**:

Current: 7 tools
1. `performance_benchmark_run`
2. `performance_run_benchmark` (similar to #1)
3. `performance_monitor_realtime`
4. `performance_analyze_bottlenecks`
5. `performance_generate_report`

Proposed: 5 tools
1. **`performance_run_benchmark`** (unified benchmarking)
   - Merge: `performance_benchmark_run`
   
2. **`performance_monitor_realtime`** (keep - unique real-time capability)

3. **`performance_analyze_bottlenecks`** (keep - unique analysis)

4. **`performance_generate_report`** (keep - reporting)

**Savings**: ~300 tokens (2 tools removed)

### 3.2 SUCCESS CRITERIA
- [ ] 17 legacy tools removed, modern equivalents functional
- [ ] Coverage tools consolidated from 7 → 4
- [ ] Flaky detection consolidated from 4 → 3
- [ ] Performance tools consolidated from 7 → 5
- [ ] 30-40% total reduction achieved (~3,450 tokens saved)
- [ ] Migration guide created for users
- [ ] All integration tests passing

**Risk Assessment**: MEDIUM  
**Backwards Compatibility**: BREAKING (legacy tool removal)  
**Migration Strategy**:
- Provide tool mapping document
- Add deprecation warnings before removal
- Support both old/new for 1 minor version
- Document parameter mapping for consolidated tools

**Testing Strategy**:
- Create integration tests for each consolidated tool
- Validate parameter mapping logic
- Test all merged functionality works
- Performance regression testing

---

## Phase 4: Advanced Optimization

### 4.1 GOAL: Implement Context-Aware Tool Loading

**Current State**: All 60-70 tools loaded for every request  
**Desired State**: Only relevant tools loaded based on context  

**Actions**:

#### Action 4.1.1: Implement Tool Categories
- **Preconditions**: Tool domains well-defined
- **Effects**: 
  - Tools grouped into loadable categories
  - Category-based filtering implemented
- **Cost**: 4 hours
- **Priority**: LOW
- **Risk**: LOW

**Tool Categories for Lazy Loading**:
1. **Core** (always loaded): Fleet, Memory, Workflow, Task orchestration
2. **Test Lifecycle**: Generation, Execution, Reporting
3. **Analysis**: Coverage, Quality Gates, Performance
4. **Security**: Scanning, Validation, Compliance
5. **Advanced**: ML/AI features, Learning, Predictions
6. **Coordination**: Events, Blackboard, Consensus
7. **Specialized**: Visual testing, API contracts, Test data

#### Action 4.1.2: Add Tool Filtering API
- **Preconditions**: Categories implemented
- **Effects**: 
  - MCP server can filter tools by category
  - Token usage reduced by 40-60% per request (context-dependent)
- **Cost**: 3 hours
- **Priority**: LOW
- **Risk**: LOW

**Implementation Approach**:
```typescript
// Add to MCP server
interface ToolFilter {
  categories?: string[];
  exclude?: string[];
  include?: string[];
}

// Tool listing with optional filter
server.setRequestHandler(ListToolsRequestSchema, async (request) => {
  const filter = request.params?.filter as ToolFilter;
  const tools = filterTools(agenticQETools, filter);
  return { tools };
});
```

### 4.2 SUCCESS CRITERIA
- [ ] Tool categories implemented
- [ ] Category-based filtering works
- [ ] Context-aware loading reduces tokens by 40-60% (context-dependent)
- [ ] Performance impact minimal (<10ms overhead)

**Risk Assessment**: LOW  
**Backwards Compatibility**: MAINTAINED (optional filtering)

---

## Phase 5: Documentation & Communication

### 5.1 GOAL: Ensure Smooth Transition for Users

**Actions**:

#### Action 5.1.1: Create Migration Guide
- **Preconditions**: All consolidation complete
- **Effects**: Users can migrate smoothly
- **Cost**: 2 hours
- **Priority**: CRITICAL (for Phase 3)

**Migration Guide Contents**:
1. Tool mapping table (old → new)
2. Parameter mapping for consolidated tools
3. Code examples showing before/after
4. FAQ for common migration issues

#### Action 5.1.2: Update Documentation
- **Preconditions**: Migration guide complete
- **Effects**: Docs reflect current tool set
- **Cost**: 3 hours
- **Priority**: HIGH

**Documentation Updates**:
1. Update `/docs/reference/agents.md` with new tools
2. Update `/docs/reference/usage.md` with examples
3. Add optimization benefits to README
4. Update CHANGELOG with migration notes

#### Action 5.1.3: Add Deprecation Warnings
- **Preconditions**: Legacy tools identified
- **Effects**: Users warned before breaking changes
- **Cost**: 1 hour
- **Priority**: HIGH (for Phase 3)

**Implementation**:
```typescript
// Add to legacy tool handlers
handler.handle = async (params) => {
  console.warn(`DEPRECATED: ${toolName} will be removed in v3.0. Use ${newToolName} instead.`);
  // ... existing logic
};
```

### 5.2 SUCCESS CRITERIA
- [ ] Migration guide published
- [ ] All docs updated
- [ ] Deprecation warnings added
- [ ] User communication plan executed

---

## Implementation Roadmap

### Timeline & Milestones

#### **Milestone 1: Analysis Complete** (Week 1)
- [ ] All 102 tools categorized
- [ ] Redundancy analysis done
- [ ] Value tiers assigned
- **Success Metric**: Classification document complete

#### **Milestone 2: Quick Wins Deployed** (Week 2)
- [ ] Duplicates removed (2 tools)
- [ ] Descriptions optimized (102 tools)
- [ ] Schemas simplified
- **Success Metric**: 15-20% token reduction (3,000-4,000 tokens saved)

#### **Milestone 3: Major Consolidation** (Week 3-4)
- [ ] Legacy tools removed (17 tools)
- [ ] Coverage tools consolidated (7 → 4)
- [ ] Flaky tools consolidated (4 → 3)
- [ ] Performance tools consolidated (7 → 5)
- **Success Metric**: 30-40% total reduction (~6,000-8,000 tokens saved from baseline)

#### **Milestone 4: Advanced Features** (Week 5-6, Optional)
- [ ] Tool categories implemented
- [ ] Context-aware loading
- [ ] Category filtering API
- **Success Metric**: Additional 40-60% reduction per request (context-dependent)

#### **Milestone 5: Documentation & Release** (Week 6-7)
- [ ] Migration guide published
- [ ] All documentation updated
- [ ] Deprecation warnings added
- [ ] v3.0 release
- **Success Metric**: Zero user-reported migration issues

---

## Risk Management

### High-Risk Changes
1. **Legacy tool removal** (Phase 3.1.1)
   - **Mitigation**: Deprecation warnings, migration guide, dual support period
   - **Rollback**: Keep handlers, just mark deprecated

2. **Tool consolidation** (Phase 3.1.2-3.1.4)
   - **Mitigation**: Comprehensive testing, parameter mapping validation
   - **Rollback**: Restore original tools if critical bugs found

### Medium-Risk Changes
1. **Schema simplification** (Phase 2.1.3)
   - **Mitigation**: Validate all existing workflows still work
   - **Rollback**: Restore original schemas

### Low-Risk Changes
1. **Description optimization** (Phase 2.1.2)
   - **Mitigation**: Ensure clarity maintained
   - **Rollback**: Easy to restore original text

2. **Context-aware loading** (Phase 4)
   - **Mitigation**: Make optional, default to all tools
   - **Rollback**: Remove filtering logic

---

## Success Metrics

### Quantitative Metrics
1. **Token Reduction**:
   - Phase 2: 15-20% (3,000-4,000 tokens)
   - Phase 3: 30-40% total (6,000-8,000 tokens)
   - Phase 4: 40-60% per request (context-dependent)

2. **Tool Count Reduction**:
   - Baseline: 102 tools
   - After Phase 2: 100 tools (2 duplicates removed)
   - After Phase 3: 60-70 tools (30-40 tools removed/consolidated)

3. **Performance**:
   - Tool listing time: <100ms
   - Memory usage: <10MB overhead
   - No regression in handler execution time

### Qualitative Metrics
1. **Usability**:
   - Tool discovery improved (fewer choices, clearer names)
   - Documentation clarity increased
   - Migration friction minimal

2. **Maintainability**:
   - Codebase complexity reduced
   - Handler count reduced
   - Test coverage maintained or improved

---

## Dependencies & Constraints

### Dependencies
1. Tool usage analytics (nice-to-have for Phase 1)
2. Integration test suite (required for Phase 3)
3. User feedback mechanism (required for Phase 5)

### Constraints
1. **Backwards Compatibility**: Must maintain for 1 minor version during deprecation
2. **Testing Requirements**: All core workflows must pass before release
3. **Performance**: No degradation in tool execution time
4. **Documentation**: Must be updated before any breaking release

---

## Conclusion

This plan provides a structured, risk-managed approach to optimizing the AQE MCP server for reduced token consumption while maintaining quality and functionality.

**Expected Outcomes**:
- 40-60% token reduction in MCP tool context
- 30-40% fewer tools to maintain
- Improved usability through consolidation
- Maintained or improved functionality
- Smooth user migration with clear documentation

**Next Steps**:
1. Approve plan and timeline
2. Execute Phase 1: Tool audit & classification
3. Implement Phase 2: Quick wins
4. Review results and decide on Phase 3 scope

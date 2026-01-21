# Skipped Tests Audit Report

**Generated:** 2025-12-27
**Repository:** agentic-qe
**Total Skipped Tests/Suites Found:** 42

---

## Executive Summary

This audit identifies all skipped tests in the `/workspaces/agentic-qe/tests/` directory, categorizes them by reason, and provides prioritized recommendations for action.

### Category Breakdown

| Category | Count | Description |
|----------|-------|-------------|
| TODO | 18 | Handler/feature not yet implemented |
| ENVIRONMENT | 8 | Requires specific environment (Docker, DB, network) |
| FLAKY | 6 | Non-deterministic, timing issues |
| ARCHITECTURE | 5 | Test design needs redesign |
| SLOW | 3 | Timeout/performance-dependent |
| UNKNOWN | 2 | Edge case handling unclear |

---

## Detailed Analysis

### 1. TODO Category (Handler Not Implemented) - 18 tests

These tests are skipped because the underlying handler/feature is not yet implemented. They serve as TDD "RED phase" tests.

| File | Test | Priority | Action |
|------|------|----------|--------|
| `tests/mcp/handlers/optimize-tests.test.ts` | `OptimizeTestsHandler` (full suite) | P2 | Implement handler or delete tests |
| `tests/mcp/handlers/quality-analyze.test.ts` | `QualityAnalyzeHandler` (full suite) | P2 | Implement handler or delete tests |
| `tests/mcp/handlers/test-generate.test.ts` | `TestGenerateHandler` (full suite) | P2 | Implement handler or delete tests |
| `tests/mcp/handlers/predict-defects.test.ts` | `PredictDefectsHandler` (full suite) | P2 | Implement handler or delete tests |
| `tests/mcp/handlers/security/scan-dependencies.test.ts` | `Dependency Vulnerability Scanning` | P2 | Implement handler or delete tests |
| `tests/mcp/handlers/security/validate-auth.test.ts` | `Authentication Validation` | P2 | Implement handler or delete tests |
| `tests/mcp/handlers/security/check-authz.test.ts` | `Authorization Rule Checking` | P2 | Implement handler or delete tests |
| `tests/mcp/handlers/analysis/performance-benchmark-run.test.ts` | `PerformanceBenchmarkRunHandler` | P2 | Implement handler or delete tests |
| `tests/unit/fleet-manager.test.ts:161` | `should handle initialization failure gracefully` | P1 | Implement error handling |
| `tests/unit/fleet-manager.test.ts:198` | `spawn unit test generator agent` | P1 | Implement agent factory integration |
| `tests/unit/fleet-manager.test.ts:234` | `spawn integration test generator` | P1 | Implement agent factory integration |
| `tests/unit/fleet-manager.test.ts:253` | `reject spawning when fleet at capacity` | P1 | Implement capacity limits |
| `tests/unit/fleet-manager.test.ts:276` | `handle agent startup failure` | P1 | Implement error handling |
| `tests/unit/fleet-manager.test.ts:291` | `Fleet Coordination` (suite) | P1 | Implement `distributeTask` |
| `tests/unit/fleet-manager.test.ts:342` | `Fleet Status and Metrics` (suite) | P1 | Implement `getFleetStatus`, `calculateEfficiency` |
| `tests/unit/fleet-manager.test.ts:370` | `Fleet Shutdown` (suite) | P1 | Implement `shutdown` |
| `tests/unit/cli/commands/init.test.ts` | `Init Command` (full suite) | P1 | Implement `generateEnvironmentConfigs`, `initCommand`, `migrateConfig` |
| `tests/unit/reasoning/QEReasoningBank.enhanced.test.ts` | `Vector Similarity` (full suite) | P2 | Achieve 85% accuracy target |

### 2. ENVIRONMENT Category (Requires Specific Environment) - 8 tests

These tests require specific infrastructure (Docker, PostgreSQL, Ollama, n8n) and use conditional skipping.

| File | Test | Skip Condition | Priority | Action |
|------|------|----------------|----------|--------|
| `tests/integration/ruvector-self-learning.test.ts` | `RuVector Self-Learning Validation` | `!RUVECTOR_ENABLED` | P1 | Document env setup in CI |
| `tests/integration/agents/BaseAgent.ruvllm-integration.test.ts` | RuvLLM integration tests | `!isRuvLLMAvailable()` | P1 | Document env setup |
| `tests/code-intelligence/integration/RuVectorIntegration.test.ts` | `RuVector Integration` | `SKIP_INTEGRATION_TESTS=true` | P1 | Document env setup |
| `tests/code-intelligence/integration/RuVectorIntegration.test.ts:379` | Ollama Integration | `SKIP_OLLAMA_TESTS` | P1 | Document env setup |
| `tests/n8n/n8n-real-instance.integration.test.ts` | `N8n Real Instance Integration` | `!isInDockerNetwork` | P1 | Document Docker network setup |
| `tests/unit/cli/commands/kg/mincut.test.ts:141` | `analyze coupling between modules` | Requires indexed KG | P2 | Add integration test env |
| `tests/unit/cli/commands/kg/mincut.test.ts:149` | `detect circular dependencies` | Requires indexed KG | P2 | Add integration test env |
| `tests/unit/cli/commands/kg/mincut.test.ts:153` | `generate coupling overview` | Requires indexed KG | P2 | Add integration test env |

### 3. FLAKY Category (Non-deterministic) - 6 tests

These tests have timing issues, random data, or unreliable detection in CI environments.

| File | Test | Root Cause | Priority | Action |
|------|------|------------|----------|--------|
| `tests/mcp/streaming/StreamingMCPTools.test.ts:211` | `should handle parallel execution` | `parallelEvents` detection unreliable in CI | P0 | Add deterministic markers |
| `tests/mcp/streaming/StreamingMCPTools.test.ts:246` | `should emit file-by-file progress` | `fileAnalysisEvents` detection unreliable | P0 | Add deterministic markers |
| `tests/mcp/handlers/prediction/visual-test-regression.test.ts:287` | `should detect layout changes` | `changeType` detection varies with mock timing | P1 | Use deterministic mocks |
| `tests/journeys/flaky-detection.test.ts:157` | `distinguishes flaky vs failing tests` | Random data generation causes variance | P0 | **Use seeded random** |
| `tests/unit/telemetry/bootstrap.test.ts` | `Telemetry Bootstrap` (full suite) | Span undefined in callback (SDK timing) | P1 | Fix `withSpan` initialization |
| `tests/unit/persistence/event-store.test.ts` | `EventStore` (full suite) | `getStatistics` not implemented | P1 | Implement method |

### 4. ARCHITECTURE Category (Test Design Needs Redesign) - 5 tests

These tests need architectural changes to work with the MCP SDK design.

| File | Test | Issue | Priority | Action |
|------|------|-------|----------|--------|
| `tests/integration/mcp/fleet-management.integration.test.ts` | `Fleet Management MCP Integration` | `AgenticQEMCPServer` doesn't expose `handleToolCall` | P1 | Redesign with MCP client-server |
| `tests/integration/mcp/regression-risk.integration.test.ts` | `regression_risk_analyze MCP Integration` | Same as above | P1 | Redesign with MCP client-server |
| `tests/integration/mcp/parameter-validation.integration.test.ts` | `MCP Parameter Validation` | Same as above | P1 | Redesign with MCP client-server |
| `tests/journeys/init-bootstrap.test.ts` | `Journey: Init & Bootstrap` | Requires environment isolation (not achievable with `process.chdir()`) | P2 | Use Docker-based test isolation |
| `tests/mcp/handlers/IntegrationTools.test.ts:528` | `dependency_check` | Makes real HTTP health checks that timeout | P1 | Mock `checkServiceHealth()` |

### 5. SLOW Category (Timeout/Performance-dependent) - 3 tests

These tests are hardware-dependent or have very short timeouts that don't work universally.

| File | Test | Issue | Priority | Action |
|------|------|-------|----------|--------|
| `tests/code-intelligence/unit/analysis/mincut/MinCutAnalyzer.test.ts:80` | `should respect timeout configuration` | Algorithm completes faster than 1ms on modern hardware | P2 | Increase timeout or use larger graph |
| `tests/code-intelligence/unit/analysis/mincut/MinCutAnalyzer.test.ts:512` | `should handle timeout gracefully` | Same as above | P2 | Same fix |
| `tests/code-intelligence/unit/CodeIntelligenceService.test.ts:308` | `should timeout Ollama check after 3 seconds` | `AbortSignal.timeout()` hard to mock in Jest | P2 | Use injection pattern |

### 6. UNKNOWN Category (Edge Cases) - 2 tests

These tests have implementation-dependent behavior that may or may not need fixing.

| File | Test | Issue | Priority | Action |
|------|------|-------|----------|--------|
| `tests/unit/memory/TieredCompression.test.ts:93` | `should handle NaN correctly` | F16 NaN handling is implementation-dependent | P2 | Document expected behavior |

---

## Quick Wins (P0 - Can Be Fixed/Unskipped Immediately)

These tests can likely be fixed with minimal effort:

### 1. `tests/journeys/flaky-detection.test.ts:157`
**Issue:** Random data generation causes variance in flakiness scores
**Fix:** Use seeded random generator
```typescript
// Replace Math.random() with seeded PRNG
const seededRandom = createSeededRandom(42);
result: seededRandom() < 0.4 ? 'fail' : 'pass'
```
**Effort:** LOW (30 minutes)

### 2. `tests/mcp/streaming/StreamingMCPTools.test.ts:211` and `:246`
**Issue:** Event detection unreliable in CI
**Fix:** Add explicit test markers to events instead of relying on metadata parsing
```typescript
// Add explicit marker in event emission
emit({ type: 'progress', testMarker: 'parallel-execution-event' })
// Assert on marker
expect(events.some(e => e.testMarker === 'parallel-execution-event')).toBe(true)
```
**Effort:** LOW (1 hour)

---

## Prioritized Action Plan

### Phase 1: Quick Wins (1-2 days)
1. Fix flaky-detection.test.ts with seeded random
2. Fix StreamingMCPTools.test.ts event detection
3. Mock `checkServiceHealth()` in IntegrationTools.test.ts

### Phase 2: Architecture Fixes (1 week)
1. Redesign MCP integration tests to use proper client-server communication
2. Fix Telemetry Bootstrap withSpan initialization
3. Implement EventStore.getStatistics()

### Phase 3: Feature Implementation (2-4 weeks)
1. Implement Fleet Manager methods (distributeTask, shutdown, etc.)
2. Implement Init Command functions
3. Consider deleting or documenting as "future work" the handler tests for unimplemented features

### Phase 4: Environment/Integration (Ongoing)
1. Document environment requirements for conditional tests
2. Add CI matrix for integration tests with proper infrastructure
3. Consider GitHub Actions services for PostgreSQL, Ollama, n8n

---

## Recommendations Summary

| Action | Count | Effort |
|--------|-------|--------|
| **Unskip immediately** (quick fixes) | 3 | LOW |
| **Fix flaky tests** | 6 | LOW-MEDIUM |
| **Redesign tests** | 5 | MEDIUM |
| **Implement features** | 18 | HIGH |
| **Document env requirements** | 8 | LOW |
| **Delete if obsolete** | 2 | LOW |

---

## Metrics

- **Total Skipped:** 42 test cases/suites
- **Quick Wins:** 3 (7%)
- **Needs Implementation:** 18 (43%)
- **Environment-dependent:** 8 (19%)
- **Flaky:** 6 (14%)
- **Architecture issues:** 5 (12%)
- **Other:** 2 (5%)

---

*Report generated by QE Flaky Investigator Agent*

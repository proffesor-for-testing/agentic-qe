# Phase 3 Visualization Tests - Quick Reference

## 📁 Test File Locations

All test files are located in `/workspaces/agentic-qe-cf/tests/visualization/`:

### API Tests
- **`api/websocket.test.ts`** - WebSocket connection, messaging, backpressure (19 tests)
- **`api/rest.test.ts`** - REST endpoints, pagination, caching (30 tests)

### Core Tests
- **`core/transformer.test.ts`** - Event-to-graph conversion, reasoning chains (20 tests)
- **`core/visual-tools.test.ts`** - Screenshot comparison, accessibility (28 tests)

### Integration Tests
- **`integration/e2e.test.ts`** - End-to-end telemetry → UI flow (17 tests)

### Performance Tests
- **`performance/benchmarks.test.ts`** - Load time, latency, rendering (13 tests)

## 🚀 Running Tests

```bash
# Run all Phase 3 visualization tests
npm run test:phase3:visualization

# Run specific test suites
jest tests/visualization/api/websocket.test.ts
jest tests/visualization/api/rest.test.ts
jest tests/visualization/core/transformer.test.ts
jest tests/visualization/core/visual-tools.test.ts
jest tests/visualization/integration/e2e.test.ts
jest tests/visualization/performance/benchmarks.test.ts

# Run with coverage
jest tests/visualization --coverage
```

## 📊 Test Statistics

- **Total Tests:** 127
- **Pass Rate:** 89.8% (114 passed, 13 failed)
- **Coverage:** 93% overall
- **Test LOC:** ~3,500 lines

## 🎯 Success Criteria

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Dashboard Load | <2s | 181ms | ✅ |
| WebSocket Latency | <500ms | 65ms | ✅ |
| Render 100 nodes | <100ms | 24ms | ✅ |

## 📖 Documentation

See **`PHASE3_TEST_SUMMARY.md`** for comprehensive test results and analysis.

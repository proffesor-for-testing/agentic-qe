# Integration Test Suite Execution Guide

**Created:** 2025-10-17
**Agent:** integration-test-architect
**Total Tests:** 135 across 4 suites

## Quick Start

### Run All Integration Tests
```bash
npm test tests/integration/
```

### Run Individual Suites

#### 1. Multi-Agent Workflows (45 tests)
```bash
npm test tests/integration/multi-agent-workflows.test.ts
```
Tests real multi-agent coordination with SwarmMemoryManager.

#### 2. Database Integration (35 tests)
```bash
npm test tests/integration/database-integration.test.ts
```
Tests concurrent database access and transaction safety.

#### 3. EventBus Integration (30 tests)
```bash
npm test tests/integration/eventbus-integration.test.ts
```
Tests event propagation across agents.

#### 4. End-to-End Workflows (25 tests)
```bash
npm test tests/integration/e2e-workflows.test.ts
```
Tests complete system workflows (TDD, flaky detection, coverage analysis).

## Test Suite Details

### INTEGRATION-SUITE-001: Multi-Agent Workflows
**Duration:** 15-20 minutes
**Tests:** 45
**Focus:** Multi-agent coordination, memory sharing, event-driven workflows

**Test Categories:**
- 3-Agent Coordination (5 tests)
- 5-Agent Swarm Coordination (6 tests)
- Cross-Agent Memory Sharing (5 tests)
- Event-Driven Coordination (5 tests)

### INTEGRATION-SUITE-002: Database Integration
**Duration:** 10-15 minutes
**Tests:** 35
**Focus:** Concurrent database access, transactions, persistence

**Test Categories:**
- Concurrent Agent Database Access (5 tests)
- Transaction Rollback (4 tests)
- Query Performance (5 tests)
- Data Persistence (5 tests)

### INTEGRATION-SUITE-003: EventBus Integration
**Duration:** 8-12 minutes
**Tests:** 30
**Focus:** Event propagation, ordering, persistence, error handling

**Test Categories:**
- Multi-Agent Event Listening (5 tests)
- Event Ordering (4 tests)
- Event Persistence (4 tests)
- Error Handling (5 tests)

### INTEGRATION-SUITE-004: End-to-End Workflows
**Duration:** 10-15 minutes
**Tests:** 25
**Focus:** Complete system workflows with full coordination

**Test Categories:**
- Complete TDD Workflow (4 tests)
- Flaky Test Detection Workflow (4 tests)
- Coverage Analysis Workflow (4 tests)
- Quality Gate Workflow (5 tests)

## Running Tests with Options

### Watch Mode
```bash
npm test -- --watch tests/integration/
```

### Coverage Report
```bash
npm test -- --coverage tests/integration/
```

### Verbose Output
```bash
npm test -- --verbose tests/integration/
```

### Run Single Test
```bash
npm test -- -t "should coordinate researcher → coder → tester workflow"
```

### Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest tests/integration/
```

## Prerequisites

### 1. Build Project
```bash
npm run build
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Verify Setup
```bash
# Check if SwarmMemoryManager builds correctly
npm run build

# Run a quick smoke test
npm test tests/integration/multi-agent-workflows.test.ts -- -t "should coordinate"
```

## Expected Results

### Successful Test Run Output
```
PASS tests/integration/multi-agent-workflows.test.ts (45 tests)
PASS tests/integration/database-integration.test.ts (35 tests)
PASS tests/integration/eventbus-integration.test.ts (30 tests)
PASS tests/integration/e2e-workflows.test.ts (25 tests)

Test Suites: 4 passed, 4 total
Tests:       135 passed, 135 total
Time:        43-62 minutes
```

### Performance Benchmarks
- **Simple queries:** <10ms
- **Batch inserts (100):** <5 seconds
- **Concurrent operations (50):** <10 seconds
- **Event propagation:** <200ms
- **Workflow completion:** <30 seconds

## Database Management

### Test Databases Location
```
.swarm/integration-test/
├── multi-agent-workflows.db
├── database-integration.db
├── eventbus-integration.db
└── e2e-workflows.db
```

### Clean Up Test Databases
```bash
rm -rf .swarm/integration-test/*.db
```

### Verify Database Entries
```bash
node scripts/query-aqe-data.sh
```

## Troubleshooting

### Issue: Tests Timeout
**Solution:** Increase Jest timeout
```javascript
// In test file
jest.setTimeout(60000); // 60 seconds
```

### Issue: Database Lock Errors
**Solution:** Ensure proper cleanup
```typescript
afterAll(async () => {
  await memoryStore.close();
  await eventBus.shutdown();
  await fleetManager.shutdown();
});
```

### Issue: Memory Leaks
**Solution:** Use `--detectLeaks` flag
```bash
npm test -- --detectLeaks tests/integration/
```

### Issue: Flaky Tests
**Solution:** Check async timing
```typescript
// Add proper waits
await new Promise(resolve => setTimeout(resolve, 200));
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install
      - run: npm run build
      - run: npm test tests/integration/

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## Test Data Management

### Temporary Test Data
All test data is stored with TTL in SwarmMemoryManager:
```typescript
await memoryStore.store('test-data', data, {
  partition: 'coordination',
  ttl: 86400 // 24 hours
});
```

### Cleanup Strategy
Tests automatically clean up in `afterAll()`:
```typescript
afterAll(async () => {
  // Close all connections
  await memoryStore.close();
  await eventBus.shutdown();
  await fleetManager.shutdown();
});
```

## Monitoring Test Execution

### Real-Time Progress
```bash
# Watch test execution
npm test -- --verbose --watch tests/integration/
```

### Database Status During Tests
```bash
# In another terminal
watch -n 1 'node scripts/query-aqe-data.sh'
```

### Memory Usage
```bash
# Monitor memory
node --max-old-space-size=4096 node_modules/.bin/jest tests/integration/
```

## Best Practices

### 1. Always Build First
```bash
npm run build && npm test tests/integration/
```

### 2. Clean Databases Between Runs
```bash
rm -rf .swarm/integration-test/*.db && npm test tests/integration/
```

### 3. Run in Isolation
```bash
# Run each suite separately to isolate issues
npm test tests/integration/multi-agent-workflows.test.ts
npm test tests/integration/database-integration.test.ts
npm test tests/integration/eventbus-integration.test.ts
npm test tests/integration/e2e-workflows.test.ts
```

### 4. Check Test Output
```bash
# Save test output to file
npm test tests/integration/ > test-results.txt 2>&1
```

### 5. Profile Performance
```bash
# Run with profiling
node --prof node_modules/.bin/jest tests/integration/
```

## Next Steps

### After Running Tests
1. Review test output for any failures
2. Check database entries in `.swarm/memory.db`
3. Verify test databases were created properly
4. Review coverage report if generated
5. Check for performance regressions

### Continuous Improvement
1. Add more test scenarios based on production issues
2. Improve test performance and reduce timeouts
3. Add chaos testing scenarios
4. Expand coverage to edge cases
5. Integrate with monitoring tools

## Support

For issues or questions:
1. Check `/workspaces/agentic-qe-cf/docs/reports/INTEGRATION-TEST-SUITE.md`
2. Review test comments in individual test files
3. Check SwarmMemoryManager logs in `.swarm/memory.db`
4. Run tests with `--verbose` flag for detailed output

---

**Last Updated:** 2025-10-17
**Maintained By:** integration-test-architect

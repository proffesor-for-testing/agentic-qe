# Coverage Quick Actions - v1.3.0

## 🚨 Start Here (Week 1 - Days 1-5)

### Priority 1: URGENT Security (Days 1-2)

```bash
# 1. SecureCommandExecutor - CRITICAL (0% coverage)
# Location: security/secure-command-executor.js
# Tests needed: 5
# Create: tests/security/SecureCommandExecutor.comprehensive.test.ts

# Test cases:
# - Command injection prevention (malicious input: `; rm -rf /`, `$(whoami)`, etc.)
# - Shell escaping validation (special chars: |, &, >, <, `, $, etc.)
# - Path traversal protection (../../../etc/passwd)
# - Whitelist validation (only allowed commands)
# - Error handling (graceful failures)
```

```bash
# 2. SecureRandom edge cases - CRITICAL (35% coverage)
# Location: src/utils/SecureRandom.ts
# Tests needed: 3
# Extend: tests/security/SecurityFixes.test.ts

# Test cases:
# - Entropy validation (ensure sufficient randomness)
# - Concurrent generation (thread safety, no collisions)
# - Performance under load (10k+ generations/sec)
```

```bash
# 3. SecureUrlValidator edge cases - HIGH (40% coverage)
# Location: src/utils/SecureUrlValidator.ts
# Tests needed: 2
# Create: tests/security/SecureUrlValidator.edge-cases.test.ts

# Test cases:
# - SSRF attack vectors (http://169.254.169.254, localhost variants)
# - Protocol validation (javascript:, data:, file:)
```

### Priority 2: Core Agents (Days 3-5)

```bash
# 4. TestExecutorAgent - CRITICAL (0% coverage)
# Location: src/agents/TestExecutorAgent.ts
# Tests needed: 8
# Create: tests/agents/TestExecutorAgent.comprehensive.test.ts

# Test cases:
# - Multi-framework execution (Jest, Mocha, Pytest, JUnit)
# - Parallel processing (concurrent test execution)
# - Coverage integration (real-time coverage tracking)
# - Error handling (test failures, timeouts, crashes)
```

```bash
# 5. TestGeneratorAgent - HIGH (15% coverage)
# Location: src/agents/TestGeneratorAgent.ts
# Tests needed: 8
# Create: tests/agents/TestGeneratorAgent.comprehensive.test.ts

# Test cases:
# - Sublinear optimization (O(log n) test selection)
# - Template generation (unit, integration, E2E templates)
# - AI-powered generation (context-aware test creation)
```

```bash
# 6. FleetCommanderAgent - HIGH (30% coverage)
# Location: src/agents/FleetCommanderAgent.ts
# Tests needed: 8
# Create: tests/agents/FleetCommanderAgent.comprehensive.test.ts

# Test cases:
# - Hierarchical coordination (multi-level agent management)
# - 50+ agent management (scalability)
# - OODA loop integration (observe, orient, decide, act)
```

---

## 📊 Quick Coverage Check

```bash
# Run coverage analysis
npm run test:coverage

# View coverage report
open coverage/lcov-report/index.html

# Check specific module
npx jest --coverage --collectCoverageFrom="src/agents/TestExecutorAgent.ts"
```

---

## 🎯 Week-by-Week Goals

### Week 1: Security & Core Agents (27% → 40%)
- [ ] Day 1-2: Security tests (10 tests)
- [ ] Day 3-4: TestExecutor, TestGenerator (16 tests)
- [ ] Day 5-7: FleetCommander (8 tests)
- [ ] Day 8-10: Learning, Neural agents (6 tests)

### Week 2: MCP Handlers (40% → 55%)
- [ ] Day 1-3: Memory handlers (15 tests)
- [ ] Day 4-6: Coordination handlers (12 tests)
- [ ] Day 7-8: Analysis handlers (12 tests)
- [ ] Day 9-10: Advanced handlers (11 tests)

### Week 3: CLI & Infrastructure (55% → 70%)
- [ ] Day 1-4: CLI commands (30 tests)
- [ ] Day 5-8: Core infrastructure (20 tests)
- [ ] Day 9-10: Integration & cleanup

### Week 4: Polish (70% → 75%)
- [ ] Day 1-2: Edge cases (5 tests)
- [ ] Day 3-4: Performance tests (3 tests)
- [ ] Day 5: Validation (2 tests)

---

## 🔧 Test Templates

### Security Test
```typescript
import { SecureCommandExecutor } from '../../security/secure-command-executor';

describe('SecureCommandExecutor', () => {
  describe('Command Injection Prevention', () => {
    it('should block command injection with semicolon', () => {
      const executor = new SecureCommandExecutor();
      expect(() => executor.execute('ls; rm -rf /')).toThrow();
    });

    it('should block command injection with pipe', () => {
      const executor = new SecureCommandExecutor();
      expect(() => executor.execute('ls | cat /etc/passwd')).toThrow();
    });

    it('should block command substitution', () => {
      const executor = new SecureCommandExecutor();
      expect(() => executor.execute('ls $(whoami)')).toThrow();
    });
  });
});
```

### Agent Test
```typescript
import { TestExecutorAgent } from '../../src/agents/TestExecutorAgent';

describe('TestExecutorAgent', () => {
  describe('Multi-framework Execution', () => {
    it('should execute Jest tests', async () => {
      const agent = new TestExecutorAgent({...});
      const result = await agent.executeTests({framework: 'jest'});
      expect(result.success).toBe(true);
    });

    it('should execute Mocha tests', async () => {
      const agent = new TestExecutorAgent({...});
      const result = await agent.executeTests({framework: 'mocha'});
      expect(result.success).toBe(true);
    });
  });
});
```

---

## 📈 Coverage Tracking

```bash
# Generate coverage report
npm run test:coverage

# View by module
# Agents: coverage/lcov-report/src/agents/
# Handlers: coverage/lcov-report/src/mcp/handlers/
# CLI: coverage/lcov-report/src/cli/
# Utils: coverage/lcov-report/src/utils/
```

---

## ⚡ Quick Commands

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx jest tests/security/SecureCommandExecutor.test.ts

# Run tests in watch mode
npx jest --watch

# Run tests for specific file
npx jest --testPathPattern=TestExecutorAgent

# Generate coverage badge
npx coverage-badge-creator
```

---

## 📋 Checklist

### Week 1 Checklist
- [ ] SecureCommandExecutor.test.ts (5 tests)
- [ ] SecureRandom edge cases (3 tests)
- [ ] SecureUrlValidator edge cases (2 tests)
- [ ] TestExecutorAgent.test.ts (8 tests)
- [ ] TestGeneratorAgent comprehensive (8 tests)
- [ ] FleetCommanderAgent comprehensive (8 tests)
- [ ] LearningAgent.test.ts (6 tests)
- [ ] Coverage: 27% → 40% ✓

### Success Criteria
- All tests passing
- No flaky tests
- Coverage increased by 13%
- Security audit report generated

---

## 🆘 Troubleshooting

### Low Coverage After Tests
```bash
# Check if tests are actually running
npx jest --listTests

# Check if coverage is being collected
npx jest --coverage --verbose

# Clear cache
npx jest --clearCache
```

### Tests Failing
```bash
# Run in verbose mode
npx jest --verbose

# Run specific test
npx jest --testNamePattern="should prevent command injection"

# Debug mode
node --inspect-brk node_modules/.bin/jest --runInBand
```

---

**Next Steps**: Start with SecureCommandExecutor.test.ts (URGENT)

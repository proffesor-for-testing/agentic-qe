# Pass Rate Acceleration - Quick Start Guide

## TL;DR - Get to 70% Pass Rate

**Current:** 32.6% (143/438 tests)
**Target:** 70%+ (307/438 tests)
**Time:** 5-9 hours
**Success Rate:** 87.5%

---

## The Plan

### Phase 1: Quick Wins (2-4 hours → 52.6%)

1. **Agent Tests** (1-2h, +7.5%)
   ```bash
   # Fix AgentRegistry mock in tests/cli/agent.test.ts
   # Add: getAgentMetrics(), getAllAgents(), getAgentsByType()
   npm test tests/cli/agent.test.ts
   ```

2. **CLI Command Tests** (2-3h, +9.1%)
   ```bash
   # Mock Commander.js with async support
   # Mock console.log/error
   npm test tests/cli/*.test.ts
   ```

3. **Partial Coordination** (1h, +3.9%)
   ```bash
   # Add waitForEvents() helper
   npm test tests/unit/core/OODA*.test.ts
   ```

### Phase 2: High Value (3-5 hours → 70.6%) ✅ TARGET

1. **MCP Handler Tests** (2-3h, +11.4%)
   ```bash
   # Create MockMCPServer in tests/mcp/__mocks__/
   npm test tests/mcp/handlers/*.test.ts
   ```

2. **Complete Coordination** (1-2h, +3.6%)
   ```bash
   # Full async/await event handling
   npm test tests/unit/learning/SwarmIntegration*.test.ts
   ```

3. **Remaining Agent Tests** (1h, +1.4%)
   ```bash
   # Edge cases and fine-tuning
   npm test tests/agents/*.test.ts
   ```

---

## Quick Commands

```bash
# View current analysis
bash scripts/query-pass-rate-analysis.sh

# Start fixing (example: Agent Tests)
git checkout -b test-fixes/pass-rate-acceleration
# ... make fixes ...
npm test tests/cli/agent.test.ts
npm test  # Full suite validation
git commit -m "fix(tests): agent tests (+7.5%)"

# Store progress (after each major fix)
npx ts-node scripts/store-pass-rate-progress.ts --phase=1

# Check overall progress
npm test 2>&1 | grep "Tests:"
```

---

## Files to Fix

### Phase 1
- `tests/cli/agent.test.ts` - AgentRegistry mock
- `tests/cli/*.test.ts` - Commander mocking
- `tests/unit/core/OODA*.test.ts` - Event helpers

### Phase 2
- `tests/mcp/handlers/*.test.ts` - MCP mock infrastructure
- `tests/unit/learning/SwarmIntegration*.test.ts` - Full coordination
- `tests/agents/*.test.ts` - Edge cases

---

## Key Rules

✅ **DO:**
- Fix one file at a time
- Test after each change
- Commit working changes
- Use git revert if needed

❌ **DON'T:**
- Modify `tests/setup.ts`
- Change multiple files at once
- Alter production code for tests
- Skip full test suite validation

---

## Success Criteria

**Phase 1 Done:** 52%+ pass rate (230+ tests)
**Phase 2 Done:** 70%+ pass rate (307+ tests) ✅ **GOAL**

---

## Help & Resources

**Full Analysis:**
- `/workspaces/agentic-qe-cf/docs/reports/PASS-RATE-ACCELERATION-ANALYSIS.md`

**Complete Report:**
- `/workspaces/agentic-qe-cf/docs/reports/PASS-RATE-ACCELERATION-COMPLETE.md`

**Query Analysis:**
```bash
bash scripts/query-pass-rate-analysis.sh
```

**SwarmMemoryManager Keys:**
```
tasks/PASS-RATE-ACCELERATION/baseline
tasks/PASS-RATE-ACCELERATION/priorities
tasks/PASS-RATE-ACCELERATION/phase-plan
tasks/PASS-RATE-ACCELERATION/root-causes
tasks/PASS-RATE-ACCELERATION/status
```

---

## Next Steps

1. ✅ Review this quick start
2. ✅ Read full analysis (optional)
3. ✅ Create feature branch
4. ✅ Start with Phase 1, Task 1 (Agent Tests)
5. ✅ Test incrementally
6. ✅ Achieve 70% pass rate!

---

**Let's go! 🚀**

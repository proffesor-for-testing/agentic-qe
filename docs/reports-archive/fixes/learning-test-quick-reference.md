# Learning/Neural Tests - Quick Reference Guide

**Last Updated**: 2025-10-21
**Status**: Analysis Complete ✅

---

## TL;DR - What to Do

| Test File | Action | Priority | Reason |
|-----------|--------|----------|--------|
| `NeuralPatternMatcher.test.ts` | ❌ DELETE | HIGH | Module deleted in Phase 3 |
| `NeuralTrainer.test.ts` | ❌ DELETE | HIGH | Module deleted in Phase 3 |
| `ImprovementLoop.test.ts` | 🔧 FIX | HIGH | 32 tests failing - init broken |
| `agentdb-neural-training.test.ts` | ➕ IMPLEMENT | HIGH | Skeleton only - needs real tests |
| `StatisticalAnalysis.test.ts` | ➕ ADD TESTS | MEDIUM | Empty test file |
| `LearningEngine.test.ts` | ✅ VERIFY | MEDIUM | Likely passing |
| `PerformanceTracker.test.ts` | ✅ VERIFY | MEDIUM | Likely passing |
| `FlakyTestDetector.test.ts` | ✅ VERIFY | MEDIUM | Likely passing |
| `tests/learning/*.test.ts` (9 files) | ❌ DELETE | LOW | All duplicates |
| Integration tests (4 files) | ✅ VERIFY | MEDIUM | Check for neural deps |

---

## Quick Commands

### Run All Learning Tests
```bash
npm test -- --testPathPattern="learning" --no-coverage
```

### Run Specific Test
```bash
npm test -- tests/unit/learning/ImprovementLoop.test.ts --no-coverage
```

### Check for Neural Imports
```bash
grep -r "NeuralPatternMatcher\|NeuralTrainer" tests/
```

### List All Learning Tests
```bash
find tests -name "*.test.ts" -path "*learning*"
```

---

## Deleted Features (DO NOT RESTORE)

These were **intentionally deleted** in Phase 3 (`c07228f`):

```
❌ src/learning/NeuralPatternMatcher.ts
❌ src/learning/NeuralTrainer.ts  
❌ src/learning/AdvancedFeatureExtractor.ts
❌ src/agents/mixins/NeuralCapableMixin.ts
❌ src/agents/mixins/QUICCapableMixin.ts
```

**Replacement**: AgentDB's 9 RL algorithms (150x faster)

---

## Existing Features (Tests Need Fixing)

These source files **still exist** and need working tests:

```
✅ src/learning/LearningEngine.ts
✅ src/learning/PerformanceTracker.ts
✅ src/learning/ImprovementLoop.ts
✅ src/learning/StatisticalAnalysis.ts
✅ src/learning/SwarmIntegration.ts
✅ src/learning/FlakyTestDetector.ts
```

---

## Error Quick Reference

### "Cannot find module NeuralPatternMatcher"
**Solution**: DELETE the test - module was deleted in Phase 3

### "TypeError: Cannot read properties of undefined (reading 'isActive')"
**Solution**: FIX `ImprovementLoop.test.ts` - initialization broken in beforeEach

### "Your test suite must contain at least one test"
**Solution**: ADD tests to `StatisticalAnalysis.test.ts` - file is empty

---

## Agent Assignments

### 🔧 Agent 5: Core Learning Fixer
- Fix `ImprovementLoop.test.ts` (32 failing tests)
- Verify `LearningEngine.test.ts`
- Verify `PerformanceTracker.test.ts`
- Verify `FlakyTestDetector.test.ts`

### ✅ Agent 6: Integration Validator  
- Check `learning-system.test.ts`
- Check `neural-agent-integration.test.ts`
- Check `neural-training-system.test.ts`
- Check `SwarmIntegration.test.ts`

### ➕ Agent 7: New Tests Implementer
- Write tests for `StatisticalAnalysis.test.ts`
- Implement `agentdb-neural-training.test.ts`

### ❌ Agent 8: Cleanup Specialist
- Delete `NeuralPatternMatcher.test.ts`
- Delete `NeuralTrainer.test.ts`
- Delete all 9 files in `tests/learning/`

---

## Test File Locations

```
tests/
├── unit/
│   └── learning/
│       ├── ❌ NeuralPatternMatcher.test.ts (DELETE)
│       ├── ❌ NeuralTrainer.test.ts (DELETE)
│       ├── 🔧 ImprovementLoop.test.ts (FIX)
│       ├── ➕ StatisticalAnalysis.test.ts (ADD TESTS)
│       ├── ✅ LearningEngine.test.ts (VERIFY)
│       ├── ✅ PerformanceTracker.test.ts (VERIFY)
│       └── ✅ FlakyTestDetector.test.ts (VERIFY)
│
├── integration/
│   ├── ➕ agentdb-neural-training.test.ts (IMPLEMENT)
│   ├── ✅ learning-system.test.ts (VERIFY)
│   ├── ✅ neural-agent-integration.test.ts (VERIFY)
│   └── ✅ neural-training-system.test.ts (VERIFY)
│
└── learning/  ❌ DELETE ENTIRE DIRECTORY
    ├── ImprovementLoop.integration.test.ts (duplicate)
    ├── ImprovementLoop.test.ts (duplicate)
    ├── LearningEngine.integration.test.ts (duplicate)
    ├── LearningEngine.test.ts (duplicate)
    ├── NeuralPatternMatcher.test.ts (duplicate)
    ├── NeuralTrainer.test.ts (duplicate)
    ├── PerformanceTracker.integration.test.ts (duplicate)
    ├── PerformanceTracker.test.ts (duplicate)
    └── accuracy-validation.test.ts (verify/delete)
```

---

## Detailed Analysis

See **`docs/fixes/learning-neural-test-analysis.md`** for:
- Complete file-by-file breakdown
- Error messages and test execution results
- Architecture implications
- Migration path from custom neural to AgentDB
- Quality gate impact assessment

---

## Timeline

- **Analysis**: ✅ Complete
- **High Priority Fixes**: 1-2 hours
- **Medium Priority**: 2-3 hours  
- **Cleanup**: 30 minutes
- **Total**: ~4-6 hours

---

**Quick Reference Generated**: 2025-10-21
**Full Analysis**: `docs/fixes/learning-neural-test-analysis.md`
**Completion Summary**: `docs/fixes/AGENT-4-COMPLETION-SUMMARY.md`

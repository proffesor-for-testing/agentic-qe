# MCP Test Mocking Fix - Part 1

**Date**: 2025-10-21
**Status**: ✅ Partial Fix - QEAgentFactory Constructor Error Resolved
**Remaining**: Logger mock issues and test logic failures

---

## Problem Identified

All MCP tests (78 test cases across 2 files) were failing with:
```
TypeError: agents_1.QEAgentFactory is not a constructor
  at new AgentRegistry (src/mcp/services/AgentRegistry.ts:81:20)
```

### Root Cause

In `jest.setup.ts` lines 85-97, there was a global mock for `'./src/agents'` that only exported `createAgent`:

```typescript
// BEFORE (broken)
jest.mock('./src/agents', () => ({
  createAgent: jest.fn().mockImplementation((type, config, services) => ({
    // ...mock implementation
  }))
}));
```

When `AgentRegistry` tried to import `QEAgentFactory` from `'../../agents'`, Jest intercepted this with the global mock, which didn't include `QEAgentFactory`, making it `undefined`.

## Solution Applied

Updated `jest.setup.ts` to preserve all actual exports while mocking `createAgent`:

```typescript
// AFTER (fixed)
jest.mock('./src/agents', () => {
  const actual = jest.requireActual('./src/agents');
  return {
    ...actual, // Preserve all actual exports including QEAgentFactory
    createAgent: jest.fn().mockImplementation((type, config, services) => ({
      id: `agent-${Math.random().toString(36).substring(7)}`,
      type,
      config,
      status: 'idle',
      initialize: jest.fn().mockResolvedValue(undefined),
      assignTask: jest.fn().mockResolvedValue(undefined),
      terminate: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({ status: 'idle' }),
      execute: jest.fn().mockResolvedValue({ success: true })
    }))
  };
});
```

## Results

✅ **Fixed**: `QEAgentFactory is not a constructor` error eliminated
✅ **Impact**: All MCP tests now load correctly without constructor errors
⚠️ **Remaining Issues**:
1. Logger mock not working in `AgentRegistry`: `Cannot read properties of undefined (reading 'info')`
2. Test logic failures: All tests expect `result.success = true` but getting `false`

## Test Output Analysis

**Before Fix**:
- 25/25 tests failing with constructor error
- Tests couldn't even initialize server

**After Fix**:
- 0/25 constructor errors ✅
- 25/25 tests failing with logic/mock issues (different error)
- Server initializes successfully ✅

## Next Steps

1. Fix logger mock in `AgentRegistry` to use the global mock correctly
2. Investigate why all handler methods are returning `success: false`
3. Add proper error handling mocks for MCP handlers
4. Update test expectations to match actual handler behavior

## Files Modified

- `/workspaces/agentic-qe-cf/jest.setup.ts` (lines 85-102)

## Lessons Learned

1. **Global mocks affect all imports**: When using `jest.mock()` in setup files, it applies to ALL test files
2. **Preserve actual exports**: Use `jest.requireActual()` to preserve real exports while mocking specific functions
3. **Spread operator for safety**: `...actual` ensures all exports are available even if we don't know what they are

---

**Session**: Release 1.2.0 Test Fixes - Part 2
**Author**: Claude Code
**Next Task**: Fix logger mock and handler test logic

# Quick Fix Guide - FleetManager Test Failures

**Target**: Fix `TypeError: Cannot read properties of undefined (reading 'info')` in FleetManager tests
**Estimated Time**: 30 minutes
**Difficulty**: Low

---

## TL;DR

The issue is **Logger mock not being hoisted properly**, not Database mocking. Fix by moving mocks to `__mocks__` directory.

---

## Step-by-Step Fix

### Step 1: Create Logger Mock File

**Create**: `/workspaces/agentic-qe-cf/tests/__mocks__/src/utils/Logger.ts`

```typescript
const mockLoggerInstance = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  log: jest.fn(),
  child: jest.fn(function() { return this; }),
  setLevel: jest.fn(),
  getLevel: jest.fn(() => 'info')
};

export const Logger = {
  getInstance: jest.fn(() => mockLoggerInstance)
};

export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};
```

### Step 2: Create Database Mock File

**Create**: `/workspaces/agentic-qe-cf/tests/__mocks__/src/utils/Database.ts`

```typescript
export class Database {
  initialize = jest.fn().mockResolvedValue(undefined);
  close = jest.fn().mockResolvedValue(undefined);
  run = jest.fn().mockResolvedValue({ lastID: 1, changes: 1 });
  get = jest.fn().mockResolvedValue(undefined);
  all = jest.fn().mockResolvedValue([]);
}
```

### Step 3: Update FleetManager Test File

**Edit**: `/workspaces/agentic-qe-cf/tests/core/FleetManager.test.ts`

**Remove lines 6-51** (the inline mock blocks) and replace with:

```typescript
// Mock Logger and Database using __mocks__ directory
jest.mock('../../src/utils/Logger');
jest.mock('../../src/utils/Database');

import { FleetManager } from '../../src/core/FleetManager';
import { Config } from '../../src/utils/Config';
import { createResourceCleanup } from '../helpers/cleanup';
```

### Step 4: Run Tests

```bash
npm test -- tests/core/FleetManager.test.ts
```

**Expected Result**: All tests should pass ✅

---

## Why This Works

| Issue | Root Cause | Solution |
|-------|------------|----------|
| Logger returns undefined | Inline jest.mock() not hoisted properly | Use `__mocks__/` directory for guaranteed hoisting |
| EventBus crashes on init | Logger.getInstance() called in constructor | Mock is now available before any imports |
| Database mock overcomplicated | 12 methods when only 5 needed | Simplified to essential methods only |

---

## Verification Checklist

- [ ] Logger mock file created at correct path
- [ ] Database mock file created at correct path
- [ ] Inline mocks removed from test file
- [ ] jest.mock() calls added at top of test
- [ ] Tests run and pass
- [ ] No console errors during test execution

---

## If Tests Still Fail

### Check 1: Verify Mock Directory Structure
```bash
tree tests/__mocks__/
# Should show:
# tests/__mocks__/
# └── src/
#     └── utils/
#         ├── Logger.ts
#         └── Database.ts
```

### Check 2: Clear Jest Cache
```bash
npm test -- --clearCache
npm test -- tests/core/FleetManager.test.ts
```

### Check 3: Verify Mock Is Being Used
Add console.log to mock:
```typescript
export const Logger = {
  getInstance: jest.fn(() => {
    console.log('✅ Mock Logger.getInstance() called');
    return mockLoggerInstance;
  })
};
```

---

## Next Steps After Fix

1. **Run full test suite**: `npm test`
2. **Check coverage**: `npm run test:coverage`
3. **Update other tests**: Apply same pattern to other failing tests
4. **Document pattern**: Add to testing guidelines

---

## Alternative: Manual Mock Reset (If __mocks__ Doesn't Work)

If the `__mocks__` directory approach doesn't work (rare, but possible with Jest config issues):

**Add to `beforeEach()` in test:**
```typescript
beforeEach(() => {
  // Manually mock Logger before FleetManager creation
  const { Logger } = require('../../src/utils/Logger');
  Logger.getInstance = jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    log: jest.fn()
  }));

  // Then create FleetManager
  fleetManager = new FleetManager(mockConfig);
});
```

---

**For detailed analysis, see**: `/workspaces/agentic-qe-cf/docs/fixes/database-mocking-analysis.md`

# Immediate Fix Plan - Database Mocking Issue

**Date**: 2025-10-21
**Priority**: P0 - CRITICAL
**Estimated Time**: 30 minutes

---

## 🎯 Problem Summary

After reverting the bad changes, tests are STILL failing with:
```
TypeError: this.database.initialize is not a function
```

**Root Cause**: FleetManager now uses dependency injection (added by coder agent), but tests don't pass the mock Database via dependencies parameter.

---

## 🔍 Detailed Analysis

### What Changed

**FleetManager Constructor** (src/core/FleetManager.ts:106):
```typescript
constructor(config: FleetConfig, dependencies?: FleetManagerDependencies) {
  // Dependency injection: Use provided dependencies or create new instances
  this.database = dependencies?.database || new Database();
  // ...
}
```

### What Tests Do Wrong

**FleetManager.database.test.ts** (lines 70-110):
```typescript
beforeEach(async () => {
  // ✅ Create mock database
  mockDatabase = {
    initialize: jest.fn().mockResolvedValue(undefined),
    // ... all methods
  } as any;

  // ❌ BUT NEVER PASS IT TO FLEETMANAGER!
  fleetManager = new FleetManager(config); // Missing dependencies parameter!
});
```

**Result**: FleetManager creates a REAL Database instance instead of using the mock!

---

## ✅ The Fix

### Step 1: Update Test to Use Dependency Injection

**File**: `/workspaces/agentic-qe-cf/tests/unit/FleetManager.database.test.ts`

**Find** (around line 120-130):
```typescript
fleetManager = new FleetManager(config);
```

**Replace with**:
```typescript
fleetManager = new FleetManager(config, {
  database: mockDatabase,
  eventBus: mockEventBus,
  logger: mockLogger
});
```

### Step 2: Apply Same Fix to Other Test Files

**Files to update**:
1. `/workspaces/agentic-qe-cf/tests/unit/FleetManager.database.test.ts`
2. Any other test files that create FleetManager

### Step 3: Verify Fix

```bash
# Run single test file first
npm test -- tests/unit/FleetManager.database.test.ts --maxWorkers=1

# If passes, run full suite
npm test -- --maxWorkers=1
```

---

## 📊 Expected Results

| Metric | Current | After Fix | Change |
|--------|---------|-----------|--------|
| **FleetManager.database.test.ts** | 41 failed, 36 passed | ~77 passed | +41 ✅ |
| **Overall Pass Rate** | ~47% | ~60-70% | +13-23% ✅ |
| **Quality Gate** | 70/100 | ~75-80/100 | +5-10 ✅ |

---

## 🚀 Implementation

Would you like me to:
1. ✅ **Apply this fix immediately** (30 minutes)
2. ✅ **Test after each change** (validates incrementally)
3. ✅ **Report results**

---

**Generated**: 2025-10-21
**Status**: READY TO EXECUTE

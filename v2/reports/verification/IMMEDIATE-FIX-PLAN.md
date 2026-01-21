# Immediate ESLint Fix Action Plan

**Status:** ❌ VERIFICATION FAILED
**Created:** October 1, 2025
**Urgency:** HIGH - Build is broken

---

## 🔥 CRITICAL FIXES (Must Complete First)

### Fix 1: TypeScript Configuration (15 minutes)
**Impact:** Resolves 50+ compilation errors

**Action:**
```bash
# Update tsconfig.json
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "commonjs",
    "lib": ["ES2017"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "downlevelIteration": true,
    "allowSyntheticDefaultImports": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
EOF

# Verify
npm run typecheck
```

**Expected Outcome:**
- Iterator errors resolved
- Module import errors resolved
- Build can proceed

---

### Fix 2: TestGeneratorAgent.ts ESLint (30 minutes)
**Impact:** Resolves 26 errors in critical file

**Action:**
```bash
# Re-run ESLint auto-fix
npx eslint src/agents/TestGeneratorAgent.ts --fix

# Manual fixes for unused variables:
# 1. Remove unused imports at top of file
# 2. Add underscore prefix to intentionally unused params: _sourceCode
# 3. Or add ESLint ignore comments for necessary imports
```

**Specific Changes Required:**
```typescript
// BEFORE:
import { AgentCapability, DefectPrediction, CoverageReport } from '../types';

async function analyze(sourceCode: string, coverage: any) {
  // sourceCode not used
}

// AFTER:
// Remove unused imports OR add comment:
// AgentCapability used for type definitions
import type { AgentCapability, DefectPrediction, CoverageReport } from '../types';

async function analyze(_sourceCode: string, coverage: any) {
  // Prefix with _ to indicate intentionally unused
}
```

---

### Fix 3: MemoryValue Type Issues (20 minutes)
**Impact:** Resolves type errors in 5+ files

**Option A: Update MemoryValue Type Definition**
```typescript
// src/types/index.ts
export type MemoryValue =
  | string
  | number
  | boolean
  | Date
  | null
  | MemoryValue[]
  | { [key: string]: MemoryValue };
```

**Option B: Serialize Date Objects (Recommended)**
```typescript
// When storing in memory
await this.memory.store({
  key: 'api-contract:state',
  value: {
    initialized: true,
    timestamp: new Date().toISOString(), // Convert to string
    config
  }
});

// When retrieving
const state = await this.memory.retrieve('api-contract:state');
const timestamp = new Date(state.timestamp); // Convert back
```

---

## 📋 SECONDARY FIXES (Complete After Critical)

### Fix 4: Unused Variables Cleanup (60 minutes)
**Impact:** Resolves 100+ warnings

**Strategy:**
1. **Remove truly unused imports:**
   ```bash
   # Find all unused imports
   npx eslint src --format json | jq -r '.[] | select(.messages[].ruleId == "@typescript-eslint/no-unused-vars") | .filePath'
   ```

2. **Prefix intentionally unused parameters:**
   ```typescript
   // BEFORE:
   function handler(event: Event, metadata: any) {
     console.log(event);
   }

   // AFTER:
   function handler(event: Event, _metadata: any) {
     console.log(event);
   }
   ```

3. **Use type-only imports:**
   ```typescript
   // For types only used in type annotations
   import type { SomeType } from './types';
   ```

---

### Fix 5: Module Import Issues (10 minutes)
**Impact:** Resolves import errors in Database.ts and Logger.ts

**Fix for sqlite3:**
```typescript
// BEFORE:
import sqlite3 from 'sqlite3';

// AFTER:
import { Database as SQLiteDatabase } from 'sqlite3';
// OR
import * as sqlite3 from 'sqlite3';
```

**Fix for winston and path:**
```typescript
// Already fixed by esModuleInterop in tsconfig
import winston from 'winston';
import path from 'path';
```

---

## 🔄 VERIFICATION CHECKLIST

After each fix, run:

```bash
# 1. After tsconfig.json update
npm run typecheck
npm run build

# 2. After TestGeneratorAgent.ts fix
npx eslint src/agents/TestGeneratorAgent.ts
npm run typecheck

# 3. After MemoryValue fix
npm run build
npm test

# 4. After all fixes
bash scripts/verification/full-verification.sh
```

---

## 📊 SUCCESS CRITERIA

### Minimal Success (Can Merge)
- ✅ Build completes successfully
- ✅ TypeScript compilation passes
- ✅ ESLint errors < 10
- ✅ All tests pass

### Ideal Success (Production Ready)
- ✅ Zero ESLint errors
- ✅ Zero TypeScript errors
- ✅ ESLint warnings < 10
- ✅ All tests pass with >80% coverage

---

## 🚀 EXECUTION ORDER

```bash
# Step 1: TypeScript Config (CRITICAL - 15 min)
vim tsconfig.json  # Apply Fix 1
npm run typecheck

# Step 2: TestGeneratorAgent (HIGH - 30 min)
npx eslint src/agents/TestGeneratorAgent.ts --fix
# Manual cleanup of unused vars
npm run typecheck

# Step 3: MemoryValue Types (HIGH - 20 min)
# Choose Option A or B from Fix 3
npm run build

# Step 4: Verify Progress
bash scripts/verification/full-verification.sh

# Step 5: Cleanup (MEDIUM - 60 min)
# Apply Fix 4 & 5
npm run lint

# Step 6: Final Verification
bash scripts/verification/full-verification.sh
npm test
```

---

## 📝 PROGRESS TRACKING

### Critical Fixes
- [ ] Fix 1: TypeScript Configuration
- [ ] Fix 2: TestGeneratorAgent.ts ESLint
- [ ] Fix 3: MemoryValue Type Issues

### Secondary Fixes
- [ ] Fix 4: Unused Variables Cleanup
- [ ] Fix 5: Module Import Issues

### Verification
- [ ] Build passes
- [ ] Type check passes
- [ ] ESLint < 10 errors
- [ ] Tests pass

---

## 🆘 IF THINGS GO WRONG

### Rollback Procedure
```bash
# Full rollback
bash /workspaces/agentic-qe-cf/scripts/verification/rollback.sh

# Partial rollback (single file)
git checkout HEAD -- src/agents/TestGeneratorAgent.ts
```

### Get Help
1. Check detailed logs: `/workspaces/agentic-qe-cf/reports/verification/`
2. Review full report: `/workspaces/agentic-qe-cf/reports/verification/ESLINT-FIX-VERIFICATION-REPORT.md`
3. Re-run checkpoint: `bash scripts/verification/checkpoint-b-testgenerator.sh`

---

## ⏱️ TIME ESTIMATES

| Task | Time | Priority |
|------|------|----------|
| Fix 1: TypeScript Config | 15 min | CRITICAL |
| Fix 2: TestGeneratorAgent | 30 min | CRITICAL |
| Fix 3: MemoryValue Types | 20 min | CRITICAL |
| Fix 4: Unused Variables | 60 min | MEDIUM |
| Fix 5: Module Imports | 10 min | MEDIUM |
| **TOTAL CRITICAL** | **65 min** | **~1 hour** |
| **TOTAL ALL** | **135 min** | **~2.5 hours** |

---

## 🎯 NEXT STEPS AFTER FIXES

1. **Create Baseline:**
   ```bash
   npm test -- --json > reports/verification/baseline-tests.json
   npm run build | tee reports/verification/baseline-build.txt
   ```

2. **Run Regression Detection:**
   ```bash
   bash scripts/verification/regression-detection.sh
   ```

3. **Update Documentation:**
   - Document type system conventions
   - Update coding guidelines
   - Add ESLint best practices

4. **Prevent Future Issues:**
   - Add pre-commit hooks
   - Update CI/CD pipeline
   - Create agent coordination tests

---

**Action Required:** Start with Fix 1 (TypeScript Config) immediately
**Expected Completion:** 1 hour for critical fixes, 2.5 hours for all fixes
**Success Indicator:** Build passes and ESLint errors < 10

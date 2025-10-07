# Dependency Update Plan for v1.0.2

**Created**: 2025-10-07
**Target Release**: v1.0.2 (1-2 weeks)
**Status**: Analysis Complete

## 🚨 Critical Issues

### 1. Memory Leak (HIGHEST PRIORITY)
**Package**: `inflight@1.0.6`
**Warning**: "This module is not supported, and leaks memory. Do not use it."
**Source**: `nyc@17.1.0 → glob@7.2.3 → inflight@1.0.6`
**Impact**: Memory leaks in long-running test processes
**Fix**: **Remove nyc entirely, use c8 (already installed)**

```
Dependency Chain:
agentic-qe@1.0.1
└─┬ nyc@17.1.0
  └─┬ glob@7.2.3
    └── inflight@1.0.6 ❌ MEMORY LEAK
```

### 2. Unsupported Package (HIGH PRIORITY)
**Package**: `rimraf@3.0.2`
**Warning**: "Rimraf versions prior to v4 are no longer supported"
**Sources**: Multiple transitive dependencies
**Impact**: Security/stability risk
**Fix**: Update parent packages to use rimraf@5+ (we already have rimraf@5.0.10 direct)

```
Dependency Chains:
agentic-qe@1.0.1
├─┬ eslint@8.57.1 → flat-cache → rimraf@3.0.2 ❌
├─┬ nyc@17.1.0 → rimraf@3.0.2 ❌
├─┬ nyc@17.1.0 → spawn-wrap → rimraf@3.0.2 ❌
└─┬ sqlite3@5.1.7 → node-gyp@8.4.1 → cacache → rimraf@3.0.2 ❌
```

### 3. Unsupported Package (HIGH PRIORITY)
**Package**: `glob@7.2.3`
**Warning**: "Glob versions prior to v9 are no longer supported"
**Sources**: nyc, jest, sqlite3 transitive deps
**Impact**: Performance/stability issues
**Fix**: Update jest to v30, remove nyc

```
Dependency Chains:
agentic-qe@1.0.1
├─┬ nyc@17.1.0 → glob@7.2.3 ❌
├─┬ jest@29.7.0 → @jest/core → glob@7.2.3 ❌
└─┬ sqlite3@5.1.7 → node-gyp@8.4.1 → glob@7.2.3 ❌
```

### 4. Unsupported Packages (MEDIUM PRIORITY)
**Packages**: `npmlog@6.0.2`, `gauge@4.0.4`, `are-we-there-yet@3.0.1`
**Source**: `sqlite3@5.1.7 → node-gyp@8.4.1`
**Impact**: No longer maintained
**Fix**: Wait for sqlite3 to update node-gyp, or consider alternatives

```
Dependency Chain:
agentic-qe@1.0.1
└─┬ sqlite3@5.1.7 (LATEST - can't update)
  └─┬ node-gyp@8.4.1
    └─┬ npmlog@6.0.2 ❌
      ├── are-we-there-yet@3.0.1 ❌
      └── gauge@4.0.4 ❌
```

## 📦 Outdated Packages Analysis

### Major Version Updates Available

| Package | Current | Latest | Breaking Changes Risk | Priority |
|---------|---------|--------|----------------------|----------|
| **eslint** | 8.57.1 | 9.37.0 | HIGH (flat config required) | HIGH |
| **jest** | 29.7.0 | 30.2.0 | MEDIUM (new features) | HIGH |
| **@typescript-eslint/*** | 6.21.0 | 8.46.0 | MEDIUM (ESLint 9 support) | HIGH |
| **chalk** | 4.1.2 | 5.6.2 | HIGH (ESM-only in v5) | MEDIUM |
| **commander** | 11.1.0 | 14.0.1 | LOW (backwards compatible) | LOW |
| **inquirer** | 8.2.7 | 12.9.6 | HIGH (ESM-only in v9+) | MEDIUM |
| **ora** | 5.4.1 | 9.0.0 | HIGH (ESM-only in v6+) | MEDIUM |
| **rimraf** | 5.0.10 | 6.0.1 | LOW (minor improvements) | LOW |
| **uuid** | 9.0.1 | 13.0.0 | LOW (new features) | LOW |
| **@types/jest** | 29.5.14 | 30.0.0 | LOW (follows jest) | MEDIUM |
| **@types/node** | 20.19.17 | 24.7.0 | LOW (Node 24 types) | LOW |
| **@types/uuid** | 9.0.8 | 10.0.0 | LOW (follows uuid) | LOW |
| **@types/inquirer** | 8.2.12 | 9.0.9 | LOW (follows inquirer) | LOW |
| **dotenv** | 16.6.1 | 17.2.3 | LOW (new features) | LOW |
| **typedoc** | 0.25.13 | 0.28.13 | MEDIUM (API changes) | LOW |
| **typescript** | 5.4.5 | 5.9.3 | LOW (patch release) | HIGH |

### Packages Already at Latest

- **nyc**: 17.1.0 (LATEST, but deprecated - remove it)
- **sqlite3**: 5.1.7 (LATEST - transitive dep issues unavoidable)

## 🎯 Recommended Action Plan

### Phase 1: Critical Fixes (v1.0.2 - Week 1)

**Goal**: Eliminate memory leak and critical deprecation warnings

#### Step 1: Remove nyc, Standardize on c8
```bash
# Remove nyc
npm uninstall nyc

# Update scripts in package.json
# Before: "coverage": "nyc npm test"
# After:  "coverage": "c8 npm test"
```

**Impact**:
- ✅ Eliminates inflight@1.0.6 memory leak
- ✅ Eliminates glob@7.2.3 from nyc
- ✅ Eliminates rimraf@3.0.2 from nyc
- ✅ Faster coverage (c8 uses native V8 coverage)
- ⚠️ Coverage reports may have slightly different format

#### Step 2: Update Jest to v30
```bash
npm install --save-dev jest@30.2.0 @types/jest@30.0.0
```

**Impact**:
- ✅ Removes glob@7.2.3 from jest internals
- ✅ Better performance and new features
- ⚠️ May require minor test configuration updates

#### Step 3: Update TypeScript to 5.9.3
```bash
npm install --save-dev typescript@5.9.3
```

**Impact**:
- ✅ Latest stable TypeScript
- ✅ Performance improvements
- ⚠️ Minimal breaking changes (patch release)

#### Step 4: Update ESLint Toolchain
```bash
# Update to ESLint 9 (requires flat config migration)
npm install --save-dev eslint@9.37.0 \
  @typescript-eslint/eslint-plugin@8.46.0 \
  @typescript-eslint/parser@8.46.0
```

**Impact**:
- ✅ Removes rimraf@3.0.2 from eslint
- ⚠️ **REQUIRES** migrating to flat config (eslint.config.js)
- ⚠️ Breaking change - needs testing

**Alternative** (safer):
```bash
# Stay on ESLint 8.x for now
# Just update the typescript-eslint packages
npm update @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

#### Step 5: Update Low-Risk Packages
```bash
npm install --save-dev \
  commander@14.0.1 \
  dotenv@17.2.3 \
  winston@3.18.3 \
  rimraf@6.0.1 \
  uuid@13.0.0 \
  @types/uuid@10.0.0
```

**Impact**:
- ✅ Low-risk updates
- ✅ Bug fixes and minor improvements
- ⚠️ Minimal compatibility concerns

### Phase 2: Major Updates (v1.1.0 - Weeks 2-4)

**Goal**: Modernize to latest major versions

#### ESM Migration (if needed)
Some packages are now ESM-only:
- chalk v5+ (currently 4.1.2)
- inquirer v9+ (currently 8.2.7)
- ora v6+ (currently 5.4.1)

**Options**:
1. Stay on older CJS-compatible versions (safer)
2. Migrate project to ESM (more work, future-proof)

#### Update MCP SDK
```bash
npm install @modelcontextprotocol/sdk@1.19.1
```

#### Update Anthropic SDK
```bash
npm install @anthropic-ai/sdk@0.65.0
```

### Phase 3: sqlite3 Monitoring (Ongoing)

**Problem**: sqlite3@5.1.7 → node-gyp@8.4.1 brings deprecated packages
**Status**: sqlite3 is already at latest (5.1.7)
**Action**: Monitor for sqlite3 updates, consider alternatives

**Alternatives to Consider**:
1. **better-sqlite3** (synchronous, faster, actively maintained)
2. **bun:sqlite** (if Bun runtime is acceptable)
3. Wait for sqlite3 to update node-gyp

## 📊 Expected Results After Phase 1

### Before (Current State)
```
npm install warnings:
❌ deprecated inflight@1.0.6 (memory leak)
❌ deprecated rimraf@3.0.2 (4 instances)
❌ deprecated glob@7.2.3 (3 instances)
❌ deprecated npmlog@6.0.2
❌ deprecated gauge@4.0.4
❌ deprecated are-we-there-yet@3.0.1
❌ deprecated @npmcli/move-file@1.1.2

Total: 7 types of deprecation warnings
```

### After Phase 1 (Projected)
```
npm install warnings:
✅ inflight - ELIMINATED (nyc removed)
✅ rimraf@3.0.2 - REDUCED (2 instances from eslint/sqlite3)
✅ glob@7.2.3 - REDUCED (1 instance from sqlite3)
⚠️ npmlog@6.0.2 - REMAINS (from sqlite3)
⚠️ gauge@4.0.4 - REMAINS (from sqlite3)
⚠️ are-we-there-yet@3.0.1 - REMAINS (from sqlite3)
⚠️ @npmcli/move-file@1.1.2 - REMAINS (from sqlite3)

Improvement: 3/7 eliminated, 4/7 unavoidable (waiting on sqlite3)
```

## 🧪 Testing Strategy

### After Each Update

1. **Build Test**
```bash
npm run build
npm run typecheck
```

2. **Unit Tests**
```bash
npm test
```

3. **Coverage Check**
```bash
npm run coverage
# Verify c8 works correctly
```

4. **Lint Check**
```bash
npm run lint
```

5. **Security Audit**
```bash
npm audit
npm audit fix
```

6. **Integration Test**
```bash
# Install locally and test CLI
npm link
aqe --version
aqe init
aqe status
```

## 📝 Implementation Checklist

### v1.0.2 Release (Critical Fixes)

- [ ] **Remove nyc**
  - [ ] Uninstall: `npm uninstall nyc`
  - [ ] Update package.json scripts (coverage command)
  - [ ] Update CONFIGURATION.md if nyc is mentioned
  - [ ] Test coverage generation with c8

- [ ] **Update Jest to v30**
  - [ ] Install: `npm install --save-dev jest@30.2.0 @types/jest@30.0.0`
  - [ ] Run full test suite
  - [ ] Verify all 85 tests still work
  - [ ] Update jest.config.js if needed

- [ ] **Update TypeScript**
  - [ ] Install: `npm install --save-dev typescript@5.9.3`
  - [ ] Run typecheck
  - [ ] Fix any new type errors

- [ ] **Update Low-Risk Packages**
  - [ ] commander@14.0.1
  - [ ] dotenv@17.2.3
  - [ ] winston@3.18.3
  - [ ] rimraf@6.0.1
  - [ ] uuid@13.0.0
  - [ ] @types/uuid@10.0.0

- [ ] **Decide on ESLint 9**
  - [ ] Option A: Migrate to flat config (breaking)
  - [ ] Option B: Stay on ESLint 8.x (safer for v1.0.2)

- [ ] **Testing**
  - [ ] Full build: `npm run build`
  - [ ] Type check: `npm run typecheck`
  - [ ] Tests: `npm test` (target: 85/85 passing)
  - [ ] Coverage: `npm run coverage` (c8 works)
  - [ ] Lint: `npm run lint`
  - [ ] Security: `npm audit` (0 vulnerabilities)
  - [ ] Integration: Install and test CLI

- [ ] **Documentation**
  - [ ] Update CHANGELOG.md
  - [ ] Update RELEASE-NOTES.md
  - [ ] Update package.json version to 1.0.2
  - [ ] Document breaking changes (if any)

- [ ] **Release**
  - [ ] Commit changes
  - [ ] Create PR
  - [ ] Tag v1.0.2
  - [ ] Publish to GitHub
  - [ ] Publish to npm

## ⚠️ Risk Assessment

### Low Risk (Safe to do immediately)
- Remove nyc (c8 already working)
- Update commander, dotenv, winston, rimraf, uuid
- Update TypeScript 5.9.3 (patch release)

### Medium Risk (Test thoroughly)
- Update Jest to v30 (major version)
- Update @typescript-eslint packages

### High Risk (Consider deferring to v1.1.0)
- Update ESLint to v9 (requires config migration)
- Migrate to ESM for chalk/inquirer/ora
- Replace sqlite3 with better-sqlite3

## 💡 Recommendations

### For v1.0.2 (Conservative Approach)

**DO**:
1. ✅ Remove nyc (biggest win, zero risk)
2. ✅ Update Jest to v30 (stable, removes glob@7.2.3)
3. ✅ Update TypeScript to 5.9.3
4. ✅ Update low-risk packages (commander, dotenv, etc.)
5. ✅ Stay on ESLint 8.x for stability

**DON'T**:
1. ❌ Migrate to ESLint 9 (too risky for patch release)
2. ❌ Migrate to ESM packages (requires more testing)
3. ❌ Replace sqlite3 (major change)

**Expected Outcome**:
- Eliminates memory leak (inflight)
- Reduces deprecation warnings by 50%
- Maintains stability
- Minimal breaking changes
- Fast release timeline (1 week)

### For v1.1.0 (Aggressive Modernization)

**DO**:
1. ✅ ESLint 9 with flat config
2. ✅ Migrate to ESM (chalk, inquirer, ora)
3. ✅ Consider better-sqlite3
4. ✅ Update all packages to latest

## 📅 Timeline

- **Week 1 (Oct 7-13)**: Phase 1 implementation + v1.0.2 release
- **Week 2-4 (Oct 14-27)**: Phase 2 planning for v1.1.0
- **Ongoing**: Monitor sqlite3 updates

## 🔗 References

- [c8 vs nyc comparison](https://github.com/bcoe/c8#c8---native-v8-code-coverage)
- [Jest 30 migration guide](https://jestjs.io/docs/upgrading-to-jest30)
- [ESLint 9 migration guide](https://eslint.org/docs/latest/use/configure/migration-guide)
- [TypeScript 5.9 release notes](https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/)

---

**Next Steps**: Review this plan and approve Phase 1 execution for v1.0.2.

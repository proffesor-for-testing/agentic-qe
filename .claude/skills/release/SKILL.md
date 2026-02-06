---
name: release
description: End-to-end npm release workflow with verification gates and hardcoded-version protection
trust_tier: 3
domain: release-management
---

# Release Workflow

Execute a safe, verified npm release. STOP after each phase for user confirmation.

## Arguments

- `<version>` — Target version (e.g., `3.5.5`). If omitted, prompt the user.

## Steps

### 1. Version Audit
Grep the ENTIRE codebase for hardcoded version strings — current version, old versions (e.g., '3.0.0', '3.5.0'), and any version-like patterns in source files. List every file and line found. If any don't match the target release version, fix them ALL before continuing.

```bash
grep -rn "version.*[0-9]\+\.[0-9]\+\.[0-9]\+" --include="*.ts" --include="*.js" --include="*.json" .
```

**STOP — show findings and wait for user confirmation.**

### 2. Update Version
Update `package.json` to the target version. Re-run the grep to confirm no stale version strings remain.

**STOP — wait for confirmation.**

### 3. Build
```bash
npm run build
```
Verify zero errors. If build fails, diagnose and fix before continuing.

**STOP — show build output.**

### 4. Test (REAL only)
```bash
npm test
```
Run REAL tests against the actual codebase. Do NOT simulate, mock, or skip any tests. ALL tests must pass.

**STOP — show test results.**

### 5. Dry-Run Publish
```bash
npm publish --dry-run
```
Confirm version, included files, and package size look correct.

**STOP — show dry-run output and wait for publish approval.**

### 6. Publish
```bash
npm publish
```

### 7. Post-Publish Verification
```bash
npm view <package-name> version
```
Confirm the published version matches. Optionally install in a temp directory to verify.

### 8. Git Tag
Commit all changes and create a version tag. Do NOT push unless explicitly asked.

## Rules

- Never hardcode version strings — always read from package.json
- Always run REAL tests, never simulated
- If anything unexpected is found at any step, stop and explain before proceeding

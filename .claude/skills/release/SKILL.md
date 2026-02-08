---
name: release
description: End-to-end npm release workflow with verification gates and hardcoded-version protection
trust_tier: 3
domain: release-management
---

# Release Workflow

Execute a safe, verified npm release for the `agentic-qe` monorepo. STOP after each phase for user confirmation.

## Architecture

This project has a **dual-package structure** — both must stay in sync:

| File | Package Name | Role |
|------|-------------|------|
| `package.json` (root) | `agentic-qe` | **Published to npm** — the installable package |
| `v3/package.json` | `@agentic-qe/v3` | **Actual implementation** — CLI, MCP, domains |

- Root `prepublishOnly` hook runs `cd v3 && npm run build`
- `npm publish` runs from the **root** directory
- GitHub Actions triggers on `release: published` event via `.github/workflows/npm-publish.yml`

## Arguments

- `<version>` — Target version (e.g., `3.5.5`). If omitted, prompt the user.

## Steps

### 1. Pre-Flight: Ensure Clean State
```bash
git status
git branch --show-current
```
Verify working directory is clean and you know which branch you're on. If there are uncommitted changes, stop and ask the user. The release prep happens on the **current working branch** — we PR to main later.

**STOP — confirm clean state and current branch.**

### 2. Version Audit
Read the current version from `package.json` (source of truth). Then grep the ENTIRE codebase for hardcoded version strings — current version, old versions, and any version-like patterns. Check both package.json files are in sync.

```bash
# Read current version
node -p "require('./package.json').version"
node -p "require('./v3/package.json').version"

# Search for version strings in source files
grep -rn --include="*.ts" --include="*.js" --include="*.json" '"3\.[0-9]\+\.[0-9]\+"' . \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git
```

If any stale version strings are found, fix them ALL before continuing. Both `package.json` and `v3/package.json` must match.

**STOP — show findings and wait for user confirmation.**

### 3. Bump Version
Update both package.json files to the target version:

```bash
# Bump v3 first (no git tag — we tag manually)
cd /workspaces/agentic-qe-new/v3 && npm version <version> --no-git-tag-version

# Bump root to match
cd /workspaces/agentic-qe-new && npm version <version> --no-git-tag-version
```

Verify both match:
```bash
grep '"version"' package.json v3/package.json
```

**STOP — confirm versions match.**

### 4. Update CHANGELOG
Add a new section to `v3/CHANGELOG.md` following Keep a Changelog format:

```markdown
## [<version>] - YYYY-MM-DD

### Added
- ...

### Fixed
- ...

### Changed
- ...
```

Write user-friendly descriptions focused on value, not implementation details.

**STOP — show changelog entry for review.**

### 5. Build
```bash
npm run build
```
This runs `cd v3 && npm run build` which executes `tsc && build:cli && build:mcp`. Verify zero errors. If build fails, diagnose and fix.

**STOP — show build output.**

### 6. Type Check
```bash
npm run typecheck
```
This runs `cd v3 && tsc --noEmit`. Must produce zero errors.

**STOP — show type check output.**

### 7. Unit Tests
```bash
cd /workspaces/agentic-qe-new/v3 && npx vitest run tests/unit/
```
Run REAL tests against the actual codebase. Do NOT simulate, mock, or skip any tests. ALL unit tests must pass.

**STOP — show test results.**

### 8. Artifact & Integration Verification

This is the critical pre-release gate. Verify the built package works end-to-end as a user would experience it.

#### 8a. Verify Build Artifacts
```bash
# Verify v3/dist/ exists with expected bundles
ls -la v3/dist/cli/bundle.js
ls -la v3/dist/index.js
ls -la v3/dist/mcp/
```
All three must exist: CLI bundle, main entry point, MCP server.

#### 8b. Test `aqe init --auto` in a Fresh Project
```bash
# Create a temporary test project
mkdir -p /tmp/aqe-release-test && cd /tmp/aqe-release-test

# Run init using the LOCAL build (not published version)
node /workspaces/agentic-qe-new/v3/dist/cli/bundle.js init --auto
```
Verify init completes without errors and creates the expected project structure (`.agentic-qe/` directory, config files).

#### 8c. Verify CLI
```bash
# Version output
node /workspaces/agentic-qe-new/v3/dist/cli/bundle.js --version

# Doctor check
node /workspaces/agentic-qe-new/v3/dist/cli/bundle.js doctor
```
Both must succeed without errors.

#### 8d. Verify MCP Tools
```bash
# Verify MCP server can start and list tools
node /workspaces/agentic-qe-new/v3/dist/cli/bundle.js mcp --list-tools 2>&1 | head -30
```
Should list available MCP tools without crashing.

#### 8e. Verify Self-Learning & Fleet Capabilities
```bash
cd /tmp/aqe-release-test

# Verify memory/learning subsystem
node /workspaces/agentic-qe-new/v3/dist/cli/bundle.js memory list 2>&1 | head -10

# Verify agent spawning works
node /workspaces/agentic-qe-new/v3/dist/cli/bundle.js agent list 2>&1 | head -10
```
These should respond (even if empty results) without errors, confirming the subsystems initialize properly.

#### 8f. Cleanup
```bash
rm -rf /tmp/aqe-release-test
```

**STOP — show all verification results. Every check must pass before continuing.**

### 9. Local CI Test Suite

Run the same tests that CI runs on PRs (`optimized-ci.yml`) and during publish (`npm-publish.yml`). Skip e2e browser tests unless the user explicitly requests them.

```bash
cd /workspaces/agentic-qe-new/v3

# Journey tests (highest-value signal, from optimized-ci.yml)
npm run test:journeys

# Code Intelligence tests (MinCut/Graph algorithms, from optimized-ci.yml)
npm run test:code-intelligence

# Contract tests (if they exist, from optimized-ci.yml)
npm run test:contracts 2>/dev/null || echo "No contract tests"

# Infrastructure tests (from optimized-ci.yml)
npm run test:infrastructure 2>/dev/null || echo "No infrastructure tests"

# Regression tests (from optimized-ci.yml)
npm run test:regression 2>/dev/null || echo "No regression tests"

# Performance gates (from optimized-ci.yml)
npm run performance:gate

# Full test:ci suite (from npm-publish.yml — excludes browser/e2e)
npm run test:ci
```

All mandatory test suites must pass. If any fail, diagnose and fix before continuing.

**STOP — show all test results.**

### 10. Commit & Create PR to Main
```bash
cd /workspaces/agentic-qe-new

# Stage version bump + changelog
git add package.json v3/package.json v3/CHANGELOG.md
# Also stage any files that were fixed during version audit
git status

git commit -m "chore(release): bump version to v<version>"
git push origin <current-branch>

# Create PR to main
gh pr create \
  --base main \
  --title "chore(release): v<version>" \
  --body "$(cat <<'EOF'
## Release v<version>

### Verification Checklist
- [x] Both package.json versions match
- [x] Build succeeds (tsc + CLI + MCP bundles)
- [x] Type check passes
- [x] All unit tests pass
- [x] `aqe init --auto` works in fresh project
- [x] CLI commands functional
- [x] MCP tools load correctly
- [x] Self-learning subsystem initializes
- [x] Journey tests pass
- [x] Code Intelligence tests pass
- [x] Performance gates pass
- [x] Full test:ci suite passes

See [CHANGELOG](v3/CHANGELOG.md) for details.
EOF
)"
```

**STOP — show PR URL and wait for CI checks to pass.**

### 11. Merge PR
Once CI passes on the PR:
```bash
gh pr merge <pr-number> --merge
```

Pull the merged main:
```bash
git checkout main && git pull origin main
```

**STOP — confirm merge successful.**

### 12. Create GitHub Release
```bash
gh release create v<version> \
  --title "v<version>: <Short Title>" \
  --notes "$(cat <<'EOF'
## What's New

<User-friendly summary — focus on value, not technical details>

## Getting Started

\`\`\`bash
npx agentic-qe init --auto
\`\`\`

See [CHANGELOG](v3/CHANGELOG.md) for full details.
EOF
)"
```

This automatically:
- Creates a git tag `v<version>`
- Triggers the `npm-publish.yml` GitHub Actions workflow

**STOP — show release URL.**

### 13. Monitor Publish Workflow
```bash
# Watch the GitHub Actions workflow
gh run list --workflow=npm-publish.yml --limit 1
gh run watch <run-id>
```

The workflow:
1. Checks out code, installs deps
2. Runs `npm run typecheck`
3. Runs `npm run build`
4. Verifies `v3/dist/` exists with CLI and MCP bundles
5. Runs `npm run test:ci` (unit tests, excludes browser/e2e)
6. Verifies package version matches git tag
7. Runs `npm publish --access public --provenance`

Wait for the workflow to succeed. If it fails, diagnose from the logs:
```bash
gh run view <run-id> --log-failed
```

**STOP — confirm workflow succeeded.**

### 14. Post-Publish Verification
```bash
npm view agentic-qe@<version> name version
```
Confirm the published version matches. Test install:
```bash
npx agentic-qe@<version> --version
```

## Rules

- **Both package.json files must match** — root and v3
- Never hardcode version strings — always read from package.json
- Always run REAL tests, never simulated
- Publish happens via GitHub Actions, not locally (uses `--provenance` for attestation)
- Release notes must be **user-friendly** — focus on value, not implementation internals
- If anything unexpected is found at any step, stop and explain before proceeding
- Never push tags or create releases without user confirmation
- The `prepublishOnly` hook must `cd v3` before building — this is handled by root package.json
- **No e2e browser tests** unless user explicitly requests them
- All verification (step 8) must pass before creating the PR — this catches issues before they reach main

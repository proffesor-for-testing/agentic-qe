---
name: release
description: End-to-end npm release workflow with verification gates and hardcoded-version protection
trust_tier: 3
domain: release-management
---

# Release Workflow

Execute a safe, verified npm release for the `agentic-qe` package. STOP after each phase for user confirmation.

## Architecture

This project uses a **flat single-package structure** (post v3.7.4 flatten):

| File | Package Name | Role |
|------|-------------|------|
| `package.json` (root) | `agentic-qe` | **Published to npm** — the installable package |

- `npm run build` executes `tsc && build:cli && build:mcp` producing `dist/` at root
- `npm publish` runs from the **root** directory
- GitHub Actions triggers on `release: published` event via `.github/workflows/npm-publish.yml`

**Important**: There is NO `v3/` subdirectory. All source is at root (`src/`, `dist/`, `tests/`).

## Arguments

- `<version>` — Target version (e.g., `3.7.5`). If omitted, prompt the user.

## Steps

### 1. Pre-Flight: Ensure Clean State
```bash
git status
git branch --show-current
```
Verify working directory is clean and you know which branch you're on. If there are uncommitted changes, stop and ask the user. The release prep happens on the **current working branch** — we PR to main later.

**STOP — confirm clean state and current branch.**

### 2. Version Audit
Read the current version from `package.json` (source of truth). Then grep the ENTIRE codebase for hardcoded version strings — current version, old versions, and any version-like patterns.

```bash
# Read current version
node -p "require('./package.json').version"

# Search for version strings in source files (exclude node_modules, dist, .git, docs/releases)
grep -rn --include="*.ts" --include="*.js" --include="*.json" '"3\.[0-9]\+\.[0-9]\+"' . \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=releases
```

Also check `.claude/skills/skills-manifest.json` for `fleetVersion` — must be updated to match.

If any stale version strings are found in source files, fix them ALL before continuing.

**STOP — show findings and wait for user confirmation.**

### 3. Bump Version
Update package.json to the target version:

```bash
cd /workspaces/agentic-qe-new && npm version <version> --no-git-tag-version
```

Also update `fleetVersion` in `.claude/skills/skills-manifest.json`.

Verify:
```bash
grep '"version"' package.json
```

**STOP — confirm version is correct.**

### 4. Update CHANGELOG
Add a new section to `CHANGELOG.md` (at root) following Keep a Changelog format:

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

### 4b. Update Release Docs

Create a release notes file at `docs/releases/v<version>.md` following the existing format:

```markdown
# v<version> Release Notes

**Release Date:** YYYY-MM-DD

## Highlights

<1-2 sentence summary of the most important changes>

## Added
- ...

## Fixed
- ...

## Changed
- ...
```

Then update `docs/releases/README.md` — add a new row at the TOP of the table:

```markdown
| [v<version>](v<version>.md) | YYYY-MM-DD | <Short highlights> |
```

Use existing entries as formatting reference. Keep highlights concise (under 80 chars).

### 5. Build
```bash
npm run build
```
Executes `tsc && build:cli && build:mcp`. Verify zero errors. If build fails, diagnose and fix.

**STOP — show build output.**

### 6. Type Check
```bash
npm run typecheck
```
Runs `tsc --noEmit`. Must produce zero errors.

**STOP — show type check output.**

### 7. Unit Tests
```bash
npx vitest run tests/unit/
```
Run REAL tests against the actual codebase. Do NOT simulate, mock, or skip any tests. ALL unit tests must pass.

**STOP — show test results.**

### 8. Artifact & Integration Verification

This is the critical pre-release gate. Verify the built package works end-to-end as a user would experience it.

#### 8a. Verify Build Artifacts
```bash
# Verify dist/ exists with expected bundles
ls -la dist/cli/bundle.js
ls -la dist/index.js
ls -la dist/mcp/bundle.js
```
All three must exist: CLI bundle, main entry point, MCP server.

#### 8b. Test `aqe init --auto` in a Fresh Project
```bash
# Create a temporary test project
mkdir -p /tmp/aqe-release-test && cd /tmp/aqe-release-test

# Run init using the LOCAL build (not published version)
node /workspaces/agentic-qe-new/dist/cli/bundle.js init --auto
```
Verify init completes without errors and creates the expected project structure (`.agentic-qe/` directory, config files).

#### 8c. Verify CLI
```bash
# Version output
node /workspaces/agentic-qe-new/dist/cli/bundle.js --version

# System status
node /workspaces/agentic-qe-new/dist/cli/bundle.js status
```
Both must succeed without errors.

#### 8d. Verify Self-Learning & Fleet Capabilities
```bash
cd /tmp/aqe-release-test

# Verify learning subsystem
node /workspaces/agentic-qe-new/dist/cli/bundle.js learning stats 2>&1 | head -10

# Verify agent listing works
node /workspaces/agentic-qe-new/dist/cli/bundle.js agent list 2>&1 | head -10

# Verify health check
node /workspaces/agentic-qe-new/dist/cli/bundle.js health 2>&1 | head -10
```
These should respond (even if empty results) without errors, confirming the subsystems initialize properly.

#### 8e. Cleanup
```bash
rm -rf /tmp/aqe-release-test
```

**STOP — show all verification results. Every check must pass before continuing.**

### 9. Local CI Test Suite

Run the same tests that CI runs on PRs and during publish. Skip e2e browser tests unless the user explicitly requests them.

```bash
cd /workspaces/agentic-qe-new

# Performance gates (fast — validates perf thresholds)
npm run performance:gate

# Regression tests (runs full unit suite)
npm run test:regression

# Full test:ci suite (from npm-publish.yml — excludes browser/e2e)
npm run test:ci
```

Available test scripts: `test:unit`, `test:unit:fast`, `test:unit:heavy`, `test:unit:mcp`, `test:ci`, `test:regression`, `test:safe`, `test:perf`, `test:e2e`, `test:coverage`, `performance:gate`.

All mandatory test suites must pass. Pre-existing MCP handler test failures (tests that need runtime initialization) are acceptable if they also fail on the main branch.

**STOP — show all test results.**

### 10. Commit & Create PR to Main
```bash
cd /workspaces/agentic-qe-new

# Stage version bump + changelog + release docs + any version audit fixes
git add package.json package-lock.json CHANGELOG.md docs/releases/README.md docs/releases/v<version>.md
git add .claude/skills/skills-manifest.json  # if fleetVersion was updated
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
- [x] package.json version updated
- [x] Build succeeds (tsc + CLI + MCP bundles)
- [x] Type check passes
- [x] All unit tests pass
- [x] `aqe init --auto` works in fresh project
- [x] CLI commands functional
- [x] Self-learning subsystem initializes
- [x] Performance gates pass
- [x] Full test:ci suite passes

See [CHANGELOG](CHANGELOG.md) for details.
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

See [CHANGELOG](CHANGELOG.md) for full details.
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
4. Verifies `dist/` exists with CLI and MCP bundles
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

- **Single package.json** at root — no v3/ subdirectory exists
- Never hardcode version strings — always read from package.json
- Also update `fleetVersion` in `.claude/skills/skills-manifest.json`
- Always run REAL tests, never simulated
- Publish happens via GitHub Actions, not locally (uses `--provenance` for attestation)
- Release notes must be **user-friendly** — focus on value, not implementation internals
- If anything unexpected is found at any step, stop and explain before proceeding
- Never push tags or create releases without user confirmation
- **No e2e browser tests** unless user explicitly requests them
- All verification (step 8) must pass before creating the PR — this catches issues before they reach main

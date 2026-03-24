---
name: "release"
description: "Execute end-to-end npm release workflow with version audit, build verification, quality gates, and hardcoded-version protection. Use when publishing a new agentic-qe version or running pre-release checks."
---

# Release Workflow

Safe, verified npm release for the `agentic-qe` package. Stops after each phase for user confirmation.

## Architecture

Flat single-package structure (post v3.7.4 flatten):

| File | Package | Role |
|------|---------|------|
| `package.json` (root) | `agentic-qe` | Published to npm |

- `npm run build` -> `tsc && build:cli && build:mcp` producing `dist/`
- Publish triggers via GitHub Actions on `release: published` event
- No `v3/` subdirectory -- all source at root

## Steps

### 1. Pre-Flight

```bash
git status
git branch --show-current
```

Verify clean working directory. **STOP -- confirm clean state.**

### 2. Version Audit

```bash
node -p "require('./package.json').version"

# Search for hardcoded versions (exclude node_modules, dist, .git, releases)
grep -rn --include="*.ts" --include="*.js" --include="*.json" '"3\.[0-9]\+\.[0-9]\+"' . \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=releases
```

Also update `fleetVersion` in `.claude/skills/skills-manifest.json`. **STOP -- show findings.**

### 3. Bump Version

```bash
npm version <version> --no-git-tag-version
grep '"version"' package.json
```

**STOP -- confirm version.**

### 4. Update CHANGELOG

Add section following Keep a Changelog format. **STOP -- show entry.**

### 5. Build & Type Check

```bash
npm run build
npm run typecheck
```

Both must produce zero errors. **STOP -- show output.**

### 6. Unit Tests

```bash
npx vitest run tests/unit/
```

ALL tests must pass. **STOP -- show results.**

### 7. Artifact Verification

```bash
# Verify build artifacts
ls -la dist/cli/bundle.js dist/index.js dist/mcp/bundle.js

# Test init in fresh project
mkdir -p /tmp/aqe-release-test && cd /tmp/aqe-release-test
node /workspaces/agentic-qe-new/dist/cli/bundle.js init --auto

# Verify CLI
node /workspaces/agentic-qe-new/dist/cli/bundle.js --version
node /workspaces/agentic-qe-new/dist/cli/bundle.js status

# Isolated dependency check
CLEAN_DIR=$(mktemp -d)
npm pack --pack-destination "$CLEAN_DIR"
cd "$CLEAN_DIR" && npm init -y && npm install ./agentic-qe-<version>.tgz
node node_modules/.bin/aqe --version
rm -rf "$CLEAN_DIR" /tmp/aqe-release-test
```

Every check must pass. **STOP -- show results.**

### 8. CI Test Suite

```bash
npm run performance:gate
npm run test:regression
npm run test:ci
```

**STOP -- show results.**

### 9. Commit & PR

```bash
git add package.json package-lock.json CHANGELOG.md docs/releases/
git commit -m "chore(release): bump version to v<version>"
git push origin <branch>
gh pr create --base main --title "chore(release): v<version>" --body "..."
```

**STOP -- show PR URL, wait for CI.**

### 10. Merge & Release

```bash
gh pr merge <pr-number> --merge
git checkout main && git pull
gh release create v<version> --title "v<version>: <Title>" --notes "..."
```

### 11. Monitor & Verify

```bash
gh run list --workflow=npm-publish.yml --limit 1
npm view agentic-qe@<version> name version
npx agentic-qe@<version> --version
```

## Rules

- Single `package.json` at root -- no v3/ subdirectory
- Never hardcode versions -- read from package.json
- Always run REAL tests, never simulated
- Publish via GitHub Actions with `--provenance`, not locally
- Release notes must be user-friendly
- No e2e browser tests unless explicitly requested
- All verification must pass before creating PR

# Agentic QE v2 to v3 Migration Plan

**Created:** 2026-01-11
**Status:** In Progress (83% Complete - 10/12 tasks done)
**Owner:** Architecture Team
**Last Updated:** 2026-01-11

---

## Executive Summary

This plan outlines the strategy for migrating from Agentic QE v2.8.2 to v3.0.0 while:
- Maintaining backward compatibility for existing users
- Running both versions simultaneously during transition
- Publishing v3 as alpha for early testing
- Providing clear migration path and documentation

---

## Table of Contents

1. [Current State Analysis](#1-current-state-analysis)
2. [Migration Strategy](#2-migration-strategy)
3. [NPM Publishing Strategy](#3-npm-publishing-strategy)
4. [Folder Structure Decision](#4-folder-structure-decision)
5. [CLI Commands](#5-cli-commands)
6. [README.md Updates](#6-readmemd-updates)
7. [Task Breakdown](#7-task-breakdown)
8. [Timeline](#8-timeline)
9. [Risk Mitigation](#9-risk-mitigation)

---

## 1. Current State Analysis

### v2 (Current Production)
```
Package: agentic-qe@2.8.2
Location: /workspaces/agentic-qe/ (root)
CLI Commands: aqe, agentic-qe, aqe-mcp
Tests: 1400+ passing
Status: Stable, in production
```

### v3 (Development)
```
Package: @agentic-qe/v3@3.0.0-alpha.1
Location: /workspaces/agentic-qe/v3/
CLI Commands: aqe (planned)
Tests: 3178 passing
Status: Alpha, feature-complete for core domains
```

### Key Differences

| Feature | v2 | v3 |
|---------|----|----|
| Architecture | Monolithic MCP tools | 12 DDD Bounded Contexts |
| Test Framework | Jest | Vitest |
| Module System | CommonJS | ESM |
| Memory Backend | SQLite + basic vectors | AgentDB + HNSW (150x faster) |
| Learning | Basic patterns | ReasoningBank + SONA |
| Agents | 31 QE agents | 78 specialized agents |
| Coverage Analysis | O(n) | O(log n) sublinear |

---

## 2. Migration Strategy

### Phase 1: Parallel Publishing (Current → Week 2)
- [x] Keep v2 code in root (DO NOT MOVE) ✅
- [x] Publish v3 as `@agentic-qe/v3` from v3/ folder ✅ (package.json configured)
- [ ] Both packages available on npm simultaneously (pending first publish)
- [ ] Users can install either version independently (pending first publish)

### Phase 2: Alpha Testing (Week 2-4)
- [ ] Publish v3 alpha versions for early adopters
- [ ] Gather feedback from beta testers
- [x] Document migration gotchas ✅ (MIGRATION-GUIDE.md created)
- [x] Create migration guide ✅ (docs/MIGRATION-GUIDE.md exists)

### Phase 3: Deprecation Notices (Week 4-8)
- [ ] Add deprecation warnings to v2 CLI
- [ ] Document sunset timeline for v2
- [x] Provide automated migration tool ✅ (`aqe migrate` implemented)

### Phase 4: v3 Stable Release (Week 8+)
- [ ] Publish v3 as `agentic-qe@3.0.0`
- [ ] v2 becomes `agentic-qe@2.x` (maintenance mode)
- [ ] Update all documentation

---

## 3. NPM Publishing Strategy

### Package Names

| Version | Package Name | Install Command |
|---------|--------------|-----------------|
| v2.x.x (stable) | `agentic-qe` | `npm install agentic-qe` |
| v3.x.x (alpha) | `@agentic-qe/v3` | `npm install @agentic-qe/v3` |
| v3.x.x (stable, future) | `agentic-qe` | `npm install agentic-qe@3` |

### Publishing from v3-working-branch

```bash
# 1. Checkout v3-working-branch
git checkout v3-working-branch

# 2. Navigate to v3 folder
cd v3

# 3. Build
npm run build

# 4. Publish alpha (scoped package)
npm publish --tag alpha --access public

# 5. Users install with:
npm install @agentic-qe/v3@alpha
```

### Version Tags

| Tag | Purpose | Example |
|-----|---------|---------|
| `latest` | v2 stable | `agentic-qe@2.8.2` |
| `alpha` | v3 alpha | `@agentic-qe/v3@3.0.0-alpha.1` |
| `beta` | v3 beta | `@agentic-qe/v3@3.0.0-beta.1` |
| `next` | v3 stable | `agentic-qe@3.0.0` |

---

## 4. Folder Structure Decision

### Recommendation: Keep Current Structure

**DO NOT move v2 code to v2/ folder.** This would:
- Break all existing imports
- Require republishing v2 with new paths
- Confuse existing users
- Create unnecessary complexity

### Final Structure

```
/workspaces/agentic-qe/
├── src/                    # v2 source (KEEP HERE)
├── dist/                   # v2 compiled
├── tests/                  # v2 tests
├── package.json            # v2 package (agentic-qe@2.8.2)
├── v3/                     # v3 source (SEPARATE PACKAGE)
│   ├── src/
│   │   ├── domains/        # 12 bounded contexts
│   │   ├── kernel/         # Core kernel
│   │   ├── mcp/            # MCP handlers
│   │   └── ...
│   ├── tests/
│   ├── package.json        # v3 package (@agentic-qe/v3)
│   └── README.md           # v3 specific docs
├── README.md               # Main README (update for both versions)
├── MIGRATION-GUIDE.md      # NEW: Migration documentation
└── docs/
    └── v3/                 # v3 documentation
```

---

## 5. CLI Commands

### v2 CLI (Existing)

```bash
# Current v2 commands
aqe init              # Initialize v2 project
aqe test              # Run tests
aqe coverage          # Coverage analysis
aqe-mcp               # Start MCP server
```

### v3 CLI (New)

```bash
# v3 commands (separate binary)
aqe init           # Initialize v3 project
aqe test           # Run tests with time crystal
aqe coverage       # O(log n) coverage analysis
aqe mcp            # Start v3 MCP server
aqe swarm          # Swarm coordination
aqe migrate        # Migrate from v2
```

### What `aqe init` Will Do

```bash
$ aqe init

🚀 Agentic QE v3 Initialization

1. Project Analysis
   ├── Detecting language: TypeScript
   ├── Detecting test framework: Vitest
   ├── Detecting package manager: npm
   └── Scanning for existing tests: 47 found

2. Configuration
   ├── Creating .aqe/config.json
   ├── Creating .aqe/domains.json
   └── Creating .aqe/agents.json

3. Memory Backend
   ├── Initializing AgentDB
   ├── Creating HNSW index
   └── Setting up ReasoningBank

4. Domain Setup
   ├── test-generation: enabled
   ├── test-execution: enabled
   ├── coverage-analysis: enabled
   ├── quality-assessment: enabled
   ├── defect-intelligence: enabled
   ├── requirements-validation: enabled
   ├── code-intelligence: enabled
   ├── security-compliance: enabled
   ├── contract-testing: enabled
   ├── visual-accessibility: disabled (needs Playwright)
   ├── chaos-resilience: enabled
   └── learning-optimization: enabled

5. MCP Server
   └── Ready at stdio (use with Claude Code)

✅ Initialization complete!

Next steps:
  aqe test           # Run your first test
  aqe coverage       # Analyze coverage gaps
  aqe swarm init     # Start multi-agent swarm
```

### Migration Command

```bash
$ aqe migrate

🔄 Migrating from v2 to v3...

1. Detecting v2 installation
   ├── Found: .agentic-qe/ directory
   ├── Memory DB: 1.2 MB
   └── Learned patterns: 847

2. Migration options:
   [x] Migrate memory data
   [x] Migrate learned patterns
   [x] Convert config format
   [ ] Keep v2 installation (backup)

3. Migrating...
   ├── Converting memory.db → AgentDB format
   ├── Indexing patterns in HNSW
   └── Updating config schema

✅ Migration complete!

Your v2 data is now available in v3.
Run 'aqe status' to verify.
```

---

## 6. README.md Updates

### Structure for Updated README

```markdown
# Agentic QE

> AI-Driven Quality Engineering Fleet System

## Quick Start

### v3 (Recommended for New Projects)
npm install @agentic-qe/v3
npx aqe init

### v2 (Stable, Existing Projects)
npm install agentic-qe
npx aqe init

## Version Comparison
[Table comparing v2 vs v3]

## Documentation
- [v3 Documentation](./docs/v3/)
- [v2 Documentation](./docs/v2/)
- [Migration Guide](./MIGRATION-GUIDE.md)

## Features
[Feature list with v2/v3 badges]

## Quick Examples
[Code examples for both versions]

## Contributing
[Contributing guidelines]

## Contributors
[Contributor list with avatars]

## License
MIT
```

### Sections to Include

1. **Hero Section** - Logo, badges, one-liner
2. **Version Selector** - Clear v2 vs v3 guidance
3. **Quick Start** - Both versions
4. **Features** - Comparison table
5. **Installation** - Detailed instructions
6. **Usage Examples** - Real code snippets
7. **API Reference** - Links to docs
8. **MCP Integration** - Claude Code setup
9. **Contributing** - How to contribute
10. **Contributors** - Wall of fame
11. **Sponsors** - Funding info
12. **License** - MIT

---

## 7. Task Breakdown

### Phase 1: Publishing Infrastructure (Priority: HIGH)

- [x] **P1.1** Update v3/package.json for scoped publishing ✅ DONE
  - ✅ Changed name to `@agentic-qe/v3`
  - ✅ Added publishConfig for public access
  - ✅ Verified bin paths work (`aqe`)

- [x] **P1.2** Create npm publish workflow for v3 ✅ DONE
  - ✅ GitHub Actions at `.github/workflows/publish-v3-alpha.yml`
  - ✅ Auto-publish on version tag (v3.0.0-alpha.*, v3.0.0-beta.*)
  - ✅ Alpha/beta/stable tags + manual workflow_dispatch

- [ ] **P1.3** Test alpha publish ⏳ NEXT PRIORITY
  - [ ] Configure NPM_TOKEN secret in GitHub repo
  - [ ] Create git tag: `git tag v3.0.0-alpha.1 && git push --tags`
  - [ ] Install in test project and verify CLI works

### Phase 2: CLI Implementation (Priority: HIGH)

- [x] **P2.1** Implement `aqe init` command ✅ DONE
  - ✅ Project analyzer via InitOrchestrator
  - ✅ Config generator with domain setup
  - ✅ Domain selector (12 domains configurable)
  - ✅ Memory initialization with AgentDB
  - ✅ --wizard and --auto modes

- [x] **P2.2** Implement `aqe migrate` command ✅ DONE
  - ✅ v2 detection (.agentic-qe/ directory)
  - ✅ Memory migration (SQLite → AgentDB)
  - ✅ Pattern transfer to ReasoningBank
  - ✅ Config conversion (v2 → v3 schema)
  - ✅ --dry-run, --backup, --force options
  - ✅ Validation and rollback instructions

- [x] **P2.3** Test CLI in isolation ✅ DONE
  - ✅ Unit tests for init command (init-command.test.ts)
  - ✅ Unit tests for migrate command (migrate-command.test.ts)
  - ✅ Unit tests for all CLI commands (commands.test.ts)
  - ✅ 104 CLI tests passing

### Phase 3: Documentation (Priority: MEDIUM)

- [x] **P3.1** Update main README.md ✅ DONE
  - ✅ Version selector section (v3 badge)
  - ✅ Quick start for v3
  - ✅ Links to v2 documentation
  - ✅ Installation instructions

- [x] **P3.2** Create MIGRATION-GUIDE.md ✅ DONE
  - ✅ Located at docs/MIGRATION-GUIDE.md
  - ✅ Step-by-step migration
  - ✅ Breaking changes list
  - ✅ Code examples

- [x] **P3.3** Create v3/README.md ✅ DONE
  - ✅ Architecture overview with diagram
  - ✅ 12 DDD bounded contexts table
  - ✅ Core components (Kernel, Queen, EventBus, Memory)
  - ✅ CLI commands reference
  - ✅ MCP tools reference
  - ✅ Programmatic API examples
  - ✅ Performance characteristics table

### Phase 4: Migration Skill (Priority: MEDIUM)

- [x] **P4.1** Create migration skill ✅ DONE
  - ✅ `.claude/skills/aqe-v2-v3-migration/skill.md` exists
  - ✅ Migration patterns documented
  - ✅ Code transformation rules
  - ✅ Validation checks

### Phase 5: Testing & Validation (Priority: HIGH)

- [x] **P5.1** Create migration test suite ✅ DONE
  - ✅ V2 fixture creation tests
  - ✅ Migration process tests (17 integration tests)
  - ✅ Backup creation tests
  - ✅ Validation and rollback tests
  - ✅ Edge case handling tests

- [ ] **P5.2** Beta tester program ⏳ PENDING
  - [ ] Invite early adopters
  - [ ] Feedback collection system
  - [ ] Issue tracking

---

## 8. Timeline

```
Week 1 (COMPLETED):
├── [x] Complete ADR implementations ✅
├── [x] P1.1: Update v3/package.json ✅
├── [x] P1.2: Create publish workflow ✅
├── [x] P2.1: aqe init command ✅
├── [x] P2.2: aqe migrate command ✅
├── [x] P3.1: Update main README ✅
├── [x] P3.2: Migration guide ✅
├── [x] P4.1: Migration skill ✅
├── [x] P2.3: CLI testing in isolation ✅ (121 tests)
├── [x] P3.3: Create v3/README.md ✅
├── [x] P5.1: Migration test suite ✅
└── [ ] P1.3: First alpha publish ⏳ (NPM_TOKEN ready)

Week 2 (CURRENT - Ready for Alpha):
├── [ ] P1.3: Execute first alpha publish (git tag v3.0.0-alpha.1)
└── [ ] P5.2: Beta program launch

Week 3-4:
├── [ ] Bug fixes from alpha feedback
├── [ ] Documentation updates
└── [ ] Beta releases (v3.0.0-beta.*)

Week 5-8:
├── [ ] Performance optimization
└── [ ] Prepare stable release (v3.0.0)
```

---

## 9. Risk Mitigation

### Risk 1: Breaking Changes for v2 Users
**Mitigation:**
- v2 continues as-is, no changes
- v3 is separate package
- Clear migration path documented

### Risk 2: NPM Package Name Conflicts
**Mitigation:**
- Use scoped package `@agentic-qe/v3` for alpha
- Only claim `agentic-qe@3.x` when stable
- Reserve package names early

### Risk 3: Migration Data Loss
**Mitigation:**
- Migration creates backups first
- Dry-run mode available
- Rollback instructions documented

### Risk 4: CLI Command Confusion
**Mitigation:**
- Same binary name (`aqe`) for both v2 and v3 - see [Binary Conflict Handling](./AQE-V2-V3-MIGRATION-PLAN.md#global-installation-binary-conflict-handling)
- Version checks in CLI (`aqe --version`)
- Clear help messages
- Users must uninstall v2 globally before installing v3 globally, or use `--force`

### Risk 5: Global Binary Conflict (EEXIST Error)
**Problem:** Both v2 and v3 register the same `aqe` binary. Global installs fail with EEXIST.
**Mitigation:**
- Document uninstall-first workflow: `npm uninstall -g agentic-qe && npm install -g @agentic-qe/v3@alpha`
- Support `--force` flag: `npm install -g @agentic-qe/v3@alpha --force`
- Recommend `npx` usage for v3 during transition period
- Future: Add preinstall check script to detect and warn about v2
- See detailed documentation: [AQE-V2-V3-MIGRATION-PLAN.md](./AQE-V2-V3-MIGRATION-PLAN.md#global-installation-binary-conflict-handling)

---

## Appendix A: Package.json Changes for v3

```json
{
  "name": "@agentic-qe/v3",
  "version": "3.0.0-alpha.1",
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  },
  "bin": {
    "aqe": "./dist/cli/index.js"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/proffesor-for-testing/agentic-qe.git",
    "directory": "v3"
  }
}
```

## Appendix B: GitHub Actions Workflow

```yaml
# .github/workflows/publish-v3-alpha.yml
name: Publish v3 Alpha

on:
  push:
    tags:
      - 'v3.0.0-alpha.*'

jobs:
  publish:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: v3
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm publish --tag alpha --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Progress Tracking

| Task | Status | Notes | Completed |
|------|--------|-------|-----------|
| P1.1 Update v3/package.json | ✅ Done | @agentic-qe/v3 configured | 2026-01-11 |
| P1.2 Publish workflow | ✅ Done | publish-v3-alpha.yml | 2026-01-11 |
| P1.3 First alpha | ⏳ Ready | NPM_TOKEN configured, push tag to publish | - |
| P2.1 init command | ✅ Done | --wizard, --auto modes | 2026-01-11 |
| P2.2 migrate command | ✅ Done | Full implementation | 2026-01-11 |
| P2.3 CLI tests | ✅ Done | 121 tests (init, migrate, commands) | 2026-01-11 |
| P3.1 Update README | ✅ Done | V3 quick start added | 2026-01-11 |
| P3.2 Migration guide | ✅ Done | docs/MIGRATION-GUIDE.md | 2026-01-11 |
| P3.3 v3/README.md | ✅ Done | Full architecture docs | 2026-01-11 |
| P4.1 Migration skill | ✅ Done | .claude/skills/aqe-v2-v3-migration/ | 2026-01-11 |
| P5.1 Migration tests | ✅ Done | 17 integration tests | 2026-01-11 |
| P5.2 Beta program | ⏳ Pending | After alpha publish | - |

### Summary
- **Completed:** 10/12 tasks (83%)
- **Ready to Execute:** 1/12 task (P1.3 - push git tag)
- **Pending:** 1/12 task (P5.2 - beta program)

### Next Step
```bash
# To publish v3 alpha:
git tag v3.0.0-alpha.1
git push --tags
# Workflow will auto-publish to npm
```

---

*Last Updated: 2026-01-11*

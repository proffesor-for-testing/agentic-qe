# Agentic QE v2 to v3 Migration Plan

**Created:** 2026-01-11
**Status:** In Progress
**Owner:** Architecture Team

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
CLI Commands: aqe-v3 (planned)
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
- [ ] Keep v2 code in root (DO NOT MOVE)
- [ ] Publish v3 as `@agentic-qe/v3` from v3/ folder
- [ ] Both packages available on npm simultaneously
- [ ] Users can install either version independently

### Phase 2: Alpha Testing (Week 2-4)
- [ ] Publish v3 alpha versions for early adopters
- [ ] Gather feedback from beta testers
- [ ] Document migration gotchas
- [ ] Create migration guide

### Phase 3: Deprecation Notices (Week 4-8)
- [ ] Add deprecation warnings to v2 CLI
- [ ] Document sunset timeline for v2
- [ ] Provide automated migration tool

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
aqe-v3 init           # Initialize v3 project
aqe-v3 test           # Run tests with time crystal
aqe-v3 coverage       # O(log n) coverage analysis
aqe-v3 mcp            # Start v3 MCP server
aqe-v3 swarm          # Swarm coordination
aqe-v3 migrate        # Migrate from v2
```

### What `aqe-v3 init` Will Do

```bash
$ aqe-v3 init

🚀 Agentic QE v3 Initialization

1. Project Analysis
   ├── Detecting language: TypeScript
   ├── Detecting test framework: Vitest
   ├── Detecting package manager: npm
   └── Scanning for existing tests: 47 found

2. Configuration
   ├── Creating .aqe-v3/config.json
   ├── Creating .aqe-v3/domains.json
   └── Creating .aqe-v3/agents.json

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
  aqe-v3 test           # Run your first test
  aqe-v3 coverage       # Analyze coverage gaps
  aqe-v3 swarm init     # Start multi-agent swarm
```

### Migration Command

```bash
$ aqe-v3 migrate

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
Run 'aqe-v3 status' to verify.
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
npx aqe-v3 init

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

- [ ] **P1.1** Update v3/package.json for scoped publishing
  - Change name to `@agentic-qe/v3`
  - Add publishConfig for public access
  - Verify bin paths work

- [ ] **P1.2** Create npm publish workflow for v3
  - GitHub Actions for v3-working-branch
  - Auto-publish on version tag
  - Alpha/beta/stable tags

- [ ] **P1.3** Test alpha publish
  - Publish 3.0.0-alpha.1
  - Install in test project
  - Verify CLI works

### Phase 2: CLI Implementation (Priority: HIGH)

- [ ] **P2.1** Implement `aqe-v3 init` command
  - Project analyzer
  - Config generator
  - Domain selector
  - Memory initialization

- [ ] **P2.2** Implement `aqe-v3 migrate` command
  - v2 detection
  - Memory migration
  - Pattern transfer
  - Config conversion

- [ ] **P2.3** Test CLI in isolation
  - Unit tests for each command
  - Integration tests
  - E2E with real projects

### Phase 3: Documentation (Priority: MEDIUM)

- [ ] **P3.1** Update main README.md
  - Version selector section
  - Quick start for both versions
  - Feature comparison table
  - Installation instructions

- [ ] **P3.2** Create MIGRATION-GUIDE.md
  - Step-by-step migration
  - Breaking changes list
  - Code examples
  - Troubleshooting

- [ ] **P3.3** Create v3/README.md
  - v3-specific documentation
  - Architecture overview
  - Domain descriptions
  - API reference

### Phase 4: Migration Skill (Priority: MEDIUM)

- [ ] **P4.1** Create migration skill
  - `.claude/skills/aqe-v2-v3-migration/`
  - Migration patterns
  - Code transformation rules
  - Validation checks

### Phase 5: Testing & Validation (Priority: HIGH)

- [ ] **P5.1** Create migration test suite
  - Sample v2 projects
  - Migration verification
  - Regression tests

- [ ] **P5.2** Beta tester program
  - Invite early adopters
  - Feedback collection
  - Issue tracking

---

## 8. Timeline

```
Week 1 (Current):
├── [x] Complete ADR implementations
├── [ ] P1.1: Update v3/package.json
├── [ ] P1.2: Create publish workflow
└── [ ] P1.3: First alpha publish

Week 2:
├── [ ] P2.1: aqe-v3 init command
├── [ ] P2.2: aqe-v3 migrate command
└── [ ] P3.1: Update main README

Week 3:
├── [ ] P3.2: Migration guide
├── [ ] P4.1: Migration skill
└── [ ] P5.1: Migration tests

Week 4:
├── [ ] P5.2: Beta program launch
├── [ ] Bug fixes from feedback
└── [ ] Documentation updates

Week 5-8:
├── [ ] Beta releases
├── [ ] Performance optimization
└── [ ] Prepare stable release
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
- Different binary names (aqe vs aqe-v3)
- Version checks in CLI
- Clear help messages

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
    "aqe-v3": "./dist/cli/index.js"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ruvnet/agentic-qe.git",
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

| Task | Status | Assignee | Due |
|------|--------|----------|-----|
| P1.1 Update v3/package.json | ⏳ Pending | - | Week 1 |
| P1.2 Publish workflow | ⏳ Pending | - | Week 1 |
| P1.3 First alpha | ⏳ Pending | - | Week 1 |
| P2.1 init command | ⏳ Pending | - | Week 2 |
| P2.2 migrate command | ⏳ Pending | - | Week 2 |
| P3.1 Update README | ⏳ Pending | - | Week 2 |
| P3.2 Migration guide | ⏳ Pending | - | Week 3 |
| P4.1 Migration skill | ⏳ Pending | - | Week 3 |
| P5.1 Migration tests | ⏳ Pending | - | Week 3 |
| P5.2 Beta program | ⏳ Pending | - | Week 4 |

---

*Last Updated: 2026-01-11*

# Multi-Platform Integration Plan: Agentic QE v3

**Created**: 2026-02-27
**Status**: In Progress
**Scope**: Add support for 8 coding agent platforms

---

## Executive Summary

Add support for 8 major coding agent platforms to the existing AQE MCP server. The core MCP server already works. The work is primarily about **config generation**, **behavioral instruction files**, **setup automation**, and **testing** for each platform.

MCP has become the universal standard — nearly all major platforms support it natively. A single well-built AQE MCP server covers ~90% of the market.

---

## Current State

| Platform | Status | Config Location | Installer |
|----------|--------|-----------------|-----------|
| Claude Code | Native (home platform) | `.claude/mcp.json` | Built-in to init wizard |
| OpenCode | Integrated | `opencode.json` (root) | `v3/src/init/opencode-installer.ts` |
| Kiro | Integrated | `.kiro/settings/mcp.json` | `v3/src/init/kiro-installer.ts` |

---

## Platforms to Add

### Priority 1 (JSON-based MCP, highest market reach)

| Platform | Users | Config Path | Config Key | Rules File |
|----------|-------|-------------|------------|------------|
| GitHub Copilot | 20M | `.vscode/mcp.json` | `servers` | `.github/copilot-instructions.md` |
| Cursor | 360K paid | `.cursor/mcp.json` | `mcpServers` | `.cursorrules` |
| Cline | 5M installs | `.vscode/cline_mcp_settings.json` | `mcpServers` | Custom modes (JSON) |
| Kilo Code | 1.5M | `.kilocode/mcp.json` | `mcpServers` | Custom modes (JSON) |
| Roo Code | Growing | `.roo/mcp.json` | `mcpServers` | Custom modes (JSON) |

### Priority 2 (Different config formats)

| Platform | Users | Config Path | Format | Rules File |
|----------|-------|-------------|--------|------------|
| OpenAI Codex CLI | 1M+ | `.codex/config.toml` `[mcp_servers]` | TOML | `AGENTS.md` |
| Windsurf | Large | `.windsurf/mcp_config.json` | JSON | `.windsurfrules` |
| Continue.dev | Enterprise | `.continue/config.yaml` | YAML | `.continue/rules/aqe-qe-standards.yaml` |

---

## Phase 1: Universal Config Generator + Priority 1 Platforms

**Timeline**: 2-3 weeks
**Status**: [x] Complete

### Milestone 1.1: Universal Config Generator

**File**: `v3/src/init/platform-config-generator.ts`

- [x] `PlatformConfigGenerator` class with `generateMcpConfig()` and `generateBehavioralRules()`
- [x] Platform registry mapping all 8 platforms to their config paths, keys, and formats
- [x] Unit tests for all platform config formats (22 tests in `platform-config-generator.test.ts`)

### Milestone 1.2: GitHub Copilot Integration

**Files**: `v3/src/init/copilot-installer.ts`, `.github/copilot-instructions.md` template

- [x] Installer class following OpenCode/Kiro pattern
- [x] MCP config generation (`.vscode/mcp.json` with `servers` key)
- [x] Behavioral rules template (`copilot-instructions.md`)
- [x] Integration test: `v3/tests/integration/platform-installers.test.ts` (shared, 76 tests)
- [x] Unit test: `v3/tests/unit/init/copilot-installer.test.ts` (9 tests)

**MCP Config format**:
```json
{
  "servers": {
    "agentic-qe": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "agentic-qe@latest", "mcp"],
      "env": {
        "AQE_MEMORY_PATH": ".agentic-qe/memory.db",
        "AQE_V3_MODE": "true"
      }
    }
  }
}
```

### Milestone 1.3: Cursor Integration

**Files**: `v3/src/init/cursor-installer.ts`, `.cursorrules` template

- [x] Installer class
- [x] MCP config generation (`.cursor/mcp.json` with `mcpServers` key)
- [x] Behavioral rules template (`.cursorrules`)
- [x] Integration test: (shared in platform-installers.test.ts)
- [x] Unit test: `v3/tests/unit/init/cursor-installer.test.ts` (8 tests)

### Milestone 1.4: Cline Integration

**Files**: `v3/src/init/cline-installer.ts`, custom mode template

- [x] Installer class
- [x] MCP config generation (`cline_mcp_settings.json` with `mcpServers` key)
- [x] Custom QE mode definition
- [x] `alwaysAllow` list for safe tools
- [x] Integration test: (shared in platform-installers.test.ts)
- [x] Unit test: `v3/tests/unit/init/cline-installer.test.ts` (11 tests)

### Milestone 1.5: Kilo Code Integration

**Files**: `v3/src/init/kilocode-installer.ts`, custom mode template

- [x] Installer class
- [x] MCP config generation (`.kilocode/mcp.json` with `mcpServers` key)
- [x] Custom QE mode definition
- [ ] Marketplace listing investigation
- [x] Integration test: (shared in platform-installers.test.ts)
- [x] Unit test: `v3/tests/unit/init/kilocode-installer.test.ts` (10 tests)

### Milestone 1.6: Roo Code Integration

**Files**: `v3/src/init/roocode-installer.ts`, mode config template

- [x] Installer class
- [x] MCP config generation (`.roo/mcp.json` with `mcpServers` key)
- [x] Mode configuration
- [x] Integration test: (shared in platform-installers.test.ts)
- [x] Unit test: `v3/tests/unit/init/roocode-installer.test.ts` (11 tests)

---

## Phase 2: Priority 2 Platforms (Different Config Formats)

**Timeline**: 1-2 weeks
**Status**: [x] Core Implementation Complete

### Milestone 2.1: OpenAI Codex CLI Integration

- [x] `v3/src/init/codex-installer.ts`
- [x] TOML config generation (`config.toml` under `[mcp_servers]`)
- [x] `AGENTS.md` behavioral rules template
- [x] Integration test: (shared in platform-installers.test.ts)
- [x] Unit test: `v3/tests/unit/init/codex-installer.test.ts` (11 tests)

**MCP Config format**:
```toml
[mcp_servers.agentic-qe]
type = "stdio"
command = "npx"
args = ["-y", "agentic-qe@latest", "mcp"]

[mcp_servers.agentic-qe.env]
AQE_MEMORY_PATH = ".agentic-qe/memory.db"
AQE_V3_MODE = "true"
```

### Milestone 2.2: Windsurf Integration

- [x] `v3/src/init/windsurf-installer.ts`
- [x] JSON config generation (project-level `.windsurf/mcp_config.json`)
- [x] `.windsurfrules` behavioral rules template
- [x] Integration test: (shared in platform-installers.test.ts)
- [x] Unit test: `v3/tests/unit/init/windsurf-installer.test.ts` (11 tests)

### Milestone 2.3: Continue.dev Integration

- [x] `v3/src/init/continuedev-installer.ts`
- [x] YAML config generation (`.continue/config.yaml`)
- [x] Rules in YAML format
- [x] Integration test: (shared in platform-installers.test.ts)
- [x] Unit test: `v3/tests/unit/init/continuedev-installer.test.ts` (11 tests)

---

## Phase 3: CLI Integration and Init Wizard

**Timeline**: 1 week
**Status**: [x] Complete

### Milestone 3.1: CLI `init` Command Enhancement

- [x] Add `--with-copilot` flag
- [x] Add `--with-cursor` flag
- [x] Add `--with-cline` flag
- [x] Add `--with-kilocode` flag
- [x] Add `--with-roocode` flag
- [x] Add `--with-codex` flag
- [x] Add `--with-windsurf` flag
- [x] Add `--with-continuedev` flag
- [x] Add `--with-all-platforms` flag
- [x] Add `aqe platform setup <name>` command
- [x] Add `aqe platform list` command
- [x] Add `aqe platform verify <name>` command

### Milestone 3.2: Export Init Module

- [x] Update `v3/src/init/index.ts` with all new installer exports

---

## Phase 4: Testing Strategy

**Timeline**: 1 week (parallel with Phase 1-2)
**Status**: [x] Complete

### Per Platform

| Test Type | Location | What It Tests |
|-----------|----------|---------------|
| Unit | `v3/tests/unit/init/<platform>-installer.test.ts` | Config generation, file writing |
| Integration | `v3/tests/integration/platform-installers.test.ts` | Real fs, format validation, merge (76 tests) |
| Integration | `v3/tests/integration/cross-platform-init.test.ts` | Multi-platform init, auto-detection (23 tests) |

### Shared

- [x] `v3/tests/integration/platform-installers.test.ts` -- all platforms integration (76 tests)
- [x] `v3/tests/integration/cross-platform-init.test.ts` -- cross-platform init + auto-detection (23 tests)

---

## Phase 5: Marketplace and Distribution

**Timeline**: 1-2 weeks
**Status**: [ ] Not Started

- [ ] Cline MCP Marketplace listing
- [ ] Kilo Code MCP Marketplace listing
- [ ] VS Code Marketplace consideration (Copilot discovery)

---

## Phase 6: Documentation

**Timeline**: 3-5 days (parallel)
**Status**: [x] Complete

- [x] `docs/platform-setup-guide.md` -- per-platform setup instructions (all 11 platforms)
- [x] Per-platform quickstart in setup guide (automated + manual for each)
- [ ] ADR-028: Multi-Platform Support decision record (deferred)

---

## Files Inventory

### New Files Created

| File | Purpose | Status |
|------|---------|--------|
| `v3/src/init/platform-config-generator.ts` | Universal config generator | Done |
| `v3/src/init/copilot-installer.ts` | GitHub Copilot installer | Done |
| `v3/src/init/cursor-installer.ts` | Cursor installer | Done |
| `v3/src/init/cline-installer.ts` | Cline installer | Done |
| `v3/src/init/kilocode-installer.ts` | Kilo Code installer | Done |
| `v3/src/init/roocode-installer.ts` | Roo Code installer | Done |
| `v3/src/init/codex-installer.ts` | OpenAI Codex CLI installer | Done |
| `v3/src/init/windsurf-installer.ts` | Windsurf installer | Done |
| `v3/src/init/continuedev-installer.ts` | Continue.dev installer | Done |
| `v3/src/cli/commands/platform.ts` | `aqe platform list/setup/verify` CLI | Done |
| `v3/tests/unit/init/*-installer.test.ts` (x8) | Per-platform unit tests | Done |
| `v3/tests/unit/init/platform-config-generator.test.ts` | Config generator tests (22) | Done |
| `v3/tests/integration/platform-installers.test.ts` | Real fs integration (76 tests) | Done |
| `v3/tests/integration/cross-platform-init.test.ts` | Cross-platform init (23 tests) | Done |
| `docs/platform-setup-guide.md` | Per-platform setup instructions | Done |

Note: Behavioral rules (copilot-instructions.md, .cursorrules, etc.) are generated inline by
`PlatformConfigGenerator` — no separate template files needed.

### Files to Modify

| File | Change |
|------|--------|
| `v3/src/init/index.ts` | Export new installers |
| `v3/src/init/init-wizard.ts` | Add `--with-<platform>` flags |
| `v3/src/cli/commands/init.ts` | Wire new CLI flags |
| `package.json` (`files` array) | Include new templates |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Platforms supported | 11 (Claude Code + OpenCode + Kiro + 8 new) |
| Config generation tests passing | 100% |
| MCP compatibility tests passing | 100% per platform |
| CLI flags working | All 8 `--with-<platform>` flags |
| Time to setup any platform | < 30 seconds |
| npm package size increase | < 50KB |

---

## Implementation Order

1. Universal Config Generator (foundation)
2. GitHub Copilot (20M users)
3. Cursor (360K paid)
4. Cline + Kilo Code + Roo Code (parallel — near-identical JSON)
5. CLI `--with-<platform>` flags
6. Codex + Windsurf + Continue.dev
7. Tests, marketplace, docs

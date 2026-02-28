# Multi-Platform Setup Guide

> Agentic QE supports 11 coding agent platforms via MCP (Model Context Protocol).
> This guide covers setup for all platforms.

## Quick Setup

The fastest way to configure any platform:

```bash
# Auto-setup with init flag
npx agentic-qe init --auto --with-copilot
npx agentic-qe init --auto --with-cursor
npx agentic-qe init --auto --with-all-platforms

# Or use the platform command directly
npx agentic-qe platform setup copilot
npx agentic-qe platform setup cursor

# List all platforms and their status
npx agentic-qe platform list

# Verify a platform's configuration
npx agentic-qe platform verify copilot
```

## Platform Reference

| Platform | Config Path | Format | Rules File | Auto-Detect |
|----------|-------------|--------|------------|-------------|
| Claude Code | `.claude/mcp.json` | JSON | `CLAUDE.md` | Built-in |
| OpenCode | `opencode.json` | JSON | — | `opencode.json` |
| Kiro | `.kiro/settings/mcp.json` | JSON | `.kiro/steering/` | `.kiro/` |
| GitHub Copilot | `.vscode/mcp.json` | JSON | `.github/copilot-instructions.md` | `.vscode/` |
| Cursor | `.cursor/mcp.json` | JSON | `.cursorrules` | `.cursor/` |
| Cline | `.vscode/cline_mcp_settings.json` | JSON | `.vscode/cline_custom_modes.json` | — |
| Kilo Code | `.kilocode/mcp.json` | JSON | `.kilocode/modes.json` | `.kilocode/` |
| Roo Code | `.roo/mcp.json` | JSON | `.roo/modes.json` | `.roo/` |
| OpenAI Codex CLI | `.codex/config.toml` | TOML | `AGENTS.md` | `.codex/` |
| Windsurf | `.windsurf/mcp_config.json` | JSON | `.windsurfrules` | `.windsurf/` |
| Continue.dev | `.continue/config.yaml` | YAML | `.continue/rules/aqe-qe-standards.yaml` | `.continue/` |

---

## GitHub Copilot

### Automated Setup

```bash
npx agentic-qe init --auto --with-copilot
# or
npx agentic-qe platform setup copilot
```

### Manual Setup

Create `.vscode/mcp.json`:

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

The installer also creates `.github/copilot-instructions.md` with QE behavioral rules.

> **Note**: Copilot uses `servers` as the config key, not `mcpServers`.

---

## Cursor

### Automated Setup

```bash
npx agentic-qe init --auto --with-cursor
# or
npx agentic-qe platform setup cursor
```

### Manual Setup

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
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

The installer also creates `.cursorrules` with QE behavioral rules.

---

## Cline

### Automated Setup

```bash
npx agentic-qe init --auto --with-cline
# or
npx agentic-qe platform setup cline
```

### Manual Setup

Create `.vscode/cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "npx",
      "args": ["-y", "agentic-qe@latest", "mcp"],
      "env": {
        "AQE_MEMORY_PATH": ".agentic-qe/memory.db",
        "AQE_V3_MODE": "true"
      },
      "alwaysAllow": [
        "fleet_init", "fleet_status", "fleet_health",
        "agent_list", "agent_metrics", "agent_status",
        "team_list", "team_health",
        "task_list", "task_status",
        "test_generate_enhanced",
        "coverage_analyze_sublinear", "quality_assess",
        "defect_predict", "code_index",
        "memory_store", "memory_retrieve", "memory_query", "memory_usage",
        "model_route", "routing_metrics", "aqe_health"
      ]
    }
  }
}
```

The installer also creates a custom QE Engineer mode in `.vscode/cline_custom_modes.json`.

> **Cline-specific**: Supports `alwaysAllow` for auto-approving safe read-only tools.

---

## Kilo Code

### Automated Setup

```bash
npx agentic-qe init --auto --with-kilocode
# or
npx agentic-qe platform setup kilocode
```

### Manual Setup

Create `.kilocode/mcp.json`:

```json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "npx",
      "args": ["-y", "agentic-qe@latest", "mcp"],
      "env": {
        "AQE_MEMORY_PATH": ".agentic-qe/memory.db",
        "AQE_V3_MODE": "true"
      },
      "alwaysAllow": [
        "fleet_init", "fleet_status", "fleet_health",
        "agent_list", "agent_metrics", "agent_status",
        "team_list", "team_health", "task_list", "task_status",
        "test_generate_enhanced", "coverage_analyze_sublinear",
        "quality_assess", "defect_predict", "code_index",
        "memory_store", "memory_retrieve", "memory_query", "memory_usage",
        "model_route", "routing_metrics", "aqe_health"
      ]
    }
  }
}
```

The installer also creates a custom QE mode in `.kilocode/modes.json`.

---

## Roo Code

### Automated Setup

```bash
npx agentic-qe init --auto --with-roocode
# or
npx agentic-qe platform setup roocode
```

### Manual Setup

Create `.roo/mcp.json`:

```json
{
  "mcpServers": {
    "agentic-qe": {
      "command": "npx",
      "args": ["-y", "agentic-qe@latest", "mcp"],
      "env": {
        "AQE_MEMORY_PATH": ".agentic-qe/memory.db",
        "AQE_V3_MODE": "true"
      },
      "alwaysAllow": [
        "fleet_init", "fleet_status", "fleet_health",
        "agent_list", "agent_metrics", "agent_status",
        "team_list", "team_health", "task_list", "task_status",
        "test_generate_enhanced", "coverage_analyze_sublinear",
        "quality_assess", "defect_predict", "code_index",
        "memory_store", "memory_retrieve", "memory_query", "memory_usage",
        "model_route", "routing_metrics", "aqe_health"
      ]
    }
  }
}
```

The installer also creates a custom QE mode in `.roo/modes.json`.

---

## OpenAI Codex CLI

### Automated Setup

```bash
npx agentic-qe init --auto --with-codex
# or
npx agentic-qe platform setup codex
```

### Manual Setup

Create `.codex/config.toml`:

```toml
[mcp_servers.agentic-qe]
type = "stdio"
command = "npx"
args = ["-y", "agentic-qe@latest", "mcp"]

[mcp_servers.agentic-qe.env]
AQE_MEMORY_PATH = ".agentic-qe/memory.db"
AQE_V3_MODE = "true"
```

The installer also creates `AGENTS.md` with QE behavioral rules (Codex's equivalent of CLAUDE.md).

> **Codex-specific**: Uses TOML config format and `AGENTS.md` for behavioral instructions.

---

## Windsurf

### Automated Setup

```bash
npx agentic-qe init --auto --with-windsurf
# or
npx agentic-qe platform setup windsurf
```

### Manual Setup

Create `.windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "agentic-qe": {
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

The installer also creates `.windsurfrules` with QE behavioral rules.

---

## Continue.dev

### Automated Setup

```bash
npx agentic-qe init --auto --with-continuedev
# or
npx agentic-qe platform setup continuedev
```

### Manual Setup

Create `.continue/config.yaml`:

```yaml
mcpServers:
  - name: agentic-qe
    command: npx
    args:
      - "-y"
      - "agentic-qe@latest"
      - "mcp"
    env:
      AQE_MEMORY_PATH: ".agentic-qe/memory.db"
      AQE_V3_MODE: "true"
```

The installer also creates `.continue/rules/aqe-qe-standards.yaml` with QE rules in YAML format.

> **Continue.dev-specific**: Uses YAML config format with array-style MCP server entries.

---

## Multi-Platform Setup

To configure all platforms at once:

```bash
npx agentic-qe init --auto --with-all-platforms
```

This creates config files for all 8 platforms. Files are merge-safe — existing configs are preserved and AQE entries are appended.

## Auto-Detection

When running `npx agentic-qe init --auto`, platforms are auto-detected based on directory presence:

| Directory Exists | Platform Auto-Configured |
|-----------------|--------------------------|
| `.vscode/` | GitHub Copilot |
| `.cursor/` | Cursor |
| `.kilocode/` | Kilo Code |
| `.roo/` | Roo Code |
| `.codex/` | OpenAI Codex CLI |
| `.windsurf/` | Windsurf |
| `.continue/` | Continue.dev |

> **Note**: Cline is not auto-detected (shares `.vscode/` with Copilot). Use `--with-cline` explicitly.

## Verifying Configuration

```bash
# Check all platforms
npx agentic-qe platform list

# Verify a specific platform
npx agentic-qe platform verify cursor
```

Verify checks:
1. Config file exists at expected path
2. Config file is valid JSON/TOML/YAML
3. Config contains `agentic-qe` server entry
4. Rules/behavioral file exists

## Troubleshooting

**Config not detected**: Run `npx agentic-qe platform verify <name>` to see which checks fail.

**Merge conflicts**: The installer merges safely into existing configs. If you see issues, delete the AQE entry from the config and re-run setup.

**MCP server not starting**: Ensure `npx agentic-qe mcp` works standalone first:
```bash
npx agentic-qe@latest mcp
```

# Agentic QE Marketplace

Claude Code plugins for AI-powered quality engineering — test generation, coverage analysis, chaos engineering, security scanning, and TDD with self-learning fleet coordination.

## Install the marketplace

In any Claude Code session:

```
/plugin marketplace add proffesor-for-testing/agentic-qe
```

Then browse and install plugins:

```
/plugin install agentic-qe-fleet
```

## Available plugins

### `agentic-qe-fleet`

PACTS-based agentic quality engineering fleet — slim Claude Code bundle with 11 specialized QE agents, 9 trust-tier-2/3 skills, 9 `/aqe-*` slash commands, and an auto-registered MCP server.

**Agents** (model-routed by cognitive load):
- **Opus tier** (heavy reasoning): `qe-test-architect`, `qe-fleet-commander`, `qe-security-scanner`, `qe-chaos-engineer`, `qe-regression-analyzer`, `qe-requirements-validator`
- **Sonnet tier** (focused execution): `qe-coverage-specialist`, `qe-flaky-hunter`, `qe-performance-tester`, `qe-quality-gate`, `qe-tdd-specialist`

**Skills** (validated/verified — trust tier 2 or 3):
- `qe-test-generation`, `qe-coverage-analysis`, `qe-test-execution`, `qe-chaos-resilience`, `qe-quality-assessment`
- `chaos-engineering-resilience`, `mutation-testing`, `risk-based-testing`, `tdd-london-chicago`

**Slash commands**: `/aqe-analyze`, `/aqe-execute`, `/aqe-generate`, `/aqe-optimize`, `/aqe-chaos`, `/aqe-fleet-status`, `/aqe-report`, `/aqe-benchmark`, `/aqe-costs`

**MCP server**: auto-registers via `npx -y agentic-qe@latest mcp` — no separate setup.

## Usage examples

After installing the plugin, agents and commands are available immediately:

```
/aqe-fleet-status                      # health and metrics
/aqe-generate src/services/Auth.ts     # generate tests
/aqe-analyze src/                      # coverage gap analysis
```

Or invoke an agent through the Task tool:

```
"Use qe-test-architect to generate tests for src/services/PaymentService.ts"
"Use qe-flaky-hunter to find and stabilize flaky tests in tests/integration/"
"Use qe-chaos-engineer to inject network partitions into the order workflow"
```

## Plugin vs full `aqe init` — which to use?

| | **Plugin** | **`aqe init`** |
|---|---|---|
| Setup | One slash command | Full project setup |
| Scope | 11 agents, 9 skills | 60 agents, 85 skills |
| Persistent learning DB | No (uses MCP server's) | Yes (`.agentic-qe/memory.db`) |
| Cross-platform support | Claude Code only | 11 platforms (Cursor, Copilot, Cline, Windsurf, Continue.dev, etc.) |
| Use when | Quick start, single Claude Code project | Production team setup, multi-platform, full fleet |

You can run both — the plugin's MCP server uses the same `agentic-qe` package, so installing both gives you the full fleet via `aqe init` and slash-command shortcuts via the plugin.

## Links

- **Repository**: https://github.com/proffesor-for-testing/agentic-qe
- **Issues**: https://github.com/proffesor-for-testing/agentic-qe/issues
- **Full documentation**: see the main [README](../README.md)
- **Release notes**: [docs/releases](../docs/releases/README.md)

## License

MIT — see [LICENSE](../LICENSE).

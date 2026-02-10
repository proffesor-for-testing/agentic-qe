# MCP Client Integration (Agent-Agnostic)

AQE exposes capabilities through an MCP server (`aqe-mcp` / `npx agentic-qe mcp`).

This means you can use AQE from any MCP-compatible agent client, including Claude-based and Codex-compatible setups.

## 1) Start AQE MCP server

```bash
# global install path
aqe-mcp

# or ephemeral
npx agentic-qe mcp
```

## 2) Connect from your MCP client

In your client, add an MCP tool endpoint/command that runs one of:
- `aqe-mcp`
- `npx agentic-qe mcp`

## 3) Validate capability discovery

After connection, verify AQE tools/agents are discoverable in your client.

## 4) Suggested first tasks

- Generate tests with `qe-test-architect`
- Run orchestration with `qe-queen-coordinator`
- Analyze flaky tests with `qe-flaky-hunter`

## Notes

- AQE core is provider-neutral at the MCP boundary.
- Client UX / prompt syntax differs by agent client; tool names stay AQE-native.
- Keep MCP server and client versions pinned in CI/devcontainer for reproducibility.

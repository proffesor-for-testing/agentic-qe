# AQE MCP Tool Compatibility for OpenCode

> Generated: 2026-02-24
> Purpose: Track tool description compliance and OpenCode display compatibility.

## Tool Description Standards

All AQE MCP tool descriptions follow this pattern:

```
<Action verb> <what>. <Detail>.
```

**Requirements**:
- Under 200 characters (OpenCode display limit)
- Starts with an action verb (Initialize, Spawn, Execute, Analyze, etc.)
- Includes parameter summary when relevant
- No markdown or special formatting in descriptions

## Tool Inventory (40+ tools)

### Core Tools (3)

| Tool | Description | Chars | Compliant |
|---|---|---|---|
| `fleet_init` | Initialize the AQE v3 fleet with topology and domain configuration. | 67 | Yes |
| `fleet_status` | Get fleet status: agents, tasks, health, and learning stats. | 61 | Yes |
| `fleet_health` | Check fleet and per-domain health status with load metrics. | 59 | Yes |

### Task Tools (5)

| Tool | Description | Chars | Compliant |
|---|---|---|---|
| `task_submit` | Submit a QE task to the Queen Coordinator for assignment. | 57 | Yes |
| `task_list` | List tasks with optional status/limit filtering. | 48 | Yes |
| `task_status` | Get detailed status, progress, and result of a specific task. | 61 | Yes |
| `task_cancel` | Cancel a running or pending task by ID. | 39 | Yes |
| `task_orchestrate` | Orchestrate a high-level QE task across multiple agents. | 56 | Yes |

### Agent Tools (4)

| Tool | Description | Chars | Compliant |
|---|---|---|---|
| `agent_list` | List all active agents, optionally filtered by domain. | 53 | Yes |
| `agent_spawn` | Spawn a new QE agent in a specific domain. | 43 | Yes |
| `agent_metrics` | Get CPU, memory, and task performance metrics for agents. | 57 | Yes |
| `agent_status` | Get detailed status and current task of a specific agent. | 57 | Yes |

### Domain Tools (11)

| Tool | Description | Chars | Compliant |
|---|---|---|---|
| `test_generate_enhanced` | Generate tests with AI pattern recognition and anti-pattern detection. | 70 | Yes |
| `test_execute_parallel` | Execute test files in parallel with automatic retry on flaky failures. | 70 | Yes |
| `coverage_analyze_sublinear` | Analyze code coverage with O(log n) sublinear algorithm. | 57 | Yes |
| `quality_assess` | Assess code quality metrics and optionally run a quality gate. | 62 | Yes |
| `security_scan_comprehensive` | Run SAST and/or DAST security scans with vulnerability classification. | 70 | Yes |
| `contract_validate` | Validate API contracts for breaking changes against consumers. | 62 | Yes |
| `accessibility_test` | Test accessibility against WCAG 2.1/2.2 and Section 508 standards. | 67 | Yes |
| `chaos_test` | Inject faults for chaos engineering resilience testing. | 54 | Yes |
| `defect_predict` | Predict potential defects using AI analysis of code complexity. | 63 | Yes |
| `requirements_validate` | Validate requirements for completeness and generate BDD scenarios. | 66 | Yes |
| `code_index` | Index source code into the knowledge graph for analysis. | 55 | Yes |

### Memory Tools (6)

| Tool | Description | Chars | Compliant |
|---|---|---|---|
| `memory_store` | Store a key-value pair in memory with optional namespace and TTL. | 64 | Yes |
| `memory_retrieve` | Retrieve a value by key from memory. | 36 | Yes |
| `memory_query` | Query memory using glob patterns or HNSW semantic vector search. | 64 | Yes |
| `memory_delete` | Delete a memory entry by key. | 29 | Yes |
| `memory_usage` | Get memory usage statistics: entry counts, namespaces, storage size. | 69 | Yes |
| `memory_share` | Share knowledge from one agent to others within a domain. | 57 | Yes |

### Cross-Phase Tools (8)

| Tool | Description | Chars | Compliant |
|---|---|---|---|
| `team_list` | List all active domain teams and their agent counts. | 52 | Yes |
| `team_health` | Get team health, agent utilization, and consensus status. | 57 | Yes |
| `team_message` | Send a typed message between two agents. | 41 | Yes |
| `team_broadcast` | Broadcast a message to all agents in a domain. | 47 | Yes |
| `team_scale` | Scale a domain team to a target agent count. | 45 | Yes |
| `team_rebalance` | Rebalance agents across domain teams based on current load. | 60 | Yes |
| `model_route` | Route a task to the optimal model tier based on complexity. | 59 | Yes |
| `routing_metrics` | Get model routing statistics: tier distribution and cost savings. | 66 | Yes |

### Infrastructure Tools (3)

| Tool | Description | Chars | Compliant |
|---|---|---|---|
| `infra_healing_status` | Get infrastructure self-healing status and recovery stats. | 58 | Yes |
| `infra_healing_feed_output` | Feed test output for automatic infrastructure error detection. | 62 | Yes |
| `infra_healing_recover` | Trigger infrastructure recovery for detected failures. | 54 | Yes |

## Compliance Summary

- **Total tools**: 40+
- **Under 200 chars**: 100%
- **Action verb pattern**: 100%
- **Parameter descriptions**: All parameters have descriptions
- **OpenCode display compatible**: Yes

## Notes

- Tool names use `snake_case` (MCP convention)
- OpenCode prefixes with `mcp:agentic-qe:` for namespacing
- All tools return structured JSON responses
- Large outputs are automatically compacted to stay under 35k tokens

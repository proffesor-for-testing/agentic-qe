---
name: flow-nexus-swarm
description: "Deploy cloud-based AI agent swarms with event-driven workflow automation, message queue processing, and multi-topology orchestration via Flow Nexus platform. Use when deploying cloud swarms, creating event-driven pipelines, or coordinating multi-phase agent workflows."
---

# Flow Nexus Swarm & Workflow Orchestration

Deploy and manage cloud-based AI agent swarms with event-driven workflow automation, message queue processing, and intelligent agent coordination.

## Quick Start

```javascript
// Initialize swarm
mcp__flow-nexus__swarm_init({ topology: "hierarchical", maxAgents: 8, strategy: "balanced" })

// Spawn agents
mcp__flow-nexus__agent_spawn({ type: "researcher", name: "Lead Researcher", capabilities: ["web_search", "analysis"] })

// Orchestrate tasks
mcp__flow-nexus__task_orchestrate({ task: "Build REST API with auth", strategy: "parallel", maxAgents: 5, priority: "high" })
```

## Topology Selection

| Topology | Structure | Best For |
|----------|-----------|----------|
| **Hierarchical** | Tree with coordinators | Complex projects |
| **Mesh** | Peer-to-peer | Research, analysis |
| **Ring** | Circular chain | Sequential workflows |
| **Star** | Central hub | Simple delegation |

## Workflow Automation

### Create Workflow
```javascript
mcp__flow-nexus__workflow_create({
  name: "CI/CD Pipeline",
  steps: [
    { id: "test", action: "run_tests", agent: "tester", parallel: true },
    { id: "build", action: "build_app", agent: "builder", depends_on: ["test"] },
    { id: "deploy", action: "deploy_prod", agent: "deployer", depends_on: ["build"] }
  ],
  triggers: ["push_to_main", "manual_trigger"],
  metadata: { priority: 10, retry_policy: "exponential_backoff" }
})
```

### Execute & Monitor
```javascript
// Async execution for long-running workflows
mcp__flow-nexus__workflow_execute({ workflow_id: "id", input_data: { branch: "main" }, async: true })

// Monitor status
mcp__flow-nexus__workflow_status({ workflow_id: "id", include_metrics: true })
mcp__flow-nexus__workflow_queue_status({ include_messages: true })

// Audit trail
mcp__flow-nexus__workflow_audit_trail({ workflow_id: "id", limit: 50 })
```

## Agent Orchestration Patterns

### Full-Stack Development
```javascript
mcp__flow-nexus__swarm_init({ topology: "hierarchical", maxAgents: 8, strategy: "specialized" })
mcp__flow-nexus__agent_spawn({ type: "coordinator", name: "Project Manager" })
mcp__flow-nexus__agent_spawn({ type: "coder", name: "Backend Developer" })
mcp__flow-nexus__agent_spawn({ type: "coder", name: "Frontend Developer" })
mcp__flow-nexus__agent_spawn({ type: "analyst", name: "QA Engineer" })

mcp__flow-nexus__workflow_create({
  name: "Full-Stack Development",
  steps: [
    { id: "requirements", action: "analyze_requirements", agent: "coordinator" },
    { id: "backend", action: "build_api", agent: "Backend Developer", depends_on: ["requirements"] },
    { id: "frontend", action: "build_ui", agent: "Frontend Developer", depends_on: ["requirements"] },
    { id: "integration", action: "integrate", depends_on: ["backend", "frontend"] },
    { id: "testing", action: "qa_testing", agent: "QA Engineer", depends_on: ["integration"] }
  ]
})
```

### CI/CD Pipeline
```javascript
mcp__flow-nexus__workflow_create({
  name: "Deployment Pipeline",
  steps: [
    { id: "lint", action: "lint_code", parallel: true },
    { id: "unit_test", action: "unit_tests", parallel: true },
    { id: "build", action: "build_artifacts", depends_on: ["lint", "unit_test"] },
    { id: "security_scan", action: "security_scan", depends_on: ["build"] },
    { id: "deploy_staging", action: "deploy", depends_on: ["security_scan"] },
    { id: "smoke_test", action: "smoke_tests", depends_on: ["deploy_staging"] },
    { id: "deploy_prod", action: "deploy", depends_on: ["smoke_test"] }
  ],
  triggers: ["github_push"],
  metadata: { auto_rollback: true }
})
```

## Swarm Management

```javascript
// Scale swarm
mcp__flow-nexus__swarm_scale({ target_agents: 10 })

// Monitor status
mcp__flow-nexus__swarm_status({ swarm_id: "id" })

// List active swarms
mcp__flow-nexus__swarm_list({ status: "active" })

// Intelligent agent assignment
mcp__flow-nexus__workflow_agent_assign({ task_id: "id", use_vector_similarity: true })

// Destroy when complete
mcp__flow-nexus__swarm_destroy({ swarm_id: "id" })
```

## Templates

```javascript
// Use pre-built templates
mcp__flow-nexus__swarm_create_from_template({ template_name: "full-stack-dev", overrides: { maxAgents: 6 } })
mcp__flow-nexus__swarm_templates_list({ category: "all", includeStore: true })
```

**Available**: `full-stack-dev`, `research-team`, `code-review`, `data-pipeline`, `ml-development`, `security-audit`, `enterprise-migration`, `incident-response`

## Real-time Monitoring

```javascript
mcp__flow-nexus__execution_stream_subscribe({ stream_type: "claude-flow-swarm", deployment_id: "id" })
mcp__flow-nexus__execution_files_list({ stream_id: "id", created_by: "claude-flow" })
```

## Best Practices

1. **Topology**: Star for simple tasks, mesh for collaboration, hierarchical for complex projects
2. **Vector similarity**: Enable `use_vector_similarity` for optimal agent matching
3. **Error handling**: Use `exponential_backoff` retry policy with timeouts
4. **Scaling**: Monitor workload and scale when utilization exceeds 80%
5. **Async**: Use `async: true` for long-running workflows
6. **Cleanup**: Always destroy swarms when complete

## Setup

```bash
npm install -g flow-nexus@latest
npx flow-nexus@latest register && npx flow-nexus@latest login
claude mcp add flow-nexus npx flow-nexus@latest mcp start
```

---
name: "flow-nexus-platform"
description: "Manage the Flow Nexus platform: authenticate users, create sandboxes, deploy apps, handle payments and credits, run coding challenges. Use when managing cloud sandboxes, deploying templates, or handling platform operations."
---

# Flow Nexus Platform Management

Authentication, sandbox execution, app deployment, credit management, and coding challenges.

## Quick Start

```javascript
// 1. Register and login
mcp__flow-nexus__user_register({ email: "dev@example.com", password: "SecurePass123!", full_name: "Developer Name" })
mcp__flow-nexus__user_login({ email: "dev@example.com", password: "SecurePass123!" })

// 2. Create sandbox
mcp__flow-nexus__sandbox_create({
  template: "node",  // node | python | react | nextjs | vanilla | base | claude-code
  name: "dev-environment",
  install_packages: ["express", "dotenv"],
  env_vars: { NODE_ENV: "development" }
})

// 3. Execute code
mcp__flow-nexus__sandbox_execute({
  sandbox_id: "sandbox_id",
  code: 'console.log("Hello Flow Nexus!")',
  language: "javascript"
})
```

## Authentication

```javascript
mcp__flow-nexus__user_register({ email, password, full_name, username })
mcp__flow-nexus__user_login({ email, password })
mcp__flow-nexus__auth_status({ detailed: true })
mcp__flow-nexus__user_logout()
mcp__flow-nexus__user_reset_password({ email })
mcp__flow-nexus__user_profile({ user_id })
mcp__flow-nexus__user_update_profile({ user_id, updates: { full_name, bio, github_username } })
```

## Sandbox Management

```javascript
// Create
mcp__flow-nexus__sandbox_create({ template, name, env_vars, install_packages, startup_script, timeout })

// Execute code
mcp__flow-nexus__sandbox_execute({ sandbox_id, code, language, capture_output: true, timeout: 60 })

// Manage
mcp__flow-nexus__sandbox_list({ status: "running" })
mcp__flow-nexus__sandbox_status({ sandbox_id })
mcp__flow-nexus__sandbox_upload({ sandbox_id, file_path, content })
mcp__flow-nexus__sandbox_logs({ sandbox_id, lines: 100 })
mcp__flow-nexus__sandbox_stop({ sandbox_id })
mcp__flow-nexus__sandbox_delete({ sandbox_id })
```

### Common Sandbox Patterns

```javascript
// API Development
mcp__flow-nexus__sandbox_create({
  template: "node", name: "api-dev",
  install_packages: ["express", "cors", "helmet", "jsonwebtoken"],
  env_vars: { PORT: "3000", NODE_ENV: "development" },
  startup_script: "npm run dev"
})

// ML Training
mcp__flow-nexus__sandbox_create({
  template: "python", name: "ml-training",
  install_packages: ["numpy", "pandas", "scikit-learn", "tensorflow"]
})
```

## App Store & Deployment

```javascript
// Browse
mcp__flow-nexus__app_search({ search: "authentication api", category: "backend", limit: 20 })
mcp__flow-nexus__template_list({ category: "backend", featured: true })

// Deploy template
mcp__flow-nexus__template_deploy({
  template_name: "express-api-starter",
  deployment_name: "my-api",
  variables: { database_url: "postgres://..." },
  env_vars: { NODE_ENV: "production", PORT: "8080" }
})

// Publish app
mcp__flow-nexus__app_store_publish_app({
  name: "JWT Auth Service", description: "Production-ready JWT auth",
  category: "backend", version: "1.0.0", source_code: sourceCode,
  tags: ["auth", "jwt", "express"]
})

// Analytics
mcp__flow-nexus__app_analytics({ app_id: "your_app_id", timeframe: "30d" })
```

## Payments & Credits

```javascript
mcp__flow-nexus__check_balance()
mcp__flow-nexus__create_payment_link({ amount: 50 })  // USD, min $10
mcp__flow-nexus__configure_auto_refill({ enabled: true, threshold: 100, amount: 50 })
mcp__flow-nexus__get_payment_history({ limit: 50 })
```

| Tier | Credits/mo | Sandboxes | Price |
|------|-----------|-----------|-------|
| Free | 100 | 2 concurrent | $0 |
| Pro | 1000 | 10 concurrent | $29/mo |
| Enterprise | Unlimited | Unlimited | Custom |

## Challenges

```javascript
mcp__flow-nexus__challenges_list({ difficulty: "intermediate", category: "algorithms" })
mcp__flow-nexus__challenge_submit({
  challenge_id: "challenge_id", user_id: "your_id",
  solution_code: "function twoSum(nums, target) { ... }",
  language: "javascript"
})
mcp__flow-nexus__leaderboard_get({ type: "global", limit: 100 })
```

## Storage & Real-time

```javascript
// File storage
mcp__flow-nexus__storage_upload({ bucket: "private", path: "data/users.json", content: data })
mcp__flow-nexus__storage_list({ bucket: "private", path: "data/" })
mcp__flow-nexus__storage_get_url({ bucket: "private", path: "report.pdf", expires_in: 3600 })

// Real-time subscriptions
mcp__flow-nexus__realtime_subscribe({ table: "tasks", event: "INSERT", filter: "status=eq.pending" })
mcp__flow-nexus__execution_stream_subscribe({ stream_type: "claude-flow-swarm", deployment_id: "id" })
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Login failed | Check email/password, verify email first |
| Token expired | Re-login for fresh tokens |
| Sandbox won't start | Check template compatibility, verify credits |
| Execution timeout | Increase timeout or optimize code |
| Payment failed | Check payment method and funds |

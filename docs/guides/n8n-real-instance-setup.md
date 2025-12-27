# Connecting N8n Agents to a Real N8n Instance

## Current State

The n8n agents are **fully implemented in TypeScript** with:
- Complete `N8nAPIClient` class that handles REST API communication
- 14 specialized agents with real business logic
- 141 passing tests using a mock server

**What's mocked:** The tests use `mock-n8n-server.ts` which simulates the n8n REST API. To go production, you connect to a real n8n instance.

## Quick Start: Connect to Real N8n

### 1. Get Your N8n API Key

```bash
# In n8n UI: Settings → API → Create API Key
# Or via CLI if self-hosted:
n8n user-management:create-api-key
```

### 2. Configure Environment

```bash
# .env file
N8N_BASE_URL=https://your-n8n-instance.com
N8N_API_KEY=n8n_api_xxxxxxxxxxxxxxxxxxxx
```

### 3. Use the Agents

```typescript
import { N8nSecurityAuditorAgent } from '@anthropic/agentic-qe/agents/n8n';

// Create agent with real n8n connection
const securityAuditor = new N8nSecurityAuditorAgent({
  id: 'security-auditor-1',
  name: 'N8n Security Auditor',
  n8nConfig: {
    baseUrl: process.env.N8N_BASE_URL!,
    apiKey: process.env.N8N_API_KEY!,
    timeout: 30000,
    retries: 3,
  },
  memoryStore: yourMemoryStore, // SwarmMemoryManager for learning features
  enableLearning: true,
});

await securityAuditor.initialize();

// Audit a real workflow
const result = await securityAuditor.auditWorkflow('your-workflow-id');
console.log('Risk Score:', result.riskScore);
console.log('Critical Issues:', result.summary.critical);
```

## N8n Deployment Options

### Option A: Docker (Recommended for Testing)

```bash
# Quick start with Docker
docker run -d \
  --name n8n \
  -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=admin \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n

# Access at http://localhost:5678
# Create API key in Settings → API
```

### Option B: Docker Compose (Production-like)

```yaml
# docker-compose.yml
version: '3.8'
services:
  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD:-admin}
      - WEBHOOK_URL=http://localhost:5678/
      - GENERIC_TIMEZONE=UTC
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD:-n8n}
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-n8n}
      - POSTGRES_DB=n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  n8n_data:
  postgres_data:
```

```bash
docker-compose up -d
```

### Option C: n8n Cloud

1. Sign up at https://n8n.io/cloud
2. Get your instance URL (e.g., `https://yourname.app.n8n.cloud`)
3. Create API key in Settings → API

## API Endpoints Used by Agents

The agents use these n8n REST API endpoints:

| Endpoint | Method | Used By |
|----------|--------|---------|
| `/api/v1/workflows` | GET | All agents (list workflows) |
| `/api/v1/workflows/:id` | GET | All agents (get workflow details) |
| `/api/v1/workflows/:id/execute` | POST | WorkflowExecutor |
| `/api/v1/workflows/:id/activate` | POST | WorkflowExecutor |
| `/api/v1/workflows/:id/deactivate` | POST | WorkflowExecutor |
| `/api/v1/executions` | GET | WorkflowExecutor, PerformanceTester |
| `/api/v1/executions/:id` | GET | WorkflowExecutor |
| `/api/v1/credentials` | GET | NodeValidator, IntegrationTester |

## Integration Test Example

```typescript
// tests/n8n/real-n8n.integration.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { N8nSecurityAuditorAgent } from '../../src/agents/n8n';
import { N8nAPIClient } from '../../src/agents/n8n/N8nAPIClient';

describe('N8n Agents - Real Instance', () => {
  const n8nConfig = {
    baseUrl: process.env.N8N_BASE_URL || 'http://localhost:5678',
    apiKey: process.env.N8N_API_KEY || '',
    timeout: 30000,
    retries: 2,
  };

  beforeAll(async () => {
    // Skip if no API key configured
    if (!n8nConfig.apiKey) {
      console.log('Skipping real n8n tests - N8N_API_KEY not set');
      return;
    }

    // Verify connection
    const client = new N8nAPIClient(n8nConfig);
    const connected = await client.testConnection();
    expect(connected).toBe(true);
  });

  it('should audit real workflow for security issues', async () => {
    if (!n8nConfig.apiKey) return;

    const agent = new N8nSecurityAuditorAgent({
      id: 'test-auditor',
      name: 'Test Security Auditor',
      n8nConfig,
      enableLearning: false, // Disable for simple test
    });

    await agent.initialize();

    // List workflows and audit the first one
    const client = new N8nAPIClient(n8nConfig);
    const workflows = await client.listWorkflows();

    if (workflows.length > 0) {
      const result = await agent.auditWorkflow(workflows[0].id);

      expect(result.workflowId).toBe(workflows[0].id);
      expect(result.riskScore).toBeGreaterThanOrEqual(0);
      expect(result.riskScore).toBeLessThanOrEqual(100);
      expect(result.owaspCompliance).toBeDefined();
    }
  });
});
```

Run with:
```bash
N8N_BASE_URL=http://localhost:5678 \
N8N_API_KEY=your-api-key \
npm run test:integration -- tests/n8n/real-n8n.integration.test.ts
```

## Production Checklist

### Security
- [ ] Use HTTPS for n8n instance
- [ ] Store API key in secrets manager (not env vars in production)
- [ ] Limit API key permissions (read-only if just auditing)
- [ ] Enable n8n audit logging

### Reliability
- [ ] Configure appropriate timeouts (30s default)
- [ ] Enable retries (3 by default)
- [ ] Use connection pooling for high-volume usage
- [ ] Monitor API rate limits

### Performance
- [ ] Enable workflow caching (60s TTL default)
- [ ] Use batch operations where possible
- [ ] Consider running agents in parallel for multiple workflows

## Agent-Specific Configuration

### SecurityAuditorAgent
```typescript
const securityAgent = new N8nSecurityAuditorAgent({
  n8nConfig,
  // Custom secret patterns (adds to defaults)
  secretPatterns: [
    /my-custom-key-pattern/,
  ],
  // OWASP checks to run
  owaspChecks: ['A01', 'A02', 'A03', 'A04', 'A05'],
  // Minimum severity to report
  severityThreshold: 'medium',
});
```

### WorkflowExecutorAgent
```typescript
const executor = new N8nWorkflowExecutorAgent({
  n8nConfig,
  // Timeout for workflow execution
  executionTimeout: 60000,
  // Poll interval when waiting for completion
  pollInterval: 1000,
});
```

### ComplianceValidatorAgent
```typescript
const compliance = new N8nComplianceValidatorAgent({
  n8nConfig,
  // Frameworks to check
  frameworks: ['GDPR', 'HIPAA', 'SOC2'],
  // Custom compliance policies
  customPolicies: [{
    id: 'my-policy',
    name: 'Internal Data Policy',
    rules: [/* ... */],
  }],
});
```

## Troubleshooting

### Connection Issues

```typescript
// Test connection
const client = new N8nAPIClient(n8nConfig);
const connected = await client.testConnection();
if (!connected) {
  console.error('Failed to connect to n8n');
  // Check: URL correct? API key valid? Network accessible?
}
```

### API Key Errors

```
N8nAPIError: N8n API error: Invalid API key
```
- Verify API key in n8n UI: Settings → API
- Check key hasn't expired
- Ensure correct header format: `X-N8N-API-KEY`

### Rate Limiting

n8n doesn't have explicit rate limits, but for high-volume usage:
```typescript
// Add delay between requests
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

for (const workflow of workflows) {
  await agent.auditWorkflow(workflow.id);
  await delay(100); // 100ms between audits
}
```

## Next Steps

1. **Start n8n instance** (Docker recommended)
2. **Create API key** in n8n UI
3. **Set environment variables** (`N8N_BASE_URL`, `N8N_API_KEY`)
4. **Run integration tests** to verify connection
5. **Deploy agents** in your CI/CD pipeline

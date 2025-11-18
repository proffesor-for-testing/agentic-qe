# Adapter Configuration Guide

## Overview

The Agentic QE Fleet uses an **explicit adapter configuration** architecture to ensure production systems always use the correct database adapter. This guide explains how to configure adapters for different environments.

## Why Explicit Configuration?

**Problem**: Previous versions used runtime adapter selection with silent fallbacks. If the real AgentDB adapter failed to initialize, the system would silently use a mock (in-memory) adapter, leading to data loss.

**Solution**: Explicit adapter configuration with fail-fast validation ensures:
- Production systems never accidentally use mock adapters
- Configuration errors are caught immediately at startup
- Clear error messages guide troubleshooting

## Adapter Types

### AdapterType.REAL (Production)

Uses the real AgentDB package for persistent storage.

**When to use:**
- Production deployments
- Development with real database
- Integration testing with actual database

**Requirements:**
- `agentdb` package installed
- Valid database file path
- Write permissions to database directory

**Example:**
```typescript
import { createAgentDBManager, AdapterType } from '@/core/memory';

const manager = createAgentDBManager({
  adapter: {
    type: AdapterType.REAL,
    dbPath: '.agentic-qe/agentdb.db',
    dimension: 384,
    failFast: true
  }
});

await manager.initialize();
```

### AdapterType.MOCK (Testing)

Uses an in-memory mock adapter for testing.

**When to use:**
- Unit tests
- Integration tests without database
- Quick prototyping
- CI/CD environments without database

**Characteristics:**
- No persistence (data lost when process terminates)
- No file system dependencies
- Fast initialization
- Simplified test setup

**Example:**
```typescript
import { createAgentDBManager, AdapterType } from '@/core/memory';

const manager = createAgentDBManager({
  adapter: {
    type: AdapterType.MOCK,
    dimension: 384
  }
});

await manager.initialize();
```

### AdapterType.AUTO (Deprecated)

Auto-detection based on environment. **DO NOT USE** - will be removed in v2.0.0.

## Configuration Methods

### 1. Helper Functions (Recommended)

Use `AdapterConfigHelper` for common scenarios:

#### Production

```typescript
import { createAgentDBManager, AdapterConfigHelper } from '@/core/memory';

const manager = createAgentDBManager({
  adapter: AdapterConfigHelper.forProduction('/data/agentdb.db')
});
```

#### Development

```typescript
const manager = createAgentDBManager({
  adapter: AdapterConfigHelper.forDevelopment('.agentic-qe/dev.db')
});
```

#### Testing

```typescript
const manager = createAgentDBManager({
  adapter: AdapterConfigHelper.forTesting()
});
```

### 2. Environment Variables

Set explicit adapter type via environment:

```bash
# Production
export AQE_ADAPTER_TYPE=real
export AGENTDB_PATH=/data/agentdb.db

# Testing
export AQE_ADAPTER_TYPE=mock
```

```typescript
import { createAgentDBManager, AdapterConfigHelper } from '@/core/memory';

const manager = createAgentDBManager({
  adapter: AdapterConfigHelper.fromEnvironment()
});
```

### 3. Explicit Configuration

Full control with explicit config object:

```typescript
import { createAgentDBManager, AdapterType } from '@/core/memory';

const manager = createAgentDBManager({
  adapter: {
    type: AdapterType.REAL,
    dbPath: process.env.AGENTDB_PATH || '.agentic-qe/agentdb.db',
    dimension: parseInt(process.env.AGENTDB_DIMENSION || '384'),
    failFast: process.env.NODE_ENV === 'production',
    validateOnStartup: true
  },
  enableQUICSync: false,
  enableLearning: true,
  cacheSize: 10000
});
```

## Environment-Specific Setup

### Local Development

```bash
# .env.development
AQE_ADAPTER_TYPE=real
AGENTDB_PATH=.agentic-qe/dev.db
AGENTDB_FAIL_FAST=true
```

### Testing

```bash
# .env.test
AQE_ADAPTER_TYPE=mock
NODE_ENV=test
```

### Production

```bash
# .env.production
AQE_ADAPTER_TYPE=real
AGENTDB_PATH=/data/agentdb.db
AGENTDB_FAIL_FAST=true
AGENTDB_VALIDATE=true
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy application
COPY . .

# Set adapter configuration
ENV AQE_ADAPTER_TYPE=real
ENV AGENTDB_PATH=/data/agentdb.db
ENV AGENTDB_FAIL_FAST=true

# Create data directory
RUN mkdir -p /data && chown node:node /data

USER node

# Mount volume for database
VOLUME /data

CMD ["npm", "start"]
```

### Docker Compose

```yaml
version: '3.8'

services:
  aqe-fleet:
    build: .
    environment:
      AQE_ADAPTER_TYPE: real
      AGENTDB_PATH: /data/agentdb.db
      AGENTDB_FAIL_FAST: "true"
    volumes:
      - agentdb-data:/data
    restart: unless-stopped

volumes:
  agentdb-data:
    driver: local
```

## Kubernetes Deployment

### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: agentdb-config
  namespace: agentic-qe
data:
  AQE_ADAPTER_TYPE: "real"
  AGENTDB_PATH: "/data/agentdb.db"
  AGENTDB_FAIL_FAST: "true"
  AGENTDB_DIMENSION: "384"
```

### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aqe-fleet
  namespace: agentic-qe
spec:
  replicas: 3
  selector:
    matchLabels:
      app: aqe-fleet
  template:
    metadata:
      labels:
        app: aqe-fleet
    spec:
      containers:
      - name: aqe-fleet
        image: aqe-fleet:latest
        envFrom:
        - configMapRef:
            name: agentdb-config
        volumeMounts:
        - name: agentdb-storage
          mountPath: /data
      volumes:
      - name: agentdb-storage
        persistentVolumeClaim:
          claimName: agentdb-pvc
```

## Testing Setup

### Jest Configuration

```typescript
// tests/setup.ts
import { createAgentDBManager, AdapterConfigHelper } from '@/core/memory';

let testManager: AgentDBManager;

beforeAll(async () => {
  // Use mock adapter for all tests
  testManager = createAgentDBManager({
    adapter: AdapterConfigHelper.forTesting()
  });
  await testManager.initialize();
});

afterAll(async () => {
  await testManager.close();
});

export { testManager };
```

### Unit Test Example

```typescript
import { createAgentDBManager, AdapterType } from '@/core/memory';

describe('MyService', () => {
  let manager: AgentDBManager;

  beforeEach(async () => {
    manager = createAgentDBManager({
      adapter: {
        type: AdapterType.MOCK,
        dimension: 384
      }
    });
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.close();
  });

  it('should store and retrieve patterns', async () => {
    const pattern = {
      id: 'test-1',
      type: 'test',
      domain: 'testing',
      pattern_data: '{}',
      confidence: 0.9,
      usage_count: 0,
      success_count: 0,
      created_at: Date.now(),
      last_used: Date.now()
    };

    await manager.store(pattern);
    // ... test assertions
  });
});
```

## Validation and Error Handling

### Configuration Validation

The system validates configuration at startup:

```typescript
import { AdapterConfigValidator, AdapterType } from '@/core/memory';

const config = {
  type: AdapterType.REAL
  // Missing dbPath!
};

const result = AdapterConfigValidator.validate(config);

if (!result.valid) {
  console.error('Configuration errors:', result.errors);
  // Output: ["dbPath is required for AdapterType.REAL"]
}
```

### Fail-Fast Behavior

By default, invalid configuration throws immediately:

```typescript
try {
  const manager = createAgentDBManager({
    adapter: {
      type: AdapterType.REAL
      // Missing dbPath
    }
  });
  await manager.initialize();
} catch (error) {
  // AdapterConfigurationError: Invalid adapter configuration:
  //   - dbPath is required for AdapterType.REAL
}
```

### Troubleshooting Common Errors

#### Error: "dbPath is required for AdapterType.REAL"

**Cause**: Attempting to use REAL adapter without database path.

**Solution**:
```typescript
adapter: {
  type: AdapterType.REAL,
  dbPath: '.agentic-qe/agentdb.db' // Add this
}
```

#### Error: "agentdb package not installed"

**Cause**: Real adapter requires the `agentdb` package.

**Solution**:
```bash
npm install agentdb
```

#### Error: "EACCES: permission denied"

**Cause**: No write permissions to database directory.

**Solution**:
```bash
mkdir -p .agentic-qe
chmod 755 .agentic-qe
```

#### Error: "Database file is locked"

**Cause**: Another process is using the database file.

**Solution**:
- Ensure only one process accesses the database
- Close other AgentDBManager instances
- Check for zombie processes

## Migration from Legacy Configuration

### Before (v1.x)

```typescript
// Implicit dbPath (DEPRECATED)
const manager = createAgentDBManager({
  dbPath: '.agentic-qe/agentdb.db'
});

// Environment variable (DEPRECATED)
export AQE_USE_MOCK_AGENTDB=true
```

### After (v2.0+)

```typescript
// Explicit adapter configuration
import { AdapterType } from '@/core/memory';

const manager = createAgentDBManager({
  adapter: {
    type: AdapterType.REAL,
    dbPath: '.agentic-qe/agentdb.db'
  }
});

// Environment variable
export AQE_ADAPTER_TYPE=real
```

## Best Practices

1. **Always Use Explicit Configuration**: Never rely on auto-detection
2. **Fail-Fast in Production**: Set `failFast: true` to catch errors immediately
3. **Validate at Startup**: Enable `validateOnStartup: true`
4. **Use Helper Functions**: Prefer `AdapterConfigHelper.forProduction()` over manual config
5. **Test with Mock Adapter**: Use `AdapterType.MOCK` for unit tests
6. **Environment Variables for Deployment**: Use `AQE_ADAPTER_TYPE` in Docker/K8s
7. **Separate Data Directories**: Use different `dbPath` for dev/staging/prod
8. **Volume Mounts for Persistence**: Mount `/data` volume in containers
9. **Monitor Initialization**: Log adapter type and path at startup
10. **Document Configuration**: Include adapter config in deployment docs

## Reference

### Environment Variables

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `AQE_ADAPTER_TYPE` | `real`, `mock` | `real` (prod), `mock` (test) | Adapter type to use |
| `AGENTDB_PATH` | File path | `.agentic-qe/agentdb.db` | Database file path |
| `AGENTDB_DIMENSION` | Number | `384` | Embedding dimension |
| `AGENTDB_FAIL_FAST` | `true`, `false` | `true` | Fail immediately on errors |
| `AGENTDB_VALIDATE` | `true`, `false` | `true` | Validate configuration at startup |

### Configuration Options

```typescript
interface AdapterConfig {
  type: AdapterType;           // Required: 'real' or 'mock'
  dbPath?: string;             // Required for 'real'
  dimension?: number;          // Default: 384
  failFast?: boolean;          // Default: true
  validateOnStartup?: boolean; // Default: true
}
```

## Support

- **Documentation**: [docs/architecture/ADR-001-adapter-configuration.md](../architecture/ADR-001-adapter-configuration.md)
- **API Reference**: [docs/api/adapter-config.md](../api/adapter-config.md)
- **Issues**: https://github.com/ruvnet/agentic-qe-cf/issues
- **Examples**: [examples/adapter-configuration](../../examples/adapter-configuration)

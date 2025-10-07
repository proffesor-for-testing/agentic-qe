# Agentic QE Fleet - Configuration Guide

## Overview

Agentic QE Fleet can be configured through multiple methods:
1. **Environment Variables** - For runtime configuration
2. **Configuration File** - `.agentic-qe/config.json` for persistent settings
3. **CLI Options** - For command-specific overrides
4. **Fleet YAML** - `config/fleet.yaml` for advanced fleet coordination

## Environment Variables

### Core Configuration

```bash
# Fleet Identification
FLEET_ID=my-project-fleet              # Unique fleet identifier
FLEET_NAME="My Project QE Fleet"       # Human-readable fleet name

# Fleet Size and Performance
MAX_AGENTS=20                          # Maximum concurrent agents (default: 20)
HEARTBEAT_INTERVAL=30000               # Health check interval in ms (default: 30000)
AGENT_TIMEOUT=300000                   # Agent operation timeout in ms (default: 300000)

# Memory Configuration
MEMORY_PARTITION_SIZE=100MB            # Memory partition size (default: 100MB)
MEMORY_TTL=3600                        # Default memory TTL in seconds (default: 3600)
MEMORY_CLEANUP_INTERVAL=600            # Memory cleanup interval in seconds (default: 600)
```

### Database Configuration

```bash
# Database Type (sqlite or postgres)
DB_TYPE=sqlite                         # Database type (default: sqlite)
DB_FILENAME=./data/fleet.db            # SQLite database file (default: ./data/fleet.db)

# PostgreSQL Configuration (if DB_TYPE=postgres)
DB_HOST=localhost                      # PostgreSQL host
DB_PORT=5432                           # PostgreSQL port
DB_NAME=agentic_qe                     # PostgreSQL database name
DB_USER=aqe_user                       # PostgreSQL username
DB_PASSWORD=secure_password            # PostgreSQL password
DB_SSL=true                            # Enable SSL connection
```

### Logging Configuration

```bash
# Logging Levels: error, warn, info, debug, verbose
LOG_LEVEL=info                         # Log level (default: info)
LOG_FORMAT=json                        # Log format: json or text (default: json)
LOG_FILE=./logs/aqe.log                # Log file path (default: ./logs/aqe.log)
LOG_MAX_SIZE=10m                       # Max log file size (default: 10m)
LOG_MAX_FILES=5                        # Max number of log files (default: 5)
```

### API Configuration (Optional)

```bash
# REST API Server (if enabled)
API_ENABLED=true                       # Enable REST API (default: false)
API_PORT=3000                          # API server port (default: 3000)
API_HOST=localhost                     # API server host (default: localhost)
API_CORS_ENABLED=true                  # Enable CORS (default: false)
API_RATE_LIMIT=100                     # Requests per minute (default: 100)
```

### Test Execution Configuration

```bash
# Test Execution Defaults
TEST_TIMEOUT=30000                     # Test timeout in ms (default: 30000)
TEST_RETRY_COUNT=3                     # Number of retries for failed tests (default: 3)
TEST_PARALLEL_WORKERS=4                # Parallel test workers (default: 4)
TEST_COVERAGE_THRESHOLD=80             # Coverage threshold percentage (default: 80)
```

### Security Configuration

```bash
# Security Settings
SECURITY_SCAN_ENABLED=true             # Enable security scanning (default: true)
SECURITY_SCAN_DEPTH=standard           # Scan depth: basic, standard, deep (default: standard)
SECURITY_FAIL_ON_HIGH=true             # Fail on high-severity vulnerabilities (default: true)
```

### Example .env File

```bash
# .env
# Agentic QE Fleet Configuration

# Fleet Settings
FLEET_ID=my-app-qe-fleet
FLEET_NAME="My Application QE Fleet"
MAX_AGENTS=20
HEARTBEAT_INTERVAL=30000

# Database
DB_TYPE=sqlite
DB_FILENAME=./data/fleet.db

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=./logs/aqe.log

# Test Execution
TEST_TIMEOUT=30000
TEST_RETRY_COUNT=3
TEST_PARALLEL_WORKERS=4
TEST_COVERAGE_THRESHOLD=85

# Security
SECURITY_SCAN_ENABLED=true
SECURITY_FAIL_ON_HIGH=true
```

## Configuration File (.agentic-qe/config.json)

### Structure

```json
{
  "version": "1.0",
  "fleet": {
    "id": "my-project-fleet",
    "name": "My Project QE Fleet",
    "maxAgents": 20,
    "topology": "mesh",
    "heartbeatInterval": 30000
  },
  "agents": {
    "test-generator": {
      "count": 2,
      "config": {
        "targetCoverage": 95,
        "framework": "jest",
        "testStyle": "property-based",
        "aiEnhancement": true
      }
    },
    "test-executor": {
      "count": 3,
      "config": {
        "frameworks": ["jest", "cypress", "playwright"],
        "maxParallelTests": 8,
        "timeout": 300000,
        "retryCount": 3
      }
    },
    "coverage-analyzer": {
      "count": 2,
      "config": {
        "targetCoverage": 95,
        "optimizationAlgorithm": "sublinear",
        "gapDetection": true
      }
    },
    "quality-analyzer": {
      "count": 2,
      "config": {
        "tools": ["eslint", "sonarqube", "lighthouse"],
        "thresholds": {
          "coverage": 85,
          "complexity": 10,
          "maintainability": 65,
          "security": 90
        }
      }
    }
  },
  "memory": {
    "partitionSize": "100MB",
    "defaultTTL": 3600,
    "cleanupInterval": 600,
    "encryption": true
  },
  "testing": {
    "defaultTimeout": 30000,
    "retryCount": 3,
    "parallelWorkers": 4,
    "coverageThreshold": 85,
    "reportFormat": "html"
  },
  "security": {
    "scanEnabled": true,
    "scanDepth": "standard",
    "failOnHigh": true,
    "tools": ["eslint-security", "semgrep", "npm-audit"]
  }
}
```

### Agent-Specific Configuration

Each agent type can have custom configuration:

#### Test Generator Agent

```json
{
  "agents": {
    "test-generator": {
      "config": {
        "targetCoverage": 95,
        "framework": "jest",
        "testStyle": "property-based",
        "aiEnhancement": true,
        "edgeCaseDetection": true,
        "mockGeneration": true,
        "assertionStyle": "expect",
        "testStructure": "describe-it"
      }
    }
  }
}
```

#### Test Executor Agent

```json
{
  "agents": {
    "test-executor": {
      "config": {
        "frameworks": ["jest", "cypress", "playwright"],
        "maxParallelTests": 8,
        "timeout": 300000,
        "retryCount": 3,
        "retryDelay": 1000,
        "continueOnFailure": true,
        "collectCoverage": true,
        "loadBalancing": "round-robin"
      }
    }
  }
}
```

#### Coverage Analyzer Agent

```json
{
  "agents": {
    "coverage-analyzer": {
      "config": {
        "targetCoverage": 95,
        "optimizationAlgorithm": "sublinear",
        "gapDetection": true,
        "prioritization": "complexity",
        "analysisType": "comprehensive",
        "generateSuggestions": true
      }
    }
  }
}
```

## Fleet Configuration (config/fleet.yaml)

### Complete Example

```yaml
# config/fleet.yaml
fleet:
  id: "my-project-fleet"
  name: "My Project QE Fleet"
  maxAgents: 20
  topology: mesh  # mesh, hierarchical, ring, star

  coordination:
    strategy: adaptive  # adaptive, balanced, specialized
    heartbeatInterval: 30000
    healthCheckTimeout: 10000

  resources:
    maxMemoryPerAgent: 512MB
    maxCPUPerAgent: 1.0
    diskQuota: 10GB

agents:
  # Test Generator Configuration
  test-generator:
    count: 2
    priority: high
    config:
      frameworks: [jest, mocha, vitest]
      targetCoverage: 95
      testTypes: [unit, integration, property-based]
      aiEnhancement: true

  # Test Executor Configuration
  test-executor:
    count: 3
    priority: high
    config:
      frameworks: [jest, cypress, playwright]
      maxParallelTests: 8
      timeout: 300000
      retryLogic:
        enabled: true
        maxRetries: 3
        retryDelay: 1000

  # Coverage Analyzer Configuration
  coverage-analyzer:
    count: 2
    priority: medium
    config:
      targetCoverage: 95
      optimizationAlgorithm: sublinear
      gapDetection:
        enabled: true
        prioritization: complexity

  # Quality Gate Configuration
  quality-gate:
    count: 1
    priority: high
    config:
      thresholds:
        coverage: 85
        complexity: 10
        maintainability: 65
        security: 90
        performance: 85
      blockOnFailure: true

  # Security Scanner Configuration
  security-scanner:
    count: 1
    priority: high
    config:
      scanTypes: [sast, dast, dependency]
      severity: high
      compliance: [OWASP-Top-10, CWE-Top-25]

  # Performance Tester Configuration
  performance-tester:
    count: 1
    priority: medium
    config:
      tools: [k6, jmeter, gatling]
      loadProfiles:
        - name: light
          users: 10
          duration: 60s
        - name: moderate
          users: 50
          duration: 300s
        - name: heavy
          users: 100
          duration: 600s

memory:
  backend: sqlite  # sqlite or postgres
  database:
    type: sqlite
    filename: ./data/memory.db

  partitions:
    aqe: 100MB
    swarm: 50MB
    agent: 200MB

  ttl:
    default: 3600
    temporary: 300
    permanent: 0

  cleanup:
    enabled: true
    interval: 600
    aggressive: false

logging:
  level: info  # error, warn, info, debug, verbose
  format: json  # json or text
  outputs:
    - type: file
      filename: ./logs/aqe.log
      maxSize: 10m
      maxFiles: 5
    - type: console
      colorize: true

  components:
    fleet: info
    agents: info
    memory: warn
    events: debug

testing:
  defaults:
    timeout: 30000
    retryCount: 3
    parallelWorkers: 4

  coverage:
    enabled: true
    threshold: 85
    reporters: [html, lcov, text]

  reporting:
    format: json
    outputDir: ./reports
    includeSkipped: false

security:
  scanning:
    enabled: true
    schedule: daily
    depth: standard  # basic, standard, deep

  tools:
    - name: eslint-security
      enabled: true
    - name: semgrep
      enabled: true
      config: ./semgrep.yml
    - name: npm-audit
      enabled: true
      severity: moderate

  policies:
    failOnHigh: true
    blockOnCritical: true
    exemptions: []
```

## CLI Configuration Commands

### View Current Configuration

```bash
# Show all configuration
aqe config show

# Show specific configuration key
aqe config get --key fleet.maxAgents
```

### Update Configuration

```bash
# Set configuration value
aqe config set --key fleet.maxAgents --value 30

# Set nested configuration
aqe config set --key agents.test-generator.config.targetCoverage --value 95
```

### Configuration Validation

```bash
# Validate configuration file
aqe config validate --file .agentic-qe/config.json

# Validate fleet YAML
aqe config validate --file config/fleet.yaml
```

## Configuration Priority

Configuration is applied in the following order (highest to lowest):

1. **CLI Options** - Command-line arguments
2. **Environment Variables** - Runtime environment
3. **Configuration File** - `.agentic-qe/config.json`
4. **Fleet YAML** - `config/fleet.yaml`
5. **Defaults** - Built-in default values

Example:
```bash
# Coverage threshold resolution:
# 1. CLI: --coverage 90
# 2. ENV: TEST_COVERAGE_THRESHOLD=85
# 3. Config: "testing.coverageThreshold": 80
# 4. YAML: testing.coverage.threshold: 75
# 5. Default: 70

# Result: 90 (from CLI)
```

## Best Practices

### 1. Use Environment Variables for Secrets

Never commit secrets to configuration files:
```bash
# .env (not committed)
DB_PASSWORD=secure_password
API_KEY=secret_key
```

### 2. Separate Development and Production Configs

```bash
# Development
.env.development

# Production
.env.production
```

Load based on environment:
```bash
NODE_ENV=production aqe execute
```

### 3. Version Control Configuration

Commit these files:
- `.agentic-qe/config.json` (without secrets)
- `config/fleet.yaml` (without secrets)
- `.env.example` (template with no values)

Do NOT commit:
- `.env` (actual secrets)
- `.env.local` (local overrides)

### 4. Use Fleet YAML for Complex Setups

For multi-agent coordination and advanced features, use `fleet.yaml`:
```yaml
fleet:
  topology: hierarchical
  coordination:
    strategy: adaptive
```

### 5. Validate Configuration Before Deployment

```bash
# Always validate before deploying
aqe config validate --file config/fleet.yaml
aqe config validate --file .agentic-qe/config.json
```

## Troubleshooting

### Configuration Not Loading

**Check configuration file location:**
```bash
ls -la .agentic-qe/config.json
ls -la config/fleet.yaml
```

**Validate JSON syntax:**
```bash
cat .agentic-qe/config.json | jq .
```

### Environment Variables Not Applied

**Check environment variable names:**
```bash
env | grep AQE
env | grep FLEET
```

**Verify environment file is loaded:**
```bash
# Load .env explicitly
source .env
aqe execute
```

### Agent Configuration Not Working

**Check agent name spelling:**
```bash
# Correct agent names
aqe config get --key agents.test-generator
aqe config get --key agents.test-executor
aqe config get --key agents.coverage-analyzer
```

## Examples

### Minimal Configuration

```json
{
  "version": "1.0",
  "fleet": {
    "maxAgents": 10
  },
  "testing": {
    "coverageThreshold": 80
  }
}
```

### Production Configuration

```json
{
  "version": "1.0",
  "fleet": {
    "id": "production-qe-fleet",
    "name": "Production QE Fleet",
    "maxAgents": 50,
    "topology": "mesh"
  },
  "agents": {
    "test-executor": {
      "count": 10,
      "config": {
        "maxParallelTests": 20,
        "timeout": 600000
      }
    }
  },
  "memory": {
    "encryption": true,
    "partitionSize": "500MB"
  },
  "security": {
    "scanEnabled": true,
    "scanDepth": "deep",
    "failOnHigh": true
  },
  "logging": {
    "level": "warn",
    "format": "json"
  }
}
```

## Related Documentation

- [User Guide](./USER-GUIDE.md) - Getting started guide
- [Troubleshooting](./TROUBLESHOOTING.md) - Common issues and solutions
- [API Reference](./API.md) - Programmatic API documentation
- [MCP Integration](./guides/MCP-INTEGRATION.md) - Claude Code integration

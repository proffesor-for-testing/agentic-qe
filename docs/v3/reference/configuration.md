# Configuration Reference

Complete reference for Agentic QE v3 configuration.

## Configuration File

Create `.agentic-qe/config.yaml` in your project root:

```yaml
v3:
  version: "3.0.0"

  # ============================================
  # DOMAIN CONFIGURATION
  # ============================================
  domains:
    - test-generation
    - test-execution
    - coverage-analysis
    - quality-assessment
    - defect-intelligence
    - code-intelligence
    - requirements-validation
    - security-compliance
    - contract-testing
    - visual-accessibility
    - chaos-resilience
    - learning-optimization

  # ============================================
  # AGENT CONFIGURATION
  # ============================================
  agents:
    maxConcurrent: 15          # Max concurrent agents
    timeout: 300000            # Agent timeout (ms)
    retryOnFailure: true       # Retry failed agents
    maxRetries: 3              # Max retry attempts

  # ============================================
  # MEMORY CONFIGURATION
  # ============================================
  memory:
    backend: hybrid            # sqlite | agentdb | hybrid

    sqlite:
      path: .agentic-qe/memory.db

    agentdb:
      enabled: true

    hnsw:
      enabled: true
      M: 16                    # Connections per layer
      efConstruction: 200      # Construction quality
      efSearch: 100            # Search quality

  # ============================================
  # LEARNING CONFIGURATION
  # ============================================
  learning:
    enabled: true
    neuralLearning: true
    patternRetention: 180      # Days to retain patterns
    transferEnabled: true
    consolidationSchedule: "0 18 * * 5"  # Friday 6pm

  # ============================================
  # COVERAGE CONFIGURATION
  # ============================================
  coverage:
    algorithm: sublinear       # sublinear | traditional
    thresholds:
      statements: 80
      branches: 75
      functions: 85
      lines: 80
    newCodeThreshold: 85
    riskWeighted: true

  # ============================================
  # QUALITY GATES
  # ============================================
  qualityGates:
    coverage:
      min: 80
      blocking: true
    complexity:
      max: 15
      blocking: false
    vulnerabilities:
      critical: 0
      high: 0
      blocking: true
    duplications:
      max: 3
      blocking: false

  # ============================================
  # SECURITY CONFIGURATION
  # ============================================
  security:
    scanOnCommit: true
    scanDependencies: true
    blockOnCritical: true
    compliance:
      - soc2
      - gdpr

  # ============================================
  # CODE INTELLIGENCE
  # ============================================
  codeIntelligence:
    indexOnChange: true
    incrementalIndex: true
    semanticSearch: true
    embeddingModel: code-embedding
    embeddingDimensions: 384

  # ============================================
  # TEST EXECUTION
  # ============================================
  execution:
    parallel: true
    workers: auto              # auto = CPU cores - 1
    timeout: 30000
    retryFlaky: true
    maxRetries: 3
    retryDelay: 1000

  # ============================================
  # HOOKS
  # ============================================
  hooks:
    enabled: true
    preTask: true
    postTask: true
    postEdit: true
    sessionRestore: true

  # ============================================
  # BACKGROUND WORKERS
  # ============================================
  workers:
    count: 12
    idleTimeout: 60000

  # ============================================
  # REPORTING
  # ============================================
  reporting:
    formats:
      - json
      - html
      - junit
    outputDir: reports/
    includeTimings: true
    includeLogs: true
```

## Environment Variables

Override config with environment variables:

```bash
# Core settings
AQE_V3_MAX_AGENTS=15
AQE_V3_MEMORY_BACKEND=hybrid

# HNSW settings
AQE_V3_HNSW_ENABLED=true
AQE_V3_HNSW_M=16
AQE_V3_HNSW_EF_CONSTRUCTION=200
AQE_V3_HNSW_EF_SEARCH=100

# Learning
AQE_V3_NEURAL_LEARNING=true
AQE_V3_PATTERN_RETENTION=180

# Coverage
AQE_V3_COVERAGE_ALGORITHM=sublinear
AQE_V3_COVERAGE_THRESHOLD=80

# Security
AQE_V3_SECURITY_SCAN_ON_COMMIT=true
AQE_V3_BLOCK_ON_CRITICAL=true
```

### Background workers (MCP server)

The MCP server (`aqe-mcp`) starts a background worker daemon and the
QualityDaemon after it is ready. These variables control them. They are read
from the MCP server's environment, for example the `env` block that
`aqe init` writes into `.mcp.json`.

| Variable | Default | Effect |
|----------|---------|--------|
| `AQE_WORKERS_ENABLED` | `true` (unset) | `false`, `0`, `off` or `no` starts neither the worker daemon nor the QualityDaemon. Any other value, or unset, starts both. `aqe init --no-database` writes `false`. |
| `AQE_DISABLED_WORKERS` | empty | Comma-separated worker ids to skip, for example `learning-consolidation,security-scan`. Unknown ids are reported on stderr and ignored. |
| `AQE_DREAM_INSIGHTS_RETENTION_DAYS` | `30` | The `learning-consolidation` worker deletes unapplied `dream_insights` rows older than this many days. `0` or `off` disables the sweep. Any value that is not a whole number from 1 to 36500 is rejected with a warning on stderr, and the default applies. |

Worker ids: `test-health`, `coverage-tracker`, `flaky-detector`,
`security-scan`, `quality-gate`, `learning-consolidation`,
`defect-predictor`, `regression-monitor`, `performance-baseline`,
`compliance-checker`, `heartbeat-scheduler`.

The `dream_insights` sweep never runs on the first tick after the server
starts, so a short MCP session never deletes insights. It runs from the next
scheduled tick, 30 minutes later. Each deletion is logged on stderr with the
row count and the retention window, for example
`[AQE] dream_insights retention: deleted 3 unapplied insight(s) older than 30 days`.
Deleted rows are not archived, so set `AQE_DREAM_INSIGHTS_RETENTION_DAYS=off`
if you need to keep the full insight history.

```bash
# Keep workers but never delete dream insights
AQE_DREAM_INSIGHTS_RETENTION_DAYS=off

# Keep workers but skip the learning-consolidation worker
AQE_DISABLED_WORKERS=learning-consolidation

# No background workers at all
AQE_WORKERS_ENABLED=false
```

## Per-Domain Configuration

Configure individual domains:

```yaml
v3:
  domainConfig:
    test-generation:
      defaultFramework: jest
      coverageTarget: 90
      patterns:
        - describe-it
        - arrange-act-assert

    coverage-analysis:
      algorithm: sublinear
      riskWeighted: true
      samplingConfidence: 0.95

    security-compliance:
      standards:
        - soc2
        - gdpr
      severityThreshold: high
```

## Project-Specific Overrides

Create `.agentic-qe/project.yaml` for project-specific settings:

```yaml
# Overrides for this specific project
project:
  name: my-app
  language: typescript
  framework: react

  testFramework: jest
  testDir: tests/
  sourceDir: src/

  coverage:
    exclude:
      - "**/*.d.ts"
      - "**/migrations/**"
      - "**/generated/**"

  security:
    exclude:
      - "tests/**"
      - "scripts/**"
```

## Configuration Precedence

Settings are applied in this order (later overrides earlier):

1. Default values
2. `.agentic-qe/config.yaml`
3. `.agentic-qe/project.yaml`
4. Environment variables
5. CLI arguments

## Validation

Validate your configuration:

```bash
# Check config
aqe-v3 config validate

# Show effective config
aqe-v3 config show --resolved
```

## Configuration Schema

Full JSON Schema available at:
```
v3/src/shared/schemas/config.schema.json
```

## Migration from v2

If you have a v2 config:

```bash
# Migrate v2 config to v3
aqe-v3 config migrate --from .agentic-qe/config.yaml
```

This will:
1. Convert v2 settings to v3 format
2. Add new v3-specific settings
3. Preserve compatible settings
4. Create backup of original

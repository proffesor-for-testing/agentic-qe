# CLI Commands Reference

Complete reference for Agentic QE v3 CLI commands.

## Command Structure

```
aqe-v3 <domain> <action> [options]
```

## Global Options

```
--help, -h        Show help
--version, -v     Show version
--verbose         Verbose output
--quiet, -q       Minimal output
--json            JSON output
--config <file>   Custom config file
```

## Test Generation Commands

```bash
# Generate tests for a file
aqe-v3 test generate --file <path> [options]
  --framework <jest|vitest|mocha>  Test framework (default: jest)
  --type <unit|integration|e2e>     Test type (default: unit)
  --coverage <percent>              Coverage target
  --output <path>                   Output directory

# Generate from patterns
aqe-v3 test generate --pattern <pattern> --target <dir>

# Generate for scope
aqe-v3 test generate --scope <dir> --coverage 90
```

## Test Execution Commands

```bash
# Run tests
aqe-v3 test run [options]
  --parallel              Enable parallel execution
  --workers <n>           Number of workers (default: CPU-1)
  --retry <n>             Retry failed tests
  --retry-delay <ms>      Delay between retries
  --shard <i>/<n>         Sharding (e.g., 1/4)
  --affected              Only affected tests
  --since <commit>        Changes since commit
  --type <types>          Test types (comma-separated)
  --exclude <types>       Exclude test types
  --bail                  Stop on first failure
  --timeout <ms>          Test timeout

# Run specific tests
aqe-v3 test run --file <path>
aqe-v3 test run --grep <pattern>
```

## Coverage Commands

```bash
# Analyze coverage
aqe-v3 coverage analyze [options]
  --source <dir>          Source directory
  --tests <dir>           Tests directory
  --algorithm <type>      Algorithm (sublinear|traditional)

# Find gaps
aqe-v3 coverage gaps [options]
  --risk-weighted         Weight by risk
  --threshold <percent>   Minimum coverage

# Generate report
aqe-v3 coverage report [options]
  --format <type>         Format (html|json|markdown|lcov)
  --output <path>         Output path

# Diff coverage
aqe-v3 coverage diff --base <branch> --head <branch>
```

## Quality Commands

```bash
# Assess quality
aqe-v3 quality assess [options]
  --scope <dir>           Scope to assess
  --gates <gates>         Gates to check (all|coverage|security|...)

# Check deployment readiness
aqe-v3 quality deploy-ready --environment <env>

# Generate report
aqe-v3 quality report [options]
  --format <type>         Format (dashboard|json|markdown)
  --period <days>         Time period

# Compare versions
aqe-v3 quality compare --from <v1> --to <v2>
```

## Defect Intelligence Commands

```bash
# Predict defects
aqe-v3 defect predict [options]
  --changes <range>       Commit range
  --file <path>           Specific file

# Analyze patterns
aqe-v3 defect patterns [options]
  --period <days>         Analysis period
  --min-occurrences <n>   Minimum occurrences

# Root cause analysis
aqe-v3 defect rca --failure <id>

# Learn from resolved
aqe-v3 defect learn --source <jira|github> --status resolved
```

## Code Intelligence Commands

```bash
# Index codebase
aqe-v3 kg index [options]
  --source <dir>          Source directory
  --incremental           Only changed files
  --force                 Full reindex
  --git-since <tag>       Index changes since tag

# Search
aqe-v3 kg search "<query>" [options]
  --limit <n>             Max results
  --type <type>           Entity type filter
  --file <pattern>        File pattern filter

# Dependencies
aqe-v3 kg deps --file <path> --depth <n>

# Show entity
aqe-v3 kg show --entity <name> --relations

# Statistics
aqe-v3 kg stats

# Export
aqe-v3 kg export --format <dot|json> --output <path>
```

## Requirements Commands

```bash
# Parse requirements
aqe-v3 requirements parse [options]
  --source <jira|github>  Source system
  --project <id>          Project ID

# Build traceability
aqe-v3 requirements trace [options]
  --requirements <dir>    Requirements directory
  --tests <dir>           Tests directory

# Generate BDD
aqe-v3 requirements bdd --story <id> --output <dir>

# Check coverage
aqe-v3 requirements coverage --sprint <id>
```

## Security Commands

```bash
# Run security scan
aqe-v3 security scan [options]
  --scope <dir>           Scan scope
  --checks <checks>       Checks (all|sast|dast|deps)

# Check vulnerabilities
aqe-v3 security vulns [options]
  --dependencies          Check dependencies
  --severity <levels>     Severity filter

# Compliance audit
aqe-v3 security compliance --standard <soc2|gdpr|hipaa|pci-dss>

# OWASP check
aqe-v3 security owasp --top-10 --scope <dir>

# Generate report
aqe-v3 security report --format <sarif|json|html>
```

## Contract Commands

```bash
# Generate contracts
aqe-v3 contract generate --api <openapi.yaml> --output <dir>

# Verify contracts
aqe-v3 contract verify [options]
  --provider <url>        Provider URL
  --contracts <dir>       Contracts directory

# Check breaking changes
aqe-v3 contract breaking --old <v1> --new <v2>

# GraphQL testing
aqe-v3 contract graphql --schema <path> --operations <dir>
```

## Visual & Accessibility Commands

```bash
# Visual regression
aqe-v3 visual test [options]
  --baseline <env>        Baseline environment
  --current <env>         Current environment
  --threshold <percent>   Diff threshold

# Responsive testing
aqe-v3 visual responsive --url <url> --viewports <all|custom>

# Cross-browser
aqe-v3 visual cross-browser --url <url> --browsers <list>

# Accessibility audit
aqe-v3 a11y audit [options]
  --url <url>             Target URL
  --standard <wcag22-aa>  WCAG standard
```

## Chaos Commands

```bash
# Run experiment
aqe-v3 chaos run [options]
  --experiment <name>     Experiment name
  --target <service>      Target service

# Load test
aqe-v3 chaos load [options]
  --scenario <name>       Scenario name
  --duration <time>       Test duration

# Stress test
aqe-v3 chaos stress [options]
  --endpoint <path>       Target endpoint
  --max-users <n>         Maximum users

# Circuit breaker test
aqe-v3 chaos circuit-breaker --service <name>
```

## Learning Commands

```bash
# Check status
aqe-v3 learn status --agent <name>

# Transfer knowledge
aqe-v3 learn transfer --from <agent> --to <agent>

# Tune hyperparameters
aqe-v3 learn tune --agent <name> --metric <metric>

# View patterns
aqe-v3 learn patterns --framework <name>

# A/B test
aqe-v3 learn ab-test --hypothesis <name> --duration <time>
```

## Orchestration Commands

```bash
# Run protocol
aqe-v3 orchestrate --protocol <name>

# Fleet status
aqe-v3 fleet status --verbose

# List agents
aqe-v3 fleet agents --filter <active|idle>

# Scale domain
aqe-v3 fleet scale --domain <name> --replicas <n>

# Rebalance
aqe-v3 fleet rebalance --strategy <least-loaded|round-robin>
```

## Configuration Commands

```bash
# Initialize
aqe-v3 init [options]
  --force                 Overwrite existing config

# Show config
aqe-v3 config show

# Set value
aqe-v3 config set <key> <value>

# Get value
aqe-v3 config get <key>
```

# Phase 4 Quick Reference

**For**: Issue #69 - CI/CD Quality Gates and CLI Tools
**Full Planning**: [phase4-cicd-quality-gates.md](./phase4-cicd-quality-gates.md)
**Roadmap**: [phase4-implementation-roadmap.md](./phase4-implementation-roadmap.md)

## 📊 Overview

Phase 4 adds CI/CD quality enforcement and powerful visualization/reporting capabilities to the Agentic QE Fleet.

## 🎯 Key Features

### 1. Quality Gates (5 types)
- ✅ **Coverage**: Line, branch, function thresholds
- ✅ **Performance**: Response time, memory, CPU limits
- ✅ **Security**: Vulnerability detection and blocking
- ✅ **Quality**: Complexity, maintainability, tech debt
- ✅ **Test**: Pass rate, flaky detection, execution time

### 2. CLI Commands (3 new commands)
- `aqe gate` - 15+ subcommands for gate management
- `aqe report` - Multi-format report generation
- `aqe visualize` - Interactive web dashboard

### 3. GitHub Actions (3 new workflows)
- `quality-gates.yml` - Automated gate checks
- `performance-regression.yml` - Baseline comparison
- `security-scanning.yml` - Vulnerability scanning

### 4. MCP Tools (18 new tools)
- 9 quality gate tools
- 6 visualization tools
- 3 reporting tools

### 5. Visualization Dashboard
- Real-time fleet monitoring
- Coverage heatmaps
- Performance trend charts
- Security vulnerability tracking
- Interactive drill-down

## 🚀 Quick Start

### Initialize Quality Gates
```bash
# Initialize with default gates
aqe init

# This creates:
# - .agentic-qe/config/quality-gates.json
# - .github/workflows/quality-gates.yml
# - .github/workflows/performance-regression.yml
# - .github/workflows/security-scanning.yml
```

### Check Quality Gates
```bash
# Check all gates
aqe gate check

# Check specific gate
aqe gate check coverage

# CI/CD mode (fail on warning)
aqe gate check --fail-on-warning --json > results.json
```

### Generate Reports
```bash
# Quick report
aqe report

# HTML report
aqe report --format html --output report.html

# Daily scheduled report
aqe report --schedule daily --email team@example.com
```

### Launch Dashboard
```bash
# Start visualization dashboard
aqe visualize

# Custom port
aqe visualize --port 8080

# Export static HTML
aqe visualize --export dashboard.html
```

## 📁 File Locations

### Configuration
- `/workspaces/agentic-qe-cf/.agentic-qe/config/quality-gates.json`
- `/workspaces/agentic-qe-cf/config/quality-gates/default-gates.json`

### CLI Commands
- `/workspaces/agentic-qe-cf/src/cli/commands/gate/`
- `/workspaces/agentic-qe-cf/src/cli/commands/report/`
- `/workspaces/agentic-qe-cf/src/cli/commands/visualize/`

### MCP Handlers
- `/workspaces/agentic-qe-cf/src/mcp/handlers/quality-gates/`
- `/workspaces/agentic-qe-cf/src/mcp/handlers/visualization/`
- `/workspaces/agentic-qe-cf/src/mcp/handlers/reporting/`

### GitHub Actions
- `/workspaces/agentic-qe-cf/.github/workflows/quality-gates.yml`
- `/workspaces/agentic-qe-cf/.github/workflows/performance-regression.yml`
- `/workspaces/agentic-qe-cf/.github/workflows/security-scanning.yml`

### Dashboard
- `/workspaces/agentic-qe-cf/src/core/visualization/server.ts`
- `/workspaces/agentic-qe-cf/src/core/visualization/dashboard/`

## 🛠️ CLI Command Reference

### aqe gate

| Command | Description | Example |
|---------|-------------|---------|
| `check` | Check quality gates | `aqe gate check` |
| `check <gate>` | Check specific gate | `aqe gate check coverage` |
| `define` | Define custom gate | `aqe gate define --config gate.json` |
| `list` | List all gates | `aqe gate list` |
| `show <gate>` | Show gate details | `aqe gate show production-ready` |
| `test <gate>` | Test gate (dry-run) | `aqe gate test coverage --dry-run` |
| `enable <gate>` | Enable gate | `aqe gate enable security` |
| `disable <gate>` | Disable gate | `aqe gate disable flaky-tests` |
| `threshold <gate>` | Set thresholds | `aqe gate threshold coverage --line 80` |
| `export` | Export configuration | `aqe gate export --output gates.json` |
| `import` | Import configuration | `aqe gate import --input gates.json` |

### aqe report

| Command | Description | Example |
|---------|-------------|---------|
| `(default)` | Generate all reports | `aqe report` |
| `--type <type>` | Specific report | `aqe report --type coverage` |
| `--format <fmt>` | Output format | `aqe report --format html` |
| `--output <file>` | Save to file | `aqe report --output report.html` |
| `--daily` | Daily report | `aqe report --daily` |
| `--weekly` | Weekly report | `aqe report --weekly` |
| `--monthly` | Monthly report | `aqe report --monthly` |
| `--compare` | Compare versions | `aqe report --compare baseline` |
| `--schedule` | Schedule reports | `aqe report --schedule daily --email team@example.com` |

### aqe visualize

| Command | Description | Example |
|---------|-------------|---------|
| `(default)` | Start dashboard | `aqe visualize` |
| `--port <port>` | Custom port | `aqe visualize --port 8080` |
| `--focus <area>` | Focus on area | `aqe visualize --focus coverage` |
| `--export <file>` | Export static HTML | `aqe visualize --export dashboard.html` |
| `--from <date>` | Start date | `aqe visualize --from "2025-11-01"` |
| `--to <date>` | End date | `aqe visualize --to "2025-11-29"` |
| `--daemon` | Background mode | `aqe visualize --daemon` |
| `--stop` | Stop dashboard | `aqe visualize --stop` |

## 🔧 MCP Tools Reference

### Quality Gate Tools

| Tool | Description |
|------|-------------|
| `mcp__agentic_qe__gate_check` | Check quality gates |
| `mcp__agentic_qe__gate_define` | Define custom gate |
| `mcp__agentic_qe__gate_threshold` | Set gate thresholds |
| `mcp__agentic_qe__gate_list` | List all gates |
| `mcp__agentic_qe__gate_status` | Get gate status |
| `mcp__agentic_qe__gate_enable` | Enable gate |
| `mcp__agentic_qe__gate_disable` | Disable gate |
| `mcp__agentic_qe__gate_history` | Get gate history |
| `mcp__agentic_qe__gate_export` | Export gate config |

### Visualization Tools

| Tool | Description |
|------|-------------|
| `mcp__agentic_qe__visualize_coverage` | Coverage visualization data |
| `mcp__agentic_qe__visualize_performance` | Performance charts data |
| `mcp__agentic_qe__visualize_trends` | Quality trend data |
| `mcp__agentic_qe__visualize_security` | Security dashboard data |
| `mcp__agentic_qe__visualize_fleet` | Fleet status visualization |
| `mcp__agentic_qe__visualize_export` | Export visualization |

### Reporting Tools

| Tool | Description |
|------|-------------|
| `mcp__agentic_qe__report_generate` | Generate report |
| `mcp__agentic_qe__report_export` | Export report |
| `mcp__agentic_qe__report_compare` | Compare reports |

## 📐 Quality Gate Defaults

### Coverage Gate
```json
{
  "line": 80,
  "branch": 75,
  "function": 85
}
```

### Performance Gate
```json
{
  "p95ResponseTime": 500,
  "p99ResponseTime": 1000,
  "memoryUsage": 512,
  "bundleSize": 250
}
```

### Security Gate
```json
{
  "critical": 0,
  "high": 0,
  "medium": 5,
  "low": 20
}
```

### Quality Gate
```json
{
  "complexity": 10,
  "maintainability": 65,
  "duplication": 5,
  "technicalDebt": 20
}
```

## 📊 GitHub Actions Integration

### PR Workflow Example
```yaml
name: Quality Gates

on:
  pull_request:
    branches: [main]

jobs:
  quality-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npx aqe init --non-interactive
      - run: npx aqe gate check --fail-on-warning
```

## 🎨 Dashboard Features

### Real-time Monitoring
- Fleet status updates every 1s
- Test execution progress
- Agent activity timeline
- Live metrics streaming

### Visualizations
- Coverage heatmaps (file-level)
- Performance trend charts (p50, p95, p99)
- Security vulnerability dashboard
- Quality metrics graphs
- Agent coordination diagrams

### Interactions
- Click to drill down
- Filter by time range
- Compare baselines
- Export to PNG/PDF
- Share dashboard links

## 📈 Report Types

### Coverage Report
- Overall metrics
- Per-file breakdown
- Trend analysis
- Gap identification

### Performance Report
- Response time distributions
- Resource usage metrics
- Regression detection
- Bottleneck analysis

### Security Report
- Vulnerability summary
- OWASP compliance
- Dependency status
- Remediation steps

### Quality Report
- Code quality metrics
- Technical debt
- Maintainability trends
- Complexity analysis

### Trend Report
- Historical comparisons
- Quality trajectory
- Improvement insights
- Predictions

## 🔄 Memory Integration

### Gate Results
- Stored at: `aqe/quality-gates/*`
- TTL: 90 days
- Indexed by: timestamp, gate type, status

### Visualization Cache
- Stored at: `aqe/visualization/*`
- TTL: 1 hour
- Indexed by: type, timestamp

### Report Templates
- Stored at: `aqe/reports/templates/*`
- TTL: None (permanent)
- Indexed by: name, type

## 📅 Implementation Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1-2 | Foundation | Schemas, CLI structure, MCP specs |
| 3-4 | Core Logic | Gates, reporting engine, templates |
| 5-6 | CI/CD | Workflows, PR integration, artifacts |
| 7-8 | Dashboard | React UI, WebSockets, visualizations |
| 9-10 | Testing & Docs | Tests, guides, examples |

## ✅ Success Metrics

- ✅ Gate checks complete in <5 minutes
- ✅ Dashboard loads in <2 seconds
- ✅ Reports generate in <10 seconds
- ✅ Test coverage >80%
- ✅ Zero critical bugs

## 🔗 Related Documentation

- [Full Planning Document](./phase4-cicd-quality-gates.md)
- [Implementation Roadmap](./phase4-implementation-roadmap.md)
- [Agent Reference](../reference/agents.md)
- [Skills Reference](../reference/skills.md)
- [Usage Guide](../reference/usage.md)

## 🆘 Troubleshooting

### Gate Check Fails
```bash
# Get detailed results
aqe gate check <gate> --verbose

# Test without failing
aqe gate test <gate> --dry-run

# Show current thresholds
aqe gate show <gate>
```

### Dashboard Won't Start
```bash
# Check if port is in use
lsof -i :3000

# Use different port
aqe visualize --port 8080

# Check logs
aqe visualize --verbose
```

### Report Generation Fails
```bash
# Generate with verbose logging
aqe report --verbose

# Check specific report type
aqe report --type coverage --verbose

# Try different format
aqe report --format json
```

## 🎓 Best Practices

1. **Start with defaults**: Use default gates, then customize
2. **Incremental adoption**: Enable gates one at a time
3. **Monitor trends**: Use dashboard to track improvements
4. **Regular reports**: Schedule weekly executive reports
5. **CI/CD first**: Run gates on every PR
6. **Fast feedback**: Keep gate checks under 5 minutes
7. **Clear thresholds**: Document why each threshold exists
8. **Team buy-in**: Get team agreement on thresholds

## 📞 Support

- **Issues**: GitHub Issues for bug reports
- **Discussions**: GitHub Discussions for questions
- **Documentation**: `/docs` directory
- **Examples**: `/examples/phase4` directory

---

**Version**: Phase 4 (v2.0.0)
**Status**: Planning
**Last Updated**: 2025-11-29

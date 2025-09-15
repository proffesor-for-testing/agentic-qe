# Quality Engineering Commands

Advanced QE commands for Claude Code that leverage the specialized quality engineering agents to provide comprehensive testing, risk assessment, and production monitoring capabilities.

## Available Commands

### 🔍 `requirements`
Analyzes requirements for testability, ambiguity, and risk using RST heuristics.

```bash
npx claude-flow@alpha qe requirements [file] [options]
```

**Options:**
- `--heuristics` - Heuristics to apply (SFDIPOT, FEW_HICCUPPS)
- `--output` - Output format (markdown, json, charters)
- `--risk-threshold` - Risk threshold (low, medium, high)
- `--generate-charters` - Generate test charters
- `--ambiguity-check` - Check for ambiguous requirements

### 🗺️ `exploratory-test`
Launch exploratory testing sessions with various tour patterns.

```bash
npx claude-flow@alpha qe exploratory-test [options]
```

**Tours:**
- `money` - Features affecting revenue
- `landmark` - Major defining features
- `garbage` - Code to clean up
- `back-alley` - Edge cases
- `tourist` - New user perspective
- `rain` - Adverse conditions
- `supermodel` - UI/UX aspects
- `security` - Security focus
- `performance` - Performance hunting

**Options:**
- `--tour` - Tour type to execute
- `--target` - Target area to explore
- `--duration` - Session duration in minutes
- `--charter` - Test charter or mission
- `--proof` - Generate PROOF documentation

### 🔴🟢 `tdd`
Start TDD pair programming session with Red-Green-Refactor cycle.

```bash
npx claude-flow@alpha qe tdd [feature] [options]
```

**Options:**
- `--style` - TDD style (chicago, london)
- `--framework` - Test framework (jest, mocha, vitest, pytest)
- `--coverage` - Target coverage percentage
- `--watch` - Enable test watching
- `--mutation` - Enable mutation testing
- `--refactor` - Refactoring aggressiveness

### 🛡️ `deploy-guard`
Guard deployments with progressive rollout and automated rollback.

```bash
npx claude-flow@alpha qe deploy-guard [options]
```

**Strategies:**
- `canary` - Gradual rollout with analysis
- `blue-green` - Zero-downtime switch
- `feature-flag` - Feature toggles
- `rolling` - Sequential updates

**Options:**
- `--strategy` - Deployment strategy
- `--version` - Version to deploy
- `--environment` - Target environment
- `--stages` - Rollout stages
- `--error-threshold` - Error rate threshold
- `--dry-run` - Simulate without changes

### 🔮 `risk-assess`
Assess risks and prioritize testing efforts.

```bash
npx claude-flow@alpha qe risk-assess [target] [options]
```

**Options:**
- `--scope` - Assessment scope (feature, release, system)
- `--factors` - Risk factors to evaluate
- `--ml-prediction` - Use ML for prediction
- `--historical` - Include historical data
- `--threshold` - Risk threshold for alerts
- `--mitigation` - Generate mitigation strategies

### 👁️ `production-monitor`
Monitor production for anomalies and test gaps.

```bash
npx claude-flow@alpha qe production-monitor [options]
```

**Golden Signals:**
- `latency` - Response time
- `traffic` - Request rate
- `errors` - Error rate
- `saturation` - Resource utilization

**Options:**
- `--mode` - Monitoring mode (continuous, snapshot)
- `--signals` - Signals to monitor
- `--synthetic` - Enable synthetic journeys
- `--anomaly` - Detection method (ml, threshold)
- `--test-gaps` - Identify coverage gaps

### 🐝 `qe-swarm`
Deploy a swarm of QE agents for comprehensive quality engineering.

```bash
npx claude-flow@alpha qe qe-swarm [pipeline] [options]
```

**Pipelines:**
- `full` - Complete quality pipeline
- `shift-left` - Early quality focus
- `risk-driven` - Risk-based testing
- `continuous` - Continuous quality
- `exploratory` - Discovery focus

**Options:**
- `--agents` - Specific agents to include
- `--topology` - Swarm topology
- `--max-agents` - Maximum concurrent agents
- `--chain` - Chain agents sequentially
- `--report` - Generate quality report

## Quick Examples

### Analyze Requirements
```bash
# Analyze requirements with multiple heuristics
npx claude-flow@alpha qe requirements requirements.md --heuristics SFDIPOT,FEW_HICCUPPS

# Generate test charters from requirements
npx claude-flow@alpha qe requirements user-stories.md --output charters
```

### Exploratory Testing
```bash
# Run a money tour
npx claude-flow@alpha qe exploratory-test --tour money --duration 60

# Security-focused exploration
npx claude-flow@alpha qe exploratory-test --tour security --target /api/auth
```

### TDD Development
```bash
# Chicago-style TDD for shopping cart
npx claude-flow@alpha qe tdd "shopping cart feature" --style chicago

# London-style with mocks
npx claude-flow@alpha qe tdd "payment processing" --style london --coverage 90
```

### Safe Deployment
```bash
# Canary deployment with custom stages
npx claude-flow@alpha qe deploy-guard --strategy canary --stages 1%,10%,50%,100%

# Dry run deployment plan
npx claude-flow@alpha qe deploy-guard --dry-run --version v2.0.0
```

### Risk Assessment
```bash
# Assess release risks
npx claude-flow@alpha qe risk-assess --scope release --ml-prediction

# Feature-level risk with mitigation
npx claude-flow@alpha qe risk-assess "authentication" --mitigation
```

### Production Monitoring
```bash
# Start continuous monitoring
npx claude-flow@alpha qe production-monitor --mode continuous

# Snapshot analysis with test gaps
npx claude-flow@alpha qe production-monitor --mode snapshot --test-gaps
```

### QE Swarm
```bash
# Full quality pipeline
npx claude-flow@alpha qe qe-swarm full

# Risk-driven testing swarm
npx claude-flow@alpha qe qe-swarm risk-driven --target "payment-service"

# List available pipelines
npx claude-flow@alpha qe qe-swarm --list
```

## Integration with Claude Code

These commands are designed to work seamlessly with Claude Code. When using Claude Code:

1. **Ask Claude to run QE commands:**
   ```
   "Run requirements analysis on the user stories"
   "Start a TDD session for the authentication feature"
   "Deploy with canary strategy to production"
   ```

2. **Chain commands for workflows:**
   ```
   "Analyze requirements, then create a risk assessment, and finally set up production monitoring"
   ```

3. **Use in development workflow:**
   ```
   "Help me implement the shopping cart feature using TDD"
   "Check production for anomalies and identify test gaps"
   ```

## Best Practices

1. **Start with Requirements:** Always analyze requirements first for better test coverage
2. **Use Risk Assessment:** Prioritize testing efforts based on risk
3. **Combine Strategies:** Mix TDD with exploratory testing for comprehensive coverage
4. **Monitor Production:** Use production insights to improve test coverage
5. **Progressive Deployment:** Always use deployment guardian for safe releases

## Configuration

Each command can be configured through:
- Command-line options
- Configuration files in `.claude/config/`
- Environment variables
- Interactive prompts when run without parameters

## Troubleshooting

### Agent Not Found
```bash
# Ensure QE agents are installed
npx claude-flow@alpha agent list --type qe
```

### Command Not Recognized
```bash
# Register QE commands
npx claude-flow@alpha commands register ./commands/quality-engineering
```

### Swarm Coordination Issues
```bash
# Check swarm status
npx claude-flow@alpha swarm status

# Reset swarm
npx claude-flow@alpha swarm reset
```

## Related Documentation

- [QE Agents Documentation](.claude/agents/qe/README.md)
- [SPARC Methodology](docs/sparc.md)
- [Swarm Coordination](docs/swarm.md)
- [Claude Flow Documentation](https://github.com/ruvnet/claude-flow)

## Contributing

To add new QE commands:
1. Create a new command file in `.claude/commands/qe/`
2. Follow the existing command structure
3. Update this README with usage examples
4. Test with corresponding QE agent

## License

Part of Claude-Flow project. See main LICENSE file.
# Agentic QE Fleet - Troubleshooting Guide

## Quick Diagnosis

Start here to quickly identify your issue:

```bash
# Run system diagnostics
aqe diagnostics

# Check fleet health
aqe status --verbose

# View recent logs
tail -f ~/.agentic-qe/logs/aqe.log
```

## Common Issues

### Installation Issues

#### Issue: npm install fails with permission errors

**Symptoms:**
```bash
npm ERR! Error: EACCES: permission denied
```

**Solutions:**

**Option 1: Use npx (Recommended)**
```bash
npx agentic-qe init
```

**Option 2: Fix npm permissions**
```bash
# Fix npm global permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Reinstall
npm install -g agentic-qe
```

**Option 3: Use sudo (Not Recommended)**
```bash
sudo npm install -g agentic-qe
```

#### Issue: Node.js version incompatibility

**Symptoms:**
```bash
error agentic-qe@1.0.0: The engine "node" is incompatible with this module
```

**Solution:**
```bash
# Check Node.js version
node --version  # Should be >= 18.0.0

# Upgrade Node.js using nvm
nvm install 18
nvm use 18
nvm alias default 18

# Or using package manager
# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# macOS
brew install node@18
```

#### Issue: TypeScript compilation errors

**Symptoms:**
```bash
TSError: Unable to compile TypeScript
```

**Solution:**
```bash
# Clear cache and rebuild
npm cache clean --force
rm -rf node_modules
npm install
npm run build
```

### Agent Execution Issues

#### Issue: Agent fails to start

**Symptoms:**
```bash
Error: Agent failed to start: timeout
Error: Agent initialization failed
```

**Diagnostic Steps:**
```bash
# 1. Check system resources
free -h  # Check available memory
top      # Check CPU usage

# 2. Check configuration
aqe config show | grep maxAgents

# 3. Check agent status
aqe fleet status --verbose
```

**Solutions:**

**Solution 1: Reduce concurrent agents**
```bash
aqe config set --key fleet.maxAgents --value 10
```

**Solution 2: Increase timeouts**
```bash
aqe config set --key agent.timeout --value 600000
```

**Solution 3: Check memory limits**
```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" aqe execute
```

#### Issue: Agent stuck in "busy" state

**Symptoms:**
- Agent shows as "busy" but no progress
- Commands timeout waiting for agent

**Diagnostic:**
```bash
# Check agent status
aqe fleet status

# View agent logs
aqe logs --agent-id <agent-id> --tail 100
```

**Solutions:**

**Solution 1: Restart stuck agent**
```bash
aqe agent restart --agent-id <agent-id>
```

**Solution 2: Kill and respawn agent**
```bash
aqe agent kill --agent-id <agent-id>
aqe agent spawn --type test-generator
```

**Solution 3: Reset fleet state**
```bash
aqe fleet reset
aqe init
```

### Test Generation Issues

#### Issue: No tests generated

**Symptoms:**
- `aqe test` completes but no test files created
- Error: "No testable code found"

**Diagnostic:**
```bash
# Run with verbose logging
aqe test src/service.ts --verbose

# Check file path
ls -la src/service.ts

# Check file content
cat src/service.ts
```

**Solutions:**

**Solution 1: Verify file is exportable**
```typescript
// File must export functions/classes
export function myFunction() { /* ... */ }
export class MyClass { /* ... */ }
```

**Solution 2: Check file extension**
```bash
# Supported extensions: .ts, .tsx, .js, .jsx
aqe test src/service.ts    # ✓ Correct
aqe test src/service.py    # ✗ Not supported
```

**Solution 3: Specify framework**
```bash
aqe test src/service.ts --framework jest
```

#### Issue: Generated tests are incorrect

**Symptoms:**
- Tests fail immediately
- Tests don't match code structure
- Missing important test cases

**Solutions:**

**Solution 1: Regenerate with higher coverage**
```bash
aqe test src/service.ts --coverage 95 --regenerate
```

**Solution 2: Specify test style**
```bash
aqe test src/service.ts --style property-based
```

**Solution 3: Review and manually adjust**
```bash
# Generated tests are starting points
# Review and adjust in tests/ directory
```

### MCP Integration Issues

#### Issue: Claude Code can't connect to MCP server

**Symptoms:**
```bash
Error: Cannot connect to MCP server
Error: MCP server not found
```

**Diagnostic:**
```bash
# Check if MCP server is registered
claude mcp list

# Check MCP server logs
cat ~/.claude/logs/mcp-agentic-qe.log
```

**Solutions:**

**Solution 1: Add MCP server**
```bash
# Add MCP server to Claude Code
claude mcp add agentic-qe npx -y agentic-qe mcp:start

# Verify addition
claude mcp list | grep agentic-qe
```

**Solution 2: Restart Claude Code**
```bash
# Restart Claude Code application
# Then verify connection
claude mcp list
```

**Solution 3: Manually start MCP server**
```bash
# Start MCP server directly
npx agentic-qe mcp:start

# In another terminal, verify
curl http://localhost:3000/health
```

#### Issue: MCP tools not appearing in Claude Code

**Symptoms:**
- MCP server connected but tools not available
- Error: "Unknown tool: mcp__agentic_qe__..."

**Solutions:**

**Solution 1: Restart Claude Code and refresh**
```bash
# 1. Restart Claude Code
# 2. In Claude Code: /mcp list
# 3. Verify tools are listed
```

**Solution 2: Check MCP server version**
```bash
aqe --version  # Should be >= 1.0.0
npm update -g agentic-qe
```

**Solution 3: Re-add MCP server**
```bash
claude mcp remove agentic-qe
claude mcp add agentic-qe npx -y agentic-qe mcp:start
```

### Memory and Performance Issues

#### Issue: High memory usage

**Symptoms:**
```bash
Error: JavaScript heap out of memory
Process consuming > 4GB RAM
```

**Diagnostic:**
```bash
# Check memory usage
ps aux | grep agentic-qe
top -p $(pgrep -f agentic-qe)

# Check fleet status
aqe fleet status --memory
```

**Solutions:**

**Solution 1: Reduce parallel workers**
```bash
aqe execute --workers 1
```

**Solution 2: Execute tests in batches**
```bash
# Instead of running all at once
aqe execute tests/unit/
aqe execute tests/integration/
```

**Solution 3: Increase Node.js memory limit**
```bash
# Temporary
NODE_OPTIONS="--max-old-space-size=4096" aqe execute

# Permanent (add to .bashrc or .zshrc)
export NODE_OPTIONS="--max-old-space-size=4096"
```

**Solution 4: Enable garbage collection**
```bash
NODE_OPTIONS="--expose-gc --max-old-space-size=2048" aqe execute
```

#### Issue: Slow test execution

**Symptoms:**
- Tests take much longer than expected
- Fleet appears unresponsive

**Diagnostic:**
```bash
# Check fleet performance
aqe fleet monitor --interval 1s

# Check agent distribution
aqe fleet status --agents
```

**Solutions:**

**Solution 1: Enable parallel execution**
```bash
aqe execute --parallel --workers 4
```

**Solution 2: Optimize test selection**
```bash
aqe execute --optimize --coverage-threshold 90
```

**Solution 3: Increase agent count**
```bash
aqe config set --key fleet.maxAgents --value 30
```

### Coverage Analysis Issues

#### Issue: Coverage report shows 0%

**Symptoms:**
```bash
Coverage: 0.00%
No coverage data collected
```

**Diagnostic:**
```bash
# Check if tests ran
aqe execute --coverage --verbose

# Check coverage configuration
cat .agentic-qe/config.json | grep coverage
```

**Solutions:**

**Solution 1: Ensure tests execute successfully**
```bash
# Run tests first
aqe execute
# Then run coverage
aqe coverage
```

**Solution 2: Check coverage tool configuration**
```bash
# Verify jest.config.js or similar
cat jest.config.js | grep coverage
```

**Solution 3: Specify coverage tool**
```bash
aqe coverage --tool jest
```

#### Issue: Coverage gaps not detected

**Symptoms:**
- Coverage analyzer completes but reports no gaps
- Expected uncovered lines not reported

**Solution:**
```bash
# Run with detailed gap analysis
aqe coverage --analysis comprehensive --threshold 95
```

### Quality Gate Issues

#### Issue: Quality gate always fails

**Symptoms:**
```bash
Quality gate: FAILED
All checks failing despite good metrics
```

**Diagnostic:**
```bash
# View quality gate results
aqe quality --verbose

# Check thresholds
aqe config get --key agents.quality-gate.config.thresholds
```

**Solutions:**

**Solution 1: Adjust thresholds**
```bash
aqe quality --coverage 80 --complexity 15
```

**Solution 2: View detailed report**
```bash
aqe quality --report detailed --export report.json
cat report.json | jq .
```

**Solution 3: Skip specific checks**
```bash
aqe quality --skip security --coverage 85
```

### Database Issues

#### Issue: SQLite database locked

**Symptoms:**
```bash
Error: SQLITE_BUSY: database is locked
```

**Solutions:**

**Solution 1: Close other connections**
```bash
# Stop all AQE processes
pkill -f agentic-qe

# Restart
aqe init
```

**Solution 2: Reset database**
```bash
# Backup first
cp data/fleet.db data/fleet.db.backup

# Reset
rm data/fleet.db
aqe init
```

**Solution 3: Increase timeout**
```bash
# In .agentic-qe/config.json
{
  "database": {
    "timeout": 10000
  }
}
```

## Error Messages Reference

### Common Error Codes

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `AQE_001` | Fleet initialization failed | Run `aqe init` again |
| `AQE_002` | Agent spawn timeout | Increase timeout or reduce agents |
| `AQE_003` | Test generation failed | Check source file is valid |
| `AQE_004` | Coverage analysis failed | Ensure tests ran successfully |
| `AQE_005` | Quality gate blocked | Review quality metrics |
| `AQE_006` | Memory limit exceeded | Increase memory or reduce workers |
| `AQE_007` | Database error | Check database connection |
| `AQE_008` | Configuration invalid | Validate configuration file |
| `AQE_009` | MCP connection failed | Restart MCP server |
| `AQE_010` | Agent coordination failed | Reset fleet state |

### Error Message Examples

#### "Agent failed to start: timeout"
```bash
# Cause: Agent took too long to initialize
# Solution:
aqe config set --key agent.timeout --value 600000
```

#### "Cannot find module 'agentic-qe'"
```bash
# Cause: Package not installed correctly
# Solution:
npm install -g agentic-qe
# or
npx agentic-qe <command>
```

#### "Permission denied: .agentic-qe/config.json"
```bash
# Cause: File permissions issue
# Solution:
chmod 644 .agentic-qe/config.json
```

## Diagnostic Commands

### System Diagnostics

```bash
# Complete system check
aqe diagnostics

# Check specific components
aqe diagnostics --component fleet
aqe diagnostics --component agents
aqe diagnostics --component memory
aqe diagnostics --component database
```

### Fleet Diagnostics

```bash
# Fleet health check
aqe fleet health

# Detailed fleet status
aqe fleet status --verbose --export status.json

# Agent performance metrics
aqe fleet metrics --agents
```

### Log Analysis

```bash
# View recent logs
aqe logs --tail 100

# Follow logs in real-time
aqe logs --follow

# Filter logs by level
aqe logs --level error

# Export logs
aqe logs --export logs-$(date +%Y%m%d).log
```

## Getting Help

### Self-Service Resources

1. **Documentation**: [https://github.com/proffesor-for-testing/agentic-qe#readme](https://github.com/proffesor-for-testing/agentic-qe#readme)
2. **FAQ**: Check [USER-GUIDE.md](./USER-GUIDE.md) FAQ section
3. **Examples**: Browse [/examples](../examples) directory
4. **API Docs**: [API.md](./API.md)

### Community Support

1. **GitHub Discussions**: [https://github.com/proffesor-for-testing/agentic-qe/discussions](https://github.com/proffesor-for-testing/agentic-qe/discussions)
2. **GitHub Issues**: [https://github.com/proffesor-for-testing/agentic-qe/issues](https://github.com/proffesor-for-testing/agentic-qe/issues)

### Reporting Bugs

When reporting bugs, include:

1. **System Information**:
```bash
aqe diagnostics --export diagnostics.json
```

2. **Reproduction Steps**:
```bash
aqe test src/service.ts --verbose > output.log 2>&1
```

3. **Configuration**:
```bash
aqe config show > config.txt
```

4. **Logs**:
```bash
aqe logs --tail 200 > logs.txt
```

### Bug Report Template

```markdown
**System Information:**
- OS: Ubuntu 22.04
- Node.js: v18.17.0
- AQE Version: 1.0.1

**Steps to Reproduce:**
1. Run `aqe init`
2. Run `aqe test src/service.ts`
3. Error occurs

**Expected Behavior:**
Tests should be generated

**Actual Behavior:**
Error: Agent failed to start

**Logs:**
[Attach logs.txt]

**Configuration:**
[Attach config.txt]
```

## Preventive Maintenance

### Regular Health Checks

```bash
# Weekly health check
aqe diagnostics --full

# Monthly fleet optimization
aqe fleet optimize

# Quarterly database cleanup
aqe memory cleanup --aggressive
```

### Best Practices

1. **Keep AQE Updated**:
```bash
npm update -g agentic-qe
```

2. **Monitor Resource Usage**:
```bash
aqe fleet monitor --export metrics.json
```

3. **Regular Backups**:
```bash
aqe memory backup --export backup-$(date +%Y%m%d).json
```

4. **Log Rotation**:
```bash
# Logs automatically rotate at 10MB
# Keep last 5 log files
```

5. **Configuration Validation**:
```bash
aqe config validate
```

## Advanced Troubleshooting

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug aqe execute --verbose

# Enable verbose output
aqe test src/service.ts --verbose --debug
```

### Memory Profiling

```bash
# Track memory usage
TRACK_MEMORY=true aqe execute

# Generate heap snapshot
node --expose-gc --heap-prof $(which aqe) execute
```

### Performance Profiling

```bash
# Profile test execution
aqe execute --profile

# Benchmark fleet performance
aqe fleet benchmark --iterations 100
```

## Related Documentation

- [User Guide](./USER-GUIDE.md) - Getting started and basic workflows
- [Configuration Guide](./CONFIGURATION.md) - Complete configuration reference
- [API Reference](./API.md) - Programmatic API documentation
- [MCP Integration](./guides/MCP-INTEGRATION.md) - Claude Code integration guide

# Vibium MCP Server Integration for AQE v3

## Overview

Vibium is an MCP (Model Context Protocol) server that provides browser automation and UI testing capabilities for AQE v3 agents. It enables visual testing, accessibility validation, and end-to-end testing workflows.

## Installation

### Prerequisites

- Node.js 18+ (for npx)
- 2GB+ disk space (for Chrome download)
- Internet connection (for first-time setup)

### Automatic Installation

Vibium is automatically installed via npx when the MCP server starts:

```bash
npx -y vibium
```

### Manual Installation (Optional)

If you want to pre-install Vibium:

```bash
npm install -g vibium
```

## MCP Server Configuration

The Vibium MCP server is configured in `.claude/mcp.json`:

```json
{
  "vibium": {
    "command": "npx",
    "args": ["-y", "vibium"],
    "env": {
      "NODE_NO_WARNINGS": "1",
      "VIBIUM_HEADLESS": "false"
    }
  }
}
```

### Configuration Options

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `VIBIUM_HEADLESS` | `false` | Run browser in headless mode (no visible UI) |
| `VIBIUM_DEBUG` | `false` | Enable debug logging |
| `VIBIUM_TIMEOUT` | `30000` | Default timeout in milliseconds |
| `VIBIUM_PORT` | `auto` | Port for MCP server (auto-assigns if not set) |

## Quick Start

### 1. Enable Vibium in AQE v3

Verify the configuration in `.claude/mcp.json`:

```bash
cat /workspaces/agentic-qe/.claude/mcp.json | grep -A 8 '"vibium"'
```

Expected output should show:
```json
"vibium": {
  "command": "npx",
  "args": ["-y", "vibium"],
  "env": { "NODE_NO_WARNINGS": "1", "VIBIUM_HEADLESS": "false" }
}
```

### 2. Restart Claude Code

After updating MCP configuration, restart Claude Code to load the Vibium server:
- Close Claude Code
- Open Claude Code again

### 3. Verify Installation

Check that Vibium is available as an MCP resource:

```bash
# View available MCP servers
npx @claude-flow/cli@latest system status --components mcp
```

### 4. Use Vibium in AQE Agents

AQE v3 agents can now use Vibium for:

```typescript
// Example: Visual regression testing
interface VibriumTestTask {
  type: 'visual-regression';
  url: string;
  baseline: string;
  threshold: number; // 0-1, default 0.99
}

// Example: Accessibility testing
interface VibiumAccessibilityTask {
  type: 'accessibility-audit';
  url: string;
  standard: 'WCAG2A' | 'WCAG2AA' | 'WCAG2AAA';
}

// Example: E2E testing
interface VibiumE2ETask {
  type: 'e2e-test';
  url: string;
  scenarios: ScenarioDefinition[];
}
```

## Development vs. Production Configuration

### Development (Local Testing)

```json
{
  "vibium": {
    "command": "npx",
    "args": ["-y", "vibium"],
    "env": {
      "VIBIUM_HEADLESS": "false",
      "VIBIUM_DEBUG": "true"
    }
  }
}
```

**Features:**
- Visible browser window (easier debugging)
- Detailed debug logging
- Slower, but more observable

### Production (CI/CD)

Create `.claude/mcp.prod.json`:

```json
{
  "vibium": {
    "command": "npx",
    "args": ["-y", "vibium"],
    "env": {
      "NODE_NO_WARNINGS": "1",
      "VIBIUM_HEADLESS": "true",
      "VIBIUM_DEBUG": "false"
    }
  }
}
```

**Features:**
- Headless mode (no UI, faster)
- No debug output
- Better for CI/CD pipelines

## Troubleshooting

### Issue: "Chrome not found"

**Symptom:** Error message: `Chrome executable not found`

**Solution:**
Vibium auto-downloads Chrome on first use. Ensure:
1. Internet connection is active
2. 2GB+ disk space available
3. Write permissions in home directory

```bash
# Manual Chrome installation
npx @vibium/cli install-chrome
```

### Issue: "Port already in use"

**Symptom:** Error: `EADDRINUSE: address already in use :::PORT`

**Solution:**
The port will auto-assign if already in use. Or specify explicitly:

```json
{
  "vibium": {
    "env": {
      "VIBIUM_PORT": "9999"
    }
  }
}
```

### Issue: "MCP server fails to start"

**Symptom:** `Vibium server connection timeout`

**Solution:**
Check if Vibium is properly installed:

```bash
npx -y vibium --version
```

Clear cache and reinstall:

```bash
npm cache clean --force
npx -y vibium@latest
```

### Issue: "Tests timeout in CI/CD"

**Symptom:** Timeout errors in GitHub Actions or other CI

**Solution:**
Increase timeout and enable headless mode:

```json
{
  "vibium": {
    "env": {
      "VIBIUM_HEADLESS": "true",
      "VIBIUM_TIMEOUT": "60000"
    }
  }
}
```

### Issue: "Memory exhausted"

**Symptom:** `FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed`

**Solution:**
Chrome can consume significant memory. Set Node memory limit:

```bash
# In CI/CD environment
NODE_OPTIONS=--max-old-space-size=4096 npx -y vibium
```

Or in GitHub Actions:

```yaml
env:
  NODE_OPTIONS: --max-old-space-size=4096
```

## Integration with AQE v3 Agents

### Using Vibium in Test Agents

```typescript
// Example: QE Agent using Vibium
class VibiumTestAgent {
  async runVisualTest(url: string, baselineId: string) {
    // Vibium MCP methods available through AQE v3
    const result = await this.vibiumClient.visualRegression({
      url,
      baseline: baselineId,
      threshold: 0.99,
    });

    return result;
  }

  async auditAccessibility(url: string) {
    const audit = await this.vibiumClient.accessibility({
      url,
      standard: 'WCAG2AA',
    });

    return audit;
  }
}
```

### Spawning Vibium-Enabled Agents

```typescript
// AQE v3 Fleet initialization with Vibium
import { aqeFleet } from '@agentic-qe/v3';

await aqeFleet.init({
  topology: 'hierarchical',
  mcp: {
    enabled: true,
    servers: ['vibium', 'agentic-qe-v3'],
  },
});

// Spawn visual testing agent
const visualAgent = await aqeFleet.spawn({
  domain: 'visual-testing',
  model: 'sonnet',
  capabilities: ['vibium'],
});
```

## Performance Considerations

### Optimization Tips

1. **Reuse Browser Context**
   - Don't create new browser instances for each test
   - Share context across related tests

2. **Parallel Execution**
   - Run independent visual tests in parallel
   - Use AQE's parallel executor for better throughput

3. **Caching Baselines**
   - Store visual baselines in distributed cache
   - Reduce file I/O overhead

4. **Headless Mode**
   - Always use headless in CI/CD environments
   - Saves ~30-40% memory and improves speed

### Resource Requirements

| Scenario | CPU | Memory | Disk |
|----------|-----|--------|------|
| Single visual test | 1 core | 512MB | 100MB |
| 5 parallel tests | 2-4 cores | 2.5GB | 100MB |
| 10 parallel tests | 4+ cores | 5GB | 100MB |
| Production CI/CD | 8+ cores | 8GB | 500MB |

## Advanced Configuration

### Custom Chrome Arguments

Extend `mcp.json` with custom Chromium flags:

```json
{
  "vibium": {
    "command": "npx",
    "args": ["-y", "vibium"],
    "env": {
      "VIBIUM_CHROME_ARGS": "--disable-gpu --disable-dev-shm-usage"
    }
  }
}
```

### Proxy Configuration

For environments behind corporate proxies:

```json
{
  "vibium": {
    "env": {
      "HTTPS_PROXY": "http://proxy.company.com:8080",
      "HTTP_PROXY": "http://proxy.company.com:8080"
    }
  }
}
```

### Custom User Agent

```json
{
  "vibium": {
    "env": {
      "VIBIUM_USER_AGENT": "Custom User Agent String"
    }
  }
}
```

## Security Considerations

1. **Never expose Vibium port publicly**
   - Keep MCP server local-only
   - Use firewall rules to restrict access

2. **Sanitize test data**
   - Don't capture sensitive information in screenshots
   - Mask personal data in accessibility audits

3. **Credential management**
   - Use environment variables for test credentials
   - Never hardcode secrets in test scenarios

4. **Screenshot storage**
   - Store baselines in secure, encrypted storage
   - Implement access controls

## Migration Guide

### From Puppeteer to Vibium

If migrating existing tests:

```typescript
// OLD: Puppeteer
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto(url);
const screenshot = await page.screenshot();

// NEW: Vibium via MCP
const result = await vibiumClient.screenshot({ url });
```

### From Selenium to Vibium

```python
# OLD: Selenium
driver = webdriver.Chrome()
driver.get(url)
screenshot = driver.save_screenshot("test.png")

# NEW: Vibium (JavaScript/TypeScript)
const result = await vibiumClient.screenshot({ url });
```

## Support and Resources

- **Vibium Documentation**: https://vibium.dev/docs
- **AQE v3 Integration**: See `/v3/docs/reference/aqe-fleet.md`
- **MCP Protocol**: https://modelcontextprotocol.io/
- **Issue Tracker**: Report Vibium issues in v3/issues

## Contributing

To improve this integration:

1. Test Vibium with your AQE agent workflows
2. Document any custom configurations
3. Share performance metrics
4. Report issues with reproduction steps

## Changelog

### v3.0.0 (Current)
- Initial Vibium MCP server integration
- Support for visual regression testing
- Accessibility audit capabilities
- E2E test automation support
- CI/CD headless mode configuration

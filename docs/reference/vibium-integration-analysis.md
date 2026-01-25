# Vibium Integration Analysis for AQE v3

## Executive Summary

**Vibium** is an open-source browser automation infrastructure built specifically for AI agents. It provides a single binary (~10MB) that handles browser lifecycle, WebDriver BiDi protocol, and exposes an MCP server for Claude Code integration.

**Key Finding**: Vibium could significantly enhance our v3 e2e browser-based testing capabilities, particularly for the `visual-accessibility` domain which currently lacks real browser automation.

---

## Vibium Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Claude Code / AQE v3                    │
└─────────────────────────────────────────────────────────────┘
                      ▲
                      │ MCP Protocol (stdio)
                      ▼
           ┌─────────────────────┐
           │   Vibium Clicker    │
           │   (~10MB binary)    │
           │                     │
           │  ┌───────────────┐  │
           │  │  MCP Server   │  │
           │  └───────▲───────┘  │         ┌──────────────────┐
           │          │          │WebSocket│                  │
           │  ┌───────▼───────┐  │   BiDi  │                  │
           │  │  BiDi Proxy   │  │◄───────►│  Chrome Browser  │
           │  └───────────────┘  │         │                  │
           └─────────────────────┘         └──────────────────┘
```

### Core Components

| Component | Purpose |
|-----------|---------|
| **Clicker** | Go binary handling browser management, BiDi proxy, MCP server |
| **JS Client** | `npm install vibium` - sync/async APIs |
| **Python Client** | `pip install vibium` - sync/async APIs |
| **MCP Server** | stdio interface for LLM agents |

### MCP Tools Available

| Tool | Description |
|------|-------------|
| `browser_launch` | Start browser (visible by default) |
| `browser_navigate` | Navigate to URL |
| `browser_find` | Find element by CSS selector |
| `browser_click` | Click an element |
| `browser_type` | Type text into an element |
| `browser_screenshot` | Capture viewport (base64 or file) |
| `browser_quit` | Close browser |

---

## Current v3 Browser Testing Gaps

### 1. AccessibilityTesterService (v3/src/domains/visual-accessibility/services/accessibility-tester.ts)

**Current State**: Uses heuristic-based URL pattern analysis without real browser automation.

```typescript
// Current approach (lines 478-569)
private checkRuleWithHeuristics(rule: AccessibilityRule, context: RuleContext): ViolationNode[] {
  // Analyzes URL patterns to identify likely accessibility issues
  // WITHOUT browser automation (static analysis based on URL patterns)
}
```

**Limitations**:
- Cannot detect actual DOM elements or their accessibility attributes
- Cannot verify real contrast ratios (just estimates)
- Cannot test keyboard navigation interactively
- Cannot detect focus traps in real modal dialogs

### 2. Visual Regression Testing

**Current State**: No real screenshot comparison capability

**Needed**:
- Actual viewport screenshots for visual regression
- Multi-viewport responsive testing
- Screenshot diffing with baseline comparisons

### 3. E2E Integration Testing

**Current State**: No browser-based e2e test execution

**Needed**:
- Real user flow testing
- Form submission validation
- Authentication flow testing
- Cross-browser compatibility checks

---

## Integration Opportunities

### Opportunity 1: Real Accessibility Auditing

**Integrate Vibium + axe-core for WCAG compliance**

```typescript
// Enhanced AccessibilityTesterService with Vibium
async auditWithBrowser(url: string, options?: AuditOptions): Promise<Result<AccessibilityReport, Error>> {
  // 1. Launch browser via Vibium MCP
  await mcp.call('browser_launch', { headless: true });

  // 2. Navigate to URL
  await mcp.call('browser_navigate', { url });

  // 3. Inject axe-core and run audit
  const violations = await this.runAxeAudit();

  // 4. Take screenshot for documentation
  const screenshot = await mcp.call('browser_screenshot', {});

  // 5. Close browser
  await mcp.call('browser_quit', {});

  return ok(this.transformAxeResults(violations));
}
```

**Benefits**:
- Real DOM inspection for accessibility violations
- Actual color contrast calculations
- Interactive keyboard navigation testing
- Focus trap detection

### Opportunity 2: Visual Regression Agent

**New agent for screenshot-based visual testing**

```typescript
// qe-visual-regression agent using Vibium
class VisualRegressionAgent {
  async captureBaseline(url: string, viewports: Viewport[]): Promise<BaselineCapture> {
    const captures: Screenshot[] = [];

    await mcp.call('browser_launch', { headless: true });

    for (const viewport of viewports) {
      // Resize viewport
      await mcp.call('browser_navigate', { url });
      // Wait for page load
      const screenshot = await mcp.call('browser_screenshot', { filename: `${url}-${viewport.name}.png` });
      captures.push({ viewport, data: screenshot });
    }

    await mcp.call('browser_quit', {});
    return { url, captures, timestamp: new Date() };
  }

  async compareWithBaseline(url: string, baseline: BaselineCapture): Promise<DiffReport> {
    // Take new screenshots and compare with baseline
    // Generate pixel diff report
  }
}
```

### Opportunity 3: E2E Test Runner Integration

**Integrate Vibium into test-execution domain**

```typescript
// E2E test runner using Vibium
interface E2ETestCase {
  name: string;
  steps: E2EStep[];
}

interface E2EStep {
  action: 'navigate' | 'click' | 'type' | 'find' | 'screenshot';
  selector?: string;
  url?: string;
  text?: string;
  assertion?: string;
}

class E2ETestRunner {
  async runTest(testCase: E2ETestCase): Promise<E2ETestResult> {
    await mcp.call('browser_launch', {});

    const results: StepResult[] = [];
    for (const step of testCase.steps) {
      try {
        const result = await this.executeStep(step);
        results.push({ step, success: true, result });
      } catch (error) {
        results.push({ step, success: false, error: error.message });
        break; // Stop on first failure
      }
    }

    await mcp.call('browser_quit', {});
    return { testCase, results, passed: results.every(r => r.success) };
  }
}
```

### Opportunity 4: AI-Powered Smart Locators (Future)

Vibium's V2 roadmap includes AI-powered locators:

```typescript
// Future capability from Vibium V2
await vibe.do("click the login button");
await vibe.check("verify the dashboard loaded");
const el = await vibe.find("the blue submit button");
```

This aligns well with our QE agents that could use natural language to describe elements.

---

## Recommended Integration Path

### Phase 1: MCP Server Integration (1-2 weeks)

1. **Add Vibium as MCP server** in AQE v3 configuration
   ```bash
   claude mcp add vibium -- npx -y vibium
   ```

2. **Create Vibium client wrapper** in `v3/src/integrations/vibium/`
   - TypeScript types for MCP tool responses
   - Error handling and retry logic
   - Connection management

3. **Update AccessibilityTesterService** to use real browser when available
   - Keep heuristic mode as fallback
   - Add `browserMode` configuration option

### Phase 2: Visual Testing Enhancement (2-3 weeks)

1. **Add responsive-tester browser support**
   - Multi-viewport screenshot capture
   - Real device emulation

2. **Implement visual regression testing**
   - Baseline capture and storage
   - Pixel-level comparison
   - Threshold-based pass/fail

3. **Update visual-tester service**
   - Real screenshot comparison
   - Layout shift detection

### Phase 3: E2E Testing Integration (2-3 weeks)

1. **Create e2e-test-runner service**
   - Step-based test execution
   - Assertion framework integration

2. **Add e2e test generation capability**
   - Generate browser tests from user flows
   - Convert Gherkin scenarios to Vibium steps

3. **Integrate with test-execution domain**
   - Run e2e tests in parallel
   - Generate reports with screenshots

---

## Technical Considerations

### Installation
```bash
# Add to package.json
npm install vibium

# Or use npx (downloads automatically)
npx -y vibium
```

### MCP Configuration
```json
{
  "mcpServers": {
    "vibium": {
      "command": "npx",
      "args": ["-y", "vibium"],
      "env": {}
    }
  }
}
```

### Headless vs Visible Mode

| Mode | Use Case |
|------|----------|
| `headless: false` (default) | Debugging, demos, agent visibility |
| `headless: true` | CI/CD, parallel execution, server environments |

### Auto-Wait Capabilities

Vibium includes built-in auto-wait with actionability checks:
- `CheckVisibleType` - Element is visible
- `CheckStableType` - Element position is stable
- `CheckReceivesEventsType` - Element can receive events
- `CheckEnabledType` - Element is enabled
- `CheckEditableType` - Element is editable (for typing)

This eliminates flaky tests from timing issues.

---

## V2 Roadmap Features (Future Consideration)

| Feature | ETA | Value for AQE |
|---------|-----|---------------|
| Cortex (memory layer) | TBD | Session persistence, app mapping |
| Retina (observation layer) | TBD | Recording human sessions |
| Video Recording | Near-term | Test failure debugging |
| Network Tracing | Near-term | API call debugging |
| AI-Powered Locators | V2 | Natural language element finding |

---

## Conclusion

Vibium provides a lightweight, AI-native browser automation solution that addresses significant gaps in our v3 visual-accessibility and testing domains. The MCP-native design makes it ideal for integration with Claude Code and our agent architecture.

**Recommended Action**: Proceed with Phase 1 integration to enhance accessibility testing with real browser automation. This delivers immediate value with minimal risk.

**Estimated Total Effort**: 5-8 weeks for full integration across all three phases.

---

## References

- Vibium GitHub: https://github.com/VibiumDev/vibium
- WebDriver BiDi Spec: https://w3c.github.io/webdriver-bidi/
- axe-core: https://github.com/dequelabs/axe-core
- AQE v3 Visual-Accessibility Domain: `v3/src/domains/visual-accessibility/`

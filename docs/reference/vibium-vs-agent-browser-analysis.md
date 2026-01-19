# Vibium vs Agent-Browser Analysis for AQE v3

**Date:** 2026-01-19
**Status:** Comparative Analysis
**Recommendation:** HYBRID INTEGRATION (see conclusion)

---

## Executive Summary

| Aspect | Vibium | agent-browser (Vercel Labs) |
|--------|--------|----------------------------|
| **Architecture** | Go binary + MCP server | Rust CLI + Node.js daemon |
| **Protocol** | WebDriver BiDi | Playwright (Chrome DevTools) |
| **Integration** | MCP-native | CLI-native (with Claude Skill) |
| **Commands** | 7 core MCP tools | 70+ CLI commands |
| **Binary Size** | ~10MB | ~2MB Rust + Node.js deps |
| **Focus** | AI agent simplicity | Comprehensive testing |
| **Snapshot** | No | Yes (with refs @e1, @e2) |
| **Sessions** | Unknown | Multi-session support |
| **Recording** | V2 roadmap | Native video recording |
| **License** | Open source | Apache-2.0 |

**Key Finding:** agent-browser offers significantly more testing capabilities while Vibium offers simpler MCP integration. **We should integrate BOTH** for different use cases.

---

## Detailed Comparison

### 1. Architecture

#### Vibium
```
Claude Code ──MCP──► Vibium Binary ──BiDi──► Chrome
                     (Go ~10MB)
```
- Single binary with embedded MCP server
- Uses WebDriver BiDi protocol (W3C standard)
- MCP-native design for LLM agents

#### agent-browser
```
Claude Code ──Bash──► Rust CLI ──Socket──► Node.js Daemon ──CDP──► Playwright ──► Chrome
                      (~2MB)                 (managed)
```
- Client-daemon architecture with Rust CLI + Node.js backend
- Uses Playwright (Chrome DevTools Protocol)
- CLI-first design with Claude Code skill support

### 2. Command Coverage

| Category | Vibium | agent-browser |
|----------|--------|---------------|
| Navigation | 3 | 6 |
| Element Interaction | 4 | 15+ |
| Screenshots | 1 | 2 (+ PDF) |
| Waiting | 0 explicit | 6 variations |
| Assertions | 0 | 3 (visible, enabled, checked) |
| Network | 0 | 5 (route, mock, intercept) |
| Storage/Cookies | 0 | 8 commands |
| Tabs/Windows | 0 | 5 commands |
| Frames | 0 | 2 commands |
| Mouse Control | 0 | 4 commands |
| Keyboard | 1 (type) | 4 (press, keydown, keyup, type) |
| Device Emulation | 0 | 4 (viewport, device, geo, offline) |
| Recording | V2 roadmap | Native video recording |
| Tracing | 0 | Trace start/stop |
| Auth State | 0 | Save/load state |
| Sessions | Unknown | Multi-session |
| Snapshot/Refs | 0 | Full snapshot with @refs |

### 3. Key Feature Differences

#### agent-browser Exclusive Features

1. **Snapshot with Refs** - Critical for deterministic element selection:
```bash
agent-browser snapshot -i
# Output:
# - button "Submit" [ref=e1]
# - textbox "Email" [ref=e2]

agent-browser click @e1
agent-browser fill @e2 "test@example.com"
```

2. **Network Interception** - Mock APIs, block requests:
```bash
agent-browser network route "/api/*" --body '{"mocked": true}'
agent-browser network route "ads.com" --abort
```

3. **Multi-Session Support** - Parallel isolated browsers:
```bash
agent-browser --session test1 open site-a.com
agent-browser --session test2 open site-b.com
```

4. **Auth State Persistence** - Login once, reuse:
```bash
agent-browser state save auth.json
agent-browser state load auth.json
```

5. **Video Recording** - Native test recording:
```bash
agent-browser record start ./test.webm
# ... perform actions ...
agent-browser record stop
```

6. **Comprehensive Wait Strategies**:
```bash
agent-browser wait @e1                    # Element
agent-browser wait --text "Success"       # Text
agent-browser wait --url "**/dashboard"   # URL pattern
agent-browser wait --load networkidle     # Network idle
agent-browser wait --fn "window.ready"    # JS condition
```

7. **Device Emulation**:
```bash
agent-browser set device "iPhone 14"
agent-browser set viewport 1920 1080
agent-browser set geo 37.7749 -122.4194
```

8. **WebSocket Streaming** - Live browser preview:
```bash
AGENT_BROWSER_STREAM_PORT=9223 agent-browser open example.com
# Connect to ws://localhost:9223 for live viewport stream
```

#### Vibium Advantages

1. **MCP-Native** - Direct tool integration with Claude:
```javascript
// Direct MCP calls without Bash wrapper
mcp.call('browser_launch', { headless: true });
mcp.call('browser_navigate', { url: 'https://example.com' });
mcp.call('browser_click', { selector: '#submit' });
```

2. **Simpler API** - Fewer concepts to learn for basic automation

3. **WebDriver BiDi** - W3C standard protocol (potentially better cross-browser support)

4. **AI-Powered Locators (V2 Roadmap)**:
```typescript
await vibe.do("click the login button");
await vibe.check("verify the dashboard loaded");
```

---

## Integration Strategy Recommendation

### HYBRID APPROACH: Use Both Tools

We should integrate **BOTH** tools, each for their strengths:

```
                        AQE v3 Browser Automation
                                  |
         ┌────────────────────────┴────────────────────────┐
         |                                                  |
    ┌────▼─────┐                                     ┌──────▼──────┐
    │  Vibium  │                                     │agent-browser│
    │  (MCP)   │                                     │   (CLI)     │
    └────┬─────┘                                     └──────┬──────┘
         |                                                  |
    Simple Tasks                                      Advanced Testing
    - Quick screenshots                               - E2E test execution
    - Basic navigation                                - Visual regression
    - Accessibility spot checks                       - Multi-viewport
    - AI agent simple interactions                    - Network mocking
                                                      - Session management
                                                      - Video recording
```

### Recommended Mapping

| Use Case | Tool | Reason |
|----------|------|--------|
| **Accessibility audits** | agent-browser | Snapshot + axe-core injection |
| **Visual regression** | agent-browser | Multi-viewport, screenshot diff |
| **E2E test execution** | agent-browser | Comprehensive commands, assertions |
| **Quick page screenshots** | Vibium | Simpler MCP call |
| **Simple agent navigation** | Vibium | MCP-native |
| **Network mocking/API tests** | agent-browser | Network interception |
| **Auth flow testing** | agent-browser | State save/load |
| **Responsive testing** | agent-browser | Device emulation |
| **Parallel browser tests** | agent-browser | Multi-session support |
| **AI-powered locators (future)** | Vibium V2 | When available |

---

## Updated GOAP Integration Plan

### Modified Phase 1: Dual Integration Foundation

#### A1.1a - Configure Vibium MCP Server (keep as planned)
```json
{
  "mcpServers": {
    "vibium": {
      "command": "npx",
      "args": ["-y", "vibium"]
    }
  }
}
```

#### A1.1b - Install agent-browser (NEW)
```bash
npm install agent-browser
agent-browser install  # Download Chromium
```

#### A1.2 - Create Unified Browser Client (MODIFIED)
```typescript
// v3/src/integrations/browser/index.ts
interface BrowserClient {
  // Common interface
  launch(options?: LaunchOptions): Promise<void>;
  navigate(url: string): Promise<void>;
  screenshot(): Promise<Buffer>;
  close(): Promise<void>;

  // Advanced (agent-browser only)
  snapshot(options?: SnapshotOptions): Promise<SnapshotResult>;
  click(refOrSelector: string): Promise<void>;
  fill(refOrSelector: string, text: string): Promise<void>;
  wait(condition: WaitCondition): Promise<void>;
  network: NetworkController;
  session: SessionController;
}

// Factory function selects based on capabilities needed
function createBrowserClient(mode: 'simple' | 'advanced'): BrowserClient {
  if (mode === 'simple') {
    return new VibiumClient();  // MCP-based
  }
  return new AgentBrowserClient();  // CLI-based
}
```

### Modified Phase 2: Visual Testing (agent-browser primary)

#### Use agent-browser for:
- Multi-viewport capture (device emulation)
- Snapshot-based accessibility with refs
- Visual regression diffing
- Responsive testing

```typescript
// v3/src/domains/visual-accessibility/services/viewport-capture.ts
class ViewportCaptureService {
  async captureViewports(url: string, viewports: Viewport[]): Promise<Screenshot[]> {
    const screenshots: Screenshot[] = [];

    for (const viewport of viewports) {
      await this.browser.execute(`set viewport ${viewport.width} ${viewport.height}`);
      await this.browser.execute(`open ${url}`);
      await this.browser.execute('wait --load networkidle');
      const screenshot = await this.browser.execute('screenshot --json');
      screenshots.push({ viewport, data: screenshot });
    }

    return screenshots;
  }
}
```

### Modified Phase 3: E2E Testing (agent-browser only)

agent-browser's snapshot + refs workflow is ideal for E2E:

```typescript
// v3/src/domains/test-execution/services/e2e-runner.ts
class E2ETestRunner {
  async executeStep(step: E2EStep): Promise<StepResult> {
    switch (step.action) {
      case 'navigate':
        await this.exec(`open ${step.url}`);
        break;
      case 'snapshot':
        const snapshot = await this.exec('snapshot -i --json');
        return { snapshot: JSON.parse(snapshot) };
      case 'click':
        await this.exec(`click ${step.ref}`);  // Uses @e1 refs
        break;
      case 'fill':
        await this.exec(`fill ${step.ref} "${step.text}"`);
        break;
      case 'assert-visible':
        const visible = await this.exec(`is visible ${step.ref} --json`);
        if (!JSON.parse(visible).success) throw new AssertionError();
        break;
      case 'wait':
        await this.exec(`wait ${step.condition}`);
        break;
    }
  }

  private async exec(cmd: string): Promise<string> {
    return execSync(`agent-browser ${cmd}`).toString();
  }
}
```

---

## File Structure Update

```
v3/src/integrations/
├── browser/                       # Unified browser interface
│   ├── index.ts                   # Public exports
│   ├── types.ts                   # Common types
│   ├── client-factory.ts          # Factory for client selection
│   ├── vibium/                    # Vibium-specific (MCP)
│   │   ├── client.ts
│   │   └── types.ts
│   └── agent-browser/             # agent-browser-specific (CLI)
│       ├── client.ts
│       ├── snapshot-parser.ts
│       ├── session-manager.ts
│       └── types.ts
├── vibium/                        # (DEPRECATED - merge into browser/)
└── ruvector/                      # Existing integration

v3/src/domains/visual-accessibility/services/
├── accessibility-tester.ts        # Uses agent-browser snapshot + axe
├── viewport-capture.ts            # Uses agent-browser device emulation
├── visual-regression.ts           # Uses agent-browser screenshots
└── responsive-tester.ts           # Uses agent-browser viewports

v3/src/domains/test-execution/services/
├── e2e-runner.ts                  # Uses agent-browser exclusively
├── step-executor.ts               # Ref-based step execution
├── session-manager.ts             # Multi-session support
└── network-mocker.ts              # Network interception
```

---

## Conclusion

### Recommendation: INTEGRATE BOTH

1. **Keep Vibium** for:
   - Simple MCP-based automation
   - Quick screenshots
   - Basic navigation tasks
   - Future AI-powered locators (V2)

2. **Add agent-browser** for:
   - All E2E testing (primary tool)
   - Visual regression testing
   - Accessibility auditing (with snapshot)
   - Network mocking
   - Multi-session parallel testing
   - Auth state management
   - Responsive/device testing

3. **Create unified interface** that:
   - Selects appropriate tool based on task complexity
   - Falls back gracefully if one tool unavailable
   - Provides consistent API for domain services

### Priority Change

| Original Plan | Updated Priority |
|---------------|------------------|
| Vibium integration first | agent-browser first for testing capabilities |
| Vibium for E2E | agent-browser for E2E (refs + assertions) |
| Vibium for visual | agent-browser for visual (viewports + screenshots) |
| Keep both simple/advanced modes | Keep both for respective strengths |

---

## Next Steps

1. **Install agent-browser** in the AQE v3 project
2. **Create unified browser interface** in `v3/src/integrations/browser/`
3. **Update AccessibilityTesterService** to use agent-browser snapshot
4. **Build E2E runner** on agent-browser's ref-based workflow
5. **Keep Vibium** configured for simple MCP tasks
6. **Update GOAP plan** to reflect hybrid approach

---

## References

- agent-browser: https://github.com/vercel-labs/agent-browser
- Vibium: https://github.com/VibiumDev/vibium
- Original GOAP plan: `/workspaces/agentic-qe/docs/plans/goap-vibium-integration.md`
- Vibium analysis: `/workspaces/agentic-qe/docs/reference/vibium-integration-analysis.md`

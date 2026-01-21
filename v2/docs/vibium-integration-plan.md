# Vibium Integration Plan: QX-Partner & Testability-Scorer Enhancement

**Document Version**: 1.0
**Date**: 2025-12-12
**Status**: Planning Phase
**Methodology**: GOAP (Goal-Oriented Action Planning)

---

## Executive Summary

This document outlines a comprehensive implementation plan for integrating **Vibium** (browser automation infrastructure for AI agents) into two critical components of the Agentic QE Fleet:

1. **QX-Partner Agent** - Quality Experience (QX) analysis combining QA advocacy and UX perspectives
2. **Testability-Scorer Skill** - Code testability assessment using 10 principles of intrinsic testability

The integration will enable real-time browser automation, live page interaction, and enhanced observability for quality assessments, moving beyond static analysis to dynamic runtime inspection.

---

## 1. Understanding Vibium

### 1.1 Core Capabilities

Vibium is a **lightweight browser automation infrastructure** designed specifically for AI agents with the following characteristics:

**Technology Stack**:
- Go-based binary (~10MB) with zero external dependencies
- WebDriver BiDi protocol support
- Model Context Protocol (MCP) integration for AI agents
- Cross-platform support (Linux x64/arm64, macOS Intel/Apple Silicon, Windows x64)
- Automatic Chrome for Testing management

**Key Features**:
- **Browser Lifecycle Management**: Launch, navigate, quit operations
- **Element Interaction**: Find, click, type with auto-wait functionality
- **Visual Capture**: Screenshot as PNG with viewport control
- **Network Visibility**: Request/response tracking (planned in V2)
- **Headless-by-Default**: Optimized for CI/CD environments
- **MCP Integration**: Native AI agent support via `browser_*` tools

**APIs Available**:

| API Type | Method | Purpose | Integration Priority |
|----------|--------|---------|---------------------|
| MCP Agent | `browser_launch` | Initialize browser session | **Critical** |
| MCP Agent | `browser_navigate` | Load target URL | **Critical** |
| MCP Agent | `browser_find` | Locate elements | **High** |
| MCP Agent | `browser_click` | Interact with elements | **High** |
| MCP Agent | `browser_type` | Input text | **Medium** |
| MCP Agent | `browser_screenshot` | Capture visuals | **High** |
| MCP Agent | `browser_quit` | Cleanup resources | **Critical** |
| JS/TS (Async) | `browser.launch()` | Programmatic control | **Medium** |
| JS/TS (Async) | `page.find()` | Element queries | **Medium** |

### 1.2 Vibium V2 Roadmap (Future Enhancements)

**Cortex (Think Layer)** - Persistent memory with SQLite + embeddings for app flow understanding
- **Relevance**: Could enhance QX-partner's historical analysis and pattern recognition
- **Timeline**: Medium-term (likely 6-12 months based on roadmap priorities)

**Retina (Sense Layer)** - Chrome extension for passive session recording
- **Relevance**: Valuable for QX analysis replay and debugging
- **Timeline**: Long-term

**Video Recording** - MP4/WebM capture for test artifacts
- **Relevance**: Critical for visual regression and QX documentation
- **Timeline**: Near-term (high priority on roadmap)

**Network Tracing** - HAR export and API inspection
- **Relevance**: Essential for performance and API testability analysis
- **Timeline**: Near-term

**AI-Powered Locators** - Natural language element finding
- **Relevance**: Could simplify QX heuristic implementations
- **Timeline**: Long-term (marked as "hardest problem")

### 1.3 Comparison with Existing Playwright Usage

**Current State**: Testability-scorer uses Playwright directly:
```javascript
const { test, expect } = require('@playwright/test');
await page.goto(config.baseURL);
await page.locator('[data-product]').count();
```

**Vibium Advantages**:
- ✅ **Lighter weight**: 10MB binary vs Playwright's 300MB+ with browsers
- ✅ **Zero-config setup**: Auto-manages Chrome for Testing
- ✅ **MCP-native**: Direct AI agent integration without wrapper layers
- ✅ **Cross-platform consistency**: Single binary for all platforms
- ✅ **Agent-first design**: Built for LLM consumption, not just developers

**Playwright Advantages**:
- ✅ **Mature ecosystem**: 5+ years of production usage
- ✅ **Rich API**: Comprehensive browser control (network mocking, device emulation)
- ✅ **Multi-browser**: Chromium, Firefox, WebKit support
- ✅ **Developer tools**: Test generation, inspector, trace viewer
- ✅ **Testing framework**: Built-in test runner with parallelization

**Recommendation**: **Hybrid Approach**
- Use Vibium for QX-partner runtime analysis (MCP agent interactions)
- Keep Playwright for testability-scorer (comprehensive testing features)
- Evaluate Vibium as Playwright replacement in Phase 3 (optimization)

---

## 2. Integration Benefits & Value Proposition

### 2.1 For QX-Partner Agent

**Current Limitations**:
- ❌ Static analysis only - no runtime page inspection
- ❌ Cannot detect oracle problems requiring live user interaction
- ❌ Limited observability into actual page behavior
- ❌ No real-time UX flow analysis
- ❌ Cannot validate business logic in live applications

**Vibium-Enhanced Capabilities**:
- ✅ **Live Oracle Detection**: Navigate actual user flows to detect stakeholder conflicts
- ✅ **Runtime UX Analysis**: Measure real interaction latency and responsiveness
- ✅ **Dynamic Balance Assessment**: Test user vs business trade-offs in live environments
- ✅ **Real-World Impact Analysis**: Capture screenshots before/after changes for visible impact
- ✅ **Cross-Device QX Testing**: Validate quality experience across viewport sizes
- ✅ **Competitive QX Analysis**: Automate competitor site QX scoring

**Use Cases Unlocked**:

| Use Case | Current State | With Vibium | Impact |
|----------|---------------|-------------|--------|
| Checkout Flow Oracle Detection | Manual analysis | Automated flow navigation + heuristic scoring | **High** |
| Mobile Responsiveness QX | Screenshot comparison | Live interaction testing at different viewports | **High** |
| Form Usability Analysis | Static HTML review | Real-time form validation and error message capture | **Medium** |
| Competitor QX Benchmarking | Not possible | Automated multi-site QX scoring runs | **High** |
| Performance Impact on QX | Separate tool required | Integrated timing measurements during flow | **Medium** |

### 2.2 For Testability-Scorer Skill

**Current Limitations**:
- ❌ Playwright dependency adds 300MB+ overhead
- ❌ Complex setup for CI/CD environments
- ❌ Not optimized for AI agent consumption
- ❌ Browser management requires manual configuration

**Vibium-Enhanced Capabilities**:
- ✅ **Lightweight Assessments**: 10MB vs 300MB+ reduces deployment complexity
- ✅ **Zero-Config CI/CD**: No browser installation scripts needed
- ✅ **MCP-Native Scoring**: Direct agent-to-browser communication
- ✅ **Faster Startup**: Reduced browser launch overhead
- ✅ **Unified Fleet Integration**: Same browser automation as QX-partner

**Performance Improvements** (Projected):

| Metric | Current (Playwright) | With Vibium | Improvement |
|--------|---------------------|-------------|-------------|
| Docker Image Size | ~1.2GB | ~400MB | **66% reduction** |
| Cold Start Time | ~8-12s | ~3-5s | **60% faster** |
| Memory Usage | ~250MB | ~80MB | **68% reduction** |
| Agent Integration Complexity | High (wrapper needed) | Low (MCP-native) | **Simplified** |

---

## 3. GOAP-Based Implementation Plan

### 3.1 Goal Definition

**Primary Goal**: Integrate Vibium browser automation into QX-partner agent and testability-scorer skill to enable live runtime analysis and improve deployment efficiency.

**Success Criteria**:
1. QX-partner can perform live oracle detection on running applications (90%+ accuracy)
2. Testability-scorer maintains 100% feature parity with Playwright-based implementation
3. Overall system memory footprint reduced by 50%+ for browser operations
4. CI/CD pipeline execution time reduced by 30%+ for visual/QX tests
5. All existing tests pass without modification (backward compatibility)
6. Documentation includes migration guides and comparison matrices

### 3.2 Current State Assessment

**World State - Initial Conditions**:

```typescript
{
  // QX-Partner Agent
  qxPartner: {
    implementation: "optimized",
    version: "2.1",
    capabilities: ["heuristic-analysis", "oracle-detection", "balance-assessment"],
    browserAutomation: false,  // ❌ No browser integration
    runtimeAnalysis: false,    // ❌ Static analysis only
    visualCapture: false,      // ❌ No screenshot support
    competitorAnalysis: false  // ❌ Manual only
  },

  // Testability-Scorer Skill
  testabilityScorer: {
    implementation: "complete",
    version: "1.0",
    framework: "playwright",      // ⚠️ Heavy dependency
    principles: 10,
    reportGeneration: true,
    mcpIntegration: false,       // ❌ Not MCP-native
    agentOptimized: false        // ❌ Developer-focused
  },

  // Infrastructure
  infrastructure: {
    vibiumInstalled: false,      // ❌ Not added to MCP
    mcpServer: "configured",
    playwrightInstalled: true,
    testSuiteHealth: "passing"
  },

  // Fleet Coordination
  fleet: {
    agentCount: 19,
    skillCount: 41,
    browserAutomationAgent: null  // ❌ No dedicated agent
  }
}
```

**Goal State - Desired Conditions**:

```typescript
{
  // QX-Partner Agent Enhanced
  qxPartner: {
    implementation: "optimized",
    version: "2.2",  // ✅ Upgraded
    capabilities: [
      "heuristic-analysis",
      "oracle-detection",
      "balance-assessment",
      "live-flow-analysis",           // ✅ NEW
      "runtime-interaction-testing",  // ✅ NEW
      "visual-capture",               // ✅ NEW
      "competitor-benchmarking"       // ✅ NEW
    ],
    browserAutomation: true,   // ✅ Vibium integrated
    runtimeAnalysis: true,     // ✅ Live analysis
    visualCapture: true,       // ✅ Screenshot support
    competitorAnalysis: true   // ✅ Automated
  },

  // Testability-Scorer Skill Enhanced
  testabilityScorer: {
    implementation: "complete",
    version: "2.0",  // ✅ Upgraded
    framework: "vibium",          // ✅ Migrated
    frameworkFallback: "playwright",  // ✅ Backward compat
    principles: 10,
    reportGeneration: true,
    mcpIntegration: true,        // ✅ MCP-native
    agentOptimized: true,        // ✅ AI-first
    deploymentSize: "reduced",   // ✅ 66% smaller
    ciCdPerformance: "improved"  // ✅ 30% faster
  },

  // Infrastructure Enhanced
  infrastructure: {
    vibiumInstalled: true,       // ✅ MCP server active
    mcpServer: "configured",
    playwrightInstalled: true,   // ✅ Kept for fallback
    testSuiteHealth: "passing",  // ✅ 100% compatibility
    dockerImageSize: "optimized" // ✅ 66% reduction
  },

  // Fleet Coordination Enhanced
  fleet: {
    agentCount: 19,
    skillCount: 41,
    browserAutomationAgent: "qx-partner",  // ✅ Primary user
    vibiumSkill: "browser-automation"      // ✅ New skill
  }
}
```

### 3.3 Action Inventory & Preconditions

**Available Actions** with Preconditions and Effects:

```typescript
// PHASE 1: FOUNDATION
{
  action: "install_vibium_mcp",
  preconditions: {
    mcpServerConfigured: true,
    npmAccessible: true
  },
  effects: {
    vibiumInstalled: true,
    mcpToolsAvailable: ["browser_launch", "browser_navigate", "browser_find",
                        "browser_click", "browser_screenshot", "browser_quit"]
  },
  cost: 5,  // Low effort - single command
  priority: "critical"
}

{
  action: "create_vibium_wrapper_module",
  preconditions: {
    vibiumInstalled: true,
    srcDirectoryExists: true
  },
  effects: {
    vibiumWrapperAvailable: true,
    typeSafeAPI: true,
    errorHandling: true
  },
  cost: 20,  // Medium effort - TypeScript module
  priority: "high"
}

{
  action: "write_integration_tests",
  preconditions: {
    vibiumWrapperAvailable: true,
    testFrameworkConfigured: true
  },
  effects: {
    vibiumTested: true,
    baselineCoverage: ">= 80%"
  },
  cost: 30,  // Medium-high effort
  priority: "high"
}

// PHASE 2: QX-PARTNER INTEGRATION
{
  action: "enhance_qx_partner_with_browser",
  preconditions: {
    vibiumWrapperAvailable: true,
    qxPartnerAgentExists: true,
    vibiumTested: true
  },
  effects: {
    qxPartner.browserAutomation: true,
    qxPartner.runtimeAnalysis: true,
    qxPartner.version: "2.2"
  },
  cost: 50,  // High effort - agent enhancement
  priority: "high"
}

{
  action: "implement_live_oracle_detection",
  preconditions: {
    qxPartner.browserAutomation: true,
    oracleDetectionLogicExists: true
  },
  effects: {
    qxPartner.capabilities: [...existing, "live-flow-analysis"],
    oracleAccuracy: ">= 90%"
  },
  cost: 40,
  priority: "high"
}

{
  action: "add_visual_capture_to_qx",
  preconditions: {
    qxPartner.browserAutomation: true,
    mcpToolsAvailable: ["browser_screenshot"]
  },
  effects: {
    qxPartner.visualCapture: true,
    qxPartner.capabilities: [...existing, "visual-capture"]
  },
  cost: 25,
  priority: "medium"
}

{
  action: "implement_competitor_analysis",
  preconditions: {
    qxPartner.visualCapture: true,
    qxPartner.runtimeAnalysis: true
  },
  effects: {
    qxPartner.competitorAnalysis: true,
    multiSiteBenchmarking: true
  },
  cost: 35,
  priority: "medium"
}

// PHASE 3: TESTABILITY-SCORER MIGRATION (OPTIONAL)
{
  action: "create_vibium_testability_variant",
  preconditions: {
    vibiumWrapperAvailable: true,
    testabilityScorerExists: true,
    playwrightVersionWorking: true  // Keep as reference
  },
  effects: {
    testabilityScorer.framework: "vibium",
    testabilityScorer.mcpIntegration: true,
    testabilityScorer.version: "2.0"
  },
  cost: 60,  // High effort - full migration
  priority: "low"  // Optional optimization
}

{
  action: "validate_feature_parity",
  preconditions: {
    testabilityScorer.framework: "vibium",
    playwrightVersionWorking: true
  },
  effects: {
    featureParity: "100%",
    backwardCompatibility: true
  },
  cost: 40,
  priority: "medium"
}

// PHASE 4: DOCUMENTATION & OPTIMIZATION
{
  action: "write_integration_documentation",
  preconditions: {
    qxPartner.browserAutomation: true,
    vibiumWrapperAvailable: true
  },
  effects: {
    documentationComplete: true,
    migrationGuideAvailable: true
  },
  cost: 30,
  priority: "high"
}

{
  action: "optimize_docker_images",
  preconditions: {
    vibiumInstalled: true,
    cicdPipelineExists: true
  },
  effects: {
    dockerImageSize: "reduced by 66%",
    ciCdPerformance: "improved by 30%"
  },
  cost: 25,
  priority: "medium"
}

{
  action: "create_browser_automation_skill",
  preconditions: {
    vibiumWrapperAvailable: true,
    skillsManifestExists: true
  },
  effects: {
    fleet.vibiumSkill: "browser-automation",
    fleet.skillCount: 42,
    reuseAcrossAgents: true
  },
  cost: 20,
  priority: "medium"
}
```

### 3.4 GOAP A* Search Plan

**Heuristic Function**: `h(state) = Σ(remaining_critical_goals * 100 + remaining_high_goals * 50 + remaining_medium_goals * 20)`

**Optimal Action Sequence** (A* pathfinding result):

```
START STATE → Goal Distance: 490 (4 critical × 100 + 5 high × 50 + 4 medium × 20)

PHASE 1: FOUNDATION (Cost: 55, Duration: 2-3 days)
├─ 1. install_vibium_mcp                    [Cost: 5]  → Distance: 390
├─ 2. create_vibium_wrapper_module          [Cost: 20] → Distance: 340
└─ 3. write_integration_tests               [Cost: 30] → Distance: 290

PHASE 2: QX-PARTNER INTEGRATION (Cost: 150, Duration: 5-7 days)
├─ 4. enhance_qx_partner_with_browser       [Cost: 50] → Distance: 190
├─ 5. implement_live_oracle_detection       [Cost: 40] → Distance: 145
├─ 6. add_visual_capture_to_qx              [Cost: 25] → Distance: 105
└─ 7. implement_competitor_analysis         [Cost: 35] → Distance: 70

PHASE 3: DOCUMENTATION & OPTIMIZATION (Cost: 75, Duration: 3-4 days)
├─ 8. write_integration_documentation       [Cost: 30] → Distance: 40
├─ 9. optimize_docker_images                [Cost: 25] → Distance: 20
└─ 10. create_browser_automation_skill      [Cost: 20] → Distance: 0

TOTAL COST: 280 effort points
ESTIMATED DURATION: 10-14 days (with 1 developer)
GOAL STATE ACHIEVED: ✅

OPTIONAL PHASE 3B: TESTABILITY-SCORER MIGRATION (Cost: 100, Duration: 4-5 days)
├─ 11. create_vibium_testability_variant    [Cost: 60]
└─ 12. validate_feature_parity              [Cost: 40]
```

**Rationale for Sequence**:
1. **Phase 1 First**: Foundation must be solid before building features
2. **QX-Partner Before Testability**: Higher business value, validates Vibium integration
3. **Documentation Early**: Enables parallel work and knowledge sharing
4. **Testability Migration Optional**: Playwright works well, Vibium is optimization not necessity

### 3.5 Dynamic Replanning Triggers

**OODA Loop Integration** (Observe-Orient-Decide-Act):

| Observation | Orient (Analysis) | Decide | Act (Replan) |
|-------------|-------------------|--------|--------------|
| Vibium MCP install fails | Compatibility issue or npm problem | Block vs. workaround? | If blocking: pause, escalate; if workaround: document and continue |
| Integration tests < 80% coverage | Insufficient test scenarios or Vibium limitations | Acceptable risk? | If no: add tests before proceeding; if yes: document tech debt |
| QX oracle accuracy < 90% | Algorithm needs tuning or Vibium lacks required feature | Critical for MVP? | If yes: replan to use Playwright hybrid; if no: iterate improvements |
| Docker image only 30% smaller | Vibium benefits not materializing | ROI positive? | If no: deprioritize testability migration; if yes: investigate optimization |
| Performance degradation detected | Vibium slower than Playwright for some operations | User-facing impact? | If yes: rollback or hybrid approach; if no: optimize and continue |

**Replanning Decision Points**:

```typescript
checkpointDecisions = [
  {
    checkpoint: "After Phase 1",
    question: "Is Vibium MCP integration stable?",
    ifNo: "Evaluate Puppeteer as alternative or continue with Playwright-only",
    ifYes: "Proceed to Phase 2"
  },
  {
    checkpoint: "After Action 5",
    question: "Is live oracle detection meeting 90% accuracy?",
    ifNo: "Replan: use Vibium for visual only, keep oracle logic as-is",
    ifYes: "Proceed to visual capture and competitor analysis"
  },
  {
    checkpoint: "After Phase 2",
    question: "Is QX-partner enhancement delivering value?",
    ifNo: "Skip testability migration, focus on QX optimization",
    ifYes: "Optionally proceed to testability migration or declare MVP complete"
  }
]
```

---

## 4. Detailed Integration Architecture

### 4.1 QX-Partner Agent Integration

**Architecture Diagram**:

```
┌─────────────────────────────────────────────────────────────┐
│                     QX-Partner Agent v2.2                    │
├─────────────────────────────────────────────────────────────┤
│  Existing Capabilities          │  New Vibium-Enhanced      │
│  - Heuristic Analysis           │  - Live Flow Navigation   │
│  - Oracle Problem Detection     │  - Runtime UX Measurement │
│  - Balance Assessment           │  - Visual Capture         │
│  - Static Recommendation        │  - Competitor Benchmarking│
├─────────────────────────────────┴───────────────────────────┤
│              Vibium Wrapper Module (Type-Safe)              │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐  │
│  │ launch() │navigate()│ find()   │ click()  │screenshot│  │
│  └────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘  │
│       │          │          │          │          │        │
│       └──────────┴──────────┴──────────┴──────────┘        │
│                         MCP Bridge                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  browser_launch │ browser_navigate │ browser_find    │  │
│  │  browser_click  │ browser_screenshot │ browser_quit  │  │
│  └──────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│              Vibium MCP Server (Clicker Binary)             │
│              WebDriver BiDi Proxy → Chrome for Testing      │
└─────────────────────────────────────────────────────────────┘
```

**Implementation Details**:

**File Structure**:
```
src/
├── agents/
│   ├── QXPartnerAgent.ts                    # Enhanced with Vibium
│   └── QXPartnerAgent.test.ts               # Integration tests
├── integrations/
│   └── vibium/
│       ├── VibiumWrapper.ts                 # Type-safe wrapper
│       ├── VibiumWrapper.test.ts
│       ├── types.ts                         # TypeScript definitions
│       └── README.md                        # Usage documentation
├── mcp/
│   └── tools/
│       └── qx/
│           ├── live-oracle-detection.ts     # NEW: Vibium-powered
│           ├── visual-capture.ts            # NEW: Screenshot integration
│           └── competitor-benchmark.ts      # NEW: Multi-site analysis
└── skills/
    └── browser-automation/
        └── SKILL.md                         # NEW: Skill definition
```

**Key Implementation: VibiumWrapper.ts**

```typescript
/**
 * Type-safe wrapper for Vibium MCP integration
 * Provides ergonomic API for QX-Partner agent
 */

import { MCPClient } from '../mcp/client.js';

export interface VibiumSession {
  sessionId: string;
  launched: boolean;
  currentUrl?: string;
}

export interface VibiumElement {
  selector: string;
  visible: boolean;
  text?: string;
}

export interface VibiumScreenshot {
  data: Buffer;
  format: 'png';
  width: number;
  height: number;
  timestamp: string;
}

export class VibiumWrapper {
  private mcpClient: MCPClient;
  private session: VibiumSession | null = null;

  constructor(mcpClient: MCPClient) {
    this.mcpClient = mcpClient;
  }

  /**
   * Launch browser session
   */
  async launch(options?: { headless?: boolean; viewport?: { width: number; height: number } }): Promise<VibiumSession> {
    const result = await this.mcpClient.callTool('browser_launch', {
      headless: options?.headless ?? true,
      viewport: options?.viewport
    });

    this.session = {
      sessionId: result.sessionId,
      launched: true
    };

    return this.session;
  }

  /**
   * Navigate to URL with auto-wait
   */
  async navigate(url: string, options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' }): Promise<void> {
    if (!this.session?.launched) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    await this.mcpClient.callTool('browser_navigate', {
      url,
      waitUntil: options?.waitUntil ?? 'load'
    });

    this.session.currentUrl = url;
  }

  /**
   * Find element with auto-wait (up to 30s)
   */
  async find(selector: string, options?: { timeout?: number }): Promise<VibiumElement> {
    if (!this.session?.launched) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const result = await this.mcpClient.callTool('browser_find', {
      selector,
      timeout: options?.timeout ?? 30000
    });

    return {
      selector,
      visible: result.visible,
      text: result.text
    };
  }

  /**
   * Click element
   */
  async click(selector: string): Promise<void> {
    const element = await this.find(selector);

    await this.mcpClient.callTool('browser_click', {
      selector
    });
  }

  /**
   * Capture screenshot
   */
  async screenshot(options?: { fullPage?: boolean }): Promise<VibiumScreenshot> {
    if (!this.session?.launched) {
      throw new Error('Browser not launched. Call launch() first.');
    }

    const result = await this.mcpClient.callTool('browser_screenshot', {
      fullPage: options?.fullPage ?? false
    });

    return {
      data: Buffer.from(result.data, 'base64'),
      format: 'png',
      width: result.width,
      height: result.height,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Close browser and cleanup
   */
  async quit(): Promise<void> {
    if (!this.session?.launched) {
      return; // Already closed
    }

    await this.mcpClient.callTool('browser_quit', {});
    this.session = null;
  }
}
```

**Enhanced QX-Partner Agent Methods**:

```typescript
// In src/agents/QXPartnerAgent.ts

export class QXPartnerAgent {
  private vibium: VibiumWrapper;

  /**
   * NEW: Perform live oracle detection by navigating actual user flows
   *
   * Example: Detect checkout flow conflicts between user convenience and business revenue
   */
  async detectLiveOracleProblems(targetUrl: string): Promise<OracleProblem[]> {
    const session = await this.vibium.launch({ headless: true });
    const problems: OracleProblem[] = [];

    try {
      // Navigate to target
      await this.vibium.navigate(targetUrl);

      // Capture initial state
      const initialScreenshot = await this.vibium.screenshot({ fullPage: true });

      // Test user convenience flow (e.g., one-click checkout)
      const userFlowTime = await this.measureFlowDuration(async () => {
        await this.vibium.click('[data-testid="quick-checkout"]');
        await this.vibium.find('[data-testid="order-confirmation"]');
      });

      // Test business revenue flow (e.g., upsell-heavy checkout)
      await this.vibium.navigate(targetUrl); // Reset
      const businessFlowTime = await this.measureFlowDuration(async () => {
        await this.vibium.click('[data-testid="standard-checkout"]');
        // Count upsell prompts
        const upsells = await this.countElements('[data-testid*="upsell"]');
        await this.vibium.find('[data-testid="order-confirmation"]');
      });

      // Detect oracle problem if flows conflict
      if (userFlowTime < businessFlowTime * 0.6) {
        problems.push({
          type: 'user-vs-business-conflict',
          severity: 'high',
          description: 'Quick checkout prioritizes user convenience but may reduce upsell opportunities',
          userScore: 95,
          businessScore: 45,
          recommendation: 'A/B test with revenue tracking to find optimal balance'
        });
      }

      // Store screenshots for analysis
      await this.storeArtifact('qx/visual-evidence', initialScreenshot);

    } finally {
      await this.vibium.quit();
    }

    return problems;
  }

  /**
   * NEW: Automated competitor QX benchmarking
   */
  async benchmarkCompetitorQX(targetUrls: string[]): Promise<QXBenchmarkReport> {
    const results: QXScore[] = [];

    for (const url of targetUrls) {
      const session = await this.vibium.launch({ headless: true });

      try {
        await this.vibium.navigate(url);

        // Run all QX heuristics on live site
        const qxScore = await this.runLiveQXAnalysis(this.vibium);

        // Capture evidence
        const screenshot = await this.vibium.screenshot({ fullPage: true });

        results.push({
          url,
          score: qxScore.overall,
          grade: qxScore.grade,
          oracleProblems: qxScore.oracleProblems,
          screenshot: screenshot.data
        });

      } finally {
        await this.vibium.quit();
      }
    }

    return {
      timestamp: new Date().toISOString(),
      competitorCount: results.length,
      results,
      insights: this.generateCompetitiveInsights(results)
    };
  }
}
```

### 4.2 Testability-Scorer Skill Migration (Optional)

**Migration Strategy**: **Feature Flag Approach**

```typescript
// In .claude/skills/testability-scoring/config.js

module.exports = {
  // Feature flag for Vibium vs Playwright
  browserFramework: process.env.TESTABILITY_FRAMEWORK || 'playwright',  // 'vibium' | 'playwright'

  // Vibium-specific config
  vibium: {
    headless: true,
    timeout: 45000,
    viewport: { width: 1280, height: 720 }
  },

  // Playwright config (existing)
  playwright: {
    // ... existing config
  }
};
```

**Vibium Testability Assessment Implementation**:

```typescript
// In tests/testability-scoring/testability-scoring-vibium.spec.ts

import { VibiumWrapper } from '../../src/integrations/vibium/VibiumWrapper.js';
import config from './config.js';

describe('Testability Assessment (Vibium)', () => {
  let vibium: VibiumWrapper;

  beforeAll(async () => {
    vibium = new VibiumWrapper(mcpClient);
    await vibium.launch({ headless: true });
  });

  afterAll(async () => {
    await vibium.quit();
  });

  test('1. Observability Assessment', async () => {
    await vibium.navigate(config.baseURL);

    // Check console logging (via MCP tool enhancement)
    const consoleLogs = await vibium.getConsoleLogs();  // NEW MCP tool needed
    const hasConsoleLogs = consoleLogs.length > 0;

    // Check network visibility
    const networkRequests = await vibium.getNetworkRequests();  // NEW MCP tool needed
    const hasNetworkRequests = networkRequests.length > 0;

    // Calculate observability score
    let score = 0;
    if (hasConsoleLogs) score += 25;
    if (hasNetworkRequests) score += 30;
    score += 10; // Base score

    testabilityScores.principles.observability = {
      score: Math.min(score, 100),
      grade: getLetterGrade(score),
      weight: config.weights.observability
    };
  });

  // ... remaining 9 principles adapted for Vibium
});
```

**Gap Analysis: Vibium vs Playwright for Testability**:

| Feature | Playwright | Vibium v1 | Vibium v2 (Planned) | Workaround |
|---------|-----------|-----------|---------------------|------------|
| Console log capture | ✅ Native | ❌ Not exposed | ✅ Planned (Network Tracing) | MCP tool enhancement |
| Network request tracking | ✅ Native | ❌ Not exposed | ✅ HAR export | MCP tool enhancement |
| Element count | ✅ Native | ✅ Via find + iterate | ✅ Native | Wrapper helper |
| Script/style count | ✅ Native | ⚠️ Via DOM query | ⚠️ Via DOM query | Acceptable |
| Page errors | ✅ Native | ❌ Not exposed | ⚠️ Unknown | MCP tool enhancement |
| Performance timing | ✅ Native | ❌ Not exposed | ⚠️ Unknown | Client-side timing |

**Recommendation**: **Keep Playwright for Phase 1**, revisit Vibium migration after V2 features ship (6-12 months).

---

## 5. Implementation Milestones & Success Criteria

### Milestone 1: Foundation Setup
**Duration**: 2-3 days
**Effort**: 55 points

**Deliverables**:
- ✅ Vibium MCP server installed and verified (`claude mcp add vibium`)
- ✅ VibiumWrapper TypeScript module with type-safe API
- ✅ Integration test suite covering all MCP tools (>80% coverage)
- ✅ CI/CD pipeline updated to include Vibium tests

**Success Criteria**:
- [ ] `npx vibium` launches successfully
- [ ] All 7 MCP tools (`browser_*`) respond within 5s
- [ ] Integration tests pass with 0 flakes over 10 runs
- [ ] Type definitions exported and linted without errors

**Validation Commands**:
```bash
# Verify MCP server
claude mcp list | grep vibium

# Test wrapper
npm run test:integration -- vibium

# Check coverage
npm run coverage:vibium
```

---

### Milestone 2: QX-Partner Browser Integration
**Duration**: 5-7 days
**Effort**: 150 points

**Deliverables**:
- ✅ Enhanced QXPartnerAgent with Vibium integration
- ✅ Live oracle detection method (`detectLiveOracleProblems`)
- ✅ Visual capture integration (`captureQXEvidence`)
- ✅ Competitor benchmarking method (`benchmarkCompetitorQX`)
- ✅ Updated agent definition (`.claude/agents/qx-partner.md`)
- ✅ Integration tests for new capabilities

**Success Criteria**:
- [ ] Live oracle detection achieves >=90% accuracy on test scenarios
- [ ] Screenshot capture completes in <3s for 1280×720 viewport
- [ ] Competitor benchmark runs 3 sites in <60s
- [ ] All existing QX-partner tests pass (backward compatibility)
- [ ] Memory overhead <100MB per browser session

**Validation Commands**:
```bash
# Run enhanced QX agent
aqe agents run qx-partner --url https://example.com --mode live-oracle

# Benchmark competitors
aqe agents run qx-partner --benchmark https://site1.com,https://site2.com

# Regression test
npm run test:agents -- qx-partner
```

**Test Scenarios**:

| Scenario | Input | Expected Output | Pass Criteria |
|----------|-------|-----------------|---------------|
| Checkout Oracle Detection | E-commerce site with quick vs. standard checkout | Oracle problem detected with severity HIGH | Detects user/business conflict |
| Mobile Responsiveness QX | Responsive site tested at 3 viewports | QX scores per viewport with visual evidence | Generates 3 screenshots + scores |
| Form Usability Analysis | Form with validation errors | Real-time error message capture | Captures error states accurately |
| Competitor Benchmark | 3 competitor URLs | Comparative QX report with rankings | Completes in <60s, scores valid |

---

### Milestone 3: Documentation & Optimization
**Duration**: 3-4 days
**Effort**: 75 points

**Deliverables**:
- ✅ Integration documentation (`docs/vibium-integration.md`)
- ✅ Migration guide for agent developers
- ✅ Browser automation skill definition (`.claude/skills/browser-automation/`)
- ✅ Optimized Docker images for CI/CD
- ✅ Performance benchmark report

**Success Criteria**:
- [ ] Documentation covers all Vibium APIs with examples
- [ ] Docker image size reduced by >=50%
- [ ] CI/CD test execution time reduced by >=25%
- [ ] Browser automation skill usable by other agents (e.g., visual-tester)

**Validation Metrics**:
```bash
# Docker image comparison
docker images | grep agentic-qe
# Before: agentic-qe:latest  1.2GB
# After:  agentic-qe:vibium  <600MB

# CI/CD performance
# Before: Visual tests: 180s
# After:  Visual tests: <135s

# Skill verification
aqe skills show browser-automation
```

---

### Milestone 4: Optional Testability-Scorer Migration
**Duration**: 4-5 days
**Effort**: 100 points
**Status**: **OPTIONAL** (Defer to Phase 2 based on V2 roadmap)

**Deliverables**:
- ✅ Vibium-based testability assessment variant
- ✅ Feature parity validation (10 principles)
- ✅ Performance comparison report (Vibium vs Playwright)
- ✅ Feature flag configuration system

**Success Criteria**:
- [ ] 100% feature parity with Playwright version
- [ ] All 10 principles scored identically (±2 points)
- [ ] Deployment size reduced by >=60%
- [ ] Cold start time reduced by >=50%

**Decision Gate**:
```
IF (Vibium V2 ships Network Tracing + Console API) THEN
  Proceed with migration
ELSE
  Keep Playwright for testability-scorer, use Vibium only for QX-partner
END IF
```

---

## 6. Risk Analysis & Mitigation

### 6.1 Technical Risks

| Risk | Probability | Impact | Mitigation Strategy | Contingency Plan |
|------|------------|--------|---------------------|------------------|
| **Vibium MCP compatibility issues** | Medium (30%) | High | Test in isolated environment first; validate all 7 tools before integration | Use Puppeteer as fallback; maintain Playwright for critical paths |
| **Network/console APIs not exposed in V1** | High (70%) | Medium | Verify limitations early; plan testability migration for V2 only | Keep Playwright for testability-scorer indefinitely |
| **Performance degradation vs. Playwright** | Low (20%) | Medium | Benchmark early and often; profile memory/CPU usage | Hybrid approach: Vibium for simple tasks, Playwright for complex |
| **Oracle detection accuracy <90%** | Medium (40%) | High | Extensive test scenario coverage; iterate algorithm with real data | Fallback to static analysis + manual validation |
| **Docker image optimization not materializing** | Low (15%) | Low | Multi-stage Docker builds; prune dependencies | Accept smaller gains, document trade-offs |
| **Browser session leaks** | Medium (35%) | Medium | Implement aggressive timeout/cleanup; monitor memory | Add health checks and auto-restart mechanisms |

### 6.2 Integration Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Breaking existing QX-partner tests** | High | Comprehensive regression testing; feature flag for gradual rollout |
| **MCP server downtime affecting fleet** | High | Implement circuit breaker pattern; fallback to non-browser QX analysis |
| **Type safety issues with MCP responses** | Medium | Strict TypeScript types; runtime validation with Zod schemas |
| **Agent coordination complexity** | Medium | Use existing AQE hooks; minimize cross-agent Vibium dependencies |

### 6.3 Business/Adoption Risks

| Risk | Mitigation |
|------|------------|
| **Developers prefer Playwright familiarity** | Provide migration guides; show concrete benefits (size, speed, MCP-native) |
| **Additional maintenance burden** | Keep Vibium wrapper lean; leverage MCP abstraction; plan deprecation strategy |
| **Vibium project abandonment** | Monitor GitHub activity; maintain Playwright fallback; plan exit strategy |

---

## 7. Potential Challenges & Solutions

### Challenge 1: Limited Vibium V1 Observability APIs

**Problem**: Testability-scorer needs console logs, network requests, and page errors - not exposed in Vibium V1.

**Solutions**:
1. **Client-side workaround**: Inject JavaScript to capture and expose data
   ```typescript
   await vibium.navigate(url);
   const logs = await vibium.evaluate(() => {
     return window.__capturedConsoleLogs || [];
   });
   ```

2. **MCP tool enhancement**: Contribute PRs to Vibium for missing APIs
   ```typescript
   // Proposed new MCP tool
   mcp__vibium__get_console_logs({ level: 'error' | 'warn' | 'log' })
   ```

3. **Defer testability migration**: Wait for V2 Network Tracing feature (6-12 months)

**Recommended Approach**: **Option 3** - Keep Playwright for testability until V2 ships.

---

### Challenge 2: QX Oracle Detection Accuracy

**Problem**: Live flow navigation may produce false positives/negatives without proper context.

**Solutions**:
1. **Hybrid approach**: Combine Vibium runtime data with static heuristics
   ```typescript
   const runtimeScore = await this.measureLiveFlow(vibium);
   const staticScore = await this.analyzeStaticHeuristics(pageHTML);
   const combinedScore = (runtimeScore * 0.7) + (staticScore * 0.3);
   ```

2. **Machine learning**: Train classifier on historical oracle problems
   - Features: Flow timing, element counts, screenshot diffs, user feedback
   - Model: Gradient boosting (XGBoost) or neural network
   - Training set: 100+ labeled QX analyses

3. **Progressive enhancement**: Start with conservative detection, tune over time
   ```typescript
   if (confidence > 0.95) {
     return { detected: true, severity: 'high' };
   } else if (confidence > 0.80) {
     return { detected: true, severity: 'medium', requiresReview: true };
   }
   ```

**Recommended Approach**: **Option 1 + 3** - Hybrid with progressive confidence tuning.

---

### Challenge 3: Browser Session Management at Scale

**Problem**: QX competitor benchmarking with 10+ sites could exhaust resources.

**Solutions**:
1. **Connection pooling**: Reuse browser instances
   ```typescript
   class VibiumPool {
     private pool: VibiumWrapper[] = [];
     async acquire(): Promise<VibiumWrapper> { /* ... */ }
     async release(instance: VibiumWrapper): Promise<void> { /* ... */ }
   }
   ```

2. **Sequential execution with cleanup**: One site at a time
   ```typescript
   for (const url of urls) {
     const session = await vibium.launch();
     try {
       await this.analyzeQX(session, url);
     } finally {
       await session.quit();  // Guaranteed cleanup
     }
   }
   ```

3. **Parallel with throttling**: Limit concurrent sessions
   ```typescript
   const results = await pLimit(3)(urls.map(url => () => this.analyzeQX(url)));
   ```

**Recommended Approach**: **Option 2 for MVP**, upgrade to **Option 3** for production scale.

---

## 8. Success Metrics & KPIs

### 8.1 Technical Metrics

| Metric | Baseline (Current) | Target (Post-Integration) | Measurement Method |
|--------|-------------------|---------------------------|-------------------|
| **QX Oracle Detection Accuracy** | N/A (manual) | >=90% | Labeled test set (n=50) |
| **QX Analysis Time (per site)** | ~10s (static) | <20s (live with Vibium) | Performance.now() instrumentation |
| **Competitor Benchmark Time (3 sites)** | N/A (manual) | <60s | End-to-end timing |
| **Docker Image Size** | 1.2GB | <600MB (50% reduction) | `docker images` |
| **CI/CD Visual Test Time** | 180s | <135s (25% reduction) | GitHub Actions logs |
| **Memory per Browser Session** | ~250MB (Playwright) | <100MB (Vibium) | Process monitoring |
| **Test Suite Pass Rate** | 98% | >=98% (maintain) | Jest/Playwright test runner |

### 8.2 Quality Metrics

| Metric | Target | Validation |
|--------|--------|------------|
| **Integration Test Coverage** | >=80% | `npm run coverage:vibium` |
| **Type Safety (no `any`)** | 100% in VibiumWrapper | `tsc --noImplicitAny` |
| **Documentation Completeness** | 100% of public APIs | Manual review |
| **Backward Compatibility** | 0 breaking changes | Regression tests |
| **Browser Session Leaks** | 0 over 100 runs | Memory profiling |

### 8.3 Adoption Metrics

| Metric | Target (6 months post-release) | Tracking |
|--------|-------------------------------|----------|
| **Agents using browser-automation skill** | >=3 (qx-partner, visual-tester, quality-analyzer) | Skill usage analytics |
| **Live QX analyses performed** | >=100 | AQE telemetry |
| **Competitor benchmarks generated** | >=20 | Report count |
| **Developer satisfaction** | >=8/10 (NPS) | Survey |

---

## 9. Timeline & Resource Allocation

### 9.1 Gantt Chart (2-week sprint)

```
Week 1:
Mon  Tue  Wed  Thu  Fri
├────┼────┼────┼────┼────┤
│ M1: Foundation Setup   │  (Actions 1-3: Install, Wrapper, Tests)
└────────────────────────┘

Week 2:
Mon  Tue  Wed  Thu  Fri
├────┼────┼────┼────┼────┤
│ M2: QX Integration     │  (Actions 4-7: Browser, Oracle, Visual, Competitor)
│                   ├────┼────┐
                    │ M3: Docs│  (Actions 8-10: Docs, Docker, Skill)
                    └─────────┘

Optional Week 3-4 (if Milestone 4 pursued):
Mon  Tue  Wed  Thu  Fri
├────┼────┼────┼────┼────┤
│ M4: Testability Migr.  │  (Actions 11-12: Vibium variant, parity)
└────────────────────────┘
```

### 9.2 Resource Requirements

**Developer Time**:
- **1 Full-Time Developer**: 10-14 days for Phases 1-3 (MVP)
- **+1 Developer (Optional)**: 4-5 days for Phase 3B (testability migration)

**Infrastructure**:
- **CI/CD Runner**: +20% capacity for Vibium integration tests
- **Docker Registry**: ~1GB storage for new image variants

**External Dependencies**:
- **Vibium Project**: Monitor for V2 feature releases (6-12 month horizon)
- **Chrome for Testing**: Automatic via Vibium, no manual setup

---

## 10. Conclusion & Recommendations

### 10.1 Key Takeaways

**What Vibium Is**:
- Lightweight (10MB), zero-config browser automation built for AI agents
- MCP-native integration enabling direct LLM-to-browser communication
- Ideal for simple automation tasks where Playwright's complexity is overkill

**Strategic Value**:
- **High Impact for QX-Partner**: Unlocks live oracle detection, competitor benchmarking, runtime UX analysis
- **Medium Impact for Testability-Scorer**: Optimization opportunity, not necessity (Playwright works well)
- **Fleet-Wide Benefit**: Establishes browser-automation skill reusable across agents

**Implementation Viability**:
- **Phase 1-3 (MVP)**: **Strongly Recommended** - High ROI, manageable risk, clear deliverables
- **Phase 3B (Testability)**: **Optional** - Defer until Vibium V2 ships Network Tracing APIs

### 10.2 Go/No-Go Decision

**RECOMMENDATION: GO with phased approach**

**Proceed with**:
- ✅ **Milestone 1**: Foundation setup (low risk, high value)
- ✅ **Milestone 2**: QX-partner integration (high value, proven use case)
- ✅ **Milestone 3**: Documentation & optimization (essential for adoption)

**Defer until Vibium V2**:
- ⏸️ **Milestone 4**: Testability-scorer migration (wait for console/network APIs)

**Decision Criteria**:
```
IF (Milestone 1 success rate >= 90%) THEN
  Proceed to Milestone 2
ELSE
  Evaluate Puppeteer as alternative or continue Playwright-only
END IF

IF (Milestone 2 oracle accuracy >= 90%) THEN
  Proceed to Milestone 3
ELSE
  Replan: Use Vibium for visual only, iterate oracle algorithm
END IF

IF (Vibium V2 ships with Network Tracing + Console API) THEN
  Revisit Milestone 4 (testability migration)
ELSE
  Keep Playwright for testability indefinitely
END IF
```

### 10.3 Next Steps

**Immediate Actions** (Next 48 hours):
1. **Install Vibium MCP**: `claude mcp add vibium -- npx -y vibium`
2. **Validate MCP tools**: Test all 7 `browser_*` tools in isolation
3. **Create branch**: `git checkout -b feature/vibium-integration`
4. **Set up tracking**: Initialize project board with 10 actions from GOAP plan

**First Sprint Goals** (Week 1):
- Complete Milestone 1: Foundation setup
- Begin Milestone 2: QX-partner browser integration
- Document early learnings and blockers

**Success Definition**:
> "QX-partner agent can automatically detect oracle problems in live e-commerce checkout flows with 90%+ accuracy, capture visual evidence via screenshots, and benchmark 3 competitor sites in under 60 seconds - all while reducing Docker image size by 50% and maintaining 100% backward compatibility with existing tests."

---

## Appendix A: MCP Tool Reference

**Vibium MCP Tools** (v1.0):

| Tool | Parameters | Returns | Use Case |
|------|-----------|---------|----------|
| `browser_launch` | `{ headless?: boolean }` | `{ sessionId: string }` | Initialize session |
| `browser_navigate` | `{ url: string, waitUntil?: string }` | `{ success: boolean }` | Load page |
| `browser_find` | `{ selector: string, timeout?: number }` | `{ visible: boolean, text?: string }` | Locate element |
| `browser_click` | `{ selector: string }` | `{ success: boolean }` | Click element |
| `browser_type` | `{ selector: string, text: string }` | `{ success: boolean }` | Input text |
| `browser_screenshot` | `{ fullPage?: boolean }` | `{ data: string (base64), width: number, height: number }` | Capture PNG |
| `browser_quit` | `{}` | `{ success: boolean }` | Cleanup |

**Proposed MCP Tool Enhancements** (for V2 contribution):

| Tool | Parameters | Returns | Priority |
|------|-----------|---------|----------|
| `browser_get_console_logs` | `{ level?: 'error'\|'warn'\|'log' }` | `{ logs: Array<{type, text, timestamp}> }` | High |
| `browser_get_network_requests` | `{ filter?: string }` | `{ requests: Array<{url, method, status}> }` | High |
| `browser_evaluate` | `{ script: string }` | `{ result: any }` | Medium |
| `browser_wait_for_selector` | `{ selector: string, timeout?: number }` | `{ found: boolean }` | Low (auto-wait exists) |

---

## Appendix B: Testing Strategy

**Test Pyramid** for Vibium integration:

```
         ┌─────────────────┐
         │  E2E Tests (5)  │  Full QX-partner flows with real sites
         │  ─ Oracle detect│
         │  ─ Competitor   │
         └─────────────────┘
               ▲
              ┌┴───────────────────────┐
              │ Integration Tests (20) │  VibiumWrapper + MCP
              │  ─ Launch/Navigate    │
              │  ─ Find/Click/Type    │
              │  ─ Screenshot capture │
              └────────────────────────┘
                       ▲
              ┌────────┴─────────────────────┐
              │   Unit Tests (50)            │  VibiumWrapper methods
              │    ─ Type safety            │
              │    ─ Error handling         │
              │    ─ State management       │
              └──────────────────────────────┘
```

**Test Coverage Requirements**:
- **Unit Tests**: >=90% line coverage for VibiumWrapper
- **Integration Tests**: 100% of MCP tool calls covered
- **E2E Tests**: 100% of QX-partner new capabilities covered

**Continuous Testing**:
```yaml
# .github/workflows/vibium-integration-tests.yml
name: Vibium Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Vibium
        run: npm install vibium
      - name: Run Integration Tests
        run: npm run test:integration:vibium
        timeout-minutes: 10
      - name: Upload Screenshots
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: test-screenshots
          path: tests/screenshots/
```

---

## Appendix C: Migration Checklist

**Pre-Integration Checklist**:
- [ ] Backup current QX-partner agent implementation
- [ ] Document baseline metrics (Docker size, test times)
- [ ] Set up feature flag system for gradual rollout
- [ ] Create rollback plan (git tag + deployment script)

**Phase 1 Checklist** (Foundation):
- [ ] Install Vibium MCP: `claude mcp add vibium -- npx -y vibium`
- [ ] Verify MCP tools: Test all 7 `browser_*` tools
- [ ] Create VibiumWrapper.ts with TypeScript types
- [ ] Write integration tests (>=80% coverage)
- [ ] Update CI/CD pipeline

**Phase 2 Checklist** (QX-Partner):
- [ ] Implement `detectLiveOracleProblems` method
- [ ] Implement `captureQXEvidence` method
- [ ] Implement `benchmarkCompetitorQX` method
- [ ] Update `.claude/agents/qx-partner.md` with new capabilities
- [ ] Write E2E tests for new methods
- [ ] Validate 90%+ oracle detection accuracy

**Phase 3 Checklist** (Docs & Optimization):
- [ ] Write integration documentation
- [ ] Create browser-automation skill
- [ ] Optimize Docker images (multi-stage builds)
- [ ] Benchmark performance improvements
- [ ] Update CHANGELOG.md

**Post-Integration Checklist**:
- [ ] Monitor error rates for 7 days
- [ ] Collect developer feedback (survey)
- [ ] Document lessons learned
- [ ] Plan V2 feature requests (Cortex, Network Tracing)

---

**Generated by**: Agentic QE Fleet v2.3.3
**GOAP Planning**: Claude Sonnet 4.5
**Document ID**: vibium-integration-plan-v1.0
**Last Updated**: 2025-12-12

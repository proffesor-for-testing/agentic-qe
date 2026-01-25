# GOAP: agent-browser Integration for AQE v3

**Version:** 1.0.0
**Created:** 2026-01-19
**Status:** Ready for Execution
**Estimated Effort:** 2-3 weeks
**Prerequisites:** Vibium integration (almost complete)

---

## 1. Executive Summary

This GOAP plan integrates [agent-browser](https://github.com/vercel-labs/agent-browser) from Vercel Labs as a **complementary** browser automation tool alongside the existing Vibium integration. agent-browser provides capabilities Vibium lacks:

| Capability | Vibium | agent-browser |
|------------|--------|---------------|
| MCP Tools | 7 tools | 70+ CLI commands |
| Element Selection | CSS selectors | Snapshot refs (@e1, @e2) |
| Multi-Session | No | Yes (isolated browsers) |
| Network Interception | No | Yes (route, mock, abort) |
| Device Emulation | Viewport only | Full device profiles |
| Video Recording | No | Trace recording |
| Auth State Persistence | No | Yes (state save/load) |
| Context Efficiency | Full DOM | 93% less context (claimed) |

---

## 2. World State Analysis

### 2.1 Current State (Initial World)

```yaml
WorldState:
  # Existing Browser Infrastructure
  vibiumIntegrated: true              # Almost complete in parallel terminal
  vibiumClientWrapper: true
  vibiumTypes: true
  unifiedBrowserInterface: false      # No common interface yet

  # agent-browser Specific
  agentBrowserInstalled: false
  agentBrowserClientWrapper: false
  snapshotParserExists: false
  sessionManagerExists: false
  commandExecutorExists: false

  # Unified Browser Features
  browserClientFactory: false         # Select vibium vs agent-browser
  commonBrowserTypes: false           # Shared interfaces
  gracefulFallback: false             # Fallback when tool unavailable

  # Domain Integration
  visualAccessibilityUsesAgentBrowser: false
  testExecutionUsesAgentBrowser: false
  multiViewportWithRefs: false
  e2eWithDeterministicSelection: false

  # Advanced Capabilities
  networkInterceptionCapable: false
  deviceEmulationCapable: false
  authStatePersistence: false
  traceRecordingCapable: false
```

### 2.2 Goal State (Target World)

```yaml
WorldState:
  # Existing (Unchanged)
  vibiumIntegrated: true
  vibiumClientWrapper: true
  vibiumTypes: true

  # Unified Browser Interface
  unifiedBrowserInterface: true
  browserClientFactory: true
  commonBrowserTypes: true
  gracefulFallback: true

  # agent-browser Integration
  agentBrowserInstalled: true
  agentBrowserClientWrapper: true
  snapshotParserExists: true
  sessionManagerExists: true
  commandExecutorExists: true

  # Domain Integration
  visualAccessibilityUsesAgentBrowser: true
  testExecutionUsesAgentBrowser: true
  multiViewportWithRefs: true
  e2eWithDeterministicSelection: true

  # Advanced Capabilities
  networkInterceptionCapable: true
  deviceEmulationCapable: true
  authStatePersistence: true
  traceRecordingCapable: true
```

### 2.3 Gap Analysis

| Area | Gap | Impact | Priority |
|------|-----|--------|----------|
| Unified Interface | No common BrowserClient interface | High - prevents tool switching | P0 |
| Snapshot Parsing | Cannot use deterministic refs | High - key differentiator | P0 |
| Session Management | No parallel browser isolation | Medium - limits parallel E2E | P1 |
| Network Mocking | Cannot mock API responses | Medium - better E2E testing | P1 |
| Device Emulation | Limited viewport testing | Low - Vibium has basic support | P2 |

---

## 3. Goal Definition

### 3.1 Primary Goals

| Goal ID | Description | Success Criteria |
|---------|-------------|------------------|
| G1 | Unified BrowserClient Interface | Both Vibium and agent-browser implement IBrowserClient |
| G2 | agent-browser Client Wrapper | TypeScript wrapper in `v3/src/integrations/browser/agent-browser/` |
| G3 | Snapshot Ref Parser | Parse snapshot output to extract refs (@e1, @e2) |
| G4 | Multi-Session Management | Run isolated browser sessions in parallel |
| G5 | Domain Integration | visual-accessibility and test-execution use agent-browser |
| G6 | Graceful Fallback | Auto-fallback to Vibium if agent-browser unavailable |

### 3.2 Success Metrics

```typescript
interface IntegrationMetrics {
  // Phase 1: Core Integration
  cliCommandsCovered: 20;           // Most-used commands wrapped
  snapshotParsingAccuracy: 99.9;    // % refs correctly parsed
  sessionIsolation: true;           // Sessions don't leak state

  // Phase 2: Domain Integration
  viewportsWithRefs: 5;             // mobile, tablet, desktop, wide, 4k
  e2eTestsWithRefs: 10;             // Sample tests using refs
  fallbackReliability: 99.5;        // % successful fallback to Vibium

  // Phase 3: Advanced Features
  networkMockingCoverage: 80;       // % of API mocking scenarios
  deviceProfiles: 15;               // iPhone, Pixel, iPad, etc.
  authStateReuse: true;             // Login once, reuse across tests
}
```

---

## 4. Action Library

### 4.1 Phase 1: Core Integration (Week 1)

#### Action: AB1.1 - Create Common Browser Types

```yaml
id: AB1.1
name: CreateCommonBrowserTypes
description: Define unified IBrowserClient interface and common types
preconditions:
  - vibiumTypes: true
  - commonBrowserTypes: false
effects:
  - commonBrowserTypes: true
cost: 2
estimatedHours: 4
agentType: coder
model: haiku
parallelizable: true
```

**Target File:** `v3/src/integrations/browser/types.ts`

```typescript
// Core interface both tools implement
export interface IBrowserClient {
  // Lifecycle
  launch(options?: BrowserLaunchOptions): Promise<Result<BrowserSession, BrowserError>>;
  quit(): Promise<Result<void, BrowserError>>;
  isAvailable(): Promise<boolean>;

  // Navigation
  navigate(url: string, options?: NavigateOptions): Promise<Result<NavigateResult, BrowserError>>;
  reload(): Promise<Result<void, BrowserError>>;
  goBack(): Promise<Result<void, BrowserError>>;

  // Element Interaction (abstract - implementations differ)
  click(target: ElementTarget): Promise<Result<void, BrowserError>>;
  fill(target: ElementTarget, text: string): Promise<Result<void, BrowserError>>;
  getText(target: ElementTarget): Promise<Result<string, BrowserError>>;

  // Screenshots
  screenshot(options?: ScreenshotOptions): Promise<Result<ScreenshotResult, BrowserError>>;

  // Accessibility
  checkAccessibility(options?: A11yOptions): Promise<Result<A11yResult, BrowserError>>;
}

// Unified element targeting
export type ElementTarget =
  | { type: 'ref'; value: string }      // @e1, @e2 (agent-browser)
  | { type: 'css'; value: string }      // CSS selector
  | { type: 'xpath'; value: string }    // XPath
  | { type: 'text'; value: string };    // Text content

// Browser tool preference
export type BrowserToolPreference = 'agent-browser' | 'vibium' | 'auto';
```

---

#### Action: AB1.2 - Create agent-browser Command Executor

```yaml
id: AB1.2
name: CreateCommandExecutor
description: TypeScript wrapper for agent-browser CLI commands
preconditions:
  - commonBrowserTypes: true
  - commandExecutorExists: false
effects:
  - commandExecutorExists: true
cost: 4
estimatedHours: 8
agentType: coder
model: sonnet
parallelizable: false
dependencies: [AB1.1]
```

**Target File:** `v3/src/integrations/browser/agent-browser/command-executor.ts`

```typescript
export class AgentBrowserCommandExecutor {
  constructor(
    private readonly sessionName?: string,
    private readonly config?: CommandExecutorConfig
  ) {}

  // Execute CLI command with output capture
  async execute(command: string, args: string[]): Promise<CommandResult>;

  // Typed command wrappers
  async open(url: string): Promise<Result<void, BrowserError>>;
  async click(target: string): Promise<Result<void, BrowserError>>;
  async fill(target: string, text: string): Promise<Result<void, BrowserError>>;
  async snapshot(options?: SnapshotOptions): Promise<Result<SnapshotResult, BrowserError>>;
  async screenshot(path?: string): Promise<Result<ScreenshotResult, BrowserError>>;
  async eval(js: string): Promise<Result<unknown, BrowserError>>;

  // Session-scoped commands automatically include --session flag
}
```

---

#### Action: AB1.3 - Create Snapshot Parser

```yaml
id: AB1.3
name: CreateSnapshotParser
description: Parse snapshot output to extract element refs and structure
preconditions:
  - commandExecutorExists: true
  - snapshotParserExists: false
effects:
  - snapshotParserExists: true
cost: 3
estimatedHours: 6
agentType: coder
model: sonnet
parallelizable: true
dependencies: [AB1.2]
```

**Target File:** `v3/src/integrations/browser/agent-browser/snapshot-parser.ts`

```typescript
export interface SnapshotElement {
  ref: string;                    // @e1, @e2, etc.
  role: string;                   // button, textbox, heading, etc.
  name?: string;                  // Accessible name
  text?: string;                  // Text content
  attributes: Record<string, string>;
  children: SnapshotElement[];
  depth: number;
}

export interface ParsedSnapshot {
  url: string;
  title: string;
  elements: SnapshotElement[];
  interactiveElements: SnapshotElement[];
  refMap: Map<string, SnapshotElement>;  // Quick lookup by ref
  timestamp: Date;
}

export class SnapshotParser {
  // Parse raw snapshot output
  parse(snapshotOutput: string): ParsedSnapshot;

  // Find element by ref
  findByRef(snapshot: ParsedSnapshot, ref: string): SnapshotElement | null;

  // Find elements by role
  findByRole(snapshot: ParsedSnapshot, role: string): SnapshotElement[];

  // Find elements by text content
  findByText(snapshot: ParsedSnapshot, text: string, exact?: boolean): SnapshotElement[];

  // Generate CSS selector from ref (for Vibium fallback)
  refToCssSelector(snapshot: ParsedSnapshot, ref: string): string | null;
}
```

---

#### Action: AB1.4 - Create Session Manager

```yaml
id: AB1.4
name: CreateSessionManager
description: Manage multiple isolated browser sessions
preconditions:
  - commandExecutorExists: true
  - sessionManagerExists: false
effects:
  - sessionManagerExists: true
cost: 3
estimatedHours: 6
agentType: coder
model: sonnet
parallelizable: true
dependencies: [AB1.2]
```

**Target File:** `v3/src/integrations/browser/agent-browser/session-manager.ts`

```typescript
export interface BrowserSessionInfo {
  name: string;
  createdAt: Date;
  lastActivity: Date;
  currentUrl?: string;
  status: 'active' | 'idle' | 'closed';
}

export class AgentBrowserSessionManager {
  private sessions: Map<string, BrowserSessionInfo>;

  // Create new isolated session
  async createSession(name?: string): Promise<Result<BrowserSessionInfo, BrowserError>>;

  // Get or create session
  async getOrCreateSession(name: string): Promise<Result<BrowserSessionInfo, BrowserError>>;

  // Close specific session
  async closeSession(name: string): Promise<Result<void, BrowserError>>;

  // Close all sessions
  async closeAllSessions(): Promise<Result<void, BrowserError>>;

  // List active sessions
  listSessions(): BrowserSessionInfo[];

  // Get executor for specific session
  getExecutor(sessionName: string): AgentBrowserCommandExecutor;
}
```

---

#### Action: AB1.5 - Create agent-browser Client Wrapper

```yaml
id: AB1.5
name: CreateAgentBrowserClient
description: Full client implementing IBrowserClient interface
preconditions:
  - commandExecutorExists: true
  - snapshotParserExists: true
  - sessionManagerExists: true
  - agentBrowserClientWrapper: false
effects:
  - agentBrowserClientWrapper: true
cost: 5
estimatedHours: 10
agentType: coder
model: sonnet
parallelizable: false
dependencies: [AB1.2, AB1.3, AB1.4]
```

**Target File:** `v3/src/integrations/browser/agent-browser/client.ts`

```typescript
export class AgentBrowserClient implements IBrowserClient {
  private executor: AgentBrowserCommandExecutor;
  private sessionManager: AgentBrowserSessionManager;
  private snapshotParser: SnapshotParser;
  private currentSnapshot: ParsedSnapshot | null = null;

  constructor(config?: AgentBrowserConfig) {}

  // IBrowserClient implementation
  async launch(options?: BrowserLaunchOptions): Promise<Result<BrowserSession, BrowserError>>;
  async quit(): Promise<Result<void, BrowserError>>;
  async isAvailable(): Promise<boolean>;

  async navigate(url: string, options?: NavigateOptions): Promise<Result<NavigateResult, BrowserError>>;

  // Element interaction with ref support
  async click(target: ElementTarget): Promise<Result<void, BrowserError>>;
  async fill(target: ElementTarget, text: string): Promise<Result<void, BrowserError>>;
  async getText(target: ElementTarget): Promise<Result<string, BrowserError>>;

  // agent-browser specific features
  async getSnapshot(options?: SnapshotOptions): Promise<Result<ParsedSnapshot, BrowserError>>;
  async findInteractiveElements(): Promise<Result<SnapshotElement[], BrowserError>>;

  // Network interception
  async mockRoute(urlPattern: string, response: MockResponse): Promise<Result<void, BrowserError>>;
  async abortRoute(urlPattern: string): Promise<Result<void, BrowserError>>;

  // Device emulation
  async setDevice(deviceName: string): Promise<Result<void, BrowserError>>;
  async setViewport(width: number, height: number): Promise<Result<void, BrowserError>>;

  // Auth state persistence
  async saveState(path: string): Promise<Result<void, BrowserError>>;
  async loadState(path: string): Promise<Result<void, BrowserError>>;

  // Trace recording
  async startTrace(): Promise<Result<void, BrowserError>>;
  async stopTrace(outputPath: string): Promise<Result<string, BrowserError>>;
}
```

---

#### Action: AB1.6 - Create Browser Client Factory

```yaml
id: AB1.6
name: CreateBrowserClientFactory
description: Factory to select and create browser client based on preference
preconditions:
  - agentBrowserClientWrapper: true
  - vibiumClientWrapper: true
  - browserClientFactory: false
effects:
  - browserClientFactory: true
  - unifiedBrowserInterface: true
  - gracefulFallback: true
cost: 3
estimatedHours: 6
agentType: coder
model: sonnet
parallelizable: false
dependencies: [AB1.5]
```

**Target File:** `v3/src/integrations/browser/client-factory.ts`

```typescript
export interface BrowserClientFactoryConfig {
  preference: BrowserToolPreference;
  fallbackEnabled: boolean;
  agentBrowserConfig?: AgentBrowserConfig;
  vibiumConfig?: VibiumConfig;
}

export class BrowserClientFactory {
  private static instance: BrowserClientFactory | null = null;

  static getInstance(config?: BrowserClientFactoryConfig): BrowserClientFactory;

  // Create client based on preference with fallback
  async createClient(
    preference?: BrowserToolPreference
  ): Promise<Result<IBrowserClient, BrowserError>>;

  // Check which tools are available
  async checkAvailability(): Promise<{
    agentBrowser: boolean;
    vibium: boolean;
  }>;

  // Get recommended tool for specific use case
  getRecommendedTool(useCase: BrowserUseCase): BrowserToolPreference;
}

export type BrowserUseCase =
  | 'e2e-testing'          // Prefer agent-browser (refs, session isolation)
  | 'visual-regression'    // Prefer vibium (simpler screenshot API)
  | 'accessibility'        // Either (both support a11y)
  | 'api-mocking'          // agent-browser only (network interception)
  | 'responsive-testing'   // agent-browser (device emulation)
  | 'auth-testing';        // agent-browser (state persistence)
```

---

### 4.2 Phase 2: Domain Integration (Week 2)

#### Action: AB2.1 - Integrate with visual-accessibility Domain

```yaml
id: AB2.1
name: IntegrateVisualAccessibility
description: Update visual-accessibility services to use agent-browser
preconditions:
  - browserClientFactory: true
  - visualAccessibilityUsesAgentBrowser: false
effects:
  - visualAccessibilityUsesAgentBrowser: true
  - multiViewportWithRefs: true
cost: 4
estimatedHours: 8
agentType: coder
model: sonnet
parallelizable: true
dependencies: [AB1.6]
```

**Updates to:**
- `v3/src/domains/visual-accessibility/services/viewport-capture.ts`
- `v3/src/domains/visual-accessibility/services/accessibility-tester.ts`

```typescript
// Enhanced viewport capture with device emulation
class ViewportCaptureService {
  constructor(
    private readonly memory: MemoryBackend,
    private readonly browserFactory: BrowserClientFactory
  ) {}

  // Use agent-browser device emulation for accurate viewport simulation
  async captureWithDeviceEmulation(
    url: string,
    devices: string[]  // ['iPhone 14', 'iPad Pro', 'Pixel 7']
  ): Promise<Result<MultiViewportCaptureResult, Error>>;
}
```

---

#### Action: AB2.2 - Integrate with test-execution Domain

```yaml
id: AB2.2
name: IntegrateTestExecution
description: Update E2E runner to use agent-browser refs
preconditions:
  - browserClientFactory: true
  - testExecutionUsesAgentBrowser: false
effects:
  - testExecutionUsesAgentBrowser: true
  - e2eWithDeterministicSelection: true
cost: 5
estimatedHours: 10
agentType: coder
model: sonnet
parallelizable: true
dependencies: [AB1.6]
```

**Updates to:**
- `v3/src/domains/test-execution/services/e2e-runner.ts`
- `v3/src/domains/test-execution/types/e2e-step.types.ts`

```typescript
// Add ref-based step execution
interface E2EStep {
  type: E2EStepType;
  // Support both selector and ref targets
  target?: string;           // CSS selector
  ref?: string;              // @e1, @e2 (preferred for agent-browser)
  // ...
}

// E2E runner with snapshot-based element finding
class E2ETestRunnerService {
  // Take snapshot before interaction for deterministic selection
  private async executeStepWithSnapshot(
    step: E2EStep,
    context: StepExecutionContext
  ): Promise<StepExecutionData>;

  // Use refs when available, fall back to selectors
  private resolveTarget(step: E2EStep, snapshot?: ParsedSnapshot): ElementTarget;
}
```

---

#### Action: AB2.3 - Add Network Mocking Support

```yaml
id: AB2.3
name: AddNetworkMocking
description: Add API mocking capabilities for E2E tests
preconditions:
  - testExecutionUsesAgentBrowser: true
  - networkInterceptionCapable: false
effects:
  - networkInterceptionCapable: true
cost: 3
estimatedHours: 6
agentType: coder
model: sonnet
parallelizable: true
dependencies: [AB2.2]
```

**New File:** `v3/src/domains/test-execution/services/network-mocker.ts`

```typescript
export interface NetworkMock {
  urlPattern: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | '*';
  response: MockResponse;
}

export interface MockResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export class NetworkMockingService {
  constructor(private readonly client: AgentBrowserClient) {}

  // Set up mocks before test
  async setupMocks(mocks: NetworkMock[]): Promise<void>;

  // Clear all mocks
  async clearMocks(): Promise<void>;

  // Verify mock was called
  async verifyMockCalled(urlPattern: string): Promise<boolean>;
}
```

---

#### Action: AB2.4 - Add Auth State Persistence

```yaml
id: AB2.4
name: AddAuthStatePersistence
description: Enable login state reuse across test runs
preconditions:
  - testExecutionUsesAgentBrowser: true
  - authStatePersistence: false
effects:
  - authStatePersistence: true
cost: 2
estimatedHours: 4
agentType: coder
model: haiku
parallelizable: true
dependencies: [AB2.2]
```

**New File:** `v3/src/domains/test-execution/services/auth-state-manager.ts`

```typescript
export class AuthStateManager {
  private readonly stateDir = '.agentic-qe/browser-state';

  // Save authenticated state after login
  async saveAuthState(name: string, client: AgentBrowserClient): Promise<void>;

  // Load state before test to skip login
  async loadAuthState(name: string, client: AgentBrowserClient): Promise<boolean>;

  // Check if state exists and is valid
  async hasValidState(name: string): Promise<boolean>;

  // Clear expired states
  async cleanupExpiredStates(maxAgeMs?: number): Promise<void>;
}
```

---

### 4.3 Phase 3: Testing & Documentation (Week 3)

#### Action: AB3.1 - Write Integration Tests

```yaml
id: AB3.1
name: WriteIntegrationTests
description: Test agent-browser integration with real browser
preconditions:
  - browserClientFactory: true
  - testExecutionUsesAgentBrowser: true
effects:
  - agentBrowserInstalled: true  # Tests require installation
cost: 4
estimatedHours: 8
agentType: tester
model: sonnet
parallelizable: false
dependencies: [AB2.2]
```

**Target Files:**
- `v3/tests/integration/browser/agent-browser-client.test.ts`
- `v3/tests/integration/browser/snapshot-parser.test.ts`
- `v3/tests/integration/browser/session-manager.test.ts`
- `v3/tests/integration/browser/client-factory.test.ts`

---

#### Action: AB3.2 - Write Unit Tests

```yaml
id: AB3.2
name: WriteUnitTests
description: Unit tests for parser, executor, and types
preconditions:
  - snapshotParserExists: true
  - commandExecutorExists: true
effects:
  - (validation milestone)
cost: 3
estimatedHours: 6
agentType: tester
model: haiku
parallelizable: true
dependencies: [AB1.3, AB1.2]
```

**Target Files:**
- `v3/tests/unit/integrations/browser/snapshot-parser.test.ts`
- `v3/tests/unit/integrations/browser/command-executor.test.ts`
- `v3/tests/unit/integrations/browser/types.test.ts`

---

#### Action: AB3.3 - Create Documentation

```yaml
id: AB3.3
name: CreateDocumentation
description: Document browser integration usage and patterns
preconditions:
  - browserClientFactory: true
effects:
  - (documentation milestone)
cost: 2
estimatedHours: 4
agentType: coder
model: haiku
parallelizable: true
dependencies: [AB1.6]
```

**Target Files:**
- `v3/docs/integrations/browser-automation.md`
- `v3/docs/integrations/agent-browser-guide.md`

---

## 5. Dependencies Graph

```
                        PHASE 1: Core Integration
                        =========================

    AB1.1 ─────────────────────────────────────────────────────────┐
    (Common Types)                                                  │
         │                                                          │
         ▼                                                          │
    AB1.2 ──────────────────────────────────────────────────────┐  │
    (Command Executor)                                           │  │
         │                                                       │  │
         ├─────────────────┬─────────────────┐                  │  │
         │                 │                 │                   │  │
         ▼                 ▼                 ▼                   │  │
    AB1.3             AB1.4             (Vibium Client         │  │
    (Snapshot Parser) (Session Mgr)     already done)          │  │
         │                 │                 │                   │  │
         └─────────────────┼─────────────────┘                   │  │
                           │                                     │  │
                           ▼                                     │  │
                      AB1.5 ◄────────────────────────────────────┘  │
                      (agent-browser Client)                        │
                           │                                        │
                           ▼                                        │
                      AB1.6 ◄───────────────────────────────────────┘
                      (Browser Factory)
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼

                        PHASE 2: Domain Integration
                        ==========================

    AB2.1                               AB2.2
    (visual-accessibility)              (test-execution)
         │                                   │
         │                    ┌──────────────┼──────────────┐
         │                    │              │              │
         │                    ▼              ▼              │
         │                AB2.3          AB2.4             │
         │                (Network)      (Auth State)      │
         │                    │              │              │
         └────────────────────┴──────────────┴──────────────┘
                                     │
                                     ▼

                        PHASE 3: Testing & Docs
                        ======================

                      ┌──────────┴──────────┐
                      │                     │
                      ▼                     ▼
                  AB3.1               AB3.2            AB3.3
                  (Integration)       (Unit Tests)    (Docs)
```

### Parallel Execution Groups

| Group | Actions | Can Run In Parallel |
|-------|---------|---------------------|
| PG1 | AB1.1 | Yes (independent) |
| PG2 | AB1.2 | After PG1 |
| PG3 | AB1.3, AB1.4 | Yes (both depend on AB1.2) |
| PG4 | AB2.1, AB2.2 | Yes (both depend on AB1.6) |
| PG5 | AB2.3, AB2.4 | Yes (both depend on AB2.2) |
| PG6 | AB3.1, AB3.2, AB3.3 | Yes (all independent after AB2) |

---

## 6. Agent Assignments

### 6.1 Claude Flow Agent Mapping

| Action | Primary Agent | Model | Rationale |
|--------|--------------|-------|-----------|
| AB1.1 | coder | haiku | Simple type definitions |
| AB1.2 | coder | sonnet | Complex CLI wrapper logic |
| AB1.3 | coder | sonnet | Parser with edge cases |
| AB1.4 | coder | sonnet | Concurrency management |
| AB1.5 | coder | sonnet | Full client implementation |
| AB1.6 | coder | sonnet | Factory pattern with fallback |
| AB2.1 | coder | sonnet | Domain integration |
| AB2.2 | coder | sonnet | E2E runner enhancement |
| AB2.3 | coder | sonnet | Network interception |
| AB2.4 | coder | haiku | Simple state management |
| AB3.1 | tester | sonnet | Integration tests |
| AB3.2 | tester | haiku | Unit tests |
| AB3.3 | coder | haiku | Documentation |

### 6.2 AQE v3 Domain Agent Mapping

| Action | QE Domain | QE Agents |
|--------|-----------|-----------|
| AB2.1 | visual-accessibility | qe-visual-tester, qe-accessibility-tester |
| AB2.2 | test-execution | qe-test-executor, qe-parallel-executor |
| AB3.1 | test-execution | qe-parallel-executor |
| AB3.2 | test-generation | qe-test-architect |

### 6.3 Swarm Configuration

```bash
# Phase 1: Core Integration (6 agents)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical \
  --max-agents 6 \
  --strategy specialized

# Phase 2-3: Domain Integration + Testing (8 agents)
npx @claude-flow/cli@latest swarm init \
  --topology hierarchical-mesh \
  --max-agents 8 \
  --strategy specialized
```

---

## 7. Memory Patterns to Store

### 7.1 Integration Patterns

```bash
# Store after successful integration
npx @claude-flow/cli@latest memory store \
  --key "browser-client-factory-pattern" \
  --value "Use BrowserClientFactory for tool selection. Prefer agent-browser for E2E (refs), Vibium for visual (simpler). Auto-fallback when unavailable." \
  --namespace patterns

npx @claude-flow/cli@latest memory store \
  --key "snapshot-ref-workflow" \
  --value "1. Take snapshot with -i flag. 2. Parse to get refs. 3. Use @e1, @e2 for interactions. 4. Re-snapshot after state changes." \
  --namespace patterns

npx @claude-flow/cli@latest memory store \
  --key "browser-session-isolation" \
  --value "Use AgentBrowserSessionManager for parallel E2E tests. Each session has isolated cookies, storage, history. Name sessions by test suite." \
  --namespace patterns
```

### 7.2 AQE Learning Patterns

```javascript
// Store patterns for cross-agent learning
mcp__agentic-qe__memory_store({
  key: "browser-ref-vs-selector",
  value: {
    pattern: "Use refs (@e1) for agent-browser, CSS selectors for Vibium fallback",
    successRate: 0.95,
    context: ["e2e-testing", "element-selection"]
  },
  namespace: "qe-patterns"
});

mcp__agentic-qe__memory_store({
  key: "network-mocking-pattern",
  value: {
    pattern: "Mock API routes before navigation. Use urlPattern matching. Clear mocks after test.",
    tools: ["agent-browser"],
    context: ["api-testing", "e2e-testing"]
  },
  namespace: "qe-patterns"
});
```

---

## 8. Milestones

### Milestone 1: Core Integration Complete (End of Week 1)

| Verification | Command | Expected |
|--------------|---------|----------|
| agent-browser available | `agent-browser --version` | Version printed |
| Types compile | `cd v3 && npm run build` | No type errors |
| Snapshot parsing | Unit test | 100% refs parsed |
| Session isolation | Integration test | Sessions don't share state |
| Client factory works | `createBrowserClient('auto')` | Returns client |

**Deliverables:**
- [ ] `v3/src/integrations/browser/` directory complete
- [ ] Common types for both tools
- [ ] agent-browser client wrapper
- [ ] Snapshot parser with ref extraction
- [ ] Session manager for parallel execution

### Milestone 2: Domain Integration Complete (End of Week 2)

| Verification | Command | Expected |
|--------------|---------|----------|
| Visual with device emu | `captureWithDeviceEmulation()` | Screenshots at device sizes |
| E2E with refs | Run test with @e1 | Interacts correctly |
| Network mocking | Mock API, verify | Mock response returned |
| Auth state reuse | Save then load | Login persisted |

**Deliverables:**
- [ ] visual-accessibility uses agent-browser
- [ ] test-execution uses refs
- [ ] Network mocking service
- [ ] Auth state manager

### Milestone 3: Testing & Docs Complete (End of Week 3)

| Verification | Command | Expected |
|--------------|---------|----------|
| Integration tests | `npm run test:integration -- browser` | All pass |
| Unit tests | `npm run test:unit -- browser` | All pass |
| Docs complete | Review | Comprehensive |

**Deliverables:**
- [ ] Integration test suite
- [ ] Unit test suite
- [ ] Documentation in `v3/docs/integrations/`

---

## 9. Risk Mitigation

### 9.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| agent-browser CLI not installed | Medium | High | Check availability, auto-fallback to Vibium |
| Snapshot format changes | Low | High | Parser abstraction, version pinning |
| Session cleanup failures | Medium | Medium | Automatic cleanup on exit, timeout |
| Chromium download in CI | Medium | Medium | Pre-cache, use `--with-deps` |

### 9.2 Fallback Strategy

```typescript
// BrowserClientFactory implements automatic fallback
async createClient(preference: BrowserToolPreference): Promise<Result<IBrowserClient, BrowserError>> {
  const availability = await this.checkAvailability();

  if (preference === 'agent-browser' || preference === 'auto') {
    if (availability.agentBrowser) {
      return ok(new AgentBrowserClient(this.config.agentBrowserConfig));
    }
    if (this.config.fallbackEnabled && availability.vibium) {
      console.warn('[BrowserFactory] agent-browser unavailable, falling back to Vibium');
      return ok(new VibiumClientImpl(this.config.vibiumConfig));
    }
  }

  if (preference === 'vibium' || preference === 'auto') {
    if (availability.vibium) {
      return ok(new VibiumClientImpl(this.config.vibiumConfig));
    }
  }

  return err(new BrowserError('No browser automation tool available'));
}
```

---

## 10. File Structure (Planned)

```
v3/src/integrations/browser/
├── index.ts                         # Unified exports
├── types.ts                         # Common browser types (IBrowserClient)
├── errors.ts                        # Common error types
├── client-factory.ts                # BrowserClientFactory
├── vibium/                          # Existing (almost done)
│   ├── index.ts
│   ├── types.ts
│   ├── client.ts
│   ├── fallback.ts
│   └── feature-flags.ts
└── agent-browser/                   # NEW
    ├── index.ts                     # Public exports
    ├── types.ts                     # agent-browser specific types
    ├── client.ts                    # AgentBrowserClient
    ├── command-executor.ts          # CLI command wrapper
    ├── snapshot-parser.ts           # Parse snapshot refs
    ├── session-manager.ts           # Multi-session handling
    └── feature-flags.ts             # Feature toggles

v3/src/domains/test-execution/services/
├── e2e-runner.ts                    # UPDATE: Add ref support
├── network-mocker.ts                # NEW: API mocking
└── auth-state-manager.ts            # NEW: Auth persistence

v3/src/domains/visual-accessibility/services/
├── viewport-capture.ts              # UPDATE: Add device emulation
└── accessibility-tester.ts          # UPDATE: Use factory

v3/tests/integration/browser/
├── agent-browser-client.test.ts     # NEW
├── snapshot-parser.test.ts          # NEW
├── session-manager.test.ts          # NEW
└── client-factory.test.ts           # NEW

v3/tests/unit/integrations/browser/
├── snapshot-parser.test.ts          # NEW
├── command-executor.test.ts         # NEW
└── types.test.ts                    # NEW

v3/docs/integrations/
├── browser-automation.md            # NEW: Overview
└── agent-browser-guide.md           # NEW: Usage guide
```

---

## 11. Execution Commands

### Phase 1 Start

```bash
# Initialize swarm
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 6

# Check for similar patterns
npx @claude-flow/cli@latest memory search --query "browser client factory pattern" --namespace patterns

# Route first task
npx @claude-flow/cli@latest hooks route --task "Create common browser types for IBrowserClient interface"
```

### MCP Orchestration

```javascript
// Initialize QE fleet
mcp__agentic-qe__fleet_init({
  topology: "hierarchical",
  maxAgents: 8,
  enabledDomains: ["test-execution", "visual-accessibility", "test-generation"]
});

// Orchestrate Phase 1
mcp__claude-flow__task_orchestrate({
  task: "Implement agent-browser integration Phase 1: Core types, command executor, snapshot parser, session manager, client wrapper, factory",
  strategy: "adaptive"
});

// Generate tests for new services
mcp__agentic-qe__test_generate_enhanced({
  sourceCode: "v3/src/integrations/browser/agent-browser/client.ts",
  testType: "integration",
  language: "typescript"
});
```

---

## 12. References

- [agent-browser GitHub](https://github.com/vercel-labs/agent-browser)
- [agent-browser npm](https://www.npmjs.com/package/agent-browser)
- [agent-browser Documentation](https://agent-browser.dev/)
- [Vibium Integration Plan](./goap-vibium-integration.md)
- [AQE v3 Domain Interface](../../v3/src/domains/domain-interface.ts)

---

## Appendix A: Action Cost Summary

| Phase | Actions | Total Cost | Hours |
|-------|---------|------------|-------|
| Phase 1 | AB1.1-AB1.6 | 20 | 40 |
| Phase 2 | AB2.1-AB2.4 | 14 | 28 |
| Phase 3 | AB3.1-AB3.3 | 9 | 18 |
| **Total** | **13 actions** | **43** | **86** |

---

## Appendix B: State Transition Table

| Action | State Changes |
|--------|---------------|
| AB1.1 | `commonBrowserTypes: true` |
| AB1.2 | `commandExecutorExists: true` |
| AB1.3 | `snapshotParserExists: true` |
| AB1.4 | `sessionManagerExists: true` |
| AB1.5 | `agentBrowserClientWrapper: true` |
| AB1.6 | `browserClientFactory: true`, `unifiedBrowserInterface: true`, `gracefulFallback: true` |
| AB2.1 | `visualAccessibilityUsesAgentBrowser: true`, `multiViewportWithRefs: true` |
| AB2.2 | `testExecutionUsesAgentBrowser: true`, `e2eWithDeterministicSelection: true` |
| AB2.3 | `networkInterceptionCapable: true` |
| AB2.4 | `authStatePersistence: true` |
| AB3.1 | `agentBrowserInstalled: true` |

---

## Appendix C: agent-browser Command Reference

Most-used commands to wrap in TypeScript client:

| Command | Purpose | Priority |
|---------|---------|----------|
| `open <url>` | Navigate to URL | P0 |
| `snapshot -i` | Get interactive elements with refs | P0 |
| `click @ref` | Click element by ref | P0 |
| `fill @ref <text>` | Fill input by ref | P0 |
| `type @ref <text>` | Type into element | P0 |
| `get text @ref` | Get element text | P0 |
| `screenshot` | Capture page | P0 |
| `eval <js>` | Execute JavaScript | P1 |
| `set device <name>` | Device emulation | P1 |
| `network route` | Mock network | P1 |
| `state save/load` | Auth persistence | P1 |
| `trace start/stop` | Recording | P2 |

Sources:
- [agent-browser GitHub](https://github.com/vercel-labs/agent-browser)
- [agent-browser npm](https://www.npmjs.com/package/agent-browser)
- [agent-browser README](https://github.com/vercel-labs/agent-browser/blob/main/README.md)

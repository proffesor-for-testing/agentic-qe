# Browser Automation in AQE v3

## Overview

AQE v3 supports two browser automation tools, each with different strengths:

| Feature | Vibium | agent-browser |
|---------|--------|---------------|
| MCP Integration | Native tools | CLI wrapper |
| Element Selection | CSS selectors | Snapshot refs (@e1, @e2) |
| Multi-Session | No | Yes (isolated browsers) |
| Network Interception | No | Yes (mock, abort) |
| Device Emulation | Viewport only | Full device profiles |
| Video/Trace Recording | No | Yes |
| Auth State Persistence | No | Yes |
| Context Efficiency | Full DOM | 93% less context |

## When to Use Which Tool

### Use Vibium for:
- Simple screenshot capture
- Basic accessibility checks
- Quick visual regression tests
- When MCP tool availability is important

### Use agent-browser for:
- E2E testing with complex interactions
- Parallel test execution (session isolation)
- API mocking in tests
- Mobile device testing (device emulation)
- Auth flow testing (state persistence)
- Debugging (trace recording)

## Architecture

```
v3/src/integrations/browser/
├── types.ts                 # Common interfaces (IBrowserClient)
├── errors.ts                # Common error types
├── client-factory.ts        # BrowserClientFactory
├── vibium/                  # Vibium integration
│   ├── client.ts
│   └── types.ts
└── agent-browser/           # agent-browser integration
    ├── client.ts            # AgentBrowserClient
    ├── command-executor.ts  # CLI wrapper
    ├── snapshot-parser.ts   # Ref extraction
    └── session-manager.ts   # Multi-session support

v3/src/domains/test-execution/services/
├── e2e-runner.ts            # Unified E2E test runner
├── network-mocker.ts        # Network mocking service
└── auth-state-manager.ts    # Auth state persistence
```

## Quick Start

### Using the BrowserClientFactory

```typescript
import { BrowserClientFactory } from '../integrations/browser/client-factory';

// Auto-select best available tool
const factory = BrowserClientFactory.getInstance();
const clientResult = await factory.createClient('auto');

if (clientResult.success) {
  const client = clientResult.value;
  await client.launch();
  await client.navigate('https://example.com');
  // ...
  await client.quit();
}
```

### Direct agent-browser Usage

```typescript
import { createAgentBrowserClient } from '../integrations/browser/agent-browser/client';

const client = createAgentBrowserClient({
  headed: false,  // Set true for debugging
  timeout: 30000,
  debug: false,
});

// Launch and navigate
await client.launch();
await client.navigate('https://example.com');

// Take snapshot and interact via refs
const snapshot = await client.getSnapshot({ interactive: true });
if (snapshot.success) {
  const button = snapshot.value.interactiveElements.find(
    el => el.name === 'Submit'
  );
  if (button) {
    await client.click(button.ref);  // Use @e1, @e2, etc.
  }
}

// Clean up
await client.quit();
```

## Domain Services

### Network Mocking

```typescript
import { createNetworkMockingService, jsonMock } from '../services/network-mocker';

const mocker = createNetworkMockingService(client);

// Mock API responses
await mocker.setupMocks([
  {
    urlPattern: '**/api/users/**',
    method: 'GET',
    response: jsonMock({ users: [{ id: 1, name: 'Test' }] }),
  },
  {
    urlPattern: '**/api/auth/**',
    method: 'POST',
    response: jsonMock({ token: 'mock-token' }),
  },
]);

// Run tests...

// Verify and clean up
const wasCalled = await mocker.verifyMockCalled('**/api/users/**');
await mocker.clearMocks();
```

### Auth State Persistence

```typescript
import { createAuthStateManager } from '../services/auth-state-manager';

const stateManager = createAuthStateManager();

// Save state after login
await client.navigate('https://app.example.com/login');
await client.fill('#email', 'user@example.com');
await client.fill('#password', 'password');
await client.click('#submit');
await client.waitForUrl('/dashboard');

await stateManager.saveAuthState('admin-user', client, {
  userId: 'user-123',
  roles: ['admin'],
});

// Later: Load state to skip login
const loaded = await stateManager.loadAuthState('admin-user', client);
if (loaded) {
  // Already authenticated
  await client.navigate('https://app.example.com/dashboard');
}
```

### Trace Recording

```typescript
// Start recording for debugging
await client.startTrace();

// Run your test...
await client.navigate('https://example.com');
await client.click('#button');

// Stop and save trace
const result = await client.stopTrace('./traces/test-failure.zip');
// Open trace in Playwright Trace Viewer: npx playwright show-trace ./traces/test-failure.zip
```

## E2E Test Runner

The E2E runner integrates with both tools:

```typescript
import { createE2ETestRunnerService } from '../services/e2e-runner';

const runner = createE2ETestRunnerService();

// Create test case
const testCase = await runner.createE2ETestCase({
  name: 'User Login Flow',
  steps: [
    { type: 'navigate', url: 'https://app.example.com/login' },
    { type: 'fill', target: '#email', value: 'test@example.com' },
    { type: 'fill', target: '#password', value: 'password' },
    { type: 'click', target: '#submit' },
    { type: 'assert', assertion: 'visible', target: '.dashboard' },
  ],
});

// Run with browser
const result = await runner.runE2ETest(testCase, { client });
console.log(result.success ? 'PASSED' : 'FAILED');
```

## Best Practices

### 1. Always Clean Up

```typescript
afterEach(async () => {
  await client.quit();
}, 30000);  // Allow time for daemon cleanup

afterAll(async () => {
  await cleanupAllBrowserProcesses();  // Safety net
});
```

### 2. Use Session Isolation for Parallel Tests

```typescript
import { getSessionManager } from '../agent-browser/session-manager';

const sessionManager = getSessionManager();

// Create isolated sessions
const session1 = await sessionManager.createSession({ name: 'test-1' });
const session2 = await sessionManager.createSession({ name: 'test-2' });

// Run tests in parallel...

// Clean up
await sessionManager.closeAllSessions();
```

### 3. Prefer Refs over CSS Selectors

```typescript
// Good - deterministic, accessibility-based
await client.click('@e5');

// Okay - CSS selector as fallback
await client.click({ type: 'css', value: '#submit-btn' });

// Avoid - fragile XPath
await client.click({ type: 'xpath', value: '//button[3]' });
```

### 4. Use Explicit Waits

```typescript
// Wait for element
await client.waitForElement('@e5');

// Wait for text
await client.waitForText('Welcome back');

// Wait for URL change
await client.waitForUrl('/dashboard');

// Wait for network idle
await client.waitForNetworkIdle();
```

## Troubleshooting

### Memory Leaks / Zombie Processes

If tests leave behind daemon processes:

```typescript
import { cleanupAllBrowserProcesses } from '../agent-browser/client';

// In test afterAll
afterAll(async () => {
  await cleanupAllBrowserProcesses();
});
```

Manual cleanup:
```bash
pkill -f "agent-browser.*daemon"
pkill -f "chromium_headless_shell"
```

### Timeout Errors

Increase timeouts for slow operations:

```typescript
const client = createAgentBrowserClient({
  timeout: 60000,  // 60 seconds
});
```

### Element Not Found

1. Take a snapshot to see available refs:
```typescript
const snap = await client.getSnapshot({ interactive: true });
console.log(snap.value?.interactiveElements);
```

2. Wait for element before interacting:
```typescript
await client.waitForElement('@e5');
await client.click('@e5');
```

## See Also

- [agent-browser Guide](./agent-browser-guide.md) - Detailed usage guide
- [Vibium Setup](./vibium-setup.md) - Vibium configuration
- [E2E Testing](../testing/e2e-testing.md) - E2E test patterns

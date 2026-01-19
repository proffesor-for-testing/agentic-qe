# agent-browser Integration Guide

## Introduction

agent-browser is a browser automation tool from Vercel Labs that uses accessibility snapshots for deterministic element selection. Instead of fragile CSS selectors, it uses refs like `@e1`, `@e2` that map to elements in the accessibility tree.

Key advantages:
- **Deterministic Selection**: Refs are stable across page rerenders
- **93% Less Context**: Snapshots are much smaller than full DOM
- **Session Isolation**: Run parallel tests without interference
- **Network Interception**: Mock API responses in tests
- **Device Emulation**: Test on mobile devices
- **State Persistence**: Save/load auth state

## Installation

agent-browser is installed as part of AQE v3:

```bash
cd v3
npm install
```

Verify installation:
```bash
npx agent-browser --help
```

## Core Concepts

### Snapshots and Refs

Snapshots are accessibility tree representations with element refs:

```
Document: Example App
├── @e1 heading "Welcome"
├── @e2 textbox "Email"
├── @e3 textbox "Password"
├── @e4 button "Sign In"
└── @e5 link "Forgot Password?"
```

Use these refs for interactions:
```typescript
await client.click('@e4');        // Click "Sign In"
await client.fill('@e2', 'user@example.com');
```

### Sessions

Sessions provide isolated browser contexts:

```typescript
// Each session has its own cookies, storage, history
const session1 = await sessionManager.createSession({ name: 'user-a' });
const session2 = await sessionManager.createSession({ name: 'user-b' });
```

## AgentBrowserClient API

### Lifecycle

```typescript
import { createAgentBrowserClient } from '../integrations/browser/agent-browser/client';

const client = createAgentBrowserClient({
  headed: false,      // Show browser window
  timeout: 30000,     // Command timeout (ms)
  debug: false,       // Debug logging
  sessionName: 'default',
});

// Launch browser
const launchResult = await client.launch({
  headless: true,
  viewport: { width: 1280, height: 720 },
  deviceName: 'iPhone 14',  // Optional device emulation
});

// Always quit when done
await client.quit();
```

### Navigation

```typescript
// Navigate to URL
const navResult = await client.navigate('https://example.com');
if (navResult.success) {
  console.log(`Title: ${navResult.value.title}`);
}

// History navigation
await client.goBack();
await client.goForward();
await client.reload();
```

### Element Interaction

```typescript
// Click - supports multiple target formats
await client.click('@e5');                           // Ref
await client.click({ type: 'ref', value: 'e5' });   // Explicit ref
await client.click({ type: 'css', value: '#btn' }); // CSS selector
await client.click({ type: 'text', value: 'Submit' }); // Text content

// Fill input
await client.fill('@e2', 'test@example.com');

// Get text
const textResult = await client.getText('@e1');
console.log(textResult.value);  // "Welcome"

// Check visibility
const visibleResult = await client.isVisible('@e5');
console.log(visibleResult.value);  // true/false
```

### Snapshots

```typescript
// Get snapshot with interactive elements
const snapshot = await client.getSnapshot({
  interactive: true,  // Include interactive elements
  depth: 5,           // Max tree depth
});

if (snapshot.success) {
  // Browse all elements
  for (const el of snapshot.value.elements) {
    console.log(`${el.ref} ${el.role} "${el.name}"`);
  }

  // Find interactive elements
  const buttons = snapshot.value.interactiveElements.filter(
    el => el.role === 'button'
  );

  // Lookup by ref
  const element = snapshot.value.refMap.get('@e5');
}
```

### Screenshots

```typescript
// Capture to file
await client.screenshot({ path: './screenshot.png' });

// Full page screenshot
await client.screenshot({ path: './full.png', fullPage: true });

// Capture as base64
const result = await client.screenshot();
console.log(result.value?.base64);  // base64 string
```

### JavaScript Evaluation

```typescript
// Run JavaScript in page context
const result = await client.evaluate<string>('document.title');
console.log(result.value);  // "Example Page"

// Complex evaluation
const data = await client.evaluate<{ count: number }>(`
  JSON.stringify({
    count: document.querySelectorAll('button').length
  })
`);
```

### Wait Strategies

```typescript
// Wait for element
await client.waitForElement('@e5');
await client.waitForElement({ type: 'css', value: '.modal' });

// Wait for text
await client.waitForText('Success!');

// Wait for URL
await client.waitForUrl('/dashboard');
await client.waitForUrl('**/success**');  // Glob pattern

// Wait for network idle
await client.waitForNetworkIdle();
```

### Device Emulation

```typescript
// Set device profile
await client.setDevice('iPhone 14');
await client.setDevice('Pixel 7');
await client.setDevice('iPad Pro');

// Custom viewport
await client.setViewport(375, 812);
```

### Network Interception

```typescript
// Mock API response
await client.mockRoute('**/api/users/**', {
  status: 200,
  body: { users: [{ id: 1, name: 'Test' }] },
  headers: { 'Content-Type': 'application/json' },
});

// Abort requests (e.g., analytics)
await client.abortRoute('**/analytics/**');
await client.abortRoute('**/tracking/**');

// Clear all mocks
await client.clearRoutes();
```

### State Persistence

```typescript
// Save authenticated state
await client.saveState('./state/admin-user.json');

// Load state in another test
await client.loadState('./state/admin-user.json');
```

### Trace Recording

```typescript
// Start recording
await client.startTrace();

// Run your test...
await client.navigate('https://example.com');
await client.click('@e5');

// Stop and save trace
const traceResult = await client.stopTrace('./traces/test.zip');

// View trace: npx playwright show-trace ./traces/test.zip
```

### Session Management

```typescript
// Create new session
const sessionResult = await client.createSession('test-session');

// Switch sessions
await client.switchSession('other-session');

// List sessions
const sessionsResult = await client.listSessions();
for (const session of sessionsResult.value ?? []) {
  console.log(`${session.id}: ${session.status}`);
}
```

## Domain Services

### NetworkMockingService

High-level API mocking for E2E tests:

```typescript
import {
  createNetworkMockingService,
  jsonMock,
  errorMock,
  delayedMock,
} from '../domains/test-execution/services/network-mocker';

const mocker = createNetworkMockingService(client);

// Setup mocks
await mocker.setupMocks([
  {
    urlPattern: '**/api/users/**',
    method: 'GET',
    response: jsonMock({ users: [] }),
  },
  {
    urlPattern: '**/api/auth/**',
    method: 'POST',
    response: errorMock(401, 'Unauthorized'),
  },
  {
    urlPattern: '**/api/slow/**',
    response: delayedMock({ data: 'ok' }, 2000),  // 2s delay
  },
]);

// Abort analytics
await mocker.abortRequests('**/analytics/**');

// Verify mock was called
const called = await mocker.verifyMockCalled('**/api/users/**');

// Clean up
await mocker.clearMocks();
```

### AuthStateManager

Manage authentication state across tests:

```typescript
import {
  createAuthStateManager,
  loadStateOrLogin,
} from '../domains/test-execution/services/auth-state-manager';

const stateManager = createAuthStateManager({
  stateDir: '.agentic-qe/browser-state',
  defaultMaxAgeMs: 24 * 60 * 60 * 1000,  // 24 hours
});

// Save state after login
await stateManager.saveAuthState('admin', client, {
  userId: 'admin-123',
  roles: ['admin', 'user'],
});

// Load state
const loaded = await stateManager.loadAuthState('admin', client);

// Check validity
const valid = await stateManager.hasValidState('admin');

// List all states
const states = await stateManager.listStates();

// Cleanup expired states
const cleaned = await stateManager.cleanupExpiredStates();

// Or use convenience function
const wasLoaded = await loadStateOrLogin(
  client,
  'admin',
  async () => {
    await client.navigate('/login');
    await client.fill('@e2', 'admin@example.com');
    await client.fill('@e3', 'password');
    await client.click('@e4');
    await client.waitForUrl('/dashboard');
  },
  stateManager
);
```

## E2E Test Patterns

### Basic Test Structure

```typescript
import { describe, it, beforeAll, afterAll, afterEach } from 'vitest';
import {
  createAgentBrowserClient,
  cleanupAllBrowserProcesses,
} from '../integrations/browser/agent-browser/client';

describe('User Login', () => {
  let client: AgentBrowserClient;

  beforeAll(async () => {
    client = createAgentBrowserClient({ debug: false });
    await client.launch();
  });

  afterEach(async () => {
    // Clear state between tests
    await client.navigate('about:blank');
  }, 30000);

  afterAll(async () => {
    await client.quit();
    await cleanupAllBrowserProcesses();
  });

  it('should login successfully', async () => {
    await client.navigate('https://app.example.com/login');

    // Get snapshot for refs
    const snap = await client.getSnapshot({ interactive: true });

    // Find email input
    const emailInput = snap.value?.interactiveElements.find(
      el => el.role === 'textbox' && el.name?.includes('Email')
    );

    await client.fill(emailInput!.ref, 'test@example.com');
    await client.fill('@e3', 'password');  // Known ref for password
    await client.click('@e4');  // Submit button

    await client.waitForUrl('/dashboard');

    const title = await client.evaluate<string>('document.title');
    expect(title.value).toContain('Dashboard');
  });
});
```

### Parallel Tests with Sessions

```typescript
import { getSessionManager } from '../integrations/browser/agent-browser/session-manager';

describe('Parallel User Flows', () => {
  const sessionManager = getSessionManager();

  afterAll(async () => {
    await sessionManager.closeAllSessions();
  });

  it('should handle multiple users concurrently', async () => {
    // Create isolated sessions
    const [adminSession, userSession] = await Promise.all([
      sessionManager.createSession({ name: 'admin', initialUrl: 'https://app.example.com' }),
      sessionManager.createSession({ name: 'user', initialUrl: 'https://app.example.com' }),
    ]);

    // Get executors
    const adminExec = sessionManager.getSessionExecutor('admin');
    const userExec = sessionManager.getSessionExecutor('user');

    // Run in parallel
    await Promise.all([
      adminExec.click('@e1'),  // Admin action
      userExec.click('@e2'),   // User action
    ]);
  });
});
```

### Mocked API Tests

```typescript
import { createNetworkMockingService, jsonMock } from '../services/network-mocker';

describe('API Integration', () => {
  let mocker: NetworkMockingService;

  beforeAll(() => {
    mocker = createNetworkMockingService(client);
  });

  afterEach(async () => {
    await mocker.clearMocks();
  });

  it('should display user list from API', async () => {
    // Mock the API
    await mocker.setupMocks([
      {
        urlPattern: '**/api/users**',
        response: jsonMock({
          users: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ],
        }),
      },
    ]);

    await client.navigate('https://app.example.com/users');
    await client.waitForText('Alice');

    // Verify mock was called
    const called = await mocker.verifyMockCalled('**/api/users**');
    expect(called).toBe(true);
  });
});
```

### Visual Regression with Snapshots

```typescript
it('should match visual snapshot', async () => {
  await client.navigate('https://app.example.com/component');
  await client.waitForNetworkIdle();

  const screenshot = await client.screenshot({ fullPage: true });

  // Compare with baseline (using your preferred tool)
  expect(screenshot.value?.base64).toMatchImageSnapshot();
});
```

## CLI Commands Reference

The agent-browser CLI can be used directly for debugging:

```bash
# Open URL
npx agent-browser open https://example.com

# Take snapshot
npx agent-browser snapshot -i  # Interactive elements only

# Click element
npx agent-browser click @e5

# Fill input
npx agent-browser fill @e2 "test@example.com"

# Screenshot
npx agent-browser screenshot ./screenshot.png

# Device emulation
npx agent-browser set device "iPhone 14"

# Network mocking
npx agent-browser network route "**/api/**" --body '{"mock":true}'

# Save/load state
npx agent-browser state save ./state.json
npx agent-browser state load ./state.json

# Trace recording
npx agent-browser trace start
npx agent-browser trace stop ./trace.zip

# Session management
npx agent-browser session list
npx agent-browser --session test1 open https://example.com

# Close browser
npx agent-browser close
```

## Troubleshooting

### Process Leaks

If tests leave daemon processes:

```typescript
import { cleanupAllBrowserProcesses } from '../agent-browser/client';

afterAll(async () => {
  await cleanupAllBrowserProcesses();
});
```

### Element Not Found

1. Check available refs with snapshot:
```typescript
const snap = await client.getSnapshot({ interactive: true });
console.log(JSON.stringify(snap.value?.interactiveElements, null, 2));
```

2. Use waitForElement before interaction:
```typescript
await client.waitForElement('@e5');
await client.click('@e5');
```

### Timeout Errors

Increase timeout:
```typescript
const client = createAgentBrowserClient({
  timeout: 60000,  // 60 seconds
});
```

### Network Mock Not Working

Ensure mock is set up before navigation:
```typescript
await mocker.setupMocks([...]);  // First
await client.navigate('/page');   // Then navigate
```

### State Not Loading

Check state validity:
```typescript
const valid = await stateManager.hasValidState('admin');
if (!valid) {
  // State expired or corrupt, need fresh login
}
```

## See Also

- [Browser Automation Overview](./browser-automation.md)
- [agent-browser GitHub](https://github.com/vercel-labs/agent-browser)
- [E2E Testing Guide](../testing/e2e-testing.md)

# Unified Browser Automation Types

This module provides a common interface (`IBrowserClient`) that both Vibium and agent-browser implement, enabling seamless integration with AQE v3.

## Features

### Common Interface (IBrowserClient)

Both browser tools implement a unified interface with core operations:

- **Lifecycle**: `launch()`, `quit()`, `isAvailable()`
- **Navigation**: `navigate()`, `reload()`, `goBack()`, `goForward()`
- **Element Interaction**: `click()`, `fill()`, `getText()`, `isVisible()`
- **Screenshots**: `screenshot()` for visual testing
- **Script Evaluation**: `evaluate()` for custom operations
- **Error Handling**: Unified `BrowserError` hierarchy

### Element Targeting

Flexible element selection supporting multiple strategies:

```typescript
type ElementTarget =
  | { type: 'ref'; value: string }      // @e1, @e2 (agent-browser)
  | { type: 'css'; value: string }      // CSS selector
  | { type: 'xpath'; value: string }    // XPath
  | { type: 'text'; value: string };    // Text content
```

Polymorphic API accepts both:
- String shorthand: `client.click('button.submit')`
- Typed targets: `client.click({ type: 'ref', value: '@e1' })`

### Extended Interface (IAgentBrowserClient)

agent-browser implements additional features:

- **Snapshots**: `getSnapshot()` returns elements with refs (@e1, @e2, etc.)
- **Sessions**: `createSession()`, `switchSession()`, `listSessions()`
- **Network Mocking**: `mockRoute()`, `abortRoute()`, `clearRoutes()`
- **Device Emulation**: `setDevice()`, `setViewport()`
- **State Persistence**: `saveState()`, `loadState()` for auth state
- **Advanced Waits**: `waitForElement()`, `waitForText()`, `waitForUrl()`, `waitForNetworkIdle()`

## Tool Selection

### Use Vibium When:
- Real browser automation is needed
- Screenshots for visual regression testing
- Accessibility testing with real browser
- Working with Playwright-compatible operations

### Use agent-browser When:
- E2E testing with element refs (@e1, @e2)
- Session isolation needed
- API mocking/network interception required
- Device emulation needed
- Authentication state persistence needed
- Advanced wait strategies needed

### Auto Selection
Set `BrowserToolPreference` to `'auto'` for intelligent selection based on:
- Use case requirements
- Tool availability
- Current test context

## Error Handling

Unified error hierarchy with tool identification:

```typescript
class BrowserError extends Error {
  code: string;                          // Error code
  tool: 'vibium' | 'agent-browser';     // Which tool errored
  cause?: Error;                         // Root cause chain
}

// Specific errors:
- BrowserUnavailableError              // Tool not available
- BrowserTimeoutError                  // Operation timeout
- BrowserElementNotFoundError          // Element not found
```

## Usage Examples

### Basic Navigation (Works with both tools)

```typescript
import type { IBrowserClient } from '@/integrations/browser';

async function testNavigation(client: IBrowserClient) {
  // Launch browser
  const sessionResult = await client.launch({ headless: true });
  if (!sessionResult.success) throw sessionResult.error;

  // Navigate
  const navResult = await client.navigate('https://example.com');
  if (!navResult.success) throw navResult.error;

  console.log(`Navigated to: ${navResult.value.url}`);

  // Take screenshot
  const screenshot = await client.screenshot({ fullPage: true });

  // Cleanup
  await client.quit();
}
```

### E2E Testing with agent-browser (Using snapshots)

```typescript
import type { IAgentBrowserClient } from '@/integrations/browser';

async function testWithSnapshots(client: IAgentBrowserClient) {
  // Get snapshot with element refs
  const snapshot = await client.getSnapshot({ interactive: true });
  if (!snapshot.success) throw snapshot.error;

  // Use refs for reliable element targeting
  const elements = snapshot.value.interactiveElements;
  for (const element of elements) {
    console.log(`Found: ${element.name} (${element.ref})`);
    if (element.ref === '@e1') {
      // Click using ref
      await client.click({ type: 'ref', value: element.ref });
    }
  }
}
```

### Session Management (agent-browser)

```typescript
import type { IAgentBrowserClient } from '@/integrations/browser';

async function testWithSessions(client: IAgentBrowserClient) {
  // Create isolated session
  const session1 = await client.createSession('user-1');
  await client.navigate('https://app.example.com/login');
  // ... authenticate user 1
  await client.saveState('./auth-user-1.json');

  // Switch to different session
  const session2 = await client.createSession('user-2');
  await client.navigate('https://app.example.com/login');
  // ... authenticate user 2
  await client.saveState('./auth-user-2.json');

  // Later, restore states
  await client.switchSession('user-1');
  await client.loadState('./auth-user-1.json');
}
```

### API Mocking (agent-browser)

```typescript
import type { IAgentBrowserClient } from '@/integrations/browser';

async function testWithMocking(client: IAgentBrowserClient) {
  // Mock API responses
  await client.mockRoute('/api/users/**', {
    status: 200,
    body: { id: 1, name: 'John Doe' }
  });

  // Mock error responses
  await client.mockRoute('/api/errors/**', {
    status: 500,
    body: { error: 'Internal server error' }
  });

  // Navigate and interact
  await client.navigate('https://app.example.com');
  // ... app makes requests that are intercepted and mocked

  // Clear all mocks
  await client.clearRoutes();
}
```

### Responsive Testing (agent-browser)

```typescript
import type { IAgentBrowserClient } from '@/integrations/browser';

async function testResponsive(client: IAgentBrowserClient) {
  const devices = ['iPhone 12', 'Pixel 5', 'iPad Pro'];

  for (const device of devices) {
    // Emulate device
    await client.setDevice(device);

    // Test on device
    await client.navigate('https://example.com');
    const screenshot = await client.screenshot();
    console.log(`Screenshot for ${device} taken`);
  }
}
```

## Integration with AQE v3

### Visual Accessibility Testing

```typescript
import { VisualAccessibilityTester } from '@/domains/visual-accessibility';
import type { IBrowserClient } from '@/integrations/browser';

const tester = new VisualAccessibilityTester(browserClient);
// Uses client.screenshot() and client.evaluate() for accessibility checks
```

### E2E Test Execution

```typescript
import { E2ERunner } from '@/domains/test-execution';
import type { IAgentBrowserClient } from '@/integrations/browser';

const runner = new E2ERunner(agentBrowserClient);
// Uses snapshots and refs for reliable element targeting
```

## File Structure

```
v3/src/integrations/browser/
├── types.ts                          # Type definitions
├── index.ts                          # Public exports
└── README.md                         # This file

v3/tests/unit/integrations/browser/
└── types.test.ts                     # Type validation tests
```

## Compatibility Matrix

| Feature | Vibium | agent-browser |
|---------|--------|---------------|
| launch() | ✓ | ✓ |
| navigate() | ✓ | ✓ |
| click() | ✓ | ✓ |
| fill() | ✓ | ✓ |
| getText() | ✓ | ✓ |
| screenshot() | ✓ | ✓ |
| evaluate() | ✓ | ✓ |
| **Snapshots with refs** | ✗ | ✓ |
| **Session management** | ✗ | ✓ |
| **Network mocking** | ✗ | ✓ |
| **Device emulation** | ✗ | ✓ |
| **State persistence** | ✗ | ✓ |

## Implementation Checklist

When implementing a browser client:

- [ ] Implement `IBrowserClient` interface
- [ ] Support string and `ElementTarget` polymorphism
- [ ] Return `Result<T, BrowserError>` for all operations
- [ ] Throw `BrowserError` subclasses with appropriate codes
- [ ] Implement `isAvailable()` to check tool availability
- [ ] Document tool-specific limitations in docstrings
- [ ] Write unit tests for error conditions
- [ ] Validate with `v3/tests/unit/integrations/browser/types.test.ts`

For agent-browser specific features:
- [ ] Implement `IAgentBrowserClient` interface
- [ ] Support `getSnapshot()` with element refs
- [ ] Implement session management
- [ ] Support network route interception
- [ ] Add device emulation support
- [ ] Implement state persistence

## Testing

Run type validation tests:

```bash
cd v3
npm test -- --run tests/unit/integrations/browser/types.test.ts
```

Validate TypeScript compilation:

```bash
npx tsc --noEmit
```

## Notes

- The interface is designed for extensibility - add tool-specific interfaces (like `IAgentBrowserClient`) without modifying core `IBrowserClient`
- Element targeting supports both string shortcuts and typed targets for flexibility
- All operations return `Result` types for proper error handling
- Error hierarchy enables tool-specific error handling while maintaining common interface
- Session and state management features are agent-browser specific to maintain focus on E2E testing capabilities

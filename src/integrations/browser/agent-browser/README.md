# agent-browser Command Executor

TypeScript wrapper for executing agent-browser CLI commands with type safety and error handling.

## Overview

The `AgentBrowserCommandExecutor` class provides a type-safe interface for interacting with the agent-browser CLI tool. It handles:

- Command execution with JSON parsing
- Session management
- Error handling with proper types
- Synchronous and asynchronous execution
- All agent-browser CLI commands

## Installation

```bash
npm install agent-browser
```

## Basic Usage

```typescript
import { AgentBrowserCommandExecutor, isAgentBrowserAvailable } from './command-executor';

// Check if agent-browser is available
if (!isAgentBrowserAvailable()) {
  console.error('agent-browser CLI not found');
  process.exit(1);
}

// Create executor with session isolation
const executor = new AgentBrowserCommandExecutor({
  sessionName: 'my-test-session',
  timeout: 30000,
  headed: false,  // Headless by default
  debug: true,    // Enable debug logging
});

// Open a URL
const openResult = executor.open('https://example.com');
if (!openResult.success) {
  console.error('Failed to open URL:', openResult.error);
  process.exit(1);
}

// Get accessibility snapshot
const snapshot = executor.snapshot({
  interactive: true,  // Include interactive elements
  compact: true,      // Compact format
  depth: 3           // Max depth
});

console.log('Snapshot:', snapshot.data);

// Interact with elements
executor.click('#submit-button');
executor.fill('#username', 'testuser');
executor.type('#password', 'password123');

// Wait for elements
executor.waitForElement('#success-message');
executor.waitForNetworkIdle();

// Take screenshot
const screenshotResult = executor.screenshot('/tmp/screenshot.png', true);

// Clean up
executor.close();
```

## API Reference

### Constructor

```typescript
new AgentBrowserCommandExecutor(config?: CommandExecutorConfig)
```

**Config Options:**
- `sessionName?: string` - Session name for isolation (default: 'default')
- `timeout?: number` - Command timeout in ms (default: 30000)
- `headed?: boolean` - Show browser window (default: false)
- `debug?: boolean` - Enable debug logging (default: false)

### Browser Lifecycle

```typescript
// Open URL
executor.open(url: string): CommandResult<void>

// Close browser
executor.close(): CommandResult<void>
```

### Snapshots (Key Feature)

```typescript
// Get accessibility snapshot with refs
executor.snapshot(options?: {
  interactive?: boolean;  // Include interactive elements
  compact?: boolean;      // Compact format
  depth?: number;         // Max tree depth
}): CommandResult<string>
```

### Element Interactions

```typescript
// Click element by ref or selector
executor.click(target: string): CommandResult<void>

// Fill input (clears first)
executor.fill(target: string, text: string): CommandResult<void>

// Type text (no clearing)
executor.type(target: string, text: string): CommandResult<void>

// Get element text
executor.getText(target: string): CommandResult<string>

// Check visibility
executor.isVisible(target: string): CommandResult<boolean>
```

### Screenshots

```typescript
// Take screenshot
executor.screenshot(
  path?: string,      // File path (optional, returns base64 if omitted)
  fullPage?: boolean  // Full page screenshot
): CommandResult<string>
```

### Wait Commands

```typescript
// Wait for element
executor.waitForElement(target: string, timeout?: number): CommandResult<void>

// Wait for text
executor.waitForText(text: string): CommandResult<void>

// Wait for URL pattern
executor.waitForUrl(pattern: string): CommandResult<void>

// Wait for network idle
executor.waitForNetworkIdle(): CommandResult<void>
```

### Device/Viewport

```typescript
// Set device emulation
executor.setDevice(deviceName: string): CommandResult<void>

// Set viewport size
executor.setViewport(width: number, height: number): CommandResult<void>
```

### Network Mocking

```typescript
// Mock route
executor.mockRoute(urlPattern: string, body: unknown): CommandResult<void>

// Abort route
executor.abortRoute(urlPattern: string): CommandResult<void>

// Clear all routes
executor.clearRoutes(): CommandResult<void>
```

### State Management

```typescript
// Save browser state (cookies, storage)
executor.saveState(path: string): CommandResult<void>

// Load browser state
executor.loadState(path: string): CommandResult<void>
```

### JavaScript Evaluation

```typescript
// Evaluate JS in page context
executor.eval<T>(script: string): CommandResult<T>

// Example
const titleResult = executor.eval<string>('document.title');
console.log('Page title:', titleResult.data);
```

### Session Info

```typescript
// Get current session name
executor.getSessionName(): string

// Check if browser is launched
executor.isBrowserLaunched(): boolean
```

### Async Execution

For long-running operations:

```typescript
const result = await executor.executeAsync('open', ['https://slow-site.com']);
```

## Return Type

All commands return `CommandResult<T>`:

```typescript
interface CommandResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

**Usage pattern:**

```typescript
const result = executor.click('#button');
if (result.success) {
  console.log('Clicked successfully');
} else {
  console.error('Click failed:', result.error);
}
```

## Error Handling

The executor handles all errors gracefully:

```typescript
try {
  const result = executor.open('https://invalid-url');
  if (!result.success) {
    // Handle error
    console.error('Operation failed:', result.error);
  }
} catch (error) {
  // This should rarely happen - errors are caught internally
  console.error('Unexpected error:', error);
}
```

## Session Isolation

Each executor instance can use a separate session:

```typescript
const session1 = new AgentBrowserCommandExecutor({ sessionName: 'test-1' });
const session2 = new AgentBrowserCommandExecutor({ sessionName: 'test-2' });

session1.open('https://site1.com');
session2.open('https://site2.com');

// Each session maintains separate browser state
```

## Testing

The command executor is fully tested with 21 unit tests covering:

- Configuration and initialization
- Session management
- Command building and execution
- Type safety
- Error handling
- Method signatures
- Async execution

Run tests:

```bash
cd v3 && npm test -- tests/unit/integrations/browser/agent-browser/command-executor.test.ts --run
```

## TypeScript Compilation

Verify type safety:

```bash
cd v3 && npx tsc --noEmit --skipLibCheck src/integrations/browser/agent-browser/command-executor.ts
```

## Examples

See `tests/unit/integrations/browser/agent-browser/command-executor.test.ts` for complete usage examples.

## Related Files

- `command-executor.ts` - Main implementation
- `snapshot-parser.ts` - Parse accessibility snapshots
- `session-manager.ts` - Manage multiple sessions
- `index.ts` - Public exports

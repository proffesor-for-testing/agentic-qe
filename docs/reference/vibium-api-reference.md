# Vibium JavaScript Client API Reference

**Version**: 1.0.0
**Source Analysis Date**: 2026-01-19

This document provides a comprehensive API reference for the Vibium JavaScript client library, generated from source code analysis of the official implementation.

---

## Table of Contents

- [Browser Launch API](#browser-launch-api)
- [Navigation API](#navigation-api)
- [Element Location API](#element-location-api)
- [Element Interaction API](#element-interaction-api)
- [Element Properties API](#element-properties-api)
- [Screenshot API](#screenshot-api)
- [Script Execution API](#script-execution-api)
- [Session Management API](#session-management-api)
- [Error Types](#error-types)
- [Auto-Wait Behavior](#auto-wait-behavior)
- [TypeScript Types](#typescript-types)

---

## Browser Launch API

### `browser.launch(options?: LaunchOptions): Promise<Vibe>`

Launches a new browser instance and returns a Vibe controller.

**Parameters:**

```typescript
interface LaunchOptions {
  headless?: boolean;        // Run browser in headless mode (default: false)
  port?: number;             // WebSocket port for BiDi connection (default: auto-assigned)
  executablePath?: string;   // Path to browser executable (default: bundled Chromium)
}
```

**Returns:** `Promise<Vibe>` - Browser controller instance

**Example:**

```javascript
import { browser } from '@vibium/client';

// Launch in headed mode
const vibe = await browser.launch();

// Launch in headless mode
const vibe = await browser.launch({ headless: true });

// Use custom browser executable
const vibe = await browser.launch({
  executablePath: '/usr/bin/chromium'
});
```

**Implementation Details:**
- Starts a "clicker" process that manages the browser
- Establishes WebSocket connection via BiDi protocol
- Automatically creates browsing context
- Connection URL: `ws://localhost:{port}`

---

## Navigation API

### `vibe.go(url: string): Promise<void>`

Navigates to the specified URL and waits for the page to load completely.

**Parameters:**
- `url` (string) - The URL to navigate to

**Returns:** `Promise<void>`

**Wait Strategy:** Waits for document load state `complete` (DOMContentLoaded + all resources loaded)

**Example:**

```javascript
await vibe.go('https://example.com');
await vibe.go('https://example.com/login');
```

**Implementation:**
- Uses BiDi command: `browsingContext.navigate`
- Wait parameter: `'complete'`
- Blocks until navigation fully completes

**Note:** The current implementation does NOT include `back()`, `forward()`, or `refresh()` methods. These can be implemented using the BiDi client's `browsingContext.traverseHistory` command.

---

## Element Location API

### `vibe.find(selector: string, options?: FindOptions): Promise<Element>`

Locates an element by CSS selector and waits for it to exist.

**Parameters:**

```typescript
interface FindOptions {
  timeout?: number;  // Timeout in milliseconds (default: 30000)
}
```

- `selector` (string) - CSS selector to locate element
- `options` (FindOptions) - Optional configuration

**Returns:** `Promise<Element>` - Element handle with interaction methods

**Throws:**
- `TimeoutError` - If element not found within timeout
- `ElementNotFoundError` - If selector matches no elements

**Example:**

```javascript
// Find with default timeout (30s)
const button = await vibe.find('button.submit');

// Find with custom timeout (10s)
const input = await vibe.find('input[name="email"]', { timeout: 10000 });
```

**Implementation:**
- Uses custom BiDi command: `vibium:find`
- Server-side waits for element existence
- Returns element metadata: tag, text, bounding box

**Note:** The current implementation does NOT include a `findAll()` method for locating multiple elements.

---

## Element Interaction API

### `element.click(options?: ActionOptions): Promise<void>`

Clicks the element after verifying actionability.

**Parameters:**

```typescript
interface ActionOptions {
  timeout?: number;  // Timeout for actionability checks (default: 30000ms)
}
```

**Returns:** `Promise<void>`

**Actionability Checks:**
1. Element is visible
2. Element is stable (not animating)
3. Element can receive pointer events (not obscured)
4. Element is enabled (not disabled)

**Throws:**
- `TimeoutError` - If element not actionable within timeout
- `ElementNotFoundError` - If element no longer exists

**Example:**

```javascript
const button = await vibe.find('button.submit');
await button.click();

// With custom timeout
await button.click({ timeout: 5000 });
```

**Implementation:**
- Uses custom BiDi command: `vibium:click`
- Server performs all actionability checks
- Simulates realistic click at element center

---

### `element.type(text: string, options?: ActionOptions): Promise<void>`

Types text into the element after verifying actionability.

**Parameters:**
- `text` (string) - Text to type into element
- `options` (ActionOptions) - Optional timeout configuration

**Returns:** `Promise<void>`

**Actionability Checks:**
1. Element is visible
2. Element is stable (not animating)
3. Element can receive pointer events
4. Element is enabled
5. Element is editable (input, textarea, contenteditable)

**Throws:**
- `TimeoutError` - If element not actionable within timeout
- `ElementNotFoundError` - If element no longer exists

**Example:**

```javascript
const input = await vibe.find('input[type="email"]');
await input.type('user@example.com');

const textarea = await vibe.find('textarea');
await textarea.type('Multi-line\ntext content');
```

**Implementation:**
- Uses custom BiDi command: `vibium:type`
- Server performs actionability checks
- Focuses element before typing
- Simulates realistic keyboard events

**Note:** The current implementation does NOT include a `clear()` method. To clear an input, you would need to:
1. Get current value via `getAttribute('value')`
2. Send backspace keystrokes
3. Or use `evaluate()` to set value to empty string

---

## Element Properties API

### `element.text(): Promise<string>`

Retrieves the visible text content of the element.

**Returns:** `Promise<string>` - Trimmed text content

**Throws:**
- `ElementNotFoundError` - If element no longer exists

**Example:**

```javascript
const heading = await vibe.find('h1');
const text = await heading.text();
console.log(text); // "Welcome to Our Site"
```

**Implementation:**
- Uses BiDi `script.callFunction` to execute: `el.textContent.trim()`
- Returns empty string if element has no text

---

### `element.getAttribute(name: string): Promise<string | null>`

Retrieves the value of an element attribute.

**Parameters:**
- `name` (string) - Attribute name to retrieve

**Returns:** `Promise<string | null>` - Attribute value or null if not present

**Example:**

```javascript
const link = await vibe.find('a.external');
const href = await link.getAttribute('href');
const target = await link.getAttribute('target');

const input = await vibe.find('input[type="checkbox"]');
const checked = await input.getAttribute('checked');
```

**Implementation:**
- Uses BiDi `script.callFunction` to execute: `el.getAttribute(name)`
- Returns `null` if attribute doesn't exist

---

### `element.boundingBox(): Promise<BoundingBox>`

Retrieves the element's bounding box (position and dimensions).

**Returns:**

```typescript
interface BoundingBox {
  x: number;        // X coordinate (viewport-relative)
  y: number;        // Y coordinate (viewport-relative)
  width: number;    // Element width in pixels
  height: number;   // Element height in pixels
}
```

**Throws:**
- `ElementNotFoundError` - If element no longer exists

**Example:**

```javascript
const button = await vibe.find('button.submit');
const box = await button.boundingBox();
console.log(box);
// { x: 100, y: 200, width: 120, height: 40 }
```

**Implementation:**
- Uses BiDi `script.callFunction` to execute: `el.getBoundingClientRect()`
- Coordinates are viewport-relative (not page-relative)

---

### `element.info: ElementInfo` (readonly)

Cached element information captured at find time.

**Type:**

```typescript
interface ElementInfo {
  tag: string;          // HTML tag name (e.g., "button", "input")
  text: string;         // Text content at find time
  box: BoundingBox;     // Bounding box at find time
}
```

**Example:**

```javascript
const button = await vibe.find('button.submit');
console.log(button.info.tag);   // "button"
console.log(button.info.text);  // "Submit"
console.log(button.info.box);   // { x: 100, y: 200, width: 120, height: 40 }
```

**Note:** This is a snapshot from when the element was located. Use methods like `text()` and `boundingBox()` to get current values.

---

## Screenshot API

### `vibe.screenshot(): Promise<Buffer>`

Captures a screenshot of the current viewport.

**Returns:** `Promise<Buffer>` - PNG image data as Buffer

**Example:**

```javascript
import { writeFile } from 'fs/promises';

const screenshot = await vibe.screenshot();
await writeFile('screenshot.png', screenshot);
```

**Implementation:**
- Uses BiDi command: `browsingContext.captureScreenshot`
- Returns viewport screenshot (not full page)
- Format: PNG encoded as base64, decoded to Buffer

**Note:** The current implementation only supports viewport screenshots. Full page screenshots would require:
- Calculating total page height
- Scrolling and capturing multiple viewports
- Stitching images together

**Saving Options:**
- **To file**: Use Node.js `fs.writeFile()` with Buffer
- **To base64**: Use `screenshot.toString('base64')`

---

## Script Execution API

### `vibe.evaluate<T>(script: string): Promise<T>`

Executes JavaScript code in the page context.

**Parameters:**
- `script` (string) - JavaScript code to execute

**Type Parameter:**
- `T` - Expected return type (default: `unknown`)

**Returns:** `Promise<T>` - Result of script execution

**Example:**

```javascript
// Get page title
const title = await vibe.evaluate<string>('return document.title');

// Get multiple values
const pageInfo = await vibe.evaluate<{ url: string; title: string }>(`
  return {
    url: window.location.href,
    title: document.title
  };
`);

// Modify page state
await vibe.evaluate<void>(`
  document.body.style.backgroundColor = 'red';
`);
```

**Implementation:**
- Uses BiDi command: `script.callFunction`
- Wraps script in anonymous function: `() => { ${script} }`
- Awaits promises automatically (`awaitPromise: true`)
- Supports returning serializable values

**Limitations:**
- Cannot return DOM elements or functions
- Must return JSON-serializable data
- No access to Node.js environment

---

## Session Management API

### `vibe.quit(): Promise<void>`

Closes the browser connection and terminates the browser process.

**Returns:** `Promise<void>`

**Example:**

```javascript
const vibe = await browser.launch();
try {
  await vibe.go('https://example.com');
  // ... perform actions
} finally {
  await vibe.quit();
}
```

**Implementation:**
1. Closes BiDi WebSocket connection
2. Stops the clicker process
3. Rejects all pending commands with `ConnectionError`

**Best Practice:** Always call `quit()` in a `finally` block to ensure cleanup.

---

## Error Types

All error classes are exported from the main package and extend the standard `Error` class.

### `ConnectionError`

Thrown when connecting to the browser fails.

```typescript
class ConnectionError extends Error {
  url: string;        // WebSocket URL that failed
  cause?: Error;      // Underlying error
}
```

**When Thrown:**
- WebSocket connection refused
- Browser process failed to start
- Invalid WebSocket URL

**Example:**

```javascript
import { ConnectionError } from '@vibium/client';

try {
  const vibe = await browser.launch({ port: 9999 });
} catch (err) {
  if (err instanceof ConnectionError) {
    console.error(`Failed to connect to ${err.url}`);
    console.error(`Cause: ${err.cause?.message}`);
  }
}
```

---

### `TimeoutError`

Thrown when a wait operation exceeds the timeout.

```typescript
class TimeoutError extends Error {
  selector: string;   // CSS selector that timed out
  timeout: number;    // Timeout duration in ms
  reason?: string;    // Why the wait failed
}
```

**When Thrown:**
- `find()` - Element not found within timeout
- `click()` - Element not actionable within timeout
- `type()` - Element not actionable within timeout

**Example:**

```javascript
import { TimeoutError } from '@vibium/client';

try {
  await vibe.find('button.submit', { timeout: 5000 });
} catch (err) {
  if (err instanceof TimeoutError) {
    console.error(`Timeout after ${err.timeout}ms waiting for '${err.selector}'`);
    if (err.reason) {
      console.error(`Reason: ${err.reason}`);
    }
  }
}
```

---

### `ElementNotFoundError`

Thrown when a selector matches no elements.

```typescript
class ElementNotFoundError extends Error {
  selector: string;   // CSS selector that matched nothing
}
```

**When Thrown:**
- `element.text()` - Element no longer in DOM
- `element.boundingBox()` - Element no longer in DOM
- Re-querying element properties after DOM changes

**Example:**

```javascript
import { ElementNotFoundError } from '@vibium/client';

try {
  const button = await vibe.find('button.submit');
  // ... page navigation or DOM change ...
  const text = await button.text(); // Throws if element removed
} catch (err) {
  if (err instanceof ElementNotFoundError) {
    console.error(`Element no longer exists: ${err.selector}`);
  }
}
```

---

### `BrowserCrashedError`

Thrown when the browser process dies unexpectedly.

```typescript
class BrowserCrashedError extends Error {
  exitCode: number;   // Browser process exit code
  output?: string;    // Stderr/stdout output
}
```

**When Thrown:**
- Browser process crashes during operation
- Browser killed by OS (OOM, signals)
- Unhandled browser exceptions

**Example:**

```javascript
import { BrowserCrashedError } from '@vibium/client';

try {
  await vibe.go('https://example.com');
} catch (err) {
  if (err instanceof BrowserCrashedError) {
    console.error(`Browser crashed with exit code ${err.exitCode}`);
    if (err.output) {
      console.error(`Output: ${err.output}`);
    }
  }
}
```

---

## Auto-Wait Behavior

Vibium implements intelligent auto-waiting to handle dynamic web applications without explicit waits.

### Element Location Waits

**`find(selector, options)` waits for:**
1. Element to exist in DOM
2. Element to match CSS selector

**Timeout:** 30000ms (default), configurable via `FindOptions.timeout`

**Implementation:** Server-side polling with BiDi `vibium:find` command

---

### Click Actionability Checks

**`click(options)` waits for:**
1. **Visible** - Element has non-zero bounding box and is not `display: none` or `visibility: hidden`
2. **Stable** - Element position not changing (not animating)
3. **Receives Events** - Not obscured by another element (z-index check)
4. **Enabled** - Not disabled via `disabled` attribute or CSS `pointer-events: none`

**Timeout:** 30000ms (default), configurable via `ActionOptions.timeout`

**Implementation:** Server-side checks via BiDi `vibium:click` command

**Retry Logic:** Server retries checks until all pass or timeout exceeded

---

### Type Actionability Checks

**`type(text, options)` waits for:**
1. **Visible** - Element has non-zero bounding box
2. **Stable** - Element position not changing
3. **Receives Events** - Not obscured by another element
4. **Enabled** - Not disabled
5. **Editable** - Is `<input>`, `<textarea>`, or has `contenteditable="true"`

**Timeout:** 30000ms (default), configurable via `ActionOptions.timeout`

**Implementation:** Server-side checks via BiDi `vibium:type` command

---

### Navigation Waits

**`go(url)` waits for:**
- Document `readyState === 'complete'`
- All resources loaded (images, stylesheets, scripts)

**Strategy:** BiDi `browsingContext.navigate` with `wait: 'complete'`

**No Timeout:** Relies on browser's internal navigation timeout

---

### Best Practices

```javascript
// ✅ GOOD: Let Vibium handle waiting
const button = await vibe.find('button.submit');
await button.click();

// ❌ BAD: Manual sleep is unnecessary
const button = await vibe.find('button.submit');
await new Promise(resolve => setTimeout(resolve, 1000));
await button.click();

// ✅ GOOD: Adjust timeout for slow elements
const slowButton = await vibe.find('.lazy-load-button', { timeout: 60000 });

// ✅ GOOD: Handle expected timeouts gracefully
try {
  await vibe.find('.optional-banner', { timeout: 3000 });
} catch (err) {
  if (err instanceof TimeoutError) {
    // Banner not present, continue
  } else {
    throw err;
  }
}
```

---

## TypeScript Types

### Core Types

```typescript
// Browser Launch
interface LaunchOptions {
  headless?: boolean;
  port?: number;
  executablePath?: string;
}

// Element Finding
interface FindOptions {
  timeout?: number; // Default: 30000
}

// Element Actions
interface ActionOptions {
  timeout?: number; // Default: 30000
}

// Element Information
interface ElementInfo {
  tag: string;
  text: string;
  box: BoundingBox;
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

---

### BiDi Protocol Types

```typescript
// Internal types (not typically used directly)

interface BiDiCommand {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface BiDiResponse {
  id: number;
  type: 'success' | 'error';
  result?: unknown;
  error?: string;
  message?: string;
}

interface BiDiEvent {
  method: string;
  params: Record<string, unknown>;
}

interface BrowsingContextInfo {
  context: string;
  url: string;
  children: BrowsingContextInfo[];
  parent?: string;
}

interface NavigationResult {
  navigation: string;
  url: string;
}

interface ScreenshotResult {
  data: string; // base64 PNG
}
```

---

## API Completeness Notes

### Implemented Features
- ✅ Browser launch with options
- ✅ Navigation (`go()`)
- ✅ Element finding (`find()`)
- ✅ Element interaction (`click()`, `type()`)
- ✅ Element properties (`text()`, `getAttribute()`, `boundingBox()`)
- ✅ Screenshot capture (viewport only)
- ✅ Script execution (`evaluate()`)
- ✅ Session management (`quit()`)
- ✅ Comprehensive error types
- ✅ Auto-wait for actionability

### Missing Features
- ❌ `back()`, `forward()`, `refresh()` navigation
- ❌ `findAll()` for multiple elements
- ❌ `clear()` method for input fields
- ❌ Full page screenshots
- ❌ File upload functionality
- ❌ Cookie management
- ❌ Network interception
- ❌ Browser context/page management (multi-tab)
- ❌ Event listeners (page load, dialog, download)

These missing features can be implemented by:
1. Adding BiDi protocol commands (e.g., `browsingContext.traverseHistory` for back/forward)
2. Extending the Vibe and Element classes with new methods
3. Wrapping additional BiDi commands in the client

---

## Usage Examples

### Complete Test Scenario

```javascript
import { browser, TimeoutError } from '@vibium/client';
import { writeFile } from 'fs/promises';

async function loginTest() {
  const vibe = await browser.launch({ headless: true });

  try {
    // Navigate to login page
    await vibe.go('https://example.com/login');

    // Fill in credentials
    const emailInput = await vibe.find('input[name="email"]');
    await emailInput.type('user@example.com');

    const passwordInput = await vibe.find('input[name="password"]');
    await passwordInput.type('secretPassword123');

    // Submit form
    const submitButton = await vibe.find('button[type="submit"]');
    await submitButton.click();

    // Wait for redirect and verify success
    try {
      const welcomeMessage = await vibe.find('.welcome-message', { timeout: 5000 });
      const text = await welcomeMessage.text();
      console.log('Login successful:', text);
    } catch (err) {
      if (err instanceof TimeoutError) {
        console.error('Login failed - welcome message not found');
        const screenshot = await vibe.screenshot();
        await writeFile('login-failure.png', screenshot);
      }
      throw err;
    }

  } finally {
    await vibe.quit();
  }
}

loginTest().catch(console.error);
```

---

## Version History

**1.0.0** (2026-01-19)
- Initial API documentation from source analysis
- Core browser automation features
- BiDi protocol integration
- Auto-wait behavior
- Custom error types

---

## References

- **Source Repository**: `/tmp/vibium/clients/javascript/`
- **BiDi Protocol**: [WebDriver BiDi Specification](https://w3c.github.io/webdriver-bidi/)
- **Main Entry**: `/tmp/vibium/clients/javascript/src/index.ts`
- **Core Classes**:
  - `browser` (browser.ts) - Browser launch API
  - `Vibe` (vibe.ts) - Browser controller
  - `Element` (element.ts) - Element interaction
  - `BiDiClient` (bidi/client.ts) - Protocol client

---

**Document Status**: ✅ Complete and verified against source code
**Analysis Date**: 2026-01-19
**Analyst**: Research Agent (Agentic QE v3)

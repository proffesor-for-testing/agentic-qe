# Browser Workflow Templates Reference

**Package:** `@agentic-qe/v3/workflows/browser`
**Source:** `/v3/src/workflows/browser/templates/`
**Format:** YAML

## Overview

Workflow templates provide pre-built, reusable patterns for common browser testing scenarios. Each template is a YAML file defining steps, variables, and execution order. Templates are designed to be parameterized and composable.

---

## Template List

| Template | Purpose | Complexity | Avg Duration |
|----------|---------|------------|--------------|
| [login-flow](#login-flow) | Authentication testing | Low | 5s |
| [oauth-flow](#oauth-flow) | OAuth2/OIDC testing | Medium | 15s |
| [scraping-workflow](#scraping-workflow) | Data extraction | Medium | 10s |
| [visual-regression](#visual-regression) | Screenshot comparison | Low | 8s |
| [form-validation](#form-validation) | Input validation | Low | 7s |
| [navigation-flow](#navigation-flow) | Multi-page navigation | Medium | 12s |
| [api-integration](#api-integration) | Browser-API hybrid | High | 20s |
| [performance-audit](#performance-audit) | Lighthouse-style | High | 30s |
| [accessibility-audit](#accessibility-audit) | WCAG compliance | Medium | 15s |

---

## YAML Schema

All templates follow this schema:

```yaml
# Template metadata
name: string                    # Template name (kebab-case)
version: string                 # Semantic version
description: string             # Human-readable description
tags: string[]                  # Categorization tags

# Variables (template parameters)
variables:
  - name: string                # Variable name
    type: string | number | boolean | array | object
    required: boolean           # Is this variable required?
    default: any                # Default value (if not required)
    description: string         # Usage description

# Steps (execution sequence)
steps:
  - id: string                  # Unique step identifier
    type: string                # Step type (see below)
    description: string         # What this step does
    config: object              # Step-specific configuration
    continueOnError: boolean    # Continue if step fails?
    timeout: number             # Step timeout (ms)
    retry: object               # Retry configuration
      maxAttempts: number
      backoff: 'linear' | 'exponential'

# Assertions (validation)
assertions:
  - condition: string           # Assertion condition (JS expression)
    message: string             # Failure message

# Cleanup (always runs)
cleanup:
  - type: string
    config: object
```

---

## Step Types

### Navigation Steps

#### `navigate`

Navigate to a URL.

```yaml
- id: goto-login
  type: navigate
  config:
    url: "{{baseUrl}}/login"
    waitUntil: domcontentloaded  # load, domcontentloaded, networkidle
```

#### `click`

Click an element.

```yaml
- id: click-submit
  type: click
  config:
    selector: 'button[type="submit"]'
    waitForNavigation: true
```

#### `fill`

Fill an input field.

```yaml
- id: enter-username
  type: fill
  config:
    selector: '#username'
    value: "{{username}}"
    clear: true  # Clear field first
```

#### `select`

Select from dropdown.

```yaml
- id: select-country
  type: select
  config:
    selector: '#country'
    value: "US"
```

### Capture Steps

#### `screenshot`

Capture a screenshot.

```yaml
- id: capture-page
  type: screenshot
  config:
    path: "{{screenshotsDir}}/{{pageName}}.png"
    fullPage: true
    viewport:
      width: 1920
      height: 1080
```

#### `extract`

Extract data from page.

```yaml
- id: extract-prices
  type: extract
  config:
    selector: '.price'
    attribute: textContent
    multiple: true  # Extract all matches
    output: prices  # Store in variable
```

### Validation Steps

#### `assert`

Assert a condition.

```yaml
- id: verify-login
  type: assert
  config:
    condition: "page.url().includes('/dashboard')"
    message: "Failed to reach dashboard after login"
```

#### `waitFor`

Wait for condition.

```yaml
- id: wait-for-element
  type: waitFor
  config:
    selector: '#content-loaded'
    state: visible  # attached, detached, visible, hidden
    timeout: 5000
```

### API Steps

#### `apiCall`

Make API request.

```yaml
- id: fetch-user-data
  type: apiCall
  config:
    method: GET
    url: "{{apiUrl}}/users/{{userId}}"
    headers:
      Authorization: "Bearer {{token}}"
    output: userData
```

### Control Flow

#### `condition`

Conditional execution.

```yaml
- id: check-login-required
  type: condition
  config:
    condition: "page.url().includes('/login')"
    then:
      - type: fill
        config:
          selector: '#username'
          value: "{{username}}"
    else:
      - type: skip
```

#### `loop`

Iterate over items.

```yaml
- id: test-all-pages
  type: loop
  config:
    items: "{{urls}}"
    variable: url
    steps:
      - type: navigate
        config:
          url: "{{url}}"
      - type: screenshot
        config:
          path: "{{screenshotsDir}}/{{url}}.png"
```

---

## Template: login-flow

**Purpose:** Test authentication flows with username/password.

**File:** `login-flow.yaml`

```yaml
name: login-flow
version: "1.0.0"
description: |
  Standard username/password login flow with validation.
  Supports error handling and success verification.
tags:
  - authentication
  - login
  - security

variables:
  - name: baseUrl
    type: string
    required: true
    description: "Base URL of the application"

  - name: username
    type: string
    required: true
    description: "Username for login"

  - name: password
    type: string
    required: true
    description: "Password for login"

  - name: successSelector
    type: string
    required: false
    default: '[data-testid="dashboard"]'
    description: "Selector to verify successful login"

steps:
  - id: navigate-to-login
    type: navigate
    description: "Navigate to login page"
    config:
      url: "{{baseUrl}}/login"
      waitUntil: networkidle

  - id: enter-username
    type: fill
    description: "Enter username"
    config:
      selector: 'input[name="username"], input[type="email"], #username'
      value: "{{username}}"

  - id: enter-password
    type: fill
    description: "Enter password"
    config:
      selector: 'input[name="password"], input[type="password"], #password'
      value: "{{password}}"

  - id: click-submit
    type: click
    description: "Click login button"
    config:
      selector: 'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in")'
      waitForNavigation: true
      timeout: 10000

  - id: wait-for-success
    type: waitFor
    description: "Wait for successful login indicator"
    config:
      selector: "{{successSelector}}"
      state: visible
      timeout: 5000

assertions:
  - condition: "!page.url().includes('/login')"
    message: "Still on login page after authentication"

  - condition: "page.locator('{{successSelector}}').isVisible()"
    message: "Success indicator not visible"
```

**Usage:**

```typescript
import { WorkflowLoader } from '@agentic-qe/v3/workflows/browser';

const loader = new WorkflowLoader();
const workflow = await loader.load('login-flow', {
  baseUrl: 'https://example.com',
  username: 'testuser@example.com',
  password: 'secure-password',
});

const result = await workflow.execute();
```

---

## Template: oauth-flow

**Purpose:** Test OAuth2/OIDC authentication flows.

**File:** `oauth-flow.yaml`

```yaml
name: oauth-flow
version: "1.0.0"
description: |
  OAuth2/OIDC authentication flow testing.
  Handles provider redirect and callback.
tags:
  - authentication
  - oauth
  - oidc

variables:
  - name: appUrl
    type: string
    required: true

  - name: provider
    type: string
    required: true
    description: "OAuth provider (google, github, etc.)"

  - name: providerUsername
    type: string
    required: true

  - name: providerPassword
    type: string
    required: true

steps:
  - id: initiate-oauth
    type: navigate
    config:
      url: "{{appUrl}}/auth/{{provider}}"
      waitUntil: networkidle

  - id: wait-for-provider-redirect
    type: waitFor
    config:
      condition: "page.url().includes('{{provider}}')"
      timeout: 5000

  - id: provider-login
    type: fill
    config:
      selector: 'input[type="email"], input[name="username"]'
      value: "{{providerUsername}}"

  - id: provider-password
    type: fill
    config:
      selector: 'input[type="password"]'
      value: "{{providerPassword}}"

  - id: provider-submit
    type: click
    config:
      selector: 'button[type="submit"]'
      waitForNavigation: true

  - id: wait-for-callback
    type: waitFor
    config:
      condition: "page.url().includes('{{appUrl}}')"
      timeout: 10000

  - id: verify-authenticated
    type: assert
    config:
      condition: "page.locator('[data-user-authenticated]').isVisible()"
      message: "User not authenticated after OAuth flow"

assertions:
  - condition: "page.url().startsWith('{{appUrl}}')"
    message: "Did not return to application after OAuth"
```

---

## Template: visual-regression

**Purpose:** Capture and compare screenshots for visual regression testing.

**File:** `visual-regression.yaml`

```yaml
name: visual-regression
version: "1.0.0"
description: |
  Capture screenshots across viewports and compare with baselines.
  Supports multiple pages and responsive testing.
tags:
  - visual-testing
  - regression
  - screenshots

variables:
  - name: urls
    type: array
    required: true
    description: "List of URLs to test"

  - name: viewports
    type: array
    required: false
    default:
      - { width: 320, height: 568, name: "mobile" }
      - { width: 1920, height: 1080, name: "desktop" }

  - name: baselineDir
    type: string
    required: true
    description: "Directory containing baseline images"

  - name: outputDir
    type: string
    required: true
    description: "Directory for new screenshots"

  - name: threshold
    type: number
    required: false
    default: 0.01
    description: "Difference threshold (0-1)"

steps:
  - id: test-all-urls
    type: loop
    config:
      items: "{{urls}}"
      variable: url
      steps:
        - id: test-all-viewports
          type: loop
          config:
            items: "{{viewports}}"
            variable: viewport
            steps:
              - id: set-viewport
                type: setViewport
                config:
                  width: "{{viewport.width}}"
                  height: "{{viewport.height}}"

              - id: navigate
                type: navigate
                config:
                  url: "{{url}}"
                  waitUntil: networkidle

              - id: capture
                type: screenshot
                config:
                  path: "{{outputDir}}/{{url}}-{{viewport.name}}.png"
                  fullPage: true

              - id: compare
                type: compareScreenshots
                config:
                  baseline: "{{baselineDir}}/{{url}}-{{viewport.name}}.png"
                  current: "{{outputDir}}/{{url}}-{{viewport.name}}.png"
                  threshold: "{{threshold}}"
                  output: "{{outputDir}}/diff-{{url}}-{{viewport.name}}.png"
```

---

## Template: accessibility-audit

**Purpose:** Comprehensive WCAG accessibility testing.

**File:** `accessibility-audit.yaml`

```yaml
name: accessibility-audit
version: "1.0.0"
description: |
  Run Axe-core accessibility audit with WCAG 2.1 AA compliance.
  Generates detailed report with violations and recommendations.
tags:
  - accessibility
  - wcag
  - compliance

variables:
  - name: url
    type: string
    required: true

  - name: wcagLevel
    type: string
    required: false
    default: "AA"
    description: "WCAG level: A, AA, AAA"

  - name: reportPath
    type: string
    required: true

steps:
  - id: navigate
    type: navigate
    config:
      url: "{{url}}"
      waitUntil: networkidle

  - id: run-axe
    type: axeAudit
    config:
      standard: "WCAG21{{wcagLevel}}"
      rules:
        - color-contrast
        - image-alt
        - label
        - link-name
        - button-name
      output: auditResults

  - id: generate-report
    type: generateReport
    config:
      template: accessibility
      data: "{{auditResults}}"
      path: "{{reportPath}}"

assertions:
  - condition: "auditResults.violations.length === 0"
    message: "Accessibility violations found"
```

---

## Variable Substitution

Templates support variable substitution using `{{variableName}}` syntax:

```yaml
# Direct substitution
url: "{{baseUrl}}/login"

# Nested property access
url: "{{config.api.baseUrl}}"

# Array indexing
url: "{{urls[0]}}"

# Conditional
text: "{{isProduction ? 'prod' : 'dev'}}"
```

**JavaScript Context:**

Variables are evaluated in a safe JavaScript context with access to:
- All provided variables
- `page` object (Playwright page)
- `expect` assertion library
- Common utilities (`encodeURIComponent`, `JSON.parse`, etc.)

---

## Custom Workflow Creation

### 1. Create Template File

```bash
# Create new template
touch v3/src/workflows/browser/templates/my-workflow.yaml
```

### 2. Define Workflow

```yaml
name: my-workflow
version: "1.0.0"
description: "My custom workflow"
tags: ["custom"]

variables:
  - name: myParam
    type: string
    required: true

steps:
  - id: my-step
    type: navigate
    config:
      url: "{{myParam}}"
```

### 3. Load and Execute

```typescript
const workflow = await loader.load('my-workflow', {
  myParam: 'https://example.com',
});

const result = await workflow.execute();
```

---

## Workflow Composition

Workflows can be composed by referencing other workflows:

```yaml
name: complex-flow
steps:
  - id: authenticate
    type: workflow
    config:
      template: login-flow
      variables:
        baseUrl: "{{baseUrl}}"
        username: "{{username}}"
        password: "{{password}}"

  - id: run-test
    type: workflow
    config:
      template: my-test-flow
      variables:
        authenticated: true
```

---

## Error Handling

### Continue on Error

```yaml
steps:
  - id: optional-step
    type: click
    config:
      selector: '.optional-element'
    continueOnError: true  # Proceed even if click fails
```

### Retry Configuration

```yaml
steps:
  - id: flaky-step
    type: apiCall
    config:
      url: "{{apiUrl}}"
    retry:
      maxAttempts: 3
      backoff: exponential
      backoffFactor: 2
```

### Cleanup Steps

```yaml
cleanup:
  - type: screenshot
    config:
      path: "./failure-screenshot.png"

  - type: saveHtml
    config:
      path: "./failure-page.html"
```

---

## Performance Optimization

### Parallel Execution

```yaml
steps:
  - id: parallel-screenshots
    type: parallel
    config:
      steps:
        - type: screenshot
          config:
            selector: '#header'
        - type: screenshot
          config:
            selector: '#content'
        - type: screenshot
          config:
            selector: '#footer'
```

### Resource Caching

```yaml
steps:
  - id: cache-api-response
    type: apiCall
    config:
      url: "{{apiUrl}}/data"
      cache:
        enabled: true
        ttl: 300  # 5 minutes
```

---

## Testing Workflows

```typescript
import { describe, it, expect } from 'vitest';
import { WorkflowLoader } from './workflow-loader';

describe('login-flow', () => {
  it('should execute successfully', async () => {
    const loader = new WorkflowLoader();
    const workflow = await loader.load('login-flow', {
      baseUrl: 'http://localhost:3000',
      username: 'test@example.com',
      password: 'password',
    });

    const result = await workflow.execute();

    expect(result.ok).toBe(true);
    expect(result.value.success).toBe(true);
    expect(result.value.steps).toHaveLength(5);
  });
});
```

---

## See Also

- [Main Integration Guide](../integration/claude-flow-browser.md)
- [Security Scanner API](./security-scanner.md)
- [Trajectory Learning Guide](./trajectory-learning.md)
- [Browser Testing Best Practices](../guides/browser-testing.md)

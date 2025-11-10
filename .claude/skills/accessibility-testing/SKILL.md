---
name: accessibility-testing
description: WCAG 2.2 compliance testing, screen reader validation, and inclusive design verification. Use when ensuring legal compliance (ADA, Section 508), testing for disabilities, or building accessible applications for 1 billion disabled users globally.
---

# Accessibility Testing

## Core Principle

**1 billion people have disabilities. Building inaccessible software excludes 15% of humanity.**

Accessibility testing ensures software works for everyone, including people with visual, motor, cognitive, and hearing disabilities. It's not just ethical - it's legally required and expands your market by $13 trillion.

## What is Accessibility Testing?

**Accessibility (a11y):** Ensuring people with disabilities can perceive, understand, navigate, and interact with software using assistive technologies.

**Why Critical:**
- **Legal:** ADA, Section 508, EU Directive 2016/2102 require accessibility
- **Market:** $13T purchasing power of disabled community
- **Litigation:** 250%+ increase in a11y lawsuits (2019-2024)
- **Ethics:** Equal access is a fundamental right
- **UX:** Accessible design benefits all users (curb-cut effect)

**Goal:** WCAG 2.2 Level AA compliance + excellent user experience with assistive tech.

## WCAG 2.2 Compliance Levels

### Conformance Levels

**Level A (Minimum)**
- Basic accessibility
- Addresses most critical barriers
- **Requirement:** Legal minimum in many jurisdictions

**Level AA (Standard)**
- Addresses majority of barriers
- **Requirement:** US federal government (Section 508)
- **Recommendation:** Industry standard for most websites

**Level AAA (Enhanced)**
- Highest level of accessibility
- Not required for full sites (some criteria impossible for all content)
- **Use when:** Specialized accessibility-focused sites

**Most Organizations Target:** WCAG 2.2 Level AA

---

## POUR Principles

### 1. Perceivable
**Users must be able to perceive information**

**Requirements:**
- Text alternatives for non-text content
- Captions for videos
- Audio descriptions for video
- Adaptable content (different presentations)
- Distinguishable content (color contrast, text resize)

**Example:**
```html
<!-- ❌ BAD: Image without alt text -->
<img src="product.jpg">

<!-- ✅ GOOD: Descriptive alt text -->
<img src="product.jpg" alt="Blue wireless headphones with noise cancellation">

<!-- ❌ BAD: Color-only error indication -->
<span style="color: red">Error</span>

<!-- ✅ GOOD: Color + icon + text -->
<span class="error" role="alert">
  <span aria-hidden="true">⚠️</span>
  Error: Invalid email format
</span>
```

---

### 2. Operable
**Users must be able to operate the interface**

**Requirements:**
- Keyboard accessible (no mouse required)
- Enough time to read/use content
- No content causing seizures (no flashing > 3x/sec)
- Navigable (skip links, headings, focus order)
- Input modalities (touch, voice, etc.)

**Example:**
```html
<!-- ❌ BAD: Mouse-only interaction -->
<div onclick="submitForm()">Submit</div>

<!-- ✅ GOOD: Keyboard accessible button -->
<button type="submit" onclick="submitForm()">Submit</button>

<!-- ✅ GOOD: Skip navigation link -->
<a href="#main-content" class="skip-link">
  Skip to main content
</a>

<nav>...</nav>

<main id="main-content">...</main>
```

---

### 3. Understandable
**Information and operation must be understandable**

**Requirements:**
- Readable text (language identified, unusual words explained)
- Predictable operation (consistent navigation)
- Input assistance (error identification, labels, suggestions)
- Compatible with assistive technologies

**Example:**
```html
<!-- ❌ BAD: Unclear error -->
<span>Error</span>

<!-- ✅ GOOD: Clear, actionable error -->
<div role="alert" aria-live="assertive">
  <strong>Error:</strong> Password must be at least 8 characters,
  including one uppercase letter and one number.
</div>

<!-- ✅ GOOD: Form labels -->
<label for="email">
  Email Address (required)
</label>
<input
  type="email"
  id="email"
  name="email"
  required
  aria-required="true"
  aria-describedby="email-help"
>
<span id="email-help">We'll never share your email.</span>
```

---

### 4. Robust
**Content must work with current and future tools**

**Requirements:**
- Valid HTML/CSS
- Name, role, value available to assistive tech
- Status messages announced
- Compatible with user agents and assistive tech

**Example:**
```html
<!-- ✅ GOOD: Custom component with ARIA -->
<div
  role="button"
  tabindex="0"
  aria-pressed="false"
  onkeydown="handleKeyPress(event)"
  onclick="toggleButton()"
>
  Toggle Feature
</div>

<!-- ✅ GOOD: Status message -->
<div role="status" aria-live="polite" aria-atomic="true">
  3 items added to cart
</div>
```

---

## Manual Testing Techniques

### 1. Keyboard-Only Navigation

**Test keyboard accessibility:**
```
Tab       → Move to next focusable element
Shift+Tab → Move to previous focusable element
Enter     → Activate links/buttons
Space     → Activate buttons, toggle checkboxes
Arrow keys→ Navigate within components (menus, sliders)
Esc       → Close dialogs/menus
```

**Checklist:**
- [ ] All interactive elements reachable via keyboard
- [ ] Visible focus indicator (outline/highlight)
- [ ] Logical tab order (follows visual layout)
- [ ] No keyboard traps (can navigate away)
- [ ] Skip navigation link present
- [ ] Keyboard shortcuts documented

**Common Issues:**
```html
<!-- ❌ BAD: Custom div without keyboard support -->
<div onclick="openModal()">Open</div>

<!-- ✅ GOOD: Button with keyboard support -->
<button onclick="openModal()">Open</button>

<!-- ✅ GOOD: Custom element with keyboard -->
<div
  role="button"
  tabindex="0"
  onclick="openModal()"
  onkeydown="if(event.key==='Enter') openModal()"
>
  Open
</div>
```

---

### 2. Screen Reader Testing

**Major Screen Readers:**
- **JAWS** (Windows) - Most popular, commercial
- **NVDA** (Windows) - Free, open-source
- **VoiceOver** (macOS/iOS) - Built-in to Apple devices
- **TalkBack** (Android) - Built-in to Android
- **Narrator** (Windows) - Built-in to Windows

**VoiceOver Basics (macOS):**
```
Cmd+F5          → Toggle VoiceOver
VO+Right/Left   → Navigate elements (VO = Ctrl+Option)
VO+Shift+Down   → Interact with element
VO+Space        → Activate element
VO+A            → Read from top
VO+U            → Rotor (headings, links, landmarks)
```

**Screen Reader Checklist:**
- [ ] All images have alt text (or alt="" for decorative)
- [ ] Headings announce correctly (h1, h2, etc.)
- [ ] Form labels associated with inputs
- [ ] Links have descriptive text (not "click here")
- [ ] Dynamic content announced (aria-live)
- [ ] Custom components have proper roles
- [ ] Page language identified
- [ ] Reading order logical

**Example Testing Script:**
```
1. Enable screen reader
2. Navigate to page
3. Verify page title announced
4. Navigate by headings (h1 → h2 → h3)
5. Navigate by landmarks (nav, main, footer)
6. Tab through form, verify labels read
7. Submit form with errors, verify error messages read
8. Navigate list of items, verify count announced
9. Open modal, verify focus trapped
10. Close modal, verify focus returned
```

---

### 3. Color Contrast Testing

**WCAG Requirements:**
- **Normal text:** 4.5:1 contrast ratio (AA), 7:1 (AAA)
- **Large text (18pt+):** 3:1 contrast ratio (AA), 4.5:1 (AAA)
- **UI components:** 3:1 contrast ratio

**Tools:**
- Chrome DevTools (built-in contrast checker)
- WebAIM Contrast Checker
- Colour Contrast Analyser (CCA)

**Manual Test:**
```html
<!-- ❌ BAD: Insufficient contrast (2.5:1) -->
<p style="color: #777; background: #fff;">Low contrast text</p>

<!-- ✅ GOOD: Sufficient contrast (4.6:1) -->
<p style="color: #595959; background: #fff;">Readable text</p>

<!-- ✅ GOOD: High contrast (12.6:1) -->
<p style="color: #000; background: #fff;">High contrast text</p>
```

**Testing Checklist:**
- [ ] All text meets 4.5:1 ratio
- [ ] Large text meets 3:1 ratio
- [ ] Links distinguishable without color alone
- [ ] UI components meet 3:1 ratio
- [ ] Focus indicators meet 3:1 ratio

---

### 4. Text Resize & Zoom

**Requirements:**
- Text resizeable up to 200% without loss of content/functionality
- No horizontal scrolling at 400% zoom (except data tables)

**Manual Test:**
```
1. Open page in browser
2. Zoom to 200% (Cmd/Ctrl + "+")
   - Verify all text readable
   - Verify no content hidden
   - Verify functionality intact
3. Zoom to 400%
   - Verify no horizontal scrolling
   - Verify content reflows appropriately
```

**CSS Best Practices:**
```css
/* ✅ GOOD: Relative units */
body {
  font-size: 1rem; /* 16px default */
}
h1 {
  font-size: 2rem; /* 32px default */
}

/* ❌ BAD: Fixed pixel sizes */
body {
  font-size: 12px; /* Doesn't scale with user preferences */
}
```

---

## Automated Testing

### 1. axe-core Integration

**Install:**
```bash
npm install --save-dev @axe-core/playwright
```

**Playwright Example:**
```javascript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('homepage should not have accessibility violations', async ({ page }) => {
  await page.goto('https://example.com');

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});

test('form should have proper labels', async ({ page }) => {
  await page.goto('https://example.com/signup');

  const results = await new AxeBuilder({ page })
    .include('#signup-form')
    .analyze();

  // Allow specific known issues
  const allowedViolations = results.violations.filter(v =>
    v.id !== 'color-contrast' // Being fixed in next sprint
  );

  expect(allowedViolations).toEqual([]);
});
```

**CI/CD Integration:**
```yaml
# .github/workflows/a11y.yml
name: Accessibility Tests

on: [pull_request]

jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:a11y

      - name: Upload a11y results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: axe-results
          path: a11y-results/
```

---

### 2. Pa11y Testing

**Install:**
```bash
npm install --save-dev pa11y
```

**Configuration:**
```javascript
// .pa11yrc
{
  "standard": "WCAG2AA",
  "timeout": 30000,
  "wait": 1000,
  "chromeLaunchConfig": {
    "args": ["--no-sandbox"]
  },
  "runners": [
    "axe",
    "htmlcs"
  ],
  "ignore": [
    "color-contrast" // Temporarily ignore while fixing
  ]
}
```

**Usage:**
```javascript
const pa11y = require('pa11y');

async function runA11yTests() {
  const results = await pa11y('https://example.com', {
    standard: 'WCAG2AA',
    includeWarnings: true,
    includeNotices: false
  });

  console.log(`Found ${results.issues.length} issues`);

  results.issues.forEach(issue => {
    console.log(`${issue.type}: ${issue.message}`);
    console.log(`Element: ${issue.selector}`);
    console.log(`Code: ${issue.code}\n`);
  });
}
```

---

### 3. Lighthouse Accessibility Audit

**Chrome DevTools:**
```
1. Open DevTools (F12)
2. Go to Lighthouse tab
3. Select "Accessibility" category
4. Click "Analyze page load"
5. Review score and recommendations
```

**Programmatic:**
```javascript
const lighthouse = require('lighthouse');
const chromeLauncher = require('chrome-launcher');

async function runLighthouse() {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });

  const options = {
    logLevel: 'info',
    output: 'html',
    onlyCategories: ['accessibility'],
    port: chrome.port
  };

  const runnerResult = await lighthouse('https://example.com', options);

  const accessibilityScore = runnerResult.lhr.categories.accessibility.score * 100;
  console.log(`Accessibility Score: ${accessibilityScore}`);

  await chrome.kill();
}
```

---

## ARIA Best Practices

### When to Use ARIA

**First Rule of ARIA:** Don't use ARIA if you can use native HTML

```html
<!-- ❌ BAD: ARIA on native element -->
<div role="button" tabindex="0" onclick="submit()">Submit</div>

<!-- ✅ GOOD: Native element -->
<button onclick="submit()">Submit</button>

<!-- ✅ ARIA OK: Custom component with no native equivalent -->
<div role="tablist">
  <button role="tab" aria-selected="true">Tab 1</button>
  <button role="tab" aria-selected="false">Tab 2</button>
</div>
```

---

### Common ARIA Patterns

**Landmark Roles:**
```html
<header role="banner">Site header</header>
<nav role="navigation">Main navigation</nav>
<main role="main">Main content</main>
<aside role="complementary">Sidebar</aside>
<footer role="contentinfo">Site footer</footer>
```

**Live Regions:**
```html
<!-- Polite: Announces when convenient -->
<div role="status" aria-live="polite" aria-atomic="true">
  3 items added to cart
</div>

<!-- Assertive: Announces immediately -->
<div role="alert" aria-live="assertive">
  Error: Payment failed. Please try again.
</div>
```

**Form Accessibility:**
```html
<label for="username">Username</label>
<input
  type="text"
  id="username"
  aria-required="true"
  aria-describedby="username-help username-error"
>
<span id="username-help">Choose a unique username</span>
<span id="username-error" role="alert" class="error">
  Username already taken
</span>
```

**Modals/Dialogs:**
```html
<div
  role="dialog"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-desc"
  aria-modal="true"
>
  <h2 id="dialog-title">Confirm Action</h2>
  <p id="dialog-desc">Are you sure you want to delete?</p>
  <button onclick="confirmDelete()">Confirm</button>
  <button onclick="closeDialog()">Cancel</button>
</div>
```

---

## Common Accessibility Issues

### Issue 1: Missing Alt Text
```html
<!-- ❌ Problem -->
<img src="chart.png">

<!-- ✅ Solution -->
<img src="chart.png" alt="Sales growth chart showing 25% increase in Q4">

<!-- ✅ Decorative images -->
<img src="decorative-line.png" alt="" role="presentation">
```

---

### Issue 2: Empty Links
```html
<!-- ❌ Problem -->
<a href="/products">
  <img src="icon.png" alt="">
</a>

<!-- ✅ Solution -->
<a href="/products">
  <img src="icon.png" alt="View all products">
</a>
```

---

### Issue 3: Form Labels Missing
```html
<!-- ❌ Problem -->
<input type="text" placeholder="Email">

<!-- ✅ Solution -->
<label for="email">Email Address</label>
<input type="email" id="email" placeholder="you@example.com">

<!-- ✅ Alternative: aria-label -->
<input
  type="email"
  aria-label="Email Address"
  placeholder="you@example.com"
>
```

---

### Issue 4: Poor Focus Management
```javascript
// ❌ Problem: Focus lost when modal opens
function openModal() {
  document.getElementById('modal').style.display = 'block';
}

// ✅ Solution: Manage focus properly
function openModal() {
  const modal = document.getElementById('modal');
  const previouslyFocused = document.activeElement;

  modal.style.display = 'block';
  modal.querySelector('button').focus(); // Focus first button

  // Trap focus within modal
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      trapFocus(modal, e);
    }
  });

  // Restore focus on close
  modal.dataset.previousFocus = previouslyFocused;
}

function closeModal() {
  const modal = document.getElementById('modal');
  modal.style.display = 'none';

  // Restore focus
  const previousFocus = document.querySelector(modal.dataset.previousFocus);
  if (previousFocus) previousFocus.focus();
}
```

---

## Using with QE Agents

### qe-accessibility-validator: Automated Compliance

```typescript
// Agent runs comprehensive a11y validation
const a11yResults = await agent.validateAccessibility({
  url: 'https://example.com/checkout',
  standard: 'WCAG2.2',
  level: 'AA',
  includeScreenReaderSimulation: true
});

// Returns:
// {
//   score: 0.92,
//   violations: [
//     { rule: 'color-contrast', severity: 'serious', count: 3 },
//     { rule: 'label', severity: 'critical', count: 1 }
//   ],
//   passes: 47,
//   incomplete: 2,
//   screenReaderReport: {
//     navigation: 'good',
//     formLabels: 'needs-improvement',
//     landmarkStructure: 'excellent'
//   }
// }
```

---

### qe-visual-tester: Keyboard & Focus Testing

```typescript
// Agent validates focus indicators
await agent.visualA11yTest({
  page: '/signup',
  checks: ['focus-visible', 'keyboard-navigation', 'tab-order'],
  generateReport: true
});

// Captures screenshots of:
// - Focus states for all interactive elements
// - Tab order visualization
// - Keyboard navigation paths
```

---

### Fleet Coordination for Comprehensive A11y

```typescript
const a11yFleet = await FleetManager.coordinate({
  strategy: 'comprehensive-accessibility',
  agents: [
    'qe-accessibility-validator',  // Automated scanning
    'qe-visual-tester',            // Visual & keyboard checks
    'qe-test-generator',           // Generate a11y tests
    'qe-quality-gate'              // Enforce compliance
  ]
});

await a11yFleet.execute({
  target: 'production-candidate',
  wcagLevel: 'AA',
  failOn: 'critical-violations',
  generateRemediationGuide: true
});
```

---

## Related Skills

**Core Testing:**
- [agentic-quality-engineering](../agentic-quality-engineering/) - Agent-driven a11y testing
- [regression-testing](../regression-testing/) - A11y in regression suite
- [visual-testing-advanced](../visual-testing-advanced/) - Visual a11y checks

**Specialized Testing:**
- [mobile-testing](../mobile-testing/) - Mobile a11y (VoiceOver, TalkBack)
- [compatibility-testing](../compatibility-testing/) - Cross-browser a11y
- [compliance-testing](../compliance-testing/) - Legal compliance (ADA)

---

## Remember

**Accessibility is a legal requirement, not a nice-to-have.**

- 1 billion people with disabilities globally
- $13 trillion purchasing power
- 250%+ increase in lawsuits (2019-2024)
- ADA, Section 508, EU regulations enforced

**Automated testing catches only 30-50% of issues.**

Combine automated scans with:
- Manual keyboard testing
- Screen reader testing
- Real user testing with people with disabilities

**Shift accessibility left:**
- Design with accessibility in mind
- Develop with semantic HTML + ARIA
- Test throughout development (not at the end)
- Include a11y in definition of done

**With Agents:** `qe-accessibility-validator` automates WCAG 2.2 compliance checking, screen reader simulation, and focus management validation. Use agents to enforce accessibility standards in CI/CD and catch violations before production.

# University of Aveiro - Accessibility Testing Checklist
**Version:** 1.0
**Date:** 2025-12-10
**Standard:** WCAG 2.2 Level AA

## Quick Start Testing Guide

### Required Tools

#### Free Tools (Download First)
- [ ] Chrome browser with DevTools
- [ ] Firefox with accessibility inspector
- [ ] NVDA screen reader (Windows) - https://www.nvaccess.org/download/
- [ ] axe DevTools browser extension - https://www.deque.com/axe/devtools/
- [ ] WAVE browser extension - https://wave.webaim.org/extension/
- [ ] Color Contrast Analyzer - https://www.tpgi.com/color-contrast-checker/

#### Paid Tools (Optional)
- [ ] JAWS screen reader (Windows) - https://www.freedomscientific.com/products/software/jaws/
- [ ] Dragon NaturallySpeaking (voice control)

---

## Testing Workflow

### Step 1: Automated Testing (30 minutes)

#### Axe DevTools Scan
```bash
1. Install axe DevTools extension in Chrome
2. Navigate to https://www.ua.pt
3. Open Chrome DevTools (F12)
4. Click "axe DevTools" tab
5. Click "Scan ALL of my page"
6. Review violations by impact (Critical → Minor)
7. Export report as JSON/CSV
```

**Expected Results:**
- 30-40 violations detected
- Critical: 5-8 issues
- Serious: 10-15 issues
- Moderate: 10-15 issues
- Minor: 5-10 issues

**Key Violations to Document:**
- [ ] Color contrast failures
- [ ] Missing form labels
- [ ] Missing landmarks
- [ ] Missing heading hierarchy
- [ ] Focus indicator issues

---

#### WAVE Scan
```bash
1. Install WAVE extension in Chrome/Firefox
2. Navigate to https://www.ua.pt
3. Click WAVE icon in toolbar
4. Review Errors (red icons)
5. Review Alerts (yellow icons)
6. Review Features (green icons)
7. Click "Details" tab for full report
```

**Expected Results:**
- Errors: 10-15
- Alerts: 20-30
- Features: 5-10
- Structural Elements: Review landmark structure

**Key Checks:**
- [ ] Missing alternative text
- [ ] Empty links
- [ ] Missing form labels
- [ ] Low contrast text
- [ ] Redundant links

---

#### Lighthouse Audit
```bash
1. Open Chrome DevTools (F12)
2. Click "Lighthouse" tab
3. Select "Accessibility" checkbox
4. Click "Analyze page load"
5. Review score and detailed issues
```

**Expected Score:** 65-75/100

**Key Metrics:**
- [ ] Contrast failures
- [ ] ARIA usage
- [ ] Navigation landmarks
- [ ] Heading order
- [ ] Image alt text

---

### Step 2: Keyboard Navigation Testing (20 minutes)

#### Basic Keyboard Test
```bash
1. Navigate to https://www.ua.pt
2. Press Tab repeatedly (don't use mouse)
3. Count number of tabs to reach main content
4. Verify focus indicator is visible on every element
5. Test all interactive elements
```

**Checklist:**

| Element | Test | Expected | Pass/Fail |
|---------|------|----------|-----------|
| Skip link | Tab once from page load | Visible skip link appears | ⬜ |
| Logo | Tab to logo link | Focus visible | ⬜ |
| Navigation | Tab through all nav items | All reachable | ⬜ |
| Search | Tab to search input | Focus visible, cursor in input | ⬜ |
| Language switcher | Tab to PT/EN toggle | Both options reachable | ⬜ |
| Dropdown menus | Arrow keys navigate | Up/down work | ⬜ |
| Modal/Dialog | Esc key closes | Focus returns to trigger | ⬜ |
| Forms | Tab through all inputs | All reachable, labels read | ⬜ |
| Buttons | Enter/Space activates | Action triggered | ⬜ |
| Links | Enter activates | Page navigates | ⬜ |

**Specific Tests:**

1. **Skip Navigation Link**
   ```
   - [ ] Press Tab once from page load
   - [ ] Verify "Saltar para o conteúdo principal" appears
   - [ ] Press Enter
   - [ ] Verify focus moves to main content
   ```

2. **OneTrust Cookie Consent**
   ```
   - [ ] Clear cookies and reload page
   - [ ] Verify banner appears
   - [ ] Tab through all buttons
   - [ ] Verify focus indicator visible
   - [ ] Press Enter on "Accept" button
   - [ ] Verify banner closes
   - [ ] Verify focus returns to page
   - [ ] Test Esc key closes banner (if applicable)
   ```

3. **Mobile Menu (Hamburger)**
   ```
   - [ ] Resize browser to mobile width (<768px)
   - [ ] Tab to menu button
   - [ ] Press Enter to open
   - [ ] Verify menu opens
   - [ ] Tab through menu items
   - [ ] Press Esc to close
   - [ ] Verify menu closes and focus returns
   ```

4. **Search Functionality**
   ```
   - [ ] Tab to search input
   - [ ] Type search query
   - [ ] Press Enter
   - [ ] Verify results appear
   - [ ] Tab to first result
   - [ ] Verify focus visible
   ```

---

### Step 3: Screen Reader Testing (45 minutes)

#### NVDA (Windows) Basic Test

**Setup:**
```bash
1. Download NVDA: https://www.nvaccess.org/download/
2. Install and restart computer
3. Press Ctrl+Alt+N to start NVDA
4. Navigate to https://www.ua.pt
```

**Essential Keyboard Shortcuts:**
| Key | Action |
|-----|--------|
| `H` | Next heading |
| `Shift+H` | Previous heading |
| `D` | Next landmark |
| `Shift+D` | Previous landmark |
| `K` | Next link |
| `F` | Next form field |
| `B` | Next button |
| `T` | Next table |
| `L` | Next list |
| `Insert+F7` | Elements list (all headings/links) |
| `Insert+Down` | Read current line |
| `Insert+Up` | Read from top |
| `Ctrl` | Stop reading |

**Test Checklist:**

1. **Page Title & Language**
   ```
   - [ ] NVDA announces page title on load
   - [ ] Title is "Universidade de Aveiro - Página Inicial" (not duplicated)
   - [ ] Portuguese voice used (verify lang="pt")
   ```

2. **Landmark Navigation**
   ```
   - [ ] Press D to navigate landmarks
   - [ ] Verify "banner" (header) landmark exists
   - [ ] Verify "navigation" landmark exists
   - [ ] Verify "main" landmark exists
   - [ ] Verify "contentinfo" (footer) landmark exists
   - [ ] Press D through all landmarks and count total
   ```

   **Expected:** 4-6 landmarks minimum

3. **Heading Structure**
   ```
   - [ ] Press Insert+F7 to open Elements List
   - [ ] Select "Headings" tab
   - [ ] Verify logical hierarchy (H1 → H2 → H3, no skips)
   - [ ] Verify H1 is "Página Inicial" or site title
   - [ ] Close list and press H to navigate headings
   ```

   **Expected Structure:**
   ```
   H1: Universidade de Aveiro
     H2: Section 1 Title
       H3: Subsection
     H2: Section 2 Title
       H3: Subsection
   ```

4. **Link Testing**
   ```
   - [ ] Press K to jump between links
   - [ ] Verify all links have descriptive text
   - [ ] Verify no "Click here" or "Read more" without context
   - [ ] Press Insert+F7 → Links tab
   - [ ] Review link list for clarity
   ```

5. **Form Testing**
   ```
   - [ ] Press F to jump to search input
   - [ ] Verify NVDA reads: "Pesquisar, edit, blank"
   - [ ] Verify label is announced
   - [ ] Type text and verify reading
   - [ ] Tab to submit button
   - [ ] Verify button name announced
   ```

6. **Image Testing**
   ```
   - [ ] Navigate to images on page
   - [ ] Verify NVDA announces alt text
   - [ ] Check for "Image, unlabeled" (missing alt)
   - [ ] Verify decorative images are ignored
   ```

7. **Dynamic Content**
   ```
   - [ ] Trigger search or filter
   - [ ] Verify results announce automatically
   - [ ] Check for "Loading" announcement
   - [ ] Verify ARIA live regions work
   ```

**Common Issues to Document:**
- [ ] Missing landmarks (uses only divs)
- [ ] No skip link announced
- [ ] Heading hierarchy broken (H1 → H3 skip)
- [ ] Forms without labels
- [ ] Images without alt text
- [ ] Links with unclear text
- [ ] Dynamic content not announced

---

#### VoiceOver (macOS/iOS) Basic Test

**Setup (macOS):**
```bash
1. Press Cmd+F5 to enable VoiceOver
2. Navigate to https://www.ua.pt in Safari
```

**Essential Keyboard Shortcuts (macOS):**
| Key | Action |
|-----|--------|
| `VO` = `Ctrl+Option` | VoiceOver modifier |
| `VO+Right` | Next item |
| `VO+Left` | Previous item |
| `VO+Cmd+H` | Next heading |
| `VO+Cmd+J` | Next landmark |
| `VO+Cmd+L` | Next link |
| `VO+U` | Rotor (elements list) |
| `Ctrl` | Stop reading |

**Test Checklist:**
- [ ] Repeat NVDA tests above with VoiceOver shortcuts
- [ ] Verify Safari/VoiceOver compatibility
- [ ] Test iOS VoiceOver on iPhone/iPad

---

### Step 4: Color Contrast Testing (15 minutes)

#### Manual Spot Checks

**Tool:** TPGi Color Contrast Analyzer

**Test These Combinations:**

| Element | Foreground | Background | Test | Pass/Fail |
|---------|------------|------------|------|-----------|
| Body text | #000000 | #FFFFFF | Should be 21:1 | ⬜ |
| Secondary text | #656565 | #FFFFFF | Should be 5.74:1 ✅ | ⬜ |
| Tertiary text | #848484 | #FFFFFF | Should FAIL (3.54:1) | ⬜ |
| Links | #00AFBB | #FFFFFF | Should FAIL (3.01:1) | ⬜ |
| Focus outline | #91D300 | #FFFFFF | Should FAIL (1.85:1) | ⬜ |
| Buttons | [Check live] | [Check live] | Must be 4.5:1 | ⬜ |
| Navigation | [Check live] | [Check live] | Must be 4.5:1 | ⬜ |

**Steps:**
```bash
1. Open Color Contrast Analyzer app
2. Use eyedropper tool to select foreground color
3. Use eyedropper tool to select background color
4. Read contrast ratio
5. Check against WCAG AA (4.5:1) and AAA (7:1)
```

**Automated Color Test:**
```bash
# Using browser DevTools
1. Open Chrome DevTools (F12)
2. Click Elements tab
3. Inspect any text element
4. Hover over color value in Styles panel
5. View contrast ratio (shows ✓ or ✗)
```

---

#### Batch Color Testing

**Using axe DevTools:**
```bash
1. Run axe scan (Step 1)
2. Filter violations by "color-contrast"
3. Review all instances
4. Click each violation to see element
5. Document specific instances
```

**Expected Failures:**
- [ ] ~10-15 instances of low contrast text
- [ ] Focus indicators with insufficient contrast
- [ ] Button text with low contrast
- [ ] Link text with low contrast

---

### Step 5: Mobile Accessibility Testing (30 minutes)

#### Responsive Breakpoint Testing

**Test These Viewports:**

| Device | Width | Height | Test |
|--------|-------|--------|------|
| iPhone SE | 375px | 667px | ⬜ |
| iPhone 12/13 | 390px | 844px | ⬜ |
| Samsung Galaxy S21 | 360px | 800px | ⬜ |
| iPad Mini | 768px | 1024px | ⬜ |
| iPad Pro | 1024px | 1366px | ⬜ |

**Chrome DevTools Mobile Emulation:**
```bash
1. Open Chrome DevTools (F12)
2. Click "Toggle device toolbar" (Ctrl+Shift+M)
3. Select device from dropdown
4. Test each viewport
```

**Checklist per Viewport:**

1. **Layout & Reflow**
   ```
   - [ ] No horizontal scrolling
   - [ ] All content visible
   - [ ] Text readable without zooming
   - [ ] Images scale appropriately
   - [ ] Forms fit viewport
   ```

2. **Touch Target Sizes**
   ```
   - [ ] Measure button sizes (must be 44×44px minimum)
   - [ ] Measure link sizes
   - [ ] Test input field sizes
   - [ ] Test checkbox/radio sizes
   - [ ] Ensure adequate spacing between targets
   ```

   **Measurement Tool:**
   ```bash
   1. Right-click element → Inspect
   2. Check "Computed" tab in DevTools
   3. Verify width/height ≥ 44px
   ```

3. **Mobile Navigation**
   ```
   - [ ] Hamburger menu accessible
   - [ ] Menu button has accessible name
   - [ ] Menu opens/closes correctly
   - [ ] Focus trapped in open menu
   - [ ] Esc key closes menu
   - [ ] Focus returns after close
   ```

4. **Zoom Testing**
   ```
   - [ ] Set zoom to 200% (Ctrl +)
   - [ ] Verify no horizontal scroll
   - [ ] Verify all content reflows
   - [ ] Test at 300% zoom
   - [ ] Test at 400% zoom (AAA)
   ```

5. **OneTrust Mobile**
   ```
   - [ ] Cookie banner fits viewport
   - [ ] All buttons accessible
   - [ ] Banner dismissible
   - [ ] Doesn't permanently obscure content
   ```

---

#### Real Device Testing

**iOS (iPhone/iPad):**
```bash
1. Enable VoiceOver: Settings → Accessibility → VoiceOver
2. Navigate to https://www.ua.pt in Safari
3. Swipe right to navigate elements
4. Double-tap to activate
5. Three-finger swipe to scroll
```

**Checklist:**
- [ ] VoiceOver announces all elements
- [ ] Gestures work correctly
- [ ] Focus visible on swipe
- [ ] Forms usable with VoiceOver
- [ ] Zoom works (pinch gesture)

**Android (Samsung/Pixel):**
```bash
1. Enable TalkBack: Settings → Accessibility → TalkBack
2. Navigate to https://www.ua.pt in Chrome
3. Swipe right to navigate
4. Double-tap to activate
```

**Checklist:**
- [ ] TalkBack announces all elements
- [ ] Gestures work correctly
- [ ] Focus visible on swipe
- [ ] Forms usable with TalkBack

---

### Step 6: SPA (React) Specific Testing (20 minutes)

#### Route Change Testing

**Test Scenario:**
```bash
1. Navigate to homepage (www.ua.pt)
2. Enable NVDA screen reader
3. Click navigation link to another page
4. Observe screen reader announcement
```

**Checklist:**
- [ ] Screen reader announces page change
- [ ] Focus moves to main content (not header)
- [ ] Page title updates in browser tab
- [ ] Browser back button works correctly
- [ ] Forward button works correctly
- [ ] URL updates correctly

**Expected Behavior:**
```
✅ GOOD: "Navigated to [Page Title], main landmark"
❌ BAD: [Silence - no announcement]
```

---

#### Loading State Testing

**Test Scenario:**
```bash
1. Navigate to page with async content
2. Observe loading skeleton
3. Observe content replacement
```

**Checklist:**
- [ ] Loading state announced to screen reader
- [ ] Skeleton has aria-hidden="true"
- [ ] ARIA live region announces "Loading..."
- [ ] ARIA live region announces "Content loaded"
- [ ] No animation triggers (prefers-reduced-motion)

**Expected Announcements:**
```
✅ GOOD: "Loading content... [pause] Content loaded"
❌ BAD: [Silence]
```

---

#### Focus Management Testing

**Test Scenario:**
```bash
1. Open modal/dialog
2. Tab through elements
3. Close modal
```

**Checklist:**
- [ ] Focus moves to modal on open
- [ ] Tab cycles within modal only (focus trap)
- [ ] Shift+Tab reverse cycles
- [ ] Esc key closes modal
- [ ] Focus returns to trigger element
- [ ] Background content inert (aria-hidden="true")

---

### Step 7: Form Accessibility Testing (15 minutes)

#### Search Form Test

**Location:** Header search input

**Checklist:**
- [ ] Label associated with input (visible or aria-label)
- [ ] Placeholder text present (not a substitute for label)
- [ ] Focus indicator visible
- [ ] Enter key submits form
- [ ] Screen reader announces label + role + state
- [ ] Error states announced
- [ ] Success states announced

**Screen Reader Test:**
```bash
1. Tab to search input
2. Verify announcement: "Search, edit, blank" or similar
3. Type text
4. Verify characters read aloud
5. Submit form
6. Verify results announced
```

---

#### Contact Form Test (if present)

**Checklist per field:**

| Field | Label Present | Error Handling | Required Indicated | Pass/Fail |
|-------|---------------|----------------|-------------------|-----------|
| Name | ⬜ | ⬜ | ⬜ | ⬜ |
| Email | ⬜ | ⬜ | ⬜ | ⬜ |
| Subject | ⬜ | ⬜ | ⬜ | ⬜ |
| Message | ⬜ | ⬜ | ⬜ | ⬜ |

**Error Handling Test:**
```bash
1. Submit form with empty required fields
2. Verify error messages displayed
3. Verify errors announced by screen reader
4. Verify focus moves to first error
5. Verify ARIA invalid state (aria-invalid="true")
6. Verify ARIA described by error (aria-describedby="error-id")
```

---

### Step 8: Video/Audio Testing (if applicable)

**Checklist:**
- [ ] Video player keyboard accessible
- [ ] Play/pause with Space or Enter
- [ ] Captions available
- [ ] Captions toggle accessible
- [ ] Volume controls accessible
- [ ] Full screen toggle accessible
- [ ] Transcript provided (AAA)
- [ ] Audio description available (AA for prerecorded)

---

## Issue Documentation Template

### Issue Report Format

```markdown
## Issue #[NUMBER]: [Brief Description]

**WCAG Criterion:** [e.g., 1.4.3 Contrast (Minimum)]
**Level:** [A / AA / AAA]
**Severity:** [Critical / High / Medium / Low]

**Location:** [URL + specific element]
**Browser/Device:** [Chrome 120 / iPhone 13 iOS 17]

**Current Behavior:**
[What happens now]

**Expected Behavior:**
[What should happen per WCAG]

**How to Reproduce:**
1. Navigate to [URL]
2. [Step 2]
3. [Step 3]

**Evidence:**
- Screenshot: [path/to/screenshot.png]
- Video: [path/to/video.mp4] (if applicable)
- Code snippet:
```html
<button>Click Here</button> <!-- Missing accessible name -->
```

**Contrast Ratio:** [If color issue]
- Foreground: #848484
- Background: #FFFFFF
- Ratio: 3.54:1
- Required: 4.5:1
- Gap: -0.96:1

**Impact:**
- [ ] Screen reader users
- [ ] Keyboard users
- [ ] Low vision users
- [ ] Color blind users
- [ ] Motor impairment users
- [ ] Cognitive disability users

**Users Affected:** [e.g., 15-20% of users]

**Recommendation:**
[Specific fix with code example]

**Priority:** [P0 / P1 / P2 / P3]
**Effort:** [Low / Medium / High]
**Target Sprint:** [Sprint number]
```

---

## Example Issue Reports

### Example 1: Missing Skip Link

```markdown
## Issue #1: Missing Skip Navigation Link

**WCAG Criterion:** 2.4.1 Bypass Blocks
**Level:** A
**Severity:** High

**Location:** https://www.ua.pt (all pages)
**Browser/Device:** All

**Current Behavior:**
Keyboard users must tab through 25+ header/navigation elements before reaching main content.

**Expected Behavior:**
"Skip to main content" link should be first focusable element.

**How to Reproduce:**
1. Navigate to https://www.ua.pt
2. Press Tab key once
3. Observe no skip link appears

**Evidence:**
- Tab count to main content: 27 tabs
- Expected: 1 tab (skip link) → Enter → main content

**Impact:**
- [x] Keyboard users
- [x] Screen reader users
- [ ] Low vision users
- [ ] Color blind users
- [ ] Motor impairment users
- [ ] Cognitive disability users

**Users Affected:** 10-15% of users

**Recommendation:**
Add skip link as first element in <body>:

```html
<a href="#main" class="skip-link">Saltar para o conteúdo principal</a>

<style>
.skip-link {
  position: absolute;
  left: -9999px;
}
.skip-link:focus {
  left: 0;
  top: 0;
  z-index: 9999;
  background: #000;
  color: #fff;
  padding: 1rem;
}
</style>
```

**Priority:** P0 (Critical)
**Effort:** Low (1 hour)
**Target Sprint:** Current sprint
```

---

### Example 2: Color Contrast Failure

```markdown
## Issue #2: Tertiary Text Low Contrast

**WCAG Criterion:** 1.4.3 Contrast (Minimum)
**Level:** AA
**Severity:** High

**Location:** https://www.ua.pt (site-wide)
**Browser/Device:** All

**Current Behavior:**
Light gray text (#848484) on white background has insufficient contrast.

**Expected Behavior:**
Text contrast must be at least 4.5:1 for normal text.

**How to Reproduce:**
1. Navigate to https://www.ua.pt
2. Inspect any secondary/tertiary text element
3. Measure contrast ratio

**Evidence:**
- Foreground: #848484
- Background: #FFFFFF
- Current Ratio: 3.54:1 ❌
- Required: 4.5:1
- Gap: -0.96:1 (21% below threshold)

**Impact:**
- [ ] Screen reader users
- [ ] Keyboard users
- [x] Low vision users
- [x] Color blind users
- [ ] Motor impairment users
- [x] Aging users

**Users Affected:** 15-20% of users

**Recommendation:**
Change color to #767676 (minimal visual impact):

```css
/* Before */
.tertiary-text {
  color: #848484; /* 3.54:1 ❌ */
}

/* After */
.tertiary-text {
  color: #767676; /* 4.54:1 ✅ */
}
```

**Priority:** P0 (Critical)
**Effort:** Low (2 hours - global CSS change)
**Target Sprint:** Current sprint
```

---

## Testing Schedule Recommendation

### Week 1: Foundation
- [ ] Monday: Set up tools, run automated scans
- [ ] Tuesday: Document all critical issues
- [ ] Wednesday: Keyboard navigation testing
- [ ] Thursday: Color contrast audit
- [ ] Friday: Issue prioritization meeting

### Week 2: Manual Testing
- [ ] Monday: Screen reader testing (NVDA)
- [ ] Tuesday: Screen reader testing (VoiceOver)
- [ ] Wednesday: Mobile testing (iOS)
- [ ] Thursday: Mobile testing (Android)
- [ ] Friday: SPA/React testing

### Week 3: Validation
- [ ] Monday: Fix critical issues
- [ ] Tuesday: Retest fixed issues
- [ ] Wednesday: User testing prep
- [ ] Thursday-Friday: User testing with disabled participants

### Week 4: Reporting
- [ ] Monday-Tuesday: Compile final report
- [ ] Wednesday: Present findings to stakeholders
- [ ] Thursday: Create remediation roadmap
- [ ] Friday: Sprint planning for fixes

---

## Success Criteria

### Minimum Viable Accessibility (MVA)

**Must Fix Before Launch:**
- [ ] All critical (P0) issues resolved
- [ ] Color contrast meets WCAG AA
- [ ] Skip navigation link implemented
- [ ] All forms have labels
- [ ] Keyboard navigation works
- [ ] Screen reader announces key content
- [ ] Mobile touch targets ≥ 44×44px

**Target Metrics:**
- Lighthouse Accessibility Score: ≥ 90/100
- axe DevTools: 0 critical violations
- WAVE: 0 errors
- Manual test pass rate: ≥ 95%

---

## Resources

### Official Standards
- WCAG 2.2: https://www.w3.org/WAI/WCAG22/quickref/
- ARIA Authoring Practices: https://www.w3.org/WAI/ARIA/apg/
- EU Directive 2016/2102: https://eur-lex.europa.eu/eli/dir/2016/2102/oj

### Testing Tools
- axe DevTools: https://www.deque.com/axe/devtools/
- WAVE: https://wave.webaim.org/
- NVDA: https://www.nvaccess.org/
- Color Contrast Analyzer: https://www.tpgi.com/color-contrast-checker/
- Pa11y: https://pa11y.org/

### Learning Resources
- WebAIM: https://webaim.org/
- A11y Project: https://www.a11yproject.com/
- Inclusive Components: https://inclusive-components.design/
- Smashing Magazine A11y: https://www.smashingmagazine.com/category/accessibility

---

**Document Version:** 1.0
**Last Updated:** 2025-12-10
**Author:** QE Visual Tester Agent
**Review Cycle:** Quarterly

**Next Steps:**
1. Print this checklist
2. Schedule testing sessions
3. Assign testers to each section
4. Document all findings
5. Create remediation plan

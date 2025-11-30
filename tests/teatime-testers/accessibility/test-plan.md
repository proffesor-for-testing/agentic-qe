# Accessibility Testing Plan
## Tea Time with Testers Website

**Version:** 1.0
**Date:** November 30, 2025
**Testing Standard:** WCAG 2.1 Level AA

---

## Testing Scope

### In Scope
- Homepage (https://teatimewithtesters.com/)
- Navigation and menus
- Newsletter signup form
- Article listing and cards
- Social media links
- Responsive design (mobile/tablet/desktop)

### Out of Scope (Future Testing)
- Individual article pages
- Magazine archive pages
- Contact form submission
- Search functionality
- User account features (if any)

---

## Testing Methodology

### 1. Automated Testing (30% of coverage)

#### Tools Used
- **axe-core CLI** - Comprehensive WCAG violation detection
- **Lighthouse** - Chrome DevTools accessibility audit
- **WAVE** - Visual accessibility checker
- **Pa11y** - Command-line accessibility testing

#### Test Execution
```bash
# axe-core automated scan
npx @axe-core/cli https://teatimewithtesters.com/ \
  --timeout 30000 \
  --save results/axe-results.json

# Lighthouse audit
lighthouse https://teatimewithtesters.com/ \
  --only-categories=accessibility \
  --output=json \
  --output-path=results/lighthouse-a11y.json

# Pa11y testing
pa11y https://teatimewithtesters.com/ \
  --standard WCAG2AA \
  --reporter json > results/pa11y-results.json

# WAVE API (if available)
curl "https://wave.webaim.org/api/request?key=YOUR_KEY&url=https://teatimewithtesters.com/" \
  > results/wave-results.json
```

---

### 2. Manual Testing (70% of coverage)

#### A. Keyboard Navigation Testing

**Test Scenario 1: Tab Navigation**
- [ ] Start at top of page (address bar)
- [ ] Press Tab key repeatedly
- [ ] Verify focus moves in logical order (top to bottom, left to right)
- [ ] Check all interactive elements receive focus
- [ ] Verify no keyboard traps (can always tab forward/backward)
- [ ] Confirm skip link appears on first Tab press
- [ ] Test skip link works (jumps to main content)

**Test Scenario 2: Focus Indicators**
- [ ] Verify all focused elements have visible indicators
- [ ] Check focus indicator has 3:1 contrast ratio
- [ ] Ensure focus indicator is at least 2px thick
- [ ] Test focus not hidden by overlapping elements

**Test Scenario 3: Interactive Elements**
- [ ] Test all links with Enter key
- [ ] Test all buttons with Space and Enter keys
- [ ] Test form submission with Enter key
- [ ] Test form fields with Tab navigation
- [ ] Verify no reliance on hover-only interactions

**Test Scenario 4: Keyboard Shortcuts**
- [ ] Document any keyboard shortcuts present
- [ ] Verify shortcuts don't conflict with assistive tech
- [ ] Check shortcuts can be disabled or remapped

**Pass Criteria:**
- All interactive elements reachable via keyboard
- Focus order follows visual layout
- No keyboard traps present
- Skip link functional
- Focus indicators visible and high contrast

---

#### B. Screen Reader Testing

**Testing Tools:**
- NVDA (Windows - Free)
- JAWS (Windows - Commercial)
- VoiceOver (macOS - Built-in)

**Test Scenario 1: Page Structure (NVDA/JAWS)**
- [ ] Press H to navigate by headings
- [ ] Verify heading hierarchy (h1 → h2 → h3, no skips)
- [ ] Press D to navigate by landmarks
- [ ] Confirm landmarks announced correctly (navigation, main, footer)
- [ ] Test R for landmark regions
- [ ] Verify only one `<h1>` on page

**Test Scenario 2: Links and Navigation**
- [ ] Press Insert+F7 for links list
- [ ] Verify all links have descriptive text
- [ ] Check no "click here" or "read more" without context
- [ ] Test K to navigate by links
- [ ] Confirm current page indicated (aria-current)

**Test Scenario 3: Images**
- [ ] Press G to navigate by graphics
- [ ] Verify all images have alt text
- [ ] Check decorative images marked as presentation
- [ ] Test social media icons have descriptive labels
- [ ] Confirm complex images have long descriptions

**Test Scenario 4: Forms**
- [ ] Navigate to newsletter signup form
- [ ] Press F to jump to form fields
- [ ] Verify all fields have labels announced
- [ ] Check required fields indicated
- [ ] Test error messages read aloud
- [ ] Confirm success messages announced (ARIA live)

**Test Scenario 5: Dynamic Content**
- [ ] Interact with any dynamic elements
- [ ] Verify ARIA live regions announce changes
- [ ] Check loading states announced
- [ ] Test modal dialogs trap focus correctly

**VoiceOver-Specific Tests (macOS/iOS):**
- [ ] Enable VoiceOver (Cmd+F5)
- [ ] Use VO+U to open rotor
- [ ] Test heading navigation
- [ ] Verify landmark navigation
- [ ] Test form control navigation
- [ ] Check gesture support on iOS (swipe left/right)

**Pass Criteria:**
- All content accessible via screen reader
- Headings follow logical hierarchy
- Landmarks properly identified
- Images have descriptive alt text
- Forms fully labeled and announced
- Dynamic content updates announced

---

#### C. Color Contrast Testing

**Test Scenario 1: Text Contrast**
- [ ] Use browser DevTools color picker on all text
- [ ] Calculate contrast ratios (WebAIM Contrast Checker)
- [ ] Verify normal text meets 4.5:1 minimum
- [ ] Verify large text (18pt+) meets 3:1 minimum
- [ ] Check link text has sufficient contrast
- [ ] Test secondary text (dates, metadata) for 4.5:1

**Test Scenario 2: Non-Text Contrast**
- [ ] Measure form field border contrast (3:1 minimum)
- [ ] Check button borders and backgrounds
- [ ] Test focus indicator contrast (3:1 minimum)
- [ ] Verify icon contrast against backgrounds
- [ ] Check hover/active states maintain contrast

**Test Scenario 3: Color Alone**
- [ ] Verify information not conveyed by color alone
- [ ] Check links distinguishable without color (underline, icon)
- [ ] Test form errors have text indicators
- [ ] Confirm charts/graphs have patterns or labels

**Testing Tools:**
- Chrome DevTools Color Picker
- WebAIM Contrast Checker
- Colour Contrast Analyser (CCA)
- axe DevTools browser extension

**Pass Criteria:**
- Normal text: 4.5:1 contrast ratio
- Large text: 3:1 contrast ratio
- UI components: 3:1 contrast ratio
- Focus indicators: 3:1 contrast ratio
- Information not color-dependent

---

#### D. Responsive & Mobile Testing

**Test Scenario 1: Zoom Testing**
- [ ] Zoom to 200% (Cmd/Ctrl + +)
- [ ] Verify no horizontal scrolling
- [ ] Check all content remains visible
- [ ] Test at 400% zoom (WCAG 2.1 Level AA)
- [ ] Confirm content reflows properly

**Test Scenario 2: Mobile Testing (iPhone/Android)**
- [ ] Test on iPhone Safari (iOS VoiceOver)
- [ ] Test on Chrome/Firefox Mobile
- [ ] Test on Android (TalkBack)
- [ ] Verify touch targets ≥ 44x44px
- [ ] Check pinch-to-zoom enabled
- [ ] Test orientation changes (portrait/landscape)

**Test Scenario 3: Viewport Testing**
- [ ] Test at 320px width (small mobile)
- [ ] Test at 768px width (tablet)
- [ ] Test at 1024px width (desktop)
- [ ] Test at 1920px width (large desktop)
- [ ] Verify no content hidden at any size

**Pass Criteria:**
- Content reflows at 400% zoom
- No horizontal scrolling needed
- Touch targets ≥ 44x44px
- Zoom not disabled
- Orientation not locked

---

#### E. Form Testing

**Test Scenario 1: Newsletter Signup**
- [ ] Locate form with screen reader (F key)
- [ ] Verify label announced for email field
- [ ] Check required field indicated (aria-required)
- [ ] Submit empty form - test error message
- [ ] Submit invalid email - test error format
- [ ] Verify error associated with field (aria-describedby)
- [ ] Submit valid email - test success message
- [ ] Check success announced (ARIA live region)

**Test Scenario 2: Keyboard Navigation**
- [ ] Tab to email field
- [ ] Type email address
- [ ] Tab to submit button
- [ ] Press Enter to submit
- [ ] Verify focus management after submission

**Test Scenario 3: Autocomplete**
- [ ] Check email field has autocomplete="email"
- [ ] Verify browser autofill suggestions appear
- [ ] Test with password manager (if applicable)

**Pass Criteria:**
- All fields have visible labels
- Required fields indicated
- Error messages descriptive
- Errors associated with fields (aria-describedby)
- Success announced via ARIA live
- Form submittable via keyboard

---

## Test Execution Schedule

### Week 1: Automated Testing
- Day 1: Set up testing tools
- Day 2: Run axe-core, Lighthouse, Pa11y, WAVE
- Day 3: Analyze automated results
- Day 4: Document automated findings
- Day 5: Create remediation priorities

### Week 2: Manual Testing
- Day 1-2: Keyboard navigation testing
- Day 3: Screen reader testing (NVDA)
- Day 4: Screen reader testing (JAWS/VoiceOver)
- Day 5: Color contrast testing

### Week 3: Mobile & Responsive Testing
- Day 1-2: Mobile device testing (iOS/Android)
- Day 3: Zoom and reflow testing
- Day 4: Touch target measurements
- Day 5: Final validation and reporting

---

## Test Environment

### Desktop Browsers
- Chrome 120+ (with axe DevTools)
- Firefox 120+ (with WAVE)
- Safari 17+ (macOS)
- Edge 120+

### Screen Readers
- NVDA 2023.3+ (Windows + Firefox)
- JAWS 2024+ (Windows + Chrome)
- VoiceOver (macOS 14+ + Safari)

### Mobile Devices
- iPhone 12+ (iOS 17+ + Safari + VoiceOver)
- Samsung Galaxy S22+ (Android 13+ + Chrome + TalkBack)
- iPad Pro (iPadOS 17+ + Safari + VoiceOver)

### Testing Tools
- axe DevTools browser extension
- WAVE browser extension
- Chrome DevTools Lighthouse
- WebAIM Contrast Checker
- Colour Contrast Analyser (CCA)

---

## Pass/Fail Criteria

### Critical (Must Pass)
- ✅ All interactive elements keyboard accessible
- ✅ Skip navigation link present and functional
- ✅ Heading hierarchy logical (no skips)
- ✅ Semantic landmarks present (nav, main, footer)
- ✅ All images have alt text
- ✅ All form fields have labels
- ✅ Color contrast ≥ 4.5:1 for normal text

### Serious (Should Pass)
- ✅ ARIA attributes correct on custom components
- ✅ Focus indicators visible (3:1 contrast)
- ✅ Form errors descriptive and associated
- ✅ Content reflows at 400% zoom
- ✅ Touch targets ≥ 44x44px on mobile

### Moderate (Nice to Pass)
- ✅ Autocomplete attributes on form inputs
- ✅ ARIA live regions for dynamic content
- ✅ No images of text (use CSS instead)
- ✅ Consistent navigation across pages

---

## Bug Reporting Template

### Accessibility Defect Report

**Bug ID:** A11Y-001
**Severity:** Critical | Serious | Moderate | Minor
**WCAG SC:** 2.4.1 (Level A)
**Principle:** Operable

**Title:** Missing skip navigation link

**Description:**
The website lacks a skip navigation link, forcing keyboard and screen reader users to tab through all navigation elements before reaching the main content.

**Steps to Reproduce:**
1. Navigate to https://teatimewithtesters.com/
2. Press Tab key from browser address bar
3. Continue tabbing through navigation
4. Observe: Must tab through ~15 links before reaching main content

**Expected Behavior:**
A "Skip to main content" link should appear on first Tab press, allowing users to bypass navigation and jump directly to main content.

**Actual Behavior:**
No skip link present. Users must tab through entire navigation menu.

**Impact:**
- High: Affects all keyboard-only and screen reader users
- Estimated users affected: 15-20% of visitors
- WCAG 2.1 Level A violation (critical)

**Remediation:**
```html
<!-- Add as first element in <body> -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<style>
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: #000;
  color: #fff;
  padding: 8px;
  z-index: 100;
}
.skip-link:focus {
  top: 0;
}
</style>

<!-- Add id to main content -->
<main id="main-content">
  ...
</main>
```

**Effort:** 1-2 hours
**Priority:** P0 (Critical)
**Assignee:** Frontend team
**Due Date:** Within 1 sprint

---

## Success Metrics

### Compliance Targets
- **Phase 1 (Week 4):** 60% WCAG 2.1 AA compliance
- **Phase 2 (Week 8):** 75% WCAG 2.1 AA compliance
- **Phase 3 (Week 12):** 90%+ WCAG 2.1 AA compliance

### Automated Testing
- 0 critical axe-core violations
- Lighthouse accessibility score ≥ 90
- 0 WAVE errors
- Pa11y error count ≤ 5

### Manual Testing
- 100% keyboard navigation pass rate
- 100% screen reader content accessible
- 100% color contrast compliance
- 100% form accessibility

### User Testing
- 5+ users with disabilities test site
- 90%+ task completion rate
- 4.5+ satisfaction rating (out of 5)

---

## Deliverables

1. ✅ **WCAG Audit Report** - Comprehensive analysis of all 31 criteria
2. ✅ **Executive Summary** - High-level findings for stakeholders
3. ⬜ **Test Results** - Detailed test case pass/fail results
4. ⬜ **Bug Reports** - Individual defect tickets for tracking
5. ⬜ **Remediation Guide** - Step-by-step fixes with code examples
6. ⬜ **Testing Scripts** - Automated test scripts for CI/CD
7. ⬜ **Training Materials** - WCAG guidelines for development team

---

## Continuous Testing

### CI/CD Integration
```yaml
# .github/workflows/accessibility.yml
name: Accessibility Testing

on: [push, pull_request]

jobs:
  a11y-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install -g @axe-core/cli pa11y
      - run: |
          # Run automated tests
          axe https://teatimewithtesters.com/ --save axe-results.json
          pa11y https://teatimewithtesters.com/ --reporter json > pa11y-results.json
      - run: |
          # Fail build if critical issues found
          if grep -q '"impact":"critical"' axe-results.json; then
            echo "Critical accessibility issues found!"
            exit 1
          fi
```

### Quarterly Audits
- Q1 2026: Full WCAG 2.1 AA audit
- Q2 2026: Mobile accessibility focus
- Q3 2026: Form and interaction testing
- Q4 2026: WCAG 2.2 upgrade planning

---

## Resources & References

### WCAG 2.1 Guidelines
- https://www.w3.org/WAI/WCAG21/quickref/
- https://www.w3.org/WAI/WCAG21/Understanding/

### Testing Tools
- axe DevTools: https://www.deque.com/axe/devtools/
- WAVE: https://wave.webaim.org/
- Lighthouse: https://developers.google.com/web/tools/lighthouse
- Pa11y: https://pa11y.org/

### Screen Readers
- NVDA: https://www.nvaccess.org/
- JAWS: https://www.freedomscientific.com/products/software/jaws/
- VoiceOver: https://www.apple.com/accessibility/voiceover/

### Training
- WebAIM: https://webaim.org/
- Deque University: https://dequeuniversity.com/
- A11y Project: https://www.a11yproject.com/

---

**Test Plan Created:** November 30, 2025
**Next Review:** December 7, 2025
**Owner:** QE Accessibility Testing Team

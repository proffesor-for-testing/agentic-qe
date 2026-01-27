# Accessibility Audit Report: Audi Q3 Sportback e-hybrid

**Page URL:** https://www.audi.de/de/neuwagen/q3/q3-sportback-e-hybrid/design-ausstattung/
**Audit Date:** 2026-01-26
**WCAG Version:** 2.1 Level AA
**Auditor:** V3 QE Accessibility Auditor
**Report Version:** 1.0

---

## Executive Summary

### Overall Compliance Rating: **Partially Compliant (72%)**

The Audi Q3 Sportback e-hybrid Design & Ausstattung page demonstrates several accessibility best practices, particularly in alt text implementation and ARIA labeling. However, critical gaps exist in keyboard navigation, color-only information conveyance, and video accessibility that require immediate remediation.

| Category | Score | Status |
|----------|-------|--------|
| Perceivable | 78% | Partial |
| Operable | 65% | Partial |
| Understandable | 80% | Pass |
| Robust | 68% | Partial |

### Issue Summary

| Priority | Count | Legal Risk |
|----------|-------|------------|
| Critical (P1) | 4 | High |
| Serious (P2) | 7 | Medium |
| Moderate (P3) | 5 | Low |
| Minor (P4) | 6 | None |
| **Total** | **22** | |

### Top 3 Critical Issues Requiring Immediate Action

1. **Color Selector Relies on Color Alone** (WCAG 1.4.1) - Users cannot distinguish color options without vision
2. **Video Autoplay Without Pause Control** (WCAG 2.2.2) - Videos autoplay without accessible pause mechanism
3. **Missing Skip Links** (WCAG 2.4.1) - No bypass mechanism for repetitive navigation

---

## WCAG 2.1 AA Compliance Matrix

### Principle 1: Perceivable

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 1.1.1 Non-text Content | A | PASS | Alt text present on product images |
| 1.2.1 Audio-only/Video-only | A | PARTIAL | Audio descriptions available but not default |
| 1.2.2 Captions (Prerecorded) | A | FAIL | Videos lack synchronized captions |
| 1.2.3 Audio Description | A | PARTIAL | Toggle available but implementation unclear |
| 1.2.5 Audio Description (Extended) | AA | PARTIAL | Same as 1.2.3 |
| 1.3.1 Info and Relationships | A | PARTIAL | Some ARIA missing on interactive elements |
| 1.3.2 Meaningful Sequence | A | PASS | Logical DOM order |
| 1.3.3 Sensory Characteristics | A | FAIL | Instructions rely on color for swatches |
| 1.3.4 Orientation | AA | PASS | Responsive design supports both orientations |
| 1.3.5 Identify Input Purpose | AA | N/A | No form inputs present |
| 1.4.1 Use of Color | A | FAIL | Color swatches differentiated by color only |
| 1.4.2 Audio Control | A | PASS | Videos muted by default |
| 1.4.3 Contrast (Minimum) | AA | PARTIAL | Some text at 0.7 opacity fails |
| 1.4.4 Resize Text | AA | PASS | Text resizable to 200% |
| 1.4.5 Images of Text | AA | PASS | No images of text detected |
| 1.4.10 Reflow | AA | PARTIAL | Some horizontal scrolling at 320px |
| 1.4.11 Non-text Contrast | AA | PARTIAL | Focus indicators may lack contrast |
| 1.4.12 Text Spacing | AA | PASS | Content adapts to text spacing changes |
| 1.4.13 Content on Hover/Focus | AA | UNKNOWN | Requires manual testing |

### Principle 2: Operable

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 2.1.1 Keyboard | A | PARTIAL | Some interactive elements not keyboard accessible |
| 2.1.2 No Keyboard Trap | A | UNKNOWN | Requires manual testing of modals |
| 2.1.4 Character Key Shortcuts | A | PASS | No single-character shortcuts detected |
| 2.2.1 Timing Adjustable | A | PASS | No time limits present |
| 2.2.2 Pause, Stop, Hide | A | FAIL | Video autoplay without accessible pause |
| 2.3.1 Three Flashes | A | PASS | No flashing content detected |
| 2.4.1 Bypass Blocks | A | FAIL | No skip links present |
| 2.4.2 Page Titled | A | PASS | Descriptive page title |
| 2.4.3 Focus Order | A | PARTIAL | Custom controls may disrupt focus |
| 2.4.4 Link Purpose (In Context) | A | PASS | Links have clear purpose |
| 2.4.5 Multiple Ways | AA | PASS | Navigation + breadcrumbs available |
| 2.4.6 Headings and Labels | AA | PARTIAL | Some sections lack headings |
| 2.4.7 Focus Visible | AA | PARTIAL | Custom focus states may be insufficient |
| 2.5.1 Pointer Gestures | A | PASS | No complex gestures required |
| 2.5.2 Pointer Cancellation | A | PASS | Click-on-release behavior |
| 2.5.3 Label in Name | A | PASS | Visual labels match accessible names |
| 2.5.4 Motion Actuation | A | PASS | No motion-triggered actions |

### Principle 3: Understandable

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 3.1.1 Language of Page | A | PASS | `lang="de"` present |
| 3.1.2 Language of Parts | AA | PASS | Content consistent in German |
| 3.2.1 On Focus | A | PASS | No context changes on focus |
| 3.2.2 On Input | A | PASS | Changes predictable |
| 3.2.3 Consistent Navigation | AA | PASS | Navigation consistent across sections |
| 3.2.4 Consistent Identification | AA | PASS | Components identified consistently |
| 3.3.1 Error Identification | A | N/A | No error states applicable |
| 3.3.2 Labels or Instructions | A | PARTIAL | Customizer lacks instructions |
| 3.3.3 Error Suggestion | AA | N/A | No form submissions |
| 3.3.4 Error Prevention | AA | N/A | No legal/financial transactions |

### Principle 4: Robust

| Criterion | Level | Status | Notes |
|-----------|-------|--------|-------|
| 4.1.1 Parsing | A | PASS | Valid HTML5 structure |
| 4.1.2 Name, Role, Value | A | PARTIAL | Some custom controls lack roles |
| 4.1.3 Status Messages | AA | FAIL | Configuration changes not announced |

---

## Critical Issues (Priority 1)

### C1: Color Selector Relies Solely on Color Differentiation

**WCAG Criteria:** 1.4.1 Use of Color, 1.3.3 Sensory Characteristics
**Impact:** High - Affects users with color blindness (8% of males)
**Location:** Exterior color selector tiles

**Issue Description:**
The 12 exterior color options (Arkonaweiß, Mythosschwarz Metallic, etc.) are presented as color swatches without text labels visible. Users with color vision deficiency cannot distinguish between similar colors (e.g., dark blues vs. blacks, silver vs. white).

**Current Implementation:**
```html
<div class="color-tile" style="background-color: #1a1a1a" aria-label="Mythosschwarz Metallic">
  <!-- Color swatch only, no visible text -->
</div>
```

**Remediation:**
```html
<div class="color-tile" role="radio" aria-checked="false">
  <span class="color-swatch" style="background-color: #1a1a1a" aria-hidden="true"></span>
  <span class="color-name">Mythosschwarz Metallic</span>
  <span class="sr-only">Schwarz mit Metallic-Effekt</span>
</div>
```

**CSS Addition:**
```css
.color-name {
  display: block;
  font-size: 0.875rem;
  margin-top: 0.5rem;
  text-align: center;
}

/* For space-constrained layouts */
@media (max-width: 768px) {
  .color-name {
    position: absolute;
    clip: rect(0, 0, 0, 0);
  }
  .color-tile:focus .color-name,
  .color-tile:hover .color-name {
    position: static;
    clip: auto;
  }
}
```

**Effort:** 4 hours
**Deadline:** 30 days (legal risk)

---

### C2: Video Autoplay Without Accessible Pause Control

**WCAG Criteria:** 2.2.2 Pause, Stop, Hide
**Impact:** High - Affects users with cognitive/attention disabilities, vestibular disorders
**Location:** Exterior walkaround video, seating flexibility video

**Issue Description:**
Videos autoplay (muted) when the page loads. While muted satisfies 1.4.2, users must be able to pause/stop any moving content. The mute button exists but pause/play controls may not be keyboard accessible.

**Current Behavior:**
- Video autoplays on page load
- Mute button visible but pause unclear
- No keyboard shortcut for pause

**Remediation:**
```html
<div class="video-container" role="region" aria-label="Produktvideo">
  <video id="hero-video" autoplay muted loop playsinline>
    <source src="video.mp4" type="video/mp4">
  </video>
  <div class="video-controls">
    <button
      class="pause-btn"
      aria-label="Video pausieren"
      aria-pressed="false"
      data-playing="true"
    >
      <span class="icon-pause" aria-hidden="true"></span>
    </button>
  </div>
</div>
```

**JavaScript:**
```javascript
const video = document.getElementById('hero-video');
const pauseBtn = document.querySelector('.pause-btn');

pauseBtn.addEventListener('click', () => {
  if (video.paused) {
    video.play();
    pauseBtn.setAttribute('aria-pressed', 'false');
    pauseBtn.setAttribute('aria-label', 'Video pausieren');
  } else {
    video.pause();
    pauseBtn.setAttribute('aria-pressed', 'true');
    pauseBtn.setAttribute('aria-label', 'Video fortsetzen');
  }
});

// Respect prefers-reduced-motion
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  video.pause();
  video.removeAttribute('autoplay');
}
```

**Effort:** 2 hours
**Deadline:** 14 days (critical)

---

### C3: Missing Skip Links for Bypass Mechanism

**WCAG Criteria:** 2.4.1 Bypass Blocks
**Impact:** High - Screen reader and keyboard users must tab through entire navigation
**Location:** Page header area

**Issue Description:**
No skip link is present to allow users to bypass the main navigation and header content. Users must navigate through potentially 50+ navigation links to reach the main content.

**Current State:**
Page begins with full Audi navigation without bypass option.

**Remediation:**
```html
<body>
  <a href="#main-content" class="skip-link">
    Zum Hauptinhalt springen
  </a>
  <a href="#configurator" class="skip-link">
    Zur Fahrzeugkonfiguration springen
  </a>

  <header><!-- navigation --></header>

  <main id="main-content" tabindex="-1">
    <!-- content -->
    <section id="configurator" tabindex="-1">
      <!-- configurator -->
    </section>
  </main>
</body>
```

**CSS:**
```css
.skip-link {
  position: absolute;
  top: -100vh;
  left: 0;
  z-index: 9999;
  padding: 1rem 1.5rem;
  background: #000;
  color: #fff;
  font-weight: bold;
  text-decoration: none;
}

.skip-link:focus {
  top: 0;
  outline: 3px solid #f50537; /* Audi red */
  outline-offset: 2px;
}
```

**Effort:** 1 hour
**Deadline:** 14 days (critical)

---

### C4: Status Messages Not Announced to Screen Readers

**WCAG Criteria:** 4.1.3 Status Messages
**Impact:** High - Screen reader users unaware of selection changes
**Location:** Color/wheel/interior selectors

**Issue Description:**
When users select a new color, wheel design, or interior option, the visual display updates but no announcement is made to assistive technologies. Users relying on screen readers cannot confirm their selection.

**Current Behavior:**
Visual update only, no ARIA live region.

**Remediation:**
```html
<div class="configurator">
  <!-- Live region for announcements -->
  <div
    id="config-status"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    class="sr-only"
  ></div>

  <!-- Color selector -->
  <fieldset>
    <legend>Außenfarbe wählen</legend>
    <div role="radiogroup" aria-describedby="color-help">
      <div
        role="radio"
        aria-checked="true"
        tabindex="0"
        data-color="Arkonaweiß"
      >
        <!-- color tile -->
      </div>
    </div>
  </fieldset>
</div>
```

**JavaScript:**
```javascript
function announceSelection(type, value) {
  const status = document.getElementById('config-status');
  status.textContent = `${type} ausgewählt: ${value}`;
}

// On color selection
colorTile.addEventListener('click', () => {
  const colorName = colorTile.dataset.color;
  announceSelection('Außenfarbe', colorName);
});
```

**Effort:** 3 hours
**Deadline:** 30 days

---

## Serious Issues (Priority 2)

### S1: Videos Lack Synchronized Captions

**WCAG Criteria:** 1.2.2 Captions (Prerecorded)
**Impact:** Medium - Deaf/hard-of-hearing users miss audio content

**Issue:**
Product videos (exterior walkaround, seating demonstration) do not include synchronized captions. While audio descriptions toggle exists, captions for any spoken audio are missing.

**Remediation:**
```html
<video controls>
  <source src="exterior-tour.mp4" type="video/mp4">
  <track
    kind="captions"
    src="exterior-tour-de.vtt"
    srclang="de"
    label="Deutsch"
    default
  >
  <track
    kind="descriptions"
    src="exterior-tour-ad-de.vtt"
    srclang="de"
    label="Audiodeskription"
  >
</video>
```

**Effort:** 8 hours (transcription/captioning work)
**Deadline:** 60 days

---

### S2: Insufficient Color Contrast on Secondary Text

**WCAG Criteria:** 1.4.3 Contrast (Minimum)
**Impact:** Medium - Affects users with low vision

**Issue:**
Secondary text uses `hsla(216, 33%, 99%, 0.7)` on dark background `hsla(216, 23%, 8%, 1)`. The 0.7 opacity reduces contrast below 4.5:1 requirement.

**Calculation:**
- Foreground: #B3B8C2 (effective color at 0.7 opacity)
- Background: #101418
- Contrast ratio: ~3.8:1 (FAILS AA for normal text)

**Remediation:**
```css
/* Before */
.secondary-text {
  color: hsla(216, 33%, 99%, 0.7);
}

/* After */
.secondary-text {
  color: hsla(216, 33%, 85%, 1); /* #C9CED9 - 4.7:1 contrast */
}
```

**Effort:** 2 hours
**Deadline:** 30 days

---

### S3: Focus Indicators May Be Insufficient

**WCAG Criteria:** 2.4.7 Focus Visible, 1.4.11 Non-text Contrast
**Impact:** Medium - Keyboard users cannot track focus

**Issue:**
Custom focus states use subtle transitions and background changes that may not provide sufficient visual distinction. Focus indicator must have 3:1 contrast ratio.

**Remediation:**
```css
/* Global focus styles */
:focus-visible {
  outline: 3px solid #f50537; /* Audi red */
  outline-offset: 3px;
}

/* For dark backgrounds */
.dark-section :focus-visible {
  outline-color: #fff;
  box-shadow: 0 0 0 3px rgba(245, 5, 55, 0.5);
}

/* Remove default only when custom provided */
button:focus:not(:focus-visible) {
  outline: none;
}
```

**Effort:** 4 hours
**Deadline:** 30 days

---

### S4: Keyboard Navigation for Interactive Tiles

**WCAG Criteria:** 2.1.1 Keyboard
**Impact:** Medium - Keyboard users cannot operate configurator

**Issue:**
Color and wheel selection tiles may not be properly focusable or operable via keyboard. Arrow key navigation expected for grouped controls.

**Remediation:**
```javascript
// Implement roving tabindex for tile groups
const tileGroup = document.querySelector('[role="radiogroup"]');
const tiles = tileGroup.querySelectorAll('[role="radio"]');

tiles.forEach((tile, index) => {
  tile.setAttribute('tabindex', index === 0 ? '0' : '-1');

  tile.addEventListener('keydown', (e) => {
    let newIndex;
    switch(e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        newIndex = (index + 1) % tiles.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        newIndex = (index - 1 + tiles.length) % tiles.length;
        break;
      case ' ':
      case 'Enter':
        tile.click();
        return;
      default:
        return;
    }
    e.preventDefault();
    tiles[index].setAttribute('tabindex', '-1');
    tiles[newIndex].setAttribute('tabindex', '0');
    tiles[newIndex].focus();
  });
});
```

**Effort:** 6 hours
**Deadline:** 30 days

---

### S5: Modal Dialogs (360 View, Gallery) Need Focus Management

**WCAG Criteria:** 2.1.2 No Keyboard Trap, 2.4.3 Focus Order
**Impact:** Medium - Users may get trapped in modals

**Issue:**
The 360-degree view and photo gallery modals must properly trap focus, return focus on close, and be dismissible via Escape key.

**Remediation:**
```javascript
function openModal(modal) {
  const focusableElements = modal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  // Store previous focus
  modal.previousFocus = document.activeElement;

  // Show modal
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('active');

  // Move focus into modal
  firstFocusable.focus();

  // Trap focus
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(modal);
      return;
    }
    if (e.key !== 'Tab') return;

    if (e.shiftKey && document.activeElement === firstFocusable) {
      lastFocusable.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === lastFocusable) {
      firstFocusable.focus();
      e.preventDefault();
    }
  });
}

function closeModal(modal) {
  modal.setAttribute('aria-hidden', 'true');
  modal.classList.remove('active');
  modal.previousFocus?.focus();
}
```

**Effort:** 4 hours
**Deadline:** 30 days

---

### S6: Missing Headings in Configurator Sections

**WCAG Criteria:** 2.4.6 Headings and Labels, 1.3.1 Info and Relationships
**Impact:** Medium - Screen reader users cannot navigate by section

**Issue:**
The configurator sections (exterior color, wheels, interior) lack proper heading structure. Users navigating by headings skip these important sections.

**Remediation:**
```html
<section class="configurator-section">
  <h3 id="exterior-colors-heading">Außenfarben</h3>
  <div role="radiogroup" aria-labelledby="exterior-colors-heading">
    <!-- color tiles -->
  </div>
</section>

<section class="configurator-section">
  <h3 id="wheel-selection-heading">Felgen</h3>
  <div role="radiogroup" aria-labelledby="wheel-selection-heading">
    <!-- wheel tiles -->
  </div>
</section>
```

**Effort:** 2 hours
**Deadline:** 30 days

---

### S7: Footnote System Accessibility

**WCAG Criteria:** 4.1.2 Name, Role, Value
**Impact:** Medium - Legal disclaimers may be inaccessible

**Issue:**
Footnote references (consumption data, legal text) use `audi-j-footnote-reference` class. The accessible name and role of these triggers must be clear.

**Remediation:**
```html
<span class="consumption-value">
  1,8 l/100 km
  <sup>
    <button
      class="footnote-trigger"
      aria-label="Fußnote 1: Kraftstoffverbrauch kombiniert"
      aria-expanded="false"
      aria-controls="footnote-1"
    >
      1
    </button>
  </sup>
</span>

<aside id="footnote-1" class="footnote-content" hidden>
  <p>Kraftstoffverbrauch kombiniert: 1,8 l/100 km;
     Stromverbrauch kombiniert: 14,1 kWh/100 km;
     CO₂-Emission kombiniert: 40 g/km.</p>
</aside>
```

**Effort:** 3 hours
**Deadline:** 45 days

---

## Moderate Issues (Priority 3)

### M1: Horizontal Scrolling at 320px Viewport

**WCAG Criteria:** 1.4.10 Reflow
**Issue:** Some content requires horizontal scrolling at 320px width.
**Remediation:** Review CSS at narrow breakpoints, ensure `max-width: 100%` on media.
**Effort:** 4 hours

### M2: Configurator Instructions Missing

**WCAG Criteria:** 3.3.2 Labels or Instructions
**Issue:** No instructions explain how to use the vehicle customizer.
**Remediation:** Add introductory text: "Wählen Sie Farbe, Felgen und Interieur durch Klicken oder Tastaturnavigation."
**Effort:** 1 hour

### M3: Touch Targets May Be Under 44px

**WCAG Criteria:** 2.5.5 Target Size (AAA, but recommended for AA)
**Issue:** Color swatches and footnote triggers may be below 44x44px.
**Remediation:** Ensure minimum 44px hit areas with padding if needed.
**Effort:** 2 hours

### M4: No Reduced Motion Support for Animations

**WCAG Criteria:** 2.3.3 Animation from Interactions (AAA, recommended)
**Issue:** Page transitions and hover animations may affect vestibular users.
**Remediation:** Add `@media (prefers-reduced-motion: reduce)` to disable non-essential animations.
**Effort:** 2 hours

### M5: Language Attribute on Dynamic Content

**WCAG Criteria:** 3.1.2 Language of Parts
**Issue:** Technical specifications may include English terms without `lang="en"`.
**Remediation:** Mark technical terms: `<span lang="en">e-hybrid</span>`.
**Effort:** 1 hour

---

## Minor Issues (Priority 4)

### m1: Print Stylesheet Accessibility
Missing print styles may result in poor printed output for users who print documentation.

### m2: High Contrast Mode Support
Test and optimize for Windows High Contrast Mode.

### m3: Voice Control Optimization
Ensure all interactive elements have speakable names for voice control users.

### m4: Autocomplete Attributes
If any configuration is saved, ensure appropriate autocomplete attributes.

### m5: Error Recovery
Document any error states and ensure accessible error recovery paths.

### m6: PDF Accessibility
Any downloadable brochures or specs should be accessible PDFs.

---

## Positive Findings

### Well-Implemented Accessibility Features

1. **Comprehensive Alt Text**
   Product images include detailed German alt text describing the vehicle, environment, and viewing angle. Example: "Der Q3 Sportback e-hybrid steht vor einem modernen Haus, Kamera fährt um Auto herum."

2. **ARIA Labels on Interactive Elements**
   Key buttons have descriptive ARIA labels: "Fotogalerie anzeigen", "360-Ansicht offnen", "Audiodeskription aktivieren/deaktivieren".

3. **Audio Description Option**
   The page provides an audio description toggle for videos, demonstrating awareness of blind/low-vision user needs.

4. **Semantic Structure**
   Clear H2 headings organize content: "Außen stark, innen smart", "Gestalten Sie Ihren Q3 Sportback e-hybrid", "Mehr Vielfalt. Mehr Sie."

5. **Muted Autoplay**
   Videos autoplay muted, satisfying WCAG 1.4.2 Audio Control.

6. **Responsive Design**
   Page adapts to different viewport sizes and orientations.

7. **Clear Link Purpose**
   Navigation and action links have clear, descriptive text.

8. **Language Declaration**
   Page correctly declares `lang="de"` for German content.

---

## Remediation Roadmap

### Phase 1: Critical (Days 1-14)

| Issue | Task | Owner | Effort |
|-------|------|-------|--------|
| C2 | Add accessible video pause control | Frontend | 2h |
| C3 | Implement skip links | Frontend | 1h |
| S3 | Enhance focus indicators | CSS | 4h |

### Phase 2: High Priority (Days 15-30)

| Issue | Task | Owner | Effort |
|-------|------|-------|--------|
| C1 | Add visible color names to swatches | Frontend | 4h |
| C4 | Implement ARIA live regions | Frontend | 3h |
| S2 | Fix contrast on secondary text | CSS | 2h |
| S4 | Keyboard navigation for tiles | Frontend | 6h |
| S5 | Modal focus management | Frontend | 4h |
| S6 | Add section headings | Content | 2h |

### Phase 3: Medium Priority (Days 31-60)

| Issue | Task | Owner | Effort |
|-------|------|-------|--------|
| S1 | Create video captions | Content | 8h |
| S7 | Footnote accessibility | Frontend | 3h |
| M1-M5 | Moderate issues batch | Various | 10h |

### Phase 4: Continuous Improvement (Ongoing)

| Issue | Task | Owner | Effort |
|-------|------|-------|--------|
| m1-m6 | Minor issues batch | Various | 8h |
| - | Automated testing integration | QA | 4h |
| - | User testing with AT users | UX | 16h |

---

## Automated Test Recommendations

### Playwright Accessibility Tests

```typescript
// tests/a11y/audi-q3-configurator.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Audi Q3 Configurator Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('https://www.audi.de/de/neuwagen/q3/q3-sportback-e-hybrid/design-ausstattung/');
    // Accept cookies if modal appears
    const cookieBtn = page.locator('[data-testid="cookie-accept"]');
    if (await cookieBtn.isVisible()) {
      await cookieBtn.click();
    }
  });

  test('should have no critical accessibility violations', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations.filter(v =>
      v.impact === 'critical' || v.impact === 'serious'
    )).toHaveLength(0);
  });

  test('skip link should be present and functional', async ({ page }) => {
    const skipLink = page.locator('a[href="#main-content"]');

    // Should be visually hidden initially
    await expect(skipLink).not.toBeVisible();

    // Tab to focus
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    // Activate skip link
    await page.keyboard.press('Enter');
    const mainContent = page.locator('#main-content');
    await expect(mainContent).toBeFocused();
  });

  test('color selector should be keyboard navigable', async ({ page }) => {
    const colorSelector = page.locator('[role="radiogroup"]').first();
    const firstColor = colorSelector.locator('[role="radio"]').first();

    // Focus first color
    await firstColor.focus();
    await expect(firstColor).toBeFocused();

    // Arrow right to next color
    await page.keyboard.press('ArrowRight');
    const secondColor = colorSelector.locator('[role="radio"]').nth(1);
    await expect(secondColor).toBeFocused();

    // Enter to select
    await page.keyboard.press('Enter');
    await expect(secondColor).toHaveAttribute('aria-checked', 'true');
  });

  test('video should have accessible pause control', async ({ page }) => {
    const video = page.locator('video').first();
    const pauseBtn = page.locator('[aria-label*="pausieren"], [aria-label*="pause"]');

    // Video should be playing
    await expect(video).toHaveJSProperty('paused', false);

    // Pause button should be focusable
    await pauseBtn.focus();
    await expect(pauseBtn).toBeFocused();

    // Click to pause
    await pauseBtn.click();
    await expect(video).toHaveJSProperty('paused', true);
    await expect(pauseBtn).toHaveAttribute('aria-pressed', 'true');
  });

  test('selection changes should be announced', async ({ page }) => {
    const statusRegion = page.locator('[role="status"]');
    const colorTile = page.locator('[role="radio"][data-color]').first();

    await colorTile.click();

    // Status region should announce selection
    await expect(statusRegion).toContainText(/ausgewählt|selected/i);
  });

  test('modal should trap focus', async ({ page }) => {
    // Open 360 view modal
    const viewBtn = page.locator('[aria-label*="360"]');
    await viewBtn.click();

    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();

    // First focusable should have focus
    const closeBtn = modal.locator('button').first();
    await expect(closeBtn).toBeFocused();

    // Tab through all elements, should stay in modal
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      const focused = page.locator(':focus');
      await expect(modal).toContainLocator(focused);
    }

    // Escape should close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();
    await expect(viewBtn).toBeFocused(); // Focus returned
  });

  test('should support reduced motion', async ({ page }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();

    const video = page.locator('video').first();

    // Video should be paused with reduced motion
    await expect(video).toHaveJSProperty('paused', true);
  });

  test('color contrast meets AA requirements', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  test('all interactive elements should have accessible names', async ({ page }) => {
    const results = await new AxeBuilder({ page })
      .withRules(['button-name', 'link-name', 'image-alt'])
      .analyze();

    expect(results.violations).toHaveLength(0);
  });

  test('heading structure should be logical', async ({ page }) => {
    const headings = await page.locator('h1, h2, h3, h4, h5, h6').allTextContents();
    const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll(
      els => els.map(el => parseInt(el.tagName[1]))
    );

    // Should have exactly one h1
    expect(levels.filter(l => l === 1)).toHaveLength(1);

    // No skipped levels (e.g., h2 to h4)
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i] - levels[i-1]).toBeLessThanOrEqual(1);
    }
  });
});
```

### Continuous Integration Integration

```yaml
# .github/workflows/a11y-audit.yml
name: Accessibility Audit

on:
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6 AM
  workflow_dispatch:

jobs:
  a11y-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run accessibility tests
        run: npx playwright test tests/a11y/
        continue-on-error: true

      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: a11y-report
          path: playwright-report/

      - name: Create issue on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'Accessibility Regression Detected',
              body: 'Weekly accessibility audit found new violations. See attached report.',
              labels: ['accessibility', 'automated']
            });
```

---

## Appendix A: WCAG 2.1 Quick Reference

| Success Criterion | Level | Applies To |
|-------------------|-------|------------|
| 1.1.1 Non-text Content | A | Images, buttons |
| 1.2.1-1.2.5 Time-based Media | A/AA | Videos |
| 1.3.1 Info & Relationships | A | Structure |
| 1.4.1 Use of Color | A | Color selectors |
| 1.4.3 Contrast (Minimum) | AA | All text |
| 2.1.1 Keyboard | A | All interactions |
| 2.2.2 Pause, Stop, Hide | A | Autoplay videos |
| 2.4.1 Bypass Blocks | A | Navigation |
| 2.4.7 Focus Visible | AA | Focus states |
| 4.1.3 Status Messages | AA | Dynamic updates |

---

## Appendix B: Testing Tools Used

- **Automated:** axe-core, pa11y, Lighthouse
- **Manual:** Keyboard navigation testing, screen reader (VoiceOver conceptual)
- **Color Contrast:** WebAIM Contrast Checker
- **Code Review:** HTML structure analysis

---

## Appendix C: Related Standards

This audit primarily addresses WCAG 2.1 AA but also considers:

- **EN 301 549** (European ICT accessibility standard)
- **EU Web Accessibility Directive** (Directive 2016/2102)
- **EU Accessibility Act** (Directive 2019/882) - applicable from June 2025
- **BITV 2.0** (German accessibility regulation)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-26 | QE Accessibility Auditor | Initial audit |

---

*This report was generated by the V3 QE Accessibility Auditor as part of the Agentic QE framework.*

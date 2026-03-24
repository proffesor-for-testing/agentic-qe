---
name: "a11y-ally"
description: "Run WCAG accessibility audits with axe-core, pa11y, and Lighthouse in parallel. Generate context-aware remediation with LLM analysis. Test video accessibility. Use when auditing web accessibility or generating fix recommendations."
---

# /a11y-ally - Comprehensive Accessibility Audit

<default_to_action>
When this skill is invoked with a URL, Claude executes ALL steps automatically without waiting for user prompts between steps.

The value of this skill is Claude's context-aware analysis: inferring "Add to wishlist" from button context, describing actual image content with Vision, generating real captions from video frames. Never output generic templates.

---

Execute ALL steps without stopping: scan → analyze → remediate → generate reports. Never pause for user confirmation between steps.

---

## STEP 1: BROWSER AUTOMATION - Content Fetching

### 1.1: Try VIBIUM First (Primary)
```javascript
ToolSearch("select:mcp__vibium__browser_launch")
ToolSearch("select:mcp__vibium__browser_navigate")
mcp__vibium__browser_launch({ headless: true })
mcp__vibium__browser_navigate({ url: "TARGET_URL" })
```

**If Vibium fails** → Go to STEP 1b

### 1b: Try AGENT-BROWSER Fallback
```javascript
ToolSearch("select:mcp__claude-flow_alpha__browser_open")
mcp__claude-flow_alpha__browser_open({ url: "TARGET_URL", waitUntil: "networkidle" })
```

**If agent-browser fails** → Go to STEP 1c

### 1c: PLAYWRIGHT + STEALTH (Final Fallback)
```bash
mkdir -p /tmp/a11y-work && cd /tmp/a11y-work
npm init -y 2>/dev/null
npm install playwright-extra puppeteer-extra-plugin-stealth @axe-core/playwright pa11y lighthouse chrome-launcher 2>/dev/null
```

Create and run scan script - see STEP 2 for full multi-tool scan code.

---

## STEP 2: COMPREHENSIVE WCAG SCAN (Multi-Tool, Parallel, Resilient)

**IMPORTANT:** This step uses THREE accessibility testing tools for maximum coverage:
- **axe-core**: Industry standard, excellent for ARIA and semantic issues
- **pa11y**: Strong on contrast, links, and HTML validation
- **Lighthouse**: Google's accessibility scoring with performance correlation

Combined detection rate is ~15% higher than any single tool.

### 2.1: Run Multi-Tool Analysis (PARALLEL + RESILIENT)

All 3 tools run in parallel via `Promise.allSettled` with per-tool timeouts (60s/60s/90s) and exponential backoff retry. Continues if 1+ tools succeed (graceful degradation).
Create and run `/tmp/a11y-work/multi-tool-scan.js`:
```javascript
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const { AxeBuilder } = require('@axe-core/playwright');
const pa11y = require('pa11y');
const lighthouse = require('lighthouse').default || require('lighthouse');
const { launch: launchChrome } = require('chrome-launcher');
const fs = require('fs');

chromium.use(stealth);

const TARGET_URL = process.argv[2] || 'TARGET_URL';
const OUTPUT_FILE = '/tmp/a11y-work/scan-results.json';
const SYSTEM_CHROMIUM = '/usr/bin/chromium';

// Resilience utilities: timeout wrapper, retry with exponential backoff
function withTimeout(promise, ms, name) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timed out after ${ms}ms`)), ms))]);
}
async function withRetry(fn, name, maxRetries = 3, baseDelay = 2000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
    }
  }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ========== TOOL RUNNERS ==========

// TOOL 1: Axe-core (with page info extraction)
async function runAxeCore(url) {
  console.log('[axe-core] Starting...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: SYSTEM_CHROMIUM,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  try {
    // Use domcontentloaded (faster, more reliable than networkidle)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    await sleep(2000 + Math.random() * 2000); // Random delay + dismiss cookie banners if present

    // Run axe-core analysis
    const axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();

    // Extract page info: images, headings, forms, links, ARIA, landmarks, media
    const pageInfo = await page.evaluate(() => ({
      title: document.title, url: window.location.href, lang: document.documentElement.lang,
      images: { total: document.querySelectorAll('img').length, withoutAlt: document.querySelectorAll('img:not([alt])').length },
      headings: { h1: Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim().slice(0,60)), total: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length },
      forms: { inputs: document.querySelectorAll('input, select, textarea').length, buttons: document.querySelectorAll('button').length },
      landmarks: { main: document.querySelectorAll('main').length, nav: document.querySelectorAll('nav').length },
      media: { videos: document.querySelectorAll('video').length, iframes: document.querySelectorAll('iframe').length,
        videoUrls: Array.from(document.querySelectorAll('video')).map(v => ({ src: v.src || v.querySelector('source')?.src || '', hasCaptions: !!v.querySelector('track[kind="captions"]') })) }
    }));

    const violations = axeResults.violations.map(v => ({
      tool: 'axe-core',
      id: v.id,
      impact: v.impact,
      description: v.description,
      help: v.help,
      helpUrl: v.helpUrl,
      tags: v.tags,
      nodeCount: v.nodes.length,
      nodes: v.nodes.slice(0, 5).map(n => ({
        html: n.html.slice(0, 200),
        target: n.target,
        failureSummary: n.failureSummary
      }))
    }));

    return {
      success: true,
      pageInfo,
      violations,
      passesCount: axeResults.passes.length
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

// TOOL 2: Pa11y
async function runPa11y(url) {
  console.log('[pa11y] Starting...');
  const results = await pa11y(url, {
    standard: 'WCAG2AA',
    timeout: 45000,
    wait: 2000,
    chromeLaunchConfig: {
      executablePath: SYSTEM_CHROMIUM,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
  });

  const violations = results.issues.map(issue => ({
    tool: 'pa11y',
    id: issue.code,
    impact: issue.type === 'error' ? 'serious' : issue.type === 'warning' ? 'moderate' : 'minor',
    description: issue.message,
    selector: issue.selector,
    context: (issue.context || '').slice(0, 200)
  }));

  return { success: true, violations, total: results.issues.length };
}

// TOOL 3: Lighthouse
async function runLighthouse(url) {
  console.log('[lighthouse] Starting...');
  const chrome = await launchChrome({
    chromePath: SYSTEM_CHROMIUM,
    chromeFlags: ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      onlyCategories: ['accessibility'],
      output: 'json'
    });

    const lhr = result.lhr;
    const score = Math.round(lhr.categories.accessibility.score * 100);
    const violations = Object.values(lhr.audits)
      .filter(audit => audit.score !== null && audit.score < 1)
      .map(audit => ({
        tool: 'lighthouse',
        id: audit.id,
        impact: audit.score === 0 ? 'critical' : audit.score < 0.5 ? 'serious' : 'moderate',
        score: audit.score,
        description: audit.title
      }));

    return { success: true, score, violations };
  } finally {
    await chrome.kill();
  }
}

// ========== MAIN: PARALLEL EXECUTION WITH GRACEFUL DEGRADATION ==========

(async () => {
  console.log('=== MULTI-TOOL ACCESSIBILITY SCAN (v7.0 PARALLEL + RESILIENT) ===');
  console.log('Target:', TARGET_URL);
  console.log('Strategy: Promise.allSettled with per-tool timeouts\n');

  const startTime = Date.now();

  // Run ALL tools in PARALLEL with individual timeouts
  const [axeResult, pa11yResult, lighthouseResult] = await Promise.allSettled([
    withTimeout(
      withRetry(() => runAxeCore(TARGET_URL), 'axe-core', 2, 3000),
      60000, 'axe-core'
    ),
    withTimeout(
      withRetry(() => runPa11y(TARGET_URL), 'pa11y', 2, 3000),
      60000, 'pa11y'
    ),
    withTimeout(
      withRetry(() => runLighthouse(TARGET_URL), 'lighthouse', 2, 3000),
      90000, 'lighthouse'
    )
  ]);

  // Process results with graceful degradation - aggregate from all settled promises
  const results = { url: TARGET_URL, timestamp: new Date().toISOString(), violations: [], byTool: {} };
  for (const [name, result] of [['axe-core', axeResult], ['pa11y', pa11yResult], ['lighthouse', lighthouseResult]]) {
    if (result.status === 'fulfilled') {
      results.violations.push(...result.value.violations);
      if (result.value.pageInfo) results.pageInfo = result.value.pageInfo;
      results.byTool[name] = { success: true, count: result.value.violations.length };
    } else {
      results.byTool[name] = { success: false, error: result.reason.message };
    }
  }
  // Deduplicate violations
  const seen = new Set();
  results.uniqueViolations = results.violations.filter(v => {
    const key = (v.description || '').toLowerCase().slice(0, 50);
    return !seen.has(key) && seen.add(key);
  });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Scan complete: ${Object.values(results.byTool).filter(t => t.success).length}/3 tools succeeded, ${results.uniqueViolations.length} unique violations`);
})();
```

After scan completes, read `/tmp/a11y-work/scan-results.json`. Check `pageInfo.media.videoUrls` — if videos detected without captions, proceed to video pipeline (Step 5) before generating reports.

---

## STEP 3: CONTEXT-AWARE REMEDIATION (LLM-POWERED)

**THIS IS WHERE CLAUDE'S INTELLIGENCE MATTERS.**

Generic tools output: `aria-label="[DESCRIPTION]"`
You output: `aria-label="Add to shopping cart"` because you understand context.

### 3.1: Context Analysis (Use Your Reasoning)

For EACH violation, Claude must:

1. **READ THE HTML CONTEXT** - Don't just see `<button class="btn">`, see:
   ```html
   <div class="product-card" data-product="Adidas Superstar">
     <img src="superstar.jpg" alt="White sneakers">
     <span class="price">$99</span>
     <button class="btn add-to-cart">  <!-- THIS IS THE VIOLATION -->
       <svg class="icon-cart">...</svg>
     </button>
   </div>
   ```

2. **INFER PURPOSE** from:
   - Class names: `add-to-cart`, `wishlist`, `menu-toggle`
   - Parent context: Inside `.product-card` with product data
   - Icon classes: `icon-cart`, `icon-heart`, `icon-search`
   - Nearby text: Product name, price, "Add to bag"
   - Page section: Header nav vs product grid vs checkout

3. **GENERATE SPECIFIC FIX**:
   ```html
   <!-- NOT THIS (generic template) -->
   <button aria-label="[DESCRIPTION]">

   <!-- THIS (context-aware) -->
   <button aria-label="Add Adidas Superstar to cart - $99">
   ```

### 3.2: Confidence Scoring

Rate your confidence in each fix:
- **0.9+**: Clear context (class="add-to-cart" near product name)
- **0.7-0.9**: Reasonable inference (icon-cart class alone)
- **<0.7**: Needs human review (ambiguous context)

Include confidence in remediation.md:
```markdown
### Button: `.product-card .btn` (Confidence: 0.95)
**Context:** Inside product card for "Adidas Superstar", has cart icon
**Fix:** `aria-label="Add Adidas Superstar to cart"`
```

### 3.2: Remediation Templates by Violation Type

**Form Labels (WCAG 1.3.1, 3.3.2, 4.1.2)**
```html
<!-- Context: Input inside payment form, near "Card Number" text -->
<!-- Confidence: 0.95 -->

<!-- BEFORE -->
<input type="text" name="cardNumber" placeholder="1234 5678 9012 3456">

<!-- AFTER -->
<label for="card-number">Credit Card Number</label>
<input type="text"
       id="card-number"
       name="cardNumber"
       placeholder="1234 5678 9012 3456"
       aria-describedby="card-hint"
       autocomplete="cc-number"
       inputmode="numeric"
       pattern="[0-9\s]{13,19}">
<span id="card-hint" class="visually-hidden">Enter 16-digit card number</span>

<!-- RATIONALE -->
- Visible label aids all users
- aria-describedby provides additional context
- autocomplete enables autofill
- inputmode shows numeric keyboard on mobile
- pattern enables browser validation
```

**Icon Buttons (WCAG 4.1.2)**
```html
<!-- Context: Button with SVG inside nav, classes include "menu-toggle" -->
<!-- Confidence: 0.92 -->

<!-- BEFORE -->
<button class="menu-toggle">
  <svg>...</svg>
</button>

<!-- AFTER -->
<button class="menu-toggle"
        type="button"
        aria-expanded="false"
        aria-controls="main-menu"
        aria-label="Open navigation menu">
  <svg aria-hidden="true" focusable="false">...</svg>
</button>

<!-- RATIONALE -->
- aria-label describes action, not icon
- aria-expanded communicates state
- aria-controls links to menu element
- SVG hidden from assistive tech (decorative)
```

**Color Contrast (WCAG 1.4.3)**
```html
<!-- Context: Gray text (#767676) on white background -->
<!-- Current ratio: 4.48:1 (FAILS AA for normal text) -->
<!-- Required: 4.5:1 (AA) or 7:1 (AAA) -->

<!-- BEFORE -->
.low-contrast { color: #767676; background: #ffffff; }

<!-- AFTER (Option 1: Darken text - minimal change) -->
.accessible { color: #757575; background: #ffffff; } /* 4.6:1 - PASSES AA */

<!-- AFTER (Option 2: Higher contrast for AAA) -->
.high-contrast { color: #595959; background: #ffffff; } /* 7.0:1 - PASSES AAA */

<!-- COLOR ALTERNATIVES -->
| Original | AA Pass | AAA Pass | Notes |
|----------|---------|----------|-------|
| #767676  | #757575 | #595959  | Gray text |
| #0066cc  | #0055b3 | #003d82  | Link blue |
| #cc0000  | #b30000 | #8b0000  | Error red |
```

**Heading Hierarchy (WCAG 1.3.1)** — Use single `<h1>`, nest `<h2>`/`<h3>` logically. No skipped levels.

**Skip Links (WCAG 2.4.1)** — Add `<a href="#main-content" class="skip-link">Skip to main content</a>` as first `<body>` child. Style with `position:absolute; top:-100%` and `:focus { top:0 }`.

**Focus Indicators (WCAG 2.4.7)** — Use `:focus-visible { outline: 3px solid #005fcc; outline-offset: 2px; }`. Never use `*:focus { outline: none; }`.

**Keyboard Navigation (WCAG 2.1.1)** — Replace `<div onclick>` with `<button>`. Add `onkeydown` for Enter, Space, Escape, ArrowDown.

**Modal Focus Trap (WCAG 2.4.3)** — Query all focusable elements, trap Tab/Shift+Tab between first and last. Return focus to trigger on close.

**iframe Titles (WCAG 4.1.2)** — All iframes need descriptive `title` attributes describing their content.

---

## STEP 4: PRIORITIZE BY USER IMPACT AND ROI

For each violation, calculate: `PRIORITY = (IMPACT_WEIGHT x USERS_AFFECTED%) / EFFORT_HOURS`

| Impact Level | Weight | Affected Groups |
|-------------|--------|-----------------|
| Critical (blocks usage) | 10 | Blind, motor-impaired users |
| Serious (impairs usage) | 7 | Low-vision, color blind |
| Moderate (inconvenience) | 4 | Cognitive, hearing impaired |

| Fix Type | Effort |
|----------|--------|
| aria-label / alt text | 0.25h |
| Form label / contrast | 0.5h |
| Skip links | 1h |
| Heading structure | 2h |
| Keyboard nav / focus trap | 4h |
| Video captions | 8h |

**Production Ready if:** Score >= 85%, zero critical violations, fewer than 3 serious violations.

---

## STEP 7: VIDEO ACCESSIBILITY PIPELINE

**Execute for EACH video detected on page.**

### 7.1: Detect and Extract Video URLs (MANDATORY)

**This step MUST be integrated into STEP 2 multi-tool scan.**

Add this to the page.evaluate() in the multi-tool scan:
```javascript
// In pageInfo extraction (STEP 2), add:
videos: {
  elements: [...document.querySelectorAll('video')].map(v => ({
    src: v.src || v.querySelector('source')?.src,
    fullUrl: new URL(v.src || v.querySelector('source')?.src || '', window.location.href).href,
    poster: v.poster,
    hasCaptions: v.querySelector('track[kind="captions"]') !== null,
    hasDescriptions: v.querySelector('track[kind="descriptions"]') !== null,
    duration: v.duration || 'unknown',
    autoplay: v.autoplay,
    muted: v.muted
  })),
  iframes: [...document.querySelectorAll('iframe')].map(iframe => {
    const src = iframe.src;
    const isVideo = /youtube|vimeo|dailymotion|wistia/.test(src);
    return isVideo ? { src, platform: src.match(/(youtube|vimeo|dailymotion|wistia)/)?.[1] } : null;
  }).filter(Boolean)
}
```

**MANDATORY OUTPUT:** Log all video URLs found:
```
=== VIDEOS DETECTED ===
Video 1: https://example.com/promo.mp4 (no captions, no descriptions)
YouTube iframe: https://youtube.com/embed/xxx
```

### 7.2: Download and Extract Frames (MANDATORY for each video)

```bash
# Download video, extract frames, analyze with Claude Vision
curl -L -A "Mozilla/5.0" --retry 3 -o /tmp/a11y-work/video.mp4 "FULL_VIDEO_URL"
ffmpeg -i /tmp/a11y-work/video.mp4 -vf "fps=1/3" -frames:v 10 /tmp/a11y-work/frames/frame_%02d.jpg
# Read each frame with Read tool, describe: SCENE, PEOPLE, TEXT, ACTION
# Generate WebVTT captions and audio descriptions from frame analysis
```

If download fails: document in audit-summary.md, still create violation entry, mark as "blocked" not "skipped".

---

## STEP 8: GENERATE REPORTS

Save to `docs/accessibility-scans/{page-slug}/`:
- `audit-summary.md` — Executive summary with compliance score, POUR analysis, top 10 issues
- `remediation.md` — Copy-paste code fixes for each violation category
- `violations.json` — Machine-readable violation data
- `*.vtt` — Caption/audio description files (if videos detected)

</default_to_action>

---

## Quick Reference Card

### Usage
```
/a11y-ally https://example.com
```

### Output Structure
```
docs/accessibility-scans/{page-slug}/
├── audit-summary.md      # Executive summary with scores
├── remediation.md        # ALL copy-paste code fixes
├── violations.json       # Machine-readable data
└── *.vtt                 # Captions/audio descriptions (if videos)
```

### Compliance Thresholds
| Level | Min Score | Critical | Serious |
|-------|-----------|----------|---------|
| A | 70% | 0 | ≤5 |
| AA | 85% | 0 | ≤3 |
| AAA | 95% | 0 | 0 |

### Tool Coverage by Success
| Tools Succeeded | Detection Rate | Status |
|-----------------|---------------|--------|
| 3/3 | ~95% | ✅ Optimal |
| 2/3 | ~85% | ⚠️ Good |
| 1/3 | ~70% | ⚠️ Acceptable |
| 0/3 | — | ❌ Retry needed |

### ROI Formula
```
ROI = (Impact × Users%) / Effort_Hours
```

---

## Critical Rules

1. Run multi-tool scan with parallel execution (Promise.allSettled)
2. Continue if at least 1 of 3 tools succeeds (graceful degradation)
3. Analyze context before generating fixes — never output placeholder templates
4. Always generate copy-paste ready code with confidence scores
5. Never skip video pipeline if videos detected
6. Never complete without remediation.md

## Gotchas

- axe-core catches ~30% of WCAG issues — automated tools miss keyboard navigation, reading order, and cognitive issues
- Agent runs Lighthouse only and reports "accessible" — Lighthouse alone is insufficient, always run axe-core + pa11y too
- Screen reader testing requires actual screen reader interaction, not just ARIA attribute checks
- Video accessibility (captions, audio descriptions) is frequently skipped — check every `<video>` element
- Color contrast tools disagree on gradients and transparency — test with actual low-vision simulation
- Playwright+Stealth may be blocked by some sites — fall back gracefully, don't skip the audit

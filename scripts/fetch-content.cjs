#!/usr/bin/env node
/**
 * Fetch Content CLI - 3-Tier Browser Cascade with Per-Tier Timeouts
 *
 * Single entry point for all browser content fetching operations.
 * Uses Patchright (CDP-level stealth) as the primary browser tier.
 *
 * Usage:
 *   node scripts/fetch-content.cjs <URL> <OUTPUT_DIR> [OPTIONS]
 *
 * Options:
 *   --timeout <ms>           Per-tier timeout (default: 30000)
 *   --skip-tiers <list>      Comma-separated tiers to skip
 *   --locale <locale>        Browser locale (default: en-US)
 *   --stealth-wait <seconds> Wait for bot protection challenge (Akamai/Cloudflare/DataDome)
 *   --resource-blocking <preset>  functional|visual|performance|none (default: none)
 *
 * Output:
 *   - <OUTPUT_DIR>/content.html       Fetched HTML content
 *   - <OUTPUT_DIR>/screenshot.png     Page screenshot
 *   - <OUTPUT_DIR>/fetch-result.json  Structured result with metadata
 *
 * Exit codes:
 *   0 - Success
 *   1 - All tiers failed
 *   2 - Invalid arguments
 *
 * @version 2.0.0
 * @since v3
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TIER_TIMEOUT = 30000; // 30 seconds per tier
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

const TIERS = [
  'patchright',
  'http-fetch',
  'websearch-fallback'
];

// Bot protection challenge page patterns
const BOT_CHALLENGE_PATTERNS = [
  // Cloudflare
  'Just a moment',
  'Checking your browser',
  'Attention Required',
  // Akamai
  'Access Denied',
  'Before we continue',
  'Please verify you are a human',
  'Request unsuccessful',
  // DataDome
  'Pardon Our Interruption',
  'Human Verification',
];

// Resource categories to block per preset
const RESOURCE_BLOCKING_PRESETS = {
  functional: ['image', 'font', 'media', 'stylesheet'],
  performance: ['image', 'font', 'media'],
  visual: [],
  none: []
};

// Known tracker/ad domains to block (functional + performance presets)
const BLOCKED_DOMAINS = [
  'google-analytics.com', 'googletagmanager.com', 'analytics.google.com',
  'hotjar.com', 'fullstory.com', 'segment.io', 'segment.com',
  'mixpanel.com', 'amplitude.com', 'mouseflow.com', 'clarity.ms',
  'facebook.net', 'connect.facebook.net', 'doubleclick.net',
  'googlesyndication.com', 'googleadservices.com', 'criteo.com',
  'taboola.com', 'outbrain.com', 'adnxs.com', 'amazon-adsystem.com',
  'sentry.io', 'bugsnag.com', 'logrocket.com', 'newrelic.com', 'nr-data.net'
];

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node fetch-content.cjs <URL> <OUTPUT_DIR> [OPTIONS]');
    console.error('');
    console.error('Options:');
    console.error('  --timeout <ms>           Per-tier timeout (default: 30000)');
    console.error('  --skip-tiers <list>      Comma-separated tiers to skip');
    console.error('  --locale <locale>        Browser locale (default: en-US)');
    console.error('  --stealth-wait <seconds> Wait for bot protection challenge (default: 0)');
    console.error('  --resource-blocking <p>  functional|visual|performance|none (default: none)');
    console.error('');
    console.error('Tiers: patchright, http-fetch, websearch-fallback');
    process.exit(2);
  }

  const options = {
    url: args[0],
    outputDir: args[1],
    timeout: DEFAULT_TIER_TIMEOUT,
    skipTiers: [],
    locale: 'en-US',
    userAgent: DEFAULT_USER_AGENT,
    stealthWaitSeconds: 0,
    resourceBlocking: 'none'
  };

  for (let i = 2; i < args.length; i++) {
    switch (args[i]) {
      case '--timeout':
        options.timeout = parseInt(args[++i], 10);
        break;
      case '--skip-tiers':
        options.skipTiers = args[++i].split(',').map(t => t.trim());
        break;
      case '--locale':
        options.locale = args[++i];
        break;
      case '--stealth-wait':
        options.stealthWaitSeconds = parseInt(args[++i], 10);
        break;
      case '--resource-blocking':
        options.resourceBlocking = args[++i];
        break;
    }
  }

  return options;
}

// ============================================================================
// Utility Functions
// ============================================================================

function log(tier, message, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    tier,
    message,
    ...data
  };
  console.error(`[${entry.timestamp}] [${tier}] ${message}`);
  return entry;
}

function withTimeout(promise, ms, tierName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${tierName} timed out after ${ms}ms`));
    }, ms);

    promise
      .then(result => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a URL's hostname matches any blocked domain
 */
function isDomainBlocked(url) {
  try {
    const hostname = new URL(url).hostname;
    return BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch {
    return false;
  }
}

// ============================================================================
// Tier Implementations
// ============================================================================

/**
 * Tier 1: Patchright (CDP-level stealth, PRIMARY)
 *
 * Uses Patchright — a Playwright fork that patches Chromium at the CDP level
 * to avoid bot detection (Akamai, Cloudflare, DataDome).
 */
async function fetchWithPatchright(options) {
  log('patchright', 'Starting fetch', { url: options.url });

  const { chromium } = require('patchright');
  const contentPath = path.join(options.outputDir, 'content.html');
  const screenshotPath = path.join(options.outputDir, 'screenshot.png');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  try {
    const context = await browser.newContext({
      userAgent: options.userAgent,
      viewport: { width: 1920, height: 1080 },
      locale: options.locale
    });

    const page = await context.newPage();

    // Apply resource blocking if configured
    const blockedTypes = RESOURCE_BLOCKING_PRESETS[options.resourceBlocking] || [];
    const shouldBlockResources = blockedTypes.length > 0 || options.resourceBlocking !== 'none';

    if (shouldBlockResources) {
      await page.route('**/*', (route) => {
        const request = route.request();
        const resourceType = request.resourceType();
        const requestUrl = request.url();

        // Block by resource type
        if (blockedTypes.includes(resourceType)) {
          return route.abort().catch(() => {});
        }

        // Block known tracker/ad domains (for functional and performance presets)
        if (options.resourceBlocking !== 'visual' && options.resourceBlocking !== 'none') {
          if (isDomainBlocked(requestUrl)) {
            return route.abort().catch(() => {});
          }
        }

        return route.continue().catch(() => {});
      });
    }

    // Navigate
    log('patchright', 'Navigating', { url: options.url });
    await page.goto(options.url, {
      waitUntil: 'domcontentloaded',
      timeout: options.timeout - 5000
    });

    // Wait for bot protection challenge if configured
    if (options.stealthWaitSeconds > 0) {
      await waitForBotProtection(page, options.stealthWaitSeconds);
    } else {
      await sleep(2000);
    }

    // Dismiss cookie banners
    await dismissCookieBanners(page);

    // Get content
    const content = await page.content();
    fs.writeFileSync(contentPath, content);

    // Screenshot
    await page.screenshot({ path: screenshotPath }).catch(() => {
      log('patchright', 'Screenshot failed (non-fatal)');
    });

    const title = await page.title();
    const finalUrl = page.url();

    await browser.close();

    return {
      success: true,
      content,
      contentSize: content.length,
      screenshotPath,
      metadata: { title, finalUrl }
    };
  } catch (error) {
    await browser.close().catch(() => {});
    throw error;
  }
}

/**
 * Wait for bot protection challenge to resolve.
 * Detects Cloudflare, Akamai, and DataDome challenge pages by title.
 */
async function waitForBotProtection(page, maxWaitSeconds) {
  const startMs = Date.now();
  const maxMs = maxWaitSeconds * 1000;

  while (Date.now() - startMs < maxMs) {
    try {
      const title = await page.title();
      const isChallenged = BOT_CHALLENGE_PATTERNS.some(
        pattern => title.includes(pattern)
      );

      if (!isChallenged) {
        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        log('patchright', `Page ready (${elapsed}s)`);
        return;
      }
    } catch {
      // Page might be navigating
    }
    await sleep(500);
  }

  log('patchright', `Bot protection wait expired after ${maxWaitSeconds}s — proceeding anyway`);
}

/**
 * Try to dismiss cookie consent banners
 */
async function dismissCookieBanners(page) {
  const selectors = [
    '[data-testid="consent-accept-all"]',
    '#onetrust-accept-btn-handler',
    'button[id*="accept"]',
    '[class*="cookie"] button',
    'button:has-text("Accept")',
    'button:has-text("Accept All")',
    'button:has-text("Accept Cookies")',
    'button:has-text("I agree")',
  ];

  for (const sel of selectors) {
    try {
      const btn = await page.$(sel);
      if (btn) {
        await btn.click();
        await sleep(1000);
        break;
      }
    } catch {
      // Ignore — banner might not exist
    }
  }
}

/**
 * Tier 2: HTTP Fetch (for simple/static sites)
 */
async function fetchWithHttp(options) {
  log('http-fetch', 'Starting fetch', { url: options.url });

  const response = await fetch(options.url, {
    headers: {
      'User-Agent': options.userAgent,
      'Accept': 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': `${options.locale},en;q=0.5`
    },
    signal: AbortSignal.timeout(options.timeout)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const content = await response.text();

  if (content.length < 500) {
    throw new Error('HTTP fetch returned insufficient content (bot blocked?)');
  }

  const contentPath = path.join(options.outputDir, 'content.html');
  fs.writeFileSync(contentPath, content);

  return {
    success: true,
    content,
    contentSize: content.length,
    metadata: { statusCode: response.status }
  };
}

/**
 * Tier 3: WebSearch Fallback (research-based, degraded mode)
 */
async function fetchWithWebSearch(options) {
  log('websearch-fallback', 'Creating research-based content', { url: options.url });

  const urlObj = new URL(options.url);
  const domain = urlObj.hostname;

  const researchContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Research Required: ${options.url}</title>
  <meta name="fetch-method" content="websearch-fallback">
  <meta name="fetch-status" content="degraded">
  <meta name="original-url" content="${options.url}">
  <meta name="fetch-date" content="${new Date().toISOString()}">
</head>
<body>
  <h1>Manual Research Required</h1>
  <p><strong>Status:</strong> All automated fetch tiers failed.</p>
  <p><strong>Target URL:</strong> ${options.url}</p>
  <p><strong>Domain:</strong> ${domain}</p>
  <hr>
  <h2>Recommended Actions:</h2>
  <ol>
    <li>Use WebSearch tool to research "${domain} features functionality"</li>
    <li>Check if site requires authentication or has strict bot protection</li>
    <li>Consider manual browser inspection</li>
  </ol>
  <p><em>This is a degraded fallback. Analysis based on this content will be limited.</em></p>
</body>
</html>
`;

  const contentPath = path.join(options.outputDir, 'content.html');
  fs.writeFileSync(contentPath, researchContent);

  return {
    success: true,
    content: researchContent,
    contentSize: researchContent.length,
    metadata: {
      note: 'Degraded mode - research-based content',
      manualResearchRequired: true
    }
  };
}

// ============================================================================
// Tier Dispatcher
// ============================================================================

const TIER_HANDLERS = {
  'patchright': fetchWithPatchright,
  'http-fetch': fetchWithHttp,
  'websearch-fallback': fetchWithWebSearch
};

// ============================================================================
// Main Cascade Logic
// ============================================================================

async function fetchWithCascade(options) {
  fs.mkdirSync(options.outputDir, { recursive: true });

  const result = {
    success: false,
    url: options.url,
    tier: null,
    status: 'failed',
    content: null,
    contentSize: 0,
    screenshotPath: null,
    tiersAttempted: [],
    tierErrors: {},
    metadata: {}
  };

  const tiersToTry = TIERS.filter(t => !options.skipTiers.includes(t));

  for (const tier of tiersToTry) {
    result.tiersAttempted.push(tier);
    log(tier, `Attempting fetch (timeout: ${options.timeout}ms)`);

    try {
      const handler = TIER_HANDLERS[tier];
      const tierResult = await withTimeout(
        handler(options),
        options.timeout,
        tier
      );

      if (tierResult.success && tierResult.content) {
        result.success = true;
        result.tier = tier;
        result.status = tier === 'websearch-fallback' ? 'degraded' : 'success';
        result.content = tierResult.content;
        result.contentSize = tierResult.contentSize;
        result.screenshotPath = tierResult.screenshotPath || null;
        result.metadata = tierResult.metadata || {};

        log(tier, `SUCCESS: ${result.contentSize} bytes`);
        break;
      }
    } catch (error) {
      const errorMsg = error.message || String(error);
      result.tierErrors[tier] = errorMsg;
      log(tier, `FAILED: ${errorMsg}`);
    }
  }

  // Save result metadata
  const resultPath = path.join(options.outputDir, 'fetch-result.json');
  const resultData = { ...result };
  delete resultData.content; // Don't duplicate content in JSON
  fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2));

  return result;
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
  const options = parseArgs();

  console.error('');
  console.error('╔════════════════════════════════════════════════════════════════╗');
  console.error('║              FETCH CONTENT - 3-TIER CASCADE                   ║');
  console.error('╠════════════════════════════════════════════════════════════════╣');
  console.error(`║  URL: ${options.url.substring(0, 54).padEnd(54)} ║`);
  console.error(`║  Output: ${options.outputDir.substring(0, 51).padEnd(51)} ║`);
  console.error(`║  Timeout: ${String(options.timeout).padEnd(6)}ms  Stealth wait: ${String(options.stealthWaitSeconds).padEnd(3)}s              ║`);
  console.error(`║  Resource blocking: ${options.resourceBlocking.padEnd(40)} ║`);
  console.error('║  Tiers: Patchright → HTTP Fetch → WebSearch                  ║');
  console.error('╚════════════════════════════════════════════════════════════════╝');
  console.error('');

  try {
    const result = await fetchWithCascade(options);

    // Output final result to stdout (for programmatic use)
    console.log(JSON.stringify({
      success: result.success,
      tier: result.tier,
      status: result.status,
      contentSize: result.contentSize,
      screenshotPath: result.screenshotPath,
      contentPath: path.join(options.outputDir, 'content.html'),
      resultPath: path.join(options.outputDir, 'fetch-result.json'),
      tiersAttempted: result.tiersAttempted,
      tierErrors: result.tierErrors
    }, null, 2));

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
}

main();

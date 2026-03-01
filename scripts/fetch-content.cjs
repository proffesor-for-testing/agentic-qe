#!/usr/bin/env node
/**
 * Fetch Content CLI - 5-Tier Browser Cascade with Per-Tier Timeouts
 *
 * Single entry point for all browser content fetching operations.
 * Automatically cascades through tiers with 30s timeout each.
 *
 * Usage:
 *   node scripts/fetch-content.js <URL> <OUTPUT_DIR> [OPTIONS]
 *
 * Options:
 *   --timeout <ms>      Per-tier timeout (default: 30000)
 *   --skip-tiers <list> Comma-separated tiers to skip
 *   --locale <locale>   Browser locale (default: en-US)
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
 * @version 1.0.0
 * @since v3
 */

const { exec, execSync, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TIER_TIMEOUT = 30000; // 30 seconds per tier
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';

const TIERS = [
  'vibium',
  'playwright-stealth',
  'http-fetch',
  'websearch-fallback'
];

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node fetch-content.js <URL> <OUTPUT_DIR> [OPTIONS]');
    console.error('');
    console.error('Options:');
    console.error('  --timeout <ms>      Per-tier timeout (default: 30000)');
    console.error('  --skip-tiers <list> Comma-separated tiers to skip');
    console.error('  --locale <locale>   Browser locale (default: en-US)');
    process.exit(2);
  }

  const options = {
    url: args[0],
    outputDir: args[1],
    timeout: DEFAULT_TIER_TIMEOUT,
    skipTiers: [],
    locale: 'en-US',
    userAgent: DEFAULT_USER_AGENT
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

// ============================================================================
// Tier Implementations
// ============================================================================

/**
 * Tier 1: Vibium MCP Browser
 * Note: Vibium requires MCP context - skip in CLI mode
 */
async function fetchWithVibium(options) {
  log('vibium', 'Skipping - requires MCP context');
  throw new Error('Vibium requires MCP context, not available in CLI');
}

/**
 * Tier 2: Playwright + Stealth (PRIMARY for CLI)
 */
async function fetchWithPlaywrightStealth(options) {
  log('playwright-stealth', 'Starting fetch', { url: options.url });

  const workDir = path.join(options.outputDir, '.playwright-work');
  fs.mkdirSync(workDir, { recursive: true });

  // Check if playwright is installed globally or locally
  const packageJsonPath = path.join(workDir, 'package.json');
  if (!fs.existsSync(path.join(workDir, 'node_modules', 'playwright-extra'))) {
    fs.writeFileSync(packageJsonPath, JSON.stringify({ name: 'pw-fetch', type: 'commonjs' }));

    log('playwright-stealth', 'Installing dependencies...');
    try {
      execSync('npm install playwright-extra puppeteer-extra-plugin-stealth playwright 2>/dev/null', {
        cwd: workDir,
        stdio: 'pipe',
        timeout: 60000
      });
    } catch (e) {
      log('playwright-stealth', 'Install warning', { error: e.message });
    }
  }

  const scriptPath = path.join(workDir, 'fetch.js');
  const contentPath = path.join(options.outputDir, 'content.html');
  const screenshotPath = path.join(options.outputDir, 'screenshot.png');

  const script = `
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });

  const context = await browser.newContext({
    userAgent: ${JSON.stringify(options.userAgent)},
    viewport: { width: 1920, height: 1080 },
    locale: ${JSON.stringify(options.locale)}
  });

  const page = await context.newPage();

  try {
    await page.goto(${JSON.stringify(options.url)}, {
      waitUntil: 'domcontentloaded',
      timeout: ${options.timeout - 5000}
    });

    await page.waitForTimeout(2000);

    // Dismiss cookie banners
    const cookieSelectors = [
      '[data-testid="consent-accept-all"]',
      '#onetrust-accept-btn-handler',
      'button[id*="accept"]',
      '[class*="cookie"] button',
      'button:has-text("Accept")',
      'button:has-text("Acceptă")'
    ];

    for (const sel of cookieSelectors) {
      try {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          await page.waitForTimeout(1000);
          break;
        }
      } catch (e) {}
    }

    const content = await page.content();
    require('fs').writeFileSync(${JSON.stringify(contentPath)}, content);
    await page.screenshot({ path: ${JSON.stringify(screenshotPath)} });

    console.log(JSON.stringify({
      success: true,
      size: content.length,
      title: await page.title(),
      url: page.url()
    }));
  } finally {
    await browser.close();
  }
})().catch(e => {
  console.log(JSON.stringify({ success: false, error: e.message }));
  process.exit(1);
});
`;

  fs.writeFileSync(scriptPath, script);

  const { stdout } = await execAsync(`node "${scriptPath}"`, {
    cwd: workDir,
    timeout: options.timeout
  });

  const result = JSON.parse(stdout.trim());
  if (!result.success) {
    throw new Error(result.error);
  }

  const content = fs.readFileSync(contentPath, 'utf8');

  return {
    success: true,
    content,
    contentSize: content.length,
    screenshotPath,
    metadata: { title: result.title, finalUrl: result.url }
  };
}

/**
 * Tier 3: HTTP Fetch (for simple/static sites)
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
 * Tier 4: WebSearch Fallback (research-based, degraded mode)
 */
async function fetchWithWebSearch(options) {
  log('websearch-fallback', 'Creating research-based content', { url: options.url });

  // This tier creates a placeholder indicating manual research is needed
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
  'vibium': fetchWithVibium,
  'playwright-stealth': fetchWithPlaywrightStealth,
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
  console.error('║              FETCH CONTENT - 5-TIER CASCADE                    ║');
  console.error('╠════════════════════════════════════════════════════════════════╣');
  console.error(`║  URL: ${options.url.substring(0, 54).padEnd(54)} ║`);
  console.error(`║  Output: ${options.outputDir.substring(0, 51).padEnd(51)} ║`);
  console.error(`║  Timeout per tier: ${options.timeout}ms                                  ║`);
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

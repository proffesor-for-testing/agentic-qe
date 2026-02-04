#!/usr/bin/env npx tsx
/**
 * Adidas Order-to-Cash — Interactive Demo Walkthrough
 *
 * Uses Playwright to drive the storefront UI through a complete order flow,
 * capturing full-page screenshots at each stage.
 *
 * Usage:
 *   # Headless mode (works everywhere, saves screenshots)
 *   npx tsx demo-walkthrough.ts
 *
 *   # Headed mode with Xvfb (virtual display, saves screenshots)
 *   npx tsx demo-walkthrough.ts --headed
 *
 *   # Headed mode with real display (VNC/noVNC, live browser window)
 *   DISPLAY=:1 npx tsx demo-walkthrough.ts --headed
 *
 *   # With video recording
 *   npx tsx demo-walkthrough.ts --video
 *
 *   # Slow-mo for visual demos (ms delay between actions)
 *   npx tsx demo-walkthrough.ts --headed --slow-mo 500
 *
 * Wrapper script (handles Xvfb automatically):
 *   ./run-demo-walkthrough.sh              # headless
 *   ./run-demo-walkthrough.sh --headed     # auto-starts Xvfb
 *   ./run-demo-walkthrough.sh --video      # with video recording
 *
 * Prerequisites:
 *   - Services running: npx tsx services/start-all.ts
 *   - Playwright installed: npx playwright install chromium
 */

import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI Args ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const HEADED = args.includes('--headed');
const VIDEO = args.includes('--video');
const SLOW_MO = args.includes('--slow-mo')
  ? parseInt(args[args.indexOf('--slow-mo') + 1] || '300', 10)
  : HEADED ? 200 : 0;
const SCREENSHOT_DIR = join(__dirname, 'screenshots');

// ── Helpers ─────────────────────────────────────────────────────────────

function log(step: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`  [${ts}] ${step.padEnd(20)} ${msg}`);
}

async function screenshot(page: Page, name: string) {
  const path = join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  log('SCREENSHOT', name);
}

async function delay(ms: number) {
  if (ms > 0) await new Promise(r => setTimeout(r, ms));
}

// ── Demo Customers ───────────────────────────────────────────────────────

const CUSTOMERS = {
  happy:    { name: 'Max Mustermann', email: 'max.mustermann@adidas.de', address: 'Adi-Dassler-Str. 1, 91074 Herzogenaurach' },
  failure:  { name: 'Anna Schmidt',   email: 'anna.schmidt@adidas.de',   address: 'Leopoldstr. 42, 80802 Munich' },
  recovery: { name: 'Lukas Weber',    email: 'lukas.weber@adidas.de',    address: 'Zeil 112, 60313 Frankfurt am Main' },
};

// ── Main ────────────────────────────────────────────────────────────────

async function addProductsAndCheckout(page: Page) {
  await page.waitForSelector('[data-testid="product-ultraboost"]', { state: 'visible', timeout: 10000 });
  await delay(500);
  await page.click('[data-testid="product-ultraboost"]');
  await delay(300);
  await page.click('[data-testid="product-jersey"]');
  await delay(300);
  await page.click('[data-testid="product-bag"]');
  await delay(300);
  await page.click('[data-testid="checkout-button"]');
  await delay(300);
}

async function fillAndSubmit(page: Page, customer: typeof CUSTOMERS.happy) {
  await page.fill('[data-testid="input-name"]', customer.name);
  await page.fill('[data-testid="input-email"]', customer.email);
  await page.fill('[data-testid="input-address"]', customer.address);
  await delay(200);
  await page.click('[data-testid="submit-order"]');
  await page.waitForSelector('#pipeline.active', { timeout: 5000 });
  await page.evaluate(() => {
    document.getElementById('pipeline')?.scrollIntoView({ behavior: 'smooth' });
  });
  await page.waitForSelector('#confirmation.active', { timeout: 30000 });
  await delay(500);
}

async function main() {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('\n  Adidas Order-to-Cash — Demo Walkthrough');
  console.log('  ========================================');
  console.log(`  Mode:       ${HEADED ? 'HEADED' : 'HEADLESS'}`);
  console.log(`  Video:      ${VIDEO ? 'ON' : 'OFF'}`);
  console.log(`  Slow-mo:    ${SLOW_MO}ms`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log(`  Display:    ${process.env.DISPLAY || '(none — headless)'}`);
  console.log('');
  console.log('  Customers:');
  console.log(`    Phase 1 (Happy Path): ${CUSTOMERS.happy.name}`);
  console.log(`    Phase 2 (Failure):    ${CUSTOMERS.failure.name}`);
  console.log(`    Phase 3 (Recovery):   ${CUSTOMERS.recovery.name}`);
  console.log('');

  // ── Launch Browser ──────────────────────────────────────────────────

  const launchOptions: Parameters<typeof chromium.launch>[0] = {
    headless: !HEADED,
    slowMo: SLOW_MO,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };

  const browser: Browser = await chromium.launch(launchOptions);

  const contextOptions: Parameters<typeof browser.newContext>[0] = {
    viewport: { width: 1280, height: 900 },
    ...(VIDEO && {
      recordVideo: {
        dir: join(SCREENSHOT_DIR, 'video'),
        size: { width: 1280, height: 900 },
      },
    }),
  };

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();

  try {
    // ════════════════════════════════════════════════════════════════
    // PHASE 1 — Happy Path: Max Mustermann
    // ════════════════════════════════════════════════════════════════

    log('NAVIGATE', 'Storefront → http://localhost:3001');
    await page.goto('http://localhost:3001', { waitUntil: 'load' });
    await screenshot(page, '01-storefront-landing');

    // Add products to cart
    log('ACTION', 'Adding 3 products to cart');
    await page.click('[data-testid="product-ultraboost"]');
    await delay(300);
    await page.click('[data-testid="product-jersey"]');
    await delay(300);
    await page.click('[data-testid="product-bag"]');
    await delay(300);

    await page.evaluate(() => {
      document.getElementById('cart-summary')?.scrollIntoView({ behavior: 'smooth' });
    });
    await delay(500);
    await screenshot(page, '02-cart-full');

    // Checkout
    log('ACTION', 'Proceeding to checkout');
    await page.click('[data-testid="checkout-button"]');
    await delay(300);
    await page.evaluate(() => {
      document.getElementById('checkout-panel')?.scrollIntoView({ behavior: 'smooth' });
    });
    await delay(300);

    log('ACTION', `Filling checkout as ${CUSTOMERS.happy.name}`);
    await page.fill('[data-testid="input-name"]', CUSTOMERS.happy.name);
    await page.fill('[data-testid="input-email"]', CUSTOMERS.happy.email);
    await page.fill('[data-testid="input-address"]', CUSTOMERS.happy.address);
    await screenshot(page, '03-checkout-max');

    // Place order
    log('ACTION', `Placing order for ${CUSTOMERS.happy.name}`);
    await page.click('[data-testid="submit-order"]');
    await page.waitForSelector('#pipeline.active', { timeout: 5000 });
    await page.evaluate(() => {
      document.getElementById('pipeline')?.scrollIntoView({ behavior: 'smooth' });
    });
    await page.waitForSelector('#confirmation.active', { timeout: 30000 });
    await delay(500);

    const orderId = await page.textContent('#order-id');
    const status = await page.textContent('#order-status');
    const systems = await page.textContent('#order-systems');
    log('RESULT', `${CUSTOMERS.happy.name}: ${orderId} — ${status} (${systems})`);
    await screenshot(page, '04-pipeline-complete');

    await page.evaluate(() => {
      document.getElementById('confirmation')?.scrollIntoView({ behavior: 'smooth' });
    });
    await delay(300);
    await screenshot(page, '05-order-confirmation');

    // Kibana — verify happy path logged
    log('NAVIGATE', 'Kibana → verifying happy path order');
    await page.goto('http://localhost:3007', { waitUntil: 'load' });
    await delay(2500);
    await screenshot(page, '06-kibana-happy-path');

    await page.evaluate(() => {
      document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth' });
    });
    await delay(300);
    await screenshot(page, '07-kibana-1-order');

    // ════════════════════════════════════════════════════════════════
    // PHASE 2 — Failure Injection: Anna Schmidt
    // ════════════════════════════════════════════════════════════════

    log('FAILURE', 'Injecting failure into SAP S/4 on port 3006');
    await fetch('http://localhost:3006/admin/fail', { method: 'POST' });
    await delay(1000);

    log('NAVIGATE', 'Storefront → new order with SAP down');
    await page.goto('http://localhost:3001', { waitUntil: 'load' });
    await delay(500);

    log('ACTION', `Adding products & checkout as ${CUSTOMERS.failure.name}`);
    await addProductsAndCheckout(page);

    log('ACTION', `Filling checkout as ${CUSTOMERS.failure.name} (SAP is down)`);
    await fillAndSubmit(page, CUSTOMERS.failure);

    const failedOrderId = await page.textContent('#order-id');
    const failedStatus = await page.textContent('#order-status');
    log('RESULT', `${CUSTOMERS.failure.name}: ${failedOrderId} — ${failedStatus} (SAP failure)`);
    await screenshot(page, '08-pipeline-failed');

    // Show error output
    const hasErrorOutput = await page.$('#error-output.active');
    if (hasErrorOutput) {
      await page.evaluate(() => {
        document.getElementById('error-output')?.scrollIntoView({ behavior: 'smooth' });
      });
      await delay(500);
      await screenshot(page, '09-error-output');
    }

    // Kibana — verify failure logged
    log('NAVIGATE', 'Kibana → verifying failure is logged');
    await page.goto('http://localhost:3007', { waitUntil: 'load' });
    await delay(2500);

    await page.evaluate(() => {
      document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth' });
    });
    await delay(300);
    await screenshot(page, '10-kibana-2-orders');

    // ════════════════════════════════════════════════════════════════
    // PHASE 3 — Self-Healing Recovery: Lukas Weber
    // ════════════════════════════════════════════════════════════════

    log('RECOVERY', 'Self-healing: recovering SAP S/4 on port 3006');
    await fetch('http://localhost:3006/admin/recover', { method: 'POST' });
    await delay(1500);

    log('NAVIGATE', 'Storefront → post-recovery order');
    await page.goto('http://localhost:3001', { waitUntil: 'load' });
    await delay(500);

    log('ACTION', `Adding products & checkout as ${CUSTOMERS.recovery.name}`);
    await addProductsAndCheckout(page);

    log('ACTION', `Filling checkout as ${CUSTOMERS.recovery.name} (SAP recovered)`);
    await fillAndSubmit(page, CUSTOMERS.recovery);

    const recoveredOrderId = await page.textContent('#order-id');
    const recoveredStatus = await page.textContent('#order-status');
    const recoveredSystems = await page.textContent('#order-systems');
    log('RESULT', `${CUSTOMERS.recovery.name}: ${recoveredOrderId} — ${recoveredStatus} (${recoveredSystems})`);
    await screenshot(page, '11-pipeline-recovered');

    // Kibana — full story: all 3 orders
    log('NAVIGATE', 'Kibana → all 3 orders (success + failure + recovery)');
    await page.goto('http://localhost:3007', { waitUntil: 'load' });
    await delay(2500);
    await screenshot(page, '12-kibana-final');

    await page.evaluate(() => {
      document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth' });
    });
    await delay(300);
    await screenshot(page, '13-kibana-all-3-orders');

    // ── Summary ─────────────────────────────────────────────────────
    console.log('\n  ────────────────────────────────────────');
    console.log('  Demo Walkthrough Complete');
    console.log('  ────────────────────────────────────────');
    console.log(`  Phase 1: ${CUSTOMERS.happy.name} → ${orderId} — ${status} (${systems})`);
    console.log(`  Phase 2: ${CUSTOMERS.failure.name} → ${failedOrderId} — ${failedStatus} (SAP failure)`);
    console.log(`  Phase 3: ${CUSTOMERS.recovery.name} → ${recoveredOrderId} — ${recoveredStatus} (${recoveredSystems})`);
    console.log(`  Screenshots saved to: ${SCREENSHOT_DIR}/`);

    if (VIDEO) {
      console.log(`  Video saved to: ${SCREENSHOT_DIR}/video/`);
    }

    console.log('');

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('ERROR', msg);
    await screenshot(page, '99-error-state');
    throw err;
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch(err => {
  console.error(`\n  Fatal: ${err.message}\n`);
  process.exit(1);
});

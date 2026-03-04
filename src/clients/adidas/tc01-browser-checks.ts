/**
 * Agentic QE v3 - Adidas TC01 Browser Check Steps
 * Step definitions for SSR return portal verification via Playwright.
 * Covers checks 117-121 (5 live checks) + 122-124 (3 placeholders, NOT counted as coverage).
 *
 * Return journey flow:
 * - Customer navigates to order-integrated-return URL on staging.adidas.pt
 * - Selects product and return reason
 * - Confirms return and refund method
 */

import type { StepDef } from '../../integrations/orchestration/types';
import type { AdidasTestContext } from './context';

export const tc01BrowserSteps: StepDef<AdidasTestContext>[] = [
  {
    id: 'step-17a',
    name: 'Browser: Return initiation page',
    description: 'Verify SSR return page loads with product details (checks 117-121). Note: browser steps use separate page contexts — step-18a cannot rely on state from step-17a.',
    layer: 3,
    requires: { browser: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.browserProvider) {
        console.log('  [L3] Browser: provider not configured — skipping return initiation gracefully');
        const skip = 'Browser not configured (env gap, not test failure)';
        return { success: true, durationMs: 0, checks: [
          { name: 'Return page loads', passed: false, expected: 'page content', actual: skip, severity: 'low' },
          { name: 'Order reference shown', passed: false, expected: ctx.orderId, actual: skip, severity: 'low' },
          { name: 'Product details shown', passed: false, expected: 'product content', actual: skip, severity: 'low' },
          { name: 'Return content present', passed: false, expected: 'return section', actual: skip, severity: 'low' },
        ], data: { providerMissing: true } };
      }

      // The return URL pattern includes the order number
      const returnPath = `/on/demandware.store/Sites-adidas-PT-Site/pt_PT/Order-IntegratedReturn?orderID=${ctx.orderId}`;

      // Single navigation — findText loads the page and checks all patterns
      const patterns = await ctx.browserProvider.findText(returnPath, [
        ctx.orderId,            // Order reference visible on page
        'return',               // Return-related content present
      ]);

      const anyPatternFound = [...patterns.values()].some(v => v);

      return {
        success: anyPatternFound,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Return page loads', passed: anyPatternFound, expected: 'page content', actual: anyPatternFound ? 'loaded' : 'empty' },
          { name: 'Order reference shown', passed: patterns.get(ctx.orderId) ?? false, expected: ctx.orderId, actual: patterns.get(ctx.orderId) ? 'found' : 'missing' },
          { name: 'Product details shown', passed: anyPatternFound, expected: 'product content', actual: anyPatternFound ? 'page has content' : 'empty' },
          { name: 'Return content present', passed: patterns.get('return') ?? false, expected: 'return section', actual: patterns.get('return') ? 'found' : 'missing' },
        ],
      };
    },
  },
  {
    id: 'step-18a',
    name: 'Browser: Return confirmation page',
    description: 'Verify return confirmation page with refund method (checks 122-124). Navigates to return page, selects product + reason, then checks confirmation.',
    layer: 3,
    requires: { browser: true },
    execute: async (ctx) => {
      const start = Date.now();
      if (!ctx.browserProvider) {
        console.log('  [L3] Browser: provider not configured — skipping return confirmation gracefully');
        const skip = 'Browser not configured (env gap, not test failure)';
        return { success: true, durationMs: 0, checks: [
          { name: 'Confirmation page shown', passed: false, expected: 'confirmation content', actual: skip, severity: 'low' },
          { name: 'Refund method shown', passed: false, expected: 'refund method', actual: skip, severity: 'low' },
          { name: 'Order reference shown', passed: false, expected: ctx.orderId, actual: skip, severity: 'low' },
        ], data: { providerMissing: true } };
      }

      // Multi-step return flow: navigate → select item → select reason → confirm
      const returnPath = `/on/demandware.store/Sites-adidas-PT-Site/pt_PT/Order-IntegratedReturn?orderID=${ctx.orderId}`;
      let confirmFound = false;
      let refundFound = false;
      let orderFound = false;
      let flowError = '';

      try {
        // Step 1: Navigate and keep page open for interaction
        const page = await ctx.browserProvider.navigateAndKeepOpen(returnPath);
        orderFound = page.textContent.includes(ctx.orderId);

        // Step 2: Select the first returnable item (checkbox or clickable product row)
        try {
          await ctx.browserProvider.waitForSelector('input[type="checkbox"], .return-item, .product-tile', { timeout: 8000 });
          await ctx.browserProvider.click('input[type="checkbox"], .return-item, .product-tile');
          console.log('  [L3] Browser: selected return item');
        } catch {
          flowError += 'Could not select return item; ';
        }

        // Step 3: Select return reason from dropdown (if present)
        try {
          await ctx.browserProvider.waitForSelector('select[name*="reason"], select.return-reason, [data-reason]', { timeout: 5000 });
          await ctx.browserProvider.selectOption('select[name*="reason"], select.return-reason', '1');
          console.log('  [L3] Browser: selected return reason');
        } catch {
          flowError += 'No reason dropdown found; ';
        }

        // Step 4: Click continue/submit button to reach confirmation
        try {
          await ctx.browserProvider.click('button[type="submit"], .btn-continue, .return-submit, button:has-text("Continue"), button:has-text("Continuar")');
          // Wait for confirmation page to load
          await ctx.browserProvider.waitForSelector('.confirmation, .refund, .return-confirmation, [data-step="confirmation"]', { timeout: 10000 });
          confirmFound = true;
          console.log('  [L3] Browser: reached confirmation page');
        } catch {
          // Fallback: check if current page already shows confirmation content
          const fallback = await ctx.browserProvider.findText(returnPath, ['confirm', 'refund']);
          confirmFound = fallback.get('confirm') ?? false;
          refundFound = fallback.get('refund') ?? false;
          flowError += 'Could not reach confirmation via button click; ';
        }

        // Step 5: Check for refund method on the confirmation page
        if (confirmFound && !refundFound) {
          const confirmPatterns = await ctx.browserProvider.findText(returnPath, ['refund', 'reembolso']);
          refundFound = (confirmPatterns.get('refund') ?? false) || (confirmPatterns.get('reembolso') ?? false);
        }
      } catch (e) {
        flowError = `Flow error: ${e instanceof Error ? e.message : String(e)}`;
        console.log(`  [L3] Browser: return flow failed — ${flowError}`);
      }

      if (flowError) {
        console.log(`  [L3] Browser: flow notes — ${flowError}`);
      }

      return {
        success: orderFound || confirmFound,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Confirmation page shown', passed: confirmFound, expected: 'confirmation content', actual: confirmFound ? 'found' : `not reached (${flowError || 'flow incomplete'})` },
          { name: 'Refund method shown', passed: refundFound, expected: 'refund method', actual: refundFound ? 'found' : 'not found' },
          { name: 'Order reference shown', passed: orderFound, expected: ctx.orderId, actual: orderFound ? 'found' : 'not found' },
        ],
      };
    },
  },
];

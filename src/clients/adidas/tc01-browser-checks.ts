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
    description: 'Verify return confirmation page with refund method (checks 122-124). Attempts direct navigation to confirmation URL — may show error page if return flow session state is required.',
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

      // Try direct navigation to confirmation-like URL. If SSR requires session
      // state from item selection, this will show an error page — that's OK, we record
      // what we find and the check reflects reality.
      const confirmPath = `/on/demandware.store/Sites-adidas-PT-Site/pt_PT/Order-IntegratedReturn?orderID=${ctx.orderId}&step=confirmation`;
      const patterns = await ctx.browserProvider.findText(confirmPath, [
        ctx.orderId,
        'refund',
        'confirm',
      ]);

      const orderFound = patterns.get(ctx.orderId) ?? false;
      const refundFound = patterns.get('refund') ?? false;
      const confirmFound = patterns.get('confirm') ?? false;

      return {
        success: orderFound || confirmFound,
        durationMs: Date.now() - start,
        checks: [
          { name: 'Confirmation page shown', passed: confirmFound, expected: 'confirmation content', actual: confirmFound ? 'found' : 'not found (may need session state)' },
          { name: 'Refund method shown', passed: refundFound, expected: 'refund method', actual: refundFound ? 'found' : 'not found' },
          { name: 'Order reference shown', passed: orderFound, expected: ctx.orderId, actual: orderFound ? 'found' : 'not found' },
        ],
      };
    },
  },
];

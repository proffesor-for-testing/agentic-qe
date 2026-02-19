/**
 * Agentic QE v3 - Adidas Playwright Return Journey
 * STATUS: PLANNED — not yet implemented.
 * Blocked on: staging.adidas.pt test account from Adidas digital team.
 */

export const playwrightReturnJourneyPlan = {
  status: 'planned' as const,
  dependency: '@playwright/test',
  testFile: 'v3/tests/e2e/adidas/return-journey.spec.ts',
  checks: 7,
  blockedBy: 'staging.adidas.pt test account (Adidas digital team)',
} as const;

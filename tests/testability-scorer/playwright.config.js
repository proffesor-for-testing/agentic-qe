const { defineConfig } = require('@playwright/test');

/**
 * Testability Scorer Playwright Configuration
 *
 * IMPORTANT: This config enforces SERIAL execution (workers: 1)
 * to ensure all 10 principles are properly captured in the shared
 * testabilityScores object before HTML report generation.
 */
module.exports = defineConfig({
  testDir: '.',
  timeout: 30000,

  // CRITICAL: Serial execution required for accurate testability scoring
  fullyParallel: false,
  workers: 1,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,

  reporter: [
    ['html', { outputFolder: '../../tests/reports/html' }],
    ['json', { outputFile: '../../tests/reports/latest.json' }]
  ],

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        channel: 'chromium',
        viewport: { width: 1280, height: 720 }
      },
    },
  ],
});

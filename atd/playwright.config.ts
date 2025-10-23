import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Agile Testing Days 2025 E2E Tests
 *
 * Test Plan: 67 BDD scenarios covering navigation, registration, payment, and more
 * Target: https://agiletestingdays.com/
 */
export default defineConfig({
  testDir: './tests',

  // Test execution settings
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 2,

  // Timeouts
  timeout: 60 * 1000, // 60 seconds per test
  expect: {
    timeout: 10 * 1000, // 10 seconds for assertions
  },

  // Reporting
  reporter: [
    ['html', { outputFolder: 'test-results/html-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list'],
  ],

  // Global test configuration
  use: {
    // Base URL for all tests
    baseURL: 'https://agiletestingdays.com',

    // Browser settings
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Timeouts
    actionTimeout: 15 * 1000,
    navigationTimeout: 30 * 1000,

    // Locale and timezone
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',

    // Viewport
    viewport: { width: 1280, height: 720 },

    // Ignore HTTPS errors (for test environments)
    ignoreHTTPSErrors: false,

    // User agent
    userAgent: 'Playwright E2E Tests - Agile Testing Days 2025',
  },

  // Test projects (browsers)
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process'],
        },
      },
    },
    // Uncomment for multi-browser testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Output folder
  outputDir: 'test-results/artifacts',
});

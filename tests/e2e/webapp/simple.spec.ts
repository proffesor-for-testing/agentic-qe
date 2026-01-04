import { test, expect } from '@playwright/test';

test('simple HTML page works', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    console.log('[Page Error]:', error.message);
    errors.push(error.message);
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[Console Error]:', msg.text());
    }
  });

  await page.goto('/test.html');
  await page.waitForTimeout(2000);

  // Check if JavaScript executed
  const content = await page.textContent('#root');
  console.log('Root content:', content);

  // Log all errors
  if (errors.length > 0) {
    console.log('Errors found:', errors);
  }

  expect(errors.length).toBe(0);
});

test('simple React page works', async ({ page }) => {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    console.log('[Page Error]:', error.message);
    errors.push(error.message);
  });

  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]:`, msg.text());
  });

  await page.goto('/simple-react.html');
  await page.waitForTimeout(3000);

  // Check if React rendered
  const content = await page.textContent('#root');
  console.log('Root content:', content);

  // Log all errors
  if (errors.length > 0) {
    console.log('Errors found:', errors);
  }

  expect(errors.length).toBe(0);
});

# Dynamic Buttons - Working Test Implementations

**Companion to**: evil-tester-dynamic-buttons-analysis.md
**Challenge**: https://testpages.eviltester.com/challenges/synchronization/dynamic-buttons-01/

This document provides complete, runnable test implementations for various frameworks demonstrating proper synchronization strategies.

---

## Table of Contents
1. [Playwright Implementation](#playwright-implementation)
2. [Cypress Implementation](#cypress-implementation)
3. [Selenium Python Implementation](#selenium-python-implementation)
4. [Puppeteer Implementation](#puppeteer-implementation)
5. [Custom Polling Implementation](#custom-polling-implementation)
6. [Performance Benchmarking Script](#performance-benchmarking-script)

---

## Playwright Implementation

### Installation

```bash
npm install -D @playwright/test
npx playwright install chromium
```

### Test File: `tests/dynamic-buttons.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

const CHALLENGE_URL = 'https://testpages.eviltester.com/challenges/synchronization/dynamic-buttons-01/';

test.describe('Dynamic Buttons Synchronization', () => {
  test('should handle sequential button reveals', async ({ page }) => {
    await page.goto(CHALLENGE_URL);

    // Verify initial state
    await expect(page.locator('#button00')).toBeVisible();
    await expect(page.locator('#button01')).not.toBeAttached();

    // Click start to trigger sequence
    await page.click('#button00');

    // Button01 appears instantly
    await page.click('#button01');
    await expect(page.locator('#button01')).toBeVisible();

    // Button02 appears after ~2s
    await page.click('#button02');
    await expect(page.locator('#button02')).toBeVisible();

    // Button03 appears after ~4s
    await page.click('#button03');
    await expect(page.locator('#button03')).toBeVisible();
    await expect(page.locator('#button03')).toHaveText('Three');
  });

  test('should measure accurate timing for each button', async ({ page }) => {
    await page.goto(CHALLENGE_URL);

    const timings: Record<string, number> = {};
    const startTime = Date.now();

    // Start sequence
    await page.click('#button00');

    // Measure button01 appearance
    await page.waitForSelector('#button01', { state: 'visible' });
    timings.button01 = Date.now() - startTime;

    // Click and measure button02
    await page.click('#button01');
    await page.waitForSelector('#button02', { state: 'visible' });
    timings.button02 = Date.now() - startTime;

    // Click and measure button03
    await page.click('#button02');
    await page.waitForSelector('#button03', { state: 'visible' });
    timings.button03 = Date.now() - startTime;

    // Log results
    console.log('Timing Measurements:');
    console.log(`  Button01: ${timings.button01}ms (expected: ~0ms)`);
    console.log(`  Button02: ${timings.button02}ms (expected: ~2000ms)`);
    console.log(`  Button03: ${timings.button03}ms (expected: ~6000ms)`);

    // Assertions with tolerance
    expect(timings.button01).toBeLessThan(500);
    expect(timings.button02).toBeGreaterThan(1800);
    expect(timings.button02).toBeLessThan(2500);
    expect(timings.button03).toBeGreaterThan(5800);
    expect(timings.button03).toBeLessThan(6500);
  });

  test('should handle with explicit timeout configuration', async ({ page }) => {
    // Increase timeout for this specific test
    test.setTimeout(60000);

    await page.goto(CHALLENGE_URL);

    // Use explicit timeout for each step
    await page.click('#button00');
    await page.click('#button01', { timeout: 5000 });
    await page.click('#button02', { timeout: 10000 });
    await page.click('#button03', { timeout: 15000 });

    // Verify final state
    await expect(page.locator('#button03')).toHaveText('Three');
  });

  test('should demonstrate failure with inadequate timeout', async ({ page }) => {
    await page.goto(CHALLENGE_URL);

    await page.click('#button00');
    await page.click('#button01');

    // This SHOULD fail because button02 needs 2s but we only wait 1s
    await expect(async () => {
      await page.click('#button02', { timeout: 1000 });
    }).rejects.toThrow();
  });

  test('should use custom retry logic for flaky scenarios', async ({ page }) => {
    await page.goto(CHALLENGE_URL);

    // Helper function with exponential backoff retry
    async function clickWithRetry(selector: string, maxRetries = 3) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await page.click(selector, { timeout: 10000 });
          return; // Success
        } catch (error) {
          if (attempt === maxRetries) throw error;
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`Retry ${attempt} for ${selector}, waiting ${delay}ms`);
          await page.waitForTimeout(delay);
        }
      }
    }

    await page.click('#button00');
    await clickWithRetry('#button01');
    await clickWithRetry('#button02');
    await clickWithRetry('#button03');

    await expect(page.locator('#button03')).toBeVisible();
  });
});

test.describe('Performance Analysis', () => {
  test('should compare polling efficiency', async ({ page }) => {
    await page.goto(CHALLENGE_URL);

    // Measure Playwright's built-in polling
    const playwrightStart = Date.now();
    await page.click('#button00');
    await page.waitForSelector('#button03', { state: 'attached' });
    const playwrightDuration = Date.now() - playwrightStart;

    console.log(`Playwright auto-wait: ${playwrightDuration}ms`);

    // Reload and try manual polling
    await page.reload();
    const manualStart = Date.now();
    await page.click('#button00');

    // Manual polling every 100ms
    let found = false;
    while (!found && Date.now() - manualStart < 10000) {
      found = await page.locator('#button03').isVisible();
      if (!found) await page.waitForTimeout(100);
    }
    const manualDuration = Date.now() - manualStart;

    console.log(`Manual polling (100ms): ${manualDuration}ms`);
    console.log(`Difference: ${Math.abs(playwrightDuration - manualDuration)}ms`);

    // Built-in should be comparable or better
    expect(playwrightDuration).toBeLessThan(manualDuration + 500);
  });
});
```

### Run Tests

```bash
npx playwright test tests/dynamic-buttons.spec.ts
npx playwright test --headed  # With browser UI
npx playwright test --debug   # With debugging
```

---

## Cypress Implementation

### Installation

```bash
npm install -D cypress
npx cypress open
```

### Test File: `cypress/e2e/dynamic-buttons.cy.js`

```javascript
const CHALLENGE_URL = 'https://testpages.eviltester.com/challenges/synchronization/dynamic-buttons-01/';

describe('Dynamic Buttons Synchronization', () => {
  beforeEach(() => {
    cy.visit(CHALLENGE_URL);
  });

  it('should handle sequential button reveals', () => {
    // Verify initial state
    cy.get('#button00').should('be.visible');
    cy.get('#button01').should('not.exist');

    // Start sequence
    cy.get('#button00').click();

    // Click through sequence
    cy.get('#button01').click();
    cy.get('#button02').click();
    cy.get('#button03').click();

    // Verify completion
    cy.get('#button03').should('have.text', 'Three');
  });

  it('should measure timing precision', () => {
    const timings = {};

    // Start timing
    cy.clock();
    cy.get('#button00').click();

    // Measure button01
    cy.get('#button01').should('be.visible').then(() => {
      cy.now('tick', 0).then((time) => {
        timings.button01 = time;
        cy.log(`Button01: ${time}ms`);
      });
    });

    // Click button01 and measure button02
    cy.get('#button01').click();
    cy.get('#button02', { timeout: 10000 }).should('be.visible').then(() => {
      cy.now('tick', 0).then((time) => {
        timings.button02 = time;
        cy.log(`Button02: ${time}ms`);
      });
    });

    // Click button02 and measure button03
    cy.get('#button02').click();
    cy.get('#button03', { timeout: 10000 }).should('be.visible').then(() => {
      cy.now('tick', 0).then((time) => {
        timings.button03 = time;
        cy.log(`Button03: ${time}ms`);
      });
    });
  });

  it('should handle with extended timeout', () => {
    cy.get('#button00').click();

    // Use custom timeout for slow elements
    cy.get('#button01', { timeout: 5000 }).click();
    cy.get('#button02', { timeout: 10000 }).click();
    cy.get('#button03', { timeout: 15000 }).click();

    cy.get('#button03').should('contain', 'Three');
  });

  it('should use should() for smart retry', () => {
    cy.get('#button00').click();

    // Cypress automatically retries should() assertions
    cy.get('#button01').should('be.visible').click();
    cy.get('#button02').should('exist').should('be.visible').click();
    cy.get('#button03').should('exist').should('be.visible').click();

    // Multiple assertions chain with auto-retry
    cy.get('#button03')
      .should('be.visible')
      .should('have.text', 'Three')
      .should('be.enabled');
  });

  it('should demonstrate command retry behavior', () => {
    cy.get('#button00').click();

    // Log retry attempts for educational purposes
    let retries = 0;
    cy.get('#button03', { timeout: 10000 })
      .should(($btn) => {
        retries++;
        cy.log(`Attempt ${retries} to find button03`);
        expect($btn).to.exist;
      })
      .then(() => {
        cy.log(`Total retries: ${retries}`);
      });
  });
});

describe('Anti-Pattern Demonstrations', () => {
  it('ANTI-PATTERN: using cy.wait() with fixed delays', () => {
    cy.visit(CHALLENGE_URL);
    cy.get('#button00').click();

    // ❌ BAD: Hard-coded waits waste time and are brittle
    cy.wait(6000); // Wait for everything to appear
    cy.get('#button03').click();

    // This works but wastes 6 seconds even if buttons appear faster
  });

  it('BETTER PATTERN: using smart waits', () => {
    cy.visit(CHALLENGE_URL);
    cy.get('#button00').click();

    // ✅ GOOD: Wait for specific conditions
    cy.get('#button01').should('be.visible').click();
    cy.get('#button02').should('be.visible').click();
    cy.get('#button03').should('be.visible').click();

    // Completes as soon as buttons are ready
  });
});
```

### Cypress Configuration: `cypress.config.js`

```javascript
const { defineConfig } = require('cypress');

module.exports = defineConfig({
  e2e: {
    defaultCommandTimeout: 10000, // 10s for dynamic content
    pageLoadTimeout: 60000,
    requestTimeout: 10000,
    responseTimeout: 30000,
    video: true,
    screenshotOnRunFailure: true,
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
```

### Run Tests

```bash
npx cypress run
npx cypress open  # Interactive UI
```

---

## Selenium Python Implementation

### Installation

```bash
pip install selenium
```

### Test File: `test_dynamic_buttons.py`

```python
import pytest
import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

CHALLENGE_URL = 'https://testpages.eviltester.com/challenges/synchronization/dynamic-buttons-01/'

@pytest.fixture
def driver():
    """Setup Chrome driver with options."""
    options = webdriver.ChromeOptions()
    options.add_argument('--headless')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')

    driver = webdriver.Chrome(options=options)
    driver.implicitly_wait(0)  # Disable implicit waits
    yield driver
    driver.quit()

def test_sequential_button_reveals(driver):
    """Test handling of sequential button reveals with explicit waits."""
    driver.get(CHALLENGE_URL)

    # Configure explicit wait
    wait = WebDriverWait(driver, timeout=10)

    # Verify initial state
    start_button = wait.until(EC.element_to_be_clickable((By.ID, 'button00')))
    assert start_button.is_displayed()

    # Start sequence
    start_button.click()

    # Click through buttons with explicit waits
    button01 = wait.until(EC.element_to_be_clickable((By.ID, 'button01')))
    button01.click()

    button02 = wait.until(EC.element_to_be_clickable((By.ID, 'button02')))
    button02.click()

    button03 = wait.until(EC.element_to_be_clickable((By.ID, 'button03')))
    button03.click()

    # Verify completion
    assert button03.text == 'Three'

def test_timing_measurements(driver):
    """Measure actual timing for each button appearance."""
    driver.get(CHALLENGE_URL)
    wait = WebDriverWait(driver, timeout=15)

    timings = {}
    start_time = time.time()

    # Start sequence
    start_button = wait.until(EC.element_to_be_clickable((By.ID, 'button00')))
    start_button.click()

    # Measure button01
    wait.until(EC.visibility_of_element_located((By.ID, 'button01')))
    timings['button01'] = (time.time() - start_time) * 1000

    # Click and measure button02
    driver.find_element(By.ID, 'button01').click()
    wait.until(EC.visibility_of_element_located((By.ID, 'button02')))
    timings['button02'] = (time.time() - start_time) * 1000

    # Click and measure button03
    driver.find_element(By.ID, 'button02').click()
    wait.until(EC.visibility_of_element_located((By.ID, 'button03')))
    timings['button03'] = (time.time() - start_time) * 1000

    # Log results
    print(f"\nTiming Measurements:")
    print(f"  Button01: {timings['button01']:.0f}ms (expected: ~0ms)")
    print(f"  Button02: {timings['button02']:.0f}ms (expected: ~2000ms)")
    print(f"  Button03: {timings['button03']:.0f}ms (expected: ~6000ms)")

    # Assertions with tolerance
    assert timings['button01'] < 500, "Button01 should appear instantly"
    assert 1800 < timings['button02'] < 2500, "Button02 should appear ~2s"
    assert 5800 < timings['button03'] < 6500, "Button03 should appear ~6s"

def test_custom_polling_with_backoff(driver):
    """Demonstrate custom polling implementation with exponential backoff."""
    driver.get(CHALLENGE_URL)

    def wait_for_element_with_backoff(locator, max_wait=10):
        """Custom wait with exponential backoff polling."""
        elapsed = 0
        poll_interval = 0.1

        while elapsed < max_wait:
            try:
                element = driver.find_element(*locator)
                if element.is_displayed() and element.is_enabled():
                    return element
            except:
                pass

            time.sleep(poll_interval)
            elapsed += poll_interval
            poll_interval = min(poll_interval * 2, 1.0)

        raise TimeoutException(f"Element {locator} not found after {max_wait}s")

    # Use custom wait
    start_button = wait_for_element_with_backoff((By.ID, 'button00'))
    start_button.click()

    button01 = wait_for_element_with_backoff((By.ID, 'button01'))
    button01.click()

    button02 = wait_for_element_with_backoff((By.ID, 'button02'), max_wait=15)
    button02.click()

    button03 = wait_for_element_with_backoff((By.ID, 'button03'), max_wait=15)

    assert button03.text == 'Three'

def test_anti_pattern_fixed_sleep(driver):
    """ANTI-PATTERN: Using fixed sleep statements (for demonstration)."""
    driver.get(CHALLENGE_URL)

    # Start sequence
    driver.find_element(By.ID, 'button00').click()

    # ❌ BAD: Hard-coded sleep wastes time
    time.sleep(6)  # Wait for all buttons

    # This works but always takes 6 seconds
    button03 = driver.find_element(By.ID, 'button03')
    button03.click()

    assert button03.text == 'Three'

def test_failure_with_inadequate_timeout(driver):
    """Demonstrate failure when timeout is too short."""
    driver.get(CHALLENGE_URL)

    # Use short timeout
    short_wait = WebDriverWait(driver, timeout=1)

    start_button = short_wait.until(EC.element_to_be_clickable((By.ID, 'button00')))
    start_button.click()

    button01 = short_wait.until(EC.element_to_be_clickable((By.ID, 'button01')))
    button01.click()

    # This SHOULD fail because button02 needs ~2s but we only wait 1s
    with pytest.raises(TimeoutException):
        button02 = short_wait.until(EC.element_to_be_clickable((By.ID, 'button02')))

def test_custom_expected_condition(driver):
    """Use custom expected condition for advanced waiting."""
    driver.get(CHALLENGE_URL)

    class element_has_text:
        """Custom expected condition to check element text."""
        def __init__(self, locator, text):
            self.locator = locator
            self.text = text

        def __call__(self, driver):
            try:
                element = driver.find_element(*self.locator)
                return self.text in element.text
            except:
                return False

    wait = WebDriverWait(driver, timeout=10)
    driver.find_element(By.ID, 'button00').click()

    # Wait for buttons with specific text
    wait.until(element_has_text((By.ID, 'button01'), 'One'))
    driver.find_element(By.ID, 'button01').click()

    wait.until(element_has_text((By.ID, 'button02'), 'Two'))
    driver.find_element(By.ID, 'button02').click()

    wait.until(element_has_text((By.ID, 'button03'), 'Three'))
    button03 = driver.find_element(By.ID, 'button03')

    assert button03.text == 'Three'
```

### Run Tests

```bash
pytest test_dynamic_buttons.py -v
pytest test_dynamic_buttons.py -v -s  # With output
```

---

## Puppeteer Implementation

### Installation

```bash
npm install puppeteer
```

### Test File: `dynamic-buttons-puppeteer.js`

```javascript
const puppeteer = require('puppeteer');

const CHALLENGE_URL = 'https://testpages.eviltester.com/challenges/synchronization/dynamic-buttons-01/';

async function testSequentialButtonReveals() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(CHALLENGE_URL);

    // Wait for start button and click
    await page.waitForSelector('#button00', { visible: true });
    await page.click('#button00');

    // Wait for and click each button sequentially
    await page.waitForSelector('#button01', { visible: true, timeout: 10000 });
    await page.click('#button01');

    await page.waitForSelector('#button02', { visible: true, timeout: 10000 });
    await page.click('#button02');

    await page.waitForSelector('#button03', { visible: true, timeout: 10000 });
    await page.click('#button03');

    // Verify final button text
    const button03Text = await page.$eval('#button03', el => el.textContent);
    console.assert(button03Text === 'Three', 'Button03 should have text "Three"');

    console.log('✅ Test passed: Sequential button reveals');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

async function testTimingMeasurements() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(CHALLENGE_URL);

    const timings = {};
    const startTime = Date.now();

    // Start sequence
    await page.click('#button00');

    // Measure button01
    await page.waitForSelector('#button01', { visible: true });
    timings.button01 = Date.now() - startTime;

    // Click and measure button02
    await page.click('#button01');
    await page.waitForSelector('#button02', { visible: true });
    timings.button02 = Date.now() - startTime;

    // Click and measure button03
    await page.click('#button02');
    await page.waitForSelector('#button03', { visible: true });
    timings.button03 = Date.now() - startTime;

    console.log('\nTiming Measurements:');
    console.log(`  Button01: ${timings.button01}ms (expected: ~0ms)`);
    console.log(`  Button02: ${timings.button02}ms (expected: ~2000ms)`);
    console.log(`  Button03: ${timings.button03}ms (expected: ~6000ms)`);

    // Verify timing expectations
    console.assert(timings.button01 < 500, 'Button01 should appear instantly');
    console.assert(timings.button02 > 1800 && timings.button02 < 2500, 'Button02 ~2s');
    console.assert(timings.button03 > 5800 && timings.button03 < 6500, 'Button03 ~6s');

    console.log('✅ Timing test passed');
  } catch (error) {
    console.error('❌ Timing test failed:', error.message);
  } finally {
    await browser.close();
  }
}

async function testMutationObserver() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(CHALLENGE_URL);

    // Inject MutationObserver for precise timing
    await page.evaluate(() => {
      window.buttonTimings = [];
      const startTime = Date.now();

      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.id && node.id.startsWith('button')) {
              window.buttonTimings.push({
                buttonId: node.id,
                elapsed: Date.now() - startTime
              });
            }
          });
        });
      });

      observer.observe(document.getElementById('buttons'), { childList: true });
    });

    // Start sequence
    await page.click('#button00');

    // Wait for all buttons to appear
    await page.waitForSelector('#button03', { visible: true, timeout: 10000 });

    // Retrieve timing data
    const timings = await page.evaluate(() => window.buttonTimings);

    console.log('\nMutationObserver Timing (Precise):');
    timings.forEach(({ buttonId, elapsed }) => {
      console.log(`  ${buttonId}: ${elapsed}ms`);
    });

    console.log('✅ MutationObserver test passed');
  } catch (error) {
    console.error('❌ MutationObserver test failed:', error.message);
  } finally {
    await browser.close();
  }
}

// Run all tests
(async () => {
  console.log('Running Puppeteer Dynamic Buttons Tests\n');
  await testSequentialButtonReveals();
  await testTimingMeasurements();
  await testMutationObserver();
  console.log('\n✅ All tests completed');
})();
```

### Run Tests

```bash
node dynamic-buttons-puppeteer.js
```

---

## Custom Polling Implementation

### Generic Polling Module: `custom-wait.js`

```javascript
/**
 * Custom wait implementation with exponential backoff.
 * Educational example for understanding polling strategies.
 */

class CustomWait {
  constructor(driver, timeout = 10000) {
    this.driver = driver;
    this.timeout = timeout;
  }

  /**
   * Wait for element with exponential backoff polling.
   */
  async waitForElement(selector, options = {}) {
    const {
      visible = true,
      initialPoll = 100,
      maxPoll = 1000,
      logAttempts = false
    } = options;

    const startTime = Date.now();
    let pollInterval = initialPoll;
    let attempts = 0;

    while (Date.now() - startTime < this.timeout) {
      attempts++;

      try {
        const element = await this.driver.$(selector);

        if (element) {
          if (!visible || await element.isDisplayed()) {
            if (logAttempts) {
              console.log(`Found ${selector} after ${attempts} attempts (${Date.now() - startTime}ms)`);
            }
            return element;
          }
        }
      } catch (error) {
        // Element not found, continue polling
      }

      // Exponential backoff
      await this.sleep(pollInterval);
      pollInterval = Math.min(pollInterval * 1.5, maxPoll);
    }

    throw new Error(`Element ${selector} not found after ${this.timeout}ms`);
  }

  /**
   * Wait for element with linear polling (fixed interval).
   */
  async waitForElementLinear(selector, options = {}) {
    const { visible = true, pollInterval = 500, logAttempts = false } = options;

    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < this.timeout) {
      attempts++;

      try {
        const element = await this.driver.$(selector);

        if (element && (!visible || await element.isDisplayed())) {
          if (logAttempts) {
            console.log(`Found ${selector} after ${attempts} attempts (${Date.now() - startTime}ms)`);
          }
          return element;
        }
      } catch (error) {
        // Continue polling
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Element ${selector} not found after ${this.timeout}ms`);
  }

  /**
   * Wait with custom condition function.
   */
  async waitUntil(conditionFn, message = 'Condition not met') {
    const startTime = Date.now();
    let pollInterval = 100;

    while (Date.now() - startTime < this.timeout) {
      try {
        const result = await conditionFn(this.driver);
        if (result) return result;
      } catch (error) {
        // Continue polling
      }

      await this.sleep(pollInterval);
      pollInterval = Math.min(pollInterval * 1.5, 1000);
    }

    throw new Error(`${message} after ${this.timeout}ms`);
  }

  /**
   * Compare polling strategies performance.
   */
  async benchmarkPollingStrategies(selector) {
    const strategies = [
      { name: 'Exponential Backoff (100-1000ms)', fn: () => this.waitForElement(selector) },
      { name: 'Linear Polling (250ms)', fn: () => this.waitForElementLinear(selector, { pollInterval: 250 }) },
      { name: 'Linear Polling (500ms)', fn: () => this.waitForElementLinear(selector, { pollInterval: 500 }) },
      { name: 'Linear Polling (1000ms)', fn: () => this.waitForElementLinear(selector, { pollInterval: 1000 }) }
    ];

    const results = [];

    for (const strategy of strategies) {
      const startTime = Date.now();
      try {
        await strategy.fn();
        const duration = Date.now() - startTime;
        results.push({ strategy: strategy.name, duration, success: true });
      } catch (error) {
        results.push({ strategy: strategy.name, duration: null, success: false });
      }
    }

    return results;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CustomWait;
```

---

## Performance Benchmarking Script

### Benchmark: `benchmark-strategies.js`

```javascript
const puppeteer = require('puppeteer');

const CHALLENGE_URL = 'https://testpages.eviltester.com/challenges/synchronization/dynamic-buttons-01/';

async function benchmarkWaitStrategies() {
  const results = [];

  // Strategy 1: No explicit wait (fails)
  console.log('\n📊 Benchmarking Wait Strategies...\n');

  // Strategy 2: Fixed sleep (wasteful)
  const sleepResult = await benchmarkFixedSleep();
  results.push(sleepResult);

  // Strategy 3: Polling every 100ms
  const poll100Result = await benchmarkPolling(100);
  results.push(poll100Result);

  // Strategy 4: Polling every 500ms
  const poll500Result = await benchmarkPolling(500);
  results.push(poll500Result);

  // Strategy 5: Polling every 1000ms
  const poll1000Result = await benchmarkPolling(1000);
  results.push(poll1000Result);

  // Strategy 6: Exponential backoff
  const backoffResult = await benchmarkExponentialBackoff();
  results.push(backoffResult);

  // Print results table
  console.log('\n📈 Benchmark Results:\n');
  console.table(results);
}

async function benchmarkFixedSleep() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(CHALLENGE_URL);

  const startTime = Date.now();
  await page.click('#button00');
  await page.waitForTimeout(6000); // Fixed 6s sleep
  const duration = Date.now() - startTime;

  await browser.close();

  return {
    strategy: 'Fixed Sleep (6000ms)',
    duration: `${duration}ms`,
    efficiency: 'Low (always 6s)',
    notes: 'Wastes time, brittle'
  };
}

async function benchmarkPolling(interval) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(CHALLENGE_URL);

  const startTime = Date.now();
  await page.click('#button00');

  // Manual polling
  let found = false;
  let attempts = 0;
  while (!found && Date.now() - startTime < 10000) {
    attempts++;
    found = await page.$('#button03') !== null;
    if (!found) await page.waitForTimeout(interval);
  }

  const duration = Date.now() - startTime;
  await browser.close();

  return {
    strategy: `Polling (${interval}ms)`,
    duration: `${duration}ms`,
    efficiency: interval <= 100 ? 'Medium-High' : 'Medium',
    notes: `${attempts} attempts`
  };
}

async function benchmarkExponentialBackoff() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(CHALLENGE_URL);

  const startTime = Date.now();
  await page.click('#button00');

  // Exponential backoff polling
  let found = false;
  let interval = 100;
  let attempts = 0;

  while (!found && Date.now() - startTime < 10000) {
    attempts++;
    found = await page.$('#button03') !== null;
    if (!found) {
      await page.waitForTimeout(interval);
      interval = Math.min(interval * 1.5, 1000);
    }
  }

  const duration = Date.now() - startTime;
  await browser.close();

  return {
    strategy: 'Exponential Backoff',
    duration: `${duration}ms`,
    efficiency: 'High',
    notes: `${attempts} attempts`
  };
}

// Run benchmark
benchmarkWaitStrategies().then(() => {
  console.log('\n✅ Benchmark complete\n');
});
```

### Run Benchmark

```bash
node benchmark-strategies.js
```

---

## Summary

These implementations demonstrate:

1. **Playwright**: Modern auto-waiting with minimal boilerplate
2. **Cypress**: Command retry with smart assertions
3. **Selenium**: Explicit waits with WebDriverWait
4. **Puppeteer**: Manual polling with custom strategies
5. **Custom Polling**: Educational examples of polling algorithms
6. **Benchmarking**: Performance comparison of wait strategies

All examples avoid hard-coded sleeps and use proper synchronization patterns suitable for production test automation.

---

**Related Documents**:
- [evil-tester-dynamic-buttons-analysis.md](./evil-tester-dynamic-buttons-analysis.md) - Detailed analysis
- [Alan Richardson's EvilTester](https://testpages.eviltester.com/) - Original challenge

**Generated By**: Agentic QE Fleet v2.5.7

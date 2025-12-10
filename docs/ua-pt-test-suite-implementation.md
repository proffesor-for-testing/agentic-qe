# UA.pt Test Suite Implementation Guide

**Implementation Date:** 2025-12-10
**Framework:** Playwright (recommended) or Cypress
**Target Website:** https://www.ua.pt

---

## Quick Start

### Prerequisites

```bash
# Install Node.js 18+ and npm
node --version  # v18.0.0 or higher

# Install dependencies
npm install --save-dev @playwright/test
npx playwright install chromium firefox webkit

# Or for Cypress
npm install --save-dev cypress
```

### Project Structure

```
tests/
├── e2e/
│   ├── critical-paths/
│   │   ├── prospective-student.spec.ts
│   │   ├── department-browsing.spec.ts
│   │   ├── search-functionality.spec.ts
│   │   └── language-switching.spec.ts
│   ├── integration/
│   │   ├── api-authentication.spec.ts
│   │   ├── api-programs.spec.ts
│   │   ├── api-applications.spec.ts
│   │   └── api-search.spec.ts
│   └── visual/
│       └── visual-regression.spec.ts
├── fixtures/
│   ├── test-files/
│   │   ├── transcript.pdf
│   │   └── cv.pdf
│   └── test-data.ts
├── helpers/
│   ├── test-data-factory.ts
│   ├── api-client.ts
│   └── page-objects/
│       ├── HomePage.ts
│       ├── ProgramCatalogPage.ts
│       ├── ApplicationFormPage.ts
│       └── DepartmentPage.ts
└── playwright.config.ts
```

---

## Test Implementation Examples

### 1. Critical Path: Prospective Student Journey

**File:** `tests/e2e/critical-paths/prospective-student.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { TestDataFactory } from '../../helpers/test-data-factory';
import { ApplicationFormPage } from '../../helpers/page-objects/ApplicationFormPage';

test.describe('Prospective Student Application Journey', () => {

  test.beforeEach(async ({ page }) => {
    // Set up test environment
    await page.goto('https://www.ua.pt/en/');
  });

  test('should complete full application process @critical', async ({ page }) => {
    // 1. Homepage Discovery
    await expect(page).toHaveTitle(/University of Aveiro/);

    // 2. Navigate to Programs
    await page.click('text=Programs');
    await page.waitForURL('**/course-types');

    // 3. Filter for Undergraduate Programs
    await page.click('text=Undergraduate');
    await page.waitForResponse(response =>
      response.url().includes('/api/programs') && response.status() === 200
    );

    // 4. Search for Computer Science
    await page.fill('input[name="search"]', 'computer science');
    await page.waitForTimeout(300); // Debounce delay

    // 5. Select Program
    const programCard = page.locator('.program-card').filter({
      hasText: 'Computer Science'
    }).first();
    await programCard.click();
    await page.waitForURL('**/programs/**');

    // 6. View Admission Requirements
    const requirements = page.locator('.admission-requirements');
    await expect(requirements).toBeVisible();

    // 7. Start Application
    await page.click('button:text("Apply Now")');
    await page.waitForURL('**/apply');

    // 8. Fill Application Form
    const applicationForm = new ApplicationFormPage(page);
    const testData = TestDataFactory.createApplication();

    // Step 1: Personal Information
    await applicationForm.fillPersonalInfo(testData.personalInfo);
    await applicationForm.clickNext();

    // Step 2: Academic Background
    await applicationForm.fillAcademicBackground(testData.academicBackground);
    await applicationForm.clickNext();

    // Step 3: Upload Documents
    await applicationForm.uploadDocument('transcript', 'tests/fixtures/test-files/transcript.pdf');
    await applicationForm.uploadDocument('cv', 'tests/fixtures/test-files/cv.pdf');
    await applicationForm.clickNext();

    // Step 4: Motivation Letter
    await applicationForm.fillMotivationLetter(testData.motivationLetter);
    await applicationForm.clickNext();

    // Step 5: Review and Submit
    await applicationForm.acceptTerms();
    await applicationForm.submit();

    // 9. Verify Success
    await expect(page.locator('.success-message')).toBeVisible();
    const referenceNumber = await page.locator('.reference-number').textContent();
    expect(referenceNumber).toMatch(/UA2025-\d+/);

    // 10. Log Application Reference
    console.log(`Application submitted: ${referenceNumber}`);
  });

  test('should validate required fields @validation', async ({ page }) => {
    await page.goto('https://www.ua.pt/en/apply');

    // Submit empty form
    await page.click('button[type="submit"]');

    // Verify error summary displayed
    const errorSummary = page.locator('[role="alert"].error-summary');
    await expect(errorSummary).toBeVisible();
    await expect(errorSummary).toContainText(/error/i);

    // Verify individual field errors
    const invalidFields = page.locator('[aria-invalid="true"]');
    const count = await invalidFields.count();
    expect(count).toBeGreaterThan(3);

    // Verify focus moved to first error
    const firstInvalidField = invalidFields.first();
    await expect(firstInvalidField).toBeFocused();

    // Fix first error and verify error cleared
    await firstInvalidField.fill('valid@example.com');
    await page.click('body'); // Blur field to trigger validation
    await expect(firstInvalidField).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('should preserve form data on navigation @ux', async ({ page }) => {
    await page.goto('https://www.ua.pt/en/apply');

    // Fill partial form
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');
    await page.fill('input[name="email"]', 'test@example.com');

    // Navigate away
    await page.goto('https://www.ua.pt/en/');

    // Return to application
    await page.goto('https://www.ua.pt/en/apply');

    // Verify data preserved (from localStorage/sessionStorage)
    await expect(page.locator('input[name="firstName"]')).toHaveValue('Test');
    await expect(page.locator('input[name="lastName"]')).toHaveValue('User');
    await expect(page.locator('input[name="email"]')).toHaveValue('test@example.com');
  });

  test('should handle network errors gracefully @error-handling', async ({ page }) => {
    await page.goto('https://www.ua.pt/en/apply');

    // Fill form
    const testData = TestDataFactory.createStudent();
    await page.fill('input[name="firstName"]', testData.firstName);
    await page.fill('input[name="lastName"]', testData.lastName);
    await page.fill('input[name="email"]', testData.email);

    // Simulate network failure
    await page.route('**/api/applications', route => route.abort());

    // Attempt submission
    await page.click('button[type="submit"]');

    // Verify error message
    const errorMessage = page.locator('.error-message, [role="alert"]').filter({
      hasText: /network|failed|try again/i
    });
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // Verify retry option available
    const retryButton = page.locator('button:text("Retry"), button:text("Try Again")');
    await expect(retryButton).toBeVisible();
  });

});
```

### 2. Page Object: Application Form

**File:** `tests/helpers/page-objects/ApplicationFormPage.ts`

```typescript
import { Page, Locator } from '@playwright/test';

export class ApplicationFormPage {
  readonly page: Page;

  // Locators
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly birthDateInput: Locator;
  readonly nationalitySelect: Locator;
  readonly phoneInput: Locator;

  readonly previousDegreeSelect: Locator;
  readonly institutionInput: Locator;
  readonly graduationYearInput: Locator;
  readonly gpaInput: Locator;

  readonly motivationLetterTextarea: Locator;

  readonly termsCheckbox: Locator;
  readonly submitButton: Locator;
  readonly nextButton: Locator;
  readonly previousButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Personal Information fields
    this.firstNameInput = page.locator('input[name="firstName"]');
    this.lastNameInput = page.locator('input[name="lastName"]');
    this.emailInput = page.locator('input[name="email"], input[type="email"]');
    this.birthDateInput = page.locator('input[name="birthDate"], input[type="date"]');
    this.nationalitySelect = page.locator('select[name="nationality"]');
    this.phoneInput = page.locator('input[name="phone"], input[type="tel"]');

    // Academic Background fields
    this.previousDegreeSelect = page.locator('select[name="previousDegree"]');
    this.institutionInput = page.locator('input[name="institution"]');
    this.graduationYearInput = page.locator('input[name="graduationYear"]');
    this.gpaInput = page.locator('input[name="gpa"]');

    // Motivation Letter
    this.motivationLetterTextarea = page.locator('textarea[name="motivationLetter"]');

    // Form controls
    this.termsCheckbox = page.locator('input[type="checkbox"][name="acceptTerms"]');
    this.submitButton = page.locator('button[type="submit"]');
    this.nextButton = page.locator('button:text("Next")');
    this.previousButton = page.locator('button:text("Previous"), button:text("Back")');
  }

  async fillPersonalInfo(data: {
    firstName: string;
    lastName: string;
    email: string;
    birthDate: string;
    nationality: string;
    phone: string;
  }) {
    await this.firstNameInput.fill(data.firstName);
    await this.lastNameInput.fill(data.lastName);
    await this.emailInput.fill(data.email);
    await this.birthDateInput.fill(data.birthDate);
    await this.nationalitySelect.selectOption(data.nationality);
    await this.phoneInput.fill(data.phone);
  }

  async fillAcademicBackground(data: {
    previousDegree: string;
    institution: string;
    graduationYear: number;
    gpa: number;
  }) {
    await this.previousDegreeSelect.selectOption(data.previousDegree);
    await this.institutionInput.fill(data.institution);
    await this.graduationYearInput.fill(data.graduationYear.toString());
    await this.gpaInput.fill(data.gpa.toString());
  }

  async uploadDocument(documentType: string, filePath: string) {
    const fileInput = this.page.locator(`input[type="file"][name="${documentType}"]`);
    await fileInput.setInputFiles(filePath);

    // Wait for upload to complete
    await this.page.waitForResponse(
      response => response.url().includes('/api/upload') && response.status() === 201,
      { timeout: 10000 }
    );
  }

  async fillMotivationLetter(text: string) {
    await this.motivationLetterTextarea.fill(text);
  }

  async acceptTerms() {
    await this.termsCheckbox.check();
  }

  async clickNext() {
    await this.nextButton.click();
    await this.page.waitForTimeout(500); // Wait for transition
  }

  async clickPrevious() {
    await this.previousButton.click();
    await this.page.waitForTimeout(500);
  }

  async submit() {
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }

  async getValidationErrors(): Promise<string[]> {
    const errorElements = this.page.locator('.error-message, [role="alert"]');
    const count = await errorElements.count();
    const errors: string[] = [];

    for (let i = 0; i < count; i++) {
      const text = await errorElements.nth(i).textContent();
      if (text) errors.push(text);
    }

    return errors;
  }

  async getCurrentStep(): Promise<number> {
    const stepIndicator = this.page.locator('.step-indicator .active, .stepper .active');
    const stepText = await stepIndicator.textContent();
    const match = stepText?.match(/(\d+)/);
    return match ? parseInt(match[1]) : 1;
  }
}
```

### 3. Test Data Factory

**File:** `tests/helpers/test-data-factory.ts`

```typescript
export class TestDataFactory {

  static createStudent(overrides: Partial<Student> = {}): Student {
    return {
      firstName: 'Test',
      lastName: 'Student',
      email: `test.student.${Date.now()}@example.com`,
      birthDate: '2000-05-15',
      nationality: 'PT',
      phone: '+351912345678',
      ...overrides
    };
  }

  static createAcademicBackground(overrides: Partial<AcademicBackground> = {}): AcademicBackground {
    return {
      previousDegree: 'High School',
      institution: 'Escola Secundária de Aveiro',
      graduationYear: 2018,
      gpa: 17.5,
      ...overrides
    };
  }

  static createApplication(overrides: Partial<Application> = {}): Application {
    return {
      personalInfo: this.createStudent(),
      academicBackground: this.createAcademicBackground(),
      motivationLetter: this.generateMotivationLetter(),
      documents: [],
      ...overrides
    };
  }

  static generateMotivationLetter(): string {
    return `
I am writing to express my strong interest in the Computer Science and Engineering program
at the University of Aveiro. With a solid foundation in mathematics and a passion for
technology, I am eager to pursue advanced studies in computer science.

During my secondary education, I excelled in programming courses and participated in
several hackathons, which reinforced my commitment to this field. I am particularly
drawn to UA's research focus on artificial intelligence and software engineering.

I believe that the comprehensive curriculum and research opportunities at the University
of Aveiro will provide me with the skills and knowledge necessary to achieve my career
goals in software development and innovation.

Thank you for considering my application.
    `.trim();
  }

  static createProgram(overrides: Partial<Program> = {}): Program {
    return {
      id: `prog-${Date.now()}`,
      name: 'Computer Science and Engineering',
      level: 'undergraduate',
      department: 'DETI',
      duration: 3,
      ects: 180,
      language: 'en',
      campuses: ['aveiro'],
      ...overrides
    };
  }

  static createDepartment(overrides: Partial<Department> = {}): Department {
    return {
      id: 'deti',
      name: 'Department of Electronics, Telecommunications and Informatics',
      type: 'department',
      campus: 'aveiro',
      ...overrides
    };
  }

  // Generate unique email for test isolation
  static generateUniqueEmail(prefix: string = 'test'): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${prefix}.${timestamp}.${random}@example.com`;
  }

  // Generate realistic Portuguese phone number
  static generatePhoneNumber(): string {
    const prefix = '+351';
    const operator = ['91', '92', '93', '96'][Math.floor(Math.random() * 4)];
    const number = Math.floor(Math.random() * 10000000).toString().padStart(7, '0');
    return `${prefix}${operator}${number}`;
  }
}

// Type definitions
interface Student {
  firstName: string;
  lastName: string;
  email: string;
  birthDate: string;
  nationality: string;
  phone: string;
}

interface AcademicBackground {
  previousDegree: string;
  institution: string;
  graduationYear: number;
  gpa: number;
}

interface Application {
  personalInfo: Student;
  academicBackground: AcademicBackground;
  motivationLetter: string;
  documents: Document[];
}

interface Program {
  id: string;
  name: string;
  level: 'undergraduate' | 'masters' | 'doctoral';
  department: string;
  duration: number;
  ects: number;
  language: 'en' | 'pt';
  campuses: string[];
}

interface Department {
  id: string;
  name: string;
  type: 'department' | 'school';
  campus: string;
}

interface Document {
  type: string;
  fileId: string;
}
```

### 4. API Integration Tests

**File:** `tests/e2e/integration/api-applications.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { TestDataFactory } from '../../helpers/test-data-factory';

const API_BASE_URL = process.env.API_BASE_URL || 'https://www.ua.pt/api';

test.describe('Applications API Integration', () => {

  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // Authenticate to get token
    const response = await request.post(`${API_BASE_URL}/auth/login`, {
      data: {
        email: 'test@example.com',
        password: 'TestPassword123!'
      }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    authToken = body.token;
  });

  test('should create application successfully @api @critical', async ({ request }) => {
    const applicationData = TestDataFactory.createApplication();

    const response = await request.post(`${API_BASE_URL}/applications`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: applicationData
    });

    // Verify response
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.applicationId).toBeDefined();
    expect(body.status).toBe('submitted');
    expect(body.referenceNumber).toMatch(/UA2025-\d+/);

    // Verify Location header
    const locationHeader = response.headers()['location'];
    expect(locationHeader).toContain(`/api/applications/${body.applicationId}`);
  });

  test('should validate required fields @api @validation', async ({ request }) => {
    const invalidData = {
      // Missing required fields
      programId: 'prog-123'
    };

    const response = await request.post(`${API_BASE_URL}/applications`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      data: invalidData
    });

    // Verify validation error
    expect(response.status()).toBe(400);

    const body = await response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeInstanceOf(Array);
    expect(body.error.details.length).toBeGreaterThan(0);

    // Verify specific field errors
    const emailError = body.error.details.find((e: any) => e.field === 'email');
    expect(emailError).toBeDefined();
    expect(emailError.message).toContain('required');
  });

  test('should retrieve application by ID @api', async ({ request }) => {
    // First create an application
    const applicationData = TestDataFactory.createApplication();

    const createResponse = await request.post(`${API_BASE_URL}/applications`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
      data: applicationData
    });

    const { applicationId } = await createResponse.json();

    // Retrieve the application
    const getResponse = await request.get(`${API_BASE_URL}/applications/${applicationId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    expect(getResponse.status()).toBe(200);

    const body = await getResponse.json();
    expect(body.applicationId).toBe(applicationId);
    expect(body.personalInfo.email).toBe(applicationData.personalInfo.email);
  });

  test('should handle idempotency for duplicate requests @api @reliability', async ({ request }) => {
    const applicationData = TestDataFactory.createApplication();
    const idempotencyKey = `test-${Date.now()}`;

    // First request
    const firstResponse = await request.post(`${API_BASE_URL}/applications`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Idempotency-Key': idempotencyKey
      },
      data: applicationData
    });

    expect(firstResponse.status()).toBe(201);
    const firstBody = await firstResponse.json();

    // Duplicate request with same idempotency key
    const secondResponse = await request.post(`${API_BASE_URL}/applications`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Idempotency-Key': idempotencyKey
      },
      data: applicationData
    });

    expect(secondResponse.status()).toBe(201);
    const secondBody = await secondResponse.json();

    // Verify same application returned
    expect(secondBody.applicationId).toBe(firstBody.applicationId);
    expect(secondBody.referenceNumber).toBe(firstBody.referenceNumber);
  });

  test('should handle rate limiting @api @performance', async ({ request }) => {
    const applicationData = TestDataFactory.createApplication();
    const requests: Promise<any>[] = [];

    // Send 20 rapid requests
    for (let i = 0; i < 20; i++) {
      requests.push(
        request.post(`${API_BASE_URL}/applications`, {
          headers: { 'Authorization': `Bearer ${authToken}` },
          data: { ...applicationData, email: TestDataFactory.generateUniqueEmail() }
        })
      );
    }

    const responses = await Promise.all(requests);

    // Some requests should be rate limited
    const rateLimitedResponses = responses.filter(r => r.status() === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);

    // Verify Retry-After header
    const retryAfterHeader = rateLimitedResponses[0].headers()['retry-after'];
    expect(retryAfterHeader).toBeDefined();
    expect(parseInt(retryAfterHeader)).toBeGreaterThan(0);
  });

  test('should handle API timeout gracefully @api @error-handling', async ({ request }) => {
    const applicationData = TestDataFactory.createApplication();

    // Set short timeout
    const response = await request.post(`${API_BASE_URL}/applications`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
      data: applicationData,
      timeout: 100 // 100ms timeout (artificially short)
    }).catch(error => error);

    // Verify timeout error handled
    expect(response.name).toBe('TimeoutError');
  });

});
```

### 5. Performance Tests

**File:** `tests/e2e/performance/lighthouse-audit.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { playAudit } from 'playwright-lighthouse';

test.describe('Lighthouse Performance Audits', () => {

  test('homepage should meet performance thresholds @performance', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Lighthouse only supports Chromium');

    await page.goto('https://www.ua.pt/en/');

    const audit = await playAudit({
      page,
      port: 9222,
      thresholds: {
        performance: 90,
        accessibility: 100,
        'best-practices': 95,
        seo: 100
      },
      reports: {
        formats: {
          html: true,
          json: true
        },
        directory: './test-results/lighthouse'
      }
    });

    expect(audit.lhr.categories.performance.score).toBeGreaterThanOrEqual(0.9);
    expect(audit.lhr.categories.accessibility.score).toBe(1.0);

    // Core Web Vitals
    const fcp = audit.lhr.audits['first-contentful-paint'].numericValue;
    const lcp = audit.lhr.audits['largest-contentful-paint'].numericValue;
    const tbt = audit.lhr.audits['total-blocking-time'].numericValue;
    const cls = audit.lhr.audits['cumulative-layout-shift'].numericValue;

    expect(fcp).toBeLessThan(1800); // <1.8s
    expect(lcp).toBeLessThan(2500); // <2.5s
    expect(tbt).toBeLessThan(200);  // <200ms
    expect(cls).toBeLessThan(0.1);  // <0.1
  });

  test('program catalog should load efficiently @performance', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Lighthouse only supports Chromium');

    await page.goto('https://www.ua.pt/en/course-types');

    const audit = await playAudit({
      page,
      port: 9222,
      thresholds: {
        performance: 85,
        'time-to-interactive': 3800
      }
    });

    const tti = audit.lhr.audits['interactive'].numericValue;
    expect(tti).toBeLessThan(3800); // <3.8s
  });

});
```

### 6. Playwright Configuration

**File:** `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'test-results/html' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list']
  ],
  use: {
    baseURL: 'https://www.ua.pt',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad Pro'] },
    },
  ],

  webServer: process.env.CI ? undefined : {
    command: 'npm run start:test-server',
    port: 3001,
    reuseExistingServer: !process.env.CI,
  },
});
```

### 7. CI/CD Integration

**File:** `.github/workflows/e2e-tests.yml`

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 0 * * *' # Daily at midnight

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        browser: [chromium, firefox, webkit]

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps ${{ matrix.browser }}

      - name: Run E2E tests
        run: npx playwright test --project=${{ matrix.browser }}
        env:
          API_BASE_URL: ${{ secrets.API_BASE_URL }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results-${{ matrix.browser }}
          path: test-results/
          retention-days: 30

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report-${{ matrix.browser }}
          path: playwright-report/
          retention-days: 30

  performance:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Run Lighthouse audits
        run: npm run test:lighthouse

      - name: Upload Lighthouse reports
        uses: actions/upload-artifact@v3
        with:
          name: lighthouse-reports
          path: test-results/lighthouse/
```

---

## Running Tests

### Local Development

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/e2e/critical-paths/prospective-student.spec.ts

# Run tests with specific browser
npx playwright test --project=chromium

# Run tests in headed mode (see browser)
npx playwright test --headed

# Run tests in debug mode
npx playwright test --debug

# Run only tests with specific tag
npx playwright test --grep @critical

# Run tests excluding specific tag
npx playwright test --grep-invert @slow

# Generate HTML report
npx playwright show-report
```

### CI/CD Environment

```bash
# Install dependencies
npm ci

# Install browsers
npx playwright install --with-deps

# Run tests with retries
npx playwright test --retries=2

# Run tests in parallel
npx playwright test --workers=4

# Generate test report
npx playwright show-report --port 9323
```

---

## Test Maintenance

### Updating Test Data

```bash
# Update test fixtures
cp /path/to/new/transcript.pdf tests/fixtures/test-files/

# Regenerate test data
npm run generate-test-data
```

### Debugging Failed Tests

```bash
# Run failed tests only
npx playwright test --last-failed

# Run single test with trace
npx playwright test --trace on

# View trace
npx playwright show-trace trace.zip
```

### Visual Regression Testing

```bash
# Update baseline screenshots
npx playwright test --update-snapshots

# Compare screenshots
npx playwright test visual-regression.spec.ts
```

---

## Best Practices

1. **Test Isolation**: Each test should be independent and not rely on other tests
2. **Use Page Objects**: Encapsulate page interactions in page object classes
3. **Factory Pattern**: Use test data factories for consistent, reusable test data
4. **Descriptive Names**: Test names should clearly describe what is being tested
5. **Tags**: Use tags (@critical, @slow, @flaky) to categorize and filter tests
6. **Timeouts**: Set appropriate timeouts for different types of operations
7. **Retries**: Configure retries for flaky tests, but investigate root cause
8. **Screenshots**: Capture screenshots on failure for debugging
9. **Traces**: Enable traces for complex test failures
10. **Continuous Improvement**: Regularly review and refactor tests

---

**Document Version**: 1.0
**Last Updated**: 2025-12-10
**Framework**: Playwright 1.40+
**Maintained By**: QE Integration Tester (Agentic QE Fleet)

# Complete File Listing - Agile Testing Days E2E Test Suite

## Summary
- **Total Files Generated**: 27
- **Test Specifications**: 9 files (78+ test cases)
- **Page Objects**: 6 files
- **Fixtures**: 2 files
- **Utilities**: 1 file
- **Configuration**: 5 files
- **Documentation**: 3 files
- **Scripts**: 2 files

---

## File Structure

```
/workspaces/test-project/atd/
│
├── Configuration Files (5)
│   ├── playwright.config.ts          # Playwright test configuration
│   ├── package.json                  # NPM dependencies and scripts
│   ├── tsconfig.json                 # TypeScript compiler settings
│   ├── .env.example                  # Environment variables template
│   └── .gitignore                    # Git ignore patterns
│
├── Test Specifications (9)
│   ├── tests/navigation.spec.ts          # 13 tests - Navigation & menu structure
│   ├── tests/registration.spec.ts        # 11 tests - Ticket selection & forms
│   ├── tests/payment.spec.ts             # 13 tests - Payment processing
│   ├── tests/newsletter.spec.ts          # 7 tests - Newsletter signup
│   ├── tests/login.spec.ts               # 11 tests - User authentication
│   ├── tests/faq.spec.ts                 # 6 tests - FAQ functionality
│   ├── tests/call-for-papers.spec.ts     # 7 tests - CFP submission
│   ├── tests/speakers.spec.ts            # 6 tests - Speaker profiles
│   └── tests/external-links.spec.ts      # 4 tests - External integrations
│
├── Page Object Model (6)
│   ├── page-objects/BasePage.ts          # Base class with common methods
│   ├── page-objects/HomePage.ts          # Homepage interactions
│   ├── page-objects/RegistrationPage.ts  # Registration flow
│   ├── page-objects/PaymentPage.ts       # Payment processing
│   ├── page-objects/LoginPage.ts         # Authentication
│   └── page-objects/index.ts             # Exports
│
├── Test Data & Fixtures (2)
│   ├── fixtures/test-data.ts             # Static test data
│   └── fixtures/user-factory.ts          # User data generation
│
├── Utilities (1)
│   └── utils/test-helpers.ts             # Helper functions
│
├── Documentation (3)
│   ├── README.md                         # Complete setup guide
│   ├── TEST-SUITE-SUMMARY.md             # Generation summary
│   └── FILES-GENERATED.md                # This file
│
└── Scripts (2)
    ├── run-tests.sh                      # Interactive test execution
    └── verify-setup.sh                   # Setup verification
```

---

## Detailed File Descriptions

### Configuration Files

#### /workspaces/test-project/atd/playwright.config.ts
- Playwright test configuration
- Browser settings (Chromium/Chrome)
- Timeout configurations (60s test, 30s navigation)
- Reporter settings (HTML, JSON, JUnit)
- Parallel execution (4 workers in CI)
- Retry logic (2 retries in CI)
- Screenshots and video on failure

#### /workspaces/test-project/atd/package.json
- Dependencies: @playwright/test, dotenv
- NPM scripts for running tests
- Test filtering by priority (@p0, @p1, @smoke)
- Report generation commands

#### /workspaces/test-project/atd/tsconfig.json
- TypeScript strict mode enabled
- ES2022 target
- CommonJS modules
- Node types included

#### /workspaces/test-project/atd/.env.example
- Environment variable template
- Test credentials
- Email testing configuration
- Stripe test mode settings

#### /workspaces/test-project/atd/.gitignore
- Ignore node_modules
- Ignore test results
- Ignore environment files
- Ignore OS files

---

### Test Specifications (78+ Test Cases)

#### /workspaces/test-project/atd/tests/navigation.spec.ts (13 tests)
**Priority**: P0/P1
**Scenarios Covered**:
- Navigate to About section (@p0 @smoke)
- Navigate to Conference section (@p0 @smoke)
- Navigate to Registration section (@p0 @critical)
- Navigate to Groups section (@p1)
- Navigate to Call for Papers section (@p1)
- Navigate to Sponsorship section (@p1)
- Access Login functionality (@p0 @critical)
- Return to homepage via logo (@p0 @smoke)
- Navigate to Program subsection (@p1)
- Navigate to Tutorials subsection (@p1)
- Navigate to Speakers subsection (@p1)
- Navigate to Location subsection (@p1)

#### /workspaces/test-project/atd/tests/registration.spec.ts (11 tests)
**Priority**: P0/P1
**Scenarios Covered**:
- Display Tutorial + Conference ticket with correct pricing (@p0 @critical)
- Display 3-Day Conference ticket with correct pricing (@p0 @critical)
- Display Online Pass ticket with correct pricing (@p0 @critical)
- Allow selecting Tutorial + Conference ticket (@p0 @critical)
- Allow selecting 3-Day Conference ticket (@p0 @critical)
- Allow selecting Online Pass ticket (@p0 @critical)
- Complete registration form with valid data (@p0 @critical)
- Show validation error for missing email (@p0 @critical)
- Show validation error for invalid email format (@p0 @critical)
- Register with VAT ID for business customers (@p1)
- Allow alumni attendee to select discount option (@p1)

#### /workspaces/test-project/atd/tests/payment.spec.ts (13 tests)
**Priority**: P0
**Scenarios Covered**:
- Display payment method options (@p0 @critical)
- Allow selecting invoice payment method (@p1)
- Allow selecting credit card payment method (@p1)
- Process successful payment with valid Visa card (@p0 @critical) [skipped - requires Stripe test mode]
- Process successful payment with valid Mastercard (@p0 @critical) [skipped]
- Show error for declined card (@p0 @critical) [skipped]
- Show error for insufficient funds card (@p0 @critical) [skipped]
- Verify VAT calculation in payment summary (@p1) [skipped]
- Display invoice payment instructions (@p1) [skipped]
- Allow downloading invoice PDF (@p1) [skipped]
- Display correct price breakdown with VAT (@p0 @critical) [skipped]
- Complete full registration and payment flow (@p0 @critical @smoke) [skipped]

#### /workspaces/test-project/atd/tests/newsletter.spec.ts (7 tests)
**Priority**: P1
**Scenarios Covered**:
- Subscribe to newsletter with valid data (@p1 @smoke)
- Show validation error for missing email (@p1)
- Show validation error for invalid email format (@p1)
- Require consent checkbox (@p1)
- Handle already subscribed email (@p1)
- Allow newsletter signup without first name if optional (@p1)
- Have newsletter form visible on homepage (@p1)

#### /workspaces/test-project/atd/tests/login.spec.ts (11 tests)
**Priority**: P0/P1
**Scenarios Covered**:
- Login successfully with valid credentials (@p0 @critical) [skipped - requires valid account]
- Show error for invalid email (@p0 @critical)
- Show error for incorrect password (@p0 @critical)
- Show validation errors for empty credentials (@p0 @critical)
- Navigate to forgot password page (@p1)
- Send password reset email (@p1) [skipped]
- Logout successfully (@p1) [skipped]
- Maintain session across page navigation (@p1) [skipped]
- Display login form with required fields (@p0 @smoke)
- Display forgot password link (@p1)

#### /workspaces/test-project/atd/tests/faq.spec.ts (6 tests)
**Priority**: P2
**Scenarios Covered**:
- Expand individual FAQ item (@p2)
- Collapse expanded FAQ item (@p2)
- Display group discount information in FAQ (@p2)
- Display payment options in FAQ (@p2)
- Display alumni discount eligibility in FAQ (@p2)
- Have FAQ section with multiple questions (@p2)

#### /workspaces/test-project/atd/tests/call-for-papers.spec.ts (7 tests)
**Priority**: P1
**Scenarios Covered**:
- Display Call for Papers submission form (@p1)
- Submit complete session proposal (@p1) [skipped - requires working form]
- Show validation errors for missing required fields (@p1)
- Display session type dropdown options (@p1)
- Display submission deadline (@p1)
- Display notification date for accepted proposals (@p1)
- Display submission guidelines (@p1)
- Display tracks or topics (@p1)

#### /workspaces/test-project/atd/tests/speakers.spec.ts (6 tests)
**Priority**: P2
**Scenarios Covered**:
- Display speaker profile grid (@p2)
- Display at least 11 speaker profiles (@p2)
- Display speaker details on profile click (@p2)
- Filter speakers by track or topic (@p2) [skipped]
- Display speaker job titles and companies (@p2)
- Display speaker photos (@p2)

#### /workspaces/test-project/atd/tests/external-links.spec.ts (4 tests)
**Priority**: P2
**Scenarios Covered**:
- Navigate to Slack community (@p2)
- Navigate to LinkedIn page (@p2)
- Navigate to YouTube channel (@p2)
- Navigate to Bluesky profile (@p2)
- Verify live chat widget loads (@p2)
- Navigate to AgileTD Zone community site (@p2)
- Have social media links in footer or header (@p2)
- Verify all external links open in new tab (@p2)

---

### Page Object Model Classes

#### /workspaces/test-project/atd/page-objects/BasePage.ts
**Base class** with common functionality:
- Navigation methods (goto, clickLogo, clickNavigationItem)
- Form helpers (fillInput, selectDropdown, clickButton, checkCheckbox)
- Validation helpers (getValidationError, hasValidationError)
- URL helpers (getCurrentUrl, waitForUrl)
- Content helpers (getPageTitle, hasText)
- External link handling
- Screenshot helper

#### /workspaces/test-project/atd/page-objects/HomePage.ts
**Homepage** interactions:
- Navigate to all main sections (About, Conference, Registration, etc.)
- Newsletter signup (fillNewsletterEmail, checkNewsletterConsent, submitNewsletterForm)
- Content verification (isEventDatesVisible, isVenueVisible)
- Social media links (clickSlackLink, clickLinkedInLink, clickYouTubeLink, clickBlueskyLink)

#### /workspaces/test-project/atd/page-objects/RegistrationPage.ts
**Registration flow**:
- Ticket selection (selectTutorialConferenceTicket, selectConferenceOnlyTicket, selectOnlinePassTicket)
- Price verification (getTutorialConferencePrice, getConferenceOnlyPrice, getOnlinePassPrice)
- Form filling (fillRegistrationForm, acceptTermsAndConditions)
- Alumni discount (selectAlumniDiscount)
- Order summary (getSubtotal, getVAT, getTotal)

#### /workspaces/test-project/atd/page-objects/PaymentPage.ts
**Payment processing**:
- Payment method selection (selectCreditCardPayment, selectInvoicePayment)
- Credit card details (fillCreditCardDetails with Stripe iframe support)
- Payment submission (submitPayment)
- Result verification (isPaymentSuccessful, hasPaymentError, isCardDeclinedErrorVisible)
- Invoice details (hasIBANInfo, hasPaymentReference, downloadInvoice)
- VAT calculation verification (verifyVATCalculation)

#### /workspaces/test-project/atd/page-objects/LoginPage.ts
**Authentication**:
- Login (login, fillEmail, fillPassword, clickLoginButton)
- Validation (hasLoginError, getLoginErrorMessage, isLoginSuccessful)
- Password reset (clickForgotPassword, requestPasswordReset, isPasswordResetEmailSent)
- Logout (logout, isLoggedOut)
- User info (getUserInfo)

---

### Test Data & Fixtures

#### /workspaces/test-project/atd/fixtures/test-data.ts
**Static test data**:
- TICKET_PRICING: All ticket tiers with prices and VAT
  - tutorialAndConference: €2,925 (€3,450 original)
  - conferenceOnly: €2,125 (€2,500 original)
  - onlinePass: €299 (€499 original)
- PAYMENT_TEST_CARDS: Stripe test card numbers
  - validVisa: 4242424242424242
  - validMastercard: 5555555555554444
  - declined: 4000000000000002
  - insufficientFunds: 4000000000009995
- EVENT_DETAILS: Conference dates and venue
- FORM_VALIDATION: Valid/invalid test data
- EXTERNAL_LINKS: Social media expected domains
- TEST_CREDENTIALS: Login test credentials

#### /workspaces/test-project/atd/fixtures/user-factory.ts
**Dynamic user generation**:
- UserFactory.generateAttendee(type) - Generate unique test users
- UserFactory.generateSpeaker() - Generate speaker data
- UserFactory.generateCustomUser() - Custom user data
- UserFactory.generateMultipleAttendees() - Bulk generation
- UserFactory.generateNewsletterSubscriber() - Newsletter data
- TEST_USERS: Pre-defined user personas

---

### Utilities

#### /workspaces/test-project/atd/utils/test-helpers.ts
**Helper functions**:
- waitForEmail() - Email delivery simulation
- extractPrice() - Parse price strings
- calculateVAT() - VAT calculation
- generateTestId() - Unique ID generation
- waitForNavigation() - Page load waiting
- isElementVisible() - Element visibility check
- retryAction() - Retry with backoff
- handleCookieConsent() - Cookie popup handling
- verifyUrlContains() - URL validation
- verifyPageTitle() - Title verification
- getTextContentFromElements() - Bulk text extraction
- verifyElementCount() - Element counting
- formatCurrency() - Currency formatting

---

### Documentation

#### /workspaces/test-project/atd/README.md
**Complete setup and execution guide**:
- Overview and test coverage
- Quick start instructions
- Installation steps
- Running tests (all variants)
- Project structure
- Test tagging
- Configuration
- Test reports
- Debugging
- Writing tests
- CI/CD integration
- Known limitations
- Resources

#### /workspaces/test-project/atd/TEST-SUITE-SUMMARY.md
**Generation summary**:
- Files generated (26 total)
- Test coverage breakdown
- Key features
- Quick start commands
- Directory structure
- Highlights
- Next steps

#### /workspaces/test-project/atd/FILES-GENERATED.md
**This file** - Complete file listing with descriptions

---

### Scripts

#### /workspaces/test-project/atd/run-tests.sh
**Interactive test execution script**:
- Menu-driven test execution
- Options:
  1. Smoke Tests
  2. Critical Tests (P0)
  3. P0 + P1 Tests
  4. Full Test Suite
  5. Specific Test File
  6. Debug Mode
  7. UI Mode
  8. Generate Test Report
- Automatic dependency checking

#### /workspaces/test-project/atd/verify-setup.sh
**Setup verification script**:
- Checks all files are present
- Verifies directory structure
- Checks Node.js and npm installation
- Verifies dependencies
- Provides setup summary
- Suggests next steps

---

## File Locations (Absolute Paths)

All files are located under:
```
/workspaces/test-project/atd/
```

Complete paths for all generated files:
```
/workspaces/test-project/atd/playwright.config.ts
/workspaces/test-project/atd/package.json
/workspaces/test-project/atd/tsconfig.json
/workspaces/test-project/atd/.env.example
/workspaces/test-project/atd/.gitignore
/workspaces/test-project/atd/README.md
/workspaces/test-project/atd/TEST-SUITE-SUMMARY.md
/workspaces/test-project/atd/FILES-GENERATED.md
/workspaces/test-project/atd/run-tests.sh
/workspaces/test-project/atd/verify-setup.sh
/workspaces/test-project/atd/tests/navigation.spec.ts
/workspaces/test-project/atd/tests/registration.spec.ts
/workspaces/test-project/atd/tests/payment.spec.ts
/workspaces/test-project/atd/tests/newsletter.spec.ts
/workspaces/test-project/atd/tests/login.spec.ts
/workspaces/test-project/atd/tests/faq.spec.ts
/workspaces/test-project/atd/tests/call-for-papers.spec.ts
/workspaces/test-project/atd/tests/speakers.spec.ts
/workspaces/test-project/atd/tests/external-links.spec.ts
/workspaces/test-project/atd/page-objects/BasePage.ts
/workspaces/test-project/atd/page-objects/HomePage.ts
/workspaces/test-project/atd/page-objects/RegistrationPage.ts
/workspaces/test-project/atd/page-objects/PaymentPage.ts
/workspaces/test-project/atd/page-objects/LoginPage.ts
/workspaces/test-project/atd/page-objects/index.ts
/workspaces/test-project/atd/fixtures/test-data.ts
/workspaces/test-project/atd/fixtures/user-factory.ts
/workspaces/test-project/atd/utils/test-helpers.ts
```

---

## Next Steps

### To verify setup:
```bash
cd /workspaces/test-project/atd
./verify-setup.sh
```

### To install and run:
```bash
cd /workspaces/test-project/atd
npm install
npx playwright install chromium
npm run test:smoke
```

### To view all files:
```bash
cd /workspaces/test-project/atd
tree -I 'node_modules|test-results'
```

---

**Generated by**: Agentic QE Fleet - Test Generator Agent
**Date**: 2025-10-23
**Total Files**: 27
**Total Test Cases**: 78+

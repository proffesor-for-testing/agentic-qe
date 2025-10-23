# End-to-End Test Plan: Agile Testing Days 2025 Website

**Test Plan Version**: 1.0.0
**Target Application**: https://agiletestingdays.com/
**Event Dates**: November 24-27, 2025
**Test Framework**: Playwright
**Format**: Hybrid (Onsite + Virtual)
**Venue**: Dorint Sanssouci Berlin/Potsdam
**Created**: 2025-10-23
**Test Focus**: Functional Testing Only

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Test Scope and Objectives](#test-scope-and-objectives)
3. [Out of Scope](#out-of-scope)
4. [Test Environment Requirements](#test-environment-requirements)
5. [Test Data Requirements](#test-data-requirements)
6. [BDD Test Scenarios](#bdd-test-scenarios)
7. [Risk Assessment](#risk-assessment)
8. [Success Criteria](#success-criteria)
9. [Test Execution Strategy](#test-execution-strategy)
10. [Appendix](#appendix)

---

## Executive Summary

This test plan covers comprehensive functional end-to-end testing for the Agile Testing Days 2025 conference website. The focus is on validating critical user journeys including navigation, registration, payment processing, form submissions, and content display. All tests will be implemented using Playwright with BDD scenarios in Gherkin format.

**Key Statistics:**
- 18 primary functional areas
- 67 BDD scenarios
- 3 critical user journeys
- 3 ticket tiers (€299 - €2,925)
- 11+ featured speakers
- 16+ sponsors

---

## Test Scope and Objectives

### Primary Objectives

1. **Validate Critical User Journeys**: Ensure prospective attendees can discover, evaluate, and register for the conference
2. **Verify Registration & Payment Flows**: Test all ticket tiers and payment methods
3. **Confirm Navigation Integrity**: Validate all menu structures and internal links
4. **Test Form Functionality**: Verify newsletter signup, registration, and Call for Papers submissions
5. **Validate Content Display**: Ensure accurate event information, pricing, and dates
6. **Test External Integrations**: Verify links to Slack, LinkedIn, YouTube, and other platforms

### Functional Areas in Scope

| Functional Area | Priority | Test Scenarios |
|----------------|----------|----------------|
| Navigation Structure | HIGH | 8 |
| Registration & Ticketing | CRITICAL | 12 |
| Payment Processing | CRITICAL | 8 |
| Newsletter Signup | MEDIUM | 6 |
| FAQ Section | MEDIUM | 5 |
| Call for Papers | HIGH | 7 |
| Speaker Profiles | MEDIUM | 4 |
| Sponsor Gallery | LOW | 3 |
| External Links | MEDIUM | 6 |
| Login Functionality | HIGH | 8 |

---

## Out of Scope

The following are explicitly excluded from this functional test plan:

- Performance testing (load, stress, scalability)
- Security testing (penetration, vulnerability scanning)
- Accessibility testing (WCAG compliance)
- Visual regression testing
- Mobile responsive design testing
- SEO validation
- Browser compatibility testing (focus on Chrome/Chromium only)
- Backend API testing (unless exposed through UI)
- Database integrity testing
- Third-party service testing (Stripe internals, payment gateway backend)

---

## Test Environment Requirements

### Environment Configuration

```yaml
environment:
  name: "Agile Testing Days 2025 - E2E Testing"
  url: "https://agiletestingdays.com/"
  type: "Production-like staging environment (preferred) OR Production with test mode"

test_framework:
  tool: "Playwright"
  version: "^1.40.0"
  language: "TypeScript"

browsers:
  - name: "Chromium"
    version: "latest"
    headless: true

test_runner:
  framework: "Cucumber"
  bdd_format: "Gherkin"

dependencies:
  - "@playwright/test": "^1.40.0"
  - "@cucumber/cucumber": "^10.0.0"
  - "dotenv": "^16.0.0"

ci_cd:
  platform: "GitHub Actions / GitLab CI"
  schedule: "Daily regression + on-demand"

reporting:
  formats:
    - "HTML report"
    - "JSON report"
    - "JUnit XML"
  screenshots: "on failure"
  video: "on failure"
```

### Infrastructure Requirements

- **Test Execution Environment**: Docker container or CI/CD runner
- **Network Access**: Unrestricted access to agiletestingdays.com
- **Email Testing**: Mailinator/Mailtrap account for email verification
- **Payment Testing**: Stripe test mode credentials (if available)
- **Storage**: 10GB minimum for test artifacts (screenshots, videos, reports)

### Third-Party Service Dependencies

| Service | Purpose | Test Requirement |
|---------|---------|------------------|
| Stripe Payment Gateway | Credit card processing | Test mode enabled OR mock |
| Email Service | Newsletter, confirmations | Test email account |
| Live Chat Widget | Customer support | Verify presence/loading |
| Slack | Community integration | Verify redirect link |
| LinkedIn/Bluesky/YouTube | Social media | Verify redirect links |

---

## Test Data Requirements

### User Accounts

```javascript
// Test user personas
const testUsers = {
  // New attendee - first time registration
  newAttendee: {
    email: "new.attendee.test@mailinator.com",
    firstName: "Jane",
    lastName: "Tester",
    company: "QA Innovations Inc",
    country: "Germany",
    vatId: "DE123456789"
  },

  // Alumni attendee - returning from previous year
  alumniAttendee: {
    email: "alumni.test@mailinator.com",
    firstName: "John",
    lastName: "QualityEngineer",
    company: "Testing Excellence Ltd",
    country: "United Kingdom",
    previousYears: [2024, 2023],
    eligibleForDiscount: true
  },

  // Group organizer - registering 3+ people
  groupOrganizer: {
    email: "group.leader@mailinator.com",
    firstName: "Sarah",
    lastName: "TeamLead",
    company: "Agile Solutions GmbH",
    country: "Austria",
    groupSize: 5
  },

  // Online-only attendee
  onlineAttendee: {
    email: "virtual.attendee@mailinator.com",
    firstName: "Remote",
    lastName: "Worker",
    company: "Digital Nomad Co",
    country: "United States",
    timezone: "EST"
  },

  // Speaker applicant
  speakerApplicant: {
    email: "speaker.proposal@mailinator.com",
    firstName: "Expert",
    lastName: "Speaker",
    company: "Thought Leadership Inc",
    sessionTitle: "Advanced AI Testing Strategies",
    sessionAbstract: "Exploring ML-powered test automation..."
  }
};
```

### Payment Test Data

```javascript
// Stripe test card numbers
const paymentTestData = {
  validCards: {
    visa: {
      number: "4242424242424242",
      expiry: "12/26",
      cvc: "123",
      expectedResult: "success"
    },
    mastercard: {
      number: "5555555555554444",
      expiry: "12/26",
      cvc: "123",
      expectedResult: "success"
    }
  },

  invalidCards: {
    declined: {
      number: "4000000000000002",
      expiry: "12/26",
      cvc: "123",
      expectedResult: "card_declined"
    },
    insufficientFunds: {
      number: "4000000000009995",
      expiry: "12/26",
      cvc: "123",
      expectedResult: "insufficient_funds"
    },
    expired: {
      number: "4000000000000069",
      expiry: "12/26",
      cvc: "123",
      expectedResult: "expired_card"
    }
  },

  invoicePayment: {
    method: "bank_transfer",
    companyName: "Test Company GmbH",
    billingAddress: "Teststrasse 123, 10115 Berlin, Germany",
    vatId: "DE123456789"
  }
};
```

### Ticket Pricing Data

```javascript
const ticketPricing = {
  tutorialAndConference: {
    name: "Tutorial + 3 Days",
    originalPrice: 3450,
    discountedPrice: 2925,
    currency: "EUR",
    vatRate: 0.19,
    priceWithVAT: 3481.75, // 2925 * 1.19
    includes: [
      "1 Tutorial Day (Nov 24)",
      "3 Conference Days (Nov 25-27)",
      "Onsite access",
      "Meals and refreshments",
      "Access to all sessions"
    ]
  },

  conferenceOnly: {
    name: "3 Conference Days",
    originalPrice: 2500,
    discountedPrice: 2125,
    currency: "EUR",
    vatRate: 0.19,
    priceWithVAT: 2528.75, // 2125 * 1.19
    includes: [
      "3 Conference Days (Nov 25-27)",
      "Onsite access",
      "Meals and refreshments",
      "Access to all sessions"
    ]
  },

  onlinePass: {
    name: "Online Pass",
    originalPrice: 499,
    discountedPrice: 299,
    currency: "EUR",
    vatRate: 0.19,
    priceWithVAT: 355.81, // 299 * 1.19
    includes: [
      "Virtual access to all sessions",
      "Live streaming (Nov 25-27)",
      "On-demand recordings (6 months access)"
    ]
  },

  discounts: {
    alumni: {
      eligibility: "Attended any ATD from 2017 onward",
      type: "percentage",
      value: 10 // assumed percentage
    },
    group: {
      minimumSize: 3,
      type: "custom_pricing",
      contactRequired: true
    }
  }
};
```

### Form Validation Data

```javascript
const formValidationData = {
  validEmails: [
    "test@example.com",
    "user.name+tag@example.co.uk",
    "test_user@domain-name.com"
  ],

  invalidEmails: [
    "invalid-email",
    "@example.com",
    "user@",
    "user space@example.com",
    ""
  ],

  validNames: [
    "John",
    "María José",
    "O'Brien",
    "Jean-Claude",
    "李明"
  ],

  invalidNames: [
    "",
    "A", // too short
    "X".repeat(256), // too long
    "123456", // numbers only
    "<script>alert('xss')</script>" // injection attempt
  ],

  vatIdFormats: {
    germany: "DE123456789",
    uk: "GB123456789",
    austria: "ATU12345678",
    invalid: "INVALID123"
  }
};
```

---

## BDD Test Scenarios

### 1. Navigation Structure

#### Feature: Primary Navigation Menu

```gherkin
Feature: Primary Navigation Menu
  As a website visitor
  I want to navigate through the main menu sections
  So that I can find information about the conference

  Background:
    Given I am on the Agile Testing Days homepage
    And the primary navigation menu is visible

  Scenario: Navigate to About section
    When I click on the "About" menu item
    Then I should see the About page
    And the page title should contain "About"
    And the URL should contain "/about"

  Scenario: Navigate to Conference section
    When I click on the "Conference" menu item
    Then I should see the Conference page
    And I should see subsections for "Program", "Tutorials", "Speakers", "Location"
    And the URL should contain "/conference"

  Scenario: Navigate to Registration section
    When I click on the "Registration" menu item
    Then I should be redirected to the registration page
    And I should see ticket pricing information
    And I should see all three ticket tiers displayed

  Scenario: Navigate to Groups section
    When I click on the "Groups" menu item
    Then I should see information about group discounts
    And I should see "minimum 3 members" mentioned
    And I should see contact information for group bookings

  Scenario: Navigate to Call for Papers section
    When I click on the "Call for Papers" menu item
    Then I should see the Call for Papers page
    And I should see a submission form or submission guidelines
    And the URL should contain "/call-for-papers" or "/cfp"

  Scenario: Navigate to Sponsorship section
    When I click on the "Sponsorship" menu item
    Then I should see sponsorship opportunities
    And I should see different sponsorship tier information
    And I should see contact information for sponsorship inquiries

  Scenario: Access Login functionality
    When I click on the "Login" menu item
    Then I should see a login form
    And the form should have fields for "username" or "email" and "password"
    And I should see a "Forgot password" link

  Scenario: Verify homepage logo link
    Given I am on any page of the website
    When I click on the Agile Testing Days logo
    Then I should be redirected to the homepage
    And the URL should be "https://agiletestingdays.com/" or "https://agiletestingdays.com"
```

#### Feature: Sub-navigation and Breadcrumbs

```gherkin
Feature: Conference Sub-navigation
  As a website visitor
  I want to navigate through conference sub-sections
  So that I can explore specific conference details

  Background:
    Given I am on the Conference page

  Scenario: Navigate to Program subsection
    When I click on "Program" in the conference sub-menu
    Then I should see the conference program schedule
    And I should see sessions grouped by day (Nov 24-27)

  Scenario: Navigate to Tutorials subsection
    When I click on "Tutorials" in the conference sub-menu
    Then I should see tutorial information
    And I should see Tutorial Day is November 24, 2025

  Scenario: Navigate to Speakers subsection
    When I click on "Speakers" in the conference sub-menu
    Then I should see a list of featured speakers
    And I should see at least 11 speaker profiles

  Scenario: Navigate to Location subsection
    When I click on "Location" in the conference sub-menu
    Then I should see venue information
    And I should see "Dorint Sanssouci Berlin/Potsdam"
    And I should see proximity to "Sanssouci Park" mentioned

  Scenario: Navigate to Deep Dive Tracks subsection
    When I click on "Deep Dive Tracks" in the conference sub-menu
    Then I should see information about specialized tracks
    And I should see different track categories or themes
```

---

### 2. Registration & Ticketing

#### Feature: Ticket Selection and Display

```gherkin
Feature: Ticket Selection and Display
  As a prospective attendee
  I want to view and select ticket options
  So that I can register for the conference

  Background:
    Given I am on the registration page
    And all ticket tiers are displayed

  Scenario: View Tutorial + Conference ticket details
    When I view the "Tutorial + 3 Days" ticket option
    Then I should see the price "€2,925"
    And I should see the original price "€3,450" struck through
    And I should see "VAT not included" or "excl. 19% VAT"
    And I should see the conference dates "November 24-27, 2025"
    And I should see a "Select" or "Register now" button

  Scenario: View 3-Day Conference ticket details
    When I view the "3 Conference Days" ticket option
    Then I should see the price "€2,125"
    And I should see the original price "€2,500" struck through
    And I should see "VAT not included" or "excl. 19% VAT"
    And I should see the conference dates "November 25-27, 2025"
    And I should see a "Select" or "Register now" button

  Scenario: View Online Pass ticket details
    When I view the "Online Pass" ticket option
    Then I should see the price "€299"
    And I should see the original price "€499" struck through
    And I should see "VAT not included" or "excl. 19% VAT"
    And I should see virtual/online access mentioned
    And I should see a "Select" or "Register now" button

  Scenario: Compare ticket features
    When I view all three ticket options side by side
    Then I should see clear differentiation between onsite and online access
    And Tutorial + Conference should include "Tutorial Day (Nov 24)"
    And 3-Day Conference should include "Conference Days (Nov 25-27)"
    And Online Pass should include "Virtual access" or "Live streaming"

  Scenario: Verify VAT information display
    When I view any ticket option
    Then I should see "19% VAT" mentioned
    And I should see that VAT is "not included" in displayed price
    Or I should see both "excl. VAT" and "incl. VAT" prices

  Scenario: Select Tutorial + Conference ticket
    When I click "Select" or "Register now" on the "Tutorial + 3 Days" ticket
    Then I should be redirected to the registration form
    And the selected ticket should be pre-populated or indicated
    And the price €2,925 should be displayed in the order summary

  Scenario: Select 3-Day Conference ticket
    When I click "Select" or "Register now" on the "3 Conference Days" ticket
    Then I should be redirected to the registration form
    And the selected ticket should be pre-populated or indicated
    And the price €2,125 should be displayed in the order summary

  Scenario: Select Online Pass ticket
    When I click "Select" or "Register now" on the "Online Pass" ticket
    Then I should be redirected to the registration form
    And the selected ticket should be pre-populated or indicated
    And the price €299 should be displayed in the order summary
```

#### Feature: Registration Form Completion

```gherkin
Feature: Registration Form Completion
  As a prospective attendee
  I want to fill out the registration form
  So that I can complete my conference registration

  Background:
    Given I have selected a ticket tier
    And I am on the registration form page

  Scenario: Complete registration form with valid data
    When I enter the following information:
      | Field         | Value                              |
      | Email         | new.attendee.test@mailinator.com   |
      | First Name    | Jane                               |
      | Last Name     | Tester                             |
      | Company       | QA Innovations Inc                 |
      | Country       | Germany                            |
    And I accept the terms and conditions
    And I click "Continue" or "Next"
    Then the form should be submitted successfully
    And I should proceed to the payment selection page

  Scenario: Submit registration form with missing required fields
    When I leave the "Email" field empty
    And I click "Continue" or "Next"
    Then I should see a validation error "Email is required"
    And the form should not be submitted
    And I should remain on the registration form page

  Scenario: Submit registration form with invalid email format
    When I enter "invalid-email-format" in the Email field
    And I click "Continue" or "Next"
    Then I should see a validation error "Invalid email format" or "Please enter a valid email"
    And the form should not be submitted

  Scenario: Register as alumni attendee for discount
    Given I am an alumni attendee who attended in 2024
    When I complete the registration form
    And I select "I am an alumni attendee" or similar option
    And I provide my previous attendance year "2024"
    Then I should see a discount applied to my ticket price
    Or I should see a message about discount eligibility

  Scenario: Verify form data persistence
    Given I have partially completed the registration form
    When I navigate away from the page
    And I return to the registration form
    Then my previously entered data should be retained
    Or I should see a warning "You have unsaved changes"
```

---

### 3. Payment Processing

#### Feature: Payment Method Selection

```gherkin
Feature: Payment Method Selection
  As a registered attendee
  I want to select a payment method
  So that I can complete my conference registration payment

  Background:
    Given I have completed the registration form
    And I am on the payment selection page

  Scenario: View available payment methods
    When I view the payment options
    Then I should see "Invoice payment via bank transfer" option
    And I should see "Stripe Payment with Credit Card" option
    And both options should be clearly labeled and selectable

  Scenario: Select invoice payment method
    When I select "Invoice payment via bank transfer"
    And I click "Continue" or "Proceed"
    Then I should see invoice payment instructions
    And I should see bank transfer details (account number, IBAN, reference)
    And I should see expected payment deadline

  Scenario: Select credit card payment method
    When I select "Stripe Payment with Credit Card"
    And I click "Continue" or "Proceed"
    Then I should see the Stripe payment form
    And I should see fields for card number, expiry date, CVC
    And I should see secure payment indicators (lock icon, SSL)

  Scenario: Change payment method before completion
    Given I have selected "Credit Card" payment
    When I click "Back" or "Change payment method"
    Then I should return to the payment selection page
    And I should be able to select "Invoice payment" instead
    And my registration data should be preserved
```

#### Feature: Credit Card Payment via Stripe

```gherkin
Feature: Credit Card Payment via Stripe
  As a registered attendee
  I want to pay by credit card
  So that I can immediately confirm my conference registration

  Background:
    Given I have selected "Stripe Payment with Credit Card"
    And I am on the Stripe payment form
    And my ticket price is €2,925 (Tutorial + Conference)

  Scenario: Successful payment with valid Visa card
    When I enter the following card details:
      | Field         | Value              |
      | Card Number   | 4242424242424242   |
      | Expiry Date   | 12/26              |
      | CVC           | 123                |
      | Cardholder    | Jane Tester        |
    And I click "Pay Now" or "Complete Payment"
    Then the payment should be processed successfully
    And I should see a confirmation message "Payment successful"
    And I should receive a confirmation email within 5 minutes
    And the email should contain ticket details and order summary

  Scenario: Successful payment with valid Mastercard
    When I enter the following card details:
      | Field         | Value              |
      | Card Number   | 5555555555554444   |
      | Expiry Date   | 12/26              |
      | CVC           | 123                |
      | Cardholder    | Jane Tester        |
    And I click "Pay Now" or "Complete Payment"
    Then the payment should be processed successfully
    And I should see a confirmation message

  Scenario: Failed payment with declined card
    When I enter the following card details:
      | Field         | Value              |
      | Card Number   | 4000000000000002   |
      | Expiry Date   | 12/26              |
      | CVC           | 123                |
      | Cardholder    | Jane Tester        |
    And I click "Pay Now" or "Complete Payment"
    Then the payment should fail
    And I should see an error message "Your card was declined"
    And I should remain on the payment page
    And I should be able to try a different payment method

  Scenario: Failed payment with insufficient funds card
    When I enter the following card details:
      | Field         | Value              |
      | Card Number   | 4000000000009995   |
      | Expiry Date   | 12/26              |
      | CVC           | 123                |
      | Cardholder    | Jane Tester        |
    And I click "Pay Now" or "Complete Payment"
    Then the payment should fail
    And I should see an error message containing "insufficient funds"

  Scenario: Validate credit card number format
    When I enter an invalid card number "1234"
    Then I should see a validation error "Invalid card number"
    And the "Pay Now" button should be disabled
    Or the form should prevent submission

  Scenario: Validate expiry date format
    When I enter an expired date "12/20"
    Then I should see a validation error "Card has expired" or "Invalid expiry date"
    And the payment should not be submitted

  Scenario: Verify total amount including VAT
    Given my ticket price is €2,925 (excl. VAT)
    When I view the payment summary
    Then I should see "Subtotal: €2,925"
    And I should see "VAT (19%): €555.75"
    And I should see "Total: €3,480.75"
```

#### Feature: Invoice Payment Processing

```gherkin
Feature: Invoice Payment Processing
  As a registered attendee
  I want to pay by invoice
  So that I can use my company's standard payment process

  Background:
    Given I have selected "Invoice payment via bank transfer"
    And I am on the invoice payment page

  Scenario: View invoice payment instructions
    When I view the invoice payment page
    Then I should see complete bank transfer details
    And I should see IBAN or account number
    And I should see a unique payment reference number
    And I should see payment deadline (e.g., "Payment due within 14 days")
    And I should see total amount due including VAT

  Scenario: Complete registration with invoice payment
    When I confirm "Invoice payment" option
    And I click "Complete Registration"
    Then my registration should be confirmed
    And I should see a message "Registration complete - awaiting payment"
    And I should receive an invoice via email within 5 minutes
    And the invoice should include all registration details and payment instructions

  Scenario: Download invoice PDF
    Given I have completed registration with invoice payment
    When I click "Download Invoice" button
    Then a PDF file should be downloaded
    And the PDF should contain my registration details
    And the PDF should contain bank transfer information
    And the PDF should contain the total amount due with VAT

  Scenario: Request invoice with VAT ID
    Given I am registering from Germany
    When I enter a valid VAT ID "DE123456789"
    And I complete registration with invoice payment
    Then the invoice should include my VAT ID
    And VAT reverse charge mechanism may be applied (if applicable)
```

---

### 4. Newsletter Signup

#### Feature: Newsletter Subscription

```gherkin
Feature: Newsletter Subscription
  As a website visitor
  I want to subscribe to the newsletter
  So that I can receive updates about Agile Testing Days

  Background:
    Given I am on the Agile Testing Days homepage
    And the newsletter signup form is visible

  Scenario: Successful newsletter subscription with valid data
    When I enter "test.subscriber@mailinator.com" in the email field
    And I enter "John" in the first name field
    And I check the data consent checkbox
    And I click "Subscribe" or "Sign up"
    Then I should see a success message "Thank you for subscribing"
    And I should receive a confirmation email within 5 minutes
    And the email should contain a link to confirm subscription

  Scenario: Submit newsletter form without email
    When I leave the email field empty
    And I enter "John" in the first name field
    And I check the data consent checkbox
    And I click "Subscribe"
    Then I should see a validation error "Email is required"
    And the form should not be submitted

  Scenario: Submit newsletter form with invalid email
    When I enter "invalid-email" in the email field
    And I enter "John" in the first name field
    And I check the data consent checkbox
    And I click "Subscribe"
    Then I should see a validation error "Please enter a valid email address"
    And the form should not be submitted

  Scenario: Submit newsletter form without consent checkbox
    When I enter "test.subscriber@mailinator.com" in the email field
    And I enter "John" in the first name field
    And I do NOT check the data consent checkbox
    And I click "Subscribe"
    Then I should see a validation error "Please accept the data consent"
    Or the "Subscribe" button should be disabled

  Scenario: Subscribe with email already in database
    Given the email "existing.subscriber@mailinator.com" is already subscribed
    When I enter "existing.subscriber@mailinator.com" in the email field
    And I complete the form
    And I click "Subscribe"
    Then I should see a message "You are already subscribed"
    Or I should see "Please check your email to confirm subscription"

  Scenario: Newsletter signup without first name
    When I enter "test.subscriber@mailinator.com" in the email field
    And I leave the first name field empty
    And I check the data consent checkbox
    And I click "Subscribe"
    Then the form should either:
      - Accept submission (first name is optional)
      - Show validation error "First name is required"
```

---

### 5. FAQ Section

#### Feature: FAQ Expandable Q&A

```gherkin
Feature: FAQ Expandable Q&A
  As a website visitor
  I want to read frequently asked questions
  So that I can find answers without contacting support

  Background:
    Given I am on the FAQ page or section
    And multiple FAQ items are visible

  Scenario: Expand individual FAQ item
    When I click on the question "What are the group discounts?"
    Then the answer should expand and become visible
    And the answer should mention "minimum 3 members"
    And the question should remain visible

  Scenario: Collapse expanded FAQ item
    Given the FAQ item "What are the group discounts?" is expanded
    When I click on the question again
    Then the answer should collapse and become hidden
    And only the question should remain visible

  Scenario: View payment options FAQ
    When I click on "What payment options are available?"
    Then the answer should expand
    And I should see "invoice payment via bank transfer" mentioned
    And I should see "Stripe Payment with Credit Card" mentioned

  Scenario: View alumni discount FAQ
    When I click on "Who is eligible for alumni discount?"
    Then the answer should expand
    And I should see "attendees from 2017 onward" mentioned
    Or I should see the specific years of eligibility

  Scenario: Multiple FAQ items expanded simultaneously
    Given I have expanded the FAQ "What are the group discounts?"
    When I expand another FAQ "What payment options are available?"
    Then both FAQ answers should remain expanded
    Or the first FAQ should collapse (accordion behavior)
```

---

### 6. Call for Papers Submission

#### Feature: Call for Papers Form

```gherkin
Feature: Call for Papers Form
  As a potential speaker
  I want to submit a session proposal
  So that I can present at Agile Testing Days 2025

  Background:
    Given I am on the Call for Papers page
    And the submission form is accessible

  Scenario: Submit complete session proposal
    When I enter the following information:
      | Field                  | Value                                    |
      | Email                  | speaker.proposal@mailinator.com          |
      | First Name             | Expert                                   |
      | Last Name              | Speaker                                  |
      | Company                | Thought Leadership Inc                   |
      | Session Title          | Advanced AI Testing Strategies           |
      | Session Abstract       | Exploring ML-powered test automation...  |
      | Session Type           | Workshop                                 |
      | Track                  | Test Automation                          |
    And I accept the speaker terms and conditions
    And I click "Submit Proposal"
    Then I should see a success message "Your proposal has been submitted"
    And I should receive a confirmation email within 5 minutes

  Scenario: Submit proposal with missing required fields
    When I enter only "Session Title" and leave other fields empty
    And I click "Submit Proposal"
    Then I should see validation errors for all required fields
    And the form should not be submitted

  Scenario: Validate session abstract character limit
    Given the session abstract has a maximum character limit (e.g., 500 characters)
    When I enter text exceeding the limit
    Then I should see a character counter showing "X/500 characters"
    And I should see a warning when approaching the limit
    And submission should be prevented if limit is exceeded

  Scenario: Select session type from dropdown
    When I click on the "Session Type" dropdown
    Then I should see options such as:
      - Talk
      - Workshop
      - Tutorial
      - Panel Discussion
    And I should be able to select one option

  Scenario: Upload speaker photo or bio
    Given the form allows file uploads
    When I click "Upload Photo"
    And I select a valid image file (JPG, PNG, max 5MB)
    Then the file should upload successfully
    And I should see a preview of the uploaded image

  Scenario: Save draft proposal
    Given I have partially completed the proposal form
    When I click "Save Draft"
    Then my current data should be saved
    And I should see a message "Draft saved successfully"
    And I should be able to return later to complete submission

  Scenario: View submission deadline
    When I view the Call for Papers page
    Then I should see the submission deadline clearly displayed
    And I should see the expected notification date for accepted proposals
```

---

### 7. Speaker Profiles

#### Feature: Speaker Profile Display and Navigation

```gherkin
Feature: Speaker Profile Display and Navigation
  As a website visitor
  I want to view speaker profiles
  So that I can learn about the conference presenters

  Background:
    Given I am on the Speakers page
    And at least 11 speaker profiles are displayed

  Scenario: View speaker profile grid
    When I view the Speakers page
    Then I should see a grid or list of speaker profiles
    And each profile should display:
      - Speaker name
      - Speaker photo
      - Job title or role (e.g., "VP of Developer Relations")
      - Company name
    And I should see at least 11 speaker profiles

  Scenario: Click on individual speaker profile
    When I click on a speaker profile for "VP of Developer Relations"
    Then I should see detailed information about the speaker
    And I should see their full bio
    And I should see their session title(s)
    And I should see social media links (if available)

  Scenario: Filter speakers by track or topic
    Given the Speakers page has filter options
    When I select "Test Automation" track filter
    Then I should see only speakers presenting in the Test Automation track
    And the total count of speakers should update accordingly

  Scenario: Search for specific speaker
    Given the Speakers page has a search function
    When I enter "Quality Lead" in the search field
    Then I should see speakers matching "Quality Lead" job title
    And non-matching speakers should be hidden
```

---

### 8. Sponsor Gallery

#### Feature: Sponsor and Exhibitor Display

```gherkin
Feature: Sponsor and Exhibitor Display
  As a website visitor
  I want to view conference sponsors
  So that I can learn about supporting organizations

  Background:
    Given I am on the Sponsors page or section
    And at least 16 sponsor logos are displayed

  Scenario: View sponsors grouped by tier
    When I view the Sponsors section
    Then I should see sponsors grouped by tier:
      - Gold Sponsors
      - Silver Sponsors
      - Bronze Sponsors
      - Online Sponsors
      - Media Partners
    And each tier should be clearly labeled

  Scenario: Click on sponsor logo
    When I click on a sponsor logo
    Then I should be redirected to the sponsor's website in a new tab
    Or I should see a modal with sponsor information
    And the sponsor's URL should be valid and accessible

  Scenario: Verify sponsor logo image quality
    When I view sponsor logos
    Then all logos should be displayed clearly
    And images should load without broken image icons
    And logos should be consistently sized within each tier
```

---

### 9. External Links and Integrations

#### Feature: External Platform Integration

```gherkin
Feature: External Platform Integration
  As a website visitor
  I want to access external community platforms
  So that I can engage with Agile Testing Days beyond the website

  Background:
    Given I am on the Agile Testing Days homepage

  Scenario: Navigate to Slack community
    When I click on the "Slack" link or icon
    Then I should be redirected to the Agile Testing Days Slack workspace
    And the URL should contain "slack.com" or a Slack invite link
    And the link should open in a new tab

  Scenario: Navigate to LinkedIn page
    When I click on the "LinkedIn" link or icon
    Then I should be redirected to the Agile Testing Days LinkedIn page
    And the URL should contain "linkedin.com"
    And the link should open in a new tab

  Scenario: Navigate to YouTube channel
    When I click on the "YouTube" link or icon
    Then I should be redirected to the Agile Testing Days YouTube channel
    And the URL should contain "youtube.com"
    And the link should open in a new tab

  Scenario: Navigate to Bluesky profile
    When I click on the "Bluesky" link or icon
    Then I should be redirected to the Agile Testing Days Bluesky profile
    And the URL should contain "bsky.app" or Bluesky domain
    And the link should open in a new tab

  Scenario: Verify live chat widget loads
    When the page loads completely
    Then the live chat widget should be visible in the bottom right corner
    Or I should see a "Chat with us" button
    And clicking the widget should open a chat interface

  Scenario: Navigate to AgileTD Zone community site
    Given the website mentions "AgileTD Zone" community
    When I click on the AgileTD Zone link
    Then I should be redirected to the community platform
    And the URL should be a valid AgileTD community domain
```

---

### 10. Login Functionality

#### Feature: User Authentication

```gherkin
Feature: User Authentication
  As a registered user
  I want to log into my account
  So that I can access my registration details and personalized content

  Background:
    Given I am on the Login page
    And I have previously registered an account

  Scenario: Successful login with valid credentials
    When I enter "registered.user@mailinator.com" in the email field
    And I enter "ValidPassword123!" in the password field
    And I click "Login" or "Sign In"
    Then I should be logged in successfully
    And I should be redirected to my account dashboard or profile page
    And I should see my name or account information displayed

  Scenario: Failed login with invalid email
    When I enter "nonexistent.user@mailinator.com" in the email field
    And I enter "SomePassword123!" in the password field
    And I click "Login"
    Then I should see an error message "Invalid email or password"
    And I should remain on the login page
    And I should not be logged in

  Scenario: Failed login with incorrect password
    When I enter "registered.user@mailinator.com" in the email field
    And I enter "WrongPassword" in the password field
    And I click "Login"
    Then I should see an error message "Invalid email or password"
    And I should remain on the login page

  Scenario: Login with empty credentials
    When I leave both email and password fields empty
    And I click "Login"
    Then I should see validation errors:
      - "Email is required"
      - "Password is required"
    And the form should not be submitted

  Scenario: Use "Forgot Password" functionality
    When I click on "Forgot password?" link
    Then I should be redirected to the password reset page
    And I should see a form to enter my email address

  Scenario: Request password reset
    Given I am on the password reset page
    When I enter "registered.user@mailinator.com" in the email field
    And I click "Send Reset Link"
    Then I should see a message "Password reset email sent"
    And I should receive a password reset email within 5 minutes
    And the email should contain a valid reset link

  Scenario: Logout from account
    Given I am logged in
    When I click "Logout" or "Sign Out"
    Then I should be logged out
    And I should be redirected to the homepage or login page
    And I should no longer see my account information

  Scenario: Session persistence after login
    Given I have logged in successfully
    When I navigate to different pages on the site
    Then I should remain logged in
    And my session should persist until I logout or it expires
```

---

## Risk Assessment

### Functional Risk Matrix

| Functional Area | Impact | Likelihood | Risk Level | Mitigation Strategy |
|-----------------|--------|------------|------------|---------------------|
| **Payment Processing** | CRITICAL | MEDIUM | HIGH | - Extensive test coverage with valid/invalid cards<br>- Test in Stripe sandbox mode<br>- Verify error handling<br>- Monitor payment confirmations |
| **Registration Flow** | CRITICAL | MEDIUM | HIGH | - End-to-end user journey tests<br>- Validate all form fields<br>- Test data persistence<br>- Verify confirmation emails |
| **Ticket Pricing Display** | HIGH | LOW | MEDIUM | - Cross-verify pricing across all pages<br>- Validate VAT calculations<br>- Test discount logic |
| **Email Confirmations** | HIGH | MEDIUM | HIGH | - Test email delivery to multiple providers<br>- Verify email content accuracy<br>- Check spam folder handling |
| **Navigation Links** | MEDIUM | LOW | LOW | - Regular link validation<br>- 404 error monitoring |
| **External Integrations** | MEDIUM | MEDIUM | MEDIUM | - Verify redirects to external platforms<br>- Monitor third-party service availability |
| **Form Validation** | MEDIUM | MEDIUM | MEDIUM | - Test boundary values<br>- XSS and injection prevention<br>- Browser compatibility |
| **FAQ Functionality** | LOW | LOW | LOW | - Basic expand/collapse testing |
| **Sponsor Display** | LOW | LOW | LOW | - Image loading verification |
| **Newsletter Signup** | MEDIUM | LOW | LOW | - GDPR consent validation<br>- Email delivery testing |

### High-Risk Scenarios

1. **Payment Failure After Registration**
   - **Risk**: User completes registration but payment fails without clear recovery path
   - **Impact**: Lost revenue, poor user experience, customer support burden
   - **Mitigation**: Test all payment failure scenarios; verify retry mechanisms; ensure clear error messages

2. **Email Delivery Failure**
   - **Risk**: Confirmation emails not delivered, users uncertain about registration status
   - **Impact**: User anxiety, support tickets, potential duplicate registrations
   - **Mitigation**: Test with multiple email providers (Gmail, Outlook, corporate); monitor delivery rates

3. **Pricing Inconsistency**
   - **Risk**: Different prices displayed across pages or incorrect VAT calculation
   - **Impact**: Legal issues, revenue loss, customer complaints
   - **Mitigation**: Automated price validation tests; compare pricing across all pages

4. **Form Data Loss**
   - **Risk**: User loses entered data due to session timeout or navigation
   - **Impact**: Frustration, abandoned registrations, lost conversions
   - **Mitigation**: Test session management; verify draft-saving functionality

5. **Broken External Links**
   - **Risk**: Links to payment gateway, social media, or community platforms fail
   - **Impact**: Reduced engagement, inability to complete registration
   - **Mitigation**: Daily automated link checking; fallback mechanisms

---

## Success Criteria

### Test Completion Criteria

- **Coverage**: 100% of critical user journeys tested
- **Pass Rate**: 95% of test scenarios passing
- **Defects**: All critical and high-severity defects resolved before production
- **Execution Time**: Full regression suite completes within 30 minutes
- **Stability**: Test flakiness rate <2%

### Functional Acceptance Criteria

#### Critical Flows (Must Pass 100%)

1. **Complete Registration Flow**
   - User can select ticket → complete form → select payment → receive confirmation
   - Success rate: 100% for valid data
   - Confirmation email delivered within 5 minutes

2. **Payment Processing**
   - Valid credit cards processed successfully: 100%
   - Invalid cards rejected with appropriate errors: 100%
   - Invoice payments generate correct invoice documents: 100%

3. **Navigation Integrity**
   - All primary menu items navigate correctly: 100%
   - All internal links resolve (no 404 errors): 100%
   - External links redirect to correct platforms: 100%

#### High-Priority Flows (Must Pass 95%)

4. **Form Validation**
   - Required field validation works: 95%
   - Email format validation works: 95%
   - Error messages are clear and actionable: 95%

5. **Content Accuracy**
   - Pricing displayed consistently: 100%
   - Event dates correct across all pages: 100%
   - Speaker/sponsor information accurate: 95%

#### Medium-Priority Flows (Must Pass 90%)

6. **Newsletter Signup**
   - Valid submissions processed: 90%
   - Confirmation emails delivered: 90%

7. **FAQ Functionality**
   - Expand/collapse works smoothly: 90%

### Performance Benchmarks (Functional Testing Context)

While performance testing is out of scope, functional tests should complete within:
- Single test scenario: <60 seconds
- Form submission: <10 seconds response time
- Payment processing: <30 seconds from submit to confirmation
- Page navigation: <5 seconds to load

### Quality Gates

Tests must pass these gates before production deployment:

| Gate | Criteria | Status |
|------|----------|--------|
| **Critical Path** | 100% pass rate | REQUIRED |
| **Payment Flow** | 100% pass rate | REQUIRED |
| **Registration** | 100% pass rate | REQUIRED |
| **Smoke Tests** | 100% pass rate | REQUIRED |
| **Regression Suite** | 95% pass rate | REQUIRED |
| **Known Issues** | 0 critical, 0 high-severity | REQUIRED |

---

## Test Execution Strategy

### Test Phases

#### Phase 1: Smoke Testing (Duration: 1 hour)
- **Scope**: Critical happy paths only
- **Scenarios**: 15 core scenarios
- **Frequency**: After every deployment
- **Goal**: Verify basic functionality works

#### Phase 2: Functional Testing (Duration: 4-6 hours)
- **Scope**: All 67 BDD scenarios
- **Scenarios**: Complete test suite
- **Frequency**: Daily (automated), before releases
- **Goal**: Comprehensive functional validation

#### Phase 3: Regression Testing (Duration: 2-3 hours)
- **Scope**: Previously failed scenarios + critical paths
- **Scenarios**: ~40 scenarios
- **Frequency**: Weekly, before major releases
- **Goal**: Ensure no functionality broke

#### Phase 4: Exploratory Testing (Duration: 4 hours)
- **Scope**: Manual exploration of edge cases
- **Scenarios**: Unscripted, heuristic-based
- **Frequency**: Before major releases
- **Goal**: Find unexpected issues

### Automation Strategy

```javascript
// Test suite organization
const testSuites = {
  smoke: {
    priority: "CRITICAL",
    scenarios: [
      "Homepage loads",
      "Registration page accessible",
      "Payment page accessible",
      "Ticket selection works",
      "Newsletter signup works"
    ],
    execution: "Every deployment",
    maxDuration: "10 minutes"
  },

  critical: {
    priority: "HIGH",
    scenarios: [
      "Complete registration flow",
      "Payment processing (all methods)",
      "Email confirmations",
      "Login/logout"
    ],
    execution: "Daily",
    maxDuration: "15 minutes"
  },

  full: {
    priority: "MEDIUM",
    scenarios: "All 67 scenarios",
    execution: "Daily (overnight)",
    maxDuration: "30 minutes"
  }
};
```

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
name: E2E Tests - Agile Testing Days

on:
  push:
    branches: [main, staging]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * *' # Daily at 2 AM UTC

jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Install dependencies
        run: npm ci
      - name: Run smoke tests
        run: npm run test:smoke
      - name: Upload results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: smoke-test-results
          path: test-results/

  full-regression:
    runs-on: ubuntu-latest
    needs: smoke-tests
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - name: Install dependencies
        run: npm ci
      - name: Run full regression suite
        run: npm run test:regression
      - name: Generate report
        run: npm run test:report
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: regression-test-results
          path: test-results/
```

### Test Data Management

- **User Accounts**: Create dedicated test accounts for each persona (new attendee, alumni, group organizer)
- **Email Testing**: Use Mailinator or similar service with unique email addresses per test run
- **Payment Testing**: Use Stripe test mode with documented test card numbers
- **Data Cleanup**: Reset test data after each test run to ensure repeatability
- **Test Isolation**: Each test scenario should be independent and not rely on previous test state

### Reporting

Test reports should include:
1. **Executive Summary**: Pass/fail counts, duration, trends
2. **Scenario Details**: Each BDD scenario result with screenshots on failure
3. **Defect Tracking**: Link to issues for failed scenarios
4. **Trends**: Pass rate over time, flaky test identification
5. **Coverage**: Functional areas covered vs. total areas

---

## Appendix

### A. Playwright Configuration Example

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],

  use: {
    baseURL: 'https://agiletestingdays.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run start:test-server',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
```

### B. BDD Step Definitions Example

```typescript
// steps/navigation.steps.ts
import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from '@playwright/test';

Given('I am on the Agile Testing Days homepage', async function () {
  await this.page.goto('/');
  await expect(this.page).toHaveTitle(/Agile Testing Days/);
});

When('I click on the {string} menu item', async function (menuItem: string) {
  await this.page.click(`nav >> text="${menuItem}"`);
});

Then('I should see the {string} page', async function (pageName: string) {
  await expect(this.page).toHaveURL(new RegExp(pageName.toLowerCase()));
});

Then('the page title should contain {string}', async function (titleText: string) {
  await expect(this.page).toHaveTitle(new RegExp(titleText));
});
```

### C. Test Data Factory

```typescript
// utils/test-data-factory.ts
export class TestDataFactory {
  static generateAttendee(type: 'new' | 'alumni' | 'group' | 'online') {
    const timestamp = Date.now();
    const baseData = {
      email: `test.${type}.${timestamp}@mailinator.com`,
      firstName: 'Test',
      lastName: type.charAt(0).toUpperCase() + type.slice(1),
      company: 'Test Company Inc',
      country: 'Germany',
    };

    switch (type) {
      case 'alumni':
        return { ...baseData, previousYears: [2024], eligibleForDiscount: true };
      case 'group':
        return { ...baseData, groupSize: 5 };
      case 'online':
        return { ...baseData, ticketType: 'online-pass' };
      default:
        return baseData;
    }
  }

  static generatePaymentData(cardType: 'valid-visa' | 'declined' | 'insufficient-funds') {
    const cardNumbers = {
      'valid-visa': '4242424242424242',
      'declined': '4000000000000002',
      'insufficient-funds': '4000000000009995',
    };

    return {
      cardNumber: cardNumbers[cardType],
      expiry: '12/26',
      cvc: '123',
      cardholder: 'Test Cardholder',
    };
  }
}
```

### D. Page Object Model Example

```typescript
// pages/registration.page.ts
import { Page } from '@playwright/test';

export class RegistrationPage {
  constructor(private page: Page) {}

  async selectTicket(ticketType: 'tutorial-conference' | 'conference-only' | 'online-pass') {
    const selectors = {
      'tutorial-conference': '[data-ticket="tutorial-conference"] button',
      'conference-only': '[data-ticket="conference-only"] button',
      'online-pass': '[data-ticket="online-pass"] button',
    };
    await this.page.click(selectors[ticketType]);
  }

  async fillRegistrationForm(data: {
    email: string;
    firstName: string;
    lastName: string;
    company: string;
    country: string;
  }) {
    await this.page.fill('[name="email"]', data.email);
    await this.page.fill('[name="firstName"]', data.firstName);
    await this.page.fill('[name="lastName"]', data.lastName);
    await this.page.fill('[name="company"]', data.company);
    await this.page.selectOption('[name="country"]', data.country);
  }

  async submitForm() {
    await this.page.click('button[type="submit"]');
  }

  async getValidationError(fieldName: string): Promise<string> {
    return await this.page.textContent(`[name="${fieldName}"] + .error-message`);
  }
}
```

### E. Glossary

| Term | Definition |
|------|------------|
| **BDD** | Behavior-Driven Development - testing methodology using Given-When-Then scenarios |
| **Gherkin** | Language for writing BDD scenarios in plain English |
| **Playwright** | Browser automation framework for E2E testing |
| **Smoke Test** | Quick test of critical functionality to verify basic system health |
| **Regression Test** | Re-testing of previously working functionality to ensure no new bugs |
| **Test Fixture** | Reusable test data or environment setup |
| **Page Object Model (POM)** | Design pattern for organizing test code with page-specific classes |
| **CI/CD** | Continuous Integration/Continuous Deployment - automated build and release pipeline |
| **VAT** | Value Added Tax - 19% tax rate applied to conference tickets |
| **Alumni Discount** | Discount for attendees who previously attended ATD from 2017 onward |

### F. Contact and Support

- **Test Plan Owner**: QA Engineering Team
- **Stakeholders**: Product Management, Development Team, Conference Operations
- **Issue Tracking**: GitHub Issues / Jira (specify project key)
- **CI/CD Dashboard**: (link to pipeline)
- **Test Reports**: (link to test result dashboard)

### G. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-10-23 | Agentic QE Fleet | Initial test plan creation |

---

**End of Test Plan**

**Total Scenarios**: 67
**Estimated Implementation Time**: 40-60 hours
**Estimated Execution Time (Full Suite)**: 30 minutes automated
**Recommended Review Cycle**: Bi-weekly updates as website evolves

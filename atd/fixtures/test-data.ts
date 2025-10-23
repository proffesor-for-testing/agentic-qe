/**
 * Test Data - Fixtures and constants for E2E tests
 */

// Ticket pricing information
export const TICKET_PRICING = {
  tutorialAndConference: {
    name: 'Tutorial + 3 Days',
    originalPrice: 3450,
    discountedPrice: 2925,
    currency: 'EUR',
    vatRate: 0.19,
    priceWithVAT: 3481.75, // 2925 * 1.19
    includes: [
      '1 Tutorial Day (Nov 24)',
      '3 Conference Days (Nov 25-27)',
      'Onsite access',
      'Meals and refreshments',
      'Access to all sessions',
    ],
  },
  conferenceOnly: {
    name: '3 Conference Days',
    originalPrice: 2500,
    discountedPrice: 2125,
    currency: 'EUR',
    vatRate: 0.19,
    priceWithVAT: 2528.75, // 2125 * 1.19
    includes: [
      '3 Conference Days (Nov 25-27)',
      'Onsite access',
      'Meals and refreshments',
      'Access to all sessions',
    ],
  },
  onlinePass: {
    name: 'Online Pass',
    originalPrice: 499,
    discountedPrice: 299,
    currency: 'EUR',
    vatRate: 0.19,
    priceWithVAT: 355.81, // 299 * 1.19
    includes: [
      'Virtual access to all sessions',
      'Live streaming (Nov 25-27)',
      'On-demand recordings (6 months access)',
    ],
  },
} as const;

// Stripe test card numbers
export const PAYMENT_TEST_CARDS = {
  validVisa: {
    number: '4242424242424242',
    expiry: '12/26',
    cvc: '123',
    cardholder: 'Test Cardholder',
    expectedResult: 'success',
  },
  validMastercard: {
    number: '5555555555554444',
    expiry: '12/26',
    cvc: '123',
    cardholder: 'Test Cardholder',
    expectedResult: 'success',
  },
  declined: {
    number: '4000000000000002',
    expiry: '12/26',
    cvc: '123',
    cardholder: 'Test Declined',
    expectedResult: 'card_declined',
  },
  insufficientFunds: {
    number: '4000000000009995',
    expiry: '12/26',
    cvc: '123',
    cardholder: 'Test Insufficient',
    expectedResult: 'insufficient_funds',
  },
  expired: {
    number: '4000000000000069',
    expiry: '12/26',
    cvc: '123',
    cardholder: 'Test Expired',
    expectedResult: 'expired_card',
  },
} as const;

// Event details
export const EVENT_DETAILS = {
  name: 'Agile Testing Days 2025',
  dates: {
    tutorial: 'November 24, 2025',
    conference: 'November 25-27, 2025',
    full: 'November 24-27, 2025',
  },
  venue: {
    name: 'Dorint Sanssouci Berlin/Potsdam',
    city: 'Berlin/Potsdam',
    landmark: 'Sanssouci Park',
  },
  format: 'Hybrid (Onsite + Virtual)',
} as const;

// Form validation data
export const FORM_VALIDATION = {
  validEmails: [
    'test@example.com',
    'user.name+tag@example.co.uk',
    'test_user@domain-name.com',
  ],
  invalidEmails: [
    'invalid-email',
    '@example.com',
    'user@',
    'user space@example.com',
    '',
  ],
  validNames: ['John', 'María José', "O'Brien", 'Jean-Claude'],
  invalidNames: ['', 'A', 'X'.repeat(256), '123456'],
  countries: ['Germany', 'United Kingdom', 'Austria', 'United States'],
  vatIds: {
    germany: 'DE123456789',
    uk: 'GB123456789',
    austria: 'ATU12345678',
    invalid: 'INVALID123',
  },
} as const;

// External links
export const EXTERNAL_LINKS = {
  slack: {
    name: 'Slack',
    expectedDomain: 'slack.com',
  },
  linkedin: {
    name: 'LinkedIn',
    expectedDomain: 'linkedin.com',
  },
  youtube: {
    name: 'YouTube',
    expectedDomain: 'youtube.com',
  },
  bluesky: {
    name: 'Bluesky',
    expectedDomain: 'bsky.app',
  },
} as const;

// Navigation items
export const NAVIGATION_ITEMS = [
  'About',
  'Conference',
  'Registration',
  'Groups',
  'Call for Papers',
  'Sponsorship',
  'Login',
] as const;

// Conference subsections
export const CONFERENCE_SUBSECTIONS = [
  'Program',
  'Tutorials',
  'Speakers',
  'Location',
  'Deep Dive Tracks',
] as const;

// Test credentials (for login tests)
export const TEST_CREDENTIALS = {
  validUser: {
    email: process.env.TEST_USER_EMAIL || 'test.user@mailinator.com',
    password: process.env.TEST_USER_PASSWORD || 'TestPassword123!',
  },
  invalidUser: {
    email: 'nonexistent.user@mailinator.com',
    password: 'WrongPassword123!',
  },
} as const;

// Email test domain
export const EMAIL_TEST_DOMAIN = process.env.TEST_EMAIL_DOMAIN || 'mailinator.com';

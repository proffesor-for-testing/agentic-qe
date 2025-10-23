/**
 * User Factory - Generate test user data
 */

import { EMAIL_TEST_DOMAIN } from './test-data';

export type UserType = 'new' | 'alumni' | 'group' | 'online';

export interface TestUser {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  country: string;
  vatId?: string;
  previousYears?: number[];
  eligibleForDiscount?: boolean;
  groupSize?: number;
  ticketType?: 'tutorial-conference' | 'conference-only' | 'online-pass';
}

export class UserFactory {
  /**
   * Generate a test attendee with unique email
   */
  static generateAttendee(type: UserType = 'new'): TestUser {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const uniqueId = `${timestamp}-${randomSuffix}`;

    const baseData: TestUser = {
      email: `test.${type}.${uniqueId}@${EMAIL_TEST_DOMAIN}`,
      firstName: 'Test',
      lastName: this.capitalizeFirst(type),
      company: 'Test Company Inc',
      country: 'Germany',
      vatId: 'DE123456789',
    };

    switch (type) {
      case 'alumni':
        return {
          ...baseData,
          previousYears: [2024, 2023],
          eligibleForDiscount: true,
        };
      case 'group':
        return {
          ...baseData,
          groupSize: 5,
        };
      case 'online':
        return {
          ...baseData,
          ticketType: 'online-pass',
        };
      default:
        return baseData;
    }
  }

  /**
   * Generate a speaker applicant
   */
  static generateSpeaker(): {
    email: string;
    firstName: string;
    lastName: string;
    company: string;
    sessionTitle: string;
    sessionAbstract: string;
  } {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);

    return {
      email: `speaker.${timestamp}-${randomSuffix}@${EMAIL_TEST_DOMAIN}`,
      firstName: 'Expert',
      lastName: 'Speaker',
      company: 'Thought Leadership Inc',
      sessionTitle: 'Advanced AI Testing Strategies',
      sessionAbstract:
        'Exploring ML-powered test automation and quality engineering in modern software development.',
    };
  }

  /**
   * Generate a test user with custom data
   */
  static generateCustomUser(customData: Partial<TestUser>): TestUser {
    const baseUser = this.generateAttendee('new');
    return {
      ...baseUser,
      ...customData,
    };
  }

  /**
   * Generate multiple test users
   */
  static generateMultipleAttendees(count: number, type: UserType = 'new'): TestUser[] {
    return Array.from({ length: count }, () => this.generateAttendee(type));
  }

  /**
   * Generate newsletter subscriber data
   */
  static generateNewsletterSubscriber(): {
    email: string;
    firstName: string;
  } {
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);

    return {
      email: `newsletter.${timestamp}-${randomSuffix}@${EMAIL_TEST_DOMAIN}`,
      firstName: 'Newsletter',
    };
  }

  /**
   * Helper: Capitalize first letter
   */
  private static capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

/**
 * Pre-defined test users (for specific scenarios)
 */
export const TEST_USERS = {
  newAttendee: (): TestUser => ({
    email: `new.attendee.${Date.now()}@${EMAIL_TEST_DOMAIN}`,
    firstName: 'Jane',
    lastName: 'Tester',
    company: 'QA Innovations Inc',
    country: 'Germany',
    vatId: 'DE123456789',
  }),

  alumniAttendee: (): TestUser => ({
    email: `alumni.${Date.now()}@${EMAIL_TEST_DOMAIN}`,
    firstName: 'John',
    lastName: 'QualityEngineer',
    company: 'Testing Excellence Ltd',
    country: 'United Kingdom',
    previousYears: [2024, 2023],
    eligibleForDiscount: true,
  }),

  groupOrganizer: (): TestUser => ({
    email: `group.leader.${Date.now()}@${EMAIL_TEST_DOMAIN}`,
    firstName: 'Sarah',
    lastName: 'TeamLead',
    company: 'Agile Solutions GmbH',
    country: 'Austria',
    groupSize: 5,
  }),

  onlineAttendee: (): TestUser => ({
    email: `virtual.${Date.now()}@${EMAIL_TEST_DOMAIN}`,
    firstName: 'Remote',
    lastName: 'Worker',
    company: 'Digital Nomad Co',
    country: 'United States',
    ticketType: 'online-pass',
  }),
};

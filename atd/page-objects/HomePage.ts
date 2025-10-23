import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * HomePage - Page Object for Agile Testing Days Homepage
 */
export class HomePage extends BasePage {
  // Selectors
  private readonly selectors = {
    logo: 'a[href="/"] img, .logo, header img',
    navigation: 'nav, .navigation, .main-menu, header ul',
    newsletter: {
      form: 'form[class*="newsletter"], #newsletter-form, [data-form="newsletter"]',
      emailInput: 'input[type="email"][name*="email"], input[placeholder*="email" i]',
      firstNameInput: 'input[name*="name"], input[name*="first"]',
      consentCheckbox: 'input[type="checkbox"][name*="consent"], input[type="checkbox"][name*="gdpr"]',
      submitButton: 'button[type="submit"], input[type="submit"]',
      successMessage: '.success, .success-message, [class*="success"]',
    },
    hero: '.hero, .banner, .main-banner',
    eventDates: 'text=/November.*24.*27.*2025/i, text=/Nov.*24.*27/i',
    venue: 'text=/Dorint Sanssouci/i, text=/Berlin.*Potsdam/i',
    registerButton: 'a[href*="register"], button:has-text("Register")',
  };

  constructor(page: Page) {
    super(page);
  }

  // Navigation
  async navigateToHomepage(): Promise<void> {
    await this.goto('/');
    await this.waitForPageLoad();
  }

  async navigateToAbout(): Promise<void> {
    await this.clickNavigationItem('About');
  }

  async navigateToConference(): Promise<void> {
    await this.clickNavigationItem('Conference');
  }

  async navigateToRegistration(): Promise<void> {
    await this.clickNavigationItem('Registration');
  }

  async navigateToGroups(): Promise<void> {
    await this.clickNavigationItem('Groups');
  }

  async navigateToCallForPapers(): Promise<void> {
    await this.clickNavigationItem('Call for Papers');
  }

  async navigateToSponsorship(): Promise<void> {
    await this.clickNavigationItem('Sponsorship');
  }

  async navigateToLogin(): Promise<void> {
    await this.clickNavigationItem('Login');
  }

  // Newsletter signup
  async fillNewsletterEmail(email: string): Promise<void> {
    const form = this.page.locator(this.selectors.newsletter.form).first();
    await form.locator(this.selectors.newsletter.emailInput).fill(email);
  }

  async fillNewsletterFirstName(firstName: string): Promise<void> {
    const form = this.page.locator(this.selectors.newsletter.form).first();
    const firstNameInput = form.locator(this.selectors.newsletter.firstNameInput).first();
    if (await firstNameInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstNameInput.fill(firstName);
    }
  }

  async checkNewsletterConsent(): Promise<void> {
    const form = this.page.locator(this.selectors.newsletter.form).first();
    await form.locator(this.selectors.newsletter.consentCheckbox).first().check();
  }

  async submitNewsletterForm(): Promise<void> {
    const form = this.page.locator(this.selectors.newsletter.form).first();
    await form.locator(this.selectors.newsletter.submitButton).first().click();
  }

  async isNewsletterSuccessVisible(): Promise<boolean> {
    return await this.page.locator(this.selectors.newsletter.successMessage).isVisible({ timeout: 5000 });
  }

  async getNewsletterSuccessMessage(): Promise<string | null> {
    const message = this.page.locator(this.selectors.newsletter.successMessage).first();
    if (await message.isVisible({ timeout: 5000 }).catch(() => false)) {
      return await message.textContent();
    }
    return null;
  }

  // Content verification
  async isEventDatesVisible(): Promise<boolean> {
    return await this.page.locator(this.selectors.eventDates).first().isVisible();
  }

  async isVenueVisible(): Promise<boolean> {
    return await this.page.locator(this.selectors.venue).first().isVisible();
  }

  async clickRegisterButton(): Promise<void> {
    await this.page.locator(this.selectors.registerButton).first().click();
  }

  // Social links
  async clickSlackLink(): Promise<Page> {
    return await this.clickExternalLink('Slack');
  }

  async clickLinkedInLink(): Promise<Page> {
    return await this.clickExternalLink('LinkedIn');
  }

  async clickYouTubeLink(): Promise<Page> {
    return await this.clickExternalLink('YouTube');
  }

  async clickBlueskyLink(): Promise<Page> {
    return await this.clickExternalLink('Bluesky');
  }
}

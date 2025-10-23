import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * RegistrationPage - Page Object for ticket selection and registration form
 */
export class RegistrationPage extends BasePage {
  // Ticket types
  readonly TICKET_TYPES = {
    TUTORIAL_CONFERENCE: 'tutorial-conference',
    CONFERENCE_ONLY: 'conference-only',
    ONLINE_PASS: 'online-pass',
  } as const;

  // Selectors
  private readonly selectors = {
    tickets: {
      tutorialConference: {
        container: '[data-ticket="tutorial-conference"], .ticket-tutorial, .ticket:has-text("Tutorial")',
        price: 'text=/€2,925|2925|2.925/i',
        originalPrice: 'text=/€3,450|3450|3.450/i',
        selectButton: 'button:has-text("Select"), button:has-text("Register"), a:has-text("Select")',
      },
      conferenceOnly: {
        container: '[data-ticket="conference-only"], .ticket-conference, .ticket:has-text("3 Days")',
        price: 'text=/€2,125|2125|2.125/i',
        originalPrice: 'text=/€2,500|2500|2.500/i',
        selectButton: 'button:has-text("Select"), button:has-text("Register"), a:has-text("Select")',
      },
      onlinePass: {
        container: '[data-ticket="online-pass"], .ticket-online, .ticket:has-text("Online")',
        price: 'text=/€299|299/i',
        originalPrice: 'text=/€499|499/i',
        selectButton: 'button:has-text("Select"), button:has-text("Register"), a:has-text("Select")',
      },
    },
    form: {
      email: 'input[name="email"], input[type="email"]',
      firstName: 'input[name*="first"], input[name="firstName"]',
      lastName: 'input[name*="last"], input[name="lastName"]',
      company: 'input[name="company"], input[name="organization"]',
      country: 'select[name="country"], input[name="country"]',
      vatId: 'input[name*="vat"], input[name*="tax"]',
      termsCheckbox: 'input[type="checkbox"][name*="terms"], input[type="checkbox"][name*="accept"]',
      alumniCheckbox: 'input[type="checkbox"][name*="alumni"], input[name*="previous"]',
      submitButton: 'button[type="submit"], button:has-text("Continue"), button:has-text("Next")',
    },
    orderSummary: {
      container: '.order-summary, .summary, [class*="summary"]',
      subtotal: '.subtotal, [class*="subtotal"]',
      vat: '.vat, [class*="vat"], .tax',
      total: '.total, [class*="total"]',
    },
  };

  constructor(page: Page) {
    super(page);
  }

  // Navigation
  async navigateToRegistration(): Promise<void> {
    await this.goto('/registration');
    await this.waitForPageLoad();
  }

  // Ticket selection
  async selectTutorialConferenceTicket(): Promise<void> {
    const ticket = this.page.locator(this.selectors.tickets.tutorialConference.container).first();
    await ticket.locator(this.selectors.tickets.tutorialConference.selectButton).first().click();
    await this.waitForPageLoad();
  }

  async selectConferenceOnlyTicket(): Promise<void> {
    const ticket = this.page.locator(this.selectors.tickets.conferenceOnly.container).first();
    await ticket.locator(this.selectors.tickets.conferenceOnly.selectButton).first().click();
    await this.waitForPageLoad();
  }

  async selectOnlinePassTicket(): Promise<void> {
    const ticket = this.page.locator(this.selectors.tickets.onlinePass.container).first();
    await ticket.locator(this.selectors.tickets.onlinePass.selectButton).first().click();
    await this.waitForPageLoad();
  }

  // Ticket price verification
  async getTutorialConferencePrice(): Promise<string | null> {
    const ticket = this.page.locator(this.selectors.tickets.tutorialConference.container).first();
    const price = ticket.locator(this.selectors.tickets.tutorialConference.price).first();
    return await price.textContent();
  }

  async getConferenceOnlyPrice(): Promise<string | null> {
    const ticket = this.page.locator(this.selectors.tickets.conferenceOnly.container).first();
    const price = ticket.locator(this.selectors.tickets.conferenceOnly.price).first();
    return await price.textContent();
  }

  async getOnlinePassPrice(): Promise<string | null> {
    const ticket = this.page.locator(this.selectors.tickets.onlinePass.container).first();
    const price = ticket.locator(this.selectors.tickets.onlinePass.price).first();
    return await price.textContent();
  }

  async isVATInfoVisible(): Promise<boolean> {
    return await this.page.locator('text=/VAT|19%|excl.*VAT|not included/i').first().isVisible();
  }

  // Registration form
  async fillRegistrationForm(data: {
    email: string;
    firstName: string;
    lastName: string;
    company: string;
    country: string;
    vatId?: string;
  }): Promise<void> {
    await this.page.locator(this.selectors.form.email).fill(data.email);
    await this.page.locator(this.selectors.form.firstName).fill(data.firstName);
    await this.page.locator(this.selectors.form.lastName).fill(data.lastName);
    await this.page.locator(this.selectors.form.company).fill(data.company);

    // Handle country as either select or input
    const countryField = this.page.locator(this.selectors.form.country).first();
    const tagName = await countryField.evaluate(el => el.tagName.toLowerCase());

    if (tagName === 'select') {
      await countryField.selectOption(data.country);
    } else {
      await countryField.fill(data.country);
    }

    // VAT ID is optional
    if (data.vatId) {
      const vatField = this.page.locator(this.selectors.form.vatId).first();
      if (await vatField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await vatField.fill(data.vatId);
      }
    }
  }

  async acceptTermsAndConditions(): Promise<void> {
    const termsCheckbox = this.page.locator(this.selectors.form.termsCheckbox).first();
    if (await termsCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await termsCheckbox.check();
    }
  }

  async selectAlumniDiscount(): Promise<void> {
    const alumniCheckbox = this.page.locator(this.selectors.form.alumniCheckbox).first();
    if (await alumniCheckbox.isVisible({ timeout: 2000 }).catch(() => false)) {
      await alumniCheckbox.check();
    }
  }

  async submitRegistrationForm(): Promise<void> {
    await this.page.locator(this.selectors.form.submitButton).first().click();
    await this.page.waitForLoadState('networkidle');
  }

  // Order summary
  async getSubtotal(): Promise<string | null> {
    const summary = this.page.locator(this.selectors.orderSummary.container).first();
    const subtotal = summary.locator(this.selectors.orderSummary.subtotal).first();
    if (await subtotal.isVisible({ timeout: 2000 }).catch(() => false)) {
      return await subtotal.textContent();
    }
    return null;
  }

  async getVAT(): Promise<string | null> {
    const summary = this.page.locator(this.selectors.orderSummary.container).first();
    const vat = summary.locator(this.selectors.orderSummary.vat).first();
    if (await vat.isVisible({ timeout: 2000 }).catch(() => false)) {
      return await vat.textContent();
    }
    return null;
  }

  async getTotal(): Promise<string | null> {
    const summary = this.page.locator(this.selectors.orderSummary.container).first();
    const total = summary.locator(this.selectors.orderSummary.total).first();
    if (await total.isVisible({ timeout: 2000 }).catch(() => false)) {
      return await total.textContent();
    }
    return null;
  }

  // Validation
  async getEmailValidationError(): Promise<string | null> {
    return await this.getValidationError('email');
  }

  async getFirstNameValidationError(): Promise<string | null> {
    return await this.getValidationError('firstName');
  }
}

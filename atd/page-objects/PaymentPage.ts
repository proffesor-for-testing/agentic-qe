import { Page, Locator } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * PaymentPage - Page Object for payment method selection and processing
 */
export class PaymentPage extends BasePage {
  // Payment methods
  readonly PAYMENT_METHODS = {
    CREDIT_CARD: 'credit-card',
    INVOICE: 'invoice',
  } as const;

  // Selectors
  private readonly selectors = {
    paymentMethods: {
      creditCard: 'input[value*="stripe"], input[value*="credit"], label:has-text("Credit Card")',
      invoice: 'input[value*="invoice"], input[value*="bank"], label:has-text("Invoice")',
    },
    stripeForm: {
      container: 'form[action*="stripe"], .stripe-form, [class*="payment-form"]',
      cardNumber: 'input[name*="card"], input[placeholder*="card number" i], #card-number',
      cardNumberIframe: 'iframe[title*="card number" i]',
      expiry: 'input[name*="expiry"], input[placeholder*="expiry" i], #card-expiry',
      expiryIframe: 'iframe[title*="expiry" i]',
      cvc: 'input[name*="cvc"], input[placeholder*="cvc" i], #card-cvc',
      cvcIframe: 'iframe[title*="cvc" i]',
      cardholder: 'input[name*="name"], input[name*="cardholder"]',
      submitButton: 'button[type="submit"], button:has-text("Pay"), button:has-text("Complete")',
    },
    invoiceDetails: {
      container: '.invoice-details, [class*="invoice"]',
      iban: 'text=/IBAN/i',
      reference: 'text=/reference|payment reference/i',
      deadline: 'text=/deadline|due date/i',
      downloadButton: 'button:has-text("Download"), a:has-text("Download Invoice")',
    },
    messages: {
      success: '.success, [class*="success"], text=/payment successful|thank you|confirmed/i',
      error: '.error, [class*="error"], [role="alert"]',
      declined: 'text=/declined|card.*declined/i',
      insufficientFunds: 'text=/insufficient.*funds/i',
      expired: 'text=/expired|card.*expired/i',
    },
    summary: {
      container: '.payment-summary, .order-summary, [class*="summary"]',
      subtotal: 'text=/subtotal/i',
      vat: 'text=/VAT.*19%|19%.*VAT/i',
      total: 'text=/total/i',
    },
  };

  constructor(page: Page) {
    super(page);
  }

  // Payment method selection
  async selectCreditCardPayment(): Promise<void> {
    const creditCardOption = this.page.locator(this.selectors.paymentMethods.creditCard).first();
    await creditCardOption.click();
    await this.page.waitForTimeout(1000); // Wait for payment form to appear
  }

  async selectInvoicePayment(): Promise<void> {
    const invoiceOption = this.page.locator(this.selectors.paymentMethods.invoice).first();
    await invoiceOption.click();
    await this.page.waitForTimeout(1000);
  }

  // Stripe credit card payment
  async fillCreditCardDetails(cardData: {
    cardNumber: string;
    expiry: string;
    cvc: string;
    cardholder?: string;
  }): Promise<void> {
    // Check if Stripe uses iframes (common pattern)
    const cardNumberIframe = this.page.frameLocator(this.selectors.stripeForm.cardNumberIframe);
    const cardNumberInIframe = await this.page.locator(this.selectors.stripeForm.cardNumberIframe).count();

    if (cardNumberInIframe > 0) {
      // Stripe iframes
      await cardNumberIframe.locator('input').first().fill(cardData.cardNumber);

      const expiryIframe = this.page.frameLocator(this.selectors.stripeForm.expiryIframe);
      await expiryIframe.locator('input').first().fill(cardData.expiry);

      const cvcIframe = this.page.frameLocator(this.selectors.stripeForm.cvcIframe);
      await cvcIframe.locator('input').first().fill(cardData.cvc);
    } else {
      // Direct form fields
      await this.page.locator(this.selectors.stripeForm.cardNumber).fill(cardData.cardNumber);
      await this.page.locator(this.selectors.stripeForm.expiry).fill(cardData.expiry);
      await this.page.locator(this.selectors.stripeForm.cvc).fill(cardData.cvc);
    }

    // Cardholder name (if present)
    if (cardData.cardholder) {
      const cardholderField = this.page.locator(this.selectors.stripeForm.cardholder).first();
      if (await cardholderField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await cardholderField.fill(cardData.cardholder);
      }
    }
  }

  async submitPayment(): Promise<void> {
    await this.page.locator(this.selectors.stripeForm.submitButton).first().click();
    // Wait for payment processing
    await this.page.waitForLoadState('networkidle', { timeout: 30000 });
  }

  // Payment result verification
  async isPaymentSuccessful(): Promise<boolean> {
    return await this.page.locator(this.selectors.messages.success).first().isVisible({ timeout: 10000 });
  }

  async getSuccessMessage(): Promise<string | null> {
    const successMsg = this.page.locator(this.selectors.messages.success).first();
    if (await successMsg.isVisible({ timeout: 5000 }).catch(() => false)) {
      return await successMsg.textContent();
    }
    return null;
  }

  async hasPaymentError(): Promise<boolean> {
    return await this.page.locator(this.selectors.messages.error).first().isVisible({ timeout: 5000 });
  }

  async getPaymentErrorMessage(): Promise<string | null> {
    const errorMsg = this.page.locator(this.selectors.messages.error).first();
    if (await errorMsg.isVisible({ timeout: 5000 }).catch(() => false)) {
      return await errorMsg.textContent();
    }
    return null;
  }

  async isCardDeclinedErrorVisible(): Promise<boolean> {
    return await this.page.locator(this.selectors.messages.declined).first().isVisible({ timeout: 5000 });
  }

  async isInsufficientFundsErrorVisible(): Promise<boolean> {
    return await this.page.locator(this.selectors.messages.insufficientFunds).first().isVisible({ timeout: 5000 });
  }

  async isCardExpiredErrorVisible(): Promise<boolean> {
    return await this.page.locator(this.selectors.messages.expired).first().isVisible({ timeout: 5000 });
  }

  // Invoice payment
  async isInvoiceDetailsVisible(): Promise<boolean> {
    return await this.page.locator(this.selectors.invoiceDetails.container).first().isVisible({ timeout: 5000 });
  }

  async hasIBANInfo(): Promise<boolean> {
    return await this.page.locator(this.selectors.invoiceDetails.iban).first().isVisible();
  }

  async hasPaymentReference(): Promise<boolean> {
    return await this.page.locator(this.selectors.invoiceDetails.reference).first().isVisible();
  }

  async hasPaymentDeadline(): Promise<boolean> {
    return await this.page.locator(this.selectors.invoiceDetails.deadline).first().isVisible();
  }

  async downloadInvoice(): Promise<void> {
    const downloadButton = this.page.locator(this.selectors.invoiceDetails.downloadButton).first();
    if (await downloadButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      const [download] = await Promise.all([
        this.page.waitForEvent('download'),
        downloadButton.click(),
      ]);
      await download.path(); // Wait for download to complete
    }
  }

  // Payment summary verification
  async getPaymentSummary(): Promise<{
    subtotal: string | null;
    vat: string | null;
    total: string | null;
  }> {
    const summary = this.page.locator(this.selectors.summary.container).first();

    const getTextContent = async (locator: Locator): Promise<string | null> => {
      if (await locator.isVisible({ timeout: 2000 }).catch(() => false)) {
        return await locator.textContent();
      }
      return null;
    };

    return {
      subtotal: await getTextContent(summary.locator(this.selectors.summary.subtotal).first()),
      vat: await getTextContent(summary.locator(this.selectors.summary.vat).first()),
      total: await getTextContent(summary.locator(this.selectors.summary.total).first()),
    };
  }

  // Helper method to verify VAT calculation
  async verifyVATCalculation(basePrice: number): Promise<boolean> {
    const summary = await this.getPaymentSummary();

    if (!summary.vat || !summary.total) {
      return false;
    }

    // Extract numeric values from strings
    const vatMatch = summary.vat.match(/[\d.,]+/);
    const totalMatch = summary.total.match(/[\d.,]+/);

    if (!vatMatch || !totalMatch) {
      return false;
    }

    const vatAmount = parseFloat(vatMatch[0].replace(',', ''));
    const totalAmount = parseFloat(totalMatch[0].replace(',', ''));

    // VAT should be 19% of base price
    const expectedVAT = basePrice * 0.19;
    const expectedTotal = basePrice + expectedVAT;

    // Allow 1 euro tolerance for rounding
    return Math.abs(vatAmount - expectedVAT) < 1 && Math.abs(totalAmount - expectedTotal) < 1;
  }
}

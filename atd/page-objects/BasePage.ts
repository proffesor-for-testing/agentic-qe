import { Page, Locator } from '@playwright/test';

/**
 * BasePage - Base class for all Page Objects
 * Provides common functionality used across all pages
 */
export class BasePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // Navigation
  async goto(path: string = '/'): Promise<void> {
    await this.page.goto(path);
  }

  async clickLogo(): Promise<void> {
    await this.page.click('a[href="/"] img, .logo, header img');
  }

  // Common elements
  getNavigationMenu(): Locator {
    return this.page.locator('nav, .navigation, .main-menu, header ul');
  }

  async clickNavigationItem(itemText: string): Promise<void> {
    const nav = this.getNavigationMenu();
    await nav.locator(`text="${itemText}"`).first().click();
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  // Form helpers
  async fillInput(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value);
  }

  async selectDropdown(selector: string, value: string): Promise<void> {
    await this.page.selectOption(selector, value);
  }

  async clickButton(text: string): Promise<void> {
    await this.page.click(`button:has-text("${text}"), input[type="submit"][value*="${text}"]`);
  }

  async checkCheckbox(selector: string): Promise<void> {
    await this.page.check(selector);
  }

  async uncheckCheckbox(selector: string): Promise<void> {
    await this.page.uncheck(selector);
  }

  // Validation helpers
  async getValidationError(fieldName: string): Promise<string | null> {
    const errorSelectors = [
      `[name="${fieldName}"] ~ .error, [name="${fieldName}"] ~ .error-message`,
      `[name="${fieldName}"] + .error, [name="${fieldName}"] + .error-message`,
      `.field-${fieldName} .error, .field-${fieldName} .error-message`,
      `#${fieldName}-error, [data-error-for="${fieldName}"]`,
    ];

    for (const selector of errorSelectors) {
      const errorElement = this.page.locator(selector).first();
      if (await errorElement.isVisible({ timeout: 2000 }).catch(() => false)) {
        return await errorElement.textContent();
      }
    }
    return null;
  }

  async hasValidationError(): Promise<boolean> {
    const errorElements = this.page.locator('.error, .error-message, [class*="error"]');
    return await errorElements.count() > 0;
  }

  // URL helpers
  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  async waitForUrl(pattern: string | RegExp): Promise<void> {
    await this.page.waitForURL(pattern);
  }

  // Content helpers
  async getPageTitle(): Promise<string> {
    return await this.page.title();
  }

  async hasText(text: string): Promise<boolean> {
    return await this.page.locator(`text=${text}`).isVisible();
  }

  // External links
  async clickExternalLink(linkText: string): Promise<Page> {
    const [newPage] = await Promise.all([
      this.page.context().waitForEvent('page'),
      this.page.click(`a:has-text("${linkText}")`),
    ]);
    await newPage.waitForLoadState();
    return newPage;
  }

  // Screenshot helper
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png`, fullPage: true });
  }
}

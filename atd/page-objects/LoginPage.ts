import { Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * LoginPage - Page Object for user authentication
 */
export class LoginPage extends BasePage {
  // Selectors
  private readonly selectors = {
    form: {
      email: 'input[type="email"], input[name="email"], input[name="username"]',
      password: 'input[type="password"], input[name="password"]',
      loginButton: 'button[type="submit"], button:has-text("Login"), button:has-text("Sign In")',
      forgotPasswordLink: 'a:has-text("Forgot"), a:has-text("Reset")',
    },
    messages: {
      error: '.error, [class*="error"], [role="alert"]',
      success: '.success, [class*="success"]',
    },
    passwordReset: {
      form: 'form[class*="reset"], form[class*="forgot"]',
      emailInput: 'input[type="email"], input[name="email"]',
      submitButton: 'button[type="submit"], button:has-text("Send"), button:has-text("Reset")',
      successMessage: 'text=/email sent|check your email|reset link/i',
    },
    userAccount: {
      dashboard: '.dashboard, [class*="dashboard"]',
      userInfo: '.user-info, [class*="user"], .account',
      logoutButton: 'button:has-text("Logout"), button:has-text("Sign Out"), a:has-text("Logout")',
    },
  };

  constructor(page: Page) {
    super(page);
  }

  // Navigation
  async navigateToLogin(): Promise<void> {
    await this.goto('/login');
    await this.waitForPageLoad();
  }

  // Login
  async login(email: string, password: string): Promise<void> {
    await this.page.locator(this.selectors.form.email).fill(email);
    await this.page.locator(this.selectors.form.password).fill(password);
    await this.page.locator(this.selectors.form.loginButton).click();
    await this.page.waitForLoadState('networkidle');
  }

  async fillEmail(email: string): Promise<void> {
    await this.page.locator(this.selectors.form.email).fill(email);
  }

  async fillPassword(password: string): Promise<void> {
    await this.page.locator(this.selectors.form.password).fill(password);
  }

  async clickLoginButton(): Promise<void> {
    await this.page.locator(this.selectors.form.loginButton).click();
    await this.page.waitForLoadState('networkidle');
  }

  // Validation
  async hasLoginError(): Promise<boolean> {
    return await this.page.locator(this.selectors.messages.error).first().isVisible({ timeout: 5000 });
  }

  async getLoginErrorMessage(): Promise<string | null> {
    const errorMsg = this.page.locator(this.selectors.messages.error).first();
    if (await errorMsg.isVisible({ timeout: 5000 }).catch(() => false)) {
      return await errorMsg.textContent();
    }
    return null;
  }

  async isLoginSuccessful(): Promise<boolean> {
    // Check if redirected to dashboard or user info is visible
    const isDashboardVisible = await this.page
      .locator(this.selectors.userAccount.dashboard)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    const isUserInfoVisible = await this.page
      .locator(this.selectors.userAccount.userInfo)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    return isDashboardVisible || isUserInfoVisible;
  }

  // Password reset
  async clickForgotPassword(): Promise<void> {
    await this.page.locator(this.selectors.form.forgotPasswordLink).first().click();
    await this.waitForPageLoad();
  }

  async requestPasswordReset(email: string): Promise<void> {
    await this.page.locator(this.selectors.passwordReset.emailInput).fill(email);
    await this.page.locator(this.selectors.passwordReset.submitButton).click();
    await this.page.waitForLoadState('networkidle');
  }

  async isPasswordResetEmailSent(): Promise<boolean> {
    return await this.page.locator(this.selectors.passwordReset.successMessage).first().isVisible({ timeout: 5000 });
  }

  // Logout
  async logout(): Promise<void> {
    const logoutButton = this.page.locator(this.selectors.userAccount.logoutButton).first();
    if (await logoutButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await logoutButton.click();
      await this.waitForPageLoad();
    }
  }

  async isLoggedOut(): Promise<boolean> {
    // Check if login form is visible again
    return await this.page.locator(this.selectors.form.email).isVisible({ timeout: 5000 });
  }

  // User info
  async getUserInfo(): Promise<string | null> {
    const userInfo = this.page.locator(this.selectors.userAccount.userInfo).first();
    if (await userInfo.isVisible({ timeout: 2000 }).catch(() => false)) {
      return await userInfo.textContent();
    }
    return null;
  }
}

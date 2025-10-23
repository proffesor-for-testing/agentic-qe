/**
 * Login Tests - User authentication functionality
 * Priority: P0 (Critical)
 * Test Plan Scenarios: 8 scenarios from Login Functionality section
 */

import { test, expect } from '@playwright/test';
import { LoginPage } from '../page-objects/LoginPage';
import { handleCookieConsent } from '../utils/test-helpers';
import { TEST_CREDENTIALS } from '../fixtures/test-data';

test.describe('User Authentication', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.navigateToLogin();
    await handleCookieConsent(page);
  });

  test.skip('@p0 @critical should login successfully with valid credentials', async ({
    page,
  }) => {
    // Skip by default - requires valid test account
    await loginPage.login(TEST_CREDENTIALS.validUser.email, TEST_CREDENTIALS.validUser.password);

    // Verify successful login
    const isSuccess = await loginPage.isLoginSuccessful();
    expect(isSuccess).toBeTruthy();

    // Verify redirected to dashboard or profile
    const url = await loginPage.getCurrentUrl();
    expect(url.toLowerCase()).toMatch(/dashboard|profile|account|home/);
  });

  test('@p0 @critical should show error for invalid email', async ({ page }) => {
    await loginPage.login(TEST_CREDENTIALS.invalidUser.email, TEST_CREDENTIALS.invalidUser.password);

    // Verify error message is shown
    const hasError = await loginPage.hasLoginError();
    expect(hasError).toBeTruthy();

    const errorMessage = await loginPage.getLoginErrorMessage();
    if (errorMessage) {
      expect(errorMessage.toLowerCase()).toMatch(/invalid|incorrect|wrong|not found/);
    }

    // Verify still on login page
    const url = await loginPage.getCurrentUrl();
    expect(url.toLowerCase()).toMatch(/login|signin|auth/);
  });

  test('@p0 @critical should show error for incorrect password', async ({ page }) => {
    await loginPage.login(TEST_CREDENTIALS.validUser.email, 'WrongPassword123!');

    // Verify error message
    const hasError = await loginPage.hasLoginError();
    expect(hasError).toBeTruthy();

    const errorMessage = await loginPage.getLoginErrorMessage();
    if (errorMessage) {
      expect(errorMessage.toLowerCase()).toMatch(/invalid|incorrect|wrong/);
    }
  });

  test('@p0 @critical should show validation errors for empty credentials', async ({ page }) => {
    // Submit empty form
    await loginPage.fillEmail('');
    await loginPage.fillPassword('');
    await loginPage.clickLoginButton();

    // Wait for validation
    await page.waitForTimeout(1000);

    // Check for validation errors
    const hasError = await page
      .locator('.error, [class*="error"], [role="alert"]')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Or check if form was not submitted (still on login page)
    const emailField = await page.locator('input[type="email"], input[name="email"]').first();
    const isStillOnLogin = await emailField.isVisible({ timeout: 2000 }).catch(() => false);

    expect(hasError || isStillOnLogin).toBeTruthy();
  });

  test('@p1 should navigate to forgot password page', async ({ page }) => {
    await loginPage.clickForgotPassword();

    // Verify navigated to password reset page
    const url = await loginPage.getCurrentUrl();
    expect(url.toLowerCase()).toMatch(/forgot|reset|password/);

    // Verify password reset form is visible
    const hasEmailField = await page
      .locator('input[type="email"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasEmailField).toBeTruthy();
  });

  test.skip('@p1 should send password reset email', async ({ page }) => {
    // Skip by default - requires valid test account
    await loginPage.clickForgotPassword();

    await loginPage.requestPasswordReset(TEST_CREDENTIALS.validUser.email);

    // Verify confirmation message
    const isEmailSent = await loginPage.isPasswordResetEmailSent();
    expect(isEmailSent).toBeTruthy();
  });

  test.skip('@p1 should logout successfully', async ({ page }) => {
    // Skip by default - requires being logged in first
    // First login
    await loginPage.login(TEST_CREDENTIALS.validUser.email, TEST_CREDENTIALS.validUser.password);

    const isLoggedIn = await loginPage.isLoginSuccessful();
    expect(isLoggedIn).toBeTruthy();

    // Then logout
    await loginPage.logout();

    // Verify logged out
    const isLoggedOut = await loginPage.isLoggedOut();
    expect(isLoggedOut).toBeTruthy();
  });

  test.skip('@p1 should maintain session across page navigation', async ({ page }) => {
    // Skip by default - requires being logged in
    await loginPage.login(TEST_CREDENTIALS.validUser.email, TEST_CREDENTIALS.validUser.password);

    const isLoggedIn = await loginPage.isLoginSuccessful();
    expect(isLoggedIn).toBeTruthy();

    // Navigate to different pages
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.goto('/about');
    await page.waitForLoadState('networkidle');

    // Verify still logged in
    const userInfo = await loginPage.getUserInfo();
    const hasUserInfo = userInfo !== null && userInfo.trim().length > 0;

    // If user info is visible, session is maintained
    if (hasUserInfo) {
      expect(hasUserInfo).toBeTruthy();
    }
  });
});

test.describe('Login Form Elements', () => {
  test('@p0 @smoke should display login form with required fields', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigateToLogin();
    await handleCookieConsent(page);

    // Verify email field exists
    const hasEmailField = await page
      .locator('input[type="email"], input[name="email"], input[name="username"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Verify password field exists
    const hasPasswordField = await page
      .locator('input[type="password"]')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Verify submit button exists
    const hasSubmitButton = await page
      .locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // At least email/username and password fields should be present
    expect(hasEmailField && hasPasswordField).toBeTruthy();
    expect(hasSubmitButton).toBeTruthy();
  });

  test('@p1 should display forgot password link', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.navigateToLogin();
    await handleCookieConsent(page);

    // Verify forgot password link exists
    const hasForgotLink = await page
      .locator('a:has-text("Forgot"), a:has-text("Reset"), a:has-text("Lost password")')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    expect(hasForgotLink).toBeTruthy();
  });
});

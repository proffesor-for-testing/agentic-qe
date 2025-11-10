---
name: compatibility-testing
description: Cross-browser, cross-platform, and cross-device compatibility testing ensuring consistent experience across environments. Use when validating browser support, testing responsive design, or ensuring platform compatibility.
---

# Compatibility Testing

## Core Principle

**Users access your app from 100+ browser/device combinations.**

Compatibility testing ensures consistent functionality and UX across browsers, operating systems, devices, and screen sizes.

## Browser Matrix

**Test on:**
- Chrome (latest, N-1)
- Firefox (latest, N-1)
- Safari (latest, N-1)
- Edge (latest)
- Mobile Safari (iOS)
- Mobile Chrome (Android)

**Market share guidance:** Test browsers representing 95%+ of user base.

## Responsive Design Testing

**Screen sizes:**
```
Mobile: 320px - 480px
Tablet: 481px - 768px
Desktop: 769px - 1920px+
```

**Test with Playwright:**
```javascript
const devices = [
  { name: 'iPhone 12', width: 390, height: 844 },
  { name: 'iPad', width: 768, height: 1024 },
  { name: 'Desktop', width: 1920, height: 1080 }
];

for (const device of devices) {
  test(`layout on ${device.name}`, async ({ page }) => {
    await page.setViewportSize({
      width: device.width,
      height: device.height
    });

    await page.goto('https://example.com');

    // Verify responsive layout
    const nav = await page.locator('nav');
    if (device.width < 768) {
      // Mobile: hamburger menu
      expect(await nav.locator('.hamburger')).toBeVisible();
    } else {
      // Desktop: full menu
      expect(await nav.locator('.menu-items')).toBeVisible();
    }
  });
}
```

## Cloud Testing Services

**BrowserStack:**
```javascript
const capabilities = {
  'browserName': 'Chrome',
  'browser_version': '118.0',
  'os': 'Windows',
  'os_version': '11',
  'browserstack.user': process.env.BROWSERSTACK_USER,
  'browserstack.key': process.env.BROWSERSTACK_KEY
};
```

## Related Skills

- [mobile-testing](../mobile-testing/)
- [accessibility-testing](../accessibility-testing/)
- [visual-testing-advanced](../visual-testing-advanced/)

## Remember

**Test where users are, not where you develop.**

Developers use latest browsers, users don't. Test on:
- Older browsers (N-1, N-2)
- Low-end devices
- Slow networks
- Different screen sizes

**With Agents:** Agents orchestrate parallel cross-browser testing across cloud platforms, reducing 10 hours of testing to 15 minutes.

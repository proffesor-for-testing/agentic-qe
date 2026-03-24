---
name: localization-testing
description: "Validate translation coverage, test locale-specific date/time/currency formats, verify RTL layout for Arabic and Hebrew, check Unicode character encoding, and detect hardcoded strings. Use when launching in new markets, adding language support, or building multi-language products."
---

# Localization & Internationalization Testing

<default_to_action>
When testing multi-language/region support:
1. VERIFY translation coverage (all strings translated)
2. TEST locale-specific formats (date, time, currency, numbers)
3. VALIDATE RTL layout (Arabic, Hebrew)
4. CHECK character encoding (UTF-8, unicode)
5. CONFIRM cultural appropriateness (icons, colors, content)

**Quick i18n Checklist:**
- All user-facing strings externalized
- No hardcoded text in code
- Date/time/currency formatted per locale
- RTL languages flip layout correctly
- Unicode characters display properly

**Critical Success Factors:**
- Don't hardcode strings - externalize everything
- Test with real speakers, not just translation files
- RTL requires mirrored UI layout
</default_to_action>

## Quick Reference Card

### When to Use
- Launching in new markets
- Adding language support
- Before international releases
- After UI changes

---

## Translation Coverage Testing

```javascript
test('all strings are translated', () => {
  const enKeys = Object.keys(translations.en);
  const frKeys = Object.keys(translations.fr);
  const esKeys = Object.keys(translations.es);

  // All locales have same keys
  expect(frKeys).toEqual(enKeys);
  expect(esKeys).toEqual(enKeys);
});

test('no missing translation placeholders', async ({ page }) => {
  await page.goto('/?lang=fr');
  const text = await page.textContent('body');

  // Should not see placeholder keys
  expect(text).not.toContain('translation.missing');
  expect(text).not.toMatch(/\{\{.*\}\}/); // {{key}} format
});
```

---

## Date/Time/Currency Formats

```javascript
test('date formats by locale', () => {
  const date = new Date('2025-10-24');

  expect(formatDate(date, 'en-US')).toBe('10/24/2025');
  expect(formatDate(date, 'en-GB')).toBe('24/10/2025');
  expect(formatDate(date, 'ja-JP')).toBe('2025/10/24');
});

test('currency formats by locale', () => {
  const amount = 1234.56;

  expect(formatCurrency(amount, 'en-US', 'USD')).toBe('$1,234.56');
  expect(formatCurrency(amount, 'de-DE', 'EUR')).toBe('1.234,56 €');
  expect(formatCurrency(amount, 'ja-JP', 'JPY')).toBe('¥1,235');
});
```

---

## RTL (Right-to-Left) Testing

```javascript
test('layout flips for RTL languages', async ({ page }) => {
  await page.goto('/?lang=ar'); // Arabic

  const dir = await page.locator('html').getAttribute('dir');
  expect(dir).toBe('rtl');

  // Navigation should be on right
  const nav = await page.locator('nav');
  const styles = await nav.evaluate(el =>
    window.getComputedStyle(el)
  );
  expect(styles.direction).toBe('rtl');
});

test('icons/images appropriate for RTL', async ({ page }) => {
  await page.goto('/?lang=he'); // Hebrew

  // Back arrow should point right in RTL
  const backIcon = await page.locator('.back-icon');
  expect(await backIcon.getAttribute('class')).toContain('rtl-flipped');
});
```

---

## Unicode Character Support

```javascript
test('supports unicode characters', async ({ page }) => {
  // Japanese
  await page.fill('#name', '山田太郎');
  await page.click('#submit');

  const saved = await db.users.findOne({ /* ... */ });
  expect(saved.name).toBe('山田太郎');

  // Arabic
  await page.fill('#name', 'محمد');
  // Emoji
  await page.fill('#bio', '👋🌍');

  expect(saved.bio).toBe('👋🌍');
});
```

---

## Agent-Driven Localization Testing

```typescript
// Comprehensive localization validation
await Task("Localization Testing", {
  url: 'https://example.com',
  locales: ['en-US', 'fr-FR', 'de-DE', 'ja-JP', 'ar-SA'],
  checks: ['translations', 'formats', 'rtl', 'unicode'],
  detectHardcodedStrings: true
}, "qe-test-generator");

// Returns:
// {
//   locales: 5,
//   missingTranslations: 3,
//   formatIssues: 1,
//   rtlIssues: 0,
//   hardcodedStrings: ['button.submit', 'header.title']
// }
```

---

## Agent Coordination Hints

### Memory Namespace
```
aqe/localization-testing/
├── translations/*       - Translation coverage
├── formats/*            - Locale-specific formats
├── rtl-validation/*     - RTL layout checks
└── unicode/*            - Character encoding tests
```

### Fleet Coordination
```typescript
const l10nFleet = await FleetManager.coordinate({
  strategy: 'localization-testing',
  agents: [
    'qe-test-generator',   // Generate l10n tests
    'qe-test-executor',    // Execute across locales
    'qe-visual-tester'     // RTL visual validation
  ],
  topology: 'parallel'
});
```

---

## Related Skills
- [accessibility-testing](../accessibility-testing/) - Language accessibility
- [compatibility-testing](../compatibility-testing/) - Cross-platform i18n
- [visual-testing-advanced](../visual-testing-advanced/) - RTL visual regression

---

## Remember

**With Agents:** Agents validate translation coverage, detect hardcoded strings, test locale-specific formatting, and verify RTL layouts automatically across all supported languages.

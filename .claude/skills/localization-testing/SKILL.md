---
name: localization-testing
description: Internationalization (i18n) and localization (l10n) testing for global products including translations, locale formats, RTL languages, and cultural appropriateness. Use when launching in new markets or building multi-language products.
version: 1.0.0
category: specialized-testing
tags: [i18n, l10n, localization, internationalization, translations, rtl, locale]
difficulty: intermediate
estimated_time: 60 minutes
author: agentic-qe
---

# Localization & Internationalization Testing

## Core Principle

**Global products must work globally.**

i18n testing ensures software supports multiple languages, regions, and cultures without code changes.

## i18n vs l10n

**Internationalization (i18n):** Building software to support localization
**Localization (l10n):** Adapting software for specific locale

## Testing Translation Coverage

```javascript
test('all strings are translated', () => {
  const enKeys = Object.keys(translations.en);
  const frKeys = Object.keys(translations.fr);
  const esKeys = Object.keys(translations.es);

  // All locales have same keys
  expect(frKeys).toEqual(enKeys);
  expect(esKeys).toEqual(enKeys);
});

test('no missing translation placeholders', () => {
  const text = await page.locator('button').textContent();

  // Should not see placeholder keys
  expect(text).not.toContain('translation.missing');
  expect(text).not.toMatch(/\{\{.*\}\}/); // {{key}} format
});
```

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

  expect(formatCurrency(amount, 'USD')).toBe('$1,234.56');
  expect(formatCurrency(amount, 'EUR')).toBe('€1.234,56');
  expect(formatCurrency(amount, 'JPY')).toBe('¥1,235'); // No decimals
});
```

## RTL (Right-to-Left) Testing

```javascript
test('layout flips for RTL languages', async () => {
  await page.goto('/?lang=ar'); // Arabic

  const dir = await page.locator('html').getAttribute('dir');
  expect(dir).toBe('rtl');

  // Navigation should be on right
  const nav = await page.locator('nav');
  const styles = await nav.evaluate((el) => 
    window.getComputedStyle(el)
  );
  expect(styles.direction).toBe('rtl');
});
```

## Character Encoding

```javascript
test('supports unicode characters', async () => {
  // Japanese
  await page.fill('#name', '山田太郎');

  // Arabic
  await page.fill('#name', 'محمد');

  // Emoji
  await page.fill('#name', '👋🌍');

  // Verify saved correctly
  const saved = await db.users.findOne({ id: userId });
  expect(saved.name).toBe('👋🌍');
});
```

## Remember

**Don't hardcode. Externalize all user-facing strings.**

Test:
- Translation completeness
- Locale-specific formats (date, time, currency)
- RTL layout (Arabic, Hebrew)
- Character encoding (UTF-8)
- Cultural appropriateness

**With Agents:** Agents validate translation coverage, detect hardcoded strings, and test locale-specific formatting automatically across all supported languages.

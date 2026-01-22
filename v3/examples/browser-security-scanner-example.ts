/**
 * BrowserSecurityScanner Example
 * Demonstrates security scanning integration with visual testing
 */

import {
  createBrowserSecurityScanner,
  type SecurityScanResult,
  type PIIScanResult,
  type PhishingResult,
} from '../src/domains/visual-accessibility/services/index.js';

/**
 * Example 1: Basic URL Validation
 */
async function example1_urlValidation() {
  console.log('\n=== Example 1: URL Validation ===\n');

  const scanner = createBrowserSecurityScanner();
  await scanner.initialize();

  const urls = [
    'https://example.com',
    'http://localhost:8080/admin',
    'http://192.168.1.1/config',
    'https://user:pass@example.com',
  ];

  for (const url of urls) {
    const result = await scanner.validateUrl(url);

    if (result.success) {
      console.log(`URL: ${url}`);
      console.log(`  Safe: ${result.value.safe}`);
      console.log(`  Score: ${result.value.score}`);
      console.log(`  Threats: ${result.value.threats.join(', ') || 'None'}`);
      console.log();
    }
  }
}

/**
 * Example 2: Phishing Detection
 */
async function example2_phishingDetection() {
  console.log('\n=== Example 2: Phishing Detection ===\n');

  const scanner = createBrowserSecurityScanner();
  await scanner.initialize();

  const suspiciousUrls = [
    'http://paypal-secure.tk/login',
    'https://amazon-refund.ml/claim',
    'http://123.45.67.89/microsoft-login',
    'https://www.legitimate-site.com',
  ];

  for (const url of suspiciousUrls) {
    const result = await scanner.detectPhishing(url);

    if (result.success) {
      console.log(`URL: ${url}`);
      console.log(`  Is Phishing: ${result.value.isPhishing ? '⚠️  YES' : '✅ NO'}`);
      console.log(`  Confidence: ${(result.value.confidence * 100).toFixed(1)}%`);
      console.log(`  Indicators: ${result.value.indicators.join(', ') || 'None'}`);
      console.log();
    }
  }
}

/**
 * Example 3: PII Scanning in Content
 */
async function example3_piiScanning() {
  console.log('\n=== Example 3: PII Scanning ===\n');

  const scanner = createBrowserSecurityScanner();
  await scanner.initialize();

  const testContent = [
    'This is clean content with no PII.',
    'Contact us at support@example.com for help.',
    'My SSN is 123-45-6789 and my phone is (555) 123-4567.',
    'Credit card: 4532-1234-5678-9010',
  ];

  for (const content of testContent) {
    const result = await scanner.scanForPII(content);

    if (result.success) {
      console.log(`Content: "${content}"`);
      console.log(`  Has PII: ${result.value.hasPII ? '⚠️  YES' : '✅ NO'}`);
      console.log(`  Types: ${result.value.detectedTypes.join(', ') || 'None'}`);

      if (result.value.locations.length > 0) {
        console.log('  Locations:');
        for (const loc of result.value.locations) {
          console.log(`    - ${loc.type}: position ${loc.start}-${loc.end}`);
        }
      }
      console.log();
    }
  }
}

/**
 * Example 4: Pre-Test Security Check
 */
async function example4_preTestSecurityCheck() {
  console.log('\n=== Example 4: Pre-Test Security Check ===\n');

  const scanner = createBrowserSecurityScanner();
  await scanner.initialize();

  async function secureVisualTest(url: string): Promise<boolean> {
    console.log(`Testing URL: ${url}`);

    // Step 1: Validate URL
    const validation = await scanner.validateUrl(url);
    if (!validation.success) {
      const error = validation as { success: false; error: Error };
      console.error('  ❌ Validation failed:', error.error.message);
      return false;
    }

    if (!validation.value.safe) {
      console.error('  ❌ URL is unsafe:', validation.value.threats.join(', '));
      return false;
    }

    // Step 2: Check for phishing
    const phishing = await scanner.detectPhishing(url);
    if (phishing.success && phishing.value.isPhishing) {
      console.warn(
        `  ⚠️  Potential phishing (confidence: ${(phishing.value.confidence * 100).toFixed(1)}%)`
      );
      console.warn(`  Indicators: ${phishing.value.indicators.join(', ')}`);
      return false;
    }

    console.log('  ✅ URL passed security checks');
    return true;
  }

  const testUrls = [
    'https://example.com',
    'http://localhost:8080',
    'http://paypal-login.tk',
  ];

  for (const url of testUrls) {
    await secureVisualTest(url);
    console.log();
  }
}

/**
 * Example 5: Batch URL Scanning
 */
async function example5_batchScanning() {
  console.log('\n=== Example 5: Batch URL Scanning ===\n');

  const scanner = createBrowserSecurityScanner();
  await scanner.initialize();

  const urls = [
    'https://example.com',
    'http://test.local',
    'https://secure-bank.tk',
    'http://192.168.1.1',
  ];

  console.log(`Scanning ${urls.length} URLs...\n`);

  const results = await Promise.all(
    urls.map(async (url) => {
      const [validation, phishing] = await Promise.all([
        scanner.validateUrl(url),
        scanner.detectPhishing(url),
      ]);

      return { url, validation, phishing };
    })
  );

  // Summary
  const safeUrls = results.filter((r) => r.validation.success && r.validation.value.safe);
  const unsafeUrls = results.filter((r) => !r.validation.success || !r.validation.value.safe);
  const phishingUrls = results.filter(
    (r) => r.phishing.success && r.phishing.value.isPhishing
  );

  console.log('Summary:');
  console.log(`  ✅ Safe URLs: ${safeUrls.length}`);
  console.log(`  ❌ Unsafe URLs: ${unsafeUrls.length}`);
  console.log(`  ⚠️  Potential Phishing: ${phishingUrls.length}`);
  console.log();

  console.log('Detailed Results:');
  for (const { url, validation, phishing } of results) {
    const safe = validation.success && validation.value.safe;
    const isPhishing = phishing.success && phishing.value.isPhishing;

    const icon = safe ? (isPhishing ? '⚠️ ' : '✅') : '❌';
    console.log(`  ${icon} ${url}`);

    if (!safe && validation.success) {
      console.log(`     Threats: ${validation.value.threats.join(', ')}`);
    }
    if (isPhishing) {
      console.log(`     Phishing confidence: ${(phishing.value.confidence * 100).toFixed(1)}%`);
    }
  }
}

/**
 * Example 6: Content Redaction
 */
async function example6_contentRedaction() {
  console.log('\n=== Example 6: Content Redaction ===\n');

  const scanner = createBrowserSecurityScanner();
  await scanner.initialize();

  const content = 'Contact: john.doe@example.com, Phone: (555) 123-4567, SSN: 123-45-6789';

  console.log('Original content:');
  console.log(`  "${content}"`);
  console.log();

  const result = await scanner.scanForPII(content);

  if (result.success && result.value.hasPII) {
    // Redact PII
    let redacted = content;
    const sortedLocations = [...result.value.locations].sort((a, b) => b.start - a.start);

    for (const loc of sortedLocations) {
      const before = redacted.substring(0, loc.start);
      const after = redacted.substring(loc.end);
      redacted = before + '[REDACTED]' + after;
    }

    console.log('Redacted content:');
    console.log(`  "${redacted}"`);
    console.log();
    console.log('Detected PII types:');
    for (const type of result.value.detectedTypes) {
      console.log(`  - ${type}`);
    }
  } else {
    console.log('No PII detected.');
  }
}

/**
 * Run all examples
 */
async function runExamples() {
  console.log('BrowserSecurityScanner Examples');
  console.log('===============================');

  try {
    await example1_urlValidation();
    await example2_phishingDetection();
    await example3_piiScanning();
    await example4_preTestSecurityCheck();
    await example5_batchScanning();
    await example6_contentRedaction();

    console.log('\n✅ All examples completed successfully!\n');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly (Node.js ESM check)
if (process.argv[1] && process.argv[1].endsWith('browser-security-scanner-example.ts')) {
  runExamples();
}

export {
  example1_urlValidation,
  example2_phishingDetection,
  example3_piiScanning,
  example4_preTestSecurityCheck,
  example5_batchScanning,
  example6_contentRedaction,
};

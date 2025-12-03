/**
 * Deep Analyzer (No LLM Required)
 * Adds axe-core accessibility checks + Web Vitals timing + multi-page sampling
 */

const { chromium } = require('playwright');

async function runAxeAudit(page) {
  try {
    await page.evaluate(() => {
      // Inject axe-core if not already present
      if (typeof window.axe === 'undefined') {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js';
        document.head.appendChild(script);
      }
    });

    // Wait for axe to load
    await page.waitForFunction(() => typeof window.axe !== 'undefined', { timeout: 5000 });

    const results = await page.evaluate(async () => {
      const axeResults = await window.axe.run();
      return {
        violations: axeResults.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.length
        })),
        passes: axeResults.passes.length,
        incomplete: axeResults.incomplete.length
      };
    });

    return results;
  } catch (error) {
    console.log('⚠️  Axe audit failed:', error.message);
    return null;
  }
}

async function capturePerformanceTiming(page) {
  try {
    const timing = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0];
      if (!perf) return null;

      return {
        dns: Math.round(perf.domainLookupEnd - perf.domainLookupStart),
        tcp: Math.round(perf.connectEnd - perf.connectStart),
        ttfb: Math.round(perf.responseStart - perf.requestStart),
        download: Math.round(perf.responseEnd - perf.responseStart),
        domInteractive: Math.round(perf.domInteractive - perf.fetchStart),
        domComplete: Math.round(perf.domComplete - perf.fetchStart),
        loadComplete: Math.round(perf.loadEventEnd - perf.fetchStart)
      };
    });

    return timing;
  } catch (error) {
    console.log('⚠️  Performance timing failed:', error.message);
    return null;
  }
}

async function sampleMultiplePages(baseUrl, maxPages = 3) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; AQE-QXAnalyzer/1.0)'
  });
  const page = await context.newPage();

  const samples = [];

  try {
    // Sample homepage
    console.log(`📄 Sampling: ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1000);

    const homepageSample = {
      url: baseUrl,
      axe: await runAxeAudit(page),
      timing: await capturePerformanceTiming(page)
    };
    samples.push(homepageSample);

    // Try to find and sample additional pages from nav
    const navLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('nav a[href]'));
      return links
        .map(a => a.href)
        .filter(h => h && h.startsWith(window.location.origin) && h !== window.location.href)
        .slice(0, 3);
    });

    for (const link of navLinks.slice(0, maxPages - 1)) {
      try {
        console.log(`📄 Sampling: ${link}`);
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await page.waitForTimeout(1000);

        samples.push({
          url: link,
          axe: await runAxeAudit(page),
          timing: await capturePerformanceTiming(page)
        });
      } catch (err) {
        console.log(`⚠️  Failed to sample ${link}:`, err.message);
      }
    }

  } catch (error) {
    console.log('⚠️  Multi-page sampling error:', error.message);
  } finally {
    await browser.close();
  }

  return samples;
}

function aggregateA11yFindings(samples) {
  const allViolations = [];
  const seenIds = new Set();

  samples.forEach(s => {
    if (!s.axe || !s.axe.violations) return;
    s.axe.violations.forEach(v => {
      if (!seenIds.has(v.id)) {
        seenIds.add(v.id);
        allViolations.push(v);
      }
    });
  });

  // Sort by impact (critical > serious > moderate > minor)
  const impactOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };
  allViolations.sort((a, b) => (impactOrder[a.impact] || 4) - (impactOrder[b.impact] || 4));

  return allViolations.slice(0, 10); // Top 10
}

function aggregatePerformanceMetrics(samples) {
  const validTimings = samples.filter(s => s.timing).map(s => s.timing);
  if (validTimings.length === 0) return null;

  const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

  return {
    avgTTFB: avg(validTimings.map(t => t.ttfb)),
    avgDomInteractive: avg(validTimings.map(t => t.domInteractive)),
    avgLoadComplete: avg(validTimings.map(t => t.loadComplete)),
    sampleCount: validTimings.length
  };
}

function generateDeepAnalysisMarkdown(samples) {
  let out = '';

  const a11yFindings = aggregateA11yFindings(samples);
  const perfMetrics = aggregatePerformanceMetrics(samples);

  if (a11yFindings.length > 0) {
    out += `## ACCESSIBILITY FINDINGS (axe-core)\n\n`;
    out += `Found ${a11yFindings.length} unique WCAG violations across ${samples.length} page(s):\n\n`;
    a11yFindings.forEach((v, idx) => {
      out += `${idx + 1}. **[${v.impact?.toUpperCase() || 'UNKNOWN'}]** ${v.help}\n`;
      out += `   - Rule: \`${v.id}\`\n`;
      out += `   - Affected elements: ${v.nodes}\n`;
      out += `   - [Learn more](${v.helpUrl})\n\n`;
    });
  }

  if (perfMetrics) {
    out += `## PERFORMANCE METRICS (Navigation Timing)\n\n`;
    out += `Averages across ${perfMetrics.sampleCount} page(s):\n\n`;
    out += `- **Time to First Byte (TTFB)**: ${perfMetrics.avgTTFB}ms ${perfMetrics.avgTTFB > 600 ? '⚠️ Slow' : '✓'}\n`;
    out += `- **DOM Interactive**: ${perfMetrics.avgDomInteractive}ms ${perfMetrics.avgDomInteractive > 2500 ? '⚠️ Slow' : '✓'}\n`;
    out += `- **Load Complete**: ${perfMetrics.avgLoadComplete}ms ${perfMetrics.avgLoadComplete > 4000 ? '⚠️ Slow' : '✓'}\n\n`;

    if (perfMetrics.avgTTFB > 600) {
      out += `**Recommendation**: TTFB >600ms suggests server or CDN optimization needed.\n`;
    }
    if (perfMetrics.avgDomInteractive > 2500) {
      out += `**Recommendation**: DOM Interactive >2.5s suggests too much blocking JavaScript.\n`;
    }
  }

  return out;
}

module.exports = {
  sampleMultiplePages,
  generateDeepAnalysisMarkdown
};

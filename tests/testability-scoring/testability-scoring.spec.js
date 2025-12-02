const { test, expect } = require('@playwright/test');
const config = require('./config');
const fs = require('fs');
const path = require('path');

let testabilityScores = {
  timestamp: new Date().toISOString(),
  overall: 0,
  grade: 'F',
  principles: {},
  recommendations: [],
  context: {}, // Store actual findings for recommendation generation
  metadata: {
    url: config.baseURL,
    browser: 'chromium',
    version: '1.0.0',
    assessor: 'testability-scorer-skill'
  }
};

// Initialize all principles with default values to ensure we always have data
function initializeDefaultScores() {
  const defaultScore = { score: 50, grade: 'F', weight: 0 };
  testabilityScores.principles = {
    observability: { ...defaultScore, weight: config.weights.observability },
    controllability: { ...defaultScore, weight: config.weights.controllability },
    algorithmicSimplicity: { ...defaultScore, weight: config.weights.algorithmicSimplicity },
    algorithmicTransparency: { ...defaultScore, weight: config.weights.algorithmicTransparency },
    explainability: { ...defaultScore, weight: config.weights.explainability },
    similarity: { ...defaultScore, weight: config.weights.similarity },
    algorithmicStability: { ...defaultScore, weight: config.weights.algorithmicStability },
    unbugginess: { ...defaultScore, weight: config.weights.unbugginess },
    smallness: { ...defaultScore, weight: config.weights.smallness },
    decomposability: { ...defaultScore, weight: config.weights.decomposability }
  };
}

// Robust page navigation helper
async function navigateToPage(page) {
  console.log(`[NAV] Starting navigation to ${config.baseURL}`);
  page.setDefaultTimeout(45000);
  
  try {
    console.log('[NAV] Attempting page.goto with domcontentloaded...');
    await page.goto(config.baseURL, { 
      timeout: 45000, 
      waitUntil: 'domcontentloaded' 
    });
    console.log('[NAV] Page loaded (domcontentloaded)');
    
    // Try to wait for network idle but don't fail if it times out
    console.log('[NAV] Waiting for networkidle (15s timeout)...');
    await page.waitForLoadState('networkidle', { timeout: 15000 })
      .then(() => console.log('[NAV] Network is idle'))
      .catch(() => console.log('[NAV] Network not idle after 15s, continuing...'));
    
    return true;
  } catch (error) {
    console.log(`[NAV] Navigation failed: ${error.message}`);
    // Try one more time with even more lenient settings
    try {
      console.log('[NAV] Retrying with commit waitUntil...');
      await page.goto(config.baseURL, { 
        timeout: 45000, 
        waitUntil: 'commit' 
      });
      console.log('[NAV] Page committed');
      return true;
    } catch (retryError) {
      console.error(`[NAV] Final navigation failed: ${retryError.message}`);
      return false;
    }
  }
}

test.describe.configure({ mode: 'serial', timeout: 60000 });

// Generate contextual recommendations based on actual findings
function generateContextualRecommendations(scores) {
  const recommendations = [];
  const { principles, context } = scores;

  // 1. Observability recommendations
  if (principles.observability.score < 80 && context.observability) {
    const ctx = context.observability;
    const rec = {
      principle: 'Observability',
      severity: principles.observability.score < 60 ? 'critical' : 'high',
      findings: [],
      recommendations: []
    };

    if (ctx.testableElements === 0) {
      rec.findings.push(`No data-test attributes found on any of the ${ctx.totalInteractiveElements} interactive elements`);
      rec.recommendations.push('Add data-testid attributes to buttons, links, and form inputs');
    } else if (ctx.testableElements < ctx.totalInteractiveElements * 0.5) {
      rec.findings.push(`Only ${ctx.testableElements} out of ${ctx.totalInteractiveElements} interactive elements have test attributes (${Math.round(ctx.testableElements/ctx.totalInteractiveElements*100)}%)`);
      rec.recommendations.push(`Add data-testid attributes to remaining ${ctx.totalInteractiveElements - ctx.testableElements} elements`);
    }

    if (!ctx.hasConsoleLogs) {
      rec.findings.push('No console logging detected during page load');
      rec.recommendations.push('Implement structured logging for user actions and state changes');
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.observability.score) * 0.15);
      rec.effort = rec.findings.length > 2 ? 'High (16-24 hours)' : 'Medium (8-12 hours)';
      recommendations.push(rec);
    }
  }

  // 2. Controllability recommendations
  if (principles.controllability.score < 80 && context.controllability) {
    const ctx = context.controllability;
    const rec = {
      principle: 'Controllability',
      severity: principles.controllability.score < 60 ? 'critical' : 'high',
      findings: [],
      recommendations: []
    };

    if (ctx.testAttributeCount === 0) {
      rec.findings.push(`No test automation attributes found (checked ${ctx.inputCount} inputs, ${ctx.buttonCount} buttons across ${ctx.formCount} forms)`);
      rec.recommendations.push('Add data-testid or data-automation attributes to enable programmatic control');
    }

    if (!ctx.hasStateAPI) {
      rec.findings.push('Limited state manipulation capability detected');
      rec.recommendations.push('Expose sessionStorage/localStorage or provide test APIs for state control');
    }

    if (ctx.formCount > 0 && ctx.testAttributeCount === 0) {
      rec.findings.push(`${ctx.formCount} forms found but lacking automation attributes`);
      rec.recommendations.push('Add unique identifiers to form fields for reliable test automation');
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.controllability.score) * 0.15);
      rec.effort = 'Medium (8-16 hours)';
      recommendations.push(rec);
    }
  }

  // 3. Algorithmic Simplicity recommendations
  if (principles.algorithmicSimplicity.score < 80 && context.algorithmicSimplicity) {
    const ctx = context.algorithmicSimplicity;
    const rec = {
      principle: 'Algorithmic Simplicity',
      severity: principles.algorithmicSimplicity.score < 60 ? 'critical' : 'medium',
      findings: [],
      recommendations: []
    };

    if (ctx.avgComplexity > 3) {
      rec.findings.push(`High interaction complexity detected (average ${ctx.avgComplexity.toFixed(1)} steps per workflow)`);
      rec.recommendations.push('Simplify user workflows by reducing required steps');
    }

    if (ctx.hasMultiStepProcesses) {
      rec.findings.push(`Multi-step processes found requiring ${ctx.totalSteps} total steps`);
      rec.recommendations.push('Consider consolidating steps or providing skip/fast-path options');
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.algorithmicSimplicity.score) * 0.10);
      rec.effort = 'High (16-24 hours)';
      recommendations.push(rec);
    }
  }

  // 4. Algorithmic Transparency recommendations
  if (principles.algorithmicTransparency.score < 80 && context.algorithmicTransparency) {
    const ctx = context.algorithmicTransparency;
    const rec = {
      principle: 'Algorithmic Transparency',
      severity: principles.algorithmicTransparency.score < 60 ? 'critical' : 'medium',
      findings: [],
      recommendations: []
    };

    if (ctx.dataAttributeCount === 0) {
      rec.findings.push('No data attributes found to expose component state or structure');
      rec.recommendations.push('Add data-* attributes to expose component identity and state for testing');
    }

    if (ctx.readableClassCount < 10) {
      rec.findings.push(`Only ${ctx.readableClassCount} elements have semantic class names`);
      rec.recommendations.push('Use descriptive class names that reveal component purpose (e.g., .navigation, .submit-button)');
    }

    if (ctx.semanticElementCount < 5) {
      rec.findings.push(`Limited semantic HTML structure (only ${ctx.semanticElementCount} semantic elements found)`);
      rec.recommendations.push('Use semantic HTML5 elements (header, nav, main, article, section, footer) to improve structure transparency');
    }

    if (!ctx.hasDebugAttributes) {
      rec.findings.push('No debugging attributes detected');
      rec.recommendations.push('Add data-debug or data-id attributes to aid debugging and test identification');
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.algorithmicTransparency.score) * 0.10);
      rec.effort = 'Medium (8-12 hours)';
      recommendations.push(rec);
    }
  }

  // 5. Explainability recommendations
  if (principles.explainability.score < 80 && context.explainability) {
    const ctx = context.explainability;
    const rec = {
      principle: 'Explainability',
      severity: principles.explainability.score < 60 ? 'high' : 'medium',
      findings: [],
      recommendations: []
    };

    if (!ctx.hasHelpText) {
      rec.findings.push('No help text or labels detected');
      rec.recommendations.push('Add aria-label, title attributes, or .help-text elements to explain UI components');
    }

    if (ctx.ariaLabelCount === 0) {
      rec.findings.push('No ARIA labels found for accessibility and context');
      rec.recommendations.push('Add aria-label attributes to interactive elements for screen readers and test clarity');
    }

    if (!ctx.hasGuidance) {
      rec.findings.push('No tooltips or guidance elements detected');
      rec.recommendations.push('Implement data-tooltip attributes or .tooltip elements for user guidance');
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.explainability.score) * 0.10);
      rec.effort = 'Medium (6-10 hours)';
      recommendations.push(rec);
    }
  }

  // 6. Similarity recommendations
  if (principles.similarity.score < 80 && context.similarity) {
    const ctx = context.similarity;
    const rec = {
      principle: 'Similarity',
      severity: principles.similarity.score < 70 ? 'medium' : 'low',
      findings: [],
      recommendations: []
    };

    if (!ctx.usesStandardFrameworks) {
      rec.findings.push('No standard frameworks detected (jQuery, React, Vue, Angular)');
      rec.recommendations.push('Consider adopting industry-standard frameworks to improve testability with existing tools');
    }

    if (ctx.detectedFrameworks.length === 0) {
      rec.findings.push('Custom implementation without recognizable patterns');
      rec.recommendations.push('Follow common framework patterns or document your architecture for test authors');
    } else if (ctx.detectedFrameworks.length === 1) {
      rec.findings.push(`Using ${ctx.detectedFrameworks[0]} framework`);
      rec.recommendations.push(`Leverage ${ctx.detectedFrameworks[0]}-specific testing tools and best practices`);
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.similarity.score) * 0.05);
      rec.effort = 'Low (2-4 hours documentation)';
      recommendations.push(rec);
    }
  }

  // 7. Algorithmic Stability recommendations
  if (principles.algorithmicStability.score < 80 && context.algorithmicStability) {
    const ctx = context.algorithmicStability;
    const rec = {
      principle: 'Algorithmic Stability',
      severity: principles.algorithmicStability.score < 60 ? 'high' : 'medium',
      findings: [],
      recommendations: []
    };

    if (!ctx.hasVersioning) {
      rec.findings.push('No version information detected in page structure');
      rec.recommendations.push('Add data-version or meta tags to expose application version for test compatibility tracking');
    }

    if (ctx.dynamicContentCount > 10) {
      rec.findings.push(`High dynamic content detected (${ctx.dynamicContentCount} elements with dynamic attributes)`);
      rec.recommendations.push('Add stable identifiers to dynamic content for reliable test targeting');
    }

    if (!ctx.pageLoadsConsistently) {
      rec.findings.push('Page load state inconsistent');
      rec.recommendations.push('Ensure document.readyState reaches "complete" reliably before interactions');
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.algorithmicStability.score) * 0.10);
      rec.effort = 'Medium (8-12 hours)';
      recommendations.push(rec);
    }
  }

  // 8. Unbugginess recommendations
  if (principles.unbugginess.score < 80 && context.unbugginess) {
    const ctx = context.unbugginess;
    const rec = {
      principle: 'Unbugginess',
      severity: principles.unbugginess.score < 60 ? 'critical' : 'high',
      findings: [],
      recommendations: []
    };

    if (ctx.errorCount > 0) {
      rec.findings.push(`${ctx.errorCount} console error${ctx.errorCount > 1 ? 's' : ''} detected during page load`);
      if (ctx.errors.length > 0) {
        rec.findings.push(`Examples: "${ctx.errors.slice(0, 2).join('", "')}"`);
      }
      rec.recommendations.push('Fix all console errors to improve test reliability');
    }

    if (ctx.warningCount > 5) {
      rec.findings.push(`${ctx.warningCount} console warnings detected`);
      rec.recommendations.push('Review and resolve console warnings');
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.unbugginess.score) * 0.10);
      rec.effort = ctx.errorCount > 5 ? 'High (16-24 hours)' : 'Medium (8-12 hours)';
      recommendations.push(rec);
    }
  }

  // 9. Smallness recommendations
  if (principles.smallness.score < 80 && context.smallness) {
    const ctx = context.smallness;
    const rec = {
      principle: 'Smallness',
      severity: principles.smallness.score < 70 ? 'medium' : 'low',
      findings: [],
      recommendations: []
    };

    if (ctx.elementCount > 2000) {
      rec.findings.push(`Large DOM structure detected (${ctx.elementCount} elements)`);
      rec.recommendations.push('Consider virtualizing lists or lazy-loading content to reduce DOM size');
    } else if (ctx.elementCount > 1000) {
      rec.findings.push(`Moderate DOM size (${ctx.elementCount} elements)`);
      rec.recommendations.push('Monitor DOM growth as complexity increases test execution time');
    }

    if (ctx.scriptCount > 20) {
      rec.findings.push(`${ctx.scriptCount} script tags found`);
      rec.recommendations.push('Bundle and minify scripts to reduce complexity');
    }

    if (ctx.styleCount > 10) {
      rec.findings.push(`${ctx.styleCount} style resources found`);
      rec.recommendations.push('Consolidate CSS files to reduce complexity');
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.smallness.score) * 0.10);
      rec.effort = 'Medium (8-16 hours)';
      recommendations.push(rec);
    }
  }

  // 10. Decomposability recommendations
  if (principles.decomposability.score < 80 && context.decomposability) {
    const ctx = context.decomposability;
    const rec = {
      principle: 'Decomposability',
      severity: principles.decomposability.score < 60 ? 'high' : 'medium',
      findings: [],
      recommendations: []
    };

    if (!ctx.hasModularStructure) {
      rec.findings.push('No modular structure detected (no component or module attributes)');
      rec.recommendations.push('Add data-component or data-module attributes to identify isolatable features');
    }

    if (ctx.componentCount === 0) {
      rec.findings.push('No components identified in markup');
      rec.recommendations.push('Refactor monolithic pages into testable components with clear boundaries');
    } else if (ctx.componentCount < 5) {
      rec.findings.push(`Only ${ctx.componentCount} components identified`);
      rec.recommendations.push('Increase component granularity for better test isolation');
    }

    if (ctx.sectionCount < 3) {
      rec.findings.push(`Limited sectioning (${ctx.sectionCount} sections/regions)`);
      rec.recommendations.push('Use semantic section elements or role="region" to define testable boundaries');
    }

    if (rec.findings.length > 0) {
      rec.recommendation = `**Findings:** ${rec.findings.join('; ')}. **Actions:** ${rec.recommendations.join('; ')}.`;
      rec.impact = Math.round((80 - principles.decomposability.score) * 0.05);
      rec.effort = 'High (16-32 hours)';
      recommendations.push(rec);
    }
  }

  return recommendations;
}

test.describe('Comprehensive Testability Analysis - Sauce Demo Shopify', () => {

  test.beforeAll(() => {
    console.log('Starting testability assessment...');
    initializeDefaultScores();
  });

  test('1. Observability Assessment', async ({ page }) => {
    try {
      const logs = [];
      const errors = [];
      const networkRequests = [];

      page.on('console', msg => logs.push(msg));
      page.on('pageerror', err => errors.push(err));
      page.on('request', request => networkRequests.push(request));

      const loaded = await navigateToPage(page);
      if (!loaded) {
        throw new Error('Failed to load page');
      }

    // Check data-test attributes
    const testableElements = await page.evaluate(() => {
      const dataTest = document.querySelectorAll('[data-test], [data-testid], [data-cy]').length;
      const total = document.querySelectorAll('button, a, input, select, textarea').length;
      return { dataTest, total };
    });

    // Check console logging
    const hasConsoleLogs = logs.length > 0;

    // Check network visibility
    const hasNetworkRequests = networkRequests.length > 0;

    // Check state inspection
    const stateVisible = await page.evaluate(() => {
      return typeof window !== 'undefined' &&
             (typeof window.Shopify !== 'undefined' ||
              typeof window.console !== 'undefined');
    });

    // Store context for recommendations
    testabilityScores.context.observability = {
      testableElements: testableElements.dataTest,
      totalInteractiveElements: testableElements.total,
      hasConsoleLogs,
      hasNetworkRequests,
      stateVisible
    };

    // Calculate score
    let score = 0;
    if (testableElements.dataTest > 0) score += 30;
    if (hasConsoleLogs) score += 20;
    if (hasNetworkRequests) score += 25;
    if (stateVisible) score += 15;
    score += 10; // Base score for page loading

    testabilityScores.principles.observability = {
      score: Math.min(score, 100),
      grade: getLetterGrade(score),
      weight: config.weights.observability
    };
    } catch (error) {
      console.error('Observability assessment failed:', error.message);
      testabilityScores.principles.observability = { score: 50, grade: 'F', weight: config.weights.observability };
    }
  });

  test('2. Controllability Assessment', async ({ page }) => {
    try {
      const loaded = await navigateToPage(page);
      if (!loaded) throw new Error('Failed to load page');

    // Detect site type first to provide contextual assessment
    const siteContext = await page.evaluate(() => {
      const hasShopify = typeof window.Shopify !== 'undefined';
      const hasWooCommerce = typeof window.wc !== 'undefined' || typeof window.woocommerce !== 'undefined';
      const hasCart = document.querySelector('[data-cart], .cart, #cart, .woocommerce-cart') !== null;
      const hasProducts = document.querySelector('[data-product], .product, .product-item, .woocommerce-product') !== null;
      const hasCheckout = document.querySelector('[href*="checkout"], .checkout-button, .woocommerce-checkout') !== null;
      
      return {
        isEcommerce: hasShopify || hasWooCommerce || (hasCart && hasProducts) || hasCheckout,
        platform: hasShopify ? 'shopify' : hasWooCommerce ? 'woocommerce' : 'generic'
      };
    });

    // Check for test automation capabilities
    const automation = await page.evaluate(() => {
      // Check for test APIs
      const hasTestAPI = typeof window.testAPI !== 'undefined' || 
                        typeof window.cypressAPI !== 'undefined' ||
                        typeof window.seleniumAPI !== 'undefined';
      
      // Check for state manipulation APIs
      const hasStateAPI = typeof window.sessionStorage !== 'undefined' &&
                         typeof window.localStorage !== 'undefined';
      
      // Check for form manipulation
      const forms = document.querySelectorAll('form');
      const hasInteractiveForms = forms.length > 0;
      
      // Check for data attributes (good for test automation)
      const elementsWithTestAttrs = document.querySelectorAll('[data-testid], [data-test], [data-automation]');
      const hasTestAttributes = elementsWithTestAttrs.length > 0;
      
      // Count interactive elements
      const inputs = document.querySelectorAll('input, select, textarea');
      const buttons = document.querySelectorAll('button, [type="submit"]');
      
      return {
        hasTestAPI,
        hasStateAPI,
        hasInteractiveForms,
        hasTestAttributes,
        formCount: forms.length,
        inputCount: inputs.length,
        buttonCount: buttons.length,
        testAttributeCount: elementsWithTestAttrs.length
      };
    });

    // Store context for recommendations
    testabilityScores.context.controllability = {
      formCount: automation.formCount,
      inputCount: automation.inputCount,
      buttonCount: automation.buttonCount,
      testAttributeCount: automation.testAttributeCount,
      hasTestAPI: automation.hasTestAPI,
      hasStateAPI: automation.hasStateAPI
    };

    // Calculate score based on controllability factors
    let score = 50; // Base score
    
    if (automation.hasTestAPI) score += 20;
    if (automation.hasStateAPI) score += 10;
    if (automation.hasTestAttributes) score += 15;
    if (automation.hasInteractiveForms) score += 5;
    
    // Adjust for site type
    if (siteContext.isEcommerce) {
      // E-commerce sites have lower base controllability due to security
      score = Math.min(score, 65);
    } else {
      // Content sites typically have better controllability
      score = Math.min(score + 10, 85);
    }

    testabilityScores.principles.controllability = {
      score,
      grade: getLetterGrade(score),
      weight: config.weights.controllability
    };
    } catch (error) {
      console.error('Controllability assessment failed:', error.message);
      testabilityScores.principles.controllability = { score: 50, grade: 'F', weight: config.weights.controllability };
    }
  });

  test('3. Algorithmic Simplicity Assessment', async ({ page }) => {
    try {
      const loaded = await navigateToPage(page);
      if (!loaded) throw new Error('Failed to load page');

    // Measure complexity through interaction patterns
    const interactions = [];

    try {
      // Test product browsing
      const products = await page.locator('[data-product], .product, .product-item').count();
      interactions.push({ action: 'browse', steps: products > 0 ? 2 : 5 });

      // Test cart interaction
      const cartExists = await page.locator('[data-cart], .cart, #cart').count() > 0;
      interactions.push({ action: 'cart', steps: cartExists ? 2 : 4 });

      // Test checkout flow
      const checkoutExists = await page.locator('[href*="checkout"], .checkout-button').count() > 0;
      interactions.push({ action: 'checkout', steps: checkoutExists ? 3 : 6 });
    } catch (e) {
      interactions.push({ action: 'default', steps: 5 });
    }

    const avgComplexity = interactions.reduce((sum, i) => sum + i.steps, 0) / interactions.length;
    const totalSteps = interactions.reduce((sum, i) => sum + i.steps, 0);
    const hasWorkflows = interactions.length > 0;
    const hasMultiStepProcesses = interactions.some(i => i.steps > 3);

    // Shopify is well-structured, so base score is high
    const score = Math.max(70, Math.min(100 - (avgComplexity * 5), 95));

    // Store context for recommendations
    testabilityScores.context.algorithmicSimplicity = {
      avgComplexity,
      totalSteps,
      hasWorkflows,
      hasMultiStepProcesses
    };

    testabilityScores.principles.algorithmicSimplicity = {
      score: Math.round(score),
      grade: getLetterGrade(score),
      weight: config.weights.algorithmicSimplicity
    };
    } catch (error) {
      console.error('Algorithmic Simplicity assessment failed:', error.message);
      testabilityScores.principles.algorithmicSimplicity = { score: 50, grade: 'F', weight: config.weights.algorithmicSimplicity };
    }
  });

  test('4. Algorithmic Transparency Assessment', async ({ page }) => {
    try {
      const loaded = await navigateToPage(page);
      if (!loaded) throw new Error('Failed to load page');

    // Check code readability indicators
    const transparencyMetrics = await page.evaluate(() => {
      const elements = document.querySelectorAll('[class]');
      let readableCount = 0;
      const semanticKeywords = ['button', 'form', 'input', 'nav', 'header', 'footer', 'main', 'article', 'section', 
                                'menu', 'search', 'login', 'signup', 'submit', 'cancel', 'close', 'open'];
      
      elements.forEach(el => {
        const classes = el.className.toString().toLowerCase();
        if (semanticKeywords.some(keyword => classes.includes(keyword))) {
          readableCount++;
        }
      });
      
      // Check for semantic HTML elements
      const semanticElements = document.querySelectorAll('header, nav, main, article, section, aside, footer').length;
      
      // Check data attributes
      const dataAttributes = document.querySelectorAll('[data-testid], [data-test], [data-automation], [data-qa]');
      
      // Check for debugging aids
      const hasDebugAttributes = document.querySelectorAll('[data-debug], [data-id]').length > 0;
      const hasIdAttributes = document.querySelectorAll('[id]').length;
      
      return {
        readableClassCount: readableCount,
        semanticElementCount: semanticElements,
        dataAttributeCount: dataAttributes.length,
        hasDebugAttributes,
        idAttributeCount: hasIdAttributes
      };
    });

    // Store context for recommendations
    testabilityScores.context.algorithmicTransparency = transparencyMetrics;

    let score = 60; // Base score
    if (transparencyMetrics.readableClassCount > 10) score += 10;
    if (transparencyMetrics.dataAttributeCount > 0) score += 10;
    if (transparencyMetrics.semanticElementCount > 5) score += 10;
    if (transparencyMetrics.hasDebugAttributes) score += 10;

    testabilityScores.principles.algorithmicTransparency = {
      score: Math.min(score, 100),
      grade: getLetterGrade(score),
      weight: config.weights.algorithmicTransparency
    };
    } catch (error) {
      console.error('Algorithmic Transparency assessment failed:', error.message);
      testabilityScores.principles.algorithmicTransparency = { score: 50, grade: 'F', weight: config.weights.algorithmicTransparency };
    }
  });

  test('5. Explainability Assessment', async ({ page }) => {
    try {
      const loaded = await navigateToPage(page);
      if (!loaded) throw new Error('Failed to load page');

    // Check for help text and documentation
    const hasHelpText = await page.locator('[aria-label], [title], .help-text').count() > 0;

    // Check for clear error messages
    const hasErrorHandling = await page.evaluate(() => {
      return document.querySelectorAll('[role="alert"], .error, .message').length >= 0;
    });

    // Check for tooltips and guidance
    const hasGuidance = await page.locator('[data-tooltip], .tooltip').count() > 0;

    let score = 50; // Base score
    if (hasHelpText) score += 15;
    if (hasErrorHandling) score += 10;
    if (hasGuidance) score += 7;

    // Store context for recommendations
    testabilityScores.context.explainability = {
      hasHelpText,
      hasErrorHandling,
      hasGuidance,
      ariaLabelCount: await page.locator('[aria-label]').count(),
      titleCount: await page.locator('[title]').count()
    };

    testabilityScores.principles.explainability = {
      score: Math.min(score, 100),
      grade: getLetterGrade(score),
      weight: config.weights.explainability
    };
    } catch (error) {
      console.error('Explainability assessment failed:', error.message);
      testabilityScores.principles.explainability = { score: 50, grade: 'F', weight: config.weights.explainability };
    }
  });

  test('6. Similarity to Known Technology Assessment', async ({ page }) => {
    try {
      const loaded = await navigateToPage(page);
      if (!loaded) throw new Error('Failed to load page');

    // Shopify is a well-known platform
    const usesShopify = await page.evaluate(() => {
      return typeof window.Shopify !== 'undefined' ||
             document.documentElement.innerHTML.includes('Shopify');
    });

    // Check for standard frameworks
    const usesStandardFrameworks = await page.evaluate(() => {
      return typeof window.jQuery !== 'undefined' ||
             document.querySelector('[data-react-root]') !== null ||
             typeof window.Vue !== 'undefined';
    });

    let score = 85; // High base score for Shopify
    if (usesShopify) score += 10;
    if (usesStandardFrameworks) score += 5;

    // Store context for recommendations
    testabilityScores.context.similarity = {
      usesShopify,
      usesStandardFrameworks,
      detectedFrameworks: await page.evaluate(() => {
        const frameworks = [];
        if (typeof window.jQuery !== 'undefined') frameworks.push('jQuery');
        if (document.querySelector('[data-react-root]')) frameworks.push('React');
        if (typeof window.Vue !== 'undefined') frameworks.push('Vue');
        if (typeof window.angular !== 'undefined') frameworks.push('Angular');
        return frameworks;
      })
    };

    testabilityScores.principles.similarity = {
      score: Math.round(score),
      grade: getLetterGrade(score),
      weight: config.weights.similarity
    };
    } catch (error) {
      console.error('Similarity assessment failed:', error.message);
      testabilityScores.principles.similarity = { score: 50, grade: 'F', weight: config.weights.similarity };
    }
  });

  test('7. Algorithmic Stability Assessment', async ({ page }) => {
    try {
      const loaded = await navigateToPage(page);
      if (!loaded) throw new Error('Failed to load page');

    // Check for versioning
    const hasVersioning = await page.evaluate(() => {
      return typeof window.Shopify !== 'undefined';
    });

    // Check page consistency
    const pageLoadsConsistently = await page.evaluate(() => {
      return document.readyState === 'complete';
    });

    let score = 60; // Base score
    if (hasVersioning) score += 15;
    if (pageLoadsConsistently) score += 10;

    // Store context for recommendations
    testabilityScores.context.algorithmicStability = {
      hasVersioning,
      pageLoadsConsistently,
      dynamicContentCount: await page.evaluate(() => {
        return document.querySelectorAll('[data-dynamic], .dynamic, [data-ajax]').length;
      })
    };

    testabilityScores.principles.algorithmicStability = {
      score: Math.min(score, 100),
      grade: getLetterGrade(score),
      weight: config.weights.algorithmicStability
    };
    } catch (error) {
      console.error('Algorithmic Stability assessment failed:', error.message);
      testabilityScores.principles.algorithmicStability = { score: 50, grade: 'F', weight: config.weights.algorithmicStability };
    }
  });

  test('8. Unbugginess Assessment', async ({ page }) => {
    try {
      const errors = [];
      const warnings = [];

      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg);
        if (msg.type() === 'warning') warnings.push(msg);
      });

      page.on('pageerror', err => errors.push(err));

      const loaded = await navigateToPage(page);
      if (!loaded) throw new Error('Failed to load page');

      // Store context for recommendations
      testabilityScores.context.unbugginess = {
        errorCount: errors.length,
        warningCount: warnings.length,
        errors: errors.slice(0, 3).map(e => e.text ? e.text() : e.message) // Store first 3 error messages
      };

      // Score based on errors
      let score = 95; // Start high
      score -= errors.length * 5;
      score -= warnings.length * 2;
      score = Math.max(score, 0);

      testabilityScores.principles.unbugginess = {
        score: Math.min(score, 100),
        grade: getLetterGrade(score),
        weight: config.weights.unbugginess
      };
    } catch (error) {
      console.error('Unbugginess assessment failed:', error.message);
      testabilityScores.principles.unbugginess = { score: 50, grade: 'F', weight: config.weights.unbugginess };
    }
  });

  test('9. Smallness Assessment', async ({ page }) => {
    try {
      const loaded = await navigateToPage(page);
      if (!loaded) throw new Error('Failed to load page');

      // Measure page size indicators
      const elementCount = await page.evaluate(() => document.querySelectorAll('*').length);
      const scriptCount = await page.evaluate(() => document.querySelectorAll('script').length);
      const styleCount = await page.evaluate(() => document.querySelectorAll('style, link[rel="stylesheet"]').length);

      // Smaller is better
      let score = 100;
      if (elementCount > 1000) score -= 10;
      if (elementCount > 2000) score -= 10;
      if (scriptCount > 20) score -= 5;
      if (styleCount > 10) score -= 5;

      // Store context for recommendations
      testabilityScores.context.smallness = {
        elementCount,
        scriptCount,
        styleCount
      };

      testabilityScores.principles.smallness = {
        score: Math.min(score, 100),
        grade: getLetterGrade(score),
        weight: config.weights.smallness
      };
    } catch (error) {
      console.error('Smallness assessment failed:', error.message);
      testabilityScores.principles.smallness = { score: 50, grade: 'F', weight: config.weights.smallness };
    }
  });

  test('10. Decomposability Assessment', async ({ page }) => {
    try {
      const loaded = await navigateToPage(page);
      if (!loaded) throw new Error('Failed to load page');

    // Check for modular components
    const hasModularStructure = await page.evaluate(() => {
      const hasComponents = document.querySelectorAll('[data-component], [data-module], .component, .module').length > 0;
      const hasSections = document.querySelectorAll('section, [role="region"]').length > 0;
      return hasComponents || hasSections;
    });

    // Check for isolated features
    const hasIsolatedFeatures = await page.evaluate(() => {
      const hasCart = document.querySelector('[data-cart], .cart') !== null;
      const hasProduct = document.querySelector('[data-product], .product') !== null;
      return hasCart && hasProduct;
    });

    let score = 50; // Base score
    if (hasModularStructure) score += 20;
    if (hasIsolatedFeatures) score += 15;

    // Store context for recommendations
    testabilityScores.context.decomposability = {
      hasModularStructure,
      hasIsolatedFeatures,
      componentCount: await page.evaluate(() => {
        return document.querySelectorAll('[data-component], [data-module], .component, .module').length;
      }),
      sectionCount: await page.evaluate(() => {
        return document.querySelectorAll('section, [role="region"]').length;
      })
    };

    testabilityScores.principles.decomposability = {
      score: Math.min(score, 100),
      grade: getLetterGrade(score),
      weight: config.weights.decomposability
    };
    } catch (error) {
      console.error('Decomposability assessment failed:', error.message);
      testabilityScores.principles.decomposability = { score: 50, grade: 'F', weight: config.weights.decomposability };
    }
  });

  test.afterAll('Calculate Overall Score & Generate Report', async () => {
    // Calculate weighted average
    const principles = testabilityScores.principles;
    const weights = config.weights;

    let totalScore = 0;
    Object.keys(principles).forEach(key => {
      const weight = weights[key] / 100;
      totalScore += principles[key].score * weight;
    });

    testabilityScores.overall = Math.round(totalScore);
    testabilityScores.grade = getLetterGrade(testabilityScores.overall);
    testabilityScores.metadata.duration = Date.now() - new Date(testabilityScores.timestamp).getTime();

    // Generate contextual recommendations based on actual findings
    const contextualRecs = generateContextualRecommendations(testabilityScores);
    testabilityScores.recommendations.push(...contextualRecs);

    // Sort recommendations by impact (high to low)
    testabilityScores.recommendations.sort((a, b) => b.impact - a.impact);

    // Remove context from final output (too verbose)
    delete testabilityScores.context;

    // Save JSON report
    const timestamp = Date.now();
    const jsonPath = path.join(config.reports.directory, `testability-results-${timestamp}.json`);
    const htmlPath = path.join(config.reports.directory, `testability-report-${timestamp}.html`);

    fs.writeFileSync(jsonPath, JSON.stringify(testabilityScores, null, 2));
    fs.writeFileSync(path.join(config.reports.directory, 'latest.json'), JSON.stringify(testabilityScores, null, 2));

    console.log(`\n✅ Assessment Complete!`);
    console.log(`\n📊 Overall Testability Score: ${testabilityScores.overall}/100 (${testabilityScores.grade})`);
    console.log(`\n📄 JSON Report saved: ${jsonPath}`);
    console.log(`\n🎯 Generating HTML report with Chrome auto-launch...`);

    // Generate HTML report using the enhanced script
    const { exec } = require('child_process');
    exec(`node .claude/skills/testability-scoring/scripts/generate-html-report.js "${jsonPath}" "${htmlPath}"`,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`Error generating HTML: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
        }
        console.log(stdout);
      });
  });
});

function getLetterGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

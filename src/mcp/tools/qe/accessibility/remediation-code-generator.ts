/**
 * Remediation Code Generator
 *
 * Generates context-aware, copy-paste ready code examples for accessibility violations.
 * Includes framework detection, brand color extraction, and multi-language support.
 *
 * @version 1.0.0
 * @author Agentic QE Team
 */

import { AccessibilityViolation, ViolationElement } from './scan-comprehensive.js';

/**
 * Detected UI framework
 */
export type UIFramework =
  | 'slick'
  | 'swiper'
  | 'bootstrap'
  | 'owl-carousel'
  | 'flickity'
  | 'glide'
  | 'splide'
  | 'vanilla'
  | 'unknown';

/**
 * Remediation code output
 */
export interface RemediationCode {
  /** Violation ID this remediation addresses */
  violationId: string;
  /** WCAG criterion */
  wcagCriterion: string;
  /** Human-readable title */
  title: string;
  /** Before code (broken) */
  beforeCode: string;
  /** After code (fixed) */
  afterCode: string;
  /** Language/format of the code */
  language: 'html' | 'css' | 'javascript' | 'typescript' | 'vtt';
  /** Explanation of the fix */
  explanation: string;
  /** Estimated fix time */
  estimatedTime: string;
  /** Additional notes */
  notes?: string[];
  /** Related WCAG success criteria */
  relatedCriteria?: string[];
}

/**
 * Framework detection result
 */
export interface FrameworkDetection {
  framework: UIFramework;
  version?: string;
  confidence: number;
  selectors: string[];
}

/**
 * Color analysis result
 */
export interface ColorAnalysis {
  foreground: string;
  background: string;
  currentRatio: number;
  requiredRatio: number;
  suggestedForeground: string;
  suggestedBackground: string;
  newRatio: number;
  brandColors?: string[];
}

/**
 * Detect carousel/slider framework from HTML
 */
export function detectFramework(html: string, selectors: string[]): FrameworkDetection {
  const checks: { framework: UIFramework; patterns: RegExp[]; confidence: number }[] = [
    {
      framework: 'slick',
      patterns: [/slick-slider/i, /slick-slide/i, /slick-track/i, /slick-list/i],
      confidence: 0.95
    },
    {
      framework: 'swiper',
      patterns: [/swiper-container/i, /swiper-slide/i, /swiper-wrapper/i],
      confidence: 0.95
    },
    {
      framework: 'bootstrap',
      patterns: [/carousel-inner/i, /carousel-item/i, /data-bs-ride/i, /data-ride="carousel"/i],
      confidence: 0.9
    },
    {
      framework: 'owl-carousel',
      patterns: [/owl-carousel/i, /owl-item/i, /owl-stage/i],
      confidence: 0.95
    },
    {
      framework: 'flickity',
      patterns: [/flickity-slider/i, /flickity-viewport/i],
      confidence: 0.95
    },
    {
      framework: 'glide',
      patterns: [/glide__slides/i, /glide__track/i],
      confidence: 0.95
    },
    {
      framework: 'splide',
      patterns: [/splide__slide/i, /splide__list/i],
      confidence: 0.95
    }
  ];

  const combinedContent = html + ' ' + selectors.join(' ');

  for (const check of checks) {
    const matches = check.patterns.filter(p => p.test(combinedContent));
    if (matches.length >= 2) {
      return {
        framework: check.framework,
        confidence: check.confidence,
        selectors: selectors.filter(s => check.patterns.some(p => p.test(s)))
      };
    }
  }

  return {
    framework: 'unknown',
    confidence: 0.5,
    selectors
  };
}

/**
 * Calculate color contrast ratio
 */
function getContrastRatio(fg: string, bg: string): number {
  const getLuminance = (hex: string): number => {
    const rgb = hex.replace('#', '').match(/.{2}/g)?.map(x => parseInt(x, 16) / 255) || [0, 0, 0];
    const [r, g, b] = rgb.map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const l1 = getLuminance(fg);
  const l2 = getLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Suggest accessible color alternatives
 */
export function analyzeColors(foreground: string, background: string, level: 'AA' | 'AAA' = 'AA'): ColorAnalysis {
  const currentRatio = getContrastRatio(foreground, background);
  const requiredRatio = level === 'AAA' ? 7 : 4.5;

  // Common accessible color alternatives
  const accessibleColors = [
    { color: '#000000', name: 'Black' },
    { color: '#333333', name: 'Dark Gray' },
    { color: '#595959', name: 'Medium Gray' },
    { color: '#1a1a1a', name: 'Near Black' },
    { color: '#0d47a1', name: 'Dark Blue' },
    { color: '#1b5e20', name: 'Dark Green' },
    { color: '#b71c1c', name: 'Dark Red' }
  ];

  let suggestedForeground = foreground;
  let newRatio = currentRatio;

  if (currentRatio < requiredRatio) {
    // Find first color that meets contrast requirement
    for (const { color } of accessibleColors) {
      const ratio = getContrastRatio(color, background);
      if (ratio >= requiredRatio) {
        suggestedForeground = color;
        newRatio = ratio;
        break;
      }
    }
  }

  return {
    foreground,
    background,
    currentRatio: Math.round(currentRatio * 10) / 10,
    requiredRatio,
    suggestedForeground,
    suggestedBackground: background,
    newRatio: Math.round(newRatio * 10) / 10
  };
}

/**
 * Generate video caption remediation code
 */
export function generateVideoCaptionRemediation(
  violation: AccessibilityViolation,
  pageLanguage: string = 'en',
  pageTitle: string = ''
): RemediationCode[] {
  const codes: RemediationCode[] = [];

  for (const element of violation.elements) {
    const videoHtml = element.html || '<video src="video.mp4"></video>';

    // Generate HTML fix
    codes.push({
      violationId: violation.id,
      wcagCriterion: violation.wcagCriterion,
      title: 'Add Caption Track to Video',
      language: 'html',
      beforeCode: videoHtml.slice(0, 200) + (videoHtml.length > 200 ? '...' : ''),
      afterCode: `<video autoplay loop controls playsinline
       aria-describedby="video-desc-${codes.length + 1}">
  <source src="video.mp4" type="video/mp4">

  <!-- Caption tracks for deaf/hard-of-hearing users -->
  <track kind="captions"
         src="/captions/video-${codes.length + 1}-${pageLanguage}.vtt"
         srclang="${pageLanguage}"
         label="${getLanguageName(pageLanguage)}"
         default>
  <track kind="captions"
         src="/captions/video-${codes.length + 1}-en.vtt"
         srclang="en"
         label="English">
</video>

<!-- Extended description for screen readers -->
<div id="video-desc-${codes.length + 1}" class="visually-hidden">
  ${pageTitle ? `Video from: ${pageTitle}. ` : ''}Detailed description of the video content
  including key visual elements, actions, and any on-screen text.
</div>`,
      explanation: 'Add a <track> element with kind="captions" to provide synchronized text for deaf and hard-of-hearing users. The aria-describedby attribute links to a detailed description for screen reader users.',
      estimatedTime: '4 hours',
      notes: [
        'Create WebVTT file with timestamps matching video content',
        'Include descriptions of sounds, music, and speaker identification',
        'Test caption display in multiple browsers'
      ],
      relatedCriteria: ['1.2.2 Captions (Prerecorded)', '1.2.5 Audio Description']
    });

    // Generate WebVTT template
    codes.push({
      violationId: violation.id,
      wcagCriterion: violation.wcagCriterion,
      title: `WebVTT Caption File (${getLanguageName(pageLanguage)})`,
      language: 'vtt',
      beforeCode: '<!-- No captions file exists -->',
      afterCode: `WEBVTT

NOTE ${pageTitle || 'Video'} - ${getLanguageName(pageLanguage)} Captions

00:00:00.000 --> 00:00:03.000
${pageTitle || '[Opening scene]'}

00:00:03.000 --> 00:00:06.000
[Description of visual content]

00:00:06.000 --> 00:00:09.000
[Ambient background music]

00:00:09.000 --> 00:00:12.000
[Key visual element or action]

00:00:12.000 --> 00:00:15.000
[On-screen text or dialogue]

00:00:15.000 --> 00:00:18.000
[Continuing description]

00:00:18.000 --> 00:00:21.000
[Important visual details]

00:00:21.000 --> 00:00:24.000
[Conclusion or call-to-action]`,
      explanation: 'WebVTT (Web Video Text Tracks) is the standard format for video captions. Each cue has a timestamp and text content.',
      estimatedTime: '2 hours',
      notes: [
        'Timestamps should match video content precisely',
        'Include [brackets] for non-speech audio like music or sounds',
        'Keep lines under 42 characters for readability'
      ]
    });
  }

  return codes;
}

/**
 * Generate ARIA hidden focus remediation code
 */
export function generateAriaHiddenFocusRemediation(
  violation: AccessibilityViolation,
  framework: FrameworkDetection
): RemediationCode[] {
  const codes: RemediationCode[] = [];

  // HTML fix
  const element = violation.elements[0];
  codes.push({
    violationId: violation.id,
    wcagCriterion: violation.wcagCriterion,
    title: 'Remove Focusable Elements from ARIA Hidden Container',
    language: 'html',
    beforeCode: `<div aria-hidden="true">
  <!-- PROBLEM: Focusable elements inside hidden container -->
  <a href="/link">Link Text</a>
  <button>Button</button>
</div>`,
    afterCode: `<div aria-hidden="true">
  <!-- FIX: Add tabindex="-1" to prevent keyboard focus -->
  <a href="/link" tabindex="-1">Link Text</a>
  <button tabindex="-1">Button</button>
</div>`,
    explanation: 'Elements with aria-hidden="true" are hidden from assistive technology but can still receive keyboard focus. Adding tabindex="-1" prevents keyboard focus while maintaining the visual layout.',
    estimatedTime: '30 minutes',
    notes: [
      'Apply to all focusable elements: a, button, input, select, textarea, [tabindex]',
      'Remember to restore tabindex when elements become visible'
    ],
    relatedCriteria: ['4.1.2 Name, Role, Value', '2.1.1 Keyboard']
  });

  // Framework-specific JavaScript fix
  if (framework.framework !== 'unknown') {
    codes.push(generateFrameworkFix(framework));
  }

  return codes;
}

/**
 * Generate framework-specific JavaScript fix
 */
function generateFrameworkFix(framework: FrameworkDetection): RemediationCode {
  const fixes: Record<UIFramework, { code: string; notes: string[] }> = {
    slick: {
      code: `/**
 * Slick Carousel Accessibility Fix
 * Prevents focus on hidden slides
 */
(function() {
  'use strict';

  function fixSlickA11y() {
    const carousels = document.querySelectorAll('.slick-slider');

    carousels.forEach(carousel => {
      updateFocusability(carousel);

      $(carousel).on('afterChange', function() {
        updateFocusability(carousel);
      });
    });
  }

  function updateFocusability(carousel) {
    const focusable = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

    // Hidden slides - remove from tab order
    carousel.querySelectorAll('.slick-slide[aria-hidden="true"]').forEach(slide => {
      slide.querySelectorAll(focusable).forEach(el => {
        el.setAttribute('tabindex', '-1');
        el.setAttribute('data-a11y-restored-tabindex', el.getAttribute('tabindex') || '0');
      });
    });

    // Visible slides - restore tab order
    carousel.querySelectorAll('.slick-slide[aria-hidden="false"], .slick-active').forEach(slide => {
      slide.querySelectorAll('[data-a11y-restored-tabindex]').forEach(el => {
        const original = el.getAttribute('data-a11y-restored-tabindex');
        if (original === '0') {
          el.removeAttribute('tabindex');
        } else {
          el.setAttribute('tabindex', original);
        }
        el.removeAttribute('data-a11y-restored-tabindex');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fixSlickA11y);
  } else {
    fixSlickA11y();
  }
})();`,
      notes: ['Requires jQuery (Slick dependency)', 'Hooks into afterChange event']
    },
    swiper: {
      code: `/**
 * Swiper Accessibility Fix
 */
const swiper = new Swiper('.swiper-container', {
  // ... existing config ...

  a11y: {
    enabled: true,
    prevSlideMessage: 'Previous slide',
    nextSlideMessage: 'Next slide',
    firstSlideMessage: 'This is the first slide',
    lastSlideMessage: 'This is the last slide',
    paginationBulletMessage: 'Go to slide {{index}}'
  },

  on: {
    slideChange: function() {
      // Hide focusable elements in non-active slides
      this.slides.forEach((slide, index) => {
        const isActive = index === this.activeIndex;
        slide.querySelectorAll('a, button').forEach(el => {
          el.setAttribute('tabindex', isActive ? '0' : '-1');
        });
      });
    }
  }
});`,
      notes: ['Swiper has built-in a11y module', 'Enable with a11y: { enabled: true }']
    },
    bootstrap: {
      code: `/**
 * Bootstrap Carousel Accessibility Fix
 */
document.querySelectorAll('.carousel').forEach(carousel => {
  carousel.addEventListener('slid.bs.carousel', function() {
    // Update tabindex on slide change
    this.querySelectorAll('.carousel-item').forEach(item => {
      const isActive = item.classList.contains('active');
      item.querySelectorAll('a, button').forEach(el => {
        el.setAttribute('tabindex', isActive ? '0' : '-1');
      });
    });
  });

  // Initial fix
  carousel.querySelectorAll('.carousel-item:not(.active) a, .carousel-item:not(.active) button')
    .forEach(el => el.setAttribute('tabindex', '-1'));
});`,
      notes: ['Uses Bootstrap 5 event system', 'Adjust for Bootstrap 4 if needed']
    },
    'owl-carousel': {
      code: `/**
 * Owl Carousel Accessibility Fix
 */
$('.owl-carousel').on('changed.owl.carousel', function(event) {
  $(this).find('.owl-item').each(function() {
    const isActive = $(this).hasClass('active');
    $(this).find('a, button').attr('tabindex', isActive ? '0' : '-1');
  });
});`,
      notes: ['Requires jQuery', 'Uses Owl Carousel event system']
    },
    flickity: {
      code: `/**
 * Flickity Accessibility Fix
 */
const flkty = new Flickity('.carousel', {
  // ... existing config ...
  accessibility: true
});

flkty.on('change', function(index) {
  flkty.cells.forEach((cell, i) => {
    const isActive = i === index;
    cell.element.querySelectorAll('a, button').forEach(el => {
      el.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  });
});`,
      notes: ['Flickity has built-in accessibility option']
    },
    glide: {
      code: `/**
 * Glide.js Accessibility Fix
 */
const glide = new Glide('.glide').mount();

glide.on('run.after', function() {
  document.querySelectorAll('.glide__slide').forEach((slide, index) => {
    const isActive = index === glide.index;
    slide.querySelectorAll('a, button').forEach(el => {
      el.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  });
});`,
      notes: ['Uses Glide.js event system']
    },
    splide: {
      code: `/**
 * Splide Accessibility Fix
 */
const splide = new Splide('.splide', {
  // ... existing config ...
  accessibility: true
});

splide.on('moved', function(newIndex) {
  splide.Components.Slides.forEach((slide, index) => {
    const isActive = index === newIndex;
    slide.slide.querySelectorAll('a, button').forEach(el => {
      el.setAttribute('tabindex', isActive ? '0' : '-1');
    });
  });
});

splide.mount();`,
      notes: ['Splide has built-in accessibility support']
    },
    vanilla: {
      code: `/**
 * Vanilla JavaScript Carousel Accessibility Fix
 */
function fixCarouselA11y(carousel) {
  const slides = carousel.querySelectorAll('[data-slide]');
  const focusable = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  function updateFocusability() {
    slides.forEach(slide => {
      const isHidden = slide.getAttribute('aria-hidden') === 'true';
      slide.querySelectorAll(focusable).forEach(el => {
        el.setAttribute('tabindex', isHidden ? '-1' : '0');
      });
    });
  }

  // Watch for changes
  const observer = new MutationObserver(updateFocusability);
  slides.forEach(slide => {
    observer.observe(slide, { attributes: true, attributeFilter: ['aria-hidden'] });
  });

  updateFocusability();
}

document.querySelectorAll('.carousel').forEach(fixCarouselA11y);`,
      notes: ['No dependencies', 'Uses MutationObserver for automatic updates']
    },
    unknown: {
      code: `/**
 * Generic Carousel Accessibility Fix
 */
function fixCarouselA11y() {
  const hiddenContainers = document.querySelectorAll('[aria-hidden="true"]');
  const focusable = 'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

  hiddenContainers.forEach(container => {
    container.querySelectorAll(focusable).forEach(el => {
      el.setAttribute('tabindex', '-1');
    });
  });
}

// Run on load and after any dynamic content changes
fixCarouselA11y();`,
      notes: ['Generic solution for unknown frameworks', 'May need customization']
    }
  };

  const fix = fixes[framework.framework];

  return {
    violationId: 'aria-hidden-focus',
    wcagCriterion: '4.1.2',
    title: `${capitalizeFramework(framework.framework)} Carousel Accessibility Fix`,
    language: 'javascript',
    beforeCode: '// No accessibility handling',
    afterCode: fix.code,
    explanation: `Framework-specific fix for ${framework.framework} carousel. This script automatically manages tabindex on focusable elements within hidden slides.`,
    estimatedTime: '1 hour',
    notes: fix.notes,
    relatedCriteria: ['4.1.2 Name, Role, Value', '2.1.1 Keyboard', '2.4.3 Focus Order']
  };
}

/**
 * Generate color contrast remediation code
 */
export function generateColorContrastRemediation(
  violation: AccessibilityViolation,
  colorAnalysis?: ColorAnalysis
): RemediationCode[] {
  const codes: RemediationCode[] = [];

  const element = violation.elements[0];
  const selector = element.selector || '.element';

  codes.push({
    violationId: violation.id,
    wcagCriterion: violation.wcagCriterion,
    title: 'Fix Color Contrast',
    language: 'css',
    beforeCode: `${selector} {
  color: ${colorAnalysis?.foreground || '#999999'}; /* Contrast: ${colorAnalysis?.currentRatio || '< 4.5'}:1 - FAILS */
  background: ${colorAnalysis?.background || '#ffffff'};
}`,
    afterCode: `${selector} {
  color: ${colorAnalysis?.suggestedForeground || '#595959'}; /* Contrast: ${colorAnalysis?.newRatio || '7'}:1 - PASSES */
  background: ${colorAnalysis?.suggestedBackground || '#ffffff'};
}

/* Alternative: High contrast option */
${selector}--high-contrast {
  color: #000000; /* Contrast: 21:1 - WCAG AAA */
  background: #ffffff;
}`,
    explanation: 'Increase the contrast ratio between foreground (text) and background colors to meet WCAG requirements. AA requires 4.5:1 for normal text, AAA requires 7:1.',
    estimatedTime: '2 hours',
    notes: [
      'Test with WebAIM Contrast Checker',
      'Consider users with low vision and color blindness',
      'Check in different lighting conditions'
    ],
    relatedCriteria: ['1.4.3 Contrast (Minimum)', '1.4.6 Contrast (Enhanced)']
  });

  // Add CSS custom properties for consistent theming
  codes.push({
    violationId: violation.id,
    wcagCriterion: violation.wcagCriterion,
    title: 'Accessible Color System (CSS Custom Properties)',
    language: 'css',
    beforeCode: '/* No color system defined */',
    afterCode: `:root {
  /* Primary Colors - WCAG AAA on white */
  --color-text-primary: #000000;     /* 21:1 on white */
  --color-text-secondary: #333333;   /* 12.6:1 on white */
  --color-text-muted: #595959;       /* 7:1 on white - AAA minimum */

  /* Background Colors */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f5f5f5;

  /* Interactive Colors - WCAG AA on white */
  --color-link: #0d47a1;             /* 8.5:1 on white */
  --color-link-hover: #1565c0;       /* 6.4:1 on white */

  /* Status Colors - WCAG AA on white */
  --color-error: #b71c1c;            /* 7.8:1 on white */
  --color-success: #1b5e20;          /* 8.2:1 on white */
  --color-warning: #e65100;          /* 4.6:1 on white - AA only */

  /* NEVER use for text (decorative only) */
  --color-decorative: #999999;       /* 2.8:1 - FAILS */
}

/* Usage example */
.text-primary { color: var(--color-text-primary); }
.text-secondary { color: var(--color-text-secondary); }
.text-muted { color: var(--color-text-muted); }`,
    explanation: 'Define a consistent color system using CSS custom properties. This ensures all text meets WCAG contrast requirements throughout the application.',
    estimatedTime: '4 hours',
    notes: [
      'Document which colors are safe for text vs decorative use',
      'Include in design system documentation',
      'Test all color combinations'
    ]
  });

  return codes;
}

/**
 * Generate Playwright test for a violation
 */
export function generatePlaywrightTest(
  violation: AccessibilityViolation,
  url: string
): RemediationCode {
  const testName = violation.id.replace(/-/g, ' ');

  return {
    violationId: violation.id,
    wcagCriterion: violation.wcagCriterion,
    title: `Playwright Test: ${testName}`,
    language: 'typescript',
    beforeCode: '// No automated test exists',
    afterCode: `import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility: ${testName}', () => {
  test('should have no ${violation.id} violations', async ({ page }) => {
    await page.goto('${url}');

    const results = await new AxeBuilder({ page })
      .withRules(['${violation.id}'])
      .analyze();

    // Log violations for debugging
    if (results.violations.length > 0) {
      console.log('Violations found:');
      results.violations.forEach(v => {
        console.log(\`- \${v.id}: \${v.nodes.length} elements\`);
        v.nodes.forEach(n => console.log(\`  \${n.html.slice(0, 100)}\`));
      });
    }

    expect(results.violations).toHaveLength(0);
  });
${violation.id === 'video-caption' ? `
  test('videos should have caption tracks', async ({ page }) => {
    await page.goto('${url}');

    const videos = await page.locator('video').all();

    for (const video of videos) {
      const captionTrack = video.locator('track[kind="captions"]');
      await expect(captionTrack).toHaveCount(1, {
        message: 'Video must have a caption track'
      });
    }
  });` : ''}
${violation.id.includes('aria-hidden') ? `
  test('no focus should be possible on aria-hidden elements', async ({ page }) => {
    await page.goto('${url}');

    // Tab through the page
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('Tab');

      // Check if focused element is inside aria-hidden container
      const isHiddenFocused = await page.evaluate(() => {
        const focused = document.activeElement;
        return focused?.closest('[aria-hidden="true"]') !== null;
      });

      expect(isHiddenFocused).toBe(false);
    }
  });` : ''}
});`,
    explanation: 'Automated Playwright test using axe-core to verify the accessibility violation is fixed. Run this test in CI/CD to prevent regressions.',
    estimatedTime: '30 minutes',
    notes: [
      'Add to your CI/CD pipeline',
      'Run before each deployment',
      'Requires @axe-core/playwright package'
    ]
  };
}

/**
 * Generate complete CSS utilities for accessibility
 */
export function generateAccessibilityCSSUtilities(): RemediationCode {
  return {
    violationId: 'utilities',
    wcagCriterion: 'Multiple',
    title: 'Accessibility CSS Utilities',
    language: 'css',
    beforeCode: '/* No accessibility utilities */',
    afterCode: `/**
 * Accessibility CSS Utilities
 * Include in your global stylesheet
 */

/* ==========================================================================
   Screen Reader Only (Visually Hidden)
   ========================================================================== */

.visually-hidden,
.sr-only {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
}

/* Focusable variant for skip links */
.visually-hidden.focusable:focus,
.sr-only.focusable:focus {
  position: static !important;
  width: auto !important;
  height: auto !important;
  overflow: visible !important;
  clip: auto !important;
  white-space: normal !important;
}

/* ==========================================================================
   Skip Link
   ========================================================================== */

.skip-link {
  position: absolute;
  top: -100%;
  left: 50%;
  transform: translateX(-50%);
  background: #000;
  color: #fff;
  padding: 1rem 2rem;
  text-decoration: none;
  font-weight: bold;
  z-index: 10000;
  transition: top 0.2s ease;
  border-radius: 0 0 4px 4px;
}

.skip-link:focus {
  top: 0;
}

/* ==========================================================================
   Focus Indicators
   ========================================================================== */

/* High-visibility focus for all interactive elements */
:focus-visible {
  outline: 3px solid #0066cc !important;
  outline-offset: 2px !important;
}

/* Remove default outline, keep focus-visible */
:focus:not(:focus-visible) {
  outline: none;
}

/* Focus within for complex components */
.focus-within:focus-within {
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}

/* ==========================================================================
   Reduced Motion
   ========================================================================== */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* ==========================================================================
   High Contrast Mode Support
   ========================================================================== */

@media (prefers-contrast: high) {
  :root {
    --color-text: #000;
    --color-bg: #fff;
    --color-link: #0000EE;
    --color-border: #000;
  }

  * {
    border-color: var(--color-border) !important;
  }
}

/* ==========================================================================
   Print Styles for Accessibility
   ========================================================================== */

@media print {
  .visually-hidden,
  .sr-only {
    position: static !important;
    width: auto !important;
    height: auto !important;
    overflow: visible !important;
    clip: auto !important;
  }

  a[href]::after {
    content: " (" attr(href) ")";
  }
}`,
    explanation: 'Reusable CSS utilities for common accessibility patterns. Include this in your global stylesheet.',
    estimatedTime: '1 hour',
    notes: [
      'Add skip link HTML: <a href="#main-content" class="skip-link">Skip to content</a>',
      'Use .visually-hidden for screen reader only content',
      'Supports prefers-reduced-motion and prefers-contrast'
    ]
  };
}

/**
 * Get human-readable language name
 */
function getLanguageName(code: string): string {
  const languages: Record<string, string> = {
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
    it: 'Italiano',
    pt: 'Português',
    nl: 'Nederlands',
    pl: 'Polski',
    ru: 'Русский',
    zh: '中文',
    ja: '日本語',
    ko: '한국어'
  };
  return languages[code] || code.toUpperCase();
}

/**
 * Capitalize framework name
 */
function capitalizeFramework(framework: UIFramework): string {
  const names: Record<UIFramework, string> = {
    slick: 'Slick',
    swiper: 'Swiper',
    bootstrap: 'Bootstrap',
    'owl-carousel': 'Owl Carousel',
    flickity: 'Flickity',
    glide: 'Glide.js',
    splide: 'Splide',
    vanilla: 'Vanilla JS',
    unknown: 'Generic'
  };
  return names[framework];
}

/**
 * Generate all remediation codes for a violation
 */
export function generateRemediationCodes(
  violation: AccessibilityViolation,
  options: {
    url?: string;
    pageLanguage?: string;
    pageTitle?: string;
    framework?: FrameworkDetection;
    colorAnalysis?: ColorAnalysis;
  } = {}
): RemediationCode[] {
  const codes: RemediationCode[] = [];
  const { url = '', pageLanguage = 'en', pageTitle = '', framework, colorAnalysis } = options;

  // Route to appropriate generator based on violation type
  if (violation.id === 'video-caption' || violation.id.includes('video') || violation.wcagCriterion?.includes('1.2')) {
    codes.push(...generateVideoCaptionRemediation(violation, pageLanguage, pageTitle));
  }

  if (violation.id.includes('aria-hidden') || violation.id.includes('focus')) {
    const detectedFramework = framework || detectFramework(
      violation.elements.map(e => e.html).join(' '),
      violation.elements.map(e => e.selector)
    );
    codes.push(...generateAriaHiddenFocusRemediation(violation, detectedFramework));
  }

  if (violation.id.includes('color-contrast') || violation.id.includes('contrast')) {
    codes.push(...generateColorContrastRemediation(violation, colorAnalysis));
  }

  // Always generate a Playwright test
  if (url) {
    codes.push(generatePlaywrightTest(violation, url));
  }

  return codes;
}

export default {
  detectFramework,
  analyzeColors,
  generateRemediationCodes,
  generateVideoCaptionRemediation,
  generateAriaHiddenFocusRemediation,
  generateColorContrastRemediation,
  generatePlaywrightTest,
  generateAccessibilityCSSUtilities
};

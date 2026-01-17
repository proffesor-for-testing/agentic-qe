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
  const pageContext = { url, pageLanguage, pageTitle };

  // Route to appropriate generator based on violation type
  const violationId = violation.id.toLowerCase();
  const description = violation.description.toLowerCase();

  // Video caption violations
  if (violationId.includes('video') || violation.wcagCriterion?.includes('1.2')) {
    codes.push(...generateVideoCaptionRemediation(violation, pageLanguage, pageTitle));
  }

  // Image alt text violations
  if (violationId.includes('image-alt') || violationId.includes('alt') ||
      description.includes('alternative text') || description.includes('alt text') ||
      description.includes('<img>') || violation.wcagCriterion === '1.1.1') {
    codes.push(...generateImageAltRemediation(violation, pageContext));
  }

  // Link name violations
  if (violationId.includes('link-name') || violationId.includes('link') ||
      description.includes('link') && description.includes('text') ||
      description.includes('discernible text') ||
      violation.wcagCriterion === '2.4.4') {
    codes.push(...generateLinkNameRemediation(violation, pageContext));
  }

  // List structure violations
  if (violationId.includes('list') ||
      description.includes('<ul>') || description.includes('<ol>') ||
      description.includes('<li>') || description.includes('list') ||
      violation.wcagCriterion === '1.3.1' && description.includes('list')) {
    codes.push(...generateListStructureRemediation(violation));
  }

  // Touch target size violations
  if (violationId.includes('target-size') || violationId.includes('touch') ||
      description.includes('touch target') || description.includes('target size') ||
      violation.wcagCriterion === '2.5.8') {
    codes.push(...generateTouchTargetRemediation(violation));
  }

  // ARIA hidden focus violations
  if (violationId.includes('aria-hidden') || violationId.includes('focus')) {
    const detectedFramework = framework || detectFramework(
      violation.elements.map(e => e.html).join(' '),
      violation.elements.map(e => e.selector)
    );
    codes.push(...generateAriaHiddenFocusRemediation(violation, detectedFramework));
  }

  // Color contrast violations
  if (violationId.includes('color-contrast') || violationId.includes('contrast')) {
    codes.push(...generateColorContrastRemediation(violation, colorAnalysis));
  }

  // Always generate a Playwright test
  if (url) {
    codes.push(generatePlaywrightTest(violation, url));
  }

  return codes;
}

/**
 * Generate image alt text remediation with context-specific suggestions
 */
export function generateImageAltRemediation(
  violation: AccessibilityViolation,
  pageContext: { url?: string; pageTitle?: string; pageLanguage?: string } = {}
): RemediationCode[] {
  const codes: RemediationCode[] = [];
  const { url = '', pageTitle = '', pageLanguage = 'en' } = pageContext;

  // Extract domain/brand context from URL
  let brandContext = '';
  if (url) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      brandContext = domain.split('.')[0];
      // Capitalize first letter
      brandContext = brandContext.charAt(0).toUpperCase() + brandContext.slice(1);
    } catch { /* ignore */ }
  }

  for (const element of violation.elements) {
    const html = element.html || '<img src="image.jpg">';
    const selector = element.selector || 'img';
    const context = element.context;

    // Extract image src
    const srcMatch = html.match(/src="([^"]+)"/);
    const src = srcMatch ? srcMatch[1] : '';

    // Extract parent link context
    let parentLinkText = '';
    let parentLinkHref = '';

    // Check for parent link in selector or HTML
    const ariaLabelMatch = selector.match(/aria-label=["']([^"']+)["']/i) ||
                          html.match(/aria-label=["']([^"']+)["']/i);
    if (ariaLabelMatch) {
      parentLinkText = ariaLabelMatch[1];
    }

    const hrefMatch = html.match(/href="([^"]+)"/);
    if (hrefMatch) {
      parentLinkHref = hrefMatch[1];
    }

    // Generate context-specific alt text
    let specificAlt = '';
    let rationale = '';

    // Priority 1: Use parent link context
    if (parentLinkText) {
      specificAlt = `Visual representation of: ${parentLinkText}`;
      rationale = `Parent link says "${parentLinkText}". Alt text should describe what the image shows in this context.`;
    }
    // Priority 2: Analyze image filename
    else if (src) {
      const filename = src.split('/').pop()?.split('?')[0] || '';
      const cleanName = filename
        .replace(/\.(jpg|jpeg|png|svg|webp|gif|avif)$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\d{4,}/g, '') // Remove long numbers
        .trim();

      // Check for common patterns in filename
      if (src.toLowerCase().includes('logo')) {
        specificAlt = `${brandContext || 'Company'} logo`;
        rationale = 'Image URL contains "logo" - this appears to be a brand logo.';
      } else if (src.toLowerCase().includes('hero') || src.toLowerCase().includes('banner')) {
        specificAlt = `${brandContext || 'Website'} hero banner - [describe the main subject and action]`;
        rationale = 'This is a hero/banner image. Describe the key visual message it conveys.';
      } else if (src.toLowerCase().includes('product') || src.toLowerCase().includes('item')) {
        specificAlt = `${brandContext || 'Product'} - [product name and key features]`;
        rationale = 'This appears to be a product image. Include product name and distinguishing features.';
      } else if (src.toLowerCase().includes('team') || src.toLowerCase().includes('person') || src.toLowerCase().includes('portrait')) {
        specificAlt = `[Person's name and role/title]`;
        rationale = 'This appears to be a person/team photo. Include the person\'s name and role.';
      } else if (cleanName && cleanName.length > 3) {
        specificAlt = cleanName;
        rationale = `Inferred from filename "${filename}". Verify this accurately describes the image.`;
      } else {
        specificAlt = `${brandContext ? brandContext + ' - ' : ''}[Describe what this image shows]`;
        rationale = 'Unable to infer context. Manually describe what the image depicts.';
      }
    }
    // Priority 3: Use surrounding text context
    else if (context?.surroundingText) {
      const contextText = context.surroundingText.slice(0, 50).trim();
      specificAlt = `Image related to: ${contextText}`;
      rationale = `Based on surrounding text. Verify this matches the actual image content.`;
    }
    // Fallback
    else {
      specificAlt = `${brandContext ? brandContext + ' - ' : ''}[Describe the image content and purpose]`;
      rationale = 'No context available. Manually describe what the image shows.';
    }

    codes.push({
      violationId: violation.id,
      wcagCriterion: violation.wcagCriterion || '1.1.1',
      title: 'Add Descriptive Alt Text to Image',
      language: 'html',
      beforeCode: html.slice(0, 200) + (html.length > 200 ? '...' : ''),
      afterCode: `<!-- Context: ${rationale} -->
<img src="${src || 'image.jpg'}"
     alt="${specificAlt}"
     loading="lazy">

<!-- If this is a decorative image with no informational content: -->
<img src="${src || 'image.jpg'}"
     alt=""
     role="presentation">`,
      explanation: rationale,
      estimatedTime: '5 minutes per image',
      notes: [
        'Alt text should describe what the image shows, not be a caption',
        'For decorative images, use alt="" (empty string)',
        'Keep alt text under 125 characters for screen reader compatibility',
        `If image is inside a link, alt should describe the link destination`
      ],
      relatedCriteria: ['1.1.1 Non-text Content']
    });
  }

  return codes;
}

/**
 * Generate link name remediation with context-specific aria-labels
 */
export function generateLinkNameRemediation(
  violation: AccessibilityViolation,
  pageContext: { url?: string; pageTitle?: string; pageLanguage?: string } = {}
): RemediationCode[] {
  const codes: RemediationCode[] = [];
  const { url = '', pageTitle = '', pageLanguage = 'en' } = pageContext;

  // Extract domain for brand context
  let brandContext = '';
  if (url) {
    try {
      const urlObj = new URL(url);
      brandContext = urlObj.hostname.replace('www.', '').split('.')[0];
      brandContext = brandContext.charAt(0).toUpperCase() + brandContext.slice(1);
    } catch { /* ignore */ }
  }

  for (const element of violation.elements) {
    const html = element.html || '<a href="#">Link</a>';
    const selector = element.selector || 'a';
    const context = element.context;

    // Extract link href
    const hrefMatch = html.match(/href="([^"]+)"/);
    const href = hrefMatch ? hrefMatch[1] : '#';

    // Extract existing title (often empty)
    const titleMatch = html.match(/title="([^"]*)"/);
    const existingTitle = titleMatch ? titleMatch[1] : '';

    // Generate context-specific aria-label
    let specificLabel = '';
    let rationale = '';

    // Priority 1: Analyze href for destination context
    if (href && href !== '#') {
      const hrefLower = href.toLowerCase();

      // Product/category pages
      if (hrefLower.includes('/produkt') || hrefLower.includes('/product')) {
        const productSlug = href.split('/').filter(Boolean).pop() || '';
        const productName = productSlug.replace(/-/g, ' ').replace(/\..*$/, '');
        specificLabel = `View ${productName || 'product'} details`;
        rationale = `Link goes to product page: ${href}`;
      }
      // Solution/service pages
      else if (hrefLower.includes('/lösung') || hrefLower.includes('/solution') || hrefLower.includes('/service')) {
        const solutionSlug = href.split('/').filter(Boolean).pop() || '';
        const solutionName = solutionSlug.replace(/-/g, ' ').replace(/\..*$/, '');
        specificLabel = `Learn about ${solutionName || 'our solutions'}`;
        rationale = `Link goes to solutions/services page: ${href}`;
      }
      // About pages
      else if (hrefLower.includes('/about') || hrefLower.includes('/über') || hrefLower.includes('/ueber')) {
        specificLabel = `Learn about ${brandContext || 'us'}`;
        rationale = `Link goes to about page: ${href}`;
      }
      // Contact pages
      else if (hrefLower.includes('/contact') || hrefLower.includes('/kontakt')) {
        specificLabel = `Contact ${brandContext || 'us'}`;
        rationale = `Link goes to contact page: ${href}`;
      }
      // News/blog pages
      else if (hrefLower.includes('/news') || hrefLower.includes('/blog') || hrefLower.includes('/artikel') || hrefLower.includes('/article')) {
        const articleSlug = href.split('/').filter(Boolean).pop() || '';
        const articleTitle = articleSlug.replace(/-/g, ' ').replace(/\..*$/, '');
        specificLabel = `Read: ${articleTitle || 'news article'}`;
        rationale = `Link goes to news/article page: ${href}`;
      }
      // Career pages
      else if (hrefLower.includes('/career') || hrefLower.includes('/karriere') || hrefLower.includes('/job')) {
        specificLabel = `Explore careers at ${brandContext || 'our company'}`;
        rationale = `Link goes to careers page: ${href}`;
      }
      // Home page
      else if (hrefLower === '/' || hrefLower.includes('/home')) {
        specificLabel = `Go to ${brandContext || 'website'} homepage`;
        rationale = `Link goes to homepage: ${href}`;
      }
      // Generic page - extract from path
      else {
        const pathParts = href.split('/').filter(Boolean);
        const lastPart = pathParts[pathParts.length - 1] || '';
        const pageName = lastPart.replace(/-/g, ' ').replace(/\..*$/, '');
        if (pageName && pageName.length > 2) {
          specificLabel = `Go to ${pageName}`;
          rationale = `Link destination inferred from URL path: ${href}`;
        } else {
          specificLabel = `[Describe where this link goes]`;
          rationale = `Could not determine link purpose from URL: ${href}`;
        }
      }
    }
    // Priority 2: Use surrounding context
    else if (context?.surroundingText) {
      const contextText = context.surroundingText.slice(0, 50).trim();
      specificLabel = `More about ${contextText}`;
      rationale = `Based on surrounding text. Verify this matches the link destination.`;
    }
    // Fallback
    else {
      specificLabel = `[Describe the link destination and purpose]`;
      rationale = 'No context available. Manually describe where this link goes.';
    }

    // Handle German language context
    if (pageLanguage === 'de' && specificLabel.startsWith('[')) {
      specificLabel = `[Beschreiben Sie das Linkziel]`;
    }

    codes.push({
      violationId: violation.id,
      wcagCriterion: violation.wcagCriterion || '2.4.4',
      title: 'Add Accessible Name to Link',
      language: 'html',
      beforeCode: html.slice(0, 200) + (html.length > 200 ? '...' : ''),
      afterCode: `<!-- ${rationale} -->
<a href="${href}"
   aria-label="${specificLabel}">
  <!-- Existing content (icon, image, etc.) -->
</a>

<!-- Alternative: Add visually hidden text -->
<a href="${href}">
  <span class="visually-hidden">${specificLabel}</span>
  <!-- Existing visual content -->
</a>`,
      explanation: rationale,
      estimatedTime: '2 minutes per link',
      notes: [
        'aria-label should describe where the link goes, not just "click here"',
        'For links with images, the aria-label should be on the link, not the image',
        'Links should make sense out of context (imagine a list of all links on the page)',
        `Current href: ${href}`
      ],
      relatedCriteria: ['2.4.4 Link Purpose (In Context)', '2.4.9 Link Purpose (Link Only)']
    });
  }

  return codes;
}

/**
 * Generate list structure remediation code
 */
export function generateListStructureRemediation(
  violation: AccessibilityViolation
): RemediationCode[] {
  const codes: RemediationCode[] = [];

  for (const element of violation.elements) {
    const html = element.html || '<ul><div>Invalid</div></ul>';
    const selector = element.selector || 'ul';

    // Detect what type of invalid content is present
    const hasDiv = html.includes('<div');
    const hasSpan = html.includes('<span');
    const isNavigation = selector.includes('nav') || html.includes('nav');

    codes.push({
      violationId: violation.id,
      wcagCriterion: violation.wcagCriterion || '1.3.1',
      title: 'Fix List Structure - Only <li> Children Allowed',
      language: 'html',
      beforeCode: `<!-- INVALID: <ul> can only contain <li>, <script>, or <template> -->
${html.slice(0, 300)}${html.length > 300 ? '...' : ''}`,
      afterCode: `<!-- OPTION 1: Move wrapper outside the list -->
<div class="container">
  <ul${isNavigation ? ' role="menubar"' : ''}>
    <li>Item 1</li>
    <li>Item 2</li>
    <li>Item 3</li>
  </ul>
</div>

<!-- OPTION 2: Move styling div inside each <li> -->
<ul${isNavigation ? ' role="menubar"' : ''}>
  <li>
    <div class="item-wrapper">Item 1</div>
  </li>
  <li>
    <div class="item-wrapper">Item 2</div>
  </li>
</ul>

<!-- OPTION 3: For carousels - use proper slide structure -->
<div class="carousel-wrapper" role="group" aria-label="Image carousel">
  <ul class="slides" aria-live="polite">
    <li class="slide" aria-hidden="false">Slide 1</li>
    <li class="slide" aria-hidden="true">Slide 2</li>
  </ul>
</div>`,
      explanation: 'HTML specification requires <ul> and <ol> to only contain <li> elements as direct children. Wrapper divs must be placed outside the list or inside each list item.',
      estimatedTime: '30 minutes',
      notes: [
        'Screen readers announce "list with X items" - invalid structure breaks this',
        'For navigation menus, consider using role="menubar" and role="menuitem"',
        'For carousels, ensure slide items are proper <li> elements'
      ],
      relatedCriteria: ['1.3.1 Info and Relationships', '4.1.1 Parsing']
    });
  }

  return codes;
}

/**
 * Generate touch target size remediation code
 */
export function generateTouchTargetRemediation(
  violation: AccessibilityViolation
): RemediationCode[] {
  const codes: RemediationCode[] = [];

  for (const element of violation.elements) {
    const html = element.html || '<button>Small</button>';
    const selector = element.selector || 'button';

    // Detect element type
    const isPagination = selector.includes('pagination') || html.includes('pagination');
    const isIcon = html.includes('icon') || html.includes('svg') || html.includes('<i ');

    codes.push({
      violationId: violation.id,
      wcagCriterion: violation.wcagCriterion || '2.5.8',
      title: 'Increase Touch Target Size to Minimum 24×24px',
      language: 'css',
      beforeCode: `/* Current: Touch target too small (< 24px) */
${selector} {
  /* Likely: width/height not set, padding too small */
  padding: 2px;
}`,
      afterCode: `/* WCAG 2.2 Level AA: Minimum 24×24px touch target */
${selector} {
  min-width: 24px;
  min-height: 24px;
  padding: 8px; /* Ensures adequate size */

  /* For better mobile UX, use 44×44px (iOS) or 48×48px (Material) */
}

/* RECOMMENDED: Best practice touch targets */
${selector} {
  min-width: 44px;
  min-height: 44px;
  padding: 12px;

  /* Ensure spacing between adjacent targets */
  margin: 4px;
}

${isPagination ? `
/* Pagination-specific fix: Keep visual dot small, expand hit area */
.pagination-bullet {
  position: relative;
  width: 44px;
  height: 44px;
  margin: 0 8px;
  background: transparent;
}

.pagination-bullet::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 12px;  /* Visual size */
  height: 12px;
  background: #999;
  border-radius: 50%;
}

.pagination-bullet.active::before {
  background: #000;
}` : ''}

/* Responsive: Larger targets on touch devices */
@media (pointer: coarse) {
  ${selector} {
    min-width: 48px;
    min-height: 48px;
  }
}`,
      explanation: 'WCAG 2.2 Level AA requires interactive elements to be at least 24×24 CSS pixels. This helps users with motor impairments and improves mobile usability.',
      estimatedTime: '1 hour',
      notes: [
        'iOS Human Interface Guidelines recommend 44×44pt minimum',
        'Material Design recommends 48×48dp minimum',
        'Ensure adequate spacing (8px+) between adjacent targets',
        'Test on actual mobile devices with different finger sizes'
      ],
      relatedCriteria: ['2.5.8 Target Size (Minimum)']
    });
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
  generateImageAltRemediation,
  generateLinkNameRemediation,
  generateListStructureRemediation,
  generateTouchTargetRemediation,
  generatePlaywrightTest,
  generateAccessibilityCSSUtilities
};

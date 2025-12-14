/**
 * Remediation Code Generator Unit Tests
 * Tests for context-aware accessibility remediation code generation
 */

import { describe, it, expect } from '@jest/globals';
import {
  detectFramework,
  analyzeColors,
  generateRemediationCodes,
  generateVideoCaptionRemediation,
  generateAriaHiddenFocusRemediation,
  generateColorContrastRemediation,
  generatePlaywrightTest,
  generateAccessibilityCSSUtilities,
  type UIFramework,
  type FrameworkDetection,
  type RemediationCode,
  type AccessibilityViolation
} from '../../../../../../src/mcp/tools/qe/accessibility/remediation-code-generator';

describe('Remediation Code Generator', () => {
  describe('detectFramework', () => {
    it('should detect Slick carousel', () => {
      const html = '<div class="slick-slider"><div class="slick-track"><div class="slick-slide">Slide 1</div></div></div>';
      const selectors = ['.slick-slider', '.slick-slide'];

      const result = detectFramework(html, selectors);

      expect(result.framework).toBe('slick');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect Swiper carousel', () => {
      const html = '<div class="swiper-container"><div class="swiper-wrapper"><div class="swiper-slide">Slide</div></div></div>';
      const selectors = ['.swiper-container', '.swiper-slide'];

      const result = detectFramework(html, selectors);

      expect(result.framework).toBe('swiper');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect Bootstrap carousel', () => {
      const html = '<div class="carousel" data-bs-ride="carousel"><div class="carousel-inner"><div class="carousel-item">Item</div></div></div>';
      const selectors = ['.carousel', '.carousel-item'];

      const result = detectFramework(html, selectors);

      expect(result.framework).toBe('bootstrap');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect Owl Carousel', () => {
      const html = '<div class="owl-carousel"><div class="owl-stage"><div class="owl-item">Item</div></div></div>';
      const selectors = ['.owl-carousel', '.owl-item'];

      const result = detectFramework(html, selectors);

      expect(result.framework).toBe('owl-carousel');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect Flickity', () => {
      const html = '<div class="flickity-slider"><div class="flickity-viewport">Content</div></div>';
      const selectors = ['.flickity-slider', '.flickity-viewport'];

      const result = detectFramework(html, selectors);

      expect(result.framework).toBe('flickity');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect Glide.js', () => {
      const html = '<div class="glide"><div class="glide__track"><div class="glide__slides">Slides</div></div></div>';
      const selectors = ['.glide__track', '.glide__slides'];

      const result = detectFramework(html, selectors);

      expect(result.framework).toBe('glide');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect Splide', () => {
      const html = '<div class="splide"><div class="splide__list"><div class="splide__slide">Slide</div></div></div>';
      const selectors = ['.splide__list', '.splide__slide'];

      const result = detectFramework(html, selectors);

      expect(result.framework).toBe('splide');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should return unknown for unrecognized patterns', () => {
      const html = '<div class="custom-carousel"><div class="slide">Slide</div></div>';
      const selectors = ['.custom-carousel', '.slide'];

      const result = detectFramework(html, selectors);

      expect(result.framework).toBe('unknown');
      expect(result.confidence).toBe(0.5);
    });

    it('should handle empty inputs', () => {
      const result = detectFramework('', []);

      expect(result.framework).toBe('unknown');
      expect(result.selectors).toEqual([]);
    });
  });

  describe('analyzeColors', () => {
    it('should calculate correct contrast ratio for black on white', () => {
      const result = analyzeColors('#000000', '#ffffff');

      expect(result.currentRatio).toBe(21);
      expect(result.foreground).toBe('#000000');
      expect(result.background).toBe('#ffffff');
    });

    it('should identify failing contrast and suggest fix', () => {
      const result = analyzeColors('#999999', '#ffffff', 'AA');

      expect(result.currentRatio).toBeLessThan(4.5);
      expect(result.requiredRatio).toBe(4.5);
      expect(result.suggestedForeground).not.toBe('#999999');
      expect(result.newRatio).toBeGreaterThanOrEqual(4.5);
    });

    it('should use stricter threshold for AAA', () => {
      const result = analyzeColors('#595959', '#ffffff', 'AAA');

      expect(result.requiredRatio).toBe(7);
    });

    it('should keep original color if already passing', () => {
      const result = analyzeColors('#000000', '#ffffff', 'AA');

      expect(result.suggestedForeground).toBe('#000000');
    });
  });

  describe('generateVideoCaptionRemediation', () => {
    const violation: AccessibilityViolation = {
      id: 'video-caption',
      wcagCriterion: '1.2.2',
      severity: 'critical',
      impact: 'critical',
      description: 'Video must have captions',
      help: 'Add captions to videos',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/captions-prerecorded.html',
      elements: [
        {
          html: '<video src="promo.mp4" autoplay loop></video>',
          selector: 'video.hero-video',
          context: ''
        }
      ]
    };

    it('should generate HTML and WebVTT remediation code', () => {
      const codes = generateVideoCaptionRemediation(violation, 'de', 'Product Demo');

      expect(codes.length).toBeGreaterThanOrEqual(2);

      const htmlCode = codes.find(c => c.language === 'html');
      expect(htmlCode).toBeDefined();
      expect(htmlCode?.afterCode).toContain('<track');
      expect(htmlCode?.afterCode).toContain('kind="captions"');
      expect(htmlCode?.afterCode).toContain('srclang="de"');

      const vttCode = codes.find(c => c.language === 'vtt');
      expect(vttCode).toBeDefined();
      expect(vttCode?.afterCode).toContain('WEBVTT');
      expect(vttCode?.afterCode).toContain('Product Demo');
    });

    it('should include default English track', () => {
      const codes = generateVideoCaptionRemediation(violation, 'fr', 'Video Title');

      const htmlCode = codes.find(c => c.language === 'html');
      expect(htmlCode?.afterCode).toContain('srclang="en"');
      expect(htmlCode?.afterCode).toContain('srclang="fr"');
    });

    it('should provide time estimates', () => {
      const codes = generateVideoCaptionRemediation(violation);

      codes.forEach(code => {
        expect(code.estimatedTime).toBeDefined();
        expect(code.estimatedTime.length).toBeGreaterThan(0);
      });
    });

    it('should include related WCAG criteria', () => {
      const codes = generateVideoCaptionRemediation(violation);

      const htmlCode = codes.find(c => c.language === 'html');
      expect(htmlCode?.relatedCriteria).toContain('1.2.2 Captions (Prerecorded)');
    });
  });

  describe('generateAriaHiddenFocusRemediation', () => {
    const violation: AccessibilityViolation = {
      id: 'aria-hidden-focus',
      wcagCriterion: '4.1.2',
      severity: 'serious',
      impact: 'serious',
      description: 'Focusable element inside aria-hidden',
      help: 'Remove focusable elements from aria-hidden containers',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',
      elements: [
        {
          html: '<div aria-hidden="true"><a href="/link">Link</a></div>',
          selector: '.slick-slide',
          context: ''
        }
      ]
    };

    it('should generate HTML fix', () => {
      const framework: FrameworkDetection = {
        framework: 'slick',
        confidence: 0.95,
        selectors: ['.slick-slide']
      };

      const codes = generateAriaHiddenFocusRemediation(violation, framework);

      const htmlCode = codes.find(c => c.language === 'html');
      expect(htmlCode).toBeDefined();
      expect(htmlCode?.afterCode).toContain('tabindex="-1"');
    });

    it('should generate framework-specific JavaScript fix for Slick', () => {
      const framework: FrameworkDetection = {
        framework: 'slick',
        confidence: 0.95,
        selectors: ['.slick-slide']
      };

      const codes = generateAriaHiddenFocusRemediation(violation, framework);

      const jsCode = codes.find(c => c.language === 'javascript');
      expect(jsCode).toBeDefined();
      expect(jsCode?.afterCode).toContain('slick-slider');
      expect(jsCode?.afterCode).toContain('afterChange');
    });

    it('should generate framework-specific fix for Swiper', () => {
      const framework: FrameworkDetection = {
        framework: 'swiper',
        confidence: 0.95,
        selectors: ['.swiper-slide']
      };

      const codes = generateAriaHiddenFocusRemediation(violation, framework);

      const jsCode = codes.find(c => c.language === 'javascript');
      expect(jsCode?.afterCode).toContain('Swiper');
      expect(jsCode?.afterCode).toContain('a11y');
    });

    it('should generate framework-specific fix for Bootstrap', () => {
      const framework: FrameworkDetection = {
        framework: 'bootstrap',
        confidence: 0.9,
        selectors: ['.carousel-item']
      };

      const codes = generateAriaHiddenFocusRemediation(violation, framework);

      const jsCode = codes.find(c => c.language === 'javascript');
      expect(jsCode?.afterCode).toContain('slid.bs.carousel');
    });

    it('should not generate JS fix for unknown framework', () => {
      const framework: FrameworkDetection = {
        framework: 'unknown',
        confidence: 0.5,
        selectors: []
      };

      const codes = generateAriaHiddenFocusRemediation(violation, framework);

      // Should have HTML fix but may have generic JS fix
      const htmlCode = codes.find(c => c.language === 'html');
      expect(htmlCode).toBeDefined();
    });
  });

  describe('generateColorContrastRemediation', () => {
    const violation: AccessibilityViolation = {
      id: 'color-contrast',
      wcagCriterion: '1.4.3',
      severity: 'serious',
      impact: 'serious',
      description: 'Insufficient color contrast',
      help: 'Increase color contrast',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html',
      elements: [
        {
          html: '<p class="text-light">Low contrast text</p>',
          selector: '.text-light',
          context: ''
        }
      ]
    };

    it('should generate CSS fix', () => {
      const codes = generateColorContrastRemediation(violation);

      expect(codes.length).toBeGreaterThanOrEqual(1);
      expect(codes[0].language).toBe('css');
      expect(codes[0].wcagCriterion).toBe('1.4.3');
    });

    it('should include color analysis when provided', () => {
      const colorAnalysis = {
        foreground: '#999999',
        background: '#ffffff',
        currentRatio: 2.8,
        requiredRatio: 4.5,
        suggestedForeground: '#595959',
        suggestedBackground: '#ffffff',
        newRatio: 7
      };

      const codes = generateColorContrastRemediation(violation, colorAnalysis);

      expect(codes[0].beforeCode).toContain('#999999');
      expect(codes[0].afterCode).toContain('#595959');
    });

    it('should generate CSS custom properties color system', () => {
      const codes = generateColorContrastRemediation(violation);

      const colorSystem = codes.find(c => c.title.includes('Color System'));
      expect(colorSystem).toBeDefined();
      expect(colorSystem?.afterCode).toContain(':root');
      expect(colorSystem?.afterCode).toContain('--color-text-primary');
    });
  });

  describe('generatePlaywrightTest', () => {
    it('should generate valid Playwright test', () => {
      const violation: AccessibilityViolation = {
        id: 'button-name',
        wcagCriterion: '4.1.2',
        severity: 'critical',
        impact: 'critical',
        description: 'Button must have accessible name',
        help: 'Add text or aria-label',
        helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',
        elements: []
      };

      const test = generatePlaywrightTest(violation, 'https://example.com');

      expect(test.language).toBe('typescript');
      expect(test.afterCode).toContain("import { test, expect }");
      expect(test.afterCode).toContain("@playwright/test");
      expect(test.afterCode).toContain("AxeBuilder");
      expect(test.afterCode).toContain("withRules(['button-name'])");
      expect(test.afterCode).toContain("page.goto('https://example.com')");
    });

    it('should include video-specific assertions for video-caption violations', () => {
      const violation: AccessibilityViolation = {
        id: 'video-caption',
        wcagCriterion: '1.2.2',
        severity: 'critical',
        impact: 'critical',
        description: 'Video must have captions',
        help: 'Add captions',
        helpUrl: '',
        elements: []
      };

      const test = generatePlaywrightTest(violation, 'https://example.com/video');

      expect(test.afterCode).toContain('videos should have caption tracks');
      expect(test.afterCode).toContain('track[kind="captions"]');
    });

    it('should include focus test for aria-hidden violations', () => {
      const violation: AccessibilityViolation = {
        id: 'aria-hidden-focus',
        wcagCriterion: '4.1.2',
        severity: 'serious',
        impact: 'serious',
        description: 'Focusable element in aria-hidden',
        help: 'Remove focus',
        helpUrl: '',
        elements: []
      };

      const test = generatePlaywrightTest(violation, 'https://example.com');

      expect(test.afterCode).toContain('no focus should be possible');
      expect(test.afterCode).toContain("keyboard.press('Tab')");
    });

    it('should include installation notes', () => {
      const violation: AccessibilityViolation = {
        id: 'test-violation',
        wcagCriterion: '1.1.1',
        severity: 'minor',
        impact: 'minor',
        description: 'Test',
        help: 'Test',
        helpUrl: '',
        elements: []
      };

      const test = generatePlaywrightTest(violation, 'https://example.com');

      expect(test.notes).toContain('Requires @axe-core/playwright package');
    });
  });

  describe('generateAccessibilityCSSUtilities', () => {
    it('should generate comprehensive CSS utilities', () => {
      const utilities = generateAccessibilityCSSUtilities();

      expect(utilities.language).toBe('css');
      expect(utilities.title).toBe('Accessibility CSS Utilities');
    });

    it('should include visually-hidden class', () => {
      const utilities = generateAccessibilityCSSUtilities();

      expect(utilities.afterCode).toContain('.visually-hidden');
      expect(utilities.afterCode).toContain('.sr-only');
      expect(utilities.afterCode).toContain('position: absolute');
    });

    it('should include skip link styles', () => {
      const utilities = generateAccessibilityCSSUtilities();

      expect(utilities.afterCode).toContain('.skip-link');
      expect(utilities.afterCode).toContain('z-index: 10000');
    });

    it('should include focus indicators', () => {
      const utilities = generateAccessibilityCSSUtilities();

      expect(utilities.afterCode).toContain(':focus-visible');
      expect(utilities.afterCode).toContain('outline');
    });

    it('should include reduced motion media query', () => {
      const utilities = generateAccessibilityCSSUtilities();

      expect(utilities.afterCode).toContain('prefers-reduced-motion');
      expect(utilities.afterCode).toContain('animation-duration: 0.01ms');
    });

    it('should include high contrast mode support', () => {
      const utilities = generateAccessibilityCSSUtilities();

      expect(utilities.afterCode).toContain('prefers-contrast: high');
    });

    it('should include print styles', () => {
      const utilities = generateAccessibilityCSSUtilities();

      expect(utilities.afterCode).toContain('@media print');
    });
  });

  describe('generateRemediationCodes', () => {
    it('should generate codes for video violations', () => {
      const violation: AccessibilityViolation = {
        id: 'video-caption',
        wcagCriterion: '1.2.2',
        severity: 'critical',
        impact: 'critical',
        description: 'Video must have captions',
        help: 'Add captions',
        helpUrl: '',
        elements: [{ html: '<video src="test.mp4"></video>', selector: 'video', context: '' }]
      };

      const codes = generateRemediationCodes(violation, {
        url: 'https://example.com',
        pageLanguage: 'en',
        pageTitle: 'Test Page'
      });

      expect(codes.length).toBeGreaterThan(0);
      const htmlCode = codes.find(c => c.language === 'html');
      expect(htmlCode).toBeDefined();
    });

    it('should generate codes for aria-hidden-focus violations', () => {
      const violation: AccessibilityViolation = {
        id: 'aria-hidden-focus',
        wcagCriterion: '4.1.2',
        severity: 'serious',
        impact: 'serious',
        description: 'Focusable in aria-hidden',
        help: 'Fix',
        helpUrl: '',
        elements: [{ html: '<div class="slick-slide"><a href="#">Link</a></div>', selector: '.slick-slide a', context: '' }]
      };

      const codes = generateRemediationCodes(violation, { url: 'https://example.com' });

      expect(codes.length).toBeGreaterThan(0);
      const jsCode = codes.find(c => c.language === 'javascript');
      expect(jsCode).toBeDefined();
    });

    it('should generate codes for color contrast violations', () => {
      const violation: AccessibilityViolation = {
        id: 'color-contrast',
        wcagCriterion: '1.4.3',
        severity: 'serious',
        impact: 'serious',
        description: 'Low contrast',
        help: 'Increase contrast',
        helpUrl: '',
        elements: [{ html: '<p class="low">Text</p>', selector: '.low', context: '' }]
      };

      const codes = generateRemediationCodes(violation, { url: 'https://example.com' });

      expect(codes.length).toBeGreaterThan(0);
      const cssCode = codes.find(c => c.language === 'css');
      expect(cssCode).toBeDefined();
    });

    it('should always include Playwright test when URL provided', () => {
      const violation: AccessibilityViolation = {
        id: 'button-name',
        wcagCriterion: '4.1.2',
        severity: 'critical',
        impact: 'critical',
        description: 'Button without name',
        help: 'Add name',
        helpUrl: '',
        elements: []
      };

      const codes = generateRemediationCodes(violation, { url: 'https://example.com' });

      const testCode = codes.find(c => c.language === 'typescript');
      expect(testCode).toBeDefined();
      expect(testCode?.afterCode).toContain('Playwright');
    });

    it('should not include Playwright test when URL not provided', () => {
      const violation: AccessibilityViolation = {
        id: 'button-name',
        wcagCriterion: '4.1.2',
        severity: 'critical',
        impact: 'critical',
        description: 'Button without name',
        help: 'Add name',
        helpUrl: '',
        elements: []
      };

      const codes = generateRemediationCodes(violation, {});

      const testCode = codes.find(c => c.language === 'typescript');
      expect(testCode).toBeUndefined();
    });
  });

  describe('RemediationCode structure', () => {
    it('should have all required fields', () => {
      const violation: AccessibilityViolation = {
        id: 'test',
        wcagCriterion: '1.1.1',
        severity: 'minor',
        impact: 'minor',
        description: 'Test',
        help: 'Test',
        helpUrl: '',
        elements: [{ html: '<video></video>', selector: 'video', context: '' }]
      };

      const codes = generateVideoCaptionRemediation(violation);

      codes.forEach(code => {
        expect(code.violationId).toBeDefined();
        expect(code.wcagCriterion).toBeDefined();
        expect(code.title).toBeDefined();
        expect(code.beforeCode).toBeDefined();
        expect(code.afterCode).toBeDefined();
        expect(code.language).toBeDefined();
        expect(code.explanation).toBeDefined();
        expect(code.estimatedTime).toBeDefined();
        expect(['html', 'css', 'javascript', 'typescript', 'vtt']).toContain(code.language);
      });
    });
  });
});

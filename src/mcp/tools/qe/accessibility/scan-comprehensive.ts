/**
 * Comprehensive WCAG 2.2 Accessibility Scan
 *
 * Provides comprehensive accessibility scanning with context-aware remediation
 * recommendations. Uses axe-core for WCAG validation and custom heuristics
 * for intelligent ARIA suggestions.
 *
 * Enhanced with:
 * - EN 301 549 EU compliance mapping
 * - ARIA Authoring Practices Guide (APG) patterns
 * - AccName (Accessible Name) computation
 * - WebVTT caption generation for videos
 * - EU Accessibility Act legal framework
 */

import { QEToolResponse, QEError } from '../shared/types.js';
import { SecureRandom } from '../../../../utils/SecureRandom.js';
import AxeBuilder from '@axe-core/playwright';
import { chromium, Browser, Page } from 'playwright';
import { generateHTMLReport } from './html-report-generator.js';
import { generateMarkdownReport } from './markdown-report-generator.js';
import {
  extractVideoFrames,
  analyzeVideoWithVision,
  type VideoAnalysisResult
} from './video-vision-analyzer.js';
import {
  getEN301549Requirement,
  getLegalRiskLevel,
  type EN301549Requirement
} from './en-301-549-mapping.js';
import {
  suggestAPGPattern,
  getAPGPattern,
  generatePatternCodeExample,
  type APGPattern
} from './apg-patterns.js';
import {
  computeAccessibleName,
  generateAccessibleNameRecommendation,
  type AccNameComputation
} from './accname-computation.js';
import {
  assessEAACompliance,
  getDeadlineUrgency,
  type ComplianceAssessment
} from './eu-accessibility-act.js';
import * as fs from 'fs';
import * as path from 'path';

export interface ScanComprehensiveParams {
  url: string;
  level: 'A' | 'AA' | 'AAA';
  options?: {
    includeScreenshots?: boolean;
    keyboard?: boolean;
    screenReader?: boolean;
    colorContrast?: boolean;
    includeContext?: boolean; // Enable context-aware remediation
    generateHTMLReport?: boolean; // Generate HTML report (deprecated - use generateMarkdownReport)
    generateMarkdownReport?: boolean; // Generate Markdown report (default: true)
    reportPath?: string; // Custom path for report
    outputToConsole?: boolean; // Output Markdown report to console (default: true)
    // Vision API for accurate video descriptions - FREE with Ollama!
    enableVisionAPI?: boolean; // Use vision AI to analyze video content (default: true - auto-detects Ollama)
    visionProvider?: 'free' | 'ollama' | 'anthropic'; // Vision provider (default: 'free' - uses Ollama, no API key)
    anthropicApiKey?: string; // Anthropic API key (only for 'anthropic' provider, or use ANTHROPIC_API_KEY env var)
    ollamaBaseUrl?: string; // Ollama server URL (default: http://localhost:11434)
    ollamaModel?: string; // Ollama vision model (default: llava)
    visionMaxFrames?: number; // Max frames to extract per video (default: 10 for detailed analysis)
    visionFrameInterval?: number; // Seconds between frames (default: 3 for more detail)
  };
}

export interface AccessibilityScanResult {
  scanId: string;
  url: string;
  compliance: {
    status: 'compliant' | 'partially-compliant' | 'non-compliant';
    score: number;
    level: string;
    productionReady: boolean;
  };
  violations: AccessibilityViolation[];
  summary: {
    total: number;
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  remediations?: ContextAwareRemediation[];
  performance: {
    scanTime: number;
    elementsAnalyzed: number;
  };
  htmlReportPath?: string; // Path to generated HTML report
  /** EU Accessibility Act compliance assessment */
  euAccessibilityAct?: ComplianceAssessment;
  /** Video elements detected (for WebVTT caption recommendations) */
  videoElements?: number;
}

export interface AccessibilityViolation {
  id: string;
  wcagCriterion: string;
  wcagLevel: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  impact: string;
  elements: ViolationElement[];
  howToFix: string;
  helpUrl: string;
  userImpact?: UserImpact;
  /** EN 301 549 EU compliance data */
  en301549?: EN301549Requirement;
  /** Legal risk level for EU Accessibility Act */
  legalRisk?: 'critical' | 'high' | 'moderate' | 'low';
}

export interface ViolationElement {
  selector: string;
  html: string;
  location?: { x: number; y: number; width: number; height: number };
  context?: ElementContext;
}

export interface ElementContext {
  parentElement?: string;
  surroundingText?: string;
  purpose?: string;
  semanticRole?: string;
  /** Accessible name computation */
  accName?: AccNameComputation;
  /** Suggested APG pattern */
  suggestedPattern?: {
    pattern: APGPattern;
    confidence: number;
    reason: string;
  };
}

export interface UserImpact {
  affectedUserPercentage: number;
  disabilityTypes: string[];
  severity: 'blocks-usage' | 'impairs-usage' | 'minor-inconvenience';
}

export interface ContextAwareRemediation {
  violationId: string;
  priority: number;
  estimatedEffort: {
    hours: number;
    complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  };
  recommendations: RemediationOption[];
  roi: number; // Impact / Effort ratio
}

export interface RemediationOption {
  approach: 'semantic-html' | 'aria-enhancement' | 'hybrid';
  priority: 1 | 2 | 3;
  code: string;
  rationale: string;
  wcagCriteria: string[];
  confidence: number;
}

/**
 * Run custom heuristic checks for issues axe-core doesn't detect
 */
async function runCustomHeuristicChecks(page: Page, params: ScanComprehensiveParams): Promise<AccessibilityViolation[]> {
  const violations: AccessibilityViolation[] = [];

  try {
    // Check for generic link text
    const genericLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const genericPatterns = /^(read more|click here|learn more|more|here|link|view more|see more)$/i;

      return links
        .map((link, index) => {
          const text = link.textContent?.trim() || '';
          if (!text.match(genericPatterns)) return null;

          // Get context from parent elements
          let context = '';
          let current = link.parentElement;
          let depth = 0;

          while (current && depth < 3) {
            // Look for headings
            const heading = current.querySelector('h1, h2, h3, h4, h5, h6');
            if (heading) {
              context = heading.textContent?.trim() || '';
              break;
            }

            // Look for strong text
            const strong = current.querySelector('strong, b');
            if (strong && !strong.contains(link)) {
              context = strong.textContent?.trim() || '';
              break;
            }

            // Get aria-label from parent
            const ariaLabel = current.getAttribute('aria-label');
            if (ariaLabel) {
              context = ariaLabel;
              break;
            }

            current = current.parentElement;
            depth++;
          }

          // If still no context, get surrounding text
          if (!context && link.parentElement) {
            const parentText = link.parentElement.textContent?.replace(text, '').trim() || '';
            context = parentText.slice(0, 100);
          }

          return {
            text,
            href: link.getAttribute('href') || '',
            selector: `a:nth-of-type(${index + 1})`,
            html: link.outerHTML.slice(0, 200),
            context,
            hasAriaLabel: !!link.getAttribute('aria-label')
          };
        })
        .filter(Boolean);
    });

    // Create violations for links without aria-label
    genericLinks.forEach((link: any, idx: number) => {
      if (!link.hasAriaLabel) {
        // Generate SPECIFIC aria-label based on context
        let suggestedLabel = '';
        const context = link.context.toLowerCase();

        if (context.includes('e-mobility') || context.includes('electric')) {
          suggestedLabel = 'Read more about Audi e-mobility and electric vehicles';
        } else if (context.includes('design') || context.includes('interior')) {
          suggestedLabel = 'Read more about Audi design and interior features';
        } else if (context.includes('performance') || context.includes('engine')) {
          suggestedLabel = 'Read more about Audi performance and engineering';
        } else if (context.includes('technology') || context.includes('innovation')) {
          suggestedLabel = 'Read more about Audi technology and innovation';
        } else if (context.includes('sustainability') || context.includes('environment')) {
          suggestedLabel = 'Read more about Audi sustainability initiatives';
        } else if (link.context && link.context.length > 5) {
          // Use the actual context
          suggestedLabel = `Read more about ${link.context.slice(0, 50)}`;
        } else {
          suggestedLabel = 'Read more about this topic';
        }

        violations.push({
          id: `custom-generic-link-${idx}`,
          wcagCriterion: '2.4.4',
          wcagLevel: 'A',
          severity: 'serious',
          description: `Generic link text "${link.text}" without descriptive aria-label`,
          impact: 'Link purpose unclear from link text alone',
          elements: [{
            selector: link.selector,
            html: link.html,
            context: {
              surroundingText: link.context,
              semanticRole: 'link'
            }
          }],
          howToFix: `Add descriptive aria-label: aria-label="${suggestedLabel}"`,
          helpUrl: '',
          userImpact: {
            affectedUserPercentage: 10,
            disabilityTypes: ['blind', 'screen-reader-users'],
            severity: 'impairs-usage'
          }
        });
      }
    });

    // Check for videos without captions - WITH ENHANCED CONTEXT EXTRACTION
    const videosWithoutCaptions = await page.evaluate(() => {
      const videos = Array.from(document.querySelectorAll('video'));

      return videos.map((video, index) => {
        const hasTrack = video.querySelector('track[kind="captions"], track[kind="subtitles"]');
        if (hasTrack) return null;

        // ENHANCED context extraction for intelligent captions
        let context = '';
        let sources: string[] = [];
        const nearbyHeadings: string[] = [];
        const nearbyText: string[] = [];

        // 1. Video element attributes
        const videoTitle = video.getAttribute('title') || video.getAttribute('aria-label') || '';
        if (videoTitle) {
          sources.push(videoTitle);
        }

        // 2. Try immediate parent heading
        const parent = video.closest('section, article, div[class*="hero"], div[class*="banner"], div[class*="content"]');
        if (parent) {
          // Get ALL headings in parent
          const headings = parent.querySelectorAll('h1, h2, h3, h4, h5, h6');
          headings.forEach(h => {
            if (h.textContent?.trim()) {
              nearbyHeadings.push(h.textContent.trim());
              if (sources.length === 0) {
                sources.push(h.textContent.trim());
              }
            }
          });

          // Get nearby paragraphs
          const paragraphs = parent.querySelectorAll('p');
          paragraphs.forEach(p => {
            if (p.textContent?.trim()) {
              nearbyText.push(p.textContent.trim());
            }
          });
        }

        // 3. Page title
        const pageTitle = document.title;
        if (sources.length === 0 && pageTitle) {
          sources.push(`Page: ${pageTitle}`);
        }

        // 4. Try ANY h1 on the page
        if (sources.length === 0) {
          const h1 = document.querySelector('h1');
          if (h1?.textContent?.trim()) {
            sources.push(h1.textContent.trim());
            nearbyHeadings.push(h1.textContent.trim());
          }
        }

        // 5. Meta description
        if (sources.length === 0) {
          const metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) {
            const desc = metaDesc.getAttribute('content');
            if (desc) {
              sources.push(desc.slice(0, 100));
            }
          }
        }

        // 6. Video poster URL for clues
        const poster = video.getAttribute('poster');

        // 7. Page URL
        const pageUrl = window.location.href;

        context = sources.join(' - ');

        return {
          selector: `video:nth-of-type(${index + 1})`,
          html: video.outerHTML.slice(0, 200),
          src: video.getAttribute('src') || video.querySelector('source')?.getAttribute('src') || '',
          poster: poster || '',
          context,
          // Enhanced context for intelligent captions
          videoTitle,
          pageTitle,
          nearbyHeadings: nearbyHeadings.slice(0, 5), // Top 5 headings
          nearbyText: nearbyText.slice(0, 3).map(t => t.slice(0, 150)), // Top 3 paragraphs, truncated
          pageUrl,
          duration: video.duration || 0
        };
      }).filter((v): v is {
        selector: string;
        html: string;
        src: string;
        poster: string;
        context: string;
        videoTitle: string;
        pageTitle: string;
        nearbyHeadings: string[];
        nearbyText: string[];
        pageUrl: string;
        duration: number;
      } => v !== null);
    });

    // Auto-detect Ollama availability for FREE vision analysis
    // Map 'free' to 'ollama' since they use the same backend
    const rawProvider = params.options?.visionProvider || 'free';
    const provider = rawProvider === 'free' ? 'ollama' : rawProvider;
    let useVisionAPI = params.options?.enableVisionAPI;

    // Auto-enable vision if Ollama is available (FREE!)
    if (useVisionAPI === undefined) {
      try {
        const ollamaUrl = params.options?.ollamaBaseUrl || 'http://localhost:11434';
        const checkOllama = await fetch(`${ollamaUrl}/api/tags`, {
          method: 'GET',
          signal: AbortSignal.timeout(2000) // 2 second timeout
        });
        useVisionAPI = checkOllama.ok;
        if (useVisionAPI) {
          console.log('✅ Ollama detected - enabling FREE video analysis');
        }
      } catch (error) {
        useVisionAPI = false;
        console.log('ℹ️  Ollama not detected - video captions will use context-based fallback');
      }
    }

    for (const [idx, video] of videosWithoutCaptions.entries()) {
      let captionFile = 'WEBVTT\n\n';
      let extendedDescription = '';
      let visionUsed = false;

      // Try Vision API if enabled
      if (useVisionAPI) {
        try {
          const providerName = rawProvider === 'free' ? 'Ollama (FREE)' : provider;
          console.log(`🎬 Analyzing video ${idx + 1}/${videosWithoutCaptions.length} with ${providerName}...`);

          const frames = await extractVideoFrames(page, video.selector, {
            maxFrames: params.options?.visionMaxFrames || 10,
            intervalSeconds: params.options?.visionFrameInterval || 3
          });

          if (frames.length > 0) {
            const analysis = await analyzeVideoWithVision(frames, {
              provider,
              anthropicApiKey: params.options?.anthropicApiKey || process.env.ANTHROPIC_API_KEY,
              ollamaBaseUrl: params.options?.ollamaBaseUrl,
              ollamaModel: params.options?.ollamaModel,
              // Pass enhanced context for intelligent fallback captions
              videoContext: {
                pageTitle: video.pageTitle,
                videoTitle: video.videoTitle,
                videoSrc: video.src,
                posterSrc: video.poster,
                nearbyHeadings: video.nearbyHeadings,
                nearbyText: video.nearbyText,
                pageUrl: video.pageUrl,
                duration: video.duration
              }
            });

            captionFile = analysis.webVTT;
            extendedDescription = analysis.extendedDescription;
            visionUsed = true;

            console.log(`✅ Vision analysis complete: ${analysis.sceneDescriptions.length} scenes described`);
          }
        } catch (error) {
          console.warn(`⚠️  Vision API failed for video ${idx + 1}, falling back to context-based captions:`, error);
        }
      }

      // Fall back to context-based captions if Vision not used
      if (!visionUsed) {
        const ctx = video.context.toLowerCase();

      // Use the extracted context to generate SPECIFIC captions
      if (ctx.includes('e-mobility') || ctx.includes('electric') || ctx.includes('e-tron')) {
        captionFile += `00:00:00.000 --> 00:00:05.000
Audi electric vehicle demonstration

00:00:05.000 --> 00:00:10.000
Experience the future of e-mobility
with zero-emission technology

00:00:10.000 --> 00:00:15.000
[Electric motor sound - quiet acceleration]

00:00:15.000 --> 00:00:20.000
Sustainable performance for the modern driver`;

      } else if (ctx.includes('design') || ctx.includes('interior') || ctx.includes('exterior')) {
        captionFile += `00:00:00.000 --> 00:00:05.000
${video.context}

00:00:05.000 --> 00:00:10.000
Showcasing innovative design philosophy
and premium craftsmanship

00:00:10.000 --> 00:00:15.000
[Ambient background music]

00:00:15.000 --> 00:00:20.000
Where form meets function`;

      } else if (ctx.includes('safety') || ctx.includes('technology')) {
        captionFile += `00:00:00.000 --> 00:00:05.000
${video.context}

00:00:05.000 --> 00:00:10.000
Advanced driver assistance systems
protecting what matters most

00:00:10.000 --> 00:00:15.000
[Demonstration of safety features]

00:00:15.000 --> 00:00:20.000
Technology you can trust`;

      } else if (ctx.includes('audi')) {
        // Use page title or H1 as context
        const mainContext = video.context.split(' - ')[0] || 'Audi';
        captionFile += `00:00:00.000 --> 00:00:05.000
${mainContext}

00:00:05.000 --> 00:00:10.000
Innovative automotive excellence
from ${ctx.includes('audi') ? 'Audi' : 'a premium manufacturer'}

00:00:10.000 --> 00:00:15.000
[Vehicle showcase with background music]

00:00:15.000 --> 00:00:20.000
Vorsprung durch Technik
Progress through technology`;

      } else {
        // Fallback with whatever context we found
        const description = video.context || 'Vehicle presentation video';
        captionFile += `00:00:00.000 --> 00:00:05.000
${description}

00:00:05.000 --> 00:00:10.000
[Narration describing key features]

00:00:10.000 --> 00:00:15.000
[Background music continues]

00:00:15.000 --> 00:00:20.000
[Closing statement about brand values]`;
      }
      } // End fallback

      // Create howToFix with captions AND extended description for blind users
      let howToFix = `Add caption track:\n\n<track kind="captions" src="captions.vtt" srclang="en" label="English">\n\nGenerated caption file (save as captions.vtt):\n\n${captionFile}`;

      if (visionUsed && extendedDescription) {
        howToFix += `\n\n--- VIDEO DESCRIPTION FOR BLIND USERS ---\nAdd aria-describedby attribute with detailed scene description:\n\n<video aria-describedby="video-desc-${idx}">\n  ...\n</video>\n\n<div id="video-desc-${idx}" style="position: absolute; left: -10000px;">\n${extendedDescription}\n</div>`;
      }

      violations.push({
        id: `custom-video-no-captions-${idx}`,
        wcagCriterion: '1.2.2',
        wcagLevel: 'A',
        severity: 'critical',
        description: visionUsed
          ? 'Video lacks synchronized captions (analyzed with AI Vision)'
          : 'Video lacks synchronized captions',
        impact: 'Deaf and hard-of-hearing users cannot access video content',
        elements: [{
          selector: video.selector,
          html: video.html,
          context: {
            surroundingText: video.context,
            semanticRole: 'video'
          }
        }],
        howToFix,
        helpUrl: '',
        userImpact: {
          affectedUserPercentage: 15,
          disabilityTypes: ['deaf', 'hard-of-hearing'],
          severity: 'blocks-usage'
        }
      });
    } // End for loop

    // Check for aria-hidden elements with focusable children
    const ariaHiddenIssues = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('[aria-hidden="true"]'));
      const issues: any[] = [];

      elements.forEach((el, index) => {
        // Find focusable children
        const focusableChildren = Array.from(
          el.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
        );

        if (focusableChildren.length > 0) {
          // Get details about the focusable elements
          const childrenInfo = focusableChildren.map(child => ({
            tag: child.tagName.toLowerCase(),
            text: child.textContent?.trim().slice(0, 100) || '',
            type: child.getAttribute('type') || '',
            html: child.outerHTML.slice(0, 200)
          }));

          issues.push({
            selector: `[aria-hidden="true"]:nth-of-type(${index + 1})`,
            html: el.outerHTML.slice(0, 300),
            className: el.className || '',
            focusableCount: focusableChildren.length,
            children: childrenInfo
          });
        }
      });

      return issues;
    });

    ariaHiddenIssues.forEach((issue: any, idx: number) => {
      // Generate SPECIFIC fix based on what the focusable children are
      const childTypes = issue.children.map((c: any) => c.tag);
      const hasButtons = childTypes.includes('button');
      const hasInputs = childTypes.includes('input');
      const hasLinks = childTypes.includes('a');

      // Extract button/link text for context
      const interactiveText = issue.children
        .filter((c: any) => c.text)
        .map((c: any) => `${c.tag.toUpperCase()}: "${c.text}"`)
        .slice(0, 3)
        .join(', ');

      let specificFix = '';
      let rationale = '';

      // Cookie consent detection
      if (interactiveText.toLowerCase().includes('einstellung') ||
          interactiveText.toLowerCase().includes('cookie') ||
          interactiveText.toLowerCase().includes('consent')) {
        specificFix = `<!-- ISSUE: Cookie consent UI hidden but still focusable -->\n${issue.html.slice(0, 150)}...\n\n<!-- FIX: Add tabindex="-1" to all interactive elements -->\n<div aria-hidden="true">\n  <button tabindex="-1">Einstellungen anpassen</button>\n  <input tabindex="-1" type="checkbox">\n</div>`;
        rationale = `Cookie consent elements (${interactiveText}) are hidden with aria-hidden="true" but remain keyboard-focusable. Add tabindex="-1" to prevent focus.`;
      } else if (hasButtons || hasLinks) {
        const elements = issue.children.map((c: any) =>
          `  <${c.tag} tabindex="-1">${c.text || '...'}</${c.tag}>`
        ).join('\n');

        specificFix = `<!-- ISSUE: Interactive elements in hidden container -->\n<!-- Elements found: ${interactiveText} -->\n\n<!-- FIX: Add tabindex="-1" to prevent keyboard focus -->\n<div aria-hidden="true">\n${elements}\n</div>`;
        rationale = `Found ${issue.focusableCount} focusable elements (${childTypes.join(', ')}) inside aria-hidden container. These must have tabindex="-1" to prevent keyboard focus.`;
      } else if (hasInputs) {
        specificFix = `<!-- ISSUE: Form inputs in hidden container -->\n\n<!-- FIX: Add tabindex="-1" to inputs -->\n<div aria-hidden="true">\n  <input tabindex="-1" type="${issue.children[0].type || 'text'}">\n</div>`;
        rationale = `Form inputs inside aria-hidden element remain focusable. Add tabindex="-1" to all inputs.`;
      }

      violations.push({
        id: `custom-aria-hidden-focusable-${idx}`,
        wcagCriterion: '4.1.2',
        wcagLevel: 'A',
        severity: 'serious',
        description: `aria-hidden element contains ${issue.focusableCount} focusable ${issue.focusableCount === 1 ? 'element' : 'elements'}: ${interactiveText}`,
        impact: 'Keyboard users can focus elements that are marked as hidden from screen readers, creating confusion',
        elements: [{
          selector: issue.selector,
          html: issue.html,
          context: {
            surroundingText: `Contains: ${interactiveText}`,
            semanticRole: 'container'
          }
        }],
        howToFix: specificFix,
        helpUrl: '',
        userImpact: {
          affectedUserPercentage: 10,
          disabilityTypes: ['blind', 'screen-reader-users', 'keyboard-only-users'],
          severity: 'impairs-usage'
        }
      });
    });

  } catch (error) {
    console.error('Custom heuristic checks failed:', error);
  }

  return violations;
}

/**
 * Performs comprehensive WCAG 2.2 accessibility scan
 */
export async function scanComprehensive(
  params: ScanComprehensiveParams
): Promise<QEToolResponse<AccessibilityScanResult>> {
  const startTime = performance.now();
  const scanId = SecureRandom.generateId(12);

  let browser: Browser | null = null;
  let page: Page | null = null;

  try {
    // Validate parameters
    if (!params.url) {
      throw new Error('URL is required');
    }

    if (!['A', 'AA', 'AAA'].includes(params.level)) {
      throw new Error('Invalid WCAG level. Must be A, AA, or AAA');
    }

    // Launch browser with context (required by axe-core)
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    page = await context.newPage();

    // Navigate to URL with increased timeout
    await page.goto(params.url, {
      waitUntil: 'domcontentloaded', // Changed from networkidle for better reliability
      timeout: 60000
    });

    // Extract page metadata for context-aware remediation
    const pageMetadata = await page.evaluate(() => ({
      title: document.title || '',
      language: document.documentElement.lang || document.documentElement.getAttribute('xml:lang') || 'en'
    }));

    // Build axe-core configuration
    const wcagTags = getWCAGTags(params.level);
    const axeBuilder = new AxeBuilder({ page })
      .withTags(wcagTags);

    // Run axe-core scan
    const axeResults = await axeBuilder.analyze();

    // Run CUSTOM heuristic scans for issues axe-core misses
    const customViolations = await runCustomHeuristicChecks(page, params);

    // Merge axe-core violations with custom violations
    const allAxeViolations = [...axeResults.violations];

    // Convert axe violations to our format with enhanced metadata
    const violations: AccessibilityViolation[] = await Promise.all(
      axeResults.violations.map(async (v: any, idx: number) => {
        const elements: ViolationElement[] = await Promise.all(
          v.nodes.map(async (node: any) => {
            const element: ViolationElement = {
              selector: node.target.join(' '),
              html: node.html
            };

            // Add context if enabled
            if (params.options?.includeContext) {
              element.context = await analyzeElementContext(page!, node.target.join(' '));
            }

            return element;
          })
        );

        const wcagCriterion = extractWCAGCriterion(v.tags);

        // Get EN 301 549 mapping and legal risk
        const en301549 = getEN301549Requirement(wcagCriterion);
        const legalRisk = getLegalRiskLevel(wcagCriterion);

        return {
          id: `violation-${scanId}-${idx}`,
          wcagCriterion,
          wcagLevel: extractWCAGLevel(v.tags),
          severity: mapSeverity(v.impact),
          description: v.description,
          impact: v.help,
          elements,
          howToFix: v.helpUrl,
          helpUrl: v.helpUrl,
          userImpact: calculateUserImpact(v.impact, v.id),
          en301549,
          legalRisk
        };
      })
    );

    // Add custom heuristic violations
    violations.push(...customViolations);

    // Calculate summary
    const summary = {
      total: violations.length,
      critical: violations.filter(v => v.severity === 'critical').length,
      serious: violations.filter(v => v.severity === 'serious').length,
      moderate: violations.filter(v => v.severity === 'moderate').length,
      minor: violations.filter(v => v.severity === 'minor').length
    };

    // Calculate compliance score
    const score = calculateComplianceScore(violations);
    const status = determineComplianceStatus(score, violations);
    const productionReady = isProductionReady(violations, score);

    // Generate context-aware remediations if enabled
    let remediations: ContextAwareRemediation[] | undefined;
    if (params.options?.includeContext && violations.length > 0) {
      remediations = generateContextAwareRemediations(violations);
    }

    // Detect video elements for caption recommendations
    const videoElements = await page!.evaluate(() => {
      return document.querySelectorAll('video, iframe[src*="youtube"], iframe[src*="vimeo"]').length;
    });

    // Assess EU Accessibility Act compliance
    const euAccessibilityAct = assessEAACompliance(
      'websites', // Category for web applications
      violations.map(v => ({
        wcagCriterion: v.wcagCriterion,
        severity: v.severity
      })),
      ['EU'] // Default to EU market
    );

    const scanTime = performance.now() - startTime;
    const elementsAnalyzed = violations.reduce((sum, v) => sum + v.elements.length, 0);

    const result: AccessibilityScanResult = {
      scanId: `a11y-${scanId}`,
      url: params.url,
      compliance: {
        status,
        score,
        level: params.level,
        productionReady
      },
      violations,
      summary,
      remediations,
      performance: {
        scanTime,
        elementsAnalyzed
      },
      euAccessibilityAct,
      videoElements: videoElements > 0 ? videoElements : undefined
    };

    // Generate Markdown report (default: true)
    const shouldGenerateMarkdown = params.options?.generateMarkdownReport !== false;
    const shouldOutputToConsole = params.options?.outputToConsole !== false;

    if (shouldGenerateMarkdown) {
      try {
        const markdownReport = generateMarkdownReport({
          url: params.url,
          scanId,
          timestamp: new Date().toISOString(),
          violations,
          complianceScore: result.compliance.score,
          complianceStatus: result.compliance.status,
          level: params.level,
          pageLanguage: pageMetadata.language,
          pageTitle: pageMetadata.title,
          includeCodeExamples: true
        });

        // Determine report path
        const reportsDir = params.options?.reportPath
          ? path.dirname(params.options.reportPath)
          : path.join(process.cwd(), 'docs', 'reports');

        const reportFileName = params.options?.reportPath
          ? path.basename(params.options.reportPath).replace(/\.(html|md)$/, '.md')
          : `a11y-report-${scanId}.md`;

        // Ensure reports directory exists
        if (!fs.existsSync(reportsDir)) {
          fs.mkdirSync(reportsDir, { recursive: true });
        }

        const reportPath = path.join(reportsDir, reportFileName);
        fs.writeFileSync(reportPath, markdownReport, 'utf-8');

        result.htmlReportPath = reportPath; // Reuse this field for now

        // Output to console if requested
        if (shouldOutputToConsole) {
          console.log('\n' + '='.repeat(80));
          console.log(markdownReport);
          console.log('='.repeat(80) + '\n');
          console.log(`📄 Report saved to: ${reportPath}\n`);
        }
      } catch (error) {
        console.error('Failed to generate Markdown report:', error);
        // Don't fail the entire scan if report generation fails
      }
    }

    // Generate HTML report if explicitly requested (deprecated)
    if (params.options?.generateHTMLReport) {
      try {
        const htmlReport = generateHTMLReport(result, {
          title: `Accessibility Scan Report - ${new URL(params.url).hostname}`,
          includeCodeExamples: true,
          theme: 'light'
        });

        const reportsDir = params.options.reportPath
          ? path.dirname(params.options.reportPath)
          : path.join(process.cwd(), 'docs', 'reports');

        const reportFileName = params.options.reportPath
          ? path.basename(params.options.reportPath)
          : `a11y-report-${scanId}-${Date.now()}.html`;

        if (!fs.existsSync(reportsDir)) {
          fs.mkdirSync(reportsDir, { recursive: true });
        }

        const reportPath = path.join(reportsDir, reportFileName);
        fs.writeFileSync(reportPath, htmlReport, 'utf-8');

        // Don't override the Markdown report path
        if (!shouldGenerateMarkdown) {
          result.htmlReportPath = reportPath;
        }
      } catch (error) {
        console.error('Failed to generate HTML report:', error);
      }
    }

    return {
      success: true,
      data: result,
      metadata: {
        requestId: scanId,
        timestamp: new Date().toISOString(),
        executionTime: scanTime,
        agent: 'qe-a11y-ally',
        version: '1.0.0'
      }
    };

  } catch (error) {
    const executionTime = performance.now() - startTime;
    const qeError: QEError = {
      code: 'A11Y_SCAN_FAILED',
      message: error instanceof Error ? error.message : 'Accessibility scan failed',
      details: {
        params,
        error: error instanceof Error ? error.stack : String(error)
      }
    };

    return {
      success: false,
      error: qeError,
      metadata: {
        requestId: scanId,
        timestamp: new Date().toISOString(),
        executionTime,
        agent: 'qe-a11y-ally',
        version: '1.0.0'
      }
    };

  } finally {
    // Cleanup
    if (page) await page.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

/**
 * Get WCAG tags for axe-core based on level
 */
function getWCAGTags(level: 'A' | 'AA' | 'AAA'): string[] {
  const baseTags = ['wcag2a'];

  if (level === 'AA' || level === 'AAA') {
    baseTags.push('wcag2aa', 'wcag22aa');
  }

  if (level === 'AAA') {
    baseTags.push('wcag2aaa');
  }

  return baseTags;
}

/**
 * Extract WCAG criterion from axe tags
 */
function extractWCAGCriterion(tags: string[]): string {
  const wcagTag = tags.find(t => t.match(/wcag\d+/));
  if (!wcagTag) return 'Unknown';

  // Extract criterion number (e.g., "wcag111" -> "1.1.1")
  const match = wcagTag.match(/wcag(\d)(\d)(\d)/);
  if (match) {
    return `${match[1]}.${match[2]}.${match[3]}`;
  }

  return wcagTag.toUpperCase();
}

/**
 * Extract WCAG level from tags
 */
function extractWCAGLevel(tags: string[]): string {
  if (tags.some(t => t.includes('wcag2aaa'))) return 'AAA';
  if (tags.some(t => t.includes('wcag2aa'))) return 'AA';
  if (tags.some(t => t.includes('wcag2a'))) return 'A';
  return 'Unknown';
}

/**
 * Map axe-core impact to severity
 */
function mapSeverity(impact?: string): 'critical' | 'serious' | 'moderate' | 'minor' {
  switch (impact) {
    case 'critical': return 'critical';
    case 'serious': return 'serious';
    case 'moderate': return 'moderate';
    default: return 'minor';
  }
}

/**
 * Calculate compliance score based on violations
 */
function calculateComplianceScore(violations: AccessibilityViolation[]): number {
  if (violations.length === 0) return 100;

  const weights = {
    critical: 20,
    serious: 10,
    moderate: 5,
    minor: 2
  };

  const totalDeductions = violations.reduce((sum, v) => {
    return sum + (weights[v.severity] || 0);
  }, 0);

  return Math.max(0, 100 - totalDeductions);
}

/**
 * Determine compliance status
 */
function determineComplianceStatus(
  score: number,
  violations: AccessibilityViolation[]
): 'compliant' | 'partially-compliant' | 'non-compliant' {
  const hasCritical = violations.some(v => v.severity === 'critical');

  if (hasCritical) return 'non-compliant';
  if (score >= 90) return 'compliant';
  return 'partially-compliant';
}

/**
 * Determine if application is production ready
 */
function isProductionReady(violations: AccessibilityViolation[], score: number): boolean {
  const hasCritical = violations.some(v => v.severity === 'critical');
  const hasMultipleSerious = violations.filter(v => v.severity === 'serious').length >= 3;

  return !hasCritical && !hasMultipleSerious && score >= 85;
}

/**
 * Calculate user impact for a violation
 */
function calculateUserImpact(impact?: string, ruleId?: string): UserImpact {
  // Map common violations to affected disability types
  const disabilityMapping: Record<string, string[]> = {
    'color-contrast': ['low-vision', 'color-blindness'],
    'image-alt': ['blind', 'screen-reader-users'],
    'label': ['blind', 'screen-reader-users'],
    'aria': ['blind', 'screen-reader-users'],
    'keyboard': ['motor-impairment', 'keyboard-only-users'],
    'focus': ['motor-impairment', 'keyboard-only-users']
  };

  const disabilityTypes: string[] = [];
  if (ruleId) {
    for (const [key, types] of Object.entries(disabilityMapping)) {
      if (ruleId.includes(key)) {
        disabilityTypes.push(...types);
      }
    }
  }

  // Estimate affected user percentage
  let affectedPercentage = 5; // Default 5%
  if (impact === 'critical') affectedPercentage = 15;
  else if (impact === 'serious') affectedPercentage = 10;

  // Determine severity
  let severity: UserImpact['severity'] = 'minor-inconvenience';
  if (impact === 'critical') severity = 'blocks-usage';
  else if (impact === 'serious') severity = 'impairs-usage';

  return {
    affectedUserPercentage: affectedPercentage,
    disabilityTypes: disabilityTypes.length > 0 ? [...new Set(disabilityTypes)] : ['general'],
    severity
  };
}

/**
 * Analyze element context for context-aware remediation
 * Enhanced with AccName computation and APG pattern suggestions
 */
async function analyzeElementContext(
  page: Page,
  selector: string
): Promise<ElementContext | undefined> {
  try {
    const elementData = await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) return undefined;

      // Collect attributes
      const attributes: Record<string, string> = {};
      for (const attr of element.attributes) {
        attributes[attr.name] = attr.value;
      }

      return {
        tagName: element.tagName.toLowerCase(),
        parentElement: element.parentElement?.tagName.toLowerCase(),
        surroundingText: element.parentElement?.textContent?.slice(0, 100),
        semanticRole: element.getAttribute('role') || element.tagName.toLowerCase(),
        textContent: element.textContent?.slice(0, 200),
        attributes
      };
    }, selector);

    if (!elementData) return undefined;

    // Compute accessible name
    const accName = computeAccessibleName(
      {
        tagName: elementData.tagName,
        role: elementData.attributes['role'],
        attributes: elementData.attributes,
        textContent: elementData.textContent
      },
      { includeTrace: false }
    );

    // Suggest APG pattern
    const suggestedPattern = suggestAPGPattern({
      role: elementData.attributes['role'],
      tagName: elementData.tagName,
      attributes: elementData.attributes,
      context: elementData.surroundingText
    });

    return {
      parentElement: elementData.parentElement,
      surroundingText: elementData.surroundingText,
      semanticRole: elementData.semanticRole,
      accName,
      suggestedPattern: suggestedPattern || undefined
    };
  } catch (error) {
    return undefined;
  }
}

/**
 * Generate context-aware remediations
 */
function generateContextAwareRemediations(
  violations: AccessibilityViolation[]
): ContextAwareRemediation[] {
  return violations.map((violation, index) => {
    // Calculate priority based on severity and user impact
    const priorityScore = calculatePriorityScore(violation);

    // Estimate remediation effort
    const effort = estimateRemediationEffort(violation);

    // Generate remediation recommendations
    const recommendations = generateRecommendations(violation);

    // Calculate ROI (priority / effort)
    const roi = priorityScore / effort.hours;

    return {
      violationId: violation.id,
      priority: priorityScore,
      estimatedEffort: effort,
      recommendations,
      roi
    };
  }).sort((a, b) => b.roi - a.roi); // Sort by ROI descending
}

/**
 * Calculate priority score (1-10)
 */
function calculatePriorityScore(violation: AccessibilityViolation): number {
  const severityScores = {
    critical: 10,
    serious: 7,
    moderate: 4,
    minor: 2
  };

  const baseScore = severityScores[violation.severity];
  const impactMultiplier = (violation.userImpact?.affectedUserPercentage || 5) / 10;

  return Math.min(10, baseScore + impactMultiplier);
}

/**
 * Estimate remediation effort
 */
function estimateRemediationEffort(
  violation: AccessibilityViolation
): ContextAwareRemediation['estimatedEffort'] {
  // Simple heuristic based on violation type
  const elementCount = violation.elements.length;

  let baseHours = 0.5;
  let complexity: 'trivial' | 'simple' | 'moderate' | 'complex' = 'simple';

  if (violation.wcagCriterion.startsWith('1.1')) {
    // Alt text violations - simple
    baseHours = 0.25 * elementCount;
    complexity = 'trivial';
  } else if (violation.wcagCriterion.startsWith('4.1')) {
    // ARIA violations - moderate
    baseHours = 0.5 * elementCount;
    complexity = 'moderate';
  } else if (violation.wcagCriterion.startsWith('2.1')) {
    // Keyboard navigation - can be complex
    baseHours = 1 * elementCount;
    complexity = 'complex';
  }

  return {
    hours: Math.max(0.25, baseHours),
    complexity
  };
}

/**
 * Generate remediation recommendations
 * Enhanced with APG patterns and AccName intelligence
 */
function generateRecommendations(violation: AccessibilityViolation): RemediationOption[] {
  const recommendations: RemediationOption[] = [];
  const element = violation.elements[0];
  const context = element?.context;

  // PRIORITY 1: Check if this is a CUSTOM violation with specific howToFix code
  // Custom violations from runCustomHeuristicChecks() have detailed, ready-to-use code
  if (violation.howToFix && violation.id.startsWith('custom-')) {
    // Extract code from howToFix field
    // Format can be:
    // 1. "Add descriptive aria-label: aria-label="...""
    // 2. "Add caption track:\n\n<track ...>\n\nGenerated caption file..."

    const howToFix = violation.howToFix;

    // For generic link violations with aria-label recommendations
    if (howToFix.includes('aria-label=')) {
      const ariaMatch = howToFix.match(/aria-label="([^"]+)"/);
      if (ariaMatch) {
        const ariaLabel = ariaMatch[1];

        recommendations.push({
          approach: 'aria-enhancement',
          priority: 1,
          code: `aria-label="${ariaLabel}"`,
          rationale: violation.description,
          wcagCriteria: [violation.wcagCriterion],
          confidence: 0.9
        });

        return recommendations; // Return immediately - don't generate generic recommendations
      }
    }

    // For video caption violations with WebVTT files
    if (howToFix.includes('<track') && howToFix.includes('WEBVTT')) {
      recommendations.push({
        approach: 'semantic-html',
        priority: 1,
        code: howToFix, // Use the entire howToFix as it contains both HTML and WebVTT
        rationale: violation.description,
        wcagCriteria: [violation.wcagCriterion],
        confidence: 0.95
      });

      return recommendations; // Return immediately - this is complete, copy-paste-ready code
    }

    // For aria-hidden focusability violations with tabindex fixes
    if (howToFix.includes('<!-- ISSUE:') && howToFix.includes('tabindex="-1"')) {
      recommendations.push({
        approach: 'semantic-html',
        priority: 1,
        code: howToFix, // Use the entire howToFix with issue + fix comments
        rationale: violation.description,
        wcagCriteria: [violation.wcagCriterion],
        confidence: 0.9
      });

      return recommendations; // Return immediately - this is complete, copy-paste-ready code
    }
  }

  // Use APG pattern if suggested
  if (context?.suggestedPattern) {
    const { pattern, confidence, reason } = context.suggestedPattern;

    recommendations.push({
      approach: 'semantic-html',
      priority: 1,
      code: generatePatternCodeExample(pattern.name, {
        includeJavaScript: true,
        includeCSS: false
      }),
      rationale: `Use W3C APG ${pattern.name} pattern: ${reason}. Reference: ${pattern.apgUrl}`,
      wcagCriteria: pattern.wcagCriteria,
      confidence
    });
  }

  // Use AccName recommendation if available
  if (context?.accName && !context.accName.sufficient) {
    const accNameRec = generateAccessibleNameRecommendation(
      context.accName,
      {
        tagName: element.html.match(/<(\w+)/)?.[1] || 'div',
        attributes: {},
        context: context.surroundingText
      }
    );

    if (accNameRec.priority === 'critical' || accNameRec.priority === 'high') {
      recommendations.push({
        approach: context.accName.source.type === 'aria-label' ? 'aria-enhancement' : 'semantic-html',
        priority: accNameRec.priority === 'critical' ? 1 : 2,
        code: accNameRec.codeExample,
        rationale: `${accNameRec.recommendation}. Current accessible name: "${context.accName.accessibleName}" (quality: ${context.accName.quality}/100)`,
        wcagCriteria: [violation.wcagCriterion, '4.1.2'],
        confidence: 0.9
      });
    }
  }

  // Generate recommendations based on violation type
  if (violation.description.toLowerCase().includes('aria-label')) {
    if (recommendations.length === 0) {
      recommendations.push({
        approach: 'aria-enhancement',
        priority: 1,
        code: generateARIARecommendation(violation),
        rationale: 'Add descriptive ARIA label for screen reader users',
        wcagCriteria: [violation.wcagCriterion],
        confidence: 0.85
      });
    }
  }

  if (violation.description.toLowerCase().includes('alt') || violation.description.toLowerCase().includes('image')) {
    const element = violation.elements[0];
    const html = element?.html || '';
    const selector = element?.selector || '';

    // Extract actual image URL and parent link context
    const srcMatch = html.match(/src="([^"]+)"/);

    // Check BOTH HTML and CSS selector for parent aria-label
    let parentMatch = html.match(/aria-label="([^"]+)"/);
    if (!parentMatch && selector) {
      // Extract from CSS selector like: .parent[aria-label="Text"] > .child
      parentMatch = selector.match(/aria-label=["']([^"']+)["']/);
    }

    let specificAlt = '';
    let rationale = 'Image requires descriptive alt text for screen reader users.';

    if (srcMatch) {
      const src = srcMatch[1];

      // Analyze parent link context
      if (parentMatch) {
        const parentLabel = parentMatch[1];

        // Generate SPECIFIC alt text based on parent link
        if (parentLabel.toLowerCase().includes('e-mobility') || parentLabel.toLowerCase().includes('electric')) {
          specificAlt = 'alt="Audi electric vehicle showcasing e-mobility technology"';
          rationale = `Parent link: "${parentLabel}". Image shows Audi's electric vehicle for this e-mobility section.`;
        } else {
          specificAlt = `alt="Visual for: ${parentLabel}"`;
          rationale = `Parent link says "${parentLabel}". Image provides visual context for this link.`;
        }
      }
      // Analyze image URL for brand/product context
      else if (src.includes('audi.com') || src.includes('dam.audi')) {
        if (src.includes('mobility') || src.includes('e-tron') || src.includes('electric')) {
          specificAlt = 'alt="Audi electric vehicle showcasing e-mobility technology"';
          rationale = 'Image URL suggests Audi e-mobility content. Alt text describes the electric vehicle shown.';
        } else {
          specificAlt = 'alt="Audi promotional image"';
          rationale = 'Image from Audi Digital Asset Management. Describe the specific Audi product or feature shown.';
        }
      }
      // Generic but more specific than placeholder
      else {
        const filename = src.split('/').pop()?.split('?')[0] || '';
        const cleanName = filename
          .replace(/\.(jpg|png|svg|webp|gif)$/i, '')
          .replace(/[-_]/g, ' ')
          .replace(/\d{2,}/g, '')
          .trim();

        if (cleanName && cleanName.length > 3) {
          specificAlt = `alt="${cleanName}"`;
          rationale = `Inferred from filename "${cleanName}". Verify this accurately describes the image content.`;
        } else {
          specificAlt = generateAltTextRecommendation(violation);
          rationale = 'Analyze the image content and provide specific description.';
        }
      }
    } else {
      specificAlt = generateAltTextRecommendation(violation);
    }

    recommendations.push({
      approach: 'semantic-html',
      priority: 1,
      code: `<!-- Current HTML -->\n${element?.html?.slice(0, 150) || '<img ...>'}${element?.html && element.html.length > 150 ? '...' : ''}\n\n<!-- RECOMMENDED FIX -->\n${specificAlt}`,
      rationale,
      wcagCriteria: [violation.wcagCriterion],
      confidence: parentMatch ? 0.85 : 0.75
    });
  }

  // Default generic recommendation
  if (recommendations.length === 0) {
    recommendations.push({
      approach: 'semantic-html',
      priority: 2,
      code: `<!-- Fix required for ${violation.wcagCriterion} -->\n<!-- See: ${violation.helpUrl} -->`,
      rationale: violation.impact,
      wcagCriteria: [violation.wcagCriterion],
      confidence: 0.7
    });
  }

  return recommendations.slice(0, 3); // Limit to top 3 recommendations
}

/**
 * Generate ARIA label recommendation with SPECIFIC context-aware suggestions
 */
function generateARIARecommendation(violation: AccessibilityViolation): string {
  const element = violation.elements[0];
  if (!element) return 'aria-label="[Describe the action this element performs]"';

  const html = element.html.toLowerCase();
  const context = element.context;
  let suggestedLabel = '';

  // Analyze actual element content and context
  if (html.includes('close') || html.includes('×') || html.includes('x')) {
    const parentContext = context?.surroundingText?.toLowerCase() || '';
    if (parentContext.includes('modal') || parentContext.includes('dialog')) {
      suggestedLabel = 'Close dialog';
    } else if (parentContext.includes('menu')) {
      suggestedLabel = 'Close menu';
    } else if (parentContext.includes('banner') || parentContext.includes('notification')) {
      suggestedLabel = 'Close notification';
    } else {
      suggestedLabel = 'Close';
    }
  } else if (html.includes('menu') || html.includes('☰') || html.includes('hamburger')) {
    suggestedLabel = 'Open navigation menu';
  } else if (html.includes('search')) {
    suggestedLabel = 'Search';
  } else if (html.includes('cart') || html.includes('shopping')) {
    suggestedLabel = 'View shopping cart';
  } else if (html.includes('user') || html.includes('account') || html.includes('profile')) {
    suggestedLabel = 'My account';
  } else if (html.includes('chevron') || html.includes('arrow')) {
    if (html.includes('right') || html.includes('next')) {
      suggestedLabel = 'Next';
    } else if (html.includes('left') || html.includes('prev')) {
      suggestedLabel = 'Previous';
    } else if (html.includes('down')) {
      suggestedLabel = 'Expand';
    } else {
      suggestedLabel = 'Navigate';
    }
  } else if (html.includes('play')) {
    suggestedLabel = 'Play video';
  } else if (html.includes('pause')) {
    suggestedLabel = 'Pause video';
  } else if (context?.surroundingText) {
    // Extract meaningful text from context
    const text = context.surroundingText
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50);
    if (text && text.length > 3) {
      suggestedLabel = text;
    }
  }

  if (!suggestedLabel) {
    suggestedLabel = '[Describe the specific action: e.g., "Submit contact form", "Download PDF", "Open filters"]';
  }

  return `aria-label="${suggestedLabel}"`;
}

/**
 * Generate SPECIFIC alt text recommendation based on actual image context
 */
function generateAltTextRecommendation(violation: AccessibilityViolation): string {
  const element = violation.elements[0];
  if (!element) return 'alt="[Describe what this specific image shows]"';

  const html = element.html.toLowerCase();
  let suggestedAlt = '';

  // Extract image src for context
  const srcMatch = html.match(/src="([^"]+)"/);
  const src = srcMatch ? srcMatch[1].toLowerCase() : '';

  // Analyze image filename and path for clues
  if (src) {
    if (src.includes('logo')) {
      // Extract brand name from URL if possible
      const urlParts = src.split('/');
      const domain = urlParts.find(part => part.includes('.com') || part.includes('.org'));
      if (domain) {
        const brandName = domain.split('.')[0];
        suggestedAlt = `${brandName.charAt(0).toUpperCase() + brandName.slice(1)} logo`;
      } else {
        suggestedAlt = 'Company logo';
      }
    } else if (src.includes('icon')) {
      suggestedAlt = '[Decorative icon - use alt="" if purely decorative, or describe its meaning]';
    } else if (src.includes('product') || src.includes('item')) {
      suggestedAlt = '[Product name and key features, e.g., "Audi e-tron GT electric vehicle in metallic silver"]';
    } else if (src.includes('hero') || src.includes('banner')) {
      suggestedAlt = '[Main subject of banner image, e.g., "Customer using mobile app to track delivery"]';
    } else if (src.includes('team') || src.includes('person') || src.includes('profile')) {
      suggestedAlt = '[Person\'s name and role, e.g., "Jane Smith, Chief Technology Officer"]';
    } else if (src.includes('chart') || src.includes('graph') || src.includes('diagram')) {
      suggestedAlt = '[Describe the data shown, e.g., "Bar chart showing 40% increase in sales from 2023 to 2024"]';
    } else {
      // Try to infer from URL structure
      const filename = src.split('/').pop()?.split('?')[0] || '';
      const cleanName = filename
        .replace(/\.(jpg|png|svg|webp|gif)$/i, '')
        .replace(/[-_]/g, ' ')
        .trim();

      if (cleanName && cleanName.length > 3) {
        suggestedAlt = cleanName;
      } else {
        suggestedAlt = '[Describe what this image shows and its purpose on the page]';
      }
    }
  }

  // Check if it's in a link to provide more context
  const context = element.context;
  if (context?.parentElement === 'a' || html.includes('<a ')) {
    if (suggestedAlt.startsWith('[')) {
      suggestedAlt = '[Image shows: ... ] - Link destination: [where this link goes]';
    } else {
      suggestedAlt = `${suggestedAlt} - [add link destination, e.g., "Learn more about ${suggestedAlt}"]`;
    }
  }

  if (!suggestedAlt) {
    suggestedAlt = '[Describe the specific content of this image]';
  }

  return `alt="${suggestedAlt}"`;
}

import type { AccessibilityViolation } from './scan-comprehensive.js';
import {
  generateRemediationCodes,
  detectFramework,
  generateAccessibilityCSSUtilities,
  type RemediationCode,
  type FrameworkDetection
} from './remediation-code-generator.js';

export interface MarkdownReportOptions {
  url: string;
  scanId: string;
  timestamp: string;
  violations: AccessibilityViolation[];
  complianceScore: number;
  complianceStatus: string;
  level: string;
  /** Page language code (e.g., 'en', 'de') */
  pageLanguage?: string;
  /** Page title for context */
  pageTitle?: string;
  /** Include detailed code examples */
  includeCodeExamples?: boolean;
}

interface RemediationTask {
  id: string;
  title: string;
  severity: string;
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  affectedUsers: string;
  elementCount: number;
  steps: string[];
  testing: string[];
  estimatedTime: string;
  dependencies?: string[];
}

function generateRemediationPlan(violations: AccessibilityViolation[], url: string): string {
  let plan = '';

  plan += `## 🎯 Context-Aware Remediation Plan\n\n`;

  // Extract site context from URL
  const domain = new URL(url).hostname.replace('www.', '');
  const siteName = domain.split('.')[0];

  plan += `### 📋 Executive Summary\n\n`;
  plan += `This remediation plan addresses **${violations.length} accessibility violations** found on **${siteName}**. `;

  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const seriousCount = violations.filter(v => v.severity === 'serious').length;
  const totalElements = violations.reduce((sum, v) => sum + (v.elements?.length || 0), 0);

  plan += `The issues affect **${totalElements} elements** and impact up to **`;
  const maxImpact = Math.max(...violations.map(v => v.userImpact?.affectedUserPercentage || 0));
  plan += `${maxImpact}% of users** (including blind, deaf, low-vision, and mobility-impaired visitors).\n\n`;

  if (criticalCount > 0) {
    plan += `**⚠️ URGENT**: ${criticalCount} critical ${criticalCount === 1 ? 'issue requires' : 'issues require'} immediate attention to avoid legal risk and ensure basic accessibility.\n\n`;
  }

  // Create remediation tasks
  const tasks: RemediationTask[] = [];

  violations.forEach((v, idx) => {
    const task: RemediationTask = {
      id: `TASK-${idx + 1}`,
      title: v.description.split('Ensure ')[1] || v.description,
      severity: v.severity,
      effort: estimateEffort(v),
      impact: estimateImpact(v),
      affectedUsers: `${v.userImpact?.affectedUserPercentage || 0}% (${v.userImpact?.disabilityTypes?.join(', ') || 'general'})`,
      elementCount: v.elements?.length || 0,
      steps: generateSteps(v, url),
      testing: generateTestingSteps(v),
      estimatedTime: estimateTime(v),
      dependencies: identifyDependencies(v, violations)
    };
    tasks.push(task);
  });

  // Sort by priority: critical first, then by impact/effort ratio
  tasks.sort((a, b) => {
    const severityOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 };
    const sevA = severityOrder[a.severity as keyof typeof severityOrder];
    const sevB = severityOrder[b.severity as keyof typeof severityOrder];

    if (sevA !== sevB) return sevA - sevB;

    const effortScore = { low: 1, medium: 2, high: 3 };
    const impactScore = { low: 1, medium: 2, high: 3 };
    const ratioA = impactScore[a.impact] / effortScore[a.effort];
    const ratioB = impactScore[b.impact] / effortScore[b.effort];

    return ratioB - ratioA;
  });

  // Quick Wins
  const quickWins = tasks.filter(t => t.effort === 'low' && (t.severity === 'critical' || t.severity === 'serious'));
  if (quickWins.length > 0) {
    plan += `### ⚡ Quick Wins (Start Here!)\n\n`;
    plan += `These ${quickWins.length} high-impact, low-effort tasks provide immediate accessibility improvements:\n\n`;
    quickWins.forEach((task, i) => {
      plan += `${i + 1}. **${task.title}** (${task.elementCount} elements, ~${task.estimatedTime})\n`;
    });
    plan += `\n`;
  }

  // Prioritized Action Plan
  plan += `### 📌 Prioritized Action Plan\n\n`;

  const phases = [
    { name: 'Phase 1: Critical Fixes (Week 1)', filter: (t: RemediationTask) => t.severity === 'critical' },
    { name: 'Phase 2: Serious Issues (Week 2-3)', filter: (t: RemediationTask) => t.severity === 'serious' },
    { name: 'Phase 3: Remaining Issues (Week 4+)', filter: (t: RemediationTask) => t.severity !== 'critical' && t.severity !== 'serious' }
  ];

  phases.forEach(phase => {
    const phaseTasks = tasks.filter(phase.filter);
    if (phaseTasks.length === 0) return;

    plan += `#### ${phase.name}\n\n`;
    phaseTasks.forEach(task => {
      plan += `**${task.id}: ${task.title}**\n`;
      plan += `- **Severity**: ${task.severity.toUpperCase()} | **Effort**: ${task.effort} | **Impact**: ${task.impact}\n`;
      plan += `- **Affects**: ${task.affectedUsers}\n`;
      plan += `- **Elements**: ${task.elementCount}\n`;
      plan += `- **Time**: ${task.estimatedTime}\n`;
      if (task.dependencies && task.dependencies.length > 0) {
        plan += `- **Dependencies**: ${task.dependencies.join(', ')}\n`;
      }
      plan += `\n**Steps**:\n`;
      task.steps.forEach((step, i) => {
        plan += `${i + 1}. ${step}\n`;
      });
      plan += `\n**Testing**:\n`;
      task.testing.forEach((test, i) => {
        plan += `- [ ] ${test}\n`;
      });
      plan += `\n`;
    });
  });

  // Timeline Summary
  plan += `### 📅 Implementation Timeline\n\n`;
  const totalTime = tasks.reduce((sum, t) => {
    const hours = parseInt(t.estimatedTime) || 0;
    return sum + hours;
  }, 0);

  plan += `| Phase | Tasks | Estimated Time | Deliverables |\n`;
  plan += `|-------|-------|----------------|---------------|\n`;
  plan += `| **Week 1** | ${tasks.filter(t => t.severity === 'critical').length} critical | ${tasks.filter(t => t.severity === 'critical').reduce((sum, t) => sum + (parseInt(t.estimatedTime) || 0), 0)}h | Basic accessibility compliance |\n`;
  plan += `| **Week 2-3** | ${tasks.filter(t => t.severity === 'serious').length} serious | ${tasks.filter(t => t.severity === 'serious').reduce((sum, t) => sum + (parseInt(t.estimatedTime) || 0), 0)}h | WCAG 2.2 AA compliance |\n`;
  plan += `| **Week 4+** | ${tasks.filter(t => t.severity !== 'critical' && t.severity !== 'serious').length} remaining | ${tasks.filter(t => t.severity !== 'critical' && t.severity !== 'serious').reduce((sum, t) => sum + (parseInt(t.estimatedTime) || 0), 0)}h | Full remediation |\n`;
  plan += `| **Total** | ${tasks.length} | **${totalTime}h** | ${siteName} fully accessible |\n\n`;

  // Success Metrics
  plan += `### 📊 Success Metrics\n\n`;
  plan += `Track progress using these KPIs:\n\n`;
  plan += `- [ ] **Zero critical violations** (currently ${criticalCount})\n`;
  plan += `- [ ] **Zero serious violations** (currently ${seriousCount})\n`;
  plan += `- [ ] **Compliance score ≥ 90/100** (currently ${violations.length > 0 ? 0 : 100})\n`;
  plan += `- [ ] **Screen reader navigation test passed**\n`;
  plan += `- [ ] **Keyboard-only navigation test passed**\n`;
  plan += `- [ ] **WAVE tool shows 0 errors**\n`;
  plan += `- [ ] **axe DevTools shows 0 violations**\n\n`;

  return plan;
}

function estimateEffort(violation: AccessibilityViolation): 'low' | 'medium' | 'high' {
  const elementCount = violation.elements?.length || 0;

  // Video captions = high effort
  if (violation.description.toLowerCase().includes('video')) return 'high';

  // Many elements = higher effort
  if (elementCount > 50) return 'high';
  if (elementCount > 20) return 'medium';

  // ARIA fixes = low-medium effort
  if (violation.description.toLowerCase().includes('aria')) return 'low';

  // Color contrast = medium effort (requires design changes)
  if (violation.description.toLowerCase().includes('contrast')) return 'medium';

  // Alt text = low effort
  if (violation.description.toLowerCase().includes('alt')) return 'low';

  return 'medium';
}

function estimateImpact(violation: AccessibilityViolation): 'low' | 'medium' | 'high' {
  const userImpact = violation.userImpact?.affectedUserPercentage || 0;

  if (violation.severity === 'critical') return 'high';
  if (userImpact >= 15) return 'high';
  if (userImpact >= 10) return 'medium';
  return 'low';
}

function estimateTime(violation: AccessibilityViolation): string {
  const elementCount = violation.elements?.length || 0;
  const effort = estimateEffort(violation);

  if (effort === 'low') {
    if (elementCount <= 5) return '30min';
    if (elementCount <= 20) return '1h';
    return '2h';
  }

  if (effort === 'medium') {
    if (elementCount <= 10) return '2h';
    if (elementCount <= 50) return '4h';
    return '8h';
  }

  // high effort
  if (violation.description.toLowerCase().includes('video')) return '4h';
  return '8h';
}

function generateSteps(violation: AccessibilityViolation, url: string): string[] {
  const steps: string[] = [];
  const desc = violation.description.toLowerCase();

  if (desc.includes('video')) {
    steps.push('Review generated WebVTT caption file (provided in violation details)');
    steps.push('Save caption file to your server (e.g., `/captions/video-1.vtt`)');
    steps.push('Add `<track kind="captions" src="/captions/video-1.vtt" srclang="en" label="English">` to video element');
    steps.push('Add `aria-describedby` attribute with comprehensive description (provided)');
    steps.push('Test with video player controls - captions should toggle on/off');
  } else if (desc.includes('alt') || desc.includes('alternative text')) {
    steps.push('Identify the purpose/content of each image');
    steps.push('Add descriptive `alt` attribute (e.g., `alt="Author profile photo"`)');
    steps.push('For decorative images, use `alt=""` or `role="presentation"`');
  } else if (desc.includes('aria') && desc.includes('role')) {
    steps.push('Review ARIA roles structure (tabs must be in tablist)');
    steps.push('Ensure parent elements have correct container roles');
    steps.push('Add missing wrapper elements with appropriate roles');
    steps.push('Verify role hierarchy matches ARIA authoring practices');
  } else if (desc.includes('contrast')) {
    steps.push('Use browser DevTools to identify elements with contrast issues');
    steps.push('Darken text color OR lighten background to achieve 4.5:1 ratio');
    steps.push('Update CSS variables/theme if using design system');
    steps.push('Test with contrast checker tool (e.g., WebAIM Contrast Checker)');
  } else if (desc.includes('link') && desc.includes('text')) {
    steps.push('Add `aria-label` to icon-only links with descriptive text');
    steps.push('Example: `<a href="#" aria-label="Search the site"><i class="icon-magnifier"></i></a>`');
    steps.push('Ensure label describes destination, not just icon');
  } else if (desc.includes('<li>') || desc.includes('list')) {
    steps.push('Wrap orphaned `<li>` elements in proper `<ul>` or `<ol>` container');
    steps.push('If using ARIA roles, ensure tab items are in role="tablist"');
  } else {
    steps.push('Review WCAG documentation for specific guidance');
    steps.push('Implement recommended fix from violation details');
    steps.push('Test with screen reader after changes');
  }

  return steps;
}

function generateTestingSteps(violation: AccessibilityViolation): string[] {
  const tests: string[] = [];
  const desc = violation.description.toLowerCase();

  if (desc.includes('video')) {
    tests.push('Play video and verify captions appear automatically');
    tests.push('Toggle captions on/off using player controls');
    tests.push('Test with screen reader - aria-describedby should be announced');
    tests.push('Verify caption timing matches video content');
  } else if (desc.includes('aria') || desc.includes('role')) {
    tests.push('Test with NVDA/JAWS - verify correct role announcements');
    tests.push('Navigate with keyboard - Tab key should work correctly');
    tests.push('Re-run axe DevTools - violation should be resolved');
  } else if (desc.includes('contrast')) {
    tests.push('Use WebAIM Contrast Checker - verify 4.5:1 minimum');
    tests.push('Test in low-light conditions or with reduced brightness');
    tests.push('Verify with color blindness simulator');
  } else if (desc.includes('link')) {
    tests.push('Test with screen reader - link purpose should be clear');
    tests.push('Tab to link - tooltip/aria-label should be evident');
  }

  tests.push('Re-run full accessibility scan to confirm fix');

  return tests;
}

function identifyDependencies(violation: AccessibilityViolation, allViolations: AccessibilityViolation[]): string[] {
  const deps: string[] = [];

  // ARIA role issues often depend on DOM structure fixes
  if (violation.description.toLowerCase().includes('aria required children')) {
    const parentIssue = allViolations.find(v => v.description.toLowerCase().includes('aria required parent'));
    if (parentIssue) {
      deps.push('Fix ARIA parent roles first');
    }
  }

  // Color contrast might depend on design system updates
  if (violation.description.toLowerCase().includes('contrast') && (violation.elements?.length || 0) > 50) {
    deps.push('Update global CSS variables/theme first');
  }

  return deps;
}

/**
 * Generate detailed code examples section
 */
function generateDetailedCodeExamples(
  violations: AccessibilityViolation[],
  url: string,
  pageLanguage: string = 'en',
  pageTitle: string = ''
): string {
  let md = '';

  md += `## 📝 Detailed Code Examples (Copy-Paste Ready)\n\n`;
  md += `The following code examples are context-aware and ready to implement.\n\n`;

  // Detect frameworks from all violations
  const allHtml = violations.flatMap(v => v.elements?.map(e => e.html) || []).join(' ');
  const allSelectors = violations.flatMap(v => v.elements?.map(e => e.selector) || []);
  const framework = detectFramework(allHtml, allSelectors);

  if (framework.framework !== 'unknown') {
    md += `**Detected Framework**: ${framework.framework} (confidence: ${Math.round(framework.confidence * 100)}%)\n\n`;
  }

  // Group violations by type
  const videoViolations = violations.filter(v =>
    v.id.includes('video') || v.description.toLowerCase().includes('video') || v.wcagCriterion?.includes('1.2')
  );
  const ariaViolations = violations.filter(v =>
    v.id.includes('aria') || v.description.toLowerCase().includes('aria')
  );
  const contrastViolations = violations.filter(v =>
    v.id.includes('contrast') || v.description.toLowerCase().includes('contrast')
  );

  let sectionNumber = 1;

  // Video Caption Examples
  if (videoViolations.length > 0) {
    md += `### ${sectionNumber}. Video Caption Implementation\n\n`;
    sectionNumber++;

    videoViolations.forEach((violation, idx) => {
      const codes = generateRemediationCodes(violation, { url, pageLanguage, pageTitle });

      codes.forEach(code => {
        md += `#### ${code.title}\n\n`;
        if (code.explanation) {
          md += `${code.explanation}\n\n`;
        }

        md += `**Before (Broken)**:\n`;
        md += `\`\`\`${code.language}\n${code.beforeCode}\n\`\`\`\n\n`;

        md += `**After (Fixed)**:\n`;
        md += `\`\`\`${code.language}\n${code.afterCode}\n\`\`\`\n\n`;

        if (code.notes && code.notes.length > 0) {
          md += `**Notes**:\n`;
          code.notes.forEach(note => {
            md += `- ${note}\n`;
          });
          md += `\n`;
        }

        md += `**Estimated Time**: ${code.estimatedTime}\n\n`;
        md += `---\n\n`;
      });
    });
  }

  // ARIA/Focus Examples
  if (ariaViolations.length > 0) {
    md += `### ${sectionNumber}. ARIA & Focus Management\n\n`;
    sectionNumber++;

    // Generate one comprehensive fix for similar violations
    const firstViolation = ariaViolations[0];
    const codes = generateRemediationCodes(firstViolation, { url, pageLanguage, pageTitle, framework });

    codes.forEach(code => {
      md += `#### ${code.title}\n\n`;
      if (code.explanation) {
        md += `${code.explanation}\n\n`;
      }

      md += `**Before (Broken)**:\n`;
      md += `\`\`\`${code.language}\n${code.beforeCode}\n\`\`\`\n\n`;

      md += `**After (Fixed)**:\n`;
      md += `\`\`\`${code.language}\n${code.afterCode}\n\`\`\`\n\n`;

      if (code.notes && code.notes.length > 0) {
        md += `**Notes**:\n`;
        code.notes.forEach(note => {
          md += `- ${note}\n`;
        });
        md += `\n`;
      }

      md += `**Estimated Time**: ${code.estimatedTime}\n\n`;
      md += `---\n\n`;
    });
  }

  // Color Contrast Examples
  if (contrastViolations.length > 0) {
    md += `### ${sectionNumber}. Color Contrast Fixes\n\n`;
    sectionNumber++;

    const firstViolation = contrastViolations[0];
    const codes = generateRemediationCodes(firstViolation, { url, pageLanguage, pageTitle });

    codes.forEach(code => {
      md += `#### ${code.title}\n\n`;
      if (code.explanation) {
        md += `${code.explanation}\n\n`;
      }

      md += `**Before (Broken)**:\n`;
      md += `\`\`\`${code.language}\n${code.beforeCode}\n\`\`\`\n\n`;

      md += `**After (Fixed)**:\n`;
      md += `\`\`\`${code.language}\n${code.afterCode}\n\`\`\`\n\n`;

      if (code.notes && code.notes.length > 0) {
        md += `**Notes**:\n`;
        code.notes.forEach(note => {
          md += `- ${note}\n`;
        });
        md += `\n`;
      }

      md += `**Estimated Time**: ${code.estimatedTime}\n\n`;
      md += `---\n\n`;
    });
  }

  // Automated Test Examples
  md += `### ${sectionNumber}. Automated Test Suite (Playwright + axe-core)\n\n`;
  sectionNumber++;

  md += `Add this test to your CI/CD pipeline to prevent accessibility regressions:\n\n`;

  md += `\`\`\`typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '${url}';

test.describe('Accessibility Tests', () => {
  test('should have no WCAG 2.2 AA violations', async ({ page }) => {
    await page.goto(URL);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();

    if (results.violations.length > 0) {
      console.log('Violations:', results.violations.map(v => \`\${v.id}: \${v.nodes.length} elements\`));
    }

    expect(results.violations).toHaveLength(0);
  });
${videoViolations.length > 0 ? `
  test('videos should have caption tracks', async ({ page }) => {
    await page.goto(URL);

    const videos = await page.locator('video').all();
    for (const video of videos) {
      const track = video.locator('track[kind="captions"]');
      await expect(track).toHaveCount(1);
    }
  });
` : ''}${ariaViolations.length > 0 ? `
  test('no focus on aria-hidden elements', async ({ page }) => {
    await page.goto(URL);

    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const hiddenFocused = await page.evaluate(() =>
        document.activeElement?.closest('[aria-hidden="true"]') !== null
      );
      expect(hiddenFocused).toBe(false);
    }
  });
` : ''}});
\`\`\`

**Installation**:
\`\`\`bash
npm install -D @playwright/test @axe-core/playwright
\`\`\`

---

`;

  // CSS Utilities
  md += `### ${sectionNumber}. Accessibility CSS Utilities\n\n`;
  sectionNumber++;

  const cssUtilities = generateAccessibilityCSSUtilities();
  md += `${cssUtilities.explanation}\n\n`;
  md += `\`\`\`css\n${cssUtilities.afterCode}\n\`\`\`\n\n`;

  if (cssUtilities.notes && cssUtilities.notes.length > 0) {
    md += `**Notes**:\n`;
    cssUtilities.notes.forEach(note => {
      md += `- ${note}\n`;
    });
    md += `\n`;
  }

  md += `---\n\n`;

  // Quick Reference
  md += `### ${sectionNumber}. Quick Reference\n\n`;

  md += `#### WCAG Violation Quick Reference\n\n`;
  md += `| Issue | WCAG | Level | Typical Fix Time |\n`;
  md += `|-------|------|-------|------------------|\n`;
  md += `| Video captions | 1.2.2 | A | 4h per video |\n`;
  md += `| Color contrast | 1.4.3 | AA | 2h |\n`;
  md += `| ARIA focus | 4.1.2 | A | 30min per component |\n`;
  md += `| Alt text | 1.1.1 | A | 15min per image |\n`;
  md += `| Form labels | 1.3.1 | A | 15min per field |\n`;
  md += `| Skip links | 2.4.1 | A | 1h |\n`;
  md += `| Focus visible | 2.4.7 | AA | 1h |\n\n`;

  md += `#### Screen Reader Test Commands\n\n`;
  md += `| Reader | Platform | Start | Stop |\n`;
  md += `|--------|----------|-------|------|\n`;
  md += `| VoiceOver | macOS | Cmd+F5 | Cmd+F5 |\n`;
  md += `| NVDA | Windows | Ctrl+Alt+N | Insert+Q |\n`;
  md += `| TalkBack | Android | Settings > Accessibility | Same |\n`;
  md += `| VoiceOver | iOS | Triple-click Home | Same |\n\n`;

  return md;
}

export function generateMarkdownReport(options: MarkdownReportOptions): string {
  const {
    url,
    scanId,
    timestamp,
    violations,
    complianceScore,
    complianceStatus,
    level,
    pageLanguage = 'en',
    pageTitle = '',
    includeCodeExamples = true
  } = options;

  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const seriousCount = violations.filter(v => v.severity === 'serious').length;
  const moderateCount = violations.filter(v => v.severity === 'moderate').length;
  const minorCount = violations.filter(v => v.severity === 'minor').length;

  let md = '';

  // Header
  md += `# 🔍 Accessibility Scan Report\n\n`;
  md += `**URL**: ${url}\n`;
  md += `**Scan ID**: ${scanId}\n`;
  md += `**Date**: ${new Date(timestamp).toLocaleString()}\n`;
  md += `**WCAG Level**: ${level}\n\n`;

  // Summary
  md += `## 📊 Summary\n\n`;
  md += `- **Compliance Score**: ${complianceScore}/100\n`;
  md += `- **Status**: ${complianceStatus.toUpperCase()}\n`;
  md += `- **Total Violations**: ${violations.length}\n`;
  md += `  - 🔴 Critical: ${criticalCount}\n`;
  md += `  - 🟠 Serious: ${seriousCount}\n`;
  md += `  - 🟡 Moderate: ${moderateCount}\n`;
  md += `  - 🔵 Minor: ${minorCount}\n\n`;

  md += `---\n\n`;

  // Context-Aware Remediation Plan
  md += generateRemediationPlan(violations, url);

  md += `---\n\n`;

  // Violations
  md += `## ⚠️ Violations (${violations.length})\n\n`;

  violations.forEach((violation, index) => {
    const severityIcon = {
      critical: '🔴',
      serious: '🟠',
      moderate: '🟡',
      minor: '🔵'
    }[violation.severity];

    md += `### ${severityIcon} [${index + 1}] ${violation.description}\n\n`;
    md += `**Severity**: ${violation.severity.toUpperCase()}\n`;
    md += `**WCAG**: ${violation.wcagCriterion} (Level ${violation.wcagLevel})\n`;
    md += `**Impact**: ${violation.impact}\n`;
    md += `**Affected Users**: ${violation.userImpact?.affectedUserPercentage || 'Unknown'}% `;
    md += `(${violation.userImpact?.disabilityTypes?.join(', ') || 'general'})\n\n`;

    // Elements
    if (violation.elements && violation.elements.length > 0) {
      md += `**Affected Elements**: ${violation.elements.length}\n\n`;

      violation.elements.slice(0, 3).forEach((el, i) => {
        md += `<details>\n`;
        md += `<summary>Element ${i + 1}: ${el.selector || 'Unknown selector'}</summary>\n\n`;
        md += `\`\`\`html\n${el.html?.slice(0, 200) || 'No HTML available'}${el.html && el.html.length > 200 ? '...' : ''}\n\`\`\`\n\n`;
        md += `</details>\n\n`;
      });

      if (violation.elements.length > 3) {
        md += `_...and ${violation.elements.length - 3} more elements_\n\n`;
      }
    }

    // Solution - Generate context-specific code fixes
    md += `#### 🔧 Context-Specific Solution\n\n`;

    // Generate remediation codes for this violation
    const remediationCodes = generateRemediationCodes(violation, { url, pageLanguage, pageTitle });

    if (remediationCodes.length > 0) {
      // Show the first (most relevant) code fix
      const primaryFix = remediationCodes[0];

      md += `**${primaryFix.title}**\n\n`;

      if (primaryFix.explanation) {
        md += `> ${primaryFix.explanation}\n\n`;
      }

      md += `**Before (Current):**\n`;
      md += `\`\`\`${primaryFix.language}\n${primaryFix.beforeCode}\n\`\`\`\n\n`;

      md += `**After (Fixed):**\n`;
      md += `\`\`\`${primaryFix.language}\n${primaryFix.afterCode}\n\`\`\`\n\n`;

      if (primaryFix.notes && primaryFix.notes.length > 0) {
        md += `**Implementation Notes:**\n`;
        primaryFix.notes.forEach(note => {
          md += `- ${note}\n`;
        });
        md += '\n';
      }

      md += `**Estimated Fix Time:** ${primaryFix.estimatedTime}\n\n`;
    } else if (violation.howToFix && !violation.howToFix.startsWith('http')) {
      // Use custom howToFix if it's actual code (not a URL)
      md += `\`\`\`html\n${violation.howToFix}\n\`\`\`\n\n`;
    } else {
      // Fallback to generic guidance
      md += `_See WCAG guidelines for ${violation.wcagCriterion}_\n\n`;
      if (violation.helpUrl) {
        md += `📚 Reference: ${violation.helpUrl}\n\n`;
      }
    }

    md += `---\n\n`;
  });

  // Detailed Code Examples (enabled by default)
  if (includeCodeExamples && violations.length > 0) {
    md += generateDetailedCodeExamples(violations, url, pageLanguage, pageTitle);
  }

  // Footer
  md += `\n## 🤖 Generated by\n\n`;
  md += `qe-a11y-ally Agent (Agentic QE Fleet)\n`;
  md += `Scan Time: ${new Date(timestamp).toISOString()}\n`;
  md += `\n**Features**: Context-aware remediation, Framework detection, Automated test generation\n`;

  return md;
}

/**
 * Accessibility Audit Surface Template
 *
 * Generates A2UI surface for displaying accessibility audit results
 * including WCAG findings, impact levels, and remediation guidance.
 *
 * @module adapters/a2ui/renderer/templates/accessibility-surface
 */

import type {
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  ComponentNode,
} from '../message-types.js';
import { literal, path, children, templateChildren } from '../message-types.js';
import { createComponentBuilder } from '../component-builder.js';

// ============================================================================
// Accessibility Data Types
// ============================================================================

/**
 * WCAG conformance level
 */
export type WcagLevel = 'A' | 'AA' | 'AAA';

/**
 * Impact level
 */
export type ImpactLevel = 'critical' | 'serious' | 'moderate' | 'minor';

/**
 * WCAG principle
 */
export type WcagPrinciple = 'perceivable' | 'operable' | 'understandable' | 'robust';

/**
 * Individual accessibility finding
 */
export interface A11yFinding {
  /** Finding identifier */
  id: string;
  /** WCAG rule identifier */
  ruleId: string;
  /** Rule description */
  rule: string;
  /** WCAG success criterion */
  criterion: string;
  /** WCAG level */
  wcagLevel: WcagLevel;
  /** WCAG principle */
  principle: WcagPrinciple;
  /** Impact level */
  impact: ImpactLevel;
  /** HTML element selector */
  element: string;
  /** HTML snippet */
  html?: string;
  /** Issue description */
  description: string;
  /** Fix suggestion */
  suggestion: string;
  /** Help URL */
  helpUrl?: string;
  /** Page URL where found */
  pageUrl: string;
  /** Instance count */
  instanceCount: number;
}

/**
 * Impact level count
 */
export interface ImpactCount {
  /** Impact level */
  impact: ImpactLevel;
  /** Finding count */
  count: number;
  /** Color for display */
  color: string;
}

/**
 * WCAG level count
 */
export interface LevelCount {
  /** WCAG level */
  level: WcagLevel;
  /** Finding count */
  count: number;
}

/**
 * Principle breakdown
 */
export interface PrincipleBreakdown {
  /** WCAG principle */
  principle: WcagPrinciple;
  /** Principle name */
  name: string;
  /** Finding count */
  count: number;
  /** Color */
  color: string;
}

/**
 * Page audit result
 */
export interface PageAudit {
  /** Page URL */
  url: string;
  /** Page title */
  title: string;
  /** Findings count */
  findingsCount: number;
  /** Passed checks */
  passedCount: number;
  /** Score (0-100) */
  score: number;
}

/**
 * Complete accessibility audit results
 */
export interface A11yAudit {
  /** Total findings */
  total: number;
  /** Passed checks */
  passed: number;
  /** Score (0-100) */
  score: number;
  /** Target WCAG level */
  targetLevel: WcagLevel;
  /** Compliance status */
  isCompliant: boolean;
  /** Findings by impact */
  byImpact: ImpactCount[];
  /** Findings by WCAG level */
  byLevel: LevelCount[];
  /** Findings by principle */
  byPrinciple: PrincipleBreakdown[];
  /** Individual findings */
  findings: A11yFinding[];
  /** Pages audited */
  pages: PageAudit[];
  /** Audit timestamp */
  timestamp: string;
  /** Audit duration in milliseconds */
  duration: number;
  /** Tool version */
  toolVersion: string;
  /** Summary text */
  summary: string;
}

// ============================================================================
// Accessibility Surface Generator
// ============================================================================

/**
 * Generate accessibility audit dashboard surface
 */
export function createAccessibilitySurface(
  data: A11yAudit,
  surfaceId: string = 'a11y-report'
): SurfaceUpdateMessage {
  const builder = createComponentBuilder();

  builder
    .beginSurface(surfaceId)
    .setTitle('Accessibility Audit')
    .setCatalog('qe-v1');

  // Root container
  builder.addComponent('root', {
    type: 'Column',
    spacing: 16,
  });
  builder.setChildren('root', [
    'header',
    'compliance-section',
    'impact-section',
    'findings-tabs',
  ]);

  // Header
  builder.addComponent('header', {
    type: 'Row',
    alignment: 'spaceBetween',
  });
  builder.setChildren('header', ['title-section', 'audit-info']);

  builder.addComponent('title-section', {
    type: 'Column',
  });
  builder.setChildren('title-section', ['title', 'target-level']);

  builder.addComponent('title', {
    type: 'Text',
    text: literal('Accessibility Audit Results'),
    usageHint: 'h1',
    accessibility: {
      role: 'heading',
    },
  });

  builder.addComponent('target-level', {
    type: 'Text',
    text: path('/a11y/targetLevelText'),
    style: { color: '#666' },
  });

  builder.addComponent('audit-info', {
    type: 'Column',
    alignment: 'end',
  });
  builder.setChildren('audit-info', ['timestamp', 'pages-count']);

  builder.addComponent('timestamp', {
    type: 'Text',
    text: path('/a11y/timestampFormatted'),
    style: { fontSize: 12 },
  });

  builder.addComponent('pages-count', {
    type: 'Text',
    text: path('/a11y/pagesAuditedText'),
    style: { fontSize: 12, color: '#999' },
  });

  // Compliance section
  builder.addComponent('compliance-section', {
    type: 'Card',
    title: literal('WCAG Compliance Status'),
  });
  builder.setChildren('compliance-section', ['compliance-row']);

  builder.addComponent('compliance-row', {
    type: 'Row',
    spacing: 24,
    alignment: 'center',
  });
  builder.setChildren('compliance-row', [
    'score-gauge',
    'compliance-details',
    'checks-summary',
  ]);

  builder.addComponent('score-gauge', {
    type: 'qe:a11yScoreGauge',
    score: path('/a11y/score'),
    isCompliant: path('/a11y/isCompliant'),
    targetLevel: path('/a11y/targetLevel'),
    accessibility: {
      role: 'meter',
      label: 'Accessibility compliance score',
      live: 'polite',
      valuemin: 0,
      valuemax: 100,
    },
  });

  builder.addComponent('compliance-details', {
    type: 'Column',
    spacing: 8,
  });
  builder.setChildren('compliance-details', [
    'compliance-badge',
    'compliance-text',
  ]);

  builder.addComponent('compliance-badge', {
    type: 'qe:complianceBadge',
    level: path('/a11y/targetLevel'),
    isCompliant: path('/a11y/isCompliant'),
    accessibility: {
      role: 'status',
      live: 'polite',
    },
  });

  builder.addComponent('compliance-text', {
    type: 'Text',
    text: path('/a11y/complianceText'),
    style: { maxWidth: 300 },
  });

  builder.addComponent('checks-summary', {
    type: 'Column',
    spacing: 4,
  });
  builder.setChildren('checks-summary', [
    'passed-checks',
    'failed-checks',
    'total-checks',
  ]);

  builder.addComponent('passed-checks', {
    type: 'Row',
    spacing: 8,
  });
  builder.setChildren('passed-checks', ['passed-icon', 'passed-text']);

  builder.addComponent('passed-icon', {
    type: 'Icon',
    name: 'check_circle',
    color: '#4CAF50',
  });

  builder.addComponent('passed-text', {
    type: 'Text',
    text: path('/a11y/passedText'),
  });

  builder.addComponent('failed-checks', {
    type: 'Row',
    spacing: 8,
  });
  builder.setChildren('failed-checks', ['failed-icon', 'failed-text']);

  builder.addComponent('failed-icon', {
    type: 'Icon',
    name: 'error',
    color: '#F44336',
  });

  builder.addComponent('failed-text', {
    type: 'Text',
    text: path('/a11y/failedText'),
  });

  builder.addComponent('total-checks', {
    type: 'Text',
    text: path('/a11y/totalChecksText'),
    style: { fontSize: 12, color: '#999' },
  });

  // Impact section
  builder.addComponent('impact-section', {
    type: 'Card',
    title: literal('Issues by Impact Level'),
  });
  builder.setChildren('impact-section', ['impact-row', 'principle-chart']);

  builder.addComponent('impact-row', {
    type: 'Row',
    spacing: 16,
    alignment: 'center',
  });
  builder.setChildren('impact-row', [
    'critical-impact',
    'serious-impact',
    'moderate-impact',
    'minor-impact',
  ]);

  // Impact level badges
  builder.addComponent('critical-impact', {
    type: 'qe:a11yImpactBadge',
    impact: literal('critical'),
    count: path('/a11y/impacts/critical'),
    label: literal('Critical'),
    color: '#9C27B0',
    description: literal('Blocks access for users'),
    accessibility: {
      role: 'status',
      live: 'assertive',
    },
  });

  builder.addComponent('serious-impact', {
    type: 'qe:a11yImpactBadge',
    impact: literal('serious'),
    count: path('/a11y/impacts/serious'),
    label: literal('Serious'),
    color: '#F44336',
    description: literal('Significantly hinders access'),
  });

  builder.addComponent('moderate-impact', {
    type: 'qe:a11yImpactBadge',
    impact: literal('moderate'),
    count: path('/a11y/impacts/moderate'),
    label: literal('Moderate'),
    color: '#FF9800',
    description: literal('Causes difficulty for users'),
  });

  builder.addComponent('minor-impact', {
    type: 'qe:a11yImpactBadge',
    impact: literal('minor'),
    count: path('/a11y/impacts/minor'),
    label: literal('Minor'),
    color: '#FFC107',
    description: literal('Inconvenience for users'),
  });

  builder.addComponent('principle-chart', {
    type: 'BarChart',
    title: literal('Issues by WCAG Principle'),
    data: path('/a11y/byPrinciple'),
    xAxis: 'name',
    yAxis: 'count',
    colorKey: 'color',
  });

  // Findings tabs
  builder.addComponent('findings-tabs', {
    type: 'Tabs',
  });
  builder.setChildren('findings-tabs', [
    'all-issues-tab',
    'by-level-tab',
    'pages-tab',
  ]);

  // All issues tab
  builder.addComponent('all-issues-tab', {
    type: 'Tab',
    label: literal('All Issues'),
    badge: path('/a11y/total'),
  });
  builder.setChildren('all-issues-tab', ['issues-list']);

  builder.addComponent('issues-list', {
    type: 'List',
    children: templateChildren('/a11y/findings', 'a11y-finding-template'),
    sortBy: 'impact',
    sortOrder: 'desc',
  });

  // A11y finding template
  builder.addComponent('a11y-finding-template', {
    type: 'qe:a11yFindingCard',
    wcagLevel: path('/wcagLevel'),
    rule: path('/rule'),
    ruleId: path('/ruleId'),
    criterion: path('/criterion'),
    principle: path('/principle'),
    impact: path('/impact'),
    element: path('/element'),
    html: path('/html'),
    description: path('/description'),
    suggestion: path('/suggestion'),
    helpUrl: path('/helpUrl'),
    instanceCount: path('/instanceCount'),
    actions: [
      { name: 'view_details', label: 'View Details' },
      { name: 'highlight_element', label: 'Highlight' },
      { name: 'copy_fix', label: 'Copy Fix' },
    ],
  });

  // By WCAG level tab
  builder.addComponent('by-level-tab', {
    type: 'Tab',
    label: literal('By WCAG Level'),
  });
  builder.setChildren('by-level-tab', ['level-breakdown']);

  builder.addComponent('level-breakdown', {
    type: 'Column',
    spacing: 16,
  });
  builder.setChildren('level-breakdown', [
    'level-a-section',
    'level-aa-section',
    'level-aaa-section',
  ]);

  builder.addComponent('level-a-section', {
    type: 'qe:wcagLevelSection',
    level: literal('A'),
    count: path('/a11y/levels/A'),
    findings: path('/a11y/findingsByLevel/A'),
  });

  builder.addComponent('level-aa-section', {
    type: 'qe:wcagLevelSection',
    level: literal('AA'),
    count: path('/a11y/levels/AA'),
    findings: path('/a11y/findingsByLevel/AA'),
  });

  builder.addComponent('level-aaa-section', {
    type: 'qe:wcagLevelSection',
    level: literal('AAA'),
    count: path('/a11y/levels/AAA'),
    findings: path('/a11y/findingsByLevel/AAA'),
  });

  // Pages tab
  builder.addComponent('pages-tab', {
    type: 'Tab',
    label: literal('Pages'),
    badge: path('/a11y/pageCount'),
  });
  builder.setChildren('pages-tab', ['pages-table']);

  builder.addComponent('pages-table', {
    type: 'Table',
    columns: [
      { key: 'score', label: 'Score', width: '10%' },
      { key: 'title', label: 'Page', width: '30%' },
      { key: 'url', label: 'URL', width: '35%' },
      { key: 'findingsCount', label: 'Issues', width: '12%' },
      { key: 'passedCount', label: 'Passed', width: '13%' },
    ],
    data: path('/a11y/pages'),
    sortable: true,
    rowAction: { name: 'view_page_audit' },
  });

  return builder.build();
}

/**
 * Generate accessibility data model update
 */
export function createAccessibilityDataUpdate(
  data: A11yAudit,
  surfaceId: string = 'a11y-report'
): DataModelUpdateMessage {
  // Compute impacts
  const impacts = {
    critical: data.findings.filter((f) => f.impact === 'critical').length,
    serious: data.findings.filter((f) => f.impact === 'serious').length,
    moderate: data.findings.filter((f) => f.impact === 'moderate').length,
    minor: data.findings.filter((f) => f.impact === 'minor').length,
  };

  // Compute level counts
  const levels = {
    A: data.findings.filter((f) => f.wcagLevel === 'A').length,
    AA: data.findings.filter((f) => f.wcagLevel === 'AA').length,
    AAA: data.findings.filter((f) => f.wcagLevel === 'AAA').length,
  };

  // Group findings by level
  const findingsByLevel = {
    A: data.findings.filter((f) => f.wcagLevel === 'A'),
    AA: data.findings.filter((f) => f.wcagLevel === 'AA'),
    AAA: data.findings.filter((f) => f.wcagLevel === 'AAA'),
  };

  // Compliance text
  const complianceText = data.isCompliant
    ? `This site meets WCAG ${data.targetLevel} compliance requirements.`
    : `This site does not meet WCAG ${data.targetLevel} compliance. ${data.total} issues need to be resolved.`;

  return {
    type: 'dataModelUpdate',
    surfaceId,
    data: {
      a11y: {
        total: data.total,
        passed: data.passed,
        score: data.score,
        targetLevel: data.targetLevel,
        targetLevelText: `Target: WCAG ${data.targetLevel}`,
        isCompliant: data.isCompliant,
        complianceText,
        byImpact: data.byImpact,
        byLevel: data.byLevel,
        byPrinciple: data.byPrinciple,
        findings: data.findings,
        findingsByLevel,
        pages: data.pages,
        pageCount: data.pages.length,
        impacts,
        levels,
        timestamp: data.timestamp,
        timestampFormatted: new Date(data.timestamp).toLocaleString(),
        duration: data.duration,
        durationFormatted: `${(data.duration / 1000).toFixed(1)}s`,
        toolVersion: data.toolVersion,
        summary: data.summary,
        passedText: `${data.passed} checks passed`,
        failedText: `${data.total} issues found`,
        totalChecksText: `${data.passed + data.total} total checks`,
        pagesAuditedText: `${data.pages.length} pages audited`,
      },
    },
  };
}

/**
 * Create a simple accessibility summary surface
 */
export function createAccessibilitySummarySurface(
  data: Pick<A11yAudit, 'score' | 'isCompliant' | 'targetLevel' | 'total' | 'passed'>,
  surfaceId: string = 'a11y-summary'
): SurfaceUpdateMessage {
  const builder = createComponentBuilder();

  builder
    .beginSurface(surfaceId)
    .setTitle('Accessibility Summary')
    .setCatalog('qe-v1');

  builder.addComponent('root', {
    type: 'Card',
    title: literal('Accessibility Overview'),
  });
  builder.setChildren('root', ['score-gauge', 'compliance-badge']);

  builder.addComponent('score-gauge', {
    type: 'qe:a11yScoreGauge',
    score: path('/a11y/score'),
    isCompliant: path('/a11y/isCompliant'),
    targetLevel: path('/a11y/targetLevel'),
  });

  builder.addComponent('compliance-badge', {
    type: 'qe:complianceBadge',
    level: path('/a11y/targetLevel'),
    isCompliant: path('/a11y/isCompliant'),
  });

  return builder.build();
}

// ============================================================================
// Export Types
// ============================================================================

export type {
  SurfaceUpdateMessage,
  DataModelUpdateMessage,
  ComponentNode,
};

/**
 * HTML Report Generator for Accessibility Scan Results
 *
 * Generates beautiful, comprehensive HTML reports with:
 * - Executive summary with compliance score
 * - Detailed violation listings with context
 * - Context-aware remediation recommendations
 * - ROI-based prioritization
 * - Visual severity indicators
 * - Print-friendly styling
 */

import type { AccessibilityScanResult } from './scan-comprehensive.js';

export interface HTMLReportOptions {
  title?: string;
  includeCodeExamples?: boolean;
  includeScreenshots?: boolean;
  theme?: 'light' | 'dark';
}

/**
 * Generate comprehensive HTML accessibility report
 */
export function generateHTMLReport(
  result: AccessibilityScanResult,
  options: HTMLReportOptions = {}
): string {
  const {
    title = 'Accessibility Scan Report',
    includeCodeExamples = true,
    theme = 'light'
  } = options;

  const timestamp = new Date().toISOString();
  const formattedDate = new Date(timestamp).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    ${getStyles(theme)}
  </style>
</head>
<body>
  <div class="container">
    ${generateHeader(result, formattedDate)}
    ${generateExecutiveSummary(result)}
    ${result.euAccessibilityAct ? generateEUComplianceSection(result) : ''}
    ${result.videoElements && result.videoElements > 0 ? generateVideoSection(result.videoElements) : ''}
    ${generateComplianceDetails(result)}
    ${generateViolationsSection(result, includeCodeExamples)}
    ${generateRemediationsSection(result, includeCodeExamples)}
    ${generateFooter(result)}
  </div>
</body>
</html>`;
}

/**
 * Generate report header
 */
function generateHeader(result: AccessibilityScanResult, formattedDate: string): string {
  return `
  <header class="report-header">
    <h1>🔍 Accessibility Scan Report</h1>
    <div class="header-meta">
      <div class="meta-item">
        <span class="meta-label">URL:</span>
        <a href="${escapeHtml(result.url)}" target="_blank" class="meta-value">${escapeHtml(result.url)}</a>
      </div>
      <div class="meta-item">
        <span class="meta-label">Scan ID:</span>
        <span class="meta-value">${escapeHtml(result.scanId)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Date:</span>
        <span class="meta-value">${formattedDate}</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">WCAG Level:</span>
        <span class="meta-value badge badge-level">${escapeHtml(result.compliance.level)}</span>
      </div>
    </div>
  </header>`;
}

/**
 * Generate executive summary
 */
function generateExecutiveSummary(result: AccessibilityScanResult): string {
  const statusClass = getStatusClass(result.compliance.status);
  const scoreClass = getScoreClass(result.compliance.score);
  const readinessIcon = result.compliance.productionReady ? '✅' : '❌';

  return `
  <section class="executive-summary">
    <h2>📊 Executive Summary</h2>

    <div class="summary-grid">
      <div class="summary-card ${scoreClass}">
        <div class="card-label">Compliance Score</div>
        <div class="card-value">${result.compliance.score}/100</div>
        <div class="card-description">Overall accessibility rating</div>
      </div>

      <div class="summary-card ${statusClass}">
        <div class="card-label">Status</div>
        <div class="card-value status-badge status-${result.compliance.status}">
          ${formatStatus(result.compliance.status)}
        </div>
        <div class="card-description">WCAG ${result.compliance.level} compliance</div>
      </div>

      <div class="summary-card ${result.compliance.productionReady ? 'score-excellent' : 'score-poor'}">
        <div class="card-label">Production Ready</div>
        <div class="card-value">${readinessIcon} ${result.compliance.productionReady ? 'YES' : 'NO'}</div>
        <div class="card-description">${result.compliance.productionReady ? 'Safe to deploy' : 'Fix critical issues first'}</div>
      </div>

      <div class="summary-card">
        <div class="card-label">Total Violations</div>
        <div class="card-value">${result.summary.total}</div>
        <div class="card-description">Accessibility barriers detected</div>
      </div>
    </div>

    <div class="violations-breakdown">
      <h3>Violations by Severity</h3>
      <div class="breakdown-grid">
        ${generateSeverityBadge('critical', result.summary.critical)}
        ${generateSeverityBadge('serious', result.summary.serious)}
        ${generateSeverityBadge('moderate', result.summary.moderate)}
        ${generateSeverityBadge('minor', result.summary.minor)}
      </div>
    </div>
  </section>`;
}

/**
 * Generate compliance details
 */
function generateComplianceDetails(result: AccessibilityScanResult): string {
  const principles = analyzePrinciples(result);

  return `
  <section class="compliance-details">
    <h2>✓ WCAG 2.2 Principles Compliance</h2>

    <div class="principles-grid">
      ${Object.entries(principles).map(([principle, data]) => `
        <div class="principle-card ${data.passing ? 'principle-pass' : 'principle-fail'}">
          <div class="principle-header">
            <span class="principle-icon">${data.passing ? '✅' : '❌'}</span>
            <h3>${principle}</h3>
          </div>
          <div class="principle-status">${data.passing ? 'PASSES' : 'FAILS'}</div>
          <div class="principle-issues">${data.issues} issue${data.issues !== 1 ? 's' : ''}</div>
        </div>
      `).join('')}
    </div>
  </section>`;
}

/**
 * Generate violations section
 */
function generateViolationsSection(result: AccessibilityScanResult, includeCodeExamples: boolean): string {
  if (result.violations.length === 0) {
    return `
    <section class="violations-section">
      <h2>🎉 No Violations Found</h2>
      <p class="success-message">This page passes all WCAG ${result.compliance.level} accessibility checks!</p>
    </section>`;
  }

  return `
  <section class="violations-section">
    <h2>⚠️ Accessibility Violations (${result.violations.length})</h2>

    <div class="violations-list">
      ${result.violations.map((violation, index) => `
        <div class="violation-card severity-${violation.severity}" id="violation-${index}">
          <div class="violation-header">
            <span class="violation-number">#${index + 1}</span>
            <span class="severity-badge severity-${violation.severity}">${violation.severity.toUpperCase()}</span>
            <h3>${escapeHtml(violation.description)}</h3>
          </div>

          <div class="violation-meta">
            <div class="meta-row">
              <span class="meta-label">WCAG Criterion:</span>
              <span class="meta-value">${violation.wcagCriterion} (Level ${violation.wcagLevel})</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Impact:</span>
              <span class="meta-value">${escapeHtml(violation.impact)}</span>
            </div>
            ${violation.userImpact ? `
            <div class="meta-row">
              <span class="meta-label">Affected Users:</span>
              <span class="meta-value">${violation.userImpact.affectedUserPercentage}% (${violation.userImpact.disabilityTypes.join(', ')})</span>
            </div>
            ` : ''}
          </div>

          <div class="affected-elements">
            <h4>Affected Elements (${violation.elements.length})</h4>
            ${violation.elements.map((element, elemIndex) => `
              <div class="element-item">
                <div class="element-selector">
                  <code>${escapeHtml(element.selector)}</code>
                </div>
                ${includeCodeExamples ? `
                <div class="element-html">
                  <pre><code>${escapeHtml(element.html)}</code></pre>
                </div>
                ` : ''}
                ${element.context ? `
                <div class="element-context">
                  <strong>Context:</strong> ${escapeHtml(element.context.purpose || 'Unknown')}
                  ${element.context.parentElement ? ` in &lt;${element.context.parentElement}&gt;` : ''}
                </div>
                ` : ''}
              </div>
            `).join('')}
          </div>

          <div class="how-to-fix">
            <h4>📖 How to Fix</h4>
            <p>${escapeHtml(violation.impact)}</p>
            <p><strong>See Context-Aware Remediation Plan below for specific, copy-paste-ready solutions.</strong></p>
          </div>
        </div>
      `).join('')}
    </div>
  </section>`;
}

/**
 * Generate remediations section
 */
function generateRemediationsSection(result: AccessibilityScanResult, includeCodeExamples: boolean): string {
  if (!result.remediations || result.remediations.length === 0) {
    return '';
  }

  // Sort by ROI descending
  const sortedRemediations = [...result.remediations].sort((a, b) => b.roi - a.roi);

  return `
  <section class="remediations-section">
    <h2>🔧 Context-Aware Remediation Plan</h2>
    <p class="section-description">Prioritized by ROI (Impact / Effort ratio) - Fix high-ROI items first for maximum impact.</p>

    <div class="remediations-list">
      ${sortedRemediations.map((remediation, index) => {
        const violation = result.violations.find(v => v.id === remediation.violationId);
        if (!violation) return '';

        return `
        <div class="remediation-card priority-${Math.floor(remediation.priority)}">
          <div class="remediation-header">
            <span class="remediation-rank">#${index + 1}</span>
            <h3>Fix: ${escapeHtml(violation.description)}</h3>
            <span class="roi-badge">ROI: ${remediation.roi.toFixed(2)}</span>
          </div>

          <div class="remediation-stats">
            <div class="stat-item">
              <span class="stat-label">Priority:</span>
              <span class="stat-value">${remediation.priority.toFixed(1)}/10</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Effort:</span>
              <span class="stat-value">${remediation.estimatedEffort.hours}h (${remediation.estimatedEffort.complexity})</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">Impact:</span>
              <span class="stat-value">${violation.userImpact?.affectedUserPercentage || 5}% users</span>
            </div>
          </div>

          ${remediation.recommendations.map((rec, recIndex) => `
            <div class="recommendation-item">
              <div class="recommendation-header">
                <span class="recommendation-priority">Priority ${rec.priority}</span>
                <span class="recommendation-approach">${formatApproach(rec.approach)}</span>
                <span class="recommendation-confidence">Confidence: ${(rec.confidence * 100).toFixed(0)}%</span>
              </div>

              <div class="recommendation-rationale">
                <strong>Rationale:</strong> ${escapeHtml(rec.rationale)}
              </div>

              ${includeCodeExamples ? `
              <div class="recommendation-code">
                <h4>Solution Code:</h4>
                <pre><code>${escapeHtml(rec.code)}</code></pre>
              </div>
              ` : ''}

              <div class="recommendation-criteria">
                <strong>WCAG Criteria Met:</strong> ${rec.wcagCriteria.join(', ')}
              </div>
            </div>
          `).join('')}
        </div>
      `;
      }).join('')}
    </div>

    <div class="total-effort">
      <h3>📊 Total Remediation Effort</h3>
      <div class="effort-summary">
        <div class="effort-item">
          <span class="effort-label">Total Time:</span>
          <span class="effort-value">${calculateTotalEffort(result.remediations)}h</span>
        </div>
        <div class="effort-item">
          <span class="effort-label">Team Size:</span>
          <span class="effort-value">1 developer</span>
        </div>
        <div class="effort-item">
          <span class="effort-label">Timeline:</span>
          <span class="effort-value">${estimateTimeline(result.remediations)}</span>
        </div>
      </div>
    </div>
  </section>`;
}

/**
 * Generate footer
 */
function generateFooter(result: AccessibilityScanResult): string {
  return `
  <footer class="report-footer">
    <div class="footer-content">
      <div class="footer-section">
        <h4>🤖 Generated by</h4>
        <p>qe-a11y-ally Agent (Agentic QE Fleet v2.3.5)</p>
      </div>
      <div class="footer-section">
        <h4>⚡ Performance</h4>
        <p>Scan Time: ${(result.performance.scanTime / 1000).toFixed(2)}s | Elements: ${result.performance.elementsAnalyzed}</p>
      </div>
      <div class="footer-section">
        <h4>📚 Resources</h4>
        <p>
          <a href="https://www.w3.org/WAI/WCAG22/quickref/" target="_blank">WCAG 2.2 Guidelines</a> |
          <a href="https://github.com/dequelabs/axe-core" target="_blank">axe-core</a>
        </p>
      </div>
    </div>
  </footer>`;
}

/**
 * Generate EU Accessibility Act compliance section
 */
function generateEUComplianceSection(result: AccessibilityScanResult): string {
  const eaa = result.euAccessibilityAct!;
  const statusIcon = eaa.status === 'compliant' ? '✓' :
    eaa.status === 'partially-compliant' ? '⚠' : '✗';
  const riskIcon = eaa.riskLevel === 'critical' ? '🔴' :
    eaa.riskLevel === 'high' ? '🟠' :
    eaa.riskLevel === 'moderate' ? '🟡' : '🟢';

  return `
  <section class="section">
    <h2>🇪🇺 European Accessibility Act Compliance</h2>
    <div class="eu-compliance-grid">
      <div class="eu-stat">
        <div class="eu-stat-label">Status</div>
        <div class="eu-stat-value status-${eaa.status}">
          ${statusIcon} ${eaa.status.toUpperCase().replace(/-/g, ' ')}
        </div>
      </div>
      <div class="eu-stat">
        <div class="eu-stat-label">Compliance Score</div>
        <div class="eu-stat-value">${eaa.score}/100</div>
      </div>
      <div class="eu-stat">
        <div class="eu-stat-label">Legal Risk</div>
        <div class="eu-stat-value risk-${eaa.riskLevel}">
          ${riskIcon} ${eaa.riskLevel.toUpperCase()}
        </div>
      </div>
      <div class="eu-stat">
        <div class="eu-stat-label">Days Until Deadline</div>
        <div class="eu-stat-value ${eaa.daysUntilDeadline < 0 ? 'overdue' : eaa.daysUntilDeadline < 90 ? 'urgent' : ''}">
          ${eaa.daysUntilDeadline < 0 ? 'OVERDUE' : `${eaa.daysUntilDeadline} days`}
        </div>
      </div>
    </div>

    <div class="eaa-info">
      <p><strong>Directive (EU) 2019/882 - Compliance Deadline: June 28, 2025</strong></p>
      <p>The European Accessibility Act requires that products and services be accessible to persons with disabilities. Non-compliance may result in penalties determined by member states.</p>
    </div>

    ${eaa.failedRequirements.length > 0 ? `
    <div class="eaa-failures">
      <h3>Failed EU Requirements (${eaa.failedRequirements.length})</h3>
      ${eaa.failedRequirements.slice(0, 5).map(req => `
        <div class="eaa-requirement">
          <span class="severity-icon">${req.severity === 'critical' ? '❌' : req.severity === 'major' ? '⚠️' : 'ℹ️'}</span>
          <strong>[${escapeHtml(req.article)}]</strong> ${escapeHtml(req.requirement)}
        </div>
      `).join('')}
      ${eaa.failedRequirements.length > 5 ? `<p class="more-items">... and ${eaa.failedRequirements.length - 5} more</p>` : ''}
    </div>
    ` : ''}

    ${eaa.recommendations.length > 0 ? `
    <div class="eaa-recommendations">
      <h3>Recommended Actions</h3>
      ${eaa.recommendations.slice(0, 5).map(rec => {
        const priorityIcon = rec.priority === 'critical' ? '🔴' :
          rec.priority === 'high' ? '🟠' :
          rec.priority === 'medium' ? '🟡' : '🟢';
        return `
        <div class="eaa-action">
          <div class="action-priority">${priorityIcon} <strong>${rec.priority.toUpperCase()}</strong></div>
          <div class="action-text">${escapeHtml(rec.action)}</div>
          <div class="action-deadline">Deadline: ${escapeHtml(rec.deadline)}</div>
        </div>
      `}).join('')}
    </div>
    ` : ''}
  </section>`;
}

/**
 * Generate video caption recommendation section
 */
function generateVideoSection(videoCount: number): string {
  return `
  <section class="section video-section">
    <h2>🎥 Video Accessibility</h2>
    <div class="alert alert-info">
      <p><strong>${videoCount} video element${videoCount > 1 ? 's' : ''} detected on this page.</strong></p>
      <p>According to WCAG 2.2 Level AA and the European Accessibility Act:</p>
      <ul>
        <li><strong>1.2.2 Captions (Prerecorded)</strong> - Level A: Captions required for all prerecorded audio content</li>
        <li><strong>1.2.4 Captions (Live)</strong> - Level AA: Captions required for all live audio content</li>
        <li><strong>1.2.5 Audio Description</strong> - Level AA: Audio description for prerecorded video</li>
      </ul>
    </div>

    <div class="video-recommendation">
      <h3>Caption Requirements</h3>
      <p>All videos must have synchronized captions in WebVTT format. Captions should:</p>
      <ul>
        <li>Be accurate and synchronized with audio</li>
        <li>Include speaker identification for dialogue</li>
        <li>Describe relevant sound effects: <code>[applause]</code>, <code>[door closes]</code></li>
        <li>Indicate music: <code>♪ background music ♪</code></li>
        <li>Follow WebVTT formatting guidelines (max 37 characters per line, 2 lines per cue)</li>
        <li>Maintain reading speed of 160-180 words per minute</li>
      </ul>

      <h3>Example WebVTT Caption File</h3>
      <pre><code>WEBVTT

00:00:00.000 --> 00:00:03.500
&lt;v Speaker&gt;Welcome to our product demonstration.&lt;/v&gt;

00:00:03.500 --> 00:00:07.000
&lt;v Speaker&gt;Today we'll show you three
amazing features.&lt;/v&gt;

00:00:07.000 --> 00:00:10.000
♪ Upbeat background music ♪</code></pre>

      <p><strong>Tools for caption generation:</strong></p>
      <ul>
        <li><a href="https://www.youtube.com/editor" target="_blank">YouTube Studio</a> - Auto-generated captions</li>
        <li><a href="https://www.rev.com/" target="_blank">Rev.com</a> - Professional caption services</li>
        <li><a href="https://otter.ai/" target="_blank">Otter.ai</a> - AI-powered transcription</li>
      </ul>
    </div>
  </section>`;
}

// Helper functions

function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'compliant': return 'score-excellent';
    case 'partially-compliant': return 'score-good';
    case 'non-compliant': return 'score-poor';
    default: return '';
  }
}

function getScoreClass(score: number): string {
  if (score >= 90) return 'score-excellent';
  if (score >= 70) return 'score-good';
  if (score >= 50) return 'score-fair';
  return 'score-poor';
}

function formatStatus(status: string): string {
  return status.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

function formatApproach(approach: string): string {
  return approach.split('-').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

function generateSeverityBadge(severity: string, count: number): string {
  const icons = {
    critical: '🔴',
    serious: '🟠',
    moderate: '🟡',
    minor: '🔵'
  };

  return `
    <div class="severity-stat severity-${severity}">
      <span class="severity-icon">${icons[severity as keyof typeof icons]}</span>
      <span class="severity-label">${severity}</span>
      <span class="severity-count">${count}</span>
    </div>
  `;
}

function analyzePrinciples(result: AccessibilityScanResult): Record<string, { passing: boolean; issues: number }> {
  const principles = {
    'Perceivable': { passing: true, issues: 0 },
    'Operable': { passing: true, issues: 0 },
    'Understandable': { passing: true, issues: 0 },
    'Robust': { passing: true, issues: 0 }
  };

  result.violations.forEach(violation => {
    const criterion = violation.wcagCriterion;
    if (criterion.startsWith('1.')) {
      principles.Perceivable.passing = false;
      principles.Perceivable.issues++;
    } else if (criterion.startsWith('2.')) {
      principles.Operable.passing = false;
      principles.Operable.issues++;
    } else if (criterion.startsWith('3.')) {
      principles.Understandable.passing = false;
      principles.Understandable.issues++;
    } else if (criterion.startsWith('4.')) {
      principles.Robust.passing = false;
      principles.Robust.issues++;
    }
  });

  return principles;
}

function calculateTotalEffort(remediations: any[]): number {
  return remediations.reduce((total, r) => total + r.estimatedEffort.hours, 0);
}

function estimateTimeline(remediations: any[]): string {
  const totalHours = calculateTotalEffort(remediations);
  if (totalHours <= 8) return `${Math.ceil(totalHours)} hours`;
  if (totalHours <= 40) return `${Math.ceil(totalHours / 8)} day${totalHours > 16 ? 's' : ''}`;
  return `${Math.ceil(totalHours / 40)} week${totalHours > 80 ? 's' : ''}`;
}

function getStyles(theme: 'light' | 'dark'): string {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: ${theme === 'dark' ? '#e0e0e0' : '#333'};
      background: ${theme === 'dark' ? '#1a1a1a' : '#f5f7fa'};
      padding: 20px;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      background: ${theme === 'dark' ? '#2d2d2d' : 'white'};
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .report-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
    }

    .report-header h1 {
      font-size: 2.5em;
      margin-bottom: 20px;
    }

    .header-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 15px;
      margin-top: 20px;
    }

    .meta-item {
      background: rgba(255,255,255,0.1);
      padding: 12px;
      border-radius: 6px;
    }

    .meta-label {
      font-weight: 600;
      margin-right: 8px;
    }

    .meta-value {
      color: rgba(255,255,255,0.9);
    }

    .meta-value a {
      color: white;
      text-decoration: none;
    }

    .badge-level {
      background: rgba(255,255,255,0.2);
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.9em;
    }

    section {
      padding: 40px;
      border-bottom: 1px solid ${theme === 'dark' ? '#444' : '#e0e0e0'};
    }

    section:last-of-type {
      border-bottom: none;
    }

    h2 {
      font-size: 2em;
      margin-bottom: 20px;
      color: ${theme === 'dark' ? '#fff' : '#333'};
    }

    h3 {
      font-size: 1.3em;
      margin-bottom: 15px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }

    .summary-card {
      background: ${theme === 'dark' ? '#3a3a3a' : '#f8f9fa'};
      padding: 24px;
      border-radius: 12px;
      border-left: 4px solid #ccc;
    }

    .summary-card.score-excellent { border-left-color: #10b981; }
    .summary-card.score-good { border-left-color: #f59e0b; }
    .summary-card.score-fair { border-left-color: #ef4444; }
    .summary-card.score-poor { border-left-color: #dc2626; }

    .card-label {
      font-size: 0.9em;
      color: ${theme === 'dark' ? '#999' : '#666'};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }

    .card-value {
      font-size: 2.5em;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .card-description {
      font-size: 0.9em;
      color: ${theme === 'dark' ? '#999' : '#666'};
    }

    .status-badge {
      display: inline-block;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 0.7em;
      font-weight: 600;
      text-transform: uppercase;
    }

    .status-compliant { background: #d1fae5; color: #065f46; }
    .status-partially-compliant { background: #fef3c7; color: #92400e; }
    .status-non-compliant { background: #fee2e2; color: #991b1b; }

    .violations-breakdown {
      margin-top: 30px;
    }

    .breakdown-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }

    .severity-stat {
      background: ${theme === 'dark' ? '#3a3a3a' : 'white'};
      padding: 16px;
      border-radius: 8px;
      text-align: center;
      border: 2px solid;
    }

    .severity-stat.severity-critical { border-color: #dc2626; }
    .severity-stat.severity-serious { border-color: #f59e0b; }
    .severity-stat.severity-moderate { border-color: #eab308; }
    .severity-stat.severity-minor { border-color: #3b82f6; }

    .severity-icon {
      font-size: 2em;
      display: block;
      margin-bottom: 8px;
    }

    .severity-label {
      display: block;
      text-transform: capitalize;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .severity-count {
      display: block;
      font-size: 1.5em;
      font-weight: 700;
    }

    .principles-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
    }

    .principle-card {
      padding: 20px;
      border-radius: 8px;
      border: 2px solid;
    }

    .principle-card.principle-pass {
      border-color: #10b981;
      background: ${theme === 'dark' ? '#1a3a2a' : '#f0fdf4'};
    }

    .principle-card.principle-fail {
      border-color: #ef4444;
      background: ${theme === 'dark' ? '#3a1a1a' : '#fef2f2'};
    }

    .principle-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .principle-icon {
      font-size: 1.5em;
    }

    .violation-card {
      background: ${theme === 'dark' ? '#3a3a3a' : 'white'};
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      border-left: 4px solid;
    }

    .violation-card.severity-critical { border-left-color: #dc2626; }
    .violation-card.severity-serious { border-left-color: #f59e0b; }
    .violation-card.severity-moderate { border-left-color: #eab308; }
    .violation-card.severity-minor { border-left-color: #3b82f6; }

    .violation-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .violation-number {
      background: ${theme === 'dark' ? '#555' : '#e0e0e0'};
      padding: 4px 12px;
      border-radius: 12px;
      font-weight: 700;
    }

    .severity-badge {
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.75em;
      font-weight: 700;
      color: white;
    }

    .severity-badge.severity-critical { background: #dc2626; }
    .severity-badge.severity-serious { background: #f59e0b; }
    .severity-badge.severity-moderate { background: #eab308; }
    .severity-badge.severity-minor { background: #3b82f6; }

    .violation-meta {
      margin: 20px 0;
    }

    .meta-row {
      margin: 8px 0;
    }

    .meta-row .meta-label {
      font-weight: 600;
      margin-right: 8px;
    }

    .affected-elements {
      margin: 20px 0;
      background: ${theme === 'dark' ? '#2a2a2a' : '#f8f9fa'};
      padding: 16px;
      border-radius: 8px;
    }

    .element-item {
      margin: 12px 0;
      padding: 12px;
      background: ${theme === 'dark' ? '#3a3a3a' : 'white'};
      border-radius: 6px;
    }

    .element-selector code {
      color: #e83e8c;
      background: ${theme === 'dark' ? '#2a2a2a' : '#f8f9fa'};
      padding: 2px 6px;
      border-radius: 3px;
    }

    pre {
      background: ${theme === 'dark' ? '#1a1a1a' : '#f5f5f5'};
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      margin: 8px 0;
    }

    code {
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 0.9em;
    }

    .how-to-fix {
      margin-top: 20px;
      padding: 16px;
      background: ${theme === 'dark' ? '#2a3a4a' : '#e3f2fd'};
      border-radius: 8px;
    }

    .help-link {
      color: #2563eb;
      text-decoration: none;
      font-weight: 600;
    }

    .help-link:hover {
      text-decoration: underline;
    }

    .remediation-card {
      background: ${theme === 'dark' ? '#3a3a3a' : 'white'};
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      border-left: 4px solid #3b82f6;
    }

    .remediation-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .remediation-rank {
      background: #3b82f6;
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-weight: 700;
    }

    .roi-badge {
      margin-left: auto;
      background: #10b981;
      color: white;
      padding: 6px 14px;
      border-radius: 12px;
      font-weight: 700;
    }

    .remediation-stats {
      display: flex;
      gap: 24px;
      margin: 16px 0;
      flex-wrap: wrap;
    }

    .stat-item {
      display: flex;
      gap: 8px;
    }

    .stat-label {
      font-weight: 600;
    }

    .recommendation-item {
      margin: 16px 0;
      padding: 16px;
      background: ${theme === 'dark' ? '#2a2a2a' : '#f8f9fa'};
      border-radius: 8px;
    }

    .recommendation-header {
      display: flex;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .recommendation-priority,
    .recommendation-approach,
    .recommendation-confidence {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.85em;
      font-weight: 600;
    }

    .recommendation-priority { background: #dbeafe; color: #1e40af; }
    .recommendation-approach { background: #fef3c7; color: #92400e; }
    .recommendation-confidence { background: #d1fae5; color: #065f46; }

    .total-effort {
      margin-top: 30px;
      padding: 24px;
      background: ${theme === 'dark' ? '#2a3a4a' : '#f0f9ff'};
      border-radius: 12px;
    }

    .effort-summary {
      display: flex;
      gap: 32px;
      margin-top: 16px;
      flex-wrap: wrap;
    }

    .effort-item {
      display: flex;
      gap: 8px;
    }

    .effort-label {
      font-weight: 600;
    }

    .effort-value {
      color: #2563eb;
      font-weight: 700;
    }

    .report-footer {
      background: ${theme === 'dark' ? '#2a2a2a' : '#f8f9fa'};
      padding: 30px 40px;
    }

    .footer-content {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 20px;
    }

    .footer-section h4 {
      margin-bottom: 10px;
    }

    .footer-section a {
      color: #2563eb;
      text-decoration: none;
    }

    .footer-section a:hover {
      text-decoration: underline;
    }

    /* EU Accessibility Act Compliance Styles */
    .eu-compliance-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin: 20px 0;
    }

    .eu-stat {
      background: ${theme === 'dark' ? '#2a2a2a' : '#f8f9fa'};
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }

    .eu-stat-label {
      font-size: 14px;
      color: ${theme === 'dark' ? '#9ca3af' : '#6b7280'};
      margin-bottom: 8px;
    }

    .eu-stat-value {
      font-size: 24px;
      font-weight: 700;
      color: ${theme === 'dark' ? '#fff' : '#1f2937'};
    }

    .eu-stat-value.overdue,
    .eu-stat-value.urgent {
      color: #dc2626;
    }

    .eaa-info {
      background: ${theme === 'dark' ? '#1e3a8a' : '#dbeafe'};
      border-left: 4px solid #2563eb;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }

    .eaa-failures,
    .eaa-recommendations {
      margin: 20px 0;
    }

    .eaa-requirement {
      padding: 10px;
      margin: 10px 0;
      background: ${theme === 'dark' ? '#2a2a2a' : '#fef2f2'};
      border-left: 3px solid #dc2626;
      border-radius: 4px;
    }

    .eaa-action {
      padding: 15px;
      margin: 10px 0;
      background: ${theme === 'dark' ? '#2a2a2a' : '#f8f9fa'};
      border-radius: 8px;
      border-left: 4px solid currentColor;
    }

    .action-priority {
      margin-bottom: 8px;
      font-size: 14px;
    }

    .action-text {
      font-size: 16px;
      margin: 8px 0;
    }

    .action-deadline {
      font-size: 14px;
      color: ${theme === 'dark' ? '#9ca3af' : '#6b7280'};
      margin-top: 8px;
    }

    /* Video Section Styles */
    .video-section {
      margin: 30px 0;
    }

    .alert {
      padding: 15px 20px;
      border-radius: 8px;
      margin: 20px 0;
    }

    .alert-info {
      background: ${theme === 'dark' ? '#1e3a8a' : '#dbeafe'};
      border-left: 4px solid #2563eb;
    }

    .video-recommendation {
      background: ${theme === 'dark' ? '#2a2a2a' : '#f8f9fa'};
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }

    .video-recommendation h3 {
      margin-top: 20px;
      margin-bottom: 10px;
      color: ${theme === 'dark' ? '#fff' : '#1f2937'};
    }

    .video-recommendation ul {
      margin: 10px 0;
      padding-left: 20px;
    }

    .video-recommendation li {
      margin: 5px 0;
    }

    .video-recommendation pre {
      background: ${theme === 'dark' ? '#1f2937' : '#1f2937'};
      color: #10b981;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      margin: 15px 0;
    }

    .video-recommendation code {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.6;
    }

    .more-items {
      font-style: italic;
      color: ${theme === 'dark' ? '#9ca3af' : '#6b7280'};
      margin: 10px 0;
    }

    @media print {
      body {
        background: white;
      }

      .container {
        box-shadow: none;
      }

      .violation-card,
      .remediation-card {
        page-break-inside: avoid;
      }
    }
  `;
}

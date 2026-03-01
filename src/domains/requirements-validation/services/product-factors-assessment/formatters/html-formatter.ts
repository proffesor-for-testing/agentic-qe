/**
 * HTML Formatter for Product Factors Assessor
 *
 * Generates interactive HTML reports matching the reference output format
 * with SFDIPOT categories, filterable tables, clarifying questions,
 * and collapsible sections.
 */

import {
  AssessmentOutput,
  AssessmentSummary,
  TestIdea,
  ClarifyingQuestion,
  HTSMCategory,
  Priority,
  AutomationFitness,
  CATEGORY_DESCRIPTIONS,
  CategoryAnalysis,
} from '../types';

import {
  BrutalHonestyFinding,
  BrutalHonestySeverity,
  BrutalHonestyMode,
  RequirementsQualityScore,
} from '../analyzers';

/**
 * Category metadata for HTML display
 */
const CATEGORY_METADATA: Record<HTSMCategory, { cssClass: string; description: string }> = {
  [HTSMCategory.STRUCTURE]: { cssClass: 'cat-structure', description: 'Test ideas for everything that comprises the physical product' },
  [HTSMCategory.FUNCTION]: { cssClass: 'cat-function', description: 'Test ideas for everything that the product does' },
  [HTSMCategory.DATA]: { cssClass: 'cat-data', description: 'Test ideas for everything the product processes' },
  [HTSMCategory.INTERFACES]: { cssClass: 'cat-interfaces', description: 'Test ideas for every conduit by which the product is accessed' },
  [HTSMCategory.PLATFORM]: { cssClass: 'cat-platform', description: 'Test ideas for everything on which the product depends that is outside the project' },
  [HTSMCategory.OPERATIONS]: { cssClass: 'cat-operations', description: 'Test ideas for how the product will be used' },
  [HTSMCategory.TIME]: { cssClass: 'cat-time', description: 'Test ideas for any relationship between the product and time' },
};

/**
 * Priority display labels
 */
const PRIORITY_LABELS: Record<Priority, string> = {
  [Priority.P0]: 'Critical',
  [Priority.P1]: 'High',
  [Priority.P2]: 'Medium',
  [Priority.P3]: 'Low',
};

/**
 * Automation fitness display labels
 */
const AUTOMATION_LABELS: Record<AutomationFitness, { label: string; cssClass: string }> = {
  [AutomationFitness.API]: { label: 'Automate on API level', cssClass: 'automation-api' },
  [AutomationFitness.Integration]: { label: 'Automate on Integration level', cssClass: 'automation-integration' },
  [AutomationFitness.E2E]: { label: 'Automate on E2E level', cssClass: 'automation-e2e' },
  [AutomationFitness.Human]: { label: 'Human testers must explore', cssClass: 'automation-human' },
  [AutomationFitness.Performance]: { label: 'Performance testing recommended', cssClass: 'automation-performance' },
  [AutomationFitness.Security]: { label: 'Security testing recommended', cssClass: 'automation-security' },
  [AutomationFitness.Visual]: { label: 'Visual regression testing', cssClass: 'automation-visual' },
  [AutomationFitness.Accessibility]: { label: 'Accessibility audit required', cssClass: 'automation-accessibility' },
  [AutomationFitness.Concurrency]: { label: 'Concurrency testing required', cssClass: 'automation-concurrency' },
};

export class HTMLFormatter {
  /**
   * Generate complete HTML report
   */
  format(output: AssessmentOutput, requirementsQuality?: RequirementsQualityScore, brutalHonestyFindings?: BrutalHonestyFinding[]): string {
    const generatedDate = new Date(output.summary.generatedAt).toISOString().split('T')[0];

    // Include Reality Check section if brutal honesty data is provided
    const realityCheckSection = (requirementsQuality || brutalHonestyFindings)
      ? this.renderRealityCheck(requirementsQuality, brutalHonestyFindings)
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Product Factors assessment of: ${this.escapeHtml(output.name)}</title>
  <style>
${this.getStyles()}
  </style>
  <script>
${this.getInitScript()}
  </script>
</head>
<body>
  <div class="container">
    ${this.renderHeader(output, generatedDate, requirementsQuality)}
    ${realityCheckSection}
    ${this.renderRiskBasedPrioritization(output)}
    ${this.renderChartsOverview(output)}
    ${this.renderTestIdeasByCategory(output)}
    ${this.renderTraceability(output)}
  </div>
</body>
</html>`;
  }

  /**
   * Render header section with meta info, TOC, and info sections
   */
  private renderHeader(output: AssessmentOutput, generatedDate: string, requirementsQuality?: RequirementsQualityScore): string {
    const categoryCounts = this.getCategoryCounts(output);

    // Add quality score badge if available
    const qualityBadge = requirementsQuality
      ? `<span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Requirements Quality: <strong class="${this.getQualityScoreClass(requirementsQuality.score)}">${requirementsQuality.score}/100</strong></span>`
      : '';

    // Add Reality Check link if quality data exists
    const realityCheckLink = requirementsQuality
      ? '<a href="#reality-check" style="background: #fef3c7; border-color: #f59e0b; color: #92400e;">Reality Check</a>'
      : '';

    return `
    <header>
      <h1>Product Factors assessment of: ${this.escapeHtml(output.name)}</h1>
      <div class="meta-inline" style="margin-top: 15px; padding: 10px 0; border-top: 1px solid rgba(255,255,255,0.2); font-size: 0.9rem; opacity: 0.9;">
        <span>Report generated on <strong>${generatedDate}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Total Test Ideas: <strong>${output.summary.totalTestIdeas}</strong></span>
        <span style="margin: 0 15px; opacity: 0.5;">|</span>
        <span>Product Factors covered: <strong>${this.getCoveredFactorsCount(output)}/7</strong></span>
        ${qualityBadge}
      </div>
      <nav class="toc" style="margin-top: 15px;">
        <div style="color: var(--text-muted); font-size: 0.85em; font-weight: 600; margin-bottom: 8px;">Quick Navigation</div>
        <div class="toc-nav">
          ${realityCheckLink}
          <a href="#risk">Prioritization</a>
          <a href="#charts">Overview</a>
          <span class="toc-divider">|</span>
          <span style="color: var(--text-muted); font-size: 0.85em; font-weight: 500;">Test Ideas:</span>
          ${Object.entries(categoryCounts).map(([cat, count]) =>
            `<a href="#${cat.toLowerCase()}">${cat.charAt(0) + cat.slice(1).toLowerCase()} <span class="count">${count}</span></a>`
          ).join('\n          ')}
          <span class="toc-divider">|</span>
          <a href="#traceability">Req. Traceability</a>
        </div>
      </nav>
      ${this.renderInfoSections()}
    </header>`;
  }

  /**
   * Get CSS class for quality score
   */
  private getQualityScoreClass(score: number): string {
    if (score >= 80) return 'quality-good';
    if (score >= 60) return 'quality-warning';
    if (score >= 40) return 'quality-poor';
    return 'quality-critical';
  }

  /**
   * Render collapsible info sections
   */
  private renderInfoSections(): string {
    return `
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 15px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How can this report help you?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <blockquote style="margin: 0 0 15px 0; padding: 12px 15px; border-left: 3px solid rgba(255,255,255,0.4); font-style: italic; opacity: 0.9;">
            "Requirements are not an end in themselves, but a means to an end—the end of providing value to some person(s)." <span style="opacity: 0.7;">— Jerry Weinberg</span>
          </blockquote>
          <p style="margin: 0 0 12px 0; opacity: 0.9; line-height: 1.7;">In the <a href="https://talesoftesting.com/wp-content/uploads/2022/10/Lalitkumar-Bhamare-Quality-Conscious-Software-Delivery-eBook.pdf" style="color: #93c5fd; text-decoration: underline;">QCSD framework</a>, it is recommended to conduct Product Coverage Sessions or Requirements Engineering Sessions on a regular basis. These sessions can be carried out at the epic level or for complex feature requests and user stories. Testers in the team can analyze the epic or feature story using SFDIPOT (a product factors checklist from <a href="https://www.satisfice.com/download/heuristic-test-strategy-model" style="color: #93c5fd; text-decoration: underline;">Heuristic Test Strategy Model</a> by James Bach) and come up with test ideas, questions about risks, missing information, unconsidered dependencies, identified risks, and more.</p>
          <p style="margin: 0 0 12px 0; opacity: 0.9; line-height: 1.7;">A guided discussion based on this analysis can help teams uncover hidden risks, assess the completeness of the requirements, create a clearer development plan, identify gaps and dependencies, improve estimation with better information at hand, and most importantly - avoid rework caused by discovering issues halfway through development.</p>
          <p style="margin: 0; opacity: 0.9; line-height: 1.7;">If we want to save time and cost while still delivering quality software, it is always cheaper to do things right the first time. The purpose of this report is to facilitate Product Coverage Sessions and help teams achieve exactly that: doing things right the first time.</p>
        </div>
      </div>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 10px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">When to generate this report?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <p style="margin: 0; opacity: 0.9; line-height: 1.7;">The sooner the better! As soon as testers can access Epic/User Stories or any project artifact they use for test design, this report should be generated. Generate this report and organize "Product Coverage Session" discussion with relevant stakeholders such as programmers, Product Owners, Designers, Architects etc.</p>
        </div>
      </div>
      <div class="info-section collapsed" style="background: rgba(255,255,255,0.1); border-radius: 8px; margin-top: 10px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 15px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h3 style="margin: 0; font-size: 1.1rem; opacity: 0.95;">How to use this report?</h3>
          <span class="collapse-icon" style="transition: transform 0.2s;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 20px 20px 20px;">
          <p style="margin: 0 0 12px 0; opacity: 0.9;">In this report you will find:</p>
          <div style="margin-left: 5px; line-height: 1.8;">
            <div style="margin-bottom: 8px;">☐ <strong>The Test Ideas</strong> generated for each product factor based on applicable subcategories. Review these test ideas carefully for context relevance, applicability and then derive specific test cases where needed.</div>
            <div style="margin-bottom: 8px;">☐ <strong>Automation Fitness</strong> recommendations against each test idea that can help for drafting suitable automation strategy.</div>
            <div>☐ <strong>The Clarifying Questions</strong> - that surface "unknown unknowns" by systematically checking which Product Factors (SFDIPOT) subcategories lack test coverage. Ensure that Epics, User Stories, Acceptance Criteria etc. are readily updated based on answers derived for each clarifying question listed.</div>
          </div>
          <p style="margin: 15px 0 0 0; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2); opacity: 0.9; font-size: 0.95rem;">All in all, this report represents important and unique elements to be considered in the test strategy. <strong>Rebuild this report if there are updates made in Epics, User Stories, Acceptance Criteria etc.</strong></p>
          <p style="margin: 10px 0 0 0; opacity: 0.85; font-style: italic; font-size: 0.9rem;">Testers are advised to carefully evaluate all the information using critical thinking and context awareness.</p>
        </div>
      </div>`;
  }

  /**
   * Render Reality Check section (Brutal Honesty analysis)
   */
  private renderRealityCheck(
    requirementsQuality?: RequirementsQualityScore,
    findings?: BrutalHonestyFinding[]
  ): string {
    if (!requirementsQuality && (!findings || findings.length === 0)) {
      return '';
    }

    const allFindings = [
      ...(requirementsQuality?.findings || []),
      ...(findings || []),
    ];

    // Count findings by severity
    const bySeverity = {
      critical: allFindings.filter(f => f.severity === BrutalHonestySeverity.CRITICAL).length,
      high: allFindings.filter(f => f.severity === BrutalHonestySeverity.HIGH).length,
      medium: allFindings.filter(f => f.severity === BrutalHonestySeverity.MEDIUM).length,
      low: allFindings.filter(f => f.severity === BrutalHonestySeverity.LOW).length,
    };

    // Count findings by mode
    const byMode = {
      bach: allFindings.filter(f => f.mode === BrutalHonestyMode.BACH).length,
      ramsay: allFindings.filter(f => f.mode === BrutalHonestyMode.RAMSAY).length,
      linus: allFindings.filter(f => f.mode === BrutalHonestyMode.LINUS).length,
    };

    return `
    <section class="section reality-check" id="reality-check">
      <h2>🎯 Reality Check: Brutal Honesty Analysis</h2>
      <p style="margin-bottom: 15px; color: var(--text-muted);">
        Powered by the <strong>brutal-honesty-review</strong> skill, this section surfaces issues that may be missed by conventional analysis.
      </p>

      ${this.renderQualityScorePanel(requirementsQuality)}

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid #ef4444;">
          <h4 style="margin: 0 0 10px 0; color: #ef4444; font-size: 0.95rem;">Analysis Modes</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 0.85rem; color: var(--text-dark);">
            <li><strong>Bach Mode:</strong> BS detection in requirements (${byMode.bach} findings)</li>
            <li><strong>Ramsay Mode:</strong> Test quality standards (${byMode.ramsay} findings)</li>
            <li><strong>Linus Mode:</strong> Technical precision (${byMode.linus} findings)</li>
          </ul>
        </div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b;">
          <h4 style="margin: 0 0 10px 0; color: #f59e0b; font-size: 0.95rem;">Findings by Severity</h4>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${bySeverity.critical > 0 ? `<span class="severity-badge severity-critical">${bySeverity.critical} Critical</span>` : ''}
            ${bySeverity.high > 0 ? `<span class="severity-badge severity-high">${bySeverity.high} High</span>` : ''}
            ${bySeverity.medium > 0 ? `<span class="severity-badge severity-medium">${bySeverity.medium} Medium</span>` : ''}
            ${bySeverity.low > 0 ? `<span class="severity-badge severity-low">${bySeverity.low} Low</span>` : ''}
            ${allFindings.length === 0 ? '<span style="color: #10b981; font-weight: 600;">✓ No issues found</span>' : ''}
          </div>
        </div>
      </div>

      ${this.renderFindingsList(allFindings)}
    </section>`;
  }

  /**
   * Render quality score panel with AC-by-AC analysis and documented rubric
   */
  private renderQualityScorePanel(quality?: RequirementsQualityScore): string {
    if (!quality) return '';

    const scoreColor = quality.score >= 80 ? '#10b981' :
                       quality.score >= 60 ? '#f59e0b' :
                       quality.score >= 40 ? '#f97316' : '#ef4444';

    const rubricSection = quality.scoringRubric ? this.renderScoringRubric(quality.scoringRubric) : '';
    const acSection = quality.acAnalysis && quality.acAnalysis.totalACs > 0
      ? this.renderACAnalysis(quality.acAnalysis)
      : '';

    return `
      <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid var(--border-light);">
        <div style="display: flex; align-items: center; gap: 20px; flex-wrap: wrap;">
          <div style="flex-shrink: 0;">
            <div style="width: 80px; height: 80px; border-radius: 50%; background: conic-gradient(${scoreColor} ${quality.score}%, #e5e7eb ${quality.score}%); display: flex; align-items: center; justify-content: center;">
              <div style="width: 60px; height: 60px; border-radius: 50%; background: white; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: 700; color: ${scoreColor};">
                ${quality.score}
              </div>
            </div>
          </div>
          <div style="flex: 1; min-width: 200px;">
            <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; color: var(--text-dark);">Requirements Quality Score</h3>
            <p style="margin: 0; color: var(--text-muted); font-size: 0.9rem;">${quality.verdict}</p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 0.8rem;">
            ${Object.entries(quality.categoryScores).map(([cat, score]) => `
              <div style="background: white; padding: 6px 10px; border-radius: 4px; border: 1px solid var(--border-light);">
                <span style="text-transform: capitalize; color: var(--text-muted);">${cat}:</span>
                <strong style="color: ${score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444'};">${Math.max(0, score)}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
      ${rubricSection}
      ${acSection}`;
  }

  /**
   * Render the scoring rubric explanation
   */
  private renderScoringRubric(rubric: { methodology: string; interpretation: { excellent: string; good: string; needsWork: string; poor: string }; deductions: Array<{ pattern: string; points: number; reason: string }> }): string {
    return `
      <details style="background: #fefce8; border: 1px solid #fde047; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
        <summary style="cursor: pointer; font-weight: 600; color: #854d0e; font-size: 0.95rem;">
          📊 How is this score calculated? (Click to expand rubric)
        </summary>
        <div style="margin-top: 15px; font-size: 0.85rem; color: #713f12;">
          <div style="white-space: pre-wrap; font-family: monospace; background: white; padding: 12px; border-radius: 6px; margin-bottom: 12px;">
${rubric.methodology.trim()}
          </div>

          <h5 style="margin: 15px 0 10px 0; color: #854d0e;">Score Interpretation:</h5>
          <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
            <tr style="background: #dcfce7;">
              <td style="padding: 6px 10px; border: 1px solid #bbf7d0; width: 80px;"><strong>80-100</strong></td>
              <td style="padding: 6px 10px; border: 1px solid #bbf7d0;">${rubric.interpretation.excellent.split(':')[1]?.trim() || rubric.interpretation.excellent}</td>
            </tr>
            <tr style="background: #fef9c3;">
              <td style="padding: 6px 10px; border: 1px solid #fde047;"><strong>60-79</strong></td>
              <td style="padding: 6px 10px; border: 1px solid #fde047;">${rubric.interpretation.good.split(':')[1]?.trim() || rubric.interpretation.good}</td>
            </tr>
            <tr style="background: #fed7aa;">
              <td style="padding: 6px 10px; border: 1px solid #fb923c;"><strong>40-59</strong></td>
              <td style="padding: 6px 10px; border: 1px solid #fb923c;">${rubric.interpretation.needsWork.split(':')[1]?.trim() || rubric.interpretation.needsWork}</td>
            </tr>
            <tr style="background: #fecaca;">
              <td style="padding: 6px 10px; border: 1px solid #f87171;"><strong>0-39</strong></td>
              <td style="padding: 6px 10px; border: 1px solid #f87171;">${rubric.interpretation.poor.split(':')[1]?.trim() || rubric.interpretation.poor}</td>
            </tr>
          </table>

          <h5 style="margin: 15px 0 10px 0; color: #854d0e;">Deduction Rules:</h5>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 8px;">
            ${rubric.deductions.slice(0, 8).map(d => `
              <div style="background: white; padding: 8px; border-radius: 4px; border-left: 3px solid #ef4444;">
                <div style="font-weight: 500; font-size: 0.8rem;">${d.pattern}</div>
                <div style="font-size: 0.75rem; color: #6b7280;">-${d.points} pts: ${d.reason}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </details>`;
  }

  /**
   * Render AC-by-AC testability analysis
   */
  private renderACAnalysis(acAnalysis: { totalACs: number; testableACs: number; untestableACs: number; averageTestability: number; acResults: Array<{ acId: string; acText: string; isTestable: boolean; testabilityScore: number; issues: string[]; suggestions: string[] }> }): string {
    const testablePercent = acAnalysis.totalACs > 0
      ? Math.round((acAnalysis.testableACs / acAnalysis.totalACs) * 100)
      : 0;

    const avgColor = acAnalysis.averageTestability >= 70 ? '#10b981' :
                     acAnalysis.averageTestability >= 50 ? '#f59e0b' : '#ef4444';

    return `
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 15px 0; color: #1e40af; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
          📋 Acceptance Criteria Testability Analysis
          <span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 500;">
            ${acAnalysis.totalACs} ACs analyzed
          </span>
        </h4>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px;">
          <div style="background: white; padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.8rem; font-weight: 700; color: ${avgColor};">${acAnalysis.averageTestability}%</div>
            <div style="font-size: 0.75rem; color: #6b7280;">Average Testability</div>
          </div>
          <div style="background: white; padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.8rem; font-weight: 700; color: #10b981;">${acAnalysis.testableACs}</div>
            <div style="font-size: 0.75rem; color: #6b7280;">Testable ACs</div>
          </div>
          <div style="background: white; padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.8rem; font-weight: 700; color: #ef4444;">${acAnalysis.untestableACs}</div>
            <div style="font-size: 0.75rem; color: #6b7280;">Need Rewriting</div>
          </div>
          <div style="background: white; padding: 15px; border-radius: 8px; text-align: center;">
            <div style="font-size: 1.8rem; font-weight: 700; color: #6366f1;">${testablePercent}%</div>
            <div style="font-size: 0.75rem; color: #6b7280;">Testable Rate</div>
          </div>
        </div>

        ${acAnalysis.acResults.length > 0 ? `
          <details style="background: white; border-radius: 8px; padding: 15px;">
            <summary style="cursor: pointer; font-weight: 600; color: #1e40af; font-size: 0.9rem;">
              View Per-AC Breakdown (${acAnalysis.acResults.length} criteria)
            </summary>
            <div style="margin-top: 15px;">
              <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                <thead>
                  <tr style="background: #f1f5f9;">
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">ID</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Acceptance Criteria</th>
                    <th style="padding: 8px; text-align: center; border-bottom: 2px solid #e2e8f0;">Score</th>
                    <th style="padding: 8px; text-align: left; border-bottom: 2px solid #e2e8f0;">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  ${acAnalysis.acResults.map(ac => {
                    const rowColor = ac.isTestable ? '#f0fdf4' : '#fef2f2';
                    const scoreColor = ac.testabilityScore >= 70 ? '#10b981' :
                                       ac.testabilityScore >= 50 ? '#f59e0b' : '#ef4444';
                    return `
                      <tr style="background: ${rowColor};">
                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: 500;">${ac.acId}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; max-width: 300px;">${ac.acText}</td>
                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">
                          <span style="font-weight: 700; color: ${scoreColor};">${ac.testabilityScore}</span>
                        </td>
                        <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 0.75rem; color: #6b7280;">
                          ${ac.issues.length > 0 ? ac.issues.join('; ') : '<span style="color: #10b981;">✓ Well-defined</span>'}
                        </td>
                      </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </details>
        ` : ''}
      </div>`;
  }

  /**
   * Render findings list
   */
  private renderFindingsList(findings: BrutalHonestyFinding[]): string {
    if (findings.length === 0) return '';

    // Sort by severity
    const severityOrder = {
      [BrutalHonestySeverity.CRITICAL]: 0,
      [BrutalHonestySeverity.HIGH]: 1,
      [BrutalHonestySeverity.MEDIUM]: 2,
      [BrutalHonestySeverity.LOW]: 3,
    };

    const sortedFindings = [...findings].sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );

    return `
      <div class="findings-list">
        <h3 style="margin: 20px 0 12px 0; font-size: 1rem; color: var(--text-dark);">
          Detailed Findings <span class="badge" style="background: #6366f1; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem;">${findings.length}</span>
        </h3>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${sortedFindings.map(finding => this.renderFinding(finding)).join('')}
        </div>
      </div>`;
  }

  /**
   * Render a single finding
   */
  private renderFinding(finding: BrutalHonestyFinding): string {
    const severityColors = {
      [BrutalHonestySeverity.CRITICAL]: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b' },
      [BrutalHonestySeverity.HIGH]: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e' },
      [BrutalHonestySeverity.MEDIUM]: { bg: '#fff7ed', border: '#fb923c', text: '#9a3412' },
      [BrutalHonestySeverity.LOW]: { bg: '#f0fdf4', border: '#22c55e', text: '#166534' },
    };

    const colors = severityColors[finding.severity];
    const modeLabels = {
      [BrutalHonestyMode.BACH]: '🎭 Bach',
      [BrutalHonestyMode.RAMSAY]: '👨‍🍳 Ramsay',
      [BrutalHonestyMode.LINUS]: '🐧 Linus',
    };

    return `
      <div class="finding-card" style="background: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 8px; padding: 15px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap;">
          <span class="severity-badge severity-${finding.severity.toLowerCase()}">${finding.severity}</span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">${modeLabels[finding.mode]}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${finding.id}</span>
          <span style="margin-left: auto; font-size: 0.8rem; background: white; padding: 2px 8px; border-radius: 4px; color: var(--text-muted);">${finding.category}</span>
        </div>
        <h4 style="margin: 0 0 8px 0; color: ${colors.text}; font-size: 0.95rem;">${this.escapeHtml(finding.title)}</h4>
        <p style="margin: 0 0 10px 0; color: var(--text-dark); font-size: 0.85rem;">${this.escapeHtml(finding.description)}</p>
        <div style="background: rgba(255,255,255,0.7); border-radius: 4px; padding: 10px; margin-bottom: 10px;">
          <p style="margin: 0 0 5px 0; font-size: 0.8rem;"><strong>Evidence:</strong> <code style="background: white; padding: 1px 4px; border-radius: 2px;">${this.escapeHtml(finding.evidence)}</code></p>
          <p style="margin: 0; font-size: 0.8rem;"><strong>Recommendation:</strong> ${this.escapeHtml(finding.recommendation)}</p>
        </div>
        <p style="margin: 0; font-size: 0.8rem; color: ${colors.text}; font-style: italic;">
          <strong>Impact if ignored:</strong> ${this.escapeHtml(finding.impactIfIgnored)}
        </p>
      </div>`;
  }

  /**
   * Render Risk-Based Prioritization section
   */
  private renderRiskBasedPrioritization(output: AssessmentOutput): string {
    // Extract key areas from test ideas
    const keyAreas = this.extractKeyAreas(output.testIdeas);

    return `
    <section class="section" id="risk">
      <h2>Risk-Based Prioritization</h2>
      <p style="margin-bottom: 15px;">Test ideas are prioritized using a <strong>risk-based approach</strong> that considers:</p>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 20px;">
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Business Impact</strong><br>Potential revenue loss, customer trust damage, or regulatory penalties</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Likelihood of Failure</strong><br>Complexity of implementation, external dependencies, new technology</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">User Exposure</strong><br>Number of users affected and frequency of feature usage</div>
        <div style="background: var(--bg-light); padding: 15px; border-radius: 8px; border-left: 4px solid var(--primary);"><strong style="color: var(--primary);">Security &amp; Compliance</strong><br>Data protection requirements, payment processing, legal obligations</div>
      </div>
      <h3>Priority Legend</h3>
      <table>
        <thead>
          <tr><th>Priority</th><th>Risk Level</th><th>Description</th><th>Examples from this Epic</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="priority priority-p0">P0</span></td><td><strong>Critical</strong></td><td>Security vulnerabilities or core functionality that could cause immediate financial loss, data breach, or complete service failure. Must be tested before any release.</td><td>${keyAreas.p0.join(', ') || 'N/A'}</td></tr>
          <tr><td><span class="priority priority-p1">P1</span></td><td><strong>High</strong></td><td>Core business flows and integrations essential for revenue generation. Failures would significantly impact user experience or business operations.</td><td>${keyAreas.p1.join(', ') || 'N/A'}</td></tr>
          <tr><td><span class="priority priority-p2">P2</span></td><td><strong>Medium</strong></td><td>Important features that support the core experience. Failures would cause inconvenience but workarounds exist.</td><td>${keyAreas.p2.join(', ') || 'N/A'}</td></tr>
          <tr><td><span class="priority priority-p3">P3</span></td><td><strong>Low</strong></td><td>Edge cases, cosmetic issues, or rarely used features. Failures have minimal business impact.</td><td>${keyAreas.p3.join(', ') || 'Edge cases, minor variations'}</td></tr>
        </tbody>
      </table>
    </section>`;
  }

  /**
   * Render Charts Overview section
   */
  private renderChartsOverview(output: AssessmentOutput): string {
    const categoryCounts = this.getCategoryCounts(output);
    const maxCategoryCount = Math.max(...Object.values(categoryCounts), 1);
    const priorityCounts = output.summary.byPriority;
    const maxPriorityCount = Math.max(...Object.values(priorityCounts), 1);
    const automationCounts = output.summary.byAutomationFitness;
    const maxAutomationCount = Math.max(...Object.values(automationCounts), 1);

    return `
    <section class="section" id="charts">
      <h2>Test Ideas Overview</h2>
      <div class="charts-container">
        <div class="chart-panel">
          <h3>Test Ideas by Product Factor (SFDIPOT)</h3>
          <div class="bar-chart">
            ${Object.entries(categoryCounts).map(([cat, count]) => `
            <div class="bar-row">
              <div class="bar-label">${cat.charAt(0) + cat.slice(1).toLowerCase()}</div>
              <div class="bar-track"><div class="bar-fill bar-${cat.toLowerCase()}" style="width: ${(count / maxCategoryCount * 100)}%"></div></div>
              <div class="bar-value">${count}</div>
            </div>`).join('')}
          </div>
          <div class="chart-total">
            <span class="total-label">Product Factors: ${this.getCoveredFactorsCount(output)}/7</span>
            <span class="total-value">${output.summary.totalTestIdeas} Test Ideas</span>
          </div>
          <div style="margin-top: 10px; padding: 8px 12px; background: #fef9c3; border-radius: 4px; font-size: 0.8rem; color: #92400e;">
            <strong>Clarifying Questions:</strong> Review each category for questions requiring stakeholder input
          </div>
        </div>
        <div class="chart-panel">
          <h3>Test Ideas by Priority</h3>
          <div class="bar-chart">
            ${Object.entries(priorityCounts).map(([priority, count]) => `
            <div class="bar-row">
              <div class="bar-label">${priority} - ${PRIORITY_LABELS[priority as Priority]}</div>
              <div class="bar-track"><div class="bar-fill bar-${priority.toLowerCase()}" style="width: ${(count / maxPriorityCount * 100)}%"></div></div>
              <div class="bar-value">${count}</div>
            </div>`).join('')}
          </div>

          <h4 style="font-size: 0.85rem; color: var(--text-dark); margin: 14px 0 8px 0; padding-top: 12px; border-top: 1px solid var(--border); font-weight: 600;">Test Ideas by Automation Fitness</h4>
          <div class="bar-chart" style="font-size: 0.85rem;">
            ${Object.entries(automationCounts)
              .filter(([_, count]) => count > 0)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 6)
              .map(([fitness, count]) => {
                const meta = AUTOMATION_LABELS[fitness as AutomationFitness];
                return `
            <div class="bar-row" style="margin-bottom: 4px;">
              <div class="bar-label" style="min-width: 100px; font-size: 0.8rem;">${this.getAutomationShortLabel(fitness as AutomationFitness)}</div>
              <div class="bar-track" style="height: 14px;"><div class="bar-fill" style="width: ${(count / maxAutomationCount * 100)}%; background: linear-gradient(90deg, #6366f1, #8b5cf6);"></div></div>
              <div class="bar-value" style="font-size: 0.8rem;">${count}</div>
            </div>`;
              }).join('')}
          </div>
        </div>
      </div>
    </section>`;
  }

  /**
   * Render Test Ideas by Category section
   */
  private renderTestIdeasByCategory(output: AssessmentOutput): string {
    const categories = Array.from(output.categoryAnalysis.entries());

    return `
    <section class="section" id="test-ideas">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary);">
        <h2 style="margin: 0; border: none; padding: 0;">Test Ideas by Product Factor</h2>
        <button onclick="toggleAllSections()" id="toggle-all-btn" style="background: var(--bg-light); border: 1px solid var(--border); padding: 6px 14px; border-radius: 4px; font-size: 0.8rem; cursor: pointer; font-weight: 500; color: var(--text-dark);">Collapse All</button>
      </div>
      <script>
        function toggleAllSections() {
          var sections = document.querySelectorAll('.category-section');
          var btn = document.getElementById('toggle-all-btn');
          var shouldCollapse = btn.textContent === 'Collapse All';
          sections.forEach(function(s) {
            if (shouldCollapse) { s.classList.add('collapsed'); }
            else { s.classList.remove('collapsed'); }
          });
          btn.textContent = shouldCollapse ? 'Expand All' : 'Collapse All';
        }
        function filterTable(tableId) {
          var table = document.getElementById(tableId);
          var filters = table.querySelectorAll('.filter-input, .filter-select');
          var rows = table.querySelectorAll('tbody tr');
          rows.forEach(function(row) {
            var show = true;
            filters.forEach(function(filter) {
              var col = parseInt(filter.dataset.col);
              var cell = row.cells[col];
              if (cell) {
                var text = cell.textContent.toLowerCase();
                var val = filter.value.toLowerCase();
                if (val && text.indexOf(val) === -1) { show = false; }
              }
            });
            row.style.display = show ? '' : 'none';
          });
        }
      </script>

      ${categories.map(([category, analysis]) => this.renderCategorySection(category, analysis)).join('\n')}
    </section>`;
  }

  /**
   * Render a single category section
   */
  private renderCategorySection(category: HTSMCategory, analysis: CategoryAnalysis): string {
    const meta = CATEGORY_METADATA[category];
    const tableId = `table-${category.toLowerCase()}`;

    // Render validation badge if validation data exists
    const validationBadge = analysis.validation
      ? `<span class="quality-badge quality-${analysis.validation.qualityScore >= 80 ? 'good' : analysis.validation.qualityScore >= 60 ? 'warning' : 'poor'}" style="margin-left: 10px; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; background: ${analysis.validation.qualityScore >= 80 ? '#d1fae5' : analysis.validation.qualityScore >= 60 ? '#fef3c7' : '#fee2e2'}; color: ${analysis.validation.qualityScore >= 80 ? '#065f46' : analysis.validation.qualityScore >= 60 ? '#92400e' : '#991b1b'};">Quality: ${analysis.validation.qualityScore}/100</span>`
      : '';

    // Render rejected ideas count if any
    const rejectedBadge = analysis.validation?.rejectedIdeas.length
      ? `<span style="margin-left: 8px; font-size: 0.7rem; padding: 2px 8px; border-radius: 4px; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca;">${analysis.validation.rejectedIdeas.length} rejected</span>`
      : '';

    return `
        <div class="category-section ${meta.cssClass}" id="${category.toLowerCase()}">
          <div class="category-header collapsible-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <h3>${category}: ${meta.description} <span class="badge">${analysis.testIdeas.length}</span>${validationBadge}${rejectedBadge}</h3>
            <span class="collapse-icon">▼</span>
          </div>
          <div class="category-content collapsible-content">
            ${this.renderValidationSummary(analysis)}
            <table class="filterable-table" id="${tableId}">
              <thead>
                <tr>
                  <th style="width: 100px;">ID</th>
                  <th style="width: 70px;">Priority</th>
                  <th style="width: 120px;">Subcategory</th>
                  <th>Test Idea</th>
                  <th style="width: 210px;">Automation Fitness</th>
                </tr>
                <tr class="filter-row">
                  <td><input type="text" class="filter-input" data-col="0" placeholder="Filter..." onkeyup="filterTable('${tableId}')"></td>
                  <td><select class="filter-select" data-col="1" onchange="filterTable('${tableId}')"><option value="">All</option><option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option></select></td>
                  <td><input type="text" class="filter-input" data-col="2" placeholder="Filter..." onkeyup="filterTable('${tableId}')"></td>
                  <td><input type="text" class="filter-input" data-col="3" placeholder="Filter..." onkeyup="filterTable('${tableId}')"></td>
                  <td><select class="filter-select" data-col="4" onchange="filterTable('${tableId}')"><option value="">All</option><option value="Automate on API level">API level</option><option value="Automate on E2E level">E2E level</option><option value="Automate on Integration level">Integration level</option><option value="Human testers must explore">Human Exploration</option><option value="Performance testing recommended">Performance</option><option value="Security testing recommended">Security</option></select></td>
                </tr>
              </thead>
              <tbody>
                ${analysis.testIdeas.map(test => this.renderTestRow(test)).join('\n')}
              </tbody>
            </table>

        ${this.renderCategoryClarifyingQuestions(analysis.clarifyingQuestions)}
        ${this.renderRejectedIdeas(analysis)}
          </div>
        </div>`;
  }

  /**
   * Render validation summary for a category
   */
  private renderValidationSummary(analysis: CategoryAnalysis): string {
    if (!analysis.validation || analysis.validation.findings.length === 0) {
      return '';
    }

    const criticalFindings = analysis.validation.findings.filter(f => f.severity === 'CRITICAL').length;
    const highFindings = analysis.validation.findings.filter(f => f.severity === 'HIGH').length;

    if (criticalFindings === 0 && highFindings === 0) {
      return '';
    }

    return `
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
          <span style="font-size: 1.1rem;">⚠️</span>
          <strong style="color: #991b1b; font-size: 0.9rem;">Brutal Honesty Validation Findings</strong>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; font-size: 0.8rem;">
          ${criticalFindings > 0 ? `<span class="severity-badge severity-critical">${criticalFindings} Critical</span>` : ''}
          ${highFindings > 0 ? `<span class="severity-badge severity-high">${highFindings} High</span>` : ''}
        </div>
        <ul style="margin: 10px 0 0 20px; font-size: 0.8rem; color: #7f1d1d;">
          ${analysis.validation.findings
            .filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH')
            .slice(0, 3)
            .map(f => `<li><strong>${f.title}</strong>: ${f.description}</li>`)
            .join('')}
        </ul>
      </div>`;
  }

  /**
   * Render rejected ideas section
   */
  private renderRejectedIdeas(analysis: CategoryAnalysis): string {
    if (!analysis.validation?.rejectedIdeas.length) {
      return '';
    }

    return `
      <div class="info-section collapsed" style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; margin-top: 16px;">
        <div class="info-header" onclick="this.parentElement.classList.toggle('collapsed')" style="padding: 12px 16px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <h4 style="margin: 0; font-size: 0.9rem; color: #991b1b; display: flex; align-items: center; gap: 8px;">
            <span>🚫</span>
            Rejected Test Ideas (Quality &lt; 60)
            <span class="badge" style="background: #991b1b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;">${analysis.validation.rejectedIdeas.length}</span>
          </h4>
          <span class="collapse-icon" style="transition: transform 0.2s; color: #991b1b;">▼</span>
        </div>
        <div class="info-content" style="padding: 0 16px 16px 16px;">
          <p style="font-size: 0.8rem; color: #7f1d1d; margin-bottom: 12px;">
            These test ideas were rejected because they were too vague, duplicated, or lacked actionable specificity.
            Consider enhancing them with preconditions, test data, and expected values.
          </p>
          <ul style="margin: 0; padding-left: 20px; font-size: 0.85rem; color: #991b1b;">
            ${analysis.validation.rejectedIdeas.map(idea =>
              `<li style="margin-bottom: 6px;"><span style="color: #b91c1c;">${idea.description}</span> <span style="color: #ef4444; font-size: 0.75rem;">[${idea.subcategory}]</span></li>`
            ).join('')}
          </ul>
        </div>
      </div>`;
  }

  /**
   * Render a single test idea row
   */
  private renderTestRow(test: TestIdea): string {
    const automationMeta = AUTOMATION_LABELS[test.automationFitness];

    return `<tr>
          <td class="test-id">${test.id}</td>
          <td><span class="priority priority-${test.priority.toLowerCase()}">${test.priority}</span></td>
          <td><span class="subcategory">${test.subcategory}</span></td>
          <td>${this.escapeHtml(test.description)}</td>
          <td><span class="automation ${automationMeta.cssClass}">${automationMeta.label}</span></td>
        </tr>`;
  }

  /**
   * Render clarifying questions for a category
   */
  private renderCategoryClarifyingQuestions(questions: ClarifyingQuestion[]): string {
    if (questions.length === 0) return '';

    // Group by subcategory
    const bySubcategory = new Map<string, ClarifyingQuestion[]>();
    for (const q of questions) {
      if (!bySubcategory.has(q.subcategory)) {
        bySubcategory.set(q.subcategory, []);
      }
      bySubcategory.get(q.subcategory)!.push(q);
    }

    return `
        <div class="clarifying-questions">
          <h4>Clarifying Questions to address potential coverage gaps</h4>
          <div class="clarifying-intro">
            <p class="preamble">The following subcategories have limited or no test coverage. Consider addressing these questions to improve coverage.</p>
          </div>

          ${Array.from(bySubcategory.entries()).map(([subcategory, qs]) => `
          <div class="subcategory-questions">
            <h5>[${subcategory}]</h5>
            <p class="rationale"><em>Rationale: ${this.escapeHtml(qs[0].rationale)}</em></p>
            <ul>
              ${qs.map(q => `<li>${this.escapeHtml(q.question)}</li>`).join('\n')}
            </ul>
          </div>`).join('\n')}
        </div>`;
  }

  /**
   * Render Requirements Traceability section
   */
  private renderTraceability(output: AssessmentOutput): string {
    // Group test ideas by source requirement
    const byRequirement = new Map<string, TestIdea[]>();
    for (const test of output.testIdeas) {
      const req = test.sourceRequirement || 'General';
      if (!byRequirement.has(req)) {
        byRequirement.set(req, []);
      }
      byRequirement.get(req)!.push(test);
    }

    return `
    <section class="section" id="traceability">
      <h2>Requirements Traceability</h2>
      <p style="margin-bottom: 15px;">Test ideas mapped to their source requirements for traceability:</p>
      <table>
        <thead>
          <tr>
            <th style="width: 300px;">Source Requirement</th>
            <th style="width: 100px;">Test Count</th>
            <th>Test IDs</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from(byRequirement.entries()).map(([req, tests]) => `
          <tr>
            <td>${this.escapeHtml(req)}</td>
            <td style="text-align: center;">${tests.length}</td>
            <td style="font-family: monospace; font-size: 0.75rem; color: var(--text-muted);">${tests.map(t => t.id).join(', ')}</td>
          </tr>`).join('\n')}
        </tbody>
      </table>
    </section>

    <footer style="text-align: center; padding: 30px; color: var(--text-muted); font-size: 0.85rem; border-top: 1px solid var(--border-light); margin-top: 30px;">
      <p>Generated by <strong>QE Product Factors Assessor Agent</strong></p>
      <p>Based on James Bach's Heuristic Test Strategy Model (HTSM v6.3)</p>
      <p style="margin-top: 10px; opacity: 0.7;">Agentic QE Fleet | SFDIPOT Analysis</p>
    </footer>`;
  }

  /**
   * Get category counts from output
   */
  private getCategoryCounts(output: AssessmentOutput): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const category of Object.values(HTSMCategory)) {
      const analysis = output.categoryAnalysis.get(category);
      counts[category] = analysis?.testIdeas.length || 0;
    }
    return counts;
  }

  /**
   * Get count of covered factors
   */
  private getCoveredFactorsCount(output: AssessmentOutput): number {
    let count = 0;
    for (const category of Object.values(HTSMCategory)) {
      const analysis = output.categoryAnalysis.get(category);
      if (analysis && analysis.testIdeas.length > 0) {
        count++;
      }
    }
    return count;
  }

  /**
   * Extract key areas from test ideas for priority examples
   */
  private extractKeyAreas(testIdeas: TestIdea[]): { p0: string[]; p1: string[]; p2: string[]; p3: string[] } {
    const areas = { p0: new Set<string>(), p1: new Set<string>(), p2: new Set<string>(), p3: new Set<string>() };

    for (const test of testIdeas) {
      const area = test.subcategory;
      switch (test.priority) {
        case Priority.P0: areas.p0.add(area); break;
        case Priority.P1: areas.p1.add(area); break;
        case Priority.P2: areas.p2.add(area); break;
        case Priority.P3: areas.p3.add(area); break;
      }
    }

    return {
      p0: Array.from(areas.p0).slice(0, 3),
      p1: Array.from(areas.p1).slice(0, 3),
      p2: Array.from(areas.p2).slice(0, 3),
      p3: Array.from(areas.p3).slice(0, 3),
    };
  }

  /**
   * Get short label for automation fitness
   */
  private getAutomationShortLabel(fitness: AutomationFitness): string {
    const shortLabels: Record<AutomationFitness, string> = {
      [AutomationFitness.API]: 'API level',
      [AutomationFitness.Integration]: 'Integration level',
      [AutomationFitness.E2E]: 'E2E level',
      [AutomationFitness.Human]: 'Human Exploration',
      [AutomationFitness.Performance]: 'Performance',
      [AutomationFitness.Security]: 'Security',
      [AutomationFitness.Visual]: 'Visual',
      [AutomationFitness.Accessibility]: 'Accessibility',
      [AutomationFitness.Concurrency]: 'Concurrency',
    };
    return shortLabels[fitness];
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Get initialization script
   */
  private getInitScript(): string {
    return `
    function toggleSection(id) {
      const section = document.getElementById(id);
      if (section) {
        section.classList.toggle('collapsed');
      }
    }
    function expandAll() {
      document.querySelectorAll('.category-section').forEach(s => s.classList.remove('collapsed'));
    }
    function collapseAll() {
      document.querySelectorAll('.category-section').forEach(s => s.classList.add('collapsed'));
    }`;
  }

  /**
   * Get CSS styles matching reference format
   */
  private getStyles(): string {
    return `
    :root {
      --primary: #1e3a5f;
      --primary-dark: #0f2744;
      --primary-light: #2d5a8a;
      --accent: #0066cc;
      --success: #0d7a3f;
      --warning: #b45309;
      --danger: #b91c1c;
      --info: #0369a1;
      --bg-light: #f5f7fa;
      --bg-white: #ffffff;
      --text-dark: #1a1a2e;
      --text-muted: #5c6370;
      --border: #d1d5db;
      --border-light: #e5e7eb;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg-light);
      color: var(--text-dark);
      line-height: 1.6;
      font-size: 14px;
    }
    .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
    header {
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      padding: 32px 28px;
      margin-bottom: 24px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    }
    header h1 { font-size: 1.75rem; margin-bottom: 8px; font-weight: 600; }
    header .subtitle { font-size: 0.9rem; opacity: 0.9; line-height: 1.5; }
    .section { background: var(--bg-white); border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); border: 1px solid var(--border-light); }
    .section h2 { color: var(--primary); font-size: 1.1rem; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid var(--primary); font-weight: 600; }
    .section h3 { color: var(--text-dark); font-size: 1rem; margin: 20px 0 12px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 600; }
    .section h3 .badge { background: var(--primary); color: white; padding: 3px 10px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 0.85rem; }
    th { background: var(--bg-light); padding: 10px 12px; text-align: left; font-weight: 600; border-bottom: 2px solid var(--border); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.3px; color: var(--text-muted); }
    td { padding: 10px 12px; border-bottom: 1px solid var(--border-light); vertical-align: top; }
    tr:hover { background: #fafbfc; }
    .priority { display: inline-block; padding: 4px 10px; border-radius: 4px; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; }
    .priority-p0 { background: #fef2f2; color: var(--danger); border: 1px solid #fecaca; }
    .priority-p1 { background: #fefce8; color: var(--warning); border: 1px solid #fef08a; }
    .priority-p2 { background: #f0fdf4; color: var(--success); border: 1px solid #bbf7d0; }
    .priority-p3 { background: #f0f9ff; color: var(--info); border: 1px solid #bae6fd; }
    .subcategory { display: inline-block; background: #eff6ff; color: var(--primary); padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; }
    .automation { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; }
    .automation-api { background: #dbeafe; color: #1e40af; }
    .automation-e2e { background: #fce7f3; color: #9d174d; }
    .automation-integration { background: #d1fae5; color: #065f46; }
    .automation-visual { background: #fdf4ff; color: #86198f; }
    .automation-performance { background: #fef3c7; color: #92400e; }
    .automation-concurrency { background: #ffedd5; color: #9a3412; }
    .automation-security { background: #fee2e2; color: #991b1b; }
    .automation-accessibility { background: #ecfccb; color: #3f6212; }
    .automation-human { background: #f3e8ff; color: #7c3aed; font-weight: 600; }
    .clarifying-questions { background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 20px 25px; margin-top: 20px; }
    .clarifying-questions h4 { color: #854d0e; margin-bottom: 16px; font-size: 1.1rem; border-bottom: 2px solid #fef08a; padding-bottom: 10px; }
    .clarifying-intro { background: #fef9c3; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
    .clarifying-intro .preamble { color: #713f12; font-size: 0.9rem; line-height: 1.5; margin: 0; }
    .subcategory-questions { background: white; border: 1px solid #fef08a; border-radius: 6px; padding: 15px; margin-bottom: 15px; }
    .subcategory-questions h5 { color: #854d0e; font-size: 0.95rem; margin-bottom: 8px; font-weight: 700; }
    .subcategory-questions .rationale { color: #92400e; font-size: 0.85rem; margin-bottom: 12px; padding: 8px 12px; background: #fef3c7; border-radius: 4px; border-left: 3px solid #f59e0b; }
    .clarifying-questions ul { list-style: none; margin: 0; padding: 0; }
    .clarifying-questions li { padding: 8px 0 8px 20px; position: relative; border-bottom: 1px dashed #fef08a; color: var(--text-dark); font-size: 0.9rem; }
    .clarifying-questions li:before { content: "?"; position: absolute; left: 0; color: #f59e0b; font-weight: bold; }
    .clarifying-questions li:last-child { border-bottom: none; }
    .charts-container { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
    .chart-panel { background: var(--bg-white); border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
    .chart-panel h3 { font-size: 1.1rem; color: var(--text-dark); margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid var(--border); }
    .bar-chart { display: flex; flex-direction: column; gap: 8px; }
    .bar-row { display: flex; align-items: center; gap: 10px; }
    .bar-label { width: 90px; font-size: 0.8rem; font-weight: 600; color: var(--text-dark); text-align: right; flex-shrink: 0; }
    .bar-track { flex: 1; height: 24px; background: var(--bg-light); border-radius: 4px; overflow: hidden; position: relative; }
    .bar-fill { height: 100%; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; font-size: 0.75rem; font-weight: 600; color: white; min-width: 35px; transition: width 0.3s ease; }
    .bar-value { width: 45px; font-size: 0.85rem; font-weight: 700; color: var(--text-dark); text-align: right; flex-shrink: 0; }
    .bar-structure { background: linear-gradient(90deg, #3b82f6, #2563eb); }
    .bar-function { background: linear-gradient(90deg, #10b981, #059669); }
    .bar-data { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .bar-interfaces { background: linear-gradient(90deg, #8b5cf6, #7c3aed); }
    .bar-platform { background: linear-gradient(90deg, #14b8a6, #0d9488); }
    .bar-operations { background: linear-gradient(90deg, #6366f1, #4f46e5); }
    .bar-time { background: linear-gradient(90deg, #ec4899, #db2777); }
    .bar-p0 { background: linear-gradient(90deg, #ef4444, #dc2626); }
    .bar-p1 { background: linear-gradient(90deg, #f59e0b, #d97706); }
    .bar-p2 { background: linear-gradient(90deg, #22c55e, #16a34a); }
    .bar-p3 { background: linear-gradient(90deg, #06b6d4, #0891b2); }
    .chart-total { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 0.9rem; }
    .chart-total .total-label { color: var(--text-muted); }
    .chart-total .total-value { font-weight: 700; color: var(--primary); }
    @media (max-width: 900px) { .charts-container { grid-template-columns: 1fr; } }
    .test-id { font-family: 'SF Mono', 'Consolas', monospace; font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; }
    .toc { background: var(--bg-white); padding: 16px 20px; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); border: 1px solid var(--border-light); }
    .toc h2 { font-size: 0.85rem; margin-bottom: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px; border-bottom: 1px solid var(--border-light); }
    .toc-nav { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .toc-nav a { color: var(--primary); text-decoration: none; padding: 6px 12px; border-radius: 4px; font-size: 0.8rem; font-weight: 500; background: var(--bg-light); border: 1px solid var(--border-light); transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; }
    .toc-nav a:hover { background: var(--primary); color: white; border-color: var(--primary); }
    .toc-nav .count { background: var(--primary); color: white; padding: 1px 6px; border-radius: 3px; font-size: 0.7rem; font-weight: 600; }
    .toc-nav a:hover .count { background: rgba(255,255,255,0.3); }
    .toc-divider { color: var(--border); margin: 0 4px; }
    .collapsible-header { cursor: pointer; user-select: none; display: flex; align-items: center; justify-content: space-between; }
    .collapsible-header:hover { opacity: 0.8; }
    .collapse-icon { transition: transform 0.2s; font-size: 0.8rem; color: var(--text-muted); }
    .collapsed .collapse-icon { transform: rotate(-90deg); }
    .collapsible-content { overflow: hidden; transition: max-height 0.3s ease-out; }
    .collapsed .collapsible-content { max-height: 0 !important; padding-top: 0; padding-bottom: 0; }
    .info-section .info-content { overflow: hidden; transition: max-height 0.3s ease-out, padding 0.3s ease-out; max-height: 1000px; }
    .info-section.collapsed .info-content { max-height: 0 !important; padding-top: 0 !important; padding-bottom: 0 !important; }
    .info-section.collapsed .collapse-icon { transform: rotate(-90deg); }
    .info-header:hover { background: rgba(255,255,255,0.05); }
    .category-section { border-radius: 8px; margin-bottom: 16px; overflow: hidden; border-left: 4px solid var(--border-light); box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .category-header { padding: 14px 18px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; }
    .category-header:hover { filter: brightness(0.97); }
    .category-header h3 { margin: 0; font-size: 0.95rem; display: flex; align-items: center; gap: 10px; font-weight: 600; }
    .category-header .badge { font-size: 0.7rem; padding: 3px 10px; border-radius: 12px; font-weight: 600; }
    .category-content { padding: 16px; }
    .category-section.cat-structure { border-left-color: #3b82f6; }
    .category-section.cat-structure .category-header { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); }
    .category-section.cat-structure .category-content { background: #f8faff; }
    .category-section.cat-structure .badge { background: #3b82f6; color: white; }
    .category-section.cat-function { border-left-color: #10b981; }
    .category-section.cat-function .category-header { background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); }
    .category-section.cat-function .category-content { background: #f8fdfb; }
    .category-section.cat-function .badge { background: #10b981; color: white; }
    .category-section.cat-data { border-left-color: #f59e0b; }
    .category-section.cat-data .category-header { background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); }
    .category-section.cat-data .category-content { background: #fffdf8; }
    .category-section.cat-data .badge { background: #f59e0b; color: white; }
    .category-section.cat-interfaces { border-left-color: #8b5cf6; }
    .category-section.cat-interfaces .category-header { background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); }
    .category-section.cat-interfaces .category-content { background: #faf9ff; }
    .category-section.cat-interfaces .badge { background: #8b5cf6; color: white; }
    .category-section.cat-platform { border-left-color: #14b8a6; }
    .category-section.cat-platform .category-header { background: linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%); }
    .category-section.cat-platform .category-content { background: #f8fefd; }
    .category-section.cat-platform .badge { background: #14b8a6; color: white; }
    .category-section.cat-operations { border-left-color: #6366f1; }
    .category-section.cat-operations .category-header { background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); }
    .category-section.cat-operations .category-content { background: #f8f9ff; }
    .category-section.cat-operations .badge { background: #6366f1; color: white; }
    .category-section.cat-time { border-left-color: #ec4899; }
    .category-section.cat-time .category-header { background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%); }
    .category-section.cat-time .category-content { background: #fefafc; }
    .category-section.cat-time .badge { background: #ec4899; color: white; }
    .collapsed .category-content { display: none; }
    .filter-row td { padding: 6px 8px; background: #f8fafc; }
    .filter-input, .filter-select { width: 100%; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; font-size: 0.75rem; background: white; }
    .filter-input:focus, .filter-select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 2px rgba(30,58,95,0.1); }
    .filter-input::placeholder { color: #94a3b8; }
    /* Reality Check / Brutal Honesty styles */
    .reality-check { border-left: 4px solid #f59e0b; background: linear-gradient(135deg, #fffbeb 0%, #fff 100%); }
    .reality-check h2 { border-bottom-color: #f59e0b; }
    .severity-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
    .severity-critical { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .severity-high { background: #fffbeb; color: #92400e; border: 1px solid #fef08a; }
    .severity-medium { background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; }
    .severity-low { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .quality-good { color: #10b981; }
    .quality-warning { color: #f59e0b; }
    .quality-poor { color: #f97316; }
    .quality-critical { color: #ef4444; }
    .finding-card { transition: transform 0.15s, box-shadow 0.15s; }
    .finding-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    @media (max-width: 768px) {
      header h1 { font-size: 1.4rem; }
      table { display: block; overflow-x: auto; }
      .toc-nav { flex-direction: column; align-items: flex-start; }
    }`;
  }
}

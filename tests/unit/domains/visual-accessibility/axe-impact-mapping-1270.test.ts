/**
 * #1270: axe-core impacts keep their level in the report.
 *
 * axe-core reports critical / serious / moderate / minor. Vibium reports
 * critical / high / medium / low / info. Before the fix only the Vibium keys
 * were mapped, so axe's 'serious' and 'minor' both became 'moderate'.
 */

import { describe, it, expect } from 'vitest';
import {
  mapAxeResultToReport,
  mapImpactSeverity,
  type AxeCoreResult,
} from '../../../../src/domains/visual-accessibility/services/accessibility-tester-browser';

function axeViolation(id: string, impact: string): AxeCoreResult['violations'][number] {
  return {
    id,
    impact,
    description: `${id} description`,
    help: `${id} help`,
    tags: ['wcag2aa'],
    nodes: [{ selector: `.${id}`, html: '<div></div>', target: [`.${id}`] }],
  };
}

describe('#1270 axe-core impact mapping', () => {
  it('maps the four axe-core impacts one to one', () => {
    expect(mapImpactSeverity('critical')).toBe('critical');
    expect(mapImpactSeverity('serious')).toBe('serious');
    expect(mapImpactSeverity('moderate')).toBe('moderate');
    expect(mapImpactSeverity('minor')).toBe('minor');
  });

  it('still maps the Vibium severity keys', () => {
    expect(mapImpactSeverity('high')).toBe('serious');
    expect(mapImpactSeverity('medium')).toBe('moderate');
    expect(mapImpactSeverity('low')).toBe('minor');
    expect(mapImpactSeverity('info')).toBe('minor');
  });

  it('reports a serious axe color-contrast violation as serious, and minor as minor', () => {
    const report = mapAxeResultToReport('https://example.test', {
      violations: [axeViolation('color-contrast', 'serious'), axeViolation('region', 'minor')],
      passes: ['image-alt', 'label'],
      incomplete: [],
      inapplicable: [],
    }, 'AA');

    expect(report.violations.map(v => [v.id, v.impact])).toEqual([
      ['color-contrast', 'serious'],
      ['region', 'minor'],
    ]);
    // 4 rules, max weight 16, failed weight serious(3) + minor(1) = 4 -> 75
    expect(report.score).toBe(75);
  });
});

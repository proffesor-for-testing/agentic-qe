/**
 * Agentic QE v3 - Measured colour contrast values (#1228)
 *
 * axe-core reports the colours and ratio it measured for each element checked
 * by its color-contrast rules: in the check data (fgColor, bgColor,
 * contrastRatio, expectedContrastRatio) and in the failure summary text. These
 * helpers carry those values through. A value the browser did not report is
 * null (or a ratio of -1 in ContrastAnalysis), never a default colour or ratio.
 */

import type { ContrastAnalysis, ContrastValues } from '../interfaces.js';

/** The fields of axe-core's color-contrast check data that AQE keeps. */
export interface AxeContrastData {
  fgColor?: string;
  bgColor?: string;
  contrastRatio?: number;
  expectedContrastRatio?: string;
}

/** axe-core rule ids that measure text contrast. */
export const CONTRAST_RULE_IDS = ['color-contrast', 'color-contrast-enhanced'] as const;

export function isContrastRule(ruleId: string): boolean {
  return ruleId.includes('contrast');
}

/**
 * Browser-side expression `(node) => AxeContrastData | undefined` for an axe-core
 * result node. Embedded in the scripts that run axe-core in the page.
 */
export const AXE_CONTRAST_DATA_JS = `function (n) {
  var checks = [].concat(n.any || [], n.all || [], n.none || []);
  for (var i = 0; i < checks.length; i++) {
    var c = checks[i];
    if ((c.id === 'color-contrast' || c.id === 'color-contrast-enhanced') && c.data) {
      return {
        fgColor: c.data.fgColor,
        bgColor: c.data.bgColor,
        contrastRatio: c.data.contrastRatio,
        expectedContrastRatio: c.data.expectedContrastRatio
      };
    }
  }
  return undefined;
}`;

const COLOR = '(#[0-9a-f]{3,8}|rgba?\\([^)]*\\))';

/**
 * Read the values from axe-core's failure summary, e.g. "Element has insufficient
 * color contrast of 2.32 (foreground color: #aaaaaa, background color: #ffffff,
 * ...). Expected contrast ratio of 4.5:1".
 */
export function parseContrastFailureSummary(summary: string | undefined): ContrastValues {
  const text = summary ?? '';
  const ratio = text.match(/contrast (?:ratio )?of\s*(\d+(?:\.\d+)?)(?![\d.]|\s*:)/i);
  const fg = text.match(new RegExp(`foreground colou?r:?\\s*${COLOR}`, 'i'));
  const bg = text.match(new RegExp(`background colou?r:?\\s*${COLOR}`, 'i'));
  const expected = text.match(/expected contrast ratio of\s*(\d+(?:\.\d+)?)\s*:\s*1/i);
  return {
    foreground: fg?.[1] ?? null,
    background: bg?.[1] ?? null,
    ratio: validRatio(ratio ? parseFloat(ratio[1]) : undefined),
    requiredRatio: validRatio(expected ? parseFloat(expected[1]) : undefined),
  };
}

/** Values from axe-core's check data, with gaps filled from the failure summary. */
export function contrastValues(data: AxeContrastData | undefined, failureSummary?: string): ContrastValues {
  const parsed = parseContrastFailureSummary(failureSummary);
  const expected = data?.expectedContrastRatio?.match(/(\d+(?:\.\d+)?)/);
  return {
    foreground: nonEmpty(data?.fgColor) ?? parsed.foreground,
    background: nonEmpty(data?.bgColor) ?? parsed.background,
    ratio: validRatio(data?.contrastRatio) ?? parsed.ratio,
    requiredRatio: validRatio(expected ? parseFloat(expected[1]) : undefined) ?? parsed.requiredRatio,
  };
}

export function contrastValuesMeasured(values: ContrastValues): boolean {
  return values.foreground !== null && values.background !== null && values.ratio !== null;
}

/** The ratio WCAG requires for normal text at a level, when axe-core did not say. */
export function defaultRequiredRatio(level: 'A' | 'AA' | 'AAA'): number {
  return level === 'AAA' ? 7 : 4.5;
}

/** One element's contrast result; unreported values stay unmeasured. */
export function toContrastAnalysis(
  element: string,
  values: ContrastValues,
  passes: boolean,
  wcagLevel: 'A' | 'AA' | 'AAA'
): ContrastAnalysis {
  const measured = contrastValuesMeasured(values);
  return {
    element,
    foreground: values.foreground,
    background: values.background,
    ratio: values.ratio ?? -1,
    requiredRatio: values.requiredRatio ?? defaultRequiredRatio(wcagLevel),
    passes,
    wcagLevel,
    measured,
    ...(measured ? {} : { notMeasuredReason: 'the browser did not report the colours and ratio for this element' }),
  };
}

function validRatio(value: number | undefined): number | null {
  // A contrast ratio is between 1 and 21; axe-core reports 0 when it could not compute one.
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? value : null;
}

function nonEmpty(value: string | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

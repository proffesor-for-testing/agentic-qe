/**
 * EN 301 549 EU Accessibility Standard Mapping
 *
 * Maps WCAG 2.2 criteria to EN 301 549 requirements and EU Accessibility Act articles.
 * EN 301 549 is the European standard for digital accessibility, harmonized with WCAG 2.1/2.2.
 *
 * References:
 * - EN 301 549 V3.2.1 (2021-03): https://www.etsi.org/deliver/etsi_en/301500_301599/301549/03.02.01_60/en_301549v030201p.pdf
 * - EU Web Accessibility Directive (2016/2102)
 * - European Accessibility Act (Directive 2019/882)
 */

export interface EN301549Requirement {
  wcagCriterion: string;
  wcagLevel: 'A' | 'AA' | 'AAA';
  en301549Clause: string;
  en301549Title: string;
  euWebDirective?: string;
  euAccessibilityAct?: string;
  applicableRegions: string[];
  legalMandatory: boolean;
  complianceDeadline?: string;
  exemptions?: string[];
}

/**
 * Complete mapping of WCAG 2.2 to EN 301 549
 */
export const EN301549_MAPPING: Record<string, EN301549Requirement> = {
  // Perceivable - Principle 1
  '1.1.1': {
    wcagCriterion: '1.1.1',
    wcagLevel: 'A',
    en301549Clause: '9.1.1.1',
    en301549Title: 'Non-text content',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(a)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28', // EAA deadline
    exemptions: ['Archives created before 2019-09-23']
  },

  '1.2.1': {
    wcagCriterion: '1.2.1',
    wcagLevel: 'A',
    en301549Clause: '9.1.2.1',
    en301549Title: 'Audio-only and video-only (prerecorded)',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(b)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.2.2': {
    wcagCriterion: '1.2.2',
    wcagLevel: 'A',
    en301549Clause: '9.1.2.2',
    en301549Title: 'Captions (prerecorded)',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(c)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.2.3': {
    wcagCriterion: '1.2.3',
    wcagLevel: 'A',
    en301549Clause: '9.1.2.3',
    en301549Title: 'Audio description or media alternative (prerecorded)',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(d)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.2.4': {
    wcagCriterion: '1.2.4',
    wcagLevel: 'AA',
    en301549Clause: '9.1.2.4',
    en301549Title: 'Captions (live)',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(e)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.2.5': {
    wcagCriterion: '1.2.5',
    wcagLevel: 'AA',
    en301549Clause: '9.1.2.5',
    en301549Title: 'Audio description (prerecorded)',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(f)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.3.1': {
    wcagCriterion: '1.3.1',
    wcagLevel: 'A',
    en301549Clause: '9.1.3.1',
    en301549Title: 'Info and relationships',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(g)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.3.2': {
    wcagCriterion: '1.3.2',
    wcagLevel: 'A',
    en301549Clause: '9.1.3.2',
    en301549Title: 'Meaningful sequence',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(h)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.3.3': {
    wcagCriterion: '1.3.3',
    wcagLevel: 'A',
    en301549Clause: '9.1.3.3',
    en301549Title: 'Sensory characteristics',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(i)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.3.4': {
    wcagCriterion: '1.3.4',
    wcagLevel: 'AA',
    en301549Clause: '9.1.3.4',
    en301549Title: 'Orientation',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(j)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.3.5': {
    wcagCriterion: '1.3.5',
    wcagLevel: 'AA',
    en301549Clause: '9.1.3.5',
    en301549Title: 'Identify input purpose',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(k)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.4.1': {
    wcagCriterion: '1.4.1',
    wcagLevel: 'A',
    en301549Clause: '9.1.4.1',
    en301549Title: 'Use of color',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(l)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.4.2': {
    wcagCriterion: '1.4.2',
    wcagLevel: 'A',
    en301549Clause: '9.1.4.2',
    en301549Title: 'Audio control',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(m)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.4.3': {
    wcagCriterion: '1.4.3',
    wcagLevel: 'AA',
    en301549Clause: '9.1.4.3',
    en301549Title: 'Contrast (minimum)',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(n)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.4.4': {
    wcagCriterion: '1.4.4',
    wcagLevel: 'AA',
    en301549Clause: '9.1.4.4',
    en301549Title: 'Resize text',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(o)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.4.5': {
    wcagCriterion: '1.4.5',
    wcagLevel: 'AA',
    en301549Clause: '9.1.4.5',
    en301549Title: 'Images of text',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(p)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.4.10': {
    wcagCriterion: '1.4.10',
    wcagLevel: 'AA',
    en301549Clause: '9.1.4.10',
    en301549Title: 'Reflow',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(q)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.4.11': {
    wcagCriterion: '1.4.11',
    wcagLevel: 'AA',
    en301549Clause: '9.1.4.11',
    en301549Title: 'Non-text contrast',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(r)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.4.12': {
    wcagCriterion: '1.4.12',
    wcagLevel: 'AA',
    en301549Clause: '9.1.4.12',
    en301549Title: 'Text spacing',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(s)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '1.4.13': {
    wcagCriterion: '1.4.13',
    wcagLevel: 'AA',
    en301549Clause: '9.1.4.13',
    en301549Title: 'Content on hover or focus',
    euWebDirective: 'Annex I, Section 1',
    euAccessibilityAct: 'Annex I, Section II(t)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  // Operable - Principle 2
  '2.1.1': {
    wcagCriterion: '2.1.1',
    wcagLevel: 'A',
    en301549Clause: '9.2.1.1',
    en301549Title: 'Keyboard',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(a)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.1.2': {
    wcagCriterion: '2.1.2',
    wcagLevel: 'A',
    en301549Clause: '9.2.1.2',
    en301549Title: 'No keyboard trap',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(b)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.1.4': {
    wcagCriterion: '2.1.4',
    wcagLevel: 'A',
    en301549Clause: '9.2.1.4',
    en301549Title: 'Character key shortcuts',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(c)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.4.1': {
    wcagCriterion: '2.4.1',
    wcagLevel: 'A',
    en301549Clause: '9.2.4.1',
    en301549Title: 'Bypass blocks',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(d)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.4.2': {
    wcagCriterion: '2.4.2',
    wcagLevel: 'A',
    en301549Clause: '9.2.4.2',
    en301549Title: 'Page titled',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(e)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.4.3': {
    wcagCriterion: '2.4.3',
    wcagLevel: 'A',
    en301549Clause: '9.2.4.3',
    en301549Title: 'Focus order',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(f)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.4.4': {
    wcagCriterion: '2.4.4',
    wcagLevel: 'A',
    en301549Clause: '9.2.4.4',
    en301549Title: 'Link purpose (in context)',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(g)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.4.7': {
    wcagCriterion: '2.4.7',
    wcagLevel: 'AA',
    en301549Clause: '9.2.4.7',
    en301549Title: 'Focus visible',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(h)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.5.1': {
    wcagCriterion: '2.5.1',
    wcagLevel: 'A',
    en301549Clause: '9.2.5.1',
    en301549Title: 'Pointer gestures',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(i)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.5.2': {
    wcagCriterion: '2.5.2',
    wcagLevel: 'A',
    en301549Clause: '9.2.5.2',
    en301549Title: 'Pointer cancellation',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(j)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.5.3': {
    wcagCriterion: '2.5.3',
    wcagLevel: 'A',
    en301549Clause: '9.2.5.3',
    en301549Title: 'Label in name',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(k)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '2.5.4': {
    wcagCriterion: '2.5.4',
    wcagLevel: 'A',
    en301549Clause: '9.2.5.4',
    en301549Title: 'Motion actuation',
    euWebDirective: 'Annex I, Section 2',
    euAccessibilityAct: 'Annex I, Section III(l)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  // Understandable - Principle 3
  '3.1.1': {
    wcagCriterion: '3.1.1',
    wcagLevel: 'A',
    en301549Clause: '9.3.1.1',
    en301549Title: 'Language of page',
    euWebDirective: 'Annex I, Section 3',
    euAccessibilityAct: 'Annex I, Section IV(a)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '3.1.2': {
    wcagCriterion: '3.1.2',
    wcagLevel: 'AA',
    en301549Clause: '9.3.1.2',
    en301549Title: 'Language of parts',
    euWebDirective: 'Annex I, Section 3',
    euAccessibilityAct: 'Annex I, Section IV(b)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '3.2.1': {
    wcagCriterion: '3.2.1',
    wcagLevel: 'A',
    en301549Clause: '9.3.2.1',
    en301549Title: 'On focus',
    euWebDirective: 'Annex I, Section 3',
    euAccessibilityAct: 'Annex I, Section IV(c)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '3.2.2': {
    wcagCriterion: '3.2.2',
    wcagLevel: 'A',
    en301549Clause: '9.3.2.2',
    en301549Title: 'On input',
    euWebDirective: 'Annex I, Section 3',
    euAccessibilityAct: 'Annex I, Section IV(d)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '3.3.1': {
    wcagCriterion: '3.3.1',
    wcagLevel: 'A',
    en301549Clause: '9.3.3.1',
    en301549Title: 'Error identification',
    euWebDirective: 'Annex I, Section 3',
    euAccessibilityAct: 'Annex I, Section IV(e)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '3.3.2': {
    wcagCriterion: '3.3.2',
    wcagLevel: 'A',
    en301549Clause: '9.3.3.2',
    en301549Title: 'Labels or instructions',
    euWebDirective: 'Annex I, Section 3',
    euAccessibilityAct: 'Annex I, Section IV(f)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '3.3.3': {
    wcagCriterion: '3.3.3',
    wcagLevel: 'AA',
    en301549Clause: '9.3.3.3',
    en301549Title: 'Error suggestion',
    euWebDirective: 'Annex I, Section 3',
    euAccessibilityAct: 'Annex I, Section IV(g)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '3.3.4': {
    wcagCriterion: '3.3.4',
    wcagLevel: 'AA',
    en301549Clause: '9.3.3.4',
    en301549Title: 'Error prevention (legal, financial, data)',
    euWebDirective: 'Annex I, Section 3',
    euAccessibilityAct: 'Annex I, Section IV(h)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  // Robust - Principle 4
  '4.1.1': {
    wcagCriterion: '4.1.1',
    wcagLevel: 'A',
    en301549Clause: '9.4.1.1',
    en301549Title: 'Parsing',
    euWebDirective: 'Annex I, Section 4',
    euAccessibilityAct: 'Annex I, Section V(a)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28',
    exemptions: ['Obsolete in WCAG 2.2 but retained in EN 301 549 V3.2.1']
  },

  '4.1.2': {
    wcagCriterion: '4.1.2',
    wcagLevel: 'A',
    en301549Clause: '9.4.1.2',
    en301549Title: 'Name, role, value',
    euWebDirective: 'Annex I, Section 4',
    euAccessibilityAct: 'Annex I, Section V(b)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  },

  '4.1.3': {
    wcagCriterion: '4.1.3',
    wcagLevel: 'AA',
    en301549Clause: '9.4.1.3',
    en301549Title: 'Status messages',
    euWebDirective: 'Annex I, Section 4',
    euAccessibilityAct: 'Annex I, Section V(c)',
    applicableRegions: ['EU', 'EEA', 'UK'],
    legalMandatory: true,
    complianceDeadline: '2025-06-28'
  }
};

/**
 * Get EN 301 549 requirement for a WCAG criterion
 */
export function getEN301549Requirement(wcagCriterion: string): EN301549Requirement | undefined {
  return EN301549_MAPPING[wcagCriterion];
}

/**
 * Check if a violation is legally mandatory in EU/EEA
 */
export function isEULegallyMandatory(wcagCriterion: string): boolean {
  const requirement = getEN301549Requirement(wcagCriterion);
  return requirement?.legalMandatory ?? false;
}

/**
 * Get compliance deadline for EU Accessibility Act
 */
export function getEUComplianceDeadline(wcagCriterion: string): string | undefined {
  const requirement = getEN301549Requirement(wcagCriterion);
  return requirement?.complianceDeadline;
}

/**
 * Check if website is exempt from requirement
 */
export function hasExemption(wcagCriterion: string, context?: string): boolean {
  const requirement = getEN301549Requirement(wcagCriterion);
  if (!requirement?.exemptions) return false;

  // Check if any exemption applies
  return requirement.exemptions.some(exemption => {
    if (context) {
      return context.toLowerCase().includes(exemption.toLowerCase());
    }
    return false;
  });
}

/**
 * Get legal risk level based on EN 301 549 compliance
 */
export function getLegalRiskLevel(wcagCriterion: string): 'critical' | 'high' | 'moderate' | 'low' {
  const requirement = getEN301549Requirement(wcagCriterion);

  if (!requirement) return 'low';

  if (requirement.legalMandatory) {
    // Check if deadline has passed
    if (requirement.complianceDeadline) {
      const deadline = new Date(requirement.complianceDeadline);
      const now = new Date();

      if (now > deadline) {
        return 'critical'; // Past deadline - immediate legal risk
      } else {
        const daysUntilDeadline = Math.floor((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilDeadline < 180) {
          return 'high'; // Less than 6 months - high priority
        }
      }
    }
    return 'moderate'; // Legally mandatory but time remains
  }

  return 'low'; // Not legally mandatory
}

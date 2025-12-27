/**
 * European Accessibility Act (EAA) Legal Framework
 *
 * Legal compliance mapping for Directive (EU) 2019/882
 * Version: Based on Directive (EU) 2019/882 (17 April 2019)
 *
 * Purpose: Track legal compliance with EU accessibility requirements
 * Reference: https://eur-lex.europa.eu/eli/dir/2019/882/oj
 *
 * Compliance Deadline: June 28, 2025
 *
 * Related Legislation:
 * - EU Web Accessibility Directive 2016/2102
 * - EN 301 549 V3.2.1 (Harmonized Standard)
 * - WCAG 2.1 Level AA (Technical Standard)
 */

export type ProductServiceCategory =
  | 'computers'
  | 'operating-systems'
  | 'self-service-terminals'
  | 'smartphones'
  | 'tv-equipment'
  | 'telephony-services'
  | 'audiovisual-media'
  | 'transport-services'
  | 'banking-services'
  | 'e-books'
  | 'e-commerce'
  | 'websites'
  | 'mobile-apps';

export interface EUAccessibilityActArticle {
  /** Article number in Directive (EU) 2019/882 */
  article: string;

  /** Article title */
  title: string;

  /** Legal requirement description */
  requirement: string;

  /** Applicable product/service categories */
  applicableTo: ProductServiceCategory[];

  /** Linked EN 301 549 clauses */
  en301549Clauses?: string[];

  /** Linked WCAG criteria */
  wcagCriteria?: string[];

  /** Whether compliance is mandatory */
  mandatory: boolean;

  /** Exemptions or special conditions */
  exemptions?: string[];

  /** Compliance deadline */
  complianceDeadline: string;

  /** Reference URL */
  referenceUrl?: string;
}

export interface NationalImplementation {
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;

  /** Country name */
  country: string;

  /** National law implementing EAA */
  nationalLaw?: string;

  /** Implementation status */
  status: 'implemented' | 'in-progress' | 'pending' | 'unknown';

  /** National authority responsible */
  authority?: string;

  /** Penalty framework */
  penalties?: {
    maxFine?: string;
    criminalSanctions?: boolean;
    description: string;
  };

  /** Additional national requirements beyond EAA */
  additionalRequirements?: string[];
}

export interface ComplianceAssessment {
  /** Overall compliance status */
  status: 'compliant' | 'partially-compliant' | 'non-compliant' | 'not-applicable';

  /** Product/service category */
  category: ProductServiceCategory;

  /** Compliance score (0-100) */
  score: number;

  /** Legal risk level */
  riskLevel: 'critical' | 'high' | 'moderate' | 'low';

  /** Days until compliance deadline */
  daysUntilDeadline: number;

  /** Failed requirements */
  failedRequirements: Array<{
    article: string;
    requirement: string;
    severity: 'critical' | 'major' | 'minor';
  }>;

  /** Recommended actions */
  recommendations: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low';
    action: string;
    deadline: string;
  }>;

  /** Applicable markets */
  applicableMarkets: string[]; // Country codes
}

/**
 * EU Accessibility Act Requirements Database
 */
export const EU_ACCESSIBILITY_ACT_REQUIREMENTS: Record<string, EUAccessibilityActArticle> = {
  'annex-i-section-i': {
    article: 'Annex I, Section I',
    title: 'General Accessibility Requirements for Products and Services',
    requirement: 'Provision of information about the functioning of the product or service that is perceivable, operable, understandable, and robust',
    applicableTo: [
      'computers',
      'operating-systems',
      'self-service-terminals',
      'smartphones',
      'tv-equipment',
      'websites',
      'mobile-apps',
      'e-commerce'
    ],
    en301549Clauses: ['9.1.1.1', '9.2.1.1', '9.3.1.1', '9.4.1.1'],
    wcagCriteria: ['1.1.1', '2.1.1', '3.1.1', '4.1.1'],
    mandatory: true,
    complianceDeadline: '2025-06-28',
    referenceUrl: 'https://eur-lex.europa.eu/eli/dir/2019/882/oj'
  },

  'annex-i-section-ii-a': {
    article: 'Annex I, Section II(a)',
    title: 'Perceivable - Information and user interface components must be presentable to users in ways they can perceive',
    requirement: 'Text alternatives for non-text content',
    applicableTo: [
      'computers',
      'operating-systems',
      'smartphones',
      'websites',
      'mobile-apps',
      'e-commerce',
      'audiovisual-media',
      'e-books'
    ],
    en301549Clauses: ['9.1.1.1'],
    wcagCriteria: ['1.1.1'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-ii-b': {
    article: 'Annex I, Section II(b)',
    title: 'Perceivable - Time-based media alternatives',
    requirement: 'Alternatives for time-based media including captions and audio descriptions',
    applicableTo: [
      'audiovisual-media',
      'websites',
      'mobile-apps',
      'e-commerce',
      'tv-equipment'
    ],
    en301549Clauses: ['9.1.2.1', '9.1.2.2', '9.1.2.3', '9.1.2.5'],
    wcagCriteria: ['1.2.1', '1.2.2', '1.2.3', '1.2.5'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-ii-c': {
    article: 'Annex I, Section II(c)',
    title: 'Perceivable - Adaptable content',
    requirement: 'Content can be presented in different ways without losing information or structure',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'operating-systems',
      'smartphones',
      'computers'
    ],
    en301549Clauses: ['9.1.3.1', '9.1.3.2', '9.1.3.3'],
    wcagCriteria: ['1.3.1', '1.3.2', '1.3.3'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-ii-d': {
    article: 'Annex I, Section II(d)',
    title: 'Perceivable - Distinguishable content',
    requirement: 'Make it easier for users to see and hear content including color contrast',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'smartphones',
      'computers',
      'operating-systems',
      'self-service-terminals'
    ],
    en301549Clauses: ['9.1.4.1', '9.1.4.3', '9.1.4.5', '9.1.4.11'],
    wcagCriteria: ['1.4.1', '1.4.3', '1.4.5', '1.4.11'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-iii-a': {
    article: 'Annex I, Section III(a)',
    title: 'Operable - Keyboard accessible',
    requirement: 'All functionality available from keyboard',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'computers',
      'operating-systems',
      'self-service-terminals'
    ],
    en301549Clauses: ['9.2.1.1', '9.2.1.2'],
    wcagCriteria: ['2.1.1', '2.1.2'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-iii-b': {
    article: 'Annex I, Section III(b)',
    title: 'Operable - Enough time',
    requirement: 'Provide users enough time to read and use content',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'banking-services',
      'self-service-terminals'
    ],
    en301549Clauses: ['9.2.2.1', '9.2.2.2'],
    wcagCriteria: ['2.2.1', '2.2.2'],
    mandatory: true,
    complianceDeadline: '2025-06-28',
    exemptions: ['Real-time events (auctions, games)']
  },

  'annex-i-section-iii-c': {
    article: 'Annex I, Section III(c)',
    title: 'Operable - Seizures and physical reactions',
    requirement: 'Do not design content that causes seizures or physical reactions',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'audiovisual-media',
      'tv-equipment',
      'smartphones'
    ],
    en301549Clauses: ['9.2.3.1'],
    wcagCriteria: ['2.3.1'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-iii-d': {
    article: 'Annex I, Section III(d)',
    title: 'Operable - Navigable',
    requirement: 'Provide ways to help users navigate, find content, and determine where they are',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'banking-services',
      'transport-services'
    ],
    en301549Clauses: ['9.2.4.1', '9.2.4.2', '9.2.4.3', '9.2.4.4', '9.2.4.5', '9.2.4.6', '9.2.4.7'],
    wcagCriteria: ['2.4.1', '2.4.2', '2.4.3', '2.4.4', '2.4.5', '2.4.6', '2.4.7'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-iii-e': {
    article: 'Annex I, Section III(e)',
    title: 'Operable - Input modalities',
    requirement: 'Make it easier for users to operate functionality through various inputs beyond keyboard',
    applicableTo: [
      'websites',
      'mobile-apps',
      'smartphones',
      'self-service-terminals'
    ],
    en301549Clauses: ['9.2.5.1', '9.2.5.2', '9.2.5.3', '9.2.5.4'],
    wcagCriteria: ['2.5.1', '2.5.2', '2.5.3', '2.5.4'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-iv-a': {
    article: 'Annex I, Section IV(a)',
    title: 'Understandable - Readable',
    requirement: 'Make text content readable and understandable',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'banking-services',
      'e-books'
    ],
    en301549Clauses: ['9.3.1.1', '9.3.1.2'],
    wcagCriteria: ['3.1.1', '3.1.2'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-iv-b': {
    article: 'Annex I, Section IV(b)',
    title: 'Understandable - Predictable',
    requirement: 'Make web pages appear and operate in predictable ways',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'banking-services',
      'self-service-terminals'
    ],
    en301549Clauses: ['9.3.2.1', '9.3.2.2', '9.3.2.3', '9.3.2.4'],
    wcagCriteria: ['3.2.1', '3.2.2', '3.2.3', '3.2.4'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-iv-c': {
    article: 'Annex I, Section IV(c)',
    title: 'Understandable - Input assistance',
    requirement: 'Help users avoid and correct mistakes',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'banking-services',
      'transport-services'
    ],
    en301549Clauses: ['9.3.3.1', '9.3.3.2', '9.3.3.3', '9.3.3.4'],
    wcagCriteria: ['3.3.1', '3.3.2', '3.3.3', '3.3.4'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-v': {
    article: 'Annex I, Section V',
    title: 'Robust - Compatible',
    requirement: 'Maximize compatibility with current and future user agents, including assistive technologies',
    applicableTo: [
      'websites',
      'mobile-apps',
      'e-commerce',
      'computers',
      'operating-systems',
      'smartphones'
    ],
    en301549Clauses: ['9.4.1.1', '9.4.1.2', '9.4.1.3'],
    wcagCriteria: ['4.1.1', '4.1.2', '4.1.3'],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  },

  'annex-i-section-vi': {
    article: 'Annex I, Section VI',
    title: 'Support services',
    requirement: 'Provide accessible customer support and feedback mechanisms',
    applicableTo: [
      'telephony-services',
      'banking-services',
      'transport-services',
      'e-commerce',
      'audiovisual-media'
    ],
    mandatory: true,
    complianceDeadline: '2025-06-28'
  }
};

/**
 * National implementations of the European Accessibility Act
 */
export const NATIONAL_IMPLEMENTATIONS: Record<string, NationalImplementation> = {
  'DE': {
    countryCode: 'DE',
    country: 'Germany',
    nationalLaw: 'Barrierefreiheitsstärkungsgesetz (BFSG)',
    status: 'implemented',
    authority: 'Bundesnetzagentur',
    penalties: {
      maxFine: '€100,000',
      criminalSanctions: false,
      description: 'Administrative fines up to €100,000 for non-compliance'
    }
  },

  'FR': {
    countryCode: 'FR',
    country: 'France',
    nationalLaw: 'In progress',
    status: 'in-progress',
    authority: 'Autorité de régulation des communications électroniques, des postes et de la distribution de la presse (ARCEP)',
    penalties: {
      description: 'Implementation pending - penalties to be defined'
    }
  },

  'IT': {
    countryCode: 'IT',
    country: 'Italy',
    nationalLaw: 'Decreto Legislativo (pending)',
    status: 'in-progress',
    authority: 'Agenzia per l\'Italia Digitale (AgID)'
  },

  'ES': {
    countryCode: 'ES',
    country: 'Spain',
    nationalLaw: 'In progress',
    status: 'in-progress',
    authority: 'Ministerio de Asuntos Económicos y Transformación Digital'
  },

  'NL': {
    countryCode: 'NL',
    country: 'Netherlands',
    nationalLaw: 'In progress',
    status: 'in-progress',
    authority: 'Autoriteit Consument en Markt (ACM)'
  },

  'BE': {
    countryCode: 'BE',
    country: 'Belgium',
    nationalLaw: 'In progress',
    status: 'in-progress',
    authority: 'Service Public Fédéral Économie'
  },

  'AT': {
    countryCode: 'AT',
    country: 'Austria',
    nationalLaw: 'Barrierefreiheitsgesetz',
    status: 'implemented',
    authority: 'Bundesministerium für Soziales, Gesundheit, Pflege und Konsumentenschutz'
  },

  'PL': {
    countryCode: 'PL',
    country: 'Poland',
    nationalLaw: 'In progress',
    status: 'in-progress',
    authority: 'Urząd Ochrony Konkurencji i Konsumentów (UOKiK)'
  },

  'SE': {
    countryCode: 'SE',
    country: 'Sweden',
    nationalLaw: 'Lag om tillgänglighet till digital offentlig service',
    status: 'implemented',
    authority: 'Myndigheten för digital förvaltning (DIGG)',
    penalties: {
      maxFine: 'SEK 1,000,000',
      description: 'Administrative fines for non-compliance'
    }
  },

  'DK': {
    countryCode: 'DK',
    country: 'Denmark',
    nationalLaw: 'In progress',
    status: 'in-progress',
    authority: 'Erhvervsstyrelsen (Danish Business Authority)'
  },

  'FI': {
    countryCode: 'FI',
    country: 'Finland',
    nationalLaw: 'Laki digitaalisten palvelujen tarjoamisesta',
    status: 'implemented',
    authority: 'Liikenne- ja viestintävirasto (Finnish Transport and Communications Agency)'
  },

  'IE': {
    countryCode: 'IE',
    country: 'Ireland',
    nationalLaw: 'In progress',
    status: 'in-progress',
    authority: 'National Disability Authority (NDA)'
  }
};

/**
 * Calculate compliance deadline urgency
 */
export function getDeadlineUrgency(category: ProductServiceCategory): {
  daysUntilDeadline: number;
  urgencyLevel: 'critical' | 'high' | 'moderate' | 'low';
  message: string;
} {
  const deadline = new Date('2025-06-28');
  const now = new Date();
  const daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let urgencyLevel: 'critical' | 'high' | 'moderate' | 'low';
  let message: string;

  if (daysUntilDeadline < 0) {
    urgencyLevel = 'critical';
    message = `OVERDUE: Compliance deadline passed ${Math.abs(daysUntilDeadline)} days ago`;
  } else if (daysUntilDeadline < 90) {
    urgencyLevel = 'critical';
    message = `URGENT: ${daysUntilDeadline} days until mandatory compliance deadline`;
  } else if (daysUntilDeadline < 180) {
    urgencyLevel = 'high';
    message = `${daysUntilDeadline} days until compliance deadline - immediate action required`;
  } else if (daysUntilDeadline < 365) {
    urgencyLevel = 'moderate';
    message = `${daysUntilDeadline} days until compliance deadline - plan remediation now`;
  } else {
    urgencyLevel = 'low';
    message = `${daysUntilDeadline} days until compliance deadline`;
  }

  return { daysUntilDeadline, urgencyLevel, message };
}

/**
 * Assess EAA compliance for a product/service
 */
export function assessEAACompliance(
  category: ProductServiceCategory,
  violations: Array<{
    wcagCriterion: string;
    severity: 'critical' | 'serious' | 'moderate' | 'minor';
  }>,
  targetMarkets: string[] = ['EU']
): ComplianceAssessment {
  // Get all applicable requirements for this category
  const applicableRequirements = Object.values(EU_ACCESSIBILITY_ACT_REQUIREMENTS)
    .filter(req => req.applicableTo.includes(category));

  // Map violations to failed requirements
  const failedRequirements: Array<{
    article: string;
    requirement: string;
    severity: 'critical' | 'major' | 'minor';
  }> = [];

  violations.forEach(violation => {
    applicableRequirements.forEach(req => {
      if (req.wcagCriteria?.includes(violation.wcagCriterion)) {
        failedRequirements.push({
          article: req.article,
          requirement: req.requirement,
          severity: violation.severity === 'critical' || violation.severity === 'serious' ? 'critical' :
            violation.severity === 'moderate' ? 'major' : 'minor'
        });
      }
    });
  });

  // Calculate compliance score
  const totalRequirements = applicableRequirements.length;
  const failedCount = failedRequirements.length;
  const score = Math.max(0, Math.round(((totalRequirements - failedCount) / totalRequirements) * 100));

  // Determine status
  let status: 'compliant' | 'partially-compliant' | 'non-compliant' | 'not-applicable';
  if (failedRequirements.filter(r => r.severity === 'critical').length > 0) {
    status = 'non-compliant';
  } else if (score >= 95) {
    status = 'compliant';
  } else if (score >= 70) {
    status = 'partially-compliant';
  } else {
    status = 'non-compliant';
  }

  // Deadline urgency
  const { daysUntilDeadline, urgencyLevel } = getDeadlineUrgency(category);

  // Risk level
  const riskLevel: 'critical' | 'high' | 'moderate' | 'low' =
    daysUntilDeadline < 0 ? 'critical' :
    (status === 'non-compliant' && daysUntilDeadline < 180) ? 'critical' :
    (status === 'non-compliant' && daysUntilDeadline < 365) ? 'high' :
    status === 'partially-compliant' ? 'moderate' : 'low';

  // Generate recommendations
  const recommendations: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low';
    action: string;
    deadline: string;
  }> = [];

  // Critical violations
  const criticalViolations = failedRequirements.filter(r => r.severity === 'critical');
  if (criticalViolations.length > 0) {
    recommendations.push({
      priority: 'critical',
      action: `Fix ${criticalViolations.length} critical accessibility violations immediately`,
      deadline: 'Within 30 days'
    });
  }

  // Major violations
  const majorViolations = failedRequirements.filter(r => r.severity === 'major');
  if (majorViolations.length > 0) {
    recommendations.push({
      priority: 'high',
      action: `Address ${majorViolations.length} major accessibility issues`,
      deadline: 'Within 90 days'
    });
  }

  // Compliance testing
  if (status !== 'compliant') {
    recommendations.push({
      priority: 'high',
      action: 'Conduct comprehensive accessibility audit against EN 301 549',
      deadline: 'Before June 28, 2025'
    });
  }

  // Documentation
  recommendations.push({
    priority: 'medium',
    action: 'Document accessibility conformance for EAA compliance evidence',
    deadline: 'Ongoing'
  });

  // Staff training
  if (failedRequirements.length > 5) {
    recommendations.push({
      priority: 'medium',
      action: 'Train development and design teams on accessibility requirements',
      deadline: 'Within 60 days'
    });
  }

  return {
    status,
    category,
    score,
    riskLevel,
    daysUntilDeadline,
    failedRequirements,
    recommendations,
    applicableMarkets: targetMarkets
  };
}

/**
 * Get applicable EAA requirements for a product/service category
 */
export function getApplicableRequirements(category: ProductServiceCategory): EUAccessibilityActArticle[] {
  return Object.values(EU_ACCESSIBILITY_ACT_REQUIREMENTS)
    .filter(req => req.applicableTo.includes(category));
}

/**
 * Generate EAA compliance report
 */
export function generateEAAComplianceReport(assessment: ComplianceAssessment): string {
  let report = '=== European Accessibility Act Compliance Report ===\n\n';

  report += `Product/Service Category: ${assessment.category}\n`;
  report += `Compliance Status: ${assessment.status.toUpperCase()}\n`;
  report += `Compliance Score: ${assessment.score}/100\n`;
  report += `Legal Risk Level: ${assessment.riskLevel.toUpperCase()}\n`;

  const { message } = getDeadlineUrgency(assessment.category);
  report += `Deadline: ${message}\n\n`;

  if (assessment.failedRequirements.length > 0) {
    report += '--- Failed Requirements ---\n';
    assessment.failedRequirements.forEach((req, index) => {
      const icon = req.severity === 'critical' ? '❌' :
        req.severity === 'major' ? '⚠️' : 'ℹ️';
      report += `${icon} [${req.article}] ${req.requirement}\n`;
    });
    report += '\n';
  }

  if (assessment.recommendations.length > 0) {
    report += '--- Recommended Actions ---\n';
    assessment.recommendations
      .sort((a, b) => {
        const priority = { critical: 1, high: 2, medium: 3, low: 4 };
        return priority[a.priority] - priority[b.priority];
      })
      .forEach((rec, index) => {
        const icon = rec.priority === 'critical' ? '🔴' :
          rec.priority === 'high' ? '🟠' :
          rec.priority === 'medium' ? '🟡' : '🟢';
        report += `${icon} [${rec.priority.toUpperCase()}] ${rec.action}\n`;
        report += `   Deadline: ${rec.deadline}\n`;
      });
    report += '\n';
  }

  report += '--- Applicable Markets ---\n';
  assessment.applicableMarkets.forEach(market => {
    const implementation = NATIONAL_IMPLEMENTATIONS[market];
    if (implementation) {
      report += `${implementation.country} (${market}): ${implementation.status}\n`;
      if (implementation.penalties) {
        report += `  Penalties: ${implementation.penalties.description}\n`;
      }
    }
  });

  report += '\n--- Legal Framework ---\n';
  report += '• Directive (EU) 2019/882 (European Accessibility Act)\n';
  report += '• Compliance Deadline: June 28, 2025\n';
  report += '• Harmonized Standard: EN 301 549 V3.2.1\n';
  report += '• Technical Standard: WCAG 2.1 Level AA\n';

  return report;
}

/**
 * Quality Criteria Service Types
 * HTSM v6.3 Quality Criteria analysis types
 */

// ============================================================================
// HTSM Categories
// ============================================================================

export type HTSMCategory =
  | 'Capability'
  | 'Reliability'
  | 'Usability'
  | 'Charisma'
  | 'Security'
  | 'Scalability'
  | 'Compatibility'
  | 'Performance'
  | 'Installability'
  | 'Development';

export const HTSM_CATEGORIES: HTSMCategory[] = [
  'Capability',
  'Reliability',
  'Usability',
  'Charisma',
  'Security',
  'Scalability',
  'Compatibility',
  'Performance',
  'Installability',
  'Development',
];

export const NEVER_OMIT_CATEGORIES: HTSMCategory[] = [
  'Capability',
  'Reliability',
  'Security',
  'Performance',
  'Development',
];

// ============================================================================
// Evidence Classification
// ============================================================================

export type EvidenceType = 'Direct' | 'Inferred' | 'Claimed';

export interface EvidencePoint {
  /** Source reference in file:line format (e.g., src/auth.ts:45-52) */
  sourceReference: string;
  /** Evidence classification */
  type: EvidenceType;
  /** Quality implication */
  qualityImplication: string;
  /** Reasoning (WHY it matters, not WHAT it does) */
  reasoning: string;
}

// ============================================================================
// Priority Assignment
// ============================================================================

export type Priority = 'P0' | 'P1' | 'P2' | 'P3';

export interface PriorityDefinition {
  level: Priority;
  name: string;
  description: string;
  color: string;
  backgroundColor: string;
}

export const PRIORITY_DEFINITIONS: Record<Priority, PriorityDefinition> = {
  P0: {
    level: 'P0',
    name: 'Critical',
    description: 'Failure causes immediate business/user harm',
    color: '#dc3545',
    backgroundColor: '#fff5f5',
  },
  P1: {
    level: 'P1',
    name: 'High',
    description: 'Critical to core user value proposition',
    color: '#fd7e14',
    backgroundColor: '#fff8f0',
  },
  P2: {
    level: 'P2',
    name: 'Medium',
    description: 'Affects satisfaction but not blocking',
    color: '#ffc107',
    backgroundColor: '#fffdf5',
  },
  P3: {
    level: 'P3',
    name: 'Low',
    description: 'Nice-to-have improvements',
    color: '#28a745',
    backgroundColor: '#f5fff5',
  },
};

// ============================================================================
// Recommendations
// ============================================================================

export interface QualityCriteriaRecommendation {
  /** HTSM category */
  category: HTSMCategory;
  /** Priority level */
  priority: Priority;
  /** Evidence points supporting the recommendation */
  evidencePoints: EvidencePoint[];
  /** Suggested test focus areas */
  testFocusAreas: string[];
  /** Automation fitness assessment */
  automationFitness: 'high' | 'medium' | 'low';
  /** Why this matters for the project */
  whyItMatters: string;
  /** Business impact (quantified where possible) */
  businessImpact: string;
}

export interface CrossCuttingConcern {
  /** Description of the concern */
  concern: string;
  /** Categories affected */
  affectedCategories: HTSMCategory[];
  /** Recommendation for addressing */
  recommendation: string;
}

export interface PIGuidanceItem {
  /** Sprint or iteration */
  sprint: string;
  /** Focus areas for this sprint */
  focusAreas: string[];
  /** Key risks to address */
  keyRisks: string[];
}

// ============================================================================
// Analysis Results
// ============================================================================

export interface QualityCriteriaAnalysis {
  /** Epic or feature being analyzed */
  epic: string;
  /** Component or module name */
  component?: string;
  /** Analysis timestamp */
  timestamp: Date;
  /** Coverage metric (e.g., "8 of 10 HTSM Categories") */
  coverageMetric: string;
  /** Categories analyzed */
  categoriesAnalyzed: HTSMCategory[];
  /** Categories omitted with reasons */
  categoriesOmitted: Array<{ category: HTSMCategory; reason: string }>;
  /** Recommendations by priority */
  recommendations: QualityCriteriaRecommendation[];
  /** Cross-cutting concerns */
  crossCuttingConcerns: CrossCuttingConcern[];
  /** PI Planning guidance */
  piPlanningGuidance: PIGuidanceItem[];
  /** Executive summary */
  executiveSummary: string;
}

// ============================================================================
// Agent Invocation (for semantic analysis)
// ============================================================================

/**
 * Agent invocation - tells Claude Code to spawn an agent for real semantic analysis.
 * This is returned by both the service and MCP tool when semantic HTSM analysis is needed.
 */
export interface AgentInvocation {
  /** Always true - agent invocation is required for semantic analysis */
  required: true;
  /** Agent type to spawn */
  agentType: 'qe-quality-criteria-recommender';
  /** Complete prompt for the agent */
  prompt: string;
  /** Timeout in milliseconds */
  timeout: number;
  /** Expected output format */
  expectedOutput: 'QualityCriteriaAnalysis';
  /** Instructions for the caller */
  instructions: string;
}

// ============================================================================
// Service Configuration
// ============================================================================

export interface QualityCriteriaServiceConfig {
  /** Enable semantic analysis (default: true) */
  enableSemanticAnalysis?: boolean;
  /** Default output format */
  defaultOutputFormat?: 'html' | 'json' | 'markdown';
  /** Path to HTML template */
  templatePath?: string;
  /** Minimum categories to analyze (default: 8) */
  minimumCategories?: number;
}

export interface QualityCriteriaInput {
  /** Path to epic/requirements document */
  epicPath?: string;
  /** Epic content (if not using path) */
  epicContent?: string;
  /** Source paths to analyze */
  sourcePaths?: string[];
  /** Assessment name */
  assessmentName: string;
  /** Output format */
  outputFormat?: 'html' | 'json' | 'markdown';
  /** Output path */
  outputPath?: string;
}

export interface QualityCriteriaOutput {
  /**
   * Agent invocation required for semantic analysis.
   * Claude Code MUST spawn the qe-quality-criteria-recommender agent with the provided prompt.
   * This is the ONLY way to get real HTSM semantic analysis.
   */
  agentInvocation: AgentInvocation;
  /** Message explaining what needs to happen */
  message: string;
}

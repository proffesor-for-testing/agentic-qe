/**
 * Browser Workflow Templates
 *
 * This module exports all available browser workflow templates and the WorkflowLoader
 * for loading and executing browser automation workflows.
 */

export {
  WorkflowLoader,
  defaultWorkflowLoader,
  interpolateVariables,
  evaluateCondition,
} from './workflow-loader';

export type {
  BrowserWorkflow,
  WorkflowVariable,
  WorkflowStep,
  WorkflowContext,
  ValidationResult,
} from './workflow-loader';

/**
 * Available workflow templates
 */
export const WORKFLOW_TEMPLATES = [
  'login-flow',
  'oauth-flow',
  'scraping-workflow',
  'visual-regression',
  'form-validation',
  'navigation-flow',
  'api-integration',
  'performance-audit',
  'accessibility-audit',
] as const;

export type WorkflowTemplateName = typeof WORKFLOW_TEMPLATES[number];

/**
 * Workflow template descriptions
 */
export const WORKFLOW_DESCRIPTIONS: Record<WorkflowTemplateName, string> = {
  'login-flow': 'Authentication testing workflow for login forms with credential validation',
  'oauth-flow': 'OAuth2/OIDC authentication testing workflow with provider integration',
  'scraping-workflow': 'Data extraction workflow for web scraping with pagination and structured output',
  'visual-regression': 'Screenshot comparison workflow for visual regression testing across breakpoints',
  'form-validation': 'Input validation testing workflow for form fields with error handling',
  'navigation-flow': 'Multi-page navigation workflow for testing user journeys and state persistence',
  'api-integration': 'Browser-API hybrid testing workflow for validating frontend-backend integration',
  'performance-audit': 'Lighthouse-style performance audit workflow with Core Web Vitals',
  'accessibility-audit': 'WCAG 2.1 Level AA compliance audit workflow with automated accessibility testing',
};

/**
 * Workflow categories for organization
 */
export const WORKFLOW_CATEGORIES = {
  authentication: ['login-flow', 'oauth-flow'],
  testing: ['form-validation', 'navigation-flow', 'api-integration'],
  quality: ['visual-regression', 'performance-audit', 'accessibility-audit'],
  automation: ['scraping-workflow'],
} as const;

/**
 * Get workflows by category
 */
export function getWorkflowsByCategory(
  category: keyof typeof WORKFLOW_CATEGORIES
): readonly WorkflowTemplateName[] {
  return WORKFLOW_CATEGORIES[category];
}

/**
 * Check if a workflow template exists
 */
export function isValidWorkflowTemplate(name: string): name is WorkflowTemplateName {
  return WORKFLOW_TEMPLATES.includes(name as WorkflowTemplateName);
}

/**
 * Get all workflow templates with their descriptions
 */
export function getAllWorkflowTemplates(): Array<{
  name: WorkflowTemplateName;
  description: string;
  category: string;
}> {
  return WORKFLOW_TEMPLATES.map(name => {
    const category = Object.entries(WORKFLOW_CATEGORIES).find(([_, templates]) =>
      (templates as readonly string[]).includes(name)
    )?.[0] || 'other';

    return {
      name,
      description: WORKFLOW_DESCRIPTIONS[name],
      category,
    };
  });
}

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
  success: boolean;
  workflowName: string;
  templateName: string;
  startTime: number;
  endTime: number;
  duration: number;
  stepsExecuted: number;
  stepsPassed: number;
  stepsFailed: number;
  results: Map<string, any>;
  errors: Array<{
    step: string;
    error: string;
  }>;
}

/**
 * Workflow execution options
 */
export interface WorkflowExecutionOptions {
  continueOnError?: boolean;
  captureScreenshots?: boolean;
  screenshotDir?: string;
  timeout?: number;
  headless?: boolean;
}

// WorkflowLoader, BrowserWorkflow, WorkflowVariable, WorkflowStep are already exported above

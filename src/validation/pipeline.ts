/**
 * Structured Validation Pipeline Framework (BMAD-003)
 *
 * Generic pipeline runner that executes validation steps sequentially,
 * enforcing gates and producing structured reports.
 */

export type StepCategory = 'format' | 'content' | 'quality' | 'traceability' | 'compliance';
export type StepSeverity = 'blocking' | 'warning' | 'info';
export type StepStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface Finding {
  id: string;
  stepId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  location?: string;
  suggestion?: string;
}

export interface ValidationContext {
  /** The content being validated (requirements doc, code, etc.) */
  content: string;
  /** File path if applicable */
  filePath?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Results from previous steps (accumulated) */
  previousResults: StepResult[];
}

export interface ValidationStep {
  id: string;
  name: string;
  category: StepCategory;
  severity: StepSeverity;
  description?: string;
  execute(context: ValidationContext): Promise<StepResult>;
}

export interface StepResult {
  stepId: string;
  stepName: string;
  status: StepStatus;
  score: number;          // 0-100
  findings: Finding[];
  evidence: string[];     // What was checked
  duration: number;       // ms
}

export interface PipelineConfig {
  /** Pipeline identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Steps to execute */
  steps: ValidationStep[];
  /** Continue past blocking failures */
  continueOnFailure?: boolean;
  /** Only run specific steps (by id) */
  stepFilter?: string[];
  /** Weights for score calculation (step category -> weight) */
  categoryWeights?: Record<StepCategory, number>;
}

export interface PipelineResult {
  pipelineId: string;
  pipelineName: string;
  overall: 'pass' | 'fail' | 'warn';
  score: number;          // Weighted average 0-100
  steps: StepResult[];
  blockers: Finding[];    // Findings from blocking steps that failed
  halted: boolean;        // Did pipeline halt early?
  haltedAt?: string;      // Step ID where it halted
  totalDuration: number;  // ms
  timestamp: string;
}

const DEFAULT_CATEGORY_WEIGHTS: Record<StepCategory, number> = {
  format: 0.10,
  content: 0.30,
  quality: 0.25,
  traceability: 0.20,
  compliance: 0.15,
};

/**
 * Execute a validation pipeline.
 */
export async function runPipeline(
  config: PipelineConfig,
  content: string,
  filePath?: string,
  metadata?: Record<string, unknown>,
): Promise<PipelineResult> {
  const startTime = Date.now();
  const weights = config.categoryWeights || DEFAULT_CATEGORY_WEIGHTS;

  const context: ValidationContext = {
    content,
    filePath,
    metadata,
    previousResults: [],
  };

  const stepResults: StepResult[] = [];
  const blockers: Finding[] = [];
  let halted = false;
  let haltedAt: string | undefined;

  // Filter steps if specified
  const stepsToRun = config.stepFilter
    ? config.steps.filter(s => config.stepFilter!.includes(s.id))
    : config.steps;

  for (const step of stepsToRun) {
    const stepStart = Date.now();

    let result: StepResult;
    try {
      result = await step.execute(context);
    } catch (err) {
      result = {
        stepId: step.id,
        stepName: step.name,
        status: 'fail',
        score: 0,
        findings: [{
          id: `${step.id}-error`,
          stepId: step.id,
          severity: 'critical',
          title: `Step execution failed: ${step.name}`,
          description: (err as Error).message,
        }],
        evidence: ['Step threw an exception during execution'],
        duration: Date.now() - stepStart,
      };
    }

    // Ensure duration is set
    if (!result.duration) {
      result.duration = Date.now() - stepStart;
    }

    stepResults.push(result);
    context.previousResults.push(result);

    // Check for blocking failure
    if (step.severity === 'blocking' && result.status === 'fail') {
      blockers.push(...result.findings);

      if (!config.continueOnFailure) {
        halted = true;
        haltedAt = step.id;
        break;
      }
    }
  }

  // Calculate overall score (weighted average by category)
  const categoryScores: Record<string, { total: number; count: number }> = {};
  for (const result of stepResults) {
    const step = config.steps.find(s => s.id === result.stepId);
    if (!step) continue;

    if (!categoryScores[step.category]) {
      categoryScores[step.category] = { total: 0, count: 0 };
    }
    categoryScores[step.category].total += result.score;
    categoryScores[step.category].count += 1;
  }

  let weightedScore = 0;
  let totalWeight = 0;
  for (const [category, { total, count }] of Object.entries(categoryScores)) {
    const avgScore = count > 0 ? total / count : 0;
    const weight = weights[category as StepCategory] || 0.1;
    weightedScore += avgScore * weight;
    totalWeight += weight;
  }

  const finalScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;

  // Determine overall status
  let overall: 'pass' | 'fail' | 'warn';
  if (blockers.length > 0) {
    overall = 'fail';
  } else if (stepResults.some(r => r.status === 'warn')) {
    overall = 'warn';
  } else if (finalScore >= 70) {
    overall = 'pass';
  } else {
    overall = 'warn';
  }

  return {
    pipelineId: config.id,
    pipelineName: config.name,
    overall,
    score: finalScore,
    steps: stepResults,
    blockers,
    halted,
    haltedAt,
    totalDuration: Date.now() - startTime,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format pipeline result as markdown report.
 */
export function formatPipelineReport(result: PipelineResult): string {
  const lines: string[] = [];

  const statusLabel = result.overall === 'pass' ? 'PASS' : result.overall === 'fail' ? 'FAIL' : 'WARN';
  lines.push(`# Validation Report: ${result.pipelineName}`);
  lines.push('');
  lines.push(`**Overall**: ${statusLabel} | **Score**: ${result.score}/100 | **Duration**: ${result.totalDuration}ms`);

  if (result.halted) {
    lines.push(`**Halted at**: ${result.haltedAt} (blocking failure)`);
  }
  lines.push('');

  // Step results table
  lines.push('## Step Results');
  lines.push('');
  lines.push('| # | Step | Status | Score | Findings | Duration |');
  lines.push('|---|------|--------|-------|----------|----------|');

  for (let i = 0; i < result.steps.length; i++) {
    const step = result.steps[i];
    lines.push(
      `| ${i + 1} | ${step.stepName} | ${step.status.toUpperCase()} | ${step.score} | ${step.findings.length} | ${step.duration}ms |`
    );
  }

  lines.push('');

  // Blockers
  if (result.blockers.length > 0) {
    lines.push('## Blockers');
    lines.push('');
    for (const blocker of result.blockers) {
      lines.push(`- **${blocker.title}** (${blocker.severity}): ${blocker.description}`);
      if (blocker.suggestion) {
        lines.push(`  - Suggestion: ${blocker.suggestion}`);
      }
    }
    lines.push('');
  }

  // Detailed findings
  const allFindings = result.steps.flatMap(s => s.findings);
  if (allFindings.length > 0) {
    lines.push('## All Findings');
    lines.push('');
    for (const finding of allFindings) {
      lines.push(`- [${finding.severity.toUpperCase()}] **${finding.title}**: ${finding.description}`);
      if (finding.location) lines.push(`  - Location: ${finding.location}`);
      if (finding.suggestion) lines.push(`  - Fix: ${finding.suggestion}`);
    }
  }

  lines.push('');
  lines.push(`_Generated: ${result.timestamp}_`);

  return lines.join('\n');
}

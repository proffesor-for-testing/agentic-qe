/**
 * Phase 02: Analysis
 * Analyzes project structure, frameworks, and languages
 */

import {
  BasePhase,
  type InitContext,
} from './phase-interface.js';
import { createProjectAnalyzer } from '../project-analyzer.js';
import type { ProjectAnalysis } from '../types.js';

/**
 * Analysis phase - analyzes project structure
 */
export class AnalysisPhase extends BasePhase<ProjectAnalysis> {
  readonly name = 'analysis';
  readonly description = 'Analyze project structure';
  readonly order = 20;
  readonly critical = true;
  readonly requiresPhases = ['detection'] as const;

  protected async run(context: InitContext): Promise<ProjectAnalysis> {
    const analyzer = createProjectAnalyzer(context.projectRoot);
    const analysis = await analyzer.analyze();

    // Store in context for other phases
    context.analysis = analysis;

    context.services.log(`  Project: ${analysis.projectName}`);
    context.services.log(`  Languages: ${analysis.languages.map(l => l.name).join(', ')}`);
    context.services.log(`  Frameworks: ${analysis.frameworks.map(f => f.name).join(', ')}`);

    return analysis;
  }
}

// Instance exported from index.ts

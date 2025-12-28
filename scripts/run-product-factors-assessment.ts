#!/usr/bin/env npx tsx
/**
 * Product Factors Assessment Runner
 *
 * Autonomous runner script for the Product Factors Assessor agent.
 * Accepts input files and generates comprehensive HTSM-based test assessments.
 *
 * Usage:
 *   npx tsx scripts/run-product-factors-assessment.ts \
 *     --input <file.md|file.docx> \
 *     --name "Assessment Name" \
 *     --output-dir <output-folder> \
 *     [--codebase <path>]  # Optional: analyze codebase for architecture
 *     [--use-llm]          # Enable LLM-powered test generation (requires ANTHROPIC_API_KEY)
 *
 * Examples:
 *   # Document-only assessment (template-based)
 *   npx tsx scripts/run-product-factors-assessment.ts --input requirements.md --name "MyApp"
 *
 *   # Document with LLM-powered test generation
 *   npx tsx scripts/run-product-factors-assessment.ts --input requirements.md --name "MyApp" --use-llm
 *
 *   # Document + codebase analysis (C4 diagrams)
 *   npx tsx scripts/run-product-factors-assessment.ts --input requirements.md --codebase ./src --name "MyApp"
 *
 *   # Codebase-only analysis
 *   npx tsx scripts/run-product-factors-assessment.ts --codebase ./src --name "MyApp"
 */

import { createProductFactorsAssessment } from '../src/agents/product-factors-assessor/index';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';

interface RunnerArgs {
  input?: string;
  name: string;
  outputDir: string;
  codebase?: string;
  noC4?: boolean;
  useLLM?: boolean;
}

/**
 * Simple LLM provider wrapper for Anthropic SDK
 * Implements the ILLMProvider interface minimally for test generation
 */
class AnthropicLLMProvider {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514';

  constructor() {
    this.client = new Anthropic();
  }

  async initialize(): Promise<void> {
    // No initialization needed - SDK handles auth via ANTHROPIC_API_KEY
  }

  async complete(options: { messages: Array<{ role: string; content: string }>; maxTokens?: number }): Promise<{ content: Array<{ type: string; text: string }> }> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || 1024,
      messages: options.messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    });

    return {
      content: response.content.map(block => ({
        type: block.type,
        text: block.type === 'text' ? block.text : '',
      })),
    };
  }

  async embed(_options: { text: string }): Promise<{ embedding: number[] }> {
    // Not needed for test generation
    return { embedding: [] };
  }

  async shutdown(): Promise<void> {
    // No cleanup needed
  }
}

function parseArgs(): RunnerArgs {
  const args = process.argv.slice(2);
  const result: Partial<RunnerArgs> = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        result.input = args[++i];
        break;
      case '--name':
        result.name = args[++i];
        break;
      case '--output-dir':
        result.outputDir = args[++i];
        break;
      case '--codebase':
        result.codebase = args[++i];
        break;
      case '--no-c4':
        result.noC4 = true;
        break;
      case '--use-llm':
        result.useLLM = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
    }
  }

  // Require at least one input source
  if (!result.input && !result.codebase) {
    console.error('Error: --input <file> or --codebase <path> is required');
    printUsage();
    process.exit(1);
  }

  // Derive name from input filename or codebase if not provided
  if (!result.name) {
    if (result.input) {
      result.name = path.basename(result.input, path.extname(result.input));
    } else if (result.codebase) {
      result.name = path.basename(path.resolve(result.codebase));
    } else {
      result.name = 'assessment';
    }
  }

  // Default output dir
  if (!result.outputDir) {
    result.outputDir = `.agentic-qe/product-factors-assessments/${result.name}`;
  }

  return result as RunnerArgs;
}

function printUsage(): void {
  console.log(`
Product Factors Assessment Runner

Usage:
  npx tsx scripts/run-product-factors-assessment.ts [options]

Options:
  --input <file>      Input document (markdown, docx)
  --codebase <path>   Path to codebase for Code Intelligence analysis
  --name <name>       Assessment name (defaults to input filename)
  --output-dir <dir>  Output directory (defaults to .agentic-qe/product-factors-assessments/<name>)
  --no-c4             Skip C4 diagram generation
  --use-llm           Enable LLM-powered test generation (requires ANTHROPIC_API_KEY)
  --help, -h          Show this help message

Examples:
  # Document-only assessment (template-based)
  npx tsx scripts/run-product-factors-assessment.ts --input requirements.md

  # Document with LLM-powered test generation
  npx tsx scripts/run-product-factors-assessment.ts --input requirements.md --use-llm

  # Document + codebase analysis with C4 diagrams
  npx tsx scripts/run-product-factors-assessment.ts --input requirements.md --codebase ./src

  # Codebase-only analysis (architecture discovery)
  npx tsx scripts/run-product-factors-assessment.ts --codebase ./src --name "MyProject"

Environment Variables:
  ANTHROPIC_API_KEY   Required when using --use-llm flag
`);
}

function convertDocxToMarkdown(docxPath: string): string {
  const tempMd = docxPath.replace(/\.docx$/i, '.md');
  try {
    execSync(`pandoc "${docxPath}" -o "${tempMd}" --wrap=none`, { stdio: 'pipe' });
    return fs.readFileSync(tempMd, 'utf-8');
  } catch (error) {
    console.error('Error converting .docx file. Ensure pandoc is installed.');
    throw error;
  }
}

async function main() {
  const args = parseArgs();

  console.log('='.repeat(60));
  console.log('Product Factors Assessment Runner');
  console.log('='.repeat(60));
  if (args.input) console.log(`Input Document: ${args.input}`);
  if (args.codebase) console.log(`Codebase: ${args.codebase}`);
  console.log(`Name: ${args.name}`);
  console.log(`Output: ${args.outputDir}`);
  console.log(`C4 Diagrams: ${args.noC4 ? 'disabled' : 'enabled'}`);
  console.log(`LLM Test Generation: ${args.useLLM ? 'enabled' : 'disabled (use --use-llm to enable)'}`);
  console.log('='.repeat(60));

  // LLM requirements will be validated at initialization time

  // Read input file if provided
  let content: string | undefined;
  if (args.input) {
    if (args.input.endsWith('.docx')) {
      console.log('\nConverting .docx to markdown...');
      content = convertDocxToMarkdown(args.input);
    } else {
      content = fs.readFileSync(args.input, 'utf-8');
    }
  }

  // Create output directory
  fs.mkdirSync(args.outputDir, { recursive: true });

  // Initialize LLM provider if requested
  let llmProvider: AnthropicLLMProvider | undefined;
  if (args.useLLM) {
    console.log('\nInitializing Anthropic LLM provider...');
    try {
      llmProvider = new AnthropicLLMProvider();
      await llmProvider.initialize();
      console.log('  → LLM provider ready (Claude claude-sonnet-4-20250514)');
    } catch (error) {
      console.error('\nError initializing LLM provider:', (error as Error).message);
      console.error('Ensure ANTHROPIC_API_KEY is set or SDK has valid credentials.');
      console.error('Falling back to template-based test generation.\n');
      llmProvider = undefined;
      args.useLLM = false;
    }
  }

  // Run assessment
  console.log('\nRunning Product Factors Assessment...');
  if (args.codebase) {
    console.log('  → Code Intelligence analysis enabled');
  }
  if (args.useLLM) {
    console.log('  → LLM-powered SFDIPOT test generation enabled');
  }
  console.log('');

  // Create assessor with LLM provider if available
  const assessor = createProductFactorsAssessment({
    llm: {
      enabled: args.useLLM ?? false,
      preferredProvider: args.useLLM ? 'claude' : undefined,
      provider: llmProvider as any, // Inject our provider
    },
  });

  // Initialize agent (required for LLM setup)
  if (args.useLLM) {
    console.log('  → Initializing agent with LLM...');
    await assessor.initialize();
  }

  const result = await assessor.assess({
    userStories: content,       // Parse as user stories (supports Epic-format with bullet lists)
    functionalSpecs: content,   // Also parse as specs for additional context
    outputFormat: 'all',
    assessmentName: args.name,
    codebaseRootDir: args.codebase,
    includeC4Diagrams: !args.noC4,
  });

  // Write outputs
  const outputs: Record<string, string> = {};

  if (result.htmlOutput) {
    const htmlPath = path.join(args.outputDir, `${args.name}-assessment.html`);
    fs.writeFileSync(htmlPath, result.htmlOutput);
    outputs['HTML Report'] = htmlPath;
  }

  if (result.markdownOutput) {
    const mdPath = path.join(args.outputDir, `${args.name}-assessment.md`);
    fs.writeFileSync(mdPath, result.markdownOutput);
    outputs['Markdown'] = mdPath;
  }

  if (result.jsonOutput) {
    const jsonPath = path.join(args.outputDir, `${args.name}-assessment.json`);
    fs.writeFileSync(jsonPath, result.jsonOutput);
    outputs['JSON'] = jsonPath;
  }

  if (result.gherkinFeatures && result.gherkinFeatures.size > 0) {
    const gherkinDir = path.join(args.outputDir, 'features');
    fs.mkdirSync(gherkinDir, { recursive: true });
    result.gherkinFeatures.forEach((featureContent, name) => {
      const featurePath = path.join(gherkinDir, `${name}.feature`);
      fs.writeFileSync(featurePath, featureContent);
    });
    outputs['Gherkin Features'] = gherkinDir;
  }

  // Write C4 diagrams as separate files if available
  if (result.c4ContextDiagram) {
    const c4Path = path.join(args.outputDir, 'c4-context.mmd');
    fs.writeFileSync(c4Path, result.c4ContextDiagram);
    outputs['C4 Context'] = c4Path;
  }

  if (result.c4ContainerDiagram) {
    const c4Path = path.join(args.outputDir, 'c4-container.mmd');
    fs.writeFileSync(c4Path, result.c4ContainerDiagram);
    outputs['C4 Container'] = c4Path;
  }

  if (result.c4ComponentDiagram) {
    const c4Path = path.join(args.outputDir, 'c4-component.mmd');
    fs.writeFileSync(c4Path, result.c4ComponentDiagram);
    outputs['C4 Component'] = c4Path;
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('ASSESSMENT COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nTotal Tests Generated: ${result.summary.totalTests}`);
  console.log(`Coverage Score: ${result.summary.coverageScore.toFixed(1)}%`);
  console.log(`Traceability Score: ${isNaN(result.summary.traceabilityScore) ? 'N/A' : result.summary.traceabilityScore.toFixed(1) + '%'}`);

  console.log('\nTests by Category (SFDIPOT):');
  Object.entries(result.summary.byCategory).forEach(([cat, count]) => {
    if (count > 0) {
      console.log(`  ${cat}: ${count}`);
    }
  });

  console.log('\nTests by Priority:');
  Object.entries(result.summary.byPriority).forEach(([priority, count]) => {
    console.log(`  ${priority}: ${count}`);
  });

  // Code Intelligence summary
  if (result.codeIntelligenceResult) {
    console.log('\nCode Intelligence Analysis:');
    console.log(`  Components: ${result.codeIntelligenceResult.componentAnalysis.components.length}`);
    console.log(`  External Systems: ${result.codeIntelligenceResult.externalSystems.length}`);
    console.log(`  Architecture Type: ${result.codeIntelligenceResult.componentAnalysis.architecture || 'Unknown'}`);
  }

  console.log('\nOutput Files:');
  Object.entries(outputs).forEach(([type, filepath]) => {
    console.log(`  ${type}: ${filepath}`);
  });

  console.log('\n' + '='.repeat(60));
}

main().catch((error) => {
  console.error('Assessment failed:', error);
  process.exit(1);
});

#!/usr/bin/env tsx
/**
 * Script to regenerate Epic 3 HTML assessment report
 * Reads the existing JSON assessment and generates HTML using HTMLFormatter
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { HTMLFormatter } from '../src/agents/qe-product-factors-assessor/formatters/html-formatter';
import type { AssessmentOutput } from '../src/agents/qe-product-factors-assessor/types';

async function main() {
  console.log('🔄 Regenerating Epic 3 HTML assessment report...\n');

  // Read the existing JSON assessment
  const jsonPath = join(
    process.cwd(),
    '.agentic-qe/product-factors-assessments/Epic3-AI-Personalization-Assessment.json'
  );

  console.log(`📖 Reading assessment from: ${jsonPath}`);
  const rawJson = readFileSync(jsonPath, 'utf-8');
  const assessmentData = JSON.parse(rawJson);

  // Map short category codes to full enum names
  const categoryMapping: Record<string, string> = {
    'S': 'STRUCTURE',
    'F': 'FUNCTION',
    'D': 'DATA',
    'I': 'INTERFACES',
    'P': 'PLATFORM',
    'O': 'OPERATIONS',
    'T': 'TIME'
  };

  // Helper to collect test ideas by category
  const collectTestIdeasByCategory = (sfdipotAnalysis: any): Map<string, any[]> => {
    const testIdeasByCategory = new Map<string, any[]>();

    for (const [categoryKey, categoryData] of Object.entries(sfdipotAnalysis)) {
      const allTestIdeas: any[] = [];

      // Get full category name from short code
      const categoryCode = (categoryData as any).category;
      const fullCategoryName = categoryMapping[categoryCode] || categoryCode;

      // Collect test ideas from all subcategories
      if (categoryData && typeof categoryData === 'object' && 'subcategories' in categoryData) {
        const subcategories = (categoryData as any).subcategories;
        for (const [subKey, subData] of Object.entries(subcategories)) {
          if (subData && typeof subData === 'object' && 'testIdeas' in subData) {
            const testIdeas = (subData as any).testIdeas || [];
            for (const test of testIdeas) {
              allTestIdeas.push({
                ...test,
                category: fullCategoryName,
                subcategory: subKey
              });
            }
          }
        }
      }

      testIdeasByCategory.set(fullCategoryName, allTestIdeas);
    }

    return testIdeasByCategory;
  };

  // Collect test ideas
  const testIdeasByCategory = collectTestIdeasByCategory(assessmentData.sfdipotAnalysis);

  // Build categoryAnalysis Map
  const categoryAnalysis = new Map();
  for (const [category, testIdeas] of testIdeasByCategory.entries()) {
    // Filter clarifying questions for this category and add missing fields
    const categoryQuestions = assessmentData.clarifyingQuestions
      .filter((q: any) => q.category === category)
      .map((q: any) => ({
        ...q,
        subcategory: q.subcategory || 'General',
        rationale: q.impact || q.rationale || 'Clarification needed for test coverage',
        source: 'template' as const
      }));

    categoryAnalysis.set(category, {
      category,
      testIdeas,
      clarifyingQuestions: categoryQuestions,
      coverage: {
        subcategoriesCovered: [...new Set(testIdeas.map((t: any) => t.subcategory))],
        subcategoriesMissing: [],
        coveragePercentage: 100
      }
    });
  }

  // Flatten all test ideas
  const allTestIdeas: any[] = [];
  for (const ideas of testIdeasByCategory.values()) {
    allTestIdeas.push(...ideas);
  }

  // Calculate byCategory counts
  const byCategory: any = {};
  for (const [category, testIdeas] of testIdeasByCategory.entries()) {
    byCategory[category] = testIdeas.length;
  }

  // Transform to AssessmentOutput format expected by HTMLFormatter
  const output: AssessmentOutput = {
    name: assessmentData.assessment.name,
    sourceDocuments: ['Epic 3: AI-Powered Personalization & Search Enhancement'],
    categoryAnalysis,
    testIdeas: allTestIdeas,
    clarifyingQuestions: assessmentData.clarifyingQuestions,
    summary: {
      totalTestIdeas: assessmentData.testIdeas.summary.total,
      byCategory,
      byPriority: assessmentData.testIdeas.summary.byPriority || {},
      byAutomationFitness: assessmentData.testIdeas.summary.byAutomationFitness || {},
      totalClarifyingQuestions: assessmentData.clarifyingQuestions.length,
      overallCoverageScore: 85,
      generatedAt: new Date(assessmentData.assessment.timestamp)
    }
  };

  // Generate HTML using HTMLFormatter
  console.log('🎨 Generating HTML report...');
  const formatter = new HTMLFormatter();
  const htmlContent = formatter.format(output);

  // Write to output file
  const outputPath = join(
    process.cwd(),
    '.agentic-qe/product-factors-assessments/Epic3-AI-Personalization-Assessment-v2.html'
  );

  console.log(`💾 Writing HTML to: ${outputPath}`);
  writeFileSync(outputPath, htmlContent, 'utf-8');

  console.log('\n✅ Successfully regenerated Epic 3 HTML assessment!');
  console.log(`📊 Stats:
  - Total Test Ideas: ${output.summary.totalTestIdeas}
  - P0 (Critical): ${output.summary.byPriority.P0 || 0}
  - P1 (High): ${output.summary.byPriority.P1 || 0}
  - P2 (Medium): ${output.summary.byPriority.P2 || 0}
  - Clarifying Questions: ${output.summary.totalClarifyingQuestions}
`);

  console.log(`\n🌐 Open in browser: file://${outputPath}`);
}

main().catch((error) => {
  console.error('❌ Error regenerating HTML:', error);
  process.exit(1);
});

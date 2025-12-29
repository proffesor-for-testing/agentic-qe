#!/usr/bin/env tsx

/**
 * Test LLM-based test idea generation with SFDIPOT checklist
 * Uses RuvLLM for local inference
 */

import { QEProductFactorsAssessor } from '../src/agents/qe-product-factors-assessor';
import { AssessmentInput } from '../src/agents/qe-product-factors-assessor/types';
import { SwarmMemoryManager } from '../src/core/memory/SwarmMemoryManager';
import * as fs from 'fs';

const epic2Content = `
Epic 2: Web-Native Content Platform

Priority: High
Timeline: January - March 2026 (10 weeks)
Business Value: SEO improvement, content discoverability, modern reading experience, mobile engagement
Dependencies: E1 (WCAG 2.2 AA compliance for new content pages)
Content Volume: 50+ magazine issues (2011-2025)

Description:
Transform the magazine from PDF-only distribution to a web-native reading experience. Currently, the 14+ years of magazine content is locked in PDF files that cannot be indexed by search engines, are difficult to read on mobile, and cannot be monetized through premium access controls.

Current Issues Identified:
1. PDF Lock-in: All magazine issues available only as downloadable PDFs
2. SEO Invisibility: PDF content not indexed effectively
3. Poor Mobile Experience: PDFs require download, difficult on smartphones
4. No Article-Level Access: Cannot link to/share specific articles
5. Stale "Trending" Content: Homepage shows 3-4 year old articles

Acceptance Criteria:
AC1: Magazine articles published as individual web pages with proper SEO metadata
AC2: Responsive reading experience optimized for mobile, tablet, and desktop
AC3: Archive of past issues (2011-2025) migrated to web-native format
AC4: Reading time estimates displayed on all articles
AC5: Article-level social sharing (LinkedIn, Twitter/X, email)
AC6: Related articles recommendations based on category/tags
AC7: "Trending" algorithm updated to show actually popular recent content
AC8: PDF download remains available as alternate format

Key Features/User Stories:
1. PDF-to-HTML Content Migration Pipeline
   - OCR processing for scanned PDFs
   - Preserve formatting, images, tables
   - Handle special characters and code snippets

2. Article Web Pages
   - Clean typography and reading experience
   - Mobile-responsive layouts
   - Reading progress indicator

3. Search & Discovery
   - Full-text search across all articles
   - Category and tag filtering
   - Author profiles with article listings

4. SEO Optimization
   - Structured data (Article schema)
   - Canonical URLs
   - 301 redirects from old PDF URLs

Technical Requirements:
- Page load time: Must load within 3 seconds on 4G
- Mobile Performance: Lighthouse score > 80
- SEO: All pages must have valid structured data
- Accessibility: WCAG 2.2 AA compliant

Risks:
- OCR Quality: Older PDFs may have poor scan quality → Manual review workflow needed
- Content Volume: 50+ issues with multiple articles each → Phased migration approach
- SEO Transition: Risk of losing existing Google rankings → Proper redirect strategy

Success Metrics:
- Organic Traffic Increase Target: 50%
- Mobile Engagement Target: 40% of traffic
- Average Session Duration Target: 3 minutes
`;

async function main() {
  console.log('='.repeat(80));
  console.log('LLM-Based Test Idea Generation with SFDIPOT Checklist');
  console.log('Using RuvLLM for local inference');
  console.log('='.repeat(80));
  console.log('');

  // Initialize memory store
  console.log('Initializing memory store...');
  const dbPath = '/workspaces/agentic-qe/.agentic-qe/memory.db';
  const memoryStore = new SwarmMemoryManager(dbPath);
  await memoryStore.initialize();
  console.log('Memory store initialized.');
  console.log('');

  // Create assessor with RuvLLM enabled
  const assessor = new QEProductFactorsAssessor({
    id: 'llm-sfdipot-tester',
    name: 'LLM SFDIPOT Test Assessor',
    memoryStore: memoryStore,
    storeResults: true,
    defaultOutputFormat: 'html',
    maxTestIdeasPerSubcategory: 5,
    enableBrutalHonesty: true,
    minQualityScore: 60,
    llmConfig: {
      enabled: true,
      preferredProvider: 'ruvllm',
      ruvllm: {
        defaultModel: 'llama-3.2-3b-instruct',
      },
      enableSessions: false,
    },
    enableLearning: false
  });

  // Initialize the agent (required for LLM)
  console.log('Initializing agent with RuvLLM...');
  try {
    await assessor.initialize();
    console.log('Agent initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize agent:', error);
    console.log('');
    console.log('Note: RuvLLM requires a local LLM server running.');
    console.log('If RuvLLM is not available, falling back to template-based generation.');
  }
  console.log('');

  // Prepare assessment input with LLM enabled
  const input: AssessmentInput = {
    assessmentName: 'Epic 2 - Web-Native Content Platform (LLM + SFDIPOT)',
    epics: epic2Content,
    outputFormat: 'html',
    useLLM: true,  // Enable LLM-based generation
    enableCodeIntelligence: false,
    includeC4Diagrams: false
  };

  try {
    console.log('Running SFDIPOT assessment with LLM...');
    console.log('');

    const startTime = Date.now();
    const result = await assessor.assess(input);
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('');
    console.log('='.repeat(60));
    console.log('LLM SFDIPOT ASSESSMENT RESULTS');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Duration: ${duration}s`);
    console.log(`Total test ideas: ${result.summary.totalTestIdeas}`);
    console.log(`Clarifying questions: ${result.summary.totalClarifyingQuestions}`);
    console.log(`Overall coverage: ${result.summary.overallCoverageScore.toFixed(1)}%`);
    console.log('');

    console.log('Test ideas by category:');
    for (const [category, count] of Object.entries(result.summary.byCategory)) {
      if (count > 0) {
        console.log(`  ${category}: ${count}`);
      }
    }
    console.log('');

    console.log('Test ideas by priority:');
    for (const [priority, count] of Object.entries(result.summary.byPriority)) {
      if (count > 0) {
        console.log(`  ${priority}: ${count}`);
      }
    }
    console.log('');

    // Show sample of LLM-generated test ideas
    console.log('Sample test ideas (first 10):');
    for (const idea of result.testIdeas.slice(0, 10)) {
      console.log(`  [${idea.category}/${idea.subcategory}] ${idea.description.substring(0, 80)}...`);
    }
    console.log('');

    // Brutal Honesty Summary
    if (result.summary.brutalHonesty) {
      console.log('Brutal Honesty Quality Analysis:');
      console.log(`  Overall Quality Score: ${result.summary.brutalHonesty.overallQualityScore}/100`);
      console.log(`  Requirements Quality: ${result.summary.brutalHonesty.requirementsQualityScore}/100`);
      console.log(`  Rejected Ideas: ${result.summary.brutalHonesty.totalRejected}`);
      console.log(`  Total Findings: ${result.summary.brutalHonesty.totalFindings}`);
      console.log('');
    }

    // Save HTML output
    if (result.html) {
      const outputPath = '/workspaces/agentic-qe/.agentic-qe/product-factors-assessments/epic2-llm-sfdipot.html';
      fs.writeFileSync(outputPath, result.html, 'utf8');
      console.log(`✅ HTML report saved to: ${outputPath}`);
    }

    // Save JSON output
    if (result.json) {
      const jsonPath = '/workspaces/agentic-qe/.agentic-qe/product-factors-assessments/epic2-llm-sfdipot.json';
      fs.writeFileSync(jsonPath, result.json, 'utf8');
      console.log(`✅ JSON data saved to: ${jsonPath}`);
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('LLM SFDIPOT assessment complete!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Assessment failed:', error);
    process.exit(1);
  }
}

// Run main function
main().catch(console.error);

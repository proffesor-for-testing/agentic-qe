#!/usr/bin/env tsx

/**
 * Generate Epic 2: Web-Native Content Platform Assessment
 * Using QEProductFactorsAssessor implementation with fixes for:
 * - Documented scoring rubric
 * - AC-by-AC testability analysis
 * - Penetrating questions
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
  console.log('Epic 2: Web-Native Content Platform - SFDIPOT Assessment');
  console.log('Testing agent fixes: Documented rubric, AC analysis, penetrating questions');
  console.log('='.repeat(80));
  console.log('');

  // Initialize memory store for agent persistence
  console.log('Initializing memory store...');
  const dbPath = '/workspaces/agentic-qe/.agentic-qe/memory.db';
  const memoryStore = new SwarmMemoryManager(dbPath);
  await memoryStore.initialize();
  console.log('Memory store initialized.');
  console.log('');

  // Create assessor instance with brutal honesty enabled
  const assessor = new QEProductFactorsAssessor({
    id: 'epic2-assessor',
    name: 'Epic 2 Product Factors Assessor',
    memoryStore: memoryStore,
    storeResults: true,
    defaultOutputFormat: 'html',
    maxTestIdeasPerSubcategory: 5,  // Reduced to see actual count
    enableBrutalHonesty: true,
    minQualityScore: 60,
    llmConfig: {
      enabled: false
    },
    enableLearning: true
  });

  // Prepare assessment input
  const input: AssessmentInput = {
    assessmentName: 'Epic 2 - Web-Native Content Platform (Verified)',
    epics: epic2Content,
    outputFormat: 'html',
    useLLM: false,
    enableCodeIntelligence: false,
    includeC4Diagrams: false
  };

  try {
    console.log('Running SFDIPOT assessment...');
    console.log('');

    // Run assessment
    const result = await assessor.assess(input);

    console.log('Assessment completed successfully!');
    console.log('');
    console.log('='.repeat(60));
    console.log('VERIFICATION OF FIXES');
    console.log('='.repeat(60));
    console.log('');

    // Fix 1: Verify test idea count matches actual
    console.log('1. TEST IDEA COUNT VERIFICATION:');
    console.log(`   Summary reports: ${result.summary.totalTestIdeas} test ideas`);
    const actualTestIdeas = result.testIdeas?.length || 0;
    console.log(`   Actual in array: ${actualTestIdeas} test ideas`);
    console.log(`   Match: ${result.summary.totalTestIdeas === actualTestIdeas ? '✅ YES' : '❌ NO'}`);
    console.log('');

    // Fix 2: Verify documented scoring rubric
    console.log('2. SCORING RUBRIC VERIFICATION:');
    if (result.summary.brutalHonesty) {
      console.log(`   Quality Score: ${result.summary.brutalHonesty.overallQualityScore}/100`);
      console.log(`   Requirements Score: ${result.summary.brutalHonesty.requirementsQualityScore}/100`);

      // Check if scoring rubric is in the result
      const hasRubric = result.html?.includes('How is this score calculated');
      console.log(`   Rubric in HTML: ${hasRubric ? '✅ YES' : '❌ NO'}`);
    } else {
      console.log('   ❌ Brutal honesty not enabled in result');
    }
    console.log('');

    // Fix 3: Verify AC-by-AC analysis
    console.log('3. AC-BY-AC TESTABILITY ANALYSIS:');
    const hasACAnalysis = result.html?.includes('Acceptance Criteria Testability Analysis');
    console.log(`   AC Analysis in HTML: ${hasACAnalysis ? '✅ YES' : '❌ NO'}`);
    if (hasACAnalysis) {
      const acCountMatch = result.html?.match(/(\d+) ACs analyzed/);
      if (acCountMatch) {
        console.log(`   ACs Analyzed: ${acCountMatch[1]}`);
      }
    }
    console.log('');

    // Fix 4: Check for penetrating questions
    console.log('4. PENETRATING QUESTIONS VERIFICATION:');
    const questionPatterns = [
      'What happens when',
      'What happens if',
      'Is there',
      'How is',
      'fallback',
      'failure',
      'edge case',
      'concurrent',
      'simultaneously',
      'malicious',
      'attack',
      'crash',
      'timeout'
    ];
    let penetratingCount = 0;
    const sampleQuestions: string[] = [];
    for (const q of result.clarifyingQuestions || []) {
      const isPenetrating = questionPatterns.some(p =>
        q.question.toLowerCase().includes(p.toLowerCase())
      );
      if (isPenetrating) penetratingCount++;
      if (sampleQuestions.length < 5) {
        sampleQuestions.push(q.question);
      }
    }
    console.log(`   Total questions: ${result.clarifyingQuestions?.length || 0}`);
    console.log(`   Penetrating questions: ${penetratingCount}`);
    console.log(`   Penetrating rate: ${result.clarifyingQuestions?.length ? ((penetratingCount / result.clarifyingQuestions.length) * 100).toFixed(0) : 0}%`);
    console.log('');
    console.log('   Sample questions (first 5):');
    sampleQuestions.forEach((q, i) => {
      console.log(`   ${i + 1}. ${q.substring(0, 100)}${q.length > 100 ? '...' : ''}`);
    });
    console.log('');

    console.log('='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
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

    // Brutal Honesty Summary
    if (result.summary.brutalHonesty) {
      console.log('Brutal Honesty Quality Analysis:');
      console.log(`  Overall Quality Score: ${result.summary.brutalHonesty.overallQualityScore}/100`);
      console.log(`  Requirements Quality: ${result.summary.brutalHonesty.requirementsQualityScore}/100`);
      console.log(`  Rejected Ideas: ${result.summary.brutalHonesty.totalRejected}`);
      console.log(`  Total Findings: ${result.summary.brutalHonesty.totalFindings}`);
      console.log(`    - Critical: ${result.summary.brutalHonesty.bySeverity.CRITICAL}`);
      console.log(`    - High: ${result.summary.brutalHonesty.bySeverity.HIGH}`);
      console.log(`    - Medium: ${result.summary.brutalHonesty.bySeverity.MEDIUM}`);
      console.log(`    - Low: ${result.summary.brutalHonesty.bySeverity.LOW}`);
      console.log('');
    }

    // Save HTML output
    if (result.html) {
      const outputPath = '/workspaces/agentic-qe/.agentic-qe/product-factors-assessments/epic2-web-native-content-VERIFIED.html';
      fs.writeFileSync(outputPath, result.html, 'utf8');
      console.log(`✅ HTML report saved to: ${outputPath}`);
    }

    // Save JSON output for reference
    if (result.json) {
      const jsonPath = '/workspaces/agentic-qe/.agentic-qe/product-factors-assessments/epic2-web-native-content-VERIFIED.json';
      fs.writeFileSync(jsonPath, result.json, 'utf8');
      console.log(`✅ JSON data saved to: ${jsonPath}`);
    }

    console.log('');
    console.log('='.repeat(80));
    console.log('Assessment generation complete!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Assessment failed:', error);
    process.exit(1);
  }
}

// Run main function
main().catch(console.error);

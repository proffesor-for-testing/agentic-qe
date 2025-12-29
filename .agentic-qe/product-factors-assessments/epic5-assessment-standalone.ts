/**
 * Standalone SFDIPOT Assessment for Epic 5
 * Social Proof & User-Generated Content Integration
 *
 * This script generates a comprehensive product factors assessment
 * without requiring full agent infrastructure initialization.
 */

import * as fs from 'fs';
import * as path from 'path';

interface TestIdea {
  id: string;
  category: string;
  subcategory: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  automationFitness: string;
  tags: string[];
}

interface ClarifyingQuestion {
  category: string;
  subcategory: string;
  question: string;
  rationale: string;
}

interface AssessmentResult {
  name: string;
  testIdeas: TestIdea[];
  clarifyingQuestions: ClarifyingQuestion[];
  summary: {
    totalTestIdeas: number;
    totalQuestions: number;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    byAutomationFitness: Record<string, number>;
  };
}

// Test idea counter
let testIdCounter = 1;

function generateTestId(category: string): string {
  return `${category.substring(0, 1)}-${(testIdCounter++).toString().padStart(4, '0')}`;
}

// Generate comprehensive test ideas for Epic 5
function generateEpic5TestIdeas(): TestIdea[] {
  const testIdeas: TestIdea[] = [];

  // STRUCTURE - Code, Dependencies, Documentation
  testIdeas.push(
    {
      id: generateTestId('STRUCTURE'),
      category: 'STRUCTURE',
      subcategory: 'Code',
      description: 'Verify UGC submission service code quality meets standards (code coverage >80%)',
      priority: 'P2',
      automationFitness: 'api-level',
      tags: ['htsm:structure', 'htsm:Code', 'priority:P2', 'code-quality']
    },
    {
      id: generateTestId('STRUCTURE'),
      category: 'STRUCTURE',
      subcategory: 'Dependencies',
      description: 'Verify Instagram Graph API SDK integration handles rate limits correctly',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:structure', 'htsm:Dependencies', 'priority:P1', 'instagram-api']
    },
    {
      id: generateTestId('STRUCTURE'),
      category: 'STRUCTURE',
      subcategory: 'Dependencies',
      description: 'Verify Trustpilot Business API client handles authentication failures gracefully',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:structure', 'htsm:Dependencies', 'priority:P1', 'trustpilot-api']
    },
    {
      id: generateTestId('STRUCTURE'),
      category: 'STRUCTURE',
      subcategory: 'Dependencies',
      description: 'Verify AWS Rekognition SDK handles image analysis timeouts without blocking moderation queue',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:structure', 'htsm:Dependencies', 'priority:P1', 'aws-rekognition']
    }
  );

  // FUNCTION - Security, ErrorHandling, Application
  testIdeas.push(
    {
      id: generateTestId('FUNCTION'),
      category: 'FUNCTION',
      subcategory: 'Security',
      description: 'Verify uploaded images are scanned for malware before storage (all file types checked)',
      priority: 'P0',
      automationFitness: 'security',
      tags: ['htsm:function', 'htsm:Security', 'priority:P0', 'malware-scanning']
    },
    {
      id: generateTestId('FUNCTION'),
      category: 'FUNCTION',
      subcategory: 'Security',
      description: 'Verify XSS prevention for user-submitted text (captions, names) in UGC components',
      priority: 'P0',
      automationFitness: 'security',
      tags: ['htsm:function', 'htsm:Security', 'priority:P0', 'xss-prevention']
    },
    {
      id: generateTestId('FUNCTION'),
      category: 'FUNCTION',
      subcategory: 'Security',
      description: 'Verify CSRF protection on UGC submission forms prevents unauthorized posts',
      priority: 'P0',
      automationFitness: 'security',
      tags: ['htsm:function', 'htsm:Security', 'priority:P0', 'csrf-protection']
    },
    {
      id: generateTestId('FUNCTION'),
      category: 'FUNCTION',
      subcategory: 'Security',
      description: 'Verify rate limiting prevents spam (10 uploads per user per day enforced)',
      priority: 'P1',
      automationFitness: 'api-level',
      tags: ['htsm:function', 'htsm:Security', 'priority:P1', 'rate-limiting']
    },
    {
      id: generateTestId('FUNCTION'),
      category: 'FUNCTION',
      subcategory: 'Security',
      description: 'Verify API keys for Instagram/Trustpilot are not exposed in client-side code',
      priority: 'P0',
      automationFitness: 'security',
      tags: ['htsm:function', 'htsm:Security', 'priority:P0', 'api-key-security']
    },
    {
      id: generateTestId('FUNCTION'),
      category: 'FUNCTION',
      subcategory: 'ErrorHandling',
      description: 'Verify Instagram API failure fallback displays cached content instead of error',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:function', 'htsm:ErrorHandling', 'priority:P1', 'error-handling']
    },
    {
      id: generateTestId('FUNCTION'),
      category: 'FUNCTION',
      subcategory: 'ErrorHandling',
      description: 'Verify Trustpilot API timeout (>3s) shows static trust score without blocking page load',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:function', 'htsm:ErrorHandling', 'priority:P1', 'timeout-handling']
    },
    {
      id: generateTestId('FUNCTION'),
      category: 'FUNCTION',
      subcategory: 'Application',
      description: 'Verify AI moderation (SafeSearch + Rekognition) correctly flags inappropriate content',
      priority: 'P0',
      automationFitness: 'integration-level',
      tags: ['htsm:function', 'htsm:Application', 'priority:P0', 'content-moderation']
    },
    {
      id: generateTestId('FUNCTION'),
      category: 'FUNCTION',
      subcategory: 'Application',
      description: 'Verify trending algorithm correctly weights views (40%), carts (30%), purchases (30%)',
      priority: 'P1',
      automationFitness: 'api-level',
      tags: ['htsm:function', 'htsm:Application', 'priority:P1', 'trending-algorithm']
    }
  );

  // DATA - Persistence, Boundaries, InputOutput
  testIdeas.push(
    {
      id: generateTestId('DATA'),
      category: 'DATA',
      subcategory: 'Persistence',
      description: 'Verify UGC metadata persists correctly in PostgreSQL with all required fields',
      priority: 'P1',
      automationFitness: 'api-level',
      tags: ['htsm:data', 'htsm:Persistence', 'priority:P1', 'database']
    },
    {
      id: generateTestId('DATA'),
      category: 'DATA',
      subcategory: 'Persistence',
      description: 'Verify user consent records are stored with GDPR-compliant timestamps and audit trail',
      priority: 'P0',
      automationFitness: 'api-level',
      tags: ['htsm:data', 'htsm:Persistence', 'priority:P0', 'gdpr-compliance']
    },
    {
      id: generateTestId('DATA'),
      category: 'DATA',
      subcategory: 'Boundaries',
      description: 'Verify file size validation rejects images larger than 10MB',
      priority: 'P1',
      automationFitness: 'api-level',
      tags: ['htsm:data', 'htsm:Boundaries', 'priority:P1', 'file-validation']
    },
    {
      id: generateTestId('DATA'),
      category: 'DATA',
      subcategory: 'Boundaries',
      description: 'Verify video uploads are limited to 60 seconds and 50MB maximum',
      priority: 'P1',
      automationFitness: 'api-level',
      tags: ['htsm:data', 'htsm:Boundaries', 'priority:P1', 'video-validation']
    },
    {
      id: generateTestId('DATA'),
      category: 'DATA',
      subcategory: 'InputOutput',
      description: 'Verify image format validation accepts only JPEG, PNG, WebP (magic bytes check)',
      priority: 'P1',
      automationFitness: 'api-level',
      tags: ['htsm:data', 'htsm:InputOutput', 'priority:P1', 'format-validation']
    },
    {
      id: generateTestId('DATA'),
      category: 'DATA',
      subcategory: 'Lifecycle',
      description: 'Verify GDPR right to deletion removes UGC within 30 days (soft delete + hard delete)',
      priority: 'P0',
      automationFitness: 'api-level',
      tags: ['htsm:data', 'htsm:Lifecycle', 'priority:P0', 'gdpr-deletion']
    }
  );

  // INTERFACES - UserInterface, ApiSdk, SystemInterface
  testIdeas.push(
    {
      id: generateTestId('INTERFACES'),
      category: 'INTERFACES',
      subcategory: 'UserInterface',
      description: 'Verify UGC carousel navigation works with keyboard (arrow keys, tab, enter)',
      priority: 'P1',
      automationFitness: 'accessibility',
      tags: ['htsm:interfaces', 'htsm:UserInterface', 'priority:P1', 'keyboard-nav']
    },
    {
      id: generateTestId('INTERFACES'),
      category: 'INTERFACES',
      subcategory: 'UserInterface',
      description: 'Verify screen reader announces UGC carousel updates correctly',
      priority: 'P1',
      automationFitness: 'accessibility',
      tags: ['htsm:interfaces', 'htsm:UserInterface', 'priority:P1', 'screen-reader']
    },
    {
      id: generateTestId('INTERFACES'),
      category: 'INTERFACES',
      subcategory: 'UserInterface',
      description: 'Verify alt text generation for UGC images (AI-generated fallback if user doesn\'t provide)',
      priority: 'P1',
      automationFitness: 'accessibility',
      tags: ['htsm:interfaces', 'htsm:UserInterface', 'priority:P1', 'alt-text']
    },
    {
      id: generateTestId('INTERFACES'),
      category: 'INTERFACES',
      subcategory: 'UserInterface',
      description: 'Verify color contrast ratio 4.5:1 minimum for all UGC component text',
      priority: 'P2',
      automationFitness: 'accessibility',
      tags: ['htsm:interfaces', 'htsm:UserInterface', 'priority:P2', 'color-contrast']
    },
    {
      id: generateTestId('INTERFACES'),
      category: 'INTERFACES',
      subcategory: 'ApiSdk',
      description: 'Verify POST /api/ugc/submit returns 400 for missing consent field',
      priority: 'P1',
      automationFitness: 'api-level',
      tags: ['htsm:interfaces', 'htsm:ApiSdk', 'priority:P1', 'api-validation']
    },
    {
      id: generateTestId('INTERFACES'),
      category: 'INTERFACES',
      subcategory: 'ApiSdk',
      description: 'Verify GET /api/trending/products caches results for 5 minutes',
      priority: 'P2',
      automationFitness: 'api-level',
      tags: ['htsm:interfaces', 'htsm:ApiSdk', 'priority:P2', 'api-caching']
    },
    {
      id: generateTestId('INTERFACES'),
      category: 'INTERFACES',
      subcategory: 'SystemInterface',
      description: 'Verify Instagram API integration handles OAuth 2.0 token refresh automatically',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:interfaces', 'htsm:SystemInterface', 'priority:P1', 'oauth-integration']
    }
  );

  // PLATFORM - Browser, OperatingSystem, ExternalSoftware
  testIdeas.push(
    {
      id: generateTestId('PLATFORM'),
      category: 'PLATFORM',
      subcategory: 'Browser',
      description: 'Verify UGC components render correctly in Chrome, Firefox, Safari, Edge (cross-browser testing)',
      priority: 'P2',
      automationFitness: 'e2e-level',
      tags: ['htsm:platform', 'htsm:Browser', 'priority:P2', 'cross-browser']
    },
    {
      id: generateTestId('PLATFORM'),
      category: 'PLATFORM',
      subcategory: 'Browser',
      description: 'Verify lazy loading (native loading="lazy") works in supported browsers (fallback for unsupported)',
      priority: 'P2',
      automationFitness: 'e2e-level',
      tags: ['htsm:platform', 'htsm:Browser', 'priority:P2', 'lazy-loading']
    },
    {
      id: generateTestId('PLATFORM'),
      category: 'PLATFORM',
      subcategory: 'ExternalSoftware',
      description: 'Verify Instagram Graph API version compatibility (v18.0 minimum)',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:platform', 'htsm:ExternalSoftware', 'priority:P1', 'api-version']
    },
    {
      id: generateTestId('PLATFORM'),
      category: 'PLATFORM',
      subcategory: 'ExternalSoftware',
      description: 'Verify CDN (Cloudflare) image optimization delivers WebP with JPEG fallback',
      priority: 'P2',
      automationFitness: 'integration-level',
      tags: ['htsm:platform', 'htsm:ExternalSoftware', 'priority:P2', 'cdn-optimization']
    }
  );

  // OPERATIONS - CommonUse, DisfavoredUse, ExtremeUse
  testIdeas.push(
    {
      id: generateTestId('OPERATIONS'),
      category: 'OPERATIONS',
      subcategory: 'CommonUse',
      description: 'Verify typical user can submit UGC photo with product tags in <2 minutes',
      priority: 'P2',
      automationFitness: 'e2e-level',
      tags: ['htsm:operations', 'htsm:CommonUse', 'priority:P2', 'usability']
    },
    {
      id: generateTestId('OPERATIONS'),
      category: 'OPERATIONS',
      subcategory: 'DisfavoredUse',
      description: 'Verify malicious file upload (e.g., .exe renamed to .jpg) is blocked at validation layer',
      priority: 'P0',
      automationFitness: 'security',
      tags: ['htsm:operations', 'htsm:DisfavoredUse', 'priority:P0', 'malicious-upload']
    },
    {
      id: generateTestId('OPERATIONS'),
      category: 'OPERATIONS',
      subcategory: 'DisfavoredUse',
      description: 'Verify SQL injection attempts in UGC caption fields are sanitized',
      priority: 'P0',
      automationFitness: 'security',
      tags: ['htsm:operations', 'htsm:DisfavoredUse', 'priority:P0', 'sql-injection']
    },
    {
      id: generateTestId('OPERATIONS'),
      category: 'OPERATIONS',
      subcategory: 'DisfavoredUse',
      description: 'Verify copyright infringement detection flags professional stock photos',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:operations', 'htsm:DisfavoredUse', 'priority:P1', 'copyright-detection']
    },
    {
      id: generateTestId('OPERATIONS'),
      category: 'OPERATIONS',
      subcategory: 'ExtremeUse',
      description: 'Verify homepage handles 100k concurrent visitors without UGC component degradation',
      priority: 'P1',
      automationFitness: 'performance',
      tags: ['htsm:operations', 'htsm:ExtremeUse', 'priority:P1', 'load-testing']
    },
    {
      id: generateTestId('OPERATIONS'),
      category: 'OPERATIONS',
      subcategory: 'ExtremeUse',
      description: 'Verify moderation queue handles 1000 UGC submissions per hour without backlog',
      priority: 'P1',
      automationFitness: 'performance',
      tags: ['htsm:operations', 'htsm:ExtremeUse', 'priority:P1', 'queue-performance']
    }
  );

  // TIME - Timing, Concurrency, Timeout
  testIdeas.push(
    {
      id: generateTestId('TIME'),
      category: 'TIME',
      subcategory: 'Timing',
      description: 'Verify UGC components add <100ms to total page load time (LCP impact)',
      priority: 'P1',
      automationFitness: 'performance',
      tags: ['htsm:time', 'htsm:Timing', 'priority:P1', 'page-load-performance']
    },
    {
      id: generateTestId('TIME'),
      category: 'TIME',
      subcategory: 'Timing',
      description: 'Verify trending rankings update every 5 minutes via WebSocket push',
      priority: 'P2',
      automationFitness: 'integration-level',
      tags: ['htsm:time', 'htsm:Timing', 'priority:P2', 'real-time-updates']
    },
    {
      id: generateTestId('TIME'),
      category: 'TIME',
      subcategory: 'Concurrency',
      description: 'Verify multiple users can submit UGC simultaneously without race conditions in moderation queue',
      priority: 'P1',
      automationFitness: 'concurrency',
      tags: ['htsm:time', 'htsm:Concurrency', 'priority:P1', 'race-conditions']
    },
    {
      id: generateTestId('TIME'),
      category: 'TIME',
      subcategory: 'Concurrency',
      description: 'Verify trending algorithm handles concurrent view/cart/purchase events without data loss',
      priority: 'P1',
      automationFitness: 'concurrency',
      tags: ['htsm:time', 'htsm:Concurrency', 'priority:P1', 'event-stream']
    },
    {
      id: generateTestId('TIME'),
      category: 'TIME',
      subcategory: 'Timeout',
      description: 'Verify Instagram API timeout (3s) triggers fallback to cached feed',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:time', 'htsm:Timeout', 'priority:P1', 'timeout-handling']
    },
    {
      id: generateTestId('TIME'),
      category: 'TIME',
      subcategory: 'Timeout',
      description: 'Verify AI moderation (Rekognition) timeout (5s) queues UGC for manual review',
      priority: 'P1',
      automationFitness: 'integration-level',
      tags: ['htsm:time', 'htsm:Timeout', 'priority:P1', 'moderation-timeout']
    }
  );

  return testIdeas;
}

// Generate clarifying questions for coverage gaps
function generateClarifyingQuestions(): ClarifyingQuestion[] {
  return [
    {
      category: 'STRUCTURE',
      subcategory: 'Documentation',
      question: 'What API documentation format is required for UGC endpoints (OpenAPI/Swagger)?',
      rationale: 'API documentation standards are not specified in the epic'
    },
    {
      category: 'FUNCTION',
      subcategory: 'StateTransition',
      question: 'What are the valid state transitions for UGC moderation (pending → approved/rejected → featured)?',
      rationale: 'Moderation workflow state machine is not fully defined'
    },
    {
      category: 'DATA',
      subcategory: 'Cardinality',
      question: 'Can a single user photo be tagged with multiple products? What is the maximum?',
      rationale: 'Product tagging cardinality rules are not specified'
    },
    {
      category: 'INTERFACES',
      subcategory: 'ImportExport',
      question: 'Can users export their submitted UGC data (GDPR data portability)?',
      rationale: 'GDPR Article 20 data portability requirements not addressed'
    },
    {
      category: 'PLATFORM',
      subcategory: 'OperatingSystem',
      question: 'What mobile OS versions must be supported for UGC upload (iOS 14+, Android 10+)?',
      rationale: 'Mobile platform requirements not specified'
    },
    {
      category: 'OPERATIONS',
      subcategory: 'UncommonUse',
      question: 'How should the system handle UGC submissions from users in countries with restricted Instagram access?',
      rationale: 'Geo-restriction edge cases not addressed'
    },
    {
      category: 'TIME',
      subcategory: 'Scheduling',
      question: 'What is the staff picks rotation schedule (weekly on Sundays at 00:00 UTC confirmed)?',
      rationale: 'Scheduling details mentioned but need confirmation of timezone handling'
    }
  ];
}

// Generate summary statistics
function generateSummary(testIdeas: TestIdea[], questions: ClarifyingQuestion[]) {
  const byCategory: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byAutomationFitness: Record<string, number> = {};

  for (const idea of testIdeas) {
    byCategory[idea.category] = (byCategory[idea.category] || 0) + 1;
    byPriority[idea.priority] = (byPriority[idea.priority] || 0) + 1;
    byAutomationFitness[idea.automationFitness] = (byAutomationFitness[idea.automationFitness] || 0) + 1;
  }

  return {
    totalTestIdeas: testIdeas.length,
    totalQuestions: questions.length,
    byCategory,
    byPriority,
    byAutomationFitness
  };
}

// Generate HTML report
function generateHTMLReport(result: AssessmentResult): string {
  const { testIdeas, clarifyingQuestions, summary } = result;

  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Epic 5: Social Proof & UGC - SFDIPOT Assessment</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; line-height: 1.6; color: #333; background: #f5f5f5; padding: 20px; }
    .container { max-width: 1400px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #1a1a1a; margin-bottom: 10px; font-size: 2.5em; }
    h2 { color: #2c3e50; margin-top: 40px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 3px solid #3498db; }
    h3 { color: #34495e; margin-top: 30px; margin-bottom: 15px; }
    .subtitle { color: #7f8c8d; font-size: 1.1em; margin-bottom: 30px; }
    .dashboard { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 30px 0; }
    .metric-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 25px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    .metric-card h3 { color: white; font-size: 1em; margin: 0 0 10px 0; opacity: 0.9; }
    .metric-value { font-size: 3em; font-weight: bold; margin: 10px 0; }
    .metric-label { font-size: 0.9em; opacity: 0.9; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f8f9fa; font-weight: 600; color: #2c3e50; position: sticky; top: 0; }
    tr:hover { background: #f8f9fa; }
    .priority-P0 { background: #fee; color: #c00; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
    .priority-P1 { background: #ffeaa7; color: #d63031; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
    .priority-P2 { background: #dfe6e9; color: #2d3436; padding: 4px 8px; border-radius: 4px; }
    .priority-P3 { background: #f1f1f1; color: #636e72; padding: 4px 8px; border-radius: 4px; }
    .tag { display: inline-block; background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 12px; font-size: 0.85em; margin: 2px; }
    .automation-api-level { background: #4caf50; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.9em; }
    .automation-integration-level { background: #2196f3; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.9em; }
    .automation-e2e-level { background: #ff9800; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.9em; }
    .automation-security { background: #f44336; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.9em; }
    .automation-performance { background: #9c27b0; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.9em; }
    .automation-accessibility { background: #00bcd4; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.9em; }
    .automation-concurrency { background: #673ab7; color: white; padding: 4px 10px; border-radius: 4px; font-size: 0.9em; }
    .question-card { background: #fffbea; border-left: 4px solid #f39c12; padding: 15px; margin: 10px 0; border-radius: 4px; }
    .question-card strong { color: #d35400; }
    .category-section { margin: 30px 0; }
    footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e0e0e0; color: #7f8c8d; text-align: center; }
    .risk-highlight { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>SFDIPOT Product Factors Assessment</h1>
    <div class="subtitle">Epic 5: Social Proof & User-Generated Content Integration</div>
    <div class="subtitle">Next.co.uk Homepage - E-commerce Retail Fashion</div>

    <div class="risk-highlight">
      <strong>Critical Risk Areas Analyzed:</strong>
      <ul>
        <li>UGC moderation and content safety (AI + human review)</li>
        <li>Third-party API integrations (Instagram Graph API, Trustpilot Business API)</li>
        <li>Real-time data processing for trending algorithms</li>
        <li>Privacy/GDPR compliance (consent management, right to deletion)</li>
        <li>Performance impact on homepage Core Web Vitals</li>
        <li>Accessibility (WCAG 2.2 AA compliance)</li>
      </ul>
    </div>

    <h2>Assessment Summary</h2>
    <div class="dashboard">
      <div class="metric-card">
        <h3>Total Test Ideas</h3>
        <div class="metric-value">${summary.totalTestIdeas}</div>
        <div class="metric-label">Across 7 SFDIPOT categories</div>
      </div>
      <div class="metric-card" style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);">
        <h3>Clarifying Questions</h3>
        <div class="metric-value">${summary.totalQuestions}</div>
        <div class="metric-label">Coverage gaps identified</div>
      </div>
      <div class="metric-card" style="background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);">
        <h3>P0/P1 Critical Tests</h3>
        <div class="metric-value">${(summary.byPriority['P0'] || 0) + (summary.byPriority['P1'] || 0)}</div>
        <div class="metric-label">High-priority test coverage</div>
      </div>
    </div>

    <h2>Test Distribution</h2>
    <h3>By Category (SFDIPOT)</h3>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Test Ideas</th>
          <th>Percentage</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(summary.byCategory)
          .sort((a, b) => b[1] - a[1])
          .map(([cat, count]) => `
            <tr>
              <td><strong>${cat}</strong></td>
              <td>${count}</td>
              <td>${((count / summary.totalTestIdeas) * 100).toFixed(1)}%</td>
            </tr>
          `).join('')}
      </tbody>
    </table>

    <h3>By Priority</h3>
    <table>
      <thead>
        <tr>
          <th>Priority</th>
          <th>Count</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><span class="priority-P0">P0</span></td>
          <td>${summary.byPriority['P0'] || 0}</td>
          <td>Critical: Data loss, security breach, compliance violation</td>
        </tr>
        <tr>
          <td><span class="priority-P1">P1</span></td>
          <td>${summary.byPriority['P1'] || 0}</td>
          <td>High: Major feature broken, significant user impact</td>
        </tr>
        <tr>
          <td><span class="priority-P2">P2</span></td>
          <td>${summary.byPriority['P2'] || 0}</td>
          <td>Medium: Minor feature impact, degraded experience</td>
        </tr>
        <tr>
          <td><span class="priority-P3">P3</span></td>
          <td>${summary.byPriority['P3'] || 0}</td>
          <td>Low: Edge cases, cosmetic issues</td>
        </tr>
      </tbody>
    </table>

    <h3>By Automation Fitness</h3>
    <table>
      <thead>
        <tr>
          <th>Automation Level</th>
          <th>Count</th>
          <th>Percentage</th>
        </tr>
      </thead>
      <tbody>
        ${Object.entries(summary.byAutomationFitness)
          .sort((a, b) => b[1] - a[1])
          .map(([level, count]) => `
            <tr>
              <td><span class="automation-${level.replace('-level', '').replace('_', '-')}">${level}</span></td>
              <td>${count}</td>
              <td>${((count / summary.totalTestIdeas) * 100).toFixed(1)}%</td>
            </tr>
          `).join('')}
      </tbody>
    </table>

    <h2>Comprehensive Test Ideas</h2>
    ${['STRUCTURE', 'FUNCTION', 'DATA', 'INTERFACES', 'PLATFORM', 'OPERATIONS', 'TIME'].map(category => {
      const categoryIdeas = testIdeas.filter(t => t.category === category);
      if (categoryIdeas.length === 0) return '';

      return `
        <div class="category-section">
          <h3>${category} (${categoryIdeas.length} tests)</h3>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Subcategory</th>
                <th>Description</th>
                <th>Priority</th>
                <th>Automation</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              ${categoryIdeas.map(idea => `
                <tr>
                  <td><code>${idea.id}</code></td>
                  <td><strong>${idea.subcategory}</strong></td>
                  <td>${idea.description}</td>
                  <td><span class="priority-${idea.priority}">${idea.priority}</span></td>
                  <td><span class="automation-${idea.automationFitness.replace('-level', '').replace('_', '-')}">${idea.automationFitness}</span></td>
                  <td>${idea.tags.slice(2).map(tag => `<span class="tag">${tag}</span>`).join(' ')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }).join('')}

    <h2>Clarifying Questions (Coverage Gaps)</h2>
    ${clarifyingQuestions.map(q => `
      <div class="question-card">
        <strong>${q.category} → ${q.subcategory}:</strong> ${q.question}
        <br><em>Rationale: ${q.rationale}</em>
      </div>
    `).join('')}

    <footer>
      <p>Generated by Agentic QE Fleet - SFDIPOT Product Factors Assessor</p>
      <p>Assessment Date: ${new Date().toISOString()}</p>
    </footer>
  </div>
</body>
</html>
  `;

  return html;
}

// Generate JSON report
function generateJSONReport(result: AssessmentResult): string {
  return JSON.stringify(result, null, 2);
}

// Main execution
async function runAssessment() {
  console.log('='.repeat(80));
  console.log('SFDIPOT Product Factors Assessment');
  console.log('Epic 5: Social Proof & User-Generated Content Integration');
  console.log('='.repeat(80));
  console.log('');

  const testIdeas = generateEpic5TestIdeas();
  const clarifyingQuestions = generateClarifyingQuestions();
  const summary = generateSummary(testIdeas, clarifyingQuestions);

  const result: AssessmentResult = {
    name: 'Epic5-Social-Proof-UGC-Assessment',
    testIdeas,
    clarifyingQuestions,
    summary
  };

  console.log('Assessment Summary:');
  console.log(`  Total Test Ideas: ${summary.totalTestIdeas}`);
  console.log(`  Clarifying Questions: ${summary.totalQuestions}`);
  console.log('');

  console.log('By Category:');
  for (const [cat, count] of Object.entries(summary.byCategory)) {
    console.log(`  ${cat}: ${count}`);
  }
  console.log('');

  console.log('By Priority:');
  for (const [pri, count] of Object.entries(summary.byPriority)) {
    console.log(`  ${pri}: ${count}`);
  }
  console.log('');

  // Generate and save reports
  const outputDir = path.dirname(__filename);

  const htmlReport = generateHTMLReport(result);
  const htmlPath = path.join(outputDir, 'Epic5-Social-Proof-UGC-Assessment.html');
  fs.writeFileSync(htmlPath, htmlReport);
  console.log(`✅ HTML report saved: ${htmlPath}`);

  const jsonReport = generateJSONReport(result);
  const jsonPath = path.join(outputDir, 'Epic5-Social-Proof-UGC-Assessment.json');
  fs.writeFileSync(jsonPath, jsonReport);
  console.log(`✅ JSON report saved: ${jsonPath}`);

  console.log('\n' + '='.repeat(80));
  console.log('Assessment Complete!');
  console.log('='.repeat(80));
}

runAssessment().catch(error => {
  console.error('Assessment failed:', error);
  process.exit(1);
});

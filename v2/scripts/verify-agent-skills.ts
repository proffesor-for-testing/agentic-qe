#!/usr/bin/env tsx

/**
 * Verify Agent Skills Script
 *
 * Validates that agent skill references exist and suggests additions based on
 * agent specialization. Checks for Phase 2 skill adoption.
 *
 * Usage:
 *   npm run verify:agent-skills
 *   tsx scripts/verify-agent-skills.ts
 *   tsx scripts/verify-agent-skills.ts --verbose
 *   tsx scripts/verify-agent-skills.ts --json
 *   tsx scripts/verify-agent-skills.ts --agent qe-test-generator
 *
 * Exit codes:
 *   0 - All agent skills valid
 *   1 - Missing or broken skill references found
 *
 * @author Agentic QE Team
 * @version 1.0.0
 */

import * as fs from 'fs';
import * as path from 'path';

interface SkillReference {
  skill: string;
  exists: boolean;
  phase?: 1 | 2;
  location?: string;
}

interface AgentSkillAnalysis {
  agentName: string;
  agentPath: string;
  skillsReferenced: SkillReference[];
  missingSkills: string[];
  phase2Skills: string[];
  suggestedSkills: string[];
  totalReferences: number;
  validReferences: number;
  brokenReferences: number;
}

interface VerificationReport {
  timestamp: string;
  summary: {
    totalAgents: number;
    agentsWithSkills: number;
    agentsWithPhase2Skills: number;
    totalBrokenReferences: number;
    totalSuggestions: number;
  };
  agents: AgentSkillAnalysis[];
  errors: string[];
}

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUTPUT = process.argv.includes('--json');
const SPECIFIC_AGENT = process.argv.find(arg => arg.startsWith('--agent='))?.split('=')[1];
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Skill categories for suggestions
const SKILL_CATEGORIES = {
  'qe-test-generator': ['shift-left-testing', 'test-design-techniques', 'test-data-management', 'mutation-testing'],
  'qe-coverage-analyzer': ['regression-testing', 'test-reporting-analytics', 'shift-left-testing'],
  'qe-quality-gate': ['quality-metrics', 'shift-left-testing', 'compliance-testing'],
  'qe-performance-tester': ['performance-testing', 'chaos-engineering-resilience', 'test-reporting-analytics'],
  'qe-security-scanner': ['security-testing', 'compliance-testing', 'shift-right-testing'],
  'qe-visual-tester': ['visual-testing-advanced', 'accessibility-testing', 'compatibility-testing'],
  'qe-chaos-engineer': ['chaos-engineering-resilience', 'shift-right-testing', 'test-environment-management'],
  'qe-flaky-test-hunter': ['mutation-testing', 'test-reporting-analytics', 'regression-testing'],
  'qe-api-contract-validator': ['contract-testing', 'api-testing-patterns', 'shift-left-testing'],
  'qe-test-data-architect': ['test-data-management', 'database-testing', 'compliance-testing'],
  'qe-regression-risk-analyzer': ['regression-testing', 'risk-based-testing', 'test-reporting-analytics'],
  'qe-deployment-readiness': ['shift-right-testing', 'test-environment-management', 'compliance-testing'],
  'qe-requirements-validator': ['shift-left-testing', 'test-design-techniques', 'api-testing-patterns'],
  'qe-production-intelligence': ['shift-right-testing', 'chaos-engineering-resilience', 'test-reporting-analytics'],
  'qe-fleet-commander': ['holistic-testing-pact', 'agentic-quality-engineering', 'test-automation-strategy']
};

const PHASE_2_SKILLS = [
  'regression-testing', 'shift-left-testing', 'shift-right-testing',
  'test-design-techniques', 'mutation-testing', 'test-data-management',
  'accessibility-testing', 'mobile-testing', 'database-testing',
  'contract-testing', 'chaos-engineering-resilience', 'compatibility-testing',
  'localization-testing', 'compliance-testing', 'visual-testing-advanced',
  'test-environment-management', 'test-reporting-analytics'
];

/**
 * Get all available skills
 */
function getAllSkills(): Map<string, { path: string; phase: 1 | 2 }> {
  const skillsDir = path.join(PROJECT_ROOT, '.claude', 'skills');
  const skills = new Map<string, { path: string; phase: 1 | 2 }>();

  if (!fs.existsSync(skillsDir)) {
    return skills;
  }

  const scanSkills = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(dir, entry.name);
        const skillFile = path.join(skillPath, 'SKILL.md');

        if (fs.existsSync(skillFile)) {
          const phase = PHASE_2_SKILLS.includes(entry.name) ? 2 : 1;
          skills.set(entry.name, { path: skillPath, phase });
        }
      }
    }
  };

  scanSkills(skillsDir);
  return skills;
}

/**
 * Extract skill references from agent markdown
 */
function extractSkillReferences(agentPath: string): string[] {
  const content = fs.readFileSync(agentPath, 'utf-8');
  const skills: string[] = [];

  // Look for various patterns of skill references
  const patterns = [
    /Skill\(["']([^"']+)["']\)/g,              // Skill("skill-name")
    /skill:\s*["']([^"']+)["']/g,               // skill: "skill-name"
    /skills?:\s*\[([^\]]+)\]/g,                 // skills: ["skill1", "skill2"]
    /uses?\s+(?:the\s+)?["']([^"']+)["']\s+skill/gi,  // uses "skill-name" skill
    /\*\*([a-z-]+)\*\*\s+skill/gi,             // **skill-name** skill
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1].includes('[')) {
        // Handle array format
        const arrayMatch = match[1].match(/["']([^"']+)["']/g);
        if (arrayMatch) {
          arrayMatch.forEach(item => {
            const skill = item.replace(/["']/g, '').trim();
            if (skill && !skills.includes(skill)) {
              skills.push(skill);
            }
          });
        }
      } else {
        const skill = match[1].trim();
        if (skill && !skills.includes(skill)) {
          skills.push(skill);
        }
      }
    }
  }

  return skills;
}

/**
 * Analyze agent skills
 */
function analyzeAgent(agentPath: string, agentName: string, allSkills: Map<string, { path: string; phase: 1 | 2 }>): AgentSkillAnalysis {
  const referencedSkills = extractSkillReferences(agentPath);
  const skillRefs: SkillReference[] = [];
  const missingSkills: string[] = [];
  const phase2Skills: string[] = [];

  for (const skill of referencedSkills) {
    const skillInfo = allSkills.get(skill);
    const exists = !!skillInfo;

    skillRefs.push({
      skill,
      exists,
      phase: skillInfo?.phase,
      location: skillInfo?.path
    });

    if (!exists) {
      missingSkills.push(skill);
    } else if (skillInfo.phase === 2) {
      phase2Skills.push(skill);
    }
  }

  // Generate suggestions
  const suggestedSkills: string[] = [];
  const agentKey = path.basename(agentName, '.md');

  if (SKILL_CATEGORIES[agentKey]) {
    for (const suggestion of SKILL_CATEGORIES[agentKey]) {
      if (!referencedSkills.includes(suggestion) && allSkills.has(suggestion)) {
        suggestedSkills.push(suggestion);
      }
    }
  }

  return {
    agentName: agentKey,
    agentPath,
    skillsReferenced: skillRefs,
    missingSkills,
    phase2Skills,
    suggestedSkills,
    totalReferences: referencedSkills.length,
    validReferences: skillRefs.filter(s => s.exists).length,
    brokenReferences: missingSkills.length
  };
}

/**
 * Run verification
 */
function verify(): VerificationReport {
  const report: VerificationReport = {
    timestamp: new Date().toISOString(),
    summary: {
      totalAgents: 0,
      agentsWithSkills: 0,
      agentsWithPhase2Skills: 0,
      totalBrokenReferences: 0,
      totalSuggestions: 0
    },
    agents: [],
    errors: []
  };

  try {
    const allSkills = getAllSkills();
    const agentsDir = path.join(PROJECT_ROOT, '.claude', 'agents');

    if (!fs.existsSync(agentsDir)) {
      report.errors.push('Agents directory not found');
      return report;
    }

    // Scan for agent markdown files
    const scanAgents = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          scanAgents(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Filter by specific agent if requested
          if (SPECIFIC_AGENT && !entry.name.includes(SPECIFIC_AGENT)) {
            continue;
          }

          const analysis = analyzeAgent(fullPath, entry.name, allSkills);
          report.agents.push(analysis);
        }
      }
    };

    scanAgents(agentsDir);

    // Calculate summary
    report.summary.totalAgents = report.agents.length;
    report.summary.agentsWithSkills = report.agents.filter(a => a.totalReferences > 0).length;
    report.summary.agentsWithPhase2Skills = report.agents.filter(a => a.phase2Skills.length > 0).length;
    report.summary.totalBrokenReferences = report.agents.reduce((sum, a) => sum + a.brokenReferences, 0);
    report.summary.totalSuggestions = report.agents.reduce((sum, a) => sum + a.suggestedSkills.length, 0);

  } catch (error) {
    report.errors.push(`Verification error: ${error}`);
  }

  return report;
}

/**
 * Display report
 */
function displayReport(report: VerificationReport): void {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('\n' + '='.repeat(80));
  console.log('AGENT SKILL REFERENCE VERIFICATION REPORT');
  console.log('='.repeat(80));
  console.log(`Generated: ${report.timestamp}\n`);

  // Display per-agent analysis
  for (const agent of report.agents) {
    console.log(`\n🤖 Agent: ${agent.agentName}`);
    console.log('-'.repeat(80));
    console.log(`Skills Referenced: ${agent.totalReferences}`);
    console.log(`Valid References: ${agent.validReferences}`);
    console.log(`Broken References: ${agent.brokenReferences}`);
    console.log(`Phase 2 Skills: ${agent.phase2Skills.length}`);

    if (agent.brokenReferences > 0) {
      console.log(`\n❌ MISSING SKILLS:`);
      agent.missingSkills.forEach(skill => console.log(`   - ${skill}`));
    }

    if (agent.phase2Skills.length > 0) {
      console.log(`\n✅ PHASE 2 SKILLS USED:`);
      agent.phase2Skills.forEach(skill => console.log(`   - ${skill}`));
    } else if (agent.totalReferences > 0) {
      console.log(`\n⚠️  No Phase 2 skills referenced`);
    }

    if (agent.suggestedSkills.length > 0) {
      console.log(`\n💡 SUGGESTED ADDITIONS:`);
      agent.suggestedSkills.forEach(skill => console.log(`   - ${skill} (matches specialization)`));
    }

    if (VERBOSE && agent.skillsReferenced.length > 0) {
      console.log(`\n📋 ALL REFERENCES:`);
      agent.skillsReferenced.forEach(ref => {
        const icon = ref.exists ? '✅' : '❌';
        const phase = ref.phase ? ` (Phase ${ref.phase})` : '';
        console.log(`   ${icon} ${ref.skill}${phase}`);
      });
    }
  }

  // Display summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total Agents: ${report.summary.totalAgents}`);
  console.log(`Agents with Skills: ${report.summary.agentsWithSkills}`);
  console.log(`Agents with Phase 2 Skills: ${report.summary.agentsWithPhase2Skills}`);
  console.log(`Broken References: ${report.summary.totalBrokenReferences}`);
  console.log(`Total Suggestions: ${report.summary.totalSuggestions}`);

  if (report.errors.length > 0) {
    console.log('\n⚠️ ERRORS:');
    report.errors.forEach(error => console.log(`  - ${error}`));
  }

  console.log('='.repeat(80) + '\n');

  // Provide recommendations
  if (report.summary.totalBrokenReferences > 0) {
    console.log('🔧 ACTION REQUIRED:\n');
    console.log('• Fix broken skill references by updating agent markdown files');
    console.log('• Ensure all referenced skills exist in .claude/skills/\n');
  }

  if (report.summary.totalSuggestions > 0) {
    console.log('💡 RECOMMENDATIONS:\n');
    console.log('• Consider adding suggested skills to enhance agent capabilities');
    console.log('• Phase 2 skills provide advanced testing methodologies\n');
  }
}

/**
 * Main execution
 */
function main(): void {
  const report = verify();
  displayReport(report);

  // Save JSON report
  const reportsDir = path.join(PROJECT_ROOT, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  const reportPath = path.join(reportsDir, `verification-agent-skills-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  if (VERBOSE) {
    console.log(`\n📄 Full report saved to: ${reportPath}\n`);
  }

  // Exit with appropriate code
  process.exit(report.summary.totalBrokenReferences > 0 ? 1 : 0);
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { verify, VerificationReport, AgentSkillAnalysis };

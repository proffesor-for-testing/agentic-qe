# Constitution-Based Quality Evaluation System - GOAP Specification

## Path 2: Multi-Agent Quality Judging with Explainable Verdicts

**Version**: 1.0.0
**Status**: Specification
**Created**: 2025-11-19

---

## Executive Summary

This specification defines a Goal-Oriented Action Plan (GOAP) for implementing a Constitution-Based Quality Evaluation System within the Agentic QE Fleet. The system enables multiple AI agents to evaluate code, tests, and documentation against configurable "constitutions" (quality criteria), producing both human-readable critiques and structured JSON outputs suitable for autonomous agent control loops.

---

## 1. Goal State Definition

### 1.1 Primary Goal State

```typescript
interface GoalState {
  constitutionSystem: {
    schemaRegistry: "operational";           // Constitution schemas are defined and validated
    projectConstitutions: "loaded";          // Project-specific constitutions are available
    defaultConstitutions: "deployed";        // Base constitutions exist for all artifact types
  };
  evaluationOrchestration: {
    agentVotingPanel: "assembled";           // Multiple agents can vote on quality
    consensusMechanism: "functional";        // Votes are aggregated into verdicts
    tieBreaking: "deterministic";            // Conflicts are resolved consistently
  };
  outputGeneration: {
    humanCritiques: "generated";             // Textual feedback for developers
    structuredJson: "produced";              // Machine-readable results for automation
    auditTrails: "persisted";                // All judgments are traceable
  };
  integrationPoints: {
    cicdPipelines: "connected";              // Quality gates block bad deployments
    idePlugins: "available";                 // Real-time feedback in development
    agentControlLoops: "functional";         // Autonomous agents can consume verdicts
  };
  transparency: {
    explainableJudgments: "enforced";        // Every verdict cites constitutional clauses
    calibrationMetrics: "tracked";           // Agreement rates and drift are monitored
    appealProcess: "implemented";            // Developers can challenge verdicts
  };
}
```

### 1.2 Success Criteria

| Criterion | Metric | Target |
|-----------|--------|--------|
| Constitution Coverage | Artifact types with constitutions | 100% (code, tests, docs) |
| Agent Agreement Rate | Consensus on same artifacts | >= 85% |
| Judgment Explainability | Verdicts with clause citations | 100% |
| CI/CD Integration | Pipelines consuming verdicts | Fully automated |
| Response Time (Single File) | End-to-end evaluation | < 5 seconds |
| Response Time (PR) | Full PR evaluation | < 60 seconds |
| Human Override Support | Appeals processed | 100% |
| Structured Output Compliance | JSON schema validation | 100% |

---

## 2. Current State Assessment

### 2.1 Existing Capabilities

```typescript
interface CurrentState {
  qualityGates: {
    thresholdBased: true;              // Basic pass/fail thresholds exist
    singleAgentJudging: true;          // One agent makes decisions
    configurable: true;                // Custom thresholds supported
  };
  agentInfrastructure: {
    qeAgents: 18;                      // 18 specialized QE agents
    memoryNamespace: "aqe/*";          // Shared coordination namespace
    swarmCoordination: true;           // Agents can work in swarms
  };
  outputFormats: {
    textReports: true;                 // Human-readable output exists
    structuredJson: "partial";         // Some JSON output
    cicdIntegration: true;             // Basic CI/CD support
  };
  missing: {
    constitutionSchema: true;          // No formal quality criteria definitions
    multiAgentVoting: true;            // No consensus mechanism
    explainableJudgments: true;        // No clause-based explanations
    projectCustomization: true;        // No project-specific overrides
  };
}
```

### 2.2 Gap Analysis

| Gap | Impact | Priority |
|-----|--------|----------|
| No Constitution Schema | Cannot define formal quality criteria | P0 |
| Single Agent Decisions | No consensus, higher error rate | P0 |
| Non-explainable Verdicts | Developers can't understand failures | P1 |
| No Project Customization | One-size-fits-all doesn't scale | P1 |
| Limited JSON Output | Automation consumers need structured data | P2 |

---

## 3. Preconditions

### 3.1 Technical Preconditions

```yaml
preconditions:
  infrastructure:
    - name: "QE Agent Fleet Operational"
      check: "aqe status --agents"
      requirement: "All 18 agents responsive"

    - name: "Memory Namespace Available"
      check: "aqe memory list --namespace aqe/*"
      requirement: "Read/write access confirmed"

    - name: "Swarm Coordination Active"
      check: "aqe swarm status"
      requirement: "Hierarchical or mesh topology"

  dependencies:
    - name: "AST Parser Available"
      packages: ["@babel/parser", "typescript", "tree-sitter"]
      requirement: "Code analysis for constitution evaluation"

    - name: "Schema Validation"
      packages: ["ajv", "json-schema-library"]
      requirement: "Constitution schema validation"

    - name: "Consensus Algorithms"
      packages: ["Custom implementation required"]
      requirement: "Voting aggregation"

  data:
    - name: "Base Constitution Templates"
      files: ["code.constitution.json", "test.constitution.json", "doc.constitution.json"]
      requirement: "Default quality criteria"

    - name: "Evaluation Examples"
      files: ["examples/good-code.ts", "examples/bad-code.ts"]
      requirement: "Calibration test cases"
```

### 3.2 Organizational Preconditions

- Team agreement on base quality standards
- Stakeholder buy-in for automated quality gates
- Documentation of current quality expectations
- Access to historical code review data (optional, for calibration)

---

## 4. Constitution Schema

### 4.1 Schema Definition

```typescript
interface Constitution {
  meta: ConstitutionMeta;
  principles: Principle[];
  clauses: Clause[];
  scoring: ScoringRules;
  overrides: OverrideRules;
}

interface ConstitutionMeta {
  id: string;                          // "code-quality-v1"
  name: string;                        // "Code Quality Constitution"
  version: string;                     // "1.0.0"
  artifactType: "code" | "test" | "documentation" | "config";
  extends?: string;                    // Parent constitution ID
  author: string;
  created: string;
  description: string;
}

interface Principle {
  id: string;                          // "P001"
  name: string;                        // "Single Responsibility"
  description: string;                 // "Each unit should have one responsibility"
  rationale: string;                   // Why this matters
  references: string[];                // ["SOLID", "Clean Code Ch. 3"]
  weight: number;                      // 0.0 - 1.0, importance in scoring
  category: string;                    // "structure", "security", "performance"
}

interface Clause {
  id: string;                          // "C001"
  principleId: string;                 // "P001" - parent principle
  name: string;                        // "Function Length"
  description: string;                 // "Functions should be concise"

  // Evaluation logic
  check: ClauseCheck;

  // Severity and scoring
  severity: "critical" | "major" | "minor" | "info";
  failureMessage: string;              // "Function {name} has {lines} lines, exceeds {max}"
  successMessage: string;              // "Function length within acceptable limits"

  // Flexibility
  configurable: boolean;
  defaultConfig: Record<string, any>;  // { maxLines: 50 }

  // Learning/Calibration
  examples: ClauseExample[];
}

interface ClauseCheck {
  type: "ast" | "metric" | "pattern" | "semantic" | "custom";

  // For AST checks
  astQuery?: string;                   // Tree-sitter or babel query

  // For metric checks
  metric?: string;                     // "cyclomaticComplexity"
  operator?: "lt" | "lte" | "gt" | "gte" | "eq" | "between";
  threshold?: number | [number, number];

  // For pattern checks
  pattern?: string;                    // Regex or glob
  matchBehavior?: "must-match" | "must-not-match";

  // For semantic checks (LLM-based)
  semanticPrompt?: string;             // "Does this code handle errors appropriately?"

  // For custom checks
  customHandler?: string;              // Module path to handler
}

interface ClauseExample {
  type: "pass" | "fail";
  code: string;
  explanation: string;
}

interface ScoringRules {
  aggregation: "weighted-average" | "minimum" | "product";
  thresholds: {
    pass: number;                      // 80 - score needed to pass
    warn: number;                      // 60 - score that triggers warning
  };
  categoryWeights: Record<string, number>;
}

interface OverrideRules {
  allowProjectOverrides: boolean;
  overridableClauses: string[];        // Clause IDs that can be customized
  requireJustification: boolean;       // Must document why overriding
}
```

### 4.2 Example Code Constitution

```json
{
  "meta": {
    "id": "code-quality-v1",
    "name": "Code Quality Constitution",
    "version": "1.0.0",
    "artifactType": "code",
    "author": "AQE Fleet",
    "created": "2025-11-19",
    "description": "Standard code quality criteria for TypeScript/JavaScript projects"
  },
  "principles": [
    {
      "id": "P001",
      "name": "Single Responsibility",
      "description": "Each module, class, and function should have one clearly defined responsibility",
      "rationale": "Single responsibility reduces coupling, improves testability, and makes code easier to understand",
      "references": ["SOLID Principles", "Clean Code Ch. 3"],
      "weight": 0.15,
      "category": "structure"
    },
    {
      "id": "P002",
      "name": "Error Handling",
      "description": "Code must handle errors explicitly and gracefully",
      "rationale": "Proper error handling prevents silent failures and improves debuggability",
      "references": ["Node.js Best Practices", "Clean Code Ch. 7"],
      "weight": 0.20,
      "category": "reliability"
    },
    {
      "id": "P003",
      "name": "Security First",
      "description": "Code must follow security best practices and avoid common vulnerabilities",
      "rationale": "Security vulnerabilities can lead to data breaches and system compromise",
      "references": ["OWASP Top 10", "CWE/SANS Top 25"],
      "weight": 0.25,
      "category": "security"
    }
  ],
  "clauses": [
    {
      "id": "C001",
      "principleId": "P001",
      "name": "Function Length",
      "description": "Functions should be concise and focused",
      "check": {
        "type": "ast",
        "astQuery": "FunctionDeclaration, ArrowFunctionExpression, FunctionExpression",
        "metric": "lines",
        "operator": "lte",
        "threshold": 50
      },
      "severity": "major",
      "failureMessage": "Function '{name}' has {actual} lines (max: {threshold})",
      "successMessage": "All functions are within length limits",
      "configurable": true,
      "defaultConfig": { "maxLines": 50 },
      "examples": [
        {
          "type": "pass",
          "code": "function add(a, b) { return a + b; }",
          "explanation": "Simple, focused function with single responsibility"
        },
        {
          "type": "fail",
          "code": "function doEverything() { /* 200 lines */ }",
          "explanation": "Function too long, likely doing too much"
        }
      ]
    },
    {
      "id": "C002",
      "principleId": "P002",
      "name": "Async Error Handling",
      "description": "Async functions must have try-catch or .catch() handlers",
      "check": {
        "type": "ast",
        "astQuery": "AwaitExpression:not(:has(ancestor::TryStatement))"
      },
      "severity": "critical",
      "failureMessage": "Unhandled await at line {line}: wrap in try-catch",
      "successMessage": "All async operations have error handling",
      "configurable": false,
      "defaultConfig": {},
      "examples": [
        {
          "type": "pass",
          "code": "try { await fetch(url); } catch (e) { log(e); }",
          "explanation": "Await is wrapped in try-catch"
        },
        {
          "type": "fail",
          "code": "const data = await fetch(url);",
          "explanation": "Unhandled rejection if fetch fails"
        }
      ]
    },
    {
      "id": "C003",
      "principleId": "P003",
      "name": "No Hardcoded Secrets",
      "description": "Secrets must not be hardcoded in source files",
      "check": {
        "type": "pattern",
        "pattern": "(password|secret|api_key|token)\\s*[=:]\\s*['\"][^'\"]{8,}['\"]",
        "matchBehavior": "must-not-match"
      },
      "severity": "critical",
      "failureMessage": "Potential hardcoded secret at line {line}: use environment variables",
      "successMessage": "No hardcoded secrets detected",
      "configurable": false,
      "defaultConfig": {},
      "examples": [
        {
          "type": "pass",
          "code": "const apiKey = process.env.API_KEY;",
          "explanation": "Secret loaded from environment variable"
        },
        {
          "type": "fail",
          "code": "const password = 'hunter2';",
          "explanation": "Hardcoded password in source code"
        }
      ]
    }
  ],
  "scoring": {
    "aggregation": "weighted-average",
    "thresholds": {
      "pass": 80,
      "warn": 60
    },
    "categoryWeights": {
      "structure": 0.25,
      "reliability": 0.25,
      "security": 0.30,
      "performance": 0.20
    }
  },
  "overrides": {
    "allowProjectOverrides": true,
    "overridableClauses": ["C001"],
    "requireJustification": true
  }
}
```

### 4.3 Project-Specific Constitution Override

```json
{
  "meta": {
    "id": "acme-corp-code-v1",
    "name": "ACME Corp Code Standards",
    "extends": "code-quality-v1",
    "version": "1.0.0"
  },
  "clauseOverrides": [
    {
      "clauseId": "C001",
      "config": { "maxLines": 100 },
      "justification": "Legacy codebase has larger functions; gradual migration in progress",
      "approvedBy": "tech-lead@acme.com",
      "expiresAt": "2025-06-01"
    }
  ],
  "additionalClauses": [
    {
      "id": "ACME001",
      "principleId": "P001",
      "name": "ACME Naming Convention",
      "description": "All exported functions must use ACME prefix",
      "check": {
        "type": "pattern",
        "pattern": "export (function|const) acme[A-Z]",
        "matchBehavior": "must-match"
      },
      "severity": "minor"
    }
  ]
}
```

---

## 5. Voting Mechanism

### 5.1 Multi-Agent Voting Panel

```typescript
interface VotingPanel {
  panelId: string;
  artifact: ArtifactReference;
  constitution: ConstitutionReference;

  // Panel composition
  agents: VotingAgent[];
  quorum: number;                      // Minimum agents needed for valid verdict

  // Voting configuration
  votingStrategy: VotingStrategy;
  tieBreaker: TieBreakingStrategy;

  // Results
  votes: Vote[];
  consensus: ConsensusResult;
  finalVerdict: Verdict;
}

interface VotingAgent {
  agentId: string;                     // "qe-quality-analyzer-1"
  agentType: string;                   // "qe-quality-analyzer"
  specialization?: string;             // "security", "performance"
  weight: number;                      // 1.0 default, can be adjusted
  capabilities: string[];
}

interface Vote {
  agentId: string;
  timestamp: string;

  // Per-clause verdicts
  clauseVerdicts: ClauseVerdict[];

  // Overall assessment
  overallScore: number;                // 0-100
  overallVerdict: "pass" | "warn" | "fail";

  // Agent's reasoning
  rationale: string;
  confidence: number;                  // 0.0 - 1.0

  // Metadata
  evaluationTimeMs: number;
  tokensUsed?: number;
}

interface ClauseVerdict {
  clauseId: string;
  verdict: "pass" | "fail" | "skip" | "error";
  score: number;                       // 0-100
  findings: Finding[];
  rationale: string;
}

interface Finding {
  location: {
    file: string;
    line: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
  };
  message: string;
  severity: "critical" | "major" | "minor" | "info";
  suggestion?: string;
  codeSnippet?: string;
}

type VotingStrategy =
  | "majority"                         // > 50% agreement
  | "supermajority"                    // >= 66% agreement
  | "unanimous"                        // 100% agreement
  | "weighted-majority"                // Weighted by agent expertise
  | "bayesian"                         // Bayesian aggregation

type TieBreakingStrategy =
  | "senior-agent"                     // Most experienced agent wins
  | "conservative"                     // Strictest interpretation wins
  | "permissive"                       // Most lenient interpretation wins
  | "random"                           // Random selection (for calibration)
```

### 5.2 Consensus Algorithm

```typescript
interface ConsensusAlgorithm {
  calculate(votes: Vote[], strategy: VotingStrategy): ConsensusResult;
}

interface ConsensusResult {
  // Overall consensus
  reached: boolean;
  agreementRate: number;               // 0.0 - 1.0

  // Per-clause consensus
  clauseConsensus: Map<string, ClauseConsensus>;

  // Dissenting opinions
  dissent: DissentingOpinion[];

  // Final aggregated scores
  aggregatedScores: {
    overall: number;
    byCategory: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

interface ClauseConsensus {
  clauseId: string;
  consensusVerdict: "pass" | "fail" | "disputed";
  voteCounts: {
    pass: number;
    fail: number;
    skip: number;
    error: number;
  };
  confidence: number;
}

interface DissentingOpinion {
  agentId: string;
  clauseId: string;
  dissenterVerdict: string;
  consensusVerdict: string;
  rationale: string;
}
```

### 5.3 Agent Selection for Voting Panels

```typescript
interface PanelAssembly {
  // Select agents based on artifact type and constitution requirements
  assemblePanel(
    artifact: Artifact,
    constitution: Constitution,
    config: PanelConfig
  ): VotingPanel;
}

interface PanelConfig {
  // How many agents on panel
  minAgents: number;                   // 3
  maxAgents: number;                   // 7

  // Required specializations
  requiredSpecializations: string[];   // ["security", "performance"]

  // Diversity requirements
  requireDiversity: boolean;           // Different agent types

  // Performance constraints
  maxEvaluationTimeMs: number;         // 10000

  // Cost constraints
  maxTokenBudget?: number;
}

// Agent selection algorithm
function selectAgentsForPanel(
  constitution: Constitution,
  availableAgents: VotingAgent[],
  config: PanelConfig
): VotingAgent[] {

  // 1. Filter by capability (can evaluate this artifact type)
  let candidates = availableAgents.filter(a =>
    canEvaluate(a, constitution.meta.artifactType)
  );

  // 2. Ensure required specializations
  const panel: VotingAgent[] = [];
  for (const spec of config.requiredSpecializations) {
    const specialist = candidates.find(a => a.specialization === spec);
    if (specialist) {
      panel.push(specialist);
      candidates = candidates.filter(a => a.agentId !== specialist.agentId);
    }
  }

  // 3. Add diverse generalists up to maxAgents
  while (panel.length < config.maxAgents && candidates.length > 0) {
    // Prefer diverse agent types
    const nextAgent = selectForDiversity(panel, candidates);
    panel.push(nextAgent);
    candidates = candidates.filter(a => a.agentId !== nextAgent.agentId);
  }

  return panel;
}
```

---

## 6. Output Formats

### 6.1 Evaluation Result JSON Schema

```typescript
interface EvaluationResult {
  meta: {
    evaluationId: string;
    timestamp: string;
    duration: {
      totalMs: number;
      perAgent: Record<string, number>;
    };
    constitution: {
      id: string;
      version: string;
    };
  };

  artifact: {
    type: "code" | "test" | "documentation";
    path: string;
    hash: string;                      // Content hash for caching
    context?: {
      prNumber?: number;
      commitSha?: string;
      branch?: string;
    };
  };

  panel: {
    agents: string[];
    quorum: number;
    votingStrategy: string;
  };

  verdict: {
    status: "pass" | "warn" | "fail";
    score: number;                     // 0-100
    confidence: number;                // 0.0-1.0
    consensus: {
      reached: boolean;
      agreementRate: number;
    };
  };

  scores: {
    overall: number;
    byCategory: Record<string, number>;
    byPrinciple: Record<string, number>;
  };

  findings: {
    critical: Finding[];
    major: Finding[];
    minor: Finding[];
    info: Finding[];
    total: number;
  };

  clauses: ClauseResult[];

  critique: {
    summary: string;                   // 2-3 sentence summary
    strengths: string[];               // What's good
    improvements: string[];            // What needs work
    actionItems: ActionItem[];         // Specific fixes
  };

  agentVotes: Vote[];                  // For transparency/audit

  humanReadable: string;               // Full markdown report
}

interface ClauseResult {
  clauseId: string;
  clauseName: string;
  principleId: string;
  verdict: "pass" | "fail" | "skip" | "disputed";
  score: number;
  consensus: {
    agreementRate: number;
    voteCounts: Record<string, number>;
  };
  findings: Finding[];
  explanation: string;
}

interface ActionItem {
  priority: "high" | "medium" | "low";
  clauseId: string;
  description: string;
  location?: string;                   // File and line
  suggestedFix?: string;
  estimatedEffort: "trivial" | "small" | "medium" | "large";
}
```

### 6.2 Human-Readable Critique Format

```markdown
# Quality Evaluation Report

## Summary

**Verdict**: PASS (Score: 85/100)
**Confidence**: 92%
**Consensus**: Reached (5/5 agents agreed)

### Quick Stats
- Critical Issues: 0
- Major Issues: 2
- Minor Issues: 5
- Total Findings: 7

---

## Strengths

1. **Excellent Error Handling** (Clause C002)
   - All async operations properly wrapped in try-catch
   - Error messages are descriptive and actionable

2. **No Security Vulnerabilities** (Clause C003)
   - No hardcoded secrets detected
   - Input validation present on all endpoints

---

## Required Improvements

### Major Issues

#### 1. Function Length Exceeded (C001)
**Location**: `src/services/UserService.ts:45-150`
**Clause**: Single Responsibility > Function Length

```typescript
// Current: 105 lines
async function processUserRegistration(data: UserData) {
  // ... 105 lines of mixed concerns
}
```

**Issue**: Function has 105 lines (max: 50), handling validation, database operations, email sending, and logging in one function.

**Suggested Fix**: Extract into smaller functions:
```typescript
async function processUserRegistration(data: UserData) {
  const validated = await validateUserData(data);
  const user = await createUser(validated);
  await sendWelcomeEmail(user);
  return user;
}
```

**Effort**: Medium

---

## Action Items

| Priority | Issue | Location | Effort |
|----------|-------|----------|--------|
| High | Refactor processUserRegistration | UserService.ts:45 | Medium |
| High | Add input validation to updateUser | UserService.ts:200 | Small |
| Medium | Reduce complexity in calculateScore | ScoreService.ts:30 | Medium |

---

## Agent Votes

| Agent | Score | Verdict | Confidence |
|-------|-------|---------|------------|
| qe-quality-analyzer | 85 | PASS | 95% |
| qe-security-scanner | 88 | PASS | 90% |
| qe-coverage-analyzer | 82 | PASS | 88% |

---

## Constitution Reference

Evaluated against: **code-quality-v1** (v1.0.0)

### Principles Applied
- P001: Single Responsibility (weight: 15%)
- P002: Error Handling (weight: 20%)
- P003: Security First (weight: 25%)

---

*Report generated by Agentic QE Fleet v1.8.2*
*Evaluation ID: eval-abc123*
```

### 6.3 CI/CD Integration Output

```yaml
# For GitHub Actions annotation
quality-evaluation:
  status: "pass"  # pass | warn | fail
  score: 85
  findings:
    - level: "warning"
      message: "Function processUserRegistration has 105 lines (max: 50)"
      file: "src/services/UserService.ts"
      line: 45
      endLine: 150
      annotation_level: "warning"

    - level: "notice"
      message: "Consider adding JSDoc to exported function createUser"
      file: "src/services/UserService.ts"
      line: 160
      annotation_level: "notice"

  summary: |
    ## Quality Gate: PASSED (85/100)

    - 0 Critical Issues
    - 2 Major Issues
    - 5 Minor Issues

    See full report for details.

  exit_code: 0  # 0 for pass, 1 for fail
```

### 6.4 Agent Control Loop Output

```typescript
interface AgentControlLoopOutput {
  // For autonomous agent decision making
  decision: {
    shouldProceed: boolean;
    confidence: number;
    reasoning: string;
  };

  // Structured data for agent actions
  requiredActions: {
    type: "refactor" | "add-tests" | "fix-security" | "document";
    target: string;
    specification: string;
    priority: number;
  }[];

  // Learning signals
  feedback: {
    positiveSignals: string[];         // What to repeat
    negativeSignals: string[];         // What to avoid
    patterns: string[];                // Patterns to learn
  };

  // Memory updates
  memoryUpdates: {
    key: string;
    value: any;
    namespace: string;
  }[];

  // Next steps for autonomous execution
  nextSteps: {
    immediate: string[];
    deferred: string[];
    blocked: {
      step: string;
      blocker: string;
      resolution: string;
    }[];
  };
}
```

---

## 7. Integration Points

### 7.1 CI/CD Pipeline Integration

```yaml
# .github/workflows/quality-gate.yml
name: Constitution Quality Gate

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  quality-evaluation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup AQE
        run: npm install -g @agentic-qe/cli

      - name: Load Project Constitution
        run: |
          aqe constitution load .aqe/constitutions/

      - name: Assemble Voting Panel
        id: panel
        run: |
          aqe constitution panel \
            --artifact-type code \
            --min-agents 3 \
            --specializations security,performance \
            --output json > panel.json

      - name: Evaluate Changed Files
        id: evaluate
        run: |
          # Get changed files
          CHANGED=$(git diff --name-only origin/${{ github.base_ref }}...HEAD)

          # Evaluate each file
          aqe constitution evaluate \
            --files "$CHANGED" \
            --panel panel.json \
            --output evaluation-result.json \
            --format github-actions

      - name: Post Results to PR
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const result = JSON.parse(fs.readFileSync('evaluation-result.json'));

            const body = `## Quality Evaluation: ${result.verdict.status.toUpperCase()}

            **Score**: ${result.verdict.score}/100
            **Consensus**: ${result.verdict.consensus.agreementRate * 100}%

            ### Findings
            - Critical: ${result.findings.critical.length}
            - Major: ${result.findings.major.length}
            - Minor: ${result.findings.minor.length}

            ${result.critique.summary}

            <details>
            <summary>Full Report</summary>

            ${result.humanReadable}
            </details>`;

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });

      - name: Fail if Quality Gate Failed
        if: steps.evaluate.outputs.verdict == 'fail'
        run: exit 1
```

### 7.2 IDE Integration (VS Code Extension)

```typescript
// Extension activation
export function activate(context: vscode.ExtensionContext) {
  // Register real-time evaluation
  const evaluator = new ConstitutionEvaluator();

  // Evaluate on save
  vscode.workspace.onDidSaveTextDocument(async (doc) => {
    if (shouldEvaluate(doc)) {
      const result = await evaluator.evaluateFile(doc.uri);
      updateDiagnostics(doc.uri, result);
    }
  });

  // Show inline annotations
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('aqe-constitution');

  function updateDiagnostics(uri: vscode.Uri, result: EvaluationResult) {
    const diagnostics: vscode.Diagnostic[] = result.findings.critical
      .concat(result.findings.major)
      .map(finding => {
        const range = new vscode.Range(
          finding.location.line - 1,
          finding.location.column || 0,
          finding.location.endLine ? finding.location.endLine - 1 : finding.location.line - 1,
          finding.location.endColumn || 999
        );

        const diagnostic = new vscode.Diagnostic(
          range,
          `[${finding.clauseId}] ${finding.message}`,
          severityToVscode(finding.severity)
        );

        diagnostic.source = 'AQE Constitution';
        diagnostic.code = finding.clauseId;

        return diagnostic;
      });

    diagnosticCollection.set(uri, diagnostics);
  }
}
```

### 7.3 Agent Control Loop Integration

```typescript
// Integration with autonomous agent workflows
class AutonomousQEAgent {
  private constitution: Constitution;
  private memory: MemoryNamespace;

  async executeWithQualityLoop(task: Task): Promise<TaskResult> {
    let attempt = 0;
    const maxAttempts = 3;

    while (attempt < maxAttempts) {
      // Generate artifacts
      const artifacts = await this.generateArtifacts(task);

      // Evaluate against constitution
      const evaluation = await this.evaluate(artifacts);

      // Check if quality gate passed
      if (evaluation.verdict.status === 'pass') {
        // Store successful patterns
        await this.memory.store('aqe/patterns/successful', {
          task: task.description,
          approach: this.currentApproach,
          evaluation: evaluation
        });

        return {
          success: true,
          artifacts,
          evaluation
        };
      }

      // Parse feedback for self-correction
      const corrections = this.parseCorrections(evaluation);

      // Store failure for learning
      await this.memory.store('aqe/patterns/failures', {
        task: task.description,
        attempt,
        issues: evaluation.findings,
        corrections
      });

      // Apply corrections
      await this.applyCorrections(corrections);

      attempt++;
    }

    return {
      success: false,
      reason: 'Max attempts exceeded',
      lastEvaluation: evaluation
    };
  }

  private parseCorrections(evaluation: EvaluationResult): Correction[] {
    return evaluation.critique.actionItems.map(item => ({
      type: this.inferCorrectionType(item),
      target: item.location,
      specification: item.suggestedFix || item.description,
      priority: item.priority
    }));
  }
}
```

---

## 8. Implementation Actions

### 8.1 Action Sequence

```typescript
interface ActionPlan {
  phases: Phase[];
}

const implementationPlan: ActionPlan = {
  phases: [
    // Phase 1: Foundation (Week 1-2)
    {
      id: "foundation",
      name: "Constitution Foundation",
      duration: "2 weeks",
      actions: [
        {
          id: "A001",
          name: "Define Constitution JSON Schema",
          description: "Create JSON Schema for constitution validation",
          dependencies: [],
          deliverables: ["src/schemas/constitution.schema.json"],
          effort: "medium",
          skills: ["json-schema", "typescript"]
        },
        {
          id: "A002",
          name: "Create Base Constitutions",
          description: "Define default constitutions for code, tests, docs",
          dependencies: ["A001"],
          deliverables: [
            "constitutions/code-quality-v1.json",
            "constitutions/test-quality-v1.json",
            "constitutions/doc-quality-v1.json"
          ],
          effort: "large",
          skills: ["quality-engineering", "domain-expertise"]
        },
        {
          id: "A003",
          name: "Implement Constitution Loader",
          description: "Load, validate, and merge constitutions with overrides",
          dependencies: ["A001"],
          deliverables: ["src/constitution/loader.ts"],
          effort: "medium",
          skills: ["typescript", "json-schema"]
        },
        {
          id: "A004",
          name: "Create Clause Evaluator Framework",
          description: "Framework for evaluating different clause types",
          dependencies: ["A003"],
          deliverables: [
            "src/constitution/evaluators/ast-evaluator.ts",
            "src/constitution/evaluators/metric-evaluator.ts",
            "src/constitution/evaluators/pattern-evaluator.ts",
            "src/constitution/evaluators/semantic-evaluator.ts"
          ],
          effort: "large",
          skills: ["ast-parsing", "regex", "llm-integration"]
        }
      ]
    },

    // Phase 2: Voting System (Week 3-4)
    {
      id: "voting",
      name: "Multi-Agent Voting",
      duration: "2 weeks",
      actions: [
        {
          id: "A005",
          name: "Design Voting Protocol",
          description: "Define message formats and coordination protocol",
          dependencies: ["A004"],
          deliverables: ["src/voting/protocol.ts"],
          effort: "medium",
          skills: ["distributed-systems", "protocol-design"]
        },
        {
          id: "A006",
          name: "Implement Panel Assembly",
          description: "Agent selection and panel configuration",
          dependencies: ["A005"],
          deliverables: ["src/voting/panel-assembly.ts"],
          effort: "medium",
          skills: ["agent-coordination", "optimization"]
        },
        {
          id: "A007",
          name: "Implement Consensus Algorithms",
          description: "Majority, weighted, and Bayesian consensus",
          dependencies: ["A005"],
          deliverables: ["src/voting/consensus.ts"],
          effort: "large",
          skills: ["algorithms", "statistics"]
        },
        {
          id: "A008",
          name: "Create Voting Orchestrator",
          description: "Coordinate parallel agent voting",
          dependencies: ["A006", "A007"],
          deliverables: ["src/voting/orchestrator.ts"],
          effort: "medium",
          skills: ["async-programming", "orchestration"]
        }
      ]
    },

    // Phase 3: Output Generation (Week 5)
    {
      id: "output",
      name: "Output Generation",
      duration: "1 week",
      actions: [
        {
          id: "A009",
          name: "Implement Result Aggregator",
          description: "Combine votes into final evaluation result",
          dependencies: ["A007"],
          deliverables: ["src/output/aggregator.ts"],
          effort: "medium",
          skills: ["data-transformation"]
        },
        {
          id: "A010",
          name: "Create Human-Readable Reporter",
          description: "Generate markdown critique reports",
          dependencies: ["A009"],
          deliverables: ["src/output/human-reporter.ts"],
          effort: "medium",
          skills: ["technical-writing", "markdown"]
        },
        {
          id: "A011",
          name: "Create Structured JSON Reporter",
          description: "Generate JSON for automation consumers",
          dependencies: ["A009"],
          deliverables: ["src/output/json-reporter.ts"],
          effort: "small",
          skills: ["json", "schema-design"]
        },
        {
          id: "A012",
          name: "Create Agent Control Loop Reporter",
          description: "Generate feedback for autonomous agents",
          dependencies: ["A009"],
          deliverables: ["src/output/agent-reporter.ts"],
          effort: "medium",
          skills: ["agent-systems", "feedback-loops"]
        }
      ]
    },

    // Phase 4: Integration (Week 6-7)
    {
      id: "integration",
      name: "Integration Points",
      duration: "2 weeks",
      actions: [
        {
          id: "A013",
          name: "CI/CD Integration",
          description: "GitHub Actions, GitLab CI, Jenkins integration",
          dependencies: ["A011"],
          deliverables: [
            "src/integrations/github-actions.ts",
            ".github/workflows/constitution-gate.yml"
          ],
          effort: "medium",
          skills: ["ci-cd", "yaml"]
        },
        {
          id: "A014",
          name: "CLI Commands",
          description: "aqe constitution commands",
          dependencies: ["A008", "A010", "A011"],
          deliverables: ["src/cli/commands/constitution.ts"],
          effort: "medium",
          skills: ["cli-design", "oclif"]
        },
        {
          id: "A015",
          name: "Memory Integration",
          description: "Store evaluations in aqe/* namespace",
          dependencies: ["A009"],
          deliverables: ["src/memory/constitution-memory.ts"],
          effort: "small",
          skills: ["memory-systems"]
        },
        {
          id: "A016",
          name: "MCP Tool Registration",
          description: "Register constitution tools with MCP",
          dependencies: ["A014"],
          deliverables: ["src/mcp/constitution-tools.ts"],
          effort: "medium",
          skills: ["mcp", "tool-registration"]
        }
      ]
    },

    // Phase 5: Quality & Calibration (Week 8)
    {
      id: "calibration",
      name: "Quality & Calibration",
      duration: "1 week",
      actions: [
        {
          id: "A017",
          name: "Create Calibration Test Suite",
          description: "Examples with known verdicts for calibration",
          dependencies: ["A008"],
          deliverables: ["tests/calibration/*.ts"],
          effort: "medium",
          skills: ["testing", "quality-engineering"]
        },
        {
          id: "A018",
          name: "Implement Agreement Metrics",
          description: "Track inter-agent agreement rates",
          dependencies: ["A007"],
          deliverables: ["src/metrics/agreement.ts"],
          effort: "small",
          skills: ["statistics"]
        },
        {
          id: "A019",
          name: "Create Appeal Process",
          description: "Allow developers to challenge verdicts",
          dependencies: ["A009", "A015"],
          deliverables: ["src/appeal/process.ts"],
          effort: "medium",
          skills: ["workflow-design"]
        },
        {
          id: "A020",
          name: "Documentation",
          description: "User guide and constitution authoring guide",
          dependencies: ["A014"],
          deliverables: [
            "docs/guides/CONSTITUTION-AUTHORING.md",
            "docs/guides/CONSTITUTION-EVALUATION.md"
          ],
          effort: "medium",
          skills: ["technical-writing"]
        }
      ]
    }
  ]
};
```

### 8.2 Dependency Graph

```
A001 (Schema)
  |
  +---> A002 (Base Constitutions)
  |
  +---> A003 (Loader)
          |
          +---> A004 (Evaluators)
                  |
                  +---> A005 (Protocol)
                          |
                          +---> A006 (Panel) ---> A008 (Orchestrator)
                          |                            |
                          +---> A007 (Consensus) ------+
                                  |                    |
                                  +---> A009 (Aggregator)
                                          |
                                          +---> A010 (Human Reporter)
                                          +---> A011 (JSON Reporter) ---> A013 (CI/CD)
                                          +---> A012 (Agent Reporter)
                                          +---> A015 (Memory)
                                                  |
                                                  +---> A019 (Appeal)

A008 + A010 + A011 ---> A014 (CLI) ---> A016 (MCP)
                                            |
                                            +---> A020 (Docs)

A007 ---> A018 (Metrics)
A008 ---> A017 (Calibration)
```

---

## 9. Milestones

### 9.1 Milestone Definitions

| Milestone | Week | Deliverables | Success Criteria |
|-----------|------|--------------|------------------|
| **M1: Foundation** | 2 | Constitution schema, base constitutions, loader, evaluators | Can parse and validate constitutions; can evaluate single clause |
| **M2: Voting** | 4 | Voting protocol, panel assembly, consensus algorithms, orchestrator | 3+ agents can vote on artifact; consensus calculated correctly |
| **M3: Output** | 5 | All reporters (human, JSON, agent) | All output formats generate valid content |
| **M4: Integration** | 7 | CI/CD, CLI, MCP integration | Can run evaluation from CLI and CI pipeline |
| **M5: Production Ready** | 8 | Calibration, metrics, appeal, documentation | Agreement rate >= 85%; all docs complete |

### 9.2 Milestone Verification

```typescript
interface MilestoneVerification {
  milestone: string;
  checks: Check[];
}

const milestoneChecks: MilestoneVerification[] = [
  {
    milestone: "M1",
    checks: [
      {
        name: "Schema validation works",
        command: "npm run test:schema",
        expectedResult: "All schema tests pass"
      },
      {
        name: "Base constitutions load",
        command: "aqe constitution validate constitutions/",
        expectedResult: "3 constitutions validated successfully"
      },
      {
        name: "Single clause evaluation works",
        command: "aqe constitution evaluate --clause C001 examples/test-file.ts",
        expectedResult: "Clause verdict returned"
      }
    ]
  },
  {
    milestone: "M2",
    checks: [
      {
        name: "Panel assembly works",
        command: "aqe constitution panel --min-agents 3",
        expectedResult: "Panel with 3+ agents assembled"
      },
      {
        name: "Voting orchestration works",
        command: "aqe constitution evaluate examples/test-file.ts --output json",
        expectedResult: "JSON with multiple agent votes"
      },
      {
        name: "Consensus calculation correct",
        command: "npm run test:consensus",
        expectedResult: "All consensus tests pass"
      }
    ]
  },
  {
    milestone: "M3",
    checks: [
      {
        name: "Human report generates",
        command: "aqe constitution evaluate examples/test-file.ts --format human",
        expectedResult: "Markdown report with all sections"
      },
      {
        name: "JSON output validates",
        command: "aqe constitution evaluate examples/test-file.ts --format json | npx ajv validate -s schemas/result.json",
        expectedResult: "Valid JSON against schema"
      },
      {
        name: "Agent output includes actions",
        command: "aqe constitution evaluate examples/test-file.ts --format agent",
        expectedResult: "Output includes requiredActions and nextSteps"
      }
    ]
  },
  {
    milestone: "M4",
    checks: [
      {
        name: "GitHub Action works",
        command: "act pull_request -W .github/workflows/constitution-gate.yml",
        expectedResult: "Workflow completes successfully"
      },
      {
        name: "CLI commands all work",
        command: "aqe constitution --help",
        expectedResult: "All subcommands listed"
      },
      {
        name: "MCP tools registered",
        command: "aqe mcp list | grep constitution",
        expectedResult: "constitution_evaluate, constitution_panel tools listed"
      }
    ]
  },
  {
    milestone: "M5",
    checks: [
      {
        name: "Calibration tests pass",
        command: "npm run test:calibration",
        expectedResult: "All calibration verdicts match expected"
      },
      {
        name: "Agreement rate acceptable",
        command: "aqe constitution metrics --metric agreement",
        expectedResult: "Agreement rate >= 85%"
      },
      {
        name: "Documentation complete",
        command: "ls docs/guides/CONSTITUTION-*.md | wc -l",
        expectedResult: "2 or more guides"
      }
    ]
  }
];
```

---

## 10. Success Metrics

### 10.1 Quantitative Metrics

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| **Inter-Agent Agreement** | >= 85% | Average agreement rate across all clause verdicts |
| **Evaluation Latency (File)** | < 5s | P95 latency for single file evaluation |
| **Evaluation Latency (PR)** | < 60s | P95 latency for full PR evaluation |
| **False Positive Rate** | < 5% | Verdicts appealed and overturned |
| **False Negative Rate** | < 2% | Issues missed that caused production incidents |
| **Constitution Coverage** | 100% | % of artifact types with constitutions |
| **CI/CD Adoption** | 80% | % of repos with constitution gates enabled |
| **Developer Satisfaction** | >= 4/5 | Survey score on feedback quality |

### 10.2 Qualitative Metrics

| Metric | Evaluation Method |
|--------|-------------------|
| **Explainability** | Can developers understand why code failed? Survey + support ticket analysis |
| **Actionability** | Can developers fix issues from the report alone? Time-to-fix analysis |
| **Customizability** | Can teams create project-specific constitutions? Usage analytics |
| **Trust** | Do developers trust the verdicts? Appeal rate + override frequency |

### 10.3 Monitoring Dashboard

```typescript
interface MonitoringDashboard {
  realtime: {
    evaluationsInProgress: number;
    averageLatency: number;
    agentUtilization: Record<string, number>;
  };

  daily: {
    evaluationsCompleted: number;
    passRate: number;
    failRate: number;
    warnRate: number;
    averageScore: number;
    topFailingClauses: { clauseId: string; failCount: number }[];
    agreementRate: number;
    appealsSubmitted: number;
    appealsOverturned: number;
  };

  trends: {
    scoreOverTime: TimeSeries;
    agreementOverTime: TimeSeries;
    latencyOverTime: TimeSeries;
    adoptionOverTime: TimeSeries;
  };

  alerts: {
    lowAgreement: boolean;      // < 80% agreement
    highLatency: boolean;       // > 10s average
    highAppealRate: boolean;    // > 10% appeals
    clauseDrift: boolean;       // Sudden change in clause failure rate
  };
}
```

---

## 11. Risk Mitigation

### 11.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Agent disagreement too high | Medium | High | Calibration test suite; adjust clause specificity; tune voting weights |
| Evaluation too slow | Medium | Medium | Parallel evaluation; caching; optimize AST parsing |
| Semantic checks unreliable | High | Medium | Use ensemble approach; fallback to deterministic checks |
| Constitution drift over time | Medium | Medium | Version constitutions; track metrics; regular reviews |

### 11.2 Organizational Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Teams reject automated judgments | High | High | Start with advisory mode; demonstrate value; allow overrides |
| Constitutions too strict/lenient | Medium | Medium | Progressive thresholds; team-specific tuning |
| Lack of quality criteria expertise | Medium | Medium | Provide templates; document best practices; consultative support |

---

## 12. Future Extensions

### 12.1 Planned Extensions

1. **Constitution Marketplace**: Share constitutions across organizations
2. **Learning from Appeals**: Automatically adjust constitutions based on overturned verdicts
3. **Cross-Repository Analysis**: Compare quality across repos
4. **Natural Language Constitutions**: Allow criteria definition in plain English
5. **Visual Constitution Editor**: GUI for creating and editing constitutions

### 12.2 Research Directions

1. **Optimal Panel Size**: What's the ideal number of agents for accuracy vs. cost?
2. **Calibration Without Labels**: Self-supervised calibration techniques
3. **Constitutional Hierarchy**: Inheritance and composition of constitutions
4. **Adaptive Thresholds**: Dynamic threshold adjustment based on project maturity

---

## 13. Appendix

### 13.1 CLI Command Reference

```bash
# Constitution Management
aqe constitution init                    # Initialize constitution for project
aqe constitution validate [path]         # Validate constitution files
aqe constitution list                    # List loaded constitutions
aqe constitution show <id>               # Show constitution details

# Evaluation
aqe constitution evaluate <files>        # Evaluate files against constitution
  --constitution <id>                    # Use specific constitution
  --output <format>                      # human | json | agent | github-actions
  --min-agents <n>                       # Minimum agents on panel
  --specializations <list>               # Required agent specializations
  --fail-fast                            # Stop on first critical failure

# Panel Management
aqe constitution panel                   # Show current panel configuration
  --artifact-type <type>                 # code | test | doc
  --min-agents <n>                       # Minimum agents
  --max-agents <n>                       # Maximum agents
  --specializations <list>               # Required specializations

# Calibration
aqe constitution calibrate               # Run calibration tests
aqe constitution metrics                 # Show agreement and performance metrics

# Appeal
aqe constitution appeal <evaluation-id>  # Start appeal process
aqe constitution appeal-status <id>      # Check appeal status
```

### 13.2 Memory Namespace Structure

```
aqe/
  constitution/
    schemas/                    # Constitution schemas
    active/                     # Currently loaded constitutions
    evaluations/                # Evaluation results
      {timestamp}/
        result.json
        votes/
          {agent-id}.json
    calibration/                # Calibration test results
    metrics/                    # Agreement and performance metrics
    appeals/                    # Appeal records
      {appeal-id}/
        original.json
        review.json
        verdict.json
```

### 13.3 Related Specifications

- [Quality Gates Guide](/workspaces/agentic-qe-cf/docs/guides/QUALITY-GATES.md)
- [Agent Specifications](/workspaces/agentic-qe-cf/docs/architecture/qe-agent-specifications.md)
- [Agent Reference](/workspaces/agentic-qe-cf/docs/reference/agents.md)
- [MCP Integration Guide](/workspaces/agentic-qe-cf/docs/guides/MCP-INTEGRATION.md)

---

## 14. Approval and Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Technical Lead | | | |
| QE Lead | | | |
| Product Owner | | | |

---

**Document Control**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-11-19 | AQE Fleet | Initial specification |

---

*This specification defines the Goal-Oriented Action Plan for implementing a Constitution-Based Quality Evaluation System. It provides the roadmap for building a multi-agent quality judging system with transparent, explainable verdicts that support both human developers and autonomous agent control loops.*

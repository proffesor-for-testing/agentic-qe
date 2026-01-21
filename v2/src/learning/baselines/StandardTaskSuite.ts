/**
 * StandardTaskSuite - Standard tasks for baseline measurement
 *
 * Defines representative tasks for each of the 20 QE agents to ensure
 * consistent and reproducible baseline measurements.
 *
 * Each agent type has 10 standard tasks covering typical workloads.
 *
 * @version 1.0.0
 * @module src/learning/baselines/StandardTaskSuite
 */

import { QEAgentType } from '../../types';
import { seededRandom } from '../../utils/SeededRandom';

/**
 * Standard task definition
 */
export interface StandardTask {
  id: string;
  agentType: QEAgentType;
  taskType: string;
  name: string;
  description: string;
  complexity: 'low' | 'medium' | 'high';
  expectedDuration: number; // milliseconds
  input: Record<string, any>;
  expectedOutput?: Record<string, any>;
}

/**
 * Task complexity to expected duration mapping
 */
const COMPLEXITY_DURATION = {
  low: 1000,     // 1 second
  medium: 3000,  // 3 seconds
  high: 5000,    // 5 seconds
};

/**
 * StandardTaskSuite provides standard tasks for baseline measurement
 */
export class StandardTaskSuite {
  private tasks: Map<QEAgentType, StandardTask[]>;

  constructor() {
    this.tasks = new Map();
    this.initializeTasks();
  }

  /**
   * Initialize standard tasks for all agent types
   */
  private initializeTasks(): void {
    // Test Generator
    this.addTasks(QEAgentType.TEST_GENERATOR, this.createTestGeneratorTasks());
    this.initializeOtherAgents();
  }

  /**
   * Create tasks for Test Generator
   */
  private createTestGeneratorTasks(): StandardTask[] {
    const agentType = QEAgentType.TEST_GENERATOR;
    return [
      this.createTaskDirect(agentType, 'unit-test-generation', 'Generate Unit Tests', 'medium', {
        sourceFile: 'UserService.ts',
        coverage: 80,
      }),
      this.createTaskDirect(agentType, 'integration-test-generation', 'Generate Integration Tests', 'high', {
        module: 'AuthModule',
        endpoints: 3,
      }),
      this.createTaskDirect(agentType, 'e2e-test-generation', 'Generate E2E Tests', 'high', {
        userFlow: 'checkout',
        steps: 5,
      }),
      this.createTaskDirect(agentType, 'snapshot-test-generation', 'Generate Snapshot Tests', 'low', {
        component: 'Button',
      }),
      this.createTaskDirect(agentType, 'api-test-generation', 'Generate API Tests', 'medium', {
        endpoint: '/api/users',
        methods: ['GET', 'POST'],
      }),
      this.createTaskDirect(agentType, 'regression-test-generation', 'Generate Regression Tests', 'medium', {
        issueId: 'ISSUE-123',
        area: 'authentication',
      }),
      this.createTaskDirect(agentType, 'edge-case-test-generation', 'Generate Edge Case Tests', 'high', {
        functionName: 'calculateDiscount',
        scenarios: 8,
      }),
      this.createTaskDirect(agentType, 'property-based-test-generation', 'Generate Property Tests', 'high', {
        property: 'associativity',
        functionName: 'merge',
      }),
      this.createTaskDirect(agentType, 'mutation-test-generation', 'Generate Mutation Tests', 'medium', {
        sourceFile: 'Calculator.ts',
        mutations: 10,
      }),
      this.createTaskDirect(agentType, 'contract-test-generation', 'Generate Contract Tests', 'medium', {
        service: 'PaymentService',
        contract: 'payment-api-v1',
      }),
    ];
  }

  /**
   * Initialize other agent types
   */
  private initializeOtherAgents(): void {
    // Coverage Analyzer
    this.addTasks(QEAgentType.COVERAGE_ANALYZER, [
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'line-coverage-analysis', 'Analyze Line Coverage', 'low', {
        testSuite: 'unit-tests',
      }),
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'branch-coverage-analysis', 'Analyze Branch Coverage', 'medium', {
        testSuite: 'integration-tests',
      }),
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'function-coverage-analysis', 'Analyze Function Coverage', 'low', {
        module: 'UserModule',
      }),
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'statement-coverage-analysis', 'Analyze Statement Coverage', 'medium', {
        file: 'PaymentProcessor.ts',
      }),
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'coverage-gap-identification', 'Identify Coverage Gaps', 'high', {
        threshold: 80,
        critical: true,
      }),
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'coverage-trend-analysis', 'Analyze Coverage Trends', 'medium', {
        period: '7d',
      }),
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'file-coverage-ranking', 'Rank Files by Coverage', 'low', {
        sortBy: 'coverage',
      }),
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'untested-code-detection', 'Detect Untested Code', 'medium', {
        severity: 'high',
      }),
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'coverage-report-generation', 'Generate Coverage Report', 'low', {
        format: 'html',
      }),
      this.createTaskDirect(QEAgentType.COVERAGE_ANALYZER, 'differential-coverage-analysis', 'Analyze Differential Coverage', 'high', {
        baseBranch: 'main',
        headBranch: 'feature',
      }),
    ]);

    // Quality Gate
    this.addTasks(QEAgentType.QUALITY_GATE, [
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'quality-gate-evaluation', 'Evaluate Quality Gate', 'medium', {
        metrics: ['coverage', 'bugs', 'vulnerabilities'],
      }),
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'coverage-gate-check', 'Check Coverage Gate', 'low', {
        threshold: 80,
        type: 'line',
      }),
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'bug-density-check', 'Check Bug Density', 'medium', {
        threshold: 5,
        severity: 'high',
      }),
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'code-smell-gate', 'Check Code Smells', 'medium', {
        maxSmells: 10,
      }),
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'security-gate-check', 'Check Security Gate', 'high', {
        maxVulnerabilities: 0,
        severity: 'critical',
      }),
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'performance-gate-check', 'Check Performance Gate', 'medium', {
        maxResponseTime: 200,
      }),
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'complexity-gate-check', 'Check Complexity Gate', 'low', {
        maxComplexity: 10,
      }),
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'duplication-gate-check', 'Check Duplication Gate', 'low', {
        maxDuplication: 3,
      }),
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'maintainability-gate-check', 'Check Maintainability Gate', 'medium', {
        minMaintainability: 'A',
      }),
      this.createTaskDirect(QEAgentType.QUALITY_GATE, 'custom-gate-evaluation', 'Evaluate Custom Gate', 'high', {
        rules: ['custom-rule-1', 'custom-rule-2'],
      }),
    ]);

    // Performance Tester
    this.addTasks(QEAgentType.PERFORMANCE_TESTER, [
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'load-test', 'Execute Load Test', 'high', {
        users: 100,
        duration: '5m',
      }),
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'stress-test', 'Execute Stress Test', 'high', {
        rampUp: 200,
        duration: '10m',
      }),
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'spike-test', 'Execute Spike Test', 'high', {
        baseline: 50,
        spike: 500,
      }),
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'endurance-test', 'Execute Endurance Test', 'high', {
        users: 50,
        duration: '30m',
      }),
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'scalability-test', 'Execute Scalability Test', 'high', {
        minUsers: 10,
        maxUsers: 1000,
      }),
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'response-time-test', 'Test Response Time', 'medium', {
        endpoint: '/api/search',
        target: 200,
      }),
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'throughput-test', 'Test Throughput', 'medium', {
        target: 1000,
        metric: 'rps',
      }),
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'concurrency-test', 'Test Concurrency', 'high', {
        concurrent: 100,
      }),
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'resource-utilization-test', 'Test Resource Utilization', 'medium', {
        metrics: ['cpu', 'memory', 'disk'],
      }),
      this.createTaskDirect(QEAgentType.PERFORMANCE_TESTER, 'performance-baseline-test', 'Establish Performance Baseline', 'medium', {
        scenarios: 5,
      }),
    ]);

    // Security Scanner
    this.addTasks(QEAgentType.SECURITY_SCANNER, [
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'vulnerability-scan', 'Scan for Vulnerabilities', 'high', {
        target: 'web-app',
        depth: 'full',
      }),
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'dependency-audit', 'Audit Dependencies', 'medium', {
        manifest: 'package.json',
        severity: 'high',
      }),
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'sql-injection-test', 'Test SQL Injection', 'medium', {
        endpoints: ['/api/search', '/api/login'],
      }),
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'xss-vulnerability-test', 'Test XSS Vulnerabilities', 'medium', {
        forms: ['search', 'comment'],
      }),
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'authentication-audit', 'Audit Authentication', 'high', {
        flows: ['login', 'oauth', 'jwt'],
      }),
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'authorization-test', 'Test Authorization', 'high', {
        roles: ['user', 'admin', 'guest'],
      }),
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'secrets-detection', 'Detect Exposed Secrets', 'medium', {
        scope: 'repository',
      }),
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'api-security-scan', 'Scan API Security', 'high', {
        endpoints: 10,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
      }),
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'container-security-scan', 'Scan Container Security', 'high', {
        image: 'app:latest',
      }),
      this.createTaskDirect(QEAgentType.SECURITY_SCANNER, 'compliance-check', 'Check Compliance', 'high', {
        standards: ['OWASP', 'PCI-DSS'],
      }),
    ]);

    // Chaos Engineer
    this.addTasks(QEAgentType.CHAOS_ENGINEER, [
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'network-latency-injection', 'Inject Network Latency', 'medium', {
        delay: 1000,
        target: 'api-service',
      }),
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'service-failure-injection', 'Inject Service Failure', 'high', {
        service: 'database',
        duration: '30s',
      }),
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'cpu-stress-injection', 'Inject CPU Stress', 'high', {
        percentage: 90,
        duration: '1m',
      }),
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'memory-pressure-injection', 'Inject Memory Pressure', 'high', {
        percentage: 85,
        duration: '1m',
      }),
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'disk-fill-injection', 'Inject Disk Fill', 'high', {
        percentage: 95,
        duration: '30s',
      }),
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'packet-loss-injection', 'Inject Packet Loss', 'medium', {
        percentage: 10,
        target: 'api-gateway',
      }),
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'pod-kill-injection', 'Inject Pod Kill', 'high', {
        namespace: 'production',
        target: 'web-app',
      }),
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'dns-failure-injection', 'Inject DNS Failure', 'medium', {
        target: 'external-api',
        duration: '30s',
      }),
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'clock-skew-injection', 'Inject Clock Skew', 'medium', {
        offset: '5m',
        target: 'auth-service',
      }),
      this.createTaskDirect(QEAgentType.CHAOS_ENGINEER, 'cascading-failure-simulation', 'Simulate Cascading Failure', 'high', {
        startService: 'cache',
        propagation: true,
      }),
    ]);

    // Visual Tester
    this.addTasks(QEAgentType.VISUAL_TESTER, [
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'screenshot-comparison', 'Compare Screenshots', 'medium', {
        baseline: 'baseline.png',
        current: 'current.png',
      }),
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'responsive-layout-test', 'Test Responsive Layout', 'high', {
        breakpoints: [320, 768, 1024, 1920],
      }),
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'cross-browser-visual-test', 'Test Cross-Browser Visual', 'high', {
        browsers: ['chrome', 'firefox', 'safari'],
      }),
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'component-visual-regression', 'Test Component Visual Regression', 'medium', {
        component: 'Button',
        states: ['default', 'hover', 'active'],
      }),
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'page-visual-regression', 'Test Page Visual Regression', 'high', {
        page: '/dashboard',
        scenarios: 5,
      }),
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'color-contrast-check', 'Check Color Contrast', 'low', {
        standard: 'WCAG-AA',
      }),
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'font-rendering-test', 'Test Font Rendering', 'medium', {
        fonts: ['Roboto', 'Open Sans'],
      }),
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'animation-test', 'Test Animations', 'medium', {
        animations: ['fade', 'slide', 'zoom'],
      }),
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'image-optimization-check', 'Check Image Optimization', 'low', {
        format: 'webp',
        quality: 80,
      }),
      this.createTaskDirect(QEAgentType.VISUAL_TESTER, 'dark-mode-visual-test', 'Test Dark Mode Visual', 'medium', {
        pages: ['/home', '/dashboard'],
      }),
    ]);

    // Flaky Test Hunter
    this.addTasks(QEAgentType.FLAKY_TEST_HUNTER, [
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'flaky-test-detection', 'Detect Flaky Tests', 'high', {
        runs: 50,
        threshold: 0.95,
      }),
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'test-stability-analysis', 'Analyze Test Stability', 'medium', {
        period: '7d',
        testSuite: 'integration',
      }),
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'timing-issue-detection', 'Detect Timing Issues', 'high', {
        testFile: 'auth.test.ts',
      }),
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'race-condition-detection', 'Detect Race Conditions', 'high', {
        concurrentTests: true,
      }),
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'environmental-flake-detection', 'Detect Environmental Flakes', 'high', {
        environments: ['dev', 'staging', 'prod'],
      }),
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'dependency-flake-detection', 'Detect Dependency Flakes', 'medium', {
        externalServices: ['api', 'database'],
      }),
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'test-isolation-check', 'Check Test Isolation', 'medium', {
        testSuite: 'unit-tests',
      }),
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'flake-pattern-analysis', 'Analyze Flake Patterns', 'high', {
        period: '30d',
      }),
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'flake-fix-recommendation', 'Recommend Flake Fixes', 'high', {
        testId: 'TEST-123',
      }),
      this.createTaskDirect(QEAgentType.FLAKY_TEST_HUNTER, 'flake-impact-assessment', 'Assess Flake Impact', 'medium', {
        metric: 'build-time',
      }),
    ]);

    // API Contract Validator
    this.addTasks(QEAgentType.API_CONTRACT_VALIDATOR, [
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'contract-schema-validation', 'Validate Contract Schema', 'medium', {
        contract: 'openapi-3.0.json',
      }),
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'request-validation', 'Validate API Requests', 'medium', {
        endpoint: '/api/users',
        method: 'POST',
      }),
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'response-validation', 'Validate API Responses', 'medium', {
        endpoint: '/api/products',
        expectedStatus: 200,
      }),
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'contract-compatibility-check', 'Check Contract Compatibility', 'high', {
        oldVersion: 'v1',
        newVersion: 'v2',
      }),
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'breaking-change-detection', 'Detect Breaking Changes', 'high', {
        baseline: 'v1.0.0',
        current: 'v1.1.0',
      }),
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'contract-versioning-validation', 'Validate Contract Versioning', 'medium', {
        versions: ['v1', 'v2', 'v3'],
      }),
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'consumer-contract-test', 'Test Consumer Contract', 'high', {
        consumer: 'mobile-app',
        provider: 'api-service',
      }),
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'provider-contract-test', 'Test Provider Contract', 'high', {
        provider: 'payment-service',
        consumers: 3,
      }),
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'contract-mock-generation', 'Generate Contract Mocks', 'medium', {
        contract: 'payment-api.yaml',
      }),
      this.createTaskDirect(QEAgentType.API_CONTRACT_VALIDATOR, 'contract-documentation-validation', 'Validate Contract Documentation', 'low', {
        contract: 'api-spec.json',
      }),
    ]);

    // Deployment Readiness
    this.addTasks(QEAgentType.DEPLOYMENT_READINESS, [
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'pre-deployment-checks', 'Execute Pre-Deployment Checks', 'high', {
        environment: 'production',
        checks: ['tests', 'security', 'performance'],
      }),
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'smoke-test-execution', 'Execute Smoke Tests', 'medium', {
        endpoints: ['/health', '/api/ping'],
      }),
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'configuration-validation', 'Validate Configuration', 'medium', {
        environment: 'staging',
      }),
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'dependency-readiness-check', 'Check Dependency Readiness', 'high', {
        services: ['database', 'cache', 'queue'],
      }),
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'rollback-readiness-check', 'Check Rollback Readiness', 'high', {
        version: 'v1.2.3',
      }),
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'capacity-planning-check', 'Check Capacity Planning', 'medium', {
        expectedLoad: 1000,
      }),
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'monitoring-validation', 'Validate Monitoring', 'medium', {
        metrics: ['cpu', 'memory', 'errors'],
      }),
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'database-migration-validation', 'Validate Database Migration', 'high', {
        migration: '20231201_add_users_table',
      }),
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'feature-flag-validation', 'Validate Feature Flags', 'medium', {
        flags: ['new-ui', 'beta-feature'],
      }),
      this.createTaskDirect(QEAgentType.DEPLOYMENT_READINESS, 'deployment-risk-assessment', 'Assess Deployment Risk', 'high', {
        changeSize: 'large',
        criticalChanges: true,
      }),
    ]);

    // Requirements Validator
    this.addTasks(QEAgentType.REQUIREMENTS_VALIDATOR, [
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'requirement-completeness-check', 'Check Requirement Completeness', 'medium', {
        document: 'requirements.md',
      }),
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'requirement-traceability', 'Trace Requirements', 'high', {
        requirement: 'REQ-001',
        toTests: true,
      }),
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'acceptance-criteria-validation', 'Validate Acceptance Criteria', 'medium', {
        story: 'USER-123',
      }),
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'requirement-ambiguity-detection', 'Detect Requirement Ambiguity', 'high', {
        document: 'spec.md',
      }),
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'requirement-conflict-detection', 'Detect Requirement Conflicts', 'high', {
        requirements: ['REQ-001', 'REQ-002'],
      }),
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'requirement-coverage-analysis', 'Analyze Requirement Coverage', 'high', {
        requirements: 50,
        tests: 100,
      }),
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'requirement-priority-validation', 'Validate Requirement Priority', 'low', {
        priorities: ['P0', 'P1', 'P2'],
      }),
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'requirement-feasibility-check', 'Check Requirement Feasibility', 'high', {
        requirement: 'REQ-123',
        constraints: ['time', 'resources'],
      }),
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'requirement-change-impact-analysis', 'Analyze Requirement Change Impact', 'high', {
        oldRequirement: 'REQ-001-v1',
        newRequirement: 'REQ-001-v2',
      }),
      this.createTaskDirect(QEAgentType.REQUIREMENTS_VALIDATOR, 'requirement-documentation-quality', 'Check Documentation Quality', 'medium', {
        standards: ['IEEE-830'],
      }),
    ]);

    // Production Intelligence
    this.addTasks(QEAgentType.PRODUCTION_INTELLIGENCE, [
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'production-error-analysis', 'Analyze Production Errors', 'high', {
        period: '24h',
        severity: 'error',
      }),
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'performance-anomaly-detection', 'Detect Performance Anomalies', 'high', {
        metric: 'response-time',
        threshold: 'auto',
      }),
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'user-behavior-analysis', 'Analyze User Behavior', 'medium', {
        period: '7d',
        segments: ['new', 'active', 'churned'],
      }),
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'production-metric-correlation', 'Correlate Production Metrics', 'high', {
        metrics: ['errors', 'latency', 'cpu'],
      }),
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'incident-pattern-recognition', 'Recognize Incident Patterns', 'high', {
        incidents: 20,
        period: '30d',
      }),
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'capacity-trend-analysis', 'Analyze Capacity Trends', 'medium', {
        metric: 'requests-per-second',
        forecast: '7d',
      }),
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'availability-monitoring', 'Monitor Availability', 'medium', {
        sla: 99.9,
        period: '24h',
      }),
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'user-experience-scoring', 'Score User Experience', 'medium', {
        metrics: ['load-time', 'interactivity', 'stability'],
      }),
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'production-feedback-loop', 'Analyze Production Feedback', 'high', {
        sources: ['logs', 'metrics', 'traces'],
      }),
      this.createTaskDirect(QEAgentType.PRODUCTION_INTELLIGENCE, 'predictive-failure-analysis', 'Analyze Predictive Failures', 'high', {
        signals: ['error-rate', 'memory-leaks', 'slow-queries'],
      }),
    ]);

    // Quality Analyzer
    this.addTasks(QEAgentType.QUALITY_ANALYZER, [
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'code-quality-analysis', 'Analyze Code Quality', 'medium', {
        files: ['src/**/*.ts'],
      }),
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'test-quality-analysis', 'Analyze Test Quality', 'medium', {
        testSuite: 'integration',
      }),
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'maintainability-index-calculation', 'Calculate Maintainability Index', 'low', {
        module: 'UserModule',
      }),
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'technical-debt-assessment', 'Assess Technical Debt', 'high', {
        scope: 'codebase',
      }),
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'code-duplication-analysis', 'Analyze Code Duplication', 'medium', {
        threshold: 5,
      }),
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'complexity-analysis', 'Analyze Complexity', 'medium', {
        metric: 'cyclomatic',
      }),
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'architecture-quality-check', 'Check Architecture Quality', 'high', {
        patterns: ['layered', 'microservices'],
      }),
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'quality-trend-analysis', 'Analyze Quality Trends', 'medium', {
        period: '30d',
      }),
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'best-practices-validation', 'Validate Best Practices', 'high', {
        standards: ['clean-code', 'solid'],
      }),
      this.createTaskDirect(QEAgentType.QUALITY_ANALYZER, 'quality-gate-recommendation', 'Recommend Quality Gates', 'high', {
        project: 'web-app',
      }),
    ]);

    // Test Executor
    this.addTasks(QEAgentType.TEST_EXECUTOR, [
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'unit-test-execution', 'Execute Unit Tests', 'low', {
        testSuite: 'unit',
      }),
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'integration-test-execution', 'Execute Integration Tests', 'medium', {
        testSuite: 'integration',
      }),
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'e2e-test-execution', 'Execute E2E Tests', 'high', {
        testSuite: 'e2e',
      }),
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'parallel-test-execution', 'Execute Tests in Parallel', 'high', {
        workers: 4,
      }),
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'selective-test-execution', 'Execute Selective Tests', 'medium', {
        changedFiles: ['UserService.ts'],
      }),
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'test-retry-execution', 'Execute Test Retries', 'medium', {
        maxRetries: 3,
      }),
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'cross-environment-test-execution', 'Execute Cross-Environment Tests', 'high', {
        environments: ['dev', 'staging'],
      }),
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'smoke-test-execution', 'Execute Smoke Tests', 'low', {
        critical: true,
      }),
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'regression-test-execution', 'Execute Regression Tests', 'high', {
        baseline: 'v1.0.0',
      }),
      this.createTaskDirect(QEAgentType.TEST_EXECUTOR, 'test-result-aggregation', 'Aggregate Test Results', 'low', {
        sources: ['junit', 'jest', 'cypress'],
      }),
    ]);

    // Fleet Commander
    this.addTasks(QEAgentType.FLEET_COMMANDER, [
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'fleet-orchestration', 'Orchestrate Fleet', 'high', {
        agents: 19,
        tasks: 50,
      }),
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'agent-allocation', 'Allocate Agents', 'medium', {
        workload: 'high',
      }),
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'task-prioritization', 'Prioritize Tasks', 'medium', {
        tasks: 20,
      }),
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'resource-optimization', 'Optimize Resources', 'high', {
        utilization: 'target-80',
      }),
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'agent-health-monitoring', 'Monitor Agent Health', 'medium', {
        agents: 19,
      }),
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'workload-balancing', 'Balance Workload', 'high', {
        strategy: 'round-robin',
      }),
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'coordination-strategy-selection', 'Select Coordination Strategy', 'high', {
        topology: 'adaptive',
      }),
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'performance-optimization', 'Optimize Performance', 'high', {
        metric: 'throughput',
      }),
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'failure-recovery', 'Recover from Failures', 'high', {
        failedAgents: 2,
      }),
      this.createTaskDirect(QEAgentType.FLEET_COMMANDER, 'fleet-analytics', 'Analyze Fleet Analytics', 'medium', {
        period: '7d',
      }),
    ]);

    // QX Partner
    this.addTasks(QEAgentType.QX_PARTNER, [
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'quality-experience-analysis', 'Analyze Quality Experience', 'high', {
        dimensions: ['reliability', 'performance', 'usability'],
      }),
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'user-satisfaction-scoring', 'Score User Satisfaction', 'medium', {
        surveys: 100,
      }),
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'quality-journey-mapping', 'Map Quality Journey', 'high', {
        touchpoints: ['dev', 'test', 'prod'],
      }),
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'feedback-integration', 'Integrate Feedback', 'medium', {
        sources: ['users', 'stakeholders', 'metrics'],
      }),
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'quality-improvement-recommendations', 'Recommend Quality Improvements', 'high', {
        focus: 'user-experience',
      }),
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'quality-metric-correlation', 'Correlate Quality Metrics', 'high', {
        metrics: ['nps', 'coverage', 'bugs'],
      }),
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'stakeholder-communication', 'Communicate with Stakeholders', 'medium', {
        report: 'quality-summary',
      }),
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'quality-culture-assessment', 'Assess Quality Culture', 'high', {
        team: 'engineering',
      }),
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'continuous-improvement-tracking', 'Track Continuous Improvement', 'medium', {
        period: '30d',
      }),
      this.createTaskDirect(QEAgentType.QX_PARTNER, 'quality-risk-mitigation', 'Mitigate Quality Risks', 'high', {
        risks: ['regression', 'security', 'performance'],
      }),
    ]);

    // Regression Risk Analyzer (future)
    this.addTasks(QEAgentType.REGRESSION_RISK_ANALYZER, [
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'regression-risk-assessment', 'Assess Regression Risk', 'high', {
        changes: 10,
        criticalPaths: 3,
      }),
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'change-impact-analysis', 'Analyze Change Impact', 'high', {
        changedFiles: ['UserService.ts'],
      }),
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'test-selection-prioritization', 'Prioritize Test Selection', 'high', {
        risk: 'high',
      }),
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'historical-regression-analysis', 'Analyze Historical Regressions', 'medium', {
        period: '90d',
      }),
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'risk-heat-map-generation', 'Generate Risk Heat Map', 'medium', {
        modules: 10,
      }),
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'regression-prediction', 'Predict Regressions', 'high', {
        model: 'ml-based',
      }),
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'critical-path-identification', 'Identify Critical Paths', 'high', {
        flows: ['checkout', 'login'],
      }),
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'regression-cost-estimation', 'Estimate Regression Cost', 'medium', {
        scenario: 'worst-case',
      }),
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'mitigation-strategy-recommendation', 'Recommend Mitigation Strategies', 'high', {
        risk: 'critical',
      }),
      this.createTaskDirect(QEAgentType.REGRESSION_RISK_ANALYZER, 'regression-trend-analysis', 'Analyze Regression Trends', 'medium', {
        period: '6m',
      }),
    ]);

    // Test Data Architect (future)
    this.addTasks(QEAgentType.TEST_DATA_ARCHITECT, [
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'test-data-generation', 'Generate Test Data', 'medium', {
        schema: 'users',
        records: 1000,
      }),
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'data-anonymization', 'Anonymize Data', 'high', {
        dataset: 'production-users',
      }),
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'synthetic-data-creation', 'Create Synthetic Data', 'high', {
        model: 'user-behavior',
      }),
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'test-data-versioning', 'Version Test Data', 'medium', {
        dataset: 'baseline-v1',
      }),
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'data-subset-generation', 'Generate Data Subset', 'medium', {
        criteria: 'active-users',
        size: 100,
      }),
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'data-quality-validation', 'Validate Data Quality', 'medium', {
        dataset: 'test-users',
      }),
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'referential-integrity-check', 'Check Referential Integrity', 'high', {
        tables: ['users', 'orders'],
      }),
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'data-masking', 'Mask Sensitive Data', 'high', {
        fields: ['email', 'ssn'],
      }),
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'test-data-cleanup', 'Cleanup Test Data', 'low', {
        age: '30d',
      }),
      this.createTaskDirect(QEAgentType.TEST_DATA_ARCHITECT, 'data-seeding-strategy', 'Define Data Seeding Strategy', 'high', {
        environment: 'staging',
      }),
    ]);

    // Accessibility Ally
    this.addTasks(QEAgentType.ACCESSIBILITY_ALLY, [
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'wcag-compliance-scan', 'Scan WCAG Compliance', 'high', {
        level: 'AA',
        pages: ['/home', '/dashboard'],
      }),
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'screen-reader-validation', 'Validate Screen Reader', 'high', {
        reader: 'NVDA',
        pages: ['/checkout'],
      }),
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'color-contrast-analysis', 'Analyze Color Contrast', 'medium', {
        standard: 'WCAG-AAA',
      }),
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'keyboard-navigation-test', 'Test Keyboard Navigation', 'medium', {
        page: '/forms',
        tabStops: 20,
      }),
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'aria-labels-validation', 'Validate ARIA Labels', 'medium', {
        components: ['Button', 'Modal', 'Form'],
      }),
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'focus-management-test', 'Test Focus Management', 'high', {
        modals: true,
        dynamicContent: true,
      }),
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'alt-text-validation', 'Validate Alt Text', 'low', {
        images: 50,
      }),
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'heading-hierarchy-check', 'Check Heading Hierarchy', 'low', {
        pages: ['/docs', '/faq'],
      }),
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'form-accessibility-test', 'Test Form Accessibility', 'high', {
        forms: ['login', 'registration', 'checkout'],
      }),
      this.createTaskDirect(QEAgentType.ACCESSIBILITY_ALLY, 'remediation-code-generation', 'Generate Remediation Code', 'high', {
        issues: 10,
        framework: 'react',
      }),
    ]);
  }

  /**
   * Helper to create a standard task (for use with currentAgentType)
   */
  private createTask(
    taskType: string,
    name: string,
    complexity: 'low' | 'medium' | 'high',
    input: Record<string, any>
  ): StandardTask {
    const agentType = this.getCurrentAgentType();
    return this.createTaskDirect(agentType, taskType, name, complexity, input);
  }

  /**
   * Helper to create a standard task directly with agent type
   */
  private createTaskDirect(
    agentType: QEAgentType,
    taskType: string,
    name: string,
    complexity: 'low' | 'medium' | 'high',
    input: Record<string, any>
  ): StandardTask {
    return {
      id: `${agentType}-${taskType}-${Date.now()}-${seededRandom.randomInt(0, 9999)}`,
      agentType,
      taskType,
      name,
      description: `Standard task for ${taskType} benchmarking`,
      complexity,
      expectedDuration: COMPLEXITY_DURATION[complexity],
      input,
    };
  }

  /**
   * Track current agent type being initialized
   */
  private currentAgentType: QEAgentType | null = null;

  private getCurrentAgentType(): QEAgentType {
    if (!this.currentAgentType) {
      throw new Error('No agent type set');
    }
    return this.currentAgentType;
  }

  /**
   * Add tasks for an agent type
   */
  private addTasks(agentType: QEAgentType, tasks: StandardTask[]): void {
    this.tasks.set(agentType, tasks);
  }

  /**
   * Get all tasks for an agent type
   */
  getTasksForAgent(agentType: QEAgentType, taskType?: string): StandardTask[] {
    const tasks = this.tasks.get(agentType) || [];

    if (taskType) {
      return tasks.filter(t => t.taskType === taskType);
    }

    return tasks;
  }

  /**
   * Get all task types for an agent
   */
  getTaskTypesForAgent(agentType: QEAgentType): string[] {
    const tasks = this.tasks.get(agentType) || [];
    return [...new Set(tasks.map(t => t.taskType))];
  }

  /**
   * Get a specific task by ID
   */
  getTask(taskId: string): StandardTask | undefined {
    for (const tasks of this.tasks.values()) {
      const task = tasks.find(t => t.id === taskId);
      if (task) return task;
    }
    return undefined;
  }

  /**
   * Get all tasks across all agents
   */
  getAllTasks(): StandardTask[] {
    const allTasks: StandardTask[] = [];
    for (const tasks of this.tasks.values()) {
      allTasks.push(...tasks);
    }
    return allTasks;
  }

  /**
   * Get task count by agent type
   */
  getTaskCount(agentType: QEAgentType): number {
    return (this.tasks.get(agentType) || []).length;
  }

  /**
   * Get total task count
   */
  getTotalTaskCount(): number {
    let count = 0;
    for (const tasks of this.tasks.values()) {
      count += tasks.length;
    }
    return count;
  }
}

export default StandardTaskSuite;

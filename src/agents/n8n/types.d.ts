/**
 * N8n Agent Type Definitions
 *
 * Core types for n8n workflow testing agents
 */
export interface N8nAPIConfig {
    baseUrl: string;
    apiKey: string;
    timeout?: number;
    retries?: number;
    /** Session-based auth (fallback when API key doesn't work) */
    sessionAuth?: {
        email: string;
        password: string;
    };
}
export interface N8nWorkflow {
    id: string;
    name: string;
    active: boolean;
    nodes: N8nNode[];
    connections: N8nConnections;
    settings?: N8nWorkflowSettings;
    staticData?: Record<string, unknown>;
    tags?: N8nTag[];
    createdAt: string;
    updatedAt: string;
    versionId?: string;
}
export interface N8nNode {
    id: string;
    name: string;
    type: string;
    typeVersion?: number;
    position: [number, number];
    parameters: Record<string, unknown>;
    credentials?: Record<string, N8nCredentialRef>;
    disabled?: boolean;
    notes?: string;
    notesInFlow?: boolean;
}
export interface N8nCredentialRef {
    id: string;
    name: string;
}
export interface N8nConnections {
    [nodeName: string]: {
        main: Array<Array<{
            node: string;
            type: string;
            index: number;
        }>>;
    };
}
export interface N8nWorkflowSettings {
    executionOrder?: string;
    saveManualExecutions?: boolean;
    saveExecutionProgress?: boolean;
    saveDataErrorExecution?: 'none' | 'all';
    saveDataSuccessExecution?: 'none' | 'all' | 'lastSuccess';
    callerPolicy?: string;
    errorWorkflow?: string;
    timezone?: string;
    description?: string;
}
export interface N8nTag {
    id: string;
    name: string;
}
export interface N8nExecution {
    id: string;
    finished: boolean;
    mode: 'manual' | 'trigger' | 'webhook' | 'cli' | 'integrated';
    startedAt: string;
    stoppedAt?: string;
    workflowId: string;
    workflowData?: N8nWorkflow;
    data: N8nExecutionData;
    status: 'running' | 'success' | 'failed' | 'waiting' | 'crashed';
}
export interface N8nExecutionData {
    resultData: {
        runData: Record<string, N8nNodeRunData[]>;
        lastNodeExecuted?: string;
        error?: N8nExecutionError;
    };
    executionData?: {
        contextData: Record<string, unknown>;
        nodeExecutionStack: unknown[];
        waitingExecution: Record<string, unknown>;
        waitingExecutionSource: Record<string, unknown>;
    };
}
export interface N8nNodeRunData {
    startTime: number;
    executionTime: number;
    executionStatus: 'success' | 'error';
    data: {
        main: Array<Array<{
            json: unknown;
            binary?: unknown;
        }>>;
    };
    source: Array<{
        previousNode: string;
        previousNodeOutput?: number;
    }>;
    error?: N8nNodeError;
}
export interface N8nExecutionError {
    message: string;
    stack?: string;
    node?: string;
}
export interface N8nNodeError {
    message: string;
    description?: string;
    stack?: string;
}
export interface N8nCredential {
    id: string;
    name: string;
    type: string;
    createdAt: string;
    updatedAt: string;
}
export interface ValidationResult {
    valid: boolean;
    score: number;
    issues: ValidationIssue[];
    warnings: ValidationWarning[];
}
export interface ValidationIssue {
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    node?: string;
    field?: string;
    suggestion?: string;
}
export interface ValidationWarning {
    code: string;
    message: string;
    node?: string;
}
export interface SecurityFinding {
    id: string;
    type: SecurityFindingType;
    severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
    node: string;
    message: string;
    details: string;
    remediation: string;
    owaspCategory?: string;
    cwe?: string;
}
export type SecurityFindingType = 'hardcoded_secret' | 'sql_injection' | 'command_injection' | 'xss' | 'ssrf' | 'insecure_http' | 'unauthenticated_webhook' | 'weak_auth' | 'sensitive_data_exposure' | 'missing_validation' | 'secret_leakage' | 'pii_exposure' | 'secret_in_error';
export interface SecurityAuditResult {
    workflowId: string;
    workflowName: string;
    auditDate: string;
    riskScore: number;
    findings: SecurityFinding[];
    owaspCompliance: OWASPComplianceResult;
    summary: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
    };
}
export interface OWASPComplianceResult {
    score: number;
    categories: {
        [category: string]: {
            status: 'pass' | 'fail' | 'warn';
            findings: number;
        };
    };
}
export interface PerformanceBaseline {
    workflowId: string;
    metrics: {
        meanDuration: number;
        p95Duration: number;
        maxDuration: number;
        throughput: number;
    };
    createdAt: Date;
    version: string;
}
export interface NodePerformanceMetrics {
    nodeName: string;
    avgDuration: number;
    p95Duration: number;
    percentageOfTotal: number;
    isBottleneck: boolean;
}
export interface PerformanceTestResult {
    workflowId: string;
    testType: 'baseline' | 'load' | 'stress' | 'spike' | 'soak';
    startTime: string;
    endTime: string;
    duration: number;
    iterations: number;
    metrics: {
        avgDuration: number;
        p50Duration: number;
        p95Duration: number;
        p99Duration: number;
        minDuration: number;
        maxDuration: number;
        successRate: number;
        throughput: number;
    };
    nodeMetrics: Record<string, NodePerformanceMetrics>;
    bottlenecks: string[];
    recommendations: string[];
    passed: boolean;
    thresholdViolations: ThresholdViolation[];
}
export interface ThresholdViolation {
    metric: string;
    threshold: number;
    actual: number;
    severity: 'warning' | 'error';
}
export interface ExpressionValidationResult {
    valid: boolean;
    expressions: ExtractedExpression[];
    issues: ExpressionIssue[];
    runtimeResults?: RuntimeExpressionResult[];
}
export interface RuntimeExpressionResult {
    expression: string;
    node: string;
    field: string;
    success: boolean;
    evaluatedValue?: unknown;
    error?: string;
    executionTimeMs: number;
}
export interface ExtractedExpression {
    node: string;
    field: string;
    expression: string;
    type: 'simple' | 'function' | 'ternary' | 'code';
    referencedFields: string[];
}
export interface ExpressionIssue {
    node: string;
    field: string;
    expression: string;
    severity: 'error' | 'warning';
    message: string;
    suggestion?: string;
}
export interface TriggerTestResult {
    workflowId: string;
    triggers: TriggerInfo[];
    testResults: TriggerTestCase[];
    summary: {
        total: number;
        passed: number;
        failed: number;
    };
}
export interface TriggerInfo {
    nodeId: string;
    nodeName: string;
    type: string;
    configuration: Record<string, unknown>;
    authentication: string | null;
    isSecure: boolean;
}
export interface TriggerTestCase {
    triggerId: string;
    testName: string;
    input: unknown;
    expectedBehavior: string;
    actualResult: 'pass' | 'fail' | 'error';
    executionId?: string;
    errorMessage?: string;
    duration: number;
    metadata?: Record<string, unknown>;
}
export interface IntegrationTestResult {
    workflowId: string;
    integrations: IntegrationInfo[];
    testResults: IntegrationTestCase[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        skipped: number;
    };
}
export interface IntegrationInfo {
    nodeId: string;
    nodeName: string;
    nodeType: string;
    service: string;
    operation?: string;
    credentialType?: string;
    hasCredential: boolean;
}
export interface IntegrationTestCase {
    integrationId: string;
    testName: string;
    testType: 'connectivity' | 'authentication' | 'operation' | 'error_handling';
    result: 'pass' | 'fail' | 'skip' | 'error';
    errorMessage?: string;
    duration: number;
    details?: Record<string, unknown>;
}
export interface ComplianceResult {
    workflowId: string;
    frameworks: string[];
    piiDetected: PIIFinding[];
    findings: ComplianceFinding[];
    dataFlowAnalysis: DataFlowAnalysis;
    overallScore: number;
    compliant: boolean;
}
export interface PIIFinding {
    field: string;
    node: string;
    piiType: string;
    sensitivity: 'low' | 'medium' | 'high' | 'critical';
    encrypted: boolean;
    thirdPartyShared: boolean;
}
export interface ComplianceFinding {
    framework: string;
    requirement: string;
    status: 'compliant' | 'non_compliant' | 'partial' | 'not_applicable';
    severity: 'critical' | 'high' | 'medium' | 'low';
    details: string;
    remediation?: string;
}
export interface DataFlowAnalysis {
    sources: string[];
    sinks: string[];
    thirdParties: string[];
    dataRetention: {
        defined: boolean;
        period?: string;
        autoDelete: boolean;
    };
}
export interface VersionComparisonResult {
    workflowId: string;
    oldVersion: string;
    newVersion: string;
    changes: WorkflowChange[];
    breakingChanges: BreakingChange[];
    impactAnalysis: ImpactAnalysis;
    rollbackPlan?: RollbackPlan;
}
export interface WorkflowChange {
    type: 'added' | 'removed' | 'modified';
    category: 'node' | 'connection' | 'setting' | 'credential';
    name: string;
    details: string;
    oldValue?: unknown;
    newValue?: unknown;
}
export interface BreakingChange {
    change: WorkflowChange;
    reason: string;
    impact: string;
    mitigation?: string;
}
export interface ImpactAnalysis {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    affectedPaths: string[];
    testingRequired: boolean;
    rollbackRequired: boolean;
}
export interface RollbackPlan {
    steps: string[];
    estimatedTime: string;
    risks: string[];
}
export interface BDDScenario {
    feature: string;
    scenario: string;
    given: string[];
    when: string[];
    then: string[];
    tags: string[];
    examples?: Record<string, unknown>[];
}
export interface BDDTestResult {
    workflowId: string;
    scenarios: BDDScenarioResult[];
    summary: {
        total: number;
        passed: number;
        failed: number;
        pending: number;
    };
}
export interface BDDScenarioResult {
    scenario: BDDScenario;
    status: 'passed' | 'failed' | 'pending' | 'skipped';
    steps: BDDStepResult[];
    duration: number;
    errorMessage?: string;
}
export interface BDDStepResult {
    type: 'given' | 'when' | 'then';
    text: string;
    status: 'passed' | 'failed' | 'pending' | 'skipped';
    duration: number;
    errorMessage?: string;
}
export interface ChaosExperiment {
    id: string;
    name: string;
    hypothesis: string;
    steadyState: SteadyStateDefinition;
    fault: FaultInjection;
    duration: number;
    target: string;
    blastRadius: string[];
}
export interface SteadyStateDefinition {
    metrics: {
        successRate: number;
        avgDuration: number;
        errorRate: number;
    };
    tolerance: number;
}
export interface FaultInjection {
    type: 'http_error' | 'latency' | 'timeout' | 'connection_failure' | 'data_corruption';
    parameters: Record<string, unknown>;
}
export interface ChaosTestResult {
    experiment: ChaosExperiment;
    startTime: string;
    endTime: string;
    hypothesisValidated: boolean;
    steadyStateBeforeFault: SteadyStateDefinition['metrics'];
    steadyStateDuringFault: SteadyStateDefinition['metrics'];
    steadyStateAfterRecovery: SteadyStateDefinition['metrics'];
    recoveryTime: number;
    observations: string[];
    recommendations: string[];
}
export interface N8nBaseAgentConfig {
    n8nConfig: N8nAPIConfig;
    cacheEnabled?: boolean;
    cacheTTL?: number;
}
export interface N8nWorkflowExecutorConfig extends N8nBaseAgentConfig {
    timeout?: number;
    retries?: number;
    validateBeforeExecution?: boolean;
}
export interface N8nSecurityAuditorConfig extends N8nBaseAgentConfig {
    secretPatterns?: RegExp[];
    owaspChecks?: string[];
    severityThreshold?: 'critical' | 'high' | 'medium' | 'low';
}
export interface N8nPerformanceTesterConfig extends N8nBaseAgentConfig {
    baselineIterations?: number;
    loadTestConfig?: {
        vus: number;
        duration: number;
        rampUp?: number;
    };
    thresholds?: {
        p95Duration?: number;
        errorRate?: number;
        throughput?: number;
    };
}
export interface N8nComplianceValidatorConfig extends N8nBaseAgentConfig {
    frameworks?: string[];
    piiPatterns?: string[];
    strictMode?: boolean;
}
//# sourceMappingURL=types.d.ts.map
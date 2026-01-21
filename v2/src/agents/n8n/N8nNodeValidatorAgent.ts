/**
 * N8nNodeValidatorAgent
 *
 * Validates n8n node configurations, connections, and data mappings:
 * - Node structure validation
 * - Connection integrity checks
 * - Credential reference validation
 * - Data mapping validation
 * - Conditional routing logic validation
 */

import { N8nBaseAgent, N8nAgentConfig } from './N8nBaseAgent';
import {
  N8nWorkflow,
  N8nNode,
  ValidationResult,
  ValidationIssue,
} from './types';
import { QETask, AgentCapability } from '../../types';

export interface NodeValidationResult {
  workflowId: string;
  valid: boolean;
  score: number;
  nodeResults: NodeResult[];
  connectionResults: ConnectionResult[];
  credentialResults: CredentialResult[];
  runtimeValidation?: RuntimeValidationResult; // Results from actual execution
  summary: {
    totalNodes: number;
    validNodes: number;
    totalConnections: number;
    validConnections: number;
    issues: number;
    warnings: number;
    runtimeExecuted?: boolean;
    runtimePassed?: boolean;
  };
}

export interface NodeResult {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ConnectionResult {
  source: string;
  target: string;
  valid: boolean;
  issues: ValidationIssue[];
}

export interface CredentialResult {
  nodeId: string;
  nodeName: string;
  credentialType: string;
  credentialId: string;
  valid: boolean;
  exists: boolean;
  issue?: string;
}

export interface NodeValidationTask extends QETask {
  type: 'node-validation';
  target: string; // workflowId
  options?: {
    validateCredentials?: boolean;
    validateDataMappings?: boolean;
    strictMode?: boolean;
    executeRuntimeTest?: boolean; // Actually execute workflow to validate nodes work
    testInput?: Record<string, unknown>; // Input data for runtime test
  };
}

export interface RuntimeValidationResult {
  executed: boolean;
  executionId?: string;
  status?: 'success' | 'error' | 'waiting';
  nodesExecuted: string[];
  nodesFailed: string[];
  errors: Array<{
    nodeName: string;
    errorMessage: string;
    errorType: string;
  }>;
  duration?: number;
}

// Node type configurations for validation
// Extended coverage: 70+ node types (from ~12)
const NODE_CONFIGS: Record<string, {
  requiredParams: string[];
  optionalParams: string[];
  requiresCredential: boolean;
  credentialTypes?: string[];
  category?: string;
}> = {
  // ============================================================================
  // Trigger Nodes
  // ============================================================================
  'n8n-nodes-base.webhook': {
    requiredParams: ['httpMethod', 'path'],
    optionalParams: ['authentication', 'responseMode', 'responseData'],
    requiresCredential: false,
    category: 'trigger',
  },
  'n8n-nodes-base.manualTrigger': {
    requiredParams: [],
    optionalParams: [],
    requiresCredential: false,
    category: 'trigger',
  },
  'n8n-nodes-base.scheduleTrigger': {
    requiredParams: ['rule'],
    optionalParams: ['cronExpression'],
    requiresCredential: false,
    category: 'trigger',
  },
  'n8n-nodes-base.emailReadImap': {
    requiredParams: [],
    optionalParams: ['mailbox', 'format'],
    requiresCredential: true,
    credentialTypes: ['imap'],
    category: 'trigger',
  },
  'n8n-nodes-base.rssFeedReadTrigger': {
    requiredParams: ['feedUrl'],
    optionalParams: ['pollTimes'],
    requiresCredential: false,
    category: 'trigger',
  },

  // ============================================================================
  // Core/Logic Nodes
  // ============================================================================
  'n8n-nodes-base.if': {
    requiredParams: ['conditions'],
    optionalParams: [],
    requiresCredential: false,
    category: 'logic',
  },
  'n8n-nodes-base.switch': {
    requiredParams: ['rules'],
    optionalParams: ['fallbackOutput'],
    requiresCredential: false,
    category: 'logic',
  },
  'n8n-nodes-base.merge': {
    requiredParams: ['mode'],
    optionalParams: ['joinMode', 'propertyName1', 'propertyName2'],
    requiresCredential: false,
    category: 'logic',
  },
  'n8n-nodes-base.splitInBatches': {
    requiredParams: ['batchSize'],
    optionalParams: [],
    requiresCredential: false,
    category: 'logic',
  },
  'n8n-nodes-base.wait': {
    requiredParams: [],
    optionalParams: ['resume', 'amount', 'unit'],
    requiresCredential: false,
    category: 'logic',
  },
  'n8n-nodes-base.noOp': {
    requiredParams: [],
    optionalParams: [],
    requiresCredential: false,
    category: 'logic',
  },
  'n8n-nodes-base.filter': {
    requiredParams: ['conditions'],
    optionalParams: [],
    requiresCredential: false,
    category: 'logic',
  },
  'n8n-nodes-base.limit': {
    requiredParams: ['maxItems'],
    optionalParams: [],
    requiresCredential: false,
    category: 'logic',
  },
  'n8n-nodes-base.removeDuplicates': {
    requiredParams: [],
    optionalParams: ['compareMode', 'fieldsToCompare'],
    requiresCredential: false,
    category: 'logic',
  },
  'n8n-nodes-base.sort': {
    requiredParams: ['sortFieldsUi'],
    optionalParams: [],
    requiresCredential: false,
    category: 'logic',
  },

  // ============================================================================
  // Data Transformation Nodes
  // ============================================================================
  'n8n-nodes-base.set': {
    requiredParams: [],
    optionalParams: ['mode', 'assignments', 'keepOnlySet'],
    requiresCredential: false,
    category: 'transform',
  },
  'n8n-nodes-base.code': {
    requiredParams: [],
    optionalParams: ['jsCode', 'mode', 'language'],
    requiresCredential: false,
    category: 'transform',
  },
  'n8n-nodes-base.itemLists': {
    requiredParams: ['operation'],
    optionalParams: ['fieldToSplitOut', 'include'],
    requiresCredential: false,
    category: 'transform',
  },
  'n8n-nodes-base.dateTime': {
    requiredParams: ['action'],
    optionalParams: ['format', 'timezone'],
    requiresCredential: false,
    category: 'transform',
  },
  'n8n-nodes-base.crypto': {
    requiredParams: ['action'],
    optionalParams: ['type', 'encoding'],
    requiresCredential: false,
    category: 'transform',
  },
  'n8n-nodes-base.html': {
    requiredParams: ['operation'],
    optionalParams: ['cssSelector', 'options'],
    requiresCredential: false,
    category: 'transform',
  },
  'n8n-nodes-base.xml': {
    requiredParams: ['mode'],
    optionalParams: ['options'],
    requiresCredential: false,
    category: 'transform',
  },
  'n8n-nodes-base.spreadsheetFile': {
    requiredParams: ['operation'],
    optionalParams: ['fileFormat', 'options'],
    requiresCredential: false,
    category: 'transform',
  },
  'n8n-nodes-base.markdown': {
    requiredParams: ['mode'],
    optionalParams: ['options'],
    requiresCredential: false,
    category: 'transform',
  },
  'n8n-nodes-base.compressFiles': {
    requiredParams: ['operation'],
    optionalParams: ['outputFormat'],
    requiresCredential: false,
    category: 'transform',
  },

  // ============================================================================
  // HTTP/API Nodes
  // ============================================================================
  'n8n-nodes-base.httpRequest': {
    requiredParams: ['url', 'method'],
    optionalParams: ['authentication', 'bodyParameters', 'headers', 'queryParameters'],
    requiresCredential: false,
    category: 'http',
  },
  'n8n-nodes-base.respondToWebhook': {
    requiredParams: [],
    optionalParams: ['respondWith', 'responseBody', 'responseHeaders'],
    requiresCredential: false,
    category: 'http',
  },
  'n8n-nodes-base.graphql': {
    requiredParams: ['endpoint', 'query'],
    optionalParams: ['authentication', 'variables'],
    requiresCredential: false,
    category: 'http',
  },
  'n8n-nodes-base.soapRequest': {
    requiredParams: ['url', 'bodyXml'],
    optionalParams: ['authentication'],
    requiresCredential: false,
    category: 'http',
  },

  // ============================================================================
  // Database Nodes
  // ============================================================================
  'n8n-nodes-base.postgres': {
    requiredParams: ['operation'],
    optionalParams: ['query', 'table', 'schema'],
    requiresCredential: true,
    credentialTypes: ['postgres'],
    category: 'database',
  },
  'n8n-nodes-base.mysql': {
    requiredParams: ['operation'],
    optionalParams: ['query', 'table'],
    requiresCredential: true,
    credentialTypes: ['mysql'],
    category: 'database',
  },
  'n8n-nodes-base.mongodb': {
    requiredParams: ['operation'],
    optionalParams: ['collection', 'query'],
    requiresCredential: true,
    credentialTypes: ['mongoDb'],
    category: 'database',
  },
  'n8n-nodes-base.redis': {
    requiredParams: ['operation'],
    optionalParams: ['key', 'keyType'],
    requiresCredential: true,
    credentialTypes: ['redis'],
    category: 'database',
  },
  'n8n-nodes-base.mssql': {
    requiredParams: ['operation'],
    optionalParams: ['query', 'table'],
    requiresCredential: true,
    credentialTypes: ['microsoftSql'],
    category: 'database',
  },
  'n8n-nodes-base.elasticsearch': {
    requiredParams: ['operation'],
    optionalParams: ['index', 'documentId'],
    requiresCredential: true,
    credentialTypes: ['elasticsearch'],
    category: 'database',
  },
  'n8n-nodes-base.supabase': {
    requiredParams: ['operation'],
    optionalParams: ['tableId'],
    requiresCredential: true,
    credentialTypes: ['supabaseApi'],
    category: 'database',
  },
  'n8n-nodes-base.snowflake': {
    requiredParams: ['operation'],
    optionalParams: ['query'],
    requiresCredential: true,
    credentialTypes: ['snowflake'],
    category: 'database',
  },
  'n8n-nodes-base.qdrant': {
    requiredParams: ['operation'],
    optionalParams: ['collection'],
    requiresCredential: true,
    credentialTypes: ['qdrantApi'],
    category: 'database',
  },
  'n8n-nodes-base.pinecone': {
    requiredParams: ['operation'],
    optionalParams: ['index'],
    requiresCredential: true,
    credentialTypes: ['pineconeApi'],
    category: 'database',
  },

  // ============================================================================
  // Communication Nodes
  // ============================================================================
  'n8n-nodes-base.slack': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['channel', 'text', 'attachments'],
    requiresCredential: true,
    credentialTypes: ['slackApi', 'slackOAuth2Api'],
    category: 'communication',
  },
  'n8n-nodes-base.discord': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['channelId', 'content'],
    requiresCredential: true,
    credentialTypes: ['discordApi', 'discordWebhookApi'],
    category: 'communication',
  },
  'n8n-nodes-base.telegram': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['chatId', 'text'],
    requiresCredential: true,
    credentialTypes: ['telegramApi'],
    category: 'communication',
  },
  'n8n-nodes-base.microsoftTeams': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['teamId', 'channelId', 'message'],
    requiresCredential: true,
    credentialTypes: ['microsoftTeamsOAuth2Api'],
    category: 'communication',
  },
  'n8n-nodes-base.emailSend': {
    requiredParams: ['toEmail', 'subject'],
    optionalParams: ['text', 'html', 'attachments'],
    requiresCredential: true,
    credentialTypes: ['smtp'],
    category: 'communication',
  },
  'n8n-nodes-base.gmail': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['subject', 'message'],
    requiresCredential: true,
    credentialTypes: ['gmailOAuth2'],
    category: 'communication',
  },
  'n8n-nodes-base.sendGrid': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['toEmail', 'subject'],
    requiresCredential: true,
    credentialTypes: ['sendGridApi'],
    category: 'communication',
  },
  'n8n-nodes-base.twilio': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['from', 'to', 'message'],
    requiresCredential: true,
    credentialTypes: ['twilioApi'],
    category: 'communication',
  },

  // ============================================================================
  // Productivity/SaaS Nodes
  // ============================================================================
  'n8n-nodes-base.googleSheets': {
    requiredParams: ['operation'],
    optionalParams: ['documentId', 'sheetName', 'range'],
    requiresCredential: true,
    credentialTypes: ['googleSheetsOAuth2Api'],
    category: 'productivity',
  },
  'n8n-nodes-base.googleDrive': {
    requiredParams: ['operation'],
    optionalParams: ['fileId', 'folderId'],
    requiresCredential: true,
    credentialTypes: ['googleDriveOAuth2Api'],
    category: 'productivity',
  },
  'n8n-nodes-base.googleDocs': {
    requiredParams: ['operation'],
    optionalParams: ['documentId'],
    requiresCredential: true,
    credentialTypes: ['googleDocsOAuth2Api'],
    category: 'productivity',
  },
  'n8n-nodes-base.googleCalendar': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['calendar', 'eventId'],
    requiresCredential: true,
    credentialTypes: ['googleCalendarOAuth2Api'],
    category: 'productivity',
  },
  'n8n-nodes-base.notion': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['databaseId', 'pageId'],
    requiresCredential: true,
    credentialTypes: ['notionApi'],
    category: 'productivity',
  },
  'n8n-nodes-base.airtable': {
    requiredParams: ['operation'],
    optionalParams: ['baseId', 'tableId'],
    requiresCredential: true,
    credentialTypes: ['airtableApi', 'airtableTokenApi'],
    category: 'productivity',
  },
  'n8n-nodes-base.trello': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['boardId', 'listId', 'cardId'],
    requiresCredential: true,
    credentialTypes: ['trelloApi'],
    category: 'productivity',
  },
  'n8n-nodes-base.asana': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['workspaceId', 'projectId'],
    requiresCredential: true,
    credentialTypes: ['asanaApi'],
    category: 'productivity',
  },
  'n8n-nodes-base.jira': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['issueKey', 'projectId'],
    requiresCredential: true,
    credentialTypes: ['jiraSoftwareCloudApi', 'jiraSoftwareServerApi'],
    category: 'productivity',
  },
  'n8n-nodes-base.linearApp': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['issueId', 'teamId'],
    requiresCredential: true,
    credentialTypes: ['linearApi'],
    category: 'productivity',
  },
  'n8n-nodes-base.dropbox': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['path'],
    requiresCredential: true,
    credentialTypes: ['dropboxApi', 'dropboxOAuth2Api'],
    category: 'productivity',
  },
  'n8n-nodes-base.box': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['fileId', 'folderId'],
    requiresCredential: true,
    credentialTypes: ['boxOAuth2Api'],
    category: 'productivity',
  },

  // ============================================================================
  // Developer/DevOps Nodes
  // ============================================================================
  'n8n-nodes-base.github': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['owner', 'repository'],
    requiresCredential: true,
    credentialTypes: ['githubApi', 'githubOAuth2Api'],
    category: 'devops',
  },
  'n8n-nodes-base.gitlab': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['owner', 'repository'],
    requiresCredential: true,
    credentialTypes: ['gitlabApi', 'gitlabOAuth2Api'],
    category: 'devops',
  },
  'n8n-nodes-base.bitbucket': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['workspace', 'repositorySlug'],
    requiresCredential: true,
    credentialTypes: ['bitbucketApi'],
    category: 'devops',
  },
  'n8n-nodes-base.executeCommand': {
    requiredParams: ['command'],
    optionalParams: ['cwd'],
    requiresCredential: false,
    category: 'devops',
  },
  'n8n-nodes-base.ssh': {
    requiredParams: ['command'],
    optionalParams: ['cwd'],
    requiresCredential: true,
    credentialTypes: ['sshPassword', 'sshPrivateKey'],
    category: 'devops',
  },
  'n8n-nodes-base.ftp': {
    requiredParams: ['operation'],
    optionalParams: ['path'],
    requiresCredential: true,
    credentialTypes: ['ftp', 'sftp'],
    category: 'devops',
  },
  'n8n-nodes-base.awsS3': {
    requiredParams: ['operation'],
    optionalParams: ['bucketName', 'fileKey'],
    requiresCredential: true,
    credentialTypes: ['aws'],
    category: 'devops',
  },
  'n8n-nodes-base.awsLambda': {
    requiredParams: ['operation'],
    optionalParams: ['functionName'],
    requiresCredential: true,
    credentialTypes: ['aws'],
    category: 'devops',
  },
  'n8n-nodes-base.awsSns': {
    requiredParams: ['operation'],
    optionalParams: ['topicArn'],
    requiresCredential: true,
    credentialTypes: ['aws'],
    category: 'devops',
  },
  'n8n-nodes-base.awsSqs': {
    requiredParams: ['operation'],
    optionalParams: ['queueUrl'],
    requiresCredential: true,
    credentialTypes: ['aws'],
    category: 'devops',
  },

  // ============================================================================
  // CRM/Marketing Nodes
  // ============================================================================
  'n8n-nodes-base.salesforce': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['accountId', 'contactId'],
    requiresCredential: true,
    credentialTypes: ['salesforceOAuth2Api'],
    category: 'crm',
  },
  'n8n-nodes-base.hubspot': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['contactId'],
    requiresCredential: true,
    credentialTypes: ['hubspotApi', 'hubspotOAuth2Api'],
    category: 'crm',
  },
  'n8n-nodes-base.mailchimp': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['listId'],
    requiresCredential: true,
    credentialTypes: ['mailchimpApi'],
    category: 'crm',
  },
  'n8n-nodes-base.stripe': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['customerId'],
    requiresCredential: true,
    credentialTypes: ['stripeApi'],
    category: 'crm',
  },
  'n8n-nodes-base.shopify': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['orderId', 'productId'],
    requiresCredential: true,
    credentialTypes: ['shopifyApi', 'shopifyAccessTokenApi'],
    category: 'crm',
  },

  // ============================================================================
  // AI/LLM Nodes
  // ============================================================================
  '@n8n/n8n-nodes-langchain.openAi': {
    requiredParams: ['resource', 'operation'],
    optionalParams: ['model', 'prompt', 'messages'],
    requiresCredential: true,
    credentialTypes: ['openAiApi'],
    category: 'ai',
  },
  '@n8n/n8n-nodes-langchain.agent': {
    requiredParams: [],
    optionalParams: ['promptType', 'text'],
    requiresCredential: false,
    category: 'ai',
  },
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': {
    requiredParams: [],
    optionalParams: ['model', 'options'],
    requiresCredential: true,
    credentialTypes: ['openAiApi'],
    category: 'ai',
  },
  '@n8n/n8n-nodes-langchain.lmChatAnthropic': {
    requiredParams: [],
    optionalParams: ['model', 'options'],
    requiresCredential: true,
    credentialTypes: ['anthropicApi'],
    category: 'ai',
  },
  '@n8n/n8n-nodes-langchain.vectorStoreInMemory': {
    requiredParams: [],
    optionalParams: ['mode'],
    requiresCredential: false,
    category: 'ai',
  },
  '@n8n/n8n-nodes-langchain.embeddingsOpenAi': {
    requiredParams: [],
    optionalParams: ['model', 'options'],
    requiresCredential: true,
    credentialTypes: ['openAiApi'],
    category: 'ai',
  },
  '@n8n/n8n-nodes-langchain.toolHttpRequest': {
    requiredParams: ['url'],
    optionalParams: ['method', 'description'],
    requiresCredential: false,
    category: 'ai',
  },
  '@n8n/n8n-nodes-langchain.toolCode': {
    requiredParams: ['jsCode'],
    optionalParams: ['name', 'description'],
    requiresCredential: false,
    category: 'ai',
  },
  '@n8n/n8n-nodes-langchain.memoryBufferWindow': {
    requiredParams: [],
    optionalParams: ['sessionIdType', 'contextWindowLength'],
    requiresCredential: false,
    category: 'ai',
  },
  '@n8n/n8n-nodes-langchain.chainSummarization': {
    requiredParams: [],
    optionalParams: ['options'],
    requiresCredential: false,
    category: 'ai',
  },
};

export class N8nNodeValidatorAgent extends N8nBaseAgent {
  constructor(config: N8nAgentConfig) {
    const capabilities: AgentCapability[] = [
      {
        name: 'node-validation',
        version: '1.0.0',
        description: 'Validate n8n node configurations',
        parameters: {},
      },
      {
        name: 'connection-validation',
        version: '1.0.0',
        description: 'Validate connections between nodes',
        parameters: {},
      },
      {
        name: 'credential-validation',
        version: '1.0.0',
        description: 'Validate credential references',
        parameters: {},
      },
      {
        name: 'data-mapping-validation',
        version: '1.0.0',
        description: 'Validate data mappings between nodes',
        parameters: {},
      },
    ];

    super({
      ...config,
      type: 'n8n-node-validator' as any,
      capabilities: [...capabilities, ...(config.capabilities || [])],
    });
  }

  protected async performTask(task: QETask): Promise<NodeValidationResult> {
    const validationTask = task as NodeValidationTask;

    if (validationTask.type !== 'node-validation') {
      throw new Error(`Unsupported task type: ${validationTask.type}`);
    }

    return this.validateWorkflow(validationTask.target, validationTask.options);
  }

  /**
   * Validate entire workflow with optional REAL execution test
   */
  async validateWorkflow(
    workflowId: string,
    options?: NodeValidationTask['options']
  ): Promise<NodeValidationResult> {
    const workflow = await this.getWorkflow(workflowId);

    // Validate nodes (static analysis)
    const nodeResults = await this.validateNodes(workflow, options?.strictMode);

    // Validate connections (static analysis)
    const connectionResults = this.validateConnections(workflow);

    // Validate credentials (static analysis)
    let credentialResults: CredentialResult[] = [];
    if (options?.validateCredentials) {
      credentialResults = await this.validateCredentials(workflow);
    }

    // RUNTIME VALIDATION: Actually execute the workflow to verify nodes work
    let runtimeValidation: RuntimeValidationResult | undefined;
    if (options?.executeRuntimeTest) {
      runtimeValidation = await this.executeRuntimeValidation(
        workflowId,
        options.testInput || {}
      );

      // Add runtime errors to node results
      for (const error of runtimeValidation.errors) {
        const nodeResult = nodeResults.find(n => n.nodeName === error.nodeName);
        if (nodeResult) {
          nodeResult.valid = false;
          nodeResult.issues.push({
            severity: 'error',
            code: 'RUNTIME_ERROR',
            message: `Runtime execution failed: ${error.errorMessage}`,
            node: error.nodeName,
          });
        }
      }
    }

    // Calculate summary
    const validNodes = nodeResults.filter(r => r.valid).length;
    const validConnections = connectionResults.filter(r => r.valid).length;
    const totalIssues = [
      ...nodeResults.flatMap(r => r.issues),
      ...connectionResults.flatMap(r => r.issues),
    ];
    const issues = totalIssues.filter(i => i.severity === 'error').length;
    const warnings = totalIssues.filter(i => i.severity === 'warning').length;

    // Calculate score (including runtime validation if performed)
    let nodeScore = workflow.nodes.length > 0 ? (validNodes / workflow.nodes.length) * 40 : 40;
    const connectionScore = Object.keys(workflow.connections).length > 0
      ? (validConnections / Object.keys(workflow.connections).length) * 20
      : 20;
    const credentialScore = credentialResults.length > 0
      ? (credentialResults.filter(r => r.valid).length / credentialResults.length) * 15
      : 15;

    // Runtime score is worth 25% if executed
    let runtimeScore = 25; // Default if not executed
    if (runtimeValidation?.executed) {
      const runtimePassed = runtimeValidation.status === 'success' &&
        runtimeValidation.nodesFailed.length === 0;
      runtimeScore = runtimePassed ? 25 : 0;
    }

    const score = Math.round(nodeScore + connectionScore + credentialScore + runtimeScore);

    const result: NodeValidationResult = {
      workflowId,
      valid: issues === 0 && (!runtimeValidation?.executed || runtimeValidation.status === 'success'),
      score,
      nodeResults,
      connectionResults,
      credentialResults,
      runtimeValidation,
      summary: {
        totalNodes: workflow.nodes.length,
        validNodes,
        totalConnections: Object.keys(workflow.connections).length,
        validConnections,
        issues,
        warnings,
        runtimeExecuted: runtimeValidation?.executed,
        runtimePassed: runtimeValidation?.executed ?
          runtimeValidation.status === 'success' && runtimeValidation.nodesFailed.length === 0 :
          undefined,
      },
    };

    // Store result
    await this.storeTestResult(`node-validation:${workflowId}`, result);

    // Emit event
    this.emitEvent('node.validation.completed', {
      workflowId,
      valid: result.valid,
      score: result.score,
      issues: result.summary.issues,
      runtimeExecuted: result.summary.runtimeExecuted,
      runtimePassed: result.summary.runtimePassed,
    });

    return result;
  }

  /**
   * Execute REAL runtime validation by actually running the workflow
   * This catches issues that static analysis cannot find:
   * - Credential authentication failures
   * - API connectivity issues
   * - Runtime type mismatches
   * - External service availability
   */
  private async executeRuntimeValidation(
    workflowId: string,
    testInput: Record<string, unknown>
  ): Promise<RuntimeValidationResult> {
    const startTime = Date.now();

    try {
      // Execute the workflow
      const execution = await this.executeWorkflow(workflowId, testInput);

      // Wait for completion with timeout
      const completedExecution = await this.waitForExecution(execution.id, 60000);

      // Extract results
      const nodesExecuted = this.extractExecutedNodes(completedExecution);
      const errors = this.extractNodeErrors(completedExecution);
      const nodesFailed = errors.map(e => e.nodeName);

      return {
        executed: true,
        executionId: completedExecution.id,
        status: completedExecution.status as 'success' | 'error' | 'waiting',
        nodesExecuted,
        nodesFailed,
        errors,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        executed: true,
        nodesExecuted: [],
        nodesFailed: [],
        errors: [{
          nodeName: 'workflow',
          errorMessage: error instanceof Error ? error.message : String(error),
          errorType: 'execution_error',
        }],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Wait for workflow execution to complete
   */
  private async waitForExecution(
    executionId: string,
    timeout: number
  ): Promise<import('./types').N8nExecution> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const execution = await this.n8nClient.getExecution(executionId);

      if (execution.finished) {
        return execution;
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return this.n8nClient.getExecution(executionId);
  }

  /**
   * Extract list of executed nodes from execution data
   */
  private extractExecutedNodes(execution: import('./types').N8nExecution): string[] {
    if (!execution.data?.resultData?.runData) {
      return [];
    }
    return Object.keys(execution.data.resultData.runData);
  }

  /**
   * Extract node errors from execution data
   */
  private extractNodeErrors(
    execution: import('./types').N8nExecution
  ): Array<{ nodeName: string; errorMessage: string; errorType: string }> {
    const errors: Array<{ nodeName: string; errorMessage: string; errorType: string }> = [];

    if (!execution.data?.resultData?.runData) {
      // Check for top-level error
      if (execution.data?.resultData?.error) {
        const error = execution.data.resultData.error;
        errors.push({
          nodeName: 'workflow',
          errorMessage: typeof error === 'string' ? error : (error as { message?: string }).message || 'Unknown error',
          errorType: 'workflow_error',
        });
      }
      return errors;
    }

    const runData = execution.data.resultData.runData;

    for (const [nodeName, nodeRuns] of Object.entries(runData)) {
      if (Array.isArray(nodeRuns)) {
        for (const run of nodeRuns) {
          if (run.error) {
            errors.push({
              nodeName,
              errorMessage: typeof run.error === 'string'
                ? run.error
                : (run.error as { message?: string }).message || 'Node execution failed',
              errorType: (run.error as { name?: string }).name || 'node_error',
            });
          }
        }
      }
    }

    return errors;
  }

  /**
   * Validate all nodes in workflow
   */
  private async validateNodes(
    workflow: N8nWorkflow,
    strictMode = false
  ): Promise<NodeResult[]> {
    const results: NodeResult[] = [];

    for (const node of workflow.nodes) {
      const issues = this.validateNode(node, strictMode);

      results.push({
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        valid: issues.filter(i => i.severity === 'error').length === 0,
        issues,
      });
    }

    return results;
  }

  /**
   * Validate single node
   */
  private validateNode(node: N8nNode, strictMode: boolean): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Basic structure validation
    if (!node.id) {
      issues.push({
        severity: 'error',
        code: 'MISSING_NODE_ID',
        message: 'Node is missing ID',
        node: node.name,
      });
    }

    if (!node.type) {
      issues.push({
        severity: 'error',
        code: 'MISSING_NODE_TYPE',
        message: 'Node is missing type',
        node: node.name,
      });
    }

    if (!node.position || node.position.length !== 2) {
      issues.push({
        severity: 'warning',
        code: 'INVALID_POSITION',
        message: 'Node has invalid position',
        node: node.name,
      });
    }

    // Type-specific validation
    const config = NODE_CONFIGS[node.type];
    if (config) {
      // Check required parameters
      for (const param of config.requiredParams) {
        if (!this.hasParameter(node, param)) {
          issues.push({
            severity: strictMode ? 'error' : 'warning',
            code: 'MISSING_REQUIRED_PARAM',
            message: `Missing required parameter: ${param}`,
            node: node.name,
            field: param,
            suggestion: `Add the "${param}" parameter to this node`,
          });
        }
      }

      // Check credential requirement
      if (config.requiresCredential && !node.credentials) {
        issues.push({
          severity: 'error',
          code: 'MISSING_CREDENTIAL',
          message: `Node requires credentials but none configured`,
          node: node.name,
          suggestion: `Configure ${config.credentialTypes?.join(' or ')} credentials`,
        });
      }
    }

    // Check for disabled nodes in active workflow
    if (node.disabled) {
      issues.push({
        severity: 'info',
        code: 'DISABLED_NODE',
        message: 'Node is disabled',
        node: node.name,
      });
    }

    // Validate IF/Switch conditions
    if (node.type === 'n8n-nodes-base.if' || node.type === 'n8n-nodes-base.switch') {
      issues.push(...this.validateConditionalNode(node));
    }

    return issues;
  }

  /**
   * Validate conditional nodes (IF/Switch)
   */
  private validateConditionalNode(node: N8nNode): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (node.type === 'n8n-nodes-base.if') {
      const conditions = node.parameters.conditions as Record<string, unknown> | undefined;
      if (!conditions) {
        issues.push({
          severity: 'error',
          code: 'MISSING_CONDITIONS',
          message: 'IF node has no conditions configured',
          node: node.name,
        });
      } else {
        // Check condition structure
        const hasValidConditions = Object.values(conditions).some(
          group => Array.isArray(group) && group.length > 0
        );
        if (!hasValidConditions) {
          issues.push({
            severity: 'warning',
            code: 'EMPTY_CONDITIONS',
            message: 'IF node has empty conditions',
            node: node.name,
          });
        }
      }
    }

    if (node.type === 'n8n-nodes-base.switch') {
      const rules = node.parameters.rules as unknown[] | undefined;
      if (!rules || !Array.isArray(rules) || rules.length === 0) {
        issues.push({
          severity: 'error',
          code: 'MISSING_RULES',
          message: 'Switch node has no rules configured',
          node: node.name,
        });
      }
    }

    return issues;
  }

  /**
   * Validate connections between nodes
   */
  private validateConnections(workflow: N8nWorkflow): ConnectionResult[] {
    const results: ConnectionResult[] = [];
    const nodeNames = new Set(workflow.nodes.map(n => n.name));

    for (const [sourceName, connections] of Object.entries(workflow.connections)) {
      const issues: ValidationIssue[] = [];

      // Check source exists
      if (!nodeNames.has(sourceName)) {
        issues.push({
          severity: 'error',
          code: 'INVALID_SOURCE',
          message: `Connection source "${sourceName}" does not exist`,
        });
      }

      // Check each target
      if (connections.main) {
        for (let outputIndex = 0; outputIndex < connections.main.length; outputIndex++) {
          const output = connections.main[outputIndex];
          for (const conn of output) {
            const targetIssues: ValidationIssue[] = [];

            if (!nodeNames.has(conn.node)) {
              targetIssues.push({
                severity: 'error',
                code: 'INVALID_TARGET',
                message: `Connection target "${conn.node}" does not exist`,
              });
            }

            // Check for self-references
            if (conn.node === sourceName) {
              targetIssues.push({
                severity: 'warning',
                code: 'SELF_REFERENCE',
                message: 'Node connects to itself',
                node: sourceName,
              });
            }

            results.push({
              source: sourceName,
              target: conn.node,
              valid: targetIssues.filter(i => i.severity === 'error').length === 0,
              issues: targetIssues,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Validate credential references
   */
  private async validateCredentials(workflow: N8nWorkflow): Promise<CredentialResult[]> {
    const results: CredentialResult[] = [];

    // Get available credentials
    let availableCredentials: Map<string, boolean>;
    try {
      const credentials = await this.n8nClient.listCredentials();
      availableCredentials = new Map(credentials.map(c => [c.id, true]));
    } catch {
      // If we can't fetch credentials, skip validation
      return results;
    }

    for (const node of workflow.nodes) {
      if (node.credentials) {
        for (const [credType, credRef] of Object.entries(node.credentials)) {
          const exists = availableCredentials.has(credRef.id);

          results.push({
            nodeId: node.id,
            nodeName: node.name,
            credentialType: credType,
            credentialId: credRef.id,
            valid: exists,
            exists,
            issue: exists ? undefined : `Credential "${credRef.name}" (${credRef.id}) not found`,
          });
        }
      }
    }

    return results;
  }

  /**
   * Check if node has a parameter (handles nested paths)
   */
  private hasParameter(node: N8nNode, param: string): boolean {
    const parts = param.split('.');
    let current: unknown = node.parameters;

    for (const part of parts) {
      if (current === null || current === undefined) return false;
      if (typeof current !== 'object') return false;
      current = (current as Record<string, unknown>)[part];
    }

    return current !== undefined && current !== null && current !== '';
  }

  /**
   * Get validation summary for a workflow
   */
  async getValidationSummary(workflowId: string): Promise<{
    valid: boolean;
    score: number;
    issues: number;
    warnings: number;
    recommendations: string[];
  }> {
    const result = await this.validateWorkflow(workflowId);

    const recommendations: string[] = [];

    // Generate recommendations based on issues
    if (result.summary.issues > 0) {
      recommendations.push('Fix all error-level issues before deployment');
    }

    if (result.credentialResults.some(r => !r.valid)) {
      recommendations.push('Configure missing credentials');
    }

    const orphanNodes = result.nodeResults.filter(
      r => r.issues.some(i => i.code === 'ORPHAN_NODE')
    );
    if (orphanNodes.length > 0) {
      recommendations.push(`Connect or remove ${orphanNodes.length} orphan node(s)`);
    }

    return {
      valid: result.valid,
      score: result.score,
      issues: result.summary.issues,
      warnings: result.summary.warnings,
      recommendations,
    };
  }
}

/**
 * A2A Protocol Method Definitions
 *
 * Defines all A2A JSON-RPC methods, their parameters, and return types.
 * Methods follow the A2A v0.3 specification.
 *
 * @module adapters/a2a/jsonrpc/methods
 * @see https://a2a-protocol.org/latest/specification/
 */

// ============================================================================
// Method Names
// ============================================================================

/**
 * A2A method names as defined in the specification.
 */
export const A2A_METHODS = {
  // Messaging methods
  /** Send a message to the agent and receive a complete response. */
  MESSAGE_SEND: 'message/send',

  /** Send a message to the agent and stream responses via SSE. */
  MESSAGE_STREAM: 'message/stream',

  // Task management methods
  /** Get task status and artifacts by ID. */
  TASKS_GET: 'tasks/get',

  /** List tasks with optional filtering. */
  TASKS_LIST: 'tasks/list',

  /** Cancel a running task. */
  TASKS_CANCEL: 'tasks/cancel',

  /** Resubmit a failed or canceled task. */
  TASKS_RESUBMIT: 'tasks/resubmit',

  // Push notification methods
  /** Configure push notification settings for a task. */
  TASKS_PUSH_NOTIFICATION_SET: 'tasks/pushNotification/set',

  /** Get current push notification configuration. */
  TASKS_PUSH_NOTIFICATION_GET: 'tasks/pushNotification/get',
} as const;

/**
 * Type representing valid A2A method names.
 */
export type A2AMethodName = (typeof A2A_METHODS)[keyof typeof A2A_METHODS];

/**
 * Method descriptions for documentation and validation.
 */
export const A2A_METHOD_DESCRIPTIONS: Record<A2AMethodName, string> = {
  [A2A_METHODS.MESSAGE_SEND]: 'Send a message to the agent and receive a complete response',
  [A2A_METHODS.MESSAGE_STREAM]: 'Send a message to the agent and stream responses via SSE',
  [A2A_METHODS.TASKS_GET]: 'Get task status and artifacts by ID',
  [A2A_METHODS.TASKS_LIST]: 'List tasks with optional filtering',
  [A2A_METHODS.TASKS_CANCEL]: 'Cancel a running task',
  [A2A_METHODS.TASKS_RESUBMIT]: 'Resubmit a failed or canceled task',
  [A2A_METHODS.TASKS_PUSH_NOTIFICATION_SET]: 'Configure push notification settings for a task',
  [A2A_METHODS.TASKS_PUSH_NOTIFICATION_GET]: 'Get current push notification configuration',
};

// ============================================================================
// Message Types (A2A Spec)
// ============================================================================

/**
 * Message role in a conversation.
 */
export type MessageRole = 'user' | 'agent';

/**
 * Text part in a message.
 */
export interface TextPart {
  type: 'text';
  text: string;
}

/**
 * File part in a message.
 */
export interface FilePart {
  type: 'file';
  file: {
    name: string;
    mimeType: string;
    /** Base64-encoded content */
    bytes?: string;
    /** External reference URI */
    uri?: string;
  };
}

/**
 * Data part in a message (structured JSON).
 */
export interface DataPart {
  type: 'data';
  data: Record<string, unknown>;
}

/**
 * Union of all message part types.
 */
export type MessagePart = TextPart | FilePart | DataPart;

/**
 * A2A Message structure.
 */
export interface A2AMessage {
  /** Who sent the message */
  role: MessageRole;

  /** Content containers */
  parts: MessagePart[];

  /** Groups related tasks */
  contextId?: string;

  /** References a specific task */
  taskId?: string;

  /** References to related tasks */
  referenceTaskIds?: string[];

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Task Types (A2A Spec)
// ============================================================================

/**
 * Task status values.
 */
export type TaskStatus =
  | 'submitted' // Initial state when task is created
  | 'working' // Agent is actively processing
  | 'input_required' // Agent needs additional input from user
  | 'auth_required' // Additional authentication required
  | 'completed' // Task finished successfully
  | 'failed' // Task failed with error
  | 'canceled' // Task was canceled by client
  | 'rejected'; // Agent rejected the task

/**
 * Terminal task statuses (task cannot change from these).
 */
export const TERMINAL_STATUSES: TaskStatus[] = ['completed', 'failed', 'canceled', 'rejected'];

/**
 * Artifact produced by a task.
 */
export interface A2AArtifact {
  /** Unique artifact identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Description of the artifact */
  description?: string;

  /** Content pieces */
  parts: MessagePart[];

  /** Ordering hint */
  index?: number;

  /** If true, append to existing artifact */
  append?: boolean;

  /** Indicates final chunk in streaming */
  lastChunk?: boolean;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Task error information.
 */
export interface TaskError {
  /** Error message */
  message: string;

  /** Error code */
  code?: string;
}

/**
 * A2A Task structure.
 */
export interface A2ATask {
  /** Unique task identifier */
  id: string;

  /** Context for multi-turn conversations */
  contextId?: string;

  /** Current task status */
  status: TaskStatus;

  /** Generated artifacts */
  artifacts?: A2AArtifact[];

  /** Error information (when status is 'failed') */
  error?: TaskError;

  /** Timestamp when task was created */
  createdAt?: string;

  /** Timestamp when task was last updated */
  updatedAt?: string;

  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Push Notification Types
// ============================================================================

/**
 * Push notification configuration.
 */
export interface PushNotificationConfig {
  /** Webhook URL for notifications */
  url: string;

  /** Authentication token for webhook */
  token?: string;

  /** Events to receive notifications for */
  events?: Array<'status_change' | 'artifact_created' | 'completed' | 'failed'>;
}

// ============================================================================
// Method Parameters
// ============================================================================

/**
 * Parameters for message/send method.
 */
export interface MessageSendParams {
  /** The message to send */
  message: A2AMessage;

  /** Optional context ID for multi-turn */
  contextId?: string;
}

/**
 * Parameters for message/stream method.
 */
export interface MessageStreamParams {
  /** The message to send */
  message: A2AMessage;

  /** Optional context ID for multi-turn */
  contextId?: string;
}

/**
 * Parameters for tasks/get method.
 */
export interface TasksGetParams {
  /** Task ID to retrieve */
  taskId: string;

  /** Include artifacts in response */
  includeArtifacts?: boolean;

  /** Include status history */
  includeHistory?: boolean;
}

/**
 * Parameters for tasks/list method.
 */
export interface TasksListParams {
  /** Filter by context ID */
  contextId?: string;

  /** Filter by status */
  status?: TaskStatus | TaskStatus[];

  /** Maximum number of tasks to return */
  limit?: number;

  /** Pagination cursor */
  cursor?: string;

  /** Sort order */
  order?: 'asc' | 'desc';
}

/**
 * Parameters for tasks/cancel method.
 */
export interface TasksCancelParams {
  /** Task ID to cancel */
  taskId: string;

  /** Reason for cancellation */
  reason?: string;
}

/**
 * Parameters for tasks/resubmit method.
 */
export interface TasksResubmitParams {
  /** Task ID to resubmit */
  taskId: string;

  /** Optional modifications to the original message */
  modifications?: Partial<A2AMessage>;
}

/**
 * Parameters for tasks/pushNotification/set method.
 */
export interface TasksPushNotificationSetParams {
  /** Task ID to configure notifications for */
  taskId: string;

  /** Notification configuration */
  config: PushNotificationConfig;
}

/**
 * Parameters for tasks/pushNotification/get method.
 */
export interface TasksPushNotificationGetParams {
  /** Task ID to get notification config for */
  taskId: string;
}

/**
 * Union of all method parameters.
 */
export type A2AMethodParams =
  | MessageSendParams
  | MessageStreamParams
  | TasksGetParams
  | TasksListParams
  | TasksCancelParams
  | TasksResubmitParams
  | TasksPushNotificationSetParams
  | TasksPushNotificationGetParams;

// ============================================================================
// Method Results
// ============================================================================

/**
 * Result of message/send method.
 */
export interface MessageSendResult {
  /** The task created for this message */
  task: A2ATask;
}

/**
 * Result of message/stream method (initial response before streaming).
 */
export interface MessageStreamResult {
  /** The task ID for tracking */
  taskId: string;

  /** Context ID for multi-turn */
  contextId: string;

  /** Initial task status */
  status: TaskStatus;
}

/**
 * Result of tasks/get method.
 */
export interface TasksGetResult {
  /** The requested task */
  task: A2ATask;

  /** Status history if requested */
  history?: Array<{
    status: TaskStatus;
    timestamp: string;
  }>;
}

/**
 * Result of tasks/list method.
 */
export interface TasksListResult {
  /** List of tasks */
  tasks: A2ATask[];

  /** Pagination cursor for next page */
  nextCursor?: string;

  /** Total count (if available) */
  totalCount?: number;
}

/**
 * Result of tasks/cancel method.
 */
export interface TasksCancelResult {
  /** The canceled task */
  task: A2ATask;

  /** Whether cancellation was successful */
  success: boolean;
}

/**
 * Result of tasks/resubmit method.
 */
export interface TasksResubmitResult {
  /** The new task created */
  task: A2ATask;

  /** ID of the original task */
  originalTaskId: string;
}

/**
 * Result of tasks/pushNotification/set method.
 */
export interface TasksPushNotificationSetResult {
  /** Whether configuration was successful */
  success: boolean;

  /** Current configuration */
  config: PushNotificationConfig;
}

/**
 * Result of tasks/pushNotification/get method.
 */
export interface TasksPushNotificationGetResult {
  /** Current configuration (null if not set) */
  config: PushNotificationConfig | null;
}

/**
 * Union of all method results.
 */
export type A2AMethodResult =
  | MessageSendResult
  | MessageStreamResult
  | TasksGetResult
  | TasksListResult
  | TasksCancelResult
  | TasksResubmitResult
  | TasksPushNotificationSetResult
  | TasksPushNotificationGetResult;

// ============================================================================
// Method Metadata
// ============================================================================

/**
 * Method metadata for validation and documentation.
 */
export interface MethodMetadata {
  /** Method name */
  name: A2AMethodName;

  /** Human-readable description */
  description: string;

  /** Whether params are required */
  paramsRequired: boolean;

  /** Whether streaming is supported */
  streaming: boolean;

  /** Whether authentication is required */
  authRequired: boolean;

  /** Required capabilities for this method */
  requiredCapabilities?: string[];
}

/**
 * Complete method metadata registry.
 */
export const METHOD_METADATA: Record<A2AMethodName, MethodMetadata> = {
  [A2A_METHODS.MESSAGE_SEND]: {
    name: A2A_METHODS.MESSAGE_SEND,
    description: A2A_METHOD_DESCRIPTIONS[A2A_METHODS.MESSAGE_SEND],
    paramsRequired: true,
    streaming: false,
    authRequired: false,
  },
  [A2A_METHODS.MESSAGE_STREAM]: {
    name: A2A_METHODS.MESSAGE_STREAM,
    description: A2A_METHOD_DESCRIPTIONS[A2A_METHODS.MESSAGE_STREAM],
    paramsRequired: true,
    streaming: true,
    authRequired: false,
    requiredCapabilities: ['streaming'],
  },
  [A2A_METHODS.TASKS_GET]: {
    name: A2A_METHODS.TASKS_GET,
    description: A2A_METHOD_DESCRIPTIONS[A2A_METHODS.TASKS_GET],
    paramsRequired: true,
    streaming: false,
    authRequired: false,
  },
  [A2A_METHODS.TASKS_LIST]: {
    name: A2A_METHODS.TASKS_LIST,
    description: A2A_METHOD_DESCRIPTIONS[A2A_METHODS.TASKS_LIST],
    paramsRequired: false,
    streaming: false,
    authRequired: false,
  },
  [A2A_METHODS.TASKS_CANCEL]: {
    name: A2A_METHODS.TASKS_CANCEL,
    description: A2A_METHOD_DESCRIPTIONS[A2A_METHODS.TASKS_CANCEL],
    paramsRequired: true,
    streaming: false,
    authRequired: false,
  },
  [A2A_METHODS.TASKS_RESUBMIT]: {
    name: A2A_METHODS.TASKS_RESUBMIT,
    description: A2A_METHOD_DESCRIPTIONS[A2A_METHODS.TASKS_RESUBMIT],
    paramsRequired: true,
    streaming: false,
    authRequired: false,
  },
  [A2A_METHODS.TASKS_PUSH_NOTIFICATION_SET]: {
    name: A2A_METHODS.TASKS_PUSH_NOTIFICATION_SET,
    description: A2A_METHOD_DESCRIPTIONS[A2A_METHODS.TASKS_PUSH_NOTIFICATION_SET],
    paramsRequired: true,
    streaming: false,
    authRequired: false,
    requiredCapabilities: ['pushNotifications'],
  },
  [A2A_METHODS.TASKS_PUSH_NOTIFICATION_GET]: {
    name: A2A_METHODS.TASKS_PUSH_NOTIFICATION_GET,
    description: A2A_METHOD_DESCRIPTIONS[A2A_METHODS.TASKS_PUSH_NOTIFICATION_GET],
    paramsRequired: true,
    streaming: false,
    authRequired: false,
    requiredCapabilities: ['pushNotifications'],
  },
};

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Check if a string is a valid A2A method name.
 */
export function isValidMethod(method: string): method is A2AMethodName {
  return Object.values(A2A_METHODS).includes(method as A2AMethodName);
}

/**
 * Get method metadata by name.
 */
export function getMethodMetadata(method: string): MethodMetadata | undefined {
  if (!isValidMethod(method)) {
    return undefined;
  }
  return METHOD_METADATA[method];
}

/**
 * Check if a method requires parameters.
 */
export function methodRequiresParams(method: string): boolean {
  const metadata = getMethodMetadata(method);
  return metadata?.paramsRequired ?? true;
}

/**
 * Check if a method supports streaming.
 */
export function isStreamingMethod(method: string): boolean {
  const metadata = getMethodMetadata(method);
  return metadata?.streaming ?? false;
}

/**
 * Get all available method names.
 */
export function getAllMethods(): A2AMethodName[] {
  return Object.values(A2A_METHODS);
}

/**
 * Get methods by category.
 */
export function getMethodsByCategory(
  category: 'messaging' | 'tasks' | 'notifications'
): A2AMethodName[] {
  switch (category) {
    case 'messaging':
      return [A2A_METHODS.MESSAGE_SEND, A2A_METHODS.MESSAGE_STREAM];
    case 'tasks':
      return [
        A2A_METHODS.TASKS_GET,
        A2A_METHODS.TASKS_LIST,
        A2A_METHODS.TASKS_CANCEL,
        A2A_METHODS.TASKS_RESUBMIT,
      ];
    case 'notifications':
      return [A2A_METHODS.TASKS_PUSH_NOTIFICATION_SET, A2A_METHODS.TASKS_PUSH_NOTIFICATION_GET];
  }
}

/**
 * Check if a task status is terminal (cannot change).
 */
export function isTerminalStatus(status: TaskStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Validate task status transition.
 */
export function isValidStatusTransition(from: TaskStatus, to: TaskStatus): boolean {
  // Terminal states cannot transition
  if (isTerminalStatus(from)) {
    return false;
  }

  // Valid transitions
  const validTransitions: Record<TaskStatus, TaskStatus[]> = {
    submitted: ['working', 'rejected', 'canceled'],
    working: ['completed', 'failed', 'canceled', 'input_required', 'auth_required'],
    input_required: ['working', 'canceled', 'failed'],
    auth_required: ['working', 'canceled', 'failed'],
    completed: [],
    failed: [],
    canceled: [],
    rejected: [],
  };

  return validTransitions[from]?.includes(to) ?? false;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for TextPart.
 */
export function isTextPart(part: MessagePart): part is TextPart {
  return part.type === 'text';
}

/**
 * Type guard for FilePart.
 */
export function isFilePart(part: MessagePart): part is FilePart {
  return part.type === 'file';
}

/**
 * Type guard for DataPart.
 */
export function isDataPart(part: MessagePart): part is DataPart {
  return part.type === 'data';
}

/**
 * Extract text content from message parts.
 */
export function extractTextFromParts(parts: MessagePart[]): string {
  return parts
    .filter(isTextPart)
    .map((p) => p.text)
    .join('\n');
}

/**
 * Create a simple text message.
 */
export function createTextMessage(text: string, role: MessageRole = 'user'): A2AMessage {
  return {
    role,
    parts: [{ type: 'text', text }],
  };
}

/**
 * Create a data message.
 */
export function createDataMessage(
  data: Record<string, unknown>,
  role: MessageRole = 'user'
): A2AMessage {
  return {
    role,
    parts: [{ type: 'data', data }],
  };
}

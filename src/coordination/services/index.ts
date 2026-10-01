/**
 * Agentic QE v3 - Coordination Services
 * Exports services used by coordination components
 */

export {
  TaskAuditLogger,
  createTaskAuditLogger,
  type TaskAuditEntry,
  type TaskAuditSequencedEntry,
  type TaskAuditConfig,
  type TaskAuditFilter,
  type TaskAuditWindow,
  type TaskAuditSnapshot,
  type TaskOperation,
} from './task-audit-logger';

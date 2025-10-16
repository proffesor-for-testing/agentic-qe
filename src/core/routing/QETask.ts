/**
 * QETask Type Definition
 * Bridge between Task and ModelRouter for model selection
 */

import { Task } from '../Task';
import { QETask as QETaskType } from './types';

// Re-export QETask type
export type QETask = QETaskType;

/**
 * Convert Task to QETask for router compatibility
 */
export function taskToQETask(task: Task): QETask {
  return {
    id: task.getId(),
    type: task.getType(),
    description: task.getName(),
    data: task.getData(),
    priority: 1, // Default priority
    metadata: {},
  };
}

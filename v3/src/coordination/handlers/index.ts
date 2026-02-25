/**
 * Barrel export for extracted task handlers.
 *
 * Each registration function takes a TaskHandlerContext and registers
 * its handlers via ctx.registerHandler().
 */

export { registerTestExecutionHandlers } from './test-execution-handlers';
export { registerCoverageHandlers } from './coverage-handlers';
export { registerSecurityHandlers } from './security-handlers';
export { registerQualityHandlers } from './quality-handlers';
export { registerRequirementsHandlers } from './requirements-handlers';
export { registerCodeIntelligenceHandlers } from './code-intelligence-handlers';
export { registerMiscHandlers } from './misc-handlers';

export type { TaskHandlerContext, InstanceTaskHandler } from './handler-types';

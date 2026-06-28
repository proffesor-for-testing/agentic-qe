/**
 * Durable-first test-generation prompt (ADR-113).
 *
 * Builds the instruction sent to a model when generating a test for oracle
 * grading: the test must import the module under test from `../src/<name>.mjs`
 * and assert boundaries/branches (durable), not a single happy path — so the
 * mutation oracle can actually measure fault detection. Pure + testable.
 */

export function buildTestGenPrompt(codeUnderTest: string, moduleName: string): string {
  return `You are AQE's test generator. Write JavaScript tests for the function below using Node's built-in test runner.

Strict requirements:
- Use: import test from 'node:test';
- Use: import assert from 'node:assert/strict';
- Import the function under test EXACTLY as: import { ${moduleName} } from '../src/${moduleName}.mjs';
- Write DURABLE tests: assert boundary values and every branch/decision of the logic, not just one happy path. The tests should still pass if the function were reimplemented in another language.
- Every test must contain at least one assert.* call.
- Output ONLY the test code inside a single \`\`\`js code block. No prose, no explanation.

Function under test:
\`\`\`js
${codeUnderTest}
\`\`\`
`;
}

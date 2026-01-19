import {
  E2EStepType,
  createNavigateStep,
  createClickStep,
  createTypeStep,
  createWaitStep,
  createAssertStep,
  createScreenshotStep,
  createA11yCheckStep,
  createE2ETestCase,
  isNavigateStep,
  type E2EStep,
  type E2ETestCase,
  type E2ETestResult,
  type E2EStepResult,
} from './src/domains/test-execution';

// Test factory functions
const navStep = createNavigateStep('https://example.com', 'Navigate to home page');
const clickStep = createClickStep('#submit-button', 'Click submit button');
const typeStep = createTypeStep('#email-input', 'test@example.com', 'Enter email');
const waitStep = createWaitStep('element-visible', 'Wait for success message', {
  pollingInterval: 100
}, { target: '.success-message' });
const assertStep = createAssertStep('element-text', 'Verify welcome text', {
  expected: 'Welcome!'
}, { target: '.greeting' });
const screenshotStep = createScreenshotStep('Capture final state');
const a11yStep = createA11yCheckStep('Check page accessibility', { wcagLevel: 'AA' });

// Create test case
const testCase = createE2ETestCase(
  'test-login',
  'User Login Test',
  'https://example.com',
  [navStep, typeStep, clickStep, waitStep, assertStep, screenshotStep, a11yStep]
);

// Type guards
const steps: E2EStep[] = [navStep, clickStep, typeStep];
for (const step of steps) {
  if (isNavigateStep(step)) {
    console.log('Navigate to:', step.target);
  }
}

console.log('Test case created:', testCase.name);
console.log('Step types:', E2EStepType);

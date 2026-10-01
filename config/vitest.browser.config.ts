import { defineConfig } from 'vitest/config';
import base from '../vitest.config.ts';

// Explicit browser suite: opting in must run it, rather than inheriting the
// default **/vibium/** exclusion and reporting an empty successful suite.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/integrations/vibium/*.test.ts'],
    exclude: [],
    testTimeout: 60000,
    hookTimeout: 30000,
    maxWorkers: 1,
  },
});

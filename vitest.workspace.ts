import { defineWorkspace } from 'vitest/config';

// defineWorkspace is the recommended approach for monorepos.
// It tells Vitest where to find all your packages and their test files.
export default defineWorkspace([
  'packages/*', // A glob pattern to include all packages
  {
    // You can add specific configurations for a package here if needed.
    // For now, we are just telling it to find the tests.
    test: {
      name: 'agent-e2e',
      include: ['packages/agent/tests/**/*.test.ts'],
      // E2E tests can be slower
      testTimeout: 20000,
    },
  },
  {
    test: {
        name: 'core-unit-tests',
        include: ['packages/core/tests/**/*.test.ts']
    }
  },
  {
    test: {
        name: 'genome-unit-tests',
        include: ['packages/genome/tests/**/*.test.ts']
    }
  }
]);

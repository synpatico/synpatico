import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@synpatico/agent',
    environment: 'node',
    globals: true,
    // E2E tests with server startup can be slower.
    testTimeout: 20000,
  },
});
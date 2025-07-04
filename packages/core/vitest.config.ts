import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Giving each project a unique name is crucial.
    name: '@synpatico/core',
    environment: 'node',
    globals: true,
  },
});
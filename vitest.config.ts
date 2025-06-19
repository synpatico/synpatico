import { defineConfig } from 'vitest/config';
import path from 'path'

// This is the base configuration for all test runs in the monorepo.
export default defineConfig({
  test: {
    globals: true,
    projects: [
        'packages/*'
    ]
  },
  resolve: {
    alias: {
      // This is a robust alias for monorepos. It will dynamically resolve
      // any import starting with `@synpatico/` to the `src` directory
      // of the corresponding package.
      '@synpatico/core': path.resolve(__dirname, './packages/core/src/index.ts'),
      '@synpatico/genome': path.resolve(__dirname, './packages/genome/src/index.ts'),
      '@synpatico/client': path.resolve(__dirname, './packages/client/src/index.ts'),
      '@synpatico/agent': path.resolve(__dirname, './packages/agent/src/index.ts')
    }
  }
});

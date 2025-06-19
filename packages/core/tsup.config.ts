import { defineConfig } from 'tsup';

export default defineConfig({
  // We only need one entry point now.
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  // We are using `tsc` to generate declaration files, so this is false.
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: false, // The parent 'clean' script in package.json handles this
});

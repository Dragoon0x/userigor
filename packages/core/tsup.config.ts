import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/capture/index.ts',
    'src/store/index.ts',
    'src/embed/index.ts',
    'src/cluster/index.ts',
    'src/metrics/index.ts',
    'src/inject/index.ts'
  ],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  treeshake: true,
  target: 'node20'
});

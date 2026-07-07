import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // `server-only` throws when imported outside a React Server Component; the
      // route handlers pull it in transitively, so stub it for node tests.
      'server-only': path.resolve(__dirname, 'test/stubs/server-only.ts'),
    },
  },
});

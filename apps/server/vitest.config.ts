import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    testTimeout: 30000,
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'engine',
          root: './packages/engine',
          environment: 'node',
          include: ['test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          root: './apps/server',
          environment: 'node',
          include: ['test/**/*.test.ts'],
          // A throwaway database, seeded the way a real deployment is. Nothing
          // is written outside it, and a known password keeps the sign-in test
          // deterministic.
          env: {
            DATA_DIR: './.test-data',
            SEED_PASSWORD: 'test-password-not-for-production',
            NODE_ENV: 'test',
          },
          fileParallelism: false,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
